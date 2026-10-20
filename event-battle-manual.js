(function(){
  if(window.__gxManualBattleInstalled)return;
  window.__gxManualBattleInstalled=true;
  const style=document.createElement('style');
  style.textContent=`
    .gxmb-backdrop{position:fixed;inset:0;z-index:100000;background:#020305dd;backdrop-filter:blur(8px);display:grid;place-items:center;padding:16px}
    .gxmb-modal{width:min(620px,100%);max-height:90vh;overflow:auto;background:linear-gradient(145deg,#15171b,#090a0c);border:1px solid #343840;border-radius:18px;box-shadow:0 25px 90px #000b;padding:22px;color:#f3f4f6}
    .gxmb-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:16px}
    .gxmb-head h2{margin:0;font-size:21px}.gxmb-sub{color:#a8adb6;font-size:13px;line-height:1.5;margin:7px 0 0}
    .gxmb-close,.gxmb-btn{background:#1a1c20;border:1px solid #393d45;color:#fff;border-radius:10px;padding:10px 13px;cursor:pointer}
    .gxmb-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:13px 0}
    .gxmb-field{display:grid;gap:6px;min-width:0}.gxmb-field label{font-size:12px;color:#c8cbd2}
    .gxmb-field select,.gxmb-field input{width:100%;min-width:0;background:#08090b;border:1px solid #3a3e46;color:#fff;border-radius:10px;padding:11px}
    .gxmb-note{border:1px solid #4a4028;background:#1b170e;color:#d8c99f;border-radius:11px;padding:11px 12px;font-size:12px;line-height:1.5;margin:12px 0}
    .gxmb-actions{display:flex;gap:9px;justify-content:flex-end;flex-wrap:wrap;margin-top:18px}
    .gxmb-btn.primary{background:#e6e7e9;color:#090a0b;border-color:#e6e7e9;font-weight:800}.gxmb-btn:disabled{opacity:.55}
    @media(max-width:520px){.gxmb-modal{padding:16px}.gxmb-fields{grid-template-columns:1fr}.gxmb-head h2{font-size:19px}}
  `;
  document.head.appendChild(style);
  let busy=false;
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function data(){return typeof gxEventsDashboardData!=='undefined'?gxEventsDashboardData:null}
  function close(){document.querySelector('.gxmb-backdrop')?.remove()}
  function toastMsg(s){if(typeof toast==='function')toast(s);else console.info('[Grayxon]',s)}
  function injectButton(){
    if(typeof gxEventsAdmin!=='function'||!gxEventsAdmin())return;
    const d=data();if(!d?.event?.battle_enabled||!gxEventsSelectedId)return;
    const heads=[...document.querySelectorAll('#gxevWorkspace .gxev-panel-head')];
    const head=heads.find(h=>h.textContent.includes('Misiones y batallas por fase'));
    if(!head||head.querySelector('[data-gxmb-open]'))return;
    const b=document.createElement('button');b.type='button';b.className='gxev-btn primary';b.dataset.gxmbOpen='1';b.textContent='＋ Agregar batalla manual';b.style.marginLeft='auto';b.style.flexShrink='0';
    b.addEventListener('click',openModal);
    head.appendChild(b);head.style.flexWrap='wrap';
  }
  function openModal(){
    if(busy||typeof gxEventsAdmin!=='function'||!gxEventsAdmin())return;
    const d=data();if(!d?.event?.battle_enabled)return toastMsg('Este evento no tiene las batallas habilitadas.');
    const confirmedUsers=new Set((d.responses||[]).filter(r=>r.response==='yes').map(r=>r.user_id));
    const participants=(d.participants||[]).filter(p=>['registered','confirmed'].includes(p.status)&&confirmedUsers.has(p.user_id));
    const profiles=new Map((d.profiles||[]).map(p=>[p.id,p]));
    const options=participants.map(p=>{const u=profiles.get(p.user_id)||{};const name=p.tiktok_username||u.tiktok_username||u.username||u.full_name||String(p.user_id||'').slice(0,8);return '<option value="'+esc(p.id)+'">@'+esc(String(name).replace(/^@+/,''))+'</option>'}).join('');
    if(participants.length<2){toastMsg('Se necesitan al menos dos participantes activos que hayan confirmado su asistencia.');return}
    const rounds=(d.rounds||[]).slice().sort((a,b)=>Number(a.round_number)-Number(b.round_number));
    const phases=(d.phases||[]);
    const roundOptions=rounds.map(r=>'<option value="'+esc(r.id)+'">'+esc(r.title||('Ronda '+r.round_number))+' · #'+esc(r.round_number)+'</option>').join('');
    const phaseOptions='<option value="">Sin fase asignada</option>'+phases.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.title)+'</option>').join('');
    close();
    const w=document.createElement('div');w.className='gxmb-backdrop';
    w.innerHTML='<section class="gxmb-modal" role="dialog" aria-modal="true"><div class="gxmb-head"><div><h2>Agregar batalla manual</h2><p class="gxmb-sub">Empareja dos creadores específicos sin modificar las demás batallas del evento.</p></div><button type="button" class="gxmb-close" data-close aria-label="Cerrar">✕</button></div>'+
      '<div class="gxmb-fields"><div class="gxmb-field"><label>Primer creador</label><select data-a required><option value="">Seleccionar creador…</option>'+options+'</select></div><div class="gxmb-field"><label>Segundo creador</label><select data-b required><option value="">Seleccionar creador…</option>'+options+'</select></div></div>'+
      '<div class="gxmb-field"><label>Ronda</label><select data-round><option value="">Crear una nueva ronda manual</option>'+roundOptions+'</select></div>'+
      '<div class="gxmb-field" data-phase-wrap style="margin-top:12px"><label>Fase para la nueva ronda</label><select data-phase>'+phaseOptions+'</select></div>'+
      '<div class="gxmb-fields"><div class="gxmb-field"><label>Fecha (opcional)</label><input type="date" data-date value=""></div><div class="gxmb-field"><label>Hora de Colombia (opcional, UTC−5)</label><input type="time" data-time value=""></div></div>'+
      '<div class="gxmb-note">Se creará únicamente el enfrentamiento elegido. Si seleccionas una ronda existente, los creadores no pueden tener otra batalla programada en esa misma ronda. Si dejas fecha y hora vacías, el horario quedará pendiente.</div>'+
      '<div class="gxmb-actions"><button type="button" class="gxmb-btn" data-cancel>Cancelar</button><button type="button" class="gxmb-btn primary" data-save>Crear batalla y notificar</button></div></section>';
    document.body.appendChild(w);
    w.querySelector('[data-close]').onclick=close;w.querySelector('[data-cancel]').onclick=close;
    w.addEventListener('click',e=>{if(e.target===w)close()});
    const roundSel=w.querySelector('[data-round]'),phaseWrap=w.querySelector('[data-phase-wrap]');
    roundSel.onchange=()=>{phaseWrap.style.display=roundSel.value?'none':'grid'};
    phaseWrap.style.display=roundSel.value?'none':'grid';
    w.querySelector('[data-save]').onclick=async e=>{
      if(busy)return;
      const a=w.querySelector('[data-a]').value,b=w.querySelector('[data-b]').value;
      if(!a||!b)return toastMsg('Selecciona los dos creadores.');
      if(a===b)return toastMsg('Debes seleccionar dos creadores diferentes.');
      const date=w.querySelector('[data-date]').value,time=w.querySelector('[data-time]').value;
      if(Boolean(date)!==Boolean(time))return toastMsg('Completa tanto la fecha como la hora, o deja ambos campos vacíos.');
      let scheduledAt=null;
      if(date&&time){const d=new Date(date+'T'+time+':00-05:00');if(Number.isNaN(d.getTime()))return toastMsg('La fecha y hora no son válidas.');scheduledAt=d.toISOString();}
      const payload={p_event_id:gxEventsSelectedId,p_participant_a_id:a,p_participant_b_id:b,p_round_id:roundSel.value||null,p_phase_id:roundSel.value?null:(w.querySelector('[data-phase]').value||null),p_scheduled_at:scheduledAt};
      busy=true;const btn=e.currentTarget;btn.disabled=true;btn.textContent='Guardando…';
      try{
        const r=await sb.rpc('gx_events_create_manual_match',payload);
        if(r.error)throw r.error;
        const result=r.data||{};
        close();
        const count=Number(result.notifications_created)||0;
        toastMsg(count>=2?'Batalla creada y notificaciones enviadas ✓':'Batalla creada. No se confirmó el envío de todas las notificaciones; revisa el evento.');
        if(typeof gxEventsReloadDashboard==='function')await gxEventsReloadDashboard(gxEventsSelectedId,true);
      }catch(err){console.error('[Grayxon manual battle]',err);toastMsg(err?.message||'No se pudo crear la batalla manual.');btn.disabled=false;btn.textContent='Crear batalla y notificar';}
      finally{busy=false}
    };
  }
  document.addEventListener('click',e=>{const b=e.target?.closest?.('[data-gxmb-open]');if(b){e.preventDefault();openModal()}},true);
  const observer=new MutationObserver(()=>injectButton());
  observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(injectButton,500);
})();