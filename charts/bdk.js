function drawBDK(perKw,gA,gT,cos,gtvA,gtvT){
  dC('bdk');dC('bdkT');var N=500;
  var xl=[];for(var i=0;i<N;i++)xl.push(Math.round(i/N*100)+'%');
  function cumul(sorted){var s=0;return sorted.map(function(v){s+=v*0.25;return+(s/1000).toFixed(3);});}
  var grpA=sdesc(gA,N);var grpT=sdesc(gT,N);
  var legBase='';for(var i=0;i<cos.length;i++)legBase+='<span class="li"><span class="ld" style="background:'+PAL[i%PAL.length]+'"></span>'+cos[i].name+'</span>';
  legBase+='<span class="li"><span class="ld" style="background:#242b38;width:14px;height:4px;border-radius:2px"></span><strong>Groep totaal</strong></span>';
  document.getElementById('bdkLeg').innerHTML=legBase;
  document.getElementById('bdkLegT').innerHTML=legBase;
  var baseOpts={responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false}},scales:{x:Object.assign(ax('Tijdsduur (%)'),{ticks:Object.assign(ax().ticks,{maxTicksLimit:11})}),y:ax('kW')}};
  var dsA=cos.map(function(c,i){return{label:c.name,data:sdesc(perKw[i].map(function(v){return Math.max(0,v);}),N),borderColor:PAL[i%PAL.length],fill:false,tension:0,pointRadius:0,borderWidth:1.2,yAxisID:'y'};});
  CH['bdk']=new Chart(document.getElementById('cBdk'),{type:'line',data:{labels:xl,datasets:dsA.concat([
    {label:'GTV',data:new Array(N).fill(gtvA),borderColor:'#c0392b',borderDash:[6,3],pointRadius:0,borderWidth:1.5,fill:false,yAxisID:'y'},
    {label:'Groep totaal',data:grpA,borderColor:'#242b38',fill:false,tension:0,pointRadius:0,borderWidth:3.5,yAxisID:'y',order:0},
  ])},options:baseOpts});
  var dsT=cos.map(function(c,i){return{label:c.name,data:sdesc(perKw[i].map(function(v){return Math.max(0,-v);}),N),borderColor:PAL[i%PAL.length],fill:false,tension:0,pointRadius:0,borderWidth:1.2,yAxisID:'y'};});
  CH['bdkT']=new Chart(document.getElementById('cBdkT'),{type:'line',data:{labels:xl,datasets:dsT.concat([
    {label:'GTV-T',data:new Array(N).fill(gtvT),borderColor:'#e67e22',borderDash:[4,4],pointRadius:0,borderWidth:1.5,fill:false,yAxisID:'y'},
    {label:'Groep totaal',data:grpT,borderColor:'#242b38',fill:false,tension:0,pointRadius:0,borderWidth:3.5,yAxisID:'y',order:0},
  ])},options:baseOpts});
}
