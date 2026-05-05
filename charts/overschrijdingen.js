// Opgeslagen piekdata voor gebruik door renderPeakTables
var _peaksA=[], _peaksT=[];

function drawOvsch(allTs,gA,gT,gtvA,gtvT){
  dC('ovsch');
  var ovA=new Array(12).fill(0);var ovT=new Array(12).fill(0);
  // Heatmap-matrices: 24 uren × 12 maanden
  var heatA=[],heatT=[];
  for(var h=0;h<24;h++){heatA.push(new Array(12).fill(0));heatT.push(new Array(12).fill(0));}
  var totA=0,totT=0,maxOA=0,maxOT=0;
  allTs.forEach(function(ts,i){
    var m=parseInt(ts.slice(5,7))-1;
    var hr=parseInt(ts.slice(11,13))||0;
    if(gA[i]>gtvA){ovA[m]++;heatA[hr][m]++;totA++;var d=gA[i]-gtvA;if(d>maxOA)maxOA=d;}
    if(gT[i]>gtvT){ovT[m]++;heatT[hr][m]++;totT++;var dt=gT[i]-gtvT;if(dt>maxOT)maxOT=dt;}
  });

  // KPI-kaarten populeren
  var ovKpis=document.getElementById('ovKpis');
  if(ovKpis){
    ovKpis.innerHTML=
      '<div class="kb '+(totA>0?'red':'grn')+'"><div class="kl">Overschrijdingen afname</div><div class="kv">'+totA.toLocaleString('nl-NL')+'</div><div class="ku">kwartierwaarden &gt; GTV ('+gtvA+' kW)</div></div>'+
      '<div class="kb '+(totT>0?'red':'grn')+'"><div class="kl">Overschrijdingen teruglevering</div><div class="kv">'+totT.toLocaleString('nl-NL')+'</div><div class="ku">kwartierwaarden &gt; GTV-T ('+gtvT+' kW)</div></div>'+
      '<div class="kb '+(totA>0?'red':'grn')+'"><div class="kl">Hoogste overschrijding afname</div><div class="kv">'+(totA>0?'+'+maxOA.toFixed(1)+' kW':'—')+'</div><div class="ku">boven GTV</div></div>'+
      '<div class="kb '+(totT>0?'red':'grn')+'"><div class="kl">Hoogste overschrijding teruglevering</div><div class="kv">'+(totT>0?'+'+maxOT.toFixed(1)+' kW':'—')+'</div><div class="ku">boven GTV-T</div></div>';
  }

  CH['ovsch']=new Chart(document.getElementById('cOvsch'),{type:'bar',data:{labels:MND,datasets:[
    {label:'Afname overschr.',data:ovA,backgroundColor:'rgba(192,57,43,.75)',borderRadius:4},
    {label:'Teruglevering overschr.',data:ovT,backgroundColor:'rgba(230,126,34,.75)',borderRadius:4},
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#888',font:{family:'Barlow',size:11},boxWidth:10}}},scales:{x:Object.assign(ax(),{grid:{display:false}}),y:ax('Kwartierwaarden')}}});

  // Heatmaps renderen
  renderHeatmap('heatA','heatLegA',heatA,totA,'192,57,43','Afname');
  renderHeatmap('heatT','heatLegT',heatT,totT,'230,126,34','Teruglevering');

  _peaksA=allTs.map(function(ts,i){return{ts:ts,kw:gA[i],gtv:gtvA};}).sort(function(a,b){return b.kw-a.kw;});
  _peaksT=allTs.map(function(ts,i){return{ts:ts,kw:gT[i],gtv:gtvT};}).sort(function(a,b){return b.kw-a.kw;});

  renderPeakTables(
    parseInt(document.getElementById('peakLimitA').value)||10,
    parseInt(document.getElementById('peakLimitT').value)||10
  );
}

function renderHeatmap(gridId,legId,matrix,total,rgb,lbl){
  var grid=document.getElementById(gridId);
  if(!grid)return;
  // Vind maximum voor kleurschaling
  var max=0;
  for(var h=0;h<24;h++)for(var m=0;m<12;m++)if(matrix[h][m]>max)max=matrix[h][m];
  var html='';
  // Kop-rij: lege hoek + 12 maanden
  html+='<div class="hm-corner"></div>';
  for(var mi=0;mi<12;mi++)html+='<div class="hm-mh">'+MND[mi]+'</div>';
  // 24 rijen
  for(var hr=0;hr<24;hr++){
    var hLbl=(hr<10?'0':'')+hr+'h';
    html+='<div class="hm-yh">'+hLbl+'</div>';
    for(var mn=0;mn<12;mn++){
      var c=matrix[hr][mn];
      var bg='#fafafa';
      if(max>0&&c>0){
        var intensity=Math.sqrt(c/max);
        var alpha=(0.18+intensity*0.82).toFixed(2);
        bg='rgba('+rgb+','+alpha+')';
      }
      var title=lbl+' '+MND[mn]+' '+hLbl+': '+c+' overschr.';
      html+='<div class="hm-cell" style="background:'+bg+'" title="'+title+'"></div>';
    }
  }
  grid.innerHTML=html;
  // Legenda met gradient
  var leg=document.getElementById(legId);
  if(leg){
    leg.innerHTML='<span>0</span>'+
      '<span class="hm-bar" style="background:linear-gradient(90deg,rgba('+rgb+',0.18) 0%,rgba('+rgb+',1) 100%)"></span>'+
      '<span>'+(max||0)+' max/uur</span>'+
      '<span style="margin-left:auto;color:#666"><strong>'+total.toLocaleString('nl-NL')+'</strong> totaal</span>';
  }
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
