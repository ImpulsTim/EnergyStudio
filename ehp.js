// Energiehandelsplatform (EHP) — losstaande financiële module.
// Hergebruikt projectstructuur, aansluitingen en IndexedDB-tijdreeksen van de GTO-tool.

var _ehpActiveId=null;   // actief platform binnen het huidige project
var _ehpLast=null;       // laatst berekende resultaat (voor CSV-download)

// Rapportagetijd-sleutel per aansluiting. Detecteert de provenance van de opgeslagen ts:
//  - MEPS-JSON levert een UTC interval-START (behoudt 'Z'/offset of seconden, >16 tekens):
//      wind-rol → vaste +1u15 (opwek.xlsx-labels); overige → DST-bewust Europe/Amsterdam.
//  - CSV levert reeds een lokale "YYYY-MM-DDTHH:MM": ongewijzigd laten.
function _ehpReportKey(rawTs, source){
  var isUtc = /[zZ]$|[+\-]\d\d:?\d\d$/.test(rawTs) || rawTs.length>16;
  if(!isUtc) return rawTs.slice(0,16);
  return (source==='wind')
    ? EnergieModel.reportKeyWind(rawTs)
    : EnergieModel.reportKeySite(rawTs);
}

function _ehpDefaults(){
  return {
    // Nieuwe tariefparameters (EUR/MWh — worden /1000 omgerekend naar EUR/kWh bij berekening)
    gel_zon_mwh:20,gel_wind_mwh:20,gel_ai_mwh:0,
    platform_mwh:0,gvo_bil_mwh:0,gvo_rest_mwh:0,
    onb_zon_pct:0.20,onb_wind_pct:0.20,onb_vb_pct:0.08,
    onb_zon_risico_mwh:90,onb_wind_risico_mwh:60,onb_vb_risico_mwh:25,
    // Backward compat (EUR/kWh) — afgeleid bij _ehpCommit; gebruikt door financieel.js / rapport_ehp.js
    pZon:0.020,pWind:0.020,pOverig:0,fee:0,feeMode:'kwh',pNetAfname:0.12,pNetTerug:0.04,
    ebOn:false,ebJaar:'2025',ebGrondslag:'bruto',heffingskorting:0,btwOn:false,btwPct:21,
    };
}

function _ehpProj(){
  var p=ap();
  if(!p)return null;
  if(!Array.isArray(p.ehps))p.ehps=[];
  return p;
}

function _ehpActive(){
  var p=_ehpProj();
  if(!p)return null;
  for(var i=0;i<p.ehps.length;i++){if(p.ehps[i].id===_ehpActiveId)return p.ehps[i];}
  return null;
}

// --- Rendering ---------------------------------------------------------------

function renderEHP(){
  var p=_ehpProj();
  if(!p){return;}
  if(!_ehpActive())_ehpActiveId=p.ehps.length?p.ehps[0].id:null;
  renderEhpList();
  var ed=document.getElementById('ehpEditor');
  var plat=_ehpActive();
  if(!plat){ed.style.display='none';return;}
  ed.style.display='';
  document.getElementById('ehpName').value=plat.name||'';
  var c=plat.cfg||_ehpDefaults();
  var _sv2=function(id,v){var el=document.getElementById(id);if(el)el.value=v;};
  _sv2('ehpGelZon',  c.gel_zon_mwh!=null?c.gel_zon_mwh:20);
  _sv2('ehpGelWind', c.gel_wind_mwh!=null?c.gel_wind_mwh:20);
  _sv2('ehpGelAI',   c.gel_ai_mwh!=null?c.gel_ai_mwh:0);
  _sv2('ehpPlatform',c.platform_mwh!=null?c.platform_mwh:0);
  _sv2('ehpGvoBil',  c.gvo_bil_mwh!=null?c.gvo_bil_mwh:0);
  _sv2('ehpGvoRest', c.gvo_rest_mwh!=null?c.gvo_rest_mwh:0);
  _sv2('ehpOnbZonPct',   c.onb_zon_pct!=null?(c.onb_zon_pct*100).toFixed(3):0);
  _sv2('ehpOnbWindPct',  c.onb_wind_pct!=null?(c.onb_wind_pct*100).toFixed(3):0);
  _sv2('ehpOnbVbPct',    c.onb_vb_pct!=null?(c.onb_vb_pct*100).toFixed(3):0);
  _sv2('ehpOnbZonRisico',c.onb_zon_risico_mwh!=null?c.onb_zon_risico_mwh:0);
  _sv2('ehpOnbWindRisico',c.onb_wind_risico_mwh!=null?c.onb_wind_risico_mwh:0);
  _sv2('ehpOnbVbRisico', c.onb_vb_risico_mwh!=null?c.onb_vb_risico_mwh:0);
  _ehpUpdateFileStatus(plat);
  var chkEl=function(id,v){var el=document.getElementById(id);if(el)el.checked=!!v;};
  chkEl('ehpEbOn',c.ebOn);
  var ebJaarEl=document.getElementById('ehpEbJaar');if(ebJaarEl)ebJaarEl.value=c.ebJaar||'2025';
  var ebGrEl=document.getElementById('ehpEbGrondslag');if(ebGrEl)ebGrEl.value=c.ebGrondslag||'bruto';
  var heffEl=document.getElementById('ehpHeffing');if(heffEl)heffEl.value=c.heffingskorting||0;
  chkEl('ehpBtwOn',c.btwOn);
  var btwPctEl=document.getElementById('ehpBtwPct');if(btwPctEl)btwPctEl.value=c.btwPct||21;
  var sv=function(id,v){var el=document.getElementById(id);if(el)el.value=v;};
  renderEhpMembers(plat);
}

function renderEhpList(){
  var p=_ehpProj();
  var el=document.getElementById('ehpList');
  if(!el)return;
  if(!p||!p.ehps.length){
    el.innerHTML='<div style="padding:10px 0;text-align:center;font-size:11px;color:#aaa">Nog geen platform</div>';
    return;
  }
  el.innerHTML=p.ehps.map(function(pf){
    var on=pf.id===_ehpActiveId;
    var n=(pf.members||[]).length;
    return '<div class="ci'+(on?' s':'')+'" data-ehp-id="'+pf.id+'" style="cursor:pointer'+(on?';border-color:#2c7fb8;background:#eaf3f9':'')+'">'+
      '<div class="cn">'+_ehpEsc(pf.name||'Platform')+'</div>'+
      '<div class="cm">'+n+' deelnemer'+(n===1?'':'s')+'</div></div>';
  }).join('');
}

function renderEhpMembers(plat){
  var p=_ehpProj();
  var box=document.getElementById('ehpMembers');
  if(!box)return;
  var comps=(p&&p.companies)||[];
  if(!comps.length){
    box.innerHTML='<div style="font-size:11px;color:#aaa;padding:6px">Geen aansluitingen in dit project. Voeg eerst aansluitingen toe via Groepsprofiel (GTO).</div>';
    return;
  }
  var sel={};var prios={};
  (plat.members||[]).forEach(function(m,mi){
    // backward compat: 'overig' → 'afname_invoeden', 'none' → 'geen'
    var src=m.source||'zon';
    if(src==='overig')src='afname_invoeden';
    if(src==='none')src='geen';
    sel[m.cid]=src;
    prios[m.cid]=m.prioriteit!=null?m.prioriteit:mi+1;
  });
  box.innerHTML=comps.map(function(c,i){
    var checked=sel.hasOwnProperty(c.id);
    var src=sel[c.id]||'zon';
    var prio=prios.hasOwnProperty(c.id)?prios[c.id]:i+1;
    var col=(typeof PAL!=='undefined'&&PAL[i%PAL.length])||'#888';
    function opt(v,lbl){return '<option value="'+v+'"'+(src===v?' selected':'')+'>'+lbl+'</option>';}
    // Prioriteit-input alleen voor zon/wind (expliciete opwekassets).
    // afname_invoeden krijgt altijd Prio=0 via prosumer-correctie.
    var isOpwek=(src==='zon'||src==='wind');
    return '<label class="scen-con-lbl" style="flex-direction:column;align-items:stretch">'+
      '<span style="display:flex;align-items:center;gap:7px">'+
      '<input type="checkbox" class="ehp-mck" data-cid="'+c.id+'"'+(checked?' checked':'')+'>'+
      '<span class="scen-con-dot" style="background:'+col+'"></span>'+
      '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+_ehpEsc(c.name||'Aansluiting')+'</span></span>'+
      '<span style="display:flex;gap:4px;padding-left:22px;margin-top:3px">'+
      '<select class="ehp-msrc" data-cid="'+c.id+'" style="flex:1;font-size:10px;padding:2px 4px;border:1px solid #dce6e0;border-radius:4px;background:#fff" onchange="_ehpOnSrcChange(this)">'+
      opt('zon','Zon (opwek)')+opt('wind','Wind (opwek)')+opt('afname_invoeden','Afname-invoeden')+opt('alleen_afname','Alleen afname')+opt('geen','Geen (uitsluiten)')+'</select>'+
      '<input type="number" class="ehp-mprio" data-cid="'+c.id+'" min="1" max="99" value="'+prio+'" style="width:40px;font-size:10px;padding:2px 4px;border:1px solid #dce6e0;border-radius:4px;text-align:center;display:'+(isOpwek?'':'none')+'" title="Prioriteit (laagste getal = eerst toegewezen)">'+
      '<span class="ehp-mprio-lbl" style="width:40px;font-size:9px;color:#aaa;text-align:center;padding:3px 0;display:'+(isOpwek?'none':'')+'">'+(src==='afname_invoeden'?'prio&nbsp;0':'')+'</span>'+
      '</span></label>';
  }).join('');
}

function _ehpEsc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}

function _ehpOnSrcChange(sel){
  var isOpwek=(sel.value==='zon'||sel.value==='wind');
  var isAI=(sel.value==='afname_invoeden');
  var row=sel.parentElement;
  var inp=row&&row.querySelector('input.ehp-mprio');
  var lbl=row&&row.querySelector('span.ehp-mprio-lbl');
  if(inp)inp.style.display=isOpwek?'':'none';
  if(lbl){lbl.style.display=isOpwek?'none':'';lbl.innerHTML=isAI?'prio&nbsp;0':'';}
}

// --- Mutaties ----------------------------------------------------------------

function _ehpCommit(){
  var plat=_ehpActive();
  if(!plat)return;
  plat.name=document.getElementById('ehpName').value.trim()||'Platform';
  var members=[];
  document.querySelectorAll('#ehpMembers .ehp-mck').forEach(function(cb){
    if(cb.checked){
      var cid=cb.getAttribute('data-cid');
      var s=document.querySelector('#ehpMembers .ehp-msrc[data-cid="'+cid+'"]');
      var pr=document.querySelector('#ehpMembers input.ehp-mprio[data-cid="'+cid+'"]');
      members.push({cid:cid,source:s?s.value:'zon',prioriteit:pr?Math.max(1,parseInt(pr.value)||1):1});
    }
  });
  plat.members=members;
  var num=function(id,d){var el=document.getElementById(id);if(!el)return d;var v=parseFloat(el.value);return isNaN(v)?d:v;};
  var val=function(id){var el=document.getElementById(id);return el?el.value:'';};
  var chk=function(id){var el=document.getElementById(id);return el?el.checked:false;};
  var gZon=num('ehpGelZon',20),gWind=num('ehpGelWind',20),gAI=num('ehpGelAI',0);
  var gPlat=num('ehpPlatform',0);
  plat.cfg={
    gel_zon_mwh:gZon,gel_wind_mwh:gWind,gel_ai_mwh:gAI,
    platform_mwh:gPlat,gvo_bil_mwh:num('ehpGvoBil',0),gvo_rest_mwh:num('ehpGvoRest',0),
    onb_zon_pct:num('ehpOnbZonPct',0)/100,
    onb_wind_pct:num('ehpOnbWindPct',0)/100,
    onb_vb_pct:num('ehpOnbVbPct',0)/100,
    onb_zon_risico_mwh:num('ehpOnbZonRisico',0),
    onb_wind_risico_mwh:num('ehpOnbWindRisico',0),
    onb_vb_risico_mwh:num('ehpOnbVbRisico',0),
    // Backward compat (EUR/kWh) — voor financieel.js / rekenkern.js / rapport_ehp.js
    pZon:gZon/1000,pWind:gWind/1000,pOverig:gAI/1000,
    fee:gPlat/1000,feeMode:'kwh',pNetAfname:0.12,pNetTerug:0.04,
    ebOn:chk('ehpEbOn'),ebJaar:val('ehpEbJaar'),ebGrondslag:val('ehpEbGrondslag'),
    heffingskorting:num('ehpHeffing',0),btwOn:chk('ehpBtwOn'),btwPct:num('ehpBtwPct',21)
  };
  saveMeta();
}

function addEhp(){
  var p=_ehpProj();
  if(!p){notify('Maak eerst een project aan',false);return;}
  if(_ehpActive())_ehpCommit();
  var pf={id:uid(),name:'Platform '+(p.ehps.length+1),members:[],cfg:_ehpDefaults()};
  p.ehps.push(pf);
  _ehpActiveId=pf.id;
  saveMeta();
  renderEHP();
}

function delEhp(){
  var p=_ehpProj();var plat=_ehpActive();
  if(!p||!plat)return;
  p.ehps=p.ehps.filter(function(x){return x.id!==plat.id;});
  _ehpActiveId=p.ehps.length?p.ehps[0].id:null;
  _ehpLast=null;
  saveMeta();
  document.getElementById('ehpResults').innerHTML='<div class="verg-empty"><div class="big">⇄</div>Selecteer of maak een handelsplatform.</div>';
  document.getElementById('btnDlEhp').disabled=true;
  renderEHP();
}

function selectEhp(id){
  if(_ehpActive())_ehpCommit();
  _ehpActiveId=id;
  _ehpLast=null;
  document.getElementById('btnDlEhp').disabled=true;
  renderEHP();
}

// --- Rekenkern ---------------------------------------------------------------

var _ehpOpwekRows=null; // module-level: meest recent geladen opwek-rijen (voor hergebruik)
var _ehpEpexRows=null;
var _ehpForwardRows=null;

async function calcEHP(){
  var p=_ehpProj(); var plat=_ehpActive();
  if(!plat){notify('Selecteer eerst een platform',false);return;}
  _ehpCommit();
  var members=plat.members||[];
  if(!members.length){notify('Selecteer minimaal één deelnemer',false);return;}
  var cfg=plat.cfg;

  // --- Verbruiksdata uit IndexedDB ---
  var memberMeta={};
  var withData=[],skipped=[];
  for(var i=0;i<members.length;i++){
    var comp=null;
    for(var j=0;j<p.companies.length;j++){if(p.companies[j].id===members[i].cid){comp=p.companies[j];break;}}
    if(!comp)continue;
    var d=await dbGet('ts',comp.id)||[];
    if(!d.length){skipped.push(comp.name);continue;}
    memberMeta[comp.name]={source:members[i].source||'zon',
      priceA:typeof comp.priceA==='number'?comp.priceA:0.12,
      priceT:typeof comp.priceT==='number'?comp.priceT:0.08};
    withData.push({comp:comp,source:members[i].source||'zon',prioriteit:members[i].prioriteit||1,data:d});
  }
  if(!withData.length){notify('Geen deelnemer met gemeten data',false);return;}

  // Bouw verbruik én opwek op basis van deelnemerrol en kW-teken
  var verbruikRows=[];
  var opwekRows=[];
  withData.forEach(function(wd){
    var src=wd.source;
    var prio=wd.prioriteit||1;
    if(src==='geen')return;
    wd.data.forEach(function(rec){
      // Normaliseer de bron-ts naar de lokale rapportagetijd (interval-eind) vóór matching.
      // Date uit de lokale wandklok-sleutel zodat week/maand-bucketing op rapportagetijd valt.
      var tijdKey=_ehpReportKey(rec.ts,src);
      var tsDate=new Date(tijdKey);
      if(isNaN(tsDate.getTime()))return;
      var kwh=rec.kw*0.25;
      if(kwh<0&&src!=='alleen_afname'){
        var opwekPrio=(src==='afname_invoeden')?0:prio;
        opwekRows.push({
          'Tijd (UTC)':tsDate,tijdKey:tijdKey,
          Asset:wd.comp.name,
          Type:src,Type_norm:EnergieModel.normalizeType(src),
          Prioriteit:opwekPrio,
          opwek_kWh:-kwh,
          Gebruiker:''
        });
      }
      var vKwh=Math.max(0,kwh);
      if(vKwh!==0){
        verbruikRows.push({
          'Tijd (UTC)':tsDate,tijdKey:tijdKey,
          Locatie:wd.comp.name,
          gebruik_kWh:vKwh
        });
      }
    });
  });
  // Additioneel handmatig geladen opwek samenvoegen (optioneel)
  if(plat.opwekRows&&plat.opwekRows.length){opwekRows=opwekRows.concat(plat.opwekRows);}

  // --- EPEX en forwardcurve uit opgeslagen data op het platform-object ---
  var epexRows   = (plat.epexRows)    || [];
  var forwardRows= (plat.forwardRows) || [];

  // --- Parse-tijd debug (window.EHP_DEBUG): lokaliseer volumeverschil vóór allocatie ---
  // Logt per asset het verbruik (positieve rec.kw) en de opwek (negatieve rec.kw), plus de
  // EPEX-sleuteldekking. Vergelijk met de EXE-maandtabel om data/import vs engine te scheiden.
  if(window.EHP_DEBUG){
    try{
      var dbgVerb={},dbgVerbTot=0;
      verbruikRows.forEach(function(r){dbgVerb[r.Locatie]=(dbgVerb[r.Locatie]||0)+r.gebruik_kWh;dbgVerbTot+=r.gebruik_kWh;});
      var dbgOpw={},dbgOpwTot=0;
      opwekRows.forEach(function(r){var k=r.Asset+' ['+r.Type_norm+' p'+r.Prioriteit+']';dbgOpw[k]=(dbgOpw[k]||0)+r.opwek_kWh;dbgOpwTot+=r.opwek_kWh;});
      var verbKeys={};verbruikRows.forEach(function(r){verbKeys[r.tijdKey]=1;});
      var epexHit=0,epexKeys={};epexRows.forEach(function(r){epexKeys[r.tijdKey]=1;});
      Object.keys(verbKeys).forEach(function(k){if(epexKeys[k])epexHit++;});
      console.groupCollapsed('[EHP debug] parse-tijd volumes (kWh)');
      console.log('Verbruik per asset (positieve rec.kw):',dbgVerb,'→ totaal',Math.round(dbgVerbTot));
      console.log('Opwek per asset (negatieve rec.kw):',dbgOpw,'→ totaal',Math.round(dbgOpwTot));
      console.log('EPEX-sleuteldekking: '+epexHit+' / '+Object.keys(verbKeys).length+' verbruik-kwartieren hebben een EPEX-prijs'+
        (epexRows.length&&epexHit===0?'  ⚠️ GEEN match — controleer tijdzone/sleutelformaat':''));
      console.groupEnd();
    }catch(_dbgErr){console.warn('[EHP debug] parse-log faalde:',_dbgErr);}
  }

  // --- Tarieven (EUR/MWh → EUR/kWh) ---
  var tarieven={
    gelijktijdigheid_zon:             (cfg.gel_zon_mwh||0)/1000,
    gelijktijdigheid_wind:            (cfg.gel_wind_mwh||0)/1000,
    gelijktijdigheid_afname_invoeden: (cfg.gel_ai_mwh||0)/1000,
    platform:                         (cfg.platform_mwh||0)/1000,
    gvo_bilateraal:                   (cfg.gvo_bil_mwh||0)/1000,
    gvo_rest:                         (cfg.gvo_rest_mwh||0)/1000,
    onbalans_zon_pct:                 cfg.onb_zon_pct||0,
    onbalans_wind_pct:                cfg.onb_wind_pct||0,
    onbalans_verbruik_pct:            cfg.onb_vb_pct||0,
    onbalans_zon_risicoprijs:         (cfg.onb_zon_risico_mwh||0)/1000,
    onbalans_wind_risicoprijs:        (cfg.onb_wind_risico_mwh||0)/1000,
    onbalans_verbruik_risicoprijs:    (cfg.onb_vb_risico_mwh||0)/1000
  };

  // --- EnergieModel.buildModel aanroepen ---
  var result;
  try{
    result=EnergieModel.buildModel({
      verbruik:     verbruikRows,
      opwek:        opwekRows,
      epex:         epexRows,
      tarieven:     tarieven,
      scenario:     {},
      forwardcurve: forwardRows
    });
  }catch(e){
    notify('Rekenfout: '+e.message,false);
    console.error('EnergieModel.buildModel:',e);
    return;
  }

  var sam=result.samenvatting;
  var model=result.model;

  // --- Tijdreeks voor bestaande chart-functies ---
  var allTs=model.map(function(r){return r.tijdKey;});

  // Netto kW per kwartier (positief = tekort/inkoop van net, negatief = overschot/teruglevering)
  var ehpNetKw=model.map(function(r){return (r.tekort_kWh-r.overschot_kWh)/0.25;});

  // Week/maand aggregaties
  var ehpWeekAvgSum=new Array(672).fill(0),ehpWeekAvgCnt=new Array(672).fill(0);
  var ehpMonthImp={},ehpMonthExp={};
  model.forEach(function(r,i){
    var ts=r['Tijd (UTC)'];
    var dow=(ts.getDay()+6)%7;
    var sl=dow*96+Math.floor((ts.getHours()*60+ts.getMinutes())/15);
    ehpWeekAvgSum[sl]+=ehpNetKw[i];ehpWeekAvgCnt[sl]++;
    var mn=r.tijdKey.slice(0,7);
    if(r.tekort_kWh>0)ehpMonthImp[mn]=(ehpMonthImp[mn]||0)+r.tekort_kWh;
    if(r.overschot_kWh>0)ehpMonthExp[mn]=(ehpMonthExp[mn]||0)+r.overschot_kWh;
  });
  var ehpWeekAvg=ehpWeekAvgSum.map(function(s,i){return ehpWeekAvgCnt[i]>0?s/ehpWeekAvgCnt[i]:0;});
  var ehpWeekNet=ehpWeekAvg.map(function(v){return Math.max(0,v);});

  // Gelijktijdigheidsstatistieken (count van kwartieren)
  var nBoth=0,nProdOnly=0,nDemOnly=0,nNone=0,maxMatchKw=0,peakProdKw=0,peakDemKw=0;
  model.forEach(function(r){
    var hasP=r.totaal_opwek_kWh>0,hasD=r.totaal_verbruik_kWh>0;
    if(hasP&&hasD)nBoth++;else if(hasP)nProdOnly++;else if(hasD)nDemOnly++;else nNone++;
    var gKw=r.gelijktijdig_kWh/0.25;
    if(gKw>maxMatchKw)maxMatchKw=gKw;
    if(r.totaal_opwek_kWh/0.25>peakProdKw)peakProdKw=r.totaal_opwek_kWh/0.25;
    if(r.totaal_verbruik_kWh/0.25>peakDemKw)peakDemKw=r.totaal_verbruik_kWh/0.25;
  });

  // --- Backward compat: parties[] (per verbruiker) ---
  var opwekkerByNaam={};
  result.per_opwekker.forEach(function(o){opwekkerByNaam[o.Asset]=o;});
  var parties=result.per_gebruiker.map(function(u){
    var meta=memberMeta[u.Locatie]||{source:'overig',priceA:0.12,priceT:0.08};
    var opw=opwekkerByNaam[u.Locatie]||null;
    return {
      id:u.Locatie,name:u.Locatie,source:meta.source,
      priceA:meta.priceA,priceT:meta.priceT,
      // Backward compat fields (gebruikt door renderEhpResults, rapport_ehp.js, _ehpPartyCard)
      prodKwh:opw?opw.totaal_opwek_kWh:(u.afname_invoeden_kWh||0),
      consKwh:u.totaal_verbruik_kWh||0,
      intSoldKwh:opw?opw.gelijktijdig_kWh:0,
      intBoughtKwh:u.gelijktijdig_kWh||0,
      gridExpKwh:opw?opw.overschot_kWh:(u.afname_invoeden_kWh||0),
      gridImpKwh:u.tekort_kWh||0,
      eurInt:0,eurGrid:0,net:0,baseEur:0,savings:0,totaal:0,baseTotaal:0,
      // Nieuwe velden beschikbaar voor toekomstig gebruik
      totaal_verbruik_kWh:u.totaal_verbruik_kWh||0,
      gelijktijdig_kWh:u.gelijktijdig_kWh||0,
      tekort_kWh:u.tekort_kWh||0,
      kosten_totaal_EUR:u.kosten_totaal_EUR||0
    };
  });

  // Voeg pure opwekkers (zon/wind zonder verbruiksrecord) toe aan parties[]
  var gebruikerSet={};
  result.per_gebruiker.forEach(function(u){gebruikerSet[u.Locatie]=1;});
  result.per_opwekker.forEach(function(o){
    if(gebruikerSet[o.Asset])return;
    var meta=memberMeta[o.Asset]||{source:o.Type_norm||'zon',priceA:0,priceT:0};
    parties.push({
      id:o.Asset,name:o.Asset,source:meta.source,
      priceA:meta.priceA,priceT:meta.priceT,
      prodKwh:o.totaal_opwek_kWh||0,consKwh:0,
      intSoldKwh:o.gelijktijdig_kWh||0,intBoughtKwh:0,
      gridExpKwh:o.overschot_kWh||0,gridImpKwh:0,
      eurInt:0,eurGrid:0,net:0,baseEur:0,savings:0,totaal:0,baseTotaal:0,
      totaal_verbruik_kWh:0,gelijktijdig_kWh:o.gelijktijdig_kWh||0,
      tekort_kWh:0,kosten_totaal_EUR:0
    });
  });

  // --- Backward compat: prodBySrc, matchedBySrc ---
  var prodBySrc={zon:(sam.opwek_zon_kWh||0)+(sam.opwek_afname_invoeden_kWh||0),wind:sam.opwek_wind_kWh||0,overig:0};
  var matchedBySrc={zon:(sam.gelijktijdig_zon_kWh||0)+(sam.gelijktijdig_afname_invoeden_kWh||0),wind:sam.gelijktijdig_wind_kWh||0,overig:0};

  // --- Niet-leden: aansluitingen niet in dit platform ---
  var memberSet={};members.forEach(function(mem){memberSet[mem.cid]=1;});
  var ehpImportCount=ehpNetKw.filter(function(v){return v>0;}).length;
  var ehpNetKwByTs={};allTs.forEach(function(tk,i){ehpNetKwByTs[tk]=ehpNetKw[i];});
  var nonMembers=[];
  for(var ni=0;ni<p.companies.length;ni++){
    var nc=p.companies[ni];
    if(memberSet[nc.id])continue;
    var nd=await dbGet('ts',nc.id)||[];
    if(!nd.length)continue;
    var ndMap={};nd.forEach(function(rec){ndMap[rec.ts.slice(0,16)]=rec.kw;});
    var nmProd=0,nmCons=0,nmPeak=0,nmSim=0;
    var nmWeekSum=new Array(672).fill(0),nmWeekCnt=new Array(672).fill(0),nmMonthProd={};
    nd.forEach(function(rec){
      if(rec.kw<0){
        var prod2=-rec.kw;
        nmProd+=prod2*0.25;if(prod2>nmPeak)nmPeak=prod2;
        var d2=new Date(rec.ts);
        var dow2=(d2.getDay()+6)%7;
        var sl2=dow2*96+Math.floor((d2.getHours()*60+d2.getMinutes())/15);
        nmWeekSum[sl2]+=prod2;nmWeekCnt[sl2]++;
        var mn2=rec.ts.slice(0,7);nmMonthProd[mn2]=(nmMonthProd[mn2]||0)+prod2*0.25;
      }else if(rec.kw>0){nmCons+=rec.kw*0.25;}
    });
    var nmWeekProd=nmWeekSum.map(function(sv2,i2){return nmWeekCnt[i2]>0?sv2/nmWeekCnt[i2]:0;});
    if(ehpImportCount>0){
      Object.keys(ndMap).forEach(function(tk2){
        if(ehpNetKwByTs[tk2]>0&&ndMap[tk2]<0)nmSim++;
      });
    }
    nonMembers.push({id:nc.id,name:nc.name,prodKwh:nmProd,consKwh:nmCons,peakProd:nmPeak,
      simScore:ehpImportCount>0?nmSim/ehpImportCount*100:0,
      weekProd:nmWeekProd,monthProd:nmMonthProd});
  }

  var bcCfg=Object.assign({},cfg);

  _ehpLast={
    platName:plat.name,ts:allTs,parties:parties,cfg:bcCfg,
    // Backward compat totalen (oud naamschema)
    totProdKwh:sam.totaal_opwek_kWh||0,
    totConsKwh:sam.totaal_verbruik_kWh||0,
    totMatchedKwh:sam.gelijktijdig_kWh||0,
    totGridImpKwh:sam.tekort_kWh||0,
    totGridExpKwh:sam.overschot_kWh||0,
    selfCons:sam.gelijktijdigheid_pct_van_opwek||0,
    selfSuff:sam.gelijktijdigheid_pct_van_verbruik||0,
    prodBySrc:prodBySrc,matchedBySrc:matchedBySrc,
    platformFee:0,totNet:0,totBaseEur:0,totSavings:0,
    nBoth:nBoth,nProdOnly:nProdOnly,nDemOnly:nDemOnly,nNone:nNone,
    maxMatchKw:maxMatchKw,peakProdKw:peakProdKw,peakDemKw:peakDemKw,
    skipped:skipped,nonMembers:nonMembers,
    ehpNetKw:ehpNetKw,ehpWeekAvg:ehpWeekAvg,ehpWeekNet:ehpWeekNet,
    ehpMonthImp:ehpMonthImp,ehpMonthExp:ehpMonthExp,
    // Nieuwe velden
    samenvatting:sam,per_gebruiker:result.per_gebruiker,
    per_opwekker:result.per_opwekker,model:model,
    model_fwd:result.model_forward||null,
    controle:result.controle||[],
    samenvatting_fwd:result.samenvatting_fwd||null,
    tarieven_cfg:{
      gel_zon_mwh:cfg.gel_zon_mwh||0,gel_wind_mwh:cfg.gel_wind_mwh||0,
      gel_ai_mwh:cfg.gel_ai_mwh||0,platform_mwh:cfg.platform_mwh||0,
      gvo_bil_mwh:cfg.gvo_bil_mwh||0,gvo_rest_mwh:cfg.gvo_rest_mwh||0,
      onb_zon_risico_mwh:cfg.onb_zon_risico_mwh||0,
      onb_wind_risico_mwh:cfg.onb_wind_risico_mwh||0
    }
  };

  _ehpPlatWeekSeiz=null;
  renderEhpResults(_ehpLast);
  document.getElementById('btnDlEhp').disabled=false;
  var nQ=allTs.length;
  var cNote=result.controle&&result.controle.length?' · '+result.controle.length+' controle-melding(en) (zie console)':'';
  notify('Handelsplatform berekend — '+nQ+' kwartierwaarden'+(skipped.length?' ('+skipped.length+' deelnemer(s) zonder data overgeslagen)':'')+cNote);
  if(result.controle&&result.controle.length)console.info('EHP controle:',result.controle);
}

// --- Bestand-upload handlers -------------------------------------------------

function _ehpUpdateFileStatus(plat){
  if(!plat)return;
  var epexEl=document.getElementById('ehpEpexInfo');
  var fwdEl=document.getElementById('ehpFwdInfo');
  if(epexEl)epexEl.textContent=plat.epexRows&&plat.epexRows.length
    ?plat.epexRows.length+' EPEX-kwartieren geladen'
    :'Geen EPEX geladen (basisprijs wordt gebruikt)';
  if(fwdEl)fwdEl.textContent=plat.forwardRows&&plat.forwardRows.length
    ?plat.forwardRows.length+' forward-maanden geladen'
    :'Geen forwardcurve geladen';
}

function _ehpLoadXlsx(file,cb){
  if(!file)return;
  var r=new FileReader();
  r.onload=function(e){
    try{
      var wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
      cb(null,wb);
    }catch(err){cb(err,null);}
  };
  r.onerror=function(){cb(new Error('Kan bestand niet lezen'),null);};
  r.readAsArrayBuffer(file);
}

function _ehpHandleOpwekFile(file){
  var plat=_ehpActive();if(!plat)return;
  _ehpLoadXlsx(file,function(err,wb){
    if(err){notify('Opwek-import mislukt: '+err.message,false);return;}
    try{
      var rows=EnergieModel.readOpwekExcel(wb);
      if(!rows.length){notify('Geen opwekrijen gevonden in bestand',false);return;}
      plat.opwekRows=rows;
      saveMeta();
      _ehpUpdateFileStatus(plat);
      var assetSet={};rows.forEach(function(r){assetSet[r.Asset]=1;});
      notify(rows.length+' opwek-rijen geïmporteerd ('+Object.keys(assetSet).length+' assets)');
    }catch(e){notify('Opwek-parse mislukt: '+e.message,false);console.error(e);}
  });
}

function _ehpHandleEpexFile(file){
  var plat=_ehpActive();if(!plat)return;
  _ehpLoadXlsx(file,function(err,wb){
    if(err){notify('EPEX-import mislukt: '+err.message,false);return;}
    try{
      var rows=EnergieModel.readEpexExcel(wb);
      if(!rows.length){notify('Geen EPEX-prijzen gevonden in bestand',false);return;}
      plat.epexRows=rows;
      saveMeta();
      _ehpUpdateFileStatus(plat);
      notify(rows.length+' EPEX-kwartierwaarden geïmporteerd');
    }catch(e){notify('EPEX-parse mislukt: '+e.message,false);console.error(e);}
  });
}

function _ehpHandleForwardFile(file){
  var plat=_ehpActive();if(!plat)return;
  _ehpLoadXlsx(file,function(err,wb){
    if(err){notify('Forwardcurve-import mislukt: '+err.message,false);return;}
    try{
      var rows=EnergieModel.readForwardcurveExcel(wb);
      if(!rows.length){notify('Geen forwardcurve-rijen gevonden in bestand',false);return;}
      plat.forwardRows=rows;
      saveMeta();
      _ehpUpdateFileStatus(plat);
      notify(rows.length+' forwardcurve-maanden geïmporteerd');
    }catch(e){notify('Forwardcurve-parse mislukt: '+e.message,false);console.error(e);}
  });
}


// --- Resultaten --------------------------------------------------------------

function _e2(n){return (Math.round(n*100)/100).toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2});}
function _eMoney(n){var s=n>=0?'+':'−';return s+' € '+_e2(Math.abs(n));}

function renderEhpResults(res){
  var d0=res.ts[0].slice(0,10),d1=res.ts[res.ts.length-1].slice(0,10);

  var headline='<div class="cd">'+
    '<div class="kl">Platform: '+_ehpEsc(res.platName)+' · periode '+d0+' t/m '+d1+'</div>'+
    '</div>';

  // KPI-blok volumes & gelijktijdigheid
  var kpis=[
    ['Deelnemers',res.parties.length,''],
    ['Periode',d0,'t/m '+d1],
    ['Totaal opwek',fmt(res.totProdKwh/1000)+' MWh',''],
    ['Totaal verbruik',fmt(res.totConsKwh/1000)+' MWh',''],
    ['Intern verrekend',fmt(res.totMatchedKwh/1000)+' MWh',''],
    ['Zelfconsumptie',res.selfCons.toFixed(1)+'%','van opwek'],
    ['Zelfvoorziening',res.selfSuff.toFixed(1)+'%','van verbruik'],
    ['Naar net',fmt(res.totGridExpKwh/1000)+' MWh','overschot opwek'],
    ['Van net',fmt(res.totGridImpKwh/1000)+' MWh','tekort verbruik']
  ];
  var kpiHtml='<div class="kg">'+kpis.map(function(k){
    return '<div class="kb"><div class="kl">'+k[0]+'</div><div class="kv" style="font-size:15px">'+k[1]+'</div><div class="ku">'+k[2]+'</div></div>';
  }).join('')+'</div>';

  // Gelijktijdigheid
  var simHtml='<div class="cd"><div class="ct2"><div class="ac" style="background:#2c7fb8"></div>Gelijktijdigheid opwek &amp; afname</div>'+
    '<div class="kg">'+
      '<div class="kb"><div class="kl">Kwartieren met overlap</div><div class="kv" style="font-size:18px">'+res.nBoth+'</div><div class="ku">opwek én verbruik</div></div>'+
      '<div class="kb"><div class="kl">Alleen opwek</div><div class="kv" style="font-size:18px">'+res.nProdOnly+'</div><div class="ku">→ geheel naar net</div></div>'+
      '<div class="kb"><div class="kl">Alleen verbruik</div><div class="kv" style="font-size:18px">'+res.nDemOnly+'</div><div class="ku">→ geheel van net</div></div>'+
      '<div class="kb"><div class="kl">Piek-overlap</div><div class="kv" style="font-size:18px">'+fmt(res.maxMatchKw)+' kW</div><div class="ku">max. gelijktijdig</div></div>'+
      '<div class="kb"><div class="kl">Piek opwek</div><div class="kv" style="font-size:18px">'+fmt(res.peakProdKw)+' kW</div><div class="ku">groep</div></div>'+
      '<div class="kb"><div class="kl">Piek verbruik</div><div class="kv" style="font-size:18px">'+fmt(res.peakDemKw)+' kW</div><div class="ku">groep</div></div>'+
    '</div></div>';

  // Flow-diagram
  var flowHtml='<div class="ehp-flow"><div class="ct2"><div class="ac" style="background:#5fb3df"></div>Energiestromen — '+_ehpEsc(res.platName)+'</div>'+
    _ehpFlowSvg(res)+
    '<div class="ib2" style="margin-top:6px">Lijndikte ∝ kWh over de hele periode. Pool = intern verrekend. Sleep de blokken om de grafiek overzichtelijker te maken.</div></div>';

  // Samenvattingstabel volumes (geen financiële kolommen — zie Jaarrekening-tab)
  var srcLbl={zon:'Zon',wind:'Wind',afname_invoeden:'Afname-invoeden',overig:'Overig',none:'Alleen afnemer',alleen_afname:'Alleen afnemer',geen:'Geen'};
  var rows=res.parties.map(function(x){
    return '<tr><td style="font-weight:700">'+_ehpEsc(x.name)+'</td>'+
      '<td>'+(srcLbl[x.source]||x.source)+'</td>'+
      '<td>'+fmt(x.prodKwh)+'</td>'+
      '<td>'+fmt(x.consKwh)+'</td>'+
      '<td>'+fmt(x.intSoldKwh)+'</td>'+
      '<td>'+fmt(x.intBoughtKwh)+'</td>'+
      '<td>'+fmt(x.gridExpKwh)+'</td>'+
      '<td>'+fmt(x.gridImpKwh)+'</td></tr>';
  }).join('');
  var skipNote=res.skipped&&res.skipped.length?
    '<div class="opt-warn">Zonder gemeten data, niet meegerekend: '+res.skipped.map(_ehpEsc).join(', ')+'</div>':'';
  var summaryHtml='<div class="cd ehp-grp"><div class="ct2"><div class="ac" style="background:#2c7fb8"></div>Samenvatting per deelnemer — '+_ehpEsc(res.platName)+'</div>'+
    '<div style="overflow-x:auto"><table class="verg-tbl"><thead><tr>'+
    '<th>Deelnemer</th><th>Bron</th><th>Opwek kWh</th><th>Verbruik kWh</th>'+
    '<th class="scen-h">Intern verkocht</th><th class="scen-h">Intern gekocht</th>'+
    '<th>Naar net kWh</th><th>Van net kWh</th>'+
    '</tr></thead>'+
    '<tbody>'+rows+'</tbody></table></div></div>';

  // Per-deelnemer stroom-kaarten
  var partyCards='<div class="cd"><div class="ct2"><div class="ac" style="background:#46962b"></div>Energiestromen per deelnemer</div>'+
    '<div class="ehp-party-grid">'+res.parties.map(function(x){return _ehpPartyCard(x,res);}).join('')+'</div></div>';

  // Niet-leden: aansluitingen in het project buiten dit platform
  var nm=res.nonMembers||[];
  var nonMemHtml=_ehpNonMembersHtml(nm);
  var hasNm=nm.some(function(m){return m.prodKwh>0||m.consKwh>0;});

  // Analyse-tab: gelijktijdigheid binnen de groep + EPEX-prijs (per maand of heel het jaar)
  var gelEpexMonths={};
  (res.model||[]).forEach(function(r){gelEpexMonths[r.tijdKey.slice(0,7)]=1;});
  var gelEpexMonthOpts=Object.keys(gelEpexMonths).sort().map(function(mn){
    var p=mn.split('-');return '<option value="'+mn+'">'+MND[parseInt(p[1],10)-1]+" '"+p[0].slice(2)+'</option>';
  }).join('');
  var gelEpexHtml=
    '<div class="cd">'+
      '<div class="ct2" style="flex-wrap:wrap;gap:6px"><div class="ac" style="background:#46962b"></div>'+
      'Weekpatroon gelijktijdigheid &amp; EPEX-prijs — '+_ehpEsc(res.platName)+
      '<div style="margin-left:auto;display:flex;gap:6px;align-items:center">'+
        '<label for="ehpGelEpexMonth" style="font-size:12px;color:#777;font-family:Barlow,sans-serif">Periode</label>'+
        '<select id="ehpGelEpexMonth" onchange="setEhpGelEpexMonth(this.value)" '+
          'style="font-size:12px;padding:5px 9px;border:1px solid #d6e0d2;border-radius:8px;font-family:Barlow,sans-serif;background:#fff;cursor:pointer">'+
          '<option value="all">Heel het jaar</option>'+gelEpexMonthOpts+
        '</select>'+
      '</div>'+
      '</div>'+
      '<div class="ib2" style="margin-bottom:8px">Gemiddeld vermogen per kwartier van de week. '+
      'Groen = opwek gesaldeerd binnen de groep, grijs = overschot teruggeleverd aan het net. '+
      'De oranje stippellijn is de gemiddelde EPEX-prijs per kwartier (rechter-as) — '+
      'zo zie je wanneer de groep zelf opwek benut en tegen welke marktprijs het overschot weglekt.</div>'+
      '<div class="cw" style="height:280px"><canvas id="cEhpGelEpex" role="img"></canvas></div>'+
    '</div>';

  // Analyse-tab: platform week/maand patronen
  var platAnalyseHtml=
    gelEpexHtml+
    '<div class="cd">'+
      '<div class="ct2" style="flex-wrap:wrap;gap:6px"><div class="ac" style="background:#2c7fb8"></div>'+
      'Weekpatroon inkoop &amp; teruglevering — '+_ehpEsc(res.platName)+
      '<div id="ehpPlatWeekSeizFilter" style="margin-left:auto;display:flex;gap:3px;flex-wrap:wrap;align-items:center">'+
        '<button data-sf="all" onclick="setEhpPlatWeekSeiz(\'all\')" style="font-size:12px;padding:5px 9px;border:none;border-radius:12px;cursor:pointer;font-family:Barlow,sans-serif">Heel het jaar</button>'+
        '<button data-sf="win" onclick="setEhpPlatWeekSeiz(\'win\')" style="font-size:12px;padding:5px 9px;border:none;border-radius:12px;cursor:pointer;font-family:Barlow,sans-serif">Winter</button>'+
        '<button data-sf="spr" onclick="setEhpPlatWeekSeiz(\'spr\')" style="font-size:12px;padding:5px 9px;border:none;border-radius:12px;cursor:pointer;font-family:Barlow,sans-serif">Lente</button>'+
        '<button data-sf="sum" onclick="setEhpPlatWeekSeiz(\'sum\')" style="font-size:12px;padding:5px 9px;border:none;border-radius:12px;cursor:pointer;font-family:Barlow,sans-serif">Zomer</button>'+
        '<button data-sf="aut" onclick="setEhpPlatWeekSeiz(\'aut\')" style="font-size:12px;padding:5px 9px;border:none;border-radius:12px;cursor:pointer;font-family:Barlow,sans-serif">Herfst</button>'+
      '</div>'+
      '</div>'+
      '<div class="ib2" style="margin-bottom:8px">Gemiddeld nettovermogen per kwartier van de week. '+
      'Blauw = inkoop van net (vraag &gt; aanbod). Groen = teruglevering aan net (aanbod &gt; vraag).</div>'+
      '<div class="cw" style="height:260px"><canvas id="cEhpPlatWeek" role="img"></canvas></div>'+
    '</div>'+
    '<div class="cd">'+
      '<div class="ct2"><div class="ac" style="background:#2c7fb8"></div>Maandpatroon inkoop &amp; teruglevering</div>'+
      '<div class="ib2" style="margin-bottom:8px">Totale kWh inkoop van het net en teruglevering aan het net per maand.</div>'+
      '<div class="cw" style="height:260px"><canvas id="cEhpPlatMonth" role="img"></canvas></div>'+
    '</div>';

  document.getElementById('ehpResults').innerHTML=
    '<div class="tabs">'+
      '<button class="tab on" data-ehp-tab="tEhpOv">Overzicht</button>'+
      '<button class="tab" data-ehp-tab="tEhpAn">Analyse</button>'+
      '<button class="tab" data-ehp-tab="tEhpDeel">Deelnemers</button>'+
      '<button class="tab" data-ehp-tab="tEhpGel">Gelijktijdigheid</button>'+
      '<button class="tab" data-ehp-tab="tEhpKans">Kansen</button>'+
      (hasNm?'<button class="tab" data-ehp-tab="tEhpNm">Niet-leden</button>':'')+
    '</div>'+
    '<div id="tEhpOv" class="pn on">'+headline+kpiHtml+_ehpOverzichtHtml(res)+simHtml+'</div>'+
    '<div id="tEhpAn" class="pn">'+flowHtml+platAnalyseHtml+'</div>'+
    '<div id="tEhpDeel" class="pn">'+skipNote+summaryHtml+_ehpFactuurHtml(res)+partyCards+'</div>'+
    '<div id="tEhpGel" class="pn">'+_ehpGelijktijdheidHtml(res)+'</div>'+
    '<div id="tEhpKans" class="pn">'+_ehpKansenHtml(res)+'</div>'+
    (hasNm?'<div id="tEhpNm" class="pn">'+nonMemHtml+'</div>':'');

  _ehpAttachFlowDrag();
  _ehpAttachTabs();

  // Platform grafieken (Analyse-tab — panel hidden, resize bij tab-switch)
  _ehpGelEpexMonth='all';
  _ehpRenderGelEpexChart();
  _ehpRenderPlatWeekChart();
  _ehpDrawPlatMonthChart(res.ehpMonthImp||{},res.ehpMonthExp||{});

  // Kansen-tab grafieken (paneel hidden, resize bij tab-switch)
  _ehpNetPosMonth='all';
  _ehpRenderNetPositieChart();
  _ehpDrawKansenHeatmap();
  _ehpRenderKansenTabel();

  // Niet-leden grafieken
  if(hasNm)_ehpDrawNonMemberChart(nm);
  var nmProd=nm.filter(function(m){return m.prodKwh>0;});
  if(nmProd.length){_ehpDrawWeekChart(nmProd,res.ehpWeekNet||[]);_ehpDrawMonthChart(nmProd);}
}

// --- Tab-navigatie EHP -------------------------------------------------------

function _ehpAttachTabs(){
  var res=document.getElementById('ehpResults');
  if(!res)return;
  res.addEventListener('click',function(e){
    // Gelijktijdigheid: 3-weg keuze Platform / Afnemers / Invoeders
    var gel=e.target.closest('[data-gel-view]');
    if(gel){
      var view=gel.getAttribute('data-gel-view');
      res.querySelectorAll('[data-gel-view]').forEach(function(b){b.classList.toggle('on',b===gel);});
      res.querySelectorAll('[data-gel-pane]').forEach(function(p){
        p.hidden=p.getAttribute('data-gel-pane')!==view;
      });
      return;
    }
    var btn=e.target.closest('[data-ehp-tab]');
    if(!btn)return;
    var id=btn.getAttribute('data-ehp-tab');
    res.querySelectorAll('[data-ehp-tab]').forEach(function(b){b.classList.remove('on');});
    btn.classList.add('on');
    res.querySelectorAll('.pn').forEach(function(p){p.classList.remove('on');});
    var panel=document.getElementById(id);
    if(panel)panel.classList.add('on');
    // Charts in hidden panels hadden size 0 bij eerste render — resize na DOM-update
    setTimeout(function(){
      ['ehpGelEpex','ehpPlatWeek','ehpPlatMonth','ehpNonMem','ehpWeek','ehpMonth','ehpNetPos'].forEach(function(k){
        if(CH[k])try{CH[k].resize();}catch(_){}
      });
    },30);
  });
}

// --- Gelijktijdigheid + EPEX-weekpatroon (Analyse-tab) -----------------------

var _ehpGelEpexMonth='all'; // 'all' of 'YYYY-MM'

function setEhpGelEpexMonth(val){
  _ehpGelEpexMonth=val||'all';
  _ehpRenderGelEpexChart();
}

function _ehpRenderGelEpexChart(){
  var res=_ehpLast;if(!res||!res.model)return;
  var mf=_ehpGelEpexMonth,S=672;
  var matchSum=new Array(S).fill(0),expSum=new Array(S).fill(0),kwCnt=new Array(S).fill(0);
  var epexSum=new Array(S).fill(0),epexCnt=new Array(S).fill(0);
  res.model.forEach(function(r){
    if(mf!=='all'&&r.tijdKey.slice(0,7)!==mf)return;
    var d=r['Tijd (UTC)'];if(!d)return;
    var dow=(d.getDay()+6)%7;
    var sl=dow*96+Math.floor((d.getHours()*60+d.getMinutes())/15);
    if(sl<0||sl>=S)return;
    matchSum[sl]+=(r.gelijktijdig_kWh||0)/0.25;
    expSum[sl]+=(r.overschot_kWh||0)/0.25;
    kwCnt[sl]++;
    if(typeof r.epex_eur_per_kWh==='number'){epexSum[sl]+=r.epex_eur_per_kWh;epexCnt[sl]++;}
  });
  var matchAvg=matchSum.map(function(s,i){return kwCnt[i]>0?+(s/kwCnt[i]).toFixed(2):0;});
  // Bovenrand grijze band = gesaldeerd + teruggeleverd (fill:'-1' kleurt het verschil = overschot)
  var totAvg=matchAvg.map(function(v,i){return +(v+(kwCnt[i]>0?expSum[i]/kwCnt[i]:0)).toFixed(2);});
  var epexAvg=epexSum.map(function(s,i){return epexCnt[i]>0?+(s/epexCnt[i]*1000).toFixed(1):null;}); // €/MWh
  var hasEpex=epexAvg.some(function(v){return v!==null&&v!==0;});
  _ehpDrawGelEpexChart(matchAvg,totAvg,epexAvg,hasEpex);
}

function _ehpDrawGelEpexChart(matchAvg,totAvg,epexAvg,hasEpex){
  if(CH['ehpGelEpex']){CH['ehpGelEpex'].destroy();delete CH['ehpGelEpex'];}
  var canvas=document.getElementById('cEhpGelEpex');
  if(!canvas)return;
  var DN=['Ma','Di','Wo','Do','Vr','Za','Zo'],labels=[];
  for(var i=0;i<672;i++){
    var sl=i%96,h=Math.floor(sl/4),mm=(sl%4)*15;
    if(sl===0)labels.push(DN[Math.floor(i/96)]);
    else if(h%6===0&&mm===0)labels.push(h+':00');
    else labels.push('');
  }
  var datasets=[
    {label:'Gesaldeerd in groep (kW)',data:matchAvg,yAxisID:'y',
     borderColor:'#46962b',backgroundColor:'rgba(70,150,43,.5)',fill:'origin',
     tension:0.3,pointRadius:0,borderWidth:1},
    {label:'Teruggeleverd aan net (kW)',data:totAvg,yAxisID:'y',
     borderColor:'#95a5a6',backgroundColor:'rgba(149,165,166,.45)',fill:'-1',
     tension:0.3,pointRadius:0,borderWidth:1}
  ];
  if(hasEpex)datasets.push(
    {label:'Gem. EPEX-prijs (€/MWh)',data:epexAvg,yAxisID:'yEpex',
     borderColor:'#e67e22',backgroundColor:'transparent',fill:false,
     borderDash:[3,2],tension:0.3,pointRadius:0,borderWidth:1.5,spanGaps:true});
  var scales={
    x:{ticks:{color:'#999',font:{family:'Barlow',size:11},autoSkip:false,maxRotation:0,
       callback:function(v,i){return labels[i]||null;}},grid:{color:'#f3f7f4'}},
    y:Object.assign(ax('kW'),{min:0})
  };
  if(hasEpex)scales.yEpex={position:'right',
    ticks:{color:'#e67e22',font:{family:'Barlow',size:11}},
    title:{display:true,text:'EPEX (€/MWh)',color:'#e67e22',font:{family:'Barlow',size:11}},
    grid:{drawOnChartArea:false}};
  CH['ehpGelEpex']=new Chart(canvas,{type:'line',
    data:{labels:labels,datasets:datasets},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#888',font:{family:'Barlow',size:11},boxWidth:10}},
        tooltip:{callbacks:{title:function(items){
          var idx=items[0].dataIndex,dow=Math.floor(idx/96),sl=idx%96;
          var h=Math.floor(sl/4),m=(sl%4)*15;
          return DN[dow]+' '+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
        }}}},
      scales:scales}});
}

// --- Kansen-tab: netto positie & EPEX, heatmap netinkoop, top kansvensters --

var _ehpNetPosMonth='all'; // 'all' of 'YYYY-MM'

function setEhpNetPosMonth(val){
  _ehpNetPosMonth=val||'all';
  _ehpRenderNetPositieChart();
}

function _ehpRenderNetPositieChart(){
  var res=_ehpLast;if(!res||!res.model)return;
  var mf=_ehpNetPosMonth,S=672;
  var tekortSum=new Array(S).fill(0),overschotSum=new Array(S).fill(0),kwCnt=new Array(S).fill(0);
  var epexSum=new Array(S).fill(0),epexCnt=new Array(S).fill(0);
  res.model.forEach(function(r){
    if(mf!=='all'&&r.tijdKey.slice(0,7)!==mf)return;
    var d=r['Tijd (UTC)'];if(!d)return;
    var dow=(d.getDay()+6)%7;
    var sl=dow*96+Math.floor((d.getHours()*60+d.getMinutes())/15);
    if(sl<0||sl>=S)return;
    tekortSum[sl]+=(r.tekort_kWh||0)/0.25;
    overschotSum[sl]+=(r.overschot_kWh||0)/0.25;
    kwCnt[sl]++;
    if(typeof r.epex_eur_per_kWh==='number'){epexSum[sl]+=r.epex_eur_per_kWh;epexCnt[sl]++;}
  });
  var tekortAvg=tekortSum.map(function(s,i){return kwCnt[i]>0?+(s/kwCnt[i]).toFixed(2):0;});
  var overschotAvg=overschotSum.map(function(s,i){return kwCnt[i]>0?+(s/kwCnt[i]).toFixed(2):0;});
  var epexAvg=epexSum.map(function(s,i){return epexCnt[i]>0?+(s/epexCnt[i]*1000).toFixed(1):null;}); // €/MWh
  var hasEpex=epexAvg.some(function(v){return v!==null&&v!==0;});
  _ehpDrawNetPositieChart(tekortAvg,overschotAvg,epexAvg,hasEpex);
}

function _ehpDrawNetPositieChart(tekortAvg,overschotAvg,epexAvg,hasEpex){
  if(CH['ehpNetPos']){CH['ehpNetPos'].destroy();delete CH['ehpNetPos'];}
  var canvas=document.getElementById('cEhpNetPos');
  if(!canvas)return;
  var res=_ehpLast,cfg=(res&&(res.cfg||res.tarieven_cfg))||{};
  var DN=['Ma','Di','Wo','Do','Vr','Za','Zo'],labels=[];
  for(var i=0;i<672;i++){
    var sl=i%96,h=Math.floor(sl/4),mm=(sl%4)*15;
    if(sl===0)labels.push(DN[Math.floor(i/96)]);
    else if(h%6===0&&mm===0)labels.push(h+':00');
    else labels.push('');
  }
  var datasets=[
    {label:'Teruglevering aan net (kW)',data:overschotAvg,yAxisID:'y',
     borderColor:'#95a5a6',backgroundColor:'transparent',fill:false,
     tension:0.3,pointRadius:0,borderWidth:1.5},
    {label:'Netinkoop van net (kW)',data:tekortAvg,yAxisID:'y',
     borderColor:'#2c7fb8',backgroundColor:'transparent',fill:false,
     tension:0.3,pointRadius:0,borderWidth:1.5}
  ];
  if(hasEpex)datasets.push(
    {label:'Gem. EPEX-prijs (€/MWh)',data:epexAvg,yAxisID:'yEpex',
     borderColor:'#e67e22',backgroundColor:'transparent',fill:false,
     borderDash:[3,2],tension:0.3,pointRadius:0,borderWidth:1.5,spanGaps:true});
  // Interne verrekenprijzen (indien ingesteld) als platte referentielijn tegen dezelfde as als EPEX
  if(hasEpex)[
    {key:'gel_zon_mwh',lbl:'Interne prijs zon (€/MWh)',color:'#d4a017'},
    {key:'gel_wind_mwh',lbl:'Interne prijs wind (€/MWh)',color:'#16a085'}
  ].forEach(function(rl){
    var v=cfg[rl.key];
    if(!v)return;
    datasets.push({label:rl.lbl,data:new Array(672).fill(v),yAxisID:'yEpex',
      borderColor:rl.color,backgroundColor:'transparent',fill:false,
      borderDash:[1,2],tension:0,pointRadius:0,borderWidth:1});
  });
  var scales={
    x:{ticks:{color:'#999',font:{family:'Barlow',size:11},autoSkip:false,maxRotation:0,
       callback:function(v,i){return labels[i]||null;}},grid:{color:'#f3f7f4'}},
    y:Object.assign(ax('kW'),{min:0})
  };
  if(hasEpex)scales.yEpex={position:'right',
    ticks:{color:'#e67e22',font:{family:'Barlow',size:11}},
    title:{display:true,text:'EPEX / interne prijs (€/MWh)',color:'#e67e22',font:{family:'Barlow',size:11}},
    grid:{drawOnChartArea:false}};
  CH['ehpNetPos']=new Chart(canvas,{type:'line',
    data:{labels:labels,datasets:datasets},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#888',font:{family:'Barlow',size:11},boxWidth:10}},
        tooltip:{callbacks:{title:function(items){
          var idx=items[0].dataIndex,dow=Math.floor(idx/96),sl=idx%96;
          var h=Math.floor(sl/4),m=(sl%4)*15;
          return DN[dow]+' '+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
        }}}},
      scales:scales}});
}

// Heatmap: kosten van netinkoop (tekort × EPEX) per uur van de dag × maand.
// Hergebruikt de generieke renderHeatmap() (charts/overschrijdingen.js) met euro-opts.
function _ehpKansenHeatmapAggregate(res){
  var matrix=[];for(var h=0;h<24;h++)matrix.push(new Array(12).fill(0));
  var total=0;
  (res.model||[]).forEach(function(r){
    var d=r['Tijd (UTC)'];if(!d)return;
    var c=r.kosten_epex_tekort_EUR||0;
    if(c<=0)return; // alleen daadwerkelijke netinkoopkosten tonen
    matrix[d.getHours()][d.getMonth()]+=c;
    total+=c;
  });
  return{matrix:matrix,total:total};
}

function _ehpDrawKansenHeatmap(){
  var res=_ehpLast;if(!res||!res.model)return;
  var agg=_ehpKansenHeatmapAggregate(res);
  var eurFmt=function(v){return '€ '+Math.round(v).toLocaleString('nl-NL');};
  renderHeatmap('ehpHmKans','ehpHmKansLeg',agg.matrix,agg.total,'44,127,184','Netinkoop',{
    cellFmt:function(c,mn,hLbl){return 'Netinkoop '+MND[mn]+' '+hLbl+': '+eurFmt(c);},
    legSuffix:'max €/uur-bucket',
    valueFmt:eurFmt
  });
}

// Top kansvensters: buckets op seizoen × dagtype × dagdeel, gerangschikt op financiële/
// volume-relevantie. Eén gedeelde compute-functie voor zowel de live tab als het rapport.
var _EHP_KANS_TXT={
  tekort:'Structureel tekortmoment: de groep koopt hier relatief veel in van het net. Extra lokale opwek, batterijontlading of vraagverschuiving kan hier interessant zijn.',
  tekort_gevoelig:'Prijsgevoelig tekortmoment: netinkoop valt hier vaak samen met een hogere EPEX-prijs dan gemiddeld. Extra lokale opwek of flexibiliteit op dit moment kan extra waardevol zijn.',
  overschot:'Structureel overschotmoment: lokale opwek wordt hier vaak niet intern benut. Extra afname, opslag of slim laden kan een mogelijk aandachtspunt zijn.',
  overschot_gevoelig:'Prijsgevoelig overschotmoment: teruglevering valt hier vaak samen met een lagere EPEX-prijs dan gemiddeld. Beter benutten van dit overschot kan de businesscase verbeteren.'
};

function _ehpKansenCompute(res){
  res=res||_ehpLast;
  if(!res||!res.model||!res.model.length)return{buckets:[],epexAvgAll:null};
  var DAGDEEL=['Nacht (00-06u)','Ochtend (06-12u)','Middag (12-18u)','Avond (18-24u)'];
  var SEIZ_LBL={win:'Winter',spr:'Lente',sum:'Zomer',aut:'Herfst'};
  var buckets={};
  var epexAllSum=0,epexAllCnt=0;
  res.model.forEach(function(r){
    if(typeof r.epex_eur_per_kWh==='number'){epexAllSum+=r.epex_eur_per_kWh;epexAllCnt++;}
  });
  var epexAvgAll=epexAllCnt>0?epexAllSum/epexAllCnt:null;

  res.model.forEach(function(r){
    var d=r['Tijd (UTC)'];if(!d)return;
    var seiz=_ehpSeizoen(d.getMonth());
    var dagtype=((d.getDay()+6)%7)>=5?'weekend':'werkdag';
    var dd=Math.floor(d.getHours()/6);
    var key=seiz+'|'+dagtype+'|'+dd;
    if(!buckets[key])buckets[key]={
      seiz:seiz,dagtype:dagtype,dagdeel:dd,
      tekortKwh:0,overschotKwh:0,kostenTekort:0,opbrengstOverschot:0,
      epexTekortSum:0,epexTekortCnt:0,epexOverschotSum:0,epexOverschotCnt:0
    };
    var b=buckets[key],tk=r.tekort_kWh||0,ov=r.overschot_kWh||0;
    b.tekortKwh+=tk;b.overschotKwh+=ov;
    b.kostenTekort+=r.kosten_epex_tekort_EUR||0;
    b.opbrengstOverschot+=r.opbrengst_epex_overschot_EUR||0;
    if(tk>0&&typeof r.epex_eur_per_kWh==='number'){b.epexTekortSum+=r.epex_eur_per_kWh;b.epexTekortCnt++;}
    if(ov>0&&typeof r.epex_eur_per_kWh==='number'){b.epexOverschotSum+=r.epex_eur_per_kWh;b.epexOverschotCnt++;}
  });

  var list=Object.keys(buckets).map(function(key){
    var b=buckets[key];
    var dominant=b.tekortKwh>=b.overschotKwh?'tekort':'overschot';
    var gevoelig=false;
    if(epexAvgAll!=null){
      if(dominant==='tekort'&&b.epexTekortCnt>0)gevoelig=(b.epexTekortSum/b.epexTekortCnt)>epexAvgAll;
      if(dominant==='overschot'&&b.epexOverschotCnt>0)gevoelig=(b.epexOverschotSum/b.epexOverschotCnt)<epexAvgAll;
    }
    var type=dominant+(gevoelig?'_gevoelig':'');
    // Gem. EPEX-prijs tijdens de dominante (tekort- resp. overschot-)kwartieren van dit venster
    var avgEpex=null;
    if(dominant==='tekort'&&b.epexTekortCnt>0)avgEpex=b.epexTekortSum/b.epexTekortCnt;
    if(dominant==='overschot'&&b.epexOverschotCnt>0)avgEpex=b.epexOverschotSum/b.epexOverschotCnt;
    return{
      label:SEIZ_LBL[b.seiz]+' · '+(b.dagtype==='weekend'?'Weekend':'Werkdag')+' · '+DAGDEEL[b.dagdeel],
      type:type,dominant:dominant,gevoelig:gevoelig,
      tekortKwh:b.tekortKwh,overschotKwh:b.overschotKwh,
      kostenTekort:b.kostenTekort,opbrengstOverschot:b.opbrengstOverschot,
      avgEpex:avgEpex,
      rank:dominant==='tekort'?b.kostenTekort:b.overschotKwh,
      suggestie:_EHP_KANS_TXT[type]
    };
  });

  // Bewust géén gecombineerde tekort/overschot-score: rangschik elke groep op zijn eigen,
  // al bestaande grootheid en neem top 4 + top 4 (voorkomt een verzonnen kruismetriek).
  var tekortTop=list.filter(function(x){return x.dominant==='tekort'&&x.rank>0;})
    .sort(function(a,b){return b.rank-a.rank;}).slice(0,4);
  var overschotTop=list.filter(function(x){return x.dominant==='overschot'&&x.rank>0;})
    .sort(function(a,b){return b.rank-a.rank;}).slice(0,4);

  return{buckets:tekortTop.concat(overschotTop),epexAvgAll:epexAvgAll};
}

function _ehpRenderKansenTabel(){
  var res=_ehpLast;if(!res)return;
  var kans=_ehpKansenCompute(res);
  _ehpKansenTableHtml(kans.buckets);
}

function _ehpKansenTableHtml(buckets){
  var el=document.getElementById('ehpKansenTbl');
  if(!el)return;
  if(!buckets||!buckets.length){el.innerHTML='<div class="ib2">Onvoldoende data voor een kansvensters-analyse.</div>';return;}
  var TYPE_LBL={tekort:'Tekort',tekort_gevoelig:'Tekort · prijsgevoelig',overschot:'Overschot',overschot_gevoelig:'Overschot · prijsgevoelig'};
  var rows=buckets.map(function(b){
    var epexTxt=b.avgEpex!=null?_e2(b.avgEpex*100)+' ct/kWh':'—';
    return '<tr><td style="font-weight:700">'+b.label+'</td><td>'+TYPE_LBL[b.type]+'</td>'+
      '<td>'+epexTxt+'</td><td style="font-size:12px;color:#666">'+b.suggestie+'</td></tr>';
  }).join('');
  el.innerHTML='<div style="overflow-x:auto;margin-top:10px"><table class="verg-tbl"><thead><tr>'+
    '<th>Periode</th><th>Type</th><th>Gem. EPEX-prijs</th><th>Suggestie</th>'+
    '</tr></thead><tbody>'+rows+'</tbody></table></div>';
}

function _ehpKansenHtml(res){
  var months={};
  (res.model||[]).forEach(function(r){months[r.tijdKey.slice(0,7)]=1;});
  var monthOpts=Object.keys(months).sort().map(function(mn){
    var p=mn.split('-');return '<option value="'+mn+'">'+MND[parseInt(p[1],10)-1]+" '"+p[0].slice(2)+'</option>';
  }).join('');

  var netPosHtml=
    '<div class="cd">'+
      '<div class="ct2" style="flex-wrap:wrap;gap:6px"><div class="ac" style="background:#2c7fb8"></div>'+
      'Netto positie collectief &amp; EPEX-prijs — '+_ehpEsc(res.platName)+
      '<div style="margin-left:auto;display:flex;gap:6px;align-items:center">'+
        '<label for="ehpNetPosMonth" style="font-size:12px;color:#777;font-family:Barlow,sans-serif">Periode</label>'+
        '<select id="ehpNetPosMonth" onchange="setEhpNetPosMonth(this.value)" '+
          'style="font-size:12px;padding:5px 9px;border:1px solid #d6e0d2;border-radius:8px;font-family:Barlow,sans-serif;background:#fff;cursor:pointer">'+
          '<option value="all">Heel het jaar</option>'+monthOpts+
        '</select>'+
      '</div>'+
      '</div>'+
      '<div class="ib2" style="margin-bottom:8px">Gemiddeld vermogen per kwartier van de week. '+
      'Grijs = teruglevering aan het net (overschot opwek), blauw = netinkoop (tekort verbruik). '+
      'De oranje stippellijn is de gemiddelde EPEX-prijs; de dunne stippellijnen zijn — indien ingesteld — de interne verrekenprijzen '+
      'voor zon/wind, zodat zichtbaar is wanneer de EPEX-prijs boven of onder de interne prijs ligt.</div>'+
      '<div class="cw" style="height:420px"><canvas id="cEhpNetPos" role="img"></canvas></div>'+
    '</div>';

  var heatHtml=
    '<div class="cd">'+
      '<div class="ct2"><div class="ac" style="background:#2c7fb8"></div>Heatmap netinkoop en prijsgevoeligheid</div>'+
      '<div class="ib2" style="margin-bottom:8px">Kleurintensiteit = de kosten van netinkoop (tekort × EPEX-prijs) per uur van de dag en maand van het jaar. '+
      'Donkerder = een financieel relevanter moment voor extra lokale opwek, opslag of vraagsturing.</div>'+
      '<div class="hm-wrap" style="grid-template-columns:1fr">'+
        '<div class="hm-block">'+
          '<div class="hm" id="ehpHmKans"></div>'+
          '<div class="hm-leg" id="ehpHmKansLeg"></div>'+
        '</div>'+
      '</div>'+
    '</div>';

  var kansenHtml=
    '<div class="cd">'+
      '<div class="ct2"><div class="ac" style="background:#46962b"></div>Top kansvensters voor verbetering</div>'+
      '<div class="ib2" style="margin-bottom:8px">De tijdvensters met de grootste tekort- of overschotvolumes, met een indicatie of het moment '+
      'ook prijsgevoelig is (EPEX-prijs afwijkend van het periodegemiddelde). Dit zijn indicatieve aandachtspunten, geen automatisch advies.</div>'+
      '<div id="ehpKansenTbl"></div>'+
    '</div>';

  return netPosHtml+heatHtml+kansenHtml;
}

// --- Platform week/maand grafieken -------------------------------------------

var _ehpPlatWeekSeiz=null;

function _ehpSeizoen(mo){
  if(mo===11||mo<=1)return'win';
  if(mo<=4)return'spr';
  if(mo<=7)return'sum';
  return'aut';
}

function _ehpRenderPlatWeekChart(){
  var res=_ehpLast;if(!res)return;
  var allTs=res.ts,netKw=res.ehpNetKw,sf=_ehpPlatWeekSeiz;
  var sum=new Array(672).fill(0),cnt=new Array(672).fill(0);
  allTs.forEach(function(ts,i){
    var d=new Date(ts);
    if(sf!==null&&_ehpSeizoen(d.getMonth())!==sf)return;
    var dow=(d.getDay()+6)%7;
    var sl=dow*96+Math.floor((d.getHours()*60+d.getMinutes())/15);
    sum[sl]+=netKw[i];cnt[sl]++;
  });
  var avg=sum.map(function(s,i){return cnt[i]>0?s/cnt[i]:0;});
  _ehpDrawPlatWeekChart(avg);
  _ehpUpdatePlatWeekBtns();
}

function _ehpUpdatePlatWeekBtns(){
  var SCOLS={win:'#3498db',spr:'#2ecc71',sum:'#e67e22',aut:'#9b59b6'};
  document.querySelectorAll('#ehpPlatWeekSeizFilter button').forEach(function(btn){
    var val=btn.getAttribute('data-sf');
    var act=val==='all'?_ehpPlatWeekSeiz===null:val===_ehpPlatWeekSeiz;
    btn.style.background=act?(val==='all'?'#46962b':SCOLS[val]):'#eef2ec';
    btn.style.color=act?'#fff':'#555';
    btn.style.fontWeight=act?'700':'400';
  });
}

function setEhpPlatWeekSeiz(val){
  _ehpPlatWeekSeiz=val==='all'?null:val;
  _ehpRenderPlatWeekChart();
}

function _ehpDrawPlatWeekChart(ehpWeekAvg){
  if(CH['ehpPlatWeek']){CH['ehpPlatWeek'].destroy();delete CH['ehpPlatWeek'];}
  var canvas=document.getElementById('cEhpPlatWeek');
  if(!canvas||!ehpWeekAvg.length)return;
  var DN=['Ma','Di','Wo','Do','Vr','Za','Zo'];
  var labels=[];
  for(var i=0;i<672;i++){
    var sl=i%96,h=Math.floor(sl/4),mm=(sl%4)*15;
    if(sl===0)labels.push(DN[Math.floor(i/96)]);
    else if(h%6===0&&mm===0)labels.push(h+':00');
    else labels.push('');
  }
  CH['ehpPlatWeek']=new Chart(canvas,{type:'line',
    data:{labels:labels,datasets:[
      {label:'Inkoop van net (gem. kW)',
       data:ehpWeekAvg.map(function(v){return+(Math.max(0,v)).toFixed(2);}),
       borderColor:'#2c7fb8',backgroundColor:'rgba(44,127,184,.15)',
       fill:true,tension:0.3,pointRadius:0,borderWidth:1.5},
      {label:'Teruglevering aan net (gem. kW)',
       data:ehpWeekAvg.map(function(v){return+(Math.max(0,-v)).toFixed(2);}),
       borderColor:'#46962b',backgroundColor:'rgba(70,150,43,.15)',
       fill:true,tension:0.3,pointRadius:0,borderWidth:1.5}
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#888',font:{family:'Barlow',size:11},boxWidth:10}}},
      scales:{x:{ticks:{color:'#999',font:{family:'Barlow',size:11},autoSkip:false,maxRotation:0},grid:{color:'#f3f7f4'}},y:Object.assign(ax('kW'),{min:0})}}});
}

function _ehpDrawPlatMonthChart(ehpMonthImp,ehpMonthExp){
  if(CH['ehpPlatMonth']){CH['ehpPlatMonth'].destroy();delete CH['ehpPlatMonth'];}
  var canvas=document.getElementById('cEhpPlatMonth');
  if(!canvas)return;
  var mnSet={};
  Object.keys(ehpMonthImp).forEach(function(m){mnSet[m]=1;});
  Object.keys(ehpMonthExp).forEach(function(m){mnSet[m]=1;});
  var mnds=Object.keys(mnSet).sort();
  if(!mnds.length)return;
  var lbl=function(mn){var p=mn.split('-');return MND[parseInt(p[1])-1]+" '"+p[0].slice(2);};
  CH['ehpPlatMonth']=new Chart(canvas,{type:'bar',
    data:{labels:mnds.map(lbl),datasets:[
      {label:'Inkoop van net (kWh)',
       data:mnds.map(function(mn){return+((ehpMonthImp[mn]||0)).toFixed(0);}),
       backgroundColor:'rgba(44,127,184,.65)',borderRadius:3},
      {label:'Teruglevering aan net (kWh)',
       data:mnds.map(function(mn){return+((ehpMonthExp[mn]||0)).toFixed(0);}),
       backgroundColor:'rgba(70,150,43,.65)',borderRadius:3}
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#888',font:{family:'Barlow',size:11},boxWidth:10}}},
      scales:{x:Object.assign(ax(),{grid:{display:false}}),y:Object.assign(ax('kWh'))}}});
}

// --- Niet-leden visualisatie -------------------------------------------------

function _ehpNonMembersHtml(nonMembers){
  var withData=nonMembers.filter(function(m){return m.prodKwh>0||m.consKwh>0;});
  var header='<div class="cd ehp-grp"><div class="ct2"><div class="ac" style="background:#e67e22"></div>Aansluitingen buiten dit platform</div>';
  if(!nonMembers.length){
    return header+'<div class="ku" style="padding:8px 0">Alle aansluitingen in dit project zijn lid van dit platform.</div></div>';
  }
  if(!withData.length){
    return header+'<div class="ku" style="padding:8px 0">Geen niet-leden met meetdata gevonden.</div></div>';
  }
  var sorted=withData.slice().sort(function(a,b){return b.prodKwh-a.prodKwh;});
  var h=Math.max(180,sorted.length*36+70);
  var typeLbl=function(m){
    if(m.prodKwh>0&&m.consKwh>0)return '<span class="bdg bg">Beide</span>';
    if(m.prodKwh>0)return '<span class="bdg" style="background:#d4edda;color:#1d6030">Producent</span>';
    return '<span class="bdg bg" style="background:#dce6f0;color:#1a3d5c">Verbruiker</span>';
  };
  var tblRows=sorted.map(function(m){
    var sim=m.prodKwh>0?'<span title="Percentage van kwartieren dat dit niet-lid opwek heeft terwijl het platform netto importeert">'+m.simScore.toFixed(0)+'%</span>':'—';
    return '<tr><td style="font-weight:700">'+_ehpEsc(m.name)+'</td>'+
      '<td>'+(m.prodKwh>0?fmt(m.prodKwh/1000)+' MWh':'—')+'</td>'+
      '<td>'+(m.consKwh>0?fmt(m.consKwh/1000)+' MWh':'—')+'</td>'+
      '<td>'+sim+'</td>'+
      '<td>'+typeLbl(m)+'</td></tr>';
  }).join('');
  return header+
    '<div class="ib2" style="margin-bottom:10px">'+sorted.length+' aansluiting'+(sorted.length!==1?'en':'')+
    ' in dit project '+(sorted.length!==1?'zijn':'is')+' geen lid van dit platform. Gesorteerd op opwek naar net (hoog = beste kandidaat). '+
    'De <strong>gelijktijdigheidscore</strong> geeft aan in hoeveel procent van de kwartieren dat het platform tekort heeft dit niet-lid opwek produceert — hoe hoger, hoe beter de match.</div>'+
    '<div class="cw" style="height:'+h+'px;margin-bottom:16px"><canvas id="cEhpNonMem" role="img"></canvas></div>'+
    '<div style="overflow-x:auto"><table class="verg-tbl"><thead><tr>'+
    '<th>Aansluiting</th><th>Opwek → net</th><th>Afname ← net</th><th title="% van platformtekort-kwartieren met gelijktijdige opwek">Gelijktijdigheid ↑</th><th>Type</th>'+
    '</tr></thead><tbody>'+tblRows+'</tbody></table></div>'+
    (sorted.some(function(m){return m.prodKwh>0;})?
      '<div class="ct2" style="margin-top:18px"><div class="ac" style="background:#46962b"></div>Weekpatroon beschikbare opwek</div>'+
      '<div class="ib2" style="margin-bottom:8px">Gemiddeld vermogen per kwartier van de week (opwek). Stippellijn = gemiddelde netto-import van het platform op dat kwartier — overlap = matchingkans.</div>'+
      '<div class="cw" style="height:260px;margin-bottom:18px"><canvas id="cEhpWeekProd" role="img"></canvas></div>'+
      '<div class="ct2"><div class="ac" style="background:#46962b"></div>Maandelijks opwekpatroon (kWh)</div>'+
      '<div class="ib2" style="margin-bottom:8px">Totale opwek naar het net per maand per niet-lid-aansluiting.</div>'+
      '<div class="cw" style="height:260px"><canvas id="cEhpMonthProd" role="img"></canvas></div>'
    :'')+
    '</div>';
}

function _ehpDrawNonMemberChart(nonMembers){
  if(CH['ehpNonMem']){CH['ehpNonMem'].destroy();delete CH['ehpNonMem'];}
  var canvas=document.getElementById('cEhpNonMem');
  if(!canvas)return;
  var sorted=nonMembers.filter(function(m){return m.prodKwh>0||m.consKwh>0;})
    .slice().sort(function(a,b){return b.prodKwh-a.prodKwh;});
  CH['ehpNonMem']=new Chart(canvas,{
    type:'bar',
    data:{
      labels:sorted.map(function(m){return m.name;}),
      datasets:[
        {label:'Opwek → net (kWh)',
         data:sorted.map(function(m){return+m.prodKwh.toFixed(0);}),
         backgroundColor:'rgba(70,150,43,.65)',borderRadius:4},
        {label:'Afname ← net (kWh)',
         data:sorted.map(function(m){return+m.consKwh.toFixed(0);}),
         backgroundColor:'rgba(44,127,184,.35)',borderRadius:4}
      ]
    },
    options:{
      indexAxis:'y',responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{labels:{color:'#888',font:{family:'Barlow',size:11},boxWidth:10}},
        tooltip:{callbacks:{afterLabel:function(ctx){
          var m=sorted[ctx.dataIndex];
          return m.prodKwh>0?'Gelijktijdigheid: '+m.simScore.toFixed(0)+'%':'';
        }}}
      },
      scales:{
        x:Object.assign(ax(),{title:{display:true,text:'kWh',color:'#aaa',font:{family:'Barlow',size:10}}}),
        y:Object.assign(ax(),{grid:{display:false}})
      }
    }
  });
}

function _ehpDrawWeekChart(nonMembers,ehpWeekNet){
  if(CH['ehpWeek']){CH['ehpWeek'].destroy();delete CH['ehpWeek'];}
  var canvas=document.getElementById('cEhpWeekProd');
  if(!canvas)return;
  var DN=['Ma','Di','Wo','Do','Vr','Za','Zo'];
  var labels=[];
  for(var i=0;i<672;i++){
    var dow=Math.floor(i/96),sl=i%96,h=Math.floor(sl/4),mm=(sl%4)*15;
    if(sl===0)labels.push(DN[dow]);
    else if(h%6===0&&mm===0)labels.push(h+':00');
    else labels.push('');
  }
  var datasets=nonMembers.map(function(m,idx){
    return {label:m.name,data:m.weekProd,
      borderColor:PAL[idx%PAL.length],backgroundColor:PAL[idx%PAL.length]+'22',
      fill:true,tension:0.3,pointRadius:0,borderWidth:1.5};
  });
  if(ehpWeekNet&&ehpWeekNet.length){
    datasets.push({label:'Platform netto-import (gem. kW)',data:ehpWeekNet,
      borderColor:'#2c7fb8',borderDash:[4,3],backgroundColor:'transparent',
      fill:false,tension:0.3,pointRadius:0,borderWidth:1.5});
  }
  CH['ehpWeek']=new Chart(canvas,{type:'line',data:{labels:labels,datasets:datasets},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#888',font:{family:'Barlow',size:11},boxWidth:10}}},
      scales:{x:{ticks:{color:'#999',font:{family:'Barlow',size:11},autoSkip:false,maxRotation:0},grid:{color:'#f3f7f4'}},y:Object.assign(ax('kW'),{min:0})}}});
}

function _ehpDrawMonthChart(nonMembers){
  if(CH['ehpMonth']){CH['ehpMonth'].destroy();delete CH['ehpMonth'];}
  var canvas=document.getElementById('cEhpMonthProd');
  if(!canvas)return;
  var mnSet={};
  nonMembers.forEach(function(m){Object.keys(m.monthProd||{}).forEach(function(mn){mnSet[mn]=1;});});
  var mnds=Object.keys(mnSet).sort();
  if(!mnds.length)return;
  var datasets=nonMembers.map(function(m,idx){
    return {label:m.name,
      data:mnds.map(function(mn){return+(((m.monthProd||{})[mn])||0).toFixed(0);}),
      backgroundColor:PAL[idx%PAL.length]+'bb',borderRadius:3,stack:'s'};
  });
  CH['ehpMonth']=new Chart(canvas,{type:'bar',
    data:{labels:mnds.map(function(mn){var p=mn.split('-');return MND[parseInt(p[1])-1]+" '"+p[0].slice(2);}),datasets:datasets},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#888',font:{family:'Barlow',size:11},boxWidth:10}}},
      scales:{x:Object.assign(ax(),{stacked:true,grid:{display:false}}),y:Object.assign(ax('kWh'),{stacked:true})}}});
}

// --- Flow-diagram (hand-rolled SVG, sleepbaar) -------------------------------

var _ehpFlowState=null;

function _ehpFlowSvg(res){
  var W=820,H=320;
  _ehpFlowState={
    res:res,W:W,H:H,
    maxKwh:Math.max(res.totProdKwh+res.totGridImpKwh,res.totConsKwh+res.totGridExpKwh,1),
    nodes:{
      zon:    {x:30, y:30,  w:110,h:48, lbl:'Zon',          kwh:res.prodBySrc.zon,    col:'#fbba00'},
      wind:   {x:30, y:90,  w:110,h:48, lbl:'Wind',         kwh:res.prodBySrc.wind,   col:'#2c7fb8'},
      overig: {x:30, y:150, w:110,h:48, lbl:'Overig opwek', kwh:res.prodBySrc.overig, col:'#46962b'},
      netIn:  {x:30, y:230, w:110,h:48, lbl:'Inkoop net',   kwh:res.totGridImpKwh,    col:'#999'},
      pool:   {x:340,y:120, w:130,h:70, lbl:'Pool · intern',kwh:res.totMatchedKwh,    col:'#5fb3df'},
      netOut: {x:680,y:30,  w:120,h:48, lbl:'Teruglever net',kwh:res.totGridExpKwh,   col:'#999'},
      cons:   {x:680,y:140, w:120,h:90, lbl:'Deelnemers',   kwh:res.totConsKwh,       col:'#46962b'}
    }
  };
  return '<svg id="ehpFlowSvg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet">'+_ehpFlowContent()+'</svg>';
}

function _ehpFlowContent(){
  var s=_ehpFlowState,res=s.res,nodes=s.nodes,maxKwh=s.maxKwh;
  function rect(key,n){
    var mwh=n.kwh>=1000?(n.kwh/1000).toFixed(1)+' MWh':fmt(n.kwh)+' kWh';
    return '<g data-node="'+key+'"><rect x="'+n.x+'" y="'+n.y+'" width="'+n.w+'" height="'+n.h+'" rx="6" fill="'+n.col+'" fill-opacity=".18" stroke="'+n.col+'" stroke-width="1.5"/>'+
      '<text x="'+(n.x+n.w/2)+'" y="'+(n.y+n.h/2-3)+'" text-anchor="middle" font-family="Barlow" font-size="12" font-weight="800" fill="#242b38" pointer-events="none">'+_ehpEsc(n.lbl)+'</text>'+
      '<text x="'+(n.x+n.w/2)+'" y="'+(n.y+n.h/2+12)+'" text-anchor="middle" font-family="Barlow" font-size="10" fill="#555" pointer-events="none">'+mwh+'</text></g>';
  }
  function edge(src,tgt,kwh,col){
    if(!(kwh>0))return '';
    var sx=src.x+src.w,sy=src.y+src.h/2,tx=tgt.x,ty=tgt.y+tgt.h/2;
    var cx=(sx+tx)/2;
    var w=Math.max(1.5,Math.min(16,kwh/maxKwh*50));
    var lbl=kwh>=1000?(kwh/1000).toFixed(1)+' MWh':fmt(kwh)+' kWh';
    // Label at t≈0.3 along the bezier (near source) so parallel edges from
    // different y-positions stay vertically separated instead of clustering
    var lx=0.658*sx+0.342*tx;
    var ly=0.784*sy+0.216*ty-10;
    return '<path d="M '+sx+' '+sy+' C '+cx+' '+sy+', '+cx+' '+ty+', '+tx+' '+ty+'" stroke="'+col+'" stroke-width="'+w+'" stroke-opacity=".6" fill="none" stroke-linecap="round" pointer-events="none"/>'+
      '<text x="'+lx+'" y="'+ly+'" text-anchor="middle" font-family="Barlow" font-size="10" font-weight="600" fill="#222" paint-order="stroke" stroke="rgba(255,255,255,.92)" stroke-width="3" stroke-linejoin="round" pointer-events="none">'+lbl+'</text>';
  }
  var srcs=['zon','wind','overig'],edges='';
  srcs.forEach(function(k){
    var p=res.prodBySrc[k],m=res.matchedBySrc[k],sp=Math.max(0,p-m);
    edges+=edge(nodes[k],nodes.pool,m,nodes[k].col);
    edges+=edge(nodes[k],nodes.netOut,sp,nodes[k].col);
  });
  edges+=edge(nodes.pool,nodes.cons,res.totMatchedKwh,'#5fb3df');
  edges+=edge(nodes.netIn,nodes.cons,res.totGridImpKwh,'#999');
  return edges+rect('zon',nodes.zon)+rect('wind',nodes.wind)+rect('overig',nodes.overig)+
    rect('netIn',nodes.netIn)+rect('pool',nodes.pool)+rect('cons',nodes.cons)+rect('netOut',nodes.netOut);
}

function _ehpRedrawFlow(){
  var svg=document.getElementById('ehpFlowSvg');
  if(svg)svg.innerHTML=_ehpFlowContent();
}

function _ehpAttachFlowDrag(){
  var svg=document.getElementById('ehpFlowSvg');
  if(!svg||!_ehpFlowState)return;
  var dragging=null,off={x:0,y:0};
  function toSvg(e){
    var pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;
    var m=svg.getScreenCTM();return m?pt.matrixTransform(m.inverse()):{x:0,y:0};
  }
  svg.addEventListener('pointerdown',function(e){
    var g=e.target.closest('[data-node]');
    if(!g)return;
    dragging=g.getAttribute('data-node');
    var p=toSvg(e),n=_ehpFlowState.nodes[dragging];
    off={x:p.x-n.x,y:p.y-n.y};
    try{svg.setPointerCapture(e.pointerId);}catch(_){}
    e.preventDefault();
  });
  svg.addEventListener('pointermove',function(e){
    if(!dragging)return;
    var p=toSvg(e),n=_ehpFlowState.nodes[dragging];
    n.x=Math.max(0,Math.min(_ehpFlowState.W-n.w,p.x-off.x));
    n.y=Math.max(0,Math.min(_ehpFlowState.H-n.h,p.y-off.y));
    _ehpRedrawFlow();
  });
  function stop(){dragging=null;}
  svg.addEventListener('pointerup',stop);
  svg.addEventListener('pointercancel',stop);
  svg.addEventListener('pointerleave',stop);
}

// --- Per-deelnemer kaart -----------------------------------------------------

function _ehpPartyCard(x,res){
  var srcLbl={zon:'Zon',wind:'Wind',afname_invoeden:'Afname-invoeden',overig:'Overig',none:'Alleen afnemer',alleen_afname:'Alleen afnemer',geen:'Geen'};
  var demCovIntPct=x.consKwh>0?x.intBoughtKwh/x.consKwh*100:0;
  var demCovNetPct=x.consKwh>0?x.gridImpKwh/x.consKwh*100:0;
  var prodToIntPct=x.prodKwh>0?x.intSoldKwh/x.prodKwh*100:0;
  var prodToNetPct=x.prodKwh>0?x.gridExpKwh/x.prodKwh*100:0;

  function r(lbl,v){return '<tr><td>'+lbl+'</td><td>'+v+'</td></tr>';}
  var tbl='<table class="ehp-cmp-tbl"><thead><tr><th>Post</th><th>Kwh</th></tr></thead><tbody>'+
    r('Opwek',fmt(x.prodKwh)+' kWh')+
    r('Verbruik',fmt(x.consKwh)+' kWh')+
    r('Intern gekocht',fmt(x.intBoughtKwh)+' kWh')+
    r('Intern verkocht',fmt(x.intSoldKwh)+' kWh')+
    r('Van net',fmt(x.gridImpKwh)+' kWh')+
    r('Naar net',fmt(x.gridExpKwh)+' kWh')+
    '</tbody></table>';

  var consBar=x.consKwh>0?
    '<div class="ehp-bar"><span style="width:'+demCovIntPct.toFixed(1)+'%;background:#5fb3df"></span><span style="width:'+demCovNetPct.toFixed(1)+'%;background:#999"></span></div>'+
    '<div class="ehp-bar-lbl"><span>Verbruik gedekt: '+demCovIntPct.toFixed(0)+'% intern · '+demCovNetPct.toFixed(0)+'% net</span></div>':'';
  var prodBar=x.prodKwh>0?
    '<div class="ehp-bar"><span style="width:'+prodToIntPct.toFixed(1)+'%;background:#5fb3df"></span><span style="width:'+prodToNetPct.toFixed(1)+'%;background:#999"></span></div>'+
    '<div class="ehp-bar-lbl"><span>Opwek gaat naar: '+prodToIntPct.toFixed(0)+'% intern · '+prodToNetPct.toFixed(0)+'% net</span></div>':'';

  return '<div class="ehp-party-card">'+
    '<div class="ehp-party-h"><div class="ehp-party-name">'+_ehpEsc(x.name)+' <span class="bdg bg" style="margin-left:6px">'+(srcLbl[x.source]||x.source)+'</span></div></div>'+
    consBar+prodBar+tbl+
    '</div>';
}

// --- CSV-export --------------------------------------------------------------

function downloadEhpCsv(){
  if(!_ehpLast){notify('Bereken eerst het handelsplatform',false);return;}
  var r=_ehpLast;
  var sep=';';
  // Verbruikers
  var head=['Locatie','Bron','totaal_verbruik_kWh','gelijktijdig_kWh','tekort_kWh',
    'afname_invoeden_kWh','kosten_totaal_EUR'];
  var lines=[head.join(sep)];
  r.parties.forEach(function(x){
    lines.push([
      '"'+String(x.name).replace(/"/g,'""')+'"',x.source||'',
      (x.totaal_verbruik_kWh||0).toFixed(2),(x.gelijktijdig_kWh||0).toFixed(2),
      (x.tekort_kWh||0).toFixed(2),(x.prodKwh||0).toFixed(2),(x.kosten_totaal_EUR||0).toFixed(2)
    ].join(sep));
  });
  lines.push('');
  // Opwekkers
  if(r.per_opwekker&&r.per_opwekker.length){
    lines.push(['Asset','Type_norm','totaal_opwek_kWh','gelijktijdig_kWh','overschot_kWh',
      'netto_opbrengst_EUR'].join(sep));
    r.per_opwekker.forEach(function(o){
      lines.push([
        '"'+String(o.Asset).replace(/"/g,'""')+'"',o.Type_norm||'',
        (o.totaal_opwek_kWh||0).toFixed(2),(o.gelijktijdig_kWh||0).toFixed(2),
        (o.overschot_kWh||0).toFixed(2),(o.netto_opbrengst_EUR||0).toFixed(2)
      ].join(sep));
    });
    lines.push('');
  }
  // Totalen
  lines.push(['Totaal opwek kWh',r.totProdKwh.toFixed(2)].join(sep));
  lines.push(['Totaal verbruik kWh',r.totConsKwh.toFixed(2)].join(sep));
  lines.push(['Gelijktijdig kWh',r.totMatchedKwh.toFixed(2)].join(sep));
  lines.push(['Overschot (naar net) kWh',r.totGridExpKwh.toFixed(2)].join(sep));
  lines.push(['Tekort (van net) kWh',r.totGridImpKwh.toFixed(2)].join(sep));
  lines.push(['Gelijktijdigheid % van opwek',r.selfCons.toFixed(1)].join(sep));
  lines.push(['Gelijktijdigheid % van verbruik',r.selfSuff.toFixed(1)].join(sep));
  var fname='handelsplatform-'+String(r.platName).replace(/[^a-z0-9]/gi,'-').toLowerCase()+'-'+new Date().toISOString().slice(0,10)+'.csv';
  triggerDownload(new Blob(['﻿'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),fname);
}

// --- Financieel overzicht ----------------------------------------------------

function _ehpOverzichtHtml(res){
  var sam=res.samenvatting;
  var tc=res.tarieven_cfg||{};
  var sam2=res.samenvatting_fwd;

  function fMwh(kwh){
    if(kwh==null||isNaN(kwh))return '—';
    return Math.round(kwh/1000).toLocaleString('nl-NL');
  }
  function fEur(v){
    if(v==null||isNaN(v))return '—';
    return v.toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function fEurMwh(eur,kwh){
    if(!kwh||kwh===0)return '—';
    return fEur(eur/kwh*1000);
  }
  function negStyle(v){return v<0?' style="color:#c0392b"':'';}

  function buildAfnemersTbl(s){
    var gel=s.gelijktijdig_kWh||0,tek=s.tekort_kWh||0,verb=s.totaal_verbruik_kWh||0;
    var kGel=s.kosten_gelijktijdigheid_totaal_EUR||0,kEpex=s.kosten_epex_tekort_EUR||0;
    // Onbalans op de afnemerszijde = alleen het verbruiksdeel (spec 5.6); zon/wind-onbalans
    // hoort bij de producenten. Eerder werd hier kosten_onbalans_totaal_EUR getoond.
    var kOnb=s.kosten_onbalans_verbruik_EUR||0,kPlat=s.kosten_platform_EUR||0;
    var kGvoBil=s.kosten_gvo_bilateraal_EUR||0,kGvoRest=s.kosten_gvo_rest_EUR||0;
    var subEnergie=kGel+kEpex+kOnb;
    // Afnemerstotaal = energietransacties + platform + GVO. NIET de engine-kosten_totaal_EUR:
    // die is een gemeenschaps-netto (incl. totale onbalans − producent-EPEX-opbrengst).
    var kTotaal=subEnergie+kPlat+kGvoBil+kGvoRest;
    // Onbalans-% van energiekosten = onbalans / (gelijktijdig + EPEX), zonder onbalans in noemer (spec 5.6).
    var onbPct=(kGel+kEpex)>0?(kOnb/(kGel+kEpex)*100):0;
    return '<table class="ehp-ov-tbl"><thead><tr>'+
      '<th>Post</th><th>MWh</th><th>€/MWh</th><th>EUR</th></tr></thead><tbody>'+
      '<tr><td>Inkoop Gelijktijdig</td><td>'+fMwh(gel)+'</td><td>'+fEurMwh(kGel,gel)+'</td><td>'+fEur(kGel)+'</td></tr>'+
      '<tr><td>Inkoop EPEX</td><td>'+fMwh(tek)+'</td><td>'+fEurMwh(kEpex,tek)+'</td><td>'+fEur(kEpex)+'</td></tr>'+
      '<tr><td>Onbalanskosten</td><td>—</td><td>—</td><td'+negStyle(kOnb)+'>'+fEur(kOnb)+'</td></tr>'+
      '<tr class="pct-row"><td colspan="4">↳ '+onbPct.toFixed(1)+'% van energiekosten</td></tr>'+
      '<tr class="subtotaal"><td>Subtotaal energietransacties</td><td>'+fMwh(verb)+'</td><td>'+fEurMwh(subEnergie,verb)+'</td><td>'+fEur(subEnergie)+'</td></tr>'+
      '<tr><td>Kosten Platform</td><td>'+fMwh(verb)+'</td><td>'+(tc.platform_mwh?fEur(tc.platform_mwh):'—')+'</td><td>'+fEur(kPlat)+'</td></tr>'+
      '<tr><td>Kosten GVO bilateraal</td><td>'+fMwh(gel)+'</td><td>'+(tc.gvo_bil_mwh?fEur(tc.gvo_bil_mwh):'—')+'</td><td>'+fEur(kGvoBil)+'</td></tr>'+
      '<tr><td>Kosten GVO reststroom</td><td>'+fMwh(tek)+'</td><td>'+(tc.gvo_rest_mwh?fEur(tc.gvo_rest_mwh):'—')+'</td><td>'+fEur(kGvoRest)+'</td></tr>'+
      '<tr class="totaal"><td>Kosten totaal</td><td>'+fMwh(verb)+'</td><td>'+fEurMwh(kTotaal,verb)+'</td><td>'+fEur(kTotaal)+'</td></tr>'+
      '</tbody></table>';
  }

  function buildProducersTbl(s){
    var gel=s.gelijktijdig_kWh||0,ovsch=s.overschot_kWh||0,opwek=s.totaal_opwek_kWh||0;
    var kGel=s.kosten_gelijktijdigheid_totaal_EUR||0,kEpexOpbr=s.opbrengst_epex_overschot_EUR||0;
    // Onbalans op de producentenzijde = zon + wind (spec 5.7); het verbruiksdeel hoort bij de afnemers.
    var kOnb=(s.kosten_onbalans_zon_EUR||0)+(s.kosten_onbalans_wind_EUR||0),kGvoBil=s.kosten_gvo_bilateraal_EUR||0;
    var kPlatProd=opwek*(tc.platform_mwh||0)/1000;
    var kGvoRestProd=ovsch*(tc.gvo_rest_mwh||0)/1000;
    var subEnergie=kGel+kEpexOpbr-kOnb;
    var opbrengsten=kGel+kEpexOpbr;
    var onbPct=opbrengsten>0?(kOnb/opbrengsten*100):0;
    var totaal=subEnergie-kPlatProd+kGvoBil+kGvoRestProd;
    return '<table class="ehp-ov-tbl"><thead><tr>'+
      '<th>Post</th><th>MWh</th><th>€/MWh</th><th>EUR</th></tr></thead><tbody>'+
      '<tr><td>Verkoop Gelijktijdig</td><td>'+fMwh(gel)+'</td><td>'+fEurMwh(kGel,gel)+'</td><td>'+fEur(kGel)+'</td></tr>'+
      '<tr><td>Verkoop EPEX</td><td>'+fMwh(ovsch)+'</td><td>'+fEurMwh(kEpexOpbr,ovsch)+'</td><td>'+fEur(kEpexOpbr)+'</td></tr>'+
      '<tr><td>Onbalanskosten</td><td>—</td><td>—</td><td'+negStyle(-kOnb)+'>'+fEur(-kOnb)+'</td></tr>'+
      '<tr class="pct-row"><td colspan="4">↳ '+onbPct.toFixed(1)+'% van opbrengsten</td></tr>'+
      '<tr class="subtotaal"><td>Subtotaal energietransacties</td><td>'+fMwh(opwek)+'</td><td>'+fEurMwh(subEnergie,opwek)+'</td><td'+negStyle(subEnergie)+'>'+fEur(subEnergie)+'</td></tr>'+
      '<tr><td>Kosten Platform</td><td>'+fMwh(opwek)+'</td><td>'+(tc.platform_mwh?fEur(-tc.platform_mwh):'—')+'</td><td'+negStyle(-kPlatProd)+'>'+fEur(-kPlatProd)+'</td></tr>'+
      '<tr><td>Inkomsten GVO bilateraal</td><td>'+fMwh(gel)+'</td><td>'+(tc.gvo_bil_mwh?fEur(tc.gvo_bil_mwh):'—')+'</td><td>'+fEur(kGvoBil)+'</td></tr>'+
      '<tr><td>Inkomsten GVO reststroom</td><td>'+fMwh(ovsch)+'</td><td>'+(tc.gvo_rest_mwh?fEur(tc.gvo_rest_mwh):'—')+'</td><td>'+fEur(kGvoRestProd)+'</td></tr>'+
      '<tr class="totaal"><td>Inkomsten totaal</td><td>'+fMwh(opwek)+'</td><td>'+fEurMwh(totaal,opwek)+'</td><td'+negStyle(totaal)+'>'+fEur(totaal)+'</td></tr>'+
      '</tbody></table>';
  }

  function buildBlok(s,label){
    if(!s)return '';
    return '<div class="ehp-ov-blok">'+
      '<div class="ehp-ov-blok-hdr">'+label+'</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:10px 14px 0">'+
        '<div class="ehp-ov-col--afn"><div class="ehp-ov-side-hdr ehp-ov-side-afn">Afnemers — hele gemeenschap</div>'+buildAfnemersTbl(s)+'</div>'+
        '<div class="ehp-ov-col--prod"><div class="ehp-ov-side-hdr ehp-ov-side-prod">Producenten — hele gemeenschap</div>'+buildProducersTbl(s)+'</div>'+
      '</div></div>';
  }

  if(!sam)return '';
  var html=buildBlok(sam,'EPEX historisch');
  if(sam2)html+=buildBlok(sam2,'Forward scenario');
  return '<div class="cd">'+
    '<div class="ct2"><div class="ac" style="background:#c0793c"></div>Financieel overzicht</div>'+
    html+'</div>';
}

// Jaarfactuur per deelnemer — één factuurblok per bedrijf met de volledige EHP-
// kostenuitsplitsing (intern/EPEX/platform/GVO/onbalans) plus energiebelasting en btw
// wanneer die op het platform zijn aangevinkt (res.cfg.ebOn / res.cfg.btwOn).
// Hergebruikt de per-deelnemer kosten uit res.per_gebruiker / res.per_opwekker en de
// pure staffel-rekenkern calculateEnergyTax() uit rekenkern.js.
function _ehpFactuurHtml(res){
  var parties=res.parties||[];
  if(!parties.length)return '';
  var cfg=res.cfg||{};
  var gebr={},opw={};
  (res.per_gebruiker||[]).forEach(function(u){gebr[u.Locatie]=u;});
  (res.per_opwekker||[]).forEach(function(o){opw[o.Asset]=o;});

  function fEur(v){
    if(v==null||isNaN(v))return '—';
    return v.toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function fKwh(kwh){
    if(kwh==null||isNaN(kwh))return '—';
    return Math.round(kwh).toLocaleString('nl-NL');
  }
  function fEurKwh(eur,kwh){
    if(!kwh||kwh===0)return '—';
    return (eur/kwh).toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:5});
  }
  function negStyle(v){return v<0?' style="color:#c0392b"':'';}
  function row(lbl,kwh,eur){
    return '<tr><td>'+lbl+'</td>'+
      '<td>'+(kwh==null?'—':fKwh(kwh))+'</td>'+
      '<td>'+(kwh==null?'—':fEurKwh(eur,kwh))+'</td>'+
      '<td'+negStyle(eur)+'>'+fEur(eur)+'</td></tr>';
  }
  function srow(cls,lbl,eur){
    return '<tr'+(cls?' class="'+cls+'"':'')+'><td colspan="3">'+lbl+'</td><td'+negStyle(eur)+'>'+fEur(eur)+'</td></tr>';
  }

  var srcLbl={zon:'Zon',wind:'Wind',afname_invoeden:'Afname-invoeden',overig:'Overig',none:'Alleen afnemer',alleen_afname:'Alleen afnemer',geen:'Geen'};

  var cards=parties.filter(function(x){return x.source!=='geen';}).map(function(x){
    var g=gebr[x.id],o=opw[x.id];
    var hasCons=g&&(g.totaal_verbruik_kWh>0);
    var hasProd=o&&(o.totaal_opwek_kWh>0);
    if(!hasCons&&!hasProd)return '';

    var lines='',subtotaal=0;

    if(hasCons){
      var kGel=g.kosten_gelijktijdigheid_EUR||0,kEpex=g.kosten_epex_tekort_EUR||0;
      var kOnb=g.kosten_onbalans_verbruik_EUR||0,kPlat=g.kosten_platform_EUR||0;
      var kGvoBil=g.kosten_gvo_bilateraal_EUR||0,kGvoRest=g.kosten_gvo_rest_EUR||0;
      lines+=row('Inkoop gelijktijdig (intern)',g.gelijktijdig_kWh,kGel)+
             row('Inkoop EPEX (van net)',g.tekort_kWh,kEpex)+
             row('Onbalanskosten',null,kOnb)+
             row('Kosten platform',g.totaal_verbruik_kWh,kPlat)+
             row('GVO bilateraal',g.gelijktijdig_kWh,kGvoBil)+
             row('GVO reststroom',g.tekort_kWh,kGvoRest);
      subtotaal+=kGel+kEpex+kOnb+kPlat+kGvoBil+kGvoRest;
    }

    if(hasProd){
      var oGel=-(o.opbrengst_gelijktijdigheid_EUR||0),oEpex=-(o.opbrengst_epex_overschot_EUR||0);
      var oOnb=o.kosten_onbalans_opwek_EUR||0;
      lines+=row('Verkoop gelijktijdig (intern)',o.gelijktijdig_kWh,oGel)+
             row('Teruglevering naar net (EPEX)',o.overschot_kWh,oEpex)+
             row('Onbalanskosten opwek',null,oOnb);
      subtotaal+=oGel+oEpex+oOnb;
    }

    lines+=srow('subtotaal','Subtotaal energie &amp; platform',subtotaal);

    // Energiebelasting (alleen bij grondslag > 0 → pure opwekkers krijgen geen EB/korting)
    var ebNetto=0;
    if(cfg.ebOn&&typeof calculateEnergyTax==='function'){
      var afnameKwh=g?(g.totaal_bruto_afname_kWh||0):0;
      var terugleverKwh=o?(o.overschot_kWh||0):(g?(g.afname_invoeden_kWh||0):0);
      var eb=calculateEnergyTax(afnameKwh,terugleverKwh,{
        jaar:parseInt(cfg.ebJaar,10)||undefined,
        grondslag:cfg.ebGrondslag,
        externeAfnameKwh:g?(g.tekort_kWh||0):0,
        heffingskorting:cfg.heffingskorting||0
      });
      if((eb.grondslagKwh||0)>0){
        lines+=row('Energiebelasting'+(cfg.ebJaar?' '+cfg.ebJaar:''),eb.grondslagKwh,eb.belasting);
        if((eb.heffingskorting||0)>0)lines+=srow('','Vermindering energiebelasting',-(eb.heffingskorting||0));
        ebNetto=eb.netto||0;
      }
    }

    var subExclBtw=subtotaal+ebNetto,btw=0;
    if(cfg.btwOn){
      btw=subExclBtw*((cfg.btwPct||21)/100);
      lines+=srow('subtotaal','Subtotaal excl. btw',subExclBtw)+
             srow('','Btw '+(cfg.btwPct||21)+'%',btw);
    }
    lines+=srow('totaal','Totaal'+(cfg.btwOn?' incl. btw':''),subExclBtw+btw);

    return '<div class="ehp-party-card">'+
      '<div class="ehp-party-h"><div class="ehp-party-name">'+_ehpEsc(x.name)+
      ' <span class="bdg bg" style="margin-left:6px">'+(srcLbl[x.source]||x.source)+'</span></div></div>'+
      '<div class="ehp-ov-col--afn"><table class="ehp-ov-tbl"><thead><tr>'+
      '<th>Post</th><th>kWh</th><th>€/kWh</th><th>Bedrag €</th></tr></thead>'+
      '<tbody>'+lines+'</tbody></table></div></div>';
  }).join('');

  if(!cards)return '';

  var note;
  if(cfg.ebOn&&cfg.btwOn)note='Energiebelasting en btw zijn toegepast volgens de platforminstellingen.';
  else if(cfg.ebOn)note='Energiebelasting is toegepast; btw staat uit op het platform.';
  else if(cfg.btwOn)note='Btw is toegepast; energiebelasting staat uit op het platform.';
  else note='Energiebelasting en btw staan uit op het platform — schakel ze in bij de platforminstellingen om ze in de factuur op te nemen.';

  return '<div class="cd ehp-grp"><div class="ct2"><div class="ac" style="background:#c0793c"></div>Jaarfactuur per deelnemer</div>'+
    '<div class="ib2" style="margin-bottom:10px">'+note+' Negatieve bedragen zijn opbrengsten (teruglevering).</div>'+
    '<div class="ehp-party-grid">'+cards+'</div></div>';
}

function _ehpGelijktijdheidHtml(res){
  var MN_NL=['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus',
             'September','Oktober','November','December'];
  function mnNaam(k){return MN_NL[parseInt(k.slice(5,7),10)-1]||k;}
  function fMwh2(kwh){return Math.round(kwh/1000).toLocaleString('nl-NL');}
  function fPct2(a,b){return b>0?(a/b*100).toFixed(1)+'%':'—';}

  function buildGroupMonthly(modelRows){
    var m={};
    modelRows.forEach(function(r){
      var mn=r.tijdKey.slice(0,7);
      if(!m[mn])m[mn]={bruto:0,ai:0,zon:0,wind:0,gel_ai:0,gel_zon:0,gel_wind:0,gel:0};
      var g=m[mn];
      g.bruto+=r.totaal_verbruik_kWh||0;
      g.ai   +=r.opwek_afname_invoeden_kWh||0;
      g.zon  +=r.opwek_zon_kWh||0;
      g.wind +=r.opwek_wind_kWh||0;
      g.gel_ai +=r.gelijktijdig_afname_invoeden_kWh||0;
      g.gel_zon+=r.gelijktijdig_zon_kWh||0;
      g.gel_wind+=r.gelijktijdig_wind_kWh||0;
      g.gel  +=r.gelijktijdig_kWh||0;
    });
    return m;
  }

  // Kolomdefinities met context-afhankelijke uitleg (info-icoon per kolom).
  // De drie tabeltypen (platform / afnemers / invoeders) delen dezelfde koppen,
  // maar de betekenis verschilt — daarom een tooltip per context.
  var GEL_COLS=[
    {l:'Maand',t:'De kalendermaand waarover de waarden zijn opgeteld. De rij "Totaal" is de som over de hele meetperiode.'},
    {l:'Bruto afname MWh',t:{
      platform:'Totale elektriciteitsvraag van alle deelnemers in de groep deze maand, vóór salderen (MWh).',
      afnemers:'Totale elektriciteitsvraag van deze deelnemer deze maand, vóór salderen (MWh).',
      invoeders:'Een invoeder heeft zelf geen afname — deze kolom toont hier het intern gesaldeerde (gematchte) volume van de invoeder (MWh).'}},
    {l:'Afname-INVOEDEN MWh',t:{
      platform:'Opwek van afname-invoeders: deelnemers die productie aan de groep leveren zonder aparte zon/wind-asset (MWh).',
      afnemers:'Eigen invoeding van deze deelnemer die als afname-invoeder aan de groep wordt geleverd (MWh).',
      invoeders:'Productie van deze invoeder — alleen gevuld als het een afname-invoeder is (geen zon/wind) (MWh).'}},
    {l:'Productie Zon MWh',t:{
      platform:'Totale zonopwek binnen de groep deze maand (MWh).',
      afnemers:'Aan deze deelnemer toegerekende zonopwek (naar rato van aandeel) plus eventuele eigen zon-asset (MWh).',
      invoeders:'Zonopwek van deze invoeder — alleen gevuld bij een zon-asset (MWh).'}},
    {l:'Productie Wind MWh',t:{
      platform:'Totale windopwek binnen de groep deze maand (MWh).',
      afnemers:'Aan deze deelnemer toegerekende windopwek (naar rato van aandeel) plus eventuele eigen wind-asset (MWh).',
      invoeders:'Windopwek van deze invoeder — alleen gevuld bij een wind-asset (MWh).'}},
    {l:'Gelijktijdig INVOEDEN MWh',t:{
      platform:'Deel van de afname-invoeding dat gelijktijdig binnen de groep is benut, oftewel gesaldeerd (MWh).',
      afnemers:'Invoeding die gematcht is aan de vraag van déze deelnemer (MWh).',
      invoeders:'Deel van de eigen invoeding dat gelijktijdig is benut — alleen bij afname-invoeders (MWh).'}},
    {l:'Gelijktijdig totaal MWh',t:{
      platform:'Totale opwek (zon + wind + invoeden) die gelijktijdig binnen de groep is verbruikt: het gesaldeerde volume (MWh).',
      afnemers:'Totale opwek die gelijktijdig met de vraag van deze deelnemer is verbruikt: het gesaldeerde volume (MWh).',
      invoeders:'Volume van deze invoeder dat gelijktijdig binnen de groep is benut (MWh).'}},
    {l:'Gelijktijdigheid afnemer %',t:{
      platform:'Aandeel van de bruto afname dat is gedekt door gelijktijdige opwek binnen de groep (gesaldeerd ÷ bruto afname).',
      afnemers:'Aandeel van de vraag van deze deelnemer dat is gedekt door gelijktijdige opwek (gesaldeerd ÷ bruto afname).',
      invoeders:'Niet van toepassing op invoeders — zij hebben geen eigen afname.'}},
    {l:'Gelijk zonopwek %',t:{
      platform:'Aandeel van de zonopwek dat gelijktijdig binnen de groep is benut (gematchte zon ÷ productie zon).',
      afnemers:'Aandeel van de toegerekende zonopwek dat gelijktijdig is benut (gematchte zon ÷ productie zon).',
      invoeders:'Aandeel van de zonopwek van deze invoeder dat gelijktijdig is benut — alleen bij zon-assets.'}},
    {l:'Gelijk windopwek %',t:{
      platform:'Aandeel van de windopwek dat gelijktijdig binnen de groep is benut (gematchte wind ÷ productie wind).',
      afnemers:'Aandeel van de toegerekende windopwek dat gelijktijdig is benut (gematchte wind ÷ productie wind).',
      invoeders:'Aandeel van de windopwek van deze invoeder dat gelijktijdig is benut — alleen bij wind-assets.'}},
    {l:'Interne Gelijktijdigheid %',t:{
      platform:'Aandeel van de afname-invoeding dat intern is gesaldeerd (gematchte invoeding ÷ totale invoeding).',
      afnemers:'Aandeel van de eigen invoeding van deze deelnemer dat intern is gesaldeerd.',
      invoeders:'Aandeel van de invoeding van deze invoeder dat intern is benut — alleen bij afname-invoeders.'}}
  ];
  function buildThead(ctx){
    return '<thead><tr>'+GEL_COLS.map(function(c){
      var tip=typeof c.t==='string'?c.t:(c.t[ctx]||c.t.platform);
      return '<th>'+c.l+' '+tipIcon(tip)+'</th>';
    }).join('')+'</tr></thead>';
  }

  function renderGroupTbl(mnMap,label){
    var keys=Object.keys(mnMap).sort();
    var tot={bruto:0,ai:0,zon:0,wind:0,gel_ai:0,gel_zon:0,gel_wind:0,gel:0};
    var rows='';
    keys.forEach(function(mn){
      var g=mnMap[mn];
      tot.bruto+=g.bruto;tot.ai+=g.ai;tot.zon+=g.zon;tot.wind+=g.wind;
      tot.gel_ai+=g.gel_ai;tot.gel_zon+=g.gel_zon;tot.gel_wind+=g.gel_wind;tot.gel+=g.gel;
      rows+='<tr>'+
        '<td>'+mnNaam(mn)+'</td>'+
        '<td>'+fMwh2(g.bruto)+'</td>'+
        '<td>'+fMwh2(g.ai)+'</td>'+
        '<td>'+fMwh2(g.zon)+'</td>'+
        '<td>'+fMwh2(g.wind)+'</td>'+
        '<td>'+fMwh2(g.gel_ai)+'</td>'+
        '<td>'+fMwh2(g.gel)+'</td>'+
        '<td>'+fPct2(g.gel,g.bruto)+'</td>'+
        '<td>'+fPct2(g.gel_zon,g.zon)+'</td>'+
        '<td>'+fPct2(g.gel_wind,g.wind)+'</td>'+
        '<td>'+fPct2(g.gel_ai,g.ai)+'</td>'+
        '</tr>';
    });
    rows+='<tr class="gel-totaal">'+
      '<td>Totaal</td>'+
      '<td>'+fMwh2(tot.bruto)+'</td>'+
      '<td>'+fMwh2(tot.ai)+'</td>'+
      '<td>'+fMwh2(tot.zon)+'</td>'+
      '<td>'+fMwh2(tot.wind)+'</td>'+
      '<td>'+fMwh2(tot.gel_ai)+'</td>'+
      '<td>'+fMwh2(tot.gel)+'</td>'+
      '<td>'+fPct2(tot.gel,tot.bruto)+'</td>'+
      '<td>'+fPct2(tot.gel_zon,tot.zon)+'</td>'+
      '<td>'+fPct2(tot.gel_wind,tot.wind)+'</td>'+
      '<td>'+fPct2(tot.gel_ai,tot.ai)+'</td>'+
      '</tr>';
    return '<div class="gel-blok gel-blok--platform">'+
      '<div class="gel-blok-hdr">'+label+'</div>'+
      '<div style="overflow-x:auto"><table class="gel-tbl">'+buildThead('platform')+'<tbody>'+rows+'</tbody></table></div>'+
      '</div>';
  }

  function renderMemberTbl(name,puMonthly,poByType){
    var allMn={};
    Object.keys(puMonthly||{}).forEach(function(mn){allMn[mn]=1;});
    Object.keys(poByType).forEach(function(tp){Object.keys(poByType[tp]||{}).forEach(function(mn){allMn[mn]=1;});});
    var keys=Object.keys(allMn).sort();
    if(!keys.length)return '';
    // Kolominterpretatie conform Excel-gebruikerstabel:
    //  - Productie Zon/Wind = aandeel-gewogen gemeenschapsopwek toegerekend aan deze
    //    deelnemer (pu.attr_opwek_*) + eventuele eigen opwekasset (zonPo/windPo).
    //  - Gelijktijdig INVOEDEN = invoeding gematcht aan de vraag van DEZE deelnemer
    //    (consument-zijde: pu.gelijktijdig_afname_invoeden_kWh), niet de eigen invoeding.
    //  - Gelijk zon/wind % = gematchte opwek / toegerekende productie.
    //  - Interne Gelijktijdigheid % = eigen invoeding gematcht / eigen invoeding
    //    (opwekker-zijde: aiPo.gelijktijdig_kWh / aiPo.totaal_opwek_kWh).
    var tot={bruto:0,ai:0,zon:0,wind:0,gel_ai:0,gel_zon:0,gel_wind:0,gel:0,int_gel:0,int_tot:0};
    var rows='';
    keys.forEach(function(mn){
      var pu=(puMonthly||{})[mn]||{};
      var aiPo=(poByType.afname_invoeden||{})[mn]||{};
      var zonPo=(poByType.zon||{})[mn]||{};
      var windPo=(poByType.wind||{})[mn]||{};
      var bruto=pu.totaal_verbruik_kWh||0;
      var ai=aiPo.totaal_opwek_kWh||0;                                    // eigen invoeding
      var zon=(pu.attr_opwek_zon_kWh||0)+(zonPo.totaal_opwek_kWh||0);     // toegerekend + eigen
      var wind=(pu.attr_opwek_wind_kWh||0)+(windPo.totaal_opwek_kWh||0);
      var gel_ai=pu.gelijktijdig_afname_invoeden_kWh||0;                  // consument-zijde
      var gel_zon=(pu.gelijktijdig_zon_kWh||0)+(zonPo.gelijktijdig_kWh||0);
      var gel_wind=(pu.gelijktijdig_wind_kWh||0)+(windPo.gelijktijdig_kWh||0);
      var gel=pu.gelijktijdig_kWh||0;
      var int_gel=aiPo.gelijktijdig_kWh||0;                               // eigen invoeding gematcht
      var int_tot=ai;
      tot.bruto+=bruto;tot.ai+=ai;tot.zon+=zon;tot.wind+=wind;
      tot.gel_ai+=gel_ai;tot.gel_zon+=gel_zon;tot.gel_wind+=gel_wind;tot.gel+=gel;
      tot.int_gel+=int_gel;tot.int_tot+=int_tot;
      rows+='<tr>'+
        '<td>'+mnNaam(mn)+'</td>'+
        '<td>'+fMwh2(bruto)+'</td>'+
        '<td>'+fMwh2(ai)+'</td>'+
        '<td>'+fMwh2(zon)+'</td>'+
        '<td>'+fMwh2(wind)+'</td>'+
        '<td>'+fMwh2(gel_ai)+'</td>'+
        '<td>'+fMwh2(gel)+'</td>'+
        '<td>'+fPct2(gel,bruto)+'</td>'+
        '<td>'+fPct2(gel_zon,zon)+'</td>'+
        '<td>'+fPct2(gel_wind,wind)+'</td>'+
        '<td>'+fPct2(int_gel,int_tot)+'</td>'+
        '</tr>';
    });
    rows+='<tr class="gel-totaal">'+
      '<td>Totaal</td>'+
      '<td>'+fMwh2(tot.bruto)+'</td>'+
      '<td>'+fMwh2(tot.ai)+'</td>'+
      '<td>'+fMwh2(tot.zon)+'</td>'+
      '<td>'+fMwh2(tot.wind)+'</td>'+
      '<td>'+fMwh2(tot.gel_ai)+'</td>'+
      '<td>'+fMwh2(tot.gel)+'</td>'+
      '<td>'+fPct2(tot.gel,tot.bruto)+'</td>'+
      '<td>'+fPct2(tot.gel_zon,tot.zon)+'</td>'+
      '<td>'+fPct2(tot.gel_wind,tot.wind)+'</td>'+
      '<td>'+fPct2(tot.int_gel,tot.int_tot)+'</td>'+
      '</tr>';
    return '<div class="gel-blok gel-blok--afnemers">'+
      '<div class="gel-blok-hdr">'+name+'</div>'+
      '<div style="overflow-x:auto"><table class="gel-tbl">'+buildThead('afnemers')+'<tbody>'+rows+'</tbody></table></div>'+
      '</div>';
  }

  // Invoeder-tabel: per-bron weergave (uitsluitend per_opwekker-data, conform Excel).
  //  - Bruto afname = Gelijktijdig totaal = gematchte volume (gelijktijdig_kWh).
  //  - Productie/Afname-INVOEDEN en de bijbehorende procentkolom hangen af van Type_norm.
  function renderInvoederTbl(label,rec){
    var type=rec.Type_norm;
    var keys=Object.keys(rec.monthly||{}).sort();
    if(!keys.length)return '';
    var isZon=type==='zon',isWind=type==='wind',isAI=type==='afname_invoeden';
    // Vaste 0,0% voor niet-toepasselijke procentkolommen (fPct2 geeft '—' bij deler 0).
    function pctCol(applies,gel,prod){return applies?fPct2(gel,prod):'0,0%';}
    function row(naam,prod,gel,cls){
      return '<tr'+(cls?' class="'+cls+'"':'')+'>'+
        '<td>'+naam+'</td>'+
        '<td>'+fMwh2(gel)+'</td>'+                               // Bruto afname
        '<td>'+fMwh2(isAI?prod:0)+'</td>'+                       // Afname-INVOEDEN
        '<td>'+fMwh2(isZon?prod:0)+'</td>'+                      // Productie Zon
        '<td>'+fMwh2(isWind?prod:0)+'</td>'+                     // Productie Wind
        '<td>'+fMwh2(isAI?gel:0)+'</td>'+                        // Gelijktijdig INVOEDEN
        '<td>'+fMwh2(gel)+'</td>'+                               // Gelijktijdig totaal
        '<td>0,0%</td>'+                                         // Gelijktijdigheid afnemer
        '<td>'+pctCol(isZon,gel,prod)+'</td>'+                   // Gelijk zonopwek
        '<td>'+pctCol(isWind,gel,prod)+'</td>'+                  // Gelijk windopwek
        '<td>'+pctCol(isAI,gel,prod)+'</td>'+                    // Interne Gelijktijdigheid
        '</tr>';
    }
    var totProd=0,totGel=0,rows='';
    keys.forEach(function(mn){
      var m=rec.monthly[mn]||{};
      var prod=m.totaal_opwek_kWh||0,gel=m.gelijktijdig_kWh||0;
      totProd+=prod;totGel+=gel;
      rows+=row(mnNaam(mn),prod,gel,'');
    });
    rows+=row('Totaal',totProd,totGel,'gel-totaal');
    return '<div class="gel-blok gel-blok--invoeders">'+
      '<div class="gel-blok-hdr">'+label+'</div>'+
      '<div style="overflow-x:auto"><table class="gel-tbl">'+buildThead('invoeders')+'<tbody>'+rows+'</tbody></table></div>'+
      '</div>';
  }

  if(!res.model||!res.model.length)return '<p>Geen modeldata beschikbaar.</p>';

  // Index per naam: verbruik (per_gebruiker) en opwek-assets (per_opwekker)
  var puByName={};
  (res.per_gebruiker||[]).forEach(function(u){puByName[u.Locatie]=u;});
  var poByName={};
  (res.per_opwekker||[]).forEach(function(o){
    if(!poByName[o.Asset])poByName[o.Asset]={};
    poByName[o.Asset][o.Type_norm]=o;
  });
  function poTypesFor(name){
    var poTypes={},poEntry=poByName[name];
    if(poEntry)Object.keys(poEntry).forEach(function(tp){poTypes[tp]=poEntry[tp].monthly||{};});
    return poTypes;
  }

  // --- Platform: gemeenschapstabellen (EPEX + Forward) ---
  var platHtml=renderGroupTbl(buildGroupMonthly(res.model),'Gemeenschap — EPEX historisch');
  if(res.model_fwd&&res.model_fwd.length){
    platHtml+=renderGroupTbl(buildGroupMonthly(res.model_fwd),'Gemeenschap — Forward scenario');
  }

  // --- Afnemers: alleen verbruikende partijen (incl. afname-invoeders) ---
  var afnHtml='';
  (res.parties||[]).forEach(function(pt){
    if(!((pt.totaal_verbruik_kWh||0)>0))return;
    var pu=puByName[pt.name]||{};
    afnHtml+=renderMemberTbl(pt.name,pu.monthly||{},poTypesFor(pt.name));
  });
  if(!afnHtml)afnHtml='<p>Geen verbruikende deelnemers.</p>';

  // --- Invoeders: één tabel per opwek-bron (per_opwekker), conform oranje Excel ---
  var invHtml='';
  (res.per_opwekker||[]).forEach(function(rec){
    // afname-invoeders krijgen "Afname-Invoeden - <naam>"; zon/wind tonen de asset-naam.
    var lbl=rec.Type_norm==='afname_invoeden'?('Afname-Invoeden - '+rec.Asset):rec.Asset;
    invHtml+=renderInvoederTbl(lbl,rec);
  });
  if(!invHtml)invHtml='<p>Geen invoeders.</p>';

  function viewBtn(view,label,on){
    return '<button class="tab'+(on?' on':'')+'" data-gel-view="'+view+'">'+label+'</button>';
  }
  return '<div class="tabs" style="margin-bottom:12px">'+
      viewBtn('platform','Platform',true)+
      viewBtn('afnemers','Afnemers',false)+
      viewBtn('invoeders','Invoeders',false)+
    '</div>'+
    '<div data-gel-pane="platform">'+platHtml+'</div>'+
    '<div data-gel-pane="afnemers" hidden>'+afnHtml+'</div>'+
    '<div data-gel-pane="invoeders" hidden>'+invHtml+'</div>';
}

// --- Event listeners ---------------------------------------------------------

var PAGE_MAP={home:'pageHome',gto:'pageGto',ehp:'pageEhp'};
document.addEventListener('DOMContentLoaded',function(){
  document.querySelectorAll('.nav-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      document.querySelectorAll('.nav-btn').forEach(function(b){b.classList.remove('on');});
      btn.classList.add('on');
      var tool=btn.getAttribute('data-tool');
      Object.keys(PAGE_MAP).forEach(function(k){
        document.getElementById(PAGE_MAP[k]).classList.toggle('ehp-hide',k!==tool);
      });
      if(tool==='ehp'){try{renderEHP();}catch(e){console.error('renderEHP:',e);}}
      if(tool==='home'){try{renderHome();}catch(e){console.error('renderHome:',e);}}
    });
  });
  document.getElementById('btnAddEhp').addEventListener('click',addEhp);
  document.getElementById('btnDelEhp').addEventListener('click',delEhp);
  document.getElementById('btnCalcEhp').addEventListener('click',function(){calcEHP().catch(function(e){console.error('calcEHP:',e);notify('Fout bij berekening',false);});});
  document.getElementById('btnDlEhp').addEventListener('click',downloadEhpCsv);
  document.getElementById('ehpList').addEventListener('click',function(e){
    var it=e.target.closest('[data-ehp-id]');
    if(it)selectEhp(it.getAttribute('data-ehp-id'));
  });
  var ehpEf=document.getElementById('ehpEpexFile');
  if(ehpEf)ehpEf.addEventListener('change',function(){if(this.files[0])_ehpHandleEpexFile(this.files[0]);this.value='';});
  var ehpFf=document.getElementById('ehpFwdFile');
  if(ehpFf)ehpFf.addEventListener('change',function(){if(this.files[0])_ehpHandleForwardFile(this.files[0]);this.value='';});
});
