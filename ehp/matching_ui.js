/* EHP samenhangende matching en opslag — zijbalk en resultaatweergave.
   Hoort bij ehp/matching*.js (pure rekenlogica); dit bestand doet uitsluitend DOM,
   conform de scheiding die de rest van de app aanhoudt.

   De teksten zijn geschreven voor een bestuur of een deelnemersvergadering, niet voor
   een ontwikkelaar: geen "allocator", "DP" of "objective function", maar wat er met
   iemands stroom en met iemands rekening gebeurt.
*/

// ─── Zijbalk ─────────────────────────────────────────────────────────────────

/**
 * Rendert de instellingen voor matching en opslag. In de bestaande modus staat er
 * alleen de keuzeschakelaar met een korte uitleg; de rest van de afspraken verschijnt
 * pas zodra de samenhangende modus is gekozen, omdat ze daarbuiten niets doen.
 */
function renderEhpMatching(cfg) {
  var el = document.getElementById('ehpMatching');
  if (!el || typeof EhpMatching === 'undefined') return;
  var inst = EhpMatching.lees(cfg || {});
  var nieuw = inst.modus === 'prijsgeoptimaliseerde_opslag_en_matching';

  function veld(key) {
    var def = null;
    for (var i = 0; i < EhpMatching.VELDEN.length; i++)
      if (EhpMatching.VELDEN[i].key === key) def = EhpMatching.VELDEN[i];
    if (!def) return '';
    var waarde = (cfg && cfg[key] != null) ? cfg[key] : def.def;
    var id = 'ehpM_' + key;
    if (def.type === 'keuze') {
      var opts = Object.keys(def.opties).map(function (k) {
        return '<option value="' + k + '"' + (String(waarde) === k ? ' selected' : '') + '>' +
          _ehpEsc(def.opties[k].label) + (def.opties[k].aanbevolen ? ' (aanbevolen)' : '') + '</option>';
      }).join('');
      return '<div class="fgr"><label style="font-size:11px">' + def.label + '</label>' +
        '<select id="' + id + '" onchange="_ehpMatchingGewijzigd()">' + opts + '</select></div>' +
        '<div class="ib2" style="font-size:10px;margin:-2px 0 6px">' +
        _ehpEsc((def.opties[waarde] || {}).uitleg || '') + '</div>';
    }
    if (def.type === 'schakelaar') {
      var aan = !(waarde === 0 || waarde === '0' || waarde === false);
      return '<div class="fgr"><label style="font-size:11px">' + def.label + '</label>' +
        '<select id="' + id + '" onchange="_ehpMatchingGewijzigd()">' +
        '<option value="1"' + (aan ? ' selected' : '') + '>Toegestaan</option>' +
        '<option value="0"' + (!aan ? ' selected' : '') + '>Niet toegestaan</option>' +
        '</select></div>';
    }
    return '<div class="fgr"><label style="font-size:11px">' + def.label +
      (def.eenheid ? ' (' + def.eenheid + ')' : '') + '</label>' +
      '<input type="number" step="any" id="' + id + '" value="' + waarde +
      '" onchange="_ehpMatchingGewijzigd()"></div>';
  }

  var kop = veld('matching_modus');
  if (!nieuw) {
    el.innerHTML = kop +
      '<div class="ib2" style="font-size:10px">De doorrekening werkt zoals altijd: eerst matching ' +
      'binnen de groep, daarna de accu op wat er overblijft. Kies de tweede modus om opslag en ' +
      'matching in samenhang te laten kiezen — dan verschijnen hier de bijbehorende afspraken.</div>';
    return;
  }

  var doelExtra = inst.doel === 'gewogen'
    ? veld('opt_w_afnemer_pct') + veld('opt_w_net_mwh') +
      '<div class="ib2" style="font-size:10px;margin:-2px 0 6px">Het gewicht van het ' +
      'afnemersvoordeel is een factor bovenop de groepswaarde (100% = even zwaar). De straf op ' +
      'netuitwisseling is een bedrag per MWh dat de groep in of uit gaat; hoger betekent meer ' +
      'lokaal houden, ook als dat geld kost.</div>'
    : '';

  var splitExtra = inst.verdeling === 'verdeelsleutel'
    ? veld('opslagwaarde_split_energie') + veld('opslagwaarde_split_batterij') +
      veld('opslagwaarde_split_pool') +
      '<div class="' + (inst.splitGeldig ? 'ib2' : 'opt-warn') + '" style="font-size:10px;margin:-2px 0 6px">' +
      'Samen ' + _e2(inst.splitSom) + '%' + (inst.splitGeldig ? ' — klopt.'
        : ' — dit moet 100% zijn. De doorrekening normaliseert naar rato, maar dat is vrijwel ' +
          'zeker niet de bedoeling.') + '</div>'
    : '';

  el.innerHTML = kop +
    '<div class="st" style="margin-top:10px">Waar stuurt het model op</div>' +
    veld('opt_doel') + doelExtra +
    '<div class="st" style="margin-top:10px">Wat de accu mag</div>' +
    veld('laden_uit_net') +
    '<div class="ib2" style="font-size:10px;margin:-2px 0 6px">Staat dit uit, dan kan de accu ' +
    'alleen lokale opwek verschuiven — en concurreert hij rechtstreeks met directe levering aan ' +
    'afnemers. Staat het aan, dan wordt netinkoop alleen gekozen als het model kan laten zien dat ' +
    'het beter uitpakt dan de alternatieven.</div>' +
    veld('ontladen_naar_epex') +
    '<div class="ib2" style="font-size:10px;margin:-2px 0 6px">Verkoop op de markt mag alleen ' +
    'gekozen worden als er geen interne vraag is, of als de afnemer er aantoonbaar niet slechter ' +
    'van wordt. De afweging staat per kwartier in de inspector.</div>' +
    '<div class="st" style="margin-top:10px">Bescherming</div>' +
    veld('afnemer_bescherming') +
    veld('producent_bescherming') +
    '<div class="st" style="margin-top:10px">Verdeling van de opslagwaarde</div>' +
    veld('opslagwaarde_verdeling') + splitExtra +
    veld('opslagvergoeding_mwh') +
    '<div class="ib2" style="font-size:10px;margin:-2px 0 6px">Contractuele vergoeding voor de ' +
    'opslagdienst. Telt mee in de VERREKENING, niet in de keuze om te laden of te ontladen — die ' +
    'volgt uit rendementsverlies en slijtage. De gemiddelde kostprijs (LCOS) blijft een toets ' +
    'achteraf en is nergens een drempel.</div>' +
    veld('accu_korting_mwh') +
    '<div class="ib2" style="font-size:10px;margin:-2px 0 6px">Wat een afnemer op opgeslagen ' +
    'energie bespaart ten opzichte van het net. Dit bedrag landt meteen bij de afnemer; wat er ' +
    'daarboven aan waarde overblijft volgt de verdeling hierboven.</div>';
}

/** Zijbalk gewijzigd: opslaan en opnieuw tekenen, zodat de toelichtingen meebewegen. */
function _ehpMatchingGewijzigd() {
  var plat = _ehpActive();
  if (!plat) return;
  plat.cfg = plat.cfg || {};
  Object.assign(plat.cfg, _ehpLeesMatching(plat.cfg));
  saveMeta();
  renderEhpMatching(plat.cfg);
}

// ─── Waarschuwingen ──────────────────────────────────────────────────────────

function _ehpMatchWaarschuwingenHtml(res) {
  var lijst = res.matchWaarschuwingen || [];
  if (!lijst.length) return '';
  var kleur = {fout: '#c0392b', 'let op': '#c0793c', info: '#2c7fb8'};
  return '<div class="cd">' +
    '<div class="ct2"><div class="ac" style="background:#c0793c"></div>Aandachtspunten bij deze instellingen</div>' +
    lijst.map(function (w) {
      return '<div style="display:flex;gap:8px;margin-bottom:6px;align-items:flex-start">' +
        '<span style="color:' + (kleur[w.ernst] || '#777') + ';font-weight:700;white-space:nowrap">' +
        _ehpEsc(w.ernst) + '</span>' +
        '<span style="font-size:13px;color:#444">' + _ehpEsc(w.tekst) + '</span></div>';
    }).join('') +
    '</div>';
}

// ─── Routeoverzicht ──────────────────────────────────────────────────────────

/**
 * Waar elke kWh heen ging. Zeven routes, en ze tellen op tot de opwek en de vraag —
 * dat is de hele controle: als een kWh twee keer meetelde, klopte deze tabel niet.
 */
function _ehpRoutesHtml(res) {
  var plan = res.matchPlan;
  if (!plan) return '';
  var b = plan.balans;
  var mwh = function (x) { return fmt((x || 0) / 1000) + ' MWh'; };
  var pct = function (x, y) { return y > 0 ? _e2(x / y * 100) + '%' : '—'; };
  var inst = plan.instellingen;

  var routes = [
    ['Direct intern geleverd', b.directIntern_kWh, 'opwek die rechtstreeks naar een afnemer in de groep ging'],
    ['Opwek naar de accu', b.naarAccu_kWh, 'opwek die is opgeslagen in plaats van direct geleverd of geëxporteerd'],
    ['Uit de accu naar afnemers', b.uitAccuIntern_kWh, 'opgeslagen energie die later binnen de groep is geleverd'],
    ['Uit de accu naar EPEX', b.uitAccuEpex_kWh, 'opgeslagen energie die op de markt is verkocht'],
    ['Direct naar EPEX', b.directExport_kWh, 'opwek die noch intern geleverd, noch opgeslagen kon worden'],
    ['Net naar de accu', b.netNaarAccu_kWh, 'inkoop van het net om te laden'],
    ['Net naar afnemers', b.netNaarAfnemer_kWh, 'vraag die de groep zelf niet kon dekken']
  ];
  var rijen = routes.map(function (r) {
    return '<tr><td style="font-weight:700">' + r[0] + '</td>' +
      '<td>' + mwh(r[1]) + '</td>' +
      '<td>' + pct(r[1], b.opwek_kWh + b.netImport_kWh) + '</td>' +
      '<td style="font-size:12px;color:#666">' + r[2] + '</td></tr>';
  }).join('');

  var basis = plan.basisZonderAccu;
  var netNu = b.netImport_kWh + b.netExport_kWh;
  var netVoor = basis.netImport + basis.netExport;

  var kpis =
    '<div class="kb"><div class="kl">Actieve modus</div><div class="kv" style="font-size:14px">' +
      _ehpEsc(inst.modusLabel) + '</div><div class="ku">' + _ehpEsc(inst.doelLabel) + '</div></div>' +
    '<div class="kb"><div class="kl">Lokaal benut</div><div class="kv" style="font-size:16px">' +
      pct(b.directIntern_kWh + b.uitAccuIntern_kWh, b.verbruik_kWh) + '</div>' +
      '<div class="ku">van het verbruik, direct of via de accu</div></div>' +
    '<div class="kb' + (netNu <= netVoor ? '' : ' red') + '"><div class="kl">Netuitwisseling</div>' +
      '<div class="kv" style="font-size:16px">' + mwh(netNu) + '</div>' +
      '<div class="ku">zonder accu ' + mwh(netVoor) + ' — ' +
      (netVoor > 0 ? _e2((1 - netNu / netVoor) * 100) + '% minder' : 'geen vergelijking') + '</div></div>' +
    '<div class="kb' + (b.sluitend ? '' : ' red') + '"><div class="kl">Balans sluitend</div>' +
      '<div class="kv" style="font-size:16px">' + (b.sluitend ? 'ja' : 'nee') + '</div>' +
      '<div class="ku">opwek + ontladen + inkoop = verbruik + laden + teruglevering</div></div>';

  return '<div class="cd">' +
    '<div class="ct2"><div class="ac" style="background:#2c7fb8"></div>Waar ging elke kWh heen?</div>' +
    '<div class="ib2" style="margin-bottom:8px">' + _ehpEsc(EhpMatching.MODI[inst.modus].uitleg) + '</div>' +
    '<div class="kg" style="margin-bottom:10px">' + kpis + '</div>' +
    '<div style="overflow-x:auto"><table class="verg-tbl"><thead><tr>' +
      '<th>Route</th><th>Volume</th><th>Aandeel</th><th>Wat het betekent</th>' +
      '</tr></thead><tbody>' + rijen + '</tbody></table></div>' +
    '<div class="ib2" style="margin-top:8px">De eerste vijf routes tellen samen op tot alle opwek, ' +
      'de laatste twee tot alle inkoop van het net. Een kWh komt in precies één route voor: ' +
      'wat is opgeslagen telt niet óók als directe levering of directe teruglevering. ' +
      'Verschil in de energiebalans: ' + _e2(b.energieVerschil) + ' kWh.</div>' +
    '</div>';
}

// ─── Verrekening per deelnemer en per accu ───────────────────────────────────

function _ehpMatchVerrekeningHtml(res) {
  var v = res.matchVerrekening;
  if (!v) return '';
  var eur = function (x) { return '€ ' + _e2(x); };
  var ct  = function (x) { return _e2(x * 100) + ' ct'; };
  var inst = v.instellingen;

  // Afnemers
  var afnRijen = v.perAfnemer.map(function (x) {
    return '<tr' + (x.beschermd ? '' : ' style="background:#fdecea"') + '>' +
      '<td style="font-weight:700">' + _ehpEsc(x.Locatie) + '</td>' +
      '<td>' + fmt(x.directIntern_kWh) + '</td>' +
      '<td>' + eur(x.kostenDirectIntern_EUR) + '</td>' +
      '<td>' + fmt(x.uitAccu_kWh) + '</td>' +
      '<td>' + (x.uitAccu_kWh > 0 ? ct(x.prijsUitAccu_EUR_kWh) : '—') + '</td>' +
      '<td>' + fmt(x.netInkoop_kWh) + '</td>' +
      '<td>' + eur(x.netAlternatiefDirect_EUR + x.netAlternatiefUitAccu_EUR) + '</td>' +
      '<td' + (x.besparingVsNet_EUR < 0 ? ' style="color:#c0392b;font-weight:700"' : ' style="font-weight:700"') +
        '>' + _eMoney(x.besparingVsNet_EUR) + '</td></tr>';
  }).join('');

  // Energie-eigenaren
  var assetRijen = v.perAsset.map(function (x) {
    return '<tr><td style="font-weight:700">' + _ehpEsc(x.Asset) + '</td>' +
      '<td>' + _ehpEsc(x.Type_norm) + '</td>' +
      '<td>' + fmt(x.directIntern_kWh) + '</td>' +
      '<td>' + fmt(x.naarAccu_kWh) + '</td>' +
      '<td>' + fmt(x.directExport_kWh) + '</td>' +
      '<td>' + eur(x.opbrengstDirectIntern_EUR) + '</td>' +
      '<td>' + eur(x.opbrengstDirectExport_EUR) + '</td>' +
      '<td>' + eur(x.gegarandeerdBijOpslag_EUR) + '</td>' +
      '<td>' + eur(x.opslagwaarde_EUR) + '</td>' +
      '<td style="font-weight:700">' + eur(x.totaal_EUR) + '</td></tr>';
  }).join('');

  // Accu's
  var accuBlokken = v.perAccu.map(function (a) {
    var post = function (lbl, bedrag, toelichting, dik) {
      return '<tr' + (dik ? ' style="font-weight:700;border-top:2px solid #ddd"' : '') + '>' +
        '<td>' + lbl + '</td>' +
        '<td' + (bedrag < 0 ? ' style="color:#c0392b"' : '') + '>' + _eMoney(bedrag) + '</td>' +
        '<td style="font-size:12px;color:#666">' + toelichting + '</td></tr>';
    };
    return '<div style="margin-bottom:12px">' +
      '<div class="st">' + _ehpEsc(a.naam) + ' — volgorde ' + a.volgorde +
        ' · ' + fmt(a.geladen_kWh) + ' kWh geladen, ' + fmt(a.afgeleverd_kWh) + ' kWh afgeleverd</div>' +
      '<table class="verg-tbl"><thead><tr><th>Post</th><th>Bedrag</th><th>Toelichting</th></tr></thead><tbody>' +
      post('Opbrengst afgeleverde energie', a.energieOpbrengst_EUR,
        fmt(a.afgeleverdIntern_kWh) + ' kWh intern, ' + fmt(a.afgeleverdEpex_kWh) + ' kWh naar EPEX') +
      post('Inkoop energie', -a.energieKosten_EUR,
        'aan producenten hun exportalternatief (' + fmt(a.geladenUitOpwek_kWh) + ' kWh) en aan het net (' +
        fmt(a.geladenUitNet_kWh) + ' kWh)') +
      post('Slijtage', -a.degradatie_EUR, 'marginale degradatiekosten over de doorzet') +
      post('Opslagmarge', a.arbitrageMarge_EUR, 'de waarde die door opslaan is ontstaan', true) +
      post('Aandeel volgens de verdeling', a.aandeelOpslagwaarde_EUR,
        _ehpEsc(inst.verdelingLabel).toLowerCase()) +
      (a.opslagvergoeding_EUR ? post('waarvan opslagvergoeding', a.opslagvergoeding_EUR,
        'contractuele vergoeding voor de opslagdienst') : '') +
      post('Besparing transporttarief', a.piekwaarde_EUR, 'lagere maandpiek en gecontracteerd vermogen') +
      post('Opex', -a.opex_EUR, 'onderhoud en beheer') +
      post('Kapitaallast', -a.kapitaallast_EUR, 'annuïteit over de investering') +
      (a.eigenAansluiting_EUR ? post('Eigen aansluiting', -a.eigenAansluiting_EUR,
        'gecontracteerd vermogen van de accu zelf') : '') +
      post('Resultaat accu-eigenaar', a.resultaatAccuEigenaar_EUR,
        'gaat naar de kostendrager; is dat het platform, dan naar de pool', true) +
      (a.ebVermeden_EUR || a.ebBetaald_EUR
        ? post('Energiebelasting saldo', a.ebVermeden_EUR - a.ebBetaald_EUR,
            'vermeden ' + eur(a.ebVermeden_EUR) + ' − betaald ' + eur(a.ebBetaald_EUR)) : '') +
      '</tbody></table></div>';
  }).join('');

  var c = v.controle;
  var poolRijen =
    '<tr><td>Opslagwaarde naar de pool</td><td>' + _eMoney(v.pool.uitOpslagwaarde_EUR) + '</td></tr>' +
    '<tr><td>Correctie afnemersbescherming</td><td>' + _eMoney(v.pool.correctieAfnemersbescherming_EUR) + '</td></tr>' +
    '<tr><td>Correctie producentenbescherming</td><td>' + _eMoney(v.pool.correctieProducentenbescherming_EUR) + '</td></tr>' +
    '<tr><td>Correctie opslagprijs onder kostprijs</td><td>' + _eMoney(v.pool.correctieOpslagprijs_EUR) + '</td></tr>' +
    '<tr style="font-weight:700;border-top:2px solid #ddd"><td>Te verdelen via de sleutel</td><td>' +
      _eMoney(v.pool.teVerdelen_EUR) + '</td></tr>';

  return '<div class="cd">' +
    '<div class="ct2"><div class="ac" style="background:#46962b"></div>Afnemers — wat betaal je en waarvoor</div>' +
    '<div style="overflow-x:auto"><table class="verg-tbl"><thead><tr>' +
      '<th>Afnemer</th><th>Direct intern kWh</th><th>Kosten direct</th>' +
      '<th>Uit accu kWh</th><th>Prijs uit accu</th><th>Van net kWh</th>' +
      '<th>Netalternatief</th><th>Besparing</th>' +
      '</tr></thead><tbody>' + afnRijen + '</tbody></table></div>' +
    '<div class="ib2" style="margin-top:8px">Het <strong>netalternatief</strong> is wat dezelfde kWh ' +
      'zonder platform had gekost: de marktprijs van dat kwartier plus de ingestelde ' +
      'leveringsopslag. Zolang de besparing niet negatief is, is de afnemer beschermd.</div>' +
    '</div>' +

    '<div class="cd">' +
    '<div class="ct2"><div class="ac" style="background:#fbba00"></div>Energie-eigenaren — waar ging je stroom heen</div>' +
    '<div style="overflow-x:auto"><table class="verg-tbl"><thead><tr>' +
      '<th>Asset</th><th>Bron</th><th>Direct intern</th><th>Naar accu</th><th>Direct naar net</th>' +
      '<th>Opbrengst intern</th><th>Opbrengst export</th><th>Gegarandeerd bij opslag</th>' +
      '<th>Aandeel opslagwaarde</th><th>Totaal</th>' +
      '</tr></thead><tbody>' + assetRijen + '</tbody></table></div>' +
    '<div class="ib2" style="margin-top:8px"><strong>Gegarandeerd bij opslag</strong> is precies wat ' +
      'directe verkoop op de markt had opgeleverd voor de kWh die de accu in ging. Daardoor kun je er ' +
      'door een opslagbeslissing nooit op achteruitgaan. Was de marktprijs op dat moment negatief, dan ' +
      'is dit bedrag ook negatief — teruglevering kostte je dan immers geld, en de accu neemt precies ' +
      'dat over. <strong>Aandeel opslagwaarde</strong> is wat daar volgens de gekozen afspraak (' +
      _ehpEsc(inst.verdelingLabel.toLowerCase()) + ') bovenop komt.</div>' +
    '</div>' +

    (accuBlokken ? '<div class="cd">' +
      '<div class="ct2"><div class="ac" style="background:#c0793c"></div>Per accu</div>' +
      accuBlokken + '</div>' : '') +

    '<div class="cd">' +
    '<div class="ct2"><div class="ac" style="background:#8e44ad"></div>Groepspool en controle</div>' +
    '<table class="verg-tbl"><thead><tr><th>Post</th><th>Bedrag</th></tr></thead><tbody>' +
      poolRijen + '</tbody></table>' +
    '<div class="kg" style="margin-top:10px">' +
      '<div class="kb"><div class="kl">Opslagwaarde gecreëerd</div><div class="kv" style="font-size:16px">' +
        eur(c.opslagwaardeTotaal_EUR) + '</div><div class="ku">opbrengst − inkoop − slijtage</div></div>' +
      '<div class="kb"><div class="kl">Naar energie-eigenaren</div><div class="kv" style="font-size:16px">' +
        eur(c.naarEnergieEigenaren_EUR) + '</div><div class="ku">bovenop hun exportalternatief</div></div>' +
      '<div class="kb"><div class="kl">Naar accu-eigenaren</div><div class="kv" style="font-size:16px">' +
        eur(c.naarAccuEigenaren_EUR) + '</div><div class="ku">arbitragemarge</div></div>' +
      '<div class="kb"><div class="kl">Naar de pool</div><div class="kv" style="font-size:16px">' +
        eur(c.naarPool_EUR) + '</div><div class="ku">volgt de verdeelsleutel</div></div>' +
      '<div class="kb' + (c.sluitend ? '' : ' red') + '"><div class="kl">Sluitend</div>' +
        '<div class="kv" style="font-size:16px">' + (c.sluitend ? 'ja' : 'nee') + '</div>' +
        '<div class="ku">verschil ' + eur(c.verschil_EUR) + '</div></div>' +
      '<div class="kb"><div class="kl">Al bij de afnemer geland</div><div class="kv" style="font-size:16px">' +
        eur(c.afnemersvoordeelDirect_EUR) + '</div><div class="ku">wordt niet nogmaals verdeeld</div></div>' +
    '</div>' +
    '<div class="ib2" style="margin-top:8px">' + _ehpEsc(c.toelichtingDubbeltelling) + '</div>' +
    '</div>';
}

// ─── Herkomst en bestemming van opgeslagen energie ───────────────────────────

function _ehpMatchHerkomstHtml(res) {
  var v = res.matchVerrekening;
  if (!v || !v.herkomst || !v.herkomst.length) return '';
  var eur = function (x) { return '€ ' + _e2(x); };
  var ct  = function (x) { return _e2(x * 100) + ' ct'; };

  var rijen = v.herkomst.map(function (h) {
    var perKwh = h.afgeleverd_ac_kWh > 0 ? h.opbrengst_EUR / h.afgeleverd_ac_kWh : 0;
    var altKwh = h.afgeleverd_ac_kWh > 0 ? h.alternatiefBijLaden_EUR / h.afgeleverd_ac_kWh : 0;
    return '<tr>' +
      '<td style="font-weight:700">' + _ehpEsc(h.bron === 'net' ? 'Net' : h.asset) + '</td>' +
      '<td>' + _ehpEsc(h.bron) + '</td>' +
      '<td>' + _ehpEsc(h.accu) + '</td>' +
      '<td>' + fmt(h.geladen_ac_kWh) + '</td>' +
      '<td>' + fmt(h.verlies_kWh) + '</td>' +
      '<td>' + fmt(h.naarIntern_kWh) + '</td>' +
      '<td>' + fmt(h.naarEpex_kWh) + '</td>' +
      '<td>' + ct(altKwh) + '</td>' +
      '<td>' + ct(perKwh) + '</td>' +
      '<td>' + eur(h.opslagwaarde_EUR) + '</td>' +
      '<td style="font-size:12px;color:#666">' +
        (h.eersteLading ? _ehpEsc(String(h.eersteLading).replace('T', ' ')) : '—') + '</td></tr>';
  }).join('');

  return '<div class="cd">' +
    '<div class="ct2"><div class="ac" style="background:#5fb3df"></div>Herkomst en bestemming van opgeslagen energie</div>' +
    '<div class="ib2" style="margin-bottom:8px">De accu is fysiek een mengvat: er zit geen etiket op ' +
      'een elektron. Voor de verrekening wordt daarom <strong>proportioneel gemengd</strong> — bij ' +
      'ontladen wordt uit elke herkomst geput naar rato van haar aandeel in de voorraad op dat ' +
      'moment, met de bijbehorende inkoopprijs. FIFO zou een volgorde suggereren die er niet is en ' +
      'de uitkomst laten afhangen van een aanname die niemand kan controleren. Dit is een ' +
      '<strong>administratieve toerekening</strong>, geen bewering over natuurkunde.</div>' +
    '<div style="overflow-x:auto"><table class="verg-tbl"><thead><tr>' +
      '<th>Herkomst</th><th>Bron</th><th>Accu</th><th>Geladen kWh</th><th>Verlies kWh</th>' +
      '<th>Naar afnemers</th><th>Naar EPEX</th><th>Alternatief bij laden</th>' +
      '<th>Gerealiseerd</th><th>Opslagwaarde</th><th>Eerste lading</th>' +
      '</tr></thead><tbody>' + rijen + '</tbody></table></div>' +
    '<div class="ib2" style="margin-top:8px"><strong>Alternatief bij laden</strong> is wat die kWh had ' +
      'opgebracht als hij direct naar het net was gegaan — het bedrag dat de eigenaar hoe dan ook ' +
      'ontvangt. <strong>Gerealiseerd</strong> is wat de accu er uiteindelijk voor kreeg. Het verschil, ' +
      'na slijtage, is de opslagwaarde die volgens de gekozen afspraak wordt verdeeld.</div>' +
    '</div>';
}

// ─── Kwartier-inspector ──────────────────────────────────────────────────────

/** Rendert de verklaring van één kwartier in de samenhangende modus. */
function _ehpMatchKwartierHtml(u) {
  var ct  = function (x) { return _e2(x * 100) + ' ct'; };
  var eur = function (x) { return '€ ' + _e2(x); };

  var kop =
    '<div class="kg" style="margin-bottom:10px">' +
      '<div class="kb"><div class="kl">Moment</div><div class="kv" style="font-size:15px">' +
        _ehpEsc(u.tijdKey.replace('T', ' ')) + '</div><div class="ku">kwartier</div></div>' +
      '<div class="kb"><div class="kl">Marktprijs</div><div class="kv" style="font-size:15px">' +
        ct(u.epex) + '</div><div class="ku">EPEX</div></div>' +
      '<div class="kb"><div class="kl">Netalternatief afnemer</div><div class="kv" style="font-size:15px">' +
        ct(u.netAfnemer) + '</div><div class="ku">markt + leveringsopslag</div></div>' +
      '<div class="kb"><div class="kl">Exportalternatief producent</div><div class="kv" style="font-size:15px">' +
        ct(u.exportProducent) + '</div><div class="ku">ondergrens voor elke bron</div></div>' +
      '<div class="kb"><div class="kl">Vraag</div><div class="kv" style="font-size:15px">' +
        _e2(u.vraag) + ' kWh</div><div class="ku">opwek ' + _e2(u.opwek) + ' kWh</div></div>' +
      '<div class="kb"><div class="kl">Doel</div><div class="kv" style="font-size:13px">' +
        _ehpEsc(u.doelLabel) + '</div><div class="ku">afnemersgewicht ' +
        _e2(u.gewichten.afnemer * 100) + '%, netstraf ' + _e2(u.gewichten.netMwh) + ' €/MWh</div></div>' +
    '</div>';

  var bronRijen = u.bronnen.map(function (b) {
    return '<tr' + (b.intern_kWh > 1e-9 ? ' style="background:#eef7ea"' : '') + '>' +
      '<td style="font-weight:700">' + _ehpEsc(b.asset) + '</td>' +
      '<td>' + _ehpEsc(b.bron) + '</td>' +
      '<td>' + ct(b.prijs) + '</td>' +
      '<td>' + _e2(b.opwek_kWh) + '</td>' +
      '<td>' + _e2(b.intern_kWh) + '</td>' +
      '<td>' + _e2(b.naarAccu_kWh) + '</td>' +
      '<td>' + _e2(b.export_kWh) + '</td>' +
      '<td style="font-size:12px;color:#555">' + _ehpEsc(b.reden) + '</td></tr>';
  }).join('');

  var routeRijen = [
    ['Direct intern', u.routes.directIntern], ['Naar de accu', u.routes.naarAccu],
    ['Uit accu naar afnemers', u.routes.uitAccuIntern], ['Uit accu naar EPEX', u.routes.uitAccuEpex],
    ['Direct naar EPEX', u.routes.directExport], ['Net naar accu', u.routes.netNaarAccu],
    ['Net naar afnemers', u.routes.netNaarAfnemer]
  ].map(function (r) {
    return '<tr' + (r[1] > 1e-9 ? ' style="background:#eef7ea"' : '') + '><td>' + r[0] + '</td>' +
      '<td>' + _e2(r[1]) + ' kWh</td></tr>';
  }).join('');

  var accuBlok = u.accus.map(function (a) {
    var opties = a.opties.map(function (o) {
      return '<tr' + (o.gekozen ? ' style="background:#eef7ea;font-weight:700"' : '') + '>' +
        '<td>' + _ehpEsc(o.label) + '</td>' +
        '<td>' + (o.ac_kWh > 0 ? 'laden ' + _e2(o.ac_kWh) : o.ac_kWh < 0 ? 'ontladen ' + _e2(-o.ac_kWh) : '—') + '</td>' +
        '<td>' + (o.toegestaan ? eur(o.doel) : '<span style="color:#c0392b">niet toegestaan</span>') + '</td>' +
        '<td>' + (o.toegestaan ? eur(o.groepsWaarde) : '—') + '</td>' +
        '<td>' + (o.toegestaan ? eur(o.afnemerVoordeel) : '—') + '</td>' +
        '<td>' + (o.toegestaan ? _e2(o.netUitwisseling) + ' kWh' : '—') + '</td>' +
        '<td style="font-size:12px;color:#555">' + _ehpEsc(o.reden) + '</td></tr>';
    }).join('');
    var p = a.prijzen;
    return '<div style="margin-top:12px">' +
      '<div class="st">' + _ehpEsc(a.naam) + ' — vullingsgraad ' + _e2(a.socPct) + '% (' +
        _e2(a.soc_kWh) + ' kWh)</div>' +
      '<div class="ib2" style="margin-bottom:6px"><strong>Bepalende grens:</strong> ' +
        _ehpEsc(a.grens) + '</div>' +
      '<div style="overflow-x:auto"><table class="verg-tbl"><thead><tr>' +
        '<th>Alternatief</th><th>Actie</th><th>Afweging</th><th>Groepswaarde</th>' +
        '<th>Voordeel afnemer</th><th>Netverkeer</th><th>Wat er dan gebeurt</th>' +
        '</tr></thead><tbody>' + opties + '</tbody></table></div>' +
      '<div style="overflow-x:auto;margin-top:8px"><table class="verg-tbl"><thead><tr>' +
        '<th>Prijs</th><th>Laden uit overschot</th><th>Laden van net</th><th>Naar afnemer</th>' +
        '<th>Naar EPEX</th><th>Slijtage</th><th>Opslagvergoeding</th>' +
        '</tr></thead><tbody><tr>' +
        '<td>per kWh</td><td>' + ct(p.exportProducent) + '</td><td>' + ct(p.ladenUitNet) + '</td>' +
        '<td>' + ct(p.opgeslagenWerkelijk || p.opgeslagenIndicatie) + '</td>' +
        '<td>' + ct(p.exportAccu) + '</td><td>' + ct(p.degradatie) + '</td>' +
        '<td>' + ct(p.opslagvergoeding) + '</td></tr></tbody></table></div>' +
      '</div>';
  }).join('');

  var blok = (u.geblokkeerdAfnemer_kWh > 1e-9 || u.geblokkeerdProducent_kWh > 1e-9 ||
              u.korting_EUR > 1e-9 || u.toeslag_EUR > 1e-9)
    ? '<div class="opt-warn" style="margin-top:10px">' +
      (u.geblokkeerdAfnemer_kWh > 1e-9
        ? _e2(u.geblokkeerdAfnemer_kWh) + ' kWh opwek lag boven het netalternatief van de afnemer. ' : '') +
      (u.geblokkeerdProducent_kWh > 1e-9
        ? _e2(u.geblokkeerdProducent_kWh) + ' kWh opwek zou de producent onder zijn exportalternatief brengen. ' : '') +
      (u.korting_EUR > 1e-9 ? 'De pool past ' + eur(u.korting_EUR) + ' bij voor de afnemer. ' : '') +
      (u.toeslag_EUR > 1e-9 ? 'De pool past ' + eur(u.toeslag_EUR) + ' bij voor de producent. ' : '') +
      '</div>' : '';

  return kop +
    '<div class="st">1. De bronnen en hun prijs</div>' +
    '<div style="overflow-x:auto"><table class="verg-tbl"><thead><tr>' +
      '<th>Asset</th><th>Bron</th><th>Prijs</th><th>Opwek kWh</th><th>Direct intern</th>' +
      '<th>Naar accu</th><th>Naar net</th><th>Waarom</th>' +
      '</tr></thead><tbody>' + bronRijen + '</tbody></table></div>' +
    blok +
    (accuBlok ? '<div class="st" style="margin-top:12px">2. De afweging van de accu</div>' + accuBlok : '') +
    '<div class="st" style="margin-top:12px">' + (accuBlok ? '3' : '2') + '. Wat er uiteindelijk gebeurde</div>' +
    '<div style="overflow-x:auto"><table class="verg-tbl"><thead><tr>' +
      '<th>Route</th><th>Volume</th></tr></thead><tbody>' + routeRijen + '</tbody></table></div>' +
    (u.prijsAccuIntern > 0
      ? '<div class="ib2" style="margin-top:6px">Opgeslagen energie ging dit kwartier voor ' +
        ct(u.prijsAccuIntern) + '/kWh naar de afnemers — hun netalternatief was ' + ct(u.netAfnemer) +
        '/kWh, dus ze zijn ' + ct(u.netAfnemer - u.prijsAccuIntern) + '/kWh goedkoper uit.</div>'
      : '') +
    '<div class="ib2" style="margin-top:8px">De kolom <strong>afweging</strong> is de doelfunctie van ' +
      'dit ene kwartier: groepswaarde, plus het gewogen voordeel voor de afnemer, min de straf op ' +
      'netverkeer. De uiteindelijke keuze weegt ook mee wat een actie in latere kwartieren nog ' +
      'oplevert — de accu houdt lading soms bewust vast voor een duurder moment, en dan hoeft de ' +
      'gekozen regel hier niet de hoogste te zijn.</div>';
}
