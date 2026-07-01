function initUpload(){
  var btn=document.getElementById('cDropBtn');
  var inp=document.getElementById('cFileIn');
  var zone=document.getElementById('cDrop');
  btn.addEventListener('click',function(e){e.stopPropagation();inp.value='';inp.click();});
  inp.addEventListener('change',function(e){var f=e.target.files[0];if(f)handleFile(f);});
  zone.addEventListener('dragover',function(e){e.preventDefault();zone.classList.add('ov');});
  zone.addEventListener('dragleave',function(){zone.classList.remove('ov');});
  zone.addEventListener('drop',function(e){e.preventDefault();zone.classList.remove('ov');var f=e.dataTransfer.files[0];if(f)handleFile(f);});
}

function handleFile(file){
  pendName=file.name;
  var carrierEl=document.getElementById('cCarrier');
  var carrier=(carrierEl&&carrierEl.value)||'elektra';
  var r=new FileReader();
  r.onload=function(e){
    try{
      var data,unitLbl;
      if(carrier==='elektra'){
        // Ongewijzigd elektra-pad: kWh/kwartier → kW (×4), MEPS-JSON ondersteund.
        if(file.name.toLowerCase().indexOf('.json')>-1){data=parseJSON(JSON.parse(e.target.result));}
        else{var _raw=e.target.result,_sep=_raw.split('\n')[0].indexOf(';')>-1?';':',',_h=(_raw.split('\n')[0].split(_sep)[1]||'').trim().toLowerCase();data=(_h==='netto')?parseNettoCSV(_raw):parseCSV(_raw);}
        unitLbl='kW';
      }else{
        // Gas/warmte: ruwe meetwaarde per interval, geen kW-omrekening.
        data=parseCarrierCSV(e.target.result);
        unitLbl=(typeof carrierDef==='function')?carrierDef(carrier).unit:'';
      }
      if(!data||!data.length){notify('Geen geldige metingen',false);return;}
      pendData=data;
      document.getElementById('cPills').innerHTML='<div class="pl">'+file.name+' — '+data.length+' metingen ('+unitLbl+')</div>';
      notify(data.length+' metingen ingeladen');
    }catch(err){notify('Fout: '+err.message,false);}
  };
  r.onerror=function(){notify('Kan bestand niet lezen',false);};
  r.readAsText(file,'UTF-8');
}

// Carrier-CSV (gas/warmte): "timestamp;waarde", komma- of puntkomma-gescheiden.
// Bewaart de ruwe meetwaarde als {ts,val} (m³ voor gas, kWh voor warmte) ZONDER
// kW-omrekening. Interval-detectie en kWh-conversie gebeuren in de analyse
// (_carrierSeries), zodat het bron-interval (bv. uurwaarden) behouden blijft.
// Normaliseert een energie-timestamp naar "YYYY-MM-DDTHH:MM".
// Herkent ISO (T of spatie), Europees punt (DD.MM.YYYY) en slash (DD/MM/YYYY).
// Zelfde logica als _normPriceTs maar afzonderlijk zodat parsers er onafhankelijk
// gebruik van kunnen maken vóór _normPriceTs geladen is.
function _normTs(raw){
  raw=(raw||'').toString().trim().replace(/"/g,'');
  var m;
  m=raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if(m)return m[1]+'-'+m[2]+'-'+m[3]+'T'+m[4]+':'+m[5];
  m=raw.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
  if(m)return m[3]+'-'+m[2]+'-'+m[1]+'T'+m[4]+':'+m[5];
  m=raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if(m)return m[3]+'-'+m[2]+'-'+m[1]+'T'+m[4]+':'+m[5];
  return raw.slice(0,16);
}

function parseCarrierCSV(text){
  var lines=text.replace(/\r/g,'').trim().split('\n');
  if(!lines.length)return [];
  var sep=lines[0].indexOf(';')>-1?';':',';
  var start=0;
  var firstVal=(lines[0].split(sep)[1]||'').trim().replace(',','.');
  if(isNaN(parseFloat(firstVal)))start=1; // koprij overslaan
  var result=[];
  for(var i=start;i<lines.length;i++){
    var p=lines[i].split(sep);if(p.length<2)continue;
    var ts=_normTs(p[0]);
    var val=parseFloat(p[1].trim().replace(',','.'));
    if(ts&&!isNaN(val))result.push({ts:ts,val:Math.round(val*1000)/1000});
  }
  return result;
}

function parseCSV(text){
  var lines=text.replace(/\r/g,'').trim().split('\n');
  var sep=lines[0].indexOf(';')>-1?';':',';
  var start=0;
  var firstVal=(lines[0].split(sep)[1]||'').trim().replace(',','.');
  if(isNaN(parseFloat(firstVal)))start=1;
  var result=[];
  for(var i=start;i<lines.length;i++){
    var p=lines[i].split(sep);if(p.length<2)continue;
    var ts=_normTs(p[0]);
    var val=parseFloat(p[1].trim().replace(',','.'));
    if(ts&&!isNaN(val))result.push({ts:ts,kw:Math.round(val*4*1000)/1000});
  }
  return result;
}

// Netto-CSV (time_stamp;netto): gesigneerde kWh/kwartier → ×4 → kW.
// Positief = afname, negatief = teruglevering. Zelfde intern {ts,kw}-formaat als parseCSV.
function parseNettoCSV(text){
  var lines=text.replace(/\r/g,'').trim().split('\n');
  var sep=lines[0].indexOf(';')>-1?';':',';
  var result=[];
  for(var i=1;i<lines.length;i++){
    var p=lines[i].split(sep);if(p.length<2)continue;
    var ts=_normTs(p[0]);
    var val=parseFloat(p[1].trim().replace(',','.'));
    if(ts&&!isNaN(val))result.push({ts:ts,kw:Math.round(val*4*1000)/1000});
  }
  return result;
}

// Normaliseert EPEX-timestamps naar "YYYY-MM-DDTHH:MM".
// Ondersteunt: ISO, Europees dd.mm.yyyy, slash-formaat, ENTSO-E range "dd.mm.yyyy HH:MM - HH:MM".
function _normPriceTs(raw){
  raw=raw.trim().replace(/"/g,'');
  // ENTSO-E range "01.01.2024 00:00 - 01.01.2024 01:00" → pak start
  raw=raw.split(' - ')[0].trim();
  var m;
  // ISO: "2024-01-01T00:00" of "2024-01-01 00:00"
  m=raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if(m)return m[1]+'-'+m[2]+'-'+m[3]+'T'+m[4]+':'+m[5];
  // Europees punt: "01.01.2024 00:00"
  m=raw.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
  if(m)return m[3]+'-'+m[2]+'-'+m[1]+'T'+m[4]+':'+m[5];
  // Slash: "01/01/2024 00:00" (aanname DD/MM/YYYY voor NL)
  m=raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if(m)return m[3]+'-'+m[2]+'-'+m[1]+'T'+m[4]+':'+m[5];
  return raw.slice(0,16);
}

// EPEX/EEX-prijsreeks: CSV met "timestamp;prijs" (of komma-gescheiden).
// Geeft [{ts, price}] terug. price = KALE marktprijs €/kWh; negatieve prijzen blijven negatief.
// opts.perMWh=true rekent €/MWh om naar €/kWh (deel door 1000).
function parsePriceCSV(text,opts){
  opts=opts||{};
  var lines=text.replace(/\r/g,'').trim().split('\n');
  if(!lines.length)return [];
  var sep=lines[0].indexOf(';')>-1?';':',';
  var start=0;
  var firstVal=(lines[0].split(sep)[1]||'').trim().replace(',','.');
  if(isNaN(parseFloat(firstVal)))start=1; // koprij overslaan
  var div=opts.perMWh?1000:1;
  var result=[];
  for(var i=start;i<lines.length;i++){
    var p=lines[i].split(sep);if(p.length<2)continue;
    var ts=_normPriceTs(p[0]);
    var price=parseFloat(p[1].trim().replace(',','.'));
    if(ts&&!isNaN(price))result.push({ts:ts,price:Math.round(price/div*1e6)/1e6});
  }
  return result;
}

function parseJSON(json){
  var map={};
  var meps=json.market_evaluation_points||[];
  for(var a=0;a<meps.length;a++){
    var mrs=meps[a].meter_readings||[];
    for(var b=0;b<mrs.length;b++){
      var ibs=mrs[b].interval_blocks||[];
      for(var c=0;c<ibs.length;c++){
        var dir=(ibs[c].reading_type&&ibs[c].reading_type.flow_direction)||'forward';
        var mult=(ibs[c].reading_type&&ibs[c].reading_type.multiplier==='k')?1:0.001;
        var irs=ibs[c].interval_readings||[];
        for(var d=0;d<irs.length;d++){
          var kw=irs[d].value*mult*4*(dir==='reverse'?-1:1);
          var ts=irs[d].time_stamp;
          map[ts]=(map[ts]||0)+kw;
        }
      }
    }
  }
  // Opslag op 1e-6 kW (µW): de bron levert 8 decimalen; grovere afronding (1e-3) stapelt
  // over 35.040 kwartieren op tot ~0,01 kWh/jaar en haalt de Mark-tolerantie (0,001 kWh) niet.
  return Object.keys(map).sort().map(function(ts){return{ts:ts,kw:Math.round(map[ts]*1e6)/1e6};});
}
