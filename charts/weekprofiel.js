var _wCache = null;
var _wMonthFilter = null; // null = alle maanden, 0–11 = specifieke maand

function drawWeek(allTs, grpKw, perKw, cos, gtvA, gtvT) {
  _wCache = { allTs: allTs, grpKw: grpKw, perKw: perKw, cos: cos, gtvA: gtvA, gtvT: gtvT };
  _wMonthFilter = null;
  _renderWeek();
}

function _renderWeek() {
  if (!_wCache) return;
  var allTs = _wCache.allTs, grpKw = _wCache.grpKw, perKw = _wCache.perKw;
  var cos = _wCache.cos, gtvA = _wCache.gtvA, gtvT = _wCache.gtvT;
  var mf = _wMonthFilter;

  dC('week'); dC('weekP');
  var S2 = 7 * 96;
  var gs = []; var ps = [];
  for (var i = 0; i < S2; i++) { gs.push([]); }
  for (var ci = 0; ci < cos.length; ci++) {
    var arr = []; for (var i = 0; i < S2; i++) arr.push([]); ps.push(arr);
  }

  allTs.forEach(function (ts, i) {
    if (mf !== null && new Date(ts).getMonth() !== mf) return;
    var d = new Date(ts);
    var dow = (d.getDay() + 6) % 7;
    var sl = dow * 96 + Math.floor((d.getHours() * 60 + d.getMinutes()) / 15);
    if (sl < 0 || sl >= S2) return;
    gs[sl].push(grpKw[i]);
    for (var ci = 0; ci < cos.length; ci++) ps[ci][sl].push(perKw[ci][i]);
  });

  var avg = gs.map(function (s) { return s.length ? +(s.reduce(function (a, b) { return a + b; }, 0) / s.length).toFixed(2) : null; });
  var mn  = gs.map(function (s) { return s.length ? +Math.min.apply(null, s).toFixed(2) : null; });
  var mx  = gs.map(function (s) { return s.length ? +Math.max.apply(null, s).toFixed(2) : null; });

  // Drager-weergave: schaal naar de eenheid van de actieve drager (gas → m³/h).
  var _cv = (typeof _carrierView !== 'undefined') ? _carrierView : { unit: 'kW', scale: 1, showGtv: true };
  function _sc(a) { return a.map(function (v) { return v == null ? null : +(v * _cv.scale).toFixed(3); }); }
  var avgS = _sc(avg), mnS = _sc(mn), mxS = _sc(mx);

  var DN = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
  var lb = [];
  for (var i = 0; i < S2; i++) {
    var dow = Math.floor(i / 96);
    var h = Math.floor((i % 96) / 4);
    var m = (i % 4) * 15;
    lb.push(i % 96 === 0 ? DN[dow] : (h % 6 === 0 && m === 0 ? (String(h).padStart(2, '0') + ':00') : ''));
  }

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

  var legHtml = '';
  for (var i = 0; i < cos.length; i++)
    legHtml += '<span class="li"><span class="ld" style="background:' + PAL[i % PAL.length] + '"></span>' + cos[i].name + '</span>';
  document.getElementById('wLeg').innerHTML = legHtml;

  CH['weekP'] = new Chart(document.getElementById('cWeekP'), {
    type: 'line', data: { labels: lb, datasets: cos.map(function (c, i) {
      return { label: c.name, data: ps[i].map(function (s) { return s.length ? +(s.reduce(function (a, b) { return a + b; }, 0) / s.length * _cv.scale).toFixed(3) : null; }), borderColor: PAL[i % PAL.length], fill: false, tension: .3, pointRadius: 0, borderWidth: 1.8 };
    }) }, options: Object.assign({}, tOpts, { plugins: Object.assign({}, tOpts.plugins, { legend: { display: false } }) })
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
