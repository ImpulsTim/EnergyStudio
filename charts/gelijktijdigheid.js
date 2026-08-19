var _gCache=null;
var _gSeizoen='all';
var _gWeekChartInst=null;
var _gMaandChartInst=null;

var _GSEIZ={
  all:null,
  win:[11,0,1],
  spr:[2,3,4],
  sum:[5,6,7],
  aut:[8,9,10]
};

function drawGelijktijdigheid(allTs,perKw,cos){
  _gCache={allTs:allTs,perKw:perKw,cos:cos};
  _gSeizoen='all';
  _renderGelijkt();
}

function setGelijktSeizoen(sf){
  _gSeizoen=sf;
  // Stijl seizoen-knoppen bijwerken
  var wrap=document.getElementById('gelijktSeizFilter');
  if(wrap)wrap.querySelectorAll('[data-gsf]').forEach(function(b){
    b.style.background=b.getAttribute('data-gsf')===sf?'#46962b':'';
    b.style.color=b.getAttribute('data-gsf')===sf?'#fff':'';
  });
  _renderGelijkt();
}

function _renderGelijkt(){
  if(!_gCache)return;
  var allTs=_gCache.allTs,perKw=_gCache.perKw,cos=_gCache.cos;
  if(!allTs||!allTs.length||!perKw||!perKw.length)return;

  var mf=_GSEIZ[_gSeizoen]||null; // array van maandnummers of null
  var S=7*96;
  var matchedS=[],exportedS=[];
  for(var i=0;i<S;i++){matchedS.push([]);exportedS.push([]);}

  // Maand-rollup voor maandgrafiek
  var maandMap={};

  var T=allTs.length,n=perKw.length;
  var totProdKwh=0,totMatchedKwh=0,totExportKwh=0;

  for(var t=0;t<T;t++){
    var tProd=0,tCons=0;
    for(var ci=0;ci<n;ci++){
      var kw=perKw[ci][t]||0;
      if(kw<0)tProd+=(-kw);
      else if(kw>0)tCons+=kw;
    }
    if(tProd===0)continue; // geen productie dit kwartier

    var matched=Math.min(tProd,tCons);
    var exported=tProd-matched;
    var matchedKwh=matched*0.25,exportedKwh=exported*0.25;
    totProdKwh+=tProd*0.25;
    totMatchedKwh+=matchedKwh;
    totExportKwh+=exportedKwh;

    // Weekpatroon-slot (seizoenfilter)
    var d=new Date(allTs[t]);
    var maand=d.getMonth();
    var inSeiz=!mf||(mf.indexOf(maand)>=0);
    if(inSeiz){
      var dow=(d.getDay()+6)%7;
      var sl=dow*96+Math.floor((d.getHours()*60+d.getMinutes())/15);
      if(sl>=0&&sl<S){
        matchedS[sl].push(matched);
        exportedS[sl].push(exported);
      }
    }

    // Maandrollup (altijd over heel het jaar)
    var mn=allTs[t].slice(0,7);
    if(!maandMap[mn])maandMap[mn]={matched:0,exported:0};
    maandMap[mn].matched+=matchedKwh;
    maandMap[mn].exported+=exportedKwh;
  }

  // KPI-kaarten
  var pctMatched=totProdKwh>0?Math.round(totMatchedKwh/totProdKwh*100):0;
  var pctExport=100-pctMatched;
  var kpiEl=document.getElementById('gelijktKpis');
  if(kpiEl){
    function kb(lbl,val,ku){return '<div class="kb"><div class="kl">'+lbl+'</div><div class="kv" style="font-size:16px">'+val+'</div>'+(ku?'<div class="ku">'+ku+'</div>':'')+'</div>';}
    function fmt1(v){return (Math.round(v)/1000).toFixed(1);}
    kpiEl.innerHTML=
      kb('Totale opwek',fmt1(totProdKwh)+' MWh','in de meetperiode')+
      kb('Gesaldeerd in groep',fmt1(totMatchedKwh)+' MWh',pctMatched+'% van opwek')+
      kb('Teruggeleverd aan net',fmt1(totExportKwh)+' MWh',pctExport+'% van opwek')+
      kb('Gelijktijdigheidsfactor',pctMatched+'%','productie ∩ verbruik');
  }

  // Weekpatroon-grafiek
  var avg=function(a){return a.length?+(a.reduce(function(x,y){return x+y;},0)/a.length).toFixed(3):null;};
  var matchedAvg=matchedS.map(avg),exportedAvg=exportedS.map(avg);
  var totalAvg=matchedAvg.map(function(v,i){
    var e=exportedAvg[i];
    return (v===null&&e===null)?null:((v||0)+(e||0));
  });
  var pctAvg=matchedAvg.map(function(v,i){
    var tot=(v||0)+(exportedAvg[i]||0);
    return tot>0.01?Math.round((v||0)/tot*100):null;
  });
  var DN=['Ma','Di','Wo','Do','Vr','Za','Zo'],lb=[];
  for(var i=0;i<S;i++){
    var dow=Math.floor(i/96),h=Math.floor((i%96)/4),m=(i%4)*15;
    lb.push(i%96===0?DN[dow]:(h%6===0&&m===0?(String(h).padStart(2,'0')+':00'):''));
  }
  var cw=document.getElementById('cGelijktWeek');
  if(cw){
    if(_gWeekChartInst){try{_gWeekChartInst.destroy();}catch(e){}_gWeekChartInst=null;}
    _gWeekChartInst=new Chart(cw,{
      type:'line',
      data:{labels:lb,datasets:[
        {label:'Gesaldeerd in groep (kW)',data:matchedAvg,
          fill:'origin',backgroundColor:'rgba(70,150,43,0.5)',borderColor:'#46962b',
          borderWidth:1,tension:0.3,pointRadius:0,yAxisID:'y'},
        {label:'Teruggeleverd aan net (kW)',data:totalAvg,
          fill:'-1',backgroundColor:'rgba(149,165,166,0.45)',borderColor:'#95a5a6',
          borderWidth:1,tension:0.3,pointRadius:0,yAxisID:'y'},
        {label:'% gesaldeerd',data:pctAvg,
          fill:false,borderColor:'#2c7fb8',borderWidth:1.5,borderDash:[3,2],
          tension:0.3,pointRadius:0,yAxisID:'y2'}
      ]},
      options:{
        responsive:true,maintainAspectRatio:false,
        plugins:{legend:{labels:{color:'#888',font:{family:'Barlow',size:11},boxWidth:10}}},
        scales:{
          x:{ticks:{color:'#999',font:{family:'Barlow',size:11},maxTicksLimit:30,autoSkip:false,
            callback:function(v,i){return lb[i]||null;}},grid:{color:'#f3f7f4'}},
          y:{ticks:{font:{family:'Barlow',size:11}},title:{display:true,text:'kW',font:{family:'Barlow',size:11}},
            grid:{color:function(ctx){return ctx.tick.value===0?'#ccc':'#f3f7f4';}}},
          y2:{position:'right',min:0,max:100,
            ticks:{font:{family:'Barlow',size:11},color:'#2c7fb8',callback:function(v){return v+'%';}},
            title:{display:true,text:'% gesaldeerd',font:{family:'Barlow',size:11},color:'#2c7fb8'},
            grid:{drawOnChartArea:false}}
        }
      }
    });
  }

  // Maandoverzicht-grafiek
  var maanden=Object.keys(maandMap).sort();
  var mNames=['Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
  var mLbls=maanden.map(function(m){
    var p=m.split('-');return p.length>=2?mNames[parseInt(p[1],10)-1]+' \''+p[0].slice(2):m;
  });
  var mMatched=maanden.map(function(m){return Math.round(maandMap[m].matched);});
  var mExported=maanden.map(function(m){return Math.round(maandMap[m].exported);});
  // Dekking uit allTs, niet uit maandMap: maandMap vult alleen op kwartieren mét productie,
  // dus een maand zonder opwek zou daar ten onrechte als "leeg" gelden.
  var gDek=maandDekking(allTs);
  var gVol=maanden.map(function(m){return _dek(gDek,m).volledig;});
  var gWarn=document.getElementById('gelijktMaandWarn');
  if(gWarn)gWarn.innerHTML=onvolledigNotice(maanden,gDek,'opwek','#46962b');
  var cm=document.getElementById('cGelijktMaand');
  if(cm){
    if(_gMaandChartInst){try{_gMaandChartInst.destroy();}catch(e){}_gMaandChartInst=null;}
    _gMaandChartInst=new Chart(cm,{
      type:'bar',
      data:{labels:mLbls.map(function(l,i){return gVol[i]?l:(l+'*');}),datasets:[
        Object.assign({label:'Gesaldeerd in groep (kWh)',data:mMatched,stack:'s'},hatchBar(gVol,'#46962b')),
        Object.assign({label:'Teruggeleverd aan net (kWh)',data:mExported,stack:'s'},hatchBar(gVol,'#b2bec3'))
      ]},
      options:{
        responsive:true,maintainAspectRatio:false,
        plugins:{legend:{labels:{color:'#888',font:{family:'Barlow',size:11},boxWidth:10}},
          tooltip:{callbacks:{afterBody:function(items){
            if(!items.length)return [];
            var idx=items[0].dataIndex;
            var tot=(mMatched[idx]||0)+(mExported[idx]||0);
            var uit=tot>0?['Gesaldeerd: '+Math.round((mMatched[idx]||0)/tot*100)+'%']:[];
            return uit.concat(maandDekkingTip(_dek(gDek,maanden[idx])));
          }}}},
        scales:{
          x:{stacked:true,ticks:{font:{family:'Barlow',size:11}}},
          y:{stacked:true,ticks:{font:{family:'Barlow',size:11}},
            title:{display:true,text:'kWh',font:{family:'Barlow',size:11}}}
        }
      }
    });
  }
}
