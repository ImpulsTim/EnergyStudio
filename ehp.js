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
    retail_opslag_mwh:20,
    // Backward compat (EUR/kWh) — afgeleid bij _ehpCommit; gebruikt door rapport_ehp.js
    pZon:0.020,pWind:0.020,pOverig:0,fee:0,feeMode:'kwh',pNetAfname:0.12,pNetTerug:0.04,
    ebOn:false,ebJaar:'2025',ebGrondslag:'bruto',heffingskorting:0,btwOn:false,btwPct:21,
    // Prijsmodel per bron + merit order. Defaults reproduceren het overgenomen gedrag:
    // vaste tarieven, prioriteitsvolgorde, geen drempel.
    prijsmodel:(typeof EhpPrijs!=='undefined')?EhpPrijs.defaults():null,
    merit_volgorde:'prioriteit',merit_drempel:'geen',
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
  _ehpRenderPrijsmodel(c);
  renderEhpAccus(c);
  var mvEl=document.getElementById('ehpMeritVolgorde');
  if(mvEl)mvEl.value=c.merit_volgorde==='prijs'?'prijs':'prioriteit';
  var dfEl=document.getElementById('ehpDoelfunctie');
  if(dfEl)dfEl.value=c.doelfunctie||'groep_borg';
  var vsEl=document.getElementById('ehpVerdeelSleutel');
  if(vsEl)vsEl.value=c.verdeelSleutel||'';
  _ehpDoelUitleg();
  _sv2('ehpPlatform',c.platform_mwh!=null?c.platform_mwh:0);
  _sv2('ehpGvoBil',  c.gvo_bil_mwh!=null?c.gvo_bil_mwh:0);
  _sv2('ehpGvoRest', c.gvo_rest_mwh!=null?c.gvo_rest_mwh:0);
  _sv2('ehpOnbZonPct',   c.onb_zon_pct!=null?(c.onb_zon_pct*100).toFixed(3):0);
  _sv2('ehpOnbWindPct',  c.onb_wind_pct!=null?(c.onb_wind_pct*100).toFixed(3):0);
  _sv2('ehpOnbVbPct',    c.onb_vb_pct!=null?(c.onb_vb_pct*100).toFixed(3):0);
  _sv2('ehpOnbZonRisico',c.onb_zon_risico_mwh!=null?c.onb_zon_risico_mwh:0);
  _sv2('ehpOnbWindRisico',c.onb_wind_risico_mwh!=null?c.onb_wind_risico_mwh:0);
  _sv2('ehpOnbVbRisico', c.onb_vb_risico_mwh!=null?c.onb_vb_risico_mwh:0);
  _sv2('ehpRetailOpslagMwh', c.retail_opslag_mwh!=null?c.retail_opslag_mwh:20);
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
  // De drie bronprijzen komen nu uit het prijsmodel. gel_*_mwh blijft bestaan als
  // representatief tarief voor de bestaande consumenten van cfg (rapport, tarieven_cfg):
  // bij 'vast' is dat het tarief zelf, bij 'collar' de vloer, bij de overige vormen 0 —
  // daar komen de werkelijke bedragen uit EhpDispatch.pasPrijsmodelToe().
  // Vangnet: is de zijbalk nog niet gerenderd, dan levert _ehpLeesPrijsmodel() nulwaarden op.
  // Dat mag een opgeslagen prijsmodel niet overschrijven.
  var prijsmodel=document.querySelector('#ehpPrijsmodel [data-pm-vorm]')
    ? _ehpLeesPrijsmodel()
    : ((plat.cfg&&plat.cfg.prijsmodel)||EhpPrijs.migreer(plat.cfg||{}));
  var gZon=_ehpRepresentatiefTarief(prijsmodel.zon);
  var gWind=_ehpRepresentatiefTarief(prijsmodel.wind);
  var gAI=_ehpRepresentatiefTarief(prijsmodel.afname_invoeden);
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
    retail_opslag_mwh:num('ehpRetailOpslagMwh',20),
    // Backward compat (EUR/kWh) — voor rekenkern.js / rapport_ehp.js
    pZon:gZon/1000,pWind:gWind/1000,pOverig:gAI/1000,
    fee:gPlat/1000,feeMode:'kwh',pNetAfname:0.12,pNetTerug:0.04,
    ebOn:chk('ehpEbOn'),ebJaar:val('ehpEbJaar'),ebGrondslag:val('ehpEbGrondslag'),
    heffingskorting:num('ehpHeffing',0),btwOn:chk('ehpBtwOn'),btwPct:num('ehpBtwPct',21),
    prijsmodel:prijsmodel,
    merit_volgorde:val('ehpMeritVolgorde')==='prijs'?'prijs':'prioriteit',
    // De doelfunctie zet de merit-drempel: alleen bij 'laagste kosten voor afnemers' wordt een
    // bron overgeslagen zodra hij boven het netalternatief van de afnemer ligt.
    doelfunctie:val('ehpDoelfunctie')||'groep_borg',
    verdeelSleutel:val('ehpVerdeelSleutel')||'',
    merit_drempel:((EhpVerdeling.DOELFUNCTIES[val('ehpDoelfunctie')]||{}).drempel)==='afnemer'?'afnemer':'geen',
    opslag:_ehpLeesAccus((plat.cfg&&plat.cfg.opslag)||[])
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
  // Netpositie per aansluiting (kWh per kwartier, positief = afname). Nodig voor een accu die
  // achter de meter van één deelnemer staat: daar bepaalt díe aansluiting wat EB-vrij is en
  // welke piek verlaagd wordt — niet de groep als geheel.
  var ledenNetto={};
  withData.forEach(function(wd){
    var m={};
    wd.data.forEach(function(rec){
      var tk=_ehpReportKey(rec.ts,wd.source);
      m[tk]=(m[tk]||0)+rec.kw*0.25;
    });
    ledenNetto[wd.comp.id]={naam:wd.comp.name,map:m};
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
    onbalans_verbruik_risicoprijs:    (cfg.onb_vb_risico_mwh||0)/1000,
    retail_opslag:                    (cfg.retail_opslag_mwh||0)/1000
  };

  // --- Prijsmodel en merit order ---------------------------------------------
  // De prijs van een bron is een functie van het kwartier, niet een constante. Zonder
  // cfg.prijsmodel valt EhpPrijs.migreer() terug op de oude vaste tarieven, zodat bestaande
  // platforms exact dezelfde getallen blijven geven.
  var prijsmodelCfg = EhpPrijs.migreer(cfg);
  var prijsModel    = EhpPrijs.maak(prijsmodelCfg);
  var epexByTijd    = EhpDispatch.epexIndex(epexRows);
  var meritVolgorde = cfg.merit_volgorde === 'prijs'    ? 'prijs'   : 'prioriteit';
  var meritDrempel  = cfg.merit_drempel  === 'afnemer'  ? 'afnemer' : 'geen';
  var alleVast      = EhpPrijs.BRONNEN.every(function(b){ return prijsModel.vormVan(b)==='vast'; });
  var allocator = EhpDispatch.maakAllocator({
    volgorde:      meritVolgorde,
    drempel:       meritDrempel,
    prijsModel:    prijsModel,
    epexByTijd:    epexByTijd,
    afnemerOpslag: (cfg.retail_opslag_mwh||0)/1000
  });

  // --- EnergieModel.buildModel aanroepen ---
  var result;
  try{
    result=EnergieModel.buildModel({
      verbruik:     verbruikRows,
      opwek:        opwekRows,
      epex:         epexRows,
      tarieven:     tarieven,
      scenario:     {},
      forwardcurve: forwardRows,
      allocator:    allocator
    });
  }catch(e){
    notify('Rekenfout: '+e.message,false);
    console.error('EnergieModel.buildModel:',e);
    return;
  }

  var sam=result.samenvatting;

  // Bij een niet-vaste prijsvorm kloppen de gelijktijdigheidskolommen uit applyEconomicColumns
  // niet meer (die rekenen met één tarief per type). Alleen dan herrekenen, zodat het
  // referentiepad bit-voor-bit ongemoeid blijft.
  if(!alleVast){
    try{ EhpDispatch.pasPrijsmodelToe(result,{prijsModel:prijsModel,tarieven:tarieven}); }
    catch(e){ console.error('pasPrijsmodelToe:',e); notify('Fout bij toepassen prijsmodel',false); return; }
    sam=result.samenvatting;
  }

  // Waarde van het prijsmodel over het hele gematchte volume: per kwartier is de vergelijking
  // met de markt soms positief en soms negatief — wat telt is de som over de periode.
  var waarde = EhpPrijs.waardeVergelijking((result.opwekAlloc||[]).map(function(r){
    return {gelijktijdig_kWh:r.gelijktijdig_kWh, epex_eur_per_kWh:epexByTijd[r.tijdKey]||0,
            prijs_eur_per_kWh:r.prijs_eur_per_kWh};
  }), (cfg.retail_opslag_mwh||0)/1000);

  // Invoer bewaren zodat ehpRegressie() het overgenomen model op dezelfde data kan naspelen.
  window._ehpLaatsteInvoer={verbruik:verbruikRows,opwek:opwekRows,epex:epexRows,
    tarieven:tarieven,scenario:{},forwardcurve:forwardRows};
  // --- Opslag ----------------------------------------------------------------
  // Sequentieel: eerst de merit order zonder accu, dan de accu op de restpositie (overschot en
  // tekort) van de groep. Simultaan optimaliseren zou prijsvorming en opslagbeslissing door
  // elkaar halen; hoe de accuwaarde over de deelnemers verdeeld wordt is een aparte vraag.
  var opslagRes=[];
  (cfg.opslag||[]).forEach(function(accuCfg){
    try{
      var gastheer=_ehpGastheerProfiel(result.model,ledenNetto,accuCfg.eigenaar);
      var dsp=EhpOpslag.dispatch(result.model,accuCfg,{gastheer:gastheer});
      // Piekreductie is de tweede waardestroom. Bij Nederlandse transporttarieven is die vaak
      // van dezelfde orde als de arbitragemarge, dus hij hoort in de businesscase en niet in
      // een losse hoek van het scherm.
      var pk=null;
      try{ pk=EhpOpslag.piekAnalyse(result.model,accuCfg,{gastheer:gastheer}); }
      catch(pe){ console.error('piekAnalyse:',pe); }
      var piekJr=0;
      if(pk&&pk.beste){
        var jf=dsp.periodeDagen>0?365/dsp.periodeDagen:0;
        piekJr=(pk.beste.kmBesparing_EUR+pk.beste.kcBesparing_EUR)*jf;
      }
      var bcs=EhpOpslag.businesscase(pk&&pk.beste?pk.beste.dispatch:dsp,
        {discontoPct:EHP_PARAMS.waarde(cfg,'disconto_pct'),piekWaardePerJaar_EUR:piekJr});
      var eigNaam='';
      if(accuCfg.eigenaar&&accuCfg.eigenaar!=='platform'&&accuCfg.eigenaar!=='groep'){
        for(var ci=0;ci<p.companies.length;ci++){
          if(p.companies[ci].id===accuCfg.eigenaar){eigNaam=p.companies[ci].name;break;}
        }
      }
      opslagRes.push({cfg:accuCfg,dispatch:(pk&&pk.beste)?pk.beste.dispatch:dsp,
        dispatchZonderPiek:dsp,piek:pk,businesscase:bcs,eigenaarNaam:eigNaam});
    }catch(err){console.error('opslagdispatch:',err);notify('Accu kon niet worden doorgerekend: '+(accuCfg.naam||''),false);}
  });

  // Platformpositie van de groep vóór de accu, zodat het energievoordeel meetbaar is als
  // verschil. Dat voordeel landt via verwerkInModel() vanzelf bij de deelnemers; het moet
  // zichtbaar zijn maar niet nogmaals verdeeld worden.
  var platformPositieVoor=_ehpPlatformPositie(result);

  // De accu doorvoeren in de modelrijen. Zonder deze stap blijft het overschot naar het net
  // even groot terwijl de accu het net heeft opgeslagen, en verandert er in de kengetallen,
  // het financieel overzicht en de deelnemersverrekening niets.
  if(opslagRes.length){
    try{
      EhpOpslag.verwerkInModel(result,opslagRes,tarieven);
      sam=result.samenvatting;
    }catch(e){console.error('verwerkInModel:',e);notify('Accu kon niet in het model worden verwerkt',false);}
  }

  // Energievoordeel van de accu: hoeveel goedkoper de groep uitkomt doordat de accu een deel
  // van het tekort dekt en een deel van het overschot opvangt.
  var accuEnergievoordeel=opslagRes.length
    ? (platformPositieVoor-_ehpPlatformPositie(result))
    : 0;

  // Rekening per accu. Het energievoordeel wordt naar rato van de afgeleverde kWh toebedeeld
  // wanneer er meerdere accu's zijn.
  var accuPeriodeDagen=(opslagRes[0]&&opslagRes[0].dispatch&&opslagRes[0].dispatch.periodeDagen)||365;
  var totaalAfgeleverd=opslagRes.reduce(function(t,x){return t+(x.dispatch.doorzetUit_kWh||0);},0);
  opslagRes.forEach(function(x){
    var aandeel=totaalAfgeleverd>0?(x.dispatch.doorzetUit_kWh||0)/totaalAfgeleverd:1/opslagRes.length;
    x.rekening=EhpOpslag.rekening(x,accuPeriodeDagen,accuEnergievoordeel*aandeel);
    // Leesbare naam van de kostendrager erbij, zodat de rekening zichzelf verklaart.
    if(x.rekening.kostenDrager&&x.rekening.kostenDrager!=='platform'){
      for(var ki=0;ki<p.companies.length;ki++){
        if(p.companies[ki].id===x.rekening.kostenDrager){x.rekening.kostenDragerNaam=p.companies[ki].name;break;}
      }
    }
  });

  var model=result.model;

  // --- Tijdreeks voor bestaande chart-functies ---
  var allTs=model.map(function(r){return r.tijdKey;});

  // Netto kW per kwartier (positief = tekort/inkoop van net, negatief = overschot/teruglevering)
  var ehpNetKw=model.map(function(r){return (r.tekort_kWh-r.overschot_kWh)/0.25;});

  // Pieken groep (kW) — maatgevend voor de vermogenskeuze bij opslag.
  var maxMatchKw=0,peakProdKw=0,peakDemKw=0;
  model.forEach(function(r){
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

  // --- Verdeling: wie is beter af? -------------------------------------------
  // Vergelijkingsbasis is de ENERGIE-inkoop aan beide kanten, zonder energiebelasting en btw.
  // Die twee lopen bij een platform via een eigen route (grondslagkeuze, opslagvrijstelling) en
  // door elkaar mengen zou een verschil tonen dat niet uit de verrekening komt.
  var doelDef=EhpVerdeling.DOELFUNCTIES[cfg.doelfunctie]||EhpVerdeling.DOELFUNCTIES.groep_borg;
  var verdeelSleutel=cfg.verdeelSleutel||doelDef.sleutel;
  var verdeling=null;
  try{
    var prijsreeks=epexRows.map(function(r){return {ts:r.tijdKey,price:r.epex_eur_per_kWh};});
    var refLijst=EhpVerdeling.referentie(withData.map(function(wd){
      return {id:wd.comp.id,naam:wd.comp.name,company:wd.comp,data:wd.data};
    }),prijsreeks,{metEb:false,metNetkosten:false});

    var gebrByNaam={},opwByNaam={};
    result.per_gebruiker.forEach(function(u){gebrByNaam[u.Locatie]=u;});
    result.per_opwekker.forEach(function(o){opwByNaam[o.Asset]=o;});
    var platPer=withData.map(function(wd){
      var u=gebrByNaam[wd.comp.name],o=opwByNaam[wd.comp.name];
      var kosten=u?((u.kosten_gelijktijdigheid_EUR||0)+(u.kosten_epex_tekort_EUR||0)+
                    (u.kosten_onbalans_verbruik_EUR||0)+(u.kosten_platform_EUR||0)+
                    (u.kosten_gvo_bilateraal_EUR||0)+(u.kosten_gvo_rest_EUR||0)):0;
      return {id:wd.comp.id,
        kosten_EUR:kosten,
        opbrengst_EUR:o?(o.netto_opbrengst_EUR||0):0,
        verbruikKwh:u?(u.totaal_verbruik_kWh||0):0,
        opwekKwh:o?(o.totaal_opwek_kWh||0):0};
    });

    var voordelen=EhpVerdeling.voordelen(refLijst,platPer);

    // Het ENERGIEvoordeel van de accu zit al in de kosten per deelnemer (via verwerkInModel) en
    // mag hier niet nogmaals meetellen. Wat er buiten dat pad valt is de accurekening zelf:
    // besparing op transport minus opex, kapitaallast en eventuele eigen aansluitkosten.
    // Draagt het platform die rekening, dan gaat ze de pool in en bepaalt de sleutel wie wat
    // krijgt of bijlegt. Draagt één deelnemer haar, dan komt ze volledig bij die deelnemer —
    // en dan is zichtbaar dat hij alleen investeert terwijl de groep meeprofiteert.
    var accuExtra=0;
    var voordeelById={};
    voordelen.forEach(function(v){voordeelById[v.id]=v;});
    opslagRes.forEach(function(x){
      var r=x.rekening;
      if(!r)return;
      if(r.kostenDrager&&r.kostenDrager!=='platform'&&voordeelById[r.kostenDrager]){
        voordeelById[r.kostenDrager].eigenVoordeel_EUR+=r.teVerdelen_EUR;
        voordeelById[r.kostenDrager].platform_EUR-=r.teVerdelen_EUR;
      }else{
        accuExtra+=r.teVerdelen_EUR;
      }
    });
    verdeling=EhpVerdeling.verdeel(voordelen,{
      sleutel:verdeelSleutel,borg:!!doelDef.borg,extra_EUR:accuExtra
    });
    verdeling.referentie=refLijst;
    verdeling.doelfunctie=cfg.doelfunctie||'groep_borg';
    verdeling.accuExtra_EUR=accuExtra;
    verdeling.accuRekeningen=opslagRes.map(function(x){return x.rekening;}).filter(Boolean);
    verdeling.accuEnergievoordeel_EUR=accuEnergievoordeel;
  }catch(verdErr){console.error('verdeling:',verdErr);}

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
    maxMatchKw:maxMatchKw,peakProdKw:peakProdKw,peakDemKw:peakDemKw,
    skipped:skipped,
    // Prijsmodel en merit order (fase 2)
    prijsmodel:prijsmodelCfg, prijsWaarde:waarde, opslag:opslagRes, ledenNetto:ledenNetto,
    verdeling:verdeling, doelfunctie:cfg.doelfunctie||'groep_borg', verdeelSleutel:verdeelSleutel,
    meritVolgorde:meritVolgorde, meritDrempel:meritDrempel,
    allocator:allocator, epexByTijd:epexByTijd,
    capaciteitsvergoeding_totaal_EUR:result.capaciteitsvergoeding_totaal_EUR||0,
    periodeDagen:result.periodeDagen||0,
    // Netto positie per kwartier (kW; positief = van net). Basis voor de dispatch in fase 2/3.
    ehpNetKw:ehpNetKw,
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
      onb_wind_risico_mwh:cfg.onb_wind_risico_mwh||0,
      retail_opslag_mwh:cfg.retail_opslag_mwh||0
    }
  };

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

  // Energiestromen — sleepbaar, zodat je de blokken kunt schikken tot het beeld klopt
  var flowHtml='<div class="cd ehp-flow"><div class="ct2"><div class="ac" style="background:#5fb3df"></div>Energiestromen — '+_ehpEsc(res.platName)+'</div>'+
    _ehpFlowSvg(res)+
    '<div class="ib2" style="margin-top:6px">Lijndikte evenredig met kWh over de hele periode. Pool = intern verrekend. '+
    'Sleep de blokken om de grafiek overzichtelijker te maken.</div></div>';

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

  document.getElementById('ehpResults').innerHTML=
    '<div class="tabs">'+
      '<button class="tab on" data-ehp-tab="tEhpOv">Overzicht</button>'+
      '<button class="tab" data-ehp-tab="tEhpAn">Analyse</button>'+
      '<button class="tab" data-ehp-tab="tEhpDeel">Deelnemers</button>'+
      '<button class="tab" data-ehp-tab="tEhpGel">Gelijktijdigheid</button>'+
      ((res.opslag&&res.opslag.length)?'<button class="tab" data-ehp-tab="tEhpOps">Opslag</button>':'')+
      (res.verdeling?'<button class="tab" data-ehp-tab="tEhpVerd">Verdeling</button>':'')+
      '<button class="tab" data-ehp-tab="tEhpHerl">Herleidbaarheid</button>'+
    '</div>'+
    '<div id="tEhpOv" class="pn on">'+headline+kpiHtml+_ehpPrijsmodelHtml(res)+_ehpOverzichtHtml(res)+'</div>'+
    '<div id="tEhpAn" class="pn">'+flowHtml+gelEpexHtml+'</div>'+
    '<div id="tEhpDeel" class="pn">'+skipNote+summaryHtml+_ehpFactuurHtml(res)+partyCards+'</div>'+
    '<div id="tEhpGel" class="pn">'+_ehpGelijktijdheidHtml(res)+'</div>'+
    ((res.opslag&&res.opslag.length)?'<div id="tEhpOps" class="pn">'+_ehpOpslagHtml(res)+'</div>':'')+
    (res.verdeling?'<div id="tEhpVerd" class="pn">'+_ehpVerdelingHtml(res)+'</div>':'')+
    '<div id="tEhpHerl" class="pn">'+_ehpHerleidbaarheidHtml(res)+'</div>';

  _ehpAttachFlowDrag();
  _ehpAttachTabs();

  // Analyse-tab rendert in een verborgen panel — resize gebeurt bij tab-switch.
  _ehpGelEpexMonth='all';
  _ehpRenderGelEpexChart();

  _ehpBindInspector();
  if(res.opslag&&res.opslag.length){
    _ehpTekenSocKrommes(res);
    var sweepBtn=document.getElementById('btnEhpSweep');
    if(sweepBtn)sweepBtn.addEventListener('click',ehpBerekenSweep);
    var gastBtn=document.getElementById('btnEhpGastheren');
    if(gastBtn)gastBtn.addEventListener('click',ehpVergelijkGastheren);
  }
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
      ['ehpGelEpex','ehpSoc0','ehpSoc1','ehpSoc2'].forEach(function(k){
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
    },
    accu: _ehpAccuStromen(res)
  };
  // De accu krijgt alleen een blok als hij daadwerkelijk energie verzet.
  if(_ehpFlowState.accu){
    _ehpFlowState.nodes.accu={x:340,y:225,w:130,h:60,lbl:'Opslag',
      kwh:_ehpFlowState.accu.in,col:'#c0793c'};
  }
  return '<svg id="ehpFlowSvg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet">'+_ehpFlowContent()+'</svg>';
}

// Wat de accu in totaal verzet, uitgesplitst naar herkomst en bestemming. Null als er geen
// accu is, zodat het diagram er dan uitziet als voorheen.
function _ehpAccuStromen(res){
  var lijst=res.opslag||[];
  if(!lijst.length)return null;
  var t={uitOverschot:0,vanNet:0,naarTekort:0,naarNet:0};
  lijst.forEach(function(o){
    var d=o.dispatch;if(!d)return;
    t.uitOverschot+=d.inUitOverschot_kWh||0;
    t.vanNet      +=d.inVanNet_kWh||0;
    t.naarTekort  +=d.uitNaarTekort_kWh||0;
    t.naarNet     +=d.uitNaarNet_kWh||0;
  });
  t.in=t.uitOverschot+t.vanNet;
  t.uit=t.naarTekort+t.naarNet;
  return t.in>0||t.uit>0?t:null;
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
  var acc=s.accu;
  // Het overschot per bron gaat deels de accu in en deels naar het net. Naar rato verdelen:
  // welke elektron waarheen ging is niet bekend, de verhouding wel.
  var bronOverschot=srcs.reduce(function(t,k){
    return t+Math.max(0,(res.prodBySrc[k]||0)-(res.matchedBySrc[k]||0));
  },0);
  var naarAccuFractie=(acc&&bronOverschot>0)?Math.min(1,acc.uitOverschot/bronOverschot):0;

  srcs.forEach(function(k){
    var p=res.prodBySrc[k]||0,m=res.matchedBySrc[k]||0,sp=Math.max(0,p-m);
    edges+=edge(nodes[k],nodes.pool,m,nodes[k].col);
    if(acc&&nodes.accu){
      edges+=edge(nodes[k],nodes.accu,sp*naarAccuFractie,nodes[k].col);
      edges+=edge(nodes[k],nodes.netOut,sp*(1-naarAccuFractie),nodes[k].col);
    }else{
      edges+=edge(nodes[k],nodes.netOut,sp,nodes[k].col);
    }
  });
  edges+=edge(nodes.pool,nodes.cons,res.totMatchedKwh,'#5fb3df');
  if(acc&&nodes.accu){
    // Netinkoop splitsen: een deel laadt de accu, de rest gaat naar de deelnemers.
    edges+=edge(nodes.netIn,nodes.accu,acc.vanNet,'#999');
    edges+=edge(nodes.netIn,nodes.cons,Math.max(0,res.totGridImpKwh-acc.vanNet),'#999');
    edges+=edge(nodes.accu,nodes.cons,acc.naarTekort,'#c0793c');
    edges+=edge(nodes.accu,nodes.netOut,acc.naarNet,'#c0793c');
  }else{
    edges+=edge(nodes.netIn,nodes.cons,res.totGridImpKwh,'#999');
  }
  return edges+rect('zon',nodes.zon)+rect('wind',nodes.wind)+rect('overig',nodes.overig)+
    rect('netIn',nodes.netIn)+rect('pool',nodes.pool)+rect('cons',nodes.cons)+rect('netOut',nodes.netOut)+
    (nodes.accu?rect('accu',nodes.accu):'');
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

  function buildWaardeBlok(s){
    var pw=EnergieModel.platformWaarde(s);
    if(!pw)return '';
    return '<div style="margin:14px 14px 0">'+
      '<div class="kg">'+
        '<div class="kb'+(pw.invoederVoordeel_EUR<0?' red':'')+'"><div class="kl">Invoeders t.o.v. EPEX-only</div><div class="kv">'+_eMoney(pw.invoederVoordeel_EUR)+'</div><div class="ku">gelijktijdigheidstarief vs. spotverkoop, op gematcht volume</div></div>'+
        '<div class="kb'+(pw.afnemerVoordeel_EUR<0?' red':'')+'"><div class="kl">Afnemers t.o.v. retailbenchmark</div><div class="kv">'+_eMoney(pw.afnemerVoordeel_EUR)+'</div><div class="ku">gelijktijdigheidstarief vs. EPEX + retailopslag, op gematcht volume</div></div>'+
      '</div>'+
      '<div class="ib2">Positief = beter af dan het genoemde alternatief. Een negatief getal is een legitieme uitkomst, geen fout — het tarief helt op dit moment richting de andere partij.</div>'+
    '</div>';
  }

  function buildBlok(s,label){
    if(!s)return '';
    return '<div class="ehp-ov-blok">'+
      '<div class="ehp-ov-blok-hdr">'+label+'</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:10px 14px 0">'+
        '<div class="ehp-ov-col--afn"><div class="ehp-ov-side-hdr ehp-ov-side-afn">Afnemers — hele gemeenschap</div>'+buildAfnemersTbl(s)+'</div>'+
        '<div class="ehp-ov-col--prod"><div class="ehp-ov-side-hdr ehp-ov-side-prod">Producenten — hele gemeenschap</div>'+buildProducersTbl(s)+'</div>'+
      '</div>'+
      buildWaardeBlok(s)+
      '</div>';
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

var PAGE_MAP={home:'pageHome',gto:'pageGto',ehp:'pageEhp',ind:'pageInd'};
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
      if(tool==='ind'){try{renderInd();}catch(e){console.error('renderInd:',e);}}
    });
  });
  document.getElementById('btnAddEhp').addEventListener('click',addEhp);
  ['ehpDoelfunctie','ehpVerdeelSleutel'].forEach(function(id){
    var el=document.getElementById(id);
    if(el)el.addEventListener('change',_ehpDoelUitleg);
  });
  var accuAdd=document.getElementById('btnEhpAccuAdd');
  if(accuAdd)accuAdd.addEventListener('click',ehpAccuToevoegen);
  var accuLijst=document.getElementById('ehpAccuLijst');
  if(accuLijst)accuLijst.addEventListener('click',function(ev){
    var del=ev.target.closest('[data-acc-del]');
    if(del)ehpAccuVerwijderen(parseInt(del.getAttribute('data-acc-del'),10));
  });
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


// --- Regressiecheck tegen het overgenomen model ------------------------------
// Draai in de console: ehpRegressie()
// Met prijsvorm 'vast', merit order op prioriteit en geen drempel moet het nieuwe pad
// kolom voor kolom identiek zijn aan EnergieModel zonder allocator. Elk verschil is een bug.
function ehpRegressie(){
  if(!window._ehpLaatsteInvoer){console.warn('Reken eerst een handelsplatform door.');return null;}
  var r=EhpDispatch.vergelijkMetReferentie(window._ehpLaatsteInvoer,
          EhpDispatch.maakAllocator({volgorde:'prioriteit',drempel:'geen'}));
  console.group('EHP regressie — nieuwe dispatch vs. overgenomen model');
  console.log(r.gelijk?'✓ identiek — geen kolomverschillen':'✗ '+r.aantalVerschillen+' verschil(len)');
  console.table(Object.keys(r.totalen).map(function(k){
    return {kolom:k,referentie:r.totalen[k].referentie,nieuw:r.totalen[k].nieuw,delta:r.totalen[k].delta};
  }));
  if(!r.gelijk)console.table(r.verschillen);
  console.groupEnd();
  return r;
}

// --- Prijsmodel-UI (zijbalk) -------------------------------------------------
// De velden per bron volgen uit EhpPrijs.VORMEN, zodat een nieuwe prijsvorm alleen daar
// hoeft te worden toegevoegd en hier vanzelf verschijnt.

var EHP_PM_BRONNEN=[['zon','Zon'],['wind','Wind'],['afname_invoeden','Afname-invoeden']];

function _ehpRepresentatiefTarief(c){
  if(!c)return 0;
  if(c.vorm==='vast')return +c.tarief_mwh||0;
  if(c.vorm==='collar')return +c.vloer_mwh||0;
  return 0;
}

function _ehpRenderPrijsmodel(cfg){
  var el=document.getElementById('ehpPrijsmodel');
  if(!el||typeof EhpPrijs==='undefined')return;
  var pm=EhpPrijs.migreer(cfg||{});
  el.innerHTML=EHP_PM_BRONNEN.map(function(b){
    var key=b[0],lbl=b[1],c=pm[key]||{vorm:'vast'};
    var vorm=EhpPrijs.VORMEN[c.vorm]?c.vorm:'vast';
    var def=EhpPrijs.VORMEN[vorm];
    var opts=Object.keys(EhpPrijs.VORMEN).map(function(v){
      return '<option value="'+v+'"'+(vorm===v?' selected':'')+'>'+EhpPrijs.VORMEN[v].label+'</option>';
    }).join('');
    var velden=def.velden.map(function(fd){
      var w=c[fd.key]!=null?c[fd.key]:fd.def;
      return '<div class="fgr"><label style="padding-left:8px;font-size:11px">'+fd.label+' ('+fd.eenheid+')</label>'+
        '<input type="number" step="0.01" data-pm-bron="'+key+'" data-pm-veld="'+fd.key+'" value="'+w+'"></div>';
    }).join('');
    return '<div style="margin-bottom:9px;padding-bottom:7px;border-bottom:1px solid #eee">'+
      '<div class="fgr"><label style="font-weight:700">'+lbl+'</label>'+
      '<select data-pm-vorm="'+key+'" onchange="_ehpPrijsVormGewijzigd(this)">'+opts+'</select></div>'+
      velden+
      '<div class="ib2" style="font-size:10px;margin-left:8px">'+def.uitleg+'</div></div>';
  }).join('');
}

/** Leest de zijbalk terug naar een prijsmodel-configuratie. */
function _ehpLeesPrijsmodel(){
  var pm={};
  document.querySelectorAll('#ehpPrijsmodel [data-pm-vorm]').forEach(function(sel){
    pm[sel.getAttribute('data-pm-vorm')]={vorm:sel.value};
  });
  document.querySelectorAll('#ehpPrijsmodel [data-pm-veld]').forEach(function(inp){
    var b=inp.getAttribute('data-pm-bron'),k=inp.getAttribute('data-pm-veld');
    if(!pm[b])pm[b]={vorm:'vast'};
    var v=parseFloat(inp.value);
    pm[b][k]=isNaN(v)?0:v;
  });
  if(!pm.zon)pm.zon={vorm:'vast',tarief_mwh:0};
  if(!pm.wind)pm.wind={vorm:'vast',tarief_mwh:0};
  if(!pm.afname_invoeden)pm.afname_invoeden={vorm:'vast',tarief_mwh:0};
  pm.opslag={vorm:'vast',tarief_mwh:0};
  return pm;
}

/** Vorm gewijzigd: huidige waarden bewaren, nieuwe vorm op zijn defaults zetten, hertekenen. */
function _ehpPrijsVormGewijzigd(sel){
  var plat=_ehpActive();
  if(!plat)return;
  var bron=sel.getAttribute('data-pm-vorm');
  var pm=_ehpLeesPrijsmodel();
  var nieuw={vorm:sel.value};
  (EhpPrijs.VORMEN[sel.value]||EhpPrijs.VORMEN.vast).velden.forEach(function(fd){nieuw[fd.key]=fd.def;});
  pm[bron]=nieuw;
  plat.cfg=plat.cfg||{};
  plat.cfg.prijsmodel=pm;
  _ehpRenderPrijsmodel(plat.cfg);
}

// --- Prijsmodel-uitkomst (Overzicht-tab) -------------------------------------
// Beantwoordt de kernvraag: betalen de afnemers met dit prijsmodel netto meer of minder dan
// hun marktalternatief? Per kwartier wisselt dat; wat telt is de som over de periode.
function _ehpPrijsmodelHtml(res){
  var w=res.prijsWaarde;
  if(!w||!w.kWh)return '';
  var pm=res.prijsmodel||{};
  var ct=function(x){return _e2(x*100)+' ct';};

  var bronRegels=EHP_PM_BRONNEN.map(function(b){
    var c=pm[b[0]]; if(!c)return '';
    var def=(typeof EhpPrijs!=='undefined'&&EhpPrijs.VORMEN[c.vorm])||null;
    if(!def)return '';
    var params=def.velden.map(function(fd){
      var v=c[fd.key]!=null?c[fd.key]:fd.def;
      return fd.label+' '+v+' '+fd.eenheid;
    }).join(' · ');
    return '<tr><td style="font-weight:700">'+b[1]+'</td><td>'+_ehpEsc(def.label)+'</td>'+
      '<td style="font-size:12px;color:#666">'+_ehpEsc(params)+'</td></tr>';
  }).filter(Boolean).join('');

  var volgLbl=res.meritVolgorde==='prijs'?'prijs — goedkoopste eerst':'prioriteitsvolgorde (referentie)';
  var dremLbl=res.meritDrempel==='afnemer'
    ?'aan — bronnen boven het netalternatief van de afnemer worden niet intern verrekend'
    :'uit — alle beschikbare opwek wordt intern verrekend';

  // Positief nettoVsMarkt = afnemers betalen samen meer dan de kale spotprijs.
  var duurderDanMarkt=w.nettoVsMarkt>0;
  var beterDanRetail=w.nettoVsRetail>0;
  var cap=res.capaciteitsvergoeding_totaal_EUR||0;

  var tegels=
    '<div class="kb"><div class="kl">Gem. platformprijs</div><div class="kv" style="font-size:16px">'+ct(w.gemPlatformPerKwh)+'</div><div class="ku">over '+fmt(w.kWh/1000)+' MWh gematcht</div></div>'+
    '<div class="kb"><div class="kl">Gem. marktprijs</div><div class="kv" style="font-size:16px">'+ct(w.gemMarktPerKwh)+'</div><div class="ku">EPEX in dezelfde kwartieren</div></div>'+
    '<div class="kb'+(duurderDanMarkt?' red':'')+'"><div class="kl">Netto t.o.v. markt</div><div class="kv" style="font-size:16px">'+_eMoney(-w.nettoVsMarkt)+'</div><div class="ku">'+(duurderDanMarkt?'afnemers betalen meer dan spot':'afnemers betalen minder dan spot')+'</div></div>'+
    '<div class="kb'+(beterDanRetail?'':' red')+'"><div class="kl">Netto t.o.v. retail</div><div class="kv" style="font-size:16px">'+_eMoney(w.nettoVsRetail)+'</div><div class="ku">t.o.v. EPEX + retailopslag</div></div>'+
    '<div class="kb"><div class="kl">Kwartieren boven markt</div><div class="kv" style="font-size:16px">'+w.kwartierenBoveMarkt+'</div><div class="ku">max. +'+ct(w.maxBovenMarktPerKwh)+'/kWh</div></div>'+
    '<div class="kb"><div class="kl">Kwartieren onder markt</div><div class="kv" style="font-size:16px">'+w.kwartierenOnderMarkt+'</div><div class="ku">max. −'+ct(w.maxOnderMarktPerKwh)+'/kWh</div></div>'+
    (cap>0?'<div class="kb"><div class="kl">Capaciteitsvergoeding</div><div class="kv" style="font-size:16px">€ '+_e2(cap)+'</div><div class="ku">buiten de kWh-prijs om, '+Math.round(res.periodeDagen||0)+' dagen</div></div>':'');

  return '<div class="cd">'+
    '<div class="ct2"><div class="ac" style="background:#8e44ad"></div>Prijsmodel — '+_ehpEsc(res.platName)+'</div>'+
    '<div style="overflow-x:auto;margin-bottom:10px"><table class="verg-tbl"><thead><tr>'+
    '<th>Bron</th><th>Vorm</th><th>Parameters</th></tr></thead><tbody>'+bronRegels+'</tbody></table></div>'+
    '<div class="ib2" style="margin-bottom:8px">Merit order: '+volgLbl+'. Drempel: '+dremLbl+'.</div>'+
    '<div class="kg">'+tegels+'</div>'+
    '<div class="ib2" style="margin-top:8px">Per kwartier is de vergelijking met de markt soms positief en soms negatief — '+
    'een tarief boven de spotprijs op een zonnige middag hoort bij het model, niet bij een fout. Wat telt is de som over de '+
    'periode: <strong>netto t.o.v. markt</strong> is wat de afnemers samen meer of minder betalen dan de kale spotprijs, '+
    '<strong>netto t.o.v. retail</strong> hetzelfde tegenover hun werkelijke alternatief bij een leverancier. Die tweede is '+
    'de eerlijke vergelijking, want zonder platform kopen ze niet op de spotmarkt in.</div>'+
  '</div>';
}

// --- Netprofiel van één aansluiting, uitgelijnd op de modeltijdlijn -----------
// Retourneert null voor de gedeelde aansluiting en voor een accu met een eigen aansluiting:
// in die gevallen bepaalt niet één deelnemer de fiscale en vermogenspositie.
function _ehpGastheerProfiel(model,ledenNetto,eigenaar){
  if(!eigenaar||eigenaar==='groep'||eigenaar==='platform')return null;
  var rec=ledenNetto&&ledenNetto[eigenaar];
  if(!rec)return null;
  var a=new Float64Array(model.length);
  for(var i=0;i<model.length;i++)a[i]=rec.map[model[i].tijdKey]||0;
  return a;
}

// --- Toelichting bij de gekozen doelfunctie ----------------------------------
function _ehpDoelUitleg(){
  var el=document.getElementById('ehpDoelUitleg');
  if(!el||typeof EhpVerdeling==='undefined')return;
  var df=document.getElementById('ehpDoelfunctie');
  var vs=document.getElementById('ehpVerdeelSleutel');
  var d=EhpVerdeling.DOELFUNCTIES[df?df.value:'groep_borg']||EhpVerdeling.DOELFUNCTIES.groep_borg;
  var sleutel=(vs&&vs.value)||d.sleutel;
  var sd=EhpVerdeling.SLEUTELS[sleutel]||{};
  el.innerHTML=_ehpEsc(d.uitleg)+' <strong>Sleutel:</strong> '+_ehpEsc(sd.label||sleutel)+' — '+_ehpEsc(sd.uitleg||'');
}

// --- Verdeling van het resultaat (Verdeling-tab) -----------------------------
// De vraag waar een verrekenmethodiek op staat of valt: is iedereen beter af? Een positief
// groepstotaal zegt daar niets over — het kan een optelsom zijn van grote winnaars en kleine
// verliezers, en dan valt er geen platform te bouwen.
function _ehpVerdelingHtml(res){
  var v=res.verdeling;
  if(!v)return '';
  var eur=function(x){return '€ '+_e2(x);};
  var dd=EhpVerdeling.DOELFUNCTIES[v.doelfunctie]||{};
  var poolt=v.sleutel!=='geen';

  var rijen=v.rijen.map(function(r){
    var slechter=r.resultaat_EUR<-1e-6;
    return '<tr'+(slechter?' style="background:#fdecea"':'')+'>'+
      '<td style="font-weight:700">'+_ehpEsc(r.naam)+'</td>'+
      '<td>'+eur(r.referentie_EUR)+'</td>'+
      '<td>'+eur(r.platform_EUR)+'</td>'+
      '<td'+(r.eigenVoordeel_EUR<0?' style="color:#c0392b"':'')+'>'+_eMoney(r.eigenVoordeel_EUR)+'</td>'+
      '<td>'+(poolt?eur(r.toekenning_EUR):'—')+'</td>'+
      '<td>'+((r.aanvulling_EUR||r.bijdrage_EUR)?_eMoney(r.aanvulling_EUR+r.bijdrage_EUR):'—')+'</td>'+
      '<td'+(slechter?' style="color:#c0392b;font-weight:700"':' style="font-weight:700"')+'>'+
        _eMoney(r.resultaat_EUR)+'</td></tr>';
  }).join('');

  var oordeel = !v.borgHaalbaar
    ? '<div class="opt-warn">De randvoorwaarde “niemand slechter af” is niet haalbaar: er is '+
      eur(v.borgTekort_EUR)+' te weinig waarde om alle tekorten aan te vullen. Het platform levert in '+
      'deze opzet per saldo te weinig op om iedereen mee te krijgen.</div>'
    : v.iedereenBeterAf
    ? '<div class="ib2" style="background:#eef7ea;padding:7px;border-radius:6px">Iedere deelnemer komt '+
      'na verdeling op of boven zijn eigen referentie uit.</div>'
    : '<div class="opt-warn">'+v.slechterAf.length+' deelnemer'+(v.slechterAf.length!==1?'s':'')+
      ' komt na verdeling onder de eigen referentie uit: '+
      v.slechterAf.map(function(x){return _ehpEsc(x.naam)+' ('+eur(x.bedrag_EUR)+')';}).join(', ')+
      '. Kies de doelfunctie met borg, of een andere sleutel.</div>';

  var kpis=
    '<div class="kb'+(v.totaalSurplus_EUR<0?' red':'')+'"><div class="kl">Totaal resultaat</div>'+
      '<div class="kv" style="font-size:16px">'+_eMoney(v.totaalSurplus_EUR)+'</div>'+
      '<div class="ku">alle deelnemers samen t.o.v. hun eigen contract</div></div>'+
    '<div class="kb"><div class="kl">Verdeelsleutel</div><div class="kv" style="font-size:15px">'+
      _ehpEsc(v.sleutelLabel)+'</div><div class="ku">'+(v.borg?'met borg':'zonder borg')+'</div></div>'+
    (v.accuExtra_EUR?'<div class="kb"><div class="kl">Waarvan uit opslag</div>'+
      '<div class="kv" style="font-size:16px">'+_eMoney(v.accuExtra_EUR)+'</div>'+
      '<div class="ku">niet aan één deelnemer toe te rekenen</div></div>':'')+
    '<div class="kb'+(v.sluitend?'':' red')+'"><div class="kl">Sluitend</div>'+
      '<div class="kv" style="font-size:16px">'+(v.sluitend?'ja':'nee')+'</div>'+
      '<div class="ku">verdeeld '+eur(v.verdeeld_EUR)+'</div></div>';

  return _ehpAccuRekeningHtml(v)+
    '<div class="cd">'+
    '<div class="ct2"><div class="ac" style="background:#46962b"></div>Verdeling — '+_ehpEsc(dd.label||v.doelfunctie)+'</div>'+
    oordeel+
    '<div class="kg" style="margin-top:8px">'+kpis+'</div>'+
    '<div style="overflow-x:auto;margin-top:10px"><table class="verg-tbl"><thead><tr>'+
      '<th>Deelnemer</th><th>Zonder platform</th><th>Met platform</th><th>Eigen resultaat</th>'+
      '<th>Toekenning</th><th>Borgcorrectie</th><th>Eindresultaat</th>'+
      '</tr></thead><tbody>'+rijen+'</tbody></table></div>'+
    '<div class="ib2" style="margin-top:8px"><strong>Zonder platform</strong> is de energie-inkoop op het '+
      'eigen contract van de aansluiting, doorgerekend op dezelfde kwartierdata. <strong>Met platform</strong> '+
      'is wat de deelnemer in de verrekening betaalt of ontvangt. Beide zijn exclusief energiebelasting en btw: '+
      'die lopen bij een platform via een eigen route en zouden een verschil tonen dat niet uit de verrekening komt.'+
      (poolt?' Bij deze sleutel wordt alles gepoold en opnieuw toebedeeld — het eigen resultaat vervalt dan als '+
      'aparte grootheid, en dat is precies wat poolen betekent.':'')+'</div>'+
    '</div>';
}



// --- Platformpositie van de groep --------------------------------------------
// Som van wat alle deelnemers in de verrekening betalen minus wat de producenten ontvangen.
// Het verschil vóór en ná het inrekenen van de accu is haar energievoordeel voor de groep.
function _ehpPlatformPositie(result){
  var kosten=(result.per_gebruiker||[]).reduce(function(t,u){
    return t+(u.kosten_gelijktijdigheid_EUR||0)+(u.kosten_epex_tekort_EUR||0)+
             (u.kosten_onbalans_verbruik_EUR||0)+(u.kosten_platform_EUR||0)+
             (u.kosten_gvo_bilateraal_EUR||0)+(u.kosten_gvo_rest_EUR||0);
  },0);
  var opbrengst=(result.per_opwekker||[]).reduce(function(t,o){
    return t+(o.netto_opbrengst_EUR||0);
  },0);
  return kosten-opbrengst;
}

// --- De rekening van de accu (Verdeling-tab) ---------------------------------
// Kosten en opbrengsten van de opslag op één plek, met daarbij wélk deel al bij de deelnemers
// is geland en welk deel nog verdeeld moet worden. Zonder dat onderscheid lijkt het alsof het
// energievoordeel twee keer meetelt.
function _ehpAccuRekeningHtml(v){
  var lijst=(v&&v.accuRekeningen)||[];
  if(!lijst.length)return '';
  var eur=function(x){return '€ '+_e2(x);};
  var post=function(lbl,bedrag,toelichting,dik){
    return '<tr'+(dik?' style="font-weight:700;border-top:2px solid #ddd"':'')+'>'+
      '<td>'+lbl+'</td>'+
      '<td'+(bedrag<0?' style="color:#c0392b"':'')+'>'+_eMoney(bedrag)+'</td>'+
      '<td style="font-size:12px;color:#666">'+toelichting+'</td></tr>';
  };
  var blokken=lijst.map(function(r){
    var drager=r.kostenDrager==='platform'?'het platform (gedeeld)':_ehpEsc(r.kostenDragerNaam||r.kostenDrager);
    return '<div style="margin-bottom:12px">'+
      '<div class="st">'+_ehpEsc(r.naam)+' — rekening voor '+drager+'</div>'+
      '<table class="verg-tbl"><thead><tr><th>Post</th><th>Bedrag</th><th>Toelichting</th></tr></thead><tbody>'+
      post('Energievoordeel voor de groep',r.energievoordeel_EUR,
        'al verwerkt in de kosten per deelnemer, naar rato van verbruik — telt hieronder niet nogmaals mee')+
      post('Besparing transporttarief',r.piekwaarde_EUR,'lagere maandpiek en gecontracteerd vermogen')+
      post('Opex',-r.opex_EUR,'onderhoud en beheer')+
      post('Kapitaallast',-r.kapitaallast_EUR,'annuïteit over de investering')+
      (r.eigenAansluiting_EUR?post('Eigen aansluiting',-r.eigenAansluiting_EUR,'gecontracteerd vermogen van de accu zelf'):'')+
      post('Te verdelen',r.teVerdelen_EUR,
        r.kostenDrager==='platform'?'gaat de pool in en volgt de verdeelsleutel':'komt volledig bij '+drager,true)+
      post('Totaal resultaat accu',r.totaalResultaat_EUR,'energievoordeel plus het te verdelen deel',true)+
      '</tbody></table></div>';
  }).join('');
  return '<div class="cd">'+
    '<div class="ct2"><div class="ac" style="background:#c0793c"></div>Rekening van de opslag</div>'+
    '<div class="ib2" style="margin-bottom:8px">Over de doorgerekende periode, niet per jaar — de '+
    'referentie en de platformkosten hiernaast gaan ook over die periode. Het <strong>energievoordeel</strong> '+
    'is al bij de deelnemers geland doordat hun tekort daalde; dat gebeurt naar rato van verbruik, ongeacht '+
    'de gekozen verdeelsleutel. Alleen het deel <strong>te verdelen</strong> loopt via de sleutel.</div>'+
    blokken+'</div>';
}