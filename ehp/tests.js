/* EHP regressie- en scenariotests.
   Namespace: window.EhpTests — global scope, geen build, geen testrunner.

   Draaien:
     • in de browserconsole:  ehpTests()
     • in Node:               node ehp/tests_node.js

   De tests bouwen hun eigen kwartierdata, zodat ze niets nodig hebben uit
   IndexedDB en overal dezelfde uitkomst geven. Elk scenario is zo klein mogelijk
   gehouden: één ding aantonen, met getallen die met de hand na te rekenen zijn.

   De eerste test is de belangrijkste: `match_eerst_dan_opslag` moet regel voor regel
   hetzelfde blijven doen als vóór deze uitbreiding. Zolang die slaagt, is de nieuwe
   modus een toevoeging en geen wijziging.
*/
(function (global) {
  'use strict';

  var DT = 0.25;

  // ─── Testinfrastructuur ─────────────────────────────────────────────────────

  function maakContext() {
    return {naam: '', feiten: [], fouten: []};
  }

  function ok(c, voorwaarde, omschrijving, detail) {
    if (voorwaarde) c.feiten.push({ok: true, tekst: omschrijving});
    else c.fouten.push({ok: false, tekst: omschrijving, detail: detail});
  }

  function bijna(c, gemeten, verwacht, tol, omschrijving) {
    var goed = Math.abs(gemeten - verwacht) <= tol;
    ok(c, goed, omschrijving, goed ? null :
      'gemeten ' + _r(gemeten) + ', verwacht ' + _r(verwacht) + ' (tolerantie ' + tol + ')');
  }

  function _r(x) { return Math.round(x * 1e6) / 1e6; }

  // ─── Datageneratoren ────────────────────────────────────────────────────────

  /**
   * Bouwt kwartierdata uit een dagpatroon dat `dagen` keer wordt herhaald.
   *
   * patroon = {vraag: [..96], epex: [..96], bronnen: [{asset, type, prio, opwek: [..96]}]}
   * Alle reeksen in kWh per kwartier, EPEX in EUR/kWh.
   */
  function bouwData(patroon, dagen, startDatum) {
    dagen = dagen || 2;
    var start = new Date((startDatum || '2025-06-01') + 'T00:00:00Z');
    var verbruik = [], opwek = [], epex = [];
    var n = patroon.vraag.length;
    for (var d = 0; d < dagen; d++) {
      for (var i = 0; i < n; i++) {
        var ts = new Date(start.getTime() + (d * n + i) * 15 * 60000);
        var tijdKey = ts.toISOString().slice(0, 16);
        epex.push({tijdKey: tijdKey, epex_eur_per_kWh: patroon.epex[i]});
        if (patroon.vraag[i] > 0) {
          verbruik.push({'Tijd (UTC)': ts, tijdKey: tijdKey,
            Locatie: patroon.afnemer || 'Afnemer', gebruik_kWh: patroon.vraag[i]});
        }
        (patroon.bronnen || []).forEach(function (b) {
          if (!(b.opwek[i] > 0)) return;
          opwek.push({'Tijd (UTC)': ts, tijdKey: tijdKey, Asset: b.asset,
            Type: b.type, Type_norm: b.type, Prioriteit: b.prio == null ? 1 : b.prio,
            opwek_kWh: b.opwek[i], Gebruiker: ''});
        });
      }
    }
    return {verbruik: verbruik, opwek: opwek, epex: epex};
  }

  /** Vlakke reeks van 96 kwartieren met optionele blokken. */
  function reeks(basis, blokken) {
    var a = new Array(96).fill(basis);
    (blokken || []).forEach(function (b) {
      for (var i = b.van; i < b.tot; i++) a[i] = b.waarde;
    });
    return a;
  }

  function tarieven(extra) {
    var t = {
      gelijktijdigheid_zon: 0.02, gelijktijdigheid_wind: 0.02,
      gelijktijdigheid_afname_invoeden: 0,
      platform: 0, gvo_bilateraal: 0, gvo_rest: 0,
      onbalans_zon_pct: 0, onbalans_wind_pct: 0, onbalans_verbruik_pct: 0,
      onbalans_zon_risicoprijs: 0, onbalans_wind_risicoprijs: 0,
      onbalans_verbruik_risicoprijs: 0, retail_opslag: 0.02
    };
    for (var k in (extra || {})) t[k] = extra[k];
    return t;
  }

  function accu(over) {
    var a = global.EhpOpslag.defaults();
    a.id = 'test-accu'; a.naam = 'Testaccu';
    a.kWh = 100; a.kW = 50; a.eigenaar = 'groep'; a.kostenDrager = 'platform';
    a.capex_kwh = 300; a.opex_kwh_jr = 5; a.cyclusleven = 6000; a.levensduur_jr = 15;
    a.etaLaad_pct = 95; a.etaOntlaad_pct = 95;
    a.afnameOpslag_mwh = 20; a.terugleverAfslag_mwh = 10;
    a.eb_kwh = 0.05;                 // vast gezet: de staffel mag de test niet sturen
    a.opslagVrijstelling = 1; a.grootverbruik = 1;
    a.voorspelAfslag_pct = 0; a.alleenEigenOverschot = 0;
    for (var k in (over || {})) a[k] = over[k];
    return a;
  }

  function cfg(over) {
    var c = global.EhpMatching.defaults();
    c.retail_opslag_mwh = 20;
    c.matching_modus = 'prijsgeoptimaliseerde_opslag_en_matching';
    c.opt_doel = 'groepswaarde';
    c.accu_korting_mwh = 10;
    c.opslagvergoeding_mwh = 5;
    for (var k in (over || {})) c[k] = over[k];
    return c;
  }

  /** Draait het volledige nieuwe pad en levert model + plan + verrekening. */
  function draai(data, c, accus, opties) {
    var o = opties || {};
    var inst = global.EhpMatching.lees(c);
    var prijsModel = global.EhpPrijs.maak(o.prijsmodel || global.EhpPrijs.defaults());
    var epexByTijd = global.EhpDispatch.epexIndex(data.epex);
    var alloc = global.EhpMatching.maakAllocator({
      instellingen: inst, prijsModel: prijsModel, epexByTijd: epexByTijd,
      meritVolgorde: o.meritVolgorde || 'prijs',
      accus: accus || [], gastheerByAccu: o.gastheerByAccu || null,
      ebJaar: 2025, fijnheid: o.fijnheid || 12,
      fijnheidSweep: o.fijnheidSweep || 6,
      reducties: o.reducties || [0]
    });
    var result = global.EnergieModel.buildModel({
      verbruik: data.verbruik, opwek: data.opwek, epex: data.epex,
      tarieven: o.tarieven || tarieven(), scenario: {}, forwardcurve: [],
      allocator: alloc
    });
    var plan = alloc.plan;
    global.EhpDispatch.pasPrijsmodelToe(result, {prijsModel: prijsModel, tarieven: o.tarieven || tarieven()});
    global.EhpMatching.verwerkInModel(result, plan, o.tarieven || tarieven());
    var verrekening = global.EhpMatching.verreken(plan, {
      perGebruiker: result.per_gebruiker, perOpwekker: result.per_opwekker,
      verbruik: result.verbruik, model: result.model,
      businesscases: (accus || []).map(function () { return {}; })
    });
    return {result: result, plan: plan, verrekening: verrekening, allocator: alloc,
            inst: inst, epexByTijd: epexByTijd};
  }

  function totaal(plan, veld) {
    var s = 0, a = plan.kwartier[veld];
    for (var i = 0; i < a.length; i++) s += a[i];
    return s;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO'S
  // ═══════════════════════════════════════════════════════════════════════════

  var SCENARIOS = [];

  // ─── 1. Regressie: de bestaande modus verandert niet ────────────────────────
  SCENARIOS.push({
    naam: '1. Bestaande modus blijft regel voor regel gelijk',
    waarom: 'match_eerst_dan_opslag moet exact dezelfde getallen geven als het overgenomen ' +
            'model. Elk verschil is een bug, geen verbetering.',
    draai: function (c) {
      var data = bouwData({
        vraag: reeks(4, [{van: 32, tot: 72, waarde: 10}]),
        epex:  reeks(0.06, [{van: 40, tot: 60, waarde: 0.02}, {van: 72, tot: 84, waarde: 0.20}]),
        bronnen: [
          {asset: 'Zonpark', type: 'zon',  prio: 1, opwek: reeks(0, [{van: 32, tot: 72, waarde: 12}])},
          {asset: 'Windmolen', type: 'wind', prio: 2, opwek: reeks(2)}
        ]
      }, 2);
      var invoer = {verbruik: data.verbruik, opwek: data.opwek, epex: data.epex,
                    tarieven: tarieven(), scenario: {}, forwardcurve: []};
      var vgl = global.EhpDispatch.vergelijkMetReferentie(invoer,
        global.EhpDispatch.maakAllocator({volgorde: 'prioriteit', drempel: 'geen'}));
      ok(c, vgl.gelijk, 'geen enkel kolomverschil met het referentiemodel',
        vgl.gelijk ? null : JSON.stringify(vgl.verschillen.slice(0, 3)));

      // En de nieuwe module mag niets aan die route veranderen, ook niet indirect.
      ok(c, global.EhpMatching.lees({}).modus === 'match_eerst_dan_opslag',
        'een platform zonder instelling valt terug op de bestaande modus (migratie)');
      ok(c, global.EhpMatching.isNieuweModus({}) === false,
        'isNieuweModus() is onwaar voor bestaande platforms');
    }
  });

  // ─── 2. Directe match wint van opslag ───────────────────────────────────────
  SCENARIOS.push({
    naam: '2. Directe interne match wint als die financieel het beste is',
    waarom: 'Vraag en opwek vallen samen en de prijs is de hele dag vlak. Opslaan kost dan ' +
            'alleen rendement en slijtage; direct leveren hoort te winnen.',
    draai: function (c) {
      var data = bouwData({
        vraag: reeks(10),
        epex:  reeks(0.08),                                   // vlak: geen enkele spread
        bronnen: [{asset: 'Zonpark', type: 'zon', prio: 1, opwek: reeks(10)}]
      }, 2);
      var r = draai(data, cfg(), [accu()]);
      var direct = totaal(r.plan, 'directIntern');
      var naarAccu = totaal(r.plan, 'naarAccu');
      var vraag = r.plan.q.vraag.reduce(function (s, x) { return s + x; }, 0);
      bijna(c, direct, vraag, vraag * 1e-6, 'alle vraag wordt direct intern gedekt');
      bijna(c, naarAccu, 0, 1e-6, 'er gaat geen kWh naar de accu');
      bijna(c, totaal(r.plan, 'netImport'), 0, 1e-6, 'geen netimport');
      bijna(c, totaal(r.plan, 'netExport'), 0, 1e-6, 'geen netexport');
    }
  });

  // ─── 3. Goedkope middag, dure avond ─────────────────────────────────────────
  SCENARIOS.push({
    naam: '3. Goedkope middag, dure avond: de accu verschuift',
    waarom: 'Zonoverschot midden op de dag bij een lage prijs, vraag in de avond bij een hoge ' +
            'prijs. De accu hoort te laden en later intern te leveren.',
    draai: function (c) {
      var data = bouwData({
        vraag: reeks(2, [{van: 72, tot: 88, waarde: 20}]),        // avondpiek 18:00–22:00
        epex:  reeks(0.06, [{van: 32, tot: 64, waarde: 0.01},     // goedkope middag
                            {van: 72, tot: 88, waarde: 0.25}]),   // dure avond
        bronnen: [{asset: 'Zonpark', type: 'zon', prio: 1,
                   opwek: reeks(0, [{van: 32, tot: 64, waarde: 25}])}]
      }, 3);
      var r = draai(data, cfg(), [accu({kWh: 200, kW: 100})]);
      var naarAccu = totaal(r.plan, 'naarAccu');
      var uitIntern = totaal(r.plan, 'uitAccuIntern');
      ok(c, naarAccu > 50, 'de accu laadt substantieel uit het zonoverschot (' + _r(naarAccu) + ' kWh)');
      ok(c, uitIntern > 40, 'en levert dat later intern af (' + _r(uitIntern) + ' kWh)');

      // De afnemer mag er niet op achteruitgaan, en de producent krijgt zijn alternatief.
      r.verrekening.perAfnemer.forEach(function (x) {
        ok(c, x.beschermd, 'afnemer ' + x.Locatie + ' is niet duurder uit dan met het net',
          'besparing ' + _r(x.besparingVsNet_EUR));
      });
      var zon = r.verrekening.perAsset.filter(function (x) { return x.Asset === 'Zonpark'; })[0];
      ok(c, zon && zon.gegarandeerdBijOpslag_EUR >= 0,
        'de producent krijgt zijn exportalternatief over de opgeslagen kWh');
    }
  });

  // ─── 4. Producentenbescherming ──────────────────────────────────────────────
  SCENARIOS.push({
    naam: '4. Producentenbescherming blokkeert opslag die de producent benadeelt',
    waarom: 'Bij verdeling "naar de energie-eigenaar" hangt zijn opbrengst af van wat de accu ' +
            'er later voor maakt. Is er geen enkel later moment waarop dat zijn directe export ' +
            'dekt, dan mag zijn energie de accu niet in.',
    draai: function (c) {
      // Opzet: opslaan is voor de GROEP winstgevend, maar uitsluitend dankzij vermeden
      // energiebelasting bij het ontladen. Die winst komt bij de afnemer terecht, niet
      // bij de energie-eigenaar: die ziet alleen de marktgekoppelde prijs. Bij verdeling
      // "naar de energie-eigenaar" dekt zijn opbrengst het exportalternatief van het
      // laadmoment dus niet, en mag zijn energie de accu niet in.
      // Laden uit het net staat uit, zodat het echt om ZIJN energie gaat.
      var data = bouwData({
        vraag: reeks(1, [{van: 72, tot: 88, waarde: 16}]),
        epex:  reeks(0.07, [{van: 72, tot: 88, waarde: 0.10}]),
        bronnen: [{asset: 'Zonpark', type: 'zon', prio: 1,
                   opwek: reeks(0, [{van: 32, tot: 56, waarde: 20}])}]
      }, 3);
      var beschermd = draai(data, cfg({opslagwaarde_verdeling: 'energie_eigenaar',
                                       producent_bescherming: 'blokkeren',
                                       laden_uit_net: 0}), [accu({kWh: 150, kW: 60})]);
      var pool = draai(data, cfg({opslagwaarde_verdeling: 'groepspool',
                                  laden_uit_net: 0}), [accu({kWh: 150, kW: 60})]);
      var b = totaal(beschermd.plan, 'naarAccu');
      var p = totaal(pool.plan, 'naarAccu');
      bijna(c, b, 0, 1e-6,
        'bij "naar de energie-eigenaar" gaat er geen opwek de accu in — de producent zou ' +
        'onder zijn exportalternatief uitkomen');
      ok(c, p > 20,
        'bij verdeling via de pool wordt er wél opgeslagen (' + _r(p) + ' kWh): daar krijgt de ' +
        'producent zijn exportalternatief gegarandeerd bij het laden');

      // En in elke keuze geldt: de producent gaat er nooit op achteruit.
      ['energie_eigenaar', 'batterij_eigenaar', 'groepspool', 'verdeelsleutel'].forEach(function (keuze) {
        var r = draai(data, cfg({opslagwaarde_verdeling: keuze, laden_uit_net: 0}),
                      [accu({kWh: 150, kW: 60})]);
        var slecht = r.verrekening.perAsset.filter(function (x) {
          return x.opslagwaarde_EUR < -1e-9 || x.gegarandeerdBijOpslag_EUR < -1e-9; });
        ok(c, slecht.length === 0,
          'bij "' + keuze + '" komt geen producent onder zijn directe exportalternatief');
      });
    }
  });

  // ─── 5. Afnemersbescherming ─────────────────────────────────────────────────
  SCENARIOS.push({
    naam: '5. Een afnemer betaalt nooit meer dan zijn netalternatief',
    waarom: 'Met een vaste bronprijs ver boven de markt hoort de interne verrekening te ' +
            'stoppen; de afnemer koopt dan van het net en de producent exporteert.',
    draai: function (c) {
      var data = bouwData({
        vraag: reeks(10),
        epex:  reeks(0.02),                                    // markt heel laag
        bronnen: [{asset: 'Duurpark', type: 'zon', prio: 1, opwek: reeks(10)}]
      }, 1);
      // Vaste bronprijs 150 EUR/MWh terwijl het netalternatief 40 EUR/MWh is.
      var pm = global.EhpPrijs.defaults();
      pm.zon = {vorm: 'vast', tarief_mwh: 150};
      var r = draai(data, cfg({afnemer_bescherming: 'blokkeren'}), [accu()], {prijsmodel: pm});
      bijna(c, totaal(r.plan, 'directIntern'), 0, 1e-6,
        'geen enkele kWh wordt intern verrekend boven het netalternatief');
      r.verrekening.perAfnemer.forEach(function (x) {
        ok(c, x.beschermd, 'afnemer ' + x.Locatie + ' betaalt niet meer dan het netalternatief');
      });
      var w = global.EhpMatching.waarschuwingen(r.plan, r.verrekening);
      ok(c, w.some(function (x) { return /netalternatief van de afnemers/.test(x.tekst); }),
        'de UI krijgt een waarschuwing over de prijsvorm');
    }
  });

  // ─── 6. Netneutraliteit als tiebreak ────────────────────────────────────────
  SCENARIOS.push({
    naam: '6. Bij gelijke financiële uitkomst wint de route met minder netverkeer',
    waarom: 'Netneutraliteit is een expliciet secundair doel. Bij een vlakke prijs is er ' +
            'financieel niets te kiezen; dan hoort de accu het overschot op te vangen in ' +
            'plaats van het te exporteren.',
    draai: function (c) {
      // Overschot overdag, tekort s nachts, prijs volledig vlak: de enige reden om te
      // schuiven is netneutraliteit.
      var data = bouwData({
        vraag: reeks(0, [{van: 0, tot: 24, waarde: 10}]),
        epex:  reeks(0.10),
        bronnen: [{asset: 'Zonpark', type: 'zon', prio: 1,
                   opwek: reeks(0, [{van: 40, tot: 64, waarde: 10}])}]
      }, 2);
      var neutraal = draai(data, cfg({opt_doel: 'netneutraal'}), [accu({kWh: 300, kW: 100})]);
      var groep    = draai(data, cfg({opt_doel: 'groepswaarde'}), [accu({kWh: 300, kW: 100})]);
      var nNet = totaal(neutraal.plan, 'netImport') + totaal(neutraal.plan, 'netExport');
      var gNet = totaal(groep.plan, 'netImport') + totaal(groep.plan, 'netExport');
      ok(c, nNet <= gNet + 1e-6,
        'het netneutrale doel geeft niet meer netverkeer dan het groepswaardedoel (' +
        _r(nNet) + ' vs ' + _r(gNet) + ' kWh)');
      ok(c, nNet < gNet - 1e-6 || gNet < 1e-6,
        'en waar er iets te kiezen valt, kiest het ook echt minder netverkeer');
    }
  });

  // ─── 7. Herkomst sluit energetisch en financieel ────────────────────────────
  SCENARIOS.push({
    naam: '7. Herkomst van opgeslagen energie sluit, zonder dubbeltelling',
    waarom: 'Een kWh die is opgeslagen mag niet ook als directe levering of directe export ' +
            'meetellen, en de opslagwaarde moet exact opgaan in wat er verdeeld wordt.',
    draai: function (c) {
      var data = bouwData({
        vraag: reeks(3, [{van: 68, tot: 88, waarde: 18}]),
        epex:  reeks(0.05, [{van: 32, tot: 60, waarde: 0.01}, {van: 68, tot: 88, waarde: 0.22}]),
        bronnen: [
          {asset: 'Zonpark',   type: 'zon',  prio: 1, opwek: reeks(0, [{van: 32, tot: 60, waarde: 20}])},
          {asset: 'Windmolen', type: 'wind', prio: 2, opwek: reeks(4)}
        ]
      }, 3);
      var r = draai(data, cfg(), [accu({kWh: 150, kW: 80})]);
      var b = r.plan.balans;
      ok(c, b.energieSluitend, 'opwek + ontladen + tekort = verbruik + laden + overschot',
        'verschil ' + _r(b.energieVerschil) + ' kWh');
      ok(c, b.opwekSluitend, 'opwek splitst exact in direct intern + naar accu + direct export',
        'verschil ' + _r(b.opwekVerschil) + ' kWh');
      ok(c, b.vraagSluitend, 'vraag splitst exact in direct intern + uit accu + netinkoop',
        'verschil ' + _r(b.vraagVerschil) + ' kWh');
      b.accus.forEach(function (x) {
        ok(c, x.sluitend, 'de voorraadbalans van ' + x.naam + ' sluit',
          'verschil ' + _r(x.voorraadVerschil_kWh) + ' kWh');
      });
      ok(c, r.verrekening.controle.sluitend,
        'de verdeelde opslagwaarde is exact gelijk aan de gecreëerde opslagwaarde',
        'verschil € ' + _r(r.verrekening.controle.verschil_EUR));

      // Herkomst per bron moet optellen tot wat er in de accu ging.
      var uitBoek = r.verrekening.herkomst.reduce(function (s, x) { return s + x.geladen_ac_kWh; }, 0);
      var uitPlan = totaal(r.plan, 'naarAccu') + totaal(r.plan, 'netNaarAccu');
      bijna(c, uitBoek, uitPlan, Math.max(0.5, uitPlan * 1e-6),
        'de herkomstregels tellen op tot de totale lading');

      // Modelkolommen moeten hetzelfde zeggen als het plan.
      var mTekort = r.result.model.reduce(function (s, m) { return s + m.tekort_kWh; }, 0);
      bijna(c, mTekort, totaal(r.plan, 'netImport'), Math.max(0.5, mTekort * 1e-6),
        'het model rapporteert dezelfde netimport als het plan');
      var mOver = r.result.model.reduce(function (s, m) { return s + m.overschot_kWh; }, 0);
      bijna(c, mOver, totaal(r.plan, 'netExport'), Math.max(0.5, mOver * 1e-6),
        'het model rapporteert dezelfde netexport als het plan');
    }
  });

  // ─── 8. Meerdere bronnen en verdelingskeuzes ────────────────────────────────
  SCENARIOS.push({
    naam: '8. Meerdere bronnen: de opslagwaarde volgt de gekozen verdeling',
    waarom: 'Zon, wind en netlading in dezelfde periode. Elke verdelingskeuze moet de waarde ' +
            'bij een andere partij laten landen, en altijd volledig.',
    draai: function (c) {
      var data = bouwData({
        vraag: reeks(2, [{van: 68, tot: 90, waarde: 16}]),
        epex:  reeks(0.05, [{van: 8, tot: 20, waarde: -0.02},     // negatieve nachtprijs
                            {van: 32, tot: 60, waarde: 0.01},
                            {van: 68, tot: 90, waarde: 0.24}]),
        bronnen: [
          {asset: 'Zonpark',   type: 'zon',  prio: 1, opwek: reeks(0, [{van: 32, tot: 60, waarde: 14}])},
          {asset: 'Windmolen', type: 'wind', prio: 2, opwek: reeks(3)}
        ]
      }, 3);
      var keuzes = ['energie_eigenaar', 'batterij_eigenaar', 'groepspool', 'verdeelsleutel'];
      var uitkomsten = {};
      keuzes.forEach(function (keuze) {
        var r = draai(data, cfg({opslagwaarde_verdeling: keuze,
          opslagwaarde_split_energie: 50, opslagwaarde_split_batterij: 30,
          opslagwaarde_split_pool: 20}), [accu({kWh: 150, kW: 80})]);
        var ct = r.verrekening.controle;
        ok(c, ct.sluitend, 'verdeling "' + keuze + '" sluit exact',
          'verschil € ' + _r(ct.verschil_EUR));
        uitkomsten[keuze] = ct;
        var bronnen = {};
        r.verrekening.herkomst.forEach(function (h) { bronnen[h.bron] = 1; });
        ok(c, Object.keys(bronnen).length >= 2,
          'meer dan één herkomst in de accu bij "' + keuze + '" (' + Object.keys(bronnen).join(', ') + ')');
      });
      var e = uitkomsten.energie_eigenaar, b = uitkomsten.batterij_eigenaar, p = uitkomsten.groepspool;
      ok(c, e.naarEnergieEigenaren_EUR > b.naarEnergieEigenaren_EUR - 1e-9,
        '"naar de energie-eigenaar" geeft die partij niet minder dan "naar de batterij-eigenaar"');
      ok(c, b.naarAccuEigenaren_EUR >= e.naarAccuEigenaren_EUR - 1e-9,
        '"naar de batterij-eigenaar" geeft de accu-eigenaar niet minder dan het alternatief');
      ok(c, p.naarPool_EUR >= b.naarPool_EUR - 1e-9,
        '"naar de groepspool" laat de waarde in de pool landen');
    }
  });

  // ─── 9. Meerdere batterijen ─────────────────────────────────────────────────
  SCENARIOS.push({
    naam: '9. Meerdere batterijen blijven sluitend en herleidbaar',
    waarom: 'Twee accu\'s mogen niet allebei hetzelfde overschot opslaan. Ze worden ' +
            'sequentieel op een krimpende restpositie doorgerekend.',
    draai: function (c) {
      var data = bouwData({
        vraag: reeks(3, [{van: 68, tot: 90, waarde: 22}]),
        epex:  reeks(0.05, [{van: 32, tot: 60, waarde: 0.01}, {van: 68, tot: 90, waarde: 0.26}]),
        bronnen: [{asset: 'Zonpark', type: 'zon', prio: 1,
                   opwek: reeks(0, [{van: 32, tot: 60, waarde: 30}])}]
      }, 3);
      var a1 = accu({kWh: 100, kW: 50}); a1.id = 'a1'; a1.naam = 'Accu A';
      var a2 = accu({kWh: 100, kW: 50}); a2.id = 'a2'; a2.naam = 'Accu B';
      var r = draai(data, cfg(), [a1, a2]);
      var b = r.plan.balans;
      ok(c, b.sluitend, 'alle balansen sluiten met twee accu\'s',
        JSON.stringify({energie: _r(b.energieVerschil), opwek: _r(b.opwekVerschil),
                        vraag: _r(b.vraagVerschil)}));
      ok(c, r.plan.accus.length === 2, 'beide accu\'s zitten in het plan');
      var som = r.plan.accus.reduce(function (s, x) {
        return s + x.totalen.inUitOverschot + x.totalen.inUitMatch; }, 0);
      bijna(c, som, totaal(r.plan, 'naarAccu'), Math.max(0.5, som * 1e-6),
        'de lading van beide accu\'s telt op tot de totale opwek-naar-accu');
      var opwekTot = r.plan.q.opwek.reduce(function (s, x) { return s + x; }, 0);
      ok(c, som <= opwekTot + 1e-6, 'er wordt niet meer opgeslagen dan er opgewekt is');
      ok(c, r.verrekening.perAccu.length === 2 && r.verrekening.controle.sluitend,
        'de verrekening onderscheidt beide accu\'s en sluit');
    }
  });

  // ─── 10. Interne consistentie van prijzen en doelfunctie ────────────────────
  SCENARIOS.push({
    naam: '10. Prijsdefinities en doelfunctie zijn intern consistent',
    waarom: 'De exportwaarde in de accu-logica moet dezelfde zijn als in de modelkolommen, ' +
            'en de doelfunctie van een kwartier moet reproduceerbaar zijn in de inspector.',
    draai: function (c) {
      var data = bouwData({
        vraag: reeks(4, [{van: 68, tot: 88, waarde: 15}]),
        epex:  reeks(0.05, [{van: 32, tot: 60, waarde: 0.01}, {van: 68, tot: 88, waarde: 0.22}]),
        bronnen: [{asset: 'Zonpark', type: 'zon', prio: 1,
                   opwek: reeks(0, [{van: 32, tot: 60, waarde: 18}])}]
      }, 2);
      var r = draai(data, cfg(), [accu({kWh: 120, kW: 60})]);

      // Exportwaarde van de producent = EPEX, gelijk aan de modelkolom.
      var mOpbr = r.result.model.reduce(function (s, m) {
        return s + (m.opbrengst_epex_overschot_EUR || 0); }, 0);
      var planOpbr = 0;
      for (var i = 0; i < r.plan.T; i++) {
        planOpbr += r.plan.kwartier.netExport[i] * r.plan.q.epex[i];
      }
      bijna(c, mOpbr, planOpbr, Math.max(0.05, Math.abs(planOpbr) * 1e-6),
        'exportopbrengst in het model is gelijk aan die in het plan');

      // De inspector rekent hetzelfde kwartier opnieuw door met dezelfde functie.
      var idx = 0, best = 0;
      for (var t = 0; t < r.plan.T; t++) {
        var x = Math.abs(r.plan.kwartier.uitAccuIntern[t]);
        if (x > best) { best = x; idx = t; }
      }
      var u = r.allocator.verklaarKwartier(r.plan.tijdKeys[idx]);
      ok(c, !!u, 'de inspector levert een verklaring voor het drukste kwartier');
      if (u) {
        var gek = (u.accus[0] && u.accus[0].opties || []).filter(function (x) { return x.gekozen; })[0];
        ok(c, !!gek && gek.toegestaan, 'de gekozen actie is in de inspector als toegestaan gemarkeerd');
        var alt = (u.accus[0] && u.accus[0].opties || []).filter(function (x) { return !x.gekozen && x.toegestaan; });
        ok(c, alt.length >= 1, 'er staan alternatieven naast de gekozen route (' + alt.length + ')');
        bijna(c, u.routes.uitAccuIntern, r.plan.kwartier.uitAccuIntern[idx], 1e-9,
          'de inspector rapporteert dezelfde routevolumes als het plan');
      }

      // De doelfunctie mag niet stiekem LCOS als drempel gebruiken.
      var mk = global.EhpOpslag.marginaleKosten(global.EhpOpslag.lees(accu()));
      ok(c, mk > 0 && mk < 0.2, 'marginale slijtagekosten zijn een klein bedrag per kWh (' +
        _r(mk * 100) + ' ct), geen gemiddelde kostprijs');
    }
  });

  // ─── 11. Laden uit het net ──────────────────────────────────────────────────
  SCENARIOS.push({
    naam: '11. Laden uit het net: schakelaar werkt en wordt alleen benut als het loont',
    waarom: 'Bij een negatieve nachtprijs is laden uit het net gratis of beter. Staat de ' +
            'schakelaar uit, dan mag er geen kWh van het net de accu in.',
    draai: function (c) {
      var data = bouwData({
        vraag: reeks(2, [{van: 68, tot: 90, waarde: 14}]),
        epex:  reeks(0.06, [{van: 4, tot: 24, waarde: -0.05},   // betaald worden om te laden
                            {van: 68, tot: 90, waarde: 0.25}]),
        bronnen: [{asset: 'Zonpark', type: 'zon', prio: 1, opwek: reeks(1)}]
      }, 3);
      var aan = draai(data, cfg({laden_uit_net: 1}), [accu({kWh: 150, kW: 60})]);
      var uit = draai(data, cfg({laden_uit_net: 0}), [accu({kWh: 150, kW: 60})]);
      ok(c, totaal(aan.plan, 'netNaarAccu') > 10,
        'met de schakelaar aan laadt de accu uit het net bij negatieve prijzen (' +
        _r(totaal(aan.plan, 'netNaarAccu')) + ' kWh)');
      bijna(c, totaal(uit.plan, 'netNaarAccu'), 0, 1e-6,
        'met de schakelaar uit komt er geen kWh van het net in de accu');
      ok(c, aan.plan.balans.sluitend && uit.plan.balans.sluitend,
        'beide varianten blijven sluitend');
    }
  });

  // ─── 12. Ontladen naar EPEX ─────────────────────────────────────────────────
  SCENARIOS.push({
    naam: '12. Ontladen naar EPEX: schakelaar werkt',
    waarom: 'Zonder interne vraag kan de accu alleen exporteren. Staat dat uit, dan blijft ' +
            'hij staan — en dat hoort zichtbaar te zijn, niet stil te gebeuren.',
    draai: function (c) {
      var data = bouwData({
        vraag: reeks(1),                                        // nauwelijks interne vraag
        epex:  reeks(0.04, [{van: 32, tot: 60, waarde: 0.00}, {van: 72, tot: 88, waarde: 0.30}]),
        bronnen: [{asset: 'Zonpark', type: 'zon', prio: 1,
                   opwek: reeks(0, [{van: 32, tot: 60, waarde: 20}])}]
      }, 3);
      var aan = draai(data, cfg({ontladen_naar_epex: 1}), [accu({kWh: 150, kW: 60})]);
      var uit = draai(data, cfg({ontladen_naar_epex: 0}), [accu({kWh: 150, kW: 60})]);
      ok(c, totaal(aan.plan, 'uitAccuEpex') > 10,
        'met de schakelaar aan verkoopt de accu op EPEX in de dure uren (' +
        _r(totaal(aan.plan, 'uitAccuEpex')) + ' kWh)');
      bijna(c, totaal(uit.plan, 'uitAccuEpex'), 0, 1e-6,
        'met de schakelaar uit gaat er geen kWh naar EPEX');
      var w = global.EhpMatching.waarschuwingen(uit.plan, uit.verrekening);
      ok(c, w.some(function (x) { return /EPEX staat uit/.test(x.tekst); }),
        'de gebruiker krijgt te zien dat de accu daardoor beperkt wordt');
    }
  });

  // ─── 13. De accu concurreert met directe matching ───────────────────────────
  SCENARIOS.push({
    naam: '13. Zonder netlading concurreert opslag echt met directe levering',
    waarom: 'Dit is het geval waarin de volgorde van matching en opslag het antwoord ' +
            'verandert. De accu mag dan opwek nemen die anders direct geleverd was, mits dat ' +
            'later meer oplevert dan het nu doet.',
    draai: function (c) {
      // Overdag vraag én opwek even groot (dus alles zou direct matchen), maar de avond
      // is veel duurder én er is dan vraag zonder opwek.
      var data = bouwData({
        vraag: reeks(0, [{van: 32, tot: 60, waarde: 10}, {van: 72, tot: 88, waarde: 10}]),
        epex:  reeks(0.05, [{van: 32, tot: 60, waarde: 0.02}, {van: 72, tot: 88, waarde: 0.40}]),
        bronnen: [{asset: 'Zonpark', type: 'zon', prio: 1,
                   opwek: reeks(0, [{van: 32, tot: 60, waarde: 10}])}]
      }, 3);
      var r = draai(data, cfg({laden_uit_net: 0, opt_doel: 'groepswaarde'}),
                    [accu({kWh: 120, kW: 60})]);
      var uitMatch = r.plan.accus.reduce(function (s, x) { return s + x.totalen.inUitMatch; }, 0);
      ok(c, uitMatch > 1,
        'de accu neemt opwek over die anders direct geleverd was (' + _r(uitMatch) + ' kWh) — ' +
        'precies wat de sequentiële keten niet kan');
      ok(c, r.plan.balans.sluitend, 'en de balans blijft sluiten');

      // In de bestaande volgorde kan dat per definitie niet: daar is de restpositie
      // overdag nul en heeft de accu niets om mee te werken.
      var mode1 = draai(data, cfg({matching_modus: 'match_eerst_dan_opslag', laden_uit_net: 0}),
                        [accu({kWh: 120, kW: 60, alleenEigenOverschot: 1})]);
      var m1 = mode1.plan.accus.reduce(function (s, x) { return s + x.totalen.inUitMatch; }, 0);
      bijna(c, m1, 0, 1e-6,
        'met "alleen uit eigen overschot" wordt directe levering nooit verdrongen');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Runner
  // ═══════════════════════════════════════════════════════════════════════════

  function run(filter) {
    var uit = [], totFeiten = 0, totFouten = 0;
    SCENARIOS.forEach(function (sc) {
      if (filter && sc.naam.indexOf(filter) < 0) return;
      var c = maakContext();
      c.naam = sc.naam;
      var t0 = Date.now();
      try { sc.draai(c); }
      catch (e) { c.fouten.push({ok: false, tekst: 'uitzondering', detail: (e && e.stack) || String(e)}); }
      c.ms = Date.now() - t0;
      c.waarom = sc.waarom;
      totFeiten += c.feiten.length; totFouten += c.fouten.length;
      uit.push(c);
    });
    return {scenarios: uit, geslaagd: totFeiten, gefaald: totFouten,
            alles: totFouten === 0};
  }

  function rapporteer(res, log) {
    log = log || function () { console.log.apply(console, arguments); };
    res.scenarios.forEach(function (c) {
      log((c.fouten.length ? '✗ ' : '✓ ') + c.naam + '  (' + c.ms + ' ms)');
      log('    ' + c.waarom);
      c.feiten.forEach(function (f) { log('    ✓ ' + f.tekst); });
      c.fouten.forEach(function (f) {
        log('    ✗ ' + f.tekst + (f.detail ? '\n        → ' + f.detail : ''));
      });
    });
    log('');
    log(res.alles
      ? '✓ alle ' + res.geslaagd + ' controles geslaagd'
      : '✗ ' + res.gefaald + ' van de ' + (res.gefaald + res.geslaagd) + ' controles gefaald');
    return res;
  }

  global.EhpTests = {run: run, rapporteer: rapporteer, SCENARIOS: SCENARIOS,
                     hulp: {bouwData: bouwData, reeks: reeks, accu: accu, cfg: cfg,
                            tarieven: tarieven, draai: draai, totaal: totaal}};

  /** Console-ingang: ehpTests() of ehpTests('3.') voor één scenario. */
  global.ehpTests = function (filter) {
    var res = run(filter);
    if (global.console && console.group) console.group('EHP tests');
    rapporteer(res);
    if (global.console && console.groupEnd) console.groupEnd();
    return res;
  };

})(typeof window !== 'undefined' ? window : globalThis);
