// Energiehandelsplatform (EHP) — losstaande financiële module.
// Hergebruikt projectstructuur, aansluitingen en IndexedDB-tijdreeksen van de GTO-tool.

var _ehpActiveId=null;   // actief platform binnen het huidige project
var _ehpLast=null;       // laatst berekende resultaat (voor CSV-download)

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
      var tsDate=new Date(rec.ts);
      if(isNaN(tsDate.getTime()))return;
      var kwh=rec.kw*0.25;
      var tijdKey=rec.ts.slice(0,16);
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

  // Analyse-tab: platform week/maand patronen
  var platAnalyseHtml=
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
      (hasNm?'<button class="tab" data-ehp-tab="tEhpNm">Niet-leden</button>':'')+
    '</div>'+
    '<div id="tEhpOv" class="pn on">'+headline+kpiHtml+_ehpOverzichtHtml(res)+simHtml+'</div>'+
    '<div id="tEhpAn" class="pn">'+flowHtml+platAnalyseHtml+'</div>'+
    '<div id="tEhpDeel" class="pn">'+skipNote+summaryHtml+partyCards+'</div>'+
    '<div id="tEhpGel" class="pn">'+_ehpGelijktijdheidHtml(res)+'</div>'+
    (hasNm?'<div id="tEhpNm" class="pn">'+nonMemHtml+'</div>':'');

  _ehpAttachFlowDrag();
  _ehpAttachTabs();

  // Platform grafieken (Analyse-tab — panel hidden, resize bij tab-switch)
  _ehpRenderPlatWeekChart();
  _ehpDrawPlatMonthChart(res.ehpMonthImp||{},res.ehpMonthExp||{});

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
      ['ehpPlatWeek','ehpPlatMonth','ehpNonMem','ehpWeek','ehpMonth'].forEach(function(k){
        if(CH[k])try{CH[k].resize();}catch(_){}
      });
    },30);
  });
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
    var kOnb=s.kosten_onbalans_totaal_EUR||0,kPlat=s.kosten_platform_EUR||0;
    var kGvoBil=s.kosten_gvo_bilateraal_EUR||0,kGvoRest=s.kosten_gvo_rest_EUR||0;
    var kTotaal=s.kosten_totaal_EUR||0;
    var subEnergie=kGel+kEpex+kOnb;
    var onbPct=subEnergie>0?(kOnb/subEnergie*100):0;
    return '<table class="ehp-ov-tbl"><thead><tr>'+
      '<th>Post</th><th>MWh</th><th>€/MWh</th><th>EUR</th></tr></thead><tbody>'+
      '<tr><td>Inkoop Gelijktijdig</td><td>'+fMwh(gel)+'</td><td>'+fEurMwh(kGel,gel)+'</td><td>'+fEur(kGel)+'</td></tr>'+
      '<tr><td>Inkoop EPEX</td><td>'+fMwh(tek)+'</td><td>'+fEurMwh(kEpex,tek)+'</td><td>'+fEur(kEpex)+'</td></tr>'+
      '<tr><td>Onbalanskosten</td><td>—</td><td>—</td><td'+negStyle(kOnb)+'>'+fEur(kOnb)+'</td></tr>'+
      '<tr class="pct-row"><td colspan="4">↳ '+onbPct.toFixed(1)+'% van subtotaal</td></tr>'+
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
    var kOnb=s.kosten_onbalans_totaal_EUR||0,kGvoBil=s.kosten_gvo_bilateraal_EUR||0;
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
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:8px">'+
        '<div><div class="ehp-ov-side-hdr ehp-ov-side-afn">Afnemers — hele gemeenschap</div>'+buildAfnemersTbl(s)+'</div>'+
        '<div><div class="ehp-ov-side-hdr ehp-ov-side-prod">Producenten — hele gemeenschap</div>'+buildProducersTbl(s)+'</div>'+
      '</div></div>';
  }

  if(!sam)return '';
  var html=buildBlok(sam,'EPEX historisch');
  if(sam2)html+=buildBlok(sam2,'Forward scenario');
  return '<div class="cd">'+
    '<div class="ct2"><div class="ac" style="background:#c0793c"></div>Financieel overzicht</div>'+
    html+'</div>';
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

  var THEAD='<thead><tr>'+
    '<th>Maand</th>'+
    '<th>Bruto afname MWh</th>'+
    '<th>Afname-INVOEDEN MWh</th>'+
    '<th>Productie Zon MWh</th>'+
    '<th>Productie Wind MWh</th>'+
    '<th>Gelijktijdig INVOEDEN MWh</th>'+
    '<th>Gelijktijdig totaal MWh</th>'+
    '<th>Gelijktijdigheid afnemer %</th>'+
    '<th>Gelijk zonopwek %</th>'+
    '<th>Gelijk windopwek %</th>'+
    '<th>Interne Gelijktijdigheid %</th>'+
    '</tr></thead>';

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
    return '<div class="gel-blok">'+
      '<div class="gel-blok-hdr">'+label+'</div>'+
      '<div style="overflow-x:auto"><table class="gel-tbl">'+THEAD+'<tbody>'+rows+'</tbody></table></div>'+
      '</div>';
  }

  function renderMemberTbl(name,puMonthly,poByType){
    var allMn={};
    Object.keys(puMonthly||{}).forEach(function(mn){allMn[mn]=1;});
    Object.keys(poByType).forEach(function(tp){Object.keys(poByType[tp]||{}).forEach(function(mn){allMn[mn]=1;});});
    var keys=Object.keys(allMn).sort();
    if(!keys.length)return '';
    var tot={bruto:0,ai:0,zon:0,wind:0,gel_ai:0,gel_zon:0,gel_wind:0,gel:0};
    var rows='';
    keys.forEach(function(mn){
      var pu=(puMonthly||{})[mn]||{};
      var aiPo=(poByType.afname_invoeden||{})[mn]||{};
      var zonPo=(poByType.zon||{})[mn]||{};
      var windPo=(poByType.wind||{})[mn]||{};
      var bruto=pu.totaal_verbruik_kWh||0;
      var ai=aiPo.totaal_opwek_kWh||0;
      var zon=zonPo.totaal_opwek_kWh||0;
      var wind=windPo.totaal_opwek_kWh||0;
      var gel_ai=aiPo.gelijktijdig_kWh||0;
      var gel_zon=pu.gelijktijdig_zon_kWh||0;
      var gel_wind=pu.gelijktijdig_wind_kWh||0;
      var gel=pu.gelijktijdig_kWh||0;
      tot.bruto+=bruto;tot.ai+=ai;tot.zon+=zon;tot.wind+=wind;
      tot.gel_ai+=gel_ai;tot.gel_zon+=gel_zon;tot.gel_wind+=gel_wind;tot.gel+=gel;
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
        '<td>'+fPct2(gel_ai,ai)+'</td>'+
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
    return '<div class="gel-blok">'+
      '<div class="gel-blok-hdr" style="background:#4a6fa5">'+name+'</div>'+
      '<div style="overflow-x:auto"><table class="gel-tbl">'+THEAD+'<tbody>'+rows+'</tbody></table></div>'+
      '</div>';
  }

  if(!res.model||!res.model.length)return '<p>Geen modeldata beschikbaar.</p>';
  var html='';

  // Groepstabellen
  html+=renderGroupTbl(buildGroupMonthly(res.model),'Gemeenschap — EPEX historisch');
  if(res.model_fwd&&res.model_fwd.length){
    html+=renderGroupTbl(buildGroupMonthly(res.model_fwd),'Gemeenschap — Forward scenario');
  }

  // Per-deelnemer tabellen
  var puByName={};
  (res.per_gebruiker||[]).forEach(function(u){puByName[u.Locatie]=u;});
  var poByName={};
  (res.per_opwekker||[]).forEach(function(o){
    if(!poByName[o.Asset])poByName[o.Asset]={};
    poByName[o.Asset][o.Type_norm]=o;
  });
  (res.parties||[]).forEach(function(pt){
    var pu=puByName[pt.name]||{};
    var poTypes={};
    var poEntry=poByName[pt.name];
    if(poEntry){
      Object.keys(poEntry).forEach(function(tp){
        poTypes[tp]=poEntry[tp].monthly||{};
      });
    }
    html+=renderMemberTbl(pt.name,pu.monthly||{},poTypes);
  });

  return html;
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
