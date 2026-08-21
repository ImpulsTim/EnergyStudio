/* EHP opslag — kansenladder: wanneer loont deze accu, en bij welke instelling kantelt dat.
   Namespace: window.EhpKansen — global scope, geen build.

   Het probleem dat dit oplost: de dispatch in opslag.js handelt zodra de geleverde spread de
   marginale slijtage dekt, maar dat is een DP-run van seconden die pas achteraf vertelt hoeveel
   cycli eruit kwamen. Je ziet niet WAAR de drempel in de prijsverdeling ligt, en dus niet welke
   knop hem laat kantelen. Deze module rekent hetzelfde vraagstuk in milliseconden door, zodat je
   er live aan kunt schuiven voordat je de exacte dispatch draait.

   Methode: merit-order arbitrage per prijsvenster — van prijsdal tot prijsdal, dus één laad-
   ontlaadboog per venster. Binnen elk venster worden de goedkoopste laadtranches op de duurste
   ontlaadtranches gelegd en op volume gematcht. Alle zo
   ontstane plakken van de periode, gesorteerd op marge, vormen de KANSENLADDER: een aflopende
   kromme van marginale winst per kWh. De marginale kosten zijn een horizontale lijn; het snijpunt
   is het aantal rendabele cycli per jaar.

   Dit is een BENADERING — geen ondergrens en ook geen strikte bovengrens. Twee dingen wijken af
   van de exacte dispatch, in tegengestelde richting:
     - binnen een venster telt de volgorde in de tijd niet mee (laden mag hier na ontladen liggen);
       dat maakt de uitkomst ruimer dan wat werkelijk uitvoerbaar is,
     - lading kan niet over een vensterovergang worden meegenomen, en per venster past er hooguit
       één acculading doorheen; dat maakt hem krapper.
   Beide effecten heffen elkaar grotendeels op. Gemeten tegen de exacte dispatch op vier
   prijsvormen — rustig en grillig, kleine en grote accu, met en zonder zonoverschot — bleef het
   verschil steeds onder de 5%: iets meer cycli, iets minder marge. Ruim genoeg om een instelling
   te beoordelen, te grof om als uitkomst te rapporteren. Vandaar dat de exacte DP-uitkomst als
   lijn in dezelfde grafiek staat: pas dat verschil vertelt hoeveel je op de benadering kunt
   bouwen bij dít prijsprofiel.

   Eenheden: alle winst- en drempelgetallen zijn EUR per kWh DC-doorzet, dezelfde eenheid als
   EhpOpslag.marginaleKosten(). Prijzen per kwartier zijn EUR per AC-kWh.
*/
(function (global) {
  'use strict';

  var DT = 0.25;   // kwartier in uren

  // ─── Netpositie voor de accu ────────────────────────────────────────────────

  /**
   * Na EhpOpslag.verwerkInModel() staan in result.model de tekort- en overschotkolommen MET accu.
   * Een what-if op diezelfde rijen zou dan rekenen op een positie die de accu al heeft afgevlakt,
   * en systematisch te weinig kansen zien. De pre-accu waarden staan in de _zonder_accu-kolommen;
   * die zijn er alleen als er al een accu is verwerkt, vandaar de terugval.
   *
   * Wordt als `gastheer`-reeks aan bouwSignaal() meegegeven: dat argument overrulet de
   * modelkolommen al, dus opslag.js hoeft er niet voor te wijzigen.
   */
  function preAccuNetto(modelRows) {
    var n = modelRows.length, uit = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      var m = modelRows[i];
      var t  = m.tekort_zonder_accu_kWh    != null ? m.tekort_zonder_accu_kWh    : m.tekort_kWh;
      var ov = m.overschot_zonder_accu_kWh != null ? m.overschot_zonder_accu_kWh : m.overschot_kWh;
      uit[i] = (+t || 0) - (+ov || 0);
    }
    return uit;
  }

  // ─── Configuratiehulp ───────────────────────────────────────────────────────

  /** Retourrendement (%) verdelen over laden en ontladen — de UI schuift een getal. */
  function pasRetourToe(cfg, retourPct) {
    var r = Math.max(1, Math.min(100, +retourPct || 0)) / 100;
    var eta = Math.sqrt(r) * 100;
    var uit = {};
    Object.keys(cfg).forEach(function (k) { uit[k] = cfg[k]; });
    uit.etaLaad_pct = eta; uit.etaOntlaad_pct = eta;
    return uit;
  }

  /** Retourrendement (%) van een configuratie. */
  function retourVan(cfg) {
    var l = +cfg.etaLaad_pct, o = +cfg.etaOntlaad_pct;
    return (isFinite(l) ? l : 94) * (isFinite(o) ? o : 94) / 100;
  }

  function _dagen(rows) {
    if (!rows || rows.length < 2) return rows && rows.length ? 1 : 0;
    var d = (new Date(rows[rows.length - 1].tijdKey) - new Date(rows[0].tijdKey)) / 86400000 + DT / 24;
    return d > 0 ? d : rows.length / 96;
  }

  // ─── Ladder bouwen ──────────────────────────────────────────────────────────

  /** Mediane dagelijkse piek-dalspread van de laadprijs — de maat waarop een venster telt. */
  function _dagSpread(sig, p) {
    var spreads = [], lo = Infinity, hi = -Infinity, dag = null;
    for (var i = 0; i < p.length; i++) {
      var d = String(sig.tijdKey[i]).slice(0, 10);
      if (d !== dag) {
        if (dag !== null && hi > lo) spreads.push(hi - lo);
        dag = d; lo = Infinity; hi = -Infinity;
      }
      if (p[i] < lo) lo = p[i];
      if (p[i] > hi) hi = p[i];
    }
    if (dag !== null && hi > lo) spreads.push(hi - lo);
    return _mediaan(spreads);
  }

  function _mediaan(arr) {
    var v = Array.prototype.slice.call(arr).sort(function (x, y) { return x - y; });
    return v.length ? v[Math.floor(v.length / 2)] : 0;
  }

  /**
   * De timeline opknippen in VENSTERS: één laad-ontlaadboog per venster, met de snede in het dal.
   *
   * Waarom niet per kalenderdag: een accu laadt in het dal en ontlaadt in de piek erna. Ligt de
   * snede op middernacht, dan wordt een laadmoment om 23:00 losgeknipt van het ontlaadmoment om
   * 01:00 en verdwijnt die waarde uit de benadering — systematisch, elke dag opnieuw.
   *
   * Waarom niet één venster per dag: op een duck-curve zit er een ochtend- én een avondpiek, dus
   * twee bogen. Een accu die per venster één keer vol mag, zou er dan één missen.
   *
   * De vensters volgen daarom de prijs zelf, met een zigzag over de laadprijs: een nieuw venster
   * begint bij elk dal waarna de prijs met een noemenswaardig deel van de gebruikelijke dagspread
   * stijgt. Die maatstaf komt bewust uit de PRIJSVORM en niet uit de accu. Zou hij aan de
   * slijtagedrempel hangen, dan verschuift de vensterindeling zodra je aan capex draait — en dan
   * is dat schuifje niet meer instant, terwijl juist dat de knop is waar je aan wilt voelen.
   * Bovendien versnippert een te kleine maatstaf de dag op prijsruis, waardoor het nachtdal en de
   * avondpiek in verschillende vensters belanden en nooit meer gekoppeld worden.
   */
  function _vensterIndex(sig, a) {
    var p = sig.prijsLadenVanNet, n = p.length;
    if (!n) return [];
    // 0,4 x de mediane dagspread. Geijkt door de uitkomst tegen de exacte dispatch te zetten op
    // drie prijsvormen (rustig en grillig, kleine en grote accu): vanaf 0,35 a 0,4 komt de
    // benadering op alle drie binnen 2% uit, en dat blijft zo tot ver boven 0,7 — geen scherpe
    // rand, dus de keuze is niet kritisch. Lager versnippert de dag op prijsruis en raakt het
    // nachtdal losgekoppeld van de avondpiek. window.EHP_KANSEN_AMP overschrijft, om op echte
    // data na te meten.
    var minAmp = Math.max(1e-6, _dagSpread(sig, p) * (+global.EHP_KANSEN_AMP || 0.4));

    var snede = [0], zoekt = 'dal', extreem = p[0], extreemI = 0;
    for (var i = 1; i < n; i++) {
      if (zoekt === 'dal') {
        if (p[i] < extreem) { extreem = p[i]; extreemI = i; }
        if (p[i] - extreem >= minAmp) {
          if (extreemI > snede[snede.length - 1]) snede.push(extreemI);
          zoekt = 'piek'; extreem = p[i]; extreemI = i;
        }
      } else {
        if (p[i] > extreem) { extreem = p[i]; extreemI = i; }
        if (extreem - p[i] >= minAmp) { zoekt = 'dal'; extreem = p[i]; extreemI = i; }
      }
    }

    var vensters = [];
    for (var j = 0; j < snede.length; j++) {
      var tot = j + 1 < snede.length ? snede[j + 1] : n;
      if (tot > snede[j]) vensters.push(_bereik(snede[j], tot));
    }
    return vensters;
  }

  function _bereik(van, tot) {
    var uit = new Array(tot - van);
    for (var i = van; i < tot; i++) uit[i - van] = i;
    return uit;
  }

  /**
   * De tranches van één kwartier: prijs is een STAPFUNCTIE van de hoeveelheid, geen constante.
   *
   * Dit is het punt waarop een naïeve benadering de mist in gaat. Ontladen in een kwartier met
   * 10 kWh tekort levert voor die eerste 10 kWh de volle afnameprijs op (vermeden inkoop inclusief
   * energiebelasting); alles daarboven gaat tegen de veel lagere exportprijs naar het net. Reken je
   * met één gemiddelde prijs over het volle vermogen, dan middel je precies de waarde weg die de
   * dispatch wél pakt — en komt de "bovengrens" ONDER de exacte dispatch uit.
   *
   * Vandaar twee tranches per kant per kwartier: het stuk dat eigen positie vervangt, en de rest.
   */
  function _tranches(sig, a, idx, maxAc) {
    var laad = [], ontlaad = [];
    for (var k = 0; k < idx.length; k++) {
      var i = idx[k];
      var uitO = Math.min(maxAc, sig.overschot[i]);
      if (uitO > 1e-9) laad.push({i: i, vol: uitO, prijs: sig.prijsExport[i], eigen: true});
      // Beleidsschakelaar: mag de accu ook van het net laden?
      if (!a.alleenEigenOverschot && maxAc - uitO > 1e-9) {
        laad.push({i: i, vol: maxAc - uitO, prijs: sig.prijsLadenVanNet[i], eigen: false});
      }
      var naarT = Math.min(maxAc, sig.tekort[i]);
      if (naarT > 1e-9) ontlaad.push({i: i, vol: naarT, prijs: sig.prijsAfname[i], tekort: true});
      if (maxAc - naarT > 1e-9) {
        ontlaad.push({i: i, vol: maxAc - naarT, prijs: sig.prijsExport[i], tekort: false});
      }
    }
    laad.sort(function (x, y) { return x.prijs - y.prijs; });
    ontlaad.sort(function (x, y) { return y.prijs - x.prijs; });
    return {laad: laad, ontlaad: ontlaad};
  }

  /**
   * De plakken: een merit-order koppeling per venster van de goedkoopste laadtranches aan de
   * duurste ontlaadtranches, op volume gematcht. Een kwartier kan niet tegelijk laden en ontladen, dus
   * zodra het aan één kant meedoet valt het aan de andere kant af.
   *
   * Per venster geldt zowel het VERMOGEN (een kwartier doet één ding) als de CAPACITEIT: een
   * venster is per constructie één laad-ontlaadboog, dus er kan hooguit één acculading doorheen.
   * Zonder die tweede grens gaat de benadering op een grillige prijsreeks eindeloos door met
   * hoogfrequente ruilen die geen enkele accu kan uitvoeren — op praktijkdata schoot ze daarmee
   * een factor twee tot vijf over de exacte dispatch heen.
   *
   * Binnen één venster is dit een harde bovengrens: elke uitvoerbare dispatch verplaatst daar
   * energie van laadkwartieren naar ontlaadkwartieren en waardeert die volgens exact dezelfde
   * tranches, terwijl deze koppeling de duurste ontlading op de goedkoopste lading legt en alleen
   * de volgorde in de tijd loslaat. Over de hele periode vervalt die garantie, omdat de DP lading
   * wél over een vensterovergang mag meenemen. Zie de bestandskop.
   */
  function _maakSlices(ladder) {
    var a = ladder.a, sig = ladder.sig, maxAc = a.kW * DT, slices = [];
    ladder.tranches = {laad: [], ontlaad: []};
    ladder._merit = null;   // gememoiseerde merit-krommes horen bij deze tranches
    if (maxAc <= 0 || a.bruikbaar <= 0) { ladder.slices = slices; return ladder; }

    ladder.vensters.forEach(function (idx) {
      var tr = _tranches(sig, a, idx, maxAc);
      // push.apply in plaats van concat: concat maakt per venster een kopie van de hele lijst tot
      // dan toe, en dat is over honderden vensters kwadratisch werk — op een jaarprofiel het
      // verschil tussen tientallen milliseconden en meer dan een seconde.
      Array.prototype.push.apply(ladder.tranches.laad, tr.laad);
      Array.prototype.push.apply(ladder.tranches.ontlaad, tr.ontlaad);

      var li = 0, oi = 0, curL = null, curO = null, restL = 0, restO = 0;
      var ruimte = a.bruikbaar;   // hooguit één acculading per venster
      var kant = {};              // kwartier -> 'l' of 'o'
      while (ruimte > 1e-9) {
        if (!curL || restL <= 1e-9) {
          while (li < tr.laad.length && kant[tr.laad[li].i] === 'o') li++;
          if (li >= tr.laad.length) break;
          curL = tr.laad[li]; restL = curL.vol; li++;
          kant[curL.i] = 'l';
        }
        if (!curO || restO <= 1e-9) {
          while (oi < tr.ontlaad.length && kant[tr.ontlaad[oi].i] === 'l') oi++;
          if (oi >= tr.ontlaad.length) break;
          curO = tr.ontlaad[oi]; restO = curO.vol; oi++;
          kant[curO.i] = 'o';
        }
        // Matchen op DC-hoeveelheid: laden levert etaLaad, ontladen kost 1/etaOntlaad.
        var dc = Math.min(restL * a.etaLaad, restO / a.etaOntlaad, ruimte);
        if (dc <= 1e-9) { restL = 0; restO = 0; continue; }
        ruimte -= dc;
        var acIn = dc / a.etaLaad, acUit = dc * a.etaOntlaad;
        slices.push({
          winst: curO.prijs * a.etaOntlaad - curL.prijs / a.etaLaad,
          vol: dc, acIn: acIn, acUit: acUit,
          laadPrijs: curL.prijs, ontPrijs: curO.prijs,
          uitOverschot: curL.eigen ? acIn : 0,
          naarTekort: curO.tekort ? acUit : 0,
          iL: curL.i, iO: curO.i
        });
        restL -= acIn; restO -= acUit;
      }
    });

    slices.sort(function (x, y) { return y.winst - x.winst; });
    ladder.slices = slices;
    return ladder;
  }

  /**
   * Volledige ladder voor een accuconfiguratie.
   * opties = {gastheer, ebTarief, aandeelEigen}. `gastheer` is de netpositie per kwartier van de
   * aansluiting waarachter de accu staat — voor de gedeelde aansluiting is dat preAccuNetto().
   */
  function bouwLadder(modelRows, cfg, opties) {
    var o = opties || {};
    var a = global.EhpOpslag.lees(cfg);
    // EhpOpslag.lees() vult ebEffectief niet — alleen dispatch() doet dat. Zonder invulling valt
    // bouwSignaal terug op 0 en worden alle EB-effecten stil weggelaten.
    a.ebEffectief = isFinite(+o.ebTarief) ? +o.ebTarief : 0;
    var sig = global.EhpOpslag.bouwSignaal(modelRows, a,
      a.eigenaar === 'platform' ? null : (o.gastheer || preAccuNetto(modelRows)),
      o.aandeelEigen == null ? 1 : o.aandeelEigen);

    var ladder = {
      a: a, sig: sig,
      mk: global.EhpOpslag.marginaleKosten(a),
      periodeDagen: _dagen(modelRows)
    };
    ladder.vensters = _vensterIndex(sig, a);
    return _maakSlices(ladder);
  }

  /**
   * Andere maat, zelfde prijzen. Capaciteit en vermogen veranderen alleen de tranchegroottes en de
   * plakgrootte; het prijssignaal per kwartier blijft staan. Scheelt de helft van het werk ten
   * opzichte van een volledige herbouw.
   */
  function herslice(ladder, kWh, kW) {
    var a = ladder.a;
    var socMinF = a.kWh > 0 ? a.socMin / a.kWh : 0.05;
    var socMaxF = a.kWh > 0 ? a.socMax / a.kWh : 0.95;
    a.kWh = Math.max(0, +kWh || 0);
    a.kW  = Math.max(0, +kW  || 0);
    a.socMin = a.kWh * socMinF; a.socMax = a.kWh * socMaxF;
    a.bruikbaar = Math.max(0, a.socMax - a.socMin);
    ladder.mk = global.EhpOpslag.marginaleKosten(a);
    // Alleen de tranches opnieuw: het prijssignaal zelf verandert niet van maat, dus bouwSignaal()
    // — de dure lineaire pas over alle kwartieren — hoeft niet nog een keer.
    return _maakSlices(ladder);
  }

  // ─── Evaluatie bij een drempel ──────────────────────────────────────────────

  /**
   * De kromme voor de grafiek. Omdat de plakken alleen door het vermogen begrensd zijn, loopt de
   * staart door tot ver voorbij alles wat ooit rendabel wordt — duizenden cycli met een spread van
   * niets. Die staart afkappen is geen verlies aan informatie maar noodzaak: zonder afkappen wordt
   * het gebied rond de drempel, waar de beslissing valt, tot een streepje samengeperst.
   * Er blijft ruim marge onder de drempel staan, zodat zichtbaar is hoe steil hij eronder wegvalt.
   */
  function _kromme(sl, bruikbaar, jf, mk, punten) {
    var n = sl.length;
    if (!n || bruikbaar <= 0) return [];
    var ondergrens = mk - 0.05;                 // 5 ct/kWh onder de drempel is ruim genoeg context
    var kap = n;
    for (var j = 0; j < n; j++) {
      if (sl[j].winst < ondergrens) { kap = Math.max(j, Math.min(n, 20)); break; }
    }
    var uit = [], cum = 0;
    var stap = Math.max(1, Math.floor(kap / (punten || 160)));
    for (var i = 0; i < kap; i++) {
      cum += sl[i].vol;
      if (i % stap === 0 || i === kap - 1) uit.push({cycli: cum / bruikbaar * jf, winst: sl[i].winst});
    }
    return uit;
  }

  /**
   * Wat levert deze ladder op bij drempel mk? De plakken staan aflopend op winst, dus zodra er
   * een onder de drempel zakt zijn alle volgende dat ook — vandaar de break in plaats van een filter.
   */
  function evalueer(ladder, mk, punten) {
    var sl = ladder.slices || [], a = ladder.a;
    var jf = ladder.periodeDagen > 0 ? 365 / ladder.periodeDagen : 1;
    var bruikbaar = a.bruikbaar || 0;
    var marge = 0, vol = 0, n = 0, laadEur = 0, ontEur = 0;
    var laadAc = 0, uitOverschot = 0, naarTekort = 0;
    // Eén kwartier kan meerdere plakken voeden (het heeft twee tranches, en een tranche kan over
    // meerdere plakken verdeeld raken). Plakken tellen zou de actieve tijd dus overdrijven; wat de
    // vraag "op hoeveel momenten is de accu interessant" beantwoordt is het aantal UNIEKE kwartieren.
    var raak = new Uint8Array(ladder.sig.tijdKey.length), kwartieren = 0;

    for (var i = 0; i < sl.length; i++) {
      var s = sl[i];
      if (s.winst <= mk) break;
      marge   += (s.winst - mk) * s.vol;
      vol     += s.vol;   n++;
      laadEur += s.laadPrijs * s.acIn;
      ontEur  += s.ontPrijs  * s.acUit;
      laadAc  += s.acIn;
      uitOverschot += s.uitOverschot;
      naarTekort   += s.naarTekort;
      if (!raak[s.iL]) { raak[s.iL] = 1; kwartieren++; }
      if (!raak[s.iO]) { raak[s.iO] = 1; kwartieren++; }
    }

    var afgeleverd = vol * a.etaOntlaad;
    return {
      rendabelePlakken: n,
      rendabeleCycli: bruikbaar > 0 ? vol / bruikbaar * jf : 0,
      urenActief: kwartieren * DT * jf,
      doorzet_kWh: vol * jf,
      afgeleverd_kWh: afgeleverd * jf,
      geladenVanNet_kWh: (laadAc - uitOverschot) * jf,
      bovengrensMarge_EUR: marge * jf,
      margeNaAfslag_EUR: marge * jf * (1 - a.voorspelAfslag),
      margePerKwh_EUR: afgeleverd > 0 ? marge / afgeleverd : 0,
      gemLaadprijs_EUR_kWh: laadAc > 0 ? laadEur / laadAc : 0,
      gemOntlaadprijs_EUR_kWh: afgeleverd > 0 ? ontEur / afgeleverd : 0,
      aandeelEigen: laadAc > 0 ? uitOverschot / laadAc : 0,
      aandeelInEigenVerbruik: afgeleverd > 0 ? naarTekort / afgeleverd : 0,
      drempel_EUR_kWh: mk,
      // Beste en slechtste plak: de bandbreedte waarbinnen de drempel iets uitmaakt.
      besteWinst: sl.length ? sl[0].winst : 0,
      slechtsteWinst: sl.length ? sl[sl.length - 1].winst : 0,
      kromme: _kromme(sl, bruikbaar, jf, mk, punten)
    };
  }

  // ─── Kostprijs per afgeleverde kWh ──────────────────────────────────────────

  /**
   * De opbouw die de vraag "wat kost een kWh uit deze accu" letterlijk beantwoordt, per
   * AFGELEVERDE kWh (AC, aan de uitgang).
   *
   * Let op het verschil met de LCOS-tegel in de bestaande kaart: die telt alleen kapitaallast en
   * opex — de prijs van de opslagdienst, zonder de energie. Hier staat de volledige kostprijs
   * inclusief de laadstroom, want dat is het getal dat naast de ontlaadwaarde hoort.
   *
   * Om 1 kWh af te leveren koop je 1/(eta_laad x eta_ontlaad) kWh in. Dat splitsen we in de
   * energie zelf plus het rendementsverlies, zodat zichtbaar is wat het rendement kost.
   */
  function kostprijsOpbouw(ladder, ev, opties) {
    var a = ladder.a, o = opties || {};
    var disconto = (o.discontoPct != null ? +o.discontoPct : 5) / 100;
    var eta = a.etaLaad * a.etaOntlaad;
    var afgeleverd = ev.afgeleverd_kWh;

    var inkoop  = ev.gemLaadprijs_EUR_kWh;
    var verlies = eta > 0 ? inkoop * (1 / eta - 1) : 0;
    // mk is per kWh DC-doorzet; om 1 kWh af te leveren gaat er 1/eta_ontlaad kWh DC doorheen.
    var slijtage = a.etaOntlaad > 0 ? ladder.mk / a.etaOntlaad : 0;

    // Effectieve levensduur: het cyclusbudget kan eerder op zijn dan de kalender.
    var jarenTotCycli = ev.rendabeleCycli > 0 ? a.cyclusleven / ev.rendabeleCycli : Infinity;
    var effLevensduur = Math.max(1, Math.min(a.levensduurJr, jarenTotCycli));
    var crf = disconto > 0
      ? disconto / (1 - Math.pow(1 + disconto, -effLevensduur))
      : 1 / effLevensduur;

    var opex     = afgeleverd > 0 ? a.opexKwhJr * a.kWh / afgeleverd : 0;
    var kapitaal = afgeleverd > 0 ? a.capexKwh  * a.kWh * crf / afgeleverd : 0;
    var marginaal = inkoop + verlies + slijtage;

    return {
      inkoop: inkoop, rendementsverlies: verlies, slijtage: slijtage,
      marginaleKostprijs: marginaal,
      opex: opex, kapitaallast: kapitaal,
      volledigeKostprijs: marginaal + opex + kapitaal,
      // Alleen de opslagdienst, vergelijkbaar met de LCOS-tegel uit businesscase().
      lcosDienst: opex + kapitaal,
      ontlaadwaarde: ev.gemOntlaadprijs_EUR_kWh,
      dekt: ev.gemOntlaadprijs_EUR_kWh >= marginaal + opex + kapitaal,
      // Slijtagedrempel zoals de dispatch hem hanteert: per kWh DC-doorzet, hele cyclus.
      slijtagedrempel_EUR_kWh: ladder.mk,
      ebOpLaden_EUR_kWh: eta > 0 ? (ladder.sig.ebLaden || 0) / eta : 0,
      effectieveLevensduur_jr: effLevensduur, crf: crf
    };
  }

  // ─── Duurkrommes van het prijssignaal ───────────────────────────────────────

  /**
   * Merit-orderkromme via een histogram in plaats van een sortering.
   *
   * Een duurkromme is per definitie een gesorteerde reeks, maar sorteren kost O(n log n) en dit
   * draait vier keer over tienduizenden tranches — bij elke schuiftik. Een histogram met vaste
   * bakjes geeft dezelfde kromme in één lineaire pas, en de grafiek toont er toch maar een paar
   * honderd punten van. De bakbreedte is fijner dan de lijndikte, dus er gaat visueel niets verloren.
   */
  function _meritKromme(tr, prijsVan, aflopend, jf, bakken) {
    var n = tr.length;
    if (!n) return [];
    var B = bakken || 400;
    var lo = Infinity, hi = -Infinity, i, pr;
    for (i = 0; i < n; i++) {
      pr = prijsVan(tr[i]);
      if (pr < lo) lo = pr;
      if (pr > hi) hi = pr;
    }
    if (!(hi > lo)) {
      var tot = 0;
      for (i = 0; i < n; i++) tot += tr[i].vol;
      return [{mwh: 0, ct: lo * 100}, {mwh: tot * jf / 1000, ct: lo * 100}];
    }
    var breedte = (hi - lo) / B, vol = new Float64Array(B);
    for (i = 0; i < n; i++) {
      var b = Math.floor((prijsVan(tr[i]) - lo) / breedte);
      if (b < 0) b = 0; else if (b >= B) b = B - 1;
      vol[b] += tr[i].vol;
    }
    var uit = [], cum = 0;
    for (var k = 0; k < B; k++) {
      var idx = aflopend ? B - 1 - k : k;
      if (vol[idx] <= 0) continue;
      cum += vol[idx];
      uit.push({mwh: cum * jf / 1000, ct: (lo + (idx + 0.5) * breedte) * 100});
    }
    return uit;
  }

  /**
   * De geleverde spread als merit-orderkromme: hoeveel volume er beschikbaar is tegen welke prijs.
   *
   * Links het beste van beide kanten. De verticale afstand bij volume V is de spread die je krijgt
   * als je V MWh per jaar verhandelt. De gestippelde krommes zijn dezelfde kwartieren gewaardeerd
   * tegen de KALE EPEX-prijs: het verschil tussen de gekleurde en de grijze band is de wig van
   * leveringsopslag, terugleverafslag en vermeden energiebelasting. Die wig is een afspraak, geen
   * markt — en juist daar zit de knop waarmee je de accu vaker interessant maakt.
   *
   * Dit is de jaarbrede envelop: hij kent geen vensterovergang en ligt dus ruimer dan de ladder.
   *
   * Gememoiseerd op de ladder: de krommes hangen aan de tranches, en die veranderen alleen bij een
   * herbouw. Schuiven aan capex of cyclusleven raakt ze dus niet.
   */
  function meritKrommes(ladder, punten) {
    if (ladder._merit) return ladder._merit;
    var jf = ladder.periodeDagen > 0 ? 365 / ladder.periodeDagen : 1;
    var tr = ladder.tranches || {laad: [], ontlaad: []};
    var eigenPrijs = function (t) { return t.prijs; };
    var epexPrijs  = function (t) { return ladder.sig.epex[t.i]; };
    ladder._merit = {
      ontladen:     _meritKromme(tr.ontlaad, eigenPrijs, true,  jf, punten),
      laden:        _meritKromme(tr.laad,    eigenPrijs, false, jf, punten),
      ontladenEpex: _meritKromme(tr.ontlaad, epexPrijs,  true,  jf, punten),
      ladenEpex:    _meritKromme(tr.laad,    epexPrijs,  false, jf, punten)
    };
    return ladder._merit;
  }

  // ─── Volledige analyse ──────────────────────────────────────────────────────

  /**
   * Ladder + evaluatie + kostprijs in een aanroep.
   *
   * aandeelEigen is een UITKOMST, geen invoer: welk deel van de opgeslagen energie uit eigen opwek
   * komt bepaalt het EB-voordeel bij ontladen, maar volgt zelf uit welke plakken de moeite waard
   * bleken. Een herhaalslag is genoeg om dat rond te maken; meer levert onder de 2 procentpunt op.
   */
  function analyseer(modelRows, cfg, opties) {
    var o = opties || {};
    var ladder = bouwLadder(modelRows, cfg, o);
    var ev = evalueer(ladder, ladder.mk, o.punten);

    var ebDoetErToe = ladder.a.opslagVrijstelling && ladder.a.eigenaar !== 'platform' &&
                      (ladder.a.ebEffectief || 0) > 0;
    if (ebDoetErToe && Math.abs(ev.aandeelEigen - (ladder.sig.aandeelEigen || 0)) > 0.02) {
      ladder = bouwLadder(modelRows, cfg, {
        gastheer: o.gastheer, ebTarief: o.ebTarief, aandeelEigen: ev.aandeelEigen
      });
      ev = evalueer(ladder, ladder.mk, o.punten);
    }
    return {ladder: ladder, ev: ev, kostprijs: kostprijsOpbouw(ladder, ev, o)};
  }

  // ─── Gevoeligheid ───────────────────────────────────────────────────────────

  var KNOPPEN = [
    {key:'capex_kwh',            label:'Capex',             eenheid:'€/kWh',  stap:0.20},
    {key:'cyclusleven',          label:'Cyclusleven',       eenheid:'cycli',  stap:0.20},
    {key:'etaRetour_pct',        label:'Rendement retour',  eenheid:'%',      stap:0.05},
    {key:'afnameOpslag_mwh',     label:'Leveringsopslag',   eenheid:'€/MWh',  stap:0.20},
    {key:'terugleverAfslag_mwh', label:'Terugleverafslag',  eenheid:'€/MWh',  stap:0.20}
  ];

  function _metWaarde(cfg, key, waarde) {
    if (key === 'etaRetour_pct') return pasRetourToe(cfg, waarde);
    var uit = {};
    Object.keys(cfg).forEach(function (k) { uit[k] = cfg[k]; });
    uit[key] = waarde;
    return uit;
  }

  function _huidigeWaarde(cfg, key) {
    return key === 'etaRetour_pct' ? retourVan(cfg) : (+cfg[key] || 0);
  }

  /**
   * Welke knop beweegt het aantal rendabele cycli het meest? Per knop een stap omlaag en omhoog,
   * de rest gelijk. Bewust een tabel en geen enkelvoudig "beste" advies: welke knop je kunt
   * draaien is een onderhandelingsvraag, geen rekenvraag.
   */
  function gevoeligheid(modelRows, cfg, opties) {
    var o = opties || {};
    var basis = analyseer(modelRows, cfg, o);

    // Capex en cyclusleven raken alleen de drempel, niet de prijzen of de plakken. Die twee op de
    // basisladder herevalueren scheelt vier van de tien doorrekeningen — en dat zijn net de twee
    // knoppen waar je het vaakst aan draait.
    // Voor de overige knoppen wél een herbouw, maar zonder de herhaalslag op aandeelEigen: welk
    // deel van de lading uit eigen opwek komt is door de basisanalyse al vastgesteld en verschuift
    // niet noemenswaardig door 20% aan een tarief. Die aanname scheelt de helft van het rekenwerk
    // en houdt de tabel binnen een seconde na het loslaten van een schuif.
    var vast = {gastheer: o.gastheer, ebTarief: o.ebTarief, aandeelEigen: basis.ev.aandeelEigen};

    function evalBij(key, waarde) {
      if (key === 'capex_kwh' || key === 'cyclusleven') {
        var a = basis.ladder.a;
        var capex = key === 'capex_kwh'   ? waarde : a.capexKwh;
        var cycli = key === 'cyclusleven' ? Math.max(1, waarde) : a.cyclusleven;
        var mk = a.bruikbaar > 0 ? capex * a.kWh / (cycli * a.bruikbaar) : 0;
        return evalueer(basis.ladder, mk);
      }
      var l = bouwLadder(modelRows, _metWaarde(cfg, key, waarde), vast);
      return evalueer(l, l.mk);
    }

    return {
      basisCycli: basis.ev.rendabeleCycli,
      rijen: KNOPPEN.map(function (k) {
        var nu = _huidigeWaarde(cfg, k.key);
        var laag = k.key === 'etaRetour_pct' ? Math.max(50, nu - 5) : nu * (1 - k.stap);
        var hoog = k.key === 'etaRetour_pct' ? Math.min(99, nu + 5) : nu * (1 + k.stap);
        var evL = evalBij(k.key, laag);
        var evH = evalBij(k.key, hoog);
        return {
          key: k.key, label: k.label, eenheid: k.eenheid,
          nu: nu, laag: laag, hoog: hoog,
          cycliLaag: evL.rendabeleCycli, cycliHoog: evH.rendabeleCycli,
          margeLaag_EUR: evL.bovengrensMarge_EUR, margeHoog_EUR: evH.bovengrensMarge_EUR,
          cycliSpan: Math.abs(evH.rendabeleCycli - evL.rendabeleCycli),
          margeSpan_EUR: Math.abs(evH.bovengrensMarge_EUR - evL.bovengrensMarge_EUR)
        };
      // Sorteren op MARGE, niet op cycli. Een accu die al elke dag een rondje draait zit tegen zijn
      // plafond: dan blijft het cyclusaantal staan terwijl de marge nog flink beweegt, en zou een
      // rangschikking op cycli precies de knop bovenaan zetten die het minst uitmaakt.
      }).sort(function (x, y) { return y.margeSpan_EUR - x.margeSpan_EUR; })
    };
  }

  // ─── Export ─────────────────────────────────────────────────────────────────
  global.EhpKansen = {
    KNOPPEN:         KNOPPEN,
    preAccuNetto:    preAccuNetto,
    pasRetourToe:    pasRetourToe,
    retourVan:       retourVan,
    bouwLadder:      bouwLadder,
    herslice:        herslice,
    evalueer:        evalueer,
    kostprijsOpbouw: kostprijsOpbouw,
    meritKrommes:    meritKrommes,
    analyseer:       analyseer,
    gevoeligheid:    gevoeligheid
  };

})(window);
