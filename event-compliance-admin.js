(function(){
  'use strict';
  if (window.__gxAdminEventComplianceInstalled) return;
  window.__gxAdminEventComplianceInstalled = true;

  var STYLE_ID = 'gx-admin-event-compliance-style';
  var MODAL_ID = 'gx-admin-event-compliance-modal';
  var activeTab = 'battles';
  var snapshot = null;
  var busy = false;
  var currentUserId = null;
  var historySelectedUserId = null;
  var activePhaseId = null;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function adminAllowed() {
    try { return typeof gxEventsAdmin === 'function' && gxEventsAdmin(); }
    catch (_) { return false; }
  }
  function selectedEventId() {
    try { return typeof gxEventsSelectedId !== 'undefined' ? gxEventsSelectedId : null; }
    catch (_) { return null; }
  }
  function toast(message) {
    if (typeof window.toast === 'function') window.toast(message);
    else console.info('[Grayxon cumplimiento]', message);
  }
  function labelForUser(userId) {
    var p = (snapshot.profiles || []).find(function(x){ return x.id === userId; }) || {};
    var ep = (snapshot.participants || []).find(function(x){ return x.user_id === userId; }) || {};
    return String(ep.tiktok_username || p.tiktok_username || p.username || p.full_name || userId || 'Usuario').replace(/^@+/, '');
  }
  function userMatches(userId, term) {
    if (!term) return true;
    var p = (snapshot.profiles || []).find(function(x){ return x.id === userId; }) || {};
    var values = [labelForUser(userId), p.username, p.full_name, p.tiktok_username].filter(Boolean).join(' ').toLowerCase();
    return values.indexOf(term.toLowerCase().replace(/^@/, '')) >= 0;
  }
  function matchParticipants(match) {
    return [match.participant_a_id, match.participant_b_id].filter(Boolean).map(function(id){
      return (snapshot.participants || []).find(function(p){ return p.id === id; });
    }).filter(Boolean);
  }
  function phaseLabel(match) {
    var round = (snapshot.rounds || []).find(function(r){ return r.id === match.round_id; });
    var phase = round && (snapshot.phases || []).find(function(p){ return p.id === round.phase_id; });
    return [phase && phase.title, round && (round.title || ('Ronda ' + round.round_number))].filter(Boolean).join(' · ');
  }
  function dateLabel(value) {
    if (!value) return 'Horario pendiente';
    try {
      return new Intl.DateTimeFormat('es-CO',{dateStyle:'short',timeStyle:'short',timeZone:'America/Bogota'}).format(new Date(value));
    } catch (_) { return value; }
  }
  function attendanceFor(matchId, participantId) {
    return (snapshot.attendance || []).find(function(a){ return a.match_id === matchId && a.participant_id === participantId; }) || null;
  }
  function progressFor(missionId, userId) {
    return (snapshot.progress || []).find(function(p){ return p.mission_id === missionId && p.user_id === userId; }) || null;
  }
  function statusLabel(status) {
    return status === 'attended' ? 'Asistió' : status === 'absent' ? 'No asistió' : 'Pendiente';
  }
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.gxec-open{display:inline-flex;align-items:center;gap:8px;border:1px solid #287f91;background:linear-gradient(135deg,#10252b,#11171c);color:#d8fbff;border-radius:11px;padding:10px 13px;font-weight:800;cursor:pointer;margin:8px 0}',
      '.gxec-backdrop{position:fixed;inset:0;z-index:100500;background:#020305e8;backdrop-filter:blur(9px);display:grid;place-items:center;padding:12px}',
      '.gxec-modal{width:min(1120px,100%);max-height:94vh;overflow:auto;background:linear-gradient(145deg,#14171c,#080a0d);border:1px solid #343b45;border-radius:18px;padding:18px;color:#f3f5f8;box-shadow:0 28px 100px #000c}',
      '.gxec-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.gxec-head h2{font-size:21px;margin:0}.gxec-sub{font-size:12px;color:#9ca6b3;line-height:1.5;margin:6px 0 0}',
      '.gxec-close,.gxec-btn{border:1px solid #343c47;border-radius:10px;background:#171b21;color:#f5f7fa;padding:9px 12px;font-weight:750;cursor:pointer}.gxec-btn.primary{background:#25c9e7;border-color:#25c9e7;color:#061116}.gxec-btn:disabled{opacity:.55;cursor:wait}',
      '.gxec-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.gxec-tab{border:1px solid #343c47;border-radius:999px;padding:9px 13px;background:#0c0f13;color:#b9c1cc;cursor:pointer}.gxec-tab.active{border-color:#25c9e7;color:#c9fbff;background:#10252b}',
      '.gxec-search{width:100%;padding:12px 13px;border:1px solid #343c47;border-radius:11px;background:#080a0d;color:#f3f5f8;outline:none;margin:0 0 12px}.gxec-search:focus{border-color:#25c9e7}',
      '.gxec-list{display:grid;gap:10px}.gxec-card{border:1px solid #303742;border-radius:13px;background:#0c0f13;padding:13px}.gxec-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.gxec-title{font-weight:850;font-size:14px;line-height:1.45}.gxec-meta{font-size:11px;color:#98a2b0;line-height:1.6;margin-top:4px}.gxec-people{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.gxec-person{border:1px solid #2b323c;background:#10151b;border-radius:11px;padding:11px;min-width:0}.gxec-person strong{display:block;overflow-wrap:anywhere;margin-bottom:9px}.gxec-person label{display:block;font-size:11px;color:#aeb7c3;margin-bottom:5px}.gxec-person select,.gxec-note{width:100%;border:1px solid #39414c;border-radius:9px;padding:10px;background:#080b0f;color:#f4f6f8}.gxec-note{margin-top:8px;min-height:38px}.gxec-card-foot{display:flex;justify-content:flex-end;margin-top:10px}.gxec-empty{border:1px dashed #39414c;border-radius:12px;padding:24px;text-align:center;color:#9da7b4;font-size:13px}',
      '.gxec-history{display:grid;gap:8px}.gxec-history-row{display:grid;grid-template-columns:minmax(150px,1.1fr) minmax(100px,.8fr) minmax(110px,.7fr) minmax(100px,.7fr);gap:10px;align-items:center;border:1px solid #2b323c;border-radius:10px;padding:11px;background:#0d1116;font-size:12px}.gxec-pill{display:inline-block;border:1px solid #3a414b;border-radius:999px;padding:4px 7px;color:#c5ccd6;font-size:10px}.gxec-pill.ok{border-color:#28794d;color:#8fe2ad}.gxec-pill.bad{border-color:#84444a;color:#ffb1b5}.gxec-pill.pending{border-color:#7a6733;color:#f2d68e}',
      '.gxec-section-title{font-size:13px;font-weight:850;margin:14px 0 8px;color:#e4e8ee}.gxec-summary{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 14px}.gxec-summary span{border:1px solid #303742;background:#11161c;border-radius:9px;padding:8px 10px;font-size:11px;color:#c4ccd7}',
      '@media(max-width:650px){.gxec-modal{padding:13px}.gxec-head h2{font-size:18px}.gxec-people{grid-template-columns:1fr}.gxec-history-row{grid-template-columns:1fr 1fr}.gxec-history-row>*:first-child{grid-column:1/-1}.gxec-card-head{display:block}.gxec-card-head .gxec-pill{margin-top:7px}}'
    ].join('');
    document.head.appendChild(style);
  }
  async function loadSnapshot() {
    if (!adminAllowed()) throw new Error('Esta herramienta es exclusiva de administración.');
    var eventId = selectedEventId();
    if (!eventId) throw new Error('Selecciona primero un evento.');
    var eventData = (typeof gxEventsDashboardData !== 'undefined' && gxEventsDashboardData) || {};

    // Read fresh, complete event records instead of relying on possibly stale dashboard state.
    var results = await Promise.all([
      sb.from('gx_event_matches').select('id,event_id,round_id,participant_a_id,participant_b_id,winner_participant_id,status,score_a,score_b,result_note,scheduled_at,created_at').eq('event_id',eventId).order('created_at'),
      sb.from('gx_event_participants').select('id,event_id,user_id,status,tiktok_username,team_id,registered_at').eq('event_id',eventId).order('registered_at'),
      sb.from('gx_event_phases').select('id,event_id,phase_number,title,starts_at,ends_at').eq('event_id',eventId).order('phase_number'),
      sb.from('gx_event_rounds').select('id,event_id,round_number,title,status,phase_id').eq('event_id',eventId).order('round_number'),
      sb.from('gx_event_missions').select('id,event_id,title,description,metric_key,unit_label,target_value,is_active,phase_id,sort_order,points_per_unit,completion_bonus,score_over_target').eq('event_id',eventId).order('sort_order'),
      sb.from('gx_event_mission_progress').select('id,event_id,mission_id,user_id,value,status,note,admin_note,evidence_url,reviewed_at,created_at,updated_at').eq('event_id',eventId)
    ]);
    results.forEach(function(r){ if (r.error) throw r.error; });
    var matches = results[0].data || [];
    var participants = results[1].data || [];
    var phases = results[2].data || [];
    var rounds = results[3].data || [];
    var missions = results[4].data || [];
    var progress = results[5].data || [];

    var attendanceResult = await sb.from('gx_event_match_attendance').select('id,event_id,match_id,participant_id,user_id,status,note,recorded_by,updated_at').eq('event_id',eventId);
    if (attendanceResult.error) throw attendanceResult.error;
    var userIds = Array.from(new Set(participants.map(function(p){return p.user_id;}).concat(progress.map(function(p){return p.user_id;}))));
    var profiles = [];
    if (userIds.length) {
      var profileResult = await sb.from('profiles').select('id,username,full_name,tiktok_username,role,active').in('id',userIds);
      if (profileResult.error) throw profileResult.error;
      profiles = profileResult.data || [];
    }
    var authResult = await sb.auth.getUser();
    if (authResult.error) throw authResult.error;
    currentUserId = authResult.data && authResult.data.user ? authResult.data.user.id : null;
    snapshot = {
      eventId:eventId, event:eventData.event || {}, matches:matches, participants:participants,
      phases:phases, rounds:rounds, missions:missions, progress:progress,
      attendance:attendanceResult.data || [], profiles:profiles
    };
  }
  function renderBattles(term) {
    term = (term || '').trim().toLowerCase();
    var now = Date.now();
    var matches = (snapshot.matches || []).filter(function(m) {
      if (m.status === 'cancelled' || m.status === 'bye') return false;
      if (!m.scheduled_at || new Date(m.scheduled_at).getTime() > now) return false;
      if (m.winner_participant_id) {
        var matchPeople = matchParticipants(m);
        var winnerRecord = matchPeople.find(function(p){return p.id===m.winner_participant_id;});
        var otherPeople = matchPeople.filter(function(p){return p.id!==m.winner_participant_id;});
        var winnerAttendance = winnerRecord && attendanceFor(m.id,winnerRecord.id);
        var needsInference = winnerAttendance && winnerAttendance.status==='attended' && otherPeople.some(function(p){var a=attendanceFor(m.id,p.id);return !a || a.status==='pending';});
        if (!needsInference) return false;
      }
      if (activePhaseId) {
        var phaseRound = (snapshot.rounds || []).find(function(r){return r.id===m.round_id;});
        if (!phaseRound || phaseRound.phase_id !== activePhaseId) return false;
      }
      if (term && !matchParticipants(m).some(function(p){ return userMatches(p.user_id,term); })) return false;
      return true;
    }).sort(function(a,b) {
      return String(a.scheduled_at || '').localeCompare(String(b.scheduled_at || ''));
    });
    if (!matches.length) return '<div class="gxec-empty">No hay batallas que coincidan con la búsqueda.</div>';
    return '<div class="gxec-list">' + matches.map(function(m) {
      var people = matchParticipants(m);
      var resultLabel = m.winner_participant_id ? 'Ganador registrado · revisar asistencia' : m.status === 'completed' ? 'Sin ganador registrado' : 'Batalla pendiente de revisión';
      var round = (snapshot.rounds || []).find(function(r){return r.id===m.round_id;});
      var title = people.map(function(p){return '@'+esc(labelForUser(p.user_id));}).join(' vs ');
      var personHtml = people.map(function(p) {
        var record = attendanceFor(m.id,p.id);
        var status = record ? record.status : 'pending';
        var matchWinner = (snapshot.matches || []).find(function(x){return x.id===m.id;});
        var matchPeople = matchParticipants(m);
        var winnerPerson = matchPeople.find(function(x){return x.id===m.winner_participant_id;});
        var winnerRecord = winnerPerson && attendanceFor(m.id,winnerPerson.id);
        var inferredAbsent = !!(matchWinner && matchWinner.winner_participant_id && winnerRecord && winnerRecord.status==='attended' && p.id!==matchWinner.winner_participant_id && (!record || record.status==='pending'));
        if (inferredAbsent) status = 'absent';
        return '<div class="gxec-person"><strong>@'+esc(labelForUser(p.user_id))+'</strong><label for="gxec-'+esc(m.id)+'-'+esc(p.id)+'">Asistencia</label><select id="gxec-'+esc(m.id)+'-'+esc(p.id)+'" data-attendance-match="'+esc(m.id)+'" data-attendance-participant="'+esc(p.id)+'" data-attendance-user="'+esc(p.user_id)+'"><option value="pending" '+(status==='pending'?'selected':'')+'>Pendiente de confirmar</option><option value="attended" '+(status==='attended'?'selected':'')+'>Asistió</option><option value="absent" '+(status==='absent'?'selected':'')+'>No asistió</option></select><input class="gxec-note" type="text" maxlength="500" data-attendance-note="'+esc(m.id)+'-'+esc(p.id)+'" value="'+esc(record && record.note || '')+'" placeholder="Nota interna (opcional)"></div>';
      }).join('');
      return '<article class="gxec-card" data-gxec-match="'+esc(m.id)+'"><div class="gxec-card-head"><div><div class="gxec-title">'+title+'</div><div class="gxec-meta">'+esc(dateLabel(m.scheduled_at))+(phaseLabel(m)?' · '+esc(phaseLabel(m)):'')+' · '+esc(round && round.title || '')+'</div></div><span class="gxec-pill '+(m.status==='completed'?'ok':'pending')+'">'+esc(resultLabel)+'</span></div><div class="gxec-people">'+personHtml+'</div><div class="gxec-card-foot"><button class="gxec-btn primary" data-save-match="'+esc(m.id)+'">Guardar asistencia</button></div></article>';
    }).join('') + '</div>';
  }
  function progressState(mission, progress) {
    if (!progress) return {label:'Sin registro',cls:'pending',detail:'No hay avance registrado'};
    if (progress.status === 'approved') return {label:'Aprobada',cls:'ok',detail:String(progress.value)+' / '+String(mission.target_value)+' '+String(mission.unit_label||'')};
    if (progress.status === 'rejected') return {label:'Rechazada',cls:'bad',detail:String(progress.value)+' / '+String(mission.target_value)+' '+String(mission.unit_label||'')};
    return {label:'Pendiente de revisar',cls:'pending',detail:String(progress.value)+' / '+String(mission.target_value)+' '+String(mission.unit_label||'')};
  }
  function renderHistory(term) {
    var users = (snapshot.participants || []).filter(function(p){return userMatches(p.user_id,term);});
    if (!users.length) return '<div class="gxec-empty">No encontramos creadores con esa búsqueda en este evento.</div>';
    if (!historySelectedUserId) {
      return '<div class="gxec-list">' + users.map(function(p) {
        return '<button type="button" class="gxec-card" data-history-user="'+esc(p.user_id)+'" style="text-align:left;color:inherit;cursor:pointer"><strong>@'+esc(labelForUser(p.user_id))+'</strong><div class="gxec-meta">Abrir avances, misiones y asistencia</div></button>';
      }).join('') + '</div>';
    }
    var participant = users.find(function(p){return p.user_id===historySelectedUserId;});
    if (!participant) { historySelectedUserId=null; return renderHistory(term); }
    var back = '<button type="button" class="gxec-btn" data-history-back style="margin-bottom:12px">← Volver a creadores</button>';
    var userId = participant.user_id;
    var missions = snapshot.missions || [];
    var missionRows = missions.filter(function(m) {
      if (!m.phase_id) return true;
      var phase = (snapshot.phases || []).find(function(p){return p.id===m.phase_id;});
      return !!phase;
    }).map(function(m) {
      var p = progressFor(m.id,userId);
      var st = progressState(m,p);
      var phase = (snapshot.phases || []).find(function(ph){return ph.id===m.phase_id;});
      return '<div class="gxec-history-row"><div><strong>'+esc(m.title)+'</strong><div class="gxec-meta">'+esc(phase && phase.title || 'Evento completo')+'</div></div><div>'+esc(st.detail)+'</div><div><span class="gxec-pill '+st.cls+'">'+esc(st.label)+'</span></div><div>'+esc(p && p.updated_at ? dateLabel(p.updated_at) : 'Sin actualización')+'</div></div>';
    }).join('');
    var battleRows = (snapshot.matches || []).filter(function(m){return matchParticipants(m).some(function(p){return p.user_id===userId;});}).map(function(m) {
      var p = matchParticipants(m).find(function(x){return x.user_id===userId;});
      var attendance = attendanceFor(m.id,p.id);
      var round = (snapshot.rounds || []).find(function(r){return r.id===m.round_id;});
      var result = m.status==='cancelled'?'Batalla cancelada':m.status==='completed'?(m.winner_participant_id===p.id?'Ganó':m.winner_participant_id?'Perdió':'Resultado sin ganador'):'Pendiente de resultado';
      var att = attendance ? statusLabel(attendance.status) : (m.winner_participant_id ? 'Asistió (ganador registrado)' : 'Pendiente de confirmar');
      return '<div class="gxec-history-row"><div><strong>Batalla</strong><div class="gxec-meta">'+esc(dateLabel(m.scheduled_at))+' · '+esc(round && round.title || phaseLabel(m) || 'Sin ronda')+'</div></div><div>'+esc(result)+'</div><div><span class="gxec-pill '+(attendance && attendance.status==='attended'?'ok':attendance && attendance.status==='absent'?'bad':'pending')+'">'+esc(att)+'</span></div><div>'+esc(attendance && attendance.updated_at ? dateLabel(attendance.updated_at) : 'Sin registro')+'</div></div>';
    }).join('');
    var approved = missions.filter(function(m){var p=progressFor(m.id,userId);return p && p.status==='approved';}).length;
    var absent = (snapshot.matches || []).filter(function(m){var p=matchParticipants(m).find(function(x){return x.user_id===userId;});var a=p&&attendanceFor(m.id,p.id);return !m.winner_participant_id && a&&a.status==='absent';}).length;
    var pending = (snapshot.matches || []).filter(function(m){var p=matchParticipants(m).find(function(x){return x.user_id===userId;});var a=p&&attendanceFor(m.id,p.id);return !m.winner_participant_id && m.scheduled_at && new Date(m.scheduled_at).getTime()<=Date.now() && m.status!=='cancelled' && m.status!=='bye' && (!a||a.status==='pending');}).length;
    return back + '<div class="gxec-summary"><span>Misiones aprobadas: '+approved+'</span><span>Inasistencias confirmadas: '+absent+'</span><span>Batallas pendientes de revisar: '+pending+'</span></div><div class="gxec-section-title">Misiones del evento</div><div class="gxec-history">'+(missionRows||'<div class="gxec-empty">No hay misiones activas para este evento.</div>')+'</div><div class="gxec-section-title">Batallas y asistencia</div><div class="gxec-history">'+(battleRows||'<div class="gxec-empty">Este creador no tiene batallas registradas.</div>')+'</div>';
  }
  function render() {
    var modal = document.getElementById(MODAL_ID);
    if (!modal || !snapshot) return;
    var body = modal.querySelector('[data-gxec-body]');
    var term = modal.querySelector('[data-gxec-search]').value || '';
    body.innerHTML = renderBattles(term);
    modal.querySelectorAll('[data-gxec-tab]').forEach(function(b){
      b.classList.toggle('active',b.getAttribute('data-gxec-tab')===activeTab);
    });
  }
  function closeModal() {
    var modal = document.getElementById(MODAL_ID);
    if (modal) modal.remove();
  }
  async function openModal(tab, phaseId) {
    if (!adminAllowed()) return;
    if (!selectedEventId()) return toast('Selecciona primero un evento.');
    ensureStyles();
    activeTab = 'battles';
    activePhaseId = phaseId || null;
    closeModal();
    var backdrop = document.createElement('div');
    backdrop.id = MODAL_ID;
    backdrop.className = 'gxec-backdrop';
    backdrop.innerHTML = '<section class="gxec-modal" role="dialog" aria-modal="true" aria-labelledby="gxec-title"><div class="gxec-head"><div><h2 id="gxec-title">Control interno de cumplimiento</h2><p class="gxec-sub">Revisión de la semana seleccionada · Las batallas canceladas y las que aún no han ocurrido no generan pendientes.</p></div><button class="gxec-close" data-gxec-close aria-label="Cerrar">✕</button></div><div class="gxec-tabs"><span class="gxec-tab active">⚔️ Batallas por revisar</span><span class="gxec-tab" data-gxec-phase-label>Todas las semanas</span></div><input class="gxec-search" data-gxec-search type="search" placeholder="Buscar creador por usuario de TikTok…"><div data-gxec-body><div class="gxec-empty">Cargando registros del evento…</div></div></section>';
    document.body.appendChild(backdrop);
    backdrop.querySelector('[data-gxec-close]').addEventListener('click',closeModal);
    backdrop.addEventListener('click',function(e){if(e.target===backdrop)closeModal();});
    backdrop.querySelector('[data-gxec-search]').addEventListener('input',function(){historySelectedUserId=null;render();});
    backdrop.querySelectorAll('[data-gxec-tab]').forEach(function(b){b.addEventListener('click',function(){activeTab=b.getAttribute('data-gxec-tab');render();});});
    try {
      await loadSnapshot();
      var phaseName = activePhaseId && (snapshot.phases || []).find(function(p){return p.id===activePhaseId;});
      var phaseChip = backdrop.querySelector('[data-gxec-phase-label]');
      if (phaseChip) phaseChip.textContent = phaseName ? phaseName.title : 'Todas las semanas';
      render();
    } catch (e) {
      console.error('[Grayxon cumplimiento] No se pudo cargar el control',e);
      var body = backdrop.querySelector('[data-gxec-body]');
      if (body) body.innerHTML = '<div class="gxec-empty">No se pudo cargar el control. Verifica la migración de asistencia y tus permisos de administrador.<br><small>'+esc(e && e.message || 'Error desconocido')+'</small></div>';
    }
  }
  async function saveMatch(matchId) {
    if (busy || !adminAllowed() || !snapshot) return;
    var modal = document.getElementById(MODAL_ID);
    var card = modal && modal.querySelector('[data-gxec-match="'+matchId+'"]');
    if (!card) return;
    var participants = matchParticipants((snapshot.matches || []).find(function(m){return m.id===matchId;}));
    if (!participants.length) return toast('No se encontraron participantes para esta batalla.');
    var payload = participants.map(function(p){
      var select = card.querySelector('[data-attendance-match="'+matchId+'"][data-attendance-participant="'+p.id+'"]');
      var note = card.querySelector('[data-attendance-note="'+matchId+'-'+p.id+'"]');
      return {
        event_id:snapshot.eventId,match_id:matchId,participant_id:p.id,user_id:p.user_id,
        status:select ? select.value : 'pending',note:note ? note.value.trim() || null : null,
        recorded_by:currentUserId,updated_at:new Date().toISOString()
      };
    });
    busy = true;
    var button = card.querySelector('[data-save-match]');
    if (button) { button.disabled=true; button.textContent='Guardando…'; }
    try {
      var matchRow = (snapshot.matches || []).find(function(m){return m.id===matchId;});
      if (matchRow && matchRow.winner_participant_id) {
        var winnerPayload = payload.find(function(x){return x.participant_id===matchRow.winner_participant_id;});
        var winnerExisting = attendanceFor(matchId,matchRow.winner_participant_id);
        if (winnerPayload && winnerPayload.status==='attended') {
          payload.forEach(function(x){if(x.participant_id!==matchRow.winner_participant_id && x.status==='pending')x.status='absent';});
        }
      }
      var result = await sb.from('gx_event_match_attendance').upsert(payload,{onConflict:'match_id,participant_id'}).select('id,event_id,match_id,participant_id,user_id,status,note,recorded_by,updated_at');
      if (result.error) throw result.error;
      snapshot.attendance = (snapshot.attendance || []).filter(function(a){return a.match_id!==matchId;}).concat(result.data || payload);
      toast('Asistencia guardada para '+participants.length+' participantes.');
      render();
    } catch (e) {
      console.error('[Grayxon cumplimiento] Error guardando asistencia',e);
      toast(e && e.message ? 'No se pudo guardar: '+e.message : 'No se pudo guardar la asistencia.');
      if (button) {button.disabled=false;button.textContent='Guardar asistencia';}
    } finally { busy=false; }
  }

  var MISSION_MODAL_ID = 'gx-admin-event-mission-tracking';
  function missionScore(mission, value) {
    value = Math.max(0, Number(value) || 0);
    var counted = mission.score_over_target ? value : Math.min(value, Number(mission.target_value) || 0);
    return counted * (Number(mission.points_per_unit) || 0) + (value >= Number(mission.target_value) ? (Number(mission.completion_bonus) || 0) : 0);
  }
  function missionProgress(missionId, userId) {
    return (snapshot.progress || []).find(function(p){return p.mission_id===missionId && p.user_id===userId;}) || null;
  }
  function missionPhaseMissions(phaseId) {
    return (snapshot.missions || []).filter(function(m){return phaseId ? m.phase_id===phaseId : !m.phase_id;});
  }
  function renderMissionTracking() {
    var modal = document.getElementById(MISSION_MODAL_ID);
    if (!modal || !snapshot) return;
    var search = String(modal.querySelector('[data-gxmt-search]').value || '').trim().toLowerCase();
    var participants = (snapshot.participants || []).filter(function(p){
      return p.user_id && p.status !== 'removed' && userMatches(p.user_id, search);
    });
    var phases = snapshot.phases || [];
    var body = modal.querySelector('[data-gxmt-body]');
    body.innerHTML = participants.length ? participants.map(function(participant){
      var uid = participant.user_id;
      var label = '@'+esc(labelForUser(uid));
      var userProgress = (snapshot.progress || []).filter(function(p){return p.user_id===uid;});
      var total = (snapshot.missions || []).filter(function(m){return m.is_active;}).reduce(function(sum,m){
        var p = userProgress.find(function(x){return x.mission_id===m.id;});
        return sum + (p && p.status==='approved' ? missionScore(m,p.value) : 0);
      },0);
      var segments = phases.map(function(phase){
        var missions = missionPhaseMissions(phase.id).filter(function(m){return m.is_active;});
        if (!missions.length) return '';
        var segmentPoints = missions.reduce(function(sum,m){var p=missionProgress(m.id,uid);return sum+(p&&p.status==='approved'?missionScore(m,p.value):0);},0);
        return '<details class="gxmt-segment"><summary><span>'+esc(phase.title || ('Semana '+phase.phase_number))+'</span><strong>'+segmentPoints.toLocaleString('es-CO')+' pts</strong></summary><div class="gxmt-missions">'+missions.map(function(m){return renderMissionEditor(m,uid);}).join('')+'</div></details>';
      }).join('');
      var general = missionPhaseMissions(null).filter(function(m){return m.is_active;});
      var generalPoints = general.reduce(function(sum,m){var p=missionProgress(m.id,uid);return sum+(p&&p.status==='approved'?missionScore(m,p.value):0);},0);
      var generalBlock = general.length ? '<details class="gxmt-segment"><summary><span>Misiones generales del evento</span><strong>'+generalPoints.toLocaleString('es-CO')+' pts</strong></summary><div class="gxmt-missions">'+general.map(function(m){return renderMissionEditor(m,uid);}).join('')+'</div></details>' : '';
      return '<details class="gxmt-creator"><summary><span class="gxmt-avatar">'+esc(labelForUser(uid).slice(0,1).toUpperCase())+'</span><span class="gxmt-person"><strong>'+label+'</strong><small>'+userProgress.length+' registros · '+(userProgress.filter(function(p){return p.status==='approved';}).length)+' aprobados</small></span><strong class="gxmt-total">'+total.toLocaleString('es-CO')+' pts</strong></summary><div class="gxmt-segments">'+(segments || '<p class="gxmt-empty">Este evento no tiene semanas o segmentos configurados.</p>')+generalBlock+'</div></details>';
    }).join('') : '<div class="gxmt-empty">No encontramos creadores inscritos que coincidan con la búsqueda.</div>';
    body.querySelectorAll('[data-gxmt-save]').forEach(function(button){
      button.addEventListener('click',function(){ saveMissionProgress(button.getAttribute('data-gxmt-save'),button.getAttribute('data-user-id'),button.closest('.gxmt-editor')); });
    });
  }
  function renderMissionEditor(mission,userId) {
    var p = missionProgress(mission.id,userId) || {};
    var value = Math.max(0,Number(p.value)||0);
    var status = p.status || 'pending';
    var earned = status==='approved' ? missionScore(mission,value) : 0;
    var possible = missionScore(mission,value);
    return '<div class="gxmt-editor" data-mission-id="'+esc(mission.id)+'"><div class="gxmt-editor-head"><div><strong>'+esc(mission.title)+'</strong><small>'+esc(mission.description || mission.metric_key || 'Misión configurada en el evento')+'</small></div><span class="gxmt-points">'+earned.toLocaleString('es-CO')+' pts</span></div><div class="gxmt-fields"><label>Avance <span>('+esc(mission.unit_label || 'unidades')+')</span><input type="number" min="0" step="any" data-gxmt-value value="'+esc(value)+'"></label><label>Estado<select data-gxmt-status><option value="pending"'+(status==='pending'?' selected':'')+'>Pendiente</option><option value="approved"'+(status==='approved'?' selected':'')+'>Aprobado</option><option value="rejected"'+(status==='rejected'?' selected':'')+'>Rechazado</option></select></label><label class="gxmt-note">Nota interna<input type="text" data-gxmt-note value="'+esc(p.admin_note || '')+'" placeholder="Observación opcional"></label></div><div class="gxmt-editor-foot"><small>Estimado al aprobar: '+possible.toLocaleString('es-CO')+' pts · Meta: '+esc(mission.target_value == null ? 'Sin meta' : mission.target_value)+' '+esc(mission.unit_label || '')+'</small><button type="button" class="gxec-btn primary" data-gxmt-save="'+esc(mission.id)+'" data-user-id="'+esc(userId)+'">Guardar avance</button></div></div>';
  }
  function openMissionTracking() {
    if (!adminAllowed()) { toast('Esta herramienta es exclusiva de administración.'); return; }
    if (document.getElementById(MISSION_MODAL_ID)) return;
    ensureStyles();
    var backdrop = document.createElement('div');
    backdrop.id = MISSION_MODAL_ID;
    backdrop.className = 'gxec-backdrop';
    backdrop.innerHTML = '<section class="gxec-modal gxmt-modal"><header class="gxec-head"><div><h2>Seguimiento por creador</h2><p class="gxec-sub">Abre un creador y despliega sus semanas y misiones existentes. Los puntos se calculan con la configuración del evento.</p></div><button type="button" class="gxec-close" data-gxmt-close>Cerrar</button></header><div class="gxmt-toolbar"><input type="search" data-gxmt-search placeholder="Buscar creador por usuario o nombre"><span data-gxmt-count></span></div><div data-gxmt-body class="gxmt-body"><div class="gxmt-empty">Cargando información del evento…</div></div></section>';
    document.body.appendChild(backdrop);
    backdrop.querySelector('[data-gxmt-close]').addEventListener('click',function(){backdrop.remove();});
    backdrop.addEventListener('click',function(e){if(e.target===backdrop)backdrop.remove();});
    backdrop.querySelector('[data-gxmt-search]').addEventListener('input',renderMissionTracking);
    loadSnapshot().then(function(){
      var count=backdrop.querySelector('[data-gxmt-count]');
      if(count) count.textContent=(snapshot.participants||[]).length+' creadores';
      renderMissionTracking();
    }).catch(function(e){
      console.error('[Grayxon misiones] No se pudo cargar seguimiento',e);
      var body=backdrop.querySelector('[data-gxmt-body]');
      if(body) body.innerHTML='<div class="gxmt-empty">No se pudo cargar la información. '+esc(e.message || '')+'</div>';
    });
  }
  async function saveMissionProgress(missionId,userId,editor) {
    if (busy || !snapshot || !editor) return;
    var mission=(snapshot.missions||[]).find(function(m){return m.id===missionId;});
    var participant=(snapshot.participants||[]).find(function(p){return p.user_id===userId;});
    if (!mission || !participant) {toast('No se encontró la misión o el creador.');return;}
    var value=Number(editor.querySelector('[data-gxmt-value]').value);
    var status=editor.querySelector('[data-gxmt-status]').value;
    var note=String(editor.querySelector('[data-gxmt-note]').value||'').trim();
    if (!Number.isFinite(value) || value<0) {toast('El avance debe ser un número igual o mayor que cero.');return;}
    var existing=missionProgress(missionId,userId);
    var button=editor.querySelector('[data-gxmt-save]');
    busy=true;if(button){button.disabled=true;button.textContent='Guardando…';}
    try {
      var now=new Date().toISOString();
      var payload={value:value,status:status,admin_note:note,reviewed_at:status==='approved'||status==='rejected'?now:null,updated_at:now};
      var result;
      if(existing && existing.id) {
        result=await sb.from('gx_event_mission_progress').update(payload).eq('id',existing.id).select('id,event_id,mission_id,user_id,value,status,note,admin_note,evidence_url,reviewed_at,created_at,updated_at').single();
      } else {
        payload.event_id=snapshot.eventId;payload.mission_id=missionId;payload.user_id=userId;
        result=await sb.from('gx_event_mission_progress').insert(payload).select('id,event_id,mission_id,user_id,value,status,note,admin_note,evidence_url,reviewed_at,created_at,updated_at').single();
      }
      if(result.error) throw result.error;
      snapshot.progress=(snapshot.progress||[]).filter(function(p){return !(p.mission_id===missionId&&p.user_id===userId);}).concat([result.data]);
      toast('Avance guardado. Los puntos se recalcularon con las reglas de la misión.');
      renderMissionTracking();
    } catch(e) {
      console.error('[Grayxon misiones] Error guardando avance',e);
      toast('No se pudo guardar el avance: '+(e&&e.message?e.message:'error desconocido'));
      if(button){button.disabled=false;button.textContent='Guardar avance';}
    } finally {busy=false;}
  }
  function ensureMissionTrackingStyles() {
    if(document.getElementById('gxmt-style'))return;
    var style=document.createElement('style');style.id='gxmt-style';
    style.textContent='.gxmt-modal{max-width:1050px!important}.gxmt-toolbar{display:flex;gap:10px;align-items:center;margin:16px 0}.gxmt-toolbar input,.gxmt-fields input,.gxmt-fields select{box-sizing:border-box;width:100%;background:#090d12;border:1px solid #35404c;color:#f5f7fa;border-radius:9px;padding:10px}.gxmt-toolbar input{flex:1}.gxmt-toolbar span{font-size:11px;color:#a8b3c1}.gxmt-body{display:grid;gap:10px}.gxmt-creator,.gxmt-segment{border:1px solid #303945;border-radius:12px;background:#10151c;overflow:hidden}.gxmt-creator>summary,.gxmt-segment>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:12px;padding:13px}.gxmt-creator>summary::-webkit-details-marker,.gxmt-segment>summary::-webkit-details-marker{display:none}.gxmt-creator>summary:after,.gxmt-segment>summary:after{content:"⌄";color:#25d9f2;margin-left:4px}.gxmt-avatar{width:36px;height:36px;display:grid;place-items:center;border-radius:50%;background:#152e38;border:1px solid #246071;color:#25d9f2;font-weight:900}.gxmt-person{display:grid;gap:3px;flex:1;min-width:0}.gxmt-person small,.gxmt-editor-head small{font-size:11px;color:#9ba7b5}.gxmt-total,.gxmt-segment>summary strong{color:#25d9f2;white-space:nowrap}.gxmt-segments{padding:0 12px 12px 48px;display:grid;gap:8px}.gxmt-segment>summary{padding:11px}.gxmt-segment>summary span{flex:1}.gxmt-missions{padding:0 10px 10px;display:grid;gap:9px}.gxmt-editor{border:1px solid #2d3742;background:#151c25;border-radius:10px;padding:12px}.gxmt-editor-head,.gxmt-editor-foot{display:flex;align-items:center;justify-content:space-between;gap:10px}.gxmt-editor-head>div{display:grid;gap:4px}.gxmt-points{color:#25d9f2;font-weight:900;white-space:nowrap}.gxmt-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.gxmt-fields label{display:grid;gap:6px;font-size:11px;color:#c4ceda;font-weight:800}.gxmt-fields label span{font-weight:400;color:#9ba7b5}.gxmt-fields .gxmt-note{grid-column:1/-1}.gxmt-editor-foot{margin-top:12px}.gxmt-editor-foot small{font-size:10px;color:#9ba7b5}.gxmt-empty{padding:24px;text-align:center;color:#a5afbc}.gxmt-segment[open]>summary,.gxmt-creator[open]>summary{border-bottom:1px solid #2c3540}@media(max-width:650px){.gxmt-toolbar{align-items:stretch;flex-direction:column}.gxmt-segments{padding-left:12px}.gxmt-fields{grid-template-columns:1fr}.gxmt-fields .gxmt-note{grid-column:auto}.gxmt-editor-foot{align-items:stretch;flex-direction:column}.gxmt-editor-foot .gxec-btn{width:100%}.gxmt-total{font-size:12px}}';
    document.head.appendChild(style);
  }

  document.addEventListener('click',function(e){
    var openMissions = e.target && e.target.closest ? e.target.closest('[data-gxmt-open]') : null;
    if (openMissions) { e.preventDefault(); openMissionTracking(); return; }
    var open = e.target && e.target.closest ? e.target.closest('[data-gxec-open-battles]') : null;
    if (open) { e.preventDefault(); openModal('battles',open.getAttribute('data-gxec-open-battles') || null); return; }
        var save = e.target && e.target.closest ? e.target.closest('[data-save-match]') : null;
    if (save) { e.preventDefault(); saveMatch(save.getAttribute('data-save-match')); }
  },true);
  function injectButton() {
    if (!adminAllowed() || !selectedEventId()) return;
    var workspace = document.querySelector('#gxevWorkspace');
    if (!workspace) return;
    if (!workspace.querySelector('[data-gxmt-open]')) {
      var trackingButton=document.createElement('button');trackingButton.type='button';trackingButton.className='gxev-btn';trackingButton.setAttribute('data-gxmt-open','1');trackingButton.textContent='👤 Seguimiento por creador';trackingButton.style.cssText='margin:8px 8px 12px 0;padding:10px 14px;font-weight:800;border-color:#287f91;background:linear-gradient(135deg,#10252b,#11171c);color:#d8fbff';
      var first=workspace.firstElementChild;if(first)workspace.insertBefore(trackingButton,first);else workspace.appendChild(trackingButton);
    }
    var phases = (typeof gxEventsDashboardData !== 'undefined' && gxEventsDashboardData && gxEventsDashboardData.phases) || (snapshot && snapshot.phases) || [];
    phases.forEach(function(phase) {
      var phaseName = String(phase.title || '').trim();
      if (!phase.id || !phaseName) return;
      var headings = Array.from(workspace.querySelectorAll('*')).filter(function(el) {
        return el.children.length === 0 && String(el.textContent || '').trim() === phaseName;
      });
      headings.forEach(function(heading) {
        var host = heading.parentElement;
        if (!host || host.querySelector('[data-gxec-open-battles="'+phase.id+'"]')) return;
        var button = document.createElement('button');
        button.type = 'button'; button.className = 'gxev-btn';
        button.setAttribute('data-gxec-open-battles', phase.id);
        button.textContent = '✓ Revisar cumplimiento';
        button.style.cssText = 'margin:6px 0 8px 8px;padding:7px 10px;font-size:12px;vertical-align:middle';
        heading.insertAdjacentElement('afterend', button);
      });
    });
    Array.from(workspace.querySelectorAll('details')).forEach(function(outer) {
      var summary = outer.querySelector(':scope > summary');
      if (!summary || !/Ver batallas de esta misión/i.test(summary.textContent || '')) return;
      var nested = Array.from(outer.querySelectorAll('details')).find(function(inner) {
        var innerSummary = inner.querySelector(':scope > summary');
        return innerSummary && /Batallas de esta fase/i.test(innerSummary.textContent || '');
      });
      if (!nested || nested.dataset.gxSingleOpen === '1') return;
      nested.dataset.gxSingleOpen = '1';
      nested.open = outer.open;
      var innerSummary = nested.querySelector(':scope > summary');
      if (innerSummary) innerSummary.style.display = 'none';
      outer.addEventListener('toggle', function(){ nested.open = outer.open; });
    });
  }
  var observer = new MutationObserver(function(){injectButton();});
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
  document.addEventListener('click',function(){setTimeout(injectButton,0);},true);
  setTimeout(injectButton,300);
})();