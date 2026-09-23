// Toelichting onder de GTO-tabel: welke tarieven zijn gehanteerd, waar ze vandaan
// komen en of de MS/LS-toeslag geldt. Maakt elke aanname controleerbaar tegen een
// echte afrekening. Artikelverwijzingen: zie de bronnenlijst in tarieven.js.
function _eur4(v){return '€ '+v.toFixed(4).replace('.',',');}
function _kmTariefNotitie(cos,grpCat){
  var per={};
  (cos||[]).forEach(function(c){
    var k=connTariefCat(c);
    (per[k]=per[k]||{st:ST[k]||ST.none,n:0}).n++;
  });
  var lijst=Object.keys(per).map(function(k){
    return per[k].st.l+' '+_eur4(per[k].st.km)+'/kW/mnd ('+per[k].n+'×)';
  }).join(' · ');
  var gst=ST[grpCat]||ST.none,tar=gtoToeslagTarief(cos);
  var grijs=gtoGrijzeZone(cos),afw=gtoGtvAfwijking(cos);
  return 'Individueel: elke aansluiting tegen het kW-max-tarief van haar eigen tariefcategorie — '+lijst+'. '+
    'Die categorie volgt het <strong>systeemvlak van de aansluiting</strong>, conform de schriftelijke bevestiging van Stedin: '+
    '<em>"Het GTV is niet leidend voor de tariefcategorie maar de aansluiting van de klant. Er moet dus niet gekeken worden '+
    'naar kWcontract maar naar het systeemvlak waarop de aansluitingen aangesloten zijn."</em>'+
    (afw.length?' Tarievencode art. 3.7.2 deelt daarentegen in op gecontracteerd vermogen; voor '+afw.length+' aansluiting'+(afw.length===1?'':'en')+
      ' ('+afw.map(function(x){return x.conn.name;}).join(', ')+') zou dat een lichtere categorie geven en dus een hogere GTO-besparing. '+
      'Deze analyse houdt bewust de behoudende lezing aan.':'')+'<br>'+
    'Collectief: de groepspiek op het netto groepsprofiel per kwartier tegen <strong>'+gst.l+' '+_eur4(gst.km)+'/kW/mnd</strong> — '+
    'de tariefcategorie van het hoogste netvlak in de groep (Tarievencode art. 3.7.2a, art. 3.7.18 onderdeel b).'+
    (tar?'<br>MS/LS-toeslag (art. 3.7.19): <strong>'+_eur4(tar)+'/kW/mnd</strong> over de maandpieken van alleen de A.3-deelnemers (Trafo MS/LS). '+
         'Dat bedrag is het verschil tussen het kW-contract-tarief van Trafo MS/LS en dat van MS, en dekt de MS/LS-trafo waar zij gebruik van maken.':
        '<br>Geen MS/LS-toeslag: die geldt alleen als de groep zowel A.3- (Trafo MS/LS) als A.4/A.5-aansluitingen (MS) bevat.')+
    '<br>Er wordt geen correctiefactor toegepast: de ACM heeft de door de netbeheerders voorgestelde factor 1,21 op kW-contract en kW-max niet overgenomen '+
    '(Codebesluit groepstransportovereenkomst, Stcrt. 2025 nr. 43262, randnummer 177).'+
    (grijs.length?'<br><strong style="color:#c0392b">Let op:</strong> '+grijs.length+' aansluiting'+(grijs.length===1?'':'en')+
      ' ('+grijs.map(function(c){return c.name;}).join(', ')+') ligt tussen 175 en 300 kVA. '+
      'Deze app volgt de Stedin-grens van 175 kVA en rekent die dus als MS (géén toeslag); de ACM omschrijft A.3 als t/m 0,3 MVA, '+
      'wat tot de tegenovergestelde uitkomst zou leiden. Laat dit per aansluiting door Stedin bevestigen.':'');
}

// kW-contract-kaart: per deelnemer het eigen GTV tegen het eigen tarief, afgezet
// tegen één groeps-GTV tegen het groepstarief (Tarievencode art. 3.7.18 onderdeel a).
function _renderKwContract(cos,groepsGtvA){
  var el=document.getElementById('gtoKwc');if(!el)return null;
  var kwc=gtoKwContract(cos,groepsGtvA);
  var rows=kwc.perAansluiting.map(function(x){
    return '<tr><td><strong>'+x.naam+'</strong></td>'+
      '<td>'+((ST[x.netvlak]||ST.none).l)+'</td>'+
      '<td>'+((ST[x.cat]||ST.none).l)+
      (x.uitGtv?'<span style="color:#888;font-size:11px"> (op kW-contract zou dit '+((ST[x.uitGtv]||ST.none).l)+' zijn)</span>':'')+'</td>'+
      '<td>'+fmt(x.gtv)+'</td><td>'+_eur4(x.tarief)+'</td>'+
      '<td>€ '+fmt(x.perMaand)+'</td></tr>';
  }).join('');
  var gelijk=Math.abs(kwc.groepsGtv-kwc.somGtv)<0.5;
  var besJr=kwc.besparingPerMaand*12;
  var kleur=kwc.besparingPerMaand>=0?'#46962b':'#c0392b';
  el.innerHTML=
    '<table class="tbl"><thead><tr><th>Aansluiting</th><th>Netvlak</th><th>Tariefcategorie</th>'+
    '<th>GTV afname (kW)</th><th>kW-contract-tarief</th><th>€ / maand</th></tr></thead><tbody>'+rows+
    '<tr style="background:#edf5ea;font-weight:700"><td>Som individueel</td><td>—</td><td>—</td>'+
    '<td>'+fmt(kwc.somGtv)+'</td><td>—</td><td>€ '+fmt(kwc.indPerMaand)+'</td></tr>'+
    '<tr style="background:#eef4fa;font-weight:700"><td>Groep (één GTO)</td>'+
    '<td><span style="font-weight:400;color:#888">hoogste netvlak →</span> '+((ST[kwc.grpCat]||ST.none).l)+'</td>'+
    '<td>'+((ST[kwc.grpCat]||ST.none).l)+'<span style="font-weight:400;color:#888;font-size:11px"> (art. 3.7.2a, niet uit GTV)</span></td>'+
    '<td>'+fmt(kwc.groepsGtv)+'</td><td>'+_eur4(kwc.grpTarief)+'</td><td>€ '+fmt(kwc.collPerMaand)+'</td></tr>'+
    '<tr style="font-weight:800"><td colspan="5">Besparing kW-contract</td>'+
    '<td style="color:'+kleur+'">€ '+fmt(kwc.besparingPerMaand)+' / mnd &nbsp;·&nbsp; € '+fmt(besJr)+' / jaar</td></tr>'+
    '</tbody></table>'+
    '<div class="ib" style="margin-top:8px">'+
    'Bij een GTO vervalt het individuele GTV en heeft de groep één gezamenlijk gecontracteerd vermogen '+
    '(Tarievencode art. 3.7.18 onderdeel a). De besparing is dus volledig afhankelijk van het groeps-GTV dat je met '+
    'de netbeheerder afspreekt; vul dat in bij <em>GTV afname</em> in de zijbalk.'+
    (gelijk?' <strong>Nu staat het groeps-GTV gelijk aan de som van de individuele GTV\'s ('+fmt(kwc.somGtv)+' kW): de neutrale referentie.</strong> '+
      'Wat je hierboven ziet is dan puur het tariefeffect — deelnemers die los in een zwaardere categorie vallen dan de groep, '+
      'gaan over op het lagere groepstarief. Voor A.3-deelnemers wordt dat voordeel via de MS/LS-toeslag in de tabel hierboven '+
      'grotendeels weer teruggehaald (die toeslag benadert het vervallen individuele GTV met de gemeten kW-max). '+
      'Het volume-effect komt er pas bij zodra je een lager groeps-GTV afspreekt: elke kW lager levert '+
      _eur4(kwc.grpTarief)+'/maand op, oftewel € '+fmt(kwc.grpTarief*12)+' per kW per jaar.':'')+
    '<br>De tariefcategorie per deelnemer volgt het systeemvlak van de aansluiting, conform de schriftelijke bevestiging van Stedin '+
    'dat het gecontracteerd vermogen daarvoor niet leidend is.'+
    (kwc.perAansluiting.some(function(x){return x.uitGtv;})
      ?' Zou je in plaats daarvan op kW-contract indelen (Tarievencode art. 3.7.2), dan vielen de gemarkeerde aansluitingen in een '+
       'lichtere categorie en kwam de besparing hoger uit; deze analyse houdt bewust de behoudende lezing aan.':'')+
    '<br>Vastrecht, kWh-tarief en periodieke aansluitvergoeding blijven bij een GTO ongewijzigd (art. 3.1.3a, art. 3.7.18 onderdeel c) '+
    'en vallen dus weg in dit verschil.</div>';
  return kwc;
}

function drawPiek(allTs,perKw,grpKw,cos,groepsGtvA){
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

  // kW-max wordt per aansluiting afgerekend tegen het tarief van háár eigen
  // categorie; de groep tegen die van het hoogste netvlak erin. Bij de combinatie
  // MS/LS + MS komt daar de MS/LS-toeslag bij (zie tarieven.js).
  var grpCat=groepsStCat(cos),kmColl=(ST[grpCat]||ST.none).km;
  var indKm=mnds.map(function(_,mi){return cos.reduce(function(s,c,ci){return s+indP[ci][mi]*connSt(c).km;},0);});
  var collKm=mnds.map(function(_,mi){return collP[mi]*kmColl;});
  var toeslag=gtoToeslagPerMaand(cos,indP,mnds);
  var besP=mnds.map(function(_,mi){return+(indKm[mi]-collKm[mi]-toeslag[mi]).toFixed(2);});
  var totB=besP.reduce(function(s,v){return s+v;},0);
  var totI=indKm.reduce(function(s,v){return s+v;},0);
  var totC=collKm.reduce(function(s,v){return s+v;},0);
  var totTs=toeslag.reduce(function(s,v){return s+v;},0);
  var mLbl=mnds.map(function(m,i){return mndLabel(mnds,m)+(pVol[i]?'':'*');});

  // Jaar-extrapolatie over uitsluitend volledige maanden (gemiddelde × 12).
  var besPerJaar=gemVol(besP)*12;
  // kW-contract is een vast bedrag per maand en hangt aan het groeps-GTV, niet
  // aan de meetperiode; daarom apart berekend en op jaarbasis getoond.
  var kwc=_renderKwContract(cos,groepsGtvA);
  var kwcJaar=kwc?kwc.besparingPerMaand*12:0;
  var totJaar=besPerJaar+kwcJaar;
  document.getElementById('pKpis').innerHTML=
    '<div class="kb"><div class="kl">Som ind. kW-max kosten</div><div class="kv">€ '+fmt(totI)+'</div><div class="ku">meetperiode</div></div>'+
    '<div class="kb'+(totB>=0?' grn':'')+'"><div class="kl">Besparing kW-max</div><div class="kv">€ '+fmt(besPerJaar)+'</div><div class="ku">per jaar, na MS/LS-toeslag'+(nPvol&&nPvol<mnds.length?(', over '+nPvol+' volledige '+(nPvol===1?'maand':'maanden')):'')+'</div></div>'+
    '<div class="kb'+(kwcJaar>=0?' grn':'')+'"><div class="kl">Besparing kW-contract</div><div class="kv">€ '+fmt(kwcJaar)+'</div><div class="ku">per jaar'+(kwc&&Math.abs(kwc.groepsGtv-kwc.somGtv)<0.5?', groeps-GTV nog op som':'')+'</div></div>'+
    '<div class="kb'+(totJaar>=0?' grn':'')+'"><div class="kl">Totale GTO-besparing</div><div class="kv">€ '+fmt(totJaar)+'</div><div class="ku">per jaar, kW-max + kW-contract</div></div>'+
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
      '<td>€ '+fmt(indKm[mi])+'</td><td>€ '+fmt(collKm[mi])+'</td>'+
      '<td>'+(toeslag[mi]?'€ '+fmt(toeslag[mi]):'—')+'</td>'+
      '<td style="color:'+(besP[mi]>=0?'#46962b':'#c0392b')+';font-weight:700">€ '+fmt(besP[mi])+'</td></tr>';
  }).join('');
  // Gemiddelden op de totaalrij over volledige maanden — een onvolledige maand heeft een
  // kunstmatig lage piek en zou het gemiddelde omlaag trekken.
  gtoHtml+='<tr style="background:#edf5ea;font-weight:700"><td>Totaal/gem.'+(nPvol&&nPvol<mnds.length?'<span style="font-weight:400;font-size:11px;color:#888"> (gem. over '+nPvol+' volledige '+(nPvol===1?'maand':'maanden')+')</span>':'')+'</td><td>'+gemVol(somInd).toFixed(1)+' gem.</td>'+
    '<td>'+gemVol(collP).toFixed(1)+' gem.</td>'+
    '<td style="color:#46962b">gem. '+gemVol(div).toFixed(1)+' kW / '+(totSomInd>0?(totDiv/totSomInd*100).toFixed(0):0)+'%</td>'+
    '<td>€ '+fmt(totI)+'</td><td>€ '+fmt(totC)+'</td>'+
    '<td>'+(totTs?'€ '+fmt(totTs):'—')+'</td>'+
    '<td style="color:'+(totB>=0?'#46962b':'#c0392b')+'">€ '+fmt(totB)+'</td></tr>';
  document.getElementById('gtoBody').innerHTML=gtoHtml;
  var tarEl=document.getElementById('gtoTarief');
  if(tarEl)tarEl.innerHTML=_kmTariefNotitie(cos,grpCat);

  _piek={cos:cos,collPA:collPA,collPT:collPT,mnds:mnds,mLbl:mLbl,indKm:indKm,collKm:collKm,
    toeslag:toeslag,kmColl:kmColl,grpCat:grpCat,somInd:somInd,
    kwc:kwc,kwcJaar:kwcJaar,kmJaar:besPerJaar,totJaar:totJaar,
    pVol:pVol,gemVol:gemVol,nPvol:nPvol};
  updateSim();
}

function updateSim(){
  if(!_piek)return;
  var cos=_piek.cos;var collPA=_piek.collPA;var collPT=_piek.collPT;
  var mnds=_piek.mnds;var mLbl=_piek.mLbl;
  var indKm=_piek.indKm;var kmColl=_piek.kmColl;var toeslag=_piek.toeslag||[];var somInd=_piek.somInd;
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

  // Zelfde basis als de GTO-tabel: op 0% reductie hoort hier exact het tabeltotaal
  // uit te komen. De toeslag hangt aan de individuele MS/LS-pieken en verandert
  // dus niet mee met een reductie op het groepsprofiel.
  var newCost=mnds.map(function(_,mi){return newPA[mi]*kmColl+(toeslag[mi]||0);});
  var besV=mnds.map(function(_,mi){return indKm[mi]-newCost[mi];});
  var totB2=besV.reduce(function(s,v){return s+v;},0);
  var totI=indKm.reduce(function(s,v){return s+v;},0);
  var restKm=newCost.reduce(function(s,v){return s+v;},0);
  var totTs2=toeslag.reduce(function(s,v){return s+(v||0);},0);

  document.getElementById('simKpis').innerHTML=
    '<div class="kb'+(totB2>=0?' grn':'')+'"><div class="kl">Besparing vs. individueel</div><div class="kv">€ '+fmt(totB2)+'</div><div class="ku">meetperiode</div></div>'+
    '<div class="kb'+(gemVol(besV)>=0?' grn':'')+'"><div class="kl">Per jaar</div><div class="kv">€ '+fmt(gemVol(besV)*12)+'</div><div class="ku">geëxtrapoleerd'+(nPvol&&nPvol<mnds.length?(' over '+nPvol+' volledige '+(nPvol===1?'maand':'maanden')):'')+'</div></div>'+
    '<div class="kb"><div class="kl">Resterende kW-max kosten</div><div class="kv">€ '+fmt(restKm)+'</div><div class="ku">'+(totTs2?'incl. MS/LS-toeslag':'collectief')+'</div></div>'+
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
