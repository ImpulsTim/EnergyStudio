function drawBDK(perKw,gA,gT,cos,gtvA,gtvT){
  dC('bdk');var N=500;
  // Drager-weergave: schaal naar de eenheid van de actieve drager (gas → m³/h) en laat
  // de GTV-referentielijnen weg als de drager geen contractvermogen kent.
  var _cv=(typeof _carrierView!=='undefined')?_carrierView:{unit:'kW',scale:1,showGtv:true};
  var SC=_cv.scale;
  function _scl(a){return a.map(function(v){return v==null?null:+(v*SC).toFixed(3);});}
  var xl=[];for(var i=0;i<N;i++)xl.push(Math.round(i/N*100)+'%');
  // Gecombineerde belastingduurkromme: rauwe signed groepsreeks (afname positief,
  // teruglevering negatief), aflopend gesorteerd → S-curve van meeste afname (links)
  // naar meeste teruglevering (rechts). gA/gT zijn Math.max(0,±v)-clamps van dezelfde
  // v, dus gA-gT reconstrueert de oorspronkelijke waarde exact (geen afrondingsverlies).
  var grpSigned=gA.map(function(v,i){return v-gT[i];});
  var grp=_scl(sdesc(grpSigned,N));
  var legBase='';for(var i=0;i<cos.length;i++)legBase+='<span class="li"><span class="ld" style="background:'+PAL[i%PAL.length]+'"></span>'+cos[i].name+'</span>';
  legBase+='<span class="li"><span class="ld" style="background:#242b38;width:14px;height:4px;border-radius:2px"></span><strong>Groep totaal</strong></span>';
  if(_cv.showGtv&&gtvA>0)legBase+='<span class="li"><span class="ld" style="background:#c0392b"></span>GTV afname</span>';
  if(_cv.showGtv&&gtvT>0)legBase+='<span class="li"><span class="ld" style="background:#e67e22"></span>GTV-T teruglevering</span>';
  document.getElementById('bdkLeg').innerHTML=legBase;
  function _bdkPct(items){if(!items||!items.length)return '';return (items[0].dataIndex/N*100).toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';}
  var gridColor=function(ctx){return ctx.tick.value===0?'#242b38':'#f3f7f4';};
  var gridWidth=function(ctx){return ctx.tick.value===0?2:0.5;};
  var opts={responsive:true,maintainAspectRatio:false,animation:false,
    plugins:{legend:{display:false},tooltip:{callbacks:{title:_bdkPct}}},
    scales:{x:Object.assign(ax('Tijdsduur (%)'),{ticks:Object.assign(ax().ticks,{maxTicksLimit:11})}),
      y:Object.assign(ax(_cv.unit),{beginAtZero:false,grid:{color:gridColor,lineWidth:gridWidth}})}};
  var dsCo=cos.map(function(c,i){return{label:c.name,data:_scl(sdesc(perKw[i],N)),borderColor:PAL[i%PAL.length],fill:false,tension:0,pointRadius:0,borderWidth:1.2,yAxisID:'y'};});
  var refs=[];
  if(_cv.showGtv&&gtvA>0)refs.push({label:'GTV',data:new Array(N).fill(gtvA),borderColor:'#c0392b',borderDash:[6,3],pointRadius:0,borderWidth:1.5,fill:false,yAxisID:'y'});
  if(_cv.showGtv&&gtvT>0)refs.push({label:'GTV-T',data:new Array(N).fill(-gtvT),borderColor:'#e67e22',borderDash:[4,4],pointRadius:0,borderWidth:1.5,fill:false,yAxisID:'y'});
  CH['bdk']=new Chart(document.getElementById('cBdk'),{type:'line',data:{labels:xl,datasets:dsCo.concat(refs).concat([
    {label:'Groep totaal',data:grp,borderColor:'#242b38',fill:false,tension:0,pointRadius:0,borderWidth:3.5,yAxisID:'y',order:0,
     segment:{borderColor:function(ctx){return ctx.p0.parsed.y>=0?'#46962b':'#fbba00';}}}
  ])},options:opts});
}
