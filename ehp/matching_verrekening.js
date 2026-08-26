/* EHP samenhangende matching en opslag — de financiële verrekening.
   Hoort bij ehp/matching.js en ehp/matching_run.js.
   Namespace: window.EhpMatching wordt hier uitgebreid; global scope, geen build.

   ─────────────────────────────────────────────────────────────────────────────
   DE ÉÉN NA BELANGRIJKSTE REGEL: NIETS TWEEMAAL
   ─────────────────────────────────────────────────────────────────────────────
   Bij een accu in een collectief liggen drie dubbeltellingen op de loer. Ze worden
   hier alle drie expliciet uit elkaar gehouden:

   1. ENERGIEVOORDEEL DAT AL BIJ DE AFNEMER LANDT.
      Een afnemer die uit de accu koopt betaalt zijn netalternatief MIN de
      afgesproken korting. Dat voordeel zit al in zijn rekening. Het staat hieronder
      als `afnemersvoordeel_direct_EUR` — ter verantwoording, niet om te verdelen.

   2. OPSLAGWAARDE.
      Wat de accu op een kWh verdient bovenop wat hij ervoor betaalde en wat de
      slijtage kostte. Dít is het bedrag dat via de gekozen verdeling naar de
      energie-eigenaar, de accu-eigenaar of de pool gaat.

   3. PIEKWAARDE EN VASTE LASTEN.
      Besparing op transporttarief minus opex, kapitaallast en eventuele eigen
      aansluitkosten. Loopt niet via de energieprijs en dus ook niet via de
      opslagwaarde; gaat als aparte post naar de kostendrager of de pool.

   Optellen mag pas ná die scheiding. De controle onderaan (`controle`) toont dat de
   verdeelde bedragen exact optellen tot de gecreëerde waarde — geen euro verdwijnt
   en geen euro wordt twee keer uitgedeeld.

   ─────────────────────────────────────────────────────────────────────────────
   WAT DE PRODUCENT SOWIESO KRIJGT
   ─────────────────────────────────────────────────────────────────────────────
   Energie die de accu in gaat telt in het groepsmodel mee in `overschot_kWh` en
   wordt daar gewaardeerd tegen EPEX — precies het directe exportalternatief. De
   producent ontvangt zijn alternatief dus al via de bestaande modelkolom; de
   verdeling hieronder gaat uitsluitend over wat er BOVENOP dat alternatief is
   verdiend. Daarom kan de producent er in geen enkele verdelingskeuze op
   achteruitgaan.
*/
(function (global) {
  'use strict';

  var M   = global.EhpMatching;
  var EPS = 1e-9;

  /**
   * Verdeelt de opslagwaarde van één herkomstregel volgens de gekozen afspraak.
   *
   * `waarde` = opbrengst − wat de accu voor die energie betaalde − slijtage.
   * Is die negatief (de accu heeft er op verloren), dan komt het verlies bij de
   * accu-eigenaar terecht: de energie-eigenaar heeft zijn alternatief al gehad en
   * mag er niet alsnog op achteruitgaan. Dat is de producentenbescherming in de
   * verrekening; de dispatch probeert die situatie al te vermijden.
   */
  function _splitsWaarde(waarde, vergoeding, isNet, inst) {
    var uit = {energie: 0, batterij: 0, pool: 0};
    if (waarde < 0) { uit.batterij = waarde; return uit; }

    // Zonder energie-eigenaar (herkomst 'net') is er niemand om het energiedeel aan
    // toe te kennen. Dat deel gaat naar de accu-eigenaar, die de netstroom immers
    // zelf heeft ingekocht en het prijsrisico droeg.
    switch (inst.verdeling) {
      case 'energie_eigenaar':
        if (isNet) { uit.batterij = waarde; break; }
        // De opslagvergoeding is de beloning van de accu-eigenaar; wat overblijft is
        // voor de eigenaar van de energie. Nooit meer dan er is.
        uit.batterij = Math.min(vergoeding, waarde);
        uit.energie  = waarde - uit.batterij;
        break;
      case 'batterij_eigenaar':
        uit.batterij = waarde;
        break;
      case 'groepspool':
        uit.pool = waarde;
        break;
      case 'verdeelsleutel':
        var sE = inst.split.energie, sB = inst.split.batterij, sP = inst.split.pool;
        if (isNet) { sB += sE; sE = 0; }
        var som = sE + sB + sP;
        if (som <= EPS) { uit.pool = waarde; break; }
        uit.energie  = waarde * (sE / som);
        uit.batterij = waarde * (sB / som);
        uit.pool     = waarde * (sP / som);
        break;
      default:
        uit.pool = waarde;
    }
    return uit;
  }

  /**
   * Volledige verrekening op basis van het plan.
   *
   * opties:
   *   perGebruiker   result.per_gebruiker   (voor de directe interne inkoop)
   *   perOpwekker    result.per_opwekker    (voor de directe opbrengst per asset)
   *   verbruik       result.verbruik        (kwartierrijen per locatie)
   *   model          result.model           (voor EPEX en het netalternatief)
   *   businesscases  per accu {opex_EUR, kapitaallast_EUR, eigenAansluiting_EUR} over de periode
   *   kostenDragerNaam(id)  optionele functie voor leesbare namen
   */
  function verreken(plan, opties) {
    var o = opties || {};
    var inst = plan.instellingen;
    var q = plan.q, k = plan.kwartier, T = plan.T;

    // ── 1. Opslagwaarde per herkomst, per accu ────────────────────────────────
    var perAccu = [], herkomstRegels = [];
    var naarEnergiePerAsset = {}, vergoedingPerAsset = {};
    var totaalWaarde = 0, totNaarEnergie = 0, totNaarBatterij = 0, totNaarPool = 0;

    plan.accus.forEach(function (r, ai) {
      var tt = r.totalen;
      var bcs = (o.businesscases && o.businesscases[ai]) || {};
      var regels = [];
      var accuWaarde = 0, accuNaarEnergie = 0, accuNaarBatterij = 0, accuNaarPool = 0;

      Object.keys(r.boek || {}).forEach(function (key) {
        var b = r.boek[key];
        if (!(b.uit_ac_kWh > EPS)) return;
        var waarde = b.opbrengst_EUR - b.kostenAfgeleverd_EUR - b.degradatieAfgeleverd_EUR;
        var isNet  = b.bron === 'net';
        var split  = _splitsWaarde(waarde, b.opslagvergoeding_EUR, isNet, inst);
        var regel = {
          accu: r.accu ? r.accu.naam : 'Accu', accuIndex: ai,
          bron: b.bron, asset: b.asset,
          geladen_ac_kWh: b.in_ac_kWh, afgeleverd_ac_kWh: b.uit_ac_kWh,
          naarIntern_kWh: b.naarIntern_kWh, naarEpex_kWh: b.naarEpex_kWh,
          verlies_kWh: b.verlies_kWh,
          alternatiefBijLaden_EUR: b.kostenAfgeleverd_EUR,
          opbrengst_EUR: b.opbrengst_EUR,
          degradatie_EUR: b.degradatieAfgeleverd_EUR,
          opslagvergoeding_EUR: b.opslagvergoeding_EUR,
          opslagwaarde_EUR: waarde,
          naarEnergieEigenaar_EUR: split.energie,
          naarAccuEigenaar_EUR: split.batterij,
          naarPool_EUR: split.pool,
          eersteLading: b.eersteLading, laatsteLevering: b.laatsteLevering,
          nogInVoorraad_kWh: Math.max(0, (r.voorraadEind && r.voorraadEind[key]) || 0)
        };
        regels.push(regel); herkomstRegels.push(regel);
        accuWaarde += waarde;
        accuNaarEnergie += split.energie; accuNaarBatterij += split.batterij; accuNaarPool += split.pool;
        if (!isNet && b.asset) {
          naarEnergiePerAsset[b.asset] = (naarEnergiePerAsset[b.asset] || 0) + split.energie;
          if (inst.verdeling === 'energie_eigenaar') {
            vergoedingPerAsset[b.asset] = (vergoedingPerAsset[b.asset] || 0) + Math.min(b.opslagvergoeding_EUR, Math.max(0, waarde));
          }
        }
      });

      totaalWaarde    += accuWaarde;
      totNaarEnergie  += accuNaarEnergie;
      totNaarBatterij += accuNaarBatterij;
      totNaarPool     += accuNaarPool;

      var piek = (r.kmBesparing_EUR || 0) + (r.kcBesparing_EUR || 0);
      var opex = bcs.opex_EUR || 0, kap = bcs.kapitaallast_EUR || 0, aan = bcs.eigenAansluiting_EUR || 0;
      perAccu.push({
        naam: r.accu ? r.accu.naam : 'Accu', index: ai, volgorde: r.volgorde,
        eigenaar: r.accu ? r.accu.eigenaar : 'groep',
        kostenDrager: r.accu ? r.accu.kostenDrager : 'platform',
        // Energiestromen
        geladen_kWh: tt.inUitOverschot + tt.inUitMatch + tt.inVanNet,
        geladenUitOpwek_kWh: tt.inUitOverschot + tt.inUitMatch,
        geladenUitNet_kWh: tt.inVanNet,
        afgeleverd_kWh: tt.uitNaarIntern + tt.uitVerdringing + tt.uitNaarEpex,
        afgeleverdIntern_kWh: tt.uitNaarIntern + tt.uitVerdringing,
        afgeleverdEpex_kWh: tt.uitNaarEpex,
        // Financieel — arbitrage
        energieKosten_EUR: tt.kostenLaden,
        energieOpbrengst_EUR: tt.opbrengstOntladen,
        degradatie_EUR: tt.degradatie,
        arbitrageMarge_EUR: accuWaarde,
        opslagvergoeding_EUR: inst.verdeling === 'energie_eigenaar' ? tt.opslagvergoeding : 0,
        aandeelOpslagwaarde_EUR: accuNaarBatterij,
        // Financieel — vaste lasten en piek
        piekwaarde_EUR: piek,
        opex_EUR: opex, kapitaallast_EUR: kap, eigenAansluiting_EUR: aan,
        // Wat er buiten de energieprijs om te verdelen valt
        teVerdelenBuitenEnergie_EUR: piek - opex - kap - aan,
        resultaatAccuEigenaar_EUR: accuNaarBatterij + piek - opex - kap - aan,
        // Fiscaal en overig
        ebBetaald_EUR: tt.ebBetaald, ebVermeden_EUR: tt.ebVermeden,
        beschermingKorting_EUR: tt.beschermingKorting,
        cycli: r.cycli, herkomst: regels
      });
    });

    // ── 2. Per energie-eigenaar (opwekasset) ──────────────────────────────────
    var perAsset = Object.keys(plan.perAsset).map(function (naam) {
      var p = plan.perAsset[naam];
      var opslagwaarde = naarEnergiePerAsset[naam] || 0;
      var vergoeding   = vergoedingPerAsset[naam] || 0;
      // De opbrengst op de kWh die de accu in ging staat al in het groepsmodel als
      // export tegen EPEX. Hier wordt alleen expliciet gemaakt hoe groot dat deel is,
      // zodat de deelnemer kan zien wat er met zijn energie is gebeurd.
      return {
        Asset: naam, Type_norm: p.Type_norm,
        opwek_kWh: p.opwek_kWh,
        directIntern_kWh: p.intern_kWh,
        directExport_kWh: p.export_kWh,
        naarAccu_kWh: p.naarAccu_kWh,
        opbrengstDirectIntern_EUR: p.opbrengst_intern_EUR,
        opbrengstDirectExport_EUR: p.opbrengst_export_EUR,
        gegarandeerdBijOpslag_EUR: p.opbrengst_opslag_EUR,
        opslagwaarde_EUR: opslagwaarde,
        betaaldeOpslagvergoeding_EUR: vergoeding,
        totaal_EUR: p.opbrengst_intern_EUR + p.opbrengst_export_EUR + p.opbrengst_opslag_EUR + opslagwaarde
      };
    }).sort(function (a, b) { return b.opwek_kWh - a.opwek_kWh; });

    // ── 3. Per afnemer ────────────────────────────────────────────────────────
    // De accu-levering wordt per kwartier naar rato van het verbruik toegedeeld —
    // dezelfde regel die `participantOutputsForModel()` voor alle andere kosten
    // gebruikt, zodat de twee optellen tot hetzelfde totaal.
    var idx = {}; plan.tijdKeys.forEach(function (tk, i) { idx[tk] = i; });
    var vraagPerTijd = {};
    (o.verbruik || []).forEach(function (r) {
      vraagPerTijd[r.tijdKey] = (vraagPerTijd[r.tijdKey] || 0) + r.gebruik_kWh;
    });
    var perAfnemerMap = {};
    (o.verbruik || []).forEach(function (r) {
      var i = idx[r.tijdKey];
      if (i == null) return;
      var tot = vraagPerTijd[r.tijdKey] || 0;
      if (tot <= EPS) return;
      var aandeel = r.gebruik_kWh / tot;
      var a = perAfnemerMap[r.Locatie];
      if (!a) a = perAfnemerMap[r.Locatie] = {Locatie: r.Locatie, verbruik_kWh: 0,
        uitAccu_kWh: 0, kostenUitAccu_EUR: 0, netAlternatiefUitAccu_EUR: 0,
        netAlternatiefDirect_EUR: 0, netInkoop_kWh: 0, kostenNetInkoop_EUR: 0};
      a.verbruik_kWh += r.gebruik_kWh;
      var accuKwh = k.uitAccuIntern[i] * aandeel;
      a.uitAccu_kWh += accuKwh;
      a.kostenUitAccu_EUR += accuKwh * (k.prijsAccuIntern[i] || 0);
      a.netAlternatiefUitAccu_EUR += accuKwh * q.netAfnemer[i];
      // Netalternatief van de DIRECT geleverde kWh, in dezelfde kwartieren en met
      // dezelfde pro-rata regel — anders vergelijk je twee verschillende volumes.
      a.netAlternatiefDirect_EUR += k.directIntern[i] * aandeel * q.netAfnemer[i];
      var netKwh = k.netNaarAfnemer[i] * aandeel;
      a.netInkoop_kWh += netKwh;
      a.kostenNetInkoop_EUR += netKwh * q.epex[i];
    });
    var gebrByNaam = {};
    (o.perGebruiker || []).forEach(function (u) { gebrByNaam[u.Locatie] = u; });
    var perAfnemer = Object.keys(perAfnemerMap).map(function (naam) {
      var a = perAfnemerMap[naam];
      var u = gebrByNaam[naam] || {};
      var directKwh = u.gelijktijdig_kWh || 0;
      var directEur = u.kosten_gelijktijdigheid_EUR || 0;
      var netAltDirect = a.netAlternatiefDirect_EUR;
      var besparing = (netAltDirect - directEur) + (a.netAlternatiefUitAccu_EUR - a.kostenUitAccu_EUR);
      return {
        Locatie: naam, verbruik_kWh: a.verbruik_kWh,
        directIntern_kWh: directKwh, kostenDirectIntern_EUR: directEur,
        netAlternatiefDirect_EUR: netAltDirect,
        uitAccu_kWh: a.uitAccu_kWh, kostenUitAccu_EUR: a.kostenUitAccu_EUR,
        netAlternatiefUitAccu_EUR: a.netAlternatiefUitAccu_EUR,
        prijsUitAccu_EUR_kWh: a.uitAccu_kWh > EPS ? a.kostenUitAccu_EUR / a.uitAccu_kWh : 0,
        netInkoop_kWh: a.netInkoop_kWh, kostenNetInkoop_EUR: a.kostenNetInkoop_EUR,
        besparingVsNet_EUR: besparing,
        beschermd: besparing >= -1e-6
      };
    }).sort(function (a, b) { return b.verbruik_kWh - a.verbruik_kWh; });

    // ── 4. Pool ───────────────────────────────────────────────────────────────
    var kortingTot = 0, toeslagTot = 0;
    for (var t = 0; t < T; t++) { kortingTot += q.korting[t]; toeslagTot += q.toeslag[t]; }
    var beschermingKorting = perAccu.reduce(function (s, x) { return s + (x.beschermingKorting_EUR || 0); }, 0);

    // De pool bevat UITSLUITEND wat niet aan één partij toe te rekenen is. Het eigen
    // resultaat van een accu (zijn deel van de opslagwaarde plus piekwaarde minus vaste
    // lasten) staat bij die accu en wordt in `calcEHP()` naar de kostendrager geboekt —
    // pas als dat het platform is, komt het alsnog in de pool. Beide bedragen hier
    // optellen zou dat deel twee keer verdelen.
    var pool = {
      uitOpslagwaarde_EUR: totNaarPool,
      correctieAfnemersbescherming_EUR: -kortingTot,
      correctieProducentenbescherming_EUR: -toeslagTot,
      correctieOpslagprijs_EUR: -beschermingKorting,
      teVerdelen_EUR: totNaarPool - kortingTot - toeslagTot - beschermingKorting
    };

    // ── 5. Wat al bij de afnemer landde — ter verantwoording, niet te verdelen ─
    var afnemersvoordeelDirect = perAfnemer.reduce(function (s, x) {
      return s + (x.netAlternatiefUitAccu_EUR - x.kostenUitAccu_EUR); }, 0);

    // ── 6. Controle: telt alles op en niets dubbel? ───────────────────────────
    var verdeeld = totNaarEnergie + totNaarBatterij + totNaarPool;
    var controle = {
      opslagwaardeTotaal_EUR: totaalWaarde,
      naarEnergieEigenaren_EUR: totNaarEnergie,
      naarAccuEigenaren_EUR: totNaarBatterij,
      naarPool_EUR: totNaarPool,
      verdeeld_EUR: verdeeld,
      verschil_EUR: verdeeld - totaalWaarde,
      sluitend: Math.abs(verdeeld - totaalWaarde) < Math.max(0.01, Math.abs(totaalWaarde) * 1e-9),
      afnemersvoordeelDirect_EUR: afnemersvoordeelDirect,
      toelichtingDubbeltelling:
        'Het voordeel dat afnemers krijgen doordat opgeslagen energie onder hun ' +
        'netalternatief geprijsd is (' + afnemersvoordeelDirect.toFixed(2) + ' EUR) zit al in hun ' +
        'rekening en wordt hier NIET nogmaals verdeeld. Verdeeld wordt uitsluitend de ' +
        'opslagwaarde: opbrengst minus wat de accu voor de energie betaalde minus slijtage.',
      balans: plan.balans
    };

    return {
      instellingen: inst,
      perAccu: perAccu, perAsset: perAsset, perAfnemer: perAfnemer,
      herkomst: herkomstRegels, pool: pool, controle: controle,
      afnemersvoordeelDirect_EUR: afnemersvoordeelDirect
    };
  }

  /**
   * Waarschuwingen bij een prijs- of verdelingsinstelling die deelnemers mogelijk
   * niet beschermt. Bewust vóór de uitkomst te tonen: een instelling die 40% van de
   * opwek buitensluit hoort niet als verrassing uit een tabel te komen.
   */
  function waarschuwingen(plan, verrekening) {
    var inst = plan.instellingen, q = plan.q, uit = [];
    var blokAf = 0, blokPr = 0, opwek = 0;
    for (var t = 0; t < plan.T; t++) {
      blokAf += q.geblokkeerdAfnemer[t]; blokPr += q.geblokkeerdProducent[t]; opwek += q.opwek[t];
    }
    if (opwek > 0 && blokAf / opwek > 0.02) {
      uit.push({ernst: 'let op', tekst: _pct(blokAf / opwek) + ' van de opwek ligt boven het ' +
        'netalternatief van de afnemers en wordt daarom niet intern verrekend. Dat beschermt de ' +
        'afnemer, maar het betekent ook dat de prijsafspraak voor die bron structureel boven de ' +
        'markt ligt. Controleer de prijsvorm van die bron.'});
    }
    if (opwek > 0 && blokPr / opwek > 0.02) {
      uit.push({ernst: 'let op', tekst: _pct(blokPr / opwek) + ' van de opwek levert intern minder ' +
        'op dan directe export en wordt daarom niet intern verrekend. De producent is beschermd, ' +
        'maar bij dit prijsniveau valt er weinig te matchen. Overweeg een EPEX-gekoppelde vorm of ' +
        'een collar met een hogere vloer.'});
    }
    if (!inst.splitGeldig && inst.verdeling === 'verdeelsleutel') {
      uit.push({ernst: 'fout', tekst: 'De procentuele verdeling van de opslagwaarde telt op tot ' +
        _pct(inst.splitSom / 100) + ' in plaats van 100%. De verdeling is naar rato genormaliseerd, ' +
        'maar dat is vrijwel zeker niet wat is afgesproken.'});
    }
    if (inst.verdeling === 'energie_eigenaar' && inst.opslagvergoedingMwh <= 0) {
      uit.push({ernst: 'let op', tekst: 'De opslagwaarde gaat volledig naar de energie-eigenaar en ' +
        'er staat geen opslagvergoeding tegenover. De accu-eigenaar draagt dan alle kosten zonder ' +
        'vergoeding voor de energiedienst.'});
    }
    if (verrekening) {
      var onbeschermd = (verrekening.perAfnemer || []).filter(function (x) { return !x.beschermd; });
      if (onbeschermd.length) {
        uit.push({ernst: 'fout', tekst: onbeschermd.length + ' afnemer' +
          (onbeschermd.length === 1 ? '' : 's') + ' betaalt per saldo meer dan het netalternatief: ' +
          onbeschermd.map(function (x) { return x.Locatie; }).join(', ') +
          '. Zet de afnemersbescherming op "route vervalt" of pas de prijsvorm aan.'});
      }
      var korting = (verrekening.pool || {}).correctieOpslagprijs_EUR || 0;
      if (korting < -0.01) {
        uit.push({ernst: 'let op', tekst: 'De pool past € ' + Math.abs(korting).toFixed(2) + ' bij ' +
          'omdat de accu opgeslagen energie niet boven zijn eigen kostprijs kon leveren binnen het ' +
          'netalternatief van de afnemer. Dat is een reële kostenpost, geen afrondingsverschil.'});
      }
      if (!verrekening.controle.sluitend) {
        uit.push({ernst: 'fout', tekst: 'De verdeling van de opslagwaarde sluit niet: verschil € ' +
          verrekening.controle.verschil_EUR.toFixed(4) + '. Meld dit — het is een fout in het model, ' +
          'geen instelling.'});
      }
    }
    if (plan.balans && !plan.balans.sluitend) {
      uit.push({ernst: 'fout', tekst: 'De energiebalans sluit niet (verschil ' +
        plan.balans.energieVerschil.toFixed(3) + ' kWh). De uitkomsten zijn niet bruikbaar.'});
    }
    if (!inst.ladenUitNet) {
      uit.push({ernst: 'info', tekst: 'Laden uit het net staat uit. De accu kan dan alleen lokale ' +
        'opwek verschuiven — en concurreert daarmee rechtstreeks met directe levering aan afnemers. ' +
        'Dat is precies het geval waarin de volgorde van matching en opslag het antwoord verandert.'});
    }
    if (!inst.ontladenNaarEpex) {
      uit.push({ernst: 'info', tekst: 'Ontladen naar EPEX staat uit. De accu levert uitsluitend ' +
        'binnen de groep; op momenten zonder interne vraag blijft hij vol staan.'});
    }
    return uit;
  }

  function _pct(x) { return (x * 100).toFixed(1) + '%'; }

  M.verreken       = verreken;
  M.waarschuwingen = waarschuwingen;
  M._intern.splitsWaarde = _splitsWaarde;

})(window);
