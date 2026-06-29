var PAL=['#46962b','#fbba00','#2980b9','#e67e22','#8e44ad','#c0392b','#16a085','#d35400','#a6d6cc','#242b38'];
var MND=['Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];

var SA={
  none:{l:'—',y:0},
  LS:{l:'LS',y:75.4},
  TrafoMSLS:{l:'Trafo MS/LS',y:171.84},
  MSdist:{l:'MS-distributie',y:1505},
  TrafoHS1:{l:'Trafo HS+TS/MS (<=5MVA)',y:3958.95},
  TrafoHS2:{l:'Trafo HS+TS/MS (<=10MVA)',y:17149.08},
  TS:{l:'TS',y:0}
};

var ST={
  none:{l:'—',vr:0,kc:0,km:0,dn:0,dl:0},
  LS:{l:'LS',vr:1.5,kc:1.5483,km:0,dn:0.0749,dl:0.046},
  TrafoMSLS:{l:'Trafo MS/LS',vr:36.75,kc:3.9308,km:3.0966,dn:0.0198,dl:0.0198},
  MS:{l:'MS',vr:36.75,kc:2.0228,km:3.0966,dn:0.0198,dl:0.0198},
  TrafoHSres:{l:'Trafo HS+TS/MS res',vr:230,kc:1.8938,km:1.8326,dn:0,dl:0},
  TrafoHS:{l:'Trafo HS+TS/MS',vr:230,kc:3.7876,km:5.2943,dn:0,dl:0},
  TSres:{l:'TS reserve',vr:230,kc:1.5625,km:1.435,dn:0,dl:0},
  TS:{l:'TS',vr:230,kc:3.125,km:4.1455,dn:0,dl:0}
};

var HOL={'01-01':1,'04-21':1,'04-28':1,'05-29':1,'06-09':1,'12-25':1,'12-26':1};

function isDL(ts){
  var d=new Date(ts);if(isNaN(d))return false;
  var w=d.getDay();if(w===0||w===6)return true;
  if(HOL[ts.slice(5,10)])return true;
  var h=d.getHours();return!(h>=7&&h<23);
}

// --- Energiedragers (multicommodity) -----------------------------------------
// Eén bron van waarheid per drager. Elektra is en blijft de default; bestaande
// aansluitingen zonder `carrier` worden overal als 'elektra' behandeld, zodat de
// huidige werking ongewijzigd blijft. Gas/warmte zijn additief.
//
// Velden:
//   key          interne sleutel
//   label        weergavenaam
//   unit         eenheid van de bron-/meetwaarde (kW, m³, kWh)
//   energieUnit  gemene-deler-eenheid voor energie-aggregatie (altijd kWh)
//   bidir        kan de drager teruglevering/invoeding hebben? (warmteuitwisseling)
//   interval     verwacht meetinterval ('kwartier' | 'uur' | 'auto')
//   kleur        grafiekkleur
//   prijsEenheid eenheid waarin eenvoudige kosten gerekend worden (kWh of m³)
//   calorisch    (gas) default kWh per m³ — per project instelbaar
//   weergaveUnit (warmte) optionele alternatieve weergave-eenheid
//   kwhPer       (warmte) factor om energieUnit→weergaveUnit te tonen (1 GJ ≈ 277,778 kWh)
var CARRIER={
  elektra:{key:'elektra',label:'Elektriciteit',unit:'kW', energieUnit:'kWh',bidir:true, interval:'kwartier',kleur:'#46962b',prijsEenheid:'kWh'},
  gas:    {key:'gas',    label:'Gas',          unit:'m³', energieUnit:'kWh',bidir:false,interval:'uur',     kleur:'#e67e22',prijsEenheid:'m³', calorisch:9.769,co2:1.788},
  warmte: {key:'warmte', label:'Warmte',       unit:'kWh',energieUnit:'kWh',bidir:true, interval:'auto',    kleur:'#c0392b',prijsEenheid:'kWh',weergaveUnit:'GJ',kwhPer:277.778}
};

// Carrier-definitie met veilige fallback naar elektra (voor legacy-aansluitingen).
function carrierDef(k){return CARRIER[k]||CARRIER.elektra;}

// Constanten voor de centrale hub-weergave (cross-carrier).
//   gridCo2 — CO₂-emissiefactor netstroom (kg/kWh), indicatief NL-gemiddelde.
//   cop     — COP-aanname warmtepomp voor het electrificatiepotentieel.
var HUB={gridCo2:0.27,cop:3};
