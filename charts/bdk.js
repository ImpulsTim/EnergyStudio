function drawBDK(perKw,gA,gT,cos,gtvA,gtvT){
  dC('bdk');dC('bdkT');var N=500;
  // Drager-weergave: schaal naar de eenheid van de actieve drager (gas → m³/h) en laat
  // de GTV-referentielijnen weg als de drager geen contractvermogen kent.
  var _cv=(typeof _carrierView!=='undefined')?_carrierView:{unit:'kW',scale:1,showGtv:true};
  var SC=_cv.scale;
  function _scl(a){return a.map(function(v){return v==null?null:+(v*SC).toFixed(3);});}
  var xl=[];for(var i=0;i<N;i++)xl.push(Math.round(i/N*100)+'%');
  var grpA=_scl(sdesc(gA,N));var grpT=_scl(sdesc(gT,N));
  var legBase='';for(var i=0;i<cos.length;i++)legBase+='<span class="li"><span class="ld" style="background:'+PAL[i%PAL.length]+'"></span>'+cos[i].name+'</span>';
  legBase+='<span class="li"><span class="ld" style="background:#242b38;width:14px;height:4px;border-radius:2px"></span><strong>Groep totaal</strong></span>';
  document.getElementById('bdkLeg').innerHTML=legBase;
  document.getElementById('bdkLegT').innerHTML=legBase;
  function _bdkPct(items){if(!items||!items.length)return '';return (items[0].dataIndex/N*100).toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';}
  var baseOpts={responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false},tooltip:{callbacks:{title:_bdkPct}}},scales:{x:Object.assign(ax('Tijdsduur (%)'),{ticks:Object.assign(ax().ticks,{maxTicksLimit:11})}),y:ax(_cv.unit)}};
  var dsA=cos.map(function(c,i){return{label:c.name,data:_scl(sdesc(perKw[i].map(function(v){return Math.max(0,v);}),N)),borderColor:PAL[i%PAL.length],fill:false,tension:0,pointRadius:0,borderWidth:1.2,yAxisID:'y'};});
  CH['bdk']=new Chart(document.getElementById('cBdk'),{type:'line',data:{labels:xl,datasets:dsA.concat(
    (_cv.showGtv?[{label:'GTV',data:new Array(N).fill(gtvA),borderColor:'#c0392b',borderDash:[6,3],pointRadius:0,borderWidth:1.5,fill:false,yAxisID:'y'}]:[]).concat([
    {label:'Groep totaal',data:grpA,borderColor:'#242b38',fill:false,tension:0,pointRadius:0,borderWidth:3.5,yAxisID:'y',order:0}]))},options:baseOpts});
  var dsT=cos.map(function(c,i){return{label:c.name,data:_scl(sdesc(perKw[i].map(function(v){return Math.max(0,-v);}),N)),borderColor:PAL[i%PAL.length],fill:false,tension:0,pointRadius:0,borderWidth:1.2,yAxisID:'y'};});
  CH['bdkT']=new Chart(document.getElementById('cBdkT'),{type:'line',data:{labels:xl,datasets:dsT.concat(
    (_cv.showGtv?[{label:'GTV-T',data:new Array(N).fill(gtvT),borderColor:'#e67e22',borderDash:[4,4],pointRadius:0,borderWidth:1.5,fill:false,yAxisID:'y'}]:[]).concat([
    {label:'Groep totaal',data:grpT,borderColor:'#242b38',fill:false,tension:0,pointRadius:0,borderWidth:3.5,yAxisID:'y',order:0}]))},options:baseOpts});
}
