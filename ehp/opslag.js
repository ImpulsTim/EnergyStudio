/* EHP opslag — accudispatch, gebruik en businesscase.
   Namespace: window.EhpOpslag — global scope, geen build.

   Drie ontwerpkeuzes die het verschil maken met een naïeve arbitrageberekening:

   1. LCOS is een TOETS, geen prijs. Capex is verzonken zodra de accu er staat; een bestaande
      accu hoort te draaien zodra de spread zijn MARGINALE kosten dekt (rendementsverlies +
      degradatie), niet zijn gemiddelde kosten. Zet je LCOS als marginale prijs in de dispatch,
      dan staat de accu stil in elk jaar met een spread onder de gemiddelde kostprijs — terwijl
      elke draai die de marginale kosten dekt geld oplevert. Of de accu ooit terugverdient is
      een aparte som achteraf (`businesscase()`).

   2. Cycli zijn een UITKOMST, geen invoer. De kostprijs per kWh hangt af van hoe vaak de accu
      draait, en dat volgt uit de prijzen. `businesscase()` rekent de LCOS daarom terug met het
      WERKELIJK gerealiseerde cyclusaantal en zet dat naast de aanname uit het register.

   3. De spread die telt is de GELEVERDE spread, niet de EPEX-spread. In een platform laad je uit
      overschot dat anders geëxporteerd wordt tegen EPEX − terugleverafslag, en ontlaad je in een
      tekort dat anders ingekocht wordt tegen EPEX + leveringsopslag. Dat wigje krijg je bovenop
      de EPEX-spread. Staat de accu achter de meter, dan komt vermeden energiebelasting erbij —
      vaak groter dan de marktspread zelf.

   Dispatchmethode: dynamisch programmeren over gediscretiseerde SoC met volledige vooruitblik.
   Dat geeft de MAXIMAAL haalbare waarde van deze accu op deze data — de juiste bovengrens voor
   een businesscase. Werkelijke sturing kent geen perfecte vooruitblik; `voorspelAfslag` haalt
   daar een percentage vanaf. De methode is bewust exact in plaats van heuristisch, zodat een
   tegenvallende uitkomst niet aan het algoritme kan liggen.
*/
(function (global) {
  'use strict';

  var DT = 0.25;   // kwartier in uren

  // ─── Configuratie ───────────────────────────────────────────────────────────

  var VELDEN = [
    {key:'naam',            label:'Naam',                    eenheid:'',        def:'Accu'},
    {key:'eigenaar',        label:'Staat achter',            eenheid:'',        def:'groep'},
    // Waar de accu STAAT bepaalt de techniek en de fiscaliteit; van WIE hij is bepaalt wie de
    // rekening draagt. Een cooperatie kan een accu bezitten die achter de meter van een lid
    // staat, en een lid kan er een neerzetten die het platform mag gebruiken. Daarom apart.
    {key:'kostenDrager',    label:'Rekening voor',           eenheid:'',        def:'platform'},
    {key:'kWh',             label:'Capaciteit',              eenheid:'kWh',     def:500},
    {key:'kW',              label:'Vermogen',                eenheid:'kW',      def:250},
    {key:'etaLaad_pct',     label:'Rendement laden',         eenheid:'%',       def:94},
    {key:'etaOntlaad_pct',  label:'Rendement ontladen',      eenheid:'%',       def:94},
    {key:'socMin_pct',      label:'SoC minimaal',            eenheid:'%',       def:5},
    {key:'socMax_pct',      label:'SoC maximaal',            eenheid:'%',       def:95},
    {key:'capex_kwh',       label:'Capex',                   eenheid:'€/kWh',   def:400},
    {key:'opex_kwh_jr',     label:'Opex',                    eenheid:'€/kWh/jr',def:8},
    {key:'levensduur_jr',   label:'Levensduur (kalender)',   eenheid:'jaar',    def:15},
    {key:'cyclusleven',     label:'Levensduur (cycli)',      eenheid:'cycli',   def:6000},
    {key:'afnameOpslag_mwh',label:'Leveringsopslag afname',  eenheid:'€/MWh',   def:20},
    {key:'terugleverAfslag_mwh', label:'Afslag teruglevering', eenheid:'€/MWh', def:10},
    {key:'eb_kwh',          label:'EB-tarief (0 = afleiden)',eenheid:'€/kWh',   def:0},
    // Belastingplan 2022: levering van elektriciteit aan een energieopslagfaciliteit is onder
    // voorwaarden geen belaste levering, om dubbele heffing in de keten te voorkomen. Harde
    // voorwaarde uit de memorie: de exploitant beschikt over een GROOTVERBRUIKAANSLUITING, en
    // overlegt een verklaring aan de leverancier. Nadere voorwaarden bij AMvB — vandaar een
    // schakelaar in plaats van een vaste aanname.
    {key:'opslagVrijstelling', label:'Vrijstelling opslag (1 = ja)', eenheid:'', def:1},
    {key:'grootverbruik',      label:'Grootverbruikaansluiting (1 = ja)', eenheid:'', def:1},
    {key:'voorspelAfslag_pct', label:'Afslag onvolmaakte vooruitblik', eenheid:'%', def:15},
    // Nettarief voor de piekwaarde. Verwijst naar ST in tarieven.js, zodat er één bron van
    // waarheid blijft voor de transporttarieven: kc = gecontracteerd vermogen (EUR/kW/maand),
    // km = maandpiek (EUR/kW/maand). Bij Trafo MS/LS samen ~84 EUR/kW/jaar.
    {key:'netTariefType', label:'Nettarieftype', eenheid:'', def:'TrafoMSLS'},
    // Beleidskeuze, geen techniek: mag de accu ook van het net laden? Economisch loont dat vaak
    // (bij negatieve prijzen krijg je betaald om te laden), maar wie de accu neerzet om eigen
    // zonnestroom te verschuiven wil dat misschien uitsluiten. De schakelaar maakt het verschil
    // meetbaar in plaats van dat het een aanname blijft.
    {key:'alleenEigenOverschot', label:'Alleen uit eigen overschot laden (1 = ja)', eenheid:'', def:0}
  ];

  function defaults() {
    var o = {};
    VELDEN.forEach(function (v) { o[v.key] = v.def; });
    o.id = 'accu-' + Math.random().toString(36).slice(2, 8);
    return o;
  }

  function _lees(cfg) {
    var c = cfg || {};
    function n(k, d) { var v = +c[k]; return isFinite(v) ? v : d; }
    var kWh = Math.max(0, n('kWh', 0));
    var socMin = kWh * n('socMin_pct', 5) / 100;
    var socMax = kWh * n('socMax_pct', 95) / 100;
    return {
      id: c.id || 'accu', naam: c.naam || 'Accu', eigenaar: c.eigenaar || 'groep',
      kostenDrager: c.kostenDrager || 'platform',
      kWh: kWh, kW: Math.max(0, n('kW', 0)),
      etaLaad: n('etaLaad_pct', 94) / 100, etaOntlaad: n('etaOntlaad_pct', 94) / 100,
      socMin: socMin, socMax: Math.max(socMin, socMax),
      bruikbaar: Math.max(0, socMax - socMin),
      capexKwh: n('capex_kwh', 0), opexKwhJr: n('opex_kwh_jr', 0),
      levensduurJr: Math.max(1, n('levensduur_jr', 15)),
      cyclusleven: Math.max(1, n('cyclusleven', 6000)),
      afnameOpslag: n('afnameOpslag_mwh', 0) / 1000,
      terugleverAfslag: n('terugleverAfslag_mwh', 0) / 1000,
      ebPerKwh: n('eb_kwh', 0),
      // De vrijstelling geldt alleen bij een grootverbruikaansluiting.
      grootverbruik: c.grootverbruik == null ? true : (!!c.grootverbruik && c.grootverbruik !== '0'),
      opslagVrijstelling: (c.opslagVrijstelling == null ? true : (!!c.opslagVrijstelling && c.opslagVrijstelling !== '0'))
                          && (c.grootverbruik == null ? true : (!!c.grootverbruik && c.grootverbruik !== '0')),
      voorspelAfslag: n('voorspelAfslag_pct', 0) / 100,
      alleenEigenOverschot: !!c.alleenEigenOverschot && c.alleenEigenOverschot !== '0',
      netTariefType: c.netTariefType || 'TrafoMSLS',
      kcPerKwMnd: _netTarief(c.netTariefType, 'kc'),
      kmPerKwMnd: _netTarief(c.netTariefType, 'km')
    };
  }

  /**
   * Marginaal EB-tarief voor een aansluiting: het staffeltarief van de schijf waarin het
   * jaarverbruik van díe aansluiting valt. Energiebelasting is degressief per aansluiting, dus
   * een extra kWh op een grootverbruiker is fiscaal veel goedkoper dan op een kleinverbruiker.
   * Dat maakt het uit achter wélke meter de accu staat — niet alleen óf hij achter een meter staat.
   */
  function marginaalEbTarief(jaarAfnameKwh, jaar) {
    var R = global.REKEN_DEFAULTS;
    if (!R || !R.energiebelasting) return 0;
    var staffel = (R.energiebelasting.staffels && R.energiebelasting.staffels[jaar]) ||
                  R.energiebelasting.staffel;
    var v = Math.max(0, +jaarAfnameKwh || 0);
    for (var i = 0; i < staffel.length; i++) {
      if (v <= staffel[i].tot) return staffel[i].tarief;
    }
    return staffel[staffel.length - 1].tarief;
  }

  /** Transporttarief uit ST (tarieven.js); 0 als de tabel er niet is of het type onbekend. */
  function _netTarief(type, veld) {
    var tabel = global.ST;
    if (!tabel || !tabel[type]) return 0;
    return +tabel[type][veld] || 0;
  }

  /**
   * Marginale kosten per kWh doorzet (EUR/kWh, aan de accuzijde).
   * Alleen degradatie telt: capex is verzonken, opex is grotendeels tijdgebonden. Eén cyclus
   * verbruikt 1/cyclusleven van de accu, dus per kWh doorzet is dat capex/(cyclusleven × bruikbaar).
   * Dit is de prijs van een VOLLEDIGE cyclus (laden + ontladen samen). In de dispatch wordt daarom
   * de helft op het laadbeen en de helft op het ontlaadbeen geboekt — anders telt de slijtage dubbel.
   * Is de accu kalendergebonden in plaats van cyclusgebonden (het cyclusbudget wordt binnen de
   * kalenderlevensduur toch niet opgemaakt), dan is dit getal een bovengrens.
   */
  function marginaleKosten(a) {
    if (!a.bruikbaar || !a.cyclusleven) return 0;
    return a.capexKwh * a.kWh / (a.cyclusleven * a.bruikbaar);
  }

  // ─── Prijssignaal per kwartier ──────────────────────────────────────────────

  /**
   * Zet de modelrijen om in wat de accu per kwartier ziet:
   *   prijsAfname  wat de groep betaalt voor een kWh van het net  (EPEX + opslag + EB)
   *   prijsExport  wat de groep krijgt voor een kWh naar het net  (EPEX − afslag)
   *   overschot    kWh dat dit kwartier zonder accu geëxporteerd zou worden
   *   tekort       kWh dat dit kwartier zonder accu ingekocht zou worden
   *
   * Het verschil tussen prijsAfname en prijsExport is de wig die de accu gratis meekrijgt
   * bovenop de EPEX-spread — laden uit overschot kost alleen de gemiste exportopbrengst.
   */
  function bouwSignaal(modelRows, a, gastheer, o_aandeelEigen) {
    var n = modelRows.length;
    var sig = {
      tijdKey: new Array(n), prijsAfname: new Float64Array(n), prijsExport: new Float64Array(n),
      prijsLadenVanNet: new Float64Array(n),
      overschot: new Float64Array(n), tekort: new Float64Array(n), epex: new Float64Array(n),
      netto: new Float64Array(n)
    };

    // Waar de accu fysiek staat bepaalt de fiscale positie:
    //   'groep'      één gezamenlijke aansluiting (energiehub): de groepspositie telt, en
    //                ontladen vervangt afname van de hub, dus EB wordt vermeden.
    //   <deelnemer>  achter de meter van één bedrijf: alléén het eigen overschot van díe
    //                aansluiting is EB-vrij. Zonnestroom van een ánder bedrijf reist over het
    //                net en is dus levering — daar is EB over verschuldigd.
    //   'platform'   eigen aansluiting: er is geen achterliggend verbruik, dus laden is altijd
    //                netafname (EB verschuldigd) en ontladen altijd teruglevering (geen EB
    //                vermeden). Fiscaal de ongunstigste positie.
    // Energiebelasting, twee regimes:
    //
    //  MET vrijstelling (Belastingplan 2022, grootverbruik + verklaring):
    //    Laden van het net is GEEN belaste levering. De heffing verschuift naar de levering
    //    verderop in de keten. Wordt de opgeslagen stroom later door de gastheer verbruikt, dan
    //    is dat belast eigen verbruik — opslaan zelf niet, maar verbruiken wel. Ten opzichte van
    //    geen accu betaal je dan even veel EB: één keer. Er is dus GEEN vermeden EB op netstroom.
    //    Alleen stroom uit eigen opwek achter dezelfde meter levert echt voordeel op: die was
    //    nooit belast en vervangt bij ontlading wél belaste netafname.
    //
    //  ZONDER vrijstelling (de situatie die de wet repareert):
    //    dubbele heffing — EB bij laden én EB op het verbruik verderop. Dat is het oude beeld.
    //
    // aandeelEigen = welk deel van de opgeslagen energie uit eigen overschot komt. De accu is
    // een mengvat, dus het marginale EB-voordeel van ontladen is dat aandeel maal het tarief.
    var eigenAansluiting = a.eigenaar === 'platform';
    var aandeelEigen = o_aandeelEigen == null ? 1 : Math.max(0, Math.min(1, o_aandeelEigen));
    // Vangnet: bouwSignaal is ook los aanroepbaar en dan heeft dispatch() het effectieve
    // EB-tarief nog niet gezet. Zonder deze val worden alle prijzen NaN.
    var ebTarief   = isFinite(a.ebEffectief) ? a.ebEffectief : 0;
    var ebLaden    = a.opslagVrijstelling ? 0 : ebTarief;
    var ebVermeden = eigenAansluiting ? 0
                   : a.opslagVrijstelling ? ebTarief * aandeelEigen
                                          : ebTarief;

    for (var i = 0; i < n; i++) {
      var m = modelRows[i];
      var epex = +m.epex_eur_per_kWh || 0;
      sig.tijdKey[i] = m.tijdKey;
      sig.epex[i]    = epex;

      var netto;
      if (eigenAansluiting) netto = 0;                       // geen achterliggend verbruik
      else if (gastheer)    netto = +gastheer[i] || 0;       // netpositie van die ene aansluiting
      else                  netto = (+m.tekort_kWh || 0) - (+m.overschot_kWh || 0);

      sig.netto[i]     = netto;
      sig.tekort[i]    = Math.max(0, netto);
      sig.overschot[i] = Math.max(0, -netto);
      // Waarde van een kWh die niet van het net hoeft te komen.
      sig.prijsAfname[i]      = epex + a.afnameOpslag + ebVermeden;
      // Prijs van een kWh die de accu wél van het net betrekt.
      sig.prijsLadenVanNet[i] = epex + a.afnameOpslag + ebLaden;
      sig.prijsExport[i]      = epex - a.terugleverAfslag;
    }
    sig.ebLaden = ebLaden;
    sig.ebVermeden = ebVermeden;
    sig.aandeelEigen = aandeelEigen;
    return sig;
  }

  /** Opbrengst (EUR) van acKwh ontladen in kwartier i — eerst tekort dekken, dan exporteren. */
  function _opbrengstOntladen(sig, i, acKwh) {
    var naarTekort = Math.min(acKwh, sig.tekort[i]);
    var naarNet    = acKwh - naarTekort;
    return naarTekort * sig.prijsAfname[i] + naarNet * sig.prijsExport[i];
  }

  /** Kosten (EUR) van acKwh laden in kwartier i — eerst overschot benutten, dan van het net. */
  function _kostenLaden(sig, i, acKwh, a) {
    var uitOverschot = Math.min(acKwh, sig.overschot[i]);
    var vanNet       = acKwh - uitOverschot;
    // Uit het eigen overschot van de aansluiting: alleen de gemiste exportopbrengst, geen EB.
    // Alles daarboven komt over het net binnen en is dus levering, inclusief EB.
    return uitOverschot * sig.prijsExport[i] + vanNet * sig.prijsLadenVanNet[i];
  }

  // ─── Dispatch: DP over gediscretiseerde SoC ─────────────────────────────────

  /**
   * Optimale inzet bij volledige vooruitblik.
   * niveaus = aantal SoC-stappen (meer = fijner en trager). Retourneert het volledige
   * verloop plus de kengetallen die de businesscase nodig heeft.
   */
  function dispatch(modelRows, cfg, opties) {
    var a = _lees(cfg);
    var o = opties || {};
    var gastheer = o.gastheer || null;
    // Effectief EB-tarief: expliciet ingevuld, anders het marginale staffeltarief van de
    // aansluiting waarachter de accu staat. Zonder gastheerprofiel valt hij terug op het
    // groepsverbruik; dat is een schatting en staat als zodanig in het resultaat.
    a.ebGrondslagKwh = _jaarAfname(modelRows, gastheer);
    a.ebAfgeleid     = !(a.ebPerKwh > 0);
    a.ebEffectief    = a.ebPerKwh > 0 ? a.ebPerKwh
                     : marginaalEbTarief(a.ebGrondslagKwh, o.ebJaar || 2025);
    if (!a.kWh || !a.kW || !a.bruikbaar || !modelRows.length) return _leegResultaat(a, modelRows);

    // Het EB-voordeel van ontladen hangt af van welk deel van de voorraad uit eigen opwek komt,
    // en dat volgt zelf uit de dispatch. Eén grove voorpass schat dat aandeel; daarmee draait de
    // echte pass met een consistent prijssignaal. Een vaste aanname zou de dispatch scheeftrekken
    // richting ontladen in eigen verbruik.
    var aandeelEigen = o.aandeelEigen;
    if (aandeelEigen == null && !o.geenVoorpass && a.eigenaar !== 'platform' && a.opslagVrijstelling) {
      var voor = dispatch(modelRows, cfg, {fijnheid: 4, gastheer: gastheer,
                                           aandeelEigen: 1, geenVoorpass: true});
      var totIn = voor.inUitOverschot_kWh + voor.inVanNet_kWh;
      aandeelEigen = totIn > 0 ? voor.inUitOverschot_kWh / totIn : 1;
    }

    var sig  = bouwSignaal(modelRows, a, gastheer, aandeelEigen);
    var T    = modelRows.length;
    var mk   = marginaleKosten(a);
    var maxAc = a.kW * DT;                         // max kWh per kwartier aan de AC-zijde

    // Rasterresolutie schaalt mee met het vermogen. De SoC-stap moet ruim kleiner zijn dan wat
    // de accu in één kwartier kan verzetten, anders kan hij zijn vermogen niet volledig benutten
    // (met een grove stap valt 2,6 "stappen per kwartier" terug op 2 en verdwijnt een kwart van
    // het vermogen). Een vast aantal niveaus zou grotere accu's systematisch benadelen en de
    // sizing-sweep vertekenen.
    // Fijnheidsfactor: hoeveel SoC-stappen passen er in wat de accu in één kwartier verzet.
    // Convergentietest op een heel jaar: factor 8 blijft ~3% onder de uitkomst bij factor 16,
    // factor 16 zit binnen ~0,3% van factor 22. 16 is dus de werkzame ondergrens voor een
    // businesscase; de sweep draait bewust op 8 omdat daar de vergelijking tussen maten telt
    // en alle maten dezelfde (kleine) onderschatting delen.
    var factor  = o.fijnheid || 16;
    var niveaus = o.niveaus || Math.round(factor * a.bruikbaar / Math.max(1e-9, maxAc));
    niveaus = Math.max(12, Math.min(256, niveaus));
    var stap = a.bruikbaar / niveaus;              // kWh per SoC-stap (accuzijde)
    var S    = niveaus + 1;

    // Bereikbare stappen: naar boven afronden zodat geen haalbare toestand buiten beeld valt —
    // de expliciete vermogenscontrole in de lus verwerpt wat werkelijk niet kan.
    var maxOp   = Math.max(1, Math.ceil(maxAc * a.etaLaad / stap));
    var maxNeer = Math.max(1, Math.ceil(maxAc / Math.max(1e-9, a.etaOntlaad) / stap));

    // Piekbegrenzing: per kwartier een maximum op de netafname (kWh). Overschrijding wordt
    // beprijsd in plaats van verboden — een gecontracteerd vermogen overschrijden is in
    // Nederland duur, niet onmogelijk, en een harde grens zou de DP onoplosbaar kunnen maken
    // in kwartieren waarin de accu leeg is.
    var piekCap  = o.piekCap || null;                 // Float64Array kWh per kwartier, of null
    var piekStraf = o.piekStraf != null ? o.piekStraf : 5;   // EUR per kWh boven de cap

    var NEG = -1e18;
    var vorig  = new Float64Array(S).fill(NEG);
    var huidig = new Float64Array(S);
    vorig[0] = 0;                                   // start leeg (socMin)
    var keuze = new Int16Array(T * S);

    for (var t = 0; t < T; t++) {
      huidig.fill(NEG);
      var basis = t * S;
      for (var s = 0; s < S; s++) {
        if (vorig[s] === NEG) continue;
        var v0 = vorig[s];
        var lo = Math.max(0, s - maxNeer), hi = Math.min(S - 1, s + maxOp);
        for (var s2 = lo; s2 <= hi; s2++) {
          var dE = (s2 - s) * stap;                 // verandering binnen de accu
          var w, acNet = 0;
          if (dE > 0) {
            var acIn = dE / a.etaLaad;
            if (acIn > maxAc + 1e-9) continue;
            // Alleen uit eigen overschot: laden boven wat er dit kwartier over is, is verboden.
            if (a.alleenEigenOverschot && acIn > sig.overschot[t] + 1e-9) continue;
            acNet = acIn;
            w = v0 - _kostenLaden(sig, t, acIn, a) - dE * mk * 0.5;
          } else if (dE < 0) {
            var acUit = -dE * a.etaOntlaad;
            if (acUit > maxAc + 1e-9) continue;
            acNet = -acUit;
            w = v0 + _opbrengstOntladen(sig, t, acUit) + dE * mk * 0.5;   // dE<0 → kosten
          } else {
            w = v0;
          }
          if (piekCap) {
            var afn = sig.netto[t] + acNet;
            if (afn > piekCap[t]) w -= (afn - piekCap[t]) * piekStraf;
          }
          if (w > huidig[s2]) { huidig[s2] = w; keuze[basis + s2] = s; }
        }
      }
      var wissel = vorig; vorig = huidig; huidig = wissel;
    }

    // Beste eindtoestand terugzoeken
    var eind = 0;
    for (var e = 1; e < S; e++) if (vorig[e] > vorig[eind]) eind = e;

    var pad = new Int16Array(T + 1);
    pad[T] = eind;
    for (var t2 = T - 1; t2 >= 0; t2--) pad[t2] = keuze[t2 * S + pad[t2 + 1]];

    var uitkomst = _verwerkPad(pad, sig, a, stap, S, T, mk, modelRows, piekCap, piekStraf);
    uitkomst.niveaus = niveaus;
    return uitkomst;
  }

  /** Maandpiek (kW) van de netafname, met en zonder accu. */
  function _maandPieken(sig, acProfiel) {
    var metAccu = {}, zonder = {};
    for (var i = 0; i < sig.netto.length; i++) {
      var mn = String(sig.tijdKey[i]).slice(0, 7);
      var basis = Math.max(0, sig.netto[i]) / DT;
      // acProfiel: + = ontladen (verlaagt de afname), − = laden (verhoogt hem)
      var met = Math.max(0, sig.netto[i] - (acProfiel ? acProfiel[i] : 0)) / DT;
      if (!(mn in zonder) || basis > zonder[mn]) zonder[mn] = basis;
      if (!(mn in metAccu) || met > metAccu[mn]) metAccu[mn] = met;
    }
    return {metAccu: metAccu, zonder: zonder};
  }

  function _verwerkPad(pad, sig, a, stap, S, T, mk, modelRows, piekCap, piekStraf) {
    var acProfiel = new Float64Array(T);   // + = ontladen (levert), − = laden (neemt af)
    var socKwh    = new Float64Array(T);
    var doorzetUit = 0, doorzetIn = 0;
    var opbrengst = 0, kosten = 0, degradatie = 0;
    var uitTekort = 0, uitNet = 0, inOverschot = 0, inNet = 0;
    var kwartVol = 0, kwartLeeg = 0, kwartVermogen = 0, kwartActief = 0;
    var straf = 0, kwartBovenCap = 0;
    // Waarom bleef beschikbaar overschot of tekort onbenut? Zonder dit antwoord blijft een
    // uitkomst als "er ging weinig zon de accu in" een raadsel, terwijl de reden meestal
    // eenvoudig is: de accu zat vol, zat op zijn vermogen, of het loonde simpelweg niet.
    var beschOverschot = 0, beschTekort = 0;
    var gemistVol = 0, gemistVermogen = 0, gemistOnrendabel = 0;
    var gemistLeeg = 0, gemistVermogenUit = 0, gemistOnrendabelUit = 0;
    var maxAc = a.kW * DT;

    for (var t = 0; t < T; t++) {
      var dE = (pad[t + 1] - pad[t]) * stap;
      socKwh[t] = a.socMin + pad[t + 1] * stap;
      if (dE > 0) {
        var acIn = dE / a.etaLaad;
        var uitO = Math.min(acIn, sig.overschot[t]);
        inOverschot += uitO; inNet += acIn - uitO;
        kosten += _kostenLaden(sig, t, acIn, a);
        degradatie += dE * mk * 0.5; doorzetIn += acIn;
        acProfiel[t] = -acIn; kwartActief++;
        if (acIn > maxAc - 1e-6) kwartVermogen++;
      } else if (dE < 0) {
        var acUit = -dE * a.etaOntlaad;
        var naarT = Math.min(acUit, sig.tekort[t]);
        uitTekort += naarT; uitNet += acUit - naarT;
        opbrengst += _opbrengstOntladen(sig, t, acUit);
        degradatie += -dE * mk * 0.5; doorzetUit += acUit;
        acProfiel[t] = acUit; kwartActief++;
        if (acUit > maxAc - 1e-6) kwartVermogen++;
      }
      // Strafkosten voor netafname boven de cap: dezelfde term als in de DP-doelfunctie, zodat
      // de gerapporteerde marge optelt met waarop geoptimaliseerd is.
      if (piekCap) {
        // acProfiel is + bij ontladen en − bij laden; de DP rekent met het omgekeerde teken.
        var afn = sig.netto[t] - acProfiel[t];
        if (afn > piekCap[t]) { straf += (afn - piekCap[t]) * piekStraf; kwartBovenCap++; }
      }
      // Onbenut overschot en tekort classificeren.
      var maxAcQ = a.kW * DT;
      var socNa = pad[t + 1], socVoor = pad[t];
      beschOverschot += sig.overschot[t];
      beschTekort    += sig.tekort[t];
      var restOverschot = sig.overschot[t] - Math.max(0, -acProfiel[t]);
      if (restOverschot > 1e-9) {
        if (socNa >= S - 1)                        gemistVol += restOverschot;
        else if (Math.max(0, -acProfiel[t]) > maxAcQ - 1e-6) gemistVermogen += restOverschot;
        else                                        gemistOnrendabel += restOverschot;
      }
      var restTekort = sig.tekort[t] - Math.max(0, acProfiel[t]);
      if (restTekort > 1e-9) {
        if (socNa <= 0)                            gemistLeeg += restTekort;
        else if (Math.max(0, acProfiel[t]) > maxAcQ - 1e-6) gemistVermogenUit += restTekort;
        else                                        gemistOnrendabelUit += restTekort;
      }
      if (pad[t + 1] >= S - 1) kwartVol++;
      if (pad[t + 1] <= 0)     kwartLeeg++;
    }

    var pieken = _maandPieken(sig, acProfiel);
    var maanden = Object.keys(pieken.zonder).sort();
    var piekMet = 0, piekZonder = 0;
    maanden.forEach(function (mn) {
      if (pieken.metAccu[mn] > piekMet) piekMet = pieken.metAccu[mn];
      if (pieken.zonder[mn] > piekZonder) piekZonder = pieken.zonder[mn];
    });

    // De piekstraf stuurt de DP naar een lagere piek, maar wordt NIET aan de businesscase
    // toegerekend: hij is een zoekparameter, geen factuur. Wat piekverlaging werkelijk kost is
    // de arbitragemarge die erdoor wegvalt, en die zit al in opbrengst/kosten. Gewaardeerd wordt
    // op de BEREIKTE piek, niet op de bedoelde cap.
    var marge = opbrengst - kosten - degradatie;
    var margeNaAfslag = marge * (1 - a.voorspelAfslag);
    // Equivalente volledige cycli: totale doorzet binnen de accu gedeeld door de bruikbare
    // capaciteit. Eén cyclus = één keer de bruikbare capaciteit in én uit.
    var cycli = a.bruikbaar > 0 ? (doorzetIn * a.etaLaad) / a.bruikbaar : 0;

    return {
      accu: a, marginaleKostenPerKwh: mk, niveaus: 0,
      acProfiel: acProfiel, socKwh: socKwh, tijdKey: sig.tijdKey,
      doorzetUit_kWh: doorzetUit, doorzetIn_kWh: doorzetIn,
      opbrengst_EUR: opbrengst, kosten_EUR: kosten, degradatie_EUR: degradatie,
      marge_EUR: marge, margeNaAfslag_EUR: margeNaAfslag,
      cycli: cycli,
      uitNaarTekort_kWh: uitTekort, uitNaarNet_kWh: uitNet,
      inUitOverschot_kWh: inOverschot, inVanNet_kWh: inNet,
      // Energiebelasting is bij een accu vaak de grootste post. Betaald over alles wat van het
      // net komt (ook zonnestroom van een andere deelnemer — die reist over het net en is dus
      // levering), vermeden over alles wat achter dezelfde meter wordt afgeleverd.
      ebBetaald_EUR: inNet * (sig.ebLaden || 0),
      ebVermeden_EUR: uitTekort * (sig.ebVermeden || 0),
      ebTarief_EUR_kWh: a.ebEffectief || 0,
      ebLadenTarief_EUR_kWh: sig.ebLaden || 0,
      ebVermedenTarief_EUR_kWh: sig.ebVermeden || 0,
      aandeelEigenOpwek: sig.aandeelEigen == null ? 1 : sig.aandeelEigen,
      opslagVrijstelling: !!a.opslagVrijstelling,
      kwartierenVol: kwartVol, kwartierenLeeg: kwartLeeg,
      kwartierenOpVermogen: kwartVermogen, kwartierenActief: kwartActief,
      piekStraf_EUR: straf, kwartierenBovenCap: kwartBovenCap,
      benutting: {
        beschikbaarOverschot_kWh: beschOverschot, opgenomen_kWh: inOverschot,
        gemistOmdatVol_kWh: gemistVol, gemistOpVermogen_kWh: gemistVermogen,
        gemistOnrendabel_kWh: gemistOnrendabel,
        beschikbaarTekort_kWh: beschTekort, gedekt_kWh: uitTekort,
        gemistOmdatLeeg_kWh: gemistLeeg, gemistOpVermogenUit_kWh: gemistVermogenUit,
        gemistOnrendabelUit_kWh: gemistOnrendabelUit
      },
      maandpiekMetAccu: pieken.metAccu, maandpiekZonderAccu: pieken.zonder,
      jaarpiekMetAccu_kW: piekMet, jaarpiekZonderAccu_kW: piekZonder,
      periodeDagen: _dagen(modelRows)
    };
  }

  function _leegResultaat(a, modelRows) {
    return {accu: a, marginaleKostenPerKwh: 0, acProfiel: [], socKwh: [], tijdKey: [],
      doorzetUit_kWh: 0, doorzetIn_kWh: 0, opbrengst_EUR: 0, kosten_EUR: 0, degradatie_EUR: 0,
      marge_EUR: 0, margeNaAfslag_EUR: 0, cycli: 0,
      uitNaarTekort_kWh: 0, uitNaarNet_kWh: 0, inUitOverschot_kWh: 0, inVanNet_kWh: 0,
      kwartierenVol: 0, kwartierenLeeg: 0, kwartierenOpVermogen: 0, kwartierenActief: 0,
      periodeDagen: _dagen(modelRows || [])};
  }

  /** Jaarafname (kWh) van de aansluiting waarachter de accu staat — grondslag voor de EB-schijf. */
  function _jaarAfname(modelRows, gastheer) {
    var som = 0, n = modelRows.length;
    for (var i = 0; i < n; i++) {
      som += gastheer ? Math.max(0, +gastheer[i] || 0) : Math.max(0, +modelRows[i].tekort_kWh || 0);
    }
    var dagen = _dagen(modelRows);
    return dagen > 0 ? som * 365 / dagen : som;
  }

  function _dagen(rows) {
    if (!rows || rows.length < 2) return rows && rows.length ? 1 : 0;
    var eerste = rows[0].tijdKey, laatste = rows[rows.length - 1].tijdKey;
    var d = (new Date(laatste) - new Date(eerste)) / 86400000 + DT / 24;
    return d > 0 ? d : rows.length / 96;
  }

  // ─── SoC-duurkromme ─────────────────────────────────────────────────────────

  /** Gesorteerd SoC-verloop in %, voor de duurkromme. */
  function socDuurkromme(res, punten) {
    var n = res.socKwh.length;
    if (!n || !res.accu.kWh) return [];
    var pct = Array.prototype.slice.call(res.socKwh).map(function (k) { return k / res.accu.kWh * 100; });
    pct.sort(function (x, y) { return y - x; });
    var uit = [], P = Math.min(punten || 200, n);
    for (var i = 0; i < P; i++) uit.push({pct: i / (P - 1) * 100, soc: pct[Math.floor(i / (P - 1) * (n - 1))]});
    return uit;
  }

  // ─── Businesscase ───────────────────────────────────────────────────────────

  /**
   * Zet de gerealiseerde marge naast de kosten van de accu.
   * Kern: de LCOS wordt hier teruggerekend met het WERKELIJK gehaalde cyclusaantal, niet met
   * de aanname. Wijken die ver uiteen, dan klopt de kostprijs in het aannameregister niet.
   */
  function businesscase(res, opties) {
    var a = res.accu, o = opties || {};
    var disconto = (o.discontoPct != null ? +o.discontoPct : 5) / 100;
    var jaarFactor = res.periodeDagen > 0 ? 365 / res.periodeDagen : 0;

    var capex   = a.capexKwh * a.kWh;
    var opexJr  = a.opexKwhJr * a.kWh;
    // Piekwaarde uit piekAnalyse() telt mee als tweede waardestroom. Zonder dit toont de
    // businesscase alleen arbitrage en onderschat hij de accu systematisch — bij Nederlandse
    // transporttarieven is de piekterm vaak dezelfde orde als de arbitragemarge.
    var piekJr  = (+o.piekWaardePerJaar_EUR || 0);
    // Een accu met een EIGEN aansluiting heeft ook een eigen gecontracteerd vermogen nodig,
    // ter grootte van zijn laad-/ontlaadvermogen. Bij Nederlandse transporttarieven is dat een
    // forse vaste post die de businesscase van een losstaande accu grotendeels bepaalt.
    // Achter een bestaande meter valt die kost weg: daar deelt de accu de aansluiting.
    var eigenAansluitingJr = (a.eigenaar === 'platform' && o.eigenAansluitingKosten !== false)
      ? a.kW * (a.kcPerKwMnd + a.kmPerKwMnd) * 12 : 0;
    var arbitrageJr = res.margeNaAfslag_EUR * jaarFactor;
    var margeJr = arbitrageJr + piekJr;
    var nettoJr = margeJr - opexJr - eigenAansluitingJr;
    var cycliJr = res.cycli * jaarFactor;
    var uitJr   = res.doorzetUit_kWh * jaarFactor;

    // Annuïteit (kapitaalherstelfactor) over de kalenderlevensduur
    var crf = disconto > 0
      ? disconto / (1 - Math.pow(1 + disconto, -a.levensduurJr))
      : 1 / a.levensduurJr;
    var kapitaalJr = capex * crf;

    // Gerealiseerde LCOS: alle kosten per werkelijk afgeleverde kWh.
    var lcosGerealiseerd = uitJr > 0 ? (kapitaalJr + opexJr) / uitJr : Infinity;
    var margePerKwh      = uitJr > 0 ? margeJr / uitJr : 0;

    // Cyclusleven versus kalenderleven: welke is bindend bij dit gebruik?
    var jarenTotCyclusEinde = cycliJr > 0 ? a.cyclusleven / cycliJr : Infinity;
    var bindend = jarenTotCyclusEinde < a.levensduurJr ? 'cycli' : 'kalender';
    var effectieveLevensduur = Math.min(a.levensduurJr, jarenTotCyclusEinde);

    // NPV en terugverdientijd op de netto jaarmarge
    var npv = -capex;
    for (var j = 1; j <= Math.floor(effectieveLevensduur); j++) npv += nettoJr / Math.pow(1 + disconto, j);
    var terugverdientijd = nettoJr > 0 ? capex / nettoJr : Infinity;

    return {
      capex_EUR: capex, opexPerJaar_EUR: opexJr, kapitaallastPerJaar_EUR: kapitaalJr,
      arbitragePerJaar_EUR: arbitrageJr, piekwaardePerJaar_EUR: piekJr,
      eigenAansluitingPerJaar_EUR: eigenAansluitingJr,
      ebTarief_EUR_kWh: a.ebEffectief || 0, ebAfgeleid: !!a.ebAfgeleid,
      ebGrondslagKwh: a.ebGrondslagKwh || 0,
      margePerJaar_EUR: margeJr, nettoPerJaar_EUR: nettoJr,
      cycliPerJaar: cycliJr, afgeleverdPerJaar_kWh: uitJr,
      lcosGerealiseerd_EUR_kWh: lcosGerealiseerd,
      margePerKwh_EUR: margePerKwh,
      dekt: margePerKwh >= lcosGerealiseerd,
      bindendeLevensduur: bindend, effectieveLevensduur_jr: effectieveLevensduur,
      jarenTotCyclusEinde: jarenTotCyclusEinde,
      npv_EUR: npv, terugverdientijd_jr: terugverdientijd,
      rendabelBijCapex_EUR_kWh: _capexDrempel(margeJr, opexJr + eigenAansluitingJr, a, crf)
    };
  }

  /** Bij welke capex per kWh is de netto jaarmarge precies gelijk aan de kapitaallast? */
  function _capexDrempel(margeJr, opexJr, a, crf) {
    var ruimte = margeJr - opexJr;
    if (ruimte <= 0 || !a.kWh || !crf) return 0;
    return ruimte / crf / a.kWh;
  }

  // ─── Piekreductie (gecontracteerd vermogen en kW-max) ───────────────────────

  /**
   * Waarde van piekverlaging naast de energie-arbitrage — en het conflict tussen die twee.
   * Een accu die SoC vrijhoudt om de avondpiek af te toppen, kan die energie niet gebruiken
   * voor arbitrage. Deze functie maakt die ruil zichtbaar in plaats van één van beide te kiezen.
   *
   * Nederlandse tariefstructuur (zie ST in tarieven.js):
   *   kc  EUR/kW/maand op het GECONTRACTEERDE vermogen — bespaar je pas als je hercontracteert,
   *       en dan bepaalt de hoogste maandpiek van het jaar wat haalbaar is.
   *   km  EUR/kW/maand op de MAANDPIEK — bespaar je per maand, direct.
   * Bij Trafo MS/LS is dat samen ~84 EUR/kW/jaar; 100 kW piekverlaging is dan 8.400 EUR/jaar,
   * doorgaans een veelvoud van de arbitragemarge.
   *
   * Methode: de maandpieken zonder accu vormen de basislijn. Per reductiestap krijgt elke maand
   * een cap op een percentage van zijn eigen basispiek; de DP beprijst overschrijding. Zo is
   * elke maand zijn eigen probleem (km is per maand separabel) zonder de jaardispatch te breken.
   */
  function piekAnalyse(modelRows, cfg, opties) {
    var o = opties || {};
    var a = _lees(cfg);
    // Tarieven uit de accuconfiguratie, tenzij expliciet meegegeven (voor tests en scenario's).
    var kmPerKwMnd = o.kmTarief_kw_mnd != null ? +o.kmTarief_kw_mnd : a.kmPerKwMnd;
    var kcPerKwMnd = o.kcTarief_kw_mnd != null ? +o.kcTarief_kw_mnd : a.kcPerKwMnd;
    // Bij een eigen aansluiting is er geen gastheerpiek: de piek van die aansluiting wordt door
    // de accu zelf gemaakt en het bijbehorende contractvermogen staat al als vaste kostenpost in
    // de businesscase. Hier nogmaals een piekeffect rekenen zou dat dubbel tellen.
    if (a.eigenaar === 'platform') { kmPerKwMnd = 0; kcPerKwMnd = 0; }
    if (!a.kWh || !modelRows.length) return null;

    var gastheer = o.gastheer || null;
    a.ebEffectief = a.ebPerKwh > 0 ? a.ebPerKwh
                  : marginaalEbTarief(_jaarAfname(modelRows, gastheer), o.ebJaar || 2025);
    // Aandeel eigen opwek één keer schatten en over alle reductiestappen hergebruiken, zodat
    // de stappen onderling vergelijkbaar blijven en de voorpass niet vijf keer draait.
    var aandeelEigen = o.aandeelEigen;
    if (aandeelEigen == null && a.eigenaar !== 'platform' && a.opslagVrijstelling) {
      var voor0 = dispatch(modelRows, cfg, {fijnheid: 4, gastheer: gastheer,
                                            aandeelEigen: 1, geenVoorpass: true});
      var tIn = voor0.inUitOverschot_kWh + voor0.inVanNet_kWh;
      aandeelEigen = tIn > 0 ? voor0.inUitOverschot_kWh / tIn : 1;
    }
    var sig = bouwSignaal(modelRows, a, gastheer, aandeelEigen);
    var T = modelRows.length;

    // Basislijn: maandpieken zonder accu. Bij een accu achter de meter is dat de piek van díe
    // aansluiting — het vermogenstarief hangt aan de aansluiting, niet aan de groep.
    var basis = {};
    for (var i = 0; i < T; i++) {
      var mn = String(sig.tijdKey[i]).slice(0, 7);
      var kw = Math.max(0, sig.netto[i]) / DT;
      if (!(mn in basis) || kw > basis[mn]) basis[mn] = kw;
    }
    var maanden = Object.keys(basis).sort();
    var basisJaarpiek = maanden.reduce(function (m, k) { return Math.max(m, basis[k]); }, 0);
    var maandenInPeriode = Math.max(1, maanden.length);

    // Een accu op een eigen aansluiting heeft geen achterliggende piek om te verlagen: de piek
    // van die aansluiting wordt juist DOOR de accu gemaakt, en het bijbehorende contractvermogen
    // staat al als vaste kostenpost in de businesscase. Een cap op nul zou hem volledig blokkeren.
    var reducties = a.eigenaar === 'platform' ? [0] : (o.reducties || [0, 0.10, 0.20, 0.30, 0.40]);
    var curve = [];
    for (var r = 0; r < reducties.length; r++) {
      var red = reducties[r];
      // Ook bij reductie 0 geldt een cap, namelijk op de bestaande piek. Zonder die grens zou de
      // optimalisatie de piek vrij mogen optillen terwijl de waardering hem daar wél voor
      // afrekent — de accu zou dan gestraft worden voor iets wat hij niet kon zien aankomen.
      // Bij een eigen aansluiting bestaat die grens niet: daar maakt de accu de piek zelf en
      // staat het contractvermogen al als vaste post in de businesscase.
      var cap = null, straf = 5;
      if (a.eigenaar !== 'platform') {
        cap = new Float64Array(T);
        var nBoven = 0;
        for (var t = 0; t < T; t++) {
          cap[t] = basis[String(sig.tijdKey[t]).slice(0, 7)] * (1 - red) * DT;
          if (sig.netto[t] > cap[t]) nBoven++;
        }
        // Bewust een hoge strafprijs: de cap werkt daarmee als een bijna harde grens. Een straf
        // die de tariefwaarde over de overschrijdende kwartieren uitsmeert is verleidelijk maar
        // fout — je moet ÁLLE overschrijdingen wegnemen om de piek te verlagen, dus de waarde van
        // de laatste kWh is de volle tariefwaarde, niet een gemiddelde. Uitgeprobeerd: met de
        // uitgesmeerde variant stuurt de optimalisatie te zwak en laat ze de helft van de
        // haalbare piekwaarde liggen. De keuze tussen caps gebeurt daarna op de echte totalen.
        straf = 5;
      }
      var d = dispatch(modelRows, cfg, {fijnheid: o.fijnheid || 8, piekCap: cap, gastheer: gastheer,
                                        aandeelEigen: aandeelEigen, geenVoorpass: true,
                                        piekStraf: o.piekStraf != null ? o.piekStraf : straf});
      var jaarFactor = d.periodeDagen > 0 ? 365 / d.periodeDagen : 0;

      // km-effect: per maand het verschil tussen basispiek en bereikte piek. SYMMETRISCH — een
      // accu die laadt op een moment dat de aansluiting al belast is, VERHOOGT de piek en dus de
      // transportrekening. Alleen besparingen tellen zou plekken aanbevelen waar de accu de
      // netkosten van de gastheer juist opdrijft.
      var kmBesparing = 0;
      maanden.forEach(function (mn) {
        kmBesparing += (basis[mn] - (d.maandpiekMetAccu[mn] || 0)) * kmPerKwMnd;
      });
      // kc-effect: op de hoogste maandpiek van het jaar wordt het contractvermogen vastgesteld.
      // Gaat die omhoog, dan moet er bijgecontracteerd worden — ook dat is symmetrisch.
      var kcBesparing = (basisJaarpiek - d.jaarpiekMetAccu_kW) * kcPerKwMnd * maandenInPeriode;

      // Informatief: is de nagestreefde cap ook echt gehaald? Een kleine overschrijding is
      // rasterruis, een grote betekent dat de accu de piek niet aankan.
      var capKwDoel = basisJaarpiek * (1 - red);
      var capGehaald = d.jaarpiekMetAccu_kW <= capKwDoel * 1.01 + 1e-6;
      curve.push({
        reductie: red,
        capGehaald: capGehaald,
        kwartierenBovenCap: d.kwartierenBovenCap || 0,
        piekStraf_EUR: d.piekStraf_EUR || 0,
        capKw: basisJaarpiek * (1 - red),
        bereikteJaarpiek_kW: d.jaarpiekMetAccu_kW,
        arbitrageMarge_EUR: d.margeNaAfslag_EUR,
        kmBesparing_EUR: kmBesparing,
        kcBesparing_EUR: kcBesparing,
        totaal_EUR: d.margeNaAfslag_EUR + kmBesparing + kcBesparing,
        perJaar_EUR: (d.margeNaAfslag_EUR + kmBesparing + kcBesparing) * jaarFactor,
        cycli: d.cycli * jaarFactor,
        dispatch: d
      });
    }

    var beste = curve[0];
    curve.forEach(function (x) { if (x.totaal_EUR > beste.totaal_EUR) beste = x; });
    var alleenArbitrage = curve[0];

    return {
      basisJaarpiek_kW: basisJaarpiek, basisMaandpieken: basis,
      curve: curve, beste: beste,
      // Het conflict: wat kost de piekverlaging aan arbitragemarge, en wat levert ze op?
      capsNietGehaald: curve.filter(function (x) { return !x.capGehaald; })
                            .map(function (x) { return Math.round(x.capKw); }),
      conflict: {
        arbitrageVerlies_EUR: alleenArbitrage.arbitrageMarge_EUR - beste.arbitrageMarge_EUR,
        piekOpbrengst_EUR: beste.kmBesparing_EUR + beste.kcBesparing_EUR,
        nettoWinst_EUR: beste.totaal_EUR - alleenArbitrage.totaal_EUR,
        piekVerlaging_kW: basisJaarpiek - beste.bereikteJaarpiek_kW
      }
    };
  }

  // ─── Waar zet je de accu neer? ──────────────────────────────────────────────

  /**
   * Rekent dezelfde accu door op elke mogelijke plek en zet de uitkomsten naast elkaar.
   *
   * Waarom dit een aparte vraag is: waar de accu fysiek staat bepaalt drie dingen tegelijk.
   *   1. Welke stroom EB-vrij is. Alleen het overschot van de EIGEN aansluiting; zonnestroom
   *      van een andere deelnemer gaat over het net en is levering, met EB.
   *   2. Welk EB-tarief geldt. De staffel is degressief per aansluiting, dus achter een
   *      grootverbruiker is een extra kWh fiscaal veel goedkoper dan achter een kleine.
   *   3. Welke piek je verlaagt. Het vermogenstarief hangt aan de aansluiting van de gastheer.
   * Een losstaande accu heeft bovendien een eigen gecontracteerd vermogen nodig — een vaste
   * post die de businesscase meestal domineert.
   *
   * kandidaten = [{id, naam, netto}] met netto = kWh per kwartier op die aansluiting
   *              (positief = afname, negatief = teruglevering), uitgelijnd op modelRows.
   */
  function vergelijkGastheren(modelRows, cfg, kandidaten, opties) {
    var o = opties || {};
    var reducties = o.reducties || [0, 0.15, 0.30];
    var fijnheid  = o.fijnheid || 8;
    var disconto  = o.discontoPct != null ? o.discontoPct : 5;

    var plekken = [{id: 'groep', naam: 'Achter één gezamenlijke aansluiting', netto: null}]
      .concat((kandidaten || []).map(function (k) {
        return {id: k.id, naam: 'Achter de meter bij ' + k.naam, netto: k.netto};
      }))
      .concat([{id: 'platform', naam: 'Eigen aansluiting', netto: null}]);

    var uit = plekken.map(function (plek) {
      var c = {}; for (var k in cfg) c[k] = cfg[k];
      c.eigenaar = plek.id;
      // Een accu op een eigen aansluiting is zelf marktpartij: die koopt en verkoopt rond EPEX
      // en betaalt geen leveranciersmarge of terugleverafslag. Achter een meter zit de accu wél
      // binnen het leveringscontract van de gastheer, dus daar geldt de wig wel. Zonder dit
      // onderscheid zou de losstaande accu onterecht dubbel benadeeld worden.
      if (plek.id === 'platform') { c.afnameOpslag_mwh = 0; c.terugleverAfslag_mwh = 0; }
      var pa = piekAnalyse(modelRows, c, {gastheer: plek.netto, reducties: reducties,
                                          fijnheid: fijnheid});
      var basis = pa ? pa.curve[0] : null;
      var best  = pa ? pa.beste : null;
      var d = best ? best.dispatch : dispatch(modelRows, c, {fijnheid: fijnheid, gastheer: plek.netto});
      var jf = d.periodeDagen > 0 ? 365 / d.periodeDagen : 0;
      var piekJr = best ? (best.kmBesparing_EUR + best.kcBesparing_EUR) * jf : 0;
      var bc = businesscase(d, {discontoPct: disconto, piekWaardePerJaar_EUR: piekJr});
      return {
        id: plek.id, naam: plek.naam,
        ebTarief_EUR_kWh: d.ebTarief_EUR_kWh || 0,
        ebGrondslagKwh: bc.ebGrondslagKwh || 0,
        geladenUitEigenOverschot_kWh: d.inUitOverschot_kWh * jf,
        geladenVanNet_kWh: d.inVanNet_kWh * jf,
        ebBetaald_EUR: (d.ebBetaald_EUR || 0) * jf,
        ebVermeden_EUR: (d.ebVermeden_EUR || 0) * jf,
        ebSaldo_EUR: ((d.ebVermeden_EUR || 0) - (d.ebBetaald_EUR || 0)) * jf,
        aandeelEigen: d.aandeelEigenOpwek == null ? 1 : d.aandeelEigenOpwek,
        opslagVrijstelling: !!d.opslagVrijstelling,
        arbitrage_EUR: bc.arbitragePerJaar_EUR,
        piekwaarde_EUR: piekJr,
        piekVerlaging_kW: pa ? pa.conflict.piekVerlaging_kW : 0,
        basisPiek_kW: pa ? pa.basisJaarpiek_kW : 0,
        eigenAansluiting_EUR: bc.eigenAansluitingPerJaar_EUR || 0,
        opex_EUR: bc.opexPerJaar_EUR,
        kapitaallast_EUR: bc.kapitaallastPerJaar_EUR,
        nettoPerJaar_EUR: bc.nettoPerJaar_EUR,
        npv_EUR: bc.npv_EUR,
        rendabelBijCapex_EUR_kWh: bc.rendabelBijCapex_EUR_kWh,
        cycliPerJaar: bc.cycliPerJaar
      };
    });

    var beste = uit[0];
    uit.forEach(function (x) { if (x.nettoPerJaar_EUR > beste.nettoPerJaar_EUR) beste = x; });
    return {plekken: uit, beste: beste, aannames: [
      'Achter één gezamenlijke aansluiting: geldt alleen als de deelnemers fysiek één aansluiting ' +
        'delen (energiehub). Zijn het losse aansluitingen, dan reist stroom tussen deelnemers over ' +
        'het net en is het levering — mét energiebelasting. Deze regel is dan te gunstig.',
      'Achter de meter bij een deelnemer: alleen het overschot van díe aansluiting is vrij van ' +
        'energiebelasting en transport. Zonnestroom van een andere deelnemer telt als netafname.',
      'Eigen aansluiting: doorgerekend als marktpartij (handel rond EPEX, geen leveranciersmarge), ' +
        'maar mét een eigen gecontracteerd vermogen ter grootte van het accuvermogen.',
      'Het energiebelastingtarief is het marginale staffeltarief bij het jaarverbruik van de ' +
        'betreffende aansluiting. Een extra kWh achter een grootverbruiker is fiscaal goedkoper ' +
        'dan achter een kleinverbruiker.'
    ]};
  }

  // ─── Sizing-sweep ───────────────────────────────────────────────────────────

  /**
   * Draait de dispatch over een raster van capaciteiten (en optioneel vermogens) en geeft per
   * stap de marginale waarde van de laatste kWh. Waar die onder de marginale kosten van extra
   * capaciteit zakt, houdt uitbreiden op. Dit is het eerlijke antwoord op "is er nog ruimte":
   * niet een verzonnen score, maar de waarde die een grotere accu extra zou opleveren.
   */
  function sweep(modelRows, cfg, opties) {
    var o = opties || {};
    var basis = _lees(cfg);
    var kWhLijst = o.kWhLijst || _raster(basis.kWh);
    var verhouding = basis.kWh > 0 ? basis.kW / basis.kWh : 0.5;   // C-rate vasthouden
    var disconto = (o.discontoPct != null ? +o.discontoPct : 5) / 100;
    var crf = disconto > 0
      ? disconto / (1 - Math.pow(1 + disconto, -basis.levensduurJr))
      : 1 / basis.levensduurJr;

    var uit = [], vorigeMarge = 0, vorigeKwh = 0;
    for (var i = 0; i < kWhLijst.length; i++) {
      var kWh = kWhLijst[i];
      var c = {}; for (var k in cfg) c[k] = cfg[k];
      c.kWh = kWh;
      if (o.vastVermogen == null) c.kW = Math.max(1, Math.round(kWh * verhouding));
      // Elke maat twee keer doorrekenen, op een grof en een fijner SoC-raster. Wijken de
      // uitkomsten meer dan de tolerantie af, dan is de DP voor die maat niet geconvergeerd en
      // is het getal geen sizing-advies waard. Dat gebeurt zodra de accu veel groter wordt dan
      // wat het dagpatroon kan vullen — precies waar de marginale waarde toch al ver onder de
      // marginale kosten ligt.
      var conv = _geconvergeerdeDispatch(modelRows, c, o);
      var r = conv.res, afwijking = conv.afwijking, betrouwbaar = conv.geconvergeerd;
      var jaarFactor = r.periodeDagen > 0 ? 365 / r.periodeDagen : 0;
      // Bruto marge (voor opex en kapitaallast). Opex hoort bij de KOSTENkant van de
      // vergelijking, niet bij de waarde — anders lijkt een grotere accu minder op te leveren
      // terwijl de bruto marge gewoon blijft stijgen.
      var brutoJr = r.margeNaAfslag_EUR * jaarFactor;
      var marginaal = kWh > vorigeKwh ? (brutoJr - vorigeMarge) / (kWh - vorigeKwh) : 0;
      var marginaleKosten = basis.capexKwh * crf + basis.opexKwhJr;
      uit.push({
        kWh: kWh, kW: c.kW,
        brutoMargePerJaar_EUR: brutoJr,
        nettoPerJaar_EUR: brutoJr - basis.opexKwhJr * kWh - basis.capexKwh * crf * kWh,
        marginaleWaardePerKwh_EUR_jr: marginaal,
        marginaleKostenPerKwh_EUR_jr: marginaleKosten,
        rendabel: marginaal >= marginaleKosten,
        cycliPerJaar: r.cycli * jaarFactor,
        kwartierenVol: r.kwartierenVol, kwartierenLeeg: r.kwartierenLeeg,
        betrouwbaar: betrouwbaar, rasterAfwijking: afwijking, fijnheid: conv.fijnheid
      });
      vorigeMarge = brutoJr; vorigeKwh = kWh;
    }
    // De marginale waarde is een VERSCHIL van twee niveaus. Een onzekerheid van een paar procent
    // op elk niveau wordt daardoor een veel grotere onzekerheid op het verschil: bij niveaus van
    // 10.000 en 11.000 euro met 3% ruis is het verschil 1.000 ± 630. Die foutvoortplanting wordt
    // hier expliciet gemaakt, zodat de marginale kolom niet nauwkeuriger lijkt dan hij is.
    for (var m = 0; m < uit.length; m++) {
      var vorige = m > 0 ? uit[m - 1] : null;
      var dKwh = vorige ? uit[m].kWh - vorige.kWh : uit[m].kWh;
      var onzekerheidEUR = uit[m].rasterAfwijking * Math.abs(uit[m].brutoMargePerJaar_EUR) +
        (vorige ? vorige.rasterAfwijking * Math.abs(vorige.brutoMargePerJaar_EUR) : 0);
      uit[m].marginaleWaardeOnzekerheid_EUR_jr = dKwh > 0 ? onzekerheidEUR / dKwh : 0;
      uit[m].marginaleWaardeScherp =
        Math.abs(uit[m].marginaleWaardePerKwh_EUR_jr) >
        2 * uit[m].marginaleWaardeOnzekerheid_EUR_jr;
    }

    // Optimum: de laatste stap waar de marginale waarde de marginale kosten nog dekt.
    // Alleen geconvergeerde punten tellen mee — een onbetrouwbaar getal mag geen advies worden.
    var optimum = null;
    // Het optimum is de grootste maat waarvan de marginale waarde de marginale kosten DUIDELIJK
    // dekt: binnen de foutmarge is er geen verschil aan te tonen en dus geen advies te geven.
    for (var j = 0; j < uit.length; j++) {
      if (uit[j].betrouwbaar &&
          uit[j].marginaleWaardePerKwh_EUR_jr - uit[j].marginaleWaardeOnzekerheid_EUR_jr >=
          uit[j].marginaleKostenPerKwh_EUR_jr) optimum = uit[j];
    }
    var onbetrouwbaar = uit.filter(function (x) { return !x.betrouwbaar; }).map(function (x) { return x.kWh; });
    return {stappen: uit, optimum: optimum, onbetrouwbareMaten: onbetrouwbaar,
      resolutieNotitie: onbetrouwbaar.length
        ? 'Bij ' + onbetrouwbaar.join(', ') + ' kWh geven een grof en een fijn SoC-raster te ' +
          'uiteenlopende uitkomsten. Die maten zijn niet doorgerekend tot een stabiel getal en ' +
          'tellen niet mee voor het optimum. Dat treedt op zodra de accu ruim groter is dan wat ' +
          'het dagpatroon kan vullen.'
        : 'Alle maten geven op een grof en een fijn SoC-raster vrijwel dezelfde uitkomst; de ' +
          'sweep is geconvergeerd.'};
  }

  /**
   * Verfijnt het SoC-raster tot twee opeenvolgende resoluties vrijwel hetzelfde antwoord geven.
   * Zonder deze lus is een enkele resolutie een gok: op een heel jaar scheelde factor 8 versus
   * factor 16 al 3%, en bij intensief cyclende accu's meer. Stopt ook zodra de rastercap bindt —
   * dan helpt verder verfijnen niet en mag het resultaat niet als geconvergeerd gelden.
   */
  function _geconvergeerdeDispatch(modelRows, cfg, o) {
    o = o || {};
    var tol    = o.tolerantie != null ? o.tolerantie : 0.05;
    var rondes = o.maxRondes  != null ? o.maxRondes  : 3;
    var f = o.fijnheid || 8;
    var r = dispatch(modelRows, cfg, {fijnheid: f});
    var afwijking = Infinity;
    for (var i = 0; i < rondes; i++) {
      var rF = dispatch(modelRows, cfg, {fijnheid: f * 2});
      if (rF.niveaus === r.niveaus) {
        return {res: r, fijnheid: f, geconvergeerd: false, afwijking: afwijking, gekapt: true};
      }
      afwijking = Math.abs(rF.margeNaAfslag_EUR - r.margeNaAfslag_EUR) /
                  Math.max(1e-9, Math.abs(rF.margeNaAfslag_EUR));
      if (rF.margeNaAfslag_EUR > r.margeNaAfslag_EUR) r = rF;
      f = f * 2;
      if (afwijking <= tol) return {res: r, fijnheid: f, geconvergeerd: true, afwijking: afwijking};
    }
    return {res: r, fijnheid: f, geconvergeerd: afwijking <= tol, afwijking: afwijking};
  }

  function _raster(basisKwh) {
    var top = Math.max(100, (basisKwh || 500) * 2);
    var lijst = [], stap = top / 10;
    for (var i = 1; i <= 10; i++) lijst.push(Math.round(stap * i));
    return lijst;
  }

  // ─── Terugkoppeling naar het groepsmodel ──────────────────────────

  /**
   * Voert de accu door in de modelrijen, zodat hij ook buiten de opslagtab doorwerkt.
   *
   * Zonder deze stap rekent de accu zichzelf wel door, maar weten de kengetallen, het financieel
   * overzicht en de deelnemersverrekening van niets: het overschot naar het net blijft dan even
   * groot terwijl de accu het zojuist heeft opgeslagen. Dat is precies het beeld dat een
   * gebruiker terecht herkent als "er verandert niets".
   *
   * De energiebalans blijft sluitend, want per kwartier geldt:
   *   opwek + ontladen + tekort = verbruik + laden + overschot
   * De accu verandert dus alleen de NETPOSITIE, niet de interne match tussen opwek en verbruik.
   * Het veld gelijktijdig_kWh blijft daarom ongemoeid: dat is de match die al gemaakt was
   * voordat de accu aan zet kwam. Wat de accu uit het overschot haalt wordt naar rato van de
   * bronnen afgeboekt - het overschot is per bron bekend, welk elektron waarheen ging niet.
   */
  function verwerkInModel(result, opslagLijst, tarieven) {
    if (!result || !result.model || !opslagLijst || !opslagLijst.length) return result;
    var intern = global.EnergieModel.intern;
    var p = tarieven || {};
    var T = result.model.length;

    // Laad- en ontlaadprofiel van alle accus opgeteld, uitgelijnd op de modeltijdlijn.
    var laden = new Float64Array(T), ontladen = new Float64Array(T);
    var index = {};
    result.model.forEach(function (m, i) { index[m.tijdKey] = i; });
    var meegenomen = 0;
    opslagLijst.forEach(function (o) {
      var d = o.dispatch;
      if (!d || !d.acProfiel || !d.acProfiel.length) return;
      meegenomen++;
      for (var t = 0; t < d.acProfiel.length; t++) {
        var i = index[d.tijdKey[t]];
        if (i == null) continue;
        var ac = d.acProfiel[t] || 0;
        if (ac < 0) laden[i] += -ac; else if (ac > 0) ontladen[i] += ac;
      }
    });
    if (!meegenomen) return result;

    result.model.forEach(function (m, i) {
      var tekortVoor = +m.tekort_kWh || 0, overschotVoor = +m.overschot_kWh || 0;
      var netto = tekortVoor - overschotVoor + laden[i] - ontladen[i];
      var tekortNa = Math.max(0, netto), overschotNa = Math.max(0, -netto);

      // Per bron naar rato afboeken wat er van het overschot verdwijnt.
      var f = overschotVoor > 1e-12 ? Math.min(1, overschotNa / overschotVoor) : 0;
      ['overschot_zon_kWh', 'overschot_wind_kWh', 'overschot_afname_invoeden_kWh'].forEach(function (k) {
        if (m[k] != null) m[k] = m[k] * f;
      });

      m.accu_laden_kWh    = laden[i];
      m.accu_ontladen_kWh = ontladen[i];
      m.tekort_zonder_accu_kWh    = tekortVoor;
      m.overschot_zonder_accu_kWh = overschotVoor;
      m.tekort_kWh    = tekortNa;
      m.overschot_kWh = overschotNa;

      // Alles wat van tekort of overschot afhangt opnieuw uitrekenen.
      var epex = +m.epex_eur_per_kWh || 0;
      m.kosten_epex_tekort_EUR       = tekortNa * epex;
      m.opbrengst_epex_overschot_EUR = overschotNa * epex;
      m.opbrengst_epex_overschot_zon_EUR  = (m.overschot_zon_kWh  || 0) * epex;
      m.opbrengst_epex_overschot_wind_EUR = (m.overschot_wind_kWh || 0) * epex;
      m.kosten_gvo_rest_EUR = tekortNa * (p.gvo_rest || 0);
      m.kosten_totaal_EUR = (m.kosten_gelijktijdigheid_totaal_EUR || 0)
                          + (m.kosten_platform_EUR || 0)
                          + (m.kosten_gvo_bilateraal_EUR || 0)
                          + m.kosten_gvo_rest_EUR
                          + m.kosten_epex_tekort_EUR
                          + (m.kosten_onbalans_totaal_EUR || 0)
                          - m.opbrengst_epex_overschot_EUR;
    });

    // Samenvatting en deelnemersuitsplitsing opnieuw afleiden uit de aangepaste rijen.
    result.samenvatting = intern.summarize(result.model);
    result.samenvatting.accu_laden_kWh    = laden.reduce(function (a, b) { return a + b; }, 0);
    result.samenvatting.accu_ontladen_kWh = ontladen.reduce(function (a, b) { return a + b; }, 0);
    var deel = intern.participantOutputsForModel(result.model, result.verbruik, result.opwekAlloc, p);
    result.per_gebruiker = deel.per_gebruiker;
    result.per_opwekker  = deel.per_opwekker;
    result.accuVerwerkt = true;

    _controleerBalansMetAccu(result.model);
    return result;
  }

  /** Balans met accu: opwek + ontladen + tekort moet gelijk zijn aan verbruik + laden + overschot. */
  function _controleerBalansMetAccu(model) {
    var links = 0, rechts = 0;
    model.forEach(function (m) {
      links  += (m.totaal_opwek_kWh || 0) + (m.accu_ontladen_kWh || 0) + (m.tekort_kWh || 0);
      rechts += (m.totaal_verbruik_kWh || 0) + (m.accu_laden_kWh || 0) + (m.overschot_kWh || 0);
    });
    if (Math.abs(links - rechts) > Math.max(0.1, Math.abs(rechts) * 1e-9)) {
      console.warn('[EhpOpslag] balanscheck met accu mislukt:',
        {opwekOntladenTekort: links, verbruikLadenOverschot: rechts});
    }
  }

  // ─── De rekening van de accu ───────────────────────────────────

  /**
   * Alle kosten en opbrengsten van een accu over de DOORGEREKENDE PERIODE, niet per jaar.
   * De referentie en de platformkosten in de verdeling gaan ook over die periode; jaarbedragen
   * ertussen mengen zou een vergelijking opleveren die nergens op slaat.
   *
   * Let op de scheiding die hier gemaakt wordt:
   *   energievoordeel  is AL bij de deelnemers geland, doordat verwerkInModel() hun tekort en
   *                    daarmee hun kosten heeft verlaagd. Het staat hier alleen ter verantwoording
   *                    en mag NIET nog eens verdeeld worden.
   *   teVerdelen       is wat er buiten dat pad valt: de besparing op transport minus de kosten
   *                    van de accu zelf. Dat is het bedrag dat de verdeling in gaat.
   */
  function rekening(opslagItem, periodeDagen, energievoordeel_EUR) {
    var b = opslagItem.businesscase, a = _lees(opslagItem.cfg);
    var f = periodeDagen > 0 ? periodeDagen / 365 : 1;
    var piek       = (b.piekwaardePerJaar_EUR || 0) * f;
    var opex       = (b.opexPerJaar_EUR || 0) * f;
    var kapitaal   = (b.kapitaallastPerJaar_EUR || 0) * f;
    var aansluiting= (b.eigenAansluitingPerJaar_EUR || 0) * f;
    var teVerdelen = piek - opex - kapitaal - aansluiting;
    return {
      naam: a.naam, kostenDrager: a.kostenDrager, eigenaar: a.eigenaar,
      periodeDagen: periodeDagen,
      energievoordeel_EUR: energievoordeel_EUR || 0,
      piekwaarde_EUR: piek,
      opex_EUR: opex, kapitaallast_EUR: kapitaal, eigenAansluiting_EUR: aansluiting,
      teVerdelen_EUR: teVerdelen,
      totaalResultaat_EUR: (energievoordeel_EUR || 0) + teVerdelen
    };
  }

  // ─── Herkomst van de laadstroom ─────────────────────────────────────────────

  /**
   * Splitst wat de accu heeft LADEN uit naar herkomst: per bedrijf (hun eigen residu-overschot
   * dat kwartier, uit opwekAlloc) en een restpost "net" voor wat overbleef nadat alle lokale
   * overschot al op was.
   *
   * Waarom dit klopt: opwekAlloc bevat per (Asset, kwartier) het overschot_kWh van dié ene
   * opwekker, ná de gelijktijdigheidsmatching — dezelfde bron waaruit het model zijn
   * groep-brede overschot_kWh optelt (zie _aggregateOpwekAlloc in energiemodel.js). Voor een
   * accu op de GEDEELDE aansluiting is sig.overschot in bouwSignaal() daarom exact de som van
   * opwekAlloc.overschot_kWh op dat kwartier — de verdeling hieronder telt dus letterlijk op
   * tot d.inUitOverschot_kWh, geen schatting.
   *
   * Die gelijkheid geldt NIET voor een accu achter de meter van één deelnemer: daar bouwt
   * bouwSignaal() sig.overschot uit die ene aansluiting zijn eigen rauwe meetreeks (gastheerProfiel),
   * los van de community-brede opwekAlloc. Roep deze functie daar niet op — het antwoord zou een
   * verdeling suggereren die het model niet heeft gemaakt.
   */
  function herkomstLaadstroom(d, opwekAlloc) {
    var perTijd = {};
    for (var i = 0; i < (opwekAlloc || []).length; i++) {
      var r = opwekAlloc[i];
      var os = +r.overschot_kWh || 0;
      if (os <= 0) continue;
      var e = perTijd[r.tijdKey];
      if (!e) { e = {totaal: 0, per: {}}; perTijd[r.tijdKey] = e; }
      e.totaal += os;
      e.per[r.Asset] = (e.per[r.Asset] || 0) + os;
    }

    var perBedrijf = {}, vanNet = 0;
    var ap = d.acProfiel || [], tk = d.tijdKey || [];
    for (var t = 0; t < ap.length; t++) {
      if (ap[t] >= 0) continue;                    // alleen laadkwartieren (acProfiel < 0)
      var acIn = -ap[t];
      var e = perTijd[tk[t]];
      var uitOverschot = e ? Math.min(acIn, e.totaal) : 0;
      if (e && e.totaal > 0) {
        Object.keys(e.per).forEach(function (naam) {
          perBedrijf[naam] = (perBedrijf[naam] || 0) + uitOverschot * (e.per[naam] / e.totaal);
        });
      }
      vanNet += acIn - uitOverschot;
    }

    var lijst = Object.keys(perBedrijf)
      .map(function (naam) { return {naam: naam, kWh: perBedrijf[naam]}; })
      .sort(function (x, y) { return y.kWh - x.kWh; });
    return {perBedrijf: lijst, vanNet_kWh: vanNet};
  }

  // ─── Export ─────────────────────────────────────────────────────────────────
  global.EhpOpslag = {
    VELDEN:           VELDEN,
    defaults:         defaults,
    lees:             _lees,
    marginaleKosten:  marginaleKosten,
    bouwSignaal:      bouwSignaal,
    dispatch:         dispatch,
    socDuurkromme:    socDuurkromme,
    businesscase:     businesscase,
    piekAnalyse:      piekAnalyse,
    vergelijkGastheren: vergelijkGastheren,
    marginaalEbTarief: marginaalEbTarief,
    verwerkInModel:   verwerkInModel,
    rekening:         rekening,
    sweep:            sweep,
    herkomstLaadstroom: herkomstLaadstroom
  };

})(window);
