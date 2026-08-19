function drawPiek(allTs,perKw,grpKw,cos){
  dC('cPiekA');dC('cPiekT');dC('simA');dC('simT');
  var mndSet={};allTs.forEach(function(ts){mndSet[ts.slice(0,7)]=1;});
  var mnds=Object.keys(mndSet).sort();
  // Datadekking: onvolledige maanden worden gearceerd en tellen niet mee in de
  // jaar-extrapolatie en de gemiddelden — een halve maand telde daar als volle maand
  // én droeg een kunstmatig lage piek/besparing aan.
  var pDek=maandDekking(allTs);
  var pVol=mnds.map(function(m){return _dek(pDek,m).volledig;});
  var pVolIdx=mnds.map(function(_,i){return i;}).filter(function(i){return pVol[i];});
  var nPvol=pVolIdx.length;
  // Middelt een per-maand-array over de volledige maanden (val terug op alles als er geen zijn).
  var gemVol=function(arr){
    var idx=nPvol?pVolIdx:arr.map(function(_,i){return i;});
    if(!idx.length)return 0;
    return idx.reduce(function(s,i){return s+(arr[i]||0);},0)/idx.length;
  };

  // Per aansluiting: afname- en terugleveringspiek per maand
  var indPA=cos.map(function(_,ci){
    var mA={};
    allTs.forEach(function(ts,i){var mn=ts.slice(0,7);var v=Math.max(0,perKw[ci][i]||0);if(!mA[mn]||v>mA[mn])mA[mn]=v;});
    return mnds.map(function(mn){return+(mA[mn]||0).toFixed(1);});
  });
  var indPT=cos.map(function(_,ci){
    var mT={};
    allTs.forEach(function(ts,i){var mn=ts.slice(0,7);var v=Math.max(0,-(perKw[ci][i]||0));if(!mT[mn]||v>mT[mn])mT[mn]=v;});
    return mnds.map(function(mn){return+(mT[mn]||0).toFixed(1);});
  });
  // Gecombineerd voor GTO-tabel
  var indP=cos.map(function(_,ci){return mnds.map(function(_,mi){return+indPA[ci][mi].toFixed(1);});});

  // Collectieve pieken afname en teruglevering afzonderlijk
  var collPA=mnds.map(function(mn){
    var mx=0;allTs.forEach(function(ts,i){if(ts.slice(0,7)===mn){var v=Math.max(0,grpKw[i]);if(v>mx)mx=v;}});return+mx.toFixed(1);
  });
  var collPT=mnds.map(function(mn){
    var mx=0;allTs.forEach(function(ts,i){if(ts.slice(0,7)===mn){var v=Math.max(0,-grpKw[i]);if(v>mx)mx=v;}});return+mx.toFixed(1);
  });
  var collP=mnds.map(function(_,mi){return+collPA[mi].toFixed(1);});

  var somIndA=mnds.map(function(_,mi){return cos.reduce(function(s,_,ci){return s+indPA[ci][mi];},0);});
  var somIndT=mnds.map(function(_,mi){return cos.reduce(function(s,_,ci){return s+indPT[ci][mi];},0);});
  var somInd=mnds.map(function(_,mi){return+somIndA[mi].toFixed(1);});
  var div=mnds.map(function(_,mi){return+(somInd[mi]-collP[mi]).toFixed(1);});

  var totKm=cos.reduce(function(s,c){return s+(ST[c.stedinT||'none']||ST.none).km;},0);
  var avgKm=totKm/Math.max(1,cos.length);
  var indKm=mnds.map(function(_,mi){return cos.reduce(function(s,c,ci){return s+indP[ci][mi]*(ST[c.stedinT||'none']||ST.none).km;},0);});
  var besP=mnds.map(function(_,mi){return+(div[mi]*avgKm).toFixed(2);});
  var totB=besP.reduce(function(s,v){return s+v;},0);
  var totI=indKm.reduce(function(s,v){return s+v;},0);
  var mLbl=mnds.map(function(m,i){return mndLabel(mnds,m)+(pVol[i]?'':'*');});

  // Jaar-extrapolatie over uitsluitend volledige maanden (gemiddelde × 12).
  var besPerJaar=gemVol(besP)*12;
  document.getElementById('pKpis').innerHTML=
    '<div class="kb"><div class="kl">Som ind. kW-max kosten</div><div class="kv">€ '+fmt(totI)+'</div><div class="ku">meetperiode</div></div>'+
    '<div class="kb grn"><div class="kl">GTO besparing kW-max</div><div class="kv">€ '+fmt(totB)+'</div><div class="ku">meetperiode</div></div>'+
    '<div class="kb grn"><div class="kl">Besparing per jaar</div><div class="kv">€ '+fmt(besPerJaar)+'</div><div class="ku">geëxtrapoleerd'+(nPvol&&nPvol<mnds.length?(' over '+nPvol+' volledige '+(nPvol===1?'maand':'maanden')):'')+'</div></div>'+
    '<div class="kb"><div class="kl">Gem. diversiteitswinst</div><div class="kv">'+gemVol(div).toFixed(0)+'</div><div class="ku">kW/maand</div></div>';

  var legHtml='';
  for(var i=0;i<cos.length;i++)legHtml+='<span class="li"><span class="ld" style="background:'+PAL[i%PAL.length]+'"></span>'+cos[i].name+'</span>';
  legHtml+='<span class="li"><span class="ld" style="background:#242b38;height:3px;border-radius:2px"></span>Som individueel</span>'+
           '<span class="li"><span class="ld" style="background:#46962b;height:3px;border-radius:2px"></span>Collectief</span>';
  document.getElementById('pLeg').innerHTML=legHtml;
  var pWarn=document.getElementById('pMaandWarn');
  if(pWarn)pWarn.innerHTML=onvolledigNotice(mnds,pDek,'piekbelasting','#888');

  function makePiekChart(canvasId,indArr,somArr,collArr){
    // Onvolledige maanden: arcering i.p.v. de vlakke halftransparante vulling, met contour.
    var barDS=cos.map(function(c,i){
      var kl=PAL[i%PAL.length];
      return {label:c.name,data:indArr[i],borderRadius:3,stack:'ind',borderSkipped:false,
        backgroundColor:pVol.map(function(v){return v?(kl+'55'):hatchPat(kl);}),
        borderColor:kl,borderWidth:pVol.map(function(v){return v?1:1.5;})};
    });
    CH[canvasId]=new Chart(document.getElementById(canvasId),{type:'bar',data:{labels:mLbl,datasets:barDS.concat([
      {label:'Som individueel',data:somArr.map(function(v){return+v.toFixed(1);}),type:'line',borderColor:'#242b38',borderWidth:2.5,pointRadius:3,pointBackgroundColor:'#242b38',fill:false,tension:.2,order:0},
      {label:'Collectief',data:collArr,type:'line',borderColor:'#46962b',borderWidth:2.5,pointRadius:3,pointBackgroundColor:'#46962b',fill:false,tension:.2,order:0},
    ])},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},
      tooltip:{callbacks:{afterBody:function(items){return items.length?maandDekkingTip(_dek(pDek,mnds[items[0].dataIndex])):[];}}}},
      scales:{x:Object.assign(ax(),{grid:{display:false}}),y:Object.assign(ax('kW'),{beginAtZero:true})}}});
  }
  makePiekChart('cPiekA',indPA,somIndA,collPA);
  makePiekChart('cPiekT',indPT,somIndT,collPT);

  var totDiv=div.reduce(function(s,v){return s+v;},0);
  var totSomInd=somInd.reduce(function(s,v){return s+v;},0);
  var gtoHtml=mnds.map(function(mn,mi){
    return '<tr><td><strong>'+mLbl[mi]+'</strong></td><td>'+somInd[mi].toFixed(1)+'</td><td>'+collP[mi].toFixed(1)+'</td>'+
      '<td style="color:#46962b;font-weight:700">'+div[mi].toFixed(1)+' kW / '+(somInd[mi]>0?(div[mi]/somInd[mi]*100).toFixed(0):0)+'%</td>'+
      '<td style="color:#46962b;font-weight:700">€ '+fmt(besP[mi])+'</td></tr>';
  }).join('');
  // Gemiddelden op de totaalrij over volledige maanden — een onvolledige maand heeft een
  // kunstmatig lage piek en zou het gemiddelde omlaag trekken.
  gtoHtml+='<tr style="background:#edf5ea;font-weight:700"><td>Totaal/gem.'+(nPvol&&nPvol<mnds.length?'<span style="font-weight:400;font-size:11px;color:#888"> (gem. over '+nPvol+' volledige '+(nPvol===1?'maand':'maanden')+')</span>':'')+'</td><td>'+gemVol(somInd).toFixed(1)+' gem.</td>'+
    '<td>'+gemVol(collP).toFixed(1)+' gem.</td>'+
    '<td style="color:#46962b">gem. '+gemVol(div).toFixed(1)+' kW / '+(totSomInd>0?(totDiv/totSomInd*100).toFixed(0):0)+'%</td>'+
    '<td style="color:#46962b">€ '+fmt(totB)+'</td></tr>';
  document.getElementById('gtoBody').innerHTML=gtoHtml;

  _piek={cos:cos,collPA:collPA,collPT:collPT,mnds:mnds,mLbl:mLbl,indKm:indKm,avgKm:avgKm,somInd:somInd,
    pVol:pVol,gemVol:gemVol,nPvol:nPvol};
  updateSim();
}

function updateSim(){
  if(!_piek)return;
  var cos=_piek.cos;var collPA=_piek.collPA;var collPT=_piek.collPT;
  var mnds=_piek.mnds;var mLbl=_piek.mLbl;
  var indKm=_piek.indKm;var avgKm=_piek.avgKm;var somInd=_piek.somInd;
  var pVol=_piek.pVol||mnds.map(function(){return true;});
  var gemVol=_piek.gemVol||function(a){return a.reduce(function(s,v){return s+v;},0)/Math.max(1,a.length);};
  var nPvol=_piek.nPvol!=null?_piek.nPvol:mnds.length;
  var pct=parseInt(document.getElementById('simSlider').value);
  document.getElementById('simVal').textContent=pct+'%';
  var fac=1-pct/100;
  dC('simA');dC('simT');

  var rawGA=parseFloat(document.getElementById('gGtvA').value);
  var rawGT=parseFloat(document.getElementById('gGtvT').value);
  var gtvA=isNaN(rawGA)?cos.reduce(function(s,c){return s+(c.gtvA||150);},0):rawGA;
  var gtvT=isNaN(rawGT)?cos.reduce(function(s,c){return s+(c.gtvT||80);},0):rawGT;

  var newPA=collPA.map(function(v){return+(v*fac).toFixed(1);});
  var newPT=collPT.map(function(v){return+(v*fac).toFixed(1);});
  var spaceA=newPA.map(function(v){return+(Math.max(0,gtvA-v)).toFixed(1);});
  var spaceT=newPT.map(function(v){return+(Math.max(0,gtvT-v)).toFixed(1);});

  var newCost=mnds.map(function(_,mi){return newPA[mi]*avgKm;});
  var besV=mnds.map(function(_,mi){return indKm[mi]-newCost[mi];});
  var totB2=besV.reduce(function(s,v){return s+v;},0);
  var totI=indKm.reduce(function(s,v){return s+v;},0);
  var restKm=newCost.reduce(function(s,v){return s+v;},0);

  document.getElementById('simKpis').innerHTML=
    '<div class="kb grn"><div class="kl">Besparing vs. individueel</div><div class="kv">€ '+fmt(totB2)+'</div><div class="ku">meetperiode</div></div>'+
    '<div class="kb grn"><div class="kl">Per jaar</div><div class="kv">€ '+fmt(gemVol(besV)*12)+'</div><div class="ku">geëxtrapoleerd'+(nPvol&&nPvol<mnds.length?(' over '+nPvol+' volledige '+(nPvol===1?'maand':'maanden')):'')+'</div></div>'+
    '<div class="kb"><div class="kl">Resterende kW-max kosten</div><div class="kv">€ '+fmt(restKm)+'</div></div>'+
    '<div class="kb"><div class="kl">Reductie t.o.v. ind.</div><div class="kv">'+(totI>0?Math.round(totB2/totI*100):0)+'%</div></div>';

  var chartOpts=function(gtv){return{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#888',font:{family:'Barlow',size:11},boxWidth:10}}},scales:{x:Object.assign(ax(),{grid:{display:false}}),y:Object.assign(ax('kW'),{beginAtZero:true,suggestedMax:gtv>0?gtv*1.1:undefined})}};};

  // Onvolledige maanden ook hier arceren (mLbl draagt de asterisk al).
  var simBar=function(lbl,data,kl,vlak){
    return {label:lbl,data:data,borderRadius:4,stack:'a',borderSkipped:false,
      backgroundColor:pVol.map(function(v){return v?vlak:hatchPat(kl);}),
      borderColor:kl,borderWidth:pVol.map(function(v){return v?0:1.5;})};
  };
  CH['simA']=new Chart(document.getElementById('cSimA'),{type:'bar',data:{labels:mLbl,datasets:[
    simBar('Collectieve afnamepiek -'+pct+'% (kW)',newPA,'#c0392b','rgba(192,57,43,.6)'),
    simBar('Ruimte binnen GTV afname (kW)',spaceA,'#46962b','rgba(70,150,43,.5)'),
  ]},options:chartOpts(gtvA)});

  CH['simT']=new Chart(document.getElementById('cSimT'),{type:'bar',data:{labels:mLbl,datasets:[
    simBar('Collectieve terugleveringspiek -'+pct+'% (kW)',newPT,'#e67e22','rgba(230,126,34,.6)'),
    simBar('Ruimte binnen GTV-T teruglevering (kW)',spaceT,'#46962b','rgba(70,150,43,.5)'),
  ]},options:chartOpts(gtvT)});
}
