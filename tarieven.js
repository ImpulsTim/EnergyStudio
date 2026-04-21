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
