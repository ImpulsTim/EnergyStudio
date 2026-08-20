/* EHP verdeling — wie betaalt, wie ontvangt, en is iedereen beter af?
   Namespace: window.EhpVerdeling — global scope, geen build.

   Een verrekenmethodiek staat of valt bij deze vraag. Het platform kan als geheel waarde
   creëren terwijl individuele deelnemers erop achteruitgaan; zonder die toets is een
   groepsvoordeel geen bruikbaar getal.

   Opzet:
     1. REFERENTIE — wat elke deelnemer zonder platform aan energie kwijt was. Hergebruikt
        `calculateCurrentContractCosts()` uit rekenkern.js, dus het contracttype (vast,
        dynamisch, hybride, factuurbenchmark) van de aansluiting telt gewoon mee.
     2. EIGEN VOORDEEL — referentie minus wat de deelnemer in het platform betaalt.
     3. VERDELING — het gepoolde surplus over de deelnemers, via een sleutel.
     4. TOETS — komt na verdeling niemand onder zijn referentie uit?

   Vergelijkingsbasis: ENERGIEKOSTEN, aan beide kanten. Het platform verandert de inkoop van
   energie, niet het transportcontract van de deelnemers. Netkosten meenemen aan de
   referentiekant en niet aan de platformkant zou een verschil laten zien dat er niet is.
   De accu is de uitzondering — die raakt wél het vermogenstarief, en die waarde komt
   daarom als aparte post in de pool.
*/
(function (global) {
  'use strict';

  var SLEUTELS = {
    geen:    {label: 'Ieder zijn eigen resultaat',
              uitleg: 'Geen herverdeling. Elke deelnemer houdt precies wat het platform hem oplevert of kost.'},
    gelijk:  {label: 'Gelijk per deelnemer',
              uitleg: 'Het surplus wordt in gelijke delen verdeeld, ongeacht omvang. Past bij een coöperatie waarin lidmaatschap telt, niet volume.'},
    volume:  {label: 'Naar afname',
              uitleg: 'Naar rato van het verbruik. Wie meer afneemt, deelt meer mee — de gebruikelijke keuze bij een inkoopcollectief.'},
    inbreng: {label: 'Naar inbreng',
              uitleg: 'Naar rato van de ingebrachte opwek. Beloont wie het aanbod levert waar het platform op draait.'},
    afnemers:{label: 'Naar de afnemers',
              uitleg: 'Het hele surplus gaat naar de afnemende partijen, naar rato van hun verbruik. Hoort bij de doelfunctie "laagste kosten voor afnemers".'}
  };

  var DOELFUNCTIES = {
    groep_borg: {
      label: 'Totale groepswaarde, niemand slechter af',
      uitleg: 'Maximaliseer de som over alle deelnemers, met als harde randvoorwaarde dat niemand ' +
              'onder zijn eigen referentie uitkomt. Deelnemers die dat wel doen worden eerst ' +
              'aangevuld, de rest gaat via de sleutel.',
      drempel: 'geen', borg: true, sleutel: 'volume'
    },
    groep: {
      label: 'Puur totale groepswaarde',
      uitleg: 'Maximaliseer de som, ongeacht de verdeling. Laat zien dat sommige deelnemers erop ' +
              'achteruit kunnen gaan.',
      drempel: 'geen', borg: false, sleutel: 'volume'
    },
    afnemers: {
      label: 'Laagste kosten voor afnemers',
      uitleg: 'Verreken alleen zolang de interne prijs onder het netalternatief van de afnemer ligt, ' +
              'en laat het surplus naar de afnemers gaan. Producenten krijgen wat overblijft binnen ' +
              'hun kostprijsdekking.',
      drempel: 'afnemer', borg: false, sleutel: 'afnemers'
    }
  };

  function _num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }

  // ─── 1. Referentie: zonder platform ─────────────────────────────────────────

  /**
   * Wat elke deelnemer zonder platform aan energie kwijt was.
   * deelnemers = [{id, naam, company, data}]; prijsreeks = [{ts, price}] in EUR/kWh.
   * Netkosten blijven buiten beschouwing (zie kopcommentaar) tenzij opts.metNetkosten.
   */
  function referentie(deelnemers, prijsreeks, opts) {
    opts = opts || {};
    return (deelnemers || []).map(function (d) {
      var r;
      try {
        r = global.calculateCurrentContractCosts(d.company, d.data, prijsreeks, {
          includeGridCosts: opts.metNetkosten === true,
          fallbackPrice: opts.fallbackPrice != null ? opts.fallbackPrice : 0.10,
          jaar: opts.ebJaar, btwPct: 0                       // btw buiten de vergelijking
        });
      } catch (e) {
        r = null;
      }
      if (!r) return {id: d.id, naam: d.naam, kosten_EUR: 0, afnameKwh: 0, terugleverKwh: 0,
                      bruikbaar: false, toelichting: 'referentie niet berekenbaar'};
      // Energiekosten: markt + opslagen + vaste leveringskosten, minus terugleveropbrengst.
      // Energiebelasting hoort er wel bij (die betaal je zonder platform ook), btw niet.
      var energie = r.marktKostenAfname - r.opbrengstTeruglever + r.opslagAfname + r.leveringskosten;
      return {
        id: d.id, naam: d.naam,
        kosten_EUR: energie + (opts.metEb === false ? 0 : r.energiebelasting) +
                    (opts.metNetkosten === true ? r.netkosten : 0),
        energie_EUR: energie, energiebelasting_EUR: r.energiebelasting,
        netkosten_EUR: opts.metNetkosten === true ? r.netkosten : 0,
        afnameKwh: r.afnameKwh, terugleverKwh: r.terugleverKwh,
        contracttype: r.type, bruikbaar: true,
        ontbrekendePrijzen: r.missingPriceCount || 0
      };
    });
  }

  // ─── 2. Eigen voordeel ──────────────────────────────────────────────────────

  /**
   * Zet de referentie naast wat de deelnemer in het platform betaalt of ontvangt.
   * platformPerDeelnemer = [{id, kosten_EUR, opbrengst_EUR, verbruikKwh, opwekKwh}]
   * Positief eigenVoordeel = beter af met platform.
   */
  function voordelen(ref, platformPerDeelnemer) {
    var platMap = {};
    (platformPerDeelnemer || []).forEach(function (p) { platMap[p.id] = p; });
    return (ref || []).map(function (r) {
      var p = platMap[r.id] || {kosten_EUR: 0, opbrengst_EUR: 0, verbruikKwh: 0, opwekKwh: 0};
      var netto = _num(p.kosten_EUR, 0) - _num(p.opbrengst_EUR, 0);
      return {
        id: r.id, naam: r.naam,
        referentie_EUR: r.kosten_EUR,
        platform_EUR: netto,
        eigenVoordeel_EUR: r.kosten_EUR - netto,
        verbruikKwh: _num(p.verbruikKwh, 0), opwekKwh: _num(p.opwekKwh, 0),
        bruikbaar: r.bruikbaar !== false
      };
    });
  }

  // ─── 3. Verdeling ───────────────────────────────────────────────────────────

  function _gewichten(lijst, sleutel) {
    return lijst.map(function (x) {
      if (sleutel === 'gelijk')  return 1;
      if (sleutel === 'volume')  return Math.max(0, x.verbruikKwh);
      if (sleutel === 'inbreng') return Math.max(0, x.opwekKwh);
      if (sleutel === 'afnemers') return x.verbruikKwh > 0 ? Math.max(0, x.verbruikKwh) : 0;
      return 0;
    });
  }

  /**
   * Verdeelt het resultaat over de deelnemers. Twee onafhankelijke keuzes:
   *
   *   SLEUTEL — hoe het resultaat wordt toegekend.
   *     'geen'   iedereen houdt zijn eigen resultaat. Niet-toerekenbare opbrengsten (zoals de
   *              marge van een platformaccu) gaan naar rato van verbruik.
   *     overige  volledige pooling: alles gaat in één pot en wordt via de sleutel toebedeeld.
   *              Het eigen resultaat verdwijnt daarmee als aparte grootheid — dat is het punt
   *              van poolen.
   *
   *   BORG — "niemand slechter af". Na toekenning wordt iedereen die onder nul uitkomt
   *          aangevuld tot nul, betaald door wie erboven zit, naar rato van hun overschot.
   *          Bij volledige pooling met een positief totaal is dat vanzelf al zo; bij sleutel
   *          'geen' is het een echte solidariteitsafspraak. Is het totaal negatief, dan is de
   *          randvoorwaarde niet haalbaar en zegt het resultaat dat, in plaats van een tekort
   *          stilletjes rond te delen.
   *
   * extra = opbrengsten die niet aan één deelnemer toe te rekenen zijn.
   */
  function verdeel(lijst, opties) {
    var o = opties || {};
    var sleutel = SLEUTELS[o.sleutel] ? o.sleutel : 'geen';
    var borg    = !!o.borg;
    var extra   = _num(o.extra_EUR, 0);
    var n = lijst.length;

    var eigenSom = lijst.reduce(function (s, x) { return s + x.eigenVoordeel_EUR; }, 0);
    var totaal   = eigenSom + extra;

    // Stap 1: toekenning volgens de sleutel.
    var basis;
    if (sleutel === 'geen') {
      var gwE = _gewichten(lijst, 'volume');
      var twE = gwE.reduce(function (s, w) { return s + w; }, 0);
      basis = lijst.map(function (x, i) {
        return x.eigenVoordeel_EUR + (twE > 0 ? extra * (gwE[i] / twE) : (n ? extra / n : 0));
      });
    } else {
      var gw = _gewichten(lijst, sleutel);
      var tw = gw.reduce(function (s, w) { return s + w; }, 0);
      basis = lijst.map(function (x, i) {
        return tw > 0 ? totaal * (gw[i] / tw) : (n ? totaal / n : 0);
      });
    }

    // Stap 2: borg. Tekorten aanvullen uit de overschotten.
    var aanvulling = lijst.map(function () { return 0; });
    var bijdrage   = lijst.map(function () { return 0; });
    var borgTekort = null;
    if (borg) {
      var tekort = 0, overschot = 0;
      basis.forEach(function (b) { if (b < 0) tekort += -b; else overschot += b; });
      if (tekort > 0) {
        if (overschot + 1e-9 < tekort) {
          // Niet genoeg waarde om iedereen heel te maken: naar rato aanvullen en melden.
          var f = overschot > 0 ? overschot / tekort : 0;
          borgTekort = tekort - overschot;
          basis.forEach(function (b, i) {
            if (b < 0) aanvulling[i] = -b * f;
            else bijdrage[i] = -b;
          });
        } else {
          basis.forEach(function (b, i) {
            if (b < 0) aanvulling[i] = -b;
            else bijdrage[i] = -(tekort * (b / overschot));
          });
        }
      }
    }

    var rijen = lijst.map(function (x, i) {
      return {id: x.id, naam: x.naam,
              referentie_EUR: x.referentie_EUR, platform_EUR: x.platform_EUR,
              eigenVoordeel_EUR: x.eigenVoordeel_EUR,
              toekenning_EUR: basis[i],
              aanvulling_EUR: aanvulling[i], bijdrage_EUR: bijdrage[i],
              resultaat_EUR: basis[i] + aanvulling[i] + bijdrage[i]};
    });
    return _resultaat(rijen, totaal, sleutel, borg, borgTekort);
  }

  function _resultaat(rijen, totaal, sleutel, borg, borgTekort) {
    var slechterAf = rijen.filter(function (r) { return r.resultaat_EUR < -1e-6; });
    var verdeeld = rijen.reduce(function (s, r) { return s + r.resultaat_EUR; }, 0);
    return {
      rijen: rijen,
      totaalSurplus_EUR: totaal,
      verdeeld_EUR: verdeeld,
      sluitend: Math.abs(verdeeld - totaal) < Math.max(0.01, Math.abs(totaal) * 1e-6),
      sleutel: sleutel, sleutelLabel: (SLEUTELS[sleutel] || {}).label || sleutel,
      borg: borg, borgHaalbaar: borgTekort == null, borgTekort_EUR: borgTekort,
      slechterAf: slechterAf.map(function (r) { return {naam: r.naam, bedrag_EUR: r.resultaat_EUR}; }),
      iedereenBeterAf: slechterAf.length === 0
    };
  }

  // ─── Export ─────────────────────────────────────────────────────────────────
  global.EhpVerdeling = {
    SLEUTELS:     SLEUTELS,
    DOELFUNCTIES: DOELFUNCTIES,
    referentie:   referentie,
    voordelen:    voordelen,
    verdeel:      verdeel
  };

})(window);
