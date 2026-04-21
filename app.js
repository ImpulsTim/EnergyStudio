// Globale applicatiestatus
var S={projects:[],activeId:null};
var editId=null,pendData=null,pendName='',pType='static';
var CH={},_piek=null,_jaarState=null,_jZoom=1;

// Hulpfuncties
function uid(){return Math.random().toString(36).slice(2,10);}

function notify(msg,ok){
  var el=document.getElementById('nf');
  el.textContent=msg;
  el.style.borderLeftColor=(ok===false)?'#c0392b':'#46962b';
  el.classList.add('on');
  setTimeout(function(){el.classList.remove('on');},3000);
}

function ap(){for(var i=0;i<S.projects.length;i++){if(S.projects[i].id===S.activeId)return S.projects[i];}return null;}
function selC(){var p=ap();if(!p)return[];return p.companies.filter(function(c){return c.selected!==false;});}
function fmt(n){return Math.round(n).toLocaleString('nl-NL');}
function ax(lbl){return{ticks:{color:'#999',font:{family:'Barlow',size:11},maxTicksLimit:12},grid:{color:'#f3f7f4'},title:lbl?{display:true,text:lbl,color:'#aaa',font:{family:'Barlow',size:11}}:undefined};}
function sdesc(arr,n){
  var s=arr.filter(function(v){return v!=null;}).slice().sort(function(a,b){return b-a;});
  if(s.length<=n)return s;
  var out=[];for(var i=0;i<n;i++)out.push(s[Math.round(i*(s.length-1)/(n-1))]);
  return out;
}
function dC(id){if(CH[id]){try{CH[id].destroy();}catch(e){}delete CH[id];}}
function resetCH(){Object.keys(CH).forEach(function(k){dC(k);});CH={};_piek=null;_jaarState=null;}
function setKpi(id,val,alert){var el=document.getElementById(id);el.textContent=val;el.parentElement.classList.remove('red','grn');el.parentElement.classList.add(alert?'red':'grn');}
function mndLabel(mnds,m){var parts=m.split('-');var mo=parseInt(parts[1]);var y=parts[0];var multi=mnds.some(function(x){return x.slice(0,4)!==mnds[0].slice(0,4);});return MND[mo-1]+(multi?" '"+y.slice(2):'');}

// Renderen
function renderAll(){renderProjSel();renderSidebar();renderOverzicht();}

function renderProjSel(){
  var s=document.getElementById('projSel');
  s.innerHTML=S.projects.map(function(p){return '<option value="'+p.id+'"'+(p.id===S.activeId?' selected':'')+'>'+p.name+'</option>';}).join('');
}

function renderSidebar(){
  var p=ap();var list=document.getElementById('cList');
  if(!p||!p.companies.length){list.innerHTML='<div style="padding:10px 0;text-align:center;font-size:11px;color:#aaa">Nog geen aansluitingen</div>';return;}
  var html='';
  for(var i=0;i<p.companies.length;i++){
    var c=p.companies[i];
    html+='<div class="ci '+(c.selected!==false?'s':'')+'">';
    html+='<div class="cn"><div class="ck '+(c.selected!==false?'on':'')+'" data-cid="'+c.id+'"></div>';
    html+='<span class="dt" style="background:'+PAL[i%PAL.length]+'"></span>'+c.name+'</div>';
    html+='<div class="cm">'+c.category+' · GTV '+c.gtvA+'kW · <span id="pt_'+c.id+'">…</span> pt</div>';
    html+='<div style="margin-top:4px"><button class="b" style="font-size:9px;padding:2px 6px;background:#f0f4f2;color:#46962b" data-editid="'+c.id+'">Bewerken</button></div>';
    html+='</div>';
  }
  list.innerHTML=html;
  p.companies.forEach(function(c){
    dbGet('ts',c.id).then(function(d){
      var el=document.getElementById('pt_'+c.id);
      if(el)el.textContent=(d&&d.length)||0;
    }).catch(function(){});
  });
}

function renderOverzicht(){
  var p=ap();
  document.getElementById('kProj').textContent=p?p.name:'—';
  document.getElementById('kN').textContent=p?p.companies.length:0;
  var body=document.getElementById('ovBody');
  if(!p||!p.companies.length){body.innerHTML='<tr><td colspan="8" style="text-align:center;padding:16px;color:#aaa">Geen aansluitingen</td></tr>';return;}
  var html='';
  for(var i=0;i<p.companies.length;i++){
    var c=p.companies[i];
    html+='<tr><td><span class="dt" style="background:'+PAL[i%PAL.length]+';display:inline-block"></span></td>';
    html+='<td><strong>'+c.name+'</strong></td><td style="font-family:monospace;font-size:10px">'+(c.ean||'—')+'</td>';
    html+='<td><span class="bdg bg">'+c.category+'</span></td>';
    html+='<td>'+c.gtvA+'kW</td><td>'+c.gtvT+'kW</td>';
    html+='<td id="op_'+c.id+'">…</td>';
    html+='<td><button class="b" style="font-size:9px;padding:2px 6px" data-editid="'+c.id+'">Bewerken</button></td></tr>';
  }
  body.innerHTML=html;
  p.companies.forEach(function(c){
    dbGet('ts',c.id).then(function(d){
      var el=document.getElementById('op_'+c.id);
      if(el)el.textContent=(d&&d.length)||0;
    }).catch(function(){});
  });
}

// Modal helpers
function showM(id){document.getElementById(id).style.display='flex';}
function hideM(id){document.getElementById(id).style.display='none';}

// Projectbeheer
function createProj(){
  var name=document.getElementById('mPN').value.trim();
  if(!name){notify('Vul een naam in',false);return;}
  var id=uid();
  S.projects.push({id:id,name:name,desc:document.getElementById('mPD').value.trim(),companies:[]});
  S.activeId=id;hideM('mProj');saveMeta();renderAll();notify('Project "'+name+'" aangemaakt');
}

function delProj(){
  if(S.projects.length<=1){notify('Minimaal één project vereist',false);return;}
  var p=ap();if(!confirm('Project "'+p.name+'" verwijderen?'))return;
  p.companies.forEach(function(c){dbDel('ts',c.id);});
  S.projects=S.projects.filter(function(x){return x.id!==S.activeId;});
  S.activeId=S.projects[0].id;saveMeta();resetCH();renderAll();notify('Project verwijderd');
}

// Aansluitingbeheer
function openAddComp(){
  editId=null;pendData=null;pendName='';
  document.getElementById('mCT').textContent='Aansluiting toevoegen';
  document.getElementById('btnDelComp').style.display='none';
  document.getElementById('cN').value='';document.getElementById('cE').value='';
  document.getElementById('cCat').value='Grootverbruik';
  document.getElementById('cGA').value='150';document.getElementById('cGT').value='80';
  document.getElementById('cSA').value='TrafoMSLS';document.getElementById('cST').value='TrafoMSLS';
  document.getElementById('cPA').value='0.12';document.getElementById('cPT2').value='0.08';
  document.getElementById('cPD').value='';document.getElementById('cPills').innerHTML='';
  setPT('static');showM('mComp');
}

async function openEditComp(id){
  var p=ap();var c=null;
  for(var i=0;i<p.companies.length;i++){if(p.companies[i].id===id){c=p.companies[i];break;}}
  if(!c)return;
  editId=id;
  var data=await dbGet('ts',id)||[];
  pendData=data;pendName=c.fileName||'';
  document.getElementById('mCT').textContent='Aansluiting bewerken';
  document.getElementById('btnDelComp').style.display='';
  document.getElementById('cN').value=c.name;document.getElementById('cE').value=c.ean||'';
  document.getElementById('cCat').value=c.category||'Grootverbruik';
  document.getElementById('cGA').value=c.gtvA||150;document.getElementById('cGT').value=c.gtvT||80;
  document.getElementById('cSA').value=c.stedinA||'TrafoMSLS';document.getElementById('cST').value=c.stedinT||'TrafoMSLS';
  document.getElementById('cPA').value=c.priceA!=null?c.priceA:0.12;document.getElementById('cPT2').value=c.priceT!=null?c.priceT:0.08;
  document.getElementById('cPD').value=c.priceDyn||'';
  setPT(c.priceType||'static');
  document.getElementById('cPills').innerHTML=pendName?'<div class="pl">'+pendName+' ('+data.length+' metingen)</div>':'';
  showM('mComp');
}

async function saveComp(){
  var name=document.getElementById('cN').value.trim();
  if(!name){notify('Vul een naam in',false);return;}
  var p=ap();var id=editId||uid();
  var obj={id:id,name:name,ean:document.getElementById('cE').value.trim(),category:document.getElementById('cCat').value,
    gtvA:parseFloat(document.getElementById('cGA').value)||150,gtvT:parseFloat(document.getElementById('cGT').value)||80,
    stedinA:document.getElementById('cSA').value,stedinT:document.getElementById('cST').value,
    priceType:pType,priceA:parseFloat(document.getElementById('cPA').value)||0.12,
    priceT:parseFloat(document.getElementById('cPT2').value)||0.08,
    priceDyn:document.getElementById('cPD').value,fileName:pendName,selected:true};
  if(editId){
    for(var i=0;i<p.companies.length;i++){if(p.companies[i].id===editId){obj.selected=p.companies[i].selected;p.companies[i]=obj;break;}}
  }else{p.companies.push(obj);}
  if(pendData&&pendData.length>0)await dbSet('ts',id,pendData);
  hideM('mComp');await saveMeta();renderAll();notify('"'+name+'" opgeslagen');
}

async function deleteComp(){
  if(!editId)return;if(!confirm('Aansluiting verwijderen?'))return;
  var p=ap();p.companies=p.companies.filter(function(c){return c.id!==editId;});
  await dbDel('ts',editId);hideM('mComp');await saveMeta();resetCH();renderAll();notify('Verwijderd');
}

function setPT(type){
  pType=type;
  document.getElementById('pStatic').style.display=type==='static'?'grid':'none';
  document.getElementById('pDynamic').style.display=type==='dynamic'?'block':'none';
  document.querySelectorAll('#pTgl .tg').forEach(function(b){b.classList.remove('on');if(b.getAttribute('data-pt')===type)b.classList.add('on');});
}

// Analyse
async function runAnalysis(){
  var cos=selC();if(!cos.length){notify('Selecteer minimaal één aansluiting',false);return;}
  var withData=[];
  for(var i=0;i<cos.length;i++){
    var d=await dbGet('ts',cos[i].id)||[];
    if(!d.length){d=genDemo(withData.length);notify('Demodata voor: '+cos[i].name);}
    withData.push(Object.assign({},cos[i],{data:d}));
  }
  resetCH();
  var somA=withData.reduce(function(s,c){return s+(c.gtvA||150);},0);
  var somT=withData.reduce(function(s,c){return s+(c.gtvT||80);},0);
  var inGA=parseFloat(document.getElementById('gGtvA').value);
  var inGT=parseFloat(document.getElementById('gGtvT').value);
  var gtvA=isNaN(inGA)?somA:inGA;
  var gtvT=isNaN(inGT)?somT:inGT;
  document.getElementById('gGtvA').placeholder=String(somA);
  document.getElementById('gGtvT').placeholder=String(somT);
  document.getElementById('gtvHint').textContent='Afname: '+gtvA+' kW | Teruglevering: '+gtvT+' kW';
  var tsSets=withData.map(function(c){var s={};c.data.forEach(function(d){s[d.ts]=1;});return s;});
  var allTs=Object.keys(tsSets[0]).filter(function(ts){return tsSets.every(function(s){return s[ts];});}).sort();
  if(!allTs.length){notify('Geen overlappende timestamps',false);return;}
  var perKw=withData.map(function(c){var m={};c.data.forEach(function(d){m[d.ts]=d.kw;});return allTs.map(function(ts){return m[ts];});});
  var grpKw=allTs.map(function(_,i){return perKw.reduce(function(s,a){return s+a[i];},0);});
  var gA=grpKw.map(function(v){return Math.max(0,v);});
  var gT=grpKw.map(function(v){return Math.max(0,-v);});
  var maxA=gA.length?Math.max.apply(null,gA):0;
  var maxT=gT.length?Math.max.apply(null,gT):0;
  var ovA=gA.filter(function(v){return v>gtvA;}).length;
  var ovT=gT.filter(function(v){return v>gtvT;}).length;
  var vol=grpKw.reduce(function(s,v){return s+Math.abs(v);},0)*0.25/1000;
  document.getElementById('kOvlp').textContent=allTs.length;
  document.getElementById('kN').textContent=ap().companies.length;
  setKpi('kPA',maxA.toFixed(0),maxA>gtvA);setKpi('kPT',maxT.toFixed(0),maxT>gtvT);
  setKpi('kOA',ovA,ovA>0);setKpi('kOT',ovT,ovT>0);
  document.getElementById('kVol').textContent=vol.toFixed(1);
  try{drawJaar(allTs,perKw,grpKw,withData,gtvA,gtvT);}catch(e){console.error('drawJaar:',e);}
  try{drawWeek(allTs,grpKw,perKw,withData,gtvA,gtvT);}catch(e){console.error('drawWeek:',e);}
  try{drawBDK(perKw,gA,gT,withData,gtvA,gtvT);}catch(e){console.error('drawBDK:',e);}
  try{drawOvsch(allTs,gA,gT,gtvA,gtvT);}catch(e){console.error('drawOvsch:',e);}
  try{drawPiek(allTs,perKw,grpKw,withData);}catch(e){console.error('drawPiek:',e);}
  try{drawKosten(allTs,perKw,withData);}catch(e){console.error('drawKosten:',e);}
  notify('Analyse klaar — '+allTs.length+' overlappende kwartierwaarden');
}

function genDemo(idx){
  var data=[];var start=new Date('2024-01-01T00:00:00Z');
  var bases=[80,130,50,200,60];var peaks=[160,300,90,400,100];
  var base=bases[idx%5];var peak=peaks[idx%5];
  for(var d=0;d<365;d++){for(var q=0;q<96;q++){
    var dt=new Date(start.getTime()+(d*86400+q*900)*1000);
    var h=q/4;var dow=dt.getDay();var kw=base*0.15;
    if(dow>0&&dow<6&&h>=7&&h<=19)kw=base+peak*Math.sin(Math.PI*(h-7)/12)*(0.8+0.2*Math.random());
    if(dow>0&&dow<6&&h>=10&&h<=15&&idx%3===1)kw-=peak*0.4*Math.sin(Math.PI*(h-10)/5);
    data.push({ts:dt.toISOString().slice(0,16),kw:Math.round(kw*100)/100});
  }}return data;
}

// Exporteren / importeren / downloaden
async function doExportData(){
  try{
    var tsData={};
    for(var i=0;i<S.projects.length;i++){for(var j=0;j<S.projects[i].companies.length;j++){var c=S.projects[i].companies[j];var d=await dbGet('ts',c.id);if(d&&d.length)tsData[c.id]=d;}}
    var json=JSON.stringify({version:4,exportDate:new Date().toISOString(),state:S,timeseries:tsData});
    var bytes=new TextEncoder().encode(json);var bin='';var chunk=8192;
    for(var i=0;i<bytes.length;i+=chunk)bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+chunk));
    var a=document.createElement('a');
    a.setAttribute('href','data:application/json;base64,'+btoa(bin));
    a.setAttribute('download','egp-data-'+new Date().toISOString().slice(0,10)+'.json');
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    notify('Data geëxporteerd');
  }catch(e){notify('Export mislukt: '+e.message,false);}
}

async function doImportData(file){
  if(!file)return;
  var r=new FileReader();
  r.onload=async function(e){
    try{
      var obj=JSON.parse(e.target.result);
      if(!obj.state||!obj.timeseries){notify('Ongeldig bestand',false);return;}
      var nP=obj.state.projects?obj.state.projects.length:0;
      var nPt=Object.values(obj.timeseries).reduce(function(s,d){return s+d.length;},0);
      if(!confirm('Importeer '+nP+' project(en) met '+nPt.toLocaleString()+' meetpunten?'))return;
      var existIds={};S.projects.forEach(function(p){existIds[p.id]=p;});
      obj.state.projects.forEach(function(p){
        if(existIds[p.id]){var ex=existIds[p.id];var exCIds={};ex.companies.forEach(function(c){exCIds[c.id]=1;});p.companies.forEach(function(c){if(exCIds[c.id]){for(var i=0;i<ex.companies.length;i++){if(ex.companies[i].id===c.id){ex.companies[i]=c;break;}}}else ex.companies.push(c);});}
        else S.projects.push(p);
      });
      if(!S.activeId&&obj.state.activeId)S.activeId=obj.state.activeId;
      for(var id in obj.timeseries)await dbSet('ts',id,obj.timeseries[id]);
      await saveMeta();renderAll();notify('Geimporteerd: '+nP+' project(en)');
    }catch(err){notify('Import mislukt: '+err.message,false);}
  };
  r.readAsText(file,'UTF-8');
}

function doDownloadApp(){
  try{
    var html='<!DOCTYPE html>\n'+document.documentElement.outerHTML;
    var bytes=new TextEncoder().encode(html);var bin='';var chunk=8192;
    for(var i=0;i<bytes.length;i+=chunk)bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+chunk));
    var a=document.createElement('a');
    a.setAttribute('href','data:text/html;base64,'+btoa(bin));
    a.setAttribute('download','energiegroepsprofiel-impuls-zeeland.html');
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    notify('App gedownload!');
  }catch(e){
    var w=window.open('','_blank');
    if(w){w.document.write('<!DOCTYPE html>\n'+document.documentElement.outerHTML);w.document.close();notify('Geopend in nieuw tabblad — Ctrl+S om op te slaan');}
    else notify('Sta pop-ups toe',false);
  }
}

// Event listeners
document.addEventListener('DOMContentLoaded',function(){
  // Tabs
  document.querySelectorAll('.tab').forEach(function(btn){
    btn.addEventListener('click',function(){
      document.querySelectorAll('.pn').forEach(function(p){p.classList.remove('on');});
      document.querySelectorAll('.tab').forEach(function(b){b.classList.remove('on');});
      document.getElementById(btn.getAttribute('data-tab')).classList.add('on');
      btn.classList.add('on');
    });
  });
  // Prijs toggle
  document.querySelectorAll('#pTgl .tg').forEach(function(btn){
    btn.addEventListener('click',function(){setPT(btn.getAttribute('data-pt'));});
  });
  // Project select
  document.getElementById('projSel').addEventListener('change',function(){
    S.activeId=this.value;resetCH();renderAll();
  });
  // Header knoppen
  document.getElementById('btnNieuwProj').addEventListener('click',function(){showM('mProj');});
  document.getElementById('btnDelProj').addEventListener('click',delProj);
  document.getElementById('btnRapport').addEventListener('click',doExportRapport);
  document.getElementById('btnExpData').addEventListener('click',doExportData);
  document.getElementById('btnDlApp').addEventListener('click',doDownloadApp);
  document.getElementById('impIn').addEventListener('change',function(){doImportData(this.files[0]);this.value='';});
  // Zijbalk
  document.getElementById('btnAddComp').addEventListener('click',openAddComp);
  document.getElementById('btnRun').addEventListener('click',runAnalysis);
  // Gedelegeerd: bewerk-knoppen & checkboxen in zijbalk/tabel
  document.getElementById('cList').addEventListener('click',function(e){
    var editBtn=e.target.closest('[data-editid]');
    var chk=e.target.closest('.ck');
    if(editBtn)openEditComp(editBtn.getAttribute('data-editid'));
    else if(chk){var cid=chk.getAttribute('data-cid');var p=ap();var c=null;for(var i=0;i<p.companies.length;i++){if(p.companies[i].id===cid){c=p.companies[i];break;}}if(c){c.selected=c.selected===false?true:false;saveMeta();renderSidebar();renderOverzicht();}}
  });
  document.getElementById('ovBody').addEventListener('click',function(e){
    var editBtn=e.target.closest('[data-editid]');if(editBtn)openEditComp(editBtn.getAttribute('data-editid'));
  });
  // Modal sluiten
  document.getElementById('btnCloseProj').addEventListener('click',function(){hideM('mProj');});
  document.getElementById('btnCloseComp').addEventListener('click',function(){hideM('mComp');});
  document.getElementById('btnCloseRap').addEventListener('click',function(){hideM('mRap');});
  document.getElementById('mProj').addEventListener('click',function(e){if(e.target===this)hideM('mProj');});
  document.getElementById('mComp').addEventListener('click',function(e){if(e.target===this)hideM('mComp');});
  document.getElementById('mRap').addEventListener('click',function(e){if(e.target===this)hideM('mRap');});
  // Modal knoppen
  document.getElementById('btnCreateProj').addEventListener('click',createProj);
  document.getElementById('btnSaveComp').addEventListener('click',saveComp);
  document.getElementById('btnDelComp').addEventListener('click',deleteComp);
  document.getElementById('btnPrint').addEventListener('click',printRapport);
  // Zoom
  document.getElementById('btnZoomIn').addEventListener('click',function(){_jZoom=Math.max(0.03,_jZoom*0.5);panJ();});
  document.getElementById('btnZoomUit').addEventListener('click',function(){_jZoom=Math.min(1,_jZoom*2);panJ();});
  document.getElementById('btnZoomReset').addEventListener('click',function(){_jZoom=1;document.getElementById('jPan').value=0;panJ();});
  document.getElementById('jPan').addEventListener('input',panJ);
  document.getElementById('simSlider').addEventListener('input',updateSim);
  // Pieklijst filters
  document.getElementById('peakLimitA').addEventListener('change',function(){
    renderPeakTables(parseInt(this.value),parseInt(document.getElementById('peakLimitT').value));
  });
  document.getElementById('peakLimitT').addEventListener('change',function(){
    renderPeakTables(parseInt(document.getElementById('peakLimitA').value),parseInt(this.value));
  });
  // Upload
  initUpload();
});

// Opstarten
async function boot(){
  try{db=await openDB();await loadMeta();}catch(e){console.error(e);notify('IndexedDB niet beschikbaar',false);}
  renderAll();
}
boot();
