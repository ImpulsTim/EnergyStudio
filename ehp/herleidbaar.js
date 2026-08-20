/* EHP herleidbaarheid — laat zien hoe een uitkomst tot stand komt.
   Hoort bij ehp.js; alleen DOM, geen rekenlogica.

   Twee dingen maken een verrekenmodel controleerbaar voor iemand die er niet in zit:

   1. KWARTIER-INSPECTOR. Kies één moment en zie de hele redenering: welke bronnen boden aan
      tegen welke prijs, hoe die prijs uit de formule volgt, wie er gematcht is en waarom de
      rest niet, wat de accu deed, en wat er van het net moest komen. Wordt op verzoek opnieuw
      doorgerekend via `allocator.verklaarKwartier()` — er wordt niets bewaard tijdens de
      hoofdrun, want een spoor van 35.000 kwartieren kost onnodig geheugen.

   2. AANNAMEBLAD. Elke parameter met eenheid, waarde, herkomst en status. Zolang een getal
      "aanname" is, hoort dat zichtbaar te zijn naast de uitkomst die erop rust.
*/

/** Momenten die de moeite waard zijn om te bekijken, afgeleid uit het model zelf. */
function _ehpInteressanteKwartieren(res) {
  var m = res.model || [];
  if (!m.length) return [];
  var duurst = m[0], goedkoopst = m[0], meesteOverschot = m[0], grootsteTekort = m[0];
  m.forEach(function (r) {
    if ((r.epex_eur_per_kWh || 0) > (duurst.epex_eur_per_kWh || 0)) duurst = r;
    if ((r.epex_eur_per_kWh || 0) < (goedkoopst.epex_eur_per_kWh || 0)) goedkoopst = r;
    if ((r.overschot_kWh || 0) > (meesteOverschot.overschot_kWh || 0)) meesteOverschot = r;
    if ((r.tekort_kWh || 0) > (grootsteTekort.tekort_kWh || 0)) grootsteTekort = r;
  });
  return [
    {key: duurst.tijdKey,          label: 'Duurste kwartier'},
    {key: goedkoopst.tijdKey,      label: 'Goedkoopste kwartier'},
    {key: meesteOverschot.tijdKey, label: 'Grootste overschot'},
    {key: grootsteTekort.tijdKey,  label: 'Grootste tekort'}
  ].filter(function (x, i, a) {
    return x.key && a.findIndex(function (y) { return y.key === x.key; }) === i;
  });
}

function _ehpHerleidbaarheidHtml(res) {
  var punten = _ehpInteressanteKwartieren(res);
  var opts = punten.map(function (p) {
    return '<option value="' + p.key + '">' + p.label + ' — ' + p.key.replace('T', ' ') + '</option>';
  }).join('');

  var inspector =
    '<div class="cd">' +
      '<div class="ct2"><div class="ac" style="background:#2c7fb8"></div>Doorrekening van één kwartier</div>' +
      '<div class="ib2" style="margin-bottom:8px">Kies een moment en zie de volledige redenering: welke bron ' +
        'welke prijs kreeg en uit welke formule die volgt, wie er gematcht is en waarom de rest niet, en wat ' +
        'er van het net moest komen. Dit is dezelfde berekening als in de doorrekening — er wordt niets ' +
        'nagebootst.</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px">' +
        '<select id="ehpInspKeuze" style="padding:6px 9px;border:1px solid #d6e0d2;border-radius:8px;font-family:Barlow,sans-serif">' +
          opts + '<option value="">— eigen moment —</option>' +
        '</select>' +
        '<input type="text" id="ehpInspVrij" placeholder="JJJJ-MM-DDTUU:MM" ' +
          'style="padding:6px 9px;border:1px solid #d6e0d2;border-radius:8px;font-family:Barlow,sans-serif;width:170px">' +
        '<button class="b dk" id="btnEhpInsp" style="width:auto;padding:6px 14px">Toon berekening</button>' +
      '</div>' +
      '<div id="ehpInspUit"></div>' +
    '</div>';

  return inspector + _ehpAannamebladHtml(res);
}

/** Rendert het spoor van één kwartier. */
function _ehpToonKwartier(tijdKey) {
  var res = _ehpLast;
  var uit = document.getElementById('ehpInspUit');
  if (!uit || !res) return;
  if (!res.allocator || !res.allocator.verklaarKwartier) {
    uit.innerHTML = '<div class="ib2">Voor dit platform is geen spoor beschikbaar. Reken opnieuw door.</div>';
    return;
  }
  var u = res.allocator.verklaarKwartier(tijdKey);
  if (!u) {
    uit.innerHTML = '<div class="opt-warn">Geen opwek bekend op ' + _ehpEsc(tijdKey) +
      '. Kies een moment binnen de meetperiode waarop er productie was.</div>';
    return;
  }
  var ct = function (x) { return _e2(x * 100) + ' ct'; };
  var rij = null;
  (res.model || []).forEach(function (r) { if (r.tijdKey === tijdKey) rij = r; });

  var prijsRijen = (u.prijsSporen || []).map(function (s) {
    return '<tr><td style="font-weight:700">' + _ehpEsc(s.bron) + '</td>' +
      '<td>' + _ehpEsc(s.vorm) + '</td>' +
      '<td>' + ct(s.prijs) + '</td>' +
      '<td style="font-size:12px;color:#555">' + _ehpEsc(s.invulling) + '</td></tr>';
  }).join('');

  var stapelRijen = (u.groepen || []).map(function (g) {
    var vol = g.gematcht > 1e-9;
    return '<tr' + (vol ? ' style="background:#eef7ea"' : '') + '>' +
      '<td>' + ct(g.prijs) + '</td>' +
      '<td>' + g.prio + '</td>' +
      '<td>' + _ehpEsc((g.assets || []).join(', ')) + '</td>' +
      '<td>' + _e2(g.aanbod) + '</td>' +
      '<td>' + _e2(g.gematcht) + '</td>' +
      '<td>' + _e2(g.overschot) + '</td>' +
      '<td style="font-size:12px;color:#555">' + _ehpEsc(g.reden) + '</td></tr>';
  }).join('');

  var accuRegel = '';
  (res.opslag || []).forEach(function (o, i) {
    var d = o.dispatch;
    var idx = (d.tijdKey || []).indexOf ? Array.prototype.indexOf.call(d.tijdKey, tijdKey) : -1;
    if (idx < 0) return;
    var ac = d.acProfiel[idx] || 0;
    var soc = d.socKwh[idx] || 0;
    var wat = ac > 1e-9 ? 'ontlaadt ' + _e2(ac) + ' kWh'
            : ac < -1e-9 ? 'laadt ' + _e2(-ac) + ' kWh'
            : 'doet niets';
    accuRegel += '<tr><td style="font-weight:700">' + _ehpEsc(d.accu.naam) + '</td>' +
      '<td>' + wat + '</td>' +
      '<td>' + _e2(soc) + ' kWh (' + _e2(soc / Math.max(1, d.accu.kWh) * 100) + '%)</td>' +
      '<td style="font-size:12px;color:#555">drempel: spread moet minimaal ' +
        ct(d.marginaleKostenPerKwh) + '/kWh doorzet dekken</td></tr>';
  });

  uit.innerHTML =
    '<div class="kg" style="margin-bottom:10px">' +
      '<div class="kb"><div class="kl">Moment</div><div class="kv" style="font-size:15px">' +
        _ehpEsc(tijdKey.replace('T', ' ')) + '</div><div class="ku">kwartier</div></div>' +
      '<div class="kb"><div class="kl">Marktprijs</div><div class="kv" style="font-size:15px">' +
        ct(u.epex) + '</div><div class="ku">EPEX</div></div>' +
      '<div class="kb"><div class="kl">Vraag in de groep</div><div class="kv" style="font-size:15px">' +
        _e2(u.vraag) + ' kWh</div><div class="ku">dit kwartier</div></div>' +
      '<div class="kb"><div class="kl">Intern gedekt</div><div class="kv" style="font-size:15px">' +
        _e2(u.gematcht) + ' kWh</div><div class="ku">rest van het net: ' + _e2(u.tekort) + ' kWh</div></div>' +
      (u.drempel === 'afnemer'
        ? '<div class="kb"><div class="kl">Grens afnemer</div><div class="kv" style="font-size:15px">' +
          ct(u.grensAfnemer) + '</div><div class="ku">netalternatief; daarboven niet verrekend</div></div>'
        : '') +
    '</div>' +
    (prijsRijen
      ? '<div class="st">1. Prijs per bron</div>' +
        '<div style="overflow-x:auto"><table class="verg-tbl"><thead><tr>' +
        '<th>Bron</th><th>Vorm</th><th>Prijs</th><th>Hoe die prijs volgt</th>' +
        '</tr></thead><tbody>' + prijsRijen + '</tbody></table></div>'
      : '') +
    '<div class="st" style="margin-top:12px">2. Merit order — ' +
      (u.volgorde === 'prijs' ? 'goedkoopste eerst' : 'op prioriteitsnummer') + '</div>' +
    '<div style="overflow-x:auto"><table class="verg-tbl"><thead><tr>' +
      '<th>Prijs</th><th>Prio</th><th>Bronnen</th><th>Aanbod kWh</th><th>Gematcht</th><th>Naar net</th><th>Waarom</th>' +
      '</tr></thead><tbody>' + stapelRijen + '</tbody></table></div>' +
    (accuRegel
      ? '<div class="st" style="margin-top:12px">3. Opslag</div>' +
        '<div style="overflow-x:auto"><table class="verg-tbl"><thead><tr>' +
        '<th>Accu</th><th>Actie</th><th>Vullingsgraad na afloop</th><th>Toelichting</th>' +
        '</tr></thead><tbody>' + accuRegel + '</tbody></table></div>'
      : '') +
    (rij
      ? '<div class="st" style="margin-top:12px">4. Wat dit kwartier in de totalen bijdraagt</div>' +
        '<div style="overflow-x:auto"><table class="verg-tbl"><thead><tr>' +
        '<th>Post</th><th>kWh</th><th>EUR</th></tr></thead><tbody>' +
        '<tr><td>Gelijktijdig verrekend</td><td>' + _e2(rij.gelijktijdig_kWh) + '</td><td>' +
          _e2(rij.kosten_gelijktijdigheid_totaal_EUR || 0) + '</td></tr>' +
        '<tr><td>Tekort van het net</td><td>' + _e2(rij.tekort_kWh) + '</td><td>' +
          _e2(rij.kosten_epex_tekort_EUR || 0) + '</td></tr>' +
        '<tr><td>Overschot naar het net</td><td>' + _e2(rij.overschot_kWh) + '</td><td>−' +
          _e2(rij.opbrengst_epex_overschot_EUR || 0) + '</td></tr>' +
        '</tbody></table></div>'
      : '') +
    '<div class="ib2" style="margin-top:8px">Deze getallen tellen op tot de kengetallen op het ' +
      'Overzicht: elk kwartier levert zijn deel, de tabbladen tonen de som over de hele periode.</div>';
}

function _ehpBindInspector() {
  var knop = document.getElementById('btnEhpInsp');
  if (!knop) return;
  knop.addEventListener('click', function () {
    var sel = document.getElementById('ehpInspKeuze');
    var vrij = document.getElementById('ehpInspVrij');
    var key = (vrij && vrij.value.trim()) || (sel && sel.value) || '';
    if (!key) { notify('Kies een moment of vul er een in', false); return; }
    _ehpToonKwartier(key.replace(' ', 'T').slice(0, 16));
  });
  var sel = document.getElementById('ehpInspKeuze');
  if (sel) sel.addEventListener('change', function () {
    if (sel.value) _ehpToonKwartier(sel.value);
  });
}

// ─── Aannameblad ─────────────────────────────────────────────────────────────

function _ehpAannamebladHtml(res) {
  if (typeof EHP_PARAMS === 'undefined') return '';
  var rows;
  try { rows = EHP_PARAMS.blad(res.cfg || {}); } catch (e) { return ''; }
  if (!rows || !rows.length) return '';

  var STATUS = {
    aanname:     {lbl: 'aanname',     kleur: '#c0793c'},
    gevalideerd: {lbl: 'gevalideerd', kleur: '#46962b'},
    afgeleid:    {lbl: 'afgeleid',    kleur: '#2c7fb8'}
  };
  var groepen = [], gezien = {};
  rows.forEach(function (r) { if (!gezien[r.groep]) { gezien[r.groep] = 1; groepen.push(r); } });

  var body = groepen.map(function (g) {
    var kop = '<tr><td colspan="5" style="background:#f3f5f2;font-weight:700">' +
      _ehpEsc(g.groepLabel) + '</td></tr>';
    var rijen = rows.filter(function (r) { return r.groep === g.groep; }).map(function (r) {
      var st = STATUS[r.status] || {lbl: r.status, kleur: '#777'};
      var w = r.waarde;
      var tekst = (typeof w === 'number')
        ? (r.eenheid === '€/kWh' || String(r.eenheid).indexOf('€/kWh') === 0 ? _e2(w * 100) + ' ct' : _e2(w))
        : _ehpEsc(String(w == null ? '—' : w));
      return '<tr><td>' + _ehpEsc(r.label) + '</td>' +
        '<td style="font-weight:700">' + tekst + '</td>' +
        '<td style="color:#888">' + _ehpEsc(r.eenheid || '') + '</td>' +
        '<td><span style="color:' + st.kleur + ';font-weight:700">' + st.lbl + '</span></td>' +
        '<td style="font-size:12px;color:#666">' + _ehpEsc(r.bron || '') + '</td></tr>';
    }).join('');
    return kop + rijen;
  }).join('');

  var nAanname = rows.filter(function (r) { return r.status === 'aanname'; }).length;

  return '<div class="cd">' +
    '<div class="ct2"><div class="ac" style="background:#c0793c"></div>Aannameblad</div>' +
    '<div class="ib2" style="margin-bottom:8px">Elke parameter die de uitkomst stuurt, met eenheid, ' +
      'herkomst en status. <strong>' + nAanname + '</strong> van de ' + rows.length + ' waarden staan nog ' +
      'als aanname: die zijn nog niet onderbouwd en de uitkomsten die erop rusten zijn navenant hard. ' +
      '<strong>Afgeleide</strong> waarden worden berekend uit de andere en zijn niet los in te vullen — ' +
      'de kostprijs van zon en opslag horen daarbij, zodat "valideren" een invoerwijziging is en geen ' +
      'discussie over één getal.</div>' +
    '<div style="overflow-x:auto"><table class="verg-tbl"><thead><tr>' +
      '<th>Parameter</th><th>Waarde</th><th>Eenheid</th><th>Status</th><th>Herkomst</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>' +
    '</div>';
}
