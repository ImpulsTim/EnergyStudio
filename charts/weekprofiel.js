function drawWeek(allTs,grpKw,perKw,cos,gtvA,gtvT){
  dC('week');dC('weekP');
  var S2=7*96;var gs=[];var ps=[];
  for(var i=0;i<S2;i++){gs.push([]);}
  for(var ci=0;ci<cos.length;ci++){var arr=[];for(var i=0;i<S2;i++)arr.push([]);ps.push(arr);}
  allTs.forEach(function(ts,i){
    var d=new Date(ts);var dow=(d.getDay()+6)%7;var sl=dow*96+Math.floor((d.getHours()*60+d.getMinutes())/15);
    if(sl<0||sl>=S2)return;
    gs[sl].push(grpKw[i]);
    for(var ci=0;ci<cos.length;ci++)ps[ci][sl].push(perKw[ci][i]);
  });
  var avg=gs.map(function(s){return s.length?+(s.reduce(function(a,b){return a+b;},0)/s.length).toFixed(2):null;});
  var mn=gs.map(function(s){return s.length?+Math.min.apply(null,s).toFixed(2):null;});
  var mx=gs.map(function(s){return s.length?+Math.max.apply(null,s).toFixed(2):null;});
  var DN=['Ma','Di','Wo','Do','Vr','Za','Zo'];
  var lb=[];for(var i=0;i<S2;i++){var dow=Math.floor(i/96);var h=Math.floor((i%96)/4);var m=(i%4)*15;lb.push(i%96===0?DN[dow]:(h%6===0&&m===0?(String(h).padStart(2,'0')+':00'):''));}
  var zeroLine={color:function(ctx){return ctx.tick.value===0?'#242b38':'#f3f7f4';},lineWidth:function(ctx){return ctx.tick.value===0?2:0.5;}};
  var tOpts={responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#888',font:{family:'Barlow',size:11},boxWidth:10}}},scales:{x:{ticks:{color:'#999',font:{family:'Barlow',size:11},maxTicksLimit:20,autoSkip:false,callback:function(v,i){return lb[i]||null;}},grid:{color:'#f3f7f4'}},y:Object.assign(ax('kW'),{grid:zeroLine})}};
  CH['week']=new Chart(document.getElementById('cWeek'),{type:'line',data:{labels:lb,datasets:[
    {label:'Max',data:mx,borderColor:'rgba(166,214,204,.5)',backgroundColor:'rgba(166,214,204,.12)',fill:'+1',tension:.3,pointRadius:0,borderWidth:1},
    {label:'Min',data:mn,borderColor:'rgba(166,214,204,.5)',fill:false,tension:.3,pointRadius:0,borderWidth:1},
    {label:'Gemiddeld',data:avg,borderColor:'#46962b',fill:false,tension:.3,pointRadius:0,borderWidth:2.5},
    {label:'GTV '+gtvA+'kW',data:new Array(S2).fill(gtvA),borderColor:'#c0392b',borderDash:[6,3],pointRadius:0,borderWidth:1.5,fill:false},
    {label:'GTV-T -'+gtvT+'kW',data:new Array(S2).fill(-gtvT),borderColor:'#e67e22',borderDash:[4,4],pointRadius:0,borderWidth:1.5,fill:false},
  ]},options:tOpts});
  var legHtml='';for(var i=0;i<cos.length;i++)legHtml+='<span class="li"><span class="ld" style="background:'+PAL[i%PAL.length]+'"></span>'+cos[i].name+'</span>';
  document.getElementById('wLeg').innerHTML=legHtml;
  CH['weekP']=new Chart(document.getElementById('cWeekP'),{type:'line',data:{labels:lb,datasets:cos.map(function(c,i){return{label:c.name,data:ps[i].map(function(s){return s.length?+(s.reduce(function(a,b){return a+b;},0)/s.length).toFixed(2):null;}),borderColor:PAL[i%PAL.length],fill:false,tension:.3,pointRadius:0,borderWidth:1.8};})},options:Object.assign({},tOpts,{plugins:{legend:{display:false}}})});
}
