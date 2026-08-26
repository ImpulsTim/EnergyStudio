/* EHP samenhangende matching en opslag — uitvoering, herkomst en modelkoppeling.
   Hoort bij ehp/matching.js (definities, prijzen, doelfunctie en DP).
   Namespace: window.EhpMatching wordt hier uitgebreid; global scope, geen build.

   Dit bestand doet vier dingen:

   1. HET PAD TERUGSPELEN. De DP levert een SoC-pad; hier wordt per kwartier
      uitgerekend welke concrete routes daarbij horen en welke asset welk deel
      leverde. Dat is de stap die van een optimalisatie een verrekening maakt.

   2. HERKOMST BIJHOUDEN. De accu is fysiek een mengvat: er zit geen etiket op een
      elektron. Voor de verrekening moet de herkomst tóch traceerbaar zijn. Gekozen
      methode: PROPORTIONEEL MENGEN.

        Bij laden gaat elke kWh met zijn eigen herkomst de voorraad in, samen met de
        kostprijs die de accu ervoor betaalde (het exportalternatief van de producent
        of de netprijs). Bij ontladen wordt uit de voorraad geput naar rato van de
        actuele samenstelling. Verliezen, opslagvergoeding, slijtage en opbrengst
        volgen diezelfde verhouding.

        Waarom proportioneel en niet FIFO: FIFO suggereert een fysieke volgorde die
        er niet is, en de uitkomst hangt dan af van een aanname die niemand kan
        controleren. Proportioneel mengen is invariant voor die aanname en levert
        bij dezelfde invoer altijd dezelfde toerekening. Het blijft een
        ADMINISTRATIEVE toerekening — geen claim over waar een elektron heen ging.

   3. MEERDERE ACCU'S. Sequentieel op een krimpende restpositie: accu 1 ziet de volle
      ruimte, accu 2 wat accu 1 heeft laten liggen. De volgorde staat in het resultaat.

   4. TERUGKOPPELING NAAR HET GROEPSMODEL. De routes worden in de modelrijen
      verwerkt, zodat kengetallen, financieel overzicht en deelnemersverrekening
      hetzelfde beeld geven als de opslagtab. De balans
          opwek + ontladen + tekort = verbruik + laden + overschot
      wordt expliciet gecontroleerd.
*/
(function (global) {
  'use strict';

  var M   = global.EhpMatching;
  var DT  = 0.25;
  var EPS = 1e-9;

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. HET PAD TERUGSPELEN
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Loopt het SoC-pad af en boekt per kwartier de routes.
   *
   * `volledig = false` → alleen de energie- en waardetotalen; gebruikt in de
   *   piekreductie-sweep, waar alleen de uitkomst telt en niet de administratie.
   * `volledig = true`  → ook per asset toerekenen, het herkomstgrootboek vullen en
   *   de restpositie bijwerken voor een eventuele volgende accu.
   */
  function _loopPad(q, s, a, inst, rest, dp, volledig) {
    var T = q.T, pad = dp.pad, stap = dp.stap, opt = dp.opt;
    var uit = M.leegUitkomst();
    var restQ = {surplus: 0, tekort: 0, match: 0};

    var acProfiel = new Float64Array(T);   // + = ontladen (levert), − = laden (neemt af)
    var socKwh    = new Float64Array(T);
    var rUitOver  = new Float64Array(T), rUitMatch = new Float64Array(T), rUitNet = new Float64Array(T);
    var rNaarInt  = new Float64Array(T), rVerdring = new Float64Array(T), rNaarEpex = new Float64Array(T);
    var restVoorS = new Float64Array(T), restVoorT = new Float64Array(T), restVoorM = new Float64Array(T);

    var tot = {
      inUitOverschot: 0, inUitMatch: 0, inVanNet: 0,
      uitNaarIntern: 0, uitVerdringing: 0, uitNaarEpex: 0,
      dcIn: 0, dcUit: 0,
      kostenLaden: 0, opbrengstOntladen: 0, degradatie: 0,
      groepsWaarde: 0, afnemerVoordeel: 0, netImport: 0, netExport: 0, doel: 0,
      ebBetaald: 0, ebVermeden: 0,
      kwartierenVol: 0, kwartierenLeeg: 0, kwartierenActief: 0, kwartierenOpVermogen: 0,
      opslagvergoeding: 0, beschermingKorting: 0,
      // Onbenutte ruimte, met dezelfde indeling als de bestaande opslagtab.
      beschOverschot: 0, beschTekort: 0,
      gemistVol: 0, gemistVermogen: 0, gemistOnrendabel: 0,
      gemistLeeg: 0, gemistVermogenUit: 0, gemistOnrendabelUit: 0
    };

    // Herkomstgrootboek (alleen bij volledig): voorraad en kostenbasis per herkomst.
    var voorraad = {}, voorraadKost = {}, voorraadDegr = {}, boek = {};
    var voorraadTot = 0;
    var maxAc = a.kW * DT;

    function _boek(key, bron, asset) {
      var b = boek[key];
      if (!b) {
        b = boek[key] = {sleutel: key, bron: bron, asset: asset,
          // gestort
          in_ac_kWh: 0, in_dc_kWh: 0, kostenbasis_EUR: 0,
          // afgeleverd (kan achterlopen op gestort: er kan nog voorraad staan)
          uit_ac_kWh: 0, naarIntern_kWh: 0, naarEpex_kWh: 0,
          opbrengst_EUR: 0, kostenAfgeleverd_EUR: 0, degradatieAfgeleverd_EUR: 0,
          verlies_kWh: 0, opslagvergoeding_EUR: 0,
          eersteLading: null, laatsteLevering: null};
      }
      return b;
    }

    for (var t = 0; t < T; t++) {
      restQ.surplus = rest.surplus[t]; restQ.tekort = rest.tekort[t]; restQ.match = rest.match[t];
      restVoorS[t] = restQ.surplus; restVoorT[t] = restQ.tekort; restVoorM[t] = restQ.match;

      var dE = (pad[t + 1] - pad[t]) * stap;
      var acNet = dE > 0 ? dE / a.etaLaad : dE < 0 ? dE * a.etaOntlaad : 0;
      M._intern.uitkomstKwartier(t, acNet, q, s, inst, restQ, opt, uit);
      if (!uit.geldig) {
        // Kan alleen ontstaan bij een raster-artefact; behandel als "accu staat stil"
        // zodat de balans hoe dan ook sluit.
        acNet = 0; dE = 0;
        M._intern.uitkomstKwartier(t, 0, q, s, inst, restQ, opt, uit);
      }

      socKwh[t]    = a.socMin + pad[t + 1] * stap;
      acProfiel[t] = -acNet;                       // acNet > 0 = laden → acProfiel negatief
      rUitOver[t]  = uit.uitOverschot; rUitMatch[t] = uit.uitMatch; rUitNet[t] = uit.uitNet;
      rNaarInt[t]  = uit.naarIntern;   rVerdring[t] = uit.verdringUit; rNaarEpex[t] = uit.naarEpex;

      var acIn  = uit.uitOverschot + uit.uitMatch + uit.uitNet;
      var acUit = uit.naarIntern + uit.verdringUit + uit.naarEpex;

      tot.inUitOverschot += uit.uitOverschot;
      tot.inUitMatch     += uit.uitMatch;
      tot.inVanNet       += uit.uitNet;
      tot.uitNaarIntern  += uit.naarIntern;
      tot.uitVerdringing += uit.verdringUit;
      tot.uitNaarEpex    += uit.naarEpex;
      tot.degradatie     += uit.degradatie;
      tot.groepsWaarde   += uit.groepsWaarde;
      tot.afnemerVoordeel+= uit.afnemerVoordeel;
      tot.netImport      += uit.netImport;
      tot.netExport      += uit.netExport;
      tot.doel           += uit.doel;
      tot.ebBetaald      += uit.uitNet * (a.ebLaden || 0);
      tot.ebVermeden     += uit.naarIntern * (a.ebVermeden || 0);
      if (acIn > EPS || acUit > EPS) tot.kwartierenActief++;
      if (acIn > maxAc - 1e-6 || acUit > maxAc - 1e-6) tot.kwartierenOpVermogen++;
      if (pad[t + 1] >= dp.S - 1) tot.kwartierenVol++;
      if (pad[t + 1] <= 0)        tot.kwartierenLeeg++;

      // Onbenutte ruimte classificeren — zelfde vragen als in de bestaande opslagtab.
      tot.beschOverschot += restQ.surplus;
      tot.beschTekort    += restQ.tekort;
      var restOver = restQ.surplus - uit.uitOverschot;
      if (restOver > EPS) {
        if (pad[t + 1] >= dp.S - 1)   tot.gemistVol += restOver;
        else if (acIn > maxAc - 1e-6) tot.gemistVermogen += restOver;
        else                          tot.gemistOnrendabel += restOver;
      }
      var restTek = restQ.tekort - uit.naarIntern;
      if (restTek > EPS) {
        if (pad[t + 1] <= 0)           tot.gemistLeeg += restTek;
        else if (acUit > maxAc - 1e-6) tot.gemistVermogenUit += restTek;
        else                           tot.gemistOnrendabelUit += restTek;
      }

      // Kosten en opbrengst van deze accu, in dezelfde prijsdefinities als de doelfunctie.
      var kostenNu = uit.uitOverschot * s.pEx[t] + uit.uitMatch * s.pEx[t] + uit.uitNet * s.pLaadNet[t];
      tot.kostenLaden += kostenNu;
      if (dE > 0) tot.dcIn  += dE;
      if (dE < 0) tot.dcUit += -dE;

      if (!volledig) {
        // Zonder administratie is de opbrengst gelijk aan de waardering in de
        // doelfunctie; genoeg om piekvarianten mee te vergelijken.
        tot.opbrengstOntladen += uit.naarIntern * s.pUitInt[t] + uit.verdringUit * s.pEx[t]
                               + uit.naarEpex * s.pExAccu[t];
        continue;
      }

      // ── Toerekening per asset ────────────────────────────────────────────────
      var lijst = q.aanbieders[t];
      for (var lz = 0; lz < lijst.length; lz++) lijst[lz]._nuNaarAccu = 0;
      if (uit.uitOverschot > EPS) _neemUitExport(lijst, uit.uitOverschot);
      if (uit.uitMatch > EPS)     _neemUitMatch(lijst, uit.uitMatch, 'accu');
      if (uit.verdringUit > EPS)  _neemUitMatch(lijst, uit.verdringUit, 'export');

      // ── Herkomstgrootboek: laden ────────────────────────────────────────────
      // Voorraad en kostenbasis worden STRIKT GESCHEIDEN gehouden van de slijtage.
      // De kostenbasis is wat de accu voor die kWh betaalde — aan de producent zijn
      // exportalternatief, of aan het net de inkoopprijs. Slijtage is een kost van de
      // accu-eigenaar en staat per herkomst apart, zodat ze in de verrekening niet
      // per ongeluk als inkoopprijs van de energie-eigenaar wordt gelezen.
      if (dE > EPS && acIn > EPS) {
        var verliesIn = acIn - dE;                       // laadverlies, AC-zijde
        var degrIn    = dE * opt.mkHalf;
        for (var li = 0; li < lijst.length; li++) {
          var b = lijst[li];
          if (!(b._nuNaarAccu > EPS)) continue;
          var deel = b._nuNaarAccu, f = deel / acIn;
          var key  = b.rij.Type_norm + '|' + b.rij.Asset;
          var bk   = _boek(key, b.rij.Type_norm, b.rij.Asset);
          var dcDeel = dE * f, kostDeel = deel * s.pEx[t];
          bk.in_ac_kWh += deel; bk.in_dc_kWh += dcDeel;
          bk.kostenbasis_EUR += kostDeel;
          bk.verlies_kWh += verliesIn * f;
          if (bk.eersteLading == null) bk.eersteLading = q.tijdKeys[t];
          voorraad[key]     = (voorraad[key] || 0) + dcDeel;
          voorraadKost[key] = (voorraadKost[key] || 0) + kostDeel;
          voorraadDegr[key] = (voorraadDegr[key] || 0) + degrIn * f;
          voorraadTot += dcDeel;
          b._nuNaarAccu = 0;
        }
        if (uit.uitNet > EPS) {
          var kn = 'net|net', fn = uit.uitNet / acIn;
          var bn = _boek(kn, 'net', 'Net');
          var dcNet = dE * fn, kostNet = uit.uitNet * s.pLaadNet[t];
          bn.in_ac_kWh += uit.uitNet; bn.in_dc_kWh += dcNet;
          bn.kostenbasis_EUR += kostNet;
          bn.verlies_kWh += verliesIn * fn;
          if (bn.eersteLading == null) bn.eersteLading = q.tijdKeys[t];
          voorraad[kn]     = (voorraad[kn] || 0) + dcNet;
          voorraadKost[kn] = (voorraadKost[kn] || 0) + kostNet;
          voorraadDegr[kn] = (voorraadDegr[kn] || 0) + degrIn * fn;
          voorraadTot += dcNet;
        }
      }

      // ── Herkomstgrootboek: ontladen ─────────────────────────────────────────
      var prijsBat = 0;
      if (dE < -EPS && acUit > EPS) {
        var dcUit = -dE;
        if (dcUit > voorraadTot) dcUit = voorraadTot;      // rasterruis afvangen
        var verliesUit = (-dE) - acUit;
        var degrUit = (-dE) * opt.mkHalf;
        // Proportioneel mengen: uit elke herkomst wordt naar rato van haar aandeel in
        // de voorraad geput, met de bijbehorende kostenbasis.
        var sleutels = Object.keys(voorraad);
        var neemPer = {}, kostPer = {}, degrPer = {}, vrijgegeven = 0, degrVrij = 0;
        for (var vi = 0; vi < sleutels.length; vi++) {
          var k2 = sleutels[vi];
          if (!(voorraad[k2] > EPS) || voorraadTot <= EPS) continue;
          var aand = neem2(voorraad[k2], voorraadTot);
          var neem = dcUit * aand;
          var fr   = neem / voorraad[k2];
          var kost = voorraadKost[k2] * fr;
          var degr = (voorraadDegr[k2] || 0) * fr;
          neemPer[k2] = neem; kostPer[k2] = kost; degrPer[k2] = degr;
          vrijgegeven += kost; degrVrij += degr;
          voorraad[k2] -= neem; voorraadKost[k2] -= kost; voorraadDegr[k2] -= degr;
        }
        voorraadTot -= dcUit;

        // PRIJS VAN OPGESLAGEN ENERGIE VOOR DE AFNEMER — de exacte variant van de
        // regel in `_bouwSignaal()`: netalternatief min de afgesproken korting, met
        // de werkelijke marginale kostprijs uit dit grootboek als ondergrens.
        var internKwh = uit.naarIntern + uit.verdringUit;
        var vloer = (vrijgegeven + degrVrij + degrUit) / Math.max(EPS, acUit);
        prijsBat = s.pNet[t] - inst.afnemersKorting;
        if (prijsBat < vloer - 1e-12) {
          // De accu kan op die prijs niet uit. De doelfunctie hoort dit al te hebben
          // voorkomen (magIntern), maar de vloer daar is een benadering. Blijft er
          // toch een gat, dan wordt het niet weggemiddeld: het gaat als
          // beschermingscorrectie zichtbaar ten laste van de pool.
          if (internKwh > EPS) tot.beschermingKorting += (vloer - prijsBat) * internKwh;
        }
        var opbrengstNu = internKwh * prijsBat + uit.naarEpex * s.pExAccu[t];
        tot.opbrengstOntladen += opbrengstNu;
        tot.opslagvergoeding  += acUit * inst.opslagvergoeding;

        for (var kk in neemPer) {
          var aandeel = dcUit > EPS ? neemPer[kk] / dcUit : 0;
          var bk2 = boek[kk];
          if (!bk2) continue;
          bk2.uit_ac_kWh     += acUit * aandeel;
          bk2.naarIntern_kWh += internKwh * aandeel;
          bk2.naarEpex_kWh   += uit.naarEpex * aandeel;
          bk2.opbrengst_EUR  += opbrengstNu * aandeel;
          bk2.kostenAfgeleverd_EUR += kostPer[kk];
          bk2.verlies_kWh    += verliesUit * aandeel;
          bk2.degradatieAfgeleverd_EUR += degrPer[kk] + degrUit * aandeel;
          bk2.opslagvergoeding_EUR += acUit * aandeel * inst.opslagvergoeding;
          bk2.laatsteLevering = q.tijdKeys[t];
        }
      }

      // ── Restpositie bijwerken voor een eventuele volgende accu ──────────────
      rest.surplus[t] = uit.directExport;
      rest.tekort[t]  = uit.afnemerImport;
      rest.match[t]   = uit.match;
      q.match[t]      = uit.match;
      q.prijsBat      = q.prijsBat || new Float64Array(T);
      if (prijsBat > 0) q.prijsBat[t] = prijsBat;
    }

    return {
      acProfiel: acProfiel, socKwh: socKwh, totalen: tot,
      routes: {uitOverschot: rUitOver, uitMatch: rUitMatch, uitNet: rUitNet,
               naarIntern: rNaarInt, verdringUit: rVerdring, naarEpex: rNaarEpex},
      restVoor: {surplus: restVoorS, tekort: restVoorT, match: restVoorM},
      boek: boek, voorraadEind: voorraad, voorraadKostEind: voorraadKost,
      marge_EUR: tot.opbrengstOntladen - tot.kostenLaden - tot.degradatie
    };
  }

  /** Aandeel, met een veilige noemer. Apart zodat de lus leesbaar blijft. */
  function neem2(deel, geheel) { return geheel > EPS ? deel / geheel : 0; }

  /**
   * Haalt `kwh` uit de export van dit kwartier, naar rato van wie er nog exporteert.
   * Naar rato is hier de enige verdedigbare keuze: het overschot van dat moment is
   * per bedrijf bekend, maar welk elektron waarheen ging niet.
   */
  function _neemUitExport(lijst, kwh) {
    var tot = 0, i;
    for (i = 0; i < lijst.length; i++) { lijst[i]._nuNaarAccu = lijst[i]._nuNaarAccu || 0; tot += lijst[i].export || 0; }
    if (tot <= EPS) return;
    var f = Math.min(1, kwh / tot);
    for (i = 0; i < lijst.length; i++) {
      var b = lijst[i], deel = (b.export || 0) * f;
      if (deel <= EPS) continue;
      b.export -= deel; b.naarAccu = (b.naarAccu || 0) + deel; b._nuNaarAccu += deel;
    }
  }

  /**
   * Haalt `kwh` uit het gematchte volume, beginnend bij de DUURSTE bron. Dat is de
   * bron die de merit order als eerste zou laten vallen, dus het is ook de bron die
   * verdrongen wordt als de accu of een goedkopere levering voorrang krijgt.
   * `naar` = 'accu' (de accu laadt ermee) of 'export' (die opwek gaat naar het net).
   */
  function _neemUitMatch(lijst, kwh, naar) {
    for (var i = lijst.length - 1; i >= 0 && kwh > EPS; i--) {
      var b = lijst[i];
      b._nuNaarAccu = b._nuNaarAccu || 0;
      var beschikbaar = b.intern || 0;
      if (beschikbaar <= EPS) continue;
      var neem = Math.min(beschikbaar, kwh);
      b.intern -= neem; kwh -= neem;
      if (naar === 'accu') { b.naarAccu = (b.naarAccu || 0) + neem; b._nuNaarAccu += neem; }
      else                 { b.export   = (b.export   || 0) + neem; }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. PIEKREDUCTIE — dezelfde ruil als in de bestaande opslagmodule
  // ═══════════════════════════════════════════════════════════════════════════

  function _maandPieken(s, acProfiel, tijdKeys) {
    var met = {}, zonder = {};
    for (var i = 0; i < s.netto.length; i++) {
      var mn = String(tijdKeys[i]).slice(0, 7);
      var basis = Math.max(0, s.netto[i]) / DT;
      var na    = Math.max(0, s.netto[i] - (acProfiel ? acProfiel[i] : 0)) / DT;
      if (!(mn in zonder) || basis > zonder[mn]) zonder[mn] = basis;
      if (!(mn in met)    || na    > met[mn])    met[mn]    = na;
    }
    return {met: met, zonder: zonder};
  }

  /**
   * Zoekt de piekcap die het totaal (arbitragemarge + transportbesparing) maximeert.
   * Dezelfde methode en dezelfde tarieven als `EhpOpslag.piekAnalyse()`: per maand een
   * cap op een percentage van de eigen basispiek, overschrijding beprijsd in plaats
   * van verboden. Grof raster tijdens het zoeken, fijn raster voor de winnaar.
   */
  function _piekZoek(q, s, a, inst, rest, opties) {
    var T = q.T;
    var basis = {}, i;
    for (i = 0; i < T; i++) {
      var mn = String(q.tijdKeys[i]).slice(0, 7);
      var kw = Math.max(0, s.netto[i]) / DT;
      if (!(mn in basis) || kw > basis[mn]) basis[mn] = kw;
    }
    var maanden = Object.keys(basis).sort();
    var basisJaarpiek = maanden.reduce(function (m, k) { return Math.max(m, basis[k]); }, 0);
    var maandenInPeriode = Math.max(1, maanden.length);
    var km = a.eigenAansluiting ? 0 : a.kmPerKwMnd;
    var kc = a.eigenAansluiting ? 0 : a.kcPerKwMnd;

    var reducties = a.eigenAansluiting ? [0] : (opties.reducties || [0, 0.10, 0.20, 0.30, 0.40]);
    var curve = [], beste = null;
    for (var r = 0; r < reducties.length; r++) {
      var cap = null;
      if (!a.eigenAansluiting) {
        cap = new Float64Array(T);
        for (i = 0; i < T; i++) cap[i] = basis[String(q.tijdKeys[i]).slice(0, 7)] * (1 - reducties[r]) * DT;
      }
      // Werkkopie van de restpositie: de sweep mag de echte positie niet aanraken.
      var proef = {surplus: Float64Array.from(rest.surplus), tekort: Float64Array.from(rest.tekort),
                   match: Float64Array.from(rest.match)};
      var dp = M._intern.dp(q, s, a, inst, proef, {fijnheid: opties.fijnheidSweep || 8,
                                                   piekCap: cap, piekStraf: 5});
      if (!dp) return null;
      var ev = _loopPad(q, s, a, inst, proef, dp, false);
      var pieken = _maandPieken(s, ev.acProfiel, q.tijdKeys);
      var jaarpiekMet = maanden.reduce(function (m, k) { return Math.max(m, pieken.met[k] || 0); }, 0);
      var kmBesp = 0;
      maanden.forEach(function (mn2) { kmBesp += (basis[mn2] - (pieken.met[mn2] || 0)) * km; });
      var kcBesp = (basisJaarpiek - jaarpiekMet) * kc * maandenInPeriode;
      var capKw = basisJaarpiek * (1 - reducties[r]);
      var punt = {reductie: reducties[r], cap: cap,
        arbitrageMarge_EUR: ev.marge_EUR, kmBesparing_EUR: kmBesp, kcBesparing_EUR: kcBesp,
        totaal_EUR: ev.marge_EUR + kmBesp + kcBesp,
        capKw: capKw, bereikteJaarpiek_kW: jaarpiekMet,
        capGehaald: jaarpiekMet <= capKw * 1.01 + 1e-6,
        kwartierenBovenCap: 0, piekStraf_EUR: 0,
        cycli: a.bruikbaar > 0 ? ev.totalen.dcIn / a.bruikbaar : 0};
      curve.push(punt);
      if (!beste || punt.totaal_EUR > beste.totaal_EUR) beste = punt;
    }
    // Dezelfde ruil als in de bestaande opslagmodule: wat kost het aftoppen van de
    // piek aan arbitragemarge, en wat levert het op aan transporttarief?
    var basisPunt = curve[0];
    return {basisJaarpiek_kW: basisJaarpiek, basisMaandpieken: basis, maanden: maanden,
            curve: curve, beste: beste, kmPerKwMnd: km, kcPerKwMnd: kc,
            maandenInPeriode: maandenInPeriode,
            capsNietGehaald: curve.filter(function (x) { return !x.capGehaald; })
                                  .map(function (x) { return Math.round(x.capKw); }),
            conflict: {
              arbitrageVerlies_EUR: basisPunt.arbitrageMarge_EUR - beste.arbitrageMarge_EUR,
              piekOpbrengst_EUR: beste.kmBesparing_EUR + beste.kcBesparing_EUR,
              nettoWinst_EUR: beste.totaal_EUR - basisPunt.totaal_EUR,
              piekVerlaging_kW: basisJaarpiek - beste.bereikteJaarpiek_kW
            }};
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. DE VOLLEDIGE DOORREKENING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Rekent matching en opslag in samenhang door en levert:
   *   rows  — allocatieregels per (asset, kwartier) voor `EnergieModel.buildModel()`
   *   plan  — alles wat de verrekening, de rapportage en de inspector nodig hebben
   */
  function rekenSamen(opwekRows, verbruikByTijd, opt) {
    var inst = opt.instellingen;
    var q = M.bereidVoor(opwekRows, verbruikByTijd, opt);
    var T = q.T;

    // Beginstand per aanbieder: wat niet gematcht is, gaat naar het net.
    for (var t0 = 0; t0 < T; t0++) {
      var lijst = q.aanbieders[t0];
      for (var j = 0; j < lijst.length; j++) {
        var b = lijst[j];
        b.naarAccu = 0;
        b.export = Math.max(0, (b.rij.opwek_kWh || 0) - (b.intern || 0));
      }
    }

    var rest = {surplus: Float64Array.from(q.surplus),
                tekort:  Float64Array.from(q.tekort),
                match:   Float64Array.from(q.match)};

    // Basispositie zonder accu, als vergelijkingspunt voor het energievoordeel.
    var basis = {netImport: 0, netExport: 0, match: 0};
    for (var tb = 0; tb < T; tb++) {
      basis.netImport += rest.tekort[tb];
      basis.netExport += rest.surplus[tb];
      basis.match     += rest.match[tb];
    }

    var accuResultaten = [];
    var accus = opt.accus || [];
    for (var ai = 0; ai < accus.length; ai++) {
      var cfg = accus[ai];
      // Gastheerprofiel: de netpositie van de aansluiting waarachter de accu staat,
      // aangeleverd als {tijdKey: kWh} en hier uitgelijnd op de mastertijdlijn. Die
      // tijdlijn is pas na `bereidVoor()` bekend, dus de uitlijning gebeurt hier.
      var gastheer = _lijnUit((opt.gastheerByAccu && opt.gastheerByAccu[cfg.id]) || null, q.tijdKeys);
      var rijenVoorEb = _rijenVoorEb(q, rest);

      // Aandeel eigen opwek in de voorraad bepaalt het EB-voordeel van ontladen, en
      // volgt zelf uit de dispatch. Eén grove voorpass schat dat aandeel, daarna
      // draait de echte pass met een consistent prijssignaal — dezelfde aanpak als
      // in de bestaande opslagmodule, zodat de fiscale behandeling identiek is.
      var aandeelEigen = null;
      var aVoor = M.accuContext(cfg, rijenVoorEb, gastheer, opt.ebJaar, 1);
      if (aVoor.eigenaar !== 'platform' && aVoor.opslagVrijstelling && aVoor.kWh > 0 && aVoor.kW > 0) {
        var sVoor = M._intern.bouwSignaal(q, aVoor, inst, gastheer, rest);
        var proefR = {surplus: Float64Array.from(rest.surplus), tekort: Float64Array.from(rest.tekort),
                      match: Float64Array.from(rest.match)};
        var dpVoor = M._intern.dp(q, sVoor, aVoor, inst, proefR, {fijnheid: 4});
        if (dpVoor) {
          var evVoor = _loopPad(q, sVoor, aVoor, inst, proefR, dpVoor, false);
          var totIn = evVoor.totalen.inUitOverschot + evVoor.totalen.inUitMatch + evVoor.totalen.inVanNet;
          aandeelEigen = totIn > 0
            ? (evVoor.totalen.inUitOverschot + evVoor.totalen.inUitMatch) / totIn : 1;
        }
      }

      var a = M.accuContext(cfg, rijenVoorEb, gastheer, opt.ebJaar, aandeelEigen);
      if (!a.kWh || !a.kW || !a.bruikbaar) { accuResultaten.push(_leegAccu(cfg, a, q)); continue; }
      var s = M._intern.bouwSignaal(q, a, inst, gastheer, rest);

      var piek = _piekZoek(q, s, a, inst, rest, {reducties: opt.reducties,
                                                 fijnheidSweep: opt.fijnheidSweep});
      var cap = piek && piek.beste ? piek.beste.cap : null;
      var dp = M._intern.dp(q, s, a, inst, rest, {fijnheid: opt.fijnheid || 16,
                                                  piekCap: cap, piekStraf: 5});
      if (!dp) { accuResultaten.push(_leegAccu(cfg, a, q)); continue; }

      var ev = _loopPad(q, s, a, inst, rest, dp, true);   // committeert in q en rest
      var pieken = _maandPieken(s, ev.acProfiel, q.tijdKeys);
      var jaarpiekMet = 0, jaarpiekZonder = 0;
      Object.keys(pieken.zonder).forEach(function (mn) {
        if ((pieken.met[mn] || 0) > jaarpiekMet) jaarpiekMet = pieken.met[mn];
        if (pieken.zonder[mn] > jaarpiekZonder)  jaarpiekZonder = pieken.zonder[mn];
      });
      var kmBesp = 0;
      if (piek) piek.maanden.forEach(function (mn) {
        kmBesp += (piek.basisMaandpieken[mn] - (pieken.met[mn] || 0)) * piek.kmPerKwMnd;
      });
      var kcBesp = piek ? (piek.basisJaarpiek_kW - jaarpiekMet) * piek.kcPerKwMnd * piek.maandenInPeriode : 0;

      accuResultaten.push({
        cfg: cfg, accu: a, volgorde: ai + 1,
        signaal: s, dp: dp, uitvoering: ev,
        acProfiel: ev.acProfiel, socKwh: ev.socKwh, tijdKey: q.tijdKeys,
        routes: ev.routes, restVoor: ev.restVoor,
        boek: ev.boek, voorraadEind: ev.voorraadEind, voorraadKostEind: ev.voorraadKostEind,
        totalen: ev.totalen,
        marge_EUR: ev.marge_EUR,
        margeNaAfslag_EUR: ev.marge_EUR * (1 - a.voorspelAfslag),
        maandpiekMetAccu: pieken.met, maandpiekZonderAccu: pieken.zonder,
        jaarpiekMetAccu_kW: jaarpiekMet, jaarpiekZonderAccu_kW: jaarpiekZonder,
        kmBesparing_EUR: kmBesp, kcBesparing_EUR: kcBesp,
        piek: piek,
        cycli: a.bruikbaar > 0 ? (ev.totalen.dcIn) / a.bruikbaar : 0,
        doorzetIn_kWh: ev.totalen.inUitOverschot + ev.totalen.inUitMatch + ev.totalen.inVanNet,
        doorzetUit_kWh: ev.totalen.uitNaarIntern + ev.totalen.uitVerdringing + ev.totalen.uitNaarEpex,
        periodeDagen: M._intern.dagen(_rijenVoorEb(q, rest))
      });
    }

    // ── Allocatieregels samenstellen ──────────────────────────────────────────
    // `overschot_kWh` = alles wat niet direct intern geleverd is, dus inclusief wat
    // naar de accu ging. Zo blijft gelijktijdig + overschot = opwek en klopt de
    // balanscontrole in `buildModel()` net als in de bestaande modus. De splitsing
    // staat er als extra velden naast en wordt in `verwerkInModel()` verwerkt.
    var rows = [];
    var perAsset = {};
    for (var t = 0; t < T; t++) {
      var lst = q.aanbieders[t];
      for (var k = 0; k < lst.length; k++) {
        var bb = lst[k], rj = bb.rij;
        var intern = Math.max(0, bb.intern || 0);
        var naarAccu = Math.max(0, bb.naarAccu || 0);
        var exp = Math.max(0, bb.export || 0);
        rows.push({
          'Tijd (UTC)': rj['Tijd (UTC)'], tijdKey: rj.tijdKey,
          Asset: rj.Asset, Type: rj.Type, Type_norm: rj.Type_norm,
          Prioriteit: rj.Prioriteit, opwek_kWh: rj.opwek_kWh, Gebruiker: rj.Gebruiker || '',
          gelijktijdig_kWh: intern,
          overschot_kWh: naarAccu + exp,
          naar_accu_kWh: naarAccu,
          direct_export_kWh: exp,
          prijs_eur_per_kWh: bb.prijs
        });
        var pa = perAsset[rj.Asset];
        if (!pa) pa = perAsset[rj.Asset] = {Asset: rj.Asset, Type_norm: rj.Type_norm,
          opwek_kWh: 0, intern_kWh: 0, naarAccu_kWh: 0, export_kWh: 0,
          opbrengst_intern_EUR: 0, opbrengst_export_EUR: 0, opbrengst_opslag_EUR: 0};
        pa.opwek_kWh += rj.opwek_kWh || 0;
        pa.intern_kWh += intern; pa.naarAccu_kWh += naarAccu; pa.export_kWh += exp;
        pa.opbrengst_intern_EUR += intern * bb.prijs;
        pa.opbrengst_export_EUR += exp * q.exportProd[t];
        // Wat de producent gegarandeerd krijgt voor energie die de accu in ging: zijn
        // directe exportalternatief. Dit bedrag zit al in de modelkolom
        // `opbrengst_epex_overschot_EUR` (overschot × EPEX, en overschot bevat de
        // accu-lading); het staat hier apart zodat zichtbaar is welk deel dat is.
        pa.opbrengst_opslag_EUR += naarAccu * q.exportProd[t];
      }
    }

    // ── Kwartiertotalen over alle accu's ──────────────────────────────────────
    var tot = _kwartierTotalen(q, accuResultaten, rest);
    var plan = {
      instellingen: inst, q: q, accus: accuResultaten, perAsset: perAsset,
      tijdKeys: q.tijdKeys, T: T, kwartier: tot, basisZonderAccu: basis,
      periodeDagen: M._intern.dagen(_rijenVoorEb(q, rest)),
      meritVolgorde: opt.meritVolgorde || 'prioriteit'
    };
    plan.balans = controleerBalans(plan);
    return {rows: rows, plan: plan};
  }

  /** {tijdKey: waarde} → Float64Array op de volgorde van de mastertijdlijn. */
  function _lijnUit(map, tijdKeys) {
    if (!map) return null;
    if (map.length === tijdKeys.length && typeof map.subarray === 'function') return map;
    var a = new Float64Array(tijdKeys.length);
    for (var i = 0; i < tijdKeys.length; i++) a[i] = +map[tijdKeys[i]] || 0;
    return a;
  }

  function _rijenVoorEb(q, rest) {
    var uit = new Array(q.T);
    for (var i = 0; i < q.T; i++) uit[i] = {tijdKey: q.tijdKeys[i], tekort: rest.tekort[i]};
    return uit;
  }

  function _leegAccu(cfg, a, q) {
    var T = q.T, nul = new Float64Array(T);
    return {cfg: cfg, accu: a, leeg: true, acProfiel: nul, socKwh: nul, tijdKey: q.tijdKeys,
      routes: {uitOverschot: nul, uitMatch: nul, uitNet: nul,
               naarIntern: nul, verdringUit: nul, naarEpex: nul},
      restVoor: {surplus: nul, tekort: nul, match: nul},
      boek: {}, totalen: {inUitOverschot: 0, inUitMatch: 0, inVanNet: 0, uitNaarIntern: 0,
        uitVerdringing: 0, uitNaarEpex: 0, kostenLaden: 0, opbrengstOntladen: 0, degradatie: 0,
        opslagvergoeding: 0, beschermingKorting: 0, ebBetaald: 0, ebVermeden: 0,
        dcIn: 0, dcUit: 0},
      marge_EUR: 0, margeNaAfslag_EUR: 0, kmBesparing_EUR: 0, kcBesparing_EUR: 0,
      cycli: 0, doorzetIn_kWh: 0, doorzetUit_kWh: 0,
      jaarpiekMetAccu_kW: 0, jaarpiekZonderAccu_kW: 0,
      maandpiekMetAccu: {}, maandpiekZonderAccu: {}, periodeDagen: 0};
  }

  /** Per kwartier de zeven routes, opgeteld over alle accu's. */
  function _kwartierTotalen(q, accus, rest) {
    var T = q.T;
    var o = {
      directIntern:   new Float64Array(T),
      naarAccu:       new Float64Array(T),
      uitAccuIntern:  new Float64Array(T),
      uitAccuEpex:    new Float64Array(T),
      directExport:   new Float64Array(T),
      netNaarAccu:    new Float64Array(T),
      netNaarAfnemer: new Float64Array(T),
      netImport:      new Float64Array(T),
      netExport:      new Float64Array(T),
      prijsAccuIntern: q.prijsBat || new Float64Array(T)
    };
    for (var t = 0; t < T; t++) {
      o.directIntern[t]   = q.match[t];
      o.directExport[t]   = rest.surplus[t];
      o.netNaarAfnemer[t] = rest.tekort[t];
      for (var i = 0; i < accus.length; i++) {
        var r = accus[i].routes;
        o.naarAccu[t]      += r.uitOverschot[t] + r.uitMatch[t];
        o.netNaarAccu[t]   += r.uitNet[t];
        o.uitAccuIntern[t] += r.naarIntern[t] + r.verdringUit[t];
        o.uitAccuEpex[t]   += r.naarEpex[t];
      }
      o.netImport[t] = o.netNaarAfnemer[t] + o.netNaarAccu[t];
      o.netExport[t] = o.directExport[t] + o.uitAccuEpex[t];
    }
    return o;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. BALANSCONTROLE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Twee controles die geen enkele uitkomst mag falen:
   *
   *   ENERGIE   opwek + ontladen + tekort = verbruik + laden + overschot
   *   VOORRAAD  wat er de accu in ging (na laadverlies) minus wat eruit kwam
   *             (voor ontlaadverlies) is de verandering van de vullingsgraad
   *
   * Een kWh die is opgeslagen mag niet óók als directe interne levering of directe
   * export meetellen; die dubbeltelling zou hier meteen zichtbaar worden.
   */
  function controleerBalans(plan) {
    var q = plan.q, T = plan.T, k = plan.kwartier;
    var opwek = 0, verbruik = 0, laden = 0, ontladen = 0, import_ = 0, export_ = 0;
    var intern = 0, naarAccu = 0, directExp = 0, uitInt = 0, uitEpex = 0, netAccu = 0, netAfn = 0;
    for (var t = 0; t < T; t++) {
      opwek    += q.opwek[t];
      verbruik += q.vraag[t];
      intern   += k.directIntern[t];
      naarAccu += k.naarAccu[t];
      directExp+= k.directExport[t];
      uitInt   += k.uitAccuIntern[t];
      uitEpex  += k.uitAccuEpex[t];
      netAccu  += k.netNaarAccu[t];
      netAfn   += k.netNaarAfnemer[t];
    }
    laden    = naarAccu + netAccu;
    ontladen = uitInt + uitEpex;
    import_  = netAfn + netAccu;
    export_  = directExp + uitEpex;

    var links  = opwek + ontladen + import_;
    var rechts = verbruik + laden + export_;
    var opwekSplitsing = intern + naarAccu + directExp;
    var vraagSplitsing = intern + uitInt + netAfn;

    var uitkomst = {
      opwek_kWh: opwek, verbruik_kWh: verbruik,
      laden_kWh: laden, ontladen_kWh: ontladen,
      netImport_kWh: import_, netExport_kWh: export_,
      directIntern_kWh: intern, naarAccu_kWh: naarAccu, directExport_kWh: directExp,
      uitAccuIntern_kWh: uitInt, uitAccuEpex_kWh: uitEpex,
      netNaarAccu_kWh: netAccu, netNaarAfnemer_kWh: netAfn,
      energieLinks: links, energieRechts: rechts,
      energieVerschil: links - rechts,
      opwekVerschil: opwekSplitsing - opwek,
      vraagVerschil: vraagSplitsing - verbruik,
      accus: []
    };
    var tol = Math.max(0.1, Math.abs(rechts) * 1e-9);
    uitkomst.energieSluitend = Math.abs(uitkomst.energieVerschil) <= tol;
    uitkomst.opwekSluitend   = Math.abs(uitkomst.opwekVerschil)   <= tol;
    uitkomst.vraagSluitend   = Math.abs(uitkomst.vraagVerschil)   <= tol;

    plan.accus.forEach(function (r) {
      var tt = r.totalen;
      var acIn  = tt.inUitOverschot + tt.inUitMatch + tt.inVanNet;
      var acUit = tt.uitNaarIntern + tt.uitVerdringing + tt.uitNaarEpex;
      var dcIn  = tt.dcIn, dcUit = tt.dcUit;
      var socEind = r.socKwh && r.socKwh.length ? r.socKwh[r.socKwh.length - 1] : 0;
      var socStart = r.accu ? r.accu.socMin : 0;
      var verschil = dcIn - dcUit - (socEind - socStart);
      uitkomst.accus.push({
        naam: (r.accu && r.accu.naam) || 'Accu',
        ac_in_kWh: acIn, ac_uit_kWh: acUit, dc_in_kWh: dcIn, dc_uit_kWh: dcUit,
        verlies_kWh: (acIn - dcIn) + (dcUit - acUit),
        voorraadVerschil_kWh: verschil,
        sluitend: Math.abs(verschil) <= Math.max(0.5, dcIn * 1e-6)
      });
    });
    uitkomst.sluitend = uitkomst.energieSluitend && uitkomst.opwekSluitend &&
      uitkomst.vraagSluitend && uitkomst.accus.every(function (x) { return x.sluitend; });
    if (!uitkomst.sluitend) {
      console.warn('[EhpMatching] balanscontrole niet sluitend:', uitkomst);
    }
    return uitkomst;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. TERUGKOPPELING NAAR HET GROEPSMODEL
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Zet de uitkomst van de gezamenlijke afweging in de modelrijen, zodat kengetallen,
   * financieel overzicht en deelnemersverrekening hetzelfde beeld geven.
   *
   * Verschil met `EhpOpslag.verwerkInModel()`: daar wordt het overschot per bron NAAR
   * RATO afgeboekt, omdat de accudispatch alleen een groepstotaal kent. Hier is per
   * asset bekend hoeveel er de accu in ging, dus wordt het exact afgeboekt.
   *
   * Nieuw is ook de kolom `kosten_opslag_intern_EUR`: wat de afnemers betalen voor
   * energie uit de accu. Zonder die kolom zou opgeslagen energie gratis bij de
   * afnemer landen (hun tekort daalt immers) terwijl de accu-eigenaar wél kosten
   * maakt — precies de dubbeltelling waar de verrekening tegen moet beschermen.
   */
  function verwerkInModel(result, plan, tarieven) {
    if (!result || !result.model || !plan) return result;
    var intern = global.EnergieModel.intern;
    var p = tarieven || {};
    var idx = {};
    plan.tijdKeys.forEach(function (tk, i) { idx[tk] = i; });
    var k = plan.kwartier;

    // Direct geëxporteerd volume per bron, uit de allocatieregels.
    var expPerBron = {};
    (result.opwekAlloc || []).forEach(function (r) {
      var e = expPerBron[r.tijdKey];
      if (!e) e = expPerBron[r.tijdKey] = {zon: 0, wind: 0, afname_invoeden: 0};
      if (e[r.Type_norm] != null) e[r.Type_norm] += (r.direct_export_kWh != null ? r.direct_export_kWh : r.overschot_kWh);
    });

    result.model.forEach(function (m) {
      var i = idx[m.tijdKey];
      if (i == null) return;
      var epex = +m.epex_eur_per_kWh || 0;
      m.tekort_zonder_accu_kWh    = m.tekort_kWh;
      m.overschot_zonder_accu_kWh = m.overschot_kWh;

      m.accu_laden_kWh              = k.naarAccu[i] + k.netNaarAccu[i];
      m.accu_ontladen_kWh           = k.uitAccuIntern[i] + k.uitAccuEpex[i];
      m.accu_laden_uit_opwek_kWh    = k.naarAccu[i];
      m.accu_laden_uit_net_kWh      = k.netNaarAccu[i];
      m.accu_ontladen_intern_kWh    = k.uitAccuIntern[i];
      m.accu_ontladen_epex_kWh      = k.uitAccuEpex[i];
      m.net_naar_afnemer_kWh        = k.netNaarAfnemer[i];
      m.tekort_kWh                  = k.netImport[i];
      m.overschot_kWh               = k.netExport[i];

      var e = expPerBron[m.tijdKey] || {zon: 0, wind: 0, afname_invoeden: 0};
      m.overschot_zon_kWh             = e.zon;
      m.overschot_wind_kWh            = e.wind;
      m.overschot_afname_invoeden_kWh = e.afname_invoeden;

      m.kosten_epex_tekort_EUR            = m.tekort_kWh * epex;
      m.opbrengst_epex_overschot_EUR      = m.overschot_kWh * epex;
      m.opbrengst_epex_overschot_zon_EUR  = e.zon  * epex;
      m.opbrengst_epex_overschot_wind_EUR = e.wind * epex;
      m.kosten_gvo_rest_EUR               = m.tekort_kWh * (p.gvo_rest || 0);
      m.kosten_opslag_intern_EUR          = k.uitAccuIntern[i] * (k.prijsAccuIntern[i] || 0);
      m.prijs_opslag_intern_eur_per_kWh   = k.prijsAccuIntern[i] || 0;

      m.kosten_totaal_EUR = (m.kosten_gelijktijdigheid_totaal_EUR || 0)
                          + (m.kosten_platform_EUR || 0)
                          + (m.kosten_gvo_bilateraal_EUR || 0)
                          + m.kosten_gvo_rest_EUR
                          + m.kosten_epex_tekort_EUR
                          + m.kosten_opslag_intern_EUR
                          + (m.kosten_onbalans_totaal_EUR || 0)
                          - m.opbrengst_epex_overschot_EUR;
    });

    result.samenvatting = intern.summarize(result.model);
    result.samenvatting.accu_laden_kWh           = _som(result.model, 'accu_laden_kWh');
    result.samenvatting.accu_ontladen_kWh        = _som(result.model, 'accu_ontladen_kWh');
    result.samenvatting.accu_ontladen_intern_kWh = _som(result.model, 'accu_ontladen_intern_kWh');
    result.samenvatting.accu_ontladen_epex_kWh   = _som(result.model, 'accu_ontladen_epex_kWh');
    result.samenvatting.accu_laden_uit_opwek_kWh = _som(result.model, 'accu_laden_uit_opwek_kWh');
    result.samenvatting.accu_laden_uit_net_kWh   = _som(result.model, 'accu_laden_uit_net_kWh');
    result.samenvatting.kosten_opslag_intern_EUR = _som(result.model, 'kosten_opslag_intern_EUR');

    var deel = intern.participantOutputsForModel(result.model, result.verbruik, result.opwekAlloc, p);
    result.per_gebruiker = deel.per_gebruiker;
    result.per_opwekker  = deel.per_opwekker;
    result.accuVerwerkt  = true;
    result.matchingPlan  = plan;
    return result;
  }

  function _som(model, kol) {
    var s = 0;
    for (var i = 0; i < model.length; i++) s += (model[i][kol] || 0);
    return s;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. ALLOCATOR-FABRIEK — de koppeling met EnergieModel.buildModel()
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Levert de functie die `buildModel()` als `inputs.allocator` verwacht, met het
   * volledige plan als bijvangst. Zo hoeft geen enkele omliggende stap
   * (prosumer-correctie, mastertijdlijn, aggregatie, economische kolommen, forward,
   * deelnemersuitsplitsing) gedupliceerd te worden.
   */
  function maakAllocator(opties) {
    var o = opties || {};
    function allocator(opwekRows, verbruikByTijd) {
      var res = rekenSamen(opwekRows, verbruikByTijd, o);
      allocator.plan = res.plan;
      return res.rows;
    }
    allocator.plan = null;
    allocator.opties = o;
    allocator.verklaarKwartier = function (tijdKey) {
      return allocator.plan ? verklaarKwartier(allocator.plan, tijdKey) : null;
    };
    return allocator;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6b. ADAPTER NAAR DE BESTAANDE OPSLAGTAB
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Giet één accu-uitkomst in de vorm die `EhpOpslag.dispatch()` oplevert, zodat de
   * bestaande opslagtab, de SoC-duurkromme, de businesscase en de piekweergave
   * ongewijzigd blijven werken. Geen tweede weergave van dezelfde getallen — één
   * vertaling, hier, met de verschillen expliciet:
   *
   *   uitNaarTekort_kWh   telt hier ook de levering mee die duurdere opwek verdrong;
   *                       in beide gevallen gaat de kWh naar een interne afnemer.
   *   inUitOverschot_kWh  telt ook de lading uit opwek die anders direct geleverd was;
   *                       in beide gevallen komt de kWh uit lokale opwek.
   * Die twee routes bestaan in de bestaande modus niet en zijn daar dus nul.
   */
  function alsOpslagResultaat(r, inst) {
    if (r.leeg) {
      return {accu: r.accu, marginaleKostenPerKwh: 0, acProfiel: [], socKwh: [], tijdKey: [],
        doorzetUit_kWh: 0, doorzetIn_kWh: 0, opbrengst_EUR: 0, kosten_EUR: 0, degradatie_EUR: 0,
        marge_EUR: 0, margeNaAfslag_EUR: 0, cycli: 0,
        uitNaarTekort_kWh: 0, uitNaarNet_kWh: 0, inUitOverschot_kWh: 0, inVanNet_kWh: 0,
        kwartierenVol: 0, kwartierenLeeg: 0, kwartierenOpVermogen: 0, kwartierenActief: 0,
        periodeDagen: r.periodeDagen || 0};
    }
    var t = r.totalen, a = r.accu;
    return {
      accu: a, marginaleKostenPerKwh: a.mkDegradatie,
      acProfiel: r.acProfiel, socKwh: r.socKwh, tijdKey: r.tijdKey,
      doorzetIn_kWh: r.doorzetIn_kWh, doorzetUit_kWh: r.doorzetUit_kWh,
      opbrengst_EUR: t.opbrengstOntladen, kosten_EUR: t.kostenLaden, degradatie_EUR: t.degradatie,
      marge_EUR: r.marge_EUR, margeNaAfslag_EUR: r.margeNaAfslag_EUR, cycli: r.cycli,
      uitNaarTekort_kWh: t.uitNaarIntern + t.uitVerdringing, uitNaarNet_kWh: t.uitNaarEpex,
      inUitOverschot_kWh: t.inUitOverschot + t.inUitMatch, inVanNet_kWh: t.inVanNet,
      ebBetaald_EUR: t.ebBetaald, ebVermeden_EUR: t.ebVermeden,
      ebTarief_EUR_kWh: a.ebEffectief || 0, ebLadenTarief_EUR_kWh: a.ebLaden || 0,
      ebVermedenTarief_EUR_kWh: a.ebVermeden || 0,
      aandeelEigenOpwek: a.aandeelEigen == null ? 1 : a.aandeelEigen,
      opslagVrijstelling: !!a.opslagVrijstelling,
      kwartierenVol: t.kwartierenVol, kwartierenLeeg: t.kwartierenLeeg,
      kwartierenOpVermogen: t.kwartierenOpVermogen, kwartierenActief: t.kwartierenActief,
      piekStraf_EUR: 0, kwartierenBovenCap: 0,
      benutting: {
        beschikbaarOverschot_kWh: t.beschOverschot,
        opgenomen_kWh: t.inUitOverschot + t.inUitMatch,
        gemistOmdatVol_kWh: t.gemistVol, gemistOpVermogen_kWh: t.gemistVermogen,
        gemistOnrendabel_kWh: t.gemistOnrendabel,
        beschikbaarTekort_kWh: t.beschTekort, gedekt_kWh: t.uitNaarIntern,
        gemistOmdatLeeg_kWh: t.gemistLeeg, gemistOpVermogenUit_kWh: t.gemistVermogenUit,
        gemistOnrendabelUit_kWh: t.gemistOnrendabelUit
      },
      maandpiekMetAccu: r.maandpiekMetAccu, maandpiekZonderAccu: r.maandpiekZonderAccu,
      jaarpiekMetAccu_kW: r.jaarpiekMetAccu_kW, jaarpiekZonderAccu_kW: r.jaarpiekZonderAccu_kW,
      periodeDagen: r.periodeDagen,
      // Alleen in deze modus beschikbaar; de opslagtab gebruikt ze niet, de nieuwe
      // route- en herkomstoverzichten wel.
      routes: r.routes, boek: r.boek, totalen: t
    };
  }

  /** Herkomst van de laadstroom per bedrijf, uit het grootboek van deze accu. */
  function herkomstUitBoek(r) {
    var perBedrijf = [], vanNet = 0;
    Object.keys(r.boek || {}).forEach(function (k) {
      var b = r.boek[k];
      if (b.bron === 'net') { vanNet += b.in_ac_kWh; return; }
      if (b.in_ac_kWh > EPS) perBedrijf.push({naam: b.asset, kWh: b.in_ac_kWh, bron: b.bron});
    });
    perBedrijf.sort(function (x, y) { return y.kWh - x.kWh; });
    return {perBedrijf: perBedrijf, vanNet_kWh: vanNet};
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. KWARTIER-INSPECTOR — alle alternatieven, de gekozen route en het waarom
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Rekent één kwartier opnieuw door en zet de gekozen route naast de alternatieven
   * die het model heeft afgewogen. Dat is niet een nagebootste redenering: het zijn
   * dezelfde functie en dezelfde getallen als in de doorrekening.
   */
  function verklaarKwartier(plan, tijdKey) {
    var q = plan.q;
    var t = plan.tijdKeys.indexOf(tijdKey);
    if (t < 0) return null;
    var inst = plan.instellingen;

    var bronnen = (q.aanbieders[t] || []).map(function (b) {
      return {asset: b.rij.Asset, bron: b.rij.Type_norm, prioriteit: b.rij.Prioriteit,
        opwek_kWh: b.rij.opwek_kWh || 0, prijs: b.prijs,
        intern_kWh: b.intern || 0, naarAccu_kWh: b.naarAccu || 0, export_kWh: b.export || 0,
        magIntern: b.magIntern,
        teDuurVoorAfnemer: b.teDuurVoorAfnemer, teLaagVoorProducent: b.teLaagVoorProducent,
        reden: !b.magIntern
          ? (b.teDuurVoorAfnemer ? 'boven het netalternatief van de afnemer — niet intern verrekend'
                                 : 'onder het exportalternatief van de producent — niet intern verrekend')
          : (b.intern || 0) > 1e-9
            ? ((b.naarAccu || 0) > 1e-9 ? 'deels intern geleverd, deels naar de accu' : 'intern geleverd')
            : (b.naarAccu || 0) > 1e-9 ? 'naar de accu'
            : 'naar het net'};
    });

    var accus = plan.accus.map(function (r) {
      if (r.leeg) return null;
      var s = r.signaal, a = r.accu;
      var restQ = {surplus: r.restVoor.surplus[t], tekort: r.restVoor.tekort[t],
                   match: r.restVoor.match[t]};
      var opt = M._intern.dpOpties(a, inst);
      var maxAc = a.kW * DT;
      var soc  = r.socKwh[t] || 0;
      var socVoor = t > 0 ? r.socKwh[t - 1] : a.socMin;
      // Wat was er in dit kwartier mogelijk geweest? De DP koos uit precies deze
      // verzameling; de vermelde waarde is de doelfunctie van dat ene kwartier,
      // exclusief wat de keuze in latere kwartieren nog oplevert.
      var ruimteLaden   = Math.min(maxAc, Math.max(0, (a.socMax - socVoor)) / Math.max(1e-9, a.etaLaad));
      var ruimteOntlaad = Math.min(maxAc, Math.max(0, (socVoor - a.socMin)) * a.etaOntlaad);
      var kandidaten = [
        {label: 'accu staat stil', ac: 0},
        {label: 'maximaal laden', ac: ruimteLaden},
        {label: 'maximaal ontladen', ac: -ruimteOntlaad},
        {label: 'gekozen', ac: -(r.acProfiel[t] || 0), gekozen: true}
      ];
      var opties = kandidaten.map(function (c) {
        var bak = M.leegUitkomst();
        M._intern.uitkomstKwartier(t, c.ac, q, s, inst, restQ, opt, bak);
        return {label: c.label, gekozen: !!c.gekozen, ac_kWh: c.ac, toegestaan: bak.geldig,
          doel: bak.geldig ? bak.doel : null,
          groepsWaarde: bak.geldig ? bak.groepsWaarde : null,
          afnemerVoordeel: bak.geldig ? bak.afnemerVoordeel : null,
          netUitwisseling: bak.geldig ? bak.netUitwisseling : null,
          routes: bak.geldig ? {uitOverschot: bak.uitOverschot, uitMatch: bak.uitMatch,
            uitNet: bak.uitNet, naarIntern: bak.naarIntern, verdringUit: bak.verdringUit,
            naarEpex: bak.naarEpex} : null,
          reden: M.redenVan(bak)};
      });
      var gekozenRoutes = {
        uitOverschot: r.routes.uitOverschot[t], uitMatch: r.routes.uitMatch[t],
        uitNet: r.routes.uitNet[t], naarIntern: r.routes.naarIntern[t],
        verdringUit: r.routes.verdringUit[t], naarEpex: r.routes.naarEpex[t]
      };
      // Welke grens heeft de beslissing bepaald?
      var grens = !s.magUitOpwek[t]
          ? 'producentenbescherming: opgeslagen energie zou de producent onder zijn exportalternatief brengen'
        : s.onderKostprijs[t] && gekozenRoutes.naarIntern > 1e-9
          ? 'de accu levert intern onder zijn marginale kostprijs; het verschil komt als ' +
            'beschermingscorrectie ten laste van de pool'
        : !opt.gridMag && gekozenRoutes.uitNet <= 1e-9 && (a.alleenEigenOverschot || !inst.ladenUitNet)
          ? 'laden uit het net is uitgeschakeld'
        : !inst.ontladenNaarEpex && gekozenRoutes.naarEpex <= 1e-9
          ? 'ontladen naar EPEX is uitgeschakeld'
        : soc >= a.socMax - 1e-6 ? 'accu vol'
        : soc <= a.socMin + 1e-6 ? 'accu leeg'
        : 'geen grens bindend — de prijsafweging bepaalde de keuze';
      return {
        naam: a.naam, volgorde: r.volgorde,
        soc_kWh: soc, socPct: a.kWh > 0 ? soc / a.kWh * 100 : 0,
        ac_kWh: -(r.acProfiel[t] || 0),
        routes: gekozenRoutes, opties: opties, grens: grens,
        prijzen: {
          exportProducent: s.pEx[t], netAfnemer: s.pNet[t], ladenUitNet: s.pLaadNet[t],
          exportAccu: s.pExAccu[t], ontladenIntern: s.pUitInt[t],
          opgeslagenIndicatie: s.pBat[t],
          opgeslagenWerkelijk: (plan.kwartier.prijsAccuIntern[t] || 0),
          degradatie: a.mkDegradatie, opslagvergoeding: inst.opslagvergoeding
        },
        restVoor: restQ
      };
    }).filter(Boolean);

    var kw = plan.kwartier;
    return {
      tijdKey: tijdKey, index: t, modus: inst.modus, modusLabel: inst.modusLabel,
      doel: inst.doel, doelLabel: inst.doelLabel,
      gewichten: {afnemer: inst.wAfnemer, netMwh: inst.wNetMwh},
      epex: q.epex[t], netAfnemer: q.netAfnemer[t], exportProducent: q.exportProd[t],
      vraag: q.vraag[t], opwek: q.opwek[t],
      bronnen: bronnen, accus: accus,
      routes: {
        directIntern: kw.directIntern[t], naarAccu: kw.naarAccu[t],
        uitAccuIntern: kw.uitAccuIntern[t], uitAccuEpex: kw.uitAccuEpex[t],
        directExport: kw.directExport[t], netNaarAccu: kw.netNaarAccu[t],
        netNaarAfnemer: kw.netNaarAfnemer[t]
      },
      prijsAccuIntern: kw.prijsAccuIntern[t] || 0,
      geblokkeerdAfnemer_kWh: q.geblokkeerdAfnemer[t],
      geblokkeerdProducent_kWh: q.geblokkeerdProducent[t],
      korting_EUR: q.korting[t], toeslag_EUR: q.toeslag[t]
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Export (additief op EhpMatching uit matching.js)
  // ═══════════════════════════════════════════════════════════════════════════
  M.rekenSamen        = rekenSamen;
  M.maakAllocator     = maakAllocator;
  M.alsOpslagResultaat = alsOpslagResultaat;
  M.herkomstUitBoek   = herkomstUitBoek;
  M.verwerkInModel    = verwerkInModel;
  M.controleerBalans  = controleerBalans;
  M.verklaarKwartier  = verklaarKwartier;
  M._intern.loopPad   = _loopPad;
  M._intern.piekZoek  = _piekZoek;
  M._intern.maandPieken = _maandPieken;

})(window);
