function drawPiek(allTs,perKw,grpKw,cos){
  dC('piek');dC('sim');
  var mndSet={};allTs.forEach(function(ts){mndSet[ts.slice(0,7)]=1;});
  var mnds=Object.keys(mndSet).sort();
  var indP=cos.map(function(_,ci){
    var mA={};var mT={};
    allTs.forEach(function(ts,i){var mn=ts.slice(0,7);var v=perKw[ci][i]||0;var va=Math.max(0,v);var vt=Math.max(0,-v);if(!mA[mn]||va>mA[mn])mA[mn]=va;if(!mT[mn]||vt>mT[mn])mT[mn]=vt;});
    return mnds.map(function(mn){return+((mA[mn]||0)+(mT[mn]||0)).toFixed(1);});
  });
  var collP=mnds.map(function(mn){
    var mxA=0;var mxT=0;
    allTs.forEach(function(ts,i){if(ts.slice(0,7)!==mn)return;var v=grpKw[i];if(v>0&&v>mxA)mxA=v;if(v<0&&-v>mxT)mxT=-v;});
    return+(mxA+mxT).toFixed(1);
  });
  var somInd=mnds.map(function(_,mi){return cos.reduce(function(s,_,ci){return s+indP[ci][mi];},0);});
  var div=mnds.map(function(_,mi){return+(somInd[mi]-collP[mi]).toFixed(1);});
  var totKm=cos.reduce(function(s,c){return s+(ST[c.stedinT||'none']||ST.none).km;},0);
  var avgKm=totKm/Math.max(1,cos.length);
  var indKm=mnds.map(function(_,mi){return cos.reduce(function(s,c,ci){return s+indP[ci][mi]*(ST[c.stedinT||'none']||ST.none).km;},0);});
  var besP=mnds.map(function(_,mi){return+(div[mi]*avgKm).toFixed(2);});
  var totB=besP.reduce(function(s,v){return s+v;},0);
  var totI=indKm.reduce(function(s,v){return s+v;},0);
  var mLbl=mnds.map(function(m){return mndLabel(mnds,m);});
  document.getElementById('pKpis').innerHTML=
    '<div class="kb"><div class="kl">Som ind. kW-max kosten</div><div class="kv">€ '+fmt(totI)+'</div><div class="ku">meetperiode</div></div>'+
    '<div class="kb grn"><div class="kl">GTO besparing kW-max</div><div class="kv">€ '+fmt(totB)+'</div><div class="ku">meetperiode</div></div>'+
    '<div class="kb grn"><div class="kl">Besparing per jaar</div><div class="kv">€ '+fmt(totB/Math.max(1,mnds.length)*12)+'</div><div class="ku">geëxtrapoleerd</div></div>'+
    '<div class="kb"><div class="kl">Gem. diversiteitswinst</div><div class="kv">'+(div.reduce(function(s,v){return s+v;},0)/mnds.length).toFixed(0)+'</div><div class="ku">kW/maand</div></div>';
  var legHtml='';for(var i=0;i<cos.length;i++)legHtml+='<span class="li"><span class="ld" style="background:'+PAL[i%PAL.length]+'"></span>'+cos[i].name+'</span>';
  legHtml+='<span class="li"><span class="ld" style="background:#242b38"></span>Som individueel</span><span class="li"><span class="ld" style="background:#46962b"></span>Collectief</span>';
  document.getElementById('pLeg').innerHTML=legHtml;
  var barDS=cos.map(function(c,i){return{label:c.name,data:indP[i],backgroundColor:PAL[i%PAL.length]+'55',borderColor:PAL[i%PAL.length],borderWidth:1,borderRadius:3,stack:'ind'};});
  CH['piek']=new Chart(document.getElementById('cPiek'),{type:'bar',data:{labels:mLbl,datasets:barDS.concat([
    {label:'Som individueel',data:somInd,type:'line',borderColor:'#242b38',borderWidth:2.5,pointRadius:3,pointBackgroundColor:'#242b38',fill:false,tension:.2,order:0},
    {label:'Collectief',data:collP,type:'line',borderColor:'#46962b',borderWidth:2.5,pointRadius:3,pointBackgroundColor:'#46962b',fill:false,tension:.2,order:0},
  ])},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:Object.assign(ax(),{grid:{display:false}}),y:Object.assign(ax('kW'),{beginAtZero:true})}}});
  var totDiv=div.reduce(function(s,v){return s+v;},0);
  var totSomInd=somInd.reduce(function(s,v){return s+v;},0);
  var gtoHtml=mnds.map(function(mn,mi){return '<tr><td><strong>'+mLbl[mi]+'</strong></td><td>'+somInd[mi].toFixed(1)+'</td><td>'+collP[mi].toFixed(1)+'</td><td style="color:#46962b;font-weight:700">'+div[mi].toFixed(1)+' kW / '+(somInd[mi]>0?(div[mi]/somInd[mi]*100).toFixed(0):0)+'%</td><td style="color:#46962b;font-weight:700">€ '+fmt(besP[mi])+'</td></tr>';}).join('');
  gtoHtml+='<tr style="background:#edf5ea;font-weight:700"><td>Totaal/gem.</td><td>'+(totSomInd/mnds.length).toFixed(1)+' gem.</td><td>'+(collP.reduce(function(s,v){return s+v;},0)/mnds.length).toFixed(1)+' gem.</td><td style="color:#46962b">gem. '+(totDiv/mnds.length).toFixed(1)+' kW / '+(totSomInd>0?(totDiv/totSomInd*100).toFixed(0):0)+'%</td><td style="color:#46962b">€ '+fmt(totB)+'</td></tr>';
  document.getElementById('gtoBody').innerHTML=gtoHtml;
  _piek={cos:cos,collP:collP,mnds:mnds,mLbl:mLbl,indKm:indKm,avgKm:avgKm,somInd:somInd};
  updateSim();
}

function updateSim(){
  if(!_piek)return;
  var cos=_piek.cos;var collP=_piek.collP;var mnds=_piek.mnds;var mLbl=_piek.mLbl;
  var indKm=_piek.indKm;var avgKm=_piek.avgKm;var somInd=_piek.somInd;
  var pct=parseInt(document.getElementById('simSlider').value);
  document.getElementById('simVal').textContent=pct+'%';
  var fac=1-pct/100;dC('sim');
  var rawGA=parseFloat(document.getElementById('gGtvA').value);
  var rawGT=parseFloat(document.getElementById('gGtvT').value);
  var gtvA=isNaN(rawGA)?cos.reduce(function(s,c){return s+(c.gtvA||150);},0):rawGA;
  var gtvT=isNaN(rawGT)?cos.reduce(function(s,c){return s+(c.gtvT||80);},0):rawGT;
  var gtv=gtvA+gtvT;
  var newP=collP.map(function(v){return+(v*fac).toFixed(1);});
  var space=newP.map(function(v){return+(Math.max(0,gtv-v)).toFixed(1);});
  var newCost=newP.map(function(v){return v*avgKm;});
  var besV=mnds.map(function(_,mi){return indKm[mi]-newCost[mi];});
  var totB2=besV.reduce(function(s,v){return s+v;},0);
  var totI=indKm.reduce(function(s,v){return s+v;},0);
  var restKm=newCost.reduce(function(s,v){return s+v;},0);
  document.getElementById('simKpis').innerHTML=
    '<div class="kb grn"><div class="kl">Besparing vs. individueel</div><div class="kv">€ '+fmt(totB2)+'</div><div class="ku">meetperiode</div></div>'+
    '<div class="kb grn"><div class="kl">Per jaar</div><div class="kv">€ '+fmt(totB2/Math.max(1,mnds.length)*12)+'</div><div class="ku">geëxtrapoleerd</div></div>'+
    '<div class="kb"><div class="kl">Resterende kW-max kosten</div><div class="kv">€ '+fmt(restKm)+'</div></div>'+
    '<div class="kb"><div class="kl">Reductie t.o.v. ind.</div><div class="kv">'+(totI>0?Math.round(totB2/totI*100):0)+'%</div></div>';
  CH['sim']=new Chart(document.getElementById('cSim'),{type:'bar',data:{labels:mLbl,datasets:[
    {label:'Collectieve piek -'+pct+'% (kW)',data:newP,backgroundColor:'rgba(192,57,43,.6)',borderRadius:4,stack:'a'},
    {label:'Ruimte binnen aansluiting (kW)',data:space,backgroundColor:'rgba(70,150,43,.5)',borderRadius:4,stack:'a'},
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#888',font:{family:'Barlow',size:11},boxWidth:10}}},scales:{x:Object.assign(ax(),{grid:{display:false}}),y:Object.assign(ax('kW'),{beginAtZero:true,suggestedMax:gtv>0?gtv*1.1:undefined})}}});
}
