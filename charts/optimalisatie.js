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

  html += '<div class="ci ' + (active === 'basis' ? 's' : '') + '">' +
    '<div class="cn"><div class="sck ' + (active === 'basis' ? 'on' : '') + '" data-scen-id="basis"></div>Basis</div>' +
    '<div class="cm">Gemeten groepsprofiel</div></div>';

  scens.forEach(function (sc) {
    var isActive = active === sc.id;
    var tags = [];
    if (sc.solar && sc.solar.enabled) tags.push('☀ ' + sc.solar.kWp + ' kWp');
    if (sc.bat && sc.bat.enabled) tags.push('⚡ ' + sc.bat.cap + ' kWh');
    html += '<div class="ci ' + (isActive ? 's' : '') + '">' +
      '<div class="cn"><div class="sck ' + (isActive ? 'on' : '') + '" data-scen-id="' + sc.id + '"></div>' +
      '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + sc.name + '</span>' +
      '<button style="background:none;border:none;cursor:pointer;font-size:12px;color:#888;padding:0 3px;flex-shrink:0" data-scen-edit="' + sc.id + '" title="Bewerken">✎</button>' +
      '<button style="background:none;border:none;cursor:pointer;font-size:12px;color:#c0392b;padding:0 3px;flex-shrink:0" data-scen-del="' + sc.id + '" title="Verwijderen">✕</button>' +
      '</div>' +
      (tags.length ? '<div class="cm">' + tags.join(' · ') + '</div>' : '') +
      '</div>';
  });

  document.getElementById('scenList').innerHTML = html;
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function openAddScen() {
  _editScenId = null;
  document.getElementById('sName').value = '';
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
    var r = document.querySelector('input[name="sBatStrat"][value="' + (sc.bat.strategy || 'peakshaving') + '"]');
    if (r) r.checked = true;
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
  if (!hasSolar && !hasBat) { notify('Activeer minimaal één asset', false); return; }

  var sc = {
    id: _editScenId || uid(),
    name: name,
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
      strategy: (document.querySelector('input[name="sBatStrat"]:checked') || {}).value || 'peakshaving'
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

  var banner = document.getElementById('scenBanner');
  if (id === 'basis') {
    banner.style.display = 'none';
    if (_optim.baseKw.length) redrawChartsForScenario(_optim.baseKw);
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

  redrawChartsForScenario(res.grpKw);
  renderComparison();
}

function redrawChartsForScenario(scenGrpKw) {
  if (!_optim.allTs.length) return;
  var allTs = _optim.allTs, perKw = _optim.perKw, withData = _optim.withData;
  var gtvA = _optim.gtvA, gtvT = _optim.gtvT;
  var gA = scenGrpKw.map(function (v) { return Math.max(0, v); });
  var gT = scenGrpKw.map(function (v) { return Math.max(0, -v); });
  try { drawJaar(allTs, perKw, scenGrpKw, withData, gtvA, gtvT); } catch (e) { console.error('drawJaar scen:', e); }
  try { drawWeek(allTs, scenGrpKw, perKw, withData, gtvA, gtvT); } catch (e) { console.error('drawWeek scen:', e); }
  try { drawBDK(perKw, gA, gT, withData, gtvA, gtvT); } catch (e) { console.error('drawBDK scen:', e); }
  try { drawOvsch(allTs, gA, gT, gtvA, gtvT); } catch (e) { console.error('drawOvsch scen:', e); }
  try { drawPiek(allTs, perKw, scenGrpKw, withData); } catch (e) { console.error('drawPiek scen:', e); }
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
    redrawChartsForScenario(_optim.scenResults[_optim.activeScenId].grpKw);
    document.getElementById('scenBanner').style.display = '';
  }
  renderComparison();
}

// ─── Scenarioberekening ──────────────────────────────────────────────────────

function calcScenario(sc) {
  var grpKw = _optim.baseKw.slice();
  var solar_kw = null, solarLog = null, batProfile = null, socProfile = null, batLog = null;

  if (sc.solar && sc.solar.enabled) {
    var sRes = calcSolar(sc.solar);
    solar_kw = sRes.kw;
    solarLog = sRes.log;
    for (var i = 0; i < grpKw.length; i++) grpKw[i] += solar_kw[i];
  }

  if (sc.bat && sc.bat.enabled) {
    var bRes = calcBattery(grpKw, solar_kw, sc.bat);
    grpKw = bRes.kw;
    batProfile = bRes.batProfile;
    socProfile = bRes.socProfile;
    batLog = bRes.log;
  }

  var allTs = _optim.allTs;
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
    grpKw: grpKw, solar_kw: solar_kw, batProfile: batProfile, socProfile: socProfile,
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
    var power = kWp * cosTheta * SOLAR_MF[mo] * pr;
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

function calcBattery(baseKw, solar_kw, p) {
  var cap = p.cap, pMax = p.pMax;
  var etaC = (p.etaC || 95) / 100, etaD = (p.etaD || 95) / 100;
  var socMin = (p.socMin || 10) / 100 * cap, socMax = (p.socMax || 90) / 100 * cap;
  var strategy = p.strategy || 'peakshaving';
  var r;

  if (strategy === 'peakshaving') r = simPeakShaving(baseKw, cap, pMax, etaC, etaD, socMin, socMax);
  else if (strategy === 'autarkie') r = simAutarkie(baseKw, cap, pMax, etaC, etaD, socMin, socMax);
  else if (strategy === 'maxsolar') r = simMaxSolar(baseKw, solar_kw || new Array(baseKw.length).fill(0), cap, pMax, etaC, etaD, socMin, socMax);
  else { r = { kw: baseKw.slice(), batProfile: new Array(baseKw.length).fill(0), socProfile: new Array(baseKw.length).fill(50), monthLog: [], totalEnergyThrough: 0 }; }

  var estCycles = cap > 0 ? r.totalEnergyThrough / cap / 2 : 0;
  return {
    kw: r.kw, batProfile: r.batProfile, socProfile: r.socProfile,
    log: { cap: cap, pMax: pMax, etaC: p.etaC, etaD: p.etaD, socMin: p.socMin, socMax: p.socMax, strategy: strategy, monthLog: r.monthLog, estCycles: estCycles, totalEnergyThrough: r.totalEnergyThrough }
  };
}

// Strategie A — Peak shaving: offline binaire zoekopdracht per maand
function simPeakShaving(baseKw, cap, pMax, etaC, etaD, socMin, socMax) {
  var monthMap = {};
  _optim.allTs.forEach(function (ts, i) { var mn = ts.slice(0, 7); if (!monthMap[mn]) monthMap[mn] = []; monthMap[mn].push(i); });
  var result = baseKw.slice(), batProfile = new Array(baseKw.length).fill(0), socProfile = new Array(baseKw.length).fill(0);
  var monthLog = [], totalEnergyThrough = 0;

  Object.keys(monthMap).sort().forEach(function (mn) {
    var idxs = monthMap[mn], profile = idxs.map(function (i) { return baseKw[i]; });
    var origPeak = Math.max.apply(null, profile.map(function (v) { return Math.max(0, v); }));
    var lo = Math.min.apply(null, profile), hi = origPeak, pStar = hi;
    for (var iter = 0; iter < 22; iter++) {
      var mid = (lo + hi) / 2;
      var sim = _fwdPass(profile, mid, cap, pMax, etaC, etaD, socMin, socMax);
      if (sim.feasible) { hi = mid; pStar = mid; } else lo = mid;
    }
    var fs = _fwdPass(profile, pStar, cap, pMax, etaC, etaD, socMin, socMax);
    idxs.forEach(function (gi, li) { result[gi] = fs.kw[li]; batProfile[gi] = fs.bp[li]; socProfile[gi] = fs.soc[li] / cap * 100; });
    totalEnergyThrough += fs.energyThrough;
    monthLog.push({ month: mn, threshold: pStar, origPeak: origPeak, newPeak: Math.max.apply(null, fs.kw.map(function (v) { return Math.max(0, v); })), energyThrough: fs.energyThrough });
  });

  return { kw: result, batProfile: batProfile, socProfile: socProfile, monthLog: monthLog, totalEnergyThrough: totalEnergyThrough };
}

// Strategie B — Maximale autarkie: greedy forward pass
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

  var stratNames = { peakshaving: 'Peak shaving', autarkie: 'Autarkie', maxsolar: 'Max. zon' };

  // Tabel header
  var thead = '<thead><tr><th>Metric</th><th>Basis</th>';
  scens.forEach(function (sc) { thead += '<th class="scen-h">' + sc.name + '</th>'; });
  thead += '</tr></thead>';

  // Rijen
  var metrics = [
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

  renderAssetAnalysis(_optim.activeScenId);
}

// ─── Asset analyse ───────────────────────────────────────────────────────────

function renderAssetAnalysis(scenId) {
  ['cPVYear', 'cPVMonth', 'cPVWeek', 'cBatYear', 'cBatWeek', 'cBatSoC', 'cBatMonth'].forEach(function (id) { dC(id); });
  var el = document.getElementById('vergAssets');
  el.innerHTML = '';
  if (!scenId || scenId === 'basis') return;
  var res = _optim.scenResults[scenId];
  if (!res) return;
  var sc = _findScen(scenId);
  if (!sc) return;

  if (sc.solar && sc.solar.enabled && res.solar_kw) el.appendChild(_buildPVSection(res, sc));
  if (sc.bat && sc.bat.enabled && res.batProfile) el.appendChild(_buildBatSection(res, sc));
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
  var stratNames = { peakshaving: 'Peak shaving (offline optimaal per maand)', autarkie: 'Maximale autarkie', maxsolar: 'Maximaal zonneverbruik' };

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
    '<div class="cw" style="height:200px"><canvas id="cBatYear"></canvas></div>' +
    '<div class="ct2" style="font-size:11px;margin-top:14px">Gemiddeld weekprofiel laden/ontladen per seizoen (kW)</div>' +
    '<div class="cw" style="height:200px"><canvas id="cBatWeek"></canvas></div>' +
    '<div class="ct2" style="font-size:11px;margin-top:14px">SoC-verloop — gemiddeld weekprofiel per seizoen (%)</div>' +
    '<div class="cw" style="height:180px"><canvas id="cBatSoC"></canvas></div>' +
    '<div class="ct2" style="font-size:11px;margin-top:14px">Maandelijkse energiedoorvoer (kWh)</div>' +
    '<div class="cw" style="height:180px"><canvas id="cBatMonth"></canvas></div>' +
    '</div>';

  setTimeout(function () {
    _drawBatYear(allTs, batProfile);
    _drawBatWeek(allTs, batProfile);
    _drawBatSoC(allTs, socProfile, log.socMin, log.socMax);
    _drawBatMonth(allTs, batProfile);
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

// ─── Hulpfuncties ────────────────────────────────────────────────────────────

function _findScen(id) {
  var p = ap();
  if (!p || !p.scenarios) return null;
  for (var i = 0; i < p.scenarios.length; i++) { if (p.scenarios[i].id === id) return p.scenarios[i]; }
  return null;
}
