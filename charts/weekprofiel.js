var _wCache = null;
var _wMonthFilter = null; // null = alle maanden, 0–11 = specifieke maand
var WEEK_SLOTS = 7 * 96; // ma 00:00 … zo 23:45, per kwartier

// Bucketing van één reeks naar het weekraster. Accumulator i.p.v. arrays met alle
// samples (zoals charts/individueel.js): gemiddelde, min en max in één pass.
// mf: null = alle maanden, 0–11 = alleen die maand. Lege slots worden null.
// Ook gebruikt door het GTO-rapport voor de weekprofielen per aansluiting.
function weekSlots(allTs, series, mf) {
  var slots = new Array(WEEK_SLOTS);
  for (var q = 0; q < allTs.length; q++) {
    var v = series[q];
    if (v == null) continue;
    var d = new Date(allTs[q]);
    if (isNaN(d)) continue;
    if (mf != null && d.getMonth() !== mf) continue;
    var sl = ((d.getDay() + 6) % 7) * 96 + Math.floor((d.getHours() * 60 + d.getMinutes()) / 15);
    if (sl < 0 || sl >= WEEK_SLOTS) continue;
    var o = slots[sl] || (slots[sl] = { sum: 0, n: 0, mn: Infinity, mx: -Infinity });
    o.sum += v; o.n++;
    if (v < o.mn) o.mn = v;
    if (v > o.mx) o.mx = v;
  }
  var avg = [], mn = [], mx = [];
  for (var i = 0; i < WEEK_SLOTS; i++) {
    var s = slots[i];
    avg.push(s ? +(s.sum / s.n).toFixed(2) : null);
    mn.push(s ? +s.mn.toFixed(2) : null);
    mx.push(s ? +s.mx.toFixed(2) : null);
  }
  return { avg: avg, mn: mn, mx: mx };
}

// X-as-labels van het weekraster: dagnaam bij middernacht, verder elke 6 uur.
function weekSlotLabels() {
  var DN = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
  var lb = [];
  for (var i = 0; i < WEEK_SLOTS; i++) {
    var h = Math.floor((i % 96) / 4), m = (i % 4) * 15;
    lb.push(i % 96 === 0 ? DN[Math.floor(i / 96)] : (h % 6 === 0 && m === 0 ? (String(h).padStart(2, '0') + ':00') : ''));
  }
  return lb;
}

function drawWeek(allTs, grpKw, perKw, cos, gtvA, gtvT) {
  // hasT op de ruwe reeks: de weekgrafiek toont gemiddelden, die zelden negatief
  // worden — de teruglever-stippellijn hoort te volgen uit de meetdata zelf.
  _wCache = { allTs: allTs, grpKw: grpKw, perKw: perKw, cos: cos, gtvA: gtvA, gtvT: gtvT, hasT: (perKw || []).map(conHasT) };
  _wMonthFilter = null;
  _renderWeek();
}

function _renderWeek() {
  if (!_wCache) return;
  var allTs = _wCache.allTs, grpKw = _wCache.grpKw, perKw = _wCache.perKw;
  var cos = _wCache.cos, gtvA = _wCache.gtvA, gtvT = _wCache.gtvT;
  var mf = _wMonthFilter;

  dC('week'); dC('weekP');
  var S2 = WEEK_SLOTS;
  var grp = weekSlots(allTs, grpKw, mf);
  var per = cos.map(function (c, ci) { return weekSlots(allTs, perKw[ci], mf); });

  // Drager-weergave: schaal naar de eenheid van de actieve drager (gas → m³/h).
  var _cv = (typeof _carrierView !== 'undefined') ? _carrierView : { unit: 'kW', scale: 1, showGtv: true };
  function _sc(a) { return a.map(function (v) { return v == null ? null : +(v * _cv.scale).toFixed(3); }); }
  var avgS = _sc(grp.avg), mnS = _sc(grp.mn), mxS = _sc(grp.mx);

  var lb = weekSlotLabels();

  var zeroLine = {
    color: function (ctx) { return ctx.tick.value === 0 ? '#242b38' : '#f3f7f4'; },
    lineWidth: function (ctx) { return ctx.tick.value === 0 ? 2 : 0.5; }
  };
  var DN2 = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
  function _wTipTitle(items) {
    if (!items || !items.length) return '';
    var i = items[0].dataIndex;
    var dow = Math.floor(i / 96), h = Math.floor((i % 96) / 4), m = (i % 4) * 15;
    return DN2[dow] + ' ' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  var tOpts = {
    responsive: true, maintainAspectRatio: false, animation: false,
    plugins: { legend: { labels: { color: '#888', font: { family: 'Barlow', size: 11 }, boxWidth: 10 } }, tooltip: { callbacks: { title: _wTipTitle } } },
    scales: {
      x: { ticks: { color: '#999', font: { family: 'Barlow', size: 11 }, maxTicksLimit: 20, autoSkip: false, callback: function (v, i) { return lb[i] || null; } }, grid: { color: '#f3f7f4' } },
      y: Object.assign(ax(_cv.unit), { grid: zeroLine })
    }
  };

  CH['week'] = new Chart(document.getElementById('cWeek'), {
    type: 'line', data: { labels: lb, datasets: [
      { label: 'Max', data: mxS, borderColor: 'rgba(70,150,43,.45)', backgroundColor: 'rgba(70,150,43,.09)', fill: '+1', tension: .3, pointRadius: 0, borderWidth: 1.5, borderDash: [4, 3] },
      { label: 'Min', data: mnS, borderColor: 'rgba(70,150,43,.45)', fill: false, tension: .3, pointRadius: 0, borderWidth: 1.5, borderDash: [4, 3] },
      { label: 'Gemiddeld', data: avgS, borderColor: '#46962b', fill: false, tension: .3, pointRadius: 0, borderWidth: 2.5 },
    ].concat(_cv.showGtv ? [
      { label: 'GTV ' + gtvA + 'kW', data: new Array(S2).fill(gtvA), borderColor: '#c0392b', borderDash: [6, 3], pointRadius: 0, borderWidth: 1.5, fill: false },
      { label: 'GTV-T -' + gtvT + 'kW', data: new Array(S2).fill(-gtvT), borderColor: '#e67e22', borderDash: [4, 4], pointRadius: 0, borderWidth: 1.5, fill: false },
    ] : []) }, options: tOpts
  });

  document.getElementById('wLeg').innerHTML = conLegendHtml(cos, { minmax: true });

  // Alleen aangevinkte aansluitingen; kleur blijft op de oorspronkelijke index.
  var vis = [];
  cos.forEach(function (c, i) { if (conShown(c)) vis.push(i); });

  // Volgorde bepaalt de tekenvolgorde: eerst de min/max-vlakken, dan de gemiddelde
  // lijnen, dan de referentielijnen — anders verdwijnen de lijnen onder de vlakken.
  var pDsets = [];
  if (_showMinMax) {
    vis.forEach(function (i) {
      var col = PAL[i % PAL.length];
      // Max vult naar de volgende dataset (Min) → band; zie de groepsgrafiek hierboven.
      pDsets.push({ label: cos[i].name + ' — max', data: _sc(per[i].mx), borderColor: palRgba(col, .45), backgroundColor: palRgba(col, .10), fill: '+1', tension: .3, pointRadius: 0, borderWidth: 1, borderDash: [4, 3] });
      pDsets.push({ label: cos[i].name + ' — min', data: _sc(per[i].mn), borderColor: palRgba(col, .45), fill: false, tension: .3, pointRadius: 0, borderWidth: 1, borderDash: [4, 3] });
    });
  }
  vis.forEach(function (i) {
    pDsets.push({ label: cos[i].name, data: _sc(per[i].avg), borderColor: PAL[i % PAL.length], fill: false, tension: .3, pointRadius: 0, borderWidth: 1.8 });
  });
  // Aansluitwaarde (kVA × cos φ); teruglevering alleen bij daadwerkelijke teruglevering.
  if (_cv.showGtv && _showAansl) {
    var hasT = _wCache.hasT || [];
    vis.forEach(function (i) {
      var lim = connKw(cos[i]);
      if (lim == null) return;
      var col = PAL[i % PAL.length];
      pDsets.push({ label: cos[i].name + ' — aansluitwaarde ' + lim + ' kW', data: new Array(S2).fill(lim), borderColor: col, borderDash: [6, 3], borderWidth: 1.2, pointRadius: 0, fill: false, _ref: true });
      if (hasT[i])
        pDsets.push({ label: cos[i].name + ' — aansluitwaarde T -' + lim + ' kW', data: new Array(S2).fill(-lim), borderColor: col, borderDash: [2, 3], borderWidth: 1.2, pointRadius: 0, fill: false, _ref: true });
    });
  }

  CH['weekP'] = new Chart(document.getElementById('cWeekP'), {
    type: 'line', data: { labels: lb, datasets: pDsets },
    // Eigen plugins-object: tOpts (en dus de groepsgrafiek) blijft ongewijzigd.
    options: Object.assign({}, tOpts, { plugins: Object.assign({}, tOpts.plugins, {
      legend: { display: false },
      tooltip: { callbacks: { title: _wTipTitle }, filter: function (item) { return !item.dataset._ref; } }
    }) })
  });

  _updateWeekFilterBtns();
}

function _updateWeekFilterBtns() {
  var btns = document.querySelectorAll('#weekMFilter button');
  btns.forEach(function (btn) {
    var val = btn.getAttribute('data-mf');
    var isActive = val === 'all' ? _wMonthFilter === null : parseInt(val, 10) === _wMonthFilter;
    btn.style.background = isActive ? '#46962b' : '#eef2ec';
    btn.style.color = isActive ? '#fff' : '#555';
    btn.style.fontWeight = isActive ? '700' : '400';
  });
}

function setWeekMonthFilter(val) {
  _wMonthFilter = val === 'all' ? null : parseInt(val, 10);
  _renderWeek();
}
