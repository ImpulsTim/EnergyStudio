/* EHP samenhangende matching en opslag — de tweede rekenmodus.
   Namespace: window.EhpMatching — global scope, geen build.

   ─────────────────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT
   ─────────────────────────────────────────────────────────────────────────────
   De bestaande keten is sequentieel:

       merit order  →  restoverschot / resttekort  →  accudispatch op die rest

   `EhpOpslag.bouwSignaal()` leest `overschot_kWh` en `tekort_kWh` uit modelrijen
   waarin de matching al vastligt. De accu ziet dus alleen wat er ná de matching
   overblijft, en kan per definitie niet beslissen of een kWh zonnestroom NU intern
   verkocht, opgeslagen of geëxporteerd moet worden. Die volgorde is een aanname,
   geen uitkomst.

   Deze module behandelt matching en opslag in samenhang. De bestaande modus
   (`match_eerst_dan_opslag`) blijft ongewijzigd het standaard- en regressiepad;
   niets in dit bestand raakt die route.

   ─────────────────────────────────────────────────────────────────────────────
   WANNEER MAAKT SAMENHANG ECHT VERSCHIL? (eerlijke afbakening)
   ─────────────────────────────────────────────────────────────────────────────
   Het is verleidelijk te denken dat "de accu mag ook eerst" altijd een ander
   antwoord geeft. Voor de GROEPSWAARDE is dat meestal niet zo, en dat is het waard
   om uit te schrijven, want het bepaalt waar de nieuwe modus wél verschil maakt.

   Neem één kWh opwek en één kWh vraag in hetzelfde kwartier t:

     A. direct matchen         →  groep vermijdt inkoop (pNet) en mist export (pEx)
                                  waarde = pNet(t) − pEx(t)   ≥ 0, altijd
     B. opslaan, later leveren →  groep mist export (pEx), vermijdt later inkoop
                                  waarde = η·pNet(t') − pEx(t)
     C. matchen én tegelijk van het net laden
                               →  waarde = (pNet(t) − pEx(t)) + (η·pNet(t') − pLaadNet(t))

   C is A plus een losstaande arbitrage. Zolang laden van het net mag, is C ≥ B
   (want pLaadNet ≤ pNet: de accu betaalt hooguit hetzelfde als de afnemer, en met
   de opslagvrijstelling minder). Fysiek zijn B en C bovendien dezelfde stroom —
   alleen de administratieve toerekening verschilt. Directe matching eerst is dus
   NIET dom; voor de kale groepswaarde is ze meestal precies goed.

   Waar samenhang wél het antwoord verandert:

     1. LADEN UIT HET NET IS UITGESLOTEN (schakelaar, of `alleenEigenOverschot` per
        accu). Dan bestaat route C niet en concurreert opslag rechtstreeks met
        directe matching: opslaan loont zodra η·pNet(t') > pNet(t).
     2. BESCHERMINGSGRENZEN. Een bron boven het netalternatief van de afnemer mag
        niet intern verrekend worden; een bron die minder ontvangt dan zijn eigen
        exportalternatief mag niet intern geleverd worden. Wat daardoor niet
        gematcht wordt, komt beschikbaar voor de accu. De restpositie is dus een
        UITKOMST van de beschermingsregels, geen invoer.
     3. ONTLADEN NAAR DE AFNEMER MAG NIET ALTIJD. Ligt de prijs van opgeslagen
        energie boven het netalternatief van de afnemer, dan koopt die van het net
        en moet de accu exporteren. De oude dispatch neemt aan dat ontladen altijd
        eerst het tekort dekt.
     4. NETNEUTRALITEIT als expliciet doel. Bij gelijke financiële uitkomst hoort de
        route met minder netimport en netexport te winnen; dat vraagt een term in
        de doelfunctie, niet een volgorde.
     5. DE ACCU IN DE MERIT ORDER. Is opgeslagen energie goedkoper dan de duurste
        opwek in dat kwartier, dan hoort de afnemer die eerst te krijgen en de opwek
        te exporteren. In de oude keten dekt de accu per definitie alleen het
        RESTtekort.

   Alle vijf zitten in de doelfunctie en de randvoorwaarden hieronder. De modus heet
   daarom `prijsgeoptimaliseerde_opslag_en_matching` en niet "accu eerst": de
   volgorde is geen keuze, prijs en bescherming zijn dat wel.

   ─────────────────────────────────────────────────────────────────────────────
   METHODE
   ─────────────────────────────────────────────────────────────────────────────
   Stap 1  Bescherming-bewuste voorbereiding per kwartier: welke opwek mag intern,
           tegen welke prijs, en wat zijn de netalternatieven aan beide kanten.
   Stap 2  Dynamisch programmeren over gediscretiseerde SoC met VOLLEDIGE
           vooruitblik op EPEX en profielen. De beloningsfunctie per kwartier is
           niet "arbitrage op de restpositie" maar de volledige groepsuitkomst als
           functie van de accu-actie, inclusief het verdringen van directe matching.
   Stap 3  Terugspelen van het optimale SoC-pad: per kwartier de concrete routes,
           per asset, plus het herkomstgrootboek van de accu.
   Stap 4  Verrekening (ehp/matching_verrekening.js): wie betaalt en ontvangt wat.

   Meerdere accu's worden SEQUENTIEEL doorgerekend op een krimpende restpositie:
   accu 1 ziet de volle ruimte, accu 2 wat accu 1 heeft laten liggen. Dat houdt de
   balansen sluitend en is uitlegbaar. Simultaan optimaliseren van N accu's vraagt
   een gezamenlijke toestandsruimte die met kwartierdata over een jaar niet meer
   doorrekenbaar is; de volgorde staat in het resultaat zodat ze controleerbaar is.

   GEEN FYSIEKE-ELEKTRONENCLAIM. Alles wat hier "herkomst" heet is een
   administratieve toerekening. De accu is fysiek een mengvat.
*/
(function (global) {
  'use strict';

  var DT  = 0.25;        // kwartier in uren
  var EPS = 1e-9;
  var NEG = -1e18;       // onbereikbare toestand in de DP

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. CONFIGURATIE — definities sturen de rekenlaag, de UI en het rapport
  // ═══════════════════════════════════════════════════════════════════════════

  var MODI = {
    match_eerst_dan_opslag: {
      label: 'Interne matching eerst, daarna opslag',
      kort:  'Huidige werkwijze',
      uitleg: 'Eerst wordt opwek binnen de groep aan verbruik gekoppeld. Wat daarna overblijft ' +
              '— overschot en tekort — is waar de accu mee werkt. Dit is de bestaande rekenwijze ' +
              'en de vergelijkingsbasis: de uitkomsten zijn identiek aan die van vóór de uitbreiding.'
    },
    prijsgeoptimaliseerde_opslag_en_matching: {
      label: 'Prijsgeoptimaliseerde opslag en matching',
      kort:  'Opslag en matching in samenhang',
      uitleg: 'Per kwartier wordt, met vooruitblik op de hele periode, gekozen tussen direct ' +
              'intern leveren, opslaan, exporteren, uit de accu leveren aan een afnemer, uit de ' +
              'accu exporteren en laden uit het net. De keuze volgt uit prijs en tijd, niet uit ' +
              'een vaste volgorde — en blijft binnen de beschermingsregels voor afnemers en ' +
              'producenten.'
    }
  };

  /**
   * Doelfuncties. De GROEPSWAARDE is altijd de basis van de afweging: dat is de
   * werkelijke taart (vermeden inkoop + exportopbrengst − laadkosten − slijtage).
   * Het doel bepaalt hoeveel EXTRA gewicht het voordeel van de afnemer krijgt en
   * hoe zwaar netuitwisseling meetelt. Zo blijft elke keuze uitlegbaar als één
   * optelsom in plaats van als een verborgen voorkeursvolgorde.
   *
   *   wAfnemer  extra gewicht op (netalternatief − betaalde prijs) per intern
   *             geleverde kWh. 0 = onverschillig over wie het voordeel krijgt.
   *   wNetMwh   straf in EUR per MWh netuitwisseling (import + export). Een kleine
   *             waarde werkt als tiebreak: bij gelijke financiële uitkomst wint de
   *             route met minder netverkeer.
   */
  var DOELEN = {
    afnemer_laagst: {
      label: 'Laagste kosten voor afnemers, binnen producentenbescherming',
      uitleg: 'De afweging telt het voordeel van de afnemer extra mee: bij twee routes met ' +
              'dezelfde groepswaarde wint de route die de afnemer het meest scheelt. Producenten ' +
              'houden hun harde ondergrens.',
      wAfnemer: 1, wNetMwh: 0.5, aanbevolen: true
    },
    groepswaarde: {
      label: 'Maximale groepswaarde, met afnemers- en producentenbescherming',
      uitleg: 'De afweging maximaliseert de totale waarde voor de groep en laat de verdeling ' +
              'daarvan over aan de verdeelsleutel. Beide beschermingsgrenzen blijven hard.',
      wAfnemer: 0, wNetMwh: 0.5
    },
    netneutraal: {
      label: 'Maximale netneutraliteit, binnen financiële beschermingsgrenzen',
      uitleg: 'Netimport en netexport worden zwaar beprijsd, zodat het model zoveel mogelijk ' +
              'binnen de groep houdt. Alleen waar dat financieel echt niet kan wijkt het uit naar ' +
              'het net — en dan is in de kwartier-inspector te zien waarom.',
      wAfnemer: 0.25, wNetMwh: 50
    },
    gewogen: {
      label: 'Zelf gewogen (geavanceerd)',
      uitleg: 'Stel het gewicht van het afnemersvoordeel en de netstraf zelf in. Bedoeld om ' +
              'governance-afspraken door te rekenen; de andere drie keuzes zijn vaste punten op ' +
              'dezelfde schaal.',
      wAfnemer: 0.5, wNetMwh: 5, handmatig: true
    }
  };

  /**
   * Beschermingsregimes. "Route vervalt" laat de uitwisseling niet doorgaan;
   * "verschil uit de pool" laat haar doorgaan en boekt het verschil als zichtbare
   * correctie. Beide voldoen aan de eis dat niemand onder zijn alternatief komt —
   * ze verschillen in wie de rekening krijgt en hoeveel lokaal wordt uitgewisseld.
   */
  var BESCHERMING = {
    blokkeren: {label: 'Route vervalt',
      uitleg: 'Komt de prijs aan de verkeerde kant van het alternatief, dan gaat die kWh niet ' +
              'intern maar naar of van het net. Niemand betaalt te veel en niemand ontvangt te ' +
              'weinig, maar er wordt minder lokaal uitgewisseld.'},
    aanvullen: {label: 'Route gaat door, verschil uit de pool',
      uitleg: 'De uitwisseling gaat wél door; het verschil met het alternatief wordt bijgepast ' +
              'uit de groepspool en staat als aparte post in de verrekening. Meer lokale ' +
              'uitwisseling, maar de pool draagt het.'},
    uit: {label: 'Geen bescherming',
      uitleg: 'Alleen om het effect van de bescherming te meten. De uitkomst kan een deelnemer ' +
              'onder zijn alternatief brengen.'}
  };

  /** Verdeling van de EXTRA waarde die door opslag ontstaat. */
  var VERDELINGEN = {
    energie_eigenaar: {
      label: 'Naar de eigenaar van de energie',
      uitleg: 'Wie de zon-, wind- of afname-invoedingsenergie inbracht, ontvangt de opbrengst van ' +
              'de latere verkoop, minus de afgesproken opslagvergoeding. De accu-eigenaar krijgt ' +
              'die vergoeding en draagt zijn eigen kosten.'
    },
    batterij_eigenaar: {
      label: 'Naar de eigenaar van de batterij',
      uitleg: 'De energie-eigenaar krijgt gegarandeerd zijn directe exportalternatief op het ' +
              'moment van laden; alles wat de accu daarbovenop realiseert is voor de ' +
              'accu-eigenaar. Die draagt daarmee ook het prijsrisico.'
    },
    groepspool: {
      label: 'Naar de groepspool',
      uitleg: 'De energie-eigenaar krijgt gegarandeerd zijn directe exportalternatief; de ' +
              'resterende opslagwaarde gaat in de bestaande pool en volgt de verdeelsleutel van ' +
              'het platform.'
    },
    verdeelsleutel: {
      label: 'Procentueel verdelen',
      uitleg: 'De energie-eigenaar krijgt gegarandeerd zijn directe exportalternatief; de ' +
              'resterende opslagwaarde wordt procentueel gesplitst over energie-eigenaar, ' +
              'accu-eigenaar en pool. De som moet 100% zijn.'
    }
  };

  /** Velddefinities voor de zijbalk en het aannameblad. */
  var VELDEN = [
    {key:'matching_modus',        label:'Matching en opslag',          type:'keuze', opties:MODI,
     def:'match_eerst_dan_opslag'},
    {key:'opt_doel',              label:'Optimalisatiedoel',           type:'keuze', opties:DOELEN,
     def:'afnemer_laagst'},
    {key:'opt_w_afnemer_pct',     label:'Gewicht afnemersvoordeel',    eenheid:'%',             def:100},
    {key:'opt_w_net_mwh',         label:'Straf netuitwisseling',       eenheid:'€/MWh',         def:0.5},
    {key:'laden_uit_net',         label:'Laden uit het net',           type:'schakelaar',       def:1},
    {key:'ontladen_naar_epex',    label:'Ontladen naar EPEX',          type:'schakelaar',       def:1},
    {key:'afnemer_bescherming',   label:'Bescherming afnemer',         type:'keuze', opties:BESCHERMING,
     def:'blokkeren'},
    // Standaard 'aanvullen' en niet 'blokkeren': in dit model is de interne bronprijs een
    // CONTRACTUELE afspraak die vaak bewust onder de marktprijs ligt. Die route hard
    // blokkeren zou de hele interne uitwisseling stilleggen zodra EPEX boven het
    // afgesproken tarief staat. Met 'aanvullen' gaat de levering door, krijgt de
    // producent zijn alternatief, en staat de rekening zichtbaar bij de pool — precies
    // het getal waarover een coöperatie een besluit moet nemen.
    {key:'producent_bescherming', label:'Bescherming producent',       type:'keuze', opties:BESCHERMING,
     def:'aanvullen'},
    {key:'opslagwaarde_verdeling',label:'Verdeling opslagwaarde',      type:'keuze', opties:VERDELINGEN,
     def:'groepspool'},
    {key:'opslagwaarde_split_energie',  label:'Aandeel energie-eigenaar', eenheid:'%',          def:40},
    {key:'opslagwaarde_split_batterij', label:'Aandeel accu-eigenaar',    eenheid:'%',          def:40},
    {key:'opslagwaarde_split_pool',     label:'Aandeel groepspool',       eenheid:'%',          def:20},
    {key:'opslagvergoeding_mwh',  label:'Opslagvergoeding',            eenheid:'€/MWh doorzet', def:15},
    {key:'accu_korting_mwh',      label:'Korting afnemer op opslag',   eenheid:'€/MWh',         def:10}
  ];

  function defaults() {
    var o = {};
    VELDEN.forEach(function (v) { o[v.key] = v.def; });
    return o;
  }

  function _num(v, d) { var x = +v; return isFinite(x) ? x : d; }
  function _bool(v, d) {
    if (v == null || v === '') return d;
    return !!v && v !== '0' && v !== 'false';
  }

  /**
   * Leest de instellingen uit plat.cfg en vult ontbrekende waarden aan.
   *
   * MIGRATIE: elk bestaand platform mist `matching_modus` en valt daardoor terug op
   * `match_eerst_dan_opslag`. Er verandert dus niets aan opgeslagen platforms tot
   * iemand de modus bewust omzet. Dat is de hele migratie — er is geen datamodel
   * dat herschreven hoeft te worden.
   */
  function lees(cfg) {
    var c = cfg || {};
    var modus   = MODI[c.matching_modus] ? c.matching_modus : 'match_eerst_dan_opslag';
    var doelKey = DOELEN[c.opt_doel] ? c.opt_doel : 'afnemer_laagst';
    var doel    = DOELEN[doelKey];

    // Bij de vaste doelen komen de gewichten uit de definitie; alleen bij 'gewogen'
    // zijn ze handmatig. Zo doet een genoemd doel altijd hetzelfde.
    var wAfnemer = doel.handmatig ? _num(c.opt_w_afnemer_pct, 50) / 100 : doel.wAfnemer;
    var wNetMwh  = doel.handmatig ? _num(c.opt_w_net_mwh, 5)            : doel.wNetMwh;

    var verdeling = VERDELINGEN[c.opslagwaarde_verdeling] ? c.opslagwaarde_verdeling : 'groepspool';
    var splitE = _num(c.opslagwaarde_split_energie, 40);
    var splitB = _num(c.opslagwaarde_split_batterij, 40);
    var splitP = _num(c.opslagwaarde_split_pool, 20);
    var splitSom = splitE + splitB + splitP;

    return {
      modus: modus,
      modusLabel: MODI[modus].label,
      doel: doelKey,
      doelLabel: doel.label,
      wAfnemer: Math.max(0, wAfnemer),
      wNet: Math.max(0, wNetMwh) / 1000,                       // EUR/kWh
      wNetMwh: Math.max(0, wNetMwh),
      ladenUitNet:      _bool(c.laden_uit_net, true),
      ontladenNaarEpex: _bool(c.ontladen_naar_epex, true),
      afnemerBescherming:   BESCHERMING[c.afnemer_bescherming]   ? c.afnemer_bescherming   : 'blokkeren',
      producentBescherming: BESCHERMING[c.producent_bescherming] ? c.producent_bescherming : 'aanvullen',
      verdeling: verdeling,
      verdelingLabel: VERDELINGEN[verdeling].label,
      split: {energie: splitE / 100, batterij: splitB / 100, pool: splitP / 100},
      splitPct: {energie: splitE, batterij: splitB, pool: splitP},
      splitSom: splitSom,
      splitGeldig: Math.abs(splitSom - 100) < 0.01,
      // Contractuele opslagvergoeding: hoort in de VERREKENING, niet in de dispatch.
      // De dispatch stuurt op marginale kosten (rendementsverlies + slijtage); de
      // vergoeding is een afspraak over wie de opbrengst krijgt en verplaatst geen
      // enkele kWh. Om dezelfde reden staat LCOS nergens als drempel: dat is een
      // businesscase-toets achteraf, geen marginale stuurprijs.
      opslagvergoeding: _num(c.opslagvergoeding_mwh, 15) / 1000,   // EUR/kWh afgeleverd
      opslagvergoedingMwh: _num(c.opslagvergoeding_mwh, 15),
      // Korting die de afnemer op opgeslagen energie krijgt ten opzichte van zijn
      // netalternatief. Dit is de knop die bepaalt hoeveel van de opslagwaarde
      // meteen bij de afnemer landt; wat overblijft volgt de gekozen verdeling.
      afnemersKorting: _num(c.accu_korting_mwh, 10) / 1000,
      afnemersKortingMwh: _num(c.accu_korting_mwh, 10),
      retailOpslag: _num(c.retail_opslag_mwh, 20) / 1000
    };
  }

  function isNieuweModus(cfg) {
    return lees(cfg).modus === 'prijsgeoptimaliseerde_opslag_en_matching';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. ROUTEPRIJZEN — één centrale definitie per route
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Alle prijzen die in de afweging voorkomen, op één plek. Elders in deze modus
   * mag geen tweede definitie van dezelfde route ontstaan; precies zo kon de
   * exportwaarde in de accu-logica ooit uit de pas lopen met de modelkolommen.
   *
   * Twee exportprijzen die BEWUST verschillen — en waarom:
   *
   *   exportProducent = EPEX
   *       Wat een opwekker krijgt voor een kWh naar het net. Gelijk aan de
   *       modelkolom `opbrengst_epex_overschot_EUR` (= overschot × EPEX). Dit is
   *       ook het bedrag dat de producentenbescherming garandeert.
   *
   *   exportAccu = EPEX − terugleverafslag van díe accu
   *       Een accu achter de meter zit binnen het leveringscontract van de gastheer
   *       en draagt dus de contractuele afslag. Op een eigen aansluiting is de accu
   *       zelf marktpartij en is de afslag nul (zoals in `vergelijkGastheren()`).
   *       Het verschil is contractueel bedoeld, geen tweede berekening.
   *
   * Let op één bewust verschil met de oude accu-logica: laden uit lokaal overschot
   * kost hier `exportProducent` (EPEX) en niet `EPEX − afslag`. De accu moet de
   * producent zijn volledige alternatief vergoeden; de terugleverafslag is een
   * kost van de accu, niet van de producent.
   */
  function routePrijzen(epex, ctx, accu) {
    var p = {
      epex:            epex,
      exportProducent: epex,                                    // producentenalternatief
      netAfnemer:      epex + ctx.retailOpslag                  // netalternatief afnemer
    };
    if (accu) {
      p.ladenUitNet      = epex + accu.afnameOpslag + accu.ebLaden;
      p.exportAccu       = epex - accu.terugleverAfslag;
      // Wat de groep bespaart als de accu een interne afnemer bedient: het
      // netalternatief van die afnemer plus de eventueel vermeden energiebelasting
      // achter dezelfde meter.
      p.ontladenIntern   = p.netAfnemer + accu.ebVermeden;
      p.degradatie       = accu.mkDegradatie;
      p.opslagvergoeding = ctx.opslagvergoeding;
    }
    return p;
  }

  /**
   * Fiscale en contractuele parameters van één accu, geleend van EhpOpslag zodat er
   * precies één definitie van energiebelasting, opslagvrijstelling en
   * leveringsopslag bestaat. Verandert daar iets, dan verandert het hier mee.
   */
  function accuContext(accuCfg, rijen, gastheer, ebJaar, aandeelEigen) {
    var a = global.EhpOpslag.lees(accuCfg);
    var eigenAansluiting = a.eigenaar === 'platform';
    // Op een eigen aansluiting handelt de accu als marktpartij: geen leveranciers-
    // marge en geen terugleverafslag. Zelfde afspraak als in vergelijkGastheren().
    if (eigenAansluiting) { a.afnameOpslag = 0; a.terugleverAfslag = 0; }

    var jaarAfname = _jaarAfname(rijen, gastheer);
    a.ebGrondslagKwh = jaarAfname;
    a.ebAfgeleid     = !(a.ebPerKwh > 0);
    a.ebEffectief    = a.ebPerKwh > 0 ? a.ebPerKwh
                     : global.EhpOpslag.marginaalEbTarief(jaarAfname, ebJaar || 2025);

    var deel = aandeelEigen == null ? 1 : Math.max(0, Math.min(1, aandeelEigen));
    a.ebLaden    = a.opslagVrijstelling ? 0 : a.ebEffectief;
    a.ebVermeden = eigenAansluiting ? 0
                 : a.opslagVrijstelling ? a.ebEffectief * deel
                                        : a.ebEffectief;
    a.aandeelEigen     = deel;
    a.mkDegradatie     = global.EhpOpslag.marginaleKosten(a);
    a.eigenAansluiting = eigenAansluiting;
    a.etaRetour        = a.etaLaad * a.etaOntlaad;
    return a;
  }

  function _jaarAfname(rijen, gastheer) {
    var som = 0;
    for (var i = 0; i < rijen.length; i++) {
      som += gastheer ? Math.max(0, +gastheer[i] || 0) : Math.max(0, rijen[i].tekort || 0);
    }
    var d = _dagen(rijen);
    return d > 0 ? som * 365 / d : som;
  }

  function _dagen(rijen) {
    if (!rijen || rijen.length < 2) return rijen && rijen.length ? 1 : 0;
    var d = (new Date(rijen[rijen.length - 1].tijdKey) - new Date(rijen[0].tijdKey)) / 86400000 + DT / 24;
    return d > 0 ? d : rijen.length / 96;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. VOORBEREIDING — de kwartierstructuur waarop alles verder rekent
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Zet opwekrijen en vraag om in één tijdreeks van kwartieren, met per kwartier de
   * aanbieders op prijs, de beschermingsgrenzen en de basale matching.
   *
   * De basale matching is hier nog ZONDER accu — niet omdat de volgorde zo hoort,
   * maar omdat de accu-afweging hem als vertrekpunt gebruikt en er per kwartier
   * expliciet van mag afwijken (verdringen bij laden, verdringen bij ontladen).
   * Wat de accu daarvan overneemt komt in stap 4 terug.
   */
  function bereidVoor(opwekRows, verbruikByTijd, opt) {
    var inst       = opt.instellingen;
    var prijsModel = opt.prijsModel;
    var epexByTijd = opt.epexByTijd || {};
    var opPrijs    = opt.meritVolgorde === 'prijs';

    // 3a. Aanbieders per kwartier, met hun interne prijs.
    var perTijd = {}, sleutelSet = {};
    for (var i = 0; i < (opwekRows || []).length; i++) {
      var r = opwekRows[i];
      if (!perTijd[r.tijdKey]) perTijd[r.tijdKey] = [];
      var epex  = epexByTijd[r.tijdKey] || 0;
      var prijs = prijsModel ? prijsModel.prijsVoor(r.Type_norm, epex) : 0;
      perTijd[r.tijdKey].push({rij: r, prijs: prijs});
      sleutelSet[r.tijdKey] = 1;
    }
    Object.keys(verbruikByTijd || {}).forEach(function (k) { sleutelSet[k] = 1; });
    var tijdKeys = Object.keys(sleutelSet).sort();
    var T = tijdKeys.length;

    var q = {
      tijdKeys: tijdKeys, T: T,
      epex:        new Float64Array(T),
      netAfnemer:  new Float64Array(T),   // netalternatief afnemer (EPEX + retailopslag)
      exportProd:  new Float64Array(T),   // exportalternatief producent (EPEX)
      vraag:       new Float64Array(T),
      opwek:       new Float64Array(T),
      match:       new Float64Array(T),   // intern gematcht (loopt mee met de accu's)
      surplus:     new Float64Array(T),   // opwek die naar het net gaat, beschikbaar voor laden
      tekort:      new Float64Array(T),   // vraag van het net, beschikbaar voor ontladen
      geblokkeerdAfnemer:   new Float64Array(T),  // opwek te duur voor de afnemer
      geblokkeerdProducent: new Float64Array(T),  // opwek te goedkoop voor de producent
      internGem:   new Float64Array(T),   // gewogen gem. interne prijs van het gematchte volume
      internMarge: new Float64Array(T),   // prijs van de duurste gematchte kWh (marginale bron)
      aanbieders:  new Array(T),          // gesorteerde aanbiederslijst per kwartier
      korting:     new Float64Array(T),   // aanvulling afnemer uit de pool (EUR)
      toeslag:     new Float64Array(T)    // aanvulling producent uit de pool (EUR)
    };

    for (var t = 0; t < T; t++) {
      var tk   = tijdKeys[t];
      var epx  = epexByTijd[tk] || 0;
      var pNet = epx + inst.retailOpslag;
      var pEx  = epx;
      q.epex[t] = epx; q.netAfnemer[t] = pNet; q.exportProd[t] = pEx;

      var lijst = (perTijd[tk] || []).slice();
      // Merit order: op prijs (goedkoopste eerst) of op contractueel prioriteits-
      // nummer, met het andere veld als tiebreak. Zelfde afspraak als EhpDispatch.
      lijst.sort(function (x, y) {
        if (opPrijs && Math.abs(x.prijs - y.prijs) > 1e-12) return x.prijs - y.prijs;
        if (x.rij.Prioriteit !== y.rij.Prioriteit) return x.rij.Prioriteit - y.rij.Prioriteit;
        return x.prijs - y.prijs;
      });

      var D = (verbruikByTijd || {})[tk] || 0;
      q.vraag[t] = D;

      // Beschermingsgrenzen per aanbieder. Ze bepalen of een kWh überhaupt intern
      // mag; de rest van de afweging gaat over wat er dan met die kWh gebeurt.
      var totOpwek = 0, mag = 0, blokAf = 0, blokPr = 0;
      for (var j = 0; j < lijst.length; j++) {
        var a = lijst[j];
        var kwh = a.rij.opwek_kWh || 0;
        totOpwek += kwh;
        a.teDuurVoorAfnemer   = a.prijs > pNet + 1e-12;
        a.teLaagVoorProducent = a.prijs < pEx  - 1e-12;
        a.magIntern = true;
        if (a.teDuurVoorAfnemer   && inst.afnemerBescherming   === 'blokkeren') a.magIntern = false;
        if (a.teLaagVoorProducent && inst.producentBescherming === 'blokkeren') a.magIntern = false;
        if (!a.magIntern) {
          if (a.teDuurVoorAfnemer)   blokAf += kwh;
          if (a.teLaagVoorProducent) blokPr += kwh;
        } else {
          mag += kwh;
        }
      }
      q.opwek[t] = totOpwek;
      q.geblokkeerdAfnemer[t]   = blokAf;
      q.geblokkeerdProducent[t] = blokPr;
      q.aanbieders[t] = lijst;

      // Basale match: vul de vraag uit de toegestane aanbieders, op merit order.
      var rest = D, gematcht = 0, som = 0, marge = 0, korting = 0, toeslag = 0;
      for (var k = 0; k < lijst.length; k++) {
        var b = lijst[k];
        b.intern = 0;
        if (!b.magIntern || rest <= EPS) continue;
        var neem = Math.min(b.rij.opwek_kWh || 0, rest);
        if (neem <= EPS) continue;
        b.intern = neem;
        rest -= neem; gematcht += neem; som += neem * b.prijs; marge = b.prijs;
        // Aanvulregime: de route gaat door, het verschil komt uit de pool. Dat is
        // een echte kaspost, geen boekhoudkundige truc — hij staat in de verrekening.
        if (b.teDuurVoorAfnemer   && inst.afnemerBescherming   === 'aanvullen') korting += neem * (b.prijs - pNet);
        if (b.teLaagVoorProducent && inst.producentBescherming === 'aanvullen') toeslag += neem * (pEx - b.prijs);
      }
      q.match[t]       = gematcht;
      q.internGem[t]   = gematcht > 0 ? som / gematcht : 0;
      q.internMarge[t] = marge;
      q.surplus[t]     = Math.max(0, totOpwek - gematcht);
      q.tekort[t]      = Math.max(0, D - gematcht);
      q.korting[t]     = korting;
      q.toeslag[t]     = toeslag;
    }
    return q;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. DE GEZAMENLIJKE AFWEGING — DP over SoC met de volledige kwartieruitkomst
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Beloningsstructuur per kwartier, voorgekookt tot losse getallen zodat de
   * binnenste DP-lus O(1) blijft. Op een jaar met 35.040 kwartieren en ~100
   * SoC-niveaus worden er honderden miljoenen transities gewogen; alles wat daar
   * niet in constante tijd kan, hoort hier.
   */
  /**
   * Wat deze accu wel en niet mag, afgeleid uit de platforminstelling én de
   * accu-eigen instelling. De twee zijn bewust verschillend:
   *
   *   inst.ladenUitNet = false        het platform staat geen netinkoop toe om te
   *                                   laden. De accu mag dan nog wél opwek nemen die
   *                                   anders direct geleverd was — dat is precies de
   *                                   concurrentie tussen opslag en directe matching.
   *   accu.alleenEigenOverschot       de accu draait uitsluitend op het overschot dat
   *                                   toch al naar het net ging. Geen netinkoop en
   *                                   ook geen verdringen van een interne levering.
   *                                   Dit is de bestaande instelling en houdt in
   *                                   beide modi dezelfde betekenis.
   */
  function dpOpties(a, inst) {
    return {
      gridMag:     !!inst.ladenUitNet && !a.alleenEigenOverschot,
      verdringMag: !a.alleenEigenOverschot,
      mkHalf:      a.mkDegradatie * 0.5
    };
  }

  function _bouwSignaal(q, a, inst, gastheer, rest) {
    var T = q.T;
    var s = {
      pEx:      new Float64Array(T),   // kost van laden uit lokaal overschot (= producentalternatief)
      pNet:     new Float64Array(T),   // netalternatief afnemer
      pLaadNet: new Float64Array(T),   // kost van laden uit het net
      pExAccu:  new Float64Array(T),   // opbrengst van ontladen naar EPEX
      pUitInt:  new Float64Array(T),   // waarde van ontladen naar een interne afnemer
      pBat:     new Float64Array(T),   // prijs van opgeslagen energie voor de afnemer
      pBatVloer:new Float64Array(T),   // ondergrens: marginale kostprijs van die kWh
      netto:    new Float64Array(T),   // netpositie van de gastheeraansluiting (kWh, + = afname)
      magUitOpwek: new Uint8Array(T),  // producentenbescherming laat laden uit opwek toe
      magIntern:   new Uint8Array(T),  // accu mag interne afnemers bedienen
      onderKostprijs: new Uint8Array(T) // die levering zou onder de marginale kostprijs zijn
    };

    var ctx = {retailOpslag: inst.retailOpslag, opslagvergoeding: inst.opslagvergoeding};
    for (var t = 0; t < T; t++) {
      var p = routePrijzen(q.epex[t], ctx, a);
      s.pEx[t]      = p.exportProducent;
      s.pNet[t]     = p.netAfnemer;
      s.pLaadNet[t] = p.ladenUitNet;
      s.pExAccu[t]  = p.exportAccu;
      s.pUitInt[t]  = p.ontladenIntern;
      // PRIJS VAN OPGESLAGEN ENERGIE VOOR DE AFNEMER.
      //
      // Regel: het netalternatief van die afnemer MIN de afgesproken korting, met
      // als ondergrens de marginale kostprijs van de accu.
      //
      //   bovenkant  De afnemer is per definitie beter af dan met het net, en met
      //              precies het afgesproken bedrag. Dat maakt het een governance-
      //              keuze in plaats van een uitkomst van een prijsformule.
      //   onderkant  De accu levert nooit onder zijn eigen marginale kosten. Zou dat
      //              nodig zijn, dan gaat de kWh niet intern (of past de pool bij,
      //              afhankelijk van het beschermingsregime).
      //
      // Wat er tussen de kostprijs en het netalternatief overblijft is de EXTRA
      // OPSLAGWAARDE. Die wordt niet hier verdeeld maar in de verrekening, volgens
      // de gekozen verdeling (energie-eigenaar, accu-eigenaar, pool of een split).
      // Zou de prijs hier al op kostprijs staan, dan was die waarde stilzwijgend al
      // aan de afnemer gegeven en viel er niets meer te verdelen.
      //
      s.pBat[t] = p.netAfnemer - inst.afnemersKorting;
      // Netpositie waarop de piekbegrenzing werkt. Achter de meter van één deelnemer
      // is dat de aansluiting van díe deelnemer; op de gedeelde aansluiting de
      // restpositie van de groep zoals die er vóór déze accu bij ligt.
      s.netto[t] = gastheer ? (+gastheer[t] || 0) : (rest.tekort[t] - rest.surplus[t]);
    }

    // ── Ondergrens van de accuprijs: wat zit er ongeveer in de tank? ──────────
    // De accu levert nooit onder zijn marginale kostprijs. Die kostprijs is de
    // INKOOPPRIJS VAN DE VOORRAAD, niet de prijs van het moment van leveren — een
    // accu die 's middags voor 1 ct laadde levert 's avonds niet ineens voor 25 ct
    // kostprijs. De prijs van het huidige kwartier als proxy nemen zou de accu
    // precies in de dure uren van interne levering uitsluiten: exact verkeerd om.
    //
    // Proxy: de goedkoopste laadgelegenheid van de afgelopen 24 uur (96 kwartieren),
    // via een monotone deque in O(T). Dat past bij het dagpatroon waarop een accu
    // draait en is een ONDERgrens, dus voorzichtig de goede kant op: liever de
    // levering toestaan en in de verrekening exact narekenen — daar komt een
    // eventueel tekort als zichtbare beschermingscorrectie boven water — dan hier
    // op een schatting een route afsluiten.
    var VENSTER = 96;
    var dq = new Int32Array(T), kop = 0, staart = 0;
    for (var w = 0; w < T; w++) {
      while (staart > kop && s.pEx[dq[staart - 1]] >= s.pEx[w]) staart--;
      dq[staart++] = w;
      while (dq[kop] <= w - VENSTER) kop++;
      s.pBatVloer[w] = s.pEx[dq[kop]] / Math.max(1e-9, a.etaRetour) + a.mkDegradatie;
    }

    // Producentenbescherming bij opslag. Bij `energie_eigenaar` hangt wat de
    // producent krijgt af van wat de accu er later voor maakt; die kan lager
    // uitvallen dan directe export. Dan mag zijn energie niet de accu in.
    // Toets: kan de best haalbare toekomstige opbrengst het alternatief van nu nog
    // dekken? De achterwaartse maximum-reeks maakt dat een O(T)-controle in plaats
    // van een zoekopdracht per kwartier.
    var toets = inst.verdeling === 'energie_eigenaar' && inst.producentBescherming !== 'uit';
    var besteVanaf = new Float64Array(T + 1);
    besteVanaf[T] = -Infinity;
    for (var b = T - 1; b >= 0; b--) {
      var beste = Math.max(s.pBat[b], inst.ontladenNaarEpex ? s.pExAccu[b] : -Infinity);
      besteVanaf[b] = Math.max(beste, besteVanaf[b + 1]);
    }
    for (var u = 0; u < T; u++) {
      if (!toets) { s.magUitOpwek[u] = 1; }
      else {
        // Kan de best haalbare toekomstige opbrengst het exportalternatief van nu
        // nog dekken, ná rendementsverlies, slijtage en de opslagvergoeding die de
        // energie-eigenaar in dit regime afdraagt? Zo nee, dan zou opslaan hem onder
        // zijn directe alternatief brengen en mag zijn energie de accu niet in.
        // De achterwaartse maximumreeks maakt dat een O(T)-controle in plaats van
        // een zoekopdracht per kwartier.
        var haalbaar = a.etaRetour * besteVanaf[Math.min(T - 1, u + 1)];
        s.magUitOpwek[u] = haalbaar >= s.pEx[u] + inst.opslagvergoeding + a.mkDegradatie ? 1 : 0;
      }
      // De afnemer is per constructie beschermd: hij betaalt zijn netalternatief min
      // de afgesproken korting. Interne levering uit de accu wordt daarom NIET
      // geblokkeerd — dat zou een route stilzwijgend afsluiten op grond van een
      // schatting, terwijl de afweging hem hoort te wegen.
      //
      // Wat wél kan knellen is de andere kant: soms haalt de accu op die prijs zijn
      // eigen marginale kosten niet. Dat wordt hier gemarkeerd en in de verrekening
      // exact uitgerekend, waar het als zichtbare beschermingscorrectie ten laste van
      // de pool komt. Zichtbaar boekhouden is beter dan onzichtbaar niet-leveren.
      s.magIntern[u] = 1;
      s.onderKostprijs[u] = s.pBat[u] < s.pBatVloer[u] - 1e-12 ? 1 : 0;
    }
    return s;
  }

  /** Lege uitkomstbak; hergebruikt in de DP-lus zodat daar niets gealloceerd wordt. */
  function leegUitkomst() {
    return {geldig: false,
      uitOverschot: 0, uitMatch: 0, uitNet: 0,
      naarIntern: 0, verdringUit: 0, naarEpex: 0,
      match: 0, directExport: 0, afnemerImport: 0, netImport: 0, netExport: 0,
      groepsWaarde: 0, afnemerVoordeel: 0, netUitwisseling: 0, degradatie: 0, doel: 0};
  }

  /**
   * De doelfunctie van één kwartier bij één accu-actie.
   *
   * `acNet` is de netto AC-stroom van de accu in kWh:  > 0 = laden, < 0 = ontladen.
   * `rest` bevat de nog vrije ruimte in dit kwartier: overschot, tekort en het
   * gematchte volume dat verdrongen mag worden.
   *
   * Schrijft in `out` en zet `out.geldig`. Er wordt bewust NIETS gealloceerd: deze
   * functie draait in de binnenste DP-lus, honderden miljoenen keren op een jaar
   * kwartierdata. Eén object of array per aanroep maakt het verschil tussen seconden
   * en minuten.
   *
   * `out.geldig === false` betekent: deze actie mag niet (bijvoorbeeld laden uit het
   * net terwijl dat is uitgeschakeld). De DP verwerpt die transitie dan.
   *
   * DRIE LAADROUTES, in volgorde van wat ze de groep kosten:
   *   1. lokaal overschot        kost het exportalternatief van de producent (EPEX)
   *   2. een interne match verdringen   kost het netalternatief van de afnemer, die
   *      dan zelf van het net koopt. Dit is de route waarin opslag écht met directe
   *      levering concurreert. Ze is alleen goedkoper dan route 3 wanneer laden uit
   *      het net is uitgeschakeld — het model kiest dat zelf, er is geen aparte knop.
   *   3. het net                 kost EPEX + leveringsopslag + eventuele EB
   *
   * DRIE ONTLAADROUTES:
   *   1. een interne afnemer die anders van het net kocht
   *   2. een interne afnemer die anders duurdere opwek kreeg (die opwek exporteert dan)
   *   3. EPEX
   */
  function _uitkomstKwartier(t, acNet, q, s, inst, rest, opt, out) {
    var Sv = rest.surplus, T0 = rest.tekort, Mv = rest.match;
    var pEx = s.pEx[t], pNet = s.pNet[t], pLaad = s.pLaadNet[t],
        pExA = s.pExAccu[t], pUit = s.pUitInt[t], pBat = s.pBat[t];

    var uitOverschot = 0, uitMatch = 0, uitNet = 0;      // laadroutes
    var naarIntern = 0, verdringUit = 0, naarEpex = 0;   // ontlaadroutes
    out.geldig = false;

    if (acNet > EPS) {
      if (s.magUitOpwek[t]) uitOverschot = Sv < acNet ? Sv : acNet;
      var restKwh = acNet - uitOverschot;
      if (restKwh > EPS) {
        var netMag   = opt.gridMag;
        var matchMag = opt.verdringMag && s.magUitOpwek[t] && Mv > EPS;
        if (netMag && (!matchMag || pLaad <= pNet)) {
          uitNet = restKwh; restKwh = 0;
        } else if (matchMag) {
          uitMatch = restKwh < Mv ? restKwh : Mv;
          restKwh -= uitMatch;
          if (restKwh > EPS) {
            if (!netMag) return out;
            uitNet = restKwh; restKwh = 0;
          }
        } else return out;
      }
    } else if (acNet < -EPS) {
      var u = -acNet;
      if (s.magIntern[t]) naarIntern = T0 < u ? T0 : u;
      var over = u - naarIntern;
      if (over > EPS && s.magIntern[t] && Mv > EPS && pBat < q.internMarge[t] - 1e-12) {
        verdringUit = over < Mv ? over : Mv;
        over -= verdringUit;
      }
      if (over > EPS) {
        if (!inst.ontladenNaarEpex) return out;
        naarEpex = over;
      }
    }

    // ── Energieposities van dit kwartier ───────────────────────────────────────
    var match         = Mv - uitMatch - verdringUit;
    var directExport  = Sv - uitOverschot + verdringUit;
    var afnemerImport = T0 + uitMatch - naarIntern;
    var netExport     = directExport + naarEpex;
    var netImport     = afnemerImport + uitNet;

    // ── Groepswaarde: de werkelijke kaspositie van de groep in dit kwartier ────
    // Alleen geld dat de groep IN of UIT gaat telt mee. Interne overdrachten vallen
    // tegen elkaar weg, en dat is hier makkelijk mis te rekenen:
    //
    //   Wat de accu aan een producent betaalt voor opgeslagen opwek is een overdracht
    //   BINNEN de groep. De kost van die kWh voor de groep is uitsluitend de gemiste
    //   exportopbrengst, en die zit al in `directExport` (dat is immers al verlaagd
    //   met wat de accu opnam). Die betaling er nogmaals van aftrekken maakt lokaal
    //   laden twee keer zo duur als het is — waarmee de accu vrijwel nooit meer uit
    //   eigen overschot zou laden.
    //
    // In de VERREKENING telt diezelfde betaling wél: daar is ze een echte kostenpost
    // van de accu-eigenaar en een opbrengst van de producent. Twee boeken, allebei goed.
    //
    // De opslagvergoeding staat hier niet in: ook een overdracht binnen de groep, en
    // dus een verrekeningsafspraak die geen enkele kWh verplaatst. Om dezelfde reden
    // staat LCOS hier niet — capex is verzonken zodra de accu er staat, dus alleen de
    // marginale slijtage stuurt de dispatch.
    var degradatie = (uitOverschot + uitMatch + uitNet + naarIntern + verdringUit + naarEpex) * opt.mkHalf;
    var groepsWaarde = directExport * pEx          // exportopbrengst van de opwek
                     + naarEpex * pExA             // exportopbrengst van de accu
                     - afnemerImport * pNet        // inkoop door de afnemers
                     - uitNet * pLaad              // inkoop door de accu
                     + naarIntern * (pUit - pNet)  // extra boven de vermeden inkoop: vermeden EB
                     - degradatie;

    // ── Afnemersvoordeel: wat de afnemers samen minder betalen dan bij het net ──
    var afnemerVoordeel = match * (pNet - q.internGem[t])
                        + naarIntern * (pNet - pBat)
                        + verdringUit * (q.internMarge[t] - pBat);

    var netUitwisseling = netImport + netExport;

    out.geldig = true;
    out.uitOverschot = uitOverschot; out.uitMatch = uitMatch; out.uitNet = uitNet;
    out.naarIntern = naarIntern; out.verdringUit = verdringUit; out.naarEpex = naarEpex;
    out.match = match; out.directExport = directExport; out.afnemerImport = afnemerImport;
    out.netImport = netImport; out.netExport = netExport;
    out.groepsWaarde = groepsWaarde; out.afnemerVoordeel = afnemerVoordeel;
    out.netUitwisseling = netUitwisseling; out.degradatie = degradatie;
    out.doel = groepsWaarde + inst.wAfnemer * afnemerVoordeel - inst.wNet * netUitwisseling;
    return out;
  }

  /** Leesbare reden bij een uitkomst, voor de kwartier-inspector en het rapport. */
  function redenVan(u) {
    if (!u || !u.geldig) return 'niet toegestaan';
    if (u.uitNet > EPS)       return 'laden uit het net';
    if (u.uitMatch > EPS)     return 'laden uit opwek die anders direct geleverd was';
    if (u.uitOverschot > EPS) return 'laden uit lokaal overschot';
    if (u.naarIntern > EPS)   return 'ontladen naar interne afname';
    if (u.verdringUit > EPS)  return 'ontladen in plaats van duurdere opwek';
    if (u.naarEpex > EPS)     return 'ontladen naar EPEX';
    return 'accu staat stil';
  }

  /**
   * Dynamisch programmeren over gediscretiseerde SoC, met volledige vooruitblik.
   *
   * Dit is dezelfde methode als in `EhpOpslag.dispatch()` — bewust, want ze geeft de
   * maximaal haalbare uitkomst op deze data en is dus de juiste bovengrens. Het
   * verschil zit in de beloningsfunctie: die kijkt hier naar de hele kwartier-
   * uitkomst inclusief de matching, niet naar arbitrage op een vastgezette rest.
   */
  function _dp(q, s, a, inst, rest, opties) {
    var T = q.T;
    var maxAc = a.kW * DT;
    if (!a.kWh || !a.kW || !a.bruikbaar || !T) return null;

    var factor  = opties.fijnheid || 16;
    var niveaus = Math.round(factor * a.bruikbaar / Math.max(1e-9, maxAc));
    niveaus = Math.max(12, Math.min(256, niveaus));
    var stap = a.bruikbaar / niveaus;
    var S    = niveaus + 1;

    var maxOp   = Math.max(1, Math.ceil(maxAc * a.etaLaad / stap));
    var maxNeer = Math.max(1, Math.ceil(maxAc / Math.max(1e-9, a.etaOntlaad) / stap));

    var piekCap   = opties.piekCap || null;
    var piekStraf = opties.piekStraf != null ? opties.piekStraf : 5;

    var opt = dpOpties(a, inst);

    var vorig  = new Float64Array(S).fill(NEG);
    var huidig = new Float64Array(S);
    vorig[0] = 0;                                     // start leeg (socMin)
    var keuze = new Int16Array(T * S);

    var restQ = {surplus: 0, tekort: 0, match: 0};
    var bak = leegUitkomst();
    for (var t = 0; t < T; t++) {
      huidig.fill(NEG);
      var basis = t * S;
      restQ.surplus = rest.surplus[t];
      restQ.tekort  = rest.tekort[t];
      restQ.match   = rest.match[t];
      for (var s0 = 0; s0 < S; s0++) {
        if (vorig[s0] === NEG) continue;
        var v0 = vorig[s0];
        var lo = s0 - maxNeer; if (lo < 0) lo = 0;
        var hi = s0 + maxOp;   if (hi > S - 1) hi = S - 1;
        for (var s2 = lo; s2 <= hi; s2++) {
          var dE = (s2 - s0) * stap;                  // verandering binnen de accu
          var acNet;
          if (dE > 0)      { acNet =  dE / a.etaLaad;   if (acNet  > maxAc + 1e-9) continue; }
          else if (dE < 0) { acNet = dE * a.etaOntlaad; if (-acNet > maxAc + 1e-9) continue; }
          else             { acNet = 0; }
          _uitkomstKwartier(t, acNet, q, s, inst, restQ, opt, bak);
          if (!bak.geldig) continue;
          var w = v0 + bak.doel;
          if (piekCap) {
            var afn = s.netto[t] + (acNet > 0 ? acNet : 0) - (acNet < 0 ? -acNet : 0);
            if (afn > piekCap[t]) w -= (afn - piekCap[t]) * piekStraf;
          }
          if (w > huidig[s2]) { huidig[s2] = w; keuze[basis + s2] = s0; }
        }
      }
      var wissel = vorig; vorig = huidig; huidig = wissel;
    }

    var eind = 0;
    for (var e = 1; e < S; e++) if (vorig[e] > vorig[eind]) eind = e;
    var pad = new Int16Array(T + 1);
    pad[T] = eind;
    for (var t2 = T - 1; t2 >= 0; t2--) pad[t2] = keuze[t2 * S + pad[t2 + 1]];

    return {pad: pad, stap: stap, niveaus: niveaus, S: S, opt: opt, doelwaarde: vorig[eind]};
  }

  global.EhpMatching = {
    MODI: MODI, DOELEN: DOELEN, BESCHERMING: BESCHERMING, VERDELINGEN: VERDELINGEN,
    VELDEN: VELDEN,
    defaults: defaults, lees: lees, isNieuweModus: isNieuweModus,
    routePrijzen: routePrijzen, accuContext: accuContext,
    bereidVoor: bereidVoor, redenVan: redenVan, leegUitkomst: leegUitkomst,
    _intern: {dagen: _dagen, jaarAfname: _jaarAfname, bouwSignaal: _bouwSignaal,
              uitkomstKwartier: _uitkomstKwartier, dp: _dp, dpOpties: dpOpties,
              DT: DT, EPS: EPS, NEG: NEG}
  };

})(window);
