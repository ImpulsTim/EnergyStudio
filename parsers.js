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
  var r=new FileReader();
  r.onload=function(e){
    try{
      var data;
      if(file.name.toLowerCase().indexOf('.json')>-1)data=parseJSON(JSON.parse(e.target.result));
      else data=parseCSV(e.target.result);
      if(!data||!data.length){notify('Geen geldige metingen',false);return;}
      pendData=data;
      document.getElementById('cPills').innerHTML='<div class="pl">'+file.name+' — '+data.length+' metingen (kW)</div>';
      notify(data.length+' kwartierwaarden ingeladen');
    }catch(err){notify('Fout: '+err.message,false);}
  };
  r.onerror=function(){notify('Kan bestand niet lezen',false);};
  r.readAsText(file,'UTF-8');
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
    var ts=p[0].trim().replace(/"/g,'');
    var val=parseFloat(p[1].trim().replace(',','.'));
    if(ts&&!isNaN(val))result.push({ts:ts,kw:Math.round(val*4*1000)/1000});
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
  return Object.keys(map).sort().map(function(ts){return{ts:ts,kw:Math.round(map[ts]*1000)/1000};});
}
