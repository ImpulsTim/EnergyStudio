/* EHP aannameregister — één plek voor elke parameter die het platformmodel stuurt.
   Namespace: window.EHP_PARAMS — geen ES-modules, global scope net als de rest van de app.

   Waarom dit bestaat: de tarieven in het EHP zijn nu ingetypte getallen zonder herkomst.
   Voor een verrekenmethodiek die verdedigbaar moet zijn richting deelnemers moet van elk
   getal zichtbaar zijn wat het is, waar het vandaan komt en of het al gevalideerd is.
   Kostprijzen (LCOE zon, LCOS opslag) horen daarom niet ingetypt te worden maar afgeleid
   uit capex/opex/levensduur/opbrengst — dan is "valideren" een invoerwijziging.

   Statuswaarden:
     'aanname'     — plaatsvervangend getal, nog te onderbouwen
     'gevalideerd' — onderbouwd met een bron die in `bron` staat
     'afgeleid'    — berekend uit andere parameters (niet handmatig in te vullen)
*/
(function (global) {
  'use strict';

  // ─── Parameterdefinities ────────────────────────────────────────────────────
  // key = het veld in plat.cfg. `def` = default. `eenheid` puur voor weergave.
  var DEFS = {
    // — Gelijktijdigheidsvergoeding (huidige vaste tarieven) —
    gel_zon_mwh:        {label:'Vergoeding zon',             eenheid:'€/MWh', groep:'tarief',   def:20,   status:'aanname', bron:''},
    gel_wind_mwh:       {label:'Vergoeding wind',            eenheid:'€/MWh', groep:'tarief',   def:20,   status:'aanname', bron:''},
    gel_ai_mwh:         {label:'Vergoeding afname-invoeden', eenheid:'€/MWh', groep:'tarief',   def:0,    status:'aanname', bron:''},
    platform_mwh:       {label:'Platformtarief',             eenheid:'€/MWh', groep:'tarief',   def:0,    status:'aanname', bron:''},
    gvo_bil_mwh:        {label:'GVO bilateraal',             eenheid:'€/MWh', groep:'tarief',   def:0,    status:'aanname', bron:''},
    gvo_rest_mwh:       {label:'GVO reststroom',             eenheid:'€/MWh', groep:'tarief',   def:0,    status:'aanname', bron:''},

    // — Onbalansrisico —
    onb_zon_pct:        {label:'Onbalansafwijking zon',      eenheid:'fractie', groep:'onbalans', def:0.20, status:'aanname', bron:''},
    onb_wind_pct:       {label:'Onbalansafwijking wind',     eenheid:'fractie', groep:'onbalans', def:0.20, status:'aanname', bron:''},
    onb_vb_pct:         {label:'Onbalansafwijking verbruik', eenheid:'fractie', groep:'onbalans', def:0.08, status:'aanname', bron:''},
    onb_zon_risico_mwh: {label:'Risicoprijs zon',            eenheid:'€/MWh',   groep:'onbalans', def:90,   status:'aanname', bron:''},
    onb_wind_risico_mwh:{label:'Risicoprijs wind',           eenheid:'€/MWh',   groep:'onbalans', def:60,   status:'aanname', bron:''},
    onb_vb_risico_mwh:  {label:'Risicoprijs verbruik',       eenheid:'€/MWh',   groep:'onbalans', def:25,   status:'aanname', bron:''},

    // — Benchmark voor de waardevergelijking —
    retail_opslag_mwh:  {label:'Retailopslag',               eenheid:'€/MWh',   groep:'benchmark', def:20,  status:'aanname',
                         bron:'Na te vragen bij de leverancier; alleen voor de waardevergelijking, niet voor de afrekening.'},

    // — Kostprijs zon (invoer voor LCOE) —
    pv_capex_kwp:       {label:'Capex PV',                   eenheid:'€/kWp',      groep:'kostprijs', def:600, status:'aanname', bron:''},
    pv_opex_kwp_jr:     {label:'Opex PV',                    eenheid:'€/kWp/jr',   groep:'kostprijs', def:12,  status:'aanname', bron:''},
    pv_levensduur_jr:   {label:'Levensduur PV',              eenheid:'jaar',       groep:'kostprijs', def:25,  status:'aanname', bron:''},
    pv_opbrengst_kwp_jr:{label:'Specifieke opbrengst PV',    eenheid:'kWh/kWp/jr', groep:'kostprijs', def:950, status:'aanname', bron:''},
    pv_degradatie_pct:  {label:'Degradatie PV',              eenheid:'%/jr',       groep:'kostprijs', def:0.5, status:'aanname', bron:''},

    // — Kostprijs opslag (invoer voor LCOS) —
    bat_capex_kwh:      {label:'Capex opslag',               eenheid:'€/kWh',      groep:'kostprijs', def:400, status:'aanname', bron:''},
    bat_opex_kwh_jr:    {label:'Opex opslag',                eenheid:'€/kWh/jr',   groep:'kostprijs', def:8,   status:'aanname', bron:''},
    bat_levensduur_jr:  {label:'Levensduur opslag',          eenheid:'jaar',       groep:'kostprijs', def:15,  status:'aanname', bron:''},
    bat_cycli_jr:       {label:'Cycli per jaar',             eenheid:'cycli/jr',   groep:'kostprijs', def:365, status:'aanname',
                         bron:'Bepaalt de kostprijs per kWh sterk; controleer tegen het werkelijke cyclusgebruik uit de dispatch.'},
    bat_dod_pct:        {label:'Ontlaaddiepte (DoD)',        eenheid:'%',          groep:'kostprijs', def:90,  status:'aanname', bron:''},
    bat_eta_retour_pct: {label:'Retourrendement',            eenheid:'%',          groep:'kostprijs', def:88,  status:'aanname', bron:''},
    bat_degradatie_pct: {label:'Degradatie opslag',          eenheid:'%/jr',       groep:'kostprijs', def:2,   status:'aanname', bron:''},

    // — Financieel kader —
    disconto_pct:       {label:'Disconteringsvoet',          eenheid:'%',          groep:'kostprijs', def:5,   status:'aanname', bron:''},

    // — Fiscaal —
    ebJaar:             {label:'EB-jaarstaffel',             eenheid:'jaar', groep:'fiscaal', def:'2025',  status:'gevalideerd',
                         bron:'Officiële NL-tarieven, zie REKEN_DEFAULTS.energiebelasting in rekenkern.js'},
    ebGrondslag:        {label:'EB-grondslag',               eenheid:'',     groep:'fiscaal', def:'bruto', status:'aanname',
                         bron:'Afhankelijk van de juridische leveringsstructuur.'},
    heffingskorting:    {label:'Heffingskorting',            eenheid:'€/jr', groep:'fiscaal', def:0,       status:'aanname', bron:''},
    btwPct:             {label:'Btw',                        eenheid:'%',    groep:'fiscaal', def:21,      status:'gevalideerd', bron:'Algemeen tarief.'}
  };

  var GROEP_LBL = {
    tarief:   'Tarieven',
    onbalans: 'Onbalansrisico',
    benchmark:'Benchmark',
    kostprijs:'Kostprijs en financiering',
    fiscaal:  'Fiscaal'
  };

  // ─── Toegang ────────────────────────────────────────────────────────────────

  function get(key) { return DEFS[key] || null; }

  /** Alle definities, optioneel gefilterd op groep, als [{key, ...def}]. */
  function lijst(groep) {
    return Object.keys(DEFS)
      .filter(function (k) { return !groep || DEFS[k].groep === groep; })
      .map(function (k) {
        var d = DEFS[k], o = {key: k};
        for (var p in d) o[p] = d[p];
        return o;
      });
  }

  /** Waarde uit cfg met terugval op de default. */
  function waarde(cfg, key) {
    var d = DEFS[key];
    if (!cfg || cfg[key] == null) return d ? d.def : null;
    return cfg[key];
  }

  /** Defaults als vlak object — voor _ehpDefaults() en migratie van oude platforms. */
  function defaults(groep) {
    var o = {};
    lijst(groep).forEach(function (d) { o[d.key] = d.def; });
    return o;
  }

  /**
   * Rijen voor het aannameblad: per parameter de actuele waarde, eenheid, status en bron.
   * Afgeleide grootheden (LCOE/LCOS) worden erbij gezet zodat het blad compleet is.
   */
  function blad(cfg) {
    var rows = lijst().map(function (d) {
      return {key:d.key, groep:d.groep, groepLabel:GROEP_LBL[d.groep] || d.groep,
              label:d.label, eenheid:d.eenheid, waarde:waarde(cfg, d.key),
              status:d.status, bron:d.bron};
    });
    rows.push({key:'_lcoe_zon', groep:'kostprijs', groepLabel:GROEP_LBL.kostprijs,
      label:'Kostprijs zon (LCOE)', eenheid:'€/kWh', waarde:lcoeUitCfg(cfg), status:'afgeleid',
      bron:'Berekend uit capex, opex, levensduur, opbrengst, degradatie en disconto.'});
    rows.push({key:'_lcos_opslag', groep:'kostprijs', groepLabel:GROEP_LBL.kostprijs,
      label:'Kostprijs opslag (LCOS)', eenheid:'€/kWh afgeleverd', waarde:lcosUitCfg(cfg), status:'afgeleid',
      bron:'Berekend uit capex, opex, levensduur, cycli, DoD, rendement en disconto. Exclusief de inkoopprijs van de geladen stroom.'});
    return rows;
  }

  // ─── Afgeleide kostprijzen ──────────────────────────────────────────────────

  /**
   * LCOE: contante waarde van alle kosten gedeeld door de contante waarde van alle
   * opgewekte kWh. Beide reeksen worden gedisconteerd — dat is de correcte definitie;
   * alleen de kosten disconteren geeft een te lage uitkomst.
   *   {capex, opexPerJaar, levensduurJr, opbrengstKwhPerJr, degradatiePctPerJr, discontoPct}
   * Alle bedragen per dezelfde eenheid (bijv. alles per kWp) → resultaat in EUR/kWh.
   */
  function lcoe(o) {
    o = o || {};
    var capex = +o.capex || 0;
    var opex  = +o.opexPerJaar || 0;
    var n     = Math.max(1, Math.round(+o.levensduurJr || 1));
    var r     = (+o.discontoPct || 0) / 100;
    var deg   = (+o.degradatiePctPerJr || 0) / 100;
    var e0    = +o.opbrengstKwhPerJr || 0;
    var pvKosten = capex, pvEnergie = 0;
    for (var t = 1; t <= n; t++) {
      var disc = Math.pow(1 + r, t);
      pvKosten  += opex / disc;
      pvEnergie += e0 * Math.pow(1 - deg, t - 1) / disc;
    }
    return pvEnergie > 0 ? pvKosten / pvEnergie : 0;
  }

  /**
   * LCOS: kosten per afgeleverde kWh, EXCLUSIEF de inkoopprijs van de geladen stroom.
   * Dat is bewust: in het platformmodel is "prijs van opslag" een dienst bovenop de
   * energieprijs, niet de totale kostprijs van de geleverde kWh.
   *
   * Conventie voor een cyclus: per cyclus wordt `kWhNominaal x DoD` ingeladen; daarvan
   * komt `x eta_retour` er aan de AC-zijde weer uit. Afgeleverd per jaar is dus
   *   cycli x kWhNominaal x DoD x eta_retour.
   *   {capexPerKwh, opexPerKwhJr, levensduurJr, cycliPerJaar, dodPct, etaRetourPct,
   *    degradatiePctPerJr, discontoPct}
   */
  function lcos(o) {
    o = o || {};
    var capex = +o.capexPerKwh || 0;
    var opex  = +o.opexPerKwhJr || 0;
    var n     = Math.max(1, Math.round(+o.levensduurJr || 1));
    var r     = (+o.discontoPct || 0) / 100;
    var deg   = (+o.degradatiePctPerJr || 0) / 100;
    var uit0  = (+o.cycliPerJaar || 0) * ((+o.dodPct || 0) / 100) * ((+o.etaRetourPct || 0) / 100);
    var pvKosten = capex, pvEnergie = 0;
    for (var t = 1; t <= n; t++) {
      var disc = Math.pow(1 + r, t);
      pvKosten  += opex / disc;
      pvEnergie += uit0 * Math.pow(1 - deg, t - 1) / disc;
    }
    return pvEnergie > 0 ? pvKosten / pvEnergie : 0;
  }

  function lcoeUitCfg(cfg) {
    return lcoe({
      capex:              waarde(cfg, 'pv_capex_kwp'),
      opexPerJaar:        waarde(cfg, 'pv_opex_kwp_jr'),
      levensduurJr:       waarde(cfg, 'pv_levensduur_jr'),
      opbrengstKwhPerJr:  waarde(cfg, 'pv_opbrengst_kwp_jr'),
      degradatiePctPerJr: waarde(cfg, 'pv_degradatie_pct'),
      discontoPct:        waarde(cfg, 'disconto_pct')
    });
  }

  function lcosUitCfg(cfg) {
    return lcos({
      capexPerKwh:        waarde(cfg, 'bat_capex_kwh'),
      opexPerKwhJr:       waarde(cfg, 'bat_opex_kwh_jr'),
      levensduurJr:       waarde(cfg, 'bat_levensduur_jr'),
      cycliPerJaar:       waarde(cfg, 'bat_cycli_jr'),
      dodPct:             waarde(cfg, 'bat_dod_pct'),
      etaRetourPct:       waarde(cfg, 'bat_eta_retour_pct'),
      degradatiePctPerJr: waarde(cfg, 'bat_degradatie_pct'),
      discontoPct:        waarde(cfg, 'disconto_pct')
    });
  }

  /**
   * Minimale ontlaadprijs om een laadbeslissing rendabel te maken.
   * Let op de deling door het rendement: laad je voor 6 ct bij eta=0,88, dan kost de
   * afgeleverde kWh al 6/0,88 = 6,8 ct voor opslagkosten. De drempel is dus
   * `laadprijs / eta + opslagkosten`, niet `laadprijs + opslagkosten`.
   */
  function minimaleOntlaadprijs(laadprijsPerKwh, etaRetourPct, lcosPerKwh) {
    var eta = (+etaRetourPct || 100) / 100;
    return (+laadprijsPerKwh || 0) / (eta > 0 ? eta : 1) + (+lcosPerKwh || 0);
  }

  /** De spread die minimaal nodig is: ontlaadprijs − laadprijs. */
  function spreadNodig(laadprijsPerKwh, etaRetourPct, lcosPerKwh) {
    return minimaleOntlaadprijs(laadprijsPerKwh, etaRetourPct, lcosPerKwh) - (+laadprijsPerKwh || 0);
  }

  // ─── Export ─────────────────────────────────────────────────────────────────
  global.EHP_PARAMS = {
    DEFS:                 DEFS,
    GROEP_LBL:            GROEP_LBL,
    get:                  get,
    lijst:                lijst,
    waarde:               waarde,
    defaults:             defaults,
    blad:                 blad,
    lcoe:                 lcoe,
    lcos:                 lcos,
    lcoeUitCfg:           lcoeUitCfg,
    lcosUitCfg:           lcosUitCfg,
    minimaleOntlaadprijs: minimaleOntlaadprijs,
    spreadNodig:          spreadNodig
  };

})(window);
