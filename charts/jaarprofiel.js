var _jaarState = null;
var _jZoom = 1; // kept to avoid reference errors
var _jDragHandlers = null;

function _jDecimate(kw, ts, maxPts) {
  var n = kw.length;
  if (n <= maxPts) return { kw: kw, ts: ts };
  var buckets = Math.floor(maxPts / 2);
  var bSize = n / buckets;
  var outKw = [], outTs = [];
  for (var b = 0; b < buckets; b++) {
    var s = Math.floor(b * bSize);
    var e = Math.min(n - 1, Math.floor((b + 1) * bSize) - 1);
    if (s > e) continue;
    var mnI = s, mxI = s;
    for (var j = s + 1; j <= e; j++) {
      if (kw[j] < kw[mnI]) mnI = j;
      if (kw[j] > kw[mxI]) mxI = j;
    }
    if (mnI <= mxI) {
      outTs.push(ts[mnI]); outKw.push(kw[mnI]);
      if (mnI !== mxI) { outTs.push(ts[mxI]); outKw.push(kw[mxI]); }
    } else {
      outTs.push(ts[mxI]); outKw.push(kw[mxI]);
      outTs.push(ts[mnI]); outKw.push(kw[mnI]);
    }
  }
  return { kw: outKw, ts: outTs };
}

function _jFormatTick(ts, span) {
  var d = new Date(ts);
  var DN = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
  if (span <= 2 * 86400000) {
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  } else if (span <= 7 * 86400000) {
    return DN[d.getDay()] + ' ' + d.getDate() + ' ' + MND[d.getMonth()];
  } else if (span <= 90 * 86400000) {
    return d.getDate() + ' ' + MND[d.getMonth()];
  } else {
    return MND[d.getMonth()] + ' \'' + String(d.getFullYear()).slice(2);
  }
}

function _jSetupDragZoom() {
  // Remove any previous listeners
  if (_jDragHandlers) {
    var h = _jDragHandlers;
    h.canvas.removeEventListener('mousedown', h.down);
    document.removeEventListener('mousemove', h.move);
    document.removeEventListener('mouseup', h.up);
    document.removeEventListener('keydown', h.key);
    _jDragHandlers = null;
  }

  var canvas = document.getElementById('cJaarG');
  if (!canvas) return;

  var wrapper = canvas.parentElement;
  wrapper.style.position = 'relative';
  canvas.style.cursor = 'crosshair';

  // Create selection highlight div (once; reused across redraws)
  var selDiv = document.getElementById('jZoomSel');
  if (!selDiv) {
    selDiv = document.createElement('div');
    selDiv.id = 'jZoomSel';
    selDiv.style.cssText = 'position:absolute;top:0;height:100%;background:rgba(70,150,43,.12);border-left:2px solid rgba(70,150,43,.7);border-right:2px solid rgba(70,150,43,.7);display:none;pointer-events:none';
    wrapper.appendChild(selDiv);
  }

  var dragX = null;

  var onDown = function (e) {
    if (e.button !== 0) return;
    var rect = canvas.getBoundingClientRect();
    dragX = e.clientX - rect.left;
    selDiv.style.left = dragX + 'px';
    selDiv.style.width = '0';
    selDiv.style.display = 'block';
  };

  var onMove = function (e) {
    if (dragX === null) return;
    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    selDiv.style.left = Math.min(dragX, x) + 'px';
    selDiv.style.width = Math.abs(x - dragX) + 'px';
  };

  var onUp = function (e) {
    if (dragX === null) return;
    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var x0 = Math.min(dragX, x);
    var x1 = Math.max(dragX, x);
    dragX = null;
    selDiv.style.display = 'none';

    if (x1 - x0 < 8) return; // ignore accidental clicks

    var chart = CH['jaarG'];
    if (!chart) return;
    var scale = chart.scales.x;
    var labels = chart.data.labels;
    var i0 = Math.max(0, Math.round(scale.getValueForPixel(x0)));
    var i1 = Math.min(labels.length - 1, Math.round(scale.getValueForPixel(x1)));
    if (i0 >= i1) return;

    var ts0 = labels[i0];
    var ts1 = labels[i1];
    if (!ts0 || !ts1) return;

    var startEl = document.getElementById('jDateStart');
    var endEl = document.getElementById('jDateEnd');
    if (startEl) startEl.value = ts0.slice(0, 10);
    if (endEl) endEl.value = ts1.slice(0, 10);
    panJ();
  };

  var onKey = function (e) {
    if (e.key === 'Escape' && dragX !== null) {
      dragX = null;
      selDiv.style.display = 'none';
    }
  };

  canvas.addEventListener('mousedown', onDown);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.addEventListener('keydown', onKey);

  _jDragHandlers = { canvas: canvas, down: onDown, move: onMove, up: onUp, key: onKey };
}

function panJ() {
  if (!_jaarState) return;
  var allTs = _jaarState.allTs, grpKw = _jaarState.grpKw;
  var perKw = _jaarState.perKw, cos = _jaarState.cos;
  var gtvA = _jaarState.gtvA, gtvT = _jaarState.gtvT;

  var startEl = document.getElementById('jDateStart');
  var endEl = document.getElementById('jDateEnd');
  var si = 0, ei = allTs.length - 1;
  if (startEl && startEl.value) {
    var sv = startEl.value;
    while (si < allTs.length - 1 && allTs[si].slice(0, 10) < sv) si++;
  }
  if (endEl && endEl.value) {
    var ev = endEl.value;
    while (ei > si && allTs[ei].slice(0, 10) > ev) ei--;
  }

  var slTs = allTs.slice(si, ei + 1);
  var slKw = grpKw.slice(si, ei + 1);
  if (!slTs.length) return;

  var span = new Date(slTs[slTs.length - 1]).getTime() - new Date(slTs[0]).getTime();

  var dec = _jDecimate(slKw, slTs, 1400);
  var _cv = (typeof _carrierView !== 'undefined') ? _carrierView : { unit: 'kW', scale: 1, showGtv: true };
  var decKwS = dec.kw.map(function (v) { return v == null ? null : v * _cv.scale; });

  var days = Math.round(slTs.length / 96);
  document.getElementById('jZoomLbl').textContent =
    days <= 1 ? '1 dag' :
    days <= 14 ? days + ' dagen' :
    days <= 60 ? Math.round(days / 7) + ' weken' :
    Math.round(days / 30.5) + ' maanden';

  var gridColor = function (ctx) { return ctx.tick.value === 0 ? '#242b38' : '#f3f7f4'; };
  var gridWidth = function (ctx) { return ctx.tick.value === 0 ? 2 : 0.5; };

  dC('jaarG');
  CH['jaarG'] = new Chart(document.getElementById('cJaarG'), {
    type: 'line',
    data: {
      labels: dec.ts,
      datasets: [
        {
          label: 'Vermogen groep', data: decKwS,
          borderColor: '#46962b',
          backgroundColor: function (ctx) { return ctx.raw >= 0 ? 'rgba(70,150,43,.12)' : 'rgba(251,186,0,.12)'; },
          fill: true, tension: 0, pointRadius: 0, borderWidth: 2,
          segment: {
            borderColor: function (ctx) { return ctx.p0.parsed.y >= 0 ? '#46962b' : '#fbba00'; },
            backgroundColor: function (ctx) { return ctx.p0.parsed.y >= 0 ? 'rgba(70,150,43,.08)' : 'rgba(251,186,0,.08)'; }
          }
        }
      ].concat(_cv.showGtv ? [
        { label: 'GTV ' + gtvA + 'kW', data: new Array(decKwS.length).fill(gtvA), borderColor: '#c0392b', borderDash: [6, 3], pointRadius: 0, borderWidth: 1.5, fill: false },
        { label: 'GTV-T -' + gtvT + 'kW', data: new Array(decKwS.length).fill(-gtvT), borderColor: '#e67e22', borderDash: [4, 4], pointRadius: 0, borderWidth: 1.5, fill: false }
      ] : [])
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { labels: { color: '#888', font: { family: 'Barlow', size: 11 }, boxWidth: 10 } } },
      scales: {
        x: {
          ticks: {
            color: '#999', font: { family: 'Barlow', size: 11 },
            maxRotation: 0, autoSkip: true, maxTicksLimit: 10,
            callback: function (value) { var ts = this.getLabelForValue(value); return ts ? _jFormatTick(ts, span) : null; }
          },
          grid: { color: '#f3f7f4' }
        },
        y: Object.assign(ax(_cv.unit), { beginAtZero: false, grid: { color: gridColor, lineWidth: gridWidth } })
      }
    }
  });

  _jSetupDragZoom();

  // Per-connection chart — same date window, uniform decimation
  var pStep = Math.max(1, Math.floor(slTs.length / 1200));
  var pTs = [], pSl = (perKw || []).map(function () { return []; });
  for (var i = 0; i < slTs.length; i += pStep) {
    pTs.push(slTs[i]);
    (perKw || []).forEach(function (a, ci) { pSl[ci].push(a[si + i]); });
  }

  dC('jaar');
  CH['jaar'] = new Chart(document.getElementById('cJaar'), {
    type: 'line',
    data: {
      labels: pTs,
      datasets: (cos || []).map(function (c, ci) {
        return { label: c.name, data: pSl[ci].map(function (v) { return v == null ? null : v * _cv.scale; }), borderColor: PAL[ci % PAL.length], fill: false, tension: 0, pointRadius: 0, borderWidth: 1.5 };
      })
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: {
            color: '#999', font: { family: 'Barlow', size: 11 },
            maxRotation: 0, autoSkip: true, maxTicksLimit: 10,
            callback: function (value) { var ts = this.getLabelForValue(value); return ts ? _jFormatTick(ts, span) : null; }
          },
          grid: { color: '#f3f7f4' }
        },
        y: Object.assign(ax(_cv.unit), { grid: { color: gridColor, lineWidth: gridWidth } })
      }
    }
  });
}

function setJaarPreset(days) {
  if (!_jaarState) return;
  var allTs = _jaarState.allTs;
  var startEl = document.getElementById('jDateStart');
  var endEl = document.getElementById('jDateEnd');
  if (!startEl || !endEl) return;
  var lastDate = allTs[allTs.length - 1].slice(0, 10);
  if (days === 0) {
    startEl.value = allTs[0].slice(0, 10);
    endEl.value = lastDate;
  } else {
    var endMs = new Date(lastDate + 'T00:00:00').getTime();
    var startMs = endMs - (days - 1) * 86400000;
    startEl.value = new Date(startMs).toISOString().slice(0, 10);
    endEl.value = lastDate;
  }
  panJ();
}

function drawJaar(allTs, perKw, grpKw, cos, gtvA, gtvT) {
  dC('jaar'); dC('jaarG');
  _jZoom = 1;
  _jaarState = { allTs: allTs, perKw: perKw, grpKw: grpKw, cos: cos, gtvA: gtvA, gtvT: gtvT };
  var startEl = document.getElementById('jDateStart');
  var endEl = document.getElementById('jDateEnd');
  if (startEl && endEl && allTs.length) {
    var minDate = allTs[0].slice(0, 10);
    var maxDate = allTs[allTs.length - 1].slice(0, 10);
    startEl.min = endEl.min = minDate;
    startEl.max = endEl.max = maxDate;
    startEl.value = minDate;
    endEl.value = maxDate;
  }
  var legHtml = '';
  for (var i = 0; i < cos.length; i++) {
    legHtml += '<span class="li"><span class="ld" style="background:' + PAL[i % PAL.length] + '"></span>' + cos[i].name + '</span>';
  }
  document.getElementById('jLeg').innerHTML = legHtml;
  panJ();
}
