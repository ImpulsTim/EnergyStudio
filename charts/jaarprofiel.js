function buildJaarLabels(ts,win){
  var seen={};
  return ts.map(function(t){
    var d=new Date(t);
    var key,label;
    if(win<=96){
      key=t;label=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
    } else if(win<=96*3){
      key=t.slice(0,13);
      if(!seen[key]){seen[key]=1;label=d.getDate()+' '+MND[d.getMonth()]+' '+String(d.getHours()).padStart(2,'0')+':00';}else label='';
    } else if(win<=96*14){
      key=t.slice(0,10);
      if(!seen[key]){seen[key]=1;label=d.getDate()+' '+MND[d.getMonth()];}else label='';
    } else {
      key=t.slice(0,7);
      if(!seen[key]){seen[key]=1;label=MND[d.getMonth()];}else label='';
    }
    return label||'';
  });
}

function panJ(){
  if(!_jaarState)return;
  var allTs=_jaarState.allTs;var grpKw=_jaarState.grpKw;
  var gtvA=_jaarState.gtvA;var gtvT=_jaarState.gtvT;
  var total=allTs.length;
  var win=Math.max(4,Math.round(total*_jZoom));
  var pct=parseInt(document.getElementById('jPan').value)/100;
  var maxStart=total-win;
  var si=Math.min(Math.max(0,Math.round(pct*maxStart)),maxStart);
  var slTs=allTs.slice(si,si+win);
  var slKw=grpKw.slice(si,si+win);
  var labels=buildJaarLabels(slTs,win);
  var days=Math.round(win/96);
  var lbl;
  if(win<=96)lbl=win+' kwartieren';
  else if(days<=1)lbl='1 dag';
  else if(days<=14)lbl=days+' dagen';
  else lbl=Math.round(days/30.5)+' mnd';
  document.getElementById('jZoomLbl').textContent=lbl;
  var N=Math.min(slTs.length,600);var step=Math.max(1,Math.floor(slTs.length/N));
  var sKw=slKw.filter(function(_,i){return i%step===0;});
  var sL=labels.filter(function(_,i){return i%step===0;});
  dC('jaarG');
  CH['jaarG']=new Chart(document.getElementById('cJaarG'),{type:'line',data:{labels:sL,datasets:[
    {label:'Vermogen groep',data:sKw,borderColor:'#46962b',backgroundColor:function(ctx){var v=ctx.raw;return v>=0?'rgba(70,150,43,.12)':'rgba(251,186,0,.12)';},fill:true,tension:0,pointRadius:0,borderWidth:2,segment:{borderColor:function(ctx){return ctx.p0.parsed.y>=0?'#46962b':'#fbba00';},backgroundColor:function(ctx){return ctx.p0.parsed.y>=0?'rgba(70,150,43,.08)':'rgba(251,186,0,.08)';}}},
    {label:'GTV '+gtvA+'kW',data:new Array(sKw.length).fill(gtvA),borderColor:'#c0392b',borderDash:[6,3],pointRadius:0,borderWidth:1.5,fill:false},
    {label:'GTV-T -'+gtvT+'kW',data:new Array(sKw.length).fill(-gtvT),borderColor:'#e67e22',borderDash:[4,4],pointRadius:0,borderWidth:1.5,fill:false},
  ]},options:{responsive:true,maintainAspectRatio:false,animation:false,
    plugins:{legend:{labels:{color:'#888',font:{family:'Barlow',size:11},boxWidth:10}}},
    scales:{
      x:{ticks:{color:'#999',font:{family:'Barlow',size:11},maxRotation:0,autoSkip:false,callback:function(v,i){return sL[i]||null;}},grid:{color:'#f3f7f4'}},
      y:{...ax('kW'),beginAtZero:false,grid:{color:function(ctx){return ctx.tick.value===0?'#242b38':'#f3f7f4';},lineWidth:function(ctx){return ctx.tick.value===0?2:0.5;}}}
    }}});
}

function drawJaar(allTs,perKw,grpKw,cos,gtvA,gtvT){
  dC('jaar');_jZoom=1;
  _jaarState={allTs:allTs,grpKw:grpKw,gtvA:gtvA,gtvT:gtvT};
  document.getElementById('jPan').value=0;panJ();
  var seen={};
  var rawLbl=allTs.map(function(ts){var mk=ts.slice(0,7);var d=new Date(ts);if(!seen[mk]){seen[mk]=1;return MND[d.getMonth()];}return'';});
  var N=Math.min(allTs.length,500);var step=Math.max(1,Math.floor(allTs.length/N));
  var perS=perKw.map(function(a){return a.filter(function(_,i){return i%step===0;});});
  var lblS=rawLbl.filter(function(_,i){return i%step===0;});
  var legHtml='';for(var i=0;i<cos.length;i++)legHtml+='<span class="li"><span class="ld" style="background:'+PAL[i%PAL.length]+'"></span>'+cos[i].name+'</span>';
  document.getElementById('jLeg').innerHTML=legHtml;
  CH['jaar']=new Chart(document.getElementById('cJaar'),{type:'line',data:{labels:lblS,datasets:cos.map(function(c,i){return{label:c.name,data:perS[i],borderColor:PAL[i%PAL.length],backgroundColor:'transparent',fill:false,tension:0,pointRadius:0,borderWidth:1.5};})},
    options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false}},
      scales:{
        x:{ticks:{color:'#999',font:{family:'Barlow',size:11},maxRotation:0,autoSkip:false,callback:function(v,i){return lblS[i]||null;}},grid:{color:'#f3f7f4'}},
        y:{...ax('kW'),grid:{color:function(ctx){return ctx.tick.value===0?'#242b38':'#f3f7f4';},lineWidth:function(ctx){return ctx.tick.value===0?2:0.5;}}}
      }}});
}
