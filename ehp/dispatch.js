/* EHP dispatch — merit order per kwartier op marginale prijs in plaats van op prioriteitsnummer.
   Namespace: window.EhpDispatch — global scope, geen build.

   Het oude `allocateOpwekPriority()` stapelt opwek op een integer `Prioriteit`. Er komt geen
   prijs aan te pas, en er is dus ook geen plek waar opslag als bron/afnemer kan meedoen.
   Deze module generaliseert dat naar een stapeling op prijs, met het prioriteitsnummer als
   contractuele override bij gelijke prijs.

   Terugvaleigenschap (belangrijk): met `volgorde:'prioriteit'` en geen drempel is de uitkomst
   regel voor regel identiek aan `allocateOpwekPriority()`. Dat maakt het oude model een harde
   regressiebasis — zie `vergelijkMetReferentie()`.

   De allocator wordt in `EnergieModel.buildModel()` geinjecteerd via `inputs.allocator`, zodat
   alle omliggende stappen (prosumer-correctie, mastertijdlijn, aggregatie, economische kolommen,
   forward, deelnemersuitsplitsing) ongewijzigd hergebruikt worden. Eén implementatie per stap.
*/
(function (global) {
  'use strict';

  var EPS = 1e-9;

  // ─── EPEX-index ─────────────────────────────────────────────────────────────

  /**
   * Prijs per tijdsleutel in EUR/kWh. Dubbele sleutels (najaars-DST levert 02:00–02:45 tweemaal)
   * worden gemiddeld — dezelfde afspraak als in `EnergieModel.buildModel()`, waar deze index
   * onafhankelijk wordt opgebouwd. Wijzigt de ene, wijzig dan ook de andere.
   */
  function epexIndex(epexRows) {
    var som = {}, aantal = {};
    (epexRows || []).forEach(function (r) {
      som[r.tijdKey]    = (som[r.tijdKey] || 0) + r.epex_eur_per_kWh;
      aantal[r.tijdKey] = (aantal[r.tijdKey] || 0) + 1;
    });
    var idx = {};
    Object.keys(som).forEach(function (k) { idx[k] = som[k] / aantal[k]; });
    return idx;
  }

  // ─── Kern: één kwartier alloceren ───────────────────────────────────────────

  /**
   * Deelt de vraag van één kwartier over de aanbieders volgens de merit order.
   * Retourneert {regels, groepen} — `groepen` is het spoor voor de kwartier-inspector.
   */
  function _alloceerKwartier(assets, vraag, opt) {
    // Groeperen op de sorteersleutel: bij 'prijs' delen gelijk geprijsde aanbieders pro rata,
    // bij 'prioriteit' delen aanbieders met hetzelfde prioriteitsnummer pro rata (= oud gedrag).
    var opPrijs = opt.volgorde === 'prijs';
    var groepen = {};
    for (var i = 0; i < assets.length; i++) {
      var a = assets[i];
      // Afronden op 1e-9 EUR/kWh voorkomt dat drijvendekommaruis gelijke prijzen uit elkaar trekt.
      var prijsKey = opPrijs ? Math.round((a._prijs || 0) * 1e9) : 0;
      var k = prijsKey + '|' + a.Prioriteit;
      if (!groepen[k]) {
        groepen[k] = {prijs: a._prijs || 0, prio: a.Prioriteit, aanbod: 0, assets: []};
      }
      groepen[k].aanbod += a.opwek_kWh;
      groepen[k].assets.push(a);
    }

    var lijst = Object.keys(groepen).map(function (k) { return groepen[k]; });
    lijst.sort(function (a, b) {
      if (opPrijs && a.prijs !== b.prijs) return a.prijs - b.prijs;   // goedkoopste eerst
      return a.prio - b.prio;                                          // contractuele volgorde
    });

    var regels = [], spoor = [];
    var cumAanbod = 0;

    for (var g = 0; g < lijst.length; g++) {
      var grp = lijst[g];

      // Drempel 'afnemer': niet matchen als de interne prijs boven het netalternatief van de
      // afnemer ligt. Dan is de afnemer met netinkoop goedkoper uit en de producent met export
      // op EPEX niet slechter af. De overgeslagen opwek telt niet mee in de stapeling.
      if (opt.drempel === 'afnemer' && grp.prijs > opt.grensAfnemer + EPS) {
        grp.assets.forEach(function (a) {
          regels.push(_regel(a, 0, a.opwek_kWh));
        });
        spoor.push({prijs: grp.prijs, prio: grp.prio, aanbod: grp.aanbod, gematcht: 0,
          overschot: grp.aanbod, reden: 'boven het netalternatief van de afnemer (' +
          (opt.grensAfnemer * 100).toFixed(2) + ' ct/kWh) — niet intern verrekend',
          assets: grp.assets.map(function (a) { return a.Asset; })});
        continue;
      }

      var resterend   = Math.max(0, vraag - cumAanbod);
      var groepGelijk = Math.min(grp.aanbod, resterend);
      for (var ai = 0; ai < grp.assets.length; ai++) {
        var a2 = grp.assets[ai];
        var gelijk = grp.aanbod > 0 ? (a2.opwek_kWh / grp.aanbod) * groepGelijk : 0;
        regels.push(_regel(a2, gelijk, Math.max(0, a2.opwek_kWh - gelijk)));
      }
      spoor.push({prijs: grp.prijs, prio: grp.prio, aanbod: grp.aanbod, gematcht: groepGelijk,
        overschot: grp.aanbod - groepGelijk,
        reden: groepGelijk >= grp.aanbod - EPS ? 'volledig gematcht'
             : groepGelijk > EPS                ? 'gedeeltelijk gematcht — vraag raakte op'
             : vraag <= EPS                     ? 'geen vraag in de groep dit kwartier'
                                                : 'vraag al gedekt door goedkopere/hogere bronnen',
        assets: grp.assets.map(function (a) { return a.Asset; })});
      cumAanbod += grp.aanbod;
    }

    return {regels: regels, groepen: spoor, gedekt: Math.min(vraag, cumAanbod)};
  }

  function _regel(a, gelijk, oversch) {
    return {
      'Tijd (UTC)':      a['Tijd (UTC)'],
      tijdKey:           a.tijdKey,
      Asset:             a.Asset,
      Type:              a.Type,
      Type_norm:         a.Type_norm,
      Prioriteit:        a.Prioriteit,
      opwek_kWh:         a.opwek_kWh,
      Gebruiker:         a.Gebruiker || '',
      gelijktijdig_kWh:  gelijk,
      overschot_kWh:     oversch,
      prijs_eur_per_kWh: a._prijs || 0
    };
  }

  // ─── Allocator-fabriek ──────────────────────────────────────────────────────

  /**
   * Bouwt de functie die `EnergieModel.buildModel()` als `inputs.allocator` verwacht:
   *   (opwekRows, verbruikByTijd) -> allocatieregels
   *
   * opties:
   *   volgorde       'prijs' | 'prioriteit'   (default 'prioriteit' = referentiegedrag)
   *   prijsModel     instantie uit EhpPrijs.maak()
   *   epexByTijd     index uit epexIndex()
   *   drempel        'geen' | 'afnemer'       (default 'geen' = referentiegedrag)
   *   afnemerOpslag  EUR/kWh bovenop EPEX als netalternatief van de afnemer
   */
  function maakAllocator(opties) {
    var o = opties || {};
    var volgorde      = o.volgorde === 'prijs' ? 'prijs' : 'prioriteit';
    var drempel       = o.drempel === 'afnemer' ? 'afnemer' : 'geen';
    var prijsModel    = o.prijsModel || null;
    var epexByTijd    = o.epexByTijd || {};
    var afnemerOpslag = +o.afnemerOpslag || 0;

    // Bewaard voor verklaarKwartier(): geen volledige trace tijdens de hoofdrun, want dat kost
    // geheugen op 35.000 kwartieren. Eén kwartier wordt op verzoek opnieuw doorgerekend.
    var laatste = {assets: null, vraag: null};

    function prijsVan(rij) {
      if (!prijsModel) return 0;
      return prijsModel.prijsVoor(rij.Type_norm, epexByTijd[rij.tijdKey] || 0);
    }

    function groepeerPerTijd(opwekRows) {
      var perTijd = {};
      for (var i = 0; i < opwekRows.length; i++) {
        var r = opwekRows[i];
        if (!perTijd[r.tijdKey]) perTijd[r.tijdKey] = [];
        var kopie = {};
        for (var k in r) kopie[k] = r[k];
        kopie._prijs = prijsVan(r);
        perTijd[r.tijdKey].push(kopie);
      }
      return perTijd;
    }

    function allocator(opwekRows, verbruikByTijd) {
      var perTijd = groepeerPerTijd(opwekRows || []);
      laatste.assets = perTijd;
      laatste.vraag  = verbruikByTijd || {};
      var uit = [];
      var sleutels = Object.keys(perTijd).sort();
      for (var t = 0; t < sleutels.length; t++) {
        var tk = sleutels[t];
        var res = _alloceerKwartier(perTijd[tk], (verbruikByTijd || {})[tk] || 0, {
          volgorde: volgorde, drempel: drempel,
          grensAfnemer: (epexByTijd[tk] || 0) + afnemerOpslag
        });
        for (var r2 = 0; r2 < res.regels.length; r2++) uit.push(res.regels[r2]);
      }
      return uit;
    }

    /** Volledige doorrekening van één kwartier, voor de kwartier-inspector. */
    allocator.verklaarKwartier = function (tijdKey) {
      if (!laatste.assets || !laatste.assets[tijdKey]) return null;
      var epex  = epexByTijd[tijdKey] || 0;
      var vraag = laatste.vraag[tijdKey] || 0;
      var res = _alloceerKwartier(laatste.assets[tijdKey], vraag, {
        volgorde: volgorde, drempel: drempel, grensAfnemer: epex + afnemerOpslag
      });
      var gematcht = res.groepen.reduce(function (s, g) { return s + g.gematcht; }, 0);
      return {
        tijdKey: tijdKey, epex: epex, vraag: vraag,
        volgorde: volgorde, drempel: drempel,
        grensAfnemer: epex + afnemerOpslag,
        groepen: res.groepen,
        gematcht: gematcht,
        tekort: Math.max(0, vraag - gematcht),
        prijsSporen: prijsModel ? _sporen(laatste.assets[tijdKey], prijsModel, epex) : []
      };
    };

    allocator.opties = {volgorde: volgorde, drempel: drempel, afnemerOpslag: afnemerOpslag};
    return allocator;
  }

  function _sporen(assets, prijsModel, epex) {
    var gezien = {}, uit = [];
    assets.forEach(function (a) {
      if (gezien[a.Type_norm]) return;
      gezien[a.Type_norm] = 1;
      var s = prijsModel.spoorVoor(a.Type_norm, epex);
      uit.push({bron: a.Type_norm, vorm: s.vorm, formule: s.formule,
                invulling: s.invulling, prijs: s.prijs});
    });
    return uit;
  }

  // ─── Regressie tegen het referentiemodel ────────────────────────────────────

  /**
   * Draait `EnergieModel.buildModel()` twee keer op dezelfde invoer — één keer zonder allocator
   * (het overgenomen model) en één keer met de nieuwe allocator op referentie-instellingen — en
   * vergelijkt alle numerieke modelkolommen.
   * Retourneert {gelijk, aantalVerschillen, verschillen, totalen}.
   */
  function vergelijkMetReferentie(inputs, allocator) {
    var ref = global.EnergieModel.buildModel(inputs);
    var kopie = {}; for (var k in inputs) kopie[k] = inputs[k];
    kopie.allocator = allocator || maakAllocator({volgorde: 'prioriteit'});
    var nieuw = global.EnergieModel.buildModel(kopie);

    var kolommen = global.EnergieModel.MODEL_NUMERIC_COLS;
    var verschillen = [];
    var n = Math.min(ref.model.length, nieuw.model.length);
    if (ref.model.length !== nieuw.model.length) {
      verschillen.push({rij: -1, kolom: '(aantal rijen)',
        referentie: ref.model.length, nieuw: nieuw.model.length,
        delta: nieuw.model.length - ref.model.length});
    }
    for (var i = 0; i < n && verschillen.length < 25; i++) {
      for (var c = 0; c < kolommen.length; c++) {
        var kol = kolommen[c];
        var a = +ref.model[i][kol], b = +nieuw.model[i][kol];
        if (!isFinite(a) || !isFinite(b)) continue;
        if (Math.abs(a - b) > 1e-6) {
          verschillen.push({rij: i, tijdKey: ref.model[i].tijdKey, kolom: kol,
                            referentie: a, nieuw: b, delta: b - a});
        }
      }
    }
    var totalen = {};
    ['totaal_verbruik_kWh', 'totaal_opwek_kWh', 'gelijktijdig_kWh', 'tekort_kWh',
     'overschot_kWh', 'kosten_totaal_EUR'].forEach(function (kol) {
      var sr = ref.samenvatting[kol] || 0, sn = nieuw.samenvatting[kol] || 0;
      totalen[kol] = {referentie: sr, nieuw: sn, delta: sn - sr};
    });
    return {gelijk: verschillen.length === 0, aantalVerschillen: verschillen.length,
            verschillen: verschillen, totalen: totalen};
  }

  // ─── Variabele prijzen doorvoeren in de economische kolommen ────────────────

  /**
   * `EnergieModel.applyEconomicColumns()` rekent de gelijktijdigheidskosten met één vast tarief
   * per brontype.
   * Zodra een bron een niet-vaste prijsvorm heeft, klopt dat niet meer: de prijs verschilt per
   * kwartier. Deze functie rekent die kolommen opnieuw uit de werkelijke allocatieprijzen en
   * herbouwt daarna alles wat ervan afhangt (totaal, samenvatting, deelnemersuitsplitsing).
   *
   * Voor de vorm 'vast' is dit een no-op qua uitkomst; hij wordt dan ook niet aangeroepen, zodat
   * het referentiepad bit-voor-bit ongemoeid blijft.
   */
  function pasPrijsmodelToe(result, opties) {
    var o = opties || {};
    var prijsModel = o.prijsModel;
    var tarieven   = o.tarieven || {};
    var intern     = global.EnergieModel.intern;

    var TYPES = {zon: 'zon', wind: 'wind', afname_invoeden: 'afname_invoeden'};

    // 1. Werkelijke opbrengst per kwartier per brontype, uit de allocatieprijzen.
    var perTijd = {};
    result.opwekAlloc.forEach(function (r) {
      var t = TYPES[r.Type_norm];
      if (!t) return;
      if (!perTijd[r.tijdKey]) perTijd[r.tijdKey] = {zon: 0, wind: 0, afname_invoeden: 0};
      perTijd[r.tijdKey][t] += r.gelijktijdig_kWh * (r.prijs_eur_per_kWh || 0);
    });

    // 2. Modelrijen herschrijven en kosten_totaal_EUR opnieuw optellen.
    result.model.forEach(function (m) {
      var k = perTijd[m.tijdKey] || {zon: 0, wind: 0, afname_invoeden: 0};
      m.kosten_gelijktijdigheid_zon_EUR             = k.zon;
      m.kosten_gelijktijdigheid_wind_EUR            = k.wind;
      m.kosten_gelijktijdigheid_afname_invoeden_EUR = k.afname_invoeden;
      m.kosten_gelijktijdigheid_totaal_EUR = k.zon + k.wind + k.afname_invoeden;
      m.kosten_totaal_EUR = m.kosten_gelijktijdigheid_totaal_EUR
                          + m.kosten_platform_EUR
                          + m.kosten_gvo_bilateraal_EUR
                          + m.kosten_gvo_rest_EUR
                          + m.kosten_epex_tekort_EUR
                          + m.kosten_onbalans_totaal_EUR
                          - m.opbrengst_epex_overschot_EUR;
    });

    // 3. Samenvatting en deelnemersuitsplitsing opnieuw afleiden uit de gecorrigeerde rijen.
    result.samenvatting = intern.summarize(result.model);
    var deel = intern.participantOutputsForModel(result.model, result.verbruik, result.opwekAlloc, tarieven);
    result.per_gebruiker = deel.per_gebruiker;
    result.per_opwekker  = deel.per_opwekker;

    // 4. Producentenopbrengst met de werkelijke prijzen (participantOutputsForModel gebruikt
    //    het vaste tarief per type). Tegelijk het piekvermogen per asset vastleggen — dat is
    //    de grondslag voor de capaciteitsvergoeding bij de tweeledige vorm.
    var perAsset = {};
    result.opwekAlloc.forEach(function (r) {
      if (!perAsset[r.Asset]) perAsset[r.Asset] = {opbrengst: 0, piekKw: 0, type: r.Type_norm};
      var a = perAsset[r.Asset];
      a.opbrengst += r.gelijktijdig_kWh * (r.prijs_eur_per_kWh || 0);
      var kw = r.opwek_kWh / 0.25;
      if (kw > a.piekKw) a.piekKw = kw;
    });

    // Periodelengte in dagen, voor het pro-rata deel van de capaciteitsvergoeding.
    var sleutels = result.model.map(function (m) { return m.tijdKey; }).sort();
    var dagen = sleutels.length
      ? Math.max(1, (new Date(sleutels[sleutels.length - 1]) - new Date(sleutels[0])) / 86400000 + 0.0104)
      : 0;

    result.per_opwekker.forEach(function (op) {
      var a = perAsset[op.Asset];
      if (!a) return;
      op.opbrengst_gelijktijdigheid_EUR = a.opbrengst;
      op.piek_kW = a.piekKw;
      // kWp-schatting uit het waargenomen piekvermogen. Zon haalt in NL zelden meer dan ~85%
      // van het paneelvermogen; expliciet als schatting gemarkeerd zodat het aanpasbaar blijft.
      op.kWp_geschat = a.type === 'zon' ? a.piekKw / 0.85 : a.piekKw;
      op.capaciteitsvergoeding_EUR = prijsModel
        ? prijsModel.capaciteitsvergoeding(a.type, op.kWp_geschat, dagen) : 0;
      op.netto_opbrengst_EUR = op.opbrengst_gelijktijdigheid_EUR + op.opbrengst_epex_overschot_EUR
                             - op.kosten_onbalans_opwek_EUR + op.capaciteitsvergoeding_EUR;
    });

    result.periodeDagen = dagen;
    result.capaciteitsvergoeding_totaal_EUR = result.per_opwekker.reduce(
      function (s, op) { return s + (op.capaciteitsvergoeding_EUR || 0); }, 0);

    intern.runBalanceWarnings(result.model, 'prijsmodel');
    return result;
  }

  // ─── Export ─────────────────────────────────────────────────────────────────
  global.EhpDispatch = {
    epexIndex:             epexIndex,
    maakAllocator:         maakAllocator,
    vergelijkMetReferentie: vergelijkMetReferentie,
    pasPrijsmodelToe:      pasPrijsmodelToe
  };

})(window);
