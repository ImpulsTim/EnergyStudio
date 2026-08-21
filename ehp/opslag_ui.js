/* EHP opslag — zijbalkconfiguratie en resultaatweergave.
   Hoort bij ehp/opslag.js (pure rekenlogica); dit bestand doet uitsluitend DOM en Chart.js,
   conform de scheiding die de rest van de app aanhoudt.

   Accu's staan in cfg.opslag als lijst. Elke accu heeft een `eigenaar`: 'platform' (eigen
   aansluiting) of een deelnemer-id (achter de meter). Dat onderscheid is geen etiket — het
   bepaalt of vermeden energiebelasting meetelt, en dat is doorgaans groter dan de EPEX-spread.
*/

// ─── Zijbalk ─────────────────────────────────────────────────────────────────

// Welke velden in de zijbalk komen, en in welke groep. De rest van EhpOpslag.VELDEN is via
// het aannameregister te bereiken; hier staat wat je per accu daadwerkelijk instelt.
var EHP_ACCU_VELDEN = [
  ['kWh', 'kW'],
  ['capex_kwh', 'opex_kwh_jr'],
  ['levensduur_jr', 'cyclusleven'],
  ['etaLaad_pct', 'etaOntlaad_pct'],
  ['afnameOpslag_mwh', 'terugleverAfslag_mwh'],
  ['eb_kwh', null],
  ['voorspelAfslag_pct', null]
];

function _ehpAccuVeldDef(key) {
  for (var i = 0; i < EhpOpslag.VELDEN.length; i++) {
    if (EhpOpslag.VELDEN[i].key === key) return EhpOpslag.VELDEN[i];
  }
  return null;
}

function _ehpAccus(cfg) {
  if (!cfg) return [];
  if (!Array.isArray(cfg.opslag)) cfg.opslag = [];
  return cfg.opslag;
}

function renderEhpAccus(cfg) {
  var el = document.getElementById('ehpAccuLijst');
  if (!el || typeof EhpOpslag === 'undefined') return;
  var accus = _ehpAccus(cfg);
  if (!accus.length) {
    el.innerHTML = '<div class="ib2" style="font-size:11px">Geen accu. Zonder opslag rekent het ' +
      'platform door zoals voorheen.</div>';
    return;
  }
  var plat = _ehpActive();
  var deelnemers = (plat && plat.members) || [];
  var p = _ehpProj();
  function naamVan(cid) {
    if (!p) return cid;
    for (var i = 0; i < p.companies.length; i++) if (p.companies[i].id === cid) return p.companies[i].name;
    return cid;
  }

  el.innerHTML = accus.map(function (acc, idx) {
    // Drie fiscaal en qua vermogen verschillende posities. De keuze is geen etiket: hij bepaalt
    // welke stroom vrij is van energiebelasting, welk EB-tarief geldt en welke piek je verlaagt.
    var eig = acc.eigenaar || 'groep';
    var eigOpts =
      '<option value="groep"' + (eig === 'groep' ? ' selected' : '') +
        '>Gedeelde aansluiting (energiehub)</option>' +
      deelnemers.map(function (m) {
        return '<option value="' + m.cid + '"' + (eig === m.cid ? ' selected' : '') +
          '>Achter de meter bij ' + _ehpEsc(naamVan(m.cid)) + '</option>';
      }).join('') +
      '<option value="platform"' + (eig === 'platform' ? ' selected' : '') +
        '>Eigen aansluiting</option>';
    // Van wie is de accu financieel? Los van waar hij staat.
    var kd = acc.kostenDrager || 'platform';
    var kdOpts = '<option value="platform"' + (kd === 'platform' ? ' selected' : '') +
        '>Het platform (gedeeld)</option>' +
      deelnemers.map(function (m) {
        return '<option value="' + m.cid + '"' + (kd === m.cid ? ' selected' : '') +
          '>' + _ehpEsc(naamVan(m.cid)) + '</option>';
      }).join('');

    var alleenEigen = !!acc.alleenEigenOverschot && acc.alleenEigenOverschot !== '0';
    var gv   = acc.grootverbruik == null ? true : (!!acc.grootverbruik && acc.grootverbruik !== '0');
    var vrij = (acc.opslagVrijstelling == null ? true : (!!acc.opslagVrijstelling && acc.opslagVrijstelling !== '0')) && gv;
    var eigTip = eig === 'groep'
      ? 'Geldt alleen als de deelnemers fysiek één aansluiting delen. Zijn het losse aansluitingen, dan is stroom tussen deelnemers levering over het net en dus belast.'
      : eig === 'platform'
      ? 'Eigen aansluiting: laden is altijd netafname met energiebelasting, en er komt een eigen gecontracteerd vermogen bij.'
      : 'Alleen het overschot van déze aansluiting is vrij van energiebelasting. Zon van een andere deelnemer reist over het net en is belast.';

    // Transporttarieven uit ST (tarieven.js) — één bron van waarheid voor de piekwaarde.
    var huidigTarief = acc.netTariefType || 'TrafoMSLS';
    var tariefOpts = (typeof ST !== 'undefined' ? Object.keys(ST) : ['TrafoMSLS']).map(function (k) {
      var t = (typeof ST !== 'undefined' && ST[k]) || {l: k, kc: 0, km: 0};
      return '<option value="' + k + '"' + (huidigTarief === k ? ' selected' : '') + '>' +
        _ehpEsc(t.l || k) + ' (' + _e2((+t.kc + +t.km) * 12) + ' €/kW/jr)</option>';
    }).join('');

    var velden = EHP_ACCU_VELDEN.map(function (paar) {
      return paar.map(function (key) {
        if (!key) return '';
        var d = _ehpAccuVeldDef(key);
        if (!d) return '';
        var w = acc[key] != null ? acc[key] : d.def;
        return '<div class="fgr"><label style="font-size:11px">' + d.label +
          (d.eenheid ? ' (' + d.eenheid + ')' : '') + '</label>' +
          '<input type="number" step="any" data-acc-idx="' + idx + '" data-acc-veld="' + key +
          '" value="' + w + '"></div>';
      }).join('');
    }).join('');

    return '<div style="border:1px solid #e3e3e3;border-radius:8px;padding:7px;margin-bottom:6px">' +
      '<div class="fgr"><input type="text" data-acc-idx="' + idx + '" data-acc-veld="naam" ' +
        'value="' + _ehpEsc(acc.naam || 'Accu') + '" style="font-weight:700"></div>' +
      '<div class="fgr"><label style="font-size:11px">Staat achter</label>' +
        '<select data-acc-idx="' + idx + '" data-acc-veld="eigenaar" onchange="_ehpAccuGewijzigd()">' + eigOpts + '</select></div>' +
      '<div class="ib2" style="font-size:10px;margin:-2px 0 6px">' + eigTip + '</div>' +
      '<div class="fgr"><label style="font-size:11px">Rekening voor</label>' +
        '<select data-acc-idx="' + idx + '" data-acc-veld="kostenDrager">' + kdOpts + '</select></div>' +
      '<div class="ib2" style="font-size:10px;margin:-2px 0 6px">Wie de investering en de opex draagt, ' +
        'en wie de besparing op transport krijgt. Het energievoordeel loopt hoe dan ook via de lagere ' +
        'kosten van alle deelnemers — draagt één deelnemer de rekening, dan investeert die alleen terwijl ' +
        'de groep meeprofiteert. Dat is zichtbaar in de Verdeling-tab.</div>' +
      '<div class="fgr"><label style="font-size:11px">Aansluiting</label>' +
        '<select data-acc-idx="' + idx + '" data-acc-veld="grootverbruik">' +
        '<option value="1"' + (gv ? ' selected' : '') + '>Grootverbruik</option>' +
        '<option value="0"' + (!gv ? ' selected' : '') + '>Kleinverbruik</option>' +
        '</select></div>' +
      '<div class="fgr"><label style="font-size:11px">Opslagvrijstelling EB</label>' +
        '<select data-acc-idx="' + idx + '" data-acc-veld="opslagVrijstelling"' + (gv ? '' : ' disabled') + '>' +
        '<option value="1"' + (vrij ? ' selected' : '') + '>Ja — levering aan de opslag onbelast</option>' +
        '<option value="0"' + (!vrij ? ' selected' : '') + '>Nee — EB bij laden én bij verbruik</option>' +
        '</select></div>' +
      '<div class="ib2" style="font-size:10px;margin:-2px 0 6px">' +
        (gv
          ? 'Belastingplan 2022: levering aan een energieopslagfaciliteit is geen belaste levering, mits de exploitant een grootverbruikaansluiting heeft en een verklaring aan de leverancier overlegt. De heffing verschuift naar de levering verderop in de keten. Nadere voorwaarden volgen bij AMvB.'
          : 'De vrijstelling geldt alleen bij een grootverbruikaansluiting. Bij kleinverbruik met saldering ontstaat de dubbele heffing niet.') +
      '</div>' +
      '<div class="fgr"><label style="font-size:11px">Nettarief</label>' +
        '<select data-acc-idx="' + idx + '" data-acc-veld="netTariefType">' + tariefOpts + '</select></div>' +
      '<div class="fgr"><label style="font-size:11px">Laden</label>' +
        '<select data-acc-idx="' + idx + '" data-acc-veld="alleenEigenOverschot">' +
        '<option value="0"' + (!alleenEigen ? ' selected' : '') + '>Ook van het net</option>' +
        '<option value="1"' + (alleenEigen ? ' selected' : '') + '>Alleen uit eigen overschot</option>' +
        '</select></div>' +
      '<div class="ib2" style="font-size:10px;margin:-2px 0 6px">Van het net laden loont vaak méér dan uit eigen ' +
        'overschot: bij een negatieve prijs word je betaald om te laden, terwijl eigen overschot de gemiste ' +
        'exportopbrengst kost. Wil je dat de accu uitsluitend eigen opwek verschuift, zet hem dan op de tweede ' +
        'optie en vergelijk wat dat kost.</div>' +
      velden +
      '<button class="b d" data-acc-del="' + idx + '" style="width:100%;font-size:11px;margin-top:4px">Verwijderen</button>' +
      '</div>';
  }).join('');
}

/** Leest de zijbalk terug naar een accu-lijst. */
function _ehpLeesAccus(bestaand) {
  var el = document.getElementById('ehpAccuLijst');
  if (!el || !el.querySelector('[data-acc-idx]')) return bestaand || [];
  var uit = [];
  el.querySelectorAll('[data-acc-idx]').forEach(function (inp) {
    var i = parseInt(inp.getAttribute('data-acc-idx'), 10);
    var k = inp.getAttribute('data-acc-veld');
    if (!uit[i]) uit[i] = Object.assign(EhpOpslag.defaults(), (bestaand && bestaand[i]) || {});
    if (k === 'naam' || k === 'eigenaar' || k === 'netTariefType' || k === 'kostenDrager' ||
        k === 'opslagVrijstelling' || k === 'grootverbruik' ||
        k === 'alleenEigenOverschot') uit[i][k] = inp.value;
    else { var v = parseFloat(inp.value); uit[i][k] = isNaN(v) ? 0 : v; }
  });
  return uit.filter(Boolean);
}

/** Positie gewijzigd: opslaan en hertekenen, zodat de toelichting meebeweegt. */
function _ehpAccuGewijzigd() {
  var plat = _ehpActive();
  if (!plat) return;
  plat.cfg = plat.cfg || {};
  plat.cfg.opslag = _ehpLeesAccus(plat.cfg.opslag);
  saveMeta();
  renderEhpAccus(plat.cfg);
}

function ehpAccuToevoegen() {
  var plat = _ehpActive();
  if (!plat) { notify('Selecteer eerst een platform', false); return; }
  plat.cfg = plat.cfg || {};
  plat.cfg.opslag = _ehpLeesAccus(plat.cfg.opslag);
  var nieuw = EhpOpslag.defaults();
  nieuw.naam = 'Accu ' + (plat.cfg.opslag.length + 1);
  plat.cfg.opslag.push(nieuw);
  saveMeta();
  renderEhpAccus(plat.cfg);
}

function ehpAccuVerwijderen(idx) {
  var plat = _ehpActive();
  if (!plat || !plat.cfg) return;
  plat.cfg.opslag = _ehpLeesAccus(plat.cfg.opslag);
  plat.cfg.opslag.splice(idx, 1);
  saveMeta();
  renderEhpAccus(plat.cfg);
}

// ─── Resultaat: Opslag-tab ───────────────────────────────────────────────────

function _ehpOpslagHtml(res) {
  var lijst = res.opslag || [];
  if (!lijst.length) return '';

  var blokken = lijst.map(function (o, i) {
    var d = o.dispatch, bc = o.businesscase, a = d.accu;
    var ct = function (x) { return _e2(x * 100) + ' ct'; };
    var eur = function (x) { return '€ ' + _e2(x); };
    var eigLbl = a.eigenaar === 'platform' ? 'eigen aansluiting'
               : a.eigenaar === 'groep'     ? 'gedeelde aansluiting'
                                            : 'achter de meter bij ' + _ehpEsc(o.eigenaarNaam || a.eigenaar);

    // Cyclusaanname versus werkelijkheid — de kern van de terugkoppeling.
    var aanname = EHP_PARAMS.waarde(res.cfg, 'bat_cycli_jr');
    var afwijkt = aanname > 0 && Math.abs(bc.cycliPerJaar - aanname) / aanname > 0.25;

    var tegels =
      '<div class="kb"><div class="kl">Cycli per jaar</div><div class="kv" style="font-size:16px">' +
        Math.round(bc.cycliPerJaar) + '</div><div class="ku">uitkomst van de dispatch, geen aanname</div></div>' +
      '<div class="kb"><div class="kl">Afgeleverd</div><div class="kv" style="font-size:16px">' +
        fmt(bc.afgeleverdPerJaar_kWh / 1000) + ' MWh</div><div class="ku">per jaar, AC-zijde</div></div>' +
      '<div class="kb"><div class="kl">Marge totaal</div><div class="kv" style="font-size:16px">' +
        eur(bc.margePerJaar_EUR) + '</div><div class="ku">per jaar: arbitrage ' +
        eur(bc.arbitragePerJaar_EUR || 0) + ' + piek ' + eur(bc.piekwaardePerJaar_EUR || 0) + '</div></div>' +
      '<div class="kb"><div class="kl">Marge per kWh</div><div class="kv" style="font-size:16px">' +
        ct(bc.margePerKwh_EUR) + '</div><div class="ku">op afgeleverde kWh</div></div>' +
      '<div class="kb' + (bc.dekt ? '' : ' red') + '"><div class="kl">Kostprijs (LCOS)</div><div class="kv" style="font-size:16px">' +
        (isFinite(bc.lcosGerealiseerd_EUR_kWh) ? ct(bc.lcosGerealiseerd_EUR_kWh) : '—') +
        '</div><div class="ku">' + (bc.dekt ? 'marge dekt de kostprijs' : 'marge dekt de kostprijs niet') + '</div></div>' +
      '<div class="kb' + (bc.npv_EUR >= 0 ? '' : ' red') + '"><div class="kl">NPV</div><div class="kv" style="font-size:16px">' +
        eur(bc.npv_EUR) + '</div><div class="ku">over ' + bc.effectieveLevensduur_jr.toFixed(1) + ' jaar</div></div>' +
      '<div class="kb"><div class="kl">Rendabel tot capex</div><div class="kv" style="font-size:16px">' +
        eur(bc.rendabelBijCapex_EUR_kWh) + '/kWh</div><div class="ku">nu ingevuld: € ' + _e2(a.capexKwh) + '/kWh</div></div>' +
      '<div class="kb"><div class="kl">Bindende levensduur</div><div class="kv" style="font-size:16px">' +
        bc.bindendeLevensduur + '</div><div class="ku">' +
        (bc.bindendeLevensduur === 'cycli'
          ? 'cyclusbudget op na ' + bc.jarenTotCyclusEinde.toFixed(1) + ' jaar'
          : 'cyclusbudget wordt niet opgemaakt') + '</div></div>' +
      '<div class="kb"><div class="kl">EB-tarief</div><div class="kv" style="font-size:16px">' +
        ct(bc.ebTarief_EUR_kWh || 0) + '</div><div class="ku">' +
        (bc.ebAfgeleid
          ? 'marginale schijf bij ' + fmt((bc.ebGrondslagKwh || 0) / 1000) + ' MWh/jaar op deze aansluiting'
          : 'handmatig ingesteld') + '</div></div>' +
      '<div class="kb' + ((d.ebVermeden_EUR - d.ebBetaald_EUR) < 0 ? ' red' : '') +
        '"><div class="kl">Energiebelasting saldo</div><div class="kv" style="font-size:16px">' +
        eur(d.ebVermeden_EUR - d.ebBetaald_EUR) + '</div><div class="ku">vermeden ' +
        eur(d.ebVermeden_EUR) + ' − betaald ' + eur(d.ebBetaald_EUR) + '</div></div>' +
      '<div class="kb"><div class="kl">Uit eigen opwek</div><div class="kv" style="font-size:16px">' +
        _e2((d.aandeelEigenOpwek == null ? 1 : d.aandeelEigenOpwek) * 100) + '%</div>' +
        '<div class="ku">van de opgeslagen energie — alleen dat deel levert EB-voordeel op</div></div>' +
      (bc.eigenAansluitingPerJaar_EUR > 0
        ? '<div class="kb red"><div class="kl">Eigen aansluiting</div><div class="kv" style="font-size:16px">−' +
          eur(bc.eigenAansluitingPerJaar_EUR) + '</div><div class="ku">gecontracteerd vermogen ' +
          fmt(a.kW) + ' kW per jaar</div></div>'
        : '');

    // Waar komt de energie vandaan en waar gaat hij heen — dit maakt de "geleverde spread" zichtbaar.
    // De toelichting bij "geladen van het net" verschilt per plek: alleen op de gedeelde
    // aansluiting is opwekAlloc de bron van sig.overschot, dus alleen dáár is een claim over de
    // herkomst (community-overschot vs. echte netimport) door het model te onderbouwen — zie de
    // toelichting bij herkomstLaadstroom() in opslag.js.
    var vanNetToelichting = a.eigenaar === 'platform'
      ? 'eigen aansluiting zonder achterliggend verbruik of opwek — laden is hier altijd netafname'
      : a.eigenaar === 'groep'
      ? 'kwartieren waarin de groep al haar eigen overschot al kwijt was — zie de uitsplitsing per bedrijf hieronder'
      : 'netafname op deze aansluiting; of daar op dat moment elders in de groep nog overschot was, is op dit ' +
        'niveau niet vast te stellen — dat weet alleen een accu op de gedeelde aansluiting';
    var stromen =
      '<table class="verg-tbl"><thead><tr><th>Stroom</th><th>kWh</th><th>Toelichting</th></tr></thead><tbody>' +
      '<tr><td>Geladen uit eigen overschot</td><td>' + fmt(d.inUitOverschot_kWh) + '</td>' +
        '<td style="font-size:12px;color:#666">overschot van deze aansluiting — geen energiebelasting, geen transport</td></tr>' +
      '<tr><td>Geladen van het net</td><td>' + fmt(d.inVanNet_kWh) + '</td>' +
        '<td style="font-size:12px;color:#666">' + vanNetToelichting + ' — ' +
        (a.opslagVrijstelling ? 'EB vrijgesteld, ook op deze kWh: de heffing verschuift naar het verbruik verderop'
                              : 'dus met energiebelasting') + '</td></tr>' +
      '<tr><td>Ontladen in eigen verbruik</td><td>' + fmt(d.uitNaarTekort_kWh) + '</td>' +
        '<td style="font-size:12px;color:#666">vervangt netafname op deze aansluiting' +
        (a.eigenaar === 'platform' ? '' : ', inclusief vermeden energiebelasting') + '</td></tr>' +
      '<tr><td>Ontladen naar het net</td><td>' + fmt(d.uitNaarNet_kWh) + '</td>' +
        '<td style="font-size:12px;color:#666">tegen de terugleverprijs</td></tr>' +
      '</tbody></table>';

    // Per bedrijf hoeveel van hun eigen overschot (en dus: hoeveel van hun teruglevering) de accu
    // heeft opgeslagen. Alleen bij een accu op de gedeelde aansluiting is dit door het model te
    // onderbouwen — zie herkomstLaadstroom() in opslag.js voor waarom.
    var herkomstBlok = '';
    if (o.herkomst && (o.herkomst.perBedrijf.length || o.herkomst.vanNet_kWh > 1e-6)) {
      var totaalLading = o.herkomst.perBedrijf.reduce(function (t, x) { return t + x.kWh; }, 0) + o.herkomst.vanNet_kWh;
      var hpct = function (kwh) { return totaalLading > 0 ? _e2(kwh / totaalLading * 100) + '%' : '—'; };
      var hrijen = o.herkomst.perBedrijf.map(function (x) {
        return '<tr><td>' + _ehpEsc(x.naam) + '</td><td>' + fmt(x.kWh) + '</td><td>' + hpct(x.kWh) + '</td></tr>';
      }).join('');
      herkomstBlok =
        '<div style="margin-top:12px"><div class="st">Herkomst van de laadstroom — per bedrijf</div>' +
        '<table class="verg-tbl"><thead><tr><th>Bedrijf</th><th>kWh in de accu</th><th>Aandeel</th></tr></thead><tbody>' +
        hrijen +
        '<tr><td>Net (geen lokaal overschot meer beschikbaar dat kwartier)</td><td>' +
          fmt(o.herkomst.vanNet_kWh) + '</td><td>' + hpct(o.herkomst.vanNet_kWh) + '</td></tr>' +
        '</tbody></table>' +
        '<div class="ib2" style="margin-top:6px">Per kwartier verdeeld naar rato van ieders eigen resterende ' +
        'overschot dat moment (uit de gelijktijdigheidsmatching) — geen schatting op jaarbasis, maar de ' +
        'werkelijke bron per kwartier. Alleen echte netimport (onderste rij) is nooit iemands teruglevering: ' +
        'die kwartieren was alle overschot van de groep al elders benut of op.</div></div>';
    }

    // Waarom bleef beschikbaar overschot of tekort liggen? Dit is doorgaans de eerste vraag
    // bij een uitkomst die tegen de intuïtie ingaat, en het antwoord staat in de dispatch.
    var b = d.benutting || {};
    var pct = function (deel, geheel) { return geheel > 0 ? _e2(deel / geheel * 100) + '%' : '—'; };
    var mwh = function (x) { return fmt((x || 0) / 1000) + ' MWh'; };
    var ruimte =
      '<table class="verg-tbl"><thead><tr><th>Eigen overschot</th><th>kWh</th><th>Aandeel</th></tr></thead><tbody>' +
      '<tr style="font-weight:700"><td>Beschikbaar in de periode</td><td>' + mwh(b.beschikbaarOverschot_kWh) + '</td><td>100%</td></tr>' +
      '<tr><td>Opgeslagen</td><td>' + mwh(b.opgenomen_kWh) + '</td><td>' + pct(b.opgenomen_kWh, b.beschikbaarOverschot_kWh) + '</td></tr>' +
      '<tr><td>Gemist: accu zat vol</td><td>' + mwh(b.gemistOmdatVol_kWh) + '</td><td>' + pct(b.gemistOmdatVol_kWh, b.beschikbaarOverschot_kWh) + '</td></tr>' +
      '<tr><td>Gemist: op vermogensgrens</td><td>' + mwh(b.gemistOpVermogen_kWh) + '</td><td>' + pct(b.gemistOpVermogen_kWh, b.beschikbaarOverschot_kWh) + '</td></tr>' +
      '<tr><td>Gemist: laden loonde niet</td><td>' + mwh(b.gemistOnrendabel_kWh) + '</td><td>' + pct(b.gemistOnrendabel_kWh, b.beschikbaarOverschot_kWh) + '</td></tr>' +
      '</tbody></table>' +
      '<table class="verg-tbl" style="margin-top:8px"><thead><tr><th>Eigen tekort</th><th>kWh</th><th>Aandeel</th></tr></thead><tbody>' +
      '<tr style="font-weight:700"><td>Beschikbaar in de periode</td><td>' + mwh(b.beschikbaarTekort_kWh) + '</td><td>100%</td></tr>' +
      '<tr><td>Gedekt door de accu</td><td>' + mwh(b.gedekt_kWh) + '</td><td>' + pct(b.gedekt_kWh, b.beschikbaarTekort_kWh) + '</td></tr>' +
      '<tr><td>Gemist: accu was leeg</td><td>' + mwh(b.gemistOmdatLeeg_kWh) + '</td><td>' + pct(b.gemistOmdatLeeg_kWh, b.beschikbaarTekort_kWh) + '</td></tr>' +
      '<tr><td>Gemist: op vermogensgrens</td><td>' + mwh(b.gemistOpVermogenUit_kWh) + '</td><td>' + pct(b.gemistOpVermogenUit_kWh, b.beschikbaarTekort_kWh) + '</td></tr>' +
      '<tr><td>Gemist: ontladen loonde niet</td><td>' + mwh(b.gemistOnrendabelUit_kWh) + '</td><td>' + pct(b.gemistOnrendabelUit_kWh, b.beschikbaarTekort_kWh) + '</td></tr>' +
      '</tbody></table>' +
      '<div class="ib2" style="margin-top:6px">Vol of leeg wijst op een te kleine accu, de vermogensgrens op te weinig ' +
      'kW. Staat er veel bij <em>loonde niet</em>, dan is de accu groot genoeg maar dekt de prijsspread de slijtage ' +
      'niet: dat is een prijsvraagstuk, geen maatvraagstuk. Let op welke aansluiting hierboven staat — bij een accu ' +
      'achter de meter van één deelnemer gaat het om diens overschot en tekort, niet dat van de groep.</div>';

    var waarschuwing = afwijkt
      ? '<div class="opt-warn">Het aannameregister rekent met ' + aanname + ' cycli per jaar, de dispatch ' +
        'komt uit op ' + Math.round(bc.cycliPerJaar) + '. De kostprijs per kWh in het register klopt daardoor niet; ' +
        'pas de aanname aan of neem de hier berekende LCOS.</div>'
      : '';

    return '<div class="cd">' +
      '<div class="ct2"><div class="ac" style="background:#c0793c"></div>' + _ehpEsc(a.naam) +
        ' — ' + fmt(a.kWh) + ' kWh / ' + fmt(a.kW) + ' kW · ' + eigLbl + '</div>' +
      waarschuwing +
      '<div class="kg">' + tegels + '</div>' +
      '<div class="ib2" style="margin-top:8px">Marginale kosten per kWh doorzet: ' +
        ct(d.marginaleKostenPerKwh) + '. Dat is de drempel die de dispatch hanteert — capex is ' +
        'verzonken zodra de accu er staat, dus draaien loont zodra de spread de slijtage dekt. ' +
        'Of de investering terugkomt is de aparte som hierboven (NPV en kostprijs).</div>' +
      '<div class="ib2">' + (d.opslagVrijstelling
        ? 'Met de opslagvrijstelling is laden van het net onbelast; de energiebelasting verschuift naar ' +
          'het verbruik verderop. Ten opzichte van geen accu betaal je over die kWh dus even veel EB — ' +
          'één keer. Echt EB-voordeel ontstaat alleen op stroom uit eigen opwek achter dezelfde meter: ' +
          'die was nooit belast en vervangt bij ontlading wél belaste netafname.'
        : 'Zonder vrijstelling wordt er tweemaal geheven: bij het laden én bij het verbruik verderop. ' +
          'Dat is de situatie die het Belastingplan 2022 repareert.') + '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:12px">' +
        '<div><div class="st">Energiestromen</div>' + stromen + '</div>' +
        '<div><div class="st">Benutting — is er nog ruimte?</div>' + ruimte + '</div>' +
      '</div>' +
      herkomstBlok +
      _ehpPiekHtml(o) +
      '<div class="cw" style="height:220px;margin-top:12px"><canvas id="cEhpSoc' + i + '" role="img"></canvas></div>' +
      '<div class="ib2">SoC-duurkromme: welk deel van de tijd de accu boven een bepaalde vullingsgraad zat. ' +
        'Een kromme die lang op 100% of 0% plakt, wijst op een accu die te klein is voor het patroon; ' +
        'een vlakke kromme rond het midden op een accu die zijn bereik niet gebruikt.</div>' +
      '</div>';
  }).join('');

  var gastheerBlok =
    '<div class="cd">' +
      '<div class="ct2"><div class="ac" style="background:#2c7fb8"></div>Waar zet je de accu neer?</div>' +
      '<div class="ib2" style="margin-bottom:8px">Rekent dezelfde accu door op elke mogelijke plek: ' +
      'achter een gedeelde aansluiting, achter de meter bij elke deelnemer, of op een eigen aansluiting. ' +
      'De plek bepaalt drie dingen tegelijk — welke stroom vrij is van energiebelasting, welk EB-tarief ' +
      'geldt (de staffel is degressief per aansluiting), en welke piek je verlaagt. Duurt enkele seconden ' +
      'per deelnemer.</div>' +
      '<button class="b dk" id="btnEhpGastheren" style="width:auto;padding:6px 14px">Vergelijk plekken</button>' +
      '<div id="ehpGastherenUit"></div>' +
    '</div>';

  var sweepBlok =
    '<div class="cd">' +
      '<div class="ct2"><div class="ac" style="background:#8e44ad"></div>Optimale maat</div>' +
      '<div class="ib2" style="margin-bottom:8px">Rekent de eerste accu door op een reeks maten en zet de ' +
      'marginale waarde van de laatste kWh naast de marginale kosten. Waar de waarde onder de kosten zakt, ' +
      'houdt uitbreiden op. Dit duurt tien tot twintig seconden op een heel jaar, want elke maat wordt op ' +
      'twee SoC-rasters doorgerekend om te controleren of het antwoord stabiel is.</div>' +
      '<button class="b dk" id="btnEhpSweep" style="width:auto;padding:6px 14px">Bereken optimale maat</button>' +
      '<div id="ehpSweepUit"></div>' +
    '</div>';

  // Het kansenpaneel staat bovenaan: eerst de vraag of deze instelling werkt, dan pas de
  // uitkomstrapportage van de dispatch die eronder staat.
  var kansenBlok = typeof _ehpKansenHtml === 'function' ? _ehpKansenHtml(res) : '';
  return kansenBlok + blokken + gastheerBlok + sweepBlok;
}

/**
 * Piekreductie: de ruil tussen arbitrage en transportbesparing.
 * Een accu die lading vrijhoudt om de middagpiek af te toppen, kan diezelfde energie niet
 * verhandelen. Beide getallen naast elkaar zetten is het hele punt — kiezen tussen de twee
 * is een beslissing van de gebruiker, niet van het model.
 */
function _ehpPiekHtml(o) {
  var pk = o.piek;
  if (!pk || !pk.curve || !pk.curve.length) return '';
  var eur = function (x) { return '€ ' + _e2(x); };
  var k = pk.conflict;
  var a = EhpOpslag.lees(o.cfg);

  var rijen = pk.curve.map(function (c) {
    var isBeste = c === pk.beste;
    return '<tr' + (isBeste ? ' style="background:#eef7ea;font-weight:700"' : '') + '>' +
      '<td>' + fmt(c.capKw) + ' kW</td>' +
      '<td>' + fmt(c.bereikteJaarpiek_kW) + ' kW' +
        (c.capGehaald ? '' : ' <span style="color:#c0392b">niet gehaald</span>') + '</td>' +
      '<td>' + eur(c.arbitrageMarge_EUR) + '</td>' +
      '<td>' + eur(c.kmBesparing_EUR) + '</td>' +
      '<td>' + eur(c.kcBesparing_EUR) + '</td>' +
      '<td>' + eur(c.totaal_EUR) + '</td>' +
      '<td>' + Math.round(c.cycli) + '</td></tr>';
  }).join('');

  return '<div style="margin-top:14px;padding-top:12px;border-top:1px solid #eee">' +
    '<div class="st">Piekreductie — transporttarief ' +
      _ehpEsc((typeof ST !== 'undefined' && ST[a.netTariefType] && ST[a.netTariefType].l) || a.netTariefType) +
      ' (' + _e2((a.kcPerKwMnd + a.kmPerKwMnd) * 12) + ' €/kW/jaar)</div>' +
    '<div class="kg">' +
      '<div class="kb"><div class="kl">Jaarpiek zonder accu</div><div class="kv" style="font-size:16px">' +
        fmt(pk.basisJaarpiek_kW) + ' kW</div><div class="ku">hoogste netafname</div></div>' +
      '<div class="kb"><div class="kl">Piekverlaging</div><div class="kv" style="font-size:16px">' +
        fmt(k.piekVerlaging_kW) + ' kW</div><div class="ku">naar ' + fmt(pk.beste.bereikteJaarpiek_kW) + ' kW</div></div>' +
      '<div class="kb"><div class="kl">Opbrengst piekverlaging</div><div class="kv" style="font-size:16px">' +
        eur(k.piekOpbrengst_EUR) + '</div><div class="ku">bespaard transporttarief</div></div>' +
      '<div class="kb' + (k.arbitrageVerlies_EUR > k.piekOpbrengst_EUR ? ' red' : '') +
        '"><div class="kl">Kosten in gemiste arbitrage</div><div class="kv" style="font-size:16px">' +
        eur(k.arbitrageVerlies_EUR) + '</div><div class="ku">' +
        (k.arbitrageVerlies_EUR > 0
          ? _e2(k.piekOpbrengst_EUR / k.arbitrageVerlies_EUR) + '× terugverdiend'
          : 'geen arbitrage opgegeven') + '</div></div>' +
    '</div>' +
    '<div style="overflow-x:auto;margin-top:10px"><table class="verg-tbl"><thead><tr>' +
      '<th>Nagestreefde cap</th><th>Bereikte jaarpiek</th><th>Arbitragemarge</th>' +
      '<th>Besparing maandpiek</th><th>Besparing contractvermogen</th><th>Totaal</th><th>Cycli</th>' +
      '</tr></thead><tbody>' + rijen + '</tbody></table></div>' +
    '<div class="ib2" style="margin-top:8px">Elke regel is een doorrekening waarin de accu zijn ' +
      'netafname onder de genoemde grens probeert te houden. Strakker aftoppen levert meer ' +
      'transportbesparing op en kost arbitragemarge; de gemarkeerde regel is het beste totaal. ' +
      '<strong>Besparing contractvermogen</strong> telt alleen mee als je het gecontracteerde vermogen ' +
      'daadwerkelijk verlaagt bij de netbeheerder — dat is een contractwijziging, geen automatisch gevolg. ' +
      'Een cap die niet gehaald wordt, betekent dat de accu de piek op enig moment niet aankon.</div>' +
    '</div>';
}

/** Tekent de SoC-duurkrommes; aangeroepen na het invoegen van de HTML. */
function _ehpTekenSocKrommes(res) {
  (res.opslag || []).forEach(function (o, i) {
    var cv = document.getElementById('cEhpSoc' + i);
    if (!cv || typeof Chart === 'undefined') return;
    var punten = EhpOpslag.socDuurkromme(o.dispatch, 120);
    if (!punten.length) return;
    dC('ehpSoc' + i);
    CH['ehpSoc' + i] = new Chart(cv, {
      type: 'line',
      data: {labels: punten.map(function (p) { return _e2(p.pct); }),
        datasets: [{label: 'Vullingsgraad', data: punten.map(function (p) { return +p.soc.toFixed(1); }),
          borderColor: '#c0793c', backgroundColor: 'rgba(192,121,60,.12)', fill: true,
          pointRadius: 0, borderWidth: 2, tension: 0.1}]},
      options: {responsive: true, maintainAspectRatio: false,
        plugins: {legend: {display: false},
          tooltip: {callbacks: {title: function (c) { return c[0].label + '% van de tijd hoger dan:'; },
            label: function (c) { return c.raw + '% SoC'; }}}},
        scales: {x: Object.assign(ax('% van de tijd'), {ticks: {maxTicksLimit: 11, color: '#888'}}),
          y: Object.assign(ax('SoC %'), {min: 0, max: 100})}}
    });
  });
}

/** Sizing-sweep op verzoek — te traag om automatisch mee te draaien. */
function ehpBerekenSweep() {
  var res = _ehpLast;
  if (!res || !res.opslag || !res.opslag.length) return;
  var uit = document.getElementById('ehpSweepUit');
  var knop = document.getElementById('btnEhpSweep');
  if (!uit) return;
  uit.innerHTML = '<div class="ib2">Bezig met doorrekenen…</div>';
  if (knop) knop.disabled = true;
  // Uit de renderlus halen zodat de melding zichtbaar wordt voordat het rekenen begint.
  setTimeout(function () {
    var sw;
    try { sw = EhpOpslag.sweep(res.model, res.opslag[0].cfg, {discontoPct: EHP_PARAMS.waarde(res.cfg, 'disconto_pct')}); }
    catch (e) { console.error('sweep:', e); uit.innerHTML = '<div class="opt-warn">Doorrekenen mislukt.</div>';
      if (knop) knop.disabled = false; return; }
    var rijen = sw.stappen.map(function (s) {
      var scherp = s.marginaleWaardeScherp;
      return '<tr' + (sw.optimum && s.kWh === sw.optimum.kWh ? ' style="background:#eef7ea;font-weight:700"' : '') + '>' +
        '<td>' + fmt(s.kWh) + '</td><td>' + fmt(s.kW) + '</td>' +
        '<td>€ ' + _e2(s.brutoMargePerJaar_EUR) + '</td>' +
        '<td>€ ' + _e2(s.marginaleWaardePerKwh_EUR_jr) +
          (scherp ? '' : ' <span style="color:#999">± ' + _e2(s.marginaleWaardeOnzekerheid_EUR_jr) + '</span>') + '</td>' +
        '<td>€ ' + _e2(s.marginaleKostenPerKwh_EUR_jr) + '</td>' +
        '<td>' + Math.round(s.cycliPerJaar) + '</td>' +
        '<td>' + (s.betrouwbaar ? _e2(s.rasterAfwijking * 100) + '%' : 'niet stabiel') + '</td></tr>';
    }).join('');
    uit.innerHTML =
      '<div style="overflow-x:auto;margin-top:10px"><table class="verg-tbl"><thead><tr>' +
      '<th>kWh</th><th>kW</th><th>Bruto marge/jaar</th><th>Marginale waarde €/kWh/jr</th>' +
      '<th>Marginale kosten €/kWh/jr</th><th>Cycli/jr</th><th>Rasterafwijking</th>' +
      '</tr></thead><tbody>' + rijen + '</tbody></table></div>' +
      '<div class="ib2" style="margin-top:8px">' +
        (sw.optimum
          ? 'Grootste maat waarvan de marginale waarde de marginale kosten aantoonbaar dekt: <strong>' +
            fmt(sw.optimum.kWh) + ' kWh / ' + fmt(sw.optimum.kW) + ' kW</strong>.'
          : 'Bij deze capex dekt geen enkele maat zijn marginale kosten.') +
        ' De marginale waarde is een verschil van twee doorrekeningen; waar de foutmarge erachter staat, ' +
        'is dat verschil kleiner dan de rekenonnauwkeurigheid en valt er geen conclusie aan te verbinden.</div>' +
      '<div class="ib2">' + _ehpEsc(sw.resolutieNotitie) + '</div>';
    if (knop) knop.disabled = false;
  }, 30);
}

// ─── Vergelijking van plekken ────────────────────────────────────────────────

/**
 * Draait dezelfde accu door op elke mogelijke plek. Op verzoek, want het zijn drie
 * doorrekeningen per plek en dat loopt op met het aantal deelnemers.
 */
function ehpVergelijkGastheren() {
  var res = _ehpLast;
  if (!res || !res.opslag || !res.opslag.length) return;
  var uit = document.getElementById('ehpGastherenUit');
  var knop = document.getElementById('btnEhpGastheren');
  if (!uit) return;
  uit.innerHTML = '<div class="ib2">Bezig met doorrekenen…</div>';
  if (knop) knop.disabled = true;

  setTimeout(function () {
    var kandidaten = Object.keys(res.ledenNetto || {}).map(function (cid) {
      var rec = res.ledenNetto[cid];
      var arr = new Float64Array(res.model.length);
      for (var i = 0; i < res.model.length; i++) arr[i] = rec.map[res.model[i].tijdKey] || 0;
      return {id: cid, naam: rec.naam, netto: arr};
    });
    var v;
    try {
      v = EhpOpslag.vergelijkGastheren(res.model, res.opslag[0].cfg, kandidaten,
        {discontoPct: EHP_PARAMS.waarde(res.cfg, 'disconto_pct')});
    } catch (e) {
      console.error('vergelijkGastheren:', e);
      uit.innerHTML = '<div class="opt-warn">Doorrekenen mislukt.</div>';
      if (knop) knop.disabled = false;
      return;
    }
    var eur = function (x) { return '€ ' + _e2(x); };
    var rijen = v.plekken.map(function (p) {
      var best = p === v.beste;
      return '<tr' + (best ? ' style="background:#eef7ea;font-weight:700"' : '') + '>' +
        '<td>' + _ehpEsc(p.naam) + '</td>' +
        '<td>' + _e2(p.ebTarief_EUR_kWh * 100) + ' ct</td>' +
        '<td>' + fmt(p.geladenUitEigenOverschot_kWh / 1000) + ' MWh</td>' +
        '<td>' + fmt(p.geladenVanNet_kWh / 1000) + ' MWh</td>' +
        '<td' + (p.ebSaldo_EUR < 0 ? ' style="color:#c0392b"' : '') + '>' + eur(p.ebSaldo_EUR) + '</td>' +
        '<td>' + eur(p.arbitrage_EUR) + '</td>' +
        '<td>' + eur(p.piekwaarde_EUR) + '</td>' +
        '<td' + (p.eigenAansluiting_EUR > 0 ? ' style="color:#c0392b"' : '') + '>' +
          (p.eigenAansluiting_EUR > 0 ? '−' + eur(p.eigenAansluiting_EUR) : '—') + '</td>' +
        '<td' + (p.nettoPerJaar_EUR < 0 ? ' style="color:#c0392b"' : '') + '>' + eur(p.nettoPerJaar_EUR) + '</td>' +
        '<td>' + eur(p.rendabelBijCapex_EUR_kWh) + '</td></tr>';
    }).join('');

    uit.innerHTML =
      '<div style="overflow-x:auto;margin-top:10px"><table class="verg-tbl"><thead><tr>' +
      '<th>Plek</th><th>EB-tarief</th><th>Laden uit eigen overschot</th><th>Laden van het net</th>' +
      '<th>EB-saldo/jr</th><th>Arbitrage/jr</th><th>Piekwaarde/jr</th><th>Eigen aansluiting/jr</th>' +
      '<th>Netto/jr</th><th>Rendabel tot capex</th>' +
      '</tr></thead><tbody>' + rijen + '</tbody></table></div>' +
      '<div class="ib2" style="margin-top:8px"><strong>Beste plek: ' + _ehpEsc(v.beste.naam) + '</strong> ' +
        'met ' + eur(v.beste.nettoPerJaar_EUR) + ' netto per jaar. ' +
        'Netto is na opex, kapitaallast en eventuele eigen aansluitkosten.</div>' +
      '<ul class="ib2" style="margin-top:6px;padding-left:18px">' +
        v.aannames.map(function (a) { return '<li style="margin-bottom:3px">' + _ehpEsc(a) + '</li>'; }).join('') +
      '</ul>';
    if (knop) knop.disabled = false;
  }, 30);
}
