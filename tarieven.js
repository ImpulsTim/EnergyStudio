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

// --- Netvlakken, tariefcategorie en groepstarief (GTO) -----------------------
//
// Geverifieerde bronnen (gecontroleerd 22-09-2026 tegen de originele documenten):
//   [1] Stedin, tariefblad elektriciteit grootverbruik 2026 — tabel 2 (periodieke
//       aansluitvergoeding) en tabel 3 (transportvergoeding). Alle bedragen in
//       SA en ST hierboven komen letterlijk uit dat blad.
//   [2] Stedin, Tarieven- en vergoedingsregeling 2026 (TVE), art. 3 lid 2 en
//       art. 5 lid 1: indeling in tariefcategorie op basis van het GTV, waarbij
//       de categorie nooit hoger is dan die waarin de aansluiting is aangevraagd.
//   [3] Tarievencode elektriciteit art. 3.7.1 (categorieën; d = MS, e = Trafo MS/LS),
//       3.7.2 (indeling op GTV), 3.7.9 en 3.7.10 (tariefdragers per categorie).
//   [4] ACM, Codebesluit groepstransportovereenkomst, Stcrt. 2025 nr. 43262,
//       besluit 11-12-2025, in werking 20-12-2025. Nieuwe Tarievencode-artikelen
//       3.1.3a, 3.7.2a, 3.7.18 en 3.7.19.
//
// Drie begrippen die deze app strikt uit elkaar houdt — ze vallen niet samen:
//   netvlak / aansluitcategorie  waar de aansluiting fysiek op zit (volgt uit kVA)
//   individuele tariefcategorie  waarop de klant zónder GTO wordt afgerekend (uit GTV, [2][3])
//   groepstariefcategorie        waarop de GTO wordt afgerekend (hoogste netvlak, art. 3.7.2a)
//
// Let op: de ACM heeft de door de netbeheerders voorgestelde correctiefactor van
// 1,21 op kWgecontracteerd en kWmax NIET overgenomen (Stcrt. 2025-43262, rnr. 177).
// Er wordt hier dus bewust zonder opslagfactor gerekend.

// Zwaarte van een transportcategorie, voor "hoogste netvlak"-vergelijkingen.
var ST_RANG={none:0,LS:1,TrafoMSLS:2,MS:3,TrafoHSres:4,TrafoHS:4,TSres:5,TS:5};

// Netvlak (aansluitcategorie) uit de fysieke aansluitcapaciteit in kVA, volgens
// de grenzen van Stedin tabel 2 [1]:
//   t/m 175 kVA      → Trafo MS/LS   (aansluitcapaciteitscategorie A.3)
//   176 - 1.750 kVA  → MS            (A.4 / A.5)
//   1.751 - 10.000   → Trafo HS+TS/MS (A.6)
//   > 10.000 kVA     → TS            (A.7)
//
// AANNAME, bewust gemaakt en hier expliciet vastgelegd: de ACM definieert A.3 in
// het codebesluit [4] als "aansluitcapaciteit van 60 kVA tot en met 0,3 MVA met
// een zuivere LS-aansluiting" en A.4/A.5 als 0,3-3 MVA. Die grenzen (300 kVA /
// 3 MVA) wijken af van de grenzen die Stedin zelf in tabel 1 en 2 hanteert
// (175 kVA / 1.750 kVA). Op verzoek volgt deze app de Stedin-grenzen, omdat de
// afrekening van Stedin komt. Tussen 175 en 300 kVA verschillen beide lezingen;
// gtoGrijzeZone() markeert die aansluitingen zodat het zichtbaar blijft.
var A3_GRENS_KVA=175, A45_GRENS_KVA=1750, A6_GRENS_KVA=10000;
var A3_GRENS_KVA_ACM=300; // alleen voor de waarschuwing, niet voor de berekening

function stCatUitKva(kva){
  var v=parseFloat(kva);
  if(isNaN(v)||v<=0)return null;
  if(v<=A3_GRENS_KVA)return 'TrafoMSLS';
  if(v<=A45_GRENS_KVA)return 'MS';
  if(v<=A6_GRENS_KVA)return 'TrafoHS';
  return 'TS';
}

// Tariefcategorie uit het gecontracteerd transportvermogen — Tarievencode art.
// 3.7.2 [3], met de grenzen uit de kolom "Grens gecontracteerd transportvermogen"
// van Stedin tabel 3 [1]. Boven 1.500 kW geldt het werkelijke spanningsniveau
// (art. 3.7.2 onder e); dat geeft hier null, zodat het netvlak beslist.
function stCatUitGtv(kw){
  var v=parseFloat(kw);
  if(isNaN(v)||v<=0)return null;
  if(v<=50)return 'LS';
  if(v<=150)return 'TrafoMSLS';
  if(v<=1500)return 'MS';
  return null;
}

// Netvlak van één aansluiting. Met `stAuto` volgt het netvlak de capaciteit;
// anders geldt de handmatige keuze.
function connNetvlakCat(c){
  c=c||{};
  if(c.stAuto){var a=stCatUitKva(c.kva);if(a)return a;}
  var k=c.stedinT||'none';
  return ST[k]?k:'none';
}

// Individuele tariefcategorie — de "voor"-situatie, waarop een deelnemer zonder
// GTO wordt afgerekend. Hier botsen twee lezingen en is bewust gekozen:
//
//   [a] Tarievencode art. 3.7.2 en Stedin TVE 2026 art. 5 lid 1 delen een losse
//       afnemer in op basis van zijn gecontracteerd transportvermogen (t/m 50 kW
//       LS, 51-150 Trafo MS/LS, 151-1.500 MS), begrensd door de aansluitcategorie.
//   [b] Stedin heeft desgevraagd schriftelijk bevestigd, op de concrete vraag of
//       een aansluiting van 3x315A (218 kVA) met een kW-contract van 137 het
//       Trafo MS/LS- of het MS-D-tarief betaalt: "Het GTV is niet leidend voor de
//       tariefcategorie maar de aansluiting van de klant. Er moet dus niet gekeken
//       worden naar kWcontract maar naar het systeemvlak waarop de aansluitingen
//       aangesloten zijn."
//
// Deze app volgt [b], de schriftelijke bevestiging van de netbeheerder zelf.
// Dat is tevens de behoudende kant: lezing [a] zou deelnemers met een laag GTV
// individueel in de duurdere Trafo MS/LS-categorie plaatsen, waardoor de GTO een
// tariefstap "bespaart" die de MS/LS-toeslag van art. 3.7.19 niet terughaalt —
// die toeslag hangt namelijk aan de fysieke categorie A.3, niet aan het GTV.
// Dat die twee niet op elkaar aansluiten is precies het teken dat [a] hier de
// besparing overschat.
//
// gtoGtvAfwijking() maakt zichtbaar welke aansluitingen aan deze keuze hangen.
function connTariefCat(c){return connNetvlakCat(c);}

// Aansluitingen waarvoor lezing [a] een lichtere tariefcategorie zou opleveren
// dan het systeemvlak. Verandert niets aan de berekening; maakt alleen zichtbaar
// waar de uitkomst gevoelig is voor de gekozen lezing.
function gtoGtvAfwijking(cos){
  var out=[];
  (cos||[]).forEach(function(c){
    var nv=connNetvlakCat(c),uitGtv=stCatUitGtv(c&&c.gtvA);
    if(uitGtv&&(ST_RANG[uitGtv]||0)<(ST_RANG[nv]||0))
      out.push({conn:c,netvlak:nv,uitGtv:uitGtv});
  });
  return out;
}

// Terugwaarts compatibel: bestaande aanroepers vroegen om de categorie waarop
// een losse aansluiting wordt afgerekend.
function connStCat(c){return connTariefCat(c);}
function connSt(c){return ST[connTariefCat(c)]||ST.none;}
function connNetvlak(c){return ST[connNetvlakCat(c)]||ST.none;}

// Tariefcategorie van de groep — Tarievencode art. 3.7.2a [4]: "de groep wordt
// ingedeeld in de tariefcategorie die overeenkomt met het hoogste netvlak
// waarmee de aan de groep deelnemende individuele aansluitingen zijn verbonden
// die elektriciteit mogen afnemen". Het GTV speelt hier dus géén rol meer.
function groepsStCat(cos){
  var best='none';
  (cos||[]).forEach(function(c){
    var k=connNetvlakCat(c);
    if((ST_RANG[k]||0)>(ST_RANG[best]||0))best=k;
  });
  return best;
}

// Aansluitingen waarvan de kVA tussen de Stedin-grens en de ACM-grens voor A.3
// valt: daar verschillen beide lezingen over het wel of niet toeslagplichtig zijn.
function gtoGrijzeZone(cos){
  return (cos||[]).filter(function(c){
    var v=parseFloat(c&&c.kva);
    return !isNaN(v)&&v>A3_GRENS_KVA&&v<=A3_GRENS_KVA_ACM;
  });
}

// Is deze aansluiting toeslagplichtig? Art. 3.7.19 [4] wijst de toeslag toe aan
// aansluitingen in aansluitcapaciteitscategorie A.3 — hier het netvlak Trafo MS/LS.
function connIsA3(c){return connNetvlakCat(c)==='TrafoMSLS';}

// MS/LS-toeslag — Tarievencode art. 3.7.19 [4], letterlijk:
//   "per maand 1/12 deel van de in artikel 3.7.10, onderdeel a, bedoelde
//    verhoging van toepassing, vermenigvuldigd met de som van de kWmax waarden
//    van alle aan de groep deelnemende aansluitingen behorend tot de
//    aansluitcapaciteitscategorie als bedoeld in bijlage A, onderdeel A.3."
// De "verhoging" uit art. 3.7.10 onderdeel a is het bedrag waarmee het
// kWgecontracteerd-tarief van Trafo MS/LS dat van MS overstijgt — de dekking van
// de MS/LS-trafo. In jaartarieven: (kc_MSLS - kc_MS) x 12, gedeeld door 12 per
// maand. Omdat Stedin maandtarieven publiceert vallen die x12 en /12 tegen
// elkaar weg en blijft het verschil in maandtarief over.
//   Stedin 2026: 3,9308 - 2,0228 = 1,9080 EUR/kW/maand.
var MSLS_TOESLAG=+(ST.TrafoMSLS.kc-ST.MS.kc).toFixed(4);

// Toeslagtarief voor deze groep. Art. 3.7.19 stelt als voorwaarde dat de groep
// aansluitingen uit A.3 én uit A.4 of A.5 bevat.
function gtoToeslagTarief(cos){
  var heeftA3=false,heeftA45=false;
  (cos||[]).forEach(function(c){
    var k=connNetvlakCat(c);
    if(k==='TrafoMSLS')heeftA3=true;else if(k==='MS')heeftA45=true;
  });
  return(heeftA3&&heeftA45)?MSLS_TOESLAG:0;
}

// Toeslag per maand. Alleen de maandpieken van de A.3-deelnemers tellen mee.
// indPieken[deelnemer][maand] = afnamepiek kW.
function gtoToeslagPerMaand(cos,indPieken,mnds){
  var tar=gtoToeslagTarief(cos);
  indPieken=indPieken||[];
  return (mnds||[]).map(function(_,mi){
    if(!tar)return 0;
    var som=0;
    (cos||[]).forEach(function(c,ci){
      if(!connIsA3(c))return;
      som+=((indPieken[ci]||[])[mi]||0);
    });
    return som*tar;
  });
}

// kW-contract bij een GTO — Tarievencode art. 3.7.18 onderdeel a [4]: de
// component kWgecontracteerd wordt toegepast op het transport over de
// aansluitingen van de groepsdeelnemers gezamenlijk. De groep heeft dus één GTV
// tegen het groepstarief, in plaats van een eigen GTV per deelnemer.
//
// Individueel: som over de deelnemers van GTV x kWcontract-tarief van de eigen
// tariefcategorie (die volgt uit het GTV, zie connTariefCat).
// Collectief:  groeps-GTV x kWcontract-tarief van de groepscategorie.
// Beide in EUR per maand; ST.kc is een maandtarief.
//
// Niet meegenomen, omdat ze bij een GTO ongewijzigd blijven en dus wegvallen in
// het verschil: het vastrecht (art. 3.1.3a: som van de vastrechten van de
// netvlakken van de individuele aansluitingen), het kWh-tarief (art. 3.7.18
// onderdeel c: op het totaal van de afzonderlijke aansluitingen) en de periodieke
// aansluitvergoeding (de aansluitovereenkomst blijft per deelnemer bestaan).
function gtoKwContract(cos,groepsGtvA){
  cos=cos||[];
  var grpCat=groepsStCat(cos);
  var grpTar=(ST[grpCat]||ST.none).kc;
  var perAansluiting=cos.map(function(c){
    var cat=connTariefCat(c),tar=(ST[cat]||ST.none).kc;
    var gtv=parseFloat(c&&c.gtvA);if(isNaN(gtv)||gtv<0)gtv=0;
    // uitGtv: wat lezing [a] (indeling op GTV) zou opleveren — alleen ter
    // informatie in de tabel, telt niet mee in de bedragen.
    var uitGtv=stCatUitGtv(gtv);
    var afwijkend=!!(uitGtv&&(ST_RANG[uitGtv]||0)<(ST_RANG[cat]||0));
    return {naam:(c&&c.name)||'',gtv:gtv,cat:cat,netvlak:connNetvlakCat(c),
      uitGtv:afwijkend?uitGtv:null,tarief:tar,perMaand:gtv*tar};
  });
  var somGtv=perAansluiting.reduce(function(s,x){return s+x.gtv;},0);
  var gtv=parseFloat(groepsGtvA);
  if(isNaN(gtv)||gtv<0)gtv=somGtv;
  var indPerMaand=perAansluiting.reduce(function(s,x){return s+x.perMaand;},0);
  var collPerMaand=gtv*grpTar;
  return {perAansluiting:perAansluiting,somGtv:somGtv,groepsGtv:gtv,
    grpCat:grpCat,grpTarief:grpTar,
    indPerMaand:indPerMaand,collPerMaand:collPerMaand,
    besparingPerMaand:indPerMaand-collPerMaand};
}

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
