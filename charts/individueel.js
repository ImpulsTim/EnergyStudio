// Individuele-analyse grafieken — eigen canvassen (cInd*), losgekoppeld van de
// GTO-grafieken zodat beide naast elkaar kunnen bestaan. Hergebruikt de gedeelde
// helpers uit charts/jaarprofiel.js (_jDecimate/_jFormatTick/_jTipTitle) en app.js
// (ax, dC, CH, PAL, MND, mndLabel). De globale huisstijl-tooltip/crosshair (app.js)
// komt automatisch mee: assen krijgen via ax() een eenheidstitel en vlakke GTV-lijnen
// worden in de tooltip weggefilterd.

// 1) Jaarprofiel — signed vermogen, afname (groen) boven 0, teruglevering (geel)
//    onder 0, met GTV/GTV-T-referentielijnen en een geaccentueerde 0-lijn. Zelfde
//    drag-to-zoom + datumbereik + preset-knoppen als GTO's jaarprofiel (charts/
//    jaarprofiel.js panJ()/_jSetupDragZoom()), hier op één enkele signed reeks.
var _indJaarState=null;   // {ts,kw,gtvA,gtvT} — volledige, ongedecimeerde reeks
var _indJDragHandlers=null;

function _indJSetupDragZoom(){
  if(_indJDragHandlers){
    var h=_indJDragHandlers;
    h.canvas.removeEventListener('mousedown',h.down);
    document.removeEventListener('mousemove',h.move);
    document.removeEventListener('mouseup',h.up);
    document.removeEventListener('keydown',h.key);
    _indJDragHandlers=null;
  }
  var canvas=document.getElementById('cIndJaar');
  if(!canvas)return;
  var wrapper=canvas.parentElement;
  wrapper.style.position='relative';
  canvas.style.cursor='crosshair';
  var selDiv=document.getElementById('indJZoomSel');
  if(!selDiv){
    selDiv=document.createElement('div');
    selDiv.id='indJZoomSel';
    selDiv.style.cssText='position:absolute;top:0;height:100%;background:rgba(70,150,43,.12);border-left:2px solid rgba(70,150,43,.7);border-right:2px solid rgba(70,150,43,.7);display:none;pointer-events:none';
    wrapper.appendChild(selDiv);
  }
  var dragX=null;
  var onDown=function(e){
    if(e.button!==0)return;
    var rect=canvas.getBoundingClientRect();
    dragX=e.clientX-rect.left;
    selDiv.style.left=dragX+'px';selDiv.style.width='0';selDiv.style.display='block';
  };
  var onMove=function(e){
    if(dragX===null)return;
    var rect=canvas.getBoundingClientRect();
    var x=e.clientX-rect.left;
    selDiv.style.left=Math.min(dragX,x)+'px';
    selDiv.style.width=Math.abs(x-dragX)+'px';
  };
  var onUp=function(e){
    if(dragX===null)return;
    var rect=canvas.getBoundingClientRect();
    var x=e.clientX-rect.left;
    var x0=Math.min(dragX,x),x1=Math.max(dragX,x);
    dragX=null;selDiv.style.display='none';
    if(x1-x0<8)return;
    var chart=CH['indJaar'];
    if(!chart)return;
    var scale=chart.scales.x;
    var labels=chart.data.labels;
    var i0=Math.max(0,Math.round(scale.getValueForPixel(x0)));
    var i1=Math.min(labels.length-1,Math.round(scale.getValueForPixel(x1)));
    if(i0>=i1)return;
    var ts0=labels[i0],ts1=labels[i1];
    if(!ts0||!ts1)return;
    var startEl=document.getElementById('indJDateStart');
    var endEl=document.getElementById('indJDateEnd');
    if(startEl)startEl.value=ts0.slice(0,10);
    if(endEl)endEl.value=ts1.slice(0,10);
    panIndJaar();
  };
  var onKey=function(e){if(e.key==='Escape'&&dragX!==null){dragX=null;selDiv.style.display='none';}};
  canvas.addEventListener('mousedown',onDown);
  document.addEventListener('mousemove',onMove);
  document.addEventListener('mouseup',onUp);
  document.addEventListener('keydown',onKey);
  _indJDragHandlers={canvas:canvas,down:onDown,move:onMove,up:onUp,key:onKey};
}

function panIndJaar(){
  if(!_indJaarState)return;
  var ts=_indJaarState.ts,kw=_indJaarState.kw,gtvA=_indJaarState.gtvA,gtvT=_indJaarState.gtvT;
  var startEl=document.getElementById('indJDateStart');
  var endEl=document.getElementById('indJDateEnd');
  var si=0,ei=ts.length-1;
  if(startEl&&startEl.value){var sv=startEl.value;while(si<ts.length-1&&ts[si].slice(0,10)<sv)si++;}
  if(endEl&&endEl.value){var ev=endEl.value;while(ei>si&&ts[ei].slice(0,10)>ev)ei--;}
  var slTs=ts.slice(si,ei+1),slKw=kw.slice(si,ei+1);
  if(!slTs.length)return;
  var span=new Date(slTs[slTs.length-1]).getTime()-new Date(slTs[0]).getTime();
  var dec=(typeof _jDecimate==='function')?_jDecimate(slKw,slTs,1400):{kw:slKw,ts:slTs};
  var days=Math.round(slTs.length/96);
  var lblEl=document.getElementById('indJZoomLbl');
  if(lblEl)lblEl.textContent=days<=1?'1 dag':days<=14?days+' dagen':days<=60?Math.round(days/7)+' weken':Math.round(days/30.5)+' maanden';
  var gridColor=function(ctx){return ctx.tick.value===0?'#242b38':'#f3f7f4';};
  var gridWidth=function(ctx){return ctx.tick.value===0?2:0.5;};
  var refs=[];
  if(gtvA>0)refs.push({label:'GTV '+gtvA+'kW',data:new Array(dec.kw.length).fill(gtvA),borderColor:'#c0392b',borderDash:[6,3],pointRadius:0,borderWidth:1.5,fill:false});
  if(gtvT>0)refs.push({label:'GTV-T -'+gtvT+'kW',data:new Array(dec.kw.length).fill(-gtvT),borderColor:'#e67e22',borderDash:[4,4],pointRadius:0,borderWidth:1.5,fill:false});
  dC('indJaar');
  var cv=document.getElementById('cIndJaar');
  if(!cv)return;
  CH['indJaar']=new Chart(cv,{
    type:'line',
    data:{labels:dec.ts,datasets:[{
      label:'Vermogen',data:dec.kw,
      borderColor:'#46962b',
      backgroundColor:function(ctx){return ctx.raw>=0?'rgba(70,150,43,.12)':'rgba(251,186,0,.12)';},
      fill:true,tension:0,pointRadius:0,borderWidth:1.6,
      segment:{
        borderColor:function(ctx){return ctx.p0.parsed.y>=0?'#46962b':'#fbba00';},
        backgroundColor:function(ctx){return ctx.p0.parsed.y>=0?'rgba(70,150,43,.10)':'rgba(251,186,0,.10)';}
      }
    }].concat(refs)},
    options:{responsive:true,maintainAspectRatio:false,animation:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{title:(typeof _jTipTitle==='function')?_jTipTitle:undefined}}},
      scales:{
        x:{ticks:{color:'#999',font:{family:'Barlow',size:11},maxRotation:0,autoSkip:true,maxTicksLimit:12,
          callback:function(value){var t=this.getLabelForValue(value);return t?((typeof _jFormatTick==='function')?_jFormatTick(t,span):t):null;}},grid:{color:'#f3f7f4'}},
        y:Object.assign(ax('kW'),{beginAtZero:false,grid:{color:gridColor,lineWidth:gridWidth}})
      }
    }
  });
  _indJSetupDragZoom();
}

function setIndJaarPreset(days){
  if(!_indJaarState)return;
  var ts=_indJaarState.ts;
  var startEl=document.getElementById('indJDateStart');
  var endEl=document.getElementById('indJDateEnd');
  if(!startEl||!endEl||!ts.length)return;
  var lastDate=ts[ts.length-1].slice(0,10);
  if(days===0){startEl.value=ts[0].slice(0,10);endEl.value=lastDate;}
  else{
    var endMs=new Date(lastDate+'T00:00:00').getTime();
    var startMs=endMs-(days-1)*86400000;
    startEl.value=new Date(startMs).toISOString().slice(0,10);
    endEl.value=lastDate;
  }
  panIndJaar();
}

function drawIndJaar(ts,kw,gtvA,gtvT){
  _indJaarState={ts:ts,kw:kw,gtvA:gtvA,gtvT:gtvT};
  var startEl=document.getElementById('indJDateStart');
  var endEl=document.getElementById('indJDateEnd');
  if(startEl&&endEl&&ts.length){
    var minDate=ts[0].slice(0,10),maxDate=ts[ts.length-1].slice(0,10);
    startEl.min=endEl.min=minDate;startEl.max=endEl.max=maxDate;
    startEl.value=minDate;endEl.value=maxDate;
  }
  panIndJaar();
}

// 2) Netto verbruik per maand — staaf per maand, groen (netto afname) of geel (netto
//    teruglevering); geaccentueerde 0-lijn.
function drawIndMaand(maand){
  dC('indMaand');
  var cv=document.getElementById('cIndMaand');
  if(!cv)return;
  var keys=(maand&&maand.keys)||[];
  var labels=keys.map(function(k){return (typeof mndLabel==='function')?mndLabel(keys,k):k;});
  var data=(maand&&maand.nettoKwh)||[];
  var colors=data.map(function(v){return v>=0?'rgba(70,150,43,.8)':'rgba(251,186,0,.85)';});
  var zeroGrid={color:function(ctx){return ctx.tick.value===0?'#242b38':'#f3f7f4';},lineWidth:function(ctx){return ctx.tick.value===0?2:0.5;}};
  CH['indMaand']=new Chart(cv,{
    type:'bar',
    data:{labels:labels,datasets:[{label:'Netto verbruik',data:data,backgroundColor:colors,borderRadius:4}]},
    options:{responsive:true,maintainAspectRatio:false,animation:false,
      plugins:{legend:{display:false}},
      scales:{x:Object.assign(ax(),{grid:{display:false}}),y:Object.assign(ax('kWh'),{grid:zeroGrid})}}
  });
}

// 3) Weekprofiel — gemiddeld vermogen + min/max-band over ma–zo (7×96 kwartieren),
//    met GTV/GTV-T-referentielijnen en geaccentueerde 0-lijn (patroon weekprofiel.js).
//    Seizoensfilter zoals de GTO (weekprofiel.js): de kwartierslots worden uit de ruwe
//    reeks herberekend over alle maanden of alleen de geselecteerde maand, zodat de
//    seizoensinvloed op het weekpatroon zichtbaar wordt.
var _indWCache=null;        // {ts,kw,gtvA,gtvT} — ruwe reeks + GTV-referenties
var _indWMonthFilter=null;  // null = alle maanden, 0–11 = specifieke maand

function drawIndWeek(serie,gtvA,gtvT){
  _indWCache={ts:(serie&&serie.ts)||[],kw:(serie&&serie.kw)||[],gtvA:gtvA,gtvT:gtvT};
  _indWMonthFilter=null;
  _renderIndWeek();
}

function _renderIndWeek(){
  if(!_indWCache)return;
  dC('indWeek');
  var cv=document.getElementById('cIndWeek');
  if(!cv)return;
  var ts=_indWCache.ts,kw=_indWCache.kw,gtvA=_indWCache.gtvA,gtvT=_indWCache.gtvT,mf=_indWMonthFilter;
  var S2=7*96;
  // Kwartierslots (ma 00:00 … zo 23:45) opnieuw opbouwen, eventueel op één maand.
  var slots=new Array(S2);
  for(var q=0;q<ts.length;q++){
    var v=kw[q];
    if(v==null)continue;
    var d=new Date(ts[q]);
    if(isNaN(d))continue;
    if(mf!==null&&d.getMonth()!==mf)continue;
    var sl=((d.getDay()+6)%7)*96+Math.floor((d.getHours()*60+d.getMinutes())/15);
    if(sl<0||sl>=S2)continue;
    var o=slots[sl]||(slots[sl]={sum:0,n:0,mn:Infinity,mx:-Infinity});
    o.sum+=v;o.n++;if(v<o.mn)o.mn=v;if(v>o.mx)o.mx=v;
  }
  var avg=new Array(S2),mn=new Array(S2),mx=new Array(S2);
  for(var w=0;w<S2;w++){
    var s=slots[w];
    if(s&&s.n){avg[w]=+(s.sum/s.n).toFixed(2);mn[w]=+s.mn.toFixed(2);mx[w]=+s.mx.toFixed(2);}
    else{avg[w]=null;mn[w]=null;mx[w]=null;}
  }
  var DN=['Ma','Di','Wo','Do','Vr','Za','Zo'];
  var lb=[];
  for(var i=0;i<S2;i++){
    var dow=Math.floor(i/96),h=Math.floor((i%96)/4),m=(i%4)*15;
    lb.push(i%96===0?DN[dow]:(h%6===0&&m===0?(String(h).padStart(2,'0')+':00'):''));
  }
  function _wTip(items){if(!items||!items.length)return'';var i=items[0].dataIndex;var dow=Math.floor(i/96),h=Math.floor((i%96)/4),mm=(i%4)*15;return DN[dow]+' '+String(h).padStart(2,'0')+':'+String(mm).padStart(2,'0');}
  var zeroLine={color:function(ctx){return ctx.tick.value===0?'#242b38':'#f3f7f4';},lineWidth:function(ctx){return ctx.tick.value===0?2:0.5;}};
  var ds=[
    {label:'Max',data:mx,borderColor:'rgba(70,150,43,.45)',backgroundColor:'rgba(70,150,43,.09)',fill:'+1',tension:.3,pointRadius:0,borderWidth:1.5,borderDash:[4,3],spanGaps:true},
    {label:'Min',data:mn,borderColor:'rgba(70,150,43,.45)',fill:false,tension:.3,pointRadius:0,borderWidth:1.5,borderDash:[4,3],spanGaps:true},
    {label:'Gemiddeld',data:avg,borderColor:'#46962b',fill:false,tension:.3,pointRadius:0,borderWidth:2,spanGaps:true}
  ];
  if(gtvA>0)ds.push({label:'GTV',data:new Array(S2).fill(gtvA),borderColor:'#c0392b',borderDash:[6,3],pointRadius:0,borderWidth:1.5,fill:false});
  if(gtvT>0)ds.push({label:'GTV-T',data:new Array(S2).fill(-gtvT),borderColor:'#e67e22',borderDash:[4,4],pointRadius:0,borderWidth:1.5,fill:false});
  CH['indWeek']=new Chart(cv,{
    type:'line',data:{labels:lb,datasets:ds},
    options:{responsive:true,maintainAspectRatio:false,animation:false,
      plugins:{legend:{labels:{color:'#888',font:{family:'Barlow',size:11},boxWidth:10}},tooltip:{callbacks:{title:_wTip}}},
      scales:{x:{ticks:{color:'#999',font:{family:'Barlow',size:11},maxTicksLimit:20,autoSkip:false,callback:function(v,i){return lb[i]||null;}},grid:{color:'#f3f7f4'}},
        y:Object.assign(ax('kW'),{grid:zeroLine})}}
  });
  _updateIndWeekFilterBtns();
}

function _updateIndWeekFilterBtns(){
  var btns=document.querySelectorAll('#indWeekMFilter button');
  btns.forEach(function(btn){
    var val=btn.getAttribute('data-mf');
    var isActive=val==='all'?_indWMonthFilter===null:parseInt(val,10)===_indWMonthFilter;
    btn.style.background=isActive?'#46962b':'#eef2ec';
    btn.style.color=isActive?'#fff':'#555';
    btn.style.fontWeight=isActive?'700':'400';
  });
}

function setIndWeekMonthFilter(val){
  _indWMonthFilter=val==='all'?null:parseInt(val,10);
  _renderIndWeek();
}

// 4) Belastingduurkromme — signed vermogen, aflopend gesorteerd van meeste afname
//    (links) naar meeste teruglevering (rechts); zelfde S-curve-conventie als bdk.js.
//    Analoge drag-to-zoom als het jaarprofiel, maar op het %-van-de-tijd-bereik i.p.v.
//    datums: bij inzoomen wordt opnieuw gesampled vanuit de volledig gesorteerde reeks
//    (bdkFull) zodat het gezoomde deelbereik scherp blijft i.p.v. de 500-punts weergave.
var _indBdkState=null;    // {full,gtvA,gtvT} — volledig gesorteerde signed reeks
var _indBdkWindow=null;   // {s,e} huidige zoomvenster (indices in `full`)
var _indBdkDragHandlers=null;

function _indBdkSetupDragZoom(){
  if(_indBdkDragHandlers){
    var h=_indBdkDragHandlers;
    h.canvas.removeEventListener('mousedown',h.down);
    document.removeEventListener('mousemove',h.move);
    document.removeEventListener('mouseup',h.up);
    document.removeEventListener('keydown',h.key);
    _indBdkDragHandlers=null;
  }
  var canvas=document.getElementById('cIndBdk');
  if(!canvas)return;
  var wrapper=canvas.parentElement;
  wrapper.style.position='relative';
  canvas.style.cursor='crosshair';
  var selDiv=document.getElementById('indBdkZoomSel');
  if(!selDiv){
    selDiv=document.createElement('div');
    selDiv.id='indBdkZoomSel';
    selDiv.style.cssText='position:absolute;top:0;height:100%;background:rgba(70,150,43,.12);border-left:2px solid rgba(70,150,43,.7);border-right:2px solid rgba(70,150,43,.7);display:none;pointer-events:none';
    wrapper.appendChild(selDiv);
  }
  var dragX=null;
  var onDown=function(e){
    if(e.button!==0)return;
    var rect=canvas.getBoundingClientRect();
    dragX=e.clientX-rect.left;
    selDiv.style.left=dragX+'px';selDiv.style.width='0';selDiv.style.display='block';
  };
  var onMove=function(e){
    if(dragX===null)return;
    var rect=canvas.getBoundingClientRect();
    var x=e.clientX-rect.left;
    selDiv.style.left=Math.min(dragX,x)+'px';
    selDiv.style.width=Math.abs(x-dragX)+'px';
  };
  var onUp=function(e){
    if(dragX===null)return;
    var rect=canvas.getBoundingClientRect();
    var x=e.clientX-rect.left;
    var x0=Math.min(dragX,x),x1=Math.max(dragX,x);
    dragX=null;selDiv.style.display='none';
    if(x1-x0<8)return;
    var chart=CH['indBdk'];
    if(!chart||!_indBdkState||!_indBdkWindow)return;
    var scale=chart.scales.x;
    var nLocal=chart.data.labels.length;
    var li0=Math.max(0,Math.round(scale.getValueForPixel(x0)));
    var li1=Math.min(nLocal-1,Math.round(scale.getValueForPixel(x1)));
    if(li0>=li1)return;
    // lokale chart-index (binnen het huidige zoomvenster) → index in de volledige reeks
    var win=_indBdkWindow,span=win.e-win.s;
    var newS=win.s+Math.round(li0/Math.max(1,nLocal-1)*span);
    var newE=win.s+Math.round(li1/Math.max(1,nLocal-1)*span);
    panIndBdk(newS,newE);
  };
  var onKey=function(e){if(e.key==='Escape'&&dragX!==null){dragX=null;selDiv.style.display='none';}};
  canvas.addEventListener('mousedown',onDown);
  document.addEventListener('mousemove',onMove);
  document.addEventListener('mouseup',onUp);
  document.addEventListener('keydown',onKey);
  _indBdkDragHandlers={canvas:canvas,down:onDown,move:onMove,up:onUp,key:onKey};
}

function panIndBdk(i0,i1){
  if(!_indBdkState)return;
  var full=_indBdkState.full||[],gtvA=_indBdkState.gtvA,gtvT=_indBdkState.gtvT;
  var n=full.length;
  if(!n)return;
  var s=(i0==null)?0:Math.max(0,i0);
  var e=(i1==null)?n-1:Math.min(n-1,i1);
  if(e<=s)e=Math.min(n-1,s+1);
  _indBdkWindow={s:s,e:e};
  var sub=full.slice(s,e+1);
  var N=Math.min(500,sub.length);
  var bdkView=(typeof sdesc==='function')?sdesc(sub,N):sub;
  var pctStart=s/n*100,pctEnd=(e+1)/n*100;
  var xl=bdkView.map(function(v,i){
    var pct=bdkView.length>1?(pctStart+(pctEnd-pctStart)*i/(bdkView.length-1)):pctStart;
    return pct.toLocaleString('nl-NL',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
  });
  var lblEl=document.getElementById('indBdkZoomLbl');
  if(lblEl)lblEl.textContent=(s===0&&e===n-1)?'Volledig bereik':
    pctStart.toLocaleString('nl-NL',{maximumFractionDigits:1})+'% – '+pctEnd.toLocaleString('nl-NL',{maximumFractionDigits:1})+'%';
  var gridColor=function(ctx){return ctx.tick.value===0?'#242b38':'#f3f7f4';};
  var gridWidth=function(ctx){return ctx.tick.value===0?2:0.5;};
  var refs=[];
  if(gtvA>0)refs.push({label:'GTV',data:new Array(bdkView.length).fill(gtvA),borderColor:'#c0392b',borderDash:[6,3],pointRadius:0,borderWidth:1.5,fill:false});
  if(gtvT>0)refs.push({label:'GTV-T',data:new Array(bdkView.length).fill(-gtvT),borderColor:'#e67e22',borderDash:[4,4],pointRadius:0,borderWidth:1.5,fill:false});
  function _tipTitle(items){return items&&items.length?items[0].label:'';}
  dC('indBdk');
  var cv=document.getElementById('cIndBdk');
  if(!cv)return;
  CH['indBdk']=new Chart(cv,{type:'line',data:{labels:xl,datasets:[{
    label:'Vermogen',data:bdkView,borderColor:'#46962b',
    backgroundColor:function(ctx){return ctx.raw>=0?'rgba(70,150,43,.10)':'rgba(251,186,0,.10)';},
    fill:true,tension:0,pointRadius:0,borderWidth:2,
    segment:{borderColor:function(ctx){return ctx.p0.parsed.y>=0?'#46962b':'#fbba00';},
             backgroundColor:function(ctx){return ctx.p0.parsed.y>=0?'rgba(70,150,43,.10)':'rgba(251,186,0,.10)';}}
  }].concat(refs)},options:{responsive:true,maintainAspectRatio:false,animation:false,
    plugins:{legend:{display:false},tooltip:{callbacks:{title:_tipTitle}}},
    scales:{x:Object.assign(ax('Tijdsduur (%)'),{ticks:Object.assign(ax().ticks,{maxTicksLimit:11})}),
      y:Object.assign(ax('kW'),{beginAtZero:false,grid:{color:gridColor,lineWidth:gridWidth}})}}});
  _indBdkSetupDragZoom();
}

function resetIndBdkZoom(){panIndBdk(null,null);}

function drawIndBdk(bdk,bdkFull,gtvA,gtvT){
  _indBdkState={full:(bdkFull&&bdkFull.length?bdkFull:bdk)||[],gtvA:gtvA,gtvT:gtvT};
  panIndBdk(null,null);
}
