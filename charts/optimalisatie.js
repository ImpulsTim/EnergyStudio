// Scenario-module — Energie Groepsprofiel
// Niet-destructieve laag op _optim.baseKw; scenario's opgeslagen in project

var _editScenId = null;

var SOLAR_MF = [0.23, 0.30, 0.37, 0.44, 0.49, 0.51, 0.50, 0.48, 0.41, 0.31, 0.22, 0.18];
var PHI = 51.5 * Math.PI / 180; // breedtegraad Zeeland

// ─── Initialisatie ───────────────────────────────────────────────────────────

function initScenarios() {
  document.getElementById('btnAddScen').addEventListener('click', openAddScen);
  document.getElementById('btnSaveScen').addEventListener('click', saveScen);
  document.getElementById('btnCancelScen').addEventListener('click', function () { hideM('mScen'); });
  document.getElementById('btnCloseScen').addEventListener('click', function () { hideM('mScen'); });
  document.getElementById('mScen').addEventListener('click', function (e) { if (e.target === this) hideM('mScen'); });
  document.getElementById('btnScenBack').addEventListener('click', function () { activateScenario('basis'); });

  document.getElementById('togSolar').addEventListener('click', function () {
    this.classList.toggle('on');
    document.getElementById('sfSolar').style.display = this.classList.contains('on') ? 'block' : 'none';
  });
  document.getElementById('togBat').addEventListener('click', function () {
    this.classList.toggle('on');
    document.getElementById('sfBat').style.display = this.classList.contains('on') ? 'block' : 'none';
  });
  document.querySelectorAll('input[name="sBatStrat"]').forEach(function(r){
    r.addEventListener('change', function(){
      var ps = this.value === 'peakshaving';
      document.getElementById('sfBatCycles').style.display = ps ? '' : 'none';
      document.getElementById('sfBatAggr').style.display = ps ? '' : 'none';
      document.getElementById('sfBatHorizon').style.display = ps ? '' : 'none';
    });
  });
  var aggrLbls = ['1 (zeer rustig)','2 (rustig)','3 (gemiddeld)','4 (actief)','5 (agressief)'];
  document.getElementById('sBatAggr').addEventListener('input', function(){
    document.getElementById('sBatAggrLbl').textContent = aggrLbls[parseInt(this.value,10)-1] || this.value;
  });
  document.getElementById('sBatHorizon').addEventListener('input', function(){
    var q = parseInt(this.value,10);
    var hours = (q*0.25);
    var txt = q===0 ? 'puur reactief' : (q + ' kwartieren ('+(hours%1===0?hours.toFixed(0):hours.toFixed(2))+' uur)');
    document.getElementById('sBatHorizonLbl').textContent = txt;
  });

  document.getElementById('scenList').addEventListener('click', function (e) {
    var radio = e.target.closest('.sck');
    var editBtn = e.target.closest('[data-scen-edit]');
    var delBtn = e.target.closest('[data-scen-del]');
    if (radio) {
      activateScenario(radio.getAttribute('data-scen-id'));
    } else if (editBtn) {
      openEditScen(editBtn.getAttribute('data-scen-edit'));
    } else if (delBtn) {
      if (confirm('Scenario verwijderen?')) deleteScen(delBtn.getAttribute('data-scen-del'));
    }
  });

  renderScenarioSidebar();
}

// ─── Zijbalk ─────────────────────────────────────────────────────────────────

function renderScenarioSidebar() {
  var p = ap();
  var scens = (p && p.scenarios) ? p.scenarios : [];
  var active = _optim.activeScenId || 'basis';
  var html = '';

  var bGtvLine = _optim.gtvA ? 'GTV ' + _optim.gtvA + ' / ' + _optim.gtvT + ' kW' : 'Gemeten groepsprofiel';
  html += '<div class="ci ' + (active === 'basis' ? 's' : '') + '">' +
    '<div class="cn"><div class="sck ' + (active === 'basis' ? 'on' : '') + '" data-scen-id="basis"></div>Basis</div>' +
    '<div class="cm">' + bGtvLine + '</div></div>';

  var totalCos = p ? p.companies.length : 0;
  scens.forEach(function (sc) {
    var isActive = active === sc.id;
    var tags = [];
    if (sc.connectionIds && sc.connectionIds.length && sc.connectionIds.length < totalCos)
      tags.push('👥 ' + sc.connectionIds.length + '/' + totalCos);
    var scRes = _optim.scenResults[sc.id];
    var gtvLine = scRes ? ('GTV ' + scRes.gtvA + ' / ' + scRes.gtvT + ' kW') :
                  (sc.gtvA != null ? 'GTV ' + sc.gtvA + ' / ' + sc.gtvT + ' kW' : '');
    if (gtvLine) tags.push(gtvLine);
    if (sc.solar && sc.solar.enabled) tags.push('☀ ' + sc.solar.kWp + ' kWp');
    if (sc.bat && sc.bat.enabled) tags.push('⚡ ' + sc.bat.cap + ' kWh');
    html += '<div class="ci ' + (isActive ? 's' : '') + '">' +
      '<div class="cn"><div class="sck ' + (isActive ? 'on' : '') + '" data-scen-id="' + sc.id + '"></div>' +
      '<span style="flex:1;min-width:0;word-break:break-word">' + sc.name + '</span>' +
      '<button style="background:none;border:none;cursor:pointer;font-size:12px;color:#888;padding:0 3px;flex-shrink:0" data-scen-edit="' + sc.id + '" title="Bewerken">✎</button>' +
      '<button style="background:none;border:none;cursor:pointer;font-size:12px;color:#c0392b;padding:0 3px;flex-shrink:0" data-scen-del="' + sc.id + '" title="Verwijderen">✕</button>' +
      '</div>' +
      (tags.length ? '<div class="cm">' + tags.join(' · ') + '</div>' : '') +
      '</div>';
  });

  document.getElementById('scenList').innerHTML = html;
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function renderScenCosList(selectedIds) {
  var p = ap();
  var cos = p ? p.companies : [];
  if (!cos.length) { document.getElementById('sConList').innerHTML = '<div style="color:#aaa;font-size:11px">Geen aansluitingen in project</div>'; return; }
  var html = cos.map(function (c, i) {
    var checked = (!selectedIds || !selectedIds.length || selectedIds.indexOf(c.id) !== -1) ? 'checked' : '';
    return '<label class="scen-con-lbl"><input type="checkbox" class="scen-con-chk" value="' + c.id + '" ' + checked + '>' +
      '<span class="scen-con-dot" style="background:' + PAL[i % PAL.length] + '"></span>' + c.name + '</label>';
  }).join('');
  document.getElementById('sConList').innerHTML = html;
}

function openAddScen() {
  _editScenId = null;
  document.getElementById('sName').value = '';
  document.getElementById('sGtvA').value = '';
  document.getElementById('sGtvT').value = '';
  renderScenCosList([]);
  _setToggle('togSolar', 'sfSolar', false);
  _setToggle('togBat', 'sfBat', false);
  _resetModalFields();
  showM('mScen');
}

function openEditScen(id) {
  var sc = _findScen(id);
  if (!sc) return;
  _editScenId = id;
  document.getElementById('sName').value = sc.name;
  document.getElementById('sGtvA').value = sc.gtvA != null ? sc.gtvA : '';
  document.getElementById('sGtvT').value = sc.gtvT != null ? sc.gtvT : '';
  renderScenCosList(sc.connectionIds || []);
  var hasSolar = !!(sc.solar && sc.solar.enabled);
  var hasBat = !!(sc.bat && sc.bat.enabled);
  _setToggle('togSolar', 'sfSolar', hasSolar);
  _setToggle('togBat', 'sfBat', hasBat);
  if (hasSolar) {
    document.getElementById('sKwp').value = sc.solar.kWp || 100;
    document.getElementById('sPr').value = sc.solar.pr || 85;
    document.getElementById('sTilt').value = sc.solar.tilt || 35;
    document.getElementById('sAzimut').value = sc.solar.azimut || 0;
  }
  if (hasBat) {
    document.getElementById('sCap').value = sc.bat.cap || 200;
    document.getElementById('sPMax').value = sc.bat.pMax || 50;
    document.getElementById('sEtaC').value = sc.bat.etaC || 95;
    document.getElementById('sEtaD').value = sc.bat.etaD || 95;
    document.getElementById('sSocMin').value = sc.bat.socMin || 10;
    document.getElementById('sSocMax').value = sc.bat.socMax || 90;
    var strat = sc.bat.strategy || 'peakshaving';
    if (strat === 'autarkie' || strat === 'maxsolar') strat = 'onafhankelijkheid';
    var r = document.querySelector('input[name="sBatStrat"][value="' + strat + '"]');
    if (r) r.checked = true;
    document.getElementById('sBatMaxCycles').value = sc.bat.maxCycles || 600;
    var aggr = sc.bat.aggressiveness != null ? sc.bat.aggressiveness : 3;
    var horizon = sc.bat.horizon != null ? sc.bat.horizon : 8;
    document.getElementById('sBatAggr').value = aggr;
    document.getElementById('sBatHorizon').value = horizon;
    document.getElementById('sBatAggr').dispatchEvent(new Event('input'));
    document.getElementById('sBatHorizon').dispatchEvent(new Event('input'));
    var ps = strat === 'peakshaving';
    document.getElementById('sfBatCycles').style.display = ps ? '' : 'none';
    document.getElementById('sfBatAggr').style.display = ps ? '' : 'none';
    document.getElementById('sfBatHorizon').style.display = ps ? '' : 'none';
  }
  showM('mScen');
}

function _resetModalFields() {
  document.getElementById('sKwp').value = 100;
  document.getElementById('sPr').value = 85;
  document.getElementById('sTilt').value = 35;
  document.getElementById('sAzimut').value = 0;
  document.getElementById('sCap').value = 200;
  document.getElementById('sPMax').value = 50;
  document.getElementById('sEtaC').value = 95;
  document.getElementById('sEtaD').value = 95;
  document.getElementById('sSocMin').value = 10;
  document.getElementById('sSocMax').value = 90;
  var r = document.querySelector('input[name="sBatStrat"][value="peakshaving"]');
  if (r) r.checked = true;
  document.getElementById('sBatMaxCycles').value = 600;
  document.getElementById('sBatAggr').value = 3;
  document.getElementById('sBatHorizon').value = 8;
  document.getElementById('sBatAggr').dispatchEvent(new Event('input'));
  document.getElementById('sBatHorizon').dispatchEvent(new Event('input'));
  document.getElementById('sfBatCycles').style.display = '';
  document.getElementById('sfBatAggr').style.display = '';
  document.getElementById('sfBatHorizon').style.display = '';
}

function _setToggle(togId, fieldsId, on) {
  var tog = document.getElementById(togId);
  if (on) tog.classList.add('on'); else tog.classList.remove('on');
  document.getElementById(fieldsId).style.display = on ? 'block' : 'none';
}

function saveScen() {
  var name = document.getElementById('sName').value.trim();
  if (!name) { notify('Vul een naam in', false); return; }
  var hasSolar = document.getElementById('togSolar').classList.contains('on');
  var hasBat = document.getElementById('togBat').classList.contains('on');

  // Verbindingsselectie lezen
  var checkedCons = [].slice.call(document.querySelectorAll('.scen-con-chk:checked')).map(function (el) { return el.value; });
  var p = ap(); var allIds = p ? p.companies.map(function (c) { return c.id; }) : [];
  // Sla connectionIds op als het een echte subset is; leeg array = alle aansluitingen
  var connectionIds = (checkedCons.length && checkedCons.length < allIds.length) ? checkedCons : [];

  var rawGA = parseFloat(document.getElementById('sGtvA').value);
  var rawGT = parseFloat(document.getElementById('sGtvT').value);

  var sc = {
    id: _editScenId || uid(),
    name: name,
    connectionIds: connectionIds,
    gtvA: isNaN(rawGA) ? null : rawGA,
    gtvT: isNaN(rawGT) ? null : rawGT,
    solar: {
      enabled: hasSolar,
      kWp: parseFloat(document.getElementById('sKwp').value) || 100,
      pr: parseFloat(document.getElementById('sPr').value) || 85,
      tilt: parseFloat(document.getElementById('sTilt').value) || 35,
      azimut: parseFloat(document.getElementById('sAzimut').value) || 0
    },
    bat: {
      enabled: hasBat,
      cap: parseFloat(document.getElementById('sCap').value) || 200,
      pMax: parseFloat(document.getElementById('sPMax').value) || 50,
      etaC: parseFloat(document.getElementById('sEtaC').value) || 95,
      etaD: parseFloat(document.getElementById('sEtaD').value) || 95,
      socMin: parseFloat(document.getElementById('sSocMin').value) || 10,
      socMax: parseFloat(document.getElementById('sSocMax').value) || 90,
      strategy: (document.querySelector('input[name="sBatStrat"]:checked') || {}).value || 'peakshaving',
      maxCycles: parseFloat(document.getElementById('sBatMaxCycles').value) || 600,
      aggressiveness: parseInt(document.getElementById('sBatAggr').value, 10) || 3,
      horizon: (function(){var h=parseInt(document.getElementById('sBatHorizon').value,10);return isNaN(h)?8:h;})()
    }
  };

  var p = ap();
  if (!p.scenarios) p.scenarios = [];
  if (_editScenId) {
    for (var i = 0; i < p.scenarios.length; i++) {
      if (p.scenarios[i].id === _editScenId) { p.scenarios[i] = sc; break; }
    }
    delete _optim.scenResults[_editScenId];
  } else {
    p.scenarios.push(sc);
  }

  hideM('mScen');
  saveMeta();
  recalcAllScenarios();
  activateScenario(sc.id);
}

function deleteScen(id) {
  var p = ap();
  if (!p || !p.scenarios) return;
  p.scenarios = p.scenarios.filter(function (s) { return s.id !== id; });
  delete _optim.scenResults[id];
  saveMeta();
  if (_optim.activeScenId === id) activateScenario('basis');
  else { renderScenarioSidebar(); renderComparison(); }
}

// ─── Activeren ───────────────────────────────────────────────────────────────

function activateScenario(id) {
  _optim.activeScenId = id;
  renderScenarioSidebar();
  try { renderSidebar(); } catch(e) {}

  var banner = document.getElementById('scenBanner');
  if (id === 'basis') {
    banner.style.display = 'none';
    if (_optim.baseKw.length) redrawChartsForScenario({ grpKw: _optim.baseKw, perKw: _optim.perKw, withData: _optim.withData, gtvA: _optim.gtvA, gtvT: _optim.gtvT });
    renderComparison();
    return;
  }

  var res = _optim.scenResults[id];
  if (!res) {
    var sc = _findScen(id);
    if (!sc || !_optim.baseKw.length) { notify('Voer eerst de analyse uit', false); return; }
    try { res = calcScenario(sc); _optim.scenResults[id] = res; } catch (e) { console.error('calcScenario:', e); return; }
  }

  var sc2 = _findScen(id);
  document.getElementById('scenBannerName').textContent = sc2 ? sc2.name : id;
  banner.style.display = '';

  redrawChartsForScenario(res);
  renderComparison();
}

function redrawChartsForScenario(res) {
  if (!_optim.allTs.length) return;
  var allTs = _optim.allTs;
  var grpKw = Array.isArray(res) ? res : (res.grpKw || []);
  var perKw = (!Array.isArray(res) && res.perKw) ? res.perKw : _optim.perKw;
  var withData = (!Array.isArray(res) && res.withData) ? res.withData : _optim.withData;
  var gtvA = (!Array.isArray(res) && res.gtvA != null) ? res.gtvA : _optim.gtvA;
  var gtvT = (!Array.isArray(res) && res.gtvT != null) ? res.gtvT : _optim.gtvT;
  try { updateKpisForRes({ grpKw: grpKw, withData: withData, gtvA: gtvA, gtvT: gtvT }); } catch(e) {}
  var gA = grpKw.map(function (v) { return Math.max(0, v); });
  var gT = grpKw.map(function (v) { return Math.max(0, -v); });
  try { drawJaar(allTs, perKw, grpKw, withData, gtvA, gtvT); } catch (e) { console.error('drawJaar scen:', e); }
  try { drawWeek(allTs, grpKw, perKw, withData, gtvA, gtvT); } catch (e) { console.error('drawWeek scen:', e); }
  try { drawGelijktijdigheid(allTs, perKw, withData); } catch (e) { console.error('drawGelijktijdigheid scen:', e); }
  try { drawBDK(perKw, gA, gT, withData, gtvA, gtvT); } catch (e) { console.error('drawBDK scen:', e); }
  try { drawOvsch(allTs, gA, gT, gtvA, gtvT); } catch (e) { console.error('drawOvsch scen:', e); }
  try { drawPiek(allTs, perKw, grpKw, withData); } catch (e) { console.error('drawPiek scen:', e); }
}

// ─── Herberekening ───────────────────────────────────────────────────────────

function recalcAllScenarios() {
  if (!_optim.baseKw.length) { renderScenarioSidebar(); return; }
  var p = ap();
  var scens = (p && p.scenarios) ? p.scenarios : [];
  _optim.scenResults = {};
  scens.forEach(function (sc) {
    try { _optim.scenResults[sc.id] = calcScenario(sc); } catch (e) { console.error('calcScenario', sc.id, e); }
  });
  renderScenarioSidebar();
  if (_optim.activeScenId && _optim.activeScenId !== 'basis' && _optim.scenResults[_optim.activeScenId]) {
    redrawChartsForScenario(_optim.scenResults[_optim.activeScenId]);
    document.getElementById('scenBanner').style.display = '';
  }
  renderComparison();
}

// ─── Scenarioberekening ──────────────────────────────────────────────────────

function calcScenario(sc) {
  var allTs = _optim.allTs;

  // Bepaal aansluitingen voor dit scenario
  var ids = (sc.connectionIds && sc.connectionIds.length) ? sc.connectionIds : null;
  var allData = _optim.allData && _optim.allData.length ? _optim.allData : _optim.withData;
  var subset = ids ? allData.filter(function (c) { return ids.indexOf(c.id) !== -1; }) : _optim.withData;
  if (!subset || !subset.length) subset = _optim.withData;

  // Bereken groepsprofiel voor de subset
  var perKwSub = subset.map(function (c) {
    var m = {}; c.data.forEach(function (d) { m[d.ts] = d.kw; });
    return allTs.map(function (ts) { return m[ts] || 0; });
  });
  var grpKw = allTs.map(function (_, i) {
    return perKwSub.reduce(function (s, a) { return s + a[i]; }, 0);
  });

  // GTV voor dit scenario
  var gtvA = sc.gtvA != null ? sc.gtvA : subset.reduce(function (s, c) { return s + (c.gtvA || 0); }, 0);
  var gtvT = sc.gtvT != null ? sc.gtvT : subset.reduce(function (s, c) { return s + (c.gtvT || 0); }, 0);

  var solar_kw = null, solarLog = null, batProfile = null, socProfile = null, batLog = null;

  if (sc.solar && sc.solar.enabled) {
    var sRes = calcSolar(sc.solar);
    solar_kw = sRes.kw;
    solarLog = sRes.log;
    for (var i = 0; i < grpKw.length; i++) grpKw[i] += solar_kw[i];
  }

  if (sc.bat && sc.bat.enabled) {
    var bRes = calcBattery(grpKw, solar_kw, sc.bat, gtvA, gtvT);
    grpKw = bRes.kw;
    batProfile = bRes.batProfile;
    socProfile = bRes.socProfile;
    batLog = bRes.log;
  }

  var baseKw = _optim.baseKw;
  var gA = grpKw.map(function (v) { return Math.max(0, v); });
  var baseA = baseKw.map(function (v) { return Math.max(0, v); });

  var mndSet = {};
  allTs.forEach(function (ts) { mndSet[ts.slice(0, 7)] = 1; });
  var mnds = Object.keys(mndSet).sort();

  function mPeaks(kw) {
    return mnds.map(function (mn) {
      var mx = 0;
      allTs.forEach(function (ts, i) { if (ts.slice(0, 7) === mn && kw[i] > mx) mx = kw[i]; });
      return mx;
    });
  }

  var mPA = mPeaks(gA), basePA = mPeaks(baseA);
  var maxA = gA.length ? Math.max.apply(null, gA) : 0;
  var maxT = grpKw.length ? Math.max.apply(null, grpKw.map(function (v) { return Math.max(0, -v); })) : 0;
  var baseMaxA = baseA.length ? Math.max.apply(null, baseA) : 0;

  var importTs = grpKw.filter(function (v) { return v > 0; }).length;
  var autarkie = grpKw.length > 0 ? (1 - importTs / grpKw.length) * 100 : 0;

  var pvTotal = 0;
  if (solar_kw) pvTotal = solar_kw.reduce(function (s, v) { return s - Math.min(0, v); }, 0) * 0.25 / 1000;

  var avgKm = _optim.avgKm;
  var kmSaving = (basePA.reduce(function (s, v) { return s + v; }, 0) - mPA.reduce(function (s, v) { return s + v; }, 0)) / Math.max(1, mnds.length) * 12 * avgKm;

  return {
    grpKw: grpKw, perKw: perKwSub, withData: subset, gtvA: gtvA, gtvT: gtvT,
    solar_kw: solar_kw, batProfile: batProfile, socProfile: socProfile,
    solarLog: solarLog, batLog: batLog,
    metrics: { maxA: maxA, maxT: maxT, baseMaxA: baseMaxA, autarkie: autarkie, pvTotal: pvTotal, mPeaks: mPA, baseMPeaks: basePA, mnds: mnds, kmSaving: kmSaving }
  };
}

// ─── Zonnepanelen ────────────────────────────────────────────────────────────

function calcSolar(p) {
  var kWp = p.kWp, tilt = p.tilt * Math.PI / 180, azimut = p.azimut * Math.PI / 180, pr = (p.pr || 85) / 100;
  var kw = [], monthEnergy = new Array(12).fill(0), monthElevSum = new Array(12).fill(0), monthElevN = new Array(12).fill(0);

  _optim.allTs.forEach(function (ts) {
    var tParts = ts.split('T'), dParts = tParts[0].split('-');
    var year = parseInt(dParts[0]), mo = parseInt(dParts[1]) - 1, day = parseInt(dParts[2]);
    var hParts = tParts[1].split(':');
    var localH = parseInt(hParts[0]) + parseInt(hParts[1]) / 60;
    var doy = Math.floor((new Date(year, mo, day) - new Date(year, 0, 1)) / 86400000) + 1;
    var B = (360 / 365 * (doy - 81)) * Math.PI / 180;
    var eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    var solarH = localH + (3.8 - 15) * 4 / 60 + eot / 60;
    var H = (solarH - 12) * 15 * Math.PI / 180;
    var delta = 23.45 * Math.sin(B) * Math.PI / 180;
    var sinA = Math.sin(PHI) * Math.sin(delta) + Math.cos(PHI) * Math.cos(delta) * Math.cos(H);
    if (sinA <= 0.01) { kw.push(0); return; }
    var cosA = Math.sqrt(1 - sinA * sinA);
    var sinAz = Math.cos(delta) * Math.sin(H) / cosA;
    var cosAz = (sinA * Math.sin(PHI) - Math.sin(delta)) / (cosA * Math.cos(PHI));
    var az = Math.atan2(sinAz, cosAz);
    var cosTheta = sinA * Math.cos(tilt) + cosA * Math.cos(az - azimut) * Math.sin(tilt);
    if (cosTheta <= 0) { kw.push(0); return; }
    var power = kWp * cosTheta * pr;
    kw.push(-power);
    monthEnergy[mo] += power * 0.25;
    monthElevSum[mo] += Math.asin(sinA) * 180 / Math.PI;
    monthElevN[mo]++;
  });

  var hasReturn = _optim.baseKw.some(function (v) { return v < -5; });
  var totalEnergy = monthEnergy.reduce(function (s, v) { return s + v; }, 0);
  return {
    kw: kw,
    log: { kWp: kWp, tilt: p.tilt, azimut: p.azimut, pr: p.pr, monthEnergy: monthEnergy, monthElevSum: monthElevSum, monthElevN: monthElevN, totalEnergy: totalEnergy, fullLoadHours: kWp > 0 ? totalEnergy / kWp : 0, hasReturn: hasReturn }
  };
}

// ─── Batterijopslag ──────────────────────────────────────────────────────────

function calcBattery(baseKw, solar_kw, p, gtvA, gtvT) {
  var cap = p.cap, pMax = p.pMax;
  var etaC = (p.etaC || 95) / 100, etaD = (p.etaD || 95) / 100;
  var socMin = (p.socMin || 10) / 100 * cap, socMax = (p.socMax || 90) / 100 * cap;
  var strategy = p.strategy || 'peakshaving';
  var maxCycles = p.maxCycles || 600;
  var r;

  if (strategy === 'peakshaving') {
    var aggr = p.aggressiveness != null ? p.aggressiveness : 3;
    var horizon = p.horizon != null ? p.horizon : 8;
    r = simPeakShavingV2(baseKw, _optim.allTs, cap, pMax, etaC, etaD, socMin, socMax, {
      aggressiveness: aggr, horizon: horizon, maxCycles: maxCycles,
      gtvA: gtvA > 0 ? gtvA : 0, gtvT: gtvT > 0 ? gtvT : 0
    });
  }
  else if (strategy === 'onafhankelijkheid' || strategy === 'autarkie' || strategy === 'maxsolar') r = simAutarkie(baseKw, cap, pMax, etaC, etaD, socMin, socMax);
  else { r = { kw: baseKw.slice(), batProfile: new Array(baseKw.length).fill(0), socProfile: new Array(baseKw.length).fill(50), monthLog: [], totalEnergyThrough: 0 }; }

  var estCycles = cap > 0 ? r.totalEnergyThrough / cap / 2 : 0;
  return {
    kw: r.kw, batProfile: r.batProfile, socProfile: r.socProfile,
    log: { cap: cap, pMax: pMax, etaC: p.etaC, etaD: p.etaD, socMin: p.socMin, socMax: p.socMax, strategy: strategy, maxCycles: maxCycles, aggressiveness: p.aggressiveness, horizon: p.horizon, monthLog: r.monthLog, estCycles: estCycles, totalEnergyThrough: r.totalEnergyThrough, actionCount: r.actionCount || 0 }
  };
}

// ─── Peak shaving v2 — hybride: piek-shaven (primair) + nullijn-sturing (secundair)
// Fase 1: per maand binaire zoek naar laagst haalbare drempel pStar zodat de batterij
//   het profiel binnen ±pStar kan houden, met cycli-budget en GTV als plafond.
// Fase 2: forward pass — boven ±pStar HARD ontladen/laden (peak shaving heeft
//   onvoorwaardelijke prioriteit). Binnen ±pStar zachte sturing richting nullijn
//   met dode band, min-actie, pendel-preventie en lookahead.
function simPeakShavingV2(baseKw, allTs, cap, pMax, etaC, etaD, socMin, socMax, opts) {
  opts = opts || {};
  var dt = 0.25;
  var aggr = Math.max(1, Math.min(5, parseInt(opts.aggressiveness, 10) || 3));
  var horizon = Math.max(0, Math.min(96, parseInt(opts.horizon, 10) || 0));
  var maxCycles = opts.maxCycles > 0 ? opts.maxCycles : 600;
  var gtvA = opts.gtvA > 0 ? opts.gtvA : Infinity;
  var gtvT = opts.gtvT > 0 ? opts.gtvT : Infinity;

  // ── Fase 1: per-maand drempelberekening ────────────────────────────────────
  var hasTs = allTs && allTs.length === baseKw.length;
  var monthMap = {};
  if (hasTs) {
    allTs.forEach(function (ts, i) {
      var mn = ts.slice(0, 7);
      if (!monthMap[mn]) monthMap[mn] = [];
      monthMap[mn].push(i);
    });
  } else {
    monthMap['_all'] = baseKw.map(function (_, i) { return i; });
  }
  var mnds = Object.keys(monthMap).sort();

  // Proportionele cyclusbudget-allocatie: maanden met hogere pieken krijgen meer budget
  var monthPeakScore = {}, totalPeakScore = 0;
  mnds.forEach(function (mn) {
    var idxs = monthMap[mn];
    var absMax = idxs.reduce(function (acc, i) {
      return Math.abs(baseKw[i]) > acc ? Math.abs(baseKw[i]) : acc;
    }, 0);
    monthPeakScore[mn] = absMax;
    totalPeakScore += absMax;
  });
  var totalBudget = (maxCycles > 0 && cap > 0) ? maxCycles * 2 * cap : Infinity;
  var maxMonthThrough = {};
  mnds.forEach(function (mn) {
    maxMonthThrough[mn] = (totalPeakScore > 0 && totalBudget < Infinity)
      ? totalBudget * (monthPeakScore[mn] / totalPeakScore)
      : Infinity;
  });

  var monthThresh = {};

  mnds.forEach(function (mn) {
    var idxs = monthMap[mn];
    var profile = idxs.map(function (i) { return baseKw[i]; });
    var maxA = profile.reduce(function (m, v) { return v > m ? v : m; }, 0);
    var maxT = profile.reduce(function (m, v) { return -v > m ? -v : m; }, 0);
    var absMax = Math.max(maxA, maxT);
    if (absMax < 0.5) { monthThresh[mn] = 0; return; }

    // Binaire zoek naar laagste haalbare symmetrische drempel
    var lo = 0, hi = absMax, pStar = absMax;
    for (var iter = 0; iter < 22; iter++) {
      var mid = (lo + hi) / 2;
      var fs = _fwdPassPeakOnly(profile, mid, mid, cap, pMax, etaC, etaD, socMin, socMax);
      if (fs.feasible) { hi = mid; pStar = mid; } else lo = mid;
    }

    // Cycli-budget: als haalbare drempel meer energie kost dan budget, drempel verhogen
    var fsBest = _fwdPassPeakOnly(profile, pStar, pStar, cap, pMax, etaC, etaD, socMin, socMax);
    if (maxMonthThrough[mn] < Infinity && fsBest.energyThrough > maxMonthThrough[mn]) {
      lo = pStar; hi = absMax;
      for (var iter2 = 0; iter2 < 22; iter2++) {
        var mid2 = (lo + hi) / 2;
        var fs2 = _fwdPassPeakOnly(profile, mid2, mid2, cap, pMax, etaC, etaD, socMin, socMax);
        if (fs2.energyThrough <= maxMonthThrough[mn]) { hi = mid2; pStar = mid2; } else lo = mid2;
      }
    }
    monthThresh[mn] = pStar;
  });

  // ── Fase 2: forward pass ──────────────────────────────────────────────────
  var absMaxAll = baseKw.length ? Math.max.apply(null, baseKw.map(function (v) { return Math.abs(v); })) : 100;
  var dbBaseline = Math.max(5, absMaxAll * 0.02);
  var dbScale =   [3.0, 2.0, 1.0, 0.7, 0.5 ][aggr - 1];
  var minAScale = [1.4, 1.2, 1.0, 0.8, 0.6 ][aggr - 1];
  var aggrFactor =[0.0, 0.1, 0.3, 0.6, 1.0 ][aggr - 1]; // dal-vulfactor zonder aankomende pieken; altijd 1.0 als rsvDis > 0
  var dbBase = dbBaseline * dbScale;
  var minABase = dbBase * 0.5 * minAScale;

  // Lookahead-venster voor SoC-reservering. Minimaal 32 kwartieren (8u) zodat
  // nachtdalen worden benut voor de ochtendpiek.
  var rsvHorizon = Math.max(horizon, 32);

  var result = new Array(baseKw.length);
  var batProfile = new Array(baseKw.length);
  var socProfile = new Array(baseKw.length);
  var soc = (socMin + socMax) / 2;
  var prevAction = 0;
  var energyThrough = 0;
  var actionCount = 0;
  var doyStart = _doyFromTs(hasTs ? allTs[0] : null);

  for (var i = 0; i < baseKw.length; i++) {
    var net = baseKw[i];
    var mn = hasTs ? allTs[i].slice(0, 7) : '_all';
    var pStar = monthThresh[mn] != null ? monthThresh[mn] : Infinity;
    // Effectieve drempels per richting: laagste van pStar en GTV
    var threshA = Math.min(pStar, gtvA);
    var threshT = Math.min(pStar, gtvT);

    // SoC-reservering op basis van lookahead. Sommeert benodigde energie voor
    // alle pieken in de komende rsvHorizon kwartieren, beide richtingen.
    var rsvDis = 0, rsvChg = 0;
    var rsvEnd = Math.min(baseKw.length, i + 1 + rsvHorizon);
    for (var k = i + 1; k < rsvEnd; k++) {
      var fv = baseKw[k];
      if (fv > threshA) rsvDis += (fv - threshA) * dt / Math.max(0.01, etaD);
      else if (fv < -threshT) rsvChg += (-fv - threshT) * dt * etaC;
    }
    rsvDis = Math.min(rsvDis, socMax - socMin);
    rsvChg = Math.min(rsvChg, socMax - socMin);
    var minSocAllowed = socMin + rsvDis;     // niet onder zakken (afnamepieken komen)
    var maxSocAllowed = socMax - rsvChg;     // niet boven gaan (terugleverpieken komen)

    // Cycli-governor — schaalt alleen de zachte zero-drive, niet het peak shaving
    var daysElapsed = hasTs ? Math.max(0.001, _doyFromTs(allTs[i]) - doyStart + 0.001) : Math.max(0.001, i * dt / 24);
    var actualCycles = cap > 0 ? energyThrough / (cap * 2) : 0;
    var expectedCycles = maxCycles * daysElapsed / 365;
    var ratio = expectedCycles > 0.05 ? actualCycles / expectedCycles : 1;
    var govScale = Math.min(1.6, Math.max(0.85, Math.pow(ratio, 1.5)));
    var dbEff = dbBase * govScale;
    var minAEff = minABase * govScale;
    var aggrEff = aggrFactor / govScale;

    var action = 0;
    var inPeakShave = false;

    // ── PRIMAIR: peak shaving — onvoorwaardelijk, ALTIJD volle kracht ──
    if (net > threshA) {
      action = -(net - threshA);     // ontlaad om naar threshA te brengen
      inPeakShave = true;
    } else if (net < -threshT) {
      action = (-net - threshT);     // laad om naar -threshT te brengen
      inPeakShave = true;
    } else {
      // ── SECUNDAIR: actieve dal-vulling ──
      // Laad zo agressief mogelijk wanneer net < threshA zodat de accu vol is
      // bij de volgende piek. Kracht volledig als er aankomende pieken zijn (rsvDis > 0),
      // aggrFactor-geschaald als preventieve vulling.
      var fillStrength = rsvDis > 0 ? 1.0 : aggrFactor;
      if (fillStrength > 0 && soc < maxSocAllowed - 0.5) {
        var headroom = Math.max(0, threshA - net);
        var maxChgKw = Math.min(pMax, headroom, (maxSocAllowed - soc) * 4 / Math.max(0.01, etaC));
        if (maxChgKw > minAEff) {
          action = maxChgKw * fillStrength;
          if (action < minAEff) action = 0;
        }
      }
      // Pre-ontlaad als teruglever-pieken komen en accu te vol is
      if (action === 0 && soc > maxSocAllowed + 0.5) {
        var excess = soc - maxSocAllowed;
        var rampDis = Math.min(pMax * 0.7, excess * 4 * etaD);
        if (rampDis > minAEff) action = -rampDis;
      }
    }

    // Min-actie + pendel-preventie alleen voor zachte modes; piek-shave is hard
    if (!inPeakShave) {
      if (Math.abs(action) < minAEff) action = 0;
      if (action !== 0 && prevAction !== 0 && _sign(action) !== _sign(prevAction)) {
        if (Math.abs(action) < 2 * minAEff) action = 0;
      }
    }

    // Technische grenzen
    if (action > 0) {
      var maxChg = (socMax - soc) * 4 / Math.max(0.01, etaC);
      action = Math.min(action, pMax, maxChg);
    } else if (action < 0) {
      var maxDis = (soc - socMin) * 4 * etaD;
      action = Math.max(action, -pMax, -maxDis);
    }

    // Pieksveiligheid: actie mag geen tegenovergestelde piek creëren
    var newNet = net + action;
    if (action > 0 && newNet > threshA) action = Math.max(0, threshA - net);
    else if (action < 0 && newNet < -threshT) action = Math.min(0, -threshT - net);
    if (Math.abs(action) < 0.05) action = 0;

    // Accu-status bijwerken
    if (action > 0)      soc += action * dt * etaC;
    else if (action < 0) soc += action * dt / Math.max(0.01, etaD);
    soc = Math.max(socMin, Math.min(socMax, soc));

    energyThrough += Math.abs(action) * dt;
    if (action !== 0) { actionCount++; prevAction = action; }
    else prevAction = 0;

    result[i] = net + action;
    batProfile[i] = action;
    socProfile[i] = cap > 0 ? (soc / cap * 100) : 0;
  }

  var monthLog = _buildMonthLogV2(baseKw, result, batProfile, dt);
  // Annoteer met de drempel die per maand is berekend (transparantie in rapport)
  monthLog.forEach(function (m) { m.threshold = monthThresh[m.month] != null ? monthThresh[m.month] : 0; });

  return {
    kw: result, batProfile: batProfile, socProfile: socProfile,
    monthLog: monthLog, totalEnergyThrough: energyThrough, actionCount: actionCount
  };
}

// Pure peak-shave forward pass — gebruikt door Fase 1 binaire zoek.
// Asymmetrische drempels per richting; geen zero-drive, geen lookahead.
function _fwdPassPeakOnly(profile, threshA, threshT, cap, pMax, etaC, etaD, socMin, socMax) {
  var soc = (socMin + socMax) / 2;
  var feasible = true, energyThrough = 0;
  for (var i = 0; i < profile.length; i++) {
    var v = profile[i];
    if (v > threshA && soc > socMin) {
      var dis = Math.min(pMax, (soc - socMin) * 4 * etaD, v - threshA);
      v -= dis;
      soc -= dis * 0.25 / Math.max(0.01, etaD);
      energyThrough += dis * 0.25;
    } else if (v < -threshT && soc < socMax) {
      var chg = Math.min(pMax, (socMax - soc) * 4 / Math.max(0.01, etaC), -v - threshT);
      v += chg;
      soc += chg * 0.25 * etaC;
      energyThrough += chg * 0.25;
    }
    soc = Math.max(socMin, Math.min(socMax, soc));
    if (v > threshA + 0.6 || v < -(threshT + 0.6)) feasible = false;
  }
  return { feasible: feasible, energyThrough: energyThrough };
}

function _sign(x) { return x > 0 ? 1 : (x < 0 ? -1 : 0); }

function _doyFromTs(ts) {
  if (!ts) return 1;
  var p = String(ts).split('T')[0].split('-');
  if (p.length < 3) return 1;
  var y = parseInt(p[0], 10), m = parseInt(p[1], 10) - 1, d = parseInt(p[2], 10);
  var t = parseInt(String(ts).split('T')[1] || '00:00', 10) || 0;
  var date = new Date(y, m, d);
  var y0 = new Date(y, 0, 1);
  return Math.floor((date - y0) / 86400000) + 1 + t / 24;
}

function _buildMonthLogV2(baseKw, result, batProfile, dt) {
  var allTs = _optim.allTs;
  if (!allTs || allTs.length !== baseKw.length) return [];
  var mndSet = {};
  allTs.forEach(function (ts) { mndSet[ts.slice(0, 7)] = 1; });
  var mnds = Object.keys(mndSet).sort();
  return mnds.map(function (mn) {
    var oP = 0, nP = 0, oN = 0, nN = 0, eThr = 0, acts = 0;
    allTs.forEach(function (ts, idx) {
      if (ts.slice(0, 7) === mn) {
        var bv = baseKw[idx], nv = result[idx], a = batProfile[idx];
        if (bv > oP) oP = bv;
        if (nv > nP) nP = nv;
        if (-bv > oN) oN = -bv;
        if (-nv > nN) nN = -nv;
        eThr += Math.abs(a) * dt;
        if (a !== 0) acts++;
      }
    });
    return { month: mn, origPeak: oP, newPeak: nP, origPeakT: oN, newPeakT: nN, energyThrough: eThr, actions: acts };
  });
}

// Strategie B — Onafhankelijkheid/Zon PV: laad op surplus, ontlaad op afname
function simAutarkie(baseKw, cap, pMax, etaC, etaD, socMin, socMax) {
  var result = [], batProfile = [], socProfile = [];
  var soc = (socMin + socMax) / 2, totalEnergyThrough = 0;

  for (var i = 0; i < baseKw.length; i++) {
    var v = baseKw[i], bp = 0;
    if (v > 0 && soc > socMin) {
      var dis = Math.min(pMax, (soc - socMin) * 4 * etaD, v);
      v -= dis; soc -= dis / 4 / etaD; bp = -dis; totalEnergyThrough += dis * 0.25;
    } else if (v < 0 && soc < socMax) {
      var chg = Math.min(pMax, (socMax - soc) * 4 / etaC, -v);
      v += chg; soc += chg * etaC / 4; bp = chg; totalEnergyThrough += chg * 0.25;
    }
    soc = Math.max(socMin, Math.min(socMax, soc));
    result.push(v); batProfile.push(bp); socProfile.push(soc / cap * 100);
  }

  return { kw: result, batProfile: batProfile, socProfile: socProfile, monthLog: _buildMonthLog(baseKw, result), totalEnergyThrough: totalEnergyThrough };
}

// Strategie C — Maximaal zonneverbruik: laad alleen uit PV-surplus
function simMaxSolar(baseKw, solar_kw, cap, pMax, etaC, etaD, socMin, socMax) {
  var result = [], batProfile = [], socProfile = [];
  var soc = (socMin + socMax) / 2, totalEnergyThrough = 0;

  for (var i = 0; i < baseKw.length; i++) {
    var v = baseKw[i], bp = 0;
    var pvKw = solar_kw[i] || 0; // negatief = productie
    if (pvKw < 0 && v < 0 && soc < socMax) {
      // PV produceert en er is surplus → laad
      var chg = Math.min(pMax, (socMax - soc) * 4 / etaC, -v);
      v += chg; soc += chg * etaC / 4; bp = chg; totalEnergyThrough += chg * 0.25;
    } else if (v > 0 && soc > socMin) {
      // Import → ontlaad
      var dis = Math.min(pMax, (soc - socMin) * 4 * etaD, v);
      v -= dis; soc -= dis / 4 / etaD; bp = -dis; totalEnergyThrough += dis * 0.25;
    }
    soc = Math.max(socMin, Math.min(socMax, soc));
    result.push(v); batProfile.push(bp); socProfile.push(soc / cap * 100);
  }

  return { kw: result, batProfile: batProfile, socProfile: socProfile, monthLog: _buildMonthLog(baseKw, result), totalEnergyThrough: totalEnergyThrough };
}

function _fwdPass(profile, threshold, cap, pMax, etaC, etaD, socMin, socMax) {
  var soc = (socMin + socMax) / 2;
  var kw = [], bp = [], socArr = [], feasible = true, energyThrough = 0;
  for (var i = 0; i < profile.length; i++) {
    var v = profile[i], b = 0, d = v - threshold;
    if (d > 0 && soc > socMin) {
      var dis = Math.min(pMax, (soc - socMin) * 4 * etaD, d);
      v -= dis; soc -= dis / 4 / etaD; b = -dis; energyThrough += dis * 0.25;
    } else if (d < 0 && soc < socMax) {
      var chg = Math.min(pMax, (socMax - soc) * 4 / etaC, -d);
      v += chg; soc += chg * etaC / 4; b = chg; energyThrough += chg * 0.25;
    }
    soc = Math.max(socMin, Math.min(socMax, soc));
    if (v > threshold + 0.6) feasible = false;
    kw.push(v); bp.push(b); socArr.push(soc);
  }
  return { feasible: feasible, kw: kw, bp: bp, soc: socArr, energyThrough: energyThrough };
}

function _buildMonthLog(baseKw, result) {
  var mndSet = {};
  _optim.allTs.forEach(function (ts) { mndSet[ts.slice(0, 7)] = 1; });
  return Object.keys(mndSet).sort().map(function (mn) {
    var orig = [], newv = [];
    _optim.allTs.forEach(function (ts, i) { if (ts.slice(0, 7) === mn) { orig.push(Math.max(0, baseKw[i])); newv.push(Math.max(0, result[i])); } });
    return { month: mn, origPeak: Math.max.apply(null, orig.length ? orig : [0]), newPeak: Math.max.apply(null, newv.length ? newv : [0]) };
  });
}

// ─── Seizoensprofiel ─────────────────────────────────────────────────────────

function weekProfileBySeason(allTs, values) {
  var SLOT = 672;
  function getSeason(mo) { if (mo === 12 || mo <= 2) return 'win'; if (mo <= 5) return 'spr'; if (mo <= 8) return 'sum'; return 'aut'; }
  var acc = {};
  ['win', 'spr', 'sum', 'aut'].forEach(function (s) { acc[s] = { sum: new Array(SLOT).fill(0), cnt: new Array(SLOT).fill(0) }; });

  allTs.forEach(function (ts, i) {
    var parts = ts.split('T');
    var mo = parseInt(parts[0].split('-')[1]);
    var dt = new Date(parts[0] + 'T' + parts[1] + ':00Z');
    var weekDay = (dt.getUTCDay() + 6) % 7; // Ma=0
    var hm = parts[1].split(':');
    var slot = weekDay * 96 + parseInt(hm[0]) * 4 + Math.floor(parseInt(hm[1]) / 15);
    var s = getSeason(mo);
    acc[s].sum[slot] += values[i];
    acc[s].cnt[slot]++;
  });

  var res = {};
  ['win', 'spr', 'sum', 'aut'].forEach(function (s) {
    res[s] = acc[s].sum.map(function (v, i) { return acc[s].cnt[i] > 0 ? v / acc[s].cnt[i] : 0; });
  });
  return res;
}

// ─── Vergelijkingstab ────────────────────────────────────────────────────────

function renderComparison() {
  var p = ap();
  var scens = (p && p.scenarios) ? p.scenarios : [];
  document.getElementById('vergEmpty').style.display = scens.length ? 'none' : '';
  document.getElementById('vergContent').style.display = scens.length ? '' : 'none';
  if (!scens.length || !_optim.baseKw.length) return;

  var allTs = _optim.allTs, baseKw = _optim.baseKw;
  var baseA = baseKw.map(function (v) { return Math.max(0, v); });
  var mndSet = {};
  allTs.forEach(function (ts) { mndSet[ts.slice(0, 7)] = 1; });
  var mnds = Object.keys(mndSet).sort();
  var mLbl = mnds.map(function (m) { return mndLabel(mnds, m); });

  function mPeaks(arr) {
    return mnds.map(function (mn) {
      var mx = 0;
      allTs.forEach(function (ts, i) { if (ts.slice(0, 7) === mn && arr[i] > mx) mx = arr[i]; });
      return mx;
    });
  }

  var bPA = mPeaks(baseA);
  var bMaxA = bPA.length ? Math.max.apply(null, bPA) : 0;
  var bMaxT = baseKw.length ? Math.max.apply(null, baseKw.map(function (v) { return Math.max(0, -v); })) : 0;
  var bImport = baseKw.filter(function (v) { return v > 0; }).length;
  var bAutarkie = baseKw.length > 0 ? (1 - bImport / baseKw.length) * 100 : 0;

  function dCell(base, scen, lowerIsBetter) {
    var diff = scen - base;
    if (base === 0 && diff === 0) return '—';
    var pct = base !== 0 ? Math.round(diff / Math.abs(base) * 100) : 0;
    var isGood = lowerIsBetter ? diff < 0 : diff > 0;
    var cls = diff === 0 ? '' : (isGood ? ' class="verg-pos"' : ' class="verg-neg"');
    var sign = diff >= 0 ? '+' : '';
    return '<span' + cls + '>' + scen.toFixed(0) + ' (' + sign + pct + '%)</span>';
  }

  var stratNames = { peakshaving: 'Peak shaving', onafhankelijkheid: 'Onafhankelijkheid/Zon PV', autarkie: 'Onafhankelijkheid/Zon PV', maxsolar: 'Onafhankelijkheid/Zon PV' };
  var bGtvA = _optim.gtvA, bGtvT = _optim.gtvT;
  var bCosLen = _optim.withData ? _optim.withData.length : 0;
  var totalCosLen = p ? p.companies.length : 0;

  // Tabel header
  var thead = '<thead><tr><th>Metric</th><th>Basis</th>';
  scens.forEach(function (sc) { thead += '<th class="scen-h">' + sc.name + '</th>'; });
  thead += '</tr></thead>';

  // Rijen
  var metrics = [
    { lbl: 'Aansluitingen', base: bCosLen + (totalCosLen > bCosLen ? '/' + totalCosLen : ''), raw: function(res, sc) {
      var n = (res && res.withData) ? res.withData.length : (sc.connectionIds && sc.connectionIds.length ? sc.connectionIds.length : bCosLen);
      return n + (totalCosLen > n ? '/' + totalCosLen : '');
    }},
    { lbl: 'GTV afname / teruglevering (kW)', base: bGtvA + ' / ' + bGtvT, raw: function(res, sc) {
      var a = (res && res.gtvA) ? res.gtvA : bGtvA;
      var t = (res && res.gtvT) ? res.gtvT : bGtvT;
      return a + ' / ' + t;
    }},
    { lbl: 'Piekafname (kW)', base: bMaxA.toFixed(0), lower: true, get: function(m) { return m.maxA; } },
    { lbl: 'Piek teruglev. (kW)', base: bMaxT.toFixed(0), lower: false, get: function(m) { return m.maxT; }, noColor: true },
    { lbl: 'PV productie (MWh/jr)', base: '—', get: function(m, res) { return res.solar_kw ? m.pvTotal * 1000 : null; }, fmt: function(v) { return v ? (v/1000).toFixed(2) + ' MWh' : '—'; }, higher: true },
    { lbl: 'Autarkie (%)', base: bAutarkie.toFixed(0) + '%', get: function(m) { return m.autarkie; }, fmt: function(v) { return v.toFixed(0) + '%'; }, higher: true },
    { lbl: 'Batterijcycli (/jr)', base: '—', get: function(m, res) { return res.batLog ? res.batLog.estCycles : null; }, fmt: function(v) { return v ? Math.round(v) : '—'; }, neutral: true },
    { lbl: 'Strategie', base: '—', raw: function(res, sc) { return res && res.batLog ? (stratNames[res.batLog.strategy] || res.batLog.strategy) : (sc.solar && sc.solar.enabled ? 'Alleen PV' : '—'); } },
    { lbl: 'kW-max besparing (est.)', base: '—', get: function(m) { return m.kmSaving; }, fmt: function(v) { return v > 0 ? '€ ' + fmt(v) : '−€ ' + fmt(-v); }, higher: true }
  ];

  var tbody = metrics.map(function (row) {
    var html = '<tr><td class="metric">' + row.lbl + '</td><td>' + row.base + '</td>';
    scens.forEach(function (sc) {
      var res = _optim.scenResults[sc.id];
      if (!res) { html += '<td>—</td>'; return; }
      if (row.raw) { html += '<td>' + row.raw(res, sc) + '</td>'; return; }
      var val = row.get(res.metrics, res);
      if (val === null || val === undefined) { html += '<td>—</td>'; return; }
      if (row.fmt) { html += '<td>' + row.fmt(val) + '</td>'; return; }
      if (row.noColor || row.neutral) { html += '<td>' + val.toFixed(0) + '</td>'; return; }
      var baseNum = parseFloat(row.base);
      html += '<td>' + dCell(baseNum, val, !!row.lower) + '</td>';
    });
    html += '</tr>';
    return html;
  }).join('');

  document.getElementById('vergTbl').innerHTML = thead + '<tbody>' + tbody + '</tbody>';

  // Maandpieken grafiek
  dC('cVergPiek');
  var COLS = ['#e67e22', '#3498db', '#9b59b6', '#1abc9c', '#e74c3c'];
  var datasets = [{ label: 'Basis (kW)', data: bPA.map(function (v) { return +v.toFixed(1); }), backgroundColor: 'rgba(150,150,150,.5)', borderColor: '#aaa', borderWidth: 1, borderRadius: 3 }];
  scens.forEach(function (sc, si) {
    var res = _optim.scenResults[sc.id];
    if (!res) return;
    var sPA = mPeaks(res.grpKw.map(function (v) { return Math.max(0, v); }));
    var c = COLS[si % COLS.length], rgb = parseInt(c.slice(1, 3), 16) + ',' + parseInt(c.slice(3, 5), 16) + ',' + parseInt(c.slice(5, 7), 16);
    datasets.push({ label: sc.name + ' (kW)', data: sPA.map(function (v) { return +v.toFixed(1); }), backgroundColor: 'rgba(' + rgb + ',.65)', borderColor: c, borderWidth: 1, borderRadius: 3 });
  });

  CH['cVergPiek'] = new Chart(document.getElementById('cVergPiek'), {
    type: 'bar', data: { labels: mLbl, datasets: datasets },
    options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: '#888', font: { family: 'Barlow', size: 11 }, boxWidth: 10 } } }, scales: { x: Object.assign(ax(), { grid: { display: false } }), y: Object.assign(ax('kW'), { beginAtZero: true }) } }
  });

  // Toon asset-analyse voor actief scenario (of eerste met bat/PV als basis actief is)
  var assetId = _optim.activeScenId;
  if (!assetId || assetId === 'basis') {
    var p2 = ap(); var sc2 = (p2 && p2.scenarios) ? p2.scenarios : [];
    for (var si = 0; si < sc2.length; si++) {
      var r2 = _optim.scenResults[sc2[si].id];
      if (r2 && ((sc2[si].bat && sc2[si].bat.enabled && r2.batProfile) || (sc2[si].solar && sc2[si].solar.enabled && r2.solar_kw))) { assetId = sc2[si].id; break; }
    }
  }
  renderAssetAnalysis(assetId);
}

// ─── Asset analyse ───────────────────────────────────────────────────────────

var _batState = null, _batZoom = 1;

function renderAssetAnalysis(scenId) {
  ['cPVYear', 'cPVMonth', 'cPVWeek', 'cBatYear', 'cBatSoC'].forEach(function (id) { dC(id); });
  var el = document.getElementById('vergAssets');
  el.innerHTML = ''; _batState = null;
  if (!scenId || scenId === 'basis') return;
  var res = _optim.scenResults[scenId];
  if (!res) return;
  var sc = _findScen(scenId);
  if (!sc) return;

  if (sc.solar && sc.solar.enabled && res.solar_kw) el.appendChild(_buildPVSection(res, sc));
  if (sc.bat && sc.bat.enabled && res.batProfile) el.appendChild(_buildBatSection(res, sc));
}

function _panBat() {
  if (!_batState) return;
  var allTs = _batState.allTs, batProfile = _batState.batProfile;
  var socProfile = _batState.socProfile, socMin = _batState.socMin, socMax = _batState.socMax;
  var total = allTs.length;
  var win = Math.max(4, Math.round(total * _batZoom));
  var panEl = document.getElementById('batPan'); if (!panEl) return;
  var pct = parseInt(panEl.value) / 100;
  var maxStart = total - win;
  var si = Math.min(Math.max(0, Math.round(pct * maxStart)), maxStart);
  var slTs = allTs.slice(si, si + win);
  var slBat = batProfile.slice(si, si + win);
  var slSoC = socProfile ? socProfile.slice(si, si + win) : [];
  var span = slTs.length > 1 ? new Date(slTs[slTs.length - 1]).getTime() - new Date(slTs[0]).getTime() : 86400000;
  var days = Math.round(win / 96);
  var lbl = win <= 96 ? win + ' kwartieren' : days <= 1 ? '1 dag' : days <= 14 ? days + ' dagen' : Math.round(days / 30.5) + ' mnd';
  var lblEl = document.getElementById('batZoomLbl'); if (lblEl) lblEl.textContent = lbl;
  var N = Math.min(slTs.length, 800), step = Math.max(1, Math.floor(slTs.length / N));
  var sTs = [], sBat = [], sSoC = [];
  for (var i = 0; i < slTs.length; i += step) {
    sTs.push(slTs[i]);
    sBat.push(slBat[i]);
    if (slSoC.length) sSoC.push(slSoC[i]);
  }
  dC('cBatYear');
  var canvas = document.getElementById('cBatYear'); if (!canvas) return;
  CH['cBatYear'] = new Chart(canvas, { type: 'line', data: { labels: sTs, datasets: [{
    label: 'Laden (+) / Ontladen (−) kW', data: sBat,
    segment: { borderColor: function (ctx) { return ctx.p0.parsed.y >= 0 ? '#3498db' : '#e67e22'; }, backgroundColor: function (ctx) { return ctx.p0.parsed.y >= 0 ? 'rgba(52,152,219,.08)' : 'rgba(230,126,34,.08)'; } },
    backgroundColor: 'transparent', fill: true, tension: 0, pointRadius: 0, borderWidth: 1.5
  }]}, options: { responsive: true, maintainAspectRatio: false, animation: false,
    plugins: { legend: { labels: { color: '#888', font: { family: 'Barlow', size: 11 }, boxWidth: 10 } } },
    scales: {
      x: { ticks: { color: '#999', font: { family: 'Barlow', size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10,
        callback: function (value) { var ts = this.getLabelForValue(value); return ts ? _jFormatTick(ts, span) : null; }
      }, grid: { color: '#f3f7f4' } },
      y: Object.assign(ax('kW'), { grid: { color: function (ctx) { return ctx.tick.value === 0 ? '#242b38' : '#f3f7f4'; }, lineWidth: function (ctx) { return ctx.tick.value === 0 ? 2 : 0.5; } } })
    }
  }});
  if (!sSoC.length) return;
  dC('cBatSoC');
  var socCanvas = document.getElementById('cBatSoC'); if (!socCanvas) return;
  CH['cBatSoC'] = new Chart(socCanvas, { type: 'line', data: { labels: sTs, datasets: [
    { label: 'SoC (%)', data: sSoC.map(function (v) { return +v.toFixed(1); }), borderColor: '#46962b', backgroundColor: 'rgba(70,150,43,.1)', fill: true, tension: 0, pointRadius: 0, borderWidth: 1.5 },
    { label: 'Min ' + socMin + '%', data: new Array(sTs.length).fill(socMin), borderColor: '#e74c3c', borderDash: [4, 3], pointRadius: 0, fill: false, borderWidth: 1 },
    { label: 'Max ' + socMax + '%', data: new Array(sTs.length).fill(socMax), borderColor: '#3498db', borderDash: [4, 3], pointRadius: 0, fill: false, borderWidth: 1 }
  ]}, options: { responsive: true, maintainAspectRatio: false, animation: false,
    plugins: { legend: { labels: { color: '#888', font: { family: 'Barlow', size: 11 }, boxWidth: 10 } } },
    scales: {
      x: { ticks: { color: '#999', font: { family: 'Barlow', size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10,
        callback: function (value) { var ts = this.getLabelForValue(value); return ts ? _jFormatTick(ts, span) : null; }
      }, grid: { color: '#f3f7f4' } },
      y: Object.assign(ax('SoC (%)'), { min: 0, max: 100 })
    }
  }});
}

function _buildPVSection(res, sc) {
  var log = res.solarLog;
  var allTs = _optim.allTs;
  var pvPos = res.solar_kw.map(function (v) { return Math.max(0, -v); });
  var totalMwh = (log.totalEnergy / 1000).toFixed(2);
  var flh = Math.round(log.fullLoadHours);
  var avgMonth = (log.totalEnergy / 12 / 1000).toFixed(2);

  var div = document.createElement('div');
  div.innerHTML = '<div class="cd" style="border-color:#f5c89a">' +
    '<div class="ct2"><div class="ac" style="background:#e67e22"></div>☀ PV-opwekanalyse — ' + sc.name + '</div>' +
    '<div class="kg">' +
    '<div class="kb org"><div class="kl">Jaaropbrengst</div><div class="kv">' + totalMwh + '</div><div class="ku">MWh/jaar</div></div>' +
    '<div class="kb org"><div class="kl">Vollasturen</div><div class="kv">' + flh + '</div><div class="ku">uur/kWp</div></div>' +
    '<div class="kb org"><div class="kl">Gem. maandopbrengst</div><div class="kv">' + avgMonth + '</div><div class="ku">MWh/maand</div></div>' +
    '</div>' +
    '<div class="ct2" style="font-size:11px;margin-top:10px">Jaarprofiel opwek (kW) vs. groepsafname</div>' +
    '<div class="cw" style="height:220px"><canvas id="cPVYear"></canvas></div>' +
    '<div class="ct2" style="font-size:11px;margin-top:14px">Maandelijkse opbrengst (kWh)</div>' +
    '<div class="cw" style="height:170px"><canvas id="cPVMonth"></canvas></div>' +
    '<div class="ct2" style="font-size:11px;margin-top:14px">Gemiddeld weekprofiel per seizoen (kW) — gelijktijdigheid PV &amp; groepsafname</div>' +
    '<div class="cw" style="height:220px"><canvas id="cPVWeek"></canvas></div>' +
    (log.hasReturn ? '<div class="opt-warn" style="margin-top:8px">⚠ Het basisprofiel bevat al teruglevering. Controleer of de gemeten data al PV-productie bevat om dubbeltellingen te voorkomen.</div>' : '') +
    '</div>';

  setTimeout(function () {
    _drawPVYear(allTs, pvPos, _optim.baseKw);
    _drawPVMonth(log.monthEnergy);
    _drawPVWeek(allTs, pvPos, _optim.baseKw);
  }, 30);

  return div;
}

function _buildBatSection(res, sc) {
  var log = res.batLog;
  var allTs = _optim.allTs;
  var batProfile = res.batProfile;
  var socProfile = res.socProfile;
  var totalLoaded = 0, totalUnloaded = 0;
  batProfile.forEach(function (v) { if (v > 0) totalLoaded += v * 0.25; else totalUnloaded += (-v) * 0.25; });
  var stratNames = { peakshaving: 'Peak shaving (symmetrisch, met cycluslimiet)', onafhankelijkheid: 'Onafhankelijkheid / Zon PV', autarkie: 'Onafhankelijkheid / Zon PV', maxsolar: 'Onafhankelijkheid / Zon PV' };

  var div = document.createElement('div');
  div.innerHTML = '<div class="cd" style="border-color:#f5c89a;margin-top:12px">' +
    '<div class="ct2"><div class="ac" style="background:#e67e22"></div>⚡ Batterijanalyse — ' + sc.name + '</div>' +
    '<div class="opt-note">Strategie: <strong>' + (stratNames[log.strategy] || log.strategy) + '</strong></div>' +
    '<div class="kg">' +
    '<div class="kb org"><div class="kl">Cycli/jaar (est.)</div><div class="kv">' + Math.round(log.estCycles) + '</div><div class="ku">cyclus = vol laden + ontladen</div></div>' +
    '<div class="kb org"><div class="kl">Totaal geladen</div><div class="kv">' + (totalLoaded / 1000).toFixed(1) + '</div><div class="ku">MWh/jaar</div></div>' +
    '<div class="kb org"><div class="kl">Totaal ontladen</div><div class="kv">' + (totalUnloaded / 1000).toFixed(1) + '</div><div class="ku">MWh/jaar</div></div>' +
    '</div>' +
    (log.strategy === 'peakshaving' ? '<div class="opt-warn">ℹ Peak shaving gebruikt <em>perfecte voorkennis</em> van het volledige profiel — een theoretische bovengrens. Praktische BMS-sturing zit 10–30% lager door voorspelfouten.</div>' : '') +
    '<div class="ct2" style="font-size:11px;margin-top:10px">Laad/ontlaadgedrag over het jaar (kW)</div>' +
    '<div style="display:flex;justify-content:flex-end;align-items:center;margin-bottom:4px">' +
    '<div style="display:flex;gap:4px">' +
    '<button class="b" id="batZoomIn" style="padding:3px 7px;font-size:10px">+ In</button>' +
    '<button class="b" id="batZoomOut" style="padding:3px 7px;font-size:10px;background:#888">- Uit</button>' +
    '<button class="b dk" id="batZoomReset" style="padding:3px 7px;font-size:10px">Reset</button>' +
    '</div></div>' +
    '<div style="display:flex;gap:7px;align-items:center;margin-bottom:6px">' +
    '<span style="font-size:10px;color:#888;white-space:nowrap">Venster:</span>' +
    '<input type="range" id="batPan" min="0" max="100" value="0" step="1" style="flex:1">' +
    '<span style="font-size:10px;color:#888;min-width:70px;text-align:right" id="batZoomLbl">Volledig</span>' +
    '</div>' +
    '<div class="cw" style="height:200px"><canvas id="cBatYear"></canvas></div>' +
    '<div class="ct2" style="font-size:11px;margin-top:14px">SoC-verloop (%)</div>' +
    '<div class="cw" style="height:160px"><canvas id="cBatSoC"></canvas></div>' +
    '<div class="ct2" style="font-size:11px;margin-top:14px">Cyclus-activiteit per dag</div>' +
    '<div id="cBatHeatmap" style="margin-top:4px;overflow-x:auto"></div>' +
    '</div>';

  setTimeout(function () {
    _batState = { allTs: allTs, batProfile: batProfile, socProfile: socProfile, socMin: log.socMin, socMax: log.socMax };
    _batZoom = 1;
    document.getElementById('batPan').value = 0;
    _panBat();
    document.getElementById('batZoomIn').addEventListener('click', function () { _batZoom = Math.max(0.03, _batZoom * 0.5); _panBat(); });
    document.getElementById('batZoomOut').addEventListener('click', function () { _batZoom = Math.min(1, _batZoom * 2); _panBat(); });
    document.getElementById('batZoomReset').addEventListener('click', function () { _batZoom = 1; document.getElementById('batPan').value = 0; _panBat(); });
    document.getElementById('batPan').addEventListener('input', _panBat);
    _drawCycleHeatmap(allTs, batProfile, log.cap);
  }, 30);

  return div;
}

// ─── PV grafieken ────────────────────────────────────────────────────────────

function _drawPVYear(allTs, pvPos, baseKw) {
  var canvas = document.getElementById('cPVYear'); if (!canvas) return;
  var N = Math.min(500, allTs.length), step = allTs.length / N;
  var labels = [], pvData = [], baseData = [];
  for (var i = 0; i < N; i++) {
    var idx = Math.round(i * step);
    labels.push(allTs[idx] ? allTs[idx].slice(5, 10) : '');
    pvData.push(+(pvPos[idx] || 0).toFixed(1));
    baseData.push(+(Math.max(0, baseKw[idx] || 0)).toFixed(1));
  }
  CH['cPVYear'] = new Chart(canvas, {
    type: 'line',
    data: { labels: labels, datasets: [
      { label: 'Groepsafname basis (kW)', data: baseData, borderColor: 'rgba(150,150,150,.4)', fill: false, tension: 0, pointRadius: 0, borderWidth: 1 },
      { label: 'PV opwek (kW)', data: pvData, borderColor: '#e67e22', backgroundColor: 'rgba(230,126,34,.15)', fill: true, tension: 0, pointRadius: 0, borderWidth: 1.5 }
    ]},
    options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: '#888', font: { family: 'Barlow', size: 11 }, boxWidth: 10 } } }, scales: { x: Object.assign(ax(), { ticks: { maxTicksLimit: 12 } }), y: ax('kW') } }
  });
}

function _drawPVMonth(monthEnergy) {
  var canvas = document.getElementById('cPVMonth'); if (!canvas) return;
  CH['cPVMonth'] = new Chart(canvas, {
    type: 'bar',
    data: { labels: MND, datasets: [{ label: 'Opbrengst (kWh)', data: monthEnergy.map(function (v) { return Math.round(v); }), backgroundColor: 'rgba(230,126,34,.7)', borderColor: '#e67e22', borderWidth: 1, borderRadius: 3 }] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, scales: { x: Object.assign(ax(), { grid: { display: false } }), y: ax('kWh') } }
  });
}

function _drawPVWeek(allTs, pvPos, baseKw) {
  var canvas = document.getElementById('cPVWeek'); if (!canvas) return;
  var pvS = weekProfileBySeason(allTs, pvPos);
  var days = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
  var wkLbl = [];
  for (var d = 0; d < 7; d++) for (var q = 0; q < 96; q++) wkLbl.push(q === 0 ? days[d] : '');

  var SCOLS = { win: '#3498db', spr: '#2ecc71', sum: '#e67e22', aut: '#9b59b6' };
  var SNMS = { win: 'Winter (dec–feb)', spr: 'Lente (mrt–mei)', sum: 'Zomer (jun–aug)', aut: 'Najaar (sep–nov)' };

  var baseS = weekProfileBySeason(allTs, baseKw.map(function (v) { return Math.max(0, v); }));
  var avgBase = baseS.win.map(function (v, i) { return (baseS.win[i] + baseS.spr[i] + baseS.sum[i] + baseS.aut[i]) / 4; });

  var datasets = [{ label: 'Groepsafname gem. (kW)', data: avgBase.map(function (v) { return +v.toFixed(1); }), borderColor: 'rgba(150,150,150,.5)', borderDash: [4, 4], fill: false, tension: 0.3, pointRadius: 0, borderWidth: 1 }];
  ['win', 'spr', 'sum', 'aut'].forEach(function (s) {
    datasets.push({ label: SNMS[s] + ' PV', data: pvS[s].map(function (v) { return +v.toFixed(1); }), borderColor: SCOLS[s], fill: false, tension: 0.3, pointRadius: 0, borderWidth: 1.5 });
  });

  CH['cPVWeek'] = new Chart(canvas, {
    type: 'line', data: { labels: wkLbl, datasets: datasets },
    options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: '#888', font: { family: 'Barlow', size: 11 }, boxWidth: 10 } } }, scales: { x: Object.assign(ax(), { ticks: { maxTicksLimit: 15 } }), y: ax('kW') } }
  });
}

// ─── Batterij grafieken ──────────────────────────────────────────────────────

function _drawBatYear(allTs, batProfile) {
  var canvas = document.getElementById('cBatYear'); if (!canvas) return;
  var N = Math.min(500, allTs.length), step = allTs.length / N;
  var labels = [], loadD = [], unloadD = [];
  for (var i = 0; i < N; i++) {
    var idx = Math.round(i * step);
    labels.push(allTs[idx] ? allTs[idx].slice(5, 10) : '');
    var bp = batProfile[idx] || 0;
    loadD.push(+(Math.max(0, bp)).toFixed(1));
    unloadD.push(+(Math.min(0, bp)).toFixed(1));
  }
  CH['cBatYear'] = new Chart(canvas, {
    type: 'line',
    data: { labels: labels, datasets: [
      { label: 'Laden (kW)', data: loadD, borderColor: '#46962b', backgroundColor: 'rgba(70,150,43,.15)', fill: true, tension: 0, pointRadius: 0, borderWidth: 1.2 },
      { label: 'Ontladen (kW)', data: unloadD, borderColor: '#c0392b', backgroundColor: 'rgba(192,57,43,.15)', fill: true, tension: 0, pointRadius: 0, borderWidth: 1.2 }
    ]},
    options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: '#888', font: { family: 'Barlow', size: 11 }, boxWidth: 10 } } }, scales: { x: Object.assign(ax(), { ticks: { maxTicksLimit: 12 } }), y: ax('kW') } }
  });
}

function _drawBatWeek(allTs, batProfile) {
  var canvas = document.getElementById('cBatWeek'); if (!canvas) return;
  var loadS = weekProfileBySeason(allTs, batProfile.map(function (v) { return Math.max(0, v); }));
  var unloadS = weekProfileBySeason(allTs, batProfile.map(function (v) { return Math.min(0, v); }));
  var days = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
  var wkLbl = [];
  for (var d = 0; d < 7; d++) for (var q = 0; q < 96; q++) wkLbl.push(q === 0 ? days[d] : '');

  var SCOLS = { win: '#3498db', spr: '#2ecc71', sum: '#e67e22', aut: '#9b59b6' };
  var SNMS = { win: 'Winter', spr: 'Lente', sum: 'Zomer', aut: 'Najaar' };
  var datasets = [];
  ['win', 'spr', 'sum', 'aut'].forEach(function (s) {
    datasets.push({ label: SNMS[s] + ' laden', data: loadS[s].map(function (v) { return +v.toFixed(2); }), borderColor: SCOLS[s], fill: false, tension: 0.3, pointRadius: 0, borderWidth: 1.5 });
    datasets.push({ label: SNMS[s] + ' ontladen', data: unloadS[s].map(function (v) { return +v.toFixed(2); }), borderColor: SCOLS[s], borderDash: [4, 4], fill: false, tension: 0.3, pointRadius: 0, borderWidth: 1.2 });
  });

  CH['cBatWeek'] = new Chart(canvas, {
    type: 'line', data: { labels: wkLbl, datasets: datasets },
    options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: '#888', font: { family: 'Barlow', size: 11 }, boxWidth: 10 } } }, scales: { x: Object.assign(ax(), { ticks: { maxTicksLimit: 15 } }), y: ax('kW') } }
  });
}

function _drawBatSoC(allTs, socProfile, socMin, socMax) {
  var canvas = document.getElementById('cBatSoC'); if (!canvas) return;
  var seasons = weekProfileBySeason(allTs, socProfile);
  var days = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
  var wkLbl = [];
  for (var d = 0; d < 7; d++) for (var q = 0; q < 96; q++) wkLbl.push(q === 0 ? days[d] : '');

  var SCOLS = { win: '#3498db', spr: '#2ecc71', sum: '#e67e22', aut: '#9b59b6' };
  var SNMS = { win: 'Winter', spr: 'Lente', sum: 'Zomer', aut: 'Najaar' };
  var datasets = [];
  ['win', 'spr', 'sum', 'aut'].forEach(function (s) {
    datasets.push({ label: SNMS[s], data: seasons[s].map(function (v) { return +v.toFixed(1); }), borderColor: SCOLS[s], fill: false, tension: 0.3, pointRadius: 0, borderWidth: 1.5 });
  });
  datasets.push({ label: 'Min SoC (' + socMin + '%)', data: new Array(672).fill(socMin), borderColor: '#ddd', borderDash: [4, 4], pointRadius: 0, fill: false, borderWidth: 1 });
  datasets.push({ label: 'Max SoC (' + socMax + '%)', data: new Array(672).fill(socMax), borderColor: '#ddd', borderDash: [4, 4], pointRadius: 0, fill: false, borderWidth: 1 });

  CH['cBatSoC'] = new Chart(canvas, {
    type: 'line', data: { labels: wkLbl, datasets: datasets },
    options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: '#888', font: { family: 'Barlow', size: 11 }, boxWidth: 10 } } }, scales: { x: Object.assign(ax(), { ticks: { maxTicksLimit: 15 } }), y: Object.assign(ax('SoC (%)'), { min: 0, max: 100 }) } }
  });
}

function _drawBatMonth(allTs, batProfile) {
  var canvas = document.getElementById('cBatMonth'); if (!canvas) return;
  var mndSet = {};
  allTs.forEach(function (ts) { mndSet[ts.slice(0, 7)] = 1; });
  var mnds = Object.keys(mndSet).sort();
  var mLbl = mnds.map(function (m) { return mndLabel(mnds, m); });
  var mIdx = {};
  mnds.forEach(function (m, i) { mIdx[m] = i; });
  var loaded = new Array(mnds.length).fill(0), unloaded = new Array(mnds.length).fill(0);
  allTs.forEach(function (ts, i) {
    var idx = mIdx[ts.slice(0, 7)];
    if (idx === undefined) return;
    var bp = batProfile[i] || 0;
    if (bp > 0) loaded[idx] += bp * 0.25;
    else unloaded[idx] += (-bp) * 0.25;
  });

  CH['cBatMonth'] = new Chart(canvas, {
    type: 'bar',
    data: { labels: mLbl, datasets: [
      { label: 'Geladen (kWh)', data: loaded.map(Math.round), backgroundColor: 'rgba(70,150,43,.7)', borderColor: '#46962b', borderWidth: 1, borderRadius: 3 },
      { label: 'Ontladen (kWh)', data: unloaded.map(Math.round), backgroundColor: 'rgba(192,57,43,.65)', borderColor: '#c0392b', borderWidth: 1, borderRadius: 3 }
    ]},
    options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: '#888', font: { family: 'Barlow', size: 11 }, boxWidth: 10 } } }, scales: { x: Object.assign(ax(), { grid: { display: false } }), y: ax('kWh') } }
  });
}

function _drawCycleHeatmap(allTs, batProfile, batCap) {
  var container = document.getElementById('cBatHeatmap');
  if (!container || !allTs.length) return;

  // Bereken dagelijks geladen kWh per dag
  var daily = {};
  allTs.forEach(function (ts, i) {
    var d = ts.slice(0, 10);
    var bp = batProfile[i] || 0;
    if (bp > 0) daily[d] = (daily[d] || 0) + bp * 0.25;
  });

  var startStr = allTs[0].slice(0, 10);
  var endStr = allTs[allTs.length - 1].slice(0, 10);
  var startDate = new Date(startStr + 'T00:00:00');
  var endDate = new Date(endStr + 'T00:00:00');

  // Begin op de maandag van de startweek
  var startDow = (startDate.getDay() + 6) % 7; // 0=Ma, 6=Zo
  var gridStart = new Date(startDate.getTime() - startDow * 86400000);
  var totalDays = Math.round((endDate.getTime() - gridStart.getTime()) / 86400000) + 1;
  var nWeeks = Math.ceil(totalDays / 7);
  var cap = batCap || 1;

  function cellColor(frac) {
    if (frac <= 0)    return '#eee';
    if (frac <= 0.25) return 'rgba(230,126,34,.25)';
    if (frac <= 0.5)  return 'rgba(230,126,34,.50)';
    if (frac <= 0.75) return 'rgba(230,126,34,.75)';
    return '#e67e22';
  }

  var DAYS_NL = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

  // Maandlabels: donderdag van de week bepaalt de maand (ISO-conventie)
  var monthLbls = new Array(nWeeks).fill('');
  var prevMonth = -1;
  for (var w = 0; w < nWeeks; w++) {
    var thu = new Date(gridStart.getTime() + (w * 7 + 3) * 86400000);
    if (thu.getMonth() !== prevMonth) {
      monthLbls[w] = MND[thu.getMonth()];
      prevMonth = thu.getMonth();
    }
  }

  var html = '<div style="display:inline-flex;flex-direction:column;gap:2px;font-family:Barlow,sans-serif">';

  // Maandlabels rij
  html += '<div style="display:flex;padding-left:26px;gap:2px">';
  for (var w = 0; w < nWeeks; w++) {
    html += '<div style="width:9px;font-size:9px;color:#888;overflow:visible;white-space:nowrap">' + (monthLbls[w] || '') + '</div>';
  }
  html += '</div>';

  // Dag-rijen
  for (var d = 0; d < 7; d++) {
    html += '<div style="display:flex;align-items:center;gap:2px">';
    html += '<div style="width:22px;font-size:9px;color:#888;text-align:right;flex-shrink:0">' + DAYS_NL[d] + '</div>';
    for (var w = 0; w < nWeeks; w++) {
      var cellDate = new Date(gridStart.getTime() + (w * 7 + d) * 86400000);
      var cellStr = cellDate.toISOString().slice(0, 10);
      var inRange = cellDate >= startDate && cellDate <= endDate;
      var frac = inRange ? ((daily[cellStr] || 0) / cap) : -1;
      var color = inRange ? cellColor(frac) : '#f8f8f8';
      var tip = inRange ? (DAYS_NL[d] + ' ' + cellStr + ': ' + (frac > 0 ? frac.toFixed(2) : '0') + ' cycli') : '';
      html += '<div style="width:9px;height:9px;background:' + color + ';border-radius:2px;flex-shrink:0" title="' + tip + '"></div>';
    }
    html += '</div>';
  }
  html += '</div>';

  // Legenda
  html += '<div style="display:flex;align-items:center;gap:5px;margin-top:5px;font-size:9px;color:#888;padding-left:26px">';
  html += '<span>Minder</span>';
  ['#eee', 'rgba(230,126,34,.25)', 'rgba(230,126,34,.50)', 'rgba(230,126,34,.75)', '#e67e22'].forEach(function (c) {
    html += '<div style="width:9px;height:9px;background:' + c + ';border-radius:2px;flex-shrink:0"></div>';
  });
  html += '<span>Meer &nbsp;(cycli/dag, 1 = vol geladen)</span>';
  html += '</div>';

  container.innerHTML = html;
}

// ─── Hulpfuncties ────────────────────────────────────────────────────────────

function _findScen(id) {
  var p = ap();
  if (!p || !p.scenarios) return null;
  for (var i = 0; i < p.scenarios.length; i++) { if (p.scenarios[i].id === id) return p.scenarios[i]; }
  return null;
}
