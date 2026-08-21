/* EHP opslag — paneel "Wanneer loont deze accu?".
   Hoort bij ehp/opslag_kansen.js (pure rekenlogica); dit bestand doet uitsluitend DOM en Chart.js.

   Waarom een apart paneel boven de uitkomstrapportage: de bestaande Opslag-tab vertelt wat de
   dispatch heeft gedaan, niet waarom hij niet méér heeft gedaan bij een andere instelling. Dat
   verschil is precies waar de configuratiekeuze zit. Hier staan de drempel, de kansen die erboven
   uitkomen en de knoppen die dat verschuiven bij elkaar, zodat je kunt schuiven zonder telkens
   de dure DP te draaien.
*/

// ─── Schuiven ────────────────────────────────────────────────────────────────

// `mode` bepaalt hoeveel er herrekend moet worden en dus hoe snel de schuif aanvoelt:
//   snel     alleen de drempel verschuift — de ladder blijft staan (microseconden)
//   maat     andere tranchegroottes — opnieuw koppelen, maar het prijssignaal blijft staan
//   vol      het prijssignaal zelf verandert — volledige herbouw (tientallen ms)
var EHP_KANSEN_SCHUIVEN = [
  {key:'capex_kwh',            label:'Capex',                  eenheid:'€/kWh',  min:50,   max:1200,  stap:5,    mode:'snel'},
  {key:'cyclusleven',          label:'Levensduur (cycli)',     eenheid:'cycli',  min:1000, max:15000, stap:250,  mode:'snel'},
  {key:'kWh',                  label:'Capaciteit',             eenheid:'kWh',    rel:3,    stap:10,   mode:'maat'},
  {key:'kW',                   label:'Vermogen',               eenheid:'kW',     rel:3,    stap:5,    mode:'maat'},
  {key:'etaRetour_pct',        label:'Rendement retour',       eenheid:'%',      min:60,   max:99,    stap:1,    mode:'vol'},
  {key:'afnameOpslag_mwh',     label:'Leveringsopslag afname', eenheid:'€/MWh',  min:0,    max:80,    stap:1,    mode:'vol'},
  {key:'terugleverAfslag_mwh', label:'Afslag teruglevering',   eenheid:'€/MWh',  min:0,    max:60,    stap:1,    mode:'vol'},
  {key:'eb_ct',                label:'Energiebelasting',       eenheid:'ct/kWh', min:0,    max:20,    stap:0.1,  mode:'vol'}
];

// Werkstand van het paneel. Bewust één object: de schuiven, de grafieken en de knoppen kijken
// allemaal naar dezelfde waarheid, zodat er geen tweede administratie van de configuratie ontstaat.
var _ehpKansen = null;

// ─── Hulpjes ─────────────────────────────────────────────────────────────────

function _kCt(x) { return _e2((+x || 0) * 100) + ' ct'; }
function _kEur(x) { return '€ ' + _e2(+x || 0); }

/**
 * Netpositie van de aansluiting waarachter de accu staat, vóór de accu.
 * Voor een deelnemer levert res.ledenNetto dat al pre-accu; voor de gedeelde aansluiting moeten
 * we terug naar de _zonder_accu-kolommen, want res.model is na verwerkInModel() al afgevlakt.
 */
function _ehpKansenGastheer(res, cfg) {
  if (cfg.eigenaar === 'platform') return null;
  var g = _ehpGastheerProfiel(res.model, res.ledenNetto, cfg.eigenaar);
  return g || EhpKansen.preAccuNetto(res.model);
}

/** Werkconfiguratie voor accu i: een kopie, zodat schuiven de opgeslagen instellingen niet raakt. */
function _ehpKansenCfg(res, i) {
  var bron = res.opslag[i].cfg || {}, uit = {};
  Object.keys(bron).forEach(function (k) { uit[k] = bron[k]; });
  return uit;
}

/** Huidige waarde van een schuif; `eb_ct` en `etaRetour_pct` zijn afgeleid, geen echt veld. */
function _ehpKansenWaarde(key) {
  var st = _ehpKansen;
  if (key === 'eb_ct') return (st.ebTarief || 0) * 100;
  if (key === 'etaRetour_pct') return EhpKansen.retourVan(st.cfg);
  return +st.cfg[key] || 0;
}

function _ehpKansenZet(key, waarde) {
  var st = _ehpKansen;
  if (key === 'eb_ct') { st.ebTarief = waarde / 100; st.cfg.eb_kwh = waarde / 100; return; }
  if (key === 'etaRetour_pct') { st.cfg = EhpKansen.pasRetourToe(st.cfg, waarde); return; }
  st.cfg[key] = waarde;
}

// ─── Opbouw van de kaart ─────────────────────────────────────────────────────

function _ehpKansenHtml(res) {
  var lijst = res.opslag || [];
  if (!lijst.length || typeof EhpKansen === 'undefined') return '';

  var kiezer = lijst.length > 1
    ? '<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">' +
        lijst.map(function (o, i) {
          return '<button class="tab' + (i === 0 ? ' on' : '') + '" data-kansen-accu="' + i + '">' +
            _ehpEsc((o.cfg && o.cfg.naam) || ('Accu ' + (i + 1))) + '</button>';
        }).join('') + '</div>'
    : '';

  var schuiven = EHP_KANSEN_SCHUIVEN.map(function (s) {
    return '<div style="margin-bottom:9px" data-kansen-rij="' + s.key + '">' +
      '<label style="display:block;margin-bottom:3px;font-size:11px;font-weight:800;' +
        'text-transform:uppercase;letter-spacing:.6px;color:#999">' + s.label +
        ' <span style="float:right;color:#c0793c;font-weight:700;text-transform:none;' +
        'letter-spacing:0;font-size:12px" data-kansen-lbl="' + s.key + '">—</span></label>' +
      '<input type="range" data-kansen-schuif="' + s.key + '" step="' + s.stap +
        '" style="width:100%;accent-color:#c0793c">' +
      '</div>';
  }).join('');

  return '<div class="cd" id="ehpKansenKaart">' +
    '<div class="ct2"><div class="ac" style="background:#c0793c"></div>Wanneer loont deze accu?</div>' +
    '<div class="ib2">De dispatch handelt zodra de geleverde spread de slijtage dekt. Hieronder staat ' +
      'waar die drempel ligt, hoeveel momenten er in het jaar overheen komen, en wat elke knop daaraan ' +
      'doet. De cijfers komen uit een snelle benadering — per dag de goedkoopste laadmomenten tegen ' +
      'de duurste ontlaadmomenten — en niet uit de exacte dispatch. Daardoor kost schuiven ' +
      'milliseconden in plaats van seconden. Reken op een paar procent afwijking: goed genoeg om een ' +
      'instelling te beoordelen, te grof om te rapporteren. Bevalt een instelling, neem hem dan over ' +
      'en laat de exacte dispatch het narekenen.</div>' +
    kiezer +
    '<div class="kg" id="ehpKansenKpi"></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:4px">' +
      '<div>' +
        '<div class="st">Kansenladder</div>' +
        '<div class="cw" style="height:230px"><canvas id="cEhpKansen" role="img"></canvas></div>' +
        '<div class="ib2">Elke plek op de kromme is een stukje handel, van meest naar minst ' +
          'lucratief. De rode stippellijn is de slijtagedrempel: alles erboven verdient zichzelf ' +
          'terug, en waar de kromme hem snijdt staat het aantal rendabele cycli. Hoe VLAKKER de ' +
          'kromme rond de drempel loopt, hoe gevoeliger de accu is voor een klein duwtje aan een ' +
          'knop. De grijze lijn is waar de exacte dispatch uitkwam, gerekend op pure arbitrage ' +
          'zonder piekbeperking; ligt die er ver vandaan, neem de benadering dan met een korrel ' +
          'zout. Piekscheren zit hier niet in — die ruil staat in het blok Piekreductie hieronder.</div>' +
      '</div>' +
      '<div>' +
        '<div class="st">Geleverde spread per kwartier</div>' +
        '<div class="cw" style="height:230px"><canvas id="cEhpWig" role="img"></canvas></div>' +
        '<div class="ib2">Hoeveel volume er tegen welke prijs te koop en te verkopen is, beste ' +
          'kant eerst. De afstand tussen de oranje en de blauwe lijn is de spread die je krijgt als ' +
          'je zoveel MWh per jaar verhandelt. De grijze stippellijnen zijn diezelfde kwartieren tegen ' +
          'de kale marktprijs: het verschil tussen de gekleurde en de grijze band is de wig van ' +
          'leveringsopslag, terugleverafslag en vermeden energiebelasting. Die wig is een afspraak, ' +
          'geen markt — en vaak breder dan de marktspread zelf. Daar zit dus de knop.</div>' +
      '</div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:minmax(230px,.8fr) 1.4fr;gap:16px;margin-top:12px">' +
      '<div>' +
        '<div class="st">Wat-als</div>' +
        schuiven +
        '<div style="display:flex;gap:6px;margin-top:10px">' +
          '<button class="b d" id="btnEhpKansenReset" style="width:auto;padding:6px 12px">Terugzetten</button>' +
          '<button class="b dk" id="btnEhpKansenOver" style="width:auto;padding:6px 12px">Overnemen</button>' +
        '</div>' +
        '<div class="ib2" style="margin-top:8px;font-size:12px">Overnemen schrijft de gekozen waarden ' +
          'naar de accu-instellingen in de zijbalk en rekent het platform opnieuw door met de exacte ' +
          'dispatch.</div>' +
      '</div>' +
      '<div>' +
        '<div class="st">Kostprijs per afgeleverde kWh</div>' +
        '<div id="ehpKansenKost"></div>' +
        '<div class="st" style="margin-top:14px">Welke knop beweegt het meest?</div>' +
        '<div id="ehpKansenGev"><div class="ib2">Wordt berekend…</div></div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

// ─── Rekenen en tekenen ──────────────────────────────────────────────────────

/** Volledige (her)opbouw voor accu `idx` — gebruikt bij het openen en bij wisselen van accu. */
function _ehpKansenLaad(res, idx) {
  var cfg = _ehpKansenCfg(res, idx);
  var dsp = res.opslag[idx].dispatch || {};
  // Vergelijken met de dispatch ZONDER piekbeperking. De accu die uiteindelijk gedraaid heeft,
  // houdt lading vrij om de maandpiek af te toppen en levert daar arbitrage voor in; deze ladder
  // kent piekscheren niet. Naast de piekbeperkte uitkomst zetten zou hem systematisch te hoog
  // laten lijken, terwijl het verschil niets over de benadering zegt. De ruil tussen arbitrage en
  // piekverlaging staat al in het blok Piekreductie hieronder.
  var zp  = res.opslag[idx].dispatchZonderPiek || dsp;
  var jf  = zp.periodeDagen > 0 ? 365 / zp.periodeDagen : 0;
  _ehpKansen = {
    res: res, idx: idx, cfg: cfg,
    basisCfg: _ehpKansenCfg(res, idx),
    // Het effectieve EB-tarief komt uit de echte dispatch: die heeft de staffel al bepaald op de
    // jaarafname van de gastheeraansluiting. Overschrijft de gebruiker het, dan telt zijn waarde.
    ebTarief: +dsp.ebTarief_EUR_kWh || 0,
    basisEb:  +dsp.ebTarief_EUR_kWh || 0,
    gastheer: _ehpKansenGastheer(res, cfg),
    disconto: EHP_PARAMS.waarde(res.cfg, 'disconto_pct'),
    dpCycli: (+zp.cycli || 0) * jf,
    dpMarge: (+zp.marge_EUR || 0) * jf,
    ladder: null, ev: null, kost: null
  };
  _ehpKansenHerreken('vol');
  _ehpKansenSchuivenVullen();
  _ehpKansenGevoeligheid();
}

/** Herrekenen op het gevraagde niveau; zie EHP_KANSEN_SCHUIVEN voor wat `mode` betekent. */
function _ehpKansenHerreken(mode) {
  var st = _ehpKansen;
  if (!st) return;
  var opts = {gastheer: st.gastheer, ebTarief: st.ebTarief, discontoPct: st.disconto};

  if (mode === 'snel' && st.ladder) {
    // Capex en cyclusleven raken alleen de drempel — prijzen en plakken blijven staan.
    st.ladder.a.capexKwh    = +st.cfg.capex_kwh || 0;
    st.ladder.a.cyclusleven = Math.max(1, +st.cfg.cyclusleven || 1);
    st.ladder.mk = EhpOpslag.marginaleKosten(st.ladder.a);
    st.ev = EhpKansen.evalueer(st.ladder, st.ladder.mk);
  } else if (mode === 'maat' && st.ladder) {
    EhpKansen.herslice(st.ladder, st.cfg.kWh, st.cfg.kW);
    st.ev = EhpKansen.evalueer(st.ladder, st.ladder.mk);
  } else {
    var an = EhpKansen.analyseer(st.res.model, st.cfg, opts);
    st.ladder = an.ladder; st.ev = an.ev;
  }
  st.kost = EhpKansen.kostprijsOpbouw(st.ladder, st.ev, opts);

  _ehpKansenKpi();
  _ehpKansenKostTabel();
  _ehpTekenKansenLadder();
  _ehpTekenKansenWig();
}

function _ehpKansenKpi() {
  var el = document.getElementById('ehpKansenKpi');
  if (!el) return;
  var st = _ehpKansen, ev = st.ev, k = st.kost;
  var afwijking = st.dpCycli > 0 ? (ev.rendabeleCycli - st.dpCycli) / st.dpCycli * 100 : null;

  el.innerHTML =
    '<div class="kb org"><div class="kl">Slijtagedrempel</div><div class="kv" style="font-size:16px">' +
      _kCt(st.ladder.mk) + '</div><div class="ku">per kWh doorzet — hiermee vergelijkt de dispatch de spread</div></div>' +
    '<div class="kb"><div class="kl">Rendabele cycli</div><div class="kv" style="font-size:16px">' +
      Math.round(ev.rendabeleCycli) + '</div><div class="ku">per jaar' +
      (st.dpCycli > 0 ? ' · exacte dispatch ' + Math.round(st.dpCycli) +
        (afwijking != null ? ' (' + (afwijking >= 0 ? '+' : '') + _e2(afwijking) + '%)' : '') : '') +
      '</div></div>' +
    '<div class="kb"><div class="kl">Uren in the money</div><div class="kv" style="font-size:16px">' +
      fmt(ev.urenActief) + '</div><div class="ku">van de 8.760 — ' +
      _e2(ev.urenActief / 87.6) + '% van het jaar</div></div>' +
    '<div class="kb"><div class="kl">Bovengrens marge</div><div class="kv" style="font-size:16px">' +
      _kEur(ev.bovengrensMarge_EUR) + '</div><div class="ku">per jaar · na afslag vooruitblik ' +
      _kEur(ev.margeNaAfslag_EUR) + '</div></div>' +
    (ev.rendabeleCycli >= 1
      ? '<div class="kb' + (k.dekt ? ' grn' : ' red') + '"><div class="kl">Kostprijs vs opbrengst</div>' +
        '<div class="kv" style="font-size:16px">' + _kCt(k.volledigeKostprijs) + '</div>' +
        '<div class="ku">per afgeleverde kWh · levert ' + _kCt(k.ontlaadwaarde) + ' op</div></div>'
      : '<div class="kb red"><div class="kl">Kostprijs vs opbrengst</div>' +
        '<div class="kv" style="font-size:16px">—</div>' +
        '<div class="ku">de accu draait niet bij deze instelling</div></div>') +
    '<div class="kb"><div class="kl">Uit eigen overschot</div><div class="kv" style="font-size:16px">' +
      _e2(ev.aandeelEigen * 100) + '%</div><div class="ku">van wat er geladen wordt — alleen dat deel ' +
      'levert EB-voordeel op</div></div>';
}

function _ehpKansenKostTabel() {
  var el = document.getElementById('ehpKansenKost');
  if (!el) return;
  var k = _ehpKansen.kost, ev = _ehpKansen.ev;
  // Draait de accu nauwelijks, dan deelt de kostprijs de vaste lasten door bijna niets en komen er
  // getallen van tientallen euro's per kWh uit. Wiskundig kloppend, maar het antwoord op de vraag
  // is dan niet "de kWh kost 49 euro" maar "deze accu staat stil".
  var draait = ev.rendabeleCycli >= 1;
  if (!draait) {
    el.innerHTML = '<div class="opt-warn">Bij deze instelling komt geen enkel handelsmoment boven ' +
      'de slijtagedrempel van ' + _kCt(k.slijtagedrempel_EUR_kWh) + ' uit: de accu blijft staan. ' +
      'Een kostprijs per kWh is dan niet te geven — er wordt geen kWh afgeleverd.</div>';
    return;
  }
  function rij(lbl, val, dik, toel) {
    return '<tr' + (dik ? ' style="background:#fdf3ea;font-weight:700"' : '') + '>' +
      '<td>' + lbl + '</td><td style="text-align:right">' + _kCt(val) + '</td>' +
      '<td style="font-size:12px;color:#666">' + (toel || '') + '</td></tr>';
  }
  el.innerHTML =
    '<div style="overflow-x:auto"><table class="verg-tbl"><thead><tr>' +
      '<th>Post</th><th style="text-align:right">ct/kWh</th><th>Toelichting</th>' +
    '</tr></thead><tbody>' +
    rij('Inkoop laadstroom', k.inkoop, false,
        'gemiddelde prijs van de kwartieren waarin geladen wordt' +
        (k.ebOpLaden_EUR_kWh > 0 ? ' — inclusief ' + _kCt(k.ebOpLaden_EUR_kWh) + ' energiebelasting' : '')) +
    rij('Rendementsverlies', k.rendementsverlies, false,
        'de extra inkoop die het retourrendement kost') +
    rij('Slijtage', k.slijtage, false,
        'de drempel omgerekend naar één afgeleverde kWh') +
    rij('= Marginale kostprijs', k.marginaleKostprijs, true,
        'wat de volgende kWh kost als de accu er al staat') +
    rij('+ Opex', k.opex, false, 'onderhoud, per afgeleverde kWh') +
    rij('+ Kapitaallast', k.kapitaallast, false,
        'annuïteit over ' + _e2(k.effectieveLevensduur_jr) + ' jaar') +
    rij('= Volledige kostprijs', k.volledigeKostprijs, true, 'inclusief de laadstroom') +
    rij('Gemiddelde ontlaadwaarde', k.ontlaadwaarde, false,
        'wat een afgeleverde kWh opbrengt — ' + _e2(ev.aandeelInEigenVerbruik * 100) +
        '% daarvan vervangt eigen netafname') +
    '</tbody></table></div>' +
    '<div class="ib2" style="margin-top:6px">De LCOS-tegel in de kaart hieronder telt alleen ' +
      'kapitaallast en opex (' + _kCt(k.lcosDienst) + ') — dat is de prijs van de opslagdienst zonder ' +
      'de energie. Hier staat de volledige kostprijs, want dát is het getal dat naast de ontlaadwaarde ' +
      'hoort. Dekt de opbrengst de volledige kostprijs niet, dan draait de accu nog steeds: hij hoeft ' +
      'alleen zijn marginale kostprijs te dekken. De rest is de vraag of de investering terugkomt.</div>';
}

/** Tien doorrekeningen; niet in de schuiflus maar erna, wanneer de gebruiker loslaat. */
function _ehpKansenGevoeligheid() {
  var el = document.getElementById('ehpKansenGev');
  if (!el || !_ehpKansen) return;
  var st = _ehpKansen;
  setTimeout(function () {
    if (!_ehpKansen || _ehpKansen !== st) return;
    var g;
    try {
      g = EhpKansen.gevoeligheid(st.res.model, st.cfg,
        {gastheer: st.gastheer, ebTarief: st.ebTarief, discontoPct: st.disconto});
    } catch (e) {
      console.error('kansen-gevoeligheid:', e);
      el.innerHTML = '<div class="opt-warn">Gevoeligheid kon niet worden berekend.</div>'; return;
    }
    var num = function (r, v) {
      return r.key === 'cyclusleven' ? fmt(v) : _e2(v);
    };
    var rijen = g.rijen.map(function (r, i) {
      return '<tr' + (i === 0 ? ' style="background:#eef7ea;font-weight:700"' : '') + '>' +
        '<td>' + r.label + '</td>' +
        '<td>' + num(r, r.laag) + ' → ' + num(r, r.hoog) + ' ' + r.eenheid + '</td>' +
        '<td>' + Math.round(r.cycliLaag) + ' → ' + Math.round(r.cycliHoog) + '</td>' +
        '<td>' + _kEur(r.margeLaag_EUR) + ' → ' + _kEur(r.margeHoog_EUR) + '</td>' +
        '<td>' + _kEur(r.margeSpan_EUR) + '</td></tr>';
    }).join('');
    el.innerHTML =
      '<div style="overflow-x:auto"><table class="verg-tbl"><thead><tr>' +
        '<th>Knop</th><th>Bereik</th><th>Cycli/jr</th><th>Marge/jaar</th><th>Verschil</th>' +
      '</tr></thead><tbody>' + rijen + '</tbody></table></div>' +
      '<div class="ib2" style="margin-top:6px">Elke knop 20% omlaag en omhoog (rendement 5 procentpunt), ' +
        'de rest gelijk, gesorteerd op hoeveel de marge beweegt. Let op de richting: een hógere ' +
        'leveringsopslag helpt alleen als de accu vooral in eigen tekort ontlaadt — laadt hij vooral ' +
        'van het net, dan werkt diezelfde opslag juist tegen hem. Blijft het cyclusaantal staan ' +
        'terwijl de marge beweegt, dan draait de accu al elke dag een rondje en zit hij tegen zijn ' +
        'capaciteit aan; méér momenten zitten er dan niet in, een grotere accu wel. Of je een knop ' +
        'kúnt draaien is verder een onderhandelingsvraag, geen rekenvraag: leveringsopslag en ' +
        'terugleverafslag zijn afspraken met de leverancier, capex en cyclusleven zijn de offerte.</div>';
  }, 30);
}

// ─── Grafieken ───────────────────────────────────────────────────────────────

/**
 * Grafieken bijwerken in plaats van opnieuw opbouwen.
 *
 * Een Chart destroyen en opnieuw instantiëren kost bij elke schuiftik honderden milliseconden —
 * meer dan het rekenwerk zelf, en genoeg om het schuiven schokkerig te maken. Bestaat de grafiek
 * al met evenveel reeksen, dan gaan alleen de datapunten en de as-grenzen erin.
 */
function _ehpKansenChart(id, cv, maker, patch) {
  if (CH[id] && CH[id].data.datasets.length === patch.sets.length) {
    for (var i = 0; i < patch.sets.length; i++) CH[id].data.datasets[i].data = patch.sets[i];
    if (patch.schaal) patch.schaal(CH[id]);
    CH[id].update('none');
    return;
  }
  dC(id);
  CH[id] = maker();
}

function _ehpTekenKansenLadder() {
  var cv = document.getElementById('cEhpKansen');
  if (!cv || typeof Chart === 'undefined' || !_ehpKansen) return;
  var st = _ehpKansen, ev = st.ev;
  var punten = ev.kromme.map(function (p) { return {x: +p.cycli.toFixed(2), y: +(p.winst * 100).toFixed(3)}; });
  if (!punten.length) { dC('ehpKansen'); return; }

  var drempel = +(st.ladder.mk * 100).toFixed(3);
  var maxX = punten[punten.length - 1].x;
  var sets = [
    {label: 'Marginale winst', data: punten, borderColor: '#c0793c', borderWidth: 2,
     pointRadius: 0, tension: 0.1,
     // Vullen tot de drempelwaarde: boven de lijn is winst, eronder verlies.
     fill: {value: drempel, above: 'rgba(192,121,60,.18)', below: 'rgba(192,57,43,.07)'}},
    {label: 'Slijtagedrempel', data: [{x: 0, y: drempel}, {x: maxX, y: drempel}],
     borderColor: '#c0392b', borderWidth: 1.5, borderDash: [5, 4], pointRadius: 0, fill: false}
  ];
  if (st.dpCycli > 0) {
    var lo = Math.min(drempel, punten[punten.length - 1].y);
    var hi = Math.max(drempel, punten[0].y);
    sets.push({label: 'Exacte dispatch', data: [{x: st.dpCycli, y: lo}, {x: st.dpCycli, y: hi}],
      borderColor: '#999', borderWidth: 1.5, borderDash: [3, 3], pointRadius: 0, fill: false});
  }

  _ehpKansenChart('ehpKansen', cv, function () { return new Chart(cv, {
    type: 'line',
    data: {datasets: sets},
    options: {responsive: true, maintainAspectRatio: false,
      plugins: {legend: {display: true, labels: {boxWidth: 12, font: {family: 'Barlow', size: 11}}},
        tooltip: {callbacks: {
          title: function (c) { return _e2(c[0].parsed.x) + ' cycli per jaar'; },
          label: function (c) { return c.dataset.label + ': ' + _e2(c.parsed.y) + ' ct/kWh'; }}}},
      scales: {
        x: Object.assign(ax('cycli per jaar'), {type: 'linear', min: 0}),
        y: Object.assign(ax('marginale winst ct/kWh'), {})}}
  }); }, {
    sets: sets.map(function (d) { return d.data; }),
    schaal: function (ch) {
      // De vulling hangt aan de drempelwaarde, dus die moet mee als de capexschuif beweegt.
      ch.data.datasets[0].fill = {value: drempel, above: 'rgba(192,121,60,.18)', below: 'rgba(192,57,43,.07)'};
    }
  });
}

function _ehpTekenKansenWig() {
  var cv = document.getElementById('cEhpWig');
  if (!cv || typeof Chart === 'undefined' || !_ehpKansen) return;
  var d = EhpKansen.meritKrommes(_ehpKansen.ladder, 140);
  if (!d.ontladen.length) { dC('ehpWig'); return; }
  var pt = function (r) { return r.map(function (p) { return {x: +p.mwh.toFixed(1), y: +p.ct.toFixed(2)}; }); };
  // Alleen het deel waar handel denkbaar is: de staart is volume tegen een prijs die niemand pakt.
  var maxX = Math.max(1, (_ehpKansen.ev.afgeleverd_kWh / 1000) * 4);

  var wigSets = [
      {label: 'Ontladen levert op', data: pt(d.ontladen), borderColor: '#c0793c', borderWidth: 2,
       pointRadius: 0, tension: 0.1, fill: {target: 1, above: 'rgba(192,121,60,.14)'}},
      {label: 'Laden kost', data: pt(d.laden), borderColor: '#2c7fb8', borderWidth: 2,
       pointRadius: 0, tension: 0.1, fill: false},
      {label: 'Zelfde kwartieren, kale EPEX', data: pt(d.ontladenEpex), borderColor: '#bbb',
       borderWidth: 1.5, borderDash: [4, 4], pointRadius: 0, tension: 0.1, fill: false},
      {label: '', data: pt(d.ladenEpex), borderColor: '#bbb', borderWidth: 1.5,
       borderDash: [4, 4], pointRadius: 0, tension: 0.1, fill: false}
  ];

  _ehpKansenChart('ehpWig', cv, function () { return new Chart(cv, {
    type: 'line',
    data: {datasets: wigSets},
    options: {responsive: true, maintainAspectRatio: false,
      plugins: {legend: {display: true, labels: {boxWidth: 12, font: {family: 'Barlow', size: 11},
          filter: function (l) { return !!l.text; }}},
        tooltip: {callbacks: {
          title: function (c) { return 'eerste ' + _e2(c[0].parsed.x) + ' MWh per jaar'; },
          label: function (c) { return (c.dataset.label || 'Kale EPEX') + ': ' + _e2(c.parsed.y) + ' ct/kWh'; }}}},
      scales: {
        x: Object.assign(ax('cumulatief volume MWh/jaar'), {type: 'linear', min: 0, max: +maxX.toFixed(0)}),
        y: Object.assign(ax('ct/kWh'), {})}}
  }); }, {
    sets: wigSets.map(function (d) { return d.data; }),
    schaal: function (ch) { ch.options.scales.x.max = +maxX.toFixed(0); }
  });
}

// ─── Schuiven vullen en binden ───────────────────────────────────────────────

function _ehpKansenSchuivenVullen() {
  EHP_KANSEN_SCHUIVEN.forEach(function (s) {
    var inp = document.querySelector('[data-kansen-schuif="' + s.key + '"]');
    if (!inp) return;
    var nu = _ehpKansenWaarde(s.key);
    // Relatief bereik voor maatvelden: rond de huidige maat, want een accu van 50 kWh en een van
    // 5 MWh horen niet op dezelfde schaal te staan.
    var min = s.rel != null ? 0 : s.min;
    var max = s.rel != null ? Math.max(nu * s.rel, nu + s.stap * 10, s.stap * 10) : s.max;
    inp.min = min; inp.max = max; inp.step = s.stap;
    inp.value = Math.max(min, Math.min(max, nu));
    _ehpKansenLabel(s, nu);
  });
}

function _ehpKansenLabel(s, waarde) {
  var lbl = document.querySelector('[data-kansen-lbl="' + s.key + '"]');
  if (!lbl) return;
  var basis = s.key === 'eb_ct' ? _ehpKansen.basisEb * 100
            : s.key === 'etaRetour_pct' ? EhpKansen.retourVan(_ehpKansen.basisCfg)
            : +_ehpKansen.basisCfg[s.key] || 0;
  var toon = s.key === 'cyclusleven' || s.key === 'kWh' || s.key === 'kW' ? fmt(waarde) : _e2(waarde);
  var afwijkt = Math.abs(waarde - basis) > Math.max(1e-9, Math.abs(basis) * 0.001);
  lbl.textContent = toon + ' ' + s.eenheid;
  lbl.style.color = afwijkt ? '#c0392b' : '#c0793c';
  lbl.title = afwijkt ? 'ingesteld: ' + (s.key === 'cyclusleven' ? fmt(basis) : _e2(basis)) + ' ' + s.eenheid : '';
}

function _ehpKansenBind() {
  var kaart = document.getElementById('ehpKansenKaart');
  if (!kaart) return;
  var wacht = null;

  kaart.addEventListener('input', function (e) {
    var inp = e.target.closest('[data-kansen-schuif]');
    if (!inp || !_ehpKansen) return;
    var key = inp.getAttribute('data-kansen-schuif');
    var s = null;
    EHP_KANSEN_SCHUIVEN.forEach(function (x) { if (x.key === key) s = x; });
    if (!s) return;
    var waarde = parseFloat(inp.value);
    _ehpKansenZet(key, waarde);
    _ehpKansenLabel(s, waarde);
    // Uit de invoerlus halen, anders blijft de schuif hangen tijdens een volledige herbouw.
    // Bewust setTimeout en geen requestAnimationFrame: die wordt geknepen zodra het tabblad niet
    // op de voorgrond staat, en dan zou het paneel stilletjes verouderde cijfers tonen.
    if (wacht) clearTimeout(wacht);
    wacht = setTimeout(function () { wacht = null; _ehpKansenHerreken(s.mode); }, 0);
  });

  // Range-inputs vuren `change` bij loslaten — het juiste moment voor het dure werk.
  kaart.addEventListener('change', function (e) {
    if (e.target.closest('[data-kansen-schuif]')) _ehpKansenGevoeligheid();
  });

  kaart.addEventListener('click', function (e) {
    var acc = e.target.closest('[data-kansen-accu]');
    if (acc) {
      kaart.querySelectorAll('[data-kansen-accu]').forEach(function (b) { b.classList.remove('on'); });
      acc.classList.add('on');
      _ehpKansenLaad(_ehpKansen.res, parseInt(acc.getAttribute('data-kansen-accu'), 10));
      return;
    }
    if (e.target.closest('#btnEhpKansenReset')) {
      _ehpKansenLaad(_ehpKansen.res, _ehpKansen.idx);
      return;
    }
    if (e.target.closest('#btnEhpKansenOver')) ehpKansenOvernemen();
  });
}

/** Aangeroepen na het invoegen van de HTML, naast _ehpTekenSocKrommes(). */
function _ehpTekenKansenCharts(res) {
  if (!res.opslag || !res.opslag.length || typeof EhpKansen === 'undefined') return;
  if (!document.getElementById('ehpKansenKaart')) return;
  try { _ehpKansenLaad(res, 0); }
  catch (e) { console.error('kansen:', e); _ehpKansen = null; return; }
  _ehpKansenBind();
}

// ─── Overnemen ───────────────────────────────────────────────────────────────

/**
 * De geschoven waarden naar de echte accu-instellingen schrijven en exact laten narekenen.
 * Bewust via renderEhpAccus + calcEHP: calcEHP() doet _ehpCommit() en leest de zijbalk terug,
 * dus de velden moeten er eerst staan.
 */
function ehpKansenOvernemen() {
  var st = _ehpKansen;
  if (!st) return;
  var plat = _ehpActive();
  if (!plat || !plat.cfg) { notify('Selecteer eerst een platform', false); return; }
  plat.cfg.opslag = _ehpLeesAccus(plat.cfg.opslag);
  var doel = plat.cfg.opslag[st.idx];
  if (!doel) { notify('Deze accu bestaat niet meer', false); return; }

  ['capex_kwh', 'cyclusleven', 'kWh', 'kW', 'etaLaad_pct', 'etaOntlaad_pct',
   'afnameOpslag_mwh', 'terugleverAfslag_mwh'].forEach(function (k) {
    if (st.cfg[k] != null) doel[k] = +st.cfg[k];
  });
  // Alleen een expliciet gewijzigd EB-tarief vastleggen; anders blijft 0 = staffel afleiden.
  if (Math.abs(st.ebTarief - st.basisEb) > 1e-9) doel.eb_kwh = st.ebTarief;

  saveMeta();
  renderEhpAccus(plat.cfg);
  notify('Instellingen overgenomen — exacte dispatch wordt berekend', true);
  calcEHP();
}
