/* EnergieModel — rekenkern geporteerd vanuit EnergieModel_v72 (2026-05-28)
   Namespace: window.EnergieModel — geen ES-modules, global scope net als rest van de app.
   Kolomnamen, parameterkeys en formules zijn 1-op-1 uit de Python-EXE gehaald.
*/
(function (global) {
  'use strict';

  // ─── Kolomnamen pool (subset numeriek, voor validatie) ──────────────────────
  var MODEL_NUMERIC_COLS = [
    'totaal_verbruik_kWh','totaal_bruto_afname_kWh','afname_invoeden_kWh',
    'totaal_opwek_kWh','opwek_zon_kWh','opwek_wind_kWh','opwek_afname_invoeden_kWh',
    'gelijktijdig_kWh','gelijktijdig_zon_kWh','gelijktijdig_wind_kWh',
    'gelijktijdig_afname_invoeden_kWh',
    'overschot_kWh','overschot_zon_kWh','overschot_wind_kWh',
    'tekort_kWh','epex_eur_per_kWh',
    'kosten_gelijktijdigheid_zon_EUR','kosten_gelijktijdigheid_wind_EUR',
    'kosten_gelijktijdigheid_afname_invoeden_EUR','kosten_gelijktijdigheid_totaal_EUR',
    'kosten_platform_EUR','kosten_gvo_bilateraal_EUR','kosten_gvo_rest_EUR',
    'kosten_epex_tekort_EUR','opbrengst_epex_overschot_EUR',
    'kosten_onbalans_totaal_EUR','kosten_totaal_EUR'
  ];

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /** Type-normalisatie conform spec sectie 2 */
  function normalizeType(value) {
    if (value == null) return 'onbekend';
    var v = String(value).toLowerCase().trim();
    if (!v) return 'onbekend';
    if (v === 'pv' || v === 'solar' || v === 'zonne' || v === 'zonopwek' || v === 'zon') return 'zon';
    if (v === 'windopwek' || v === 'windturbine' || v === 'wind') return 'wind';
    if (v === 'afname_invoeden' || v === 'invoeden' || v === 'afname-invoeden') return 'afname_invoeden';
    return v || 'onbekend';
  }

  function safeDiv(n, d) {
    if (!d || !isFinite(d)) return 0;
    return n / d;
  }

  function eurPerMwhToKwh(x) { return x / 1000; }

  /** Bouw een tijdsleutel "YYYY-MM-DDTHH:MM" die als join-sleutel dient */
  function _tsKey(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '';
    var y  = date.getFullYear();
    var mo = String(date.getMonth() + 1).padStart(2, '0');
    var d  = String(date.getDate()).padStart(2, '0');
    var h  = String(date.getHours()).padStart(2, '0');
    var mi = String(date.getMinutes()).padStart(2, '0');
    return y + '-' + mo + '-' + d + 'T' + h + ':' + mi;
  }

  function _parseTs(val) {
    if (!val && val !== 0) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    if (typeof val === 'number') {
      // Excel serial date: dagen sinds 1900-01-01 (inclusief leap-year bug)
      var ms = Math.round((val - 25569) * 86400000);
      var d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }
    var s = String(val).trim();
    if (!s) return null;
    // ISO of variant (met/zonder T, met/zonder seconden)
    var d2 = new Date(s);
    if (!isNaN(d2.getTime())) return d2;
    // DD-MM-YYYY HH:MM[:SS]
    var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0));
    return null;
  }

  function _findCol(header, synonyms) {
    for (var i = 0; i < header.length; i++) {
      var h = String(header[i] || '').trim().toLowerCase();
      for (var j = 0; j < synonyms.length; j++) {
        if (h === synonyms[j].toLowerCase()) return i;
      }
    }
    return -1;
  }

  function _firstSheet(wb) {
    return wb.Sheets[wb.SheetNames[0]];
  }

  function _sheetToRows(sheet) {
    return XLSX.utils.sheet_to_json(sheet, {header: 1, defval: ''});
  }

  function _median(arr) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  // ─── Parser: opwek.xlsx ─────────────────────────────────────────────────────

  function readOpwekExcel(wb) {
    var sheet = _firstSheet(wb);
    var rows  = _sheetToRows(sheet);
    if (!rows.length) return [];

    var TIME_SYNS  = ['Tijd (UTC)', 'Tijd', 'timestamp', 'datum'];
    var ASSET_SYNS = ['Asset', 'Naam', 'Name', 'Installatie'];
    var TYPE_SYNS  = ['Type', 'Energietype', 'Drager'];
    var PRIO_SYNS  = ['Prioriteit', 'Priority', 'Prio'];
    var KWH_SYNS   = ['opwek (kWh)', 'opwek_kWh', 'opwek', 'kWh', 'productie (kWh)',
                      'productie_kWh', 'productie', 'vermogen_kWh'];

    var header0 = rows[0].map(function (v) { return String(v || '').trim(); });
    var tidx    = _findCol(header0, TIME_SYNS);
    var aidx    = _findCol(header0, ASSET_SYNS);

    // ── Long format (kolom Asset aanwezig) ──
    if (aidx >= 0) {
      var typeidx = _findCol(header0, TYPE_SYNS);
      var prioidx = _findCol(header0, PRIO_SYNS);
      var kwhidx  = _findCol(header0, KWH_SYNS);
      if (kwhidx < 0) {
        // Eerste numerieke kolom die niet tijd/asset/type/prio is
        for (var ci = header0.length - 1; ci >= 0; ci--) {
          if (ci !== tidx && ci !== aidx && ci !== typeidx && ci !== prioidx) { kwhidx = ci; break; }
        }
      }
      var out = [];
      for (var r = 1; r < rows.length; r++) {
        var row = rows[r];
        var ts  = _parseTs(tidx >= 0 ? row[tidx] : row[0]);
        if (!ts) continue;
        var kwh = parseFloat(row[kwhidx]);
        if (isNaN(kwh)) continue;
        var typeRaw = String(typeidx >= 0 ? row[typeidx] : '').trim();
        var prioRaw = prioidx >= 0 ? row[prioidx] : '';
        var prio    = parseFloat(prioRaw);
        out.push({
          'Tijd (UTC)': ts,
          tijdKey: _tsKey(ts),
          Asset: String(row[aidx] || '').trim(),
          Type: typeRaw,
          Type_norm: normalizeType(typeRaw),
          Prioriteit: isNaN(prio) ? 9999 : Math.round(prio),
          opwek_kWh: kwh,
          Gebruiker: ''
        });
      }
      return out;
    }

    // ── Multi-header breed (rij 2 = Type, rij 3 = Prioriteit) ──
    var isMulti = rows.length >= 4 && rows[1].slice(1).some(function (v) {
      var s = String(v || '').toLowerCase().trim();
      return s === 'zon' || s === 'wind' || s === 'windopwek' || s === 'pv' ||
             s === 'solar' || s === 'afname_invoeden' || s === 'overig';
    });

    if (isMulti) {
      var typeRow  = rows[1];
      var prioRow  = rows[2];
      var assets   = header0.slice(1);
      var typeNorm = typeRow.slice(1).map(function (v) { return normalizeType(v); });
      var prios    = prioRow.slice(1).map(function (v) {
        var n = parseFloat(v); return isNaN(n) ? 9999 : Math.round(n);
      });
      var out2 = [];
      for (var r2 = 3; r2 < rows.length; r2++) {
        var row2 = rows[r2];
        var ts2  = _parseTs(row2[0]);
        if (!ts2) continue;
        for (var c = 0; c < assets.length; c++) {
          var v2 = parseFloat(row2[c + 1]);
          if (isNaN(v2)) continue;
          out2.push({
            'Tijd (UTC)': ts2, tijdKey: _tsKey(ts2),
            Asset: String(assets[c] || '').trim(),
            Type: String(typeRow[c + 1] || '').trim(),
            Type_norm: typeNorm[c],
            Prioriteit: prios[c],
            opwek_kWh: v2, Gebruiker: ''
          });
        }
      }
      return out2;
    }

    // ── Breed standaard (eerste kolom = tijd, rest = assets) ──
    var assetCols = header0.slice(1);
    var out3 = [];
    for (var r3 = 1; r3 < rows.length; r3++) {
      var row3 = rows[r3];
      var ts3  = _parseTs(row3[0]);
      if (!ts3) continue;
      for (var c2 = 0; c2 < assetCols.length; c2++) {
        var v3 = parseFloat(row3[c2 + 1]);
        if (isNaN(v3)) continue;
        out3.push({
          'Tijd (UTC)': ts3, tijdKey: _tsKey(ts3),
          Asset: String(assetCols[c2] || '').trim(),
          Type: '', Type_norm: 'onbekend', Prioriteit: 9999,
          opwek_kWh: v3, Gebruiker: ''
        });
      }
    }
    return out3;
  }

  // ─── Parser: epex.xlsx ──────────────────────────────────────────────────────

  function readEpexExcel(wb) {
    var sheet = _firstSheet(wb);
    var rows  = _sheetToRows(sheet);
    if (rows.length < 2) return [];

    var header = rows[0].map(function (v) { return String(v || '').trim(); });
    var TIME_SYNS  = ['Tijd (UTC)', 'Tijd', 'timestamp', 'Datum', 'date', 'datetime'];
    var PRICE_SYNS = ['prijs_eur_per_kWh', 'prijs', 'epex', 'euro', 'price',
                      'prijs (eur/kwh)', 'prijs (eur/mwh)', 'EUR/MWh', 'EUR/kWh',
                      'Day-ahead Price [EUR/MWh]', 'Settlement Price'];

    var tidx = _findCol(header, TIME_SYNS);
    if (tidx < 0) tidx = 0;
    var pidx = _findCol(header, PRICE_SYNS);
    if (pidx < 0) {
      for (var i = 0; i < header.length; i++) {
        if (i !== tidx) { pidx = i; break; }
      }
    }

    var raw = [];
    for (var r = 1; r < rows.length; r++) {
      var ts    = _parseTs(rows[r][tidx]);
      var price = parseFloat(rows[r][pidx]);
      if (!ts || isNaN(price)) continue;
      raw.push({ts: ts, price: price});
    }
    if (!raw.length) return [];

    // Auto-detect EUR/MWh vs EUR/kWh via mediaan absolute waarde (≥1 → EUR/MWh)
    var med = _median(raw.map(function (x) { return Math.abs(x.price); }));
    if (med >= 1) raw.forEach(function (x) { x.price = x.price / 1000; });

    // Auto-detect uur vs kwartier (verschil opeenvolgende punten)
    var isHourly = false;
    if (raw.length >= 2) {
      var diff = Math.abs(raw[1].ts.getTime() - raw[0].ts.getTime());
      isHourly = diff >= 3500000 && diff <= 3700000; // ~1 uur
    }

    var out = [];
    if (isHourly) {
      for (var i2 = 0; i2 < raw.length; i2++) {
        for (var q = 0; q < 4; q++) {
          var qts = new Date(raw[i2].ts.getTime() + q * 15 * 60000);
          out.push({'Tijd (UTC)': qts, tijdKey: _tsKey(qts), epex_eur_per_kWh: raw[i2].price});
        }
      }
    } else {
      out = raw.map(function (x) {
        return {'Tijd (UTC)': x.ts, tijdKey: _tsKey(x.ts), epex_eur_per_kWh: x.price};
      });
    }
    return out;
  }

  // ─── Parser: Tarieven.xlsx ──────────────────────────────────────────────────

  function readTarievenExcel(wb) {
    var sheet = _firstSheet(wb);
    var rows  = _sheetToRows(sheet);
    if (rows.length < 2) return _emptyTarieven();

    var header = rows[0].map(function (v) { return String(v || '').trim().toLowerCase(); });
    var cidx = _findCol(header, ['component', 'kostenpost', 'tarieven', 'tarief']);
    var tidx = _findCol(header, ['type', 'categorie', 'drager']);
    var vidx = _findCol(header, ['waarde', 'prijs', 'tariefwaarde', 'bedrag']);
    if (cidx < 0) cidx = 0;
    if (vidx < 0) vidx = header.length - 1;

    var p = _emptyTarieven();
    for (var r = 1; r < rows.length; r++) {
      var comp = String(rows[r][cidx] || '').toLowerCase();
      var type = tidx >= 0 ? String(rows[r][tidx] || '').toLowerCase() : '';
      var raw  = parseFloat(rows[r][vidx]);
      if (isNaN(raw)) continue;
      var key = _mapTariefKey(comp, type);
      if (!key) continue;
      if (key.endsWith('_pct')) {
        p[key] = raw; // fractie (0..1) — invoer al als fractie of als %?
        // Als waarde > 1 aannemen als % en omrekenen
        if (raw > 1) p[key] = raw / 100;
      } else {
        // EUR/kWh of EUR/MWh? Mediaan-detectie niet beschikbaar per rij;
        // aanname: waarde ≥ 0.5 → EUR/MWh → delen door 1000
        p[key] = raw >= 0.5 ? raw / 1000 : raw;
      }
    }
    return p;
  }

  function _emptyTarieven() {
    return {
      gelijktijdigheid_zon: 0, gelijktijdigheid_wind: 0, gelijktijdigheid_afname_invoeden: 0,
      platform: 0, gvo_bilateraal: 0, gvo_rest: 0,
      onbalans_zon_pct: 0, onbalans_wind_pct: 0, onbalans_verbruik_pct: 0,
      onbalans_zon_risicoprijs: 0, onbalans_wind_risicoprijs: 0, onbalans_verbruik_risicoprijs: 0
    };
  }

  function _mapTariefKey(comp, type) {
    var both = (comp + ' ' + type).replace(/[^a-z0-9]/g, ' ');
    function has(word) { return both.indexOf(word) >= 0; }

    if (has('gelijktijd') || has('simultaneity')) {
      if (has('invoeden') || has('afname') || has('feed')) return 'gelijktijdigheid_afname_invoeden';
      if (has('zon') || has('solar') || has('pv'))         return 'gelijktijdigheid_zon';
      if (has('wind'))                                     return 'gelijktijdigheid_wind';
    }
    if (has('platform'))                                   return 'platform';
    if (has('bilateraal') || has('bilateral'))             return 'gvo_bilateraal';
    if (has('rest') && has('gvo'))                         return 'gvo_rest';
    if (has('gvo') && !has('bilateraal') && !has('bilateral')) return 'gvo_rest';
    if (has('onbalans') || has('imbalance')) {
      var isRisico = has('risic') || has('risico') || has('risicoprijs') || has('risk');
      var isAfwijk = has('afwijk') || has('pct') || has('percent');
      if (isRisico) {
        if (has('zon') || has('solar') || has('pv'))           return 'onbalans_zon_risicoprijs';
        if (has('wind'))                                       return 'onbalans_wind_risicoprijs';
        if (has('verbruik') || has('afname') || has('gebruiker') || has('demand')) return 'onbalans_verbruik_risicoprijs';
      }
      if (isAfwijk || (!isRisico && !isAfwijk)) {
        if (has('zon') || has('solar') || has('pv'))           return 'onbalans_zon_pct';
        if (has('wind'))                                       return 'onbalans_wind_pct';
        if (has('verbruik') || has('afname') || has('gebruiker') || has('demand')) return 'onbalans_verbruik_pct';
      }
    }
    return null;
  }

  // ─── Parser: Forwardcurve.xlsx ──────────────────────────────────────────────

  function readForwardcurveExcel(wb) {
    var sheet = _firstSheet(wb);
    var rows  = _sheetToRows(sheet);
    if (rows.length < 2) return [];

    var header = rows[0].map(function (v) { return String(v || '').trim().toLowerCase(); });
    var midx   = _findCol(header, ['maand_id_forecast', 'maand_id', 'maandid', 'month_id', 'maand']);
    var fidx   = _findCol(header, ['forward_eur_per_mwh', 'forward_mwh', 'forward',
                                   'prijs_mwh', 'prijs_eur_per_mwh', 'forward (eur/mwh)']);
    if (midx < 0) midx = 0;
    if (fidx < 0) fidx = 1;

    var out = [];
    for (var r = 1; r < rows.length; r++) {
      var maandId = parseInt(rows[r][midx], 10);
      var fwd     = parseFloat(rows[r][fidx]);
      if (isNaN(maandId) || isNaN(fwd)) continue;
      out.push({Maand_ID_FORECAST: maandId, forward_eur_per_MWh: fwd});
    }
    return out;
  }

  // ─── Engine: prosumer-correctie (spec 5.2) ──────────────────────────────────

  function applyProsumerCorrection(verbruik, opwek) {
    var v = verbruik.map(function (row) {
      var netto   = +(row.gebruik_kWh) || 0;
      var bruto   = Math.max(0, netto);
      var invoeden = Math.max(0, -netto);
      return {
        'Tijd (UTC)': row['Tijd (UTC)'],
        tijdKey: row.tijdKey,
        Locatie: row.Locatie,
        gebruik_kWh: bruto,
        bruto_afname_kWh: bruto,
        netto_afname_kWh: bruto,
        afname_invoeden_kWh: invoeden,
        prosumer_opwek_kWh: 0,
        zelfconsumptie_kWh: 0
      };
    });

    // Bouw afname_invoeden pseudo-opwek met Prioriteit=0 (hoogste)
    var feedRows = [];
    v.forEach(function (row) {
      if (row.afname_invoeden_kWh > 0) {
        feedRows.push({
          'Tijd (UTC)': row['Tijd (UTC)'],
          tijdKey: row.tijdKey,
          Asset: 'Afname-Invoeden - ' + row.Locatie,
          Type: 'afname_invoeden',
          Type_norm: 'afname_invoeden',
          Prioriteit: 0,
          opwek_kWh: row.afname_invoeden_kWh,
          Gebruiker: row.Locatie
        });
      }
    });

    var opwekCorr = feedRows.concat(opwek.map(function (r) {
      var rc = {};
      for (var k in r) rc[k] = r[k];
      if (rc.Type_norm == null) rc.Type_norm = normalizeType(rc.Type);
      if (rc.Prioriteit == null || isNaN(rc.Prioriteit)) rc.Prioriteit = 9999;
      else rc.Prioriteit = Math.round(rc.Prioriteit);
      return rc;
    }));

    var totalInvoeden  = v.reduce(function (s, r) { return s + r.afname_invoeden_kWh; }, 0);
    var locMet         = {};
    v.forEach(function (r) { if (r.afname_invoeden_kWh > 0) locMet[r.Locatie] = 1; });
    var negatieveKwart = v.filter(function (r) { return r.afname_invoeden_kWh > 0; }).length;

    var controle = [
      {Controle: 'hoofdmeter_netto_logica',          Waarde: 'toegepast; positief=afname, negatief=Afname-Invoeden'},
      {Controle: 'achter_de_meter_niet_afgeleid',    Waarde: 'niet afgeleid uit hoofdmeters'},
      {Controle: 'afname_invoeden_kWh',              Waarde: totalInvoeden},
      {Controle: 'afname_invoeden_prioriteit',       Waarde: 'hoogste prioriteit; technisch Prioriteit=0'},
      {Controle: 'aantal_gebruikers_met_afname_invoeden', Waarde: Object.keys(locMet).length},
      {Controle: 'netto_negatieve_kwartieren',       Waarde: negatieveKwart}
    ];

    return {v: v, opwek: opwekCorr, controle: controle};
  }

  // ─── Engine: prioriteitsgestuurde opwekallocatie (spec 5.1) ─────────────────

  function allocateOpwekPriority(opwekRows, verbruikByTijd) {
    // Groepeer per (tijdKey, Prioriteit)
    var groepen = {};
    for (var i = 0; i < opwekRows.length; i++) {
      var r = opwekRows[i];
      var k = r.tijdKey + '|' + r.Prioriteit;
      if (!groepen[k]) groepen[k] = {tijdKey: r.tijdKey, prio: r.Prioriteit, opwek: 0, assets: []};
      groepen[k].opwek += r.opwek_kWh;
      groepen[k].assets.push(r);
    }

    // Groepeer per tijdKey
    var byTijd = {};
    var gKeys  = Object.keys(groepen);
    for (var j = 0; j < gKeys.length; j++) {
      var g = groepen[gKeys[j]];
      if (!byTijd[g.tijdKey]) byTijd[g.tijdKey] = [];
      byTijd[g.tijdKey].push(g);
    }

    var out = [];
    var tijdKeys = Object.keys(byTijd).sort();
    for (var ti = 0; ti < tijdKeys.length; ti++) {
      var tkey    = tijdKeys[ti];
      var grpList = byTijd[tkey];
      grpList.sort(function (a, b) { return a.prio - b.prio; });
      var vraag    = verbruikByTijd[tkey] || 0;
      var cumOpwek = 0;
      for (var gi = 0; gi < grpList.length; gi++) {
        var grp       = grpList[gi];
        var cumVoor   = cumOpwek;
        var resterend = Math.max(0, vraag - cumVoor);
        var groepGelijk = Math.min(grp.opwek, resterend);
        for (var ai = 0; ai < grp.assets.length; ai++) {
          var a     = grp.assets[ai];
          var gelijk  = grp.opwek > 0 ? (a.opwek_kWh / grp.opwek) * groepGelijk : 0;
          var oversch = Math.max(0, a.opwek_kWh - gelijk);
          out.push({
            'Tijd (UTC)': a['Tijd (UTC)'],
            tijdKey:      a.tijdKey,
            Asset:        a.Asset,
            Type:         a.Type,
            Type_norm:    a.Type_norm,
            Prioriteit:   a.Prioriteit,
            opwek_kWh:    a.opwek_kWh,
            Gebruiker:    a.Gebruiker || '',
            gelijktijdig_kWh: gelijk,
            overschot_kWh:    oversch
          });
        }
        cumOpwek += grp.opwek;
      }
    }
    return out;
  }

  // ─── Engine: aggregaties ────────────────────────────────────────────────────

  function _aggregateVerbruik(verbruik) {
    var byT = {};
    for (var i = 0; i < verbruik.length; i++) {
      var r = verbruik[i];
      var k = r.tijdKey;
      if (!byT[k]) byT[k] = {
        'Tijd (UTC)': r['Tijd (UTC)'], tijdKey: k,
        totaal_verbruik_kWh: 0, totaal_bruto_afname_kWh: 0,
        afname_invoeden_kWh: 0, prosumer_opwek_kWh: 0, zelfconsumptie_kWh: 0
      };
      byT[k].totaal_verbruik_kWh      += r.gebruik_kWh;
      byT[k].totaal_bruto_afname_kWh  += r.bruto_afname_kWh;
      byT[k].afname_invoeden_kWh      += r.afname_invoeden_kWh;
      byT[k].prosumer_opwek_kWh       += r.prosumer_opwek_kWh;
      byT[k].zelfconsumptie_kWh       += r.zelfconsumptie_kWh;
    }
    return byT;
  }

  function _aggregateOpwekAlloc(opwekAlloc) {
    var byT = {};
    for (var i = 0; i < opwekAlloc.length; i++) {
      var r = opwekAlloc[i];
      var k = r.tijdKey;
      if (!byT[k]) byT[k] = {
        tijdKey: k,
        totaal_opwek_kWh: 0, gelijktijdig_kWh: 0, overschot_kWh: 0,
        opwek_zon_kWh: 0, opwek_wind_kWh: 0, opwek_afname_invoeden_kWh: 0,
        gelijktijdig_zon_kWh: 0, gelijktijdig_wind_kWh: 0, gelijktijdig_afname_invoeden_kWh: 0,
        overschot_zon_kWh: 0, overschot_wind_kWh: 0, overschot_afname_invoeden_kWh: 0
      };
      var b = byT[k];
      b.totaal_opwek_kWh   += r.opwek_kWh;
      b.gelijktijdig_kWh   += r.gelijktijdig_kWh;
      b.overschot_kWh      += r.overschot_kWh;
      var tn = r.Type_norm;
      if (tn === 'zon') {
        b.opwek_zon_kWh          += r.opwek_kWh;
        b.gelijktijdig_zon_kWh   += r.gelijktijdig_kWh;
        b.overschot_zon_kWh      += r.overschot_kWh;
      } else if (tn === 'wind') {
        b.opwek_wind_kWh         += r.opwek_kWh;
        b.gelijktijdig_wind_kWh  += r.gelijktijdig_kWh;
        b.overschot_wind_kWh     += r.overschot_kWh;
      } else if (tn === 'afname_invoeden') {
        b.opwek_afname_invoeden_kWh       += r.opwek_kWh;
        b.gelijktijdig_afname_invoeden_kWh += r.gelijktijdig_kWh;
        b.overschot_afname_invoeden_kWh   += r.overschot_kWh;
      }
    }
    return byT;
  }

  // ─── Engine: economische kolommen (spec 5.3) ────────────────────────────────

  function applyEconomicColumns(model, p) {
    var pg = function (k) { return p[k] || 0; };
    return model.map(function (row) {
      var m = {};
      for (var k in row) m[k] = row[k];

      m.kosten_gelijktijdigheid_afname_invoeden_EUR = (m.gelijktijdig_afname_invoeden_kWh || 0) * pg('gelijktijdigheid_afname_invoeden');
      m.kosten_gelijktijdigheid_zon_EUR             = (m.gelijktijdig_zon_kWh || 0)             * pg('gelijktijdigheid_zon');
      m.kosten_gelijktijdigheid_wind_EUR            = (m.gelijktijdig_wind_kWh || 0)            * pg('gelijktijdigheid_wind');
      m.kosten_gelijktijdigheid_totaal_EUR          = m.kosten_gelijktijdigheid_afname_invoeden_EUR
                                                    + m.kosten_gelijktijdigheid_zon_EUR
                                                    + m.kosten_gelijktijdigheid_wind_EUR;

      m.kosten_platform_EUR       = m.totaal_verbruik_kWh * pg('platform');
      m.kosten_gvo_bilateraal_EUR = m.gelijktijdig_kWh    * pg('gvo_bilateraal');
      m.kosten_gvo_rest_EUR       = m.tekort_kWh          * pg('gvo_rest');
      m.kosten_epex_tekort_EUR    = m.tekort_kWh          * (m.epex_eur_per_kWh || 0);

      m.opbrengst_epex_overschot_EUR      = m.overschot_kWh              * (m.epex_eur_per_kWh || 0);
      m.opbrengst_epex_overschot_zon_EUR  = (m.overschot_zon_kWh  || 0)  * (m.epex_eur_per_kWh || 0);
      m.opbrengst_epex_overschot_wind_EUR = (m.overschot_wind_kWh || 0)  * (m.epex_eur_per_kWh || 0);

      m.onbalans_afwijking_zon_kWh      = (m.opwek_zon_kWh || 0)        * pg('onbalans_zon_pct');
      m.onbalans_afwijking_wind_kWh     = (m.opwek_wind_kWh || 0)       * pg('onbalans_wind_pct');
      m.onbalans_afwijking_verbruik_kWh = m.totaal_verbruik_kWh          * pg('onbalans_verbruik_pct');

      m.onbalans_basis_zon_EUR      = (m.opwek_zon_kWh || 0)      * pg('onbalans_zon_risicoprijs');
      m.onbalans_basis_wind_EUR     = (m.opwek_wind_kWh || 0)     * pg('onbalans_wind_risicoprijs');
      m.onbalans_basis_verbruik_EUR = m.totaal_verbruik_kWh        * pg('onbalans_verbruik_risicoprijs');

      m.kosten_onbalans_zon_EUR      = m.onbalans_afwijking_zon_kWh      * pg('onbalans_zon_risicoprijs');
      m.kosten_onbalans_wind_EUR     = m.onbalans_afwijking_wind_kWh     * pg('onbalans_wind_risicoprijs');
      m.kosten_onbalans_verbruik_EUR = m.onbalans_afwijking_verbruik_kWh * pg('onbalans_verbruik_risicoprijs');
      m.kosten_onbalans_totaal_EUR   = m.kosten_onbalans_zon_EUR + m.kosten_onbalans_wind_EUR + m.kosten_onbalans_verbruik_EUR;

      // Eindtotaal: kosten + onbalans − opbrengst EPEX-overschot (spec 5.3)
      m.kosten_totaal_EUR = m.kosten_gelijktijdigheid_totaal_EUR
                          + m.kosten_platform_EUR
                          + m.kosten_gvo_bilateraal_EUR
                          + m.kosten_gvo_rest_EUR
                          + m.kosten_epex_tekort_EUR
                          + m.kosten_onbalans_totaal_EUR
                          - m.opbrengst_epex_overschot_EUR;

      return m;
    });
  }

  // ─── Engine: forward-scenario model (spec 5.4) ──────────────────────────────

  function makeForwardModel(baseModel, forwardcurve, p, scenario) {
    if (!forwardcurve || !forwardcurve.length) return {model: null, controle: []};
    scenario = scenario || {};
    var prijsmodus = String(scenario.prijsmodus || 'forward').trim().toLowerCase();
    if (prijsmodus !== 'forward') {
      return {model: null, controle: [
        {Controle: 'prijsmodus',           Waarde: prijsmodus},
        {Controle: 'forward_overgeslagen', Waarde: 'prijsmodus is niet forward'}
      ]};
    }
    if (!baseModel.length) return {model: null, controle: []};

    var basisjaar  = baseModel[0]['Tijd (UTC)'].getFullYear();
    var doeljaar   = scenario.scenariojaar ? parseInt(scenario.scenariojaar, 10) : basisjaar + 1;
    var jaarOffset = doeljaar - basisjaar;

    // Gemiddelde EPEX per basismaand
    var maandSom = {}, maandCnt = {};
    baseModel.forEach(function (row) {
      var mo = row['Tijd (UTC)'].getMonth() + 1;
      if (!maandSom[mo]) { maandSom[mo] = 0; maandCnt[mo] = 0; }
      maandSom[mo] += row.epex_eur_per_kWh || 0;
      maandCnt[mo]++;
    });
    var maandGem = {};
    for (var mo in maandSom) maandGem[mo] = safeDiv(maandSom[mo], maandCnt[mo]);

    // Forwardcurve lookup (EUR/kWh)
    var fwdMap = {};
    forwardcurve.forEach(function (f) {
      fwdMap[f.Maand_ID_FORECAST] = f.forward_eur_per_MWh / 1000;
    });

    // Valideer ontbrekende maanden
    var missing = [];
    for (var mo2 in maandCnt) {
      var fwdId = doeljaar * 100 + parseInt(mo2, 10);
      if (!fwdMap[fwdId] && fwdMap[fwdId] !== 0) missing.push(fwdId);
    }
    if (missing.length) {
      throw new Error('Forwardcurve mist maand(en) voor scenariojaar ' + doeljaar + ': ' + missing.join(', '));
    }

    // Schaal profiel naar forwardprijs (kern-formule spec 5.4)
    var out = baseModel.map(function (row) {
      var mo     = row['Tijd (UTC)'].getMonth() + 1;
      var gem    = maandGem[mo] || 0;
      var fwdKwh = fwdMap[doeljaar * 100 + mo] || 0;
      var newEpex = gem !== 0 ? (row.epex_eur_per_kWh || 0) * fwdKwh / gem : fwdKwh;
      var origTs = row['Tijd (UTC)'];
      var newTs  = new Date(origTs.getFullYear() + jaarOffset, origTs.getMonth(),
                            origTs.getDate(), origTs.getHours(), origTs.getMinutes());
      var m = {};
      for (var k in row) m[k] = row[k];
      m['Tijd (UTC)']                        = newTs;
      m.tijdKey                              = _tsKey(newTs);
      m.Tijd_basisjaar                       = origTs;
      m.epex_basisjaar_eur_per_kWh           = row.epex_eur_per_kWh || 0;
      m.forward_eur_per_kWh                  = fwdKwh;
      m.gemiddelde_epex_basismaand_eur_per_kWh = gem;
      m.epex_eur_per_kWh                     = newEpex;
      m.Scenario                             = doeljaar + '_Forward_obv_' + basisjaar + '_profiel';
      return m;
    });

    out = applyEconomicColumns(out, p);
    return {model: out, controle: []};
  }

  // ─── Engine: per-deelnemer allocatie (spec 7) ───────────────────────────────

  function participantOutputsForModel(modelRows, verbruik, opwekAlloc, p) {
    var modelByTijd = {};
    modelRows.forEach(function (r) { modelByTijd[r.tijdKey] = r; });

    // Verbruikers: pro-rata kostenverdeling op aandeel_verbruik_kwartier
    var locaties = {};
    verbruik.forEach(function (r) {
      if (!locaties[r.Locatie]) locaties[r.Locatie] = {
        Locatie: r.Locatie,
        totaal_verbruik_kWh: 0, totaal_bruto_afname_kWh: 0, afname_invoeden_kWh: 0,
        gelijktijdig_kWh: 0, tekort_kWh: 0,
        gelijktijdig_zon_kWh: 0, gelijktijdig_wind_kWh: 0, gelijktijdig_afname_invoeden_kWh: 0,
        kosten_gelijktijdigheid_EUR: 0, kosten_epex_tekort_EUR: 0,
        kosten_onbalans_verbruik_EUR: 0, kosten_platform_EUR: 0,
        kosten_gvo_bilateraal_EUR: 0, kosten_gvo_rest_EUR: 0, kosten_totaal_EUR: 0,
        monthly: {}
      };
      var mr     = modelByTijd[r.tijdKey];
      if (!mr) return;
      var aandeel = safeDiv(r.gebruik_kWh, mr.totaal_verbruik_kWh);
      var loc     = locaties[r.Locatie];
      loc.totaal_verbruik_kWh       += r.gebruik_kWh;
      loc.totaal_bruto_afname_kWh   += r.bruto_afname_kWh;
      loc.afname_invoeden_kWh       += r.afname_invoeden_kWh;
      loc.gelijktijdig_kWh          += aandeel * mr.gelijktijdig_kWh;
      loc.tekort_kWh                += aandeel * mr.tekort_kWh;
      loc.gelijktijdig_zon_kWh              += aandeel * (mr.gelijktijdig_zon_kWh || 0);
      loc.gelijktijdig_wind_kWh             += aandeel * (mr.gelijktijdig_wind_kWh || 0);
      loc.gelijktijdig_afname_invoeden_kWh  += aandeel * (mr.gelijktijdig_afname_invoeden_kWh || 0);
      var mn = r.tijdKey.slice(0, 7);
      if (!loc.monthly[mn]) loc.monthly[mn] = {
        totaal_verbruik_kWh: 0, gelijktijdig_kWh: 0, tekort_kWh: 0,
        gelijktijdig_zon_kWh: 0, gelijktijdig_wind_kWh: 0, gelijktijdig_afname_invoeden_kWh: 0
      };
      var lm = loc.monthly[mn];
      lm.totaal_verbruik_kWh               += r.gebruik_kWh;
      lm.gelijktijdig_kWh                  += aandeel * mr.gelijktijdig_kWh;
      lm.tekort_kWh                        += aandeel * mr.tekort_kWh;
      lm.gelijktijdig_zon_kWh              += aandeel * (mr.gelijktijdig_zon_kWh || 0);
      lm.gelijktijdig_wind_kWh             += aandeel * (mr.gelijktijdig_wind_kWh || 0);
      lm.gelijktijdig_afname_invoeden_kWh  += aandeel * (mr.gelijktijdig_afname_invoeden_kWh || 0);
      loc.kosten_gelijktijdigheid_EUR += aandeel * mr.kosten_gelijktijdigheid_totaal_EUR;
      loc.kosten_epex_tekort_EUR    += aandeel * mr.kosten_epex_tekort_EUR;
      loc.kosten_onbalans_verbruik_EUR += aandeel * mr.kosten_onbalans_verbruik_EUR;
      loc.kosten_platform_EUR       += aandeel * mr.kosten_platform_EUR;
      loc.kosten_gvo_bilateraal_EUR += aandeel * mr.kosten_gvo_bilateraal_EUR;
      loc.kosten_gvo_rest_EUR       += aandeel * mr.kosten_gvo_rest_EUR;
      loc.kosten_totaal_EUR         += aandeel * mr.kosten_totaal_EUR;
    });
    var per_gebruiker = Object.keys(locaties).map(function (k) { return locaties[k]; });

    // Opwekkers: direct uit opwekAlloc (sommen per Asset)
    var assets = {};
    opwekAlloc.forEach(function (r) {
      var mr = modelByTijd[r.tijdKey];
      if (!mr) return;
      if (!assets[r.Asset]) assets[r.Asset] = {
        Asset: r.Asset, Type_norm: r.Type_norm, Gebruiker: r.Gebruiker || '',
        totaal_opwek_kWh: 0, gelijktijdig_kWh: 0, overschot_kWh: 0,
        opbrengst_gelijktijdigheid_EUR: 0, opbrengst_epex_overschot_EUR: 0,
        kosten_onbalans_opwek_EUR: 0, netto_opbrengst_EUR: 0,
        monthly: {}
      };
      var a = assets[r.Asset];
      var gelTarief  = r.Type_norm === 'afname_invoeden' ? (p.gelijktijdigheid_afname_invoeden || 0)
                     : r.Type_norm === 'wind'            ? (p.gelijktijdigheid_wind || 0)
                                                        : (p.gelijktijdigheid_zon || 0);
      var onbPct     = r.Type_norm === 'afname_invoeden' ? 0
                     : r.Type_norm === 'wind'            ? (p.onbalans_wind_pct || 0)
                                                        : (p.onbalans_zon_pct || 0);
      var onbRisico  = r.Type_norm === 'afname_invoeden' ? 0
                     : r.Type_norm === 'wind'            ? (p.onbalans_wind_risicoprijs || 0)
                                                        : (p.onbalans_zon_risicoprijs || 0);
      a.totaal_opwek_kWh               += r.opwek_kWh;
      a.gelijktijdig_kWh               += r.gelijktijdig_kWh;
      a.overschot_kWh                  += r.overschot_kWh;
      a.opbrengst_gelijktijdigheid_EUR += r.gelijktijdig_kWh * gelTarief;
      a.opbrengst_epex_overschot_EUR   += r.overschot_kWh * (mr.epex_eur_per_kWh || 0);
      a.kosten_onbalans_opwek_EUR      += r.opwek_kWh * onbPct * onbRisico;
      var mn2 = r.tijdKey.slice(0, 7);
      if (!a.monthly[mn2]) a.monthly[mn2] = {totaal_opwek_kWh: 0, gelijktijdig_kWh: 0, overschot_kWh: 0};
      a.monthly[mn2].totaal_opwek_kWh += r.opwek_kWh;
      a.monthly[mn2].gelijktijdig_kWh  += r.gelijktijdig_kWh;
      a.monthly[mn2].overschot_kWh     += r.overschot_kWh;
    });

    var per_opwekker = Object.keys(assets).map(function (k) {
      var a = assets[k];
      a.netto_opbrengst_EUR = a.opbrengst_gelijktijdigheid_EUR + a.opbrengst_epex_overschot_EUR
                            - a.kosten_onbalans_opwek_EUR;
      return a;
    });

    return {per_gebruiker: per_gebruiker, per_opwekker: per_opwekker};
  }

  // ─── Engine: samenvatting ───────────────────────────────────────────────────

  function _summarize(model) {
    var s = {
      totaal_verbruik_kWh: 0, totaal_opwek_kWh: 0, gelijktijdig_kWh: 0,
      tekort_kWh: 0, overschot_kWh: 0,
      opwek_zon_kWh: 0, opwek_wind_kWh: 0, opwek_afname_invoeden_kWh: 0,
      gelijktijdig_zon_kWh: 0, gelijktijdig_wind_kWh: 0, gelijktijdig_afname_invoeden_kWh: 0,
      overschot_zon_kWh: 0, overschot_wind_kWh: 0, overschot_afname_invoeden_kWh: 0,
      kosten_gelijktijdigheid_totaal_EUR: 0, kosten_platform_EUR: 0,
      kosten_gvo_bilateraal_EUR: 0, kosten_gvo_rest_EUR: 0,
      kosten_epex_tekort_EUR: 0, opbrengst_epex_overschot_EUR: 0,
      kosten_onbalans_totaal_EUR: 0, kosten_totaal_EUR: 0
    };
    model.forEach(function (m) {
      s.totaal_verbruik_kWh += m.totaal_verbruik_kWh;
      s.totaal_opwek_kWh    += m.totaal_opwek_kWh;
      s.gelijktijdig_kWh    += m.gelijktijdig_kWh;
      s.tekort_kWh          += m.tekort_kWh;
      s.overschot_kWh       += m.overschot_kWh;
      s.opwek_zon_kWh                  += (m.opwek_zon_kWh || 0);
      s.opwek_wind_kWh                 += (m.opwek_wind_kWh || 0);
      s.opwek_afname_invoeden_kWh      += (m.opwek_afname_invoeden_kWh || 0);
      s.gelijktijdig_zon_kWh           += (m.gelijktijdig_zon_kWh || 0);
      s.gelijktijdig_wind_kWh          += (m.gelijktijdig_wind_kWh || 0);
      s.gelijktijdig_afname_invoeden_kWh += (m.gelijktijdig_afname_invoeden_kWh || 0);
      s.overschot_zon_kWh              += (m.overschot_zon_kWh || 0);
      s.overschot_wind_kWh             += (m.overschot_wind_kWh || 0);
      s.overschot_afname_invoeden_kWh  += (m.overschot_afname_invoeden_kWh || 0);
      s.kosten_gelijktijdigheid_totaal_EUR += m.kosten_gelijktijdigheid_totaal_EUR;
      s.kosten_platform_EUR              += m.kosten_platform_EUR;
      s.kosten_gvo_bilateraal_EUR        += m.kosten_gvo_bilateraal_EUR;
      s.kosten_gvo_rest_EUR              += m.kosten_gvo_rest_EUR;
      s.kosten_epex_tekort_EUR           += m.kosten_epex_tekort_EUR;
      s.opbrengst_epex_overschot_EUR     += m.opbrengst_epex_overschot_EUR;
      s.kosten_onbalans_totaal_EUR       += m.kosten_onbalans_totaal_EUR;
      s.kosten_totaal_EUR                += m.kosten_totaal_EUR;
    });
    s.gelijktijdigheid_pct_van_verbruik = safeDiv(s.gelijktijdig_kWh, s.totaal_verbruik_kWh) * 100;
    s.gelijktijdigheid_pct_van_opwek    = safeDiv(s.gelijktijdig_kWh, s.totaal_opwek_kWh)    * 100;
    return s;
  }

  // ─── Engine: sanity checks ──────────────────────────────────────────────────

  function _runSanityChecks(model) {
    var errors = [], eps = 1e-3;
    for (var i = 0; i < model.length; i++) {
      var m = model[i];
      var gelTekort = m.gelijktijdig_kWh + m.tekort_kWh;
      if (Math.abs(gelTekort - m.totaal_verbruik_kWh) > eps) {
        errors.push({row: i, check: 'gelijktijdig+tekort≈verbruik',
          expected: m.totaal_verbruik_kWh, got: gelTekort});
        if (errors.length >= 5) break;
      }
    }
    return errors;
  }

  // ─── Engine: hoofdorkestratie (spec sectie 6) ───────────────────────────────

  function buildModel(inputs) {
    var verbruik     = inputs.verbruik     || [];
    var opwek        = (inputs.opwek       || []).slice();
    var epex         = inputs.epex         || [];
    var p            = inputs.tarieven     || {};
    var scenario     = inputs.scenario     || {};
    var forwardcurve = inputs.forwardcurve || [];

    if (!verbruik.length) throw new Error('Geen verbruiksdata opgegeven');

    // Stap 2
    var corrResult = applyProsumerCorrection(verbruik, opwek);
    var v          = corrResult.v;
    var opwekCorr  = corrResult.opwek;
    var controle   = corrResult.controle.slice();

    // Stap 3
    var verbruikByTijdMap  = _aggregateVerbruik(v);
    var verbruikKwartier   = Object.keys(verbruikByTijdMap).sort()
                                   .map(function (k) { return verbruikByTijdMap[k]; });
    var verbruikByTijdLookup = {};
    verbruikKwartier.forEach(function (r) { verbruikByTijdLookup[r.tijdKey] = r.totaal_verbruik_kWh; });

    // Stap 4
    var opwekAlloc = (verbruikKwartier.length && opwekCorr.length)
      ? allocateOpwekPriority(opwekCorr, verbruikByTijdLookup)
      : [];

    // Stap 5+6: aggregeer opwek-alloc per tijd + pivot per Type_norm
    var opwekByTijdMap = _aggregateOpwekAlloc(opwekAlloc);

    // Stap 8: bouw model-rijen
    var epexByTijd = {};
    epex.forEach(function (r) { epexByTijd[r.tijdKey] = r.epex_eur_per_kWh; });

    var model = verbruikKwartier.map(function (vk) {
      var ok         = opwekByTijdMap[vk.tijdKey] || {};
      var epexPrijs  = epexByTijd[vk.tijdKey] || 0;
      var gelijktijdig = ok.gelijktijdig_kWh || 0;
      var tekort      = Math.max(0, vk.totaal_verbruik_kWh - gelijktijdig);
      return {
        'Tijd (UTC)':                      vk['Tijd (UTC)'],
        tijdKey:                           vk.tijdKey,
        totaal_verbruik_kWh:               vk.totaal_verbruik_kWh,
        totaal_bruto_afname_kWh:           vk.totaal_bruto_afname_kWh,
        afname_invoeden_kWh:               vk.afname_invoeden_kWh,
        prosumer_opwek_kWh:                0,
        zelfconsumptie_kWh:                0,
        totaal_opwek_kWh:                  ok.totaal_opwek_kWh || 0,
        opwek_zon_kWh:                     ok.opwek_zon_kWh || 0,
        opwek_wind_kWh:                    ok.opwek_wind_kWh || 0,
        opwek_afname_invoeden_kWh:         ok.opwek_afname_invoeden_kWh || 0,
        gelijktijdig_kWh:                  gelijktijdig,
        gelijktijdig_zon_kWh:              ok.gelijktijdig_zon_kWh || 0,
        gelijktijdig_wind_kWh:             ok.gelijktijdig_wind_kWh || 0,
        gelijktijdig_afname_invoeden_kWh:  ok.gelijktijdig_afname_invoeden_kWh || 0,
        overschot_kWh:                     ok.overschot_kWh || 0,
        overschot_zon_kWh:                 ok.overschot_zon_kWh || 0,
        overschot_wind_kWh:                ok.overschot_wind_kWh || 0,
        overschot_afname_invoeden_kWh:     ok.overschot_afname_invoeden_kWh || 0,
        tekort_kWh:                        tekort,
        epex_eur_per_kWh:                  epexPrijs
      };
    });

    // Stap 9
    model = applyEconomicColumns(model, p);

    // Stap 10
    var samenvatting = _summarize(model);

    // Sanity
    var sanityErr = _runSanityChecks(model);
    if (sanityErr.length) controle.push({Controle: 'sanity_fouten', Waarde: sanityErr.length + ' afwijkingen (zie console)'});

    // Stap 11: forward
    var model_forward    = null;
    var samenvatting_fwd = null;
    var fwdRes = makeForwardModel(model, forwardcurve, p, scenario);
    model_forward = fwdRes.model;
    if (model_forward) samenvatting_fwd = _summarize(model_forward);
    if (fwdRes.controle && fwdRes.controle.length) controle = controle.concat(fwdRes.controle);

    // Stap 12: per-deelnemer
    var deelRes = participantOutputsForModel(model, v, opwekAlloc, p);

    return {
      model:              model,
      model_forward:      model_forward,
      samenvatting:       samenvatting,
      samenvatting_fwd:   samenvatting_fwd,
      per_gebruiker:      deelRes.per_gebruiker,
      per_opwekker:       deelRes.per_opwekker,
      controle:           controle,
      opwekAlloc:         opwekAlloc,
      verbruik:           v
    };
  }

  // ─── Validatie ──────────────────────────────────────────────────────────────

  function validateAgainstReference(referenceRows, computedModel) {
    var diffs = [];
    var n = Math.min(referenceRows.length, computedModel.length);
    for (var i = 0; i < n && diffs.length < 20; i++) {
      for (var ci = 0; ci < MODEL_NUMERIC_COLS.length; ci++) {
        var col  = MODEL_NUMERIC_COLS[ci];
        var ref  = Number(referenceRows[i][col]);
        var mine = Number(computedModel[i][col]);
        if (!isFinite(ref) || !isFinite(mine)) continue;
        if (Math.abs(ref - mine) > 1e-6) {
          diffs.push({row: i, col: col, ref: ref, mine: mine, delta: mine - ref});
        }
      }
    }
    return diffs;
  }

  // ─── Export ─────────────────────────────────────────────────────────────────
  global.EnergieModel = {
    MODEL_NUMERIC_COLS:     MODEL_NUMERIC_COLS,
    normalizeType:          normalizeType,
    safeDiv:                safeDiv,
    eurPerMwhToKwh:         eurPerMwhToKwh,
    readOpwekExcel:         readOpwekExcel,
    readEpexExcel:          readEpexExcel,
    readTarievenExcel:      readTarievenExcel,
    readForwardcurveExcel:  readForwardcurveExcel,
    buildModel:             buildModel,
    applyEconomicColumns:   applyEconomicColumns,
    makeForwardModel:       makeForwardModel,
    validateAgainstReference: validateAgainstReference
  };

})(window);
