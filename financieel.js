// Financiële jaarrekening — UI-tabblad. Koppelt rekenkern.js (buildAnnualComparison /
// settlePlatform / distributeBenefit) aan de app: huidige situatie vs. platformscenario per
// bedrijf én geconsolideerd, met grafieken, gevoeligheidsanalyse, exports en methodologie.
// Pure rekenlogica blijft in rekenkern.js; dit bestand doet DOM, IndexedDB en Chart.js.

var _finEhpId=null;   // geselecteerd platform
var _finLast=null;    // laatste resultaat {r, ehp, assumptions, prices, members}

// --- Helpers -----------------------------------------------------------------

function _finEsc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function _finEur(n){return (Math.round(n*100)/100).toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2});}
function _finEur0(n){return Math.round(n||0).toLocaleString('nl-NL');}
function _finPrijs(n){return (Math.round(n*1000)/1000).toLocaleString('nl-NL',{minimumFractionDigits:3,maximumFractionDigits:3});}
function _finMoney(n){return (n>=0?'+':'−')+' € '+_finEur(Math.abs(n));}
function _finPct(n){return (n>=0?'+':'−')+Math.abs(n).toFixed(1)+'%';}

function _finProj(){return (typeof ap==='function')?ap():null;}
function _finActiveEhp(){
  var p=_finProj();if(!p||!Array.isArray(p.ehps))return null;
  for(var i=0;i<p.ehps.length;i++)if(p.ehps[i].id===_finEhpId)return p.ehps[i];
  return null;
}
function _finDefaults(){
  return {fallbackPrice:0.10,leveranciersOpslag:0.02,terugleverAfslag:0.01,onbalansOpslag:0.00,
    platformkosten:0.005,platformkostenMode:'kwh',btwPct:21,ebOn:true,ebJaar:'2025',ebGrondslag:'externeLevering',heffingskorting:0,
    netOn:true,collSA:'TrafoMSLS',collST:'TrafoMSLS',collGtv:500,collContract:500,overschr:0,verdeel:'geen'};
}
function _finEbStaffel(jaar){
  var eb=REKEN_DEFAULTS.energiebelasting;
  if(jaar&&eb.staffels&&eb.staffels[jaar])return eb.staffels[jaar];
  return eb.staffel;
}

// --- Rendering: sidebar ------------------------------------------------------

function renderFin(){
  var p=_finProj();
  var sel=document.getElementById('finEhpSel');
  if(!sel)return;
  var ehps=(p&&p.ehps)||[];
  if(!_finActiveEhp())_finEhpId=ehps.length?ehps[0].id:null;
  sel.innerHTML=ehps.length
    ?ehps.map(function(e){return '<option value="'+e.id+'"'+(e.id===_finEhpId?' selected':'')+'>'+_finEsc(e.name||'Platform')+'</option>';}).join('')
    :'<option value="">— geen platform —</option>';
  var ehp=_finActiveEhp();
  document.getElementById('finCfgWrap').style.display=ehp?'':'none';
  if(!ehp){
    document.getElementById('finResults').innerHTML='<div class="verg-empty"><div class="big">€</div>Maak eerst een handelsplatform aan in het tabblad <strong>Energiehandelsplatform</strong>.</div>';
    return;
  }
  _finCfgToForm(ehp);
  _finUpdateIntPrijzen(ehp);
  _finUpdatePriceInfo();
}

function _finUpdateIntPrijzen(ehp){
  var c=ehp.cfg||{};
  var el=document.getElementById('finIntPrijzen');
  if(el)el.innerHTML='Interne prijzen uit platform: zon € '+_finPrijs(c.pZon||0)+' · wind € '+_finPrijs(c.pWind||0)+' · overig € '+_finPrijs(c.pOverig||0)+' /kWh.';
}

function _finCfgToForm(ehp){
  var d=_finDefaults();var f=ehp.finCfg||{};
  function v(id,val){var el=document.getElementById(id);if(el)el.value=val;}
  function chk(id,val){var el=document.getElementById(id);if(el)el.checked=val!==false;}
  v('finFallback',f.fallbackPrice!=null?f.fallbackPrice:d.fallbackPrice);
  v('finLevOpslag',f.leveranciersOpslag!=null?f.leveranciersOpslag:d.leveranciersOpslag);
  v('finTerugAfslag',f.terugleverAfslag!=null?f.terugleverAfslag:d.terugleverAfslag);
  v('finOnbalans',f.onbalansOpslag!=null?f.onbalansOpslag:d.onbalansOpslag);
  v('finPlatformkosten',f.platformkosten!=null?f.platformkosten:d.platformkosten);
  v('finPlatformkostenMode',f.platformkostenMode||d.platformkostenMode);
  v('finBtwPct',f.btwPct!=null?f.btwPct:d.btwPct);
  chk('finEbOn',f.ebOn);
  v('finEbJaar',f.ebJaar!=null?f.ebJaar:d.ebJaar);
  v('finEbGrondslag',f.ebGrondslag||d.ebGrondslag);
  v('finHeffing',f.heffingskorting!=null?f.heffingskorting:d.heffingskorting);
  chk('finNetOn',f.netOn);
  v('finCollSA',f.collSA||d.collSA);
  v('finCollST',f.collST||d.collST);
  v('finCollGtv',f.collGtv!=null?f.collGtv:d.collGtv);
  v('finCollContract',f.collContract!=null?f.collContract:d.collContract);
  v('finOverschr',f.overschr!=null?f.overschr:d.overschr);
  v('finVerdeel',f.verdeel||d.verdeel);
}

function _finReadForm(){
  function num(id,d){var el=document.getElementById(id);if(!el)return d;var x=parseFloat(el.value);return isNaN(x)?d:x;}
  function val(id){var el=document.getElementById(id);return el?el.value:'';}
  function chk(id){var el=document.getElementById(id);return el?el.checked:true;}
  return {
    fallbackPrice:num('finFallback',0.10),leveranciersOpslag:num('finLevOpslag',0),terugleverAfslag:num('finTerugAfslag',0),
    onbalansOpslag:num('finOnbalans',0),platformkosten:num('finPlatformkosten',0),platformkostenMode:val('finPlatformkostenMode')||'kwh',btwPct:num('finBtwPct',21),
    ebOn:chk('finEbOn'),ebJaar:val('finEbJaar'),ebGrondslag:val('finEbGrondslag'),heffingskorting:num('finHeffing',0),
    netOn:chk('finNetOn'),collSA:val('finCollSA'),collST:val('finCollST'),collGtv:num('finCollGtv',0),
    collContract:num('finCollContract',0),overschr:num('finOverschr',0),verdeel:val('finVerdeel')
  };
}

function _finPersistCfg(){
  var ehp=_finActiveEhp();if(!ehp)return null;
  ehp.finCfg=_finReadForm();
  if(typeof saveMeta==='function')saveMeta();
  return ehp.finCfg;
}

// Bouwt het assumptions-object voor de rekenkern uit het formulier + EHP interne prijzen.
function _finAssumptions(f,ehp){
  var c=ehp.cfg||{};
  return {
    internalPrices:{zon:c.pZon||0,wind:c.pWind||0,overig:c.pOverig||0},
    leveranciersOpslag:f.leveranciersOpslag,terugleverAfslag:f.terugleverAfslag,
    platformkosten:f.platformkostenMode==='dag'?0:f.platformkosten,
    platformkostenDag:f.platformkostenMode==='dag'?f.platformkosten:0,
    onbalansOpslag:f.onbalansOpslag,fallbackPrice:f.fallbackPrice,
    btwPct:f.btwPct/100,ebToepassen:f.ebOn,ebJaar:f.ebJaar?parseInt(f.ebJaar,10):undefined,
    ebGrondslag:f.ebGrondslag,heffingskortingPerLid:f.heffingskorting,
    netToepassen:f.netOn,overschrijdingsTarief:f.overschr,
    collectief:{stedinA:f.collSA,stedinT:f.collST,gtvA:f.collGtv,gecontracteerdVermogen:f.collContract},
    verdeelsleutel:f.verdeel,keepQuarterMatrix:true
  };
}

// --- EPEX-prijzen ------------------------------------------------------------

function _finPriceKey(){var p=_finProj();return p?p.id:null;}

async function _finLoadPrices(){
  var k=_finPriceKey();if(!k)return [];
  try{return (await dbGet('prices',k))||[];}catch(e){return [];}
}

async function _finUpdatePriceInfo(){
  var el=document.getElementById('finPriceInfo');if(!el)return;
  var s=await _finLoadPrices();
  if(!s.length){el.textContent='Nog geen prijsreeks geladen — fallbackprijs wordt gebruikt.';return;}
  var d0=String(s[0].ts).slice(0,10),d1=String(s[s.length-1].ts).slice(0,10);
  el.textContent=s.length.toLocaleString('nl-NL')+' kwartierprijzen ('+d0+' t/m '+d1+').';
}

async function _finImportPrices(file){
  if(!file)return;
  var unitEl=document.getElementById('finPriceUnit');
  var perMWh=unitEl&&unitEl.value==='mwh';
  var r=new FileReader();
  r.onload=async function(e){
    try{
      var series=parsePriceCSV(e.target.result,{perMWh:perMWh});
      if(!series.length){notify('Geen geldige prijzen in CSV',false);return;}
      await dbSet('prices',_finPriceKey(),series);
      notify(series.length+' kwartierprijzen geïmporteerd');
      _finUpdatePriceInfo();
    }catch(err){notify('Prijsimport mislukt: '+err.message,false);}
  };
  r.onerror=function(){notify('Kan bestand niet lezen',false);};
  r.readAsText(file,'UTF-8');
}

// --- Berekening --------------------------------------------------------------

async function finCalc(){
  var p=_finProj();var ehp=_finActiveEhp();
  if(!ehp){notify('Selecteer eerst een platform',false);return;}
  var f=_finPersistCfg();
  var memberCfg=ehp.members||[];
  if(!memberCfg.length){notify('Dit platform heeft geen deelnemers',false);return;}
  var members=[],skipped=[];
  for(var i=0;i<memberCfg.length;i++){
    var comp=null;
    for(var j=0;j<p.companies.length;j++){if(p.companies[j].id===memberCfg[i].cid){comp=p.companies[j];break;}}
    if(!comp)continue;
    var data=await dbGet('ts',comp.id)||[];
    if(!data.length){skipped.push(comp.name);continue;}
    members.push({id:comp.id,name:comp.name,source:memberCfg[i].source||'overig',company:comp,data:data});
  }
  if(!members.length){notify('Geen deelnemer met meetdata',false);return;}
  var prices=await _finLoadPrices();
  var assumptions=_finAssumptions(f,ehp);
  var r;
  try{r=buildAnnualComparison(members,prices,assumptions);}
  catch(e){console.error('buildAnnualComparison:',e);notify('Fout in berekening: '+e.message,false);return;}
  if(!r.allTs.length){notify('Geen overlappende kwartierwaarden tussen deelnemers',false);return;}
  _finLast={r:r,ehp:ehp,ehpName:ehp.name,assumptions:assumptions,prices:prices,members:members,skipped:skipped,f:f};
  _finRender(_finLast);
  notify('Jaarrekening berekend — '+r.allTs.length+' kwartieren'+(skipped.length?' ('+skipped.length+' zonder data overgeslagen)':''));
}

// --- Rendering: resultaten ---------------------------------------------------

function _finRender(L, targetEl){
  var r=L.r;
  var container=targetEl||document.getElementById('finResults');
  if(!container)return;
  container.innerHTML=
    '<div class="tabs">'+
      '<button class="tab on" data-fin-tab="fnOv">Overzicht</button>'+
      '<button class="tab" data-fin-tab="fnBedr">Per bedrijf</button>'+
      '<button class="tab" data-fin-tab="fnPlat">Platform</button>'+
      '<button class="tab" data-fin-tab="fnGraf">Grafieken</button>'+
      '<button class="tab" data-fin-tab="fnGev">Gevoeligheid</button>'+
      '<button class="tab" data-fin-tab="fnMeth">Methodologie</button>'+
      '<button class="tab" data-fin-tab="fnExp">Export</button>'+
    '</div>'+
    '<div id="fnOv" class="pn on">'+_finTabOverzicht(L)+'</div>'+
    '<div id="fnBedr" class="pn">'+_finTabBedrijf(L)+'</div>'+
    '<div id="fnPlat" class="pn">'+_finTabPlatform(L)+'</div>'+
    '<div id="fnGraf" class="pn">'+_finTabGrafieken(L)+'</div>'+
    '<div id="fnGev" class="pn">'+_finTabGevoeligheid(L)+'</div>'+
    '<div id="fnMeth" class="pn">'+_finTabMethodologie()+'</div>'+
    '<div id="fnExp" class="pn">'+_finTabExport()+'</div>';
  _finAttachTabs(container);
  _finBindResultButtons(L,container);
  // Grafieken renderen (panels verborgen → resize bij tab-switch).
  _finDrawAllCharts(L);
}

function _finAttachTabs(box){
  if(!box)box=document.getElementById('finResults');
  if(!box)return;
  box.addEventListener('click',function(e){
    var btn=e.target.closest('[data-fin-tab]');if(!btn)return;
    box.querySelectorAll('[data-fin-tab]').forEach(function(b){b.classList.remove('on');});
    btn.classList.add('on');
    box.querySelectorAll('.pn').forEach(function(pn){pn.classList.remove('on');});
    var panel=box.querySelector('[id="'+btn.getAttribute('data-fin-tab')+'"]');
    if(panel)panel.classList.add('on');
    setTimeout(function(){Object.keys(CH).forEach(function(k){if(k.indexOf('fin')===0){try{CH[k].resize();}catch(_){}}});},30);
  });
}

// Overzicht: headline + KPI's + validaties + waarschuwingen.
function _finTabOverzicht(L){
  var r=L.r,co=r.consolidated;
  var saveCls=co.totaalVoordeel>=0?'ehp-savings-pos':'ehp-savings-neg';
  var d0=r.periode.start?String(r.periode.start).slice(0,10):'—',d1=r.periode.end?String(r.periode.end).slice(0,10):'—';
  var headline='<div class="cd" style="display:flex;flex-wrap:wrap;gap:18px;align-items:center;justify-content:space-between">'+
    '<div><div class="kl">Resultaat platformscenario t.o.v. huidige situatie</div>'+
      '<div class="'+saveCls+'" style="font-size:34px;line-height:1.1;margin-top:2px">'+_finMoney(co.totaalVoordeel)+'</div>'+
      '<div class="ku" style="margin-top:2px">'+_finPct(co.totaalVoordeelPct)+' · periode '+d0+' t/m '+d1+'</div></div>'+
    '<div style="display:flex;gap:10px;flex-wrap:wrap">'+
      '<div class="kb"><div class="kl">Wat betaal ik nu</div><div class="kv" style="font-size:15px">€ '+_finEur0(co.nettoHuidig)+'</div><div class="ku">huidige situatie</div></div>'+
      '<div class="kb"><div class="kl">Wat betaal ik straks</div><div class="kv" style="font-size:15px">€ '+_finEur0(co.nettoPlatform)+'</div><div class="ku">platformscenario</div></div>'+
      '<div class="kb"><div class="kl">Verschil</div><div class="kv '+saveCls+'" style="font-size:15px">'+_finMoney(co.totaalVoordeel)+'</div><div class="ku">per jaar</div></div>'+
    '</div></div>';
  var kpis=[
    ['Totaal platformvolume',_finEur0(co.platformVolumeKwh/1000)+' MWh','afname groep'],
    ['Totale interne matching',_finEur0(co.internMatchingKwh/1000)+' MWh','lokaal verrekend'],
    ['Totale externe inkoop',_finEur0(co.externInkoopKwh/1000)+' MWh','van net'],
    ['Totale externe verkoop',_finEur0(co.externVerkoopKwh/1000)+' MWh','naar net'],
    ['Totale platformkosten','€ '+_finEur0(co.platformkosten),'fee'],
    ['Aantal deelnemers',r.perCompany.length,'']
  ];
  var kpiHtml='<div class="kg">'+kpis.map(function(k){return '<div class="kb"><div class="kl">'+k[0]+'</div><div class="kv" style="font-size:15px">'+k[1]+'</div><div class="ku">'+k[2]+'</div></div>';}).join('')+'</div>';
  return headline+kpiHtml+_finValidationsHtml(L)+_finWarningsHtml(L);
}

function _finValidationsHtml(L){
  var v=L.r.platformValidations;if(!v)return '';
  var icon={pass:'✓',warn:'⚠',fail:'✗',info:'ℹ'};
  var col={pass:'#46962b',warn:'#e67e22',fail:'#c0392b',info:'#2c7fb8'};
  var rows=v.checks.map(function(c){
    return '<tr><td style="width:28px;color:'+col[c.status]+';font-weight:700;text-align:center">'+(icon[c.status]||'')+'</td>'+
      '<td>'+_finEsc(c.check)+'</td><td class="ku">'+_finEsc(c.detail)+'</td></tr>';
  }).join('');
  return '<div class="cd"><div class="ct2"><div class="ac" style="background:'+col[v.status]+'"></div>Validaties — controleerbaarheid</div>'+
    '<table class="verg-tbl"><tbody>'+rows+'</tbody></table></div>';
}

function _finWarningsHtml(L){
  var w=(L.r.meta&&L.r.meta.waarschuwingen)||[];
  var extra=[];
  if(L.skipped&&L.skipped.length)extra.push('Zonder meetdata, niet meegerekend: '+L.skipped.map(_finEsc).join(', ')+'.');
  if(!L.prices||!L.prices.length)extra.push('Geen EPEX-prijsreeks geladen — er is gerekend met de vlakke fallbackprijs (€ '+_finPrijs(L.f.fallbackPrice)+'/kWh).');
  var all=w.concat(extra);
  if(!all.length)return '';
  return '<div class="cd"><div class="ct2"><div class="ac" style="background:#e67e22"></div>Aannames &amp; aandachtspunten</div>'+
    all.map(function(t){return '<div class="ib2" style="margin-bottom:4px">'+_finEsc(t)+'</div>';}).join('')+'</div>';
}

// Per bedrijf: samenvattingstabel + vergelijkingskaarten huidig vs. platform.
function _finTabBedrijf(L){
  var r=L.r;
  var srcLbl={zon:'Zon',wind:'Wind',overig:'Overig',none:'Afnemer'};
  var rows=r.perCompany.map(function(c){
    var cls=c.verschil>=0?'verg-pos':'verg-neg';
    return '<tr><td style="font-weight:700">'+_finEsc(c.name)+'</td>'+
      '<td>'+(srcLbl[c.source]||c.source)+'</td>'+
      '<td>'+_finEur0(c.afnameKwh)+'</td><td>'+_finEur0(c.terugleverKwh)+'</td>'+
      '<td>'+_finEur0(c.internAfnameKwh)+'</td><td>'+_finEur0(c.internLeveringKwh)+'</td>'+
      '<td>'+_finEur0(c.externInkoopKwh)+'</td><td>'+_finEur0(c.externVerkoopKwh)+'</td>'+
      '<td>€ '+_finEur0(c.nettoHuidig)+'</td><td>€ '+_finEur0(c.nettoPlatform)+'</td>'+
      '<td class="'+cls+'">'+_finMoney(c.verschil)+'</td><td class="'+cls+'">'+_finPct(c.besparingPct)+'</td></tr>';
  }).join('');
  var tbl='<div class="cd ehp-grp"><div class="ct2"><div class="ac" style="background:#2c7fb8"></div>Samenvatting per bedrijf</div>'+
    '<div style="overflow-x:auto"><table class="verg-tbl"><thead><tr>'+
    '<th>Bedrijf</th><th>Bron</th><th>Afname kWh</th><th>Teruglev kWh</th><th>Intern afg.</th><th>Intern gel.</th>'+
    '<th>Ext. inkoop</th><th>Ext. verkoop</th><th>Netto huidig</th><th>Netto platform</th><th>Verschil</th><th>%</th>'+
    '</tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<div class="ib2" style="margin-top:6px">Negatief netto = per saldo opbrengst. Bedragen over de gemeten periode.</div></div>';
  var cards='<div class="cd"><div class="ct2"><div class="ac" style="background:#46962b"></div>Opbouw per bedrijf — huidig vs. platform</div>'+
    '<div class="ehp-party-grid">'+r.perCompany.map(_finBedrijfCard).join('')+'</div></div>';
  return tbl+cards;
}

function _finBedrijfCard(c){
  var saveCls=c.verschil>=0?'ehp-savings-pos':'ehp-savings-neg';
  function row(lbl,h,p,cls){return '<tr'+(cls?' class="'+cls+'"':'')+'><td>'+lbl+'</td><td>'+h+'</td><td>'+p+'</td></tr>';}
  function e(n){return '€ '+_finEur(n);}
  var H=c.huidig,P=c.platform;
  var tbl='<table class="ehp-cmp-tbl"><thead><tr><th>Post</th><th>Huidig</th><th>Platform</th></tr></thead><tbody>'+
    row('Energiekosten',e(H.energiekosten),e(P.energiekosten))+
    row('Opbrengsten',e(-H.opbrengsten),e(-P.opbrengsten))+
    row('Leveranciersopslag',e(H.leveranciersopslag),e(P.leveranciersopslag))+
    row('Terugleverafslag',e(H.terugleverafslag),e(P.terugleverafslag))+
    row('Onbalansopslag',e(H.onbalans),e(P.onbalans))+
    row('Energiebelasting',e(H.energiebelasting),e(P.energiebelasting))+
    row('Netkosten',e(H.netkosten),e(P.netkosten))+
    row('Platformkosten',e(H.platformkosten),e(P.platformkosten))+
    row('Vaste kosten',e(H.vasteKosten),e(P.vasteKosten))+
    row('Btw',e(H.btw),e(P.btw))+
    row('Netto jaarkosten',e(H.totaal),e(P.totaal),'ehp-total')+
    row('Verschil','—','<span class="'+saveCls+'">'+_finMoney(c.verschil)+' ('+_finPct(c.besparingPct)+')</span>','ehp-save')+
    '</tbody></table>';
  return '<div class="ehp-party-card">'+
    '<div class="ehp-party-h"><div class="ehp-party-name">'+_finEsc(c.name)+'</div>'+
    '<div class="'+saveCls+'" style="font-size:18px">'+_finMoney(c.verschil)+'</div></div>'+
    '<div class="ku" style="margin-bottom:6px">Gem. inkoop huidig € '+_finPrijs(c.gemInkoopHuidig)+' → platform € '+_finPrijs(c.gemInkoopPlatform)+' /kWh'+
    (c.terugleverKwh>0?' · verkoop huidig € '+_finPrijs(c.gemVerkoopHuidig)+' → platform € '+_finPrijs(c.gemVerkoopPlatform)+' /kWh':'')+'</div>'+
    tbl+'</div>';
}

// Platform: geconsolideerde totalen + voordeelverdeling + collectieve netvergelijking.
function _finTabPlatform(L){
  var r=L.r,co=r.consolidated,vd=r.voordeelverdeling;
  var sleutelLbl={geen:'Eigen delta',gelijk:'Gelijk verdeeld',volume:'Naar volume',inbreng:'Naar inbreng'};
  var nameById={};r.perCompany.forEach(function(c){nameById[c.id]=c.name;});
  var rows=vd.perCompany.map(function(x){
    var cls=x.aandeel>=0?'verg-pos':'verg-neg';
    return '<tr><td style="font-weight:700">'+_finEsc(nameById[x.id]||x.id)+'</td>'+
      '<td>'+_finMoney(x.eigenDelta)+'</td><td class="'+cls+'">'+_finMoney(x.aandeel)+'</td></tr>';
  }).join('');
  var verdeling='<div class="cd ehp-grp"><div class="ct2"><div class="ac" style="background:#2c7fb8"></div>Voordeelverdeling per deelnemer — sleutel: '+(sleutelLbl[vd.sleutel]||vd.sleutel)+'</div>'+
    '<table class="verg-tbl"><thead><tr><th>Deelnemer</th><th>Eigen delta</th><th>Toegewezen aandeel</th></tr></thead><tbody>'+rows+
    '<tr style="background:#f7fbf5"><td style="font-weight:700">Totaal</td><td>'+_finMoney(co.totaalVoordeel)+'</td><td>'+_finMoney(vd.totaalVoordeel)+'</td></tr>'+
    '</tbody></table>'+
    '<div class="ib2" style="margin-top:6px">"Eigen delta" = het eigen resultaat van elk bedrijf. "Toegewezen aandeel" verdeelt het gepoolde voordeel via de gekozen sleutel (instelbaar in de zijbalk).</div></div>';
  var nv=r.netVergelijking;
  var netHtml='';
  if(nv){
    var bCls=nv.besparing>=0?'verg-pos':'verg-neg';
    netHtml='<div class="cd"><div class="ct2"><div class="ac" style="background:#46962b"></div>Netkosten: individueel vs. collectief</div>'+
      '<div class="kg">'+
        '<div class="kb"><div class="kl">Som individuele aansluitingen</div><div class="kv" style="font-size:15px">€ '+_finEur0(nv.individueel)+'</div></div>'+
        '<div class="kb"><div class="kl">Eén collectieve aansluiting</div><div class="kv" style="font-size:15px">€ '+_finEur0(nv.collectief)+'</div></div>'+
        '<div class="kb"><div class="kl">Verschil</div><div class="kv '+bCls+'" style="font-size:15px">'+_finMoney(nv.besparing)+'</div></div>'+
      '</div>'+
      '<div class="ib2" style="margin-top:6px">Indicatief: vergelijkt de som van de individuele netkosten met één gedeelde aansluiting op het netto groepsprofiel (configuratie in de zijbalk). Vereist juridisch één aansluitpunt.</div></div>';
  }
  var totHtml='<div class="cd"><div class="ct2"><div class="ac" style="background:#2c7fb8"></div>Geconsolideerd platform</div>'+
    '<div class="kg">'+
      '<div class="kb"><div class="kl">Platformvolume</div><div class="kv" style="font-size:15px">'+_finEur0(co.platformVolumeKwh/1000)+' MWh</div></div>'+
      '<div class="kb"><div class="kl">Interne matching</div><div class="kv" style="font-size:15px">'+_finEur0(co.internMatchingKwh/1000)+' MWh</div></div>'+
      '<div class="kb"><div class="kl">Externe inkoop</div><div class="kv" style="font-size:15px">'+_finEur0(co.externInkoopKwh/1000)+' MWh</div></div>'+
      '<div class="kb"><div class="kl">Externe verkoop</div><div class="kv" style="font-size:15px">'+_finEur0(co.externVerkoopKwh/1000)+' MWh</div></div>'+
      '<div class="kb"><div class="kl">Platformkosten</div><div class="kv" style="font-size:15px">€ '+_finEur0(co.platformkosten)+'</div></div>'+
      '<div class="kb"><div class="kl">Totaal voordeel/nadeel</div><div class="kv '+(co.totaalVoordeel>=0?'ehp-savings-pos':'ehp-savings-neg')+'" style="font-size:15px">'+_finMoney(co.totaalVoordeel)+'</div></div>'+
    '</div></div>';
  return totHtml+verdeling+netHtml;
}

// Grafieken-tab: alleen de canvassen; tekenen gebeurt in _finDrawAllCharts.
function _finTabGrafieken(L){
  function cv(id,titel,h){return '<div class="cd"><div class="ct2"><div class="ac" style="background:#2c7fb8"></div>'+titel+'</div>'+
    '<div class="cw" style="height:'+(h||260)+'px"><canvas id="'+id+'" role="img"></canvas></div></div>';}
  return cv('finChMaand','Maandelijkse kostenopbouw (platform)')+
    cv('finChWf','Waterfall: huidige situatie → platformscenario')+
    cv('finChCash','Cashflow per deelnemer (verschil t.o.v. huidig)')+
    cv('finChProd','Producentenopbrengsten')+
    cv('finChAfn','Afnemerskosten')+
    cv('finChVerd','Verdeling platformvoordeel');
}

// Gevoeligheid-tab: tornado + sliders.
function _finTabGevoeligheid(L){
  var params=[
    ['epex','EPEX-prijs','Pas de EPEX-marktprijzen procentueel aan om de gevoeligheid van het resultaat voor prijsschommelingen te zien.'],
    ['intern','Interne prijs','Pas de interne handelsprijzen procentueel aan om het effect op de platform-businesscase te zien.'],
    ['opslag','Opslagen','Pas alle opslagen (leverancier, teruglevering, onbalans) gelijktijdig aan om het effect te zien.'],
    ['belasting','Belasting (EB+btw)','Pas energiebelasting en btw procentueel aan om het effect van fiscale wijzigingen te zien.'],
    ['platform','Platformkosten','Pas de platformkosten procentueel aan om de invloed op de businesscase te zien.']
  ];
  var sliders=params.map(function(p){
    return '<div class="fgr" style="align-items:center"><label style="min-width:130px">'+p[1]+tipIcon(p[2])+' <span id="finSlV_'+p[0]+'" style="color:#46962b;font-weight:700">0%</span></label>'+
      '<input type="range" id="finSl_'+p[0]+'" min="-50" max="50" value="0" step="5" style="flex:1;accent-color:#46962b" data-fin-slider="'+p[0]+'"></div>';
  }).join('');
  return '<div class="cd"><div class="ct2"><div class="ac" style="background:#8e44ad"></div>Tornado — effect van ±20% op het totale voordeel</div>'+
    '<div class="ib2" style="margin-bottom:8px">Elke balk toont hoe het totale platformvoordeel verandert als die parameter −20% / +20% beweegt (overige gelijk).</div>'+
    '<div class="cw" style="height:280px"><canvas id="finChTornado" role="img"></canvas></div></div>'+
    '<div class="cd"><div class="ct2"><div class="ac" style="background:#8e44ad"></div>Wat-als: schuif aan de aannames</div>'+
    sliders+
    '<div style="margin-top:10px;display:flex;gap:18px;flex-wrap:wrap;align-items:center">'+
      '<div class="kb"><div class="kl">Totaal voordeel (basis)</div><div class="kv" id="finGevBasis" style="font-size:16px">—</div></div>'+
      '<div class="kb"><div class="kl">Totaal voordeel (aangepast)</div><div class="kv" id="finGevNu" style="font-size:16px">—</div></div>'+
      '<button class="b" id="finGevReset">Reset</button>'+
    '</div>'+
    '<div class="ib2" style="margin-top:6px">Herberekent live via dezelfde rekenkern. Sliders wijzigen de aannames niet permanent.</div></div>';
}

function _finTabMethodologie(){
  function s(t,b){return '<div style="margin-bottom:12px"><div style="font-weight:700;color:#242b38;margin-bottom:3px">'+t+'</div><div style="font-size:13px;color:#555;line-height:1.5">'+b+'</div></div>';}
  return '<div class="cd"><div class="ct2"><div class="ac" style="background:#242b38"></div>Methodologie &amp; aannames</div>'+
    s('Wat is EPEX/EEX?','EPEX/EEX is de groothandelsmarktprijs voor elektriciteit (€/kWh), per uur of kwartier. Dit is de <strong>kale</strong> marktprijs: zonder energiebelasting, btw, netkosten of leveranciersopslag. De prijs kan negatief zijn (bij veel aanbod).')+
    s('Interne matching','Per kwartier wordt lokale productie eerst gematcht met lokale vraag binnen het platform. Bij schaarste wordt de productie <strong>pro rata</strong> over de afnemers verdeeld; de opbrengst gaat pro rata naar de producenten op basis van geleverde kWh. Bronnen (zon, wind, overig) worden onderscheiden. Interne afname is per kwartier per definitie gelijk aan interne levering.')+
    s('Externe inkoop','Wat niet intern gedekt wordt, wordt van het net gekocht tegen EPEX + leveranciersopslag (+ eventuele onbalansopslag).')+
    s('Externe verkoop','Productieoverschot wordt aan het net verkocht tegen EPEX − terugleverafslag.')+
    s('Energiebelasting','Berekend via de jaarstaffel (€/kWh per schijf). De grondslag is instelbaar: bruto afname, netto afname (saldering) of alleen externe levering. Binnen een collectief is de fiscaal juiste grondslag afhankelijk van de juridische leveringsstructuur. '+_finEsc(REKEN_DEFAULTS.energiebelasting.waarschuwing))+
    s('Btw','Btw wordt éénmalig toegepast over de belastbare componenten (geen dubbeltelling). Het percentage is instelbaar.')+
    s('Netkosten','Stedin-tarieven: aansluitvergoeding, vastrecht transport, kW-contract (GTV-A), kW-max (maandpiek) en dubbeltarief, plus optionele overschrijdingskosten. Daarnaast een indicatieve vergelijking tussen de som van individuele aansluitingen en één collectieve aansluiting.')+
    s('Configureerbare aannames','In de zijbalk: leveranciersopslag, terugleverafslag, onbalansopslag, platformkosten, fallback-EPEX-prijs, btw%, energiebelasting (jaar, grondslag, heffingskorting), netkosten (collectieve aansluiting, overschrijding) en de voordeelverdeelsleutel. Interne prijzen komen uit het platform.')+
    s('Waarom bestaande contracten soms niet exact te reconstrueren zijn','Bestaande leveringscontracten bevatten vaak maatwerk (vaste/variabele componenten, kortingen, clausules) die niet 1-op-1 uit meetdata herleidbaar zijn. De huidige situatie is daarom een <strong>benadering</strong> op basis van de ingevoerde prijzen/aannames, niet een exacte factuurreconstructie.')+
    s('Juridisch/fiscaal onzekere onderdelen','De fiscale behandeling van energiebelasting bij interne levering, de btw-positie van het platform, en de mogelijkheid van één collectief aansluitpunt zijn afhankelijk van de gekozen juridische structuur. Behandel de uitkomsten als businesscase-indicatie, niet als fiscaal of juridisch advies.')+
    '</div>';
}

function _finTabExport(){
  function b(id,lbl){return '<button class="b" id="'+id+'" style="width:100%;margin-bottom:8px;justify-content:flex-start">'+lbl+'</button>';}
  return '<div class="cd"><div class="ct2"><div class="ac" style="background:#2c7fb8"></div>Exporteren</div>'+
    '<div style="max-width:420px">'+
      b('finExpKwartier','↓ CSV — per kwartier (per bedrijf)')+
      b('finExpMaand','↓ CSV — per maand (platform)')+
      b('finExpBedrijf','↓ CSV — jaarrekening per bedrijf')+
      b('finExpPlatform','↓ CSV — geconsolideerd platform')+
      b('finExpRapport','↓ HTML/PDF — rapport (afdrukbaar)')+
    '</div>'+
    '<div class="ib2" style="margin-top:6px">CSV gebruikt ; als scheidingsteken (Excel-NL). Het rapport opent in een nieuw venster; kies daar Afdrukken → Opslaan als PDF.</div></div>';
}

// --- Knoppen in resultaten ---------------------------------------------------

function _finBindResultButtons(L,container){
  function on(id,fn){var el=document.getElementById(id);if(el)el.addEventListener('click',fn);}
  on('finExpKwartier',function(){_finExportKwartier(L);});
  on('finExpMaand',function(){_finExportMaand(L);});
  on('finExpBedrijf',function(){_finExportBedrijf(L);});
  on('finExpPlatform',function(){_finExportPlatform(L);});
  on('finExpRapport',function(){_finExportRapport(L);});
  // Gevoeligheid sliders — zoek binnen de juiste container
  var scope=container||document.getElementById('finResults')||document;
  scope.querySelectorAll('[data-fin-slider]').forEach(function(sl){
    sl.addEventListener('input',function(){_finSliderUpdate(L);});
  });
  var reset=document.getElementById('finGevReset');
  if(reset)reset.addEventListener('click',function(){
    scope.querySelectorAll('[data-fin-slider]').forEach(function(sl){sl.value=0;});
    _finSliderUpdate(L);
  });
  // Basiswaarde gevoeligheid tonen
  var basis=document.getElementById('finGevBasis');if(basis)basis.textContent='€ '+_finEur0(L.r.consolidated.totaalVoordeel);
  try{_finSliderUpdate(L);}catch(e){}
}

// --- Gevoeligheid: herberekening ---------------------------------------------

// Maakt een aangepast assumptions-object met schaalfactoren (in %) per parameter.
function _finScaledAssumptions(L,scales){
  var a=L.assumptions,jaar=a.ebJaar;
  function f(k){return 1+((scales[k]||0)/100);}
  var clone=JSON.parse(JSON.stringify(a));
  clone.keepQuarterMatrix=false;
  // interne prijs
  clone.internalPrices={zon:a.internalPrices.zon*f('intern'),wind:a.internalPrices.wind*f('intern'),overig:a.internalPrices.overig*f('intern')};
  // opslagen
  clone.leveranciersOpslag=a.leveranciersOpslag*f('opslag');
  clone.terugleverAfslag=a.terugleverAfslag*f('opslag');
  clone.onbalansOpslag=a.onbalansOpslag*f('opslag');
  // platformkosten (€/kWh of €/dag modus)
  clone.platformkosten=(a.platformkosten||0)*f('platform');
  clone.platformkostenDag=(a.platformkostenDag||0)*f('platform');
  // belasting: btw + EB-staffel
  clone.btwPct=a.btwPct*f('belasting');
  var base=_finEbStaffel(jaar);
  clone.ebStaffel=base.map(function(s){return {tot:s.tot,tarief:s.tarief*f('belasting')};});
  // EPEX: schaal de prijsreeks + fallback
  var pscale=f('epex');
  clone.fallbackPrice=a.fallbackPrice*pscale;
  var prices=(L.prices||[]).map(function(r){return {ts:r.ts,price:r.price*pscale};});
  return {assumptions:clone,prices:prices};
}

function _finRecompute(L,scales){
  var sc=_finScaledAssumptions(L,scales);
  try{return buildAnnualComparison(L.members,sc.prices,sc.assumptions).consolidated.totaalVoordeel;}
  catch(e){return NaN;}
}

function _finSliderUpdate(L){
  var keys=['epex','intern','opslag','belasting','platform'],scales={};
  keys.forEach(function(k){
    var sl=document.getElementById('finSl_'+k);
    var lbl=document.getElementById('finSlV_'+k);
    var v=sl?parseFloat(sl.value):0;scales[k]=v;
    if(lbl)lbl.textContent=(v>0?'+':'')+v+'%';
  });
  var nu=document.getElementById('finGevNu');
  if(nu){var val=_finRecompute(L,scales);nu.textContent=isNaN(val)?'—':'€ '+_finEur0(val);
    nu.className='kv '+(val>=0?'ehp-savings-pos':'ehp-savings-neg');}
}

// --- Grafieken ---------------------------------------------------------------

function _finLegend(){return {labels:{color:'#888',font:{family:'Barlow',size:11},boxWidth:10}};}

function _finDrawAllCharts(L){
  try{_finDrawMaand(L);}catch(e){console.error(e);}
  try{_finDrawWaterfall(L);}catch(e){console.error(e);}
  try{_finDrawCashflow(L);}catch(e){console.error(e);}
  try{_finDrawProducenten(L);}catch(e){console.error(e);}
  try{_finDrawAfnemers(L);}catch(e){console.error(e);}
  try{_finDrawVerdeling(L);}catch(e){console.error(e);}
  try{_finDrawTornado(L);}catch(e){console.error(e);}
}

function _finMaandLbl(mn){var p=String(mn).split('-');return MND[parseInt(p[1],10)-1]+" '"+p[0].slice(2);}

function _finDrawMaand(L){
  dC('finChMaand');var cv=document.getElementById('finChMaand');if(!cv)return;
  var pm=L.r.perMonth;if(!pm.length)return;
  var labels=pm.map(function(m){return _finMaandLbl(m.maand);});
  function ds(lbl,key,col){return {label:lbl,data:pm.map(function(m){return +(m[key]||0).toFixed(0);}),backgroundColor:col,borderRadius:3,stack:'k'};}
  CH['finChMaand']=new Chart(cv,{type:'bar',data:{labels:labels,datasets:[
    ds('Externe inkoop','eurExterneInkoop','rgba(44,127,184,.75)'),
    ds('Interne inkoop','eurInterneInkoop','rgba(95,179,223,.75)'),
    ds('Leveranciersopslag','eurLeveranciersopslag','rgba(230,126,34,.75)'),
    ds('Energiebelasting','energiebelasting','rgba(142,68,173,.7)'),
    ds('Platformkosten','eurPlatformkosten','rgba(192,57,43,.7)'),
    {label:'Opbrengst verkoop',data:pm.map(function(m){return -(+(((m.eurExterneVerkoop||0)+(m.eurInterneVerkoop||0)).toFixed(0)));}),backgroundColor:'rgba(70,150,43,.6)',borderRadius:3,stack:'k'}
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:_finLegend()},
    scales:{x:Object.assign(ax(),{stacked:true,grid:{display:false}}),y:Object.assign(ax('€'),{stacked:true})}}});
}

function _finDrawWaterfall(L){
  dC('finChWf');var cv=document.getElementById('finChWf');if(!cv)return;
  var co=L.r.consolidated;
  // Stappen: huidig → (Δ energie) → (Δ EB) → (Δ netkosten) → (Δ btw+overig) → platform.
  var sumComp=function(sel){return L.r.perCompany.reduce(function(s,c){return s+sel(c);},0);};
  var dEnergie=sumComp(function(c){return (c.huidig.energiekosten-c.huidig.opbrengsten)-(c.platform.energiekosten-c.platform.opbrengsten+c.platform.leveranciersopslag+c.platform.terugleverafslag+c.platform.onbalans+c.platform.platformkosten);});
  var dEb=sumComp(function(c){return c.huidig.energiebelasting-c.platform.energiebelasting;});
  var dNet=sumComp(function(c){return c.huidig.netkosten-c.platform.netkosten;});
  var dBtw=sumComp(function(c){return (c.huidig.btw+c.huidig.vasteKosten)-(c.platform.btw+c.platform.vasteKosten);});
  var start=co.nettoHuidig,eind=co.nettoPlatform;
  // floating bars [van,tot]
  var steps=[
    {l:'Huidig',base:0,val:start,col:'#2c7fb8'},
    {l:'Δ Energie/handel',d:-dEnergie},
    {l:'Δ Energiebelasting',d:-dEb},
    {l:'Δ Netkosten',d:-dNet},
    {l:'Δ Btw/vast',d:-dBtw},
    {l:'Platform',base:0,val:eind,col:'#46962b'}
  ];
  var labels=[],data=[],cols=[],run=start;
  steps.forEach(function(s){
    if(s.base!=null){labels.push(s.l);data.push([0,s.val]);cols.push(s.col);}
    else{var from=run,to=run+s.d;labels.push(s.l);data.push([from,to]);cols.push(s.d<=0?'rgba(70,150,43,.65)':'rgba(192,57,43,.65)');run=to;}
  });
  CH['finChWf']=new Chart(cv,{type:'bar',data:{labels:labels,datasets:[{data:data,backgroundColor:cols,borderRadius:3}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},
      tooltip:{callbacks:{label:function(ctx){var v=ctx.raw;return '€ '+_finEur(v[1]-v[0]);}}}},
      scales:{x:Object.assign(ax(),{grid:{display:false}}),y:ax('€')}}});
}

function _finDrawCashflow(L){
  dC('finChCash');var cv=document.getElementById('finChCash');if(!cv)return;
  var pc=L.r.perCompany.slice().sort(function(a,b){return b.verschil-a.verschil;});
  CH['finChCash']=new Chart(cv,{type:'bar',data:{labels:pc.map(function(c){return c.name;}),
    datasets:[{label:'Verschil (besparing+ / meerkosten−)',data:pc.map(function(c){return +c.verschil.toFixed(0);}),
      backgroundColor:pc.map(function(c){return c.verschil>=0?'rgba(70,150,43,.7)':'rgba(192,57,43,.7)';}),borderRadius:4}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:_finLegend()},
      scales:{x:Object.assign(ax('€'),{}),y:Object.assign(ax(),{grid:{display:false}})}}});
}

function _finDrawProducenten(L){
  dC('finChProd');var cv=document.getElementById('finChProd');if(!cv)return;
  var prod=L.r.perCompany.filter(function(c){return c.terugleverKwh>0;});
  if(!prod.length){cv.parentElement.parentElement.style.display='none';return;}
  CH['finChProd']=new Chart(cv,{type:'bar',data:{labels:prod.map(function(c){return c.name;}),datasets:[
    {label:'Interne verkoop €',data:prod.map(function(c){return +(c.platDetail.eurInterneVerkoop).toFixed(0);}),backgroundColor:'rgba(95,179,223,.8)',borderRadius:3,stack:'p'},
    {label:'Externe verkoop €',data:prod.map(function(c){return +(c.platDetail.eurExterneVerkoop).toFixed(0);}),backgroundColor:'rgba(70,150,43,.7)',borderRadius:3,stack:'p'}
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:_finLegend()},
    scales:{x:Object.assign(ax(),{stacked:true,grid:{display:false}}),y:Object.assign(ax('€'),{stacked:true})}}});
}

function _finDrawAfnemers(L){
  dC('finChAfn');var cv=document.getElementById('finChAfn');if(!cv)return;
  var afn=L.r.perCompany.filter(function(c){return c.afnameKwh>0;});
  if(!afn.length)return;
  CH['finChAfn']=new Chart(cv,{type:'bar',data:{labels:afn.map(function(c){return c.name;}),datasets:[
    {label:'Interne inkoop €',data:afn.map(function(c){return +(c.platDetail.eurInterneInkoop).toFixed(0);}),backgroundColor:'rgba(95,179,223,.8)',borderRadius:3,stack:'a'},
    {label:'Externe inkoop €',data:afn.map(function(c){return +(c.platDetail.eurExterneInkoop).toFixed(0);}),backgroundColor:'rgba(44,127,184,.75)',borderRadius:3,stack:'a'},
    {label:'Opslag+belasting €',data:afn.map(function(c){return +((c.platform.leveranciersopslag+c.platform.onbalans+c.platform.energiebelasting+c.platform.platformkosten)).toFixed(0);}),backgroundColor:'rgba(142,68,173,.65)',borderRadius:3,stack:'a'}
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:_finLegend()},
    scales:{x:Object.assign(ax(),{stacked:true,grid:{display:false}}),y:Object.assign(ax('€'),{stacked:true})}}});
}

function _finDrawVerdeling(L){
  dC('finChVerd');var cv=document.getElementById('finChVerd');if(!cv)return;
  var vd=L.r.voordeelverdeling,nameById={};L.r.perCompany.forEach(function(c){nameById[c.id]=c.name;});
  var pos=vd.perCompany.filter(function(x){return x.aandeel>0;});
  if(!pos.length){return;}
  CH['finChVerd']=new Chart(cv,{type:'doughnut',data:{labels:pos.map(function(x){return nameById[x.id]||x.id;}),
    datasets:[{data:pos.map(function(x){return +x.aandeel.toFixed(2);}),backgroundColor:pos.map(function(_,i){return PAL[i%PAL.length];})}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{color:'#888',font:{family:'Barlow',size:11},boxWidth:10}},
      tooltip:{callbacks:{label:function(ctx){return ctx.label+': € '+_finEur(ctx.raw);}}}}}});
}

function _finDrawTornado(L){
  dC('finChTornado');var cv=document.getElementById('finChTornado');if(!cv)return;
  var params=[['epex','EPEX-prijs'],['intern','Interne prijs'],['opslag','Opslagen'],['belasting','Belasting (EB+btw)'],['platform','Platformkosten']];
  var basis=L.r.consolidated.totaalVoordeel,X=20;
  var rows=params.map(function(p){
    var sc1={},sc2={};sc1[p[0]]=-X;sc2[p[0]]=X;
    var low=_finRecompute(L,sc1),high=_finRecompute(L,sc2);
    return {naam:p[1],low:low-basis,high:high-basis,span:Math.abs((high-basis)-(low-basis))};
  }).sort(function(a,b){return a.span-b.span;});
  CH['finChTornado']=new Chart(cv,{type:'bar',data:{labels:rows.map(function(r){return r.naam;}),datasets:[
    {label:'−'+X+'%',data:rows.map(function(r){return +r.low.toFixed(0);}),backgroundColor:'rgba(192,57,43,.65)',borderRadius:3},
    {label:'+'+X+'%',data:rows.map(function(r){return +r.high.toFixed(0);}),backgroundColor:'rgba(70,150,43,.65)',borderRadius:3}
  ]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:_finLegend(),
    tooltip:{callbacks:{label:function(ctx){return ctx.dataset.label+': Δ € '+_finEur(ctx.raw);}}}},
    scales:{x:Object.assign(ax('Δ € voordeel'),{}),y:Object.assign(ax(),{grid:{display:false}})}}});
}

// --- Exports -----------------------------------------------------------------

function _finCsvCell(v){
  if(typeof v==='number')return (Math.round(v*1e4)/1e4).toString().replace('.',',');
  return '"'+String(v==null?'':v).replace(/"/g,'""')+'"';
}
function _finCsvLines(lines,fname){
  triggerDownload(new Blob(['﻿'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),fname);
}
function _finStamp(){return new Date().toISOString().slice(0,10);}
function _finSafe(s){return String(s||'platform').replace(/[^a-z0-9]/gi,'-').toLowerCase();}

function _finExportKwartier(L){
  var pq=L.r.perQuarter;
  if(!pq||!pq.length){notify('Geen kwartiermatrix beschikbaar',false);return;}
  var nameById={};L.members.forEach(function(m){nameById[m.id]=m.name;});
  var head=['ts','bedrijf','verbruik_kWh','productie_kWh','intern_afname_kWh','intern_levering_kWh','extern_inkoop_kWh','extern_verkoop_kWh','EPEX_eur_kWh','eur_interne_handel','eur_extern_inkoop','eur_extern_verkoop','eur_leveranciersopslag','eur_terugleverafslag','eur_onbalans','eur_platformkosten','energiebelasting_eur'];
  var lines=[head.join(';')];
  pq.forEach(function(q){
    lines.push([q.ts,nameById[q.member]||q.member,q.verbruikKwh,q.productieKwh,q.interneAfnameKwh,q.interneLeveringKwh,
      q.externeInkoopKwh,q.externeVerkoopKwh,(q.epex==null?'':q.epex),q.eurInterneHandel,q.eurExterneInkoop,q.eurExterneVerkoop,
      q.eurLeveranciersopslag,q.eurTerugleverafslag,q.eurOnbalans,q.eurPlatformkosten,q.energiebelasting].map(_finCsvCell).join(';'));
  });
  _finCsvLines(lines,'jaarrekening-kwartier-'+_finSafe(L.ehpName)+'-'+_finStamp()+'.csv');
}

function _finExportMaand(L){
  var pm=L.r.perMonth;
  var head=['maand','verbruik_kWh','productie_kWh','eur_interne_inkoop','eur_interne_verkoop','eur_extern_inkoop','eur_extern_verkoop','eur_leveranciersopslag','eur_terugleverafslag','eur_onbalans','eur_platformkosten','energiebelasting_eur'];
  var lines=[head.join(';')];
  pm.forEach(function(m){
    lines.push([m.maand,m.verbruikKwh,m.productieKwh,m.eurInterneInkoop,m.eurInterneVerkoop,m.eurExterneInkoop,m.eurExterneVerkoop,
      m.eurLeveranciersopslag,m.eurTerugleverafslag,m.eurOnbalans,m.eurPlatformkosten,m.energiebelasting].map(_finCsvCell).join(';'));
  });
  _finCsvLines(lines,'jaarrekening-maand-'+_finSafe(L.ehpName)+'-'+_finStamp()+'.csv');
}

function _finExportBedrijf(L){
  var head=['bedrijf','bron','afname_kWh','teruglevering_kWh','intern_afname_kWh','intern_levering_kWh','extern_inkoop_kWh','extern_verkoop_kWh',
    'gem_inkoop_huidig','gem_inkoop_platform','gem_verkoop_huidig','gem_verkoop_platform',
    'energiekosten_plat','opbrengsten_plat','leveranciersopslag','terugleverafslag','energiebelasting','btw','netkosten','platformkosten','vaste_kosten',
    'netto_huidig','netto_platform','verschil','besparing_pct'];
  var lines=[head.join(';')];
  L.r.perCompany.forEach(function(c){
    lines.push([c.name,c.source,c.afnameKwh,c.terugleverKwh,c.internAfnameKwh,c.internLeveringKwh,c.externInkoopKwh,c.externVerkoopKwh,
      c.gemInkoopHuidig,c.gemInkoopPlatform,c.gemVerkoopHuidig,c.gemVerkoopPlatform,
      c.platform.energiekosten,c.platform.opbrengsten,c.platform.leveranciersopslag,c.platform.terugleverafslag,c.platform.energiebelasting,c.platform.btw,c.platform.netkosten,c.platform.platformkosten,c.huidig.vasteKosten,
      c.nettoHuidig,c.nettoPlatform,c.verschil,c.besparingPct].map(_finCsvCell).join(';'));
  });
  _finCsvLines(lines,'jaarrekening-per-bedrijf-'+_finSafe(L.ehpName)+'-'+_finStamp()+'.csv');
}

function _finExportPlatform(L){
  var co=L.r.consolidated,vd=L.r.voordeelverdeling,nameById={};L.r.perCompany.forEach(function(c){nameById[c.id]=c.name;});
  var lines=[['post','waarde'].join(';')];
  function row(k,v){lines.push([k,v].map(_finCsvCell).join(';'));}
  row('Platformvolume_kWh',co.platformVolumeKwh);row('Interne_matching_kWh',co.internMatchingKwh);
  row('Externe_inkoop_kWh',co.externInkoopKwh);row('Externe_verkoop_kWh',co.externVerkoopKwh);
  row('Platformkosten_eur',co.platformkosten);row('Netto_huidig_eur',co.nettoHuidig);row('Netto_platform_eur',co.nettoPlatform);
  row('Totaal_voordeel_eur',co.totaalVoordeel);row('Totaal_voordeel_pct',co.totaalVoordeelPct);
  lines.push('');lines.push(['deelnemer','eigen_delta_eur','toegewezen_aandeel_eur'].join(';'));
  vd.perCompany.forEach(function(x){lines.push([nameById[x.id]||x.id,x.eigenDelta,x.aandeel].map(_finCsvCell).join(';'));});
  _finCsvLines(lines,'jaarrekening-platform-'+_finSafe(L.ehpName)+'-'+_finStamp()+'.csv');
}

function _finExportRapport(L){
  var html=_finRapportHtml(L);
  var w=window.open('','_blank');
  if(!w){notify('Pop-up geblokkeerd — sta pop-ups toe voor het rapport',false);return;}
  w.document.open();w.document.write(html);w.document.close();
}

function _finRapportHtml(L){
  var r=L.r,co=r.consolidated;
  var srcLbl={zon:'Zon',wind:'Wind',overig:'Overig',none:'Afnemer'};
  var rows=r.perCompany.map(function(c){
    return '<tr><td>'+_finEsc(c.name)+'</td><td>'+(srcLbl[c.source]||c.source)+'</td>'+
      '<td class="n">'+_finEur0(c.afnameKwh)+'</td><td class="n">'+_finEur0(c.terugleverKwh)+'</td>'+
      '<td class="n">€ '+_finEur0(c.nettoHuidig)+'</td><td class="n">€ '+_finEur0(c.nettoPlatform)+'</td>'+
      '<td class="n">'+_finMoney(c.verschil)+'</td><td class="n">'+_finPct(c.besparingPct)+'</td></tr>';
  }).join('');
  var d0=r.periode.start?String(r.periode.start).slice(0,10):'—',d1=r.periode.end?String(r.periode.end).slice(0,10):'—';
  return '<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8"><title>Financiële jaarrekening — '+_finEsc(L.ehpName)+'</title>'+
    '<style>body{font-family:Arial,Helvetica,sans-serif;color:#242b38;margin:32px;font-size:13px}h1{font-size:20px}h2{font-size:15px;border-bottom:2px solid #46962b;padding-bottom:3px;margin-top:24px}'+
    'table{border-collapse:collapse;width:100%;margin-top:8px}th,td{border:1px solid #ddd;padding:5px 8px;text-align:left}th{background:#eef2ec}td.n{text-align:right}'+
    '.big{font-size:28px;font-weight:bold;color:'+(co.totaalVoordeel>=0?'#46962b':'#c0392b')+'}.muted{color:#777}@media print{body{margin:12mm}}</style></head><body>'+
    '<h1>Financiële jaarrekening — '+_finEsc(L.ehpName)+'</h1>'+
    '<div class="muted">Periode '+d0+' t/m '+d1+' · '+r.perCompany.length+' deelnemers · gegenereerd '+_finStamp()+'</div>'+
    '<h2>Samenvatting</h2>'+
    '<p>Wat betaalt de groep nu: <strong>€ '+_finEur0(co.nettoHuidig)+'</strong> · in het platformscenario: <strong>€ '+_finEur0(co.nettoPlatform)+'</strong>.</p>'+
    '<div class="big">'+_finMoney(co.totaalVoordeel)+' ('+_finPct(co.totaalVoordeelPct)+') per jaar</div>'+
    '<p class="muted">Platformvolume '+_finEur0(co.platformVolumeKwh/1000)+' MWh · interne matching '+_finEur0(co.internMatchingKwh/1000)+' MWh · externe inkoop '+_finEur0(co.externInkoopKwh/1000)+' MWh · externe verkoop '+_finEur0(co.externVerkoopKwh/1000)+' MWh.</p>'+
    '<h2>Per bedrijf</h2>'+
    '<table><thead><tr><th>Bedrijf</th><th>Bron</th><th>Afname kWh</th><th>Teruglev kWh</th><th>Netto huidig</th><th>Netto platform</th><th>Verschil</th><th>%</th></tr></thead><tbody>'+rows+'</tbody></table>'+
    '<h2>Methodologie &amp; aannames</h2>'+
    '<div style="font-size:12px;line-height:1.5">'+_finTabMethodologie().replace(/<div class="cd">|<\/div>$/,'').replace(/<div class="ct2">[\s\S]*?<\/div>/,'')+'</div>'+
    '<script>setTimeout(function(){try{window.print();}catch(e){}},400);<\/script>'+
    '</body></html>';
}

// --- Event listeners (sidebar) -----------------------------------------------

document.addEventListener('DOMContentLoaded',function(){
  var sel=document.getElementById('finEhpSel');
  if(sel)sel.addEventListener('change',function(){
    if(_finActiveEhp())_finPersistCfg();
    _finEhpId=this.value;_finLast=null;
    document.getElementById('finResults').innerHTML='<div class="verg-empty"><div class="big">€</div>Klik op <strong>Bereken jaarrekening</strong>.</div>';
    renderFin();
  });
  var btn=document.getElementById('finBtnCalc');
  if(btn)btn.addEventListener('click',function(){finCalc().catch(function(e){console.error('finCalc:',e);notify('Fout bij berekening',false);});});
  var pf=document.getElementById('finPriceFile');
  if(pf)pf.addEventListener('change',function(){if(this.files[0])_finImportPrices(this.files[0]);this.value='';});
  // Aannames opslaan bij wijziging
  ['finFallback','finLevOpslag','finTerugAfslag','finOnbalans','finPlatformkosten','finBtwPct','finEbOn','finEbJaar',
   'finEbGrondslag','finHeffing','finNetOn','finCollSA','finCollST','finCollGtv','finCollContract','finOverschr','finVerdeel'
  ].forEach(function(id){
    var el=document.getElementById(id);
    if(el)el.addEventListener('change',function(){if(_finActiveEhp())_finPersistCfg();});
  });
});
