// Energiehandelsplatform (EHP) — losstaande financiële module.
// Hergebruikt projectstructuur, aansluitingen en IndexedDB-tijdreeksen van de GTO-tool.

var _ehpActiveId=null;   // actief platform binnen het huidige project
var _ehpLast=null;       // laatst berekende resultaat (voor CSV-download)
var _ehpJrLast=null;     // laatst berekende jaarrekening resultaat

function _ehpDefaults(){
  return {pZon:0.08,pWind:0.06,pOverig:0.07,pDyn:0.10,pNetTerug:0.04,pNetAfname:0.12,fee:0.00,
    feeMode:'kwh',ebOn:false,ebJaar:'2025',ebGrondslag:'bruto',heffingskorting:0,btwOn:false,btwPct:21,
    jrPrijs:0.10,jrLevOpslag:0.02,jrTerugAfslag:0.01,jrOnbalans:0.00,
    jrPriceUnit:'kwh',jrVerdeel:'geen'};
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
  document.getElementById('ehpPZon').value=c.pZon;
  document.getElementById('ehpPWind').value=c.pWind;
  document.getElementById('ehpPOverig').value=c.pOverig;
  document.getElementById('ehpFee').value=c.fee;
  var feeModeEl=document.getElementById('ehpFeeMode');
  if(feeModeEl)feeModeEl.value=c.feeMode||'kwh';
  document.getElementById('ehpPNetAfname').value=c.pNetAfname;
  document.getElementById('ehpPNetTerug').value=c.pNetTerug;
  document.getElementById('ehpPDyn').value=c.pDyn;
  var chkEl=function(id,v){var el=document.getElementById(id);if(el)el.checked=!!v;};
  chkEl('ehpEbOn',c.ebOn);
  var ebJaarEl=document.getElementById('ehpEbJaar');if(ebJaarEl)ebJaarEl.value=c.ebJaar||'2025';
  var ebGrEl=document.getElementById('ehpEbGrondslag');if(ebGrEl)ebGrEl.value=c.ebGrondslag||'bruto';
  var heffEl=document.getElementById('ehpHeffing');if(heffEl)heffEl.value=c.heffingskorting||0;
  chkEl('ehpBtwOn',c.btwOn);
  var btwPctEl=document.getElementById('ehpBtwPct');if(btwPctEl)btwPctEl.value=c.btwPct||21;
  var sv=function(id,v){var el=document.getElementById(id);if(el)el.value=v;};
  sv('jrPrijs',c.jrPrijs!=null?c.jrPrijs:0.10);
  sv('jrLevOpslag',c.jrLevOpslag!=null?c.jrLevOpslag:0.02);
  sv('jrTerugAfslag',c.jrTerugAfslag!=null?c.jrTerugAfslag:0.01);
  sv('jrOnbalans',c.jrOnbalans!=null?c.jrOnbalans:0.00);
  sv('jrPriceUnit',c.jrPriceUnit||'kwh');
  sv('jrVerdeel',c.jrVerdeel||'geen');
  _jrUpdatePriceInfo();
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
  var sel={};
  (plat.members||[]).forEach(function(m){sel[m.cid]=m.source||'overig';});
  box.innerHTML=comps.map(function(c,i){
    var checked=sel.hasOwnProperty(c.id);
    var src=sel[c.id]||'overig';
    var col=(typeof PAL!=='undefined'&&PAL[i%PAL.length])||'#888';
    function opt(v,lbl){return '<option value="'+v+'"'+(src===v?' selected':'')+'>'+lbl+'</option>';}
    return '<label class="scen-con-lbl" style="justify-content:space-between">'+
      '<span style="display:flex;align-items:center;gap:7px;min-width:0;flex:1">'+
      '<input type="checkbox" class="ehp-mck" data-cid="'+c.id+'"'+(checked?' checked':'')+'>'+
      '<span class="scen-con-dot" style="background:'+col+'"></span>'+
      '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+_ehpEsc(c.name||'Aansluiting')+'</span></span>'+
      '<select class="ehp-msrc" data-cid="'+c.id+'" style="font-size:10px;padding:2px 4px;border:1px solid #dce6e0;border-radius:4px;background:#fff">'+
      opt('zon','Zon')+opt('wind','Wind')+opt('overig','Overig')+opt('none','Geen opwek')+'</select></label>';
  }).join('');
}

function _ehpEsc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}

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
      members.push({cid:cid,source:s?s.value:'overig'});
    }
  });
  plat.members=members;
  var num=function(id,d){var v=parseFloat(document.getElementById(id).value);return isNaN(v)?d:v;};
  var val=function(id){var el=document.getElementById(id);return el?el.value:'';};
  var chk=function(id){var el=document.getElementById(id);return el?el.checked:false;};
  var feeModeEl=document.getElementById('ehpFeeMode');
  plat.cfg={
    pZon:num('ehpPZon',0.08),pWind:num('ehpPWind',0.06),pOverig:num('ehpPOverig',0.07),
    pDyn:num('ehpPDyn',0.10),pNetTerug:num('ehpPNetTerug',0.04),pNetAfname:num('ehpPNetAfname',0.12),
    fee:num('ehpFee',0.00),feeMode:feeModeEl?feeModeEl.value:'kwh',
    ebOn:chk('ehpEbOn'),ebJaar:val('ehpEbJaar'),ebGrondslag:val('ehpEbGrondslag'),
    heffingskorting:num('ehpHeffing',0),btwOn:chk('ehpBtwOn'),btwPct:num('ehpBtwPct',21),
    jrPrijs:num('jrPrijs',0.10),jrLevOpslag:num('jrLevOpslag',0.02),
    jrTerugAfslag:num('jrTerugAfslag',0.01),jrOnbalans:num('jrOnbalans',0.00),
    jrPriceUnit:val('jrPriceUnit')||'kwh',jrVerdeel:val('jrVerdeel')||'geen'
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

async function calcEHP(){
  var p=_ehpProj();var plat=_ehpActive();
  if(!plat){notify('Selecteer eerst een platform',false);return;}
  _ehpJrLast=null;
  _ehpCommit();
  var members=plat.members||[];
  if(!members.length){notify('Selecteer minimaal één deelnemer',false);return;}
  var cfg=plat.cfg;

  var withData=[],skipped=[];
  for(var i=0;i<members.length;i++){
    var comp=null;
    for(var j=0;j<p.companies.length;j++){if(p.companies[j].id===members[i].cid){comp=p.companies[j];break;}}
    if(!comp){continue;}
    var d=await dbGet('ts',comp.id)||[];
    if(!d.length){skipped.push(comp.name);continue;}
    withData.push({
      id:comp.id,name:comp.name,source:members[i].source||'overig',data:d,
      // Eigen GTO-tarief als baseline (zelfde fallbacks als charts/kosten.js)
      priceA:(typeof comp.priceA==='number'?comp.priceA:0.12),
      priceT:(typeof comp.priceT==='number'?comp.priceT:0.08)
    });
  }
  if(!withData.length){notify('Geen deelnemer met gemeten data',false);return;}

  var tsSets=withData.map(function(c){var s={};c.data.forEach(function(d){s[d.ts]=1;});return s;});
  var allTs=Object.keys(tsSets[0]).filter(function(ts){return tsSets.every(function(s){return s[ts];});}).sort();
  if(!allTs.length){notify('Geen overlappende kwartierwaarden tussen deelnemers',false);return;}
  var perKw=withData.map(function(c){var m={};c.data.forEach(function(d){m[d.ts]=d.kw;});return allTs.map(function(ts){return m[ts];});});

  var priceOf=function(src){return src==='zon'?cfg.pZon:src==='wind'?cfg.pWind:cfg.pOverig;};
  var n=withData.length;
  var R=withData.map(function(c){return{id:c.id,name:c.name,source:c.source,
    priceA:c.priceA,priceT:c.priceT,
    prodKwh:0,consKwh:0,intSoldKwh:0,intBoughtKwh:0,gridExpKwh:0,gridImpKwh:0,
    eurInt:0,eurGrid:0};});
  var totProdKwh=0,totConsKwh=0,totMatchedKwh=0,platformFee=0;
  var prodBySrcTot={zon:0,wind:0,overig:0};
  var matchedBySrcTot={zon:0,wind:0,overig:0};
  // Gelijktijdigheid
  var nProdOnly=0,nDemOnly=0,nBoth=0,nNone=0;
  var maxMatchKw=0,peakProdKw=0,peakDemKw=0;

  for(var t=0;t<allTs.length;t++){
    var prod=[],dem=[],prodBySrc={zon:0,wind:0,overig:0},totProd=0,totDem=0;
    for(var m=0;m<n;m++){
      var raw=perKw[m][t]*0.25;
      var src=withData[m].source;
      // Bij "Geen opwek" telt enkel positieve kW (toevallige negatieve waarden negeren)
      var kwh=(src==='none'&&raw<0)?0:raw;
      if(kwh<0){var pk=-kwh;prod[m]=pk;dem[m]=0;totProd+=pk;prodBySrc[src]+=pk;R[m].prodKwh+=pk;}
      else if(kwh>0){prod[m]=0;dem[m]=kwh;totDem+=kwh;R[m].consKwh+=kwh;}
      else{prod[m]=0;dem[m]=0;}
    }
    totProdKwh+=totProd;totConsKwh+=totDem;
    prodBySrcTot.zon+=prodBySrc.zon;prodBySrcTot.wind+=prodBySrc.wind;prodBySrcTot.overig+=prodBySrc.overig;
    if(totProd>peakProdKw*0.25)peakProdKw=totProd/0.25;
    if(totDem>peakDemKw*0.25)peakDemKw=totDem/0.25;

    var matched=Math.min(totProd,totDem);
    totMatchedKwh+=matched;
    if(matched/0.25>maxMatchKw)maxMatchKw=matched/0.25;
    if(totProd>0&&totDem>0)nBoth++;
    else if(totProd>0)nProdOnly++;
    else if(totDem>0)nDemOnly++;
    else nNone++;

    if(matched<=0){
      for(var a=0;a<n;a++){
        if(prod[a]>0){R[a].gridExpKwh+=prod[a];R[a].eurGrid+=prod[a]*cfg.pNetTerug;}
        else if(dem[a]>0){R[a].gridImpKwh+=dem[a];R[a].eurGrid-=dem[a]*cfg.pNetAfname;}
      }
      continue;
    }
    var f=matched/totProd;
    matchedBySrcTot.zon+=prodBySrc.zon*f;
    matchedBySrcTot.wind+=prodBySrc.wind*f;
    matchedBySrcTot.overig+=prodBySrc.overig*f;
    var blended=(prodBySrc.zon*cfg.pZon+prodBySrc.wind*cfg.pWind+prodBySrc.overig*cfg.pOverig)/totProd;
    for(var b=0;b<n;b++){
      if(prod[b]>0){
        var ms=prod[b]*f;
        var sp=prod[b]-ms;
        R[b].intSoldKwh+=ms;R[b].eurInt+=ms*priceOf(withData[b].source);
        R[b].gridExpKwh+=sp;R[b].eurGrid+=sp*cfg.pNetTerug;
      }else if(dem[b]>0){
        var mb=dem[b]*(matched/totDem);
        var df=dem[b]-mb;
        R[b].intBoughtKwh+=mb;R[b].eurInt-=mb*(blended+cfg.fee);
        R[b].gridImpKwh+=df;R[b].eurGrid-=df*cfg.pNetAfname;
        platformFee+=mb*cfg.fee;
      }
    }
  }

  // Dag-modus: vaste platformkosten per deelnemer per dag, bovenop de per-kWh fee.
  var dagkosten=0;
  if(cfg.feeMode==='dag'&&cfg.fee>0){
    var nDagen=allTs.length/96;
    dagkosten=cfg.fee*nDagen;
    platformFee+=dagkosten*R.length;
  }
  var totBaseEur=0,totSavings=0,totNet=0;
  for(var r=0;r<R.length;r++){
    R[r].net=R[r].eurInt+R[r].eurGrid-dagkosten;
    R[r].baseEur=R[r].prodKwh*R[r].priceT - R[r].consKwh*R[r].priceA;
    R[r].savings=R[r].net - R[r].baseEur;
    totNet+=R[r].net;totBaseEur+=R[r].baseEur;totSavings+=R[r].savings;
  }

  // Fiscaal: energiebelasting en BTW per deelnemer
  var ebJaarNum=cfg.ebJaar?parseInt(cfg.ebJaar):undefined;
  var btwFactor=(cfg.btwPct||21)/100;
  for(var rf=0;rf<R.length;rf++){
    var platEbRes,baseEbRes;
    if(cfg.ebOn){
      var ebBase={jaar:ebJaarNum,heffingskorting:cfg.heffingskorting||0};
      if(cfg.ebGrondslag==='externeLevering'){
        var oPl={jaar:ebBase.jaar,heffingskorting:ebBase.heffingskorting,grondslag:'externeLevering',externeAfnameKwh:R[rf].gridImpKwh};
        var oBl={jaar:ebBase.jaar,heffingskorting:ebBase.heffingskorting,grondslag:'externeLevering',externeAfnameKwh:R[rf].consKwh};
        platEbRes=calculateEnergyTax(0,0,oPl);
        baseEbRes=calculateEnergyTax(0,0,oBl);
      }else if(cfg.ebGrondslag==='netto'){
        var oNt={jaar:ebBase.jaar,heffingskorting:ebBase.heffingskorting,grondslag:'netto'};
        platEbRes=calculateEnergyTax(R[rf].consKwh,R[rf].prodKwh,oNt);
        baseEbRes=calculateEnergyTax(R[rf].consKwh,R[rf].prodKwh,oNt);
      }else{
        var oBr={jaar:ebBase.jaar,heffingskorting:ebBase.heffingskorting,grondslag:'bruto'};
        platEbRes=calculateEnergyTax(R[rf].consKwh,0,oBr);
        baseEbRes=calculateEnergyTax(R[rf].consKwh,0,oBr);
      }
      R[rf].eb=-Math.max(0,platEbRes.netto);
      R[rf].baseEB=-Math.max(0,baseEbRes.netto);
    }else{
      R[rf].eb=0;R[rf].baseEB=0;
    }
    R[rf].btw=cfg.btwOn?(R[rf].net+R[rf].eb)*btwFactor:0;
    R[rf].baseBtw=cfg.btwOn?(R[rf].baseEur+R[rf].baseEB)*btwFactor:0;
    R[rf].totaal=R[rf].net+R[rf].eb+R[rf].btw;
    R[rf].baseTotaal=R[rf].baseEur+R[rf].baseEB+R[rf].baseBtw;
    R[rf].savings=R[rf].totaal-R[rf].baseTotaal;
  }
  if(cfg.ebOn||cfg.btwOn){
    totNet=R.reduce(function(s,rv){return s+rv.totaal;},0);
    totBaseEur=R.reduce(function(s,rv){return s+rv.baseTotaal;},0);
    totSavings=R.reduce(function(s,rv){return s+rv.savings;},0);
  }else{
    for(var rg=0;rg<R.length;rg++){R[rg].totaal=R[rg].net;R[rg].baseTotaal=R[rg].baseEur;}
  }

  // EHP-netto per kwartier: positief = platform importeert van net (tekort)
  var ehpNetKw=allTs.map(function(ts,i){return perKw.reduce(function(s,a){return s+(a[i]||0);},0);});
  var ehpImportCount=ehpNetKw.filter(function(v){return v>0;}).length;

  // Aansluitingen in dit project die geen lid zijn van dit platform
  var memberSet={};members.forEach(function(mem){memberSet[mem.cid]=1;});
  var nonMembers=[];
  for(var ni=0;ni<p.companies.length;ni++){
    var nc=p.companies[ni];
    if(memberSet[nc.id])continue;
    var nd=await dbGet('ts',nc.id)||[];
    if(!nd.length)continue;
    var ndMap={};nd.forEach(function(rec){ndMap[rec.ts]=rec.kw;});
    var nmProd=0,nmCons=0,nmPeak=0,nmSim=0;
    var nmWeekSum=new Array(672).fill(0),nmWeekCnt=new Array(672).fill(0),nmMonthProd={};
    nd.forEach(function(rec){
      if(rec.kw<0){
        var prod=-rec.kw;
        nmProd+=prod*0.25;if(prod>nmPeak)nmPeak=prod;
        var d=new Date(rec.ts);
        var dow=(d.getDay()+6)%7;
        var sl=dow*96+Math.floor((d.getHours()*60+d.getMinutes())/15);
        nmWeekSum[sl]+=prod;nmWeekCnt[sl]++;
        var mn=rec.ts.slice(0,7);nmMonthProd[mn]=(nmMonthProd[mn]||0)+prod*0.25;
      } else if(rec.kw>0){nmCons+=rec.kw*0.25;}
    });
    var nmWeekProd=nmWeekSum.map(function(s,i){return nmWeekCnt[i]>0?s/nmWeekCnt[i]:0;});
    // Gelijktijdigheid: % van importkwartieren van het platform waarop dit niet-lid opwek heeft
    if(ehpImportCount>0){
      allTs.forEach(function(ts,i){
        if(ehpNetKw[i]>0&&ndMap[ts]!==undefined&&ndMap[ts]<0)nmSim++;
      });
    }
    nonMembers.push({id:nc.id,name:nc.name,prodKwh:nmProd,consKwh:nmCons,peakProd:nmPeak,
      simScore:ehpImportCount>0?nmSim/ehpImportCount*100:0,
      weekProd:nmWeekProd,monthProd:nmMonthProd});
  }

  // Platform week/maand statistieken (volledig gesigneerd gemiddelde voor Analyse-tab)
  var ehpWeekAvgSum=new Array(672).fill(0),ehpWeekAvgCnt=new Array(672).fill(0);
  var ehpMonthImp={},ehpMonthExp={};
  allTs.forEach(function(ts,i){
    var netKw=perKw.reduce(function(s,a){return s+(a[i]||0);},0);
    var d=new Date(ts);
    var dow=(d.getDay()+6)%7;
    var sl=dow*96+Math.floor((d.getHours()*60+d.getMinutes())/15);
    ehpWeekAvgSum[sl]+=netKw;ehpWeekAvgCnt[sl]++;
    var mn=ts.slice(0,7);
    if(netKw>0)ehpMonthImp[mn]=(ehpMonthImp[mn]||0)+netKw*0.25;
    else if(netKw<0)ehpMonthExp[mn]=(ehpMonthExp[mn]||0)+(-netKw)*0.25;
  });
  var ehpWeekAvg=ehpWeekAvgSum.map(function(s,i){return ehpWeekAvgCnt[i]>0?s/ehpWeekAvgCnt[i]:0;});
  // ehpWeekNet = positief deel van ehpWeekAvg (backward compat voor niet-leden overlay)
  var ehpWeekNet=ehpWeekAvg.map(function(v){return Math.max(0,v);});

  _ehpLast={
    platName:plat.name,ts:allTs,parties:R,cfg:cfg,
    totProdKwh:totProdKwh,totConsKwh:totConsKwh,totMatchedKwh:totMatchedKwh,
    totGridImpKwh:totConsKwh-totMatchedKwh,totGridExpKwh:totProdKwh-totMatchedKwh,
    prodBySrc:prodBySrcTot,matchedBySrc:matchedBySrcTot,
    platformFee:platformFee,totNet:totNet,totBaseEur:totBaseEur,totSavings:totSavings,
    selfCons:totProdKwh>0?totMatchedKwh/totProdKwh*100:0,
    selfSuff:totConsKwh>0?totMatchedKwh/totConsKwh*100:0,
    nProdOnly:nProdOnly,nDemOnly:nDemOnly,nBoth:nBoth,nNone:nNone,
    maxMatchKw:maxMatchKw,peakProdKw:peakProdKw,peakDemKw:peakDemKw,
    skipped:skipped,nonMembers:nonMembers,
    ehpNetKw:ehpNetKw,
    ehpWeekAvg:ehpWeekAvg,ehpWeekNet:ehpWeekNet,ehpMonthImp:ehpMonthImp,ehpMonthExp:ehpMonthExp
  };
  _ehpPlatWeekSeiz=null;
  renderEhpResults(_ehpLast);
  document.getElementById('btnDlEhp').disabled=false;
  notify('Handelsplatform berekend — '+allTs.length+' kwartierwaarden'+(skipped.length?' ('+skipped.length+' deelnemer(s) zonder data overgeslagen)':''));
  calcJaarrekening().catch(function(e){console.error('autoJR:',e);});
}

// --- Resultaten --------------------------------------------------------------

function _e2(n){return (Math.round(n*100)/100).toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2});}
function _eMoney(n){var s=n>=0?'+':'−';return s+' € '+_e2(Math.abs(n));}

function renderEhpResults(res){
  var d0=res.ts[0].slice(0,10),d1=res.ts[res.ts.length-1].slice(0,10);

  // Periode-header (geen financiële vergelijking — zie Jaarrekening-tab)
  var headline='<div class="cd">'+
    '<div class="kl">Platform: '+_ehpEsc(res.platName)+' · periode '+d0+' t/m '+d1+'</div>'+
    '<div class="ku" style="margin-top:2px">Financiële vergelijking staat in het tabblad <strong>Jaarrekening</strong>.</div>'+
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
  var srcLbl={zon:'Zon',wind:'Wind',overig:'Overig',none:'Alleen afnemer'};
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
    '<div class="ehp-party-grid">'+res.parties.map(function(x){return _ehpPartyCard(x,res);}).join('')+'</div></div>'+
    '<div id="ehpJrDeelBlok">'+_ehpJrDeelnemersBlok()+'</div>';

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
      '<button class="tab" data-ehp-tab="tEhpJr">Jaarrekening</button>'+
      (hasNm?'<button class="tab" data-ehp-tab="tEhpNm">Niet-leden</button>':'')+
    '</div>'+
    '<div id="tEhpOv" class="pn on">'+headline+kpiHtml+_ehpPrijsblok(res)+simHtml+'</div>'+
    '<div id="tEhpAn" class="pn">'+flowHtml+platAnalyseHtml+'</div>'+
    '<div id="tEhpDeel" class="pn">'+skipNote+summaryHtml+partyCards+'</div>'+
    '<div id="tEhpJr" class="pn"></div>'+
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

  // Jaarrekening-tab
  _ehpJrRenderInTab();
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
      cons:   {x:680,y:60,  w:120,h:90, lbl:'Deelnemers',   kwh:res.totConsKwh,       col:'#46962b'},
      netOut: {x:680,y:200, w:120,h:48, lbl:'Teruglever net',kwh:res.totGridExpKwh,   col:'#999'}
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
  var srcLbl={zon:'Zon',wind:'Wind',overig:'Overig',none:'Alleen afnemer'};
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
  var head=['Deelnemer','Bron','Opwek_kWh','Verbruik_kWh','Intern_verkocht_kWh','Intern_gekocht_kWh','Naar_net_kWh','Van_net_kWh','EUR_intern','EUR_net','EUR_baseline','Netto_EHP_EUR','Besparing_EUR','PriceA','PriceT'];
  var lines=[head.join(sep)];
  r.parties.forEach(function(x){
    lines.push([
      '"'+String(x.name).replace(/"/g,'""')+'"',x.source,
      x.prodKwh.toFixed(2),x.consKwh.toFixed(2),x.intSoldKwh.toFixed(2),x.intBoughtKwh.toFixed(2),
      x.gridExpKwh.toFixed(2),x.gridImpKwh.toFixed(2),x.eurInt.toFixed(2),x.eurGrid.toFixed(2),
      x.baseEur.toFixed(2),x.net.toFixed(2),x.savings.toFixed(2),
      x.priceA.toFixed(4),x.priceT.toFixed(4)
    ].join(sep));
  });
  lines.push('');
  lines.push(['Totaal opwek kWh',r.totProdKwh.toFixed(2)].join(sep));
  lines.push(['Totaal verbruik kWh',r.totConsKwh.toFixed(2)].join(sep));
  lines.push(['Intern verrekend kWh',r.totMatchedKwh.toFixed(2)].join(sep));
  lines.push(['Naar net kWh',r.totGridExpKwh.toFixed(2)].join(sep));
  lines.push(['Van net kWh',r.totGridImpKwh.toFixed(2)].join(sep));
  lines.push(['Zelfconsumptie %',r.selfCons.toFixed(1)].join(sep));
  lines.push(['Zelfvoorziening %',r.selfSuff.toFixed(1)].join(sep));
  lines.push(['Huidig totaal EUR',r.totBaseEur.toFixed(2)].join(sep));
  lines.push(['EHP totaal EUR',r.totNet.toFixed(2)].join(sep));
  lines.push(['Besparing totaal EUR',r.totSavings.toFixed(2)].join(sep));
  var fname='handelsplatform-'+String(r.platName).replace(/[^a-z0-9]/gi,'-').toLowerCase()+'-'+new Date().toISOString().slice(0,10)+'.csv';
  triggerDownload(new Blob(['﻿'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),fname);
}

// --- Jaarrekening (jr) -------------------------------------------------------

function _jrPriceKey(){var p=_ehpProj();return p?p.id+'-jr':null;}

async function _jrUpdatePriceInfo(){
  var el=document.getElementById('jrPriceInfo');if(!el)return;
  var k=_jrPriceKey();if(!k){el.textContent='Geen prijsreeks geladen — basisprijs wordt gebruikt.';return;}
  try{
    var s=(await dbGet('prices',k))||[];
    if(!s.length){el.textContent='Geen prijsreeks geladen — basisprijs wordt gebruikt.';}
    else{
      var d0=String(s[0].ts).slice(0,10),d1=String(s[s.length-1].ts).slice(0,10);
      el.textContent=s.length.toLocaleString('nl-NL')+' kwartierprijzen ('+d0+' t/m '+d1+').';
    }
  }catch(e){el.textContent='Geen prijsreeks geladen — basisprijs wordt gebruikt.';}
}

async function _jrImportPrices(file){
  if(!file)return;
  var p=_ehpProj();if(!p){notify('Selecteer eerst een project',false);return;}
  var unitEl=document.getElementById('jrPriceUnit');
  var perMWh=unitEl&&unitEl.value==='mwh';
  var r=new FileReader();
  r.onload=async function(e){
    try{
      var series=parsePriceCSV(e.target.result,{perMWh:perMWh});
      if(!series.length){notify('Geen geldige prijzen in CSV',false);return;}
      await dbSet('prices',_jrPriceKey(),series);
      notify(series.length+' kwartierprijzen geïmporteerd');
      _jrUpdatePriceInfo();
    }catch(err){notify('Prijsimport mislukt: '+err.message,false);}
  };
  r.onerror=function(){notify('Kan bestand niet lezen',false);};
  r.readAsText(file,'UTF-8');
}

async function calcJaarrekening(switchTab){
  var plat=_ehpActive();
  if(!plat){notify('Selecteer eerst een platform',false);return;}
  _ehpCommit();
  var cfg=plat.cfg||_ehpDefaults();
  var p=_ehpProj();
  var memberCfg=plat.members||[];
  if(!memberCfg.length){notify('Dit platform heeft geen deelnemers',false);return;}
  var members=[],skipped=[];
  for(var i=0;i<memberCfg.length;i++){
    var comp=null;
    for(var j=0;j<p.companies.length;j++){if(p.companies[j].id===memberCfg[i].cid){comp=p.companies[j];break;}}
    if(!comp)continue;
    var data=await dbGet('ts',comp.id)||[];
    if(!data.length){skipped.push(comp.name||comp.id);continue;}
    members.push({id:comp.id,name:comp.name,source:memberCfg[i].source||'overig',company:comp,data:data});
  }
  if(!members.length){notify('Geen deelnemer met meetdata',false);return;}
  var prices=[];
  try{prices=(await dbGet('prices',_jrPriceKey()))||[];}catch(e){prices=[];}
  var feePkwh=cfg.feeMode==='dag'?0:(cfg.fee||0);
  var feeDag=cfg.feeMode==='dag'?(cfg.fee||0):0;
  var assumptions={
    internalPrices:{zon:cfg.pZon||0,wind:cfg.pWind||0,overig:cfg.pOverig||0},
    leveranciersOpslag:cfg.jrLevOpslag||0,
    terugleverAfslag:cfg.jrTerugAfslag||0,
    platformkosten:feePkwh,
    platformkostenDag:feeDag,
    onbalansOpslag:cfg.jrOnbalans||0,
    fallbackPrice:cfg.jrPrijs||0.10,
    btwPct:cfg.btwOn?(cfg.btwPct||21)/100:0,
    ebToepassen:!!cfg.ebOn,
    ebJaar:cfg.ebJaar?parseInt(cfg.ebJaar,10):undefined,
    ebGrondslag:cfg.ebGrondslag||'bruto',
    heffingskortingPerLid:cfg.heffingskorting||0,
    netToepassen:false,
    verdeelsleutel:cfg.jrVerdeel||'geen',
    keepQuarterMatrix:false
  };
  var r;
  try{r=buildAnnualComparison(members,prices,assumptions);}
  catch(e){console.error('buildAnnualComparison(jr):',e);notify('Fout in jaarrekening: '+e.message,false);return;}
  if(!r.allTs.length){notify('Geen overlappende kwartierwaarden',false);return;}
  _ehpJrLast={r:r,cfg:cfg,platName:plat.name,members:members,skipped:skipped,assumptions:assumptions,prices:prices};
  _ehpJrRenderInTab(switchTab);
  notify('Jaarrekening berekend — '+r.allTs.length+' kwartieren'+(skipped.length?' ('+skipped.length+' zonder data overgeslagen)':''));
}

function _ehpJrRenderInTab(switchTab){
  var panel=document.getElementById('tEhpJr');
  if(!panel)return;
  if(!_ehpJrLast){
    panel.innerHTML='<div class="verg-empty"><div class="big">€</div>Klik op <strong>Herbereken jaarrekening</strong> in de zijbalk om te starten.</div>';
  }else{
    panel.innerHTML=renderJaarrekenTab(_ehpJrLast);
    _ehpJrAttachVolledige(_ehpJrLast);
    if(switchTab){
      var jrBtn=document.querySelector('[data-ehp-tab="tEhpJr"]');
      if(jrBtn)jrBtn.click();
    }
  }
  // Deelnemers-blok bijwerken als het al in de DOM staat
  var deelBlok=document.getElementById('ehpJrDeelBlok');
  if(deelBlok)deelBlok.innerHTML=_ehpJrDeelnemersBlok();
}

function renderJaarrekenTab(L){
  var r=L.r,co=r.consolidated;
  var saveCls=co.totaalVoordeel>=0?'ehp-savings-pos':'ehp-savings-neg';
  var d0=r.periode&&r.periode.start?String(r.periode.start).slice(0,10):'—';
  var d1=r.periode&&r.periode.end?String(r.periode.end).slice(0,10):'—';
  var headline='<div class="cd" style="display:flex;flex-wrap:wrap;gap:18px;align-items:center;justify-content:space-between">'+
    '<div><div class="kl">Resultaat platformscenario t.o.v. huidige situatie</div>'+
    '<div class="'+saveCls+'" style="font-size:34px;line-height:1.1;margin-top:2px">'+_finMoney(co.totaalVoordeel)+'</div>'+
    '<div class="ku" style="margin-top:2px">'+_finPct(co.totaalVoordeelPct)+' · periode '+d0+' t/m '+d1+'</div></div>'+
    '<div style="display:flex;gap:10px;flex-wrap:wrap">'+
    '<div class="kb"><div class="kl">Huidig</div><div class="kv" style="font-size:15px">€ '+_finEur0(co.nettoHuidig)+'</div><div class="ku">huidige situatie</div></div>'+
    '<div class="kb"><div class="kl">Platform</div><div class="kv" style="font-size:15px">€ '+_finEur0(co.nettoPlatform)+'</div><div class="ku">platformscenario</div></div>'+
    '</div></div>';
  var srcLbl={zon:'Zon',wind:'Wind',overig:'Overig',none:'Afnemer'};
  var rows=r.perCompany.map(function(c){
    var cls=c.verschil>=0?'verg-pos':'verg-neg';
    return '<tr><td style="font-weight:700">'+_ehpEsc(c.name)+'</td>'+
    '<td>'+(srcLbl[c.source]||c.source)+'</td>'+
    '<td>€ '+_finEur0(c.nettoHuidig)+'</td>'+
    '<td>€ '+_finEur0(c.nettoPlatform)+'</td>'+
    '<td class="'+cls+'">'+_finMoney(c.verschil)+'</td>'+
    '<td class="'+cls+'">'+_finPct(c.besparingPct)+'</td></tr>';
  }).join('');
  var perDeelTbl='<div class="cd ehp-grp"><div class="ct2"><div class="ac" style="background:#2c7fb8"></div>Per deelnemer</div>'+
    '<div style="overflow-x:auto"><table class="verg-tbl jr-table"><thead><tr>'+
    '<th>Deelnemer</th><th>Bron</th><th>Huidig €</th><th>Platform €</th><th>Besparing</th><th>%</th>'+
    '</tr></thead><tbody>'+rows+'</tbody></table></div></div>';
  var platTbl='<div class="cd ehp-grp"><div class="ct2"><div class="ac" style="background:#46962b"></div>Platform totaal</div>'+
    '<table class="verg-tbl jr-table"><tbody>'+
    '<tr><td>Totaal platformvolume</td><td>'+_finEur0(co.platformVolumeKwh/1000)+' MWh</td></tr>'+
    '<tr><td>Interne matching</td><td>'+_finEur0(co.internMatchingKwh/1000)+' MWh</td></tr>'+
    '<tr><td>Besparing totaal</td><td class="'+(co.totaalVoordeel>=0?'verg-pos':'verg-neg')+'">'+_finMoney(co.totaalVoordeel)+'</td></tr>'+
    '</tbody></table></div>';
  var skipNote=L.skipped&&L.skipped.length?
    '<div class="opt-warn">Niet meegerekend (geen meetdata): '+L.skipped.map(_ehpEsc).join(', ')+'</div>':'';
  return skipNote+headline+perDeelTbl+platTbl+
    '<div id="jrVolledigeWrap" style="margin-top:16px">'+
    '<button class="b" id="btnJrVolledig" style="background:#2c7fb8">Volledige analyse ▶</button>'+
    '<div id="jrVolledigeContent" style="margin-top:12px"></div>'+
    '</div>';
}

function _ehpJrAttachVolledige(L){
  var btn=document.getElementById('btnJrVolledig');
  if(!btn)return;
  btn.addEventListener('click',function(){
    var content=document.getElementById('jrVolledigeContent');
    if(!content)return;
    if(content.innerHTML.trim()){content.innerHTML='';btn.textContent='Volledige analyse ▶';return;}
    btn.textContent='Volledige analyse ▼';
    var L2={r:L.r,ehp:_ehpActive(),ehpName:L.platName,assumptions:L.assumptions||{},prices:L.prices||[],members:L.members,skipped:L.skipped,f:{}};
    _finRender(L2,content);
  });
}

function _ehpJrDeelnemersBlok(){
  if(!_ehpJrLast){
    return '<div class="ib2" style="margin-top:8px">Bereken het handelsplatform voor de financiële vergelijking per deelnemer.</div>';
  }
  var r=_ehpJrLast.r;
  var srcLbl={zon:'Zon',wind:'Wind',overig:'Overig',none:'Afnemer'};
  var rows=r.perCompany.map(function(c){
    var cls=c.verschil>=0?'verg-pos':'verg-neg';
    return '<tr><td style="font-weight:700">'+_ehpEsc(c.name)+'</td>'+
    '<td>'+(srcLbl[c.source]||c.source)+'</td>'+
    '<td>€ '+_finEur0(c.nettoHuidig)+'</td>'+
    '<td>€ '+_finEur0(c.nettoPlatform)+'</td>'+
    '<td class="'+cls+'">'+_finMoney(c.verschil)+'</td>'+
    '<td class="'+cls+'">'+_finPct(c.besparingPct)+'</td></tr>';
  }).join('');
  return '<div class="cd ehp-grp" style="margin-top:12px"><div class="ct2"><div class="ac" style="background:#46962b"></div>Financieel per deelnemer (Jaarrekening-methode)</div>'+
    '<div style="overflow-x:auto"><table class="verg-tbl jr-table"><thead><tr>'+
    '<th>Deelnemer</th><th>Bron</th><th>Huidig €</th><th>Platform €</th><th>Besparing</th><th>%</th>'+
    '</tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<div class="ib2" style="margin-top:6px">Op basis van kale marktprijs + opslagen (zie Jaarrekening-tab voor details).</div></div>';
}

function _ehpPrijsblok(res){
  var cfg=res.cfg;
  var mb=res.matchedBySrc||{};
  var totKwh=res.totMatchedKwh||0;
  var gemVerkoop=0;
  if(totKwh>0){
    var wsum=(mb.zon||0)*(cfg.pZon||0)+(mb.wind||0)*(cfg.pWind||0)+(mb.overig||0)*(cfg.pOverig||0);
    gemVerkoop=wsum/totKwh;
  }
  var gemInkoop=gemVerkoop+(cfg.feeMode!=='dag'?(cfg.fee||0):0);
  function card(lbl,val,ku){
    return '<div class="kb"><div class="kl">'+lbl+'</div><div class="kv" style="font-size:14px">'+val+'</div>'+(ku?'<div class="ku">'+ku+'</div>':'')+'</div>';
  }
  function ct(n){return (Math.round((n||0)*10000)/100).toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2})+' ct/kWh';}
  return '<div class="cd"><div class="ct2"><div class="ac" style="background:#46962b"></div>Verrekenprijzen</div>'+
    '<div class="kg">'+
    card('Zon',ct(cfg.pZon),'afgesproken intern')+
    card('Wind',ct(cfg.pWind),'afgesproken intern')+
    card('Overig',ct(cfg.pOverig),'afgesproken intern')+
    (totKwh>0?card('Gem. verkoopprijs',ct(gemVerkoop),'producent ontvangt')+card('Gem. inkoopprijs',ct(gemInkoop),'afnemer betaalt'):'')+
    '</div></div>';
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
  document.getElementById('btnCalcJr').addEventListener('click',function(){calcJaarrekening(true).catch(function(e){console.error('calcJR:',e);notify('Fout bij jaarrekening',false);});});
  document.getElementById('btnDlEhp').addEventListener('click',downloadEhpCsv);
  document.getElementById('ehpList').addEventListener('click',function(e){
    var it=e.target.closest('[data-ehp-id]');
    if(it)selectEhp(it.getAttribute('data-ehp-id'));
  });
  var jrPf=document.getElementById('jrPriceFile');
  if(jrPf)jrPf.addEventListener('change',function(){if(this.files[0])_jrImportPrices(this.files[0]);this.value='';});
});
