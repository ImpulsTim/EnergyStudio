/* EHP prijsmodel — de prijs van een bron als functie van het kwartier, niet als constante.
   Namespace: window.EhpPrijs — global scope, geen build.

   Het probleem dat dit oplost: met een vast gelijktijdigheidstarief betaalt de afnemer elk
   kwartier waarin de marktprijs onder dat tarief zit te veel. Het oude model kon daar niet op
   reageren, want er stond één getal waar een formule hoort.

   Vier families, per brontype (zon/wind/afname_invoeden/opslag) los in te stellen:

     vast            P = tarief                        huidig gedrag; regressiereferentie
     collar          P = klem(EPEX, vloer, plafond)    hedge: vloer dekt de producent,
                                                       plafond begrenst de afnemer
     epex_gekoppeld  P = EPEX x factor - korting       afnemer wint altijd t.o.v. markt;
                                                       producent draagt het marktrisico
     tweeledig       P = EPEX + opslag, plus een       kostprijsdekking los van het uurtarief;
                     capaciteitsvergoeding EUR/kWp/jr  afnemer betaalt per kWh nooit boven markt

   Belangrijk om niet te verwarren bij de collar: die zorgt er NIET voor dat de afnemer nooit
   boven de markt betaalt. Integendeel — onder de vloer betaalt hij per definitie meer dan de
   markt. Dat is de prijs van het dekken van de producent. Wat de collar wel doet, is die
   overbetaling begrenzen en er in dure uren een korting tegenover zetten. De vraag is dus niet
   of het per kwartier duurder is, maar wat het over het jaar NETTO doet. `waardeVergelijking()`
   rekent dat uit.

   Alle configuratiewaarden staan in EUR/MWh (zoals de rest van de EHP-UI); intern wordt met
   EUR/kWh gerekend. Conversie gebeurt uitsluitend hier.
*/
(function (global) {
  'use strict';

  var BRONNEN = ['zon', 'wind', 'afname_invoeden', 'opslag'];

  // ─── Vormdefinities (sturen ook de UI en het aannameblad) ───────────────────
  var VORMEN = {
    vast: {
      label: 'Vast tarief',
      uitleg: 'Eén tarief voor alle uren. Voorspelbaar, maar reageert niet op de markt.',
      velden: [{key:'tarief_mwh', label:'Tarief', eenheid:'€/MWh', def:20}]
    },
    collar: {
      label: 'Collar (vloer en plafond)',
      uitleg: 'Volgt de marktprijs, maar nooit onder de vloer en nooit boven het plafond. ' +
              'De vloer dekt de kostprijs van de producent, het plafond begrenst wat de afnemer betaalt.',
      velden: [
        {key:'vloer_mwh',   label:'Vloer',   eenheid:'€/MWh', def:57},
        {key:'plafond_mwh', label:'Plafond', eenheid:'€/MWh', def:120}
      ]
    },
    epex_gekoppeld: {
      label: 'EPEX-gekoppeld',
      uitleg: 'Marktprijs maal een factor, min een korting. De afnemer zit per definitie onder ' +
              'de markt; het marktrisico ligt bij de producent.',
      velden: [
        {key:'factor',      label:'Factor',       eenheid:'×',     def:1},
        {key:'korting_mwh', label:'Korting',      eenheid:'€/MWh', def:5},
        {key:'vloer_mwh',   label:'Vloer (opt.)', eenheid:'€/MWh', def:0}
      ]
    },
    tweeledig: {
      label: 'Tweeledig (capaciteit + EPEX)',
      uitleg: 'De energie gaat tegen marktprijs, de kostprijs wordt gedekt door een vaste ' +
              'vergoeding per kWp per jaar. Ontkoppelt kostprijsdekking van het uurtarief.',
      velden: [
        {key:'opslag_mwh',          label:'Opslag op EPEX',        eenheid:'€/MWh',   def:0},
        {key:'capaciteit_kwp_jr',   label:'Capaciteitsvergoeding', eenheid:'€/kWp/jr', def:55}
      ]
    }
  };

  function _mwhNaarKwh(x) { return (+x || 0) / 1000; }
  function _klem(x, lo, hi) { return Math.min(Math.max(x, lo), hi); }

  // ─── Migratie van de oude platte cfg ────────────────────────────────────────

  /**
   * Bestaande platforms hebben `gel_zon_mwh` / `gel_wind_mwh` / `gel_ai_mwh` en geen
   * `cfg.prijsmodel`. Die worden hier omgezet naar de vaste vorm, zodat ze exact dezelfde
   * getallen blijven geven en de regressietest slaagt zonder handmatige migratie.
   */
  function migreer(cfg) {
    cfg = cfg || {};
    if (cfg.prijsmodel) return cfg.prijsmodel;
    return {
      zon:             {vorm:'vast', tarief_mwh: +cfg.gel_zon_mwh  || 0},
      wind:            {vorm:'vast', tarief_mwh: +cfg.gel_wind_mwh || 0},
      afname_invoeden: {vorm:'vast', tarief_mwh: +cfg.gel_ai_mwh   || 0},
      opslag:          {vorm:'vast', tarief_mwh: 0}
    };
  }

  /** Volledige defaultconfiguratie (alle bronnen op 'vast'), voor een nieuw platform. */
  function defaults() {
    var o = {};
    BRONNEN.forEach(function (b) {
      o[b] = {vorm:'vast', tarief_mwh: (b === 'zon' || b === 'wind') ? 20 : 0};
    });
    return o;
  }

  // ─── Prijsberekening ────────────────────────────────────────────────────────

  /**
   * Eén prijs, plus het spoor waarmee die prijs verklaard wordt.
   * ctx = {epex} in EUR/kWh.
   * Geeft {prijs, vorm, formule, invulling} — `invulling` is de formule met de werkelijke
   * getallen erin, bedoeld voor de kwartier-inspector en de formule-uitklap.
   */
  function _bereken(inst, epex) {
    var v = inst.vorm, p = inst.p;
    var ct = function (x) { return (x * 100).toFixed(2); };   // EUR/kWh -> ct/kWh, voor leesbaarheid

    if (v === 'collar') {
      var prijs = _klem(epex, p.vloer, p.plafond);
      var reden = epex < p.vloer  ? 'markt onder de vloer — vloer geldt'
                : epex > p.plafond ? 'markt boven het plafond — plafond geldt'
                                   : 'markt tussen vloer en plafond — markt geldt';
      return {prijs: prijs, vorm: v,
        formule: 'klem(EPEX, vloer, plafond)',
        invulling: 'klem(' + ct(epex) + '; ' + ct(p.vloer) + '; ' + ct(p.plafond) + ') = ' +
                   ct(prijs) + ' ct/kWh — ' + reden};
    }
    if (v === 'epex_gekoppeld') {
      var ruw = epex * p.factor - p.korting;
      var pr  = p.vloer != null ? Math.max(ruw, p.vloer) : ruw;
      return {prijs: pr, vorm: v,
        formule: 'EPEX × factor − korting' + (p.vloer != null ? ', met vloer' : ''),
        invulling: ct(epex) + ' × ' + p.factor + ' − ' + ct(p.korting) + ' = ' + ct(ruw) +
                   (pr !== ruw ? ' → opgetrokken naar de vloer ' + ct(pr) : '') + ' ct/kWh'};
    }
    if (v === 'tweeledig') {
      var pt = epex + p.opslag;
      return {prijs: pt, vorm: v,
        formule: 'EPEX + opslag (capaciteitsvergoeding loopt apart)',
        invulling: ct(epex) + ' + ' + ct(p.opslag) + ' = ' + ct(pt) + ' ct/kWh; ' +
                   'kostprijsdekking via € ' + p.capaciteit + '/kWp/jr buiten de kWh-prijs om'};
    }
    // 'vast' en onbekende vormen
    return {prijs: p.tarief, vorm: 'vast',
      formule: 'vast tarief',
      invulling: ct(p.tarief) + ' ct/kWh, ongeacht de marktprijs'};
  }

  /**
   * Bouwt een prijsmodel-instantie uit de configuratie.
   * Retourneert {prijsVoor, spoorVoor, capaciteitsvergoeding, beschrijf, vormVan}.
   */
  function maak(prijsmodel) {
    prijsmodel = prijsmodel || defaults();
    var inst = {};

    BRONNEN.forEach(function (bron) {
      var c = prijsmodel[bron] || {vorm:'vast', tarief_mwh:0};
      var vorm = VORMEN[c.vorm] ? c.vorm : 'vast';
      var p;
      if (vorm === 'collar') {
        p = {vloer:   _mwhNaarKwh(c.vloer_mwh),
             plafond: c.plafond_mwh == null ? Infinity : _mwhNaarKwh(c.plafond_mwh)};
      } else if (vorm === 'epex_gekoppeld') {
        p = {factor:  c.factor == null ? 1 : +c.factor,
             korting: _mwhNaarKwh(c.korting_mwh),
             vloer:   c.vloer_mwh == null ? null : _mwhNaarKwh(c.vloer_mwh)};
      } else if (vorm === 'tweeledig') {
        p = {opslag:     _mwhNaarKwh(c.opslag_mwh),
             capaciteit: +c.capaciteit_kwp_jr || 0};
      } else {
        p = {tarief: _mwhNaarKwh(c.tarief_mwh)};
      }
      inst[bron] = {vorm: vorm, p: p, cfg: c};
    });

    function _voor(bron) {
      return inst[bron] || inst.zon || {vorm:'vast', p:{tarief:0}, cfg:{}};
    }

    return {
      /** Prijs in EUR/kWh voor dit brontype bij deze marktprijs (EUR/kWh). */
      prijsVoor: function (bron, epex) {
        return _bereken(_voor(bron), +epex || 0).prijs;
      },
      /** Zelfde berekening, met formule en ingevulde getallen erbij. */
      spoorVoor: function (bron, epex) {
        return _bereken(_voor(bron), +epex || 0);
      },
      /**
       * Capaciteitsvergoeding voor de periode (EUR). Alleen de vorm 'tweeledig' kent er een.
       * kWp = opgesteld vermogen, dagen = lengte van de doorgerekende periode.
       */
      capaciteitsvergoeding: function (bron, kWp, dagen) {
        var i = _voor(bron);
        if (i.vorm !== 'tweeledig') return 0;
        return (+kWp || 0) * i.p.capaciteit * ((+dagen || 0) / 365);
      },
      heeftCapaciteitsdeel: function (bron) { return _voor(bron).vorm === 'tweeledig'; },
      vormVan: function (bron) { return _voor(bron).vorm; },
      /** Leesbare beschrijving per bron, voor het aannameblad en de UI. */
      beschrijf: function (bron) {
        var i = _voor(bron), d = VORMEN[i.vorm];
        return {bron: bron, vorm: i.vorm, label: d.label, uitleg: d.uitleg, params: i.cfg};
      },
      config: prijsmodel
    };
  }

  // ─── Waardevergelijking over de hele periode ────────────────────────────────

  /**
   * Wat doet het prijsmodel netto, over alle gematchte kWh?
   * Per kwartier is de vergelijking met de markt soms positief en soms negatief; de vraag die
   * telt is de som. Retourneert bedragen in EUR plus de gewogen gemiddelde prijzen.
   *
   * rijen = [{gelijktijdig_kWh, epex_eur_per_kWh, prijs_eur_per_kWh}] per kwartier per bron.
   */
  function waardeVergelijking(rijen, retailOpslagPerKwh) {
    var r = {kWh:0, kostenPlatform:0, kostenMarkt:0, kostenRetail:0,
             kwartierenBoveMarkt:0, kwartierenOnderMarkt:0,
             maxBovenMarktPerKwh:0, maxOnderMarktPerKwh:0};
    (rijen || []).forEach(function (x) {
      var kwh = +x.gelijktijdig_kWh || 0;
      if (kwh <= 0) return;
      var epex = +x.epex_eur_per_kWh || 0;
      var pp   = +x.prijs_eur_per_kWh || 0;
      r.kWh            += kwh;
      r.kostenPlatform += kwh * pp;
      r.kostenMarkt    += kwh * epex;
      r.kostenRetail   += kwh * (epex + (+retailOpslagPerKwh || 0));
      var delta = pp - epex;
      if (delta > 0) { r.kwartierenBoveMarkt++;  if (delta > r.maxBovenMarktPerKwh) r.maxBovenMarktPerKwh = delta; }
      if (delta < 0) { r.kwartierenOnderMarkt++; if (-delta > r.maxOnderMarktPerKwh) r.maxOnderMarktPerKwh = -delta; }
    });
    r.nettoVsMarkt  = r.kostenPlatform - r.kostenMarkt;    // > 0 = afnemer betaalt netto meer dan de markt
    r.nettoVsRetail = r.kostenRetail - r.kostenPlatform;   // > 0 = afnemer is beter af dan retail
    r.gemPlatformPerKwh = r.kWh > 0 ? r.kostenPlatform / r.kWh : 0;
    r.gemMarktPerKwh    = r.kWh > 0 ? r.kostenMarkt / r.kWh : 0;
    return r;
  }

  // ─── Export ─────────────────────────────────────────────────────────────────
  global.EhpPrijs = {
    BRONNEN:            BRONNEN,
    VORMEN:             VORMEN,
    maak:               maak,
    migreer:            migreer,
    defaults:           defaults,
    waardeVergelijking: waardeVergelijking
  };

})(window);
