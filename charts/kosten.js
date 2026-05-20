function drawKosten(allTs,perKw,cos){
  dC('kost');
  var kd=cos.map(function(c,ci){
    var sa=SA[c.stedinA||'none']||SA.none;var st2=ST[c.stedinT||'none']||ST.none;
    var mndSet={};allTs.forEach(function(ts){mndSet[ts.slice(0,7)]=1;});var nMnd=Object.keys(mndSet).length||12;
    var aansl=sa.y/12*nMnd;var vast=st2.vr*nMnd;
    var mPA={};var mPT={};var dn=0;var dl=0;var ka=0;var kt=0;var ea=0;var et=0;
    perKw[ci].forEach(function(kw,i){
      if(kw==null)return;var mn=allTs[i].slice(0,7);
      var va=Math.max(0,kw);var vt=Math.max(0,-kw);
      if(!mPA[mn]||va>mPA[mn])mPA[mn]=va;if(!mPT[mn]||vt>mPT[mn])mPT[mn]=vt;
      var kwh=va*0.25;if(isDL(allTs[i]))dl+=kwh;else dn+=kwh;
      if(kw>0){ka+=kw*0.25;ea+=kw*0.25*(c.priceA||0.12);}
      else{kt+=(-kw)*0.25;et+=(-kw)*0.25*(c.priceT||0.08);}
    });
    var kwM=Object.keys(mPA).reduce(function(s,mn){return s+(mPA[mn]||0)*st2.km;},0);
    var kwC=(c.gtvA||150)*st2.kc*nMnd;
    var dt=dn*st2.dn+dl*st2.dl;var totNet=aansl+vast+kwC+kwM+dt;
    return{name:c.name,ka:ka/1000,kt:kt/1000,ea:ea,et:et,netto:ea-et,aansl:aansl,vast:vast,kwC:kwC,kwM:kwM,dt:dt,totNet:totNet,nMnd:nMnd,c:c,sa:sa,st2:st2};
  });
  CH['kost']=new Chart(document.getElementById('cKost'),{type:'bar',data:{labels:kd.map(function(d){return d.name;}),datasets:[
    {label:'Energiekosten afname',data:kd.map(function(d){return+d.ea.toFixed(0);}),backgroundColor:cos.map(function(_,i){return PAL[i%PAL.length];}),borderRadius:5},
    {label:'Nettarieven Stedin',data:kd.map(function(d){return+d.totNet.toFixed(0);}),backgroundColor:cos.map(function(_,i){return PAL[i%PAL.length]+'88';}),borderRadius:5},
    {label:'Teruglevering',data:kd.map(function(d){return+(-d.et).toFixed(0);}),backgroundColor:'rgba(70,150,43,.25)',borderRadius:5},
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#888',font:{family:'Barlow',size:11},boxWidth:10}}},scales:{x:Object.assign(ax(),{grid:{display:false}}),y:ax('€')}}});
  var html=kd.map(function(d,i){
    return '<tr style="border-bottom:2px solid #e2ecdf"><td colspan="6" style="padding:4px 8px 1px;font-size:9px;font-weight:800;text-transform:uppercase;color:#46962b"><span style="background:'+PAL[i%PAL.length]+';width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:4px;vertical-align:middle"></span>'+d.name+'</td></tr>'+
    '<tr><td style="padding-left:14px;color:#888">Energie afname</td><td>'+d.ka.toFixed(1)+' MWh</td><td>—</td><td>€ '+fmt(d.ea)+'</td><td>—</td><td>—</td></tr>'+
    '<tr><td style="padding-left:14px;color:#888">Energie teruglevering</td><td>—</td><td>'+d.kt.toFixed(1)+' MWh</td><td>—</td><td style="color:#46962b">€ '+fmt(d.et)+'</td><td>—</td></tr>'+
    '<tr><td style="padding-left:14px;color:#888">Aansluitvergoeding</td><td colspan="3" style="font-size:10px;color:#666">'+d.sa.l+' · '+d.nMnd+' mnd</td><td>—</td><td>€ '+fmt(d.aansl)+'</td></tr>'+
    '<tr><td style="padding-left:14px;color:#888">Vastrecht transport</td><td colspan="3" style="font-size:10px;color:#666">'+d.st2.l+'</td><td>—</td><td>€ '+fmt(d.vast)+'</td></tr>'+
    '<tr><td style="padding-left:14px;color:#888">kW-contract (GTV-A)</td><td colspan="3" style="font-size:10px;color:#666">'+(d.c.gtvA||150)+' kW x €'+d.st2.kc.toFixed(4)+'/kW/mnd</td><td>—</td><td>€ '+fmt(d.kwC)+'</td></tr>'+
    '<tr><td style="padding-left:14px;color:#888;font-weight:700">kW-max</td><td colspan="3" style="font-size:10px;color:#666">Max afname/mnd x €'+d.st2.km.toFixed(4)+'/kW</td><td>—</td><td><strong>€ '+fmt(d.kwM)+'</strong></td></tr>'+
    '<tr><td style="padding-left:14px;color:#888">Dubbel tarief</td><td colspan="3" style="font-size:10px;color:#666">Norm €'+d.st2.dn+'/kWh · Laag €'+d.st2.dl+'/kWh</td><td>—</td><td>€ '+fmt(d.dt)+'</td></tr>'+
    '<tr style="background:#f7fbf5"><td style="padding-left:14px;font-weight:700">Totaal</td><td>'+d.ka.toFixed(1)+' MWh</td><td>'+d.kt.toFixed(1)+' MWh</td><td>€ '+fmt(d.ea)+'</td><td style="color:#46962b">€ '+fmt(d.et)+'</td><td><strong style="color:'+((d.netto+d.totNet)>0?'#c0392b':'#46962b')+'">€ '+fmt(d.netto+d.totNet)+'</strong></td></tr>';
  }).join('');
  document.getElementById('kostenBody').innerHTML=html;
}
