(function(){
if(window.__gxBattleSchedulerInstalled)return;
window.__gxBattleSchedulerInstalled=true;
var style=document.createElement('style');
style.textContent=".gxbs-backdrop{position:fixed;inset:0;z-index:99999;background:#020305d9;backdrop-filter:blur(8px);display:grid;place-items:center;padding:16px}.gxbs-modal{width:min(680px,100%);max-height:90vh;overflow:auto;background:linear-gradient(145deg,#15171b,#090a0c);border:1px solid #343840;border-radius:20px;box-shadow:0 25px 90px #000b;padding:22px;color:#f3f4f6}.gxbs-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:16px}.gxbs-head h2{margin:0;font-size:22px}.gxbs-sub{color:#a8adb6;font-size:13px;line-height:1.55;margin:7px 0 0}.gxbs-close,.gxbs-btn{background:#1a1c20;border:1px solid #393d45;color:#fff;border-radius:10px;padding:10px 13px;cursor:pointer}.gxbs-options{display:grid;gap:9px;margin:16px 0}.gxbs-option{display:flex;gap:10px;padding:13px;border:1px solid #343840;border-radius:13px;background:#0d0e10;cursor:pointer}.gxbs-option:has(input:checked){border-color:#c7a35b;background:#211b10}.gxbs-option input{margin-top:3px;accent-color:#c7a35b}.gxbs-option strong{display:block;font-size:13px}.gxbs-option small{display:block;color:#9ca2ac;font-size:12px;line-height:1.45;margin-top:4px}.gxbs-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0}.gxbs-field{display:grid;gap:6px}.gxbs-field label{font-size:12px;color:#c8cbd2}.gxbs-field input{width:100%;min-width:0;background:#08090b;border:1px solid #3a3e46;color:#fff;border-radius:10px;padding:11px}.gxbs-note{border:1px solid #4a4028;background:#1b170e;color:#d8c99f;border-radius:11px;padding:11px 12px;font-size:12px;line-height:1.5;margin:12px 0}.gxbs-actions{display:flex;gap:9px;justify-content:flex-end;flex-wrap:wrap;margin-top:18px}.gxbs-btn.primary{background:#e6e7e9;color:#090a0b;border-color:#e6e7e9;font-weight:800}.gxbs-btn:disabled{opacity:.55}.gxbs-match-list{display:grid;gap:10px;margin-top:14px}.gxbs-match{border:1px solid #30343b;border-radius:12px;padding:13px;background:#0c0d0f}.gxbs-match-title{font-weight:800;font-size:13px;margin-bottom:10px}.gxev-battle-highlight{outline:2px solid #c7a35b!important;box-shadow:0 0 0 5px #c7a35b22!important;transition:box-shadow .2s}@media(max-width:520px){.gxbs-modal{padding:16px}.gxbs-fields{grid-template-columns:1fr}.gxbs-head h2{font-size:19px}}";
document.head.appendChild(style);
var busy=false;
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c;});}
function pad(n){return String(n).padStart(2,'0');}
function state(){return typeof gxEventsDashboardData!=='undefined'?gxEventsDashboardData:null;}
function phaseById(id){return (state()?.phases||[]).find(function(p){return p.id===id;})||null;}
function phaseForMatch(m){var r=(state()?.rounds||[]).find(function(x){return x.id===m.round_id;});return phaseById(r?.phase_id);}
function bogotaParts(value){
  var d=value instanceof Date?value:new Date(value);
  var parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d);
  var out={};parts.forEach(function(p){if(p.type!=='literal')out[p.type]=p.value;});
  return {date:out.year+'-'+out.month+'-'+out.day,time:out.hour+':'+out.minute};
}
function localDT(phaseId){
  var d=new Date(Date.now()+3600000);d.setUTCMinutes(Math.ceil(d.getUTCMinutes()/5)*5,0,0);
  var phase=phaseById(phaseId);
  if(phase?.starts_at&&d<new Date(phase.starts_at)){d=new Date(phase.starts_at);d.setUTCMinutes(Math.ceil(d.getUTCMinutes()/5)*5,0,0);}
  if(phase?.ends_at&&d>new Date(phase.ends_at)){d=new Date(phase.ends_at);d.setUTCMinutes(Math.floor(d.getUTCMinutes()/5)*5,0,0);}
  return bogotaParts(d);
}
// The administrator always enters wall-clock time in Colombia, regardless of the device timezone.
function iso(date,time){if(!date||!time)return null;var d=new Date(date+'T'+time+':00-05:00');return isNaN(d.getTime())?null:d.toISOString();}
function close(){document.querySelector('.gxbs-backdrop')?.remove();}
function modal(title,subtitle,body,actions){
  close();var w=document.createElement('div');w.className='gxbs-backdrop';
  w.innerHTML='<section class="gxbs-modal" role="dialog" aria-modal="true"><div class="gxbs-head"><div><h2>'+esc(title)+'</h2><p class="gxbs-sub">'+esc(subtitle)+'</p></div><button type="button" class="gxbs-close" data-gxbs-close aria-label="Cerrar">✕</button></div><div>'+body+'</div><div class="gxbs-actions">'+actions+'</div></section>';
  document.body.appendChild(w);w.querySelector('[data-gxbs-close]').onclick=close;w.addEventListener('click',function(e){if(e.target===w)close();});return w;
}
function roundInfo(phaseId){
  var d=state(),n=(d?.rounds||[]).length+1,phase=phaseById(phaseId);
  return {n:n,title:(d?.event?.battle_format==='single_elimination'?'Ronda ':'Jornada ')+n,phaseId:phase?.id||null,phaseTitle:phase?.title||''};
}
function label(id){
  var d=state(),p=(d?.participants||[]).find(function(x){return x.id===id;});
  if(!p)return 'Participante';
  var u=(d?.profiles||[]).find(function(x){return x.id===p.user_id;})||{};
  return '@'+(p.tiktok_username||u.username||u.full_name||String(p.user_id||'').slice(0,8));
}
function validateRow(m,scheduledAt){
  var phase=phaseForMatch(m);if(!phase)return true;
  var selected=new Date(scheduledAt),start=phase.starts_at?new Date(phase.starts_at):null,end=phase.ends_at?new Date(phase.ends_at):null;
  if(start&&selected<start)return false;if(end&&selected>end)return false;return true;
}
function validateRows(rows,matches){
  for(var row of rows){var match=matches.find(function(m){return m.id===row.id;});if(!match)throw new Error('Una de las batallas ya no está disponible.');if(!validateRow(match,row.scheduled_at))throw new Error('La fecha y hora de cada batalla deben quedar dentro del rango de su fase.');}
}
async function fetchMatches(roundId){
  var r=await sb.from('gx_event_matches').select('id,round_id,event_id,participant_a_id,participant_b_id,scheduled_at,status').eq('round_id',roundId).order('created_at');
  if(r.error)throw r.error;
  return (r.data||[]).filter(function(m){return m.participant_b_id&&m.status==='scheduled';});
}
async function save(rows){
  var r=await sb.rpc('gx_events_schedule_matches',{p_event_id:gxEventsSelectedId,p_schedules:rows.map(function(x){return {match_id:x.id,scheduled_at:x.scheduled_at};})});
  if(r.error)throw new Error('No se pudo guardar la programación: '+r.error.message);
  return r.data||{};
}
function notificationSummary(data,count){
  var made=Number(data.notifications_created)||0,expected=Number(data.expected_notifications)||count*2;
  if(made<expected)return 'Horarios guardados para '+count+' batallas, pero se confirmaron '+made+' de '+expected+' notificaciones. Hay que revisar el registro de avisos.';
  return '¡Programación guardada! '+count+' batallas y '+made+' notificaciones registradas.';
}
async function refresh(){if(typeof gxEventsReloadDashboard==='function')await gxEventsReloadDashboard(gxEventsSelectedId,true);addPending();}
function addPending(){
  if(typeof gxEventsAdmin!=='function'||!gxEventsAdmin())return;
  var hosts=[...document.querySelectorAll('#gxevPageBody .gxev-panel')],h=null;
  for(var host of hosts){h=[...host.querySelectorAll('.gxev-panel-head')].find(function(x){return x.textContent.includes('Misiones y batallas por fase')||x.textContent.includes('Misión de batallas');});if(h)break;}
  if(!h||h.querySelector('[data-gxbs-pending]'))return;
  var d=state(),n=(d?.matches||[]).filter(function(m){return !m.scheduled_at&&m.participant_b_id&&m.status==='scheduled';}).length;
  if(!n)return;
  var b=document.createElement('button');b.type='button';b.className='gxev-btn';b.dataset.gxbsPending='1';b.textContent='Programar pendientes ('+n+')';h.appendChild(b);
}
function individual(matches,title){
  var body='<div class="gxbs-note">Se guardarán todos los horarios en una sola operación. Las notificaciones solo se disparan cuando se confirma la programación completa.</div><div class="gxbs-match-list">';
  matches.forEach(function(m,i){var phase=phaseForMatch(m),dt=localDT(phase?.id),phaseLabel=phase?.title?' · '+phase.title:'';body+='<div class="gxbs-match" data-gxbs-match="'+m.id+'"><div class="gxbs-match-title">Batalla '+(i+1)+': '+esc(label(m.participant_a_id))+' vs '+esc(label(m.participant_b_id))+esc(phaseLabel)+'</div><div class="gxbs-fields"><div class="gxbs-field"><label>Fecha</label><input type="date" data-date value="'+dt.date+'" required></div><div class="gxbs-field"><label>Hora de Colombia (UTC−5)</label><input type="time" data-time value="'+dt.time+'" required></div></div></div>';});
  body+='</div>';
  var w=modal('Programa cada batalla','Asigna fecha y hora a '+title+'.',body,'<button type="button" class="gxbs-btn" data-later>Dejar para después</button><button type="button" class="gxbs-btn primary" data-save>Guardar programación y notificar</button>');
  w.querySelector('[data-later]').onclick=function(){close();if(typeof toast==='function')toast('Las batallas quedaron pendientes de programación.');};
  w.querySelector('[data-save]').onclick=async function(e){
    if(busy)return;
    var rows=[];for(var c of w.querySelectorAll('[data-gxbs-match]')){var v=iso(c.querySelector('[data-date]').value,c.querySelector('[data-time]').value);if(!v){if(typeof toast==='function')toast('Completa la fecha y hora de todas las batallas.');return;}rows.push({id:c.dataset.gxbsMatch,scheduled_at:v});}
    try{validateRows(rows,matches);}catch(err){if(typeof toast==='function')toast(err.message);return;}
    busy=true;e.currentTarget.disabled=true;
    try{var result=await save(rows);close();if(typeof toast==='function')toast(notificationSummary(result,rows.length));await refresh();}
    catch(err){if(typeof toast==='function')toast(err.message||'No se pudo guardar la programación.');e.currentTarget.disabled=false;}
    finally{busy=false;}
  };
}
async function generate(cfg){
  if(busy||typeof gxEventsAdmin!=='function'||!gxEventsAdmin()||!gxEventsSelectedId)return;
  var info=roundInfo(cfg.phaseId),phase=phaseById(cfg.phaseId),createdRoundId=null,scheduleCommitted=false;
  // Validate the chosen start before creating any round, so invalid dates never leave orphan matches.
  var start=cfg.mode==='individual'?null:iso(cfg.date,cfg.time);
  if(cfg.mode!=='individual'&&!start)throw new Error('Selecciona una fecha y hora válidas.');
  if(start&&phase){
    var first=new Date(start),phaseStart=phase.starts_at?new Date(phase.starts_at):null,phaseEnd=phase.ends_at?new Date(phase.ends_at):null;
    if((phaseStart&&first<phaseStart)||(phaseEnd&&first>phaseEnd))throw new Error('La fecha y hora inicial deben quedar dentro del rango de '+(phase.title||'la fase seleccionada')+'.');
  }
  busy=true;
  try{
    var r=await sb.rpc('gx_events_generate_round',{p_event_id:gxEventsSelectedId,p_round_number:info.n,p_title:info.title,p_phase_id:info.phaseId});
    if(r.error)throw r.error;
    if(!r.data?.round_id)throw new Error('No se recibió el identificador de la ronda.');
    createdRoundId=r.data.round_id;
    var matches=await fetchMatches(createdRoundId);
    if(!matches.length){close();if(typeof toast==='function')toast(info.title+' creada, pero no hay batallas para programar.');await refresh();return;}
    if(cfg.mode==='individual'){close();await refresh();individual(matches,info.title);return;}
    var base=new Date(start).getTime(),rows=matches.map(function(m,i){return {id:m.id,scheduled_at:new Date(base+(cfg.mode==='interval'?i*cfg.interval*60000:0)).toISOString()};});
    // Validate every generated slot before saving; the schedule RPC validates again server-side.
    validateRows(rows,matches);
    var result=await save(rows);
    scheduleCommitted=true;
    close();
    if(typeof toast==='function')toast(notificationSummary(result,rows.length));
    await refresh();
  }catch(err){
    // If scheduling failed before notifications/commit, remove only the round created by this click.
    if(createdRoundId&&!scheduleCommitted){
      try{
        var check=await sb.from('gx_event_matches').select('id,scheduled_at,status').eq('round_id',createdRoundId);
        if(!check.error&&(check.data||[]).every(function(m){return !m.scheduled_at&&m.status==='scheduled';})){
          await sb.from('gx_event_rounds').delete().eq('id',createdRoundId).eq('event_id',gxEventsSelectedId);
        }
      }catch(cleanupErr){console.error('[Grayxon battle scheduler] No se pudo limpiar la ronda fallida:',cleanupErr);}
    }
    if(typeof toast==='function')toast(err?.message||'No se pudieron generar y programar las batallas.');
    console.error('[Grayxon battle scheduler]',err);
  }finally{busy=false;}
}
function openGenerate(phaseId){
  if(busy||typeof gxEventsAdmin!=='function'||!gxEventsAdmin())return;
  var info=roundInfo(phaseId),dt=localDT(phaseId),phaseText=info.phaseTitle?' para '+info.phaseTitle:'';
  var body='<div class="gxbs-options"><label class="gxbs-option"><input type="radio" name="gxbs-mode" value="same" checked><span><strong>Todas el mismo día y a la misma hora</strong><small>Todos los cruces quedan programados para la misma fecha y hora.</small></span></label><label class="gxbs-option"><input type="radio" name="gxbs-mode" value="interval"><span><strong>Alternarlas cada 5 minutos</strong><small>Mismo día, empezando a la hora que elijas. Puedes cambiar el intervalo.</small></span></label><label class="gxbs-option"><input type="radio" name="gxbs-mode" value="individual"><span><strong>Elegir hora para cada batalla</strong><small>Asigna fecha y hora individual a cada cruce de esta fase.</small></span></label></div><div class="gxbs-fields"><div class="gxbs-field"><label>Fecha</label><input type="date" data-date value="'+dt.date+'" required></div><div class="gxbs-field"><label>Hora inicial (Colombia)</label><input type="time" data-time value="'+dt.time+'" required></div></div><div class="gxbs-fields" data-interval-wrap style="display:none"><div class="gxbs-field"><label>Separación en minutos</label><input type="number" data-interval min="1" max="180" value="5"></div><div class="gxbs-note" style="margin:0">Ejemplo: 6:00 p. m. · 6:05 p. m. · 6:10 p. m.</div></div><div class="gxbs-note">Las fechas deben estar dentro de '+esc(info.phaseTitle||'la fase del evento')+'. No se envían avisos hasta guardar todos los horarios.</div>';
  var w=modal('Programar '+info.title,'Elige cómo organizar los horarios'+esc(phaseText)+'.',body,'<button type="button" class="gxbs-btn" data-cancel>Cancelar</button><button type="button" class="gxbs-btn primary" data-generate>Generar y programar</button>');
  var iw=w.querySelector('[data-interval-wrap]');
  w.querySelectorAll('[name="gxbs-mode"]').forEach(function(x){x.onchange=function(){iw.style.display=w.querySelector('[name="gxbs-mode"]:checked').value==='interval'?'grid':'none';};});
  w.querySelector('[data-cancel]').onclick=close;
  w.querySelector('[data-generate]').onclick=async function(){
    var mode=w.querySelector('[name="gxbs-mode"]:checked').value,date=w.querySelector('[data-date]').value,time=w.querySelector('[data-time]').value,interval=Number(w.querySelector('[data-interval]')?.value||5);
    if(mode!=='individual'&&!iso(date,time)){if(typeof toast==='function')toast('Selecciona una fecha y hora válidas.');return;}
    if(mode==='interval'&&(!Number.isInteger(interval)||interval<1||interval>180)){if(typeof toast==='function')toast('El intervalo debe estar entre 1 y 180 minutos.');return;}
    await generate({mode:mode,date:date,time:time,interval:interval,phaseId:info.phaseId});
  };
}
async function pending(){
  if(busy)return;
  var d=state(),rows=(d?.matches||[]).filter(function(m){return !m.scheduled_at&&m.participant_b_id&&m.status==='scheduled';});
  if(!rows.length){if(typeof toast==='function')toast('No hay batallas pendientes de programación.');return;}
  individual(rows,'las batallas pendientes');
}
document.addEventListener('click',function(e){
  var b=e.target?.closest?.('[data-gxev-generate-round]');
  if(b){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openGenerate(b.dataset.gxevGenerateRound||null);return;}
  var p=e.target?.closest?.('[data-gxbs-pending]');
  if(p){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();pending();}
},true);
var observer=new MutationObserver(function(){if(!document.querySelector('.gxbs-backdrop'))addPending();});
observer.observe(document.body,{childList:true,subtree:true});
})();