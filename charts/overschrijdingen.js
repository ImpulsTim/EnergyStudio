// Opgeslagen piekdata voor gebruik door renderPeakTables
var _peaksA=[], _peaksT=[];

function drawOvsch(allTs,gA,gT,gtvA,gtvT){
  dC('ovsch');
  var ovA=new Array(12).fill(0);var ovT=new Array(12).fill(0);
  allTs.forEach(function(ts,i){var m=parseInt(ts.slice(5,7))-1;if(gA[i]>gtvA)ovA[m]++;if(gT[i]>gtvT)ovT[m]++;});
  CH['ovsch']=new Chart(document.getElementById('cOvsch'),{type:'bar',data:{labels:MND,datasets:[
    {label:'Afname overschr.',data:ovA,backgroundColor:'rgba(192,57,43,.75)',borderRadius:4},
    {label:'Teruglevering overschr.',data:ovT,backgroundColor:'rgba(230,126,34,.75)',borderRadius:4},
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#888',font:{family:'Barlow',size:11},boxWidth:10}}},scales:{x:Object.assign(ax(),{grid:{display:false}}),y:ax('Kwartierwaarden')}}});

  _peaksA=allTs.map(function(ts,i){return{ts:ts,kw:gA[i],gtv:gtvA};}).sort(function(a,b){return b.kw-a.kw;});
  _peaksT=allTs.map(function(ts,i){return{ts:ts,kw:gT[i],gtv:gtvT};}).sort(function(a,b){return b.kw-a.kw;});

  renderPeakTables(
    parseInt(document.getElementById('peakLimitA').value)||10,
    parseInt(document.getElementById('peakLimitT').value)||10
  );
}

function renderPeakTables(limitA,limitT){
  document.getElementById('peakBodyA').innerHTML=_peaksA.slice(0,limitA).map(function(p,idx){
    var over=p.kw>p.gtv;
    var diff=over?(p.kw-p.gtv).toFixed(1):'—';
    return '<tr><td>'+(idx+1)+'</td><td style="font-size:10px">'+p.ts+'</td>'+
      '<td><strong>'+p.kw.toFixed(1)+'</strong></td><td>'+p.gtv+'</td>'+
      '<td>'+diff+'</td>'+
      '<td><span class="bdg '+(over?'br':'bg')+'">'+(over?'Overschrijding':'OK')+'</span></td></tr>';
  }).join('');

  document.getElementById('peakBodyT').innerHTML=_peaksT.slice(0,limitT).map(function(p,idx){
    var over=p.kw>p.gtv;
    var diff=over?(p.kw-p.gtv).toFixed(1):'—';
    return '<tr><td>'+(idx+1)+'</td><td style="font-size:10px">'+p.ts+'</td>'+
      '<td><strong>'+p.kw.toFixed(1)+'</strong></td><td>'+p.gtv+'</td>'+
      '<td>'+diff+'</td>'+
      '<td><span class="bdg '+(over?'br':'bg')+'">'+(over?'Overschrijding':'OK')+'</span></td></tr>';
  }).join('');
}
