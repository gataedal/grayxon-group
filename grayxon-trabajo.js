(() => {
  const cfg = window.GRAYXON_CONFIG;
  const root = document.getElementById('gxApp');
  const login = document.getElementById('gxLogin');
  const main = document.getElementById('gxMain');
  const nav = document.getElementById('gxNav');
  const modalRoot = document.getElementById('gxModalRoot');
  const toastEl = document.getElementById('gxToast');

  if (!window.supabase || !cfg?.SUPABASE_URL || !cfg?.SUPABASE_PUBLISHABLE_KEY) {
    document.getElementById('gxLoginError').textContent = 'No se pudo iniciar el módulo. Recarga la página.';
    return;
  }

  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  const state = {
    session: null, member: null, isAdmin: false, tab: 'home',
    tasks: [], requests: [], members: [], departments: [], activity: [], creators: []
  };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const statusLabels = {
    pending:'Pendiente', in_progress:'En progreso', blocked:'Bloqueada',
    submitted:'Entregada para revisión', completed:'Completada', cancelled:'Cancelada'
  };
  const requestLabels = { pending:'Pendiente', approved:'Aprobada', rejected:'Rechazada', converted:'Convertida en tarea' };
  const priorityLabels = { low:'Baja', normal:'Normal', high:'Alta', urgent:'Urgente' };
  const dateLabel = value => value ? new Intl.DateTimeFormat('es-CO',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value)) : 'Sin fecha';
  const dateTimeLabel = value => value ? new Intl.DateTimeFormat('es-CO',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value)) : '—';

  function toast(message) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toastEl.hidden = true; }, 3200);
  }

  function setAuthView(isAuthed) {
    login.hidden = isAuthed;
    root.hidden = !isAuthed;
    document.body.classList.toggle('gxt-authenticated', !!isAuthed);
  }

  function showAccessMessage(message) {
    const messageEl = document.getElementById('gxLoginMessage');
    const errorEl = document.getElementById('gxLoginError');
    if (messageEl) messageEl.textContent = message;
    if (errorEl) errorEl.textContent = '';
    setAuthView(false);
  }

  async function loadMember() {
    const user = state.session?.user;
    if (!user) return showAccessMessage('Tu sesión del portal no está activa. Ingresa al portal Grayxon y vuelve a abrir esta sección.');
    const { data, error } = await sb
      .from('gx_internal_members')
      .select('id,user_id,email,display_name,access_level,job_title,department_id,active,department:gx_departments(name)')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('[Grayxon Trabajo] membership lookup', error);
      showAccessMessage('No se pudo validar tu acceso en este momento. Vuelve al portal e inténtalo nuevamente.');
      return;
    }
    if (!data || data.active !== true) {
      showAccessMessage('Esta cuenta no tiene acceso a Grayxon Trabajo. Si consideras que es un error, comunícate con administración.');
      return;
    }

    state.member = data;
    state.isAdmin = data.access_level === 'admin';
    document.getElementById('gxUserName').textContent = data.display_name || user.email || 'Equipo Grayxon';
    document.getElementById('gxUserJob').textContent = [data.job_title, data.department?.name].filter(Boolean).join(' · ');
    document.getElementById('gxAccessBadge').textContent = state.isAdmin ? 'Administración' : 'Operativo';
    setAuthView(true);
    await loadData();
    renderNav();
    renderPage();
    handleNotificationTarget();
  }

  async function init() {
    const { data, error } = await sb.auth.getSession();
    if (error) console.warn('[Grayxon Trabajo] session', error.message);
    state.session = data?.session || null;
    if (state.session) await loadMember();
    else showAccessMessage('Para entrar a Grayxon Trabajo, primero inicia sesión en el portal Grayxon con tu cuenta habitual.');

    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      state.session = session;
      setTimeout(() => {
        if (session) loadMember();
        else showAccessMessage('Tu sesión del portal finalizó. Vuelve al portal Grayxon para ingresar de nuevo.');
      }, 0);
    });
  }

  async function queryRows(query, label) {
    const { data, error } = await query;
    if (error) {
      console.warn('[Grayxon Trabajo] ' + label, error.message);
      return [];
    }
    return data || [];
  }

  async function loadData() {
    // Keep primary records independent from embedded relations. RLS on related
    // member rows can otherwise make PostgREST return empty/error results for
    // the whole list even when the task/request itself is readable.
    const taskQuery = sb.from('gx_tasks').select('*').order('created_at', { ascending: false });
    const requestQuery = sb.from('gx_task_requests').select('*').order('created_at', { ascending: false });
    const memberQuery = sb.from('gx_internal_members')
      .select('id,user_id,email,display_name,access_level,job_title,department_id,active,department:gx_departments(name)')
      .order('display_name');
    const departmentQuery = sb.from('gx_departments')
      .select('id,name,slug,active')
      .order('name');
    const activityQuery = sb.from('gx_task_activity')
      .select('id,task_id,actor_name,action,details,created_at,task:gx_tasks!gx_task_activity_task_id_fkey(title)')
      .order('created_at', { ascending: false })
      .limit(80);
    const creatorQuery = sb.from('profiles')
      .select('id,username,full_name,tiktok_username,manager_id')
      .eq('role','creator').eq('active',true).order('username');

    const [tasks, requests, members, departments, activity, creators] = await Promise.all([
      queryRows(taskQuery, 'tasks'),
      queryRows(requestQuery, 'requests'),
      queryRows(memberQuery, 'members'),
      queryRows(departmentQuery, 'departments'),
      queryRows(activityQuery, 'activity'),
      queryRows(creatorQuery, 'team creators')
    ]);
    const memberByUser = new Map(members.map(m => [m.user_id, m]));
    const departmentById = new Map(departments.map(d => [d.id, d]));
    state.tasks = tasks.filter(task => state.isAdmin || task.assigned_to === state.session?.user?.id).map(task => ({
      ...task,
      assignee: memberByUser.has(task.assigned_to) ? memberByUser.get(task.assigned_to) : null,
      department: departmentById.has(task.department_id) ? departmentById.get(task.department_id) : null
    }));
    state.requests = requests.map(request => ({
      ...request,
      requester: memberByUser.has(request.requester_id) ? memberByUser.get(request.requester_id) : null,
      department: departmentById.has(request.department_id) ? departmentById.get(request.department_id) : null
    }));
    state.members = members;
    state.departments = departments;
    state.activity = activity;
    state.creators = creators;
  }

  function handleNotificationTarget() {
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get('task');
    const requestId = params.get('request');
    if (taskId) {
      // A requester may review a creator-targeted task without being its assignee.
      state.tab = 'tasks';
      renderPage();
      openTaskDetail(taskId);
      return;
    }
    if (requestId && state.requests.some(r => r.id === requestId)) {
      state.tab = 'requests';
      renderPage();
      openRequestDetail(requestId);
    }
  }

  function renderNav() {
    const items = state.isAdmin
      ? [
          ['home','⌂','Resumen'],['tasks','▤','Todas las tareas'],['requests','↗','Solicitudes'],
          ['team','♙','Equipo'],['departments','▦','Áreas y cargos'],['activity','◷','Actividad'],['calendar','▦','Calendario']
        ]
      : [['home','⌂','Mi trabajo'],['tasks','▤','Tareas'],['requests','↗','Mis solicitudes'],['calendar','▦','Calendario']];
    nav.innerHTML = items.map(([key,icon,label]) =>
      '<button type="button" data-tab="'+key+'" class="'+(state.tab===key?'active':'')+'"><span class="gxt-nav-ico">'+icon+'</span>'+label+'</button>'
    ).join('');
  }

  function pageHead(title, description, actions = '') {
    return '<div class="gxt-page-head"><div><h1>'+esc(title)+'</h1><p>'+esc(description)+'</p></div><div class="gxt-actions">'+actions+'</div></div>';
  }

  function taskChip(status) {
    return '<span class="gxt-chip status-'+esc(status)+'">'+esc(statusLabels[status] || status)+'</span>';
  }

  function taskCard(task) {
    const assignee = task.assignee?.display_name || 'Integrante';
    const due = task.due_at ? 'Vence: '+dateLabel(task.due_at) : 'Sin fecha límite';
    const adminActions=state.isAdmin&&task.status==='pending'
      ? '<button type="button" class="gxt-btn" data-cancel-task="'+task.id+'">Cancelar tarea</button><button type="button" class="gxt-btn danger" data-delete-task="'+task.id+'">Eliminar</button>'
      : state.isAdmin&&task.status==='cancelled'
        ? '<button type="button" class="gxt-btn danger" data-delete-task="'+task.id+'">Eliminar tarea</button>' : '';
    return '<details class="gxt-accordion gxt-task-accordion"><summary><div class="gxt-accordion-main"><strong>'+esc(task.title)+'</strong><div class="gxt-card-meta">'+taskChip(task.status)+'<span class="gxt-chip">'+esc(priorityLabels[task.priority] || task.priority)+'</span>'+(state.isAdmin?'<span class="gxt-chip">'+esc(assignee)+'</span>':'')+'<span class="gxt-chip">'+esc(due)+'</span></div></div><span class="gxt-accordion-chevron">⌄</span></summary><div class="gxt-accordion-body"><p>'+esc(task.description || 'Sin descripción adicional.')+'</p><div class="gxt-card-meta"><span class="gxt-chip">'+esc(task.department?.name || 'Sin área')+'</span><span class="gxt-chip">Creada: '+dateLabel(task.created_at)+'</span></div><div class="gxt-actions"><button type="button" class="gxt-btn primary" data-open-task="'+task.id+'">Abrir tarea y seguimiento</button>'+adminActions+'</div></div></details>';
  }

  function requestCard(request) {
    const requester = request.requester?.display_name || 'Integrante';
    const creator = state.creators.find(c=>c.id===request.creator_user_id);
    const creatorLabel = creator ? (creator.tiktok_username || creator.username || creator.full_name || 'Creador') : '';
    let actions = '';
    if (state.isAdmin && ['pending','approved'].includes(request.status)) {
      actions = '<div class="gxt-actions"><button class="gxt-btn primary" data-request-action="convert" data-request-id="'+request.id+'">Asignar y crear tarea</button><button class="gxt-btn danger" data-request-action="reject" data-request-id="'+request.id+'">Rechazar</button></div>';
    }
    return '<details id="gx-request-'+request.id+'" data-request-id="'+request.id+'" class="gxt-accordion gxt-request-accordion"><summary><div class="gxt-accordion-main"><strong>'+esc(request.title)+'</strong><div class="gxt-card-meta"><span class="gxt-chip">'+esc(requestLabels[request.status] || request.status)+'</span><span class="gxt-chip">'+esc(request.urgency)+'</span>'+(state.isAdmin?'<span class="gxt-chip">Solicitó: '+esc(requester)+'</span>':'')+(creatorLabel?'<span class="gxt-chip">Para @'+esc(creatorLabel)+'</span>':'')+'<span class="gxt-chip">'+dateLabel(request.created_at)+'</span></div></div><span class="gxt-accordion-chevron">⌄</span></summary><div class="gxt-accordion-body"><p>'+esc(request.description || 'Sin detalles adicionales.')+'</p><div class="gxt-card-meta"><span class="gxt-chip">'+esc(request.department?.name || 'Sin área')+'</span></div><div class="gxt-actions"><button type="button" class="gxt-btn ghost" data-open-request="'+request.id+'">Abrir solicitud y conversación</button></div>'+actions+'</div></details>';
  }

  function renderDashboard() {
    const tasks = state.tasks;
    const requests = state.requests;
    const active = tasks.filter(t => ['pending','in_progress','blocked'].includes(t.status)).length;
    const review = tasks.filter(t => t.status === 'submitted').length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const pendingRequests = requests.filter(r => r.status === 'pending').length;
    const metrics = state.isAdmin
      ? [['Tareas activas',active,'Pendientes o en ejecución'],['Por revisar',review,'Entregas del equipo'],['Completadas',completed,'Aprobadas por administración'],['Solicitudes',pendingRequests,'Esperando decisión']]
      : [['Mis tareas',tasks.length,'Asignadas a tu usuario'],['En progreso',active,'Pendientes o en ejecución'],['Por revisar',review,'Entregadas a administración'],['Completadas',completed,'Aprobadas por administración']];
    const metricHtml = metrics.map(m=>'<div class="gxt-metric"><small>'+m[0]+'</small><strong>'+m[1]+'</strong><span>'+m[2]+'</span></div>').join('');
    const taskList = tasks.slice(0,6).map(taskCard).join('') || '<div class="gxt-empty">Todavía no hay tareas registradas.</div>';
    const activeRequests = requests.filter(r=>r.status!=='converted');
    const requestList = state.isAdmin
      ? activeRequests.filter(r=>r.status==='pending').slice(0,4).map(requestCard).join('') || '<div class="gxt-empty">No hay solicitudes pendientes.</div>'
      : requests.slice(0,3).map(requestCard).join('') || '<div class="gxt-empty">Todavía no has enviado solicitudes.</div>';
    const title = state.isAdmin ? 'Resumen operativo' : 'Mi trabajo';
    const description = state.isAdmin
      ? 'Supervisa las tareas, entregas y solicitudes del equipo interno.'
      : 'Aquí encuentras tus responsabilidades y el estado de cada entrega.';
    const actions = state.isAdmin
      ? '<button class="gxt-btn primary" data-action="new-task">＋ Crear tarea</button><button class="gxt-btn" data-action="new-request">Nueva solicitud</button>'
      : '<button class="gxt-btn primary" data-action="new-request">＋ Nueva solicitud</button>';
    main.innerHTML = pageHead(title,description,actions)+
      '<div class="gxt-metrics">'+metricHtml+'</div>'+
      '<section class="gxt-panel"><div class="gxt-panel-head"><h2>'+(state.isAdmin?'Tareas recientes':'Mis tareas')+'</h2><button class="gxt-btn ghost" data-tab="tasks">Ver todas</button></div><div class="gxt-list">'+taskList+'</div></section>'+
      '<section class="gxt-panel"><div class="gxt-panel-head"><h2>'+(state.isAdmin?'Solicitudes pendientes':'Mis solicitudes recientes')+'</h2><button class="gxt-btn ghost" data-tab="requests">Ver solicitudes</button></div><div class="gxt-list">'+requestList+'</div></section>'+
      '<div class="gxt-status-note">Las tareas solo se consideran completadas cuando administración aprueba la entrega. Las solicitudes se convierten en tareas cuando administración asigna responsable y confirma su creación.</div>';
  }

  function renderTasksPage() {
    const list = state.tasks.map(taskCard).join('') || '<div class="gxt-empty">No hay tareas para mostrar.</div>';
    main.innerHTML = pageHead(state.isAdmin?'Todas las tareas':'Mi trabajo',state.isAdmin?'Consulta y administra las tareas de todo el equipo.':'Consulta tus tareas, actualiza avances y entrega resultados para revisión.',state.isAdmin?'<button class="gxt-btn primary" data-action="new-task">＋ Crear tarea</button>':'')+
      '<section class="gxt-panel"><div class="gxt-panel-head"><h2>'+state.tasks.length+' tareas</h2><small>Ordenadas por creación</small></div><div class="gxt-list">'+list+'</div></section>';
  }

  function renderRequestsPage() {
    const active = state.requests.filter(r=>!['converted','rejected'].includes(r.status));
    const converted = state.requests.filter(r=>r.status==='converted');
    const rejected = state.requests.filter(r=>r.status==='rejected');
    const activeList = active.map(requestCard).join('') || '<div class="gxt-empty">No hay solicitudes pendientes de gestión.</div>';
    const historyList = converted.map(requestCard).join('');
    main.innerHTML = pageHead(state.isAdmin?'Solicitudes del equipo':'Mis solicitudes',state.isAdmin?'Asigna responsable y crea tareas directamente desde cada solicitud. Las convertidas quedan en el historial.':'Aquí aparecen las solicitudes que todavía requieren gestión. Cuando una se convierte en tarea, continúa en “Tareas”.', '<button class="gxt-btn primary" data-action="new-request">＋ Nueva solicitud</button>')+
      '<section class="gxt-panel"><div class="gxt-panel-head"><h2>'+active.length+' solicitudes activas</h2></div><div class="gxt-list">'+activeList+'</div></section>'+
      (historyList ? '<section class="gxt-panel gxt-history-panel"><div class="gxt-panel-head"><h2>Historial · '+converted.length+' convertidas en tarea</h2><small>Consulta cada solicitud cuando la necesites</small></div><div class="gxt-list">'+historyList+'</div></section>' : '')+
      (rejected.length ? '<section class="gxt-panel gxt-history-panel"><div class="gxt-panel-head"><h2>Solicitudes rechazadas · '+rejected.length+'</h2></div><div class="gxt-list">'+rejected.map(requestCard).join('')+'</div></section>' : '');
  }

  function renderTeamPage() {
    const rows = state.members.map(m =>
      '<tr><td><strong>'+esc(m.display_name)+'</strong><br><span class="gxt-hint">'+esc(m.email || '')+'</span></td>'+
      '<td>'+esc(m.job_title)+'</td><td>'+esc(m.department?.name || 'Sin área')+'</td>'+
      '<td><span class="gxt-chip">'+(m.access_level==='admin'?'Administración':'Operativo')+'</span></td>'+
      '<td><span class="gxt-chip '+(m.active?'status-completed':'status-blocked')+'">'+(m.active?'Activo':'Inactivo')+'</span></td>'+
      '<td><button class="gxt-btn" data-edit-member="'+m.id+'">Editar</button></td></tr>'
    ).join('');
    main.innerHTML = pageHead('Equipo interno','Administra los integrantes que ya tienen una cuenta Grayxon. Los permisos de acceso se mantienen separados del cargo.', '')+
      '<section class="gxt-panel"><div class="gxt-panel-head"><h2>'+state.members.length+' integrantes</h2></div><div class="gxt-table-wrap"><table class="gxt-table"><thead><tr><th>Integrante</th><th>Cargo</th><th>Área</th><th>Acceso</th><th>Estado</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div></section>';
  }

  function renderDepartmentsPage() {
    const rows = state.departments.map(d =>
      '<tr><td><strong>'+esc(d.name)+'</strong></td><td>'+esc(d.slug)+'</td><td><span class="gxt-chip '+(d.active?'status-completed':'status-blocked')+'">'+(d.active?'Activa':'Inactiva')+'</span></td><td><button class="gxt-btn" data-toggle-department="'+d.id+'" data-active="'+d.active+'">'+(d.active?'Desactivar':'Activar')+'</button></td></tr>'
    ).join('');
    main.innerHTML = pageHead('Áreas y cargos','Las áreas pueden crecer sin crear roles técnicos nuevos. El cargo se define en cada integrante.', '<button class="gxt-btn primary" data-action="new-department">＋ Nueva área</button>')+
      '<section class="gxt-panel"><div class="gxt-panel-head"><h2>'+state.departments.length+' áreas</h2></div><div class="gxt-table-wrap"><table class="gxt-table"><thead><tr><th>Área</th><th>Identificador</th><th>Estado</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div></section>';
  }

  function renderCalendarLinkPage() {
    main.innerHTML = pageHead('Calendario de Grayxon','Usa el calendario compartido del portal. Las tareas internas se muestran allí junto a eventos, batallas, entrenamientos y cumpleaños.','<button class="gxt-btn primary" data-action="open-calendar">Abrir calendario</button>')+
      '<section class="gxt-panel"><div class="gxt-status-note">Este acceso abre el calendario existente de Grayxon; no crea un calendario paralelo. La visibilidad de las tareas se controla desde Supabase según tu membresía y asignaciones.</div><a class="gxt-backlink" href="portal.html?openCalendar=1">Abrir el calendario compartido ↗</a></section>';
  }

  function renderActivityPage() {
    const rows = state.activity.map(a => {
      const detail = a.details || {};
      let summary = a.action === 'created' ? 'Creó la tarea' :
        a.action === 'status_changed' ? 'Cambió estado: '+(statusLabels[detail.from]||detail.from)+' → '+(statusLabels[detail.to]||detail.to) :
        a.action === 'reassigned' ? 'Reasignó la tarea' : a.action === 'comment_added' ? 'Añadió un comentario' : a.action === 'attachment_added' ? 'Adjuntó una evidencia' : 'Actualizó la tarea';
      return '<tr><td>'+dateTimeLabel(a.created_at)+'</td><td>'+esc(a.actor_name || 'Sistema')+'</td><td>'+esc(a.task?.title || 'Tarea')+'</td><td>'+esc(summary)+'</td></tr>';
    }).join('');
    main.innerHTML = pageHead('Actividad','Registro de cambios y movimientos de las tareas.', '')+
      '<section class="gxt-panel"><div class="gxt-table-wrap"><table class="gxt-table"><thead><tr><th>Fecha</th><th>Integrante</th><th>Tarea</th><th>Movimiento</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+(rows?'':'<div class="gxt-empty">Todavía no hay actividad registrada.</div>')+'</section>';
  }

  function renderPage() {
    renderNav();
    if (state.tab === 'tasks') return renderTasksPage();
    if (state.tab === 'requests') return renderRequestsPage();
    if (state.tab === 'team' && state.isAdmin) return renderTeamPage();
    if (state.tab === 'departments' && state.isAdmin) return renderDepartmentsPage();
    if (state.tab === 'activity' && state.isAdmin) return renderActivityPage();
    if (state.tab === 'calendar') return renderCalendarLinkPage();
    renderDashboard();
  }

  function openModal(title, subtitle, body, wide = false) {
    modalRoot.innerHTML = '<section class="gxt-modal '+(wide?'wide':'')+'" role="dialog" aria-modal="true"><header class="gxt-modal-head"><div><h2>'+esc(title)+'</h2><p>'+esc(subtitle)+'</p></div><button type="button" class="gxt-close" data-close-modal aria-label="Cerrar">×</button></header>'+body+'</section>';
    modalRoot.querySelector('[data-close-modal]').addEventListener('click',closeModal);

  }

  function backdropClose(event) {
    if (event.target === modalRoot) closeModal();
  }

  function fileAttachmentCard(file,url,uploadedBy='',reviewTaskId=null,canReviewProposal=false) {
    const authorLine=uploadedBy?'<small class="gxt-file-uploader">Enviado por '+esc(uploadedBy)+'</small>':'';
    if(!url) return '<article class="gxt-file-card"><div class="gxt-file-icon">📎</div><div class="gxt-file-info"><strong>'+esc(file.file_name)+'</strong><small>'+dateTimeLabel(file.created_at)+'</small>'+authorLine+'<span>No fue posible abrir el archivo</span></div></article>';
    const mime=esc(file.mime_type||'');
    const finalTag=file.is_final_proposal?'<span class="gxt-file-final-tag">✦ PROPUESTA FINAL</span>':'';
    const reviewAttrs=file.is_final_proposal&&canReviewProposal?' data-preview-task-id="'+esc(reviewTaskId||'')+'" data-preview-review="true"':'';
    if((file.mime_type||'').startsWith('image/')){
      return '<article class="gxt-chat-image-attachment"><button type="button" class="gxt-chat-image-open" data-preview-file="'+esc(url)+'" data-file-name="'+esc(file.file_name)+'" data-file-mime="'+mime+'"'+reviewAttrs+' aria-label="Abrir '+esc(file.file_name)+'"><img src="'+esc(url)+'" alt="'+esc(file.file_name)+'" loading="lazy"></button><div class="gxt-chat-image-meta"><span>'+esc(file.file_name)+'</span>'+finalTag+'<button type="button" class="gxt-btn" data-download-file="'+esc(url)+'" data-file-name="'+esc(file.file_name)+'">Descargar</button></div></article>';
    }
    return '<article class="gxt-file-card"><div class="gxt-file-icon">📎</div><div class="gxt-file-info"><strong>'+esc(file.file_name)+'</strong><small>'+dateTimeLabel(file.created_at)+' · '+esc(file.mime_type||'Archivo adjunto')+'</small>'+authorLine+finalTag+'</div><div class="gxt-file-actions"><button type="button" class="gxt-btn ghost" data-preview-file="'+esc(url)+'" data-file-name="'+esc(file.file_name)+'" data-file-mime="'+mime+'"'+reviewAttrs+'>Ver</button><button type="button" class="gxt-btn" data-download-file="'+esc(url)+'" data-file-name="'+esc(file.file_name)+'">Descargar</button></div></article>';
  }

  function attachmentUploaderName(userId,context={},fileId=null,activityRows=[]) {
    const member=state.members.find(item=>item.user_id===userId);
    if(member?.display_name)return member.display_name;
    if(userId===state.session?.user?.id)return state.member?.display_name||'Tú';
    const loggedUpload=activityRows.find(item=>item.action==='attachment_added'&&item.details?.attachment_id===fileId);
    if(loggedUpload?.actor_name)return loggedUpload.actor_name;
    if(context.requester_id===userId)return context.requester?.display_name||'Solicitante';
    if(context.created_by===userId)return 'Administración';
    if(context.assigned_to===userId)return context.assignee?.display_name||'Responsable asignado';
    return state.isAdmin?'Integrante':'Administración';
  }

  function renderChatTimeline(comments,attachments,proposals=[],reviewTaskId=null,allowProposalReview=false) {
    const proposalAnnouncement=proposals.length?comments.find(item=>(item.body||'').trim()==='Propuesta final enviada a revisión.'):null;
    const visibleComments=proposalAnnouncement?comments.filter(item=>item!==proposalAnnouncement):comments;
    const items=[
      ...visibleComments.map(item=>({kind:'message',created_at:item.created_at,author_id:item.author_id,author_name:item.author_name||'Integrante',body:item.body})),
      ...attachments.map(item=>({kind:'file',created_at:item.created_at,author_id:item.uploaded_by,author_name:item.uploader_name||'Integrante',file:item,url:item.signed_url||null})),
      ...(proposals.length?[{kind:'proposal',created_at:proposalAnnouncement?.created_at||proposals[0].created_at,author_id:proposalAnnouncement?.author_id||proposals[0].uploaded_by,author_name:proposalAnnouncement?.author_name||proposals[0].uploader_name||'Responsable',body:proposalAnnouncement?.body||'Propuesta final enviada a revisión.',files:proposals,task_id:reviewTaskId}]:[])
    ].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
    if(!items.length)return '<div class="gxt-chat-empty">Todavía no hay mensajes. Inicia la conversación o adjunta un archivo.</div>';
    const grouped=[];
    items.forEach(item=>{
      const previous=grouped[grouped.length-1];
      const sameSender=previous&&previous.author_id===item.author_id;
      const closeInTime=previous&&Math.abs(new Date(item.created_at)-new Date(previous.created_at))<=10000;
      const canAttachToMessage=previous?.kind==='message'&&sameSender&&closeInTime&&(item.kind==='file'||item.kind==='proposal');
      if(canAttachToMessage){
        if(item.kind==='proposal'){previous.files.push(...item.files);previous.isFinalProposal=true;}
        else previous.files.push(item);
      }else{
        grouped.push({kind:item.kind,created_at:item.created_at,author_id:item.author_id,author_name:item.author_name,messages:item.kind==='message'?[item.body]:[],files:item.kind==='file'?[item]:item.kind==='proposal'?item.files:[],task_id:item.task_id,body:item.body,isFinalProposal:item.kind==='proposal'});
      }
    });
    return grouped.map(item=>{
      const mine=item.author_id?item.author_id===state.session?.user?.id:item.author_name===state.member?.display_name;
      let content='';
      if(item.kind==='proposal'){
        content='<p>'+esc(item.body)+'</p>'+item.files.map(file=>fileAttachmentCard(file,file.signed_url,'',reviewTaskId,allowProposalReview)).join('');
      }else{
        content=(item.isFinalProposal?'<div class="gxt-final-proposal-tag">✦ PROPUESTA FINAL</div>':'')+item.messages.map(message=>'<p>'+esc(message)+'</p>').join('')+item.files.map(file=>fileAttachmentCard(file.file||file,file.url||file.signed_url,file.uploader_name||'',reviewTaskId,allowProposalReview)).join('');
      }
      return '<article class="gxt-chat-message '+(mine?'mine':'')+'"><div class="gxt-chat-bubble"><div class="gxt-chat-message-head"><strong class="gxt-chat-author">'+esc(item.author_name)+'</strong><time>'+dateTimeLabel(item.created_at)+'</time></div>'+content+'</div></article>';
    }).join('');
  }
  async function downloadAttachment(url,name,button) {
    const original=button.textContent;button.disabled=true;button.textContent='Descargando...';
    try {
      const response=await fetch(url);
      if(!response.ok)throw new Error('No se pudo recuperar el archivo');
      const blob=await response.blob();
      const objectUrl=URL.createObjectURL(blob);
      const link=document.createElement('a');link.href=objectUrl;link.download=name||'archivo';document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(objectUrl),1500);
    } catch(error) { toast('No se pudo descargar el archivo. Intenta nuevamente.'); }
    finally {button.disabled=false;button.textContent=original;}
  }

  function openFilePreview(url,name,mime,reviewTaskId=null,canReviewProposal=false) {
    const safeUrl=esc(url), safeName=esc(name);
    let preview='';
    if((mime||'').startsWith('image/')) preview='<img class="gxt-preview-image" src="'+safeUrl+'" alt="'+safeName+'">';
    else if(mime==='application/pdf') preview='<iframe class="gxt-preview-frame" src="'+safeUrl+'" title="'+safeName+'"></iframe>';
    else preview='<div class="gxt-preview-unavailable"><div>📄</div><strong>Vista previa no disponible para este formato</strong><p>Puedes descargar el archivo para abrirlo con la aplicación correspondiente.</p></div>';
    const layer=document.createElement('div');
    layer.className='gxt-file-preview';
    layer.innerHTML='<div class="gxt-file-preview-dialog"><header><div><strong>'+safeName+'</strong><small>Vista previa del archivo</small></div><div class="gxt-file-actions"><button type="button" class="gxt-btn primary" data-download-file="'+safeUrl+'" data-file-name="'+safeName+'">Descargar</button><button type="button" class="gxt-close" data-preview-close>×</button></div></header><div class="gxt-preview-content">'+preview+'</div>'+(canReviewProposal&&reviewTaskId?'<section class="gxt-preview-review"><div><strong>Revisión de propuesta final</strong><small>Aprueba el contenido para enviarlo al creador o deja comentarios para solicitar ajustes.</small></div><textarea id="gxPreviewReviewFeedback" placeholder="Comentarios u observaciones (obligatorios si solicitas cambios)"></textarea><div class="gxt-actions"><button type="button" class="gxt-btn primary" data-preview-delivery-review="approve" data-task-id="'+esc(reviewTaskId)+'">Aprobar y enviar</button><button type="button" class="gxt-btn danger" data-preview-delivery-review="return" data-task-id="'+esc(reviewTaskId)+'">Solicitar cambios</button></div></section>':'')+'</div>';
    modalRoot.appendChild(layer);
    layer.addEventListener('click',e=>{if(e.target===layer||e.target.closest('[data-preview-close]'))layer.remove();});
  }

  function closeModal() { modalRoot.innerHTML = ''; }

  function activeMembersOptions(selected = '') {
    return state.members.filter(m=>m.active).map(m=>'<option value="'+m.user_id+'" '+(m.user_id===selected?'selected':'')+'>'+esc(m.display_name)+' · '+esc(m.job_title)+'</option>').join('');
  }
  function activeDepartmentsOptions(selected = '') {
    return '<option value="">Sin área</option>'+state.departments.filter(d=>d.active).map(d=>'<option value="'+d.id+'" '+(d.id===selected?'selected':'')+'>'+esc(d.name)+'</option>').join('');
  }

  function openNewTask() {
    if (!state.isAdmin) return;
    openModal('Crear tarea','Asigna una responsabilidad a un integrante interno.', 
      '<form id="gxNewTaskForm"><div class="gxt-form-grid">'+
      '<div class="gxt-field full"><label>Título de la tarea</label><input name="title" maxlength="180" required></div>'+
      '<div class="gxt-field full"><label>Descripción e instrucciones</label><textarea name="description" placeholder="Explica el resultado esperado y cualquier detalle importante."></textarea></div>'+
      '<div class="gxt-field"><label>Responsable</label><select name="assigned_to" required><option value="">Seleccionar integrante…</option>'+activeMembersOptions()+'</select></div>'+
      '<div class="gxt-field"><label>Área</label><select name="department_id">'+activeDepartmentsOptions()+'</select></div>'+
      '<div class="gxt-field"><label>Prioridad</label><select name="priority"><option value="normal">Normal</option><option value="low">Baja</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></div>'+
      '<div class="gxt-field"><label>Fecha de inicio</label><input name="starts_at" type="datetime-local"></div>'+
      '<div class="gxt-field"><label>Fecha límite</label><input name="due_at" type="datetime-local"></div>'+
      '</div><div class="gxt-modal-actions"><button type="button" class="gxt-btn ghost" data-close-modal>Cancelar</button><button class="gxt-btn primary" type="submit">Crear y asignar tarea</button></div></form>');
    document.getElementById('gxNewTaskForm').addEventListener('submit', createTask);
  }

  async function createTask(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const assigned = String(form.get('assigned_to') || '');
    if (!assigned) return toast('Selecciona a la persona responsable.');
    const { error } = await sb.from('gx_tasks').insert({
      title: String(form.get('title')||'').trim(),
      description: String(form.get('description')||'').trim() || null,
      assigned_to: assigned,
      created_by: state.session.user.id,
      department_id: String(form.get('department_id')||'') || null,
      priority: String(form.get('priority')||'normal'),
      starts_at: form.get('starts_at') ? new Date(form.get('starts_at')).toISOString() : null,
      due_at: form.get('due_at') ? new Date(form.get('due_at')).toISOString() : null
    });
    if (error) return toast('No se pudo crear la tarea: '+error.message);
    closeModal(); await refresh(); toast('Tarea creada y asignada.');
  }

  function openNewRequest() {
    openModal('Nueva solicitud','Envía una necesidad al administrador. No se convertirá en tarea hasta que sea aprobada.', 
      '<form id="gxNewRequestForm"><div class="gxt-form-grid">'+
      '<div class="gxt-field full"><label>¿Qué necesitas?</label><input name="title" maxlength="180" required></div>'+
      '<div class="gxt-field full"><label>Explica tu solicitud</label><textarea name="description" required placeholder="Describe qué necesitas y por qué."></textarea></div>'+
      '<div class="gxt-field"><label>Área relacionada</label><select name="department_id">'+activeDepartmentsOptions(state.member.department_id)+'</select></div>'+
      '<div class="gxt-field"><label>Urgencia</label><select name="urgency"><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></div>'+
      '<div class="gxt-field full"><label>¿Es una entrega para un creador? (opcional)</label><select name="creator_user_id"><option value="">No aplica · Solicitud interna/general</option>'+state.creators.map(c=>'<option value="'+c.id+'">@'+esc(c.tiktok_username||c.username||c.full_name||'Creador')+'</option>').join('')+'</select><small class="gxt-hint">Solo aparecen los creadores de tu equipo. Si la solicitud no es para un creador, déjalo en “No aplica”.</small></div>'+
      '<div class="gxt-field full"><label>Archivos adjuntos</label><input name="files" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.txt,.zip"><small class="gxt-hint">Puedes adjuntar hasta 5 archivos de máximo 20 MB cada uno.</small></div>'+
      '</div><div class="gxt-modal-actions"><button type="button" class="gxt-btn ghost" data-close-modal>Cancelar</button><button class="gxt-btn primary" type="submit">Enviar solicitud</button></div></form>');
    document.getElementById('gxNewRequestForm').addEventListener('submit', createRequest);
  }

  async function createRequest(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const files = form.getAll('files').filter(file => file instanceof File && file.size > 0);
    if (files.length > 5) return toast('Puedes adjuntar máximo 5 archivos por solicitud.');
    if (files.some(file => file.size > 20*1024*1024)) return toast('Cada archivo debe pesar máximo 20 MB.');
    const { data: request, error } = await sb.from('gx_task_requests').insert({
      requester_id: state.session.user.id,
      title: String(form.get('title')||'').trim(),
      description: String(form.get('description')||'').trim(),
      department_id: String(form.get('department_id')||'') || null,
      urgency: String(form.get('urgency')||'normal'),
      creator_user_id: String(form.get('creator_user_id')||'') || null
    }).select('id').single();
    if (error) return toast('No se pudo enviar la solicitud: '+error.message);
    const uploadedPaths = [];
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-100);
      const objectPath = request.id+'/'+crypto.randomUUID()+'-'+safeName;
      const { error: uploadError } = await sb.storage.from('gx-internal-request-files').upload(objectPath,file,{upsert:false});
      if (uploadError) {
        await refresh();
        closeModal();
        return toast('La solicitud sí fue enviada, pero no se pudo adjuntar '+file.name+'. Puedes intentarlo nuevamente desde administración.');
      }
      uploadedPaths.push(objectPath);
      const { error: rowError } = await sb.from('gx_task_request_attachments').insert({
        request_id:request.id,uploaded_by:state.session.user.id,object_path:objectPath,
        file_name:file.name,mime_type:file.type||null,size_bytes:file.size
      });
      if (rowError) {
        await sb.storage.from('gx-internal-request-files').remove([objectPath]);
        await refresh();
        closeModal();
        return toast('La solicitud sí fue enviada, pero no se pudo registrar '+file.name+'.');
      }
    }
    closeModal(); await refresh(); toast('Solicitud enviada a administración.');
  }

  async function openRequestDetail(requestId) {
    let request = state.requests.find(r=>r.id===requestId);
    if (!request) {
      const { data } = await sb.from('gx_task_requests')
        .select('*')
        .eq('id',requestId).maybeSingle();
      request = data;
    }
    if (!request) return toast('No se pudo encontrar la solicitud o no tienes acceso.');
    const [comments, attachments, legacyComments, legacyAttachments, linkedTaskResult] = await Promise.all([
      queryRows(sb.from('gx_task_request_comments').select('id,author_id,body,author_name,created_at').eq('request_id',requestId).order('created_at'), 'request comments'),
      queryRows(sb.from('gx_task_request_attachments').select('*').eq('request_id',requestId).order('created_at'), 'request attachments'),
      request.converted_task_id ? queryRows(sb.from('gx_task_comments').select('id,author_id,body,author_name,created_at').eq('task_id',request.converted_task_id).order('created_at'),'legacy task comments') : Promise.resolve([]),
      request.converted_task_id ? queryRows(sb.from('gx_task_attachments').select('*').eq('task_id',request.converted_task_id).order('created_at'),'legacy task attachments') : Promise.resolve([]),
      request.converted_task_id ? sb.from('gx_tasks').select('id,status,requester_id,assigned_to,creator_user_id,created_at').eq('id',request.converted_task_id).maybeSingle() : Promise.resolve({data:null,error:null})
    ]);
    const linkedTask=linkedTaskResult?.data||null;
    const canReviewLinkedDelivery=!!linkedTask?.creator_user_id&&linkedTask.requester_id===state.session?.user?.id&&linkedTask.status==='submitted';
    const proposalRows=canReviewLinkedDelivery
      ? await queryRows(sb.from('gx_creator_delivery_proposal_files').select('*').eq('task_id',linkedTask.id).gte('created_at',linkedTask.created_at).order('created_at'),'requester proposal files')
      : [];
    const proposalChatRows=await Promise.all(proposalRows.map(async file=>{
      const {data}=await sb.storage.from('gx-internal-task-files').createSignedUrl(file.object_path,1800);
      return {...file,signed_url:data?.signedUrl||null,uploader_name:attachmentUploaderName(file.uploaded_by,linkedTask),is_final_proposal:true};
    }));
    const requestFileRows=await Promise.all([
      ...attachments.map(async a=>{
        const {data}=await sb.storage.from('gx-internal-request-files').createSignedUrl(a.object_path,1800);
        return {...a,uploader_name:attachmentUploaderName(a.uploaded_by,request),signed_url:data?.signedUrl||null};
      }),
      ...legacyAttachments.map(async a=>{
        const {data}=await sb.storage.from('gx-internal-task-files').createSignedUrl(a.object_path,1800);
        return {...a,uploader_name:attachmentUploaderName(a.uploaded_by,request),signed_url:data?.signedUrl||null};
      })
    ]);
    const allComments=[...comments,...legacyComments];
    const chatHtml=renderChatTimeline(allComments,requestFileRows,proposalChatRows,linkedTask?.id,canReviewLinkedDelivery);
    const requester = request.requester?.display_name || 'Integrante';
    const adminNote = request.admin_note ? '<div class="gxt-status-note"><strong>Observación de administración</strong><br>'+esc(request.admin_note)+'</div>' : '';
    const targetCreator = state.creators.find(c=>c.id===request.creator_user_id);
    const targetCreatorName = targetCreator ? (targetCreator.tiktok_username || targetCreator.username || targetCreator.full_name) : '';
    openModal(request.title,'Solicitud de '+requester+' · '+dateLabel(request.created_at),
      '<section class="gxt-request-origin"><div class="gxt-section-kicker">SOLICITUD ORIGINAL</div><div class="gxt-request-meta"><span class="gxt-chip">'+esc(requestLabels[request.status]||request.status)+'</span><span class="gxt-chip">'+esc(request.urgency)+'</span><span class="gxt-chip">'+esc(request.department?.name||'Sin área')+'</span>'+(targetCreatorName?'<span class="gxt-chip">Entrega para @'+esc(targetCreatorName)+'</span>':'')+'</div><div class="gxt-request-description">'+esc(request.description||'Sin detalles adicionales.')+'</div>'+adminNote+'</section>'+
      '<section class="gxt-followup-section"><div class="gxt-followup-heading"><div><div class="gxt-section-kicker">CONVERSACIÓN</div><h3>Conversación</h3></div><span class="gxt-followup-count">'+(allComments.length+requestFileRows.length)+' elementos</span></div><div class="gxt-chat-thread">'+chatHtml+'</div><form id="gxRequestCommentForm" class="gxt-followup-composer"><div class="gxt-chat-compose"><div id="gxSelectedFiles" class="gxt-selected-files" aria-live="polite"></div><textarea name="body" maxlength="5000" placeholder="Escribe un mensaje..."></textarea><div class="gxt-chat-compose-actions"><label class="gxt-attach-btn" for="gxRequestFiles" title="Adjuntar archivos">＋</label><input id="gxRequestFiles" name="files" type="file" multiple hidden><button class="gxt-btn primary" type="submit">Enviar</button></div></div><div class="gxt-compose-hint"><small>Máximo 5 archivos · 20 MB cada uno</small></div></form></section>',true);
    const commentForm = document.getElementById('gxRequestCommentForm');
    const fileInput = document.getElementById('gxRequestFiles');
    const selectedRoot=document.getElementById('gxSelectedFiles');
    let selectedRequestFiles=[];
    function syncRequestFiles(){
      if(fileInput){const transfer=new DataTransfer();selectedRequestFiles.forEach(file=>transfer.items.add(file));fileInput.files=transfer.files;}
      if(selectedRoot)selectedRoot.innerHTML=selectedRequestFiles.length?selectedRequestFiles.map((file,index)=>'<div class="gxt-selected-file"><span>📎 '+esc(file.name)+'</span><button type="button" data-remove-request-file="'+index+'" aria-label="Quitar '+esc(file.name)+'">×</button></div>').join(''):'';
    }
    if(fileInput)fileInput.addEventListener('change',()=>{
      const merged=[...selectedRequestFiles];
      Array.from(fileInput.files||[]).forEach(file=>{if(!merged.some(existing=>existing.name===file.name&&existing.size===file.size&&existing.lastModified===file.lastModified))merged.push(file)});
      if(merged.length>5)toast('Puedes adjuntar máximo 5 archivos por publicación.');
      else if(merged.some(file=>file.size>20*1024*1024))toast('Cada archivo debe pesar máximo 20 MB.');
      else selectedRequestFiles=merged;
      syncRequestFiles();
    });
    if(selectedRoot)selectedRoot.addEventListener('click',event=>{
      const remove=event.target.closest('[data-remove-request-file]');
      if(!remove)return;
      selectedRequestFiles.splice(Number(remove.dataset.removeRequestFile),1);
      syncRequestFiles();
    });
    if (commentForm) commentForm.addEventListener('submit',async event=>{
      event.preventDefault();
      const formData=new FormData(commentForm);
      const body=String(formData.get('body')||'').trim();
      const files=[...selectedRequestFiles];
      if(!body&&!files.length)return toast('Escribe un mensaje o adjunta al menos un archivo.');
      if(files.length>5)return toast('Puedes adjuntar máximo 5 archivos por publicación.');
      if(files.some(file=>file.size>20*1024*1024))return toast('Cada archivo debe pesar máximo 20 MB.');
      if(body){
        const {error}=await sb.from('gx_task_request_comments').insert({request_id:request.id,author_id:state.session.user.id,body});
        if(error)return toast('No se pudo publicar el comentario: '+error.message);
      }
      for(const file of files){
        const safeName=file.name.replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-100);
        const objectPath=request.id+'/'+crypto.randomUUID()+'-'+safeName;
        const {error:uploadError}=await sb.storage.from('gx-internal-request-files').upload(objectPath,file,{upsert:false});
        if(uploadError)return toast('El mensaje se publicó, pero no se pudo adjuntar '+file.name+': '+uploadError.message);
        const {error:rowError}=await sb.from('gx_task_request_attachments').insert({request_id:request.id,uploaded_by:state.session.user.id,object_path:objectPath,file_name:file.name,mime_type:file.type||null,size_bytes:file.size});
        if(rowError){await sb.storage.from('gx-internal-request-files').remove([objectPath]);return toast('No se pudo registrar '+file.name+': '+rowError.message);}
      }
      if(!body&&files.length){
        const {error}=await sb.from('gx_task_request_comments').insert({request_id:request.id,author_id:state.session.user.id,body:'Adjuntó archivos: '+files.map(file=>file.name).join(', ')});
        if(error)return toast('Los archivos se adjuntaron, pero no se pudo notificar a las personas relacionadas: '+error.message);
      }
      await openRequestDetail(request.id);
      toast('Seguimiento publicado.');
    });
  }

  async function cancelTask(taskId) {
    if(!state.isAdmin)return;
    if(!confirm('¿Cancelar esta tarea? Solo se permite antes de que comience.'))return;
    const {error}=await sb.rpc('gx_admin_cancel_task',{p_task_id:taskId});
    if(error)return toast('No se pudo cancelar la tarea: '+error.message);
    await refresh();toast('Tarea cancelada.');
  }

  async function deleteTask(taskId) {
    if(!state.isAdmin)return;
    const task=state.tasks.find(item=>item.id===taskId);
    if(!task||!['pending','cancelled'].includes(task.status))return toast('Solo puedes eliminar tareas pendientes o canceladas.');
    if(!confirm('¿Eliminar definitivamente esta tarea y su historial de chat? Esta acción no se puede deshacer.'))return;
    const [attachments,proposals]=await Promise.all([
      queryRows(sb.from('gx_task_attachments').select('object_path').eq('task_id',taskId),'task files for deletion'),
      queryRows(sb.from('gx_creator_delivery_proposal_files').select('object_path').eq('task_id',taskId),'proposal files for deletion')
    ]);
    const paths=[...new Set([...attachments,...proposals].map(row=>row.object_path).filter(Boolean))];
    if(paths.length){
      const {error:storageError}=await sb.storage.from('gx-internal-task-files').remove(paths);
      if(storageError)return toast('No se pudieron retirar los archivos de la tarea: '+storageError.message);
    }
    const {error}=await sb.rpc('gx_admin_delete_task',{p_task_id:taskId});
    if(error)return toast('No se pudo eliminar la tarea: '+error.message);
    await refresh();toast('Tarea eliminada.');
  }

  async function requestAction(action, requestId) {
    const request = state.requests.find(r=>r.id===requestId);
    if (!request || !state.isAdmin) return;
    if (action === 'convert') return openConvertRequest(request);
    const nextStatus = action === 'approve' ? 'approved' : 'rejected';
    const note = action === 'reject' ? prompt('Motivo o comentario (opcional):') : null;
    const { error } = await sb.from('gx_task_requests').update({
      status: nextStatus, reviewed_by: state.session.user.id, reviewed_at: new Date().toISOString(),
      admin_note: note || null
    }).eq('id', requestId);
    if (error) return toast('No se pudo actualizar la solicitud: '+error.message);
    await refresh(); toast(action==='approve'?'Solicitud aprobada.':'Solicitud rechazada.');
  }

  function openConvertRequest(request) {
    openModal('Crear tarea desde solicitud','Asigna responsable, prioridad y fechas. Al confirmar, la solicitud se aprobará y se convertirá en tarea automáticamente.',
      '<form id="gxConvertForm"><div class="gxt-status-note">'+esc(request.title)+'</div><div class="gxt-form-grid">'+
      '<div class="gxt-field full"><label>Responsable</label><select name="assigned_to" required><option value="">Seleccionar integrante…</option>'+activeMembersOptions()+'</select></div>'+
      '<div class="gxt-field"><label>Prioridad</label><select name="priority"><option value="normal">Normal</option><option value="low">Baja</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></div>'+
      '<div class="gxt-field"><label>Fecha de inicio</label><input name="starts_at" type="datetime-local"></div>'+
      '<div class="gxt-field"><label>Fecha límite</label><input name="due_at" type="datetime-local"></div>'+
      '</div><div class="gxt-modal-actions"><button type="button" class="gxt-btn ghost" data-close-modal>Cancelar</button><button type="submit" class="gxt-btn primary">Crear tarea</button></div></form>');
    document.getElementById('gxConvertForm').addEventListener('submit', async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const { data, error } = await sb.rpc('gx_task_convert_request', {
        p_request_id: request.id,
        p_assigned_to: String(form.get('assigned_to')||''),
        p_priority: String(form.get('priority')||'normal'),
        p_starts_at: form.get('starts_at') ? new Date(form.get('starts_at')).toISOString() : null,
        p_due_at: form.get('due_at') ? new Date(form.get('due_at')).toISOString() : null
      });
      if (error) return toast('No se pudo convertir la solicitud: '+error.message);
      closeModal(); await refresh(); toast('Tarea creada y solicitud convertida.');
      if (data) openTaskDetail(data);
    });
  }

  async function openTaskDetail(taskId) {
    let task = state.tasks.find(t=>t.id===taskId);
    if (!task) {
      const { data } = await sb.from('gx_tasks').select('*').eq('id',taskId).maybeSingle();
      task = data;
    }
    if (!task) return toast('No se pudo encontrar la tarea.');
    const [taskComments, taskAttachments, activity, sharedComments, sharedAttachments, proposalFiles] = await Promise.all([
      queryRows(sb.from('gx_task_comments').select('id,author_id,body,author_name,created_at').eq('task_id',taskId).order('created_at'), 'task comments'),
      queryRows(sb.from('gx_task_attachments').select('*').eq('task_id',taskId).order('created_at'), 'task attachments'),
      queryRows(sb.from('gx_task_activity').select('id,action,details,actor_name,created_at').eq('task_id',taskId).order('created_at',{ascending:false}).limit(20), 'task activity'),
      task.source_request_id ? queryRows(sb.from('gx_task_request_comments').select('id,author_id,body,author_name,created_at').eq('request_id',task.source_request_id).order('created_at'),'shared request comments') : Promise.resolve([]),
      task.source_request_id ? queryRows(sb.from('gx_task_request_attachments').select('*').eq('request_id',task.source_request_id).order('created_at'),'shared request attachments') : Promise.resolve([]),
      task.creator_user_id ? queryRows(sb.from('gx_creator_delivery_proposal_files').select('*').eq('task_id',taskId).gte('created_at',task.reviewed_at||task.created_at).order('created_at'),'creator proposal files') : Promise.resolve([])
    ]);
    const comments=[...taskComments,...sharedComments];
    const attachments=[...taskAttachments,...sharedAttachments];
    const isAssignee = task.assigned_to === state.session.user.id;
    const canProgress = isAssignee && !['submitted','completed'].includes(task.status);
    const isRequesterForCreatorDelivery = !!task.creator_user_id && task.requester_id === state.session?.user?.id;
    const canReviewCreatorDelivery = isRequesterForCreatorDelivery && task.status === 'submitted';
    const canReviewAdminTask = state.isAdmin && !task.creator_user_id && task.status === 'submitted';
    const canReview = canReviewCreatorDelivery || canReviewAdminTask;
    const chatFileRows=await Promise.all(attachments.map(async a=>{
      const bucket=a.request_id?'gx-internal-request-files':'gx-internal-task-files';
      const {data}=await sb.storage.from(bucket).createSignedUrl(a.object_path,1800);
      return {...a,uploader_name:attachmentUploaderName(a.uploaded_by,task,a.id,activity),signed_url:data?.signedUrl||null};
    }));
    const proposalChatRows=await Promise.all(proposalFiles.map(async file=>{
      const {data}=await sb.storage.from('gx-internal-task-files').createSignedUrl(file.object_path,1800);
      return {...file,signed_url:data?.signedUrl||null,uploader_name:attachmentUploaderName(file.uploaded_by,task,file.id,activity),is_final_proposal:true};
    }));
    const chatHtml=renderChatTimeline(comments,chatFileRows,proposalChatRows,task.id,canReviewCreatorDelivery);
    const activityHtml = activity.map(a=>'<div class="gxt-comment"><strong>'+esc(a.actor_name||'Sistema')+'</strong><small>'+dateTimeLabel(a.created_at)+'</small><p>'+esc(a.action==='created'?'Creó la tarea':a.action==='status_changed'?'Cambió el estado':a.action==='comment_added'?'Añadió un comentario':a.action==='attachment_added'?'Adjuntó una evidencia':a.action==='reassigned'?'Reasignó la tarea':'Actualizó la tarea')+'</p></div>').join('');
    const progressHtml = canProgress
      ? '<form id="gxProgressForm"><div class="gxt-form-grid"><div class="gxt-field"><label>Estado</label><select name="status"><option value="in_progress" '+(task.status==='in_progress'?'selected':'')+'>En progreso</option><option value="blocked" '+(task.status==='blocked'?'selected':'')+'>Bloqueada</option>'+(!task.creator_user_id?'<option value="submitted">Entregada para revisión</option>':'')+'</select></div><div class="gxt-field full"><label>Comentario de avance (opcional)</label><textarea name="comment" placeholder="Describe lo que avanzaste o lo que necesitas comunicar."></textarea></div></div><div class="gxt-actions"><button class="gxt-btn primary" type="submit">Guardar avance</button></div></form>'
      : '';
    const reviewHtml = canReviewCreatorDelivery
      ? '<div class="gxt-status-note"><strong>La propuesta está lista.</strong><br>Revísala. Si la apruebas, el contenido se publicará en el portal del creador seleccionado.</div><div class="gxt-field"><label>Observaciones (si solicitas cambios)</label><textarea id="gxReviewFeedback" placeholder="Indica qué debe ajustarse si todavía no está lista."></textarea></div><div class="gxt-actions"><button class="gxt-btn primary" data-delivery-review="approve" data-task-id="'+task.id+'">Aprobar y enviar al creador</button><button class="gxt-btn danger" data-delivery-review="return" data-task-id="'+task.id+'">Solicitar cambios</button></div>'
      : canReviewAdminTask
        ? '<div class="gxt-status-note">El responsable entregó esta tarea. Solo administración puede aprobarla o solicitar correcciones.</div><div class="gxt-field"><label>Observaciones de revisión</label><textarea id="gxReviewFeedback" placeholder="Escribe los ajustes necesarios o una nota de aprobación."></textarea></div><div class="gxt-actions"><button class="gxt-btn primary" data-review="approve" data-task-id="'+task.id+'">Aprobar y completar</button><button class="gxt-btn danger" data-review="return" data-task-id="'+task.id+'">Solicitar correcciones</button></div>'
        : '';
    const reassignHtml = state.isAdmin
      ? '<div class="gxt-field"><label>Responsable</label><div class="gxt-actions"><select id="gxReassignSelect" style="flex:1;min-width:180px;background:#090c10;border:1px solid #343b45;border-radius:9px;color:#fff;padding:10px">'+activeMembersOptions(task.assigned_to)+'</select><button class="gxt-btn" data-reassign="'+task.id+'">Reasignar</button></div></div>'
      : '';
    openModal(task.title, 'Creada por administración · '+(task.assignee?.display_name||'Responsable'), 
      '<div class="gxt-card-meta">'+taskChip(task.status)+'<span class="gxt-chip">'+esc(priorityLabels[task.priority]||task.priority)+'</span><span class="gxt-chip">'+esc(task.department?.name||'Sin área')+'</span></div>'+
      '<section class="gxt-panel gxt-task-overview"><div class="gxt-section-kicker">RESUMEN DE LA TAREA</div><div class="gxt-task-description">'+esc(task.description||'Sin descripción adicional.')+'</div><div class="gxt-card-meta"><span class="gxt-chip">Inicio: '+dateLabel(task.starts_at)+'</span><span class="gxt-chip">Vence: '+dateLabel(task.due_at)+'</span></div>'+reassignHtml+(canReviewCreatorDelivery?'':reviewHtml)+progressHtml+'</section>'+
      '<section class="gxt-panel gxt-task-conversation"><div class="gxt-panel-head"><div><div class="gxt-section-kicker">CONVERSACIÓN DEL EQUIPO</div><h2>Seguimiento</h2></div><span class="gxt-followup-count">'+(comments.length+chatFileRows.length)+' elementos</span></div><div class="gxt-chat-thread">'+chatHtml+'</div><form id="gxCommentForm" class="gxt-followup-composer"><div class="gxt-chat-compose"><div id="gxTaskSelectedFiles" class="gxt-selected-files" aria-live="polite"></div><textarea name="body" maxlength="5000" placeholder="Escribe un mensaje o adjunta archivos..."></textarea><div class="gxt-chat-compose-actions"><label class="gxt-attach-btn" for="gxTaskFiles" title="Adjuntar archivos">＋</label><input id="gxTaskFiles" type="file" name="files" multiple hidden><button class="gxt-btn primary" type="submit" id="gxChatSendButton">Enviar</button></div></div>'+(task.creator_user_id&&isAssignee&&canProgress?'<label class="gxt-final-proposal-toggle"><input type="checkbox" id="gxChatFinalProposal"> <span><strong>Enviar como propuesta final</strong><small>Los archivos se enviarán a revisión y no quedarán como adjuntos normales del chat.</small></span></label>':'')+'<div class="gxt-compose-hint"><small>Máximo 5 archivos · 20 MB cada uno</small></div></form></section>'+
      '<section class="gxt-panel"><div class="gxt-panel-head"><h2>Historial de actividad</h2></div><div class="gxt-list">'+(activityHtml||'<div class="gxt-empty">Sin movimientos registrados.</div>')+'</div></section>',
      true
    );



    const progressForm = document.getElementById('gxProgressForm');
    if (progressForm) progressForm.addEventListener('submit', async event=>{
      event.preventDefault();
      const form = new FormData(progressForm);
      const { error } = await sb.rpc('gx_task_member_update', {
        p_task_id: task.id, p_status: String(form.get('status')), p_comment: String(form.get('comment')||'')
      });
      if (error) return toast('No se pudo actualizar el avance: '+error.message);
      closeModal(); await refresh(); toast('Avance actualizado.');
    });

    const taskFileInput=document.getElementById('gxTaskFiles');
    let selectedChatFiles=[];
    const selectedFilesRoot=document.getElementById('gxTaskSelectedFiles');
    const finalProposalToggle=document.getElementById('gxChatFinalProposal');
    const sendButton=document.getElementById('gxChatSendButton');
    function syncChatFiles(){
      if(taskFileInput){
        const transfer=new DataTransfer();
        selectedChatFiles.forEach(file=>transfer.items.add(file));
        taskFileInput.files=transfer.files;
      }
      if(selectedFilesRoot){
        selectedFilesRoot.innerHTML=selectedChatFiles.length
          ? selectedChatFiles.map((file,index)=>'<div class="gxt-selected-file"><span>📎 '+esc(file.name)+'</span><button type="button" data-remove-chat-file="'+index+'" aria-label="Quitar '+esc(file.name)+'">×</button></div>').join('')
          : '<span class="gxt-compose-hint">Puedes enviar texto, archivos o ambos.</span>';
      }
      if(sendButton)sendButton.textContent=finalProposalToggle?.checked?'Enviar propuesta':'Enviar';
    }
    if(taskFileInput)taskFileInput.addEventListener('change',()=>{
      const incoming=Array.from(taskFileInput.files||[]);
      const merged=[...selectedChatFiles];
      incoming.forEach(file=>{if(!merged.some(existing=>existing.name===file.name&&existing.size===file.size&&existing.lastModified===file.lastModified))merged.push(file)});
      if(merged.length>5){toast('Puedes adjuntar máximo 5 archivos por publicación.');}
      else if(merged.some(file=>file.size>20*1024*1024)){toast('Cada archivo debe pesar máximo 20 MB.');}
      else selectedChatFiles=merged;
      syncChatFiles();
    });
    if(finalProposalToggle)finalProposalToggle.addEventListener('change',syncChatFiles);
    if(selectedFilesRoot)selectedFilesRoot.addEventListener('click',event=>{
      const remove=event.target.closest('[data-remove-chat-file]');
      if(!remove)return;
      selectedChatFiles.splice(Number(remove.dataset.removeChatFile),1);
      syncChatFiles();
    });
    const commentForm = document.getElementById('gxCommentForm');
    if (commentForm) commentForm.addEventListener('submit', async event=>{
      event.preventDefault();
      const formData=new FormData(commentForm);
      const body=String(formData.get('body')||'').trim();
      const files=[...selectedChatFiles];
      const asFinalProposal=!!finalProposalToggle?.checked;
      if(!body&&!files.length)return toast('Escribe un mensaje o adjunta al menos un archivo.');
      if(asFinalProposal&&!files.length)return toast('Adjunta al menos un archivo para enviar la propuesta final.');
      if(files.length>5)return toast('Puedes adjuntar máximo 5 archivos por publicación.');
      if(files.some(file=>file.size>20*1024*1024))return toast('Cada archivo debe pesar máximo 20 MB.');
      if(sendButton){sendButton.disabled=true;sendButton.textContent=asFinalProposal?'Enviando propuesta...':'Enviando...';}
      const commentBody=body||(!asFinalProposal?'Adjuntó archivos: '+files.map(file=>file.name).join(', '):'Archivos adjuntos a la propuesta final.');
      const commentTable=task.source_request_id?'gx_task_request_comments':'gx_task_comments';
      const commentPayload=task.source_request_id
        ? {request_id:task.source_request_id,author_id:state.session.user.id,body:commentBody}
        : {task_id:task.id,author_id:state.session.user.id,body:commentBody};
      const {error:commentError}=await sb.from(commentTable).insert(commentPayload);
      if(commentError){if(sendButton){sendButton.disabled=false;syncChatFiles()}return toast('No se pudo publicar el mensaje: '+commentError.message);}
      for(const file of files){
        const safeName=file.name.replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-100);
        const objectPath=(asFinalProposal?task.id:(task.source_request_id||task.id))+'/'+crypto.randomUUID()+'-'+safeName;
        const bucket=asFinalProposal?'gx-internal-task-files':(task.source_request_id?'gx-internal-request-files':'gx-internal-task-files');
        const {error:uploadError}=await sb.storage.from(bucket).upload(objectPath,file,{upsert:false});
        if(uploadError){if(sendButton){sendButton.disabled=false;syncChatFiles()}return toast('No se pudo adjuntar '+file.name+': '+uploadError.message);}
        if(asFinalProposal){
          const {error:rowError}=await sb.from('gx_creator_delivery_proposal_files').insert({
            task_id:task.id,uploaded_by:state.session.user.id,object_path:objectPath,
            file_name:file.name,mime_type:file.type||null,size_bytes:file.size
          });
          if(rowError){await sb.storage.from(bucket).remove([objectPath]);if(sendButton){sendButton.disabled=false;syncChatFiles()}return toast('No se pudo registrar '+file.name+' en la propuesta: '+rowError.message);}
        }else{
          const table=task.source_request_id?'gx_task_request_attachments':'gx_task_attachments';
          const row=task.source_request_id
            ? {request_id:task.source_request_id,uploaded_by:state.session.user.id,object_path:objectPath,file_name:file.name,mime_type:file.type||null,size_bytes:file.size}
            : {task_id:task.id,uploaded_by:state.session.user.id,object_path:objectPath,file_name:file.name,mime_type:file.type||null,size_bytes:file.size};
          const {error:rowError}=await sb.from(table).insert(row);
          if(rowError){await sb.storage.from(bucket).remove([objectPath]);if(sendButton){sendButton.disabled=false;syncChatFiles()}return toast('No se pudo registrar '+file.name+': '+rowError.message);}
        }
      }
      if(asFinalProposal){
        const {error:submitError}=await sb.rpc('gx_task_member_update',{p_task_id:task.id,p_status:'submitted',p_comment:'Propuesta final enviada a revisión.'});
        if(submitError){if(sendButton){sendButton.disabled=false;syncChatFiles()}return toast('Los archivos se guardaron, pero no se pudo enviar la propuesta a revisión: '+submitError.message);}
      }
      await refresh();await openTaskDetail(task.id);
      toast(asFinalProposal?'Propuesta final enviada a revisión.':'Seguimiento publicado.');
    });

  }

  async function reviewTask(taskId, approve) {
    if (!state.isAdmin) return;
    const feedback = String(document.getElementById('gxReviewFeedback')?.value || '').trim();
    const { error } = await sb.rpc('gx_task_review', {p_task_id:taskId,p_approved:approve,p_feedback:feedback});
    if (error) return toast('No se pudo revisar la tarea: '+error.message);
    closeModal(); await refresh(); toast(approve?'Tarea aprobada y completada.':'Tarea devuelta para correcciones.');
  }

  async function reviewCreatorDelivery(taskId, approve, feedbackOverride=null) {
    const feedback = String(feedbackOverride ?? document.getElementById('gxReviewFeedback')?.value ?? '').trim();
    if (!approve && !feedback) return toast('Cuéntale al encargado qué debe corregir.');
    const { error } = await sb.rpc('gx_creator_delivery_review', {
      p_task_id:taskId,p_approved:approve,p_feedback:feedback
    });
    if (error) return toast('No se pudo procesar la propuesta: '+error.message);
    closeModal();
    await refresh();
    toast(approve?'Contenido aprobado y enviado al creador.':'La propuesta volvió al encargado para ajustes.');
  }

  async function reassignTask(taskId) {
    if (!state.isAdmin) return;
    const assigned = document.getElementById('gxReassignSelect')?.value;
    if (!assigned) return toast('Selecciona un responsable.');
    const { error } = await sb.from('gx_tasks').update({assigned_to:assigned}).eq('id',taskId);
    if (error) return toast('No se pudo reasignar: '+error.message);
    closeModal(); await refresh(); toast('Tarea reasignada.');
  }

  function openEditMember(memberId) {
    if (!state.isAdmin) return;
    const m = state.members.find(x=>x.id===memberId);
    if (!m) return;
    openModal('Editar integrante','El nivel de acceso se conserva separado del cargo y del área.',
      '<form id="gxEditMemberForm"><div class="gxt-form-grid">'+
      '<div class="gxt-field full"><label>Nombre visible</label><input name="display_name" value="'+esc(m.display_name)+'" required></div>'+
      '<div class="gxt-field"><label>Cargo</label><input name="job_title" value="'+esc(m.job_title)+'" required></div>'+
      '<div class="gxt-field"><label>Área</label><select name="department_id">'+activeDepartmentsOptions(m.department_id)+'</select></div>'+
      '<div class="gxt-field full"><label>Estado</label><select name="active"><option value="true" '+(m.active?'selected':'')+'>Activo</option><option value="false" '+(!m.active?'selected':'')+'>Inactivo</option></select></div>'+
      '</div><div class="gxt-modal-actions"><button type="button" class="gxt-btn ghost" data-close-modal>Cancelar</button><button type="submit" class="gxt-btn primary">Guardar cambios</button></div></form>');
    document.getElementById('gxEditMemberForm').addEventListener('submit',async event=>{
      event.preventDefault();
      const form=new FormData(event.currentTarget);
      const {error}=await sb.from('gx_internal_members').update({
        display_name:String(form.get('display_name')||'').trim(),
        job_title:String(form.get('job_title')||'').trim(),
        department_id:String(form.get('department_id')||'')||null,
        active:String(form.get('active'))==='true'
      }).eq('id',m.id);
      if(error)return toast('No se pudo actualizar el integrante: '+error.message);
      closeModal();await refresh();toast('Integrante actualizado.');
    });
  }

  function openNewDepartment() {
    if (!state.isAdmin) return;
    openModal('Nueva área','Las áreas son configurables y no crean nuevos roles de acceso.',
      '<form id="gxNewDepartmentForm"><div class="gxt-field"><label>Nombre del área</label><input name="name" maxlength="80" required placeholder="Ej. Producción audiovisual"></div><div class="gxt-modal-actions"><button type="button" class="gxt-btn ghost" data-close-modal>Cancelar</button><button type="submit" class="gxt-btn primary">Crear área</button></div></form>');
    document.getElementById('gxNewDepartmentForm').addEventListener('submit',async event=>{
      event.preventDefault();
      const name=String(new FormData(event.currentTarget).get('name')||'').trim();
      const slug=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
      const {error}=await sb.from('gx_departments').insert({name,slug});
      if(error)return toast('No se pudo crear el área: '+error.message);
      closeModal();await refresh();toast('Área creada.');
    });
  }

  async function toggleDepartment(id, active) {
    const {error}=await sb.from('gx_departments').update({active:!active}).eq('id',id);
    if(error)return toast('No se pudo actualizar el área: '+error.message);
    await refresh();toast(active?'Área desactivada.':'Área activada.');
  }

  async function refresh() {
    await loadData();
    renderPage();
  }

  nav.addEventListener('click',event=>{
    const button=event.target.closest('[data-tab]');
    if(!button)return;
    state.tab=button.dataset.tab;
    renderPage();
  });

  main.addEventListener('click',event=>{
    const cancel=event.target.closest('[data-cancel-task]');
    if(cancel)return cancelTask(cancel.dataset.cancelTask);
    const removeTask=event.target.closest('[data-delete-task]');
    if(removeTask)return deleteTask(removeTask.dataset.deleteTask);
    const open=event.target.closest('[data-open-task]');
    if(open)return openTaskDetail(open.dataset.openTask);
    const openRequest=event.target.closest('[data-open-request]');
    if(openRequest)return openRequestDetail(openRequest.dataset.openRequest);
    const action=event.target.closest('[data-action]');
    if(action){
      if(action.dataset.action==='new-task')return openNewTask();
      if(action.dataset.action==='new-request')return openNewRequest();
      if(action.dataset.action==='new-department')return openNewDepartment();
      if(action.dataset.action==='open-calendar'){window.location.href='./portal.html?openCalendar=1';return;}
    }
    const tab=event.target.closest('[data-tab]');
    if(tab){state.tab=tab.dataset.tab;renderPage();return}
    const req=event.target.closest('[data-request-action]');
    if(req)return requestAction(req.dataset.requestAction,req.dataset.requestId);
    const edit=event.target.closest('[data-edit-member]');
    if(edit)return openEditMember(edit.dataset.editMember);
    const toggle=event.target.closest('[data-toggle-department]');
    if(toggle)return toggleDepartment(toggle.dataset.toggleDepartment,toggle.dataset.active==='true');
  });

  modalRoot.addEventListener('click',event=>{
    if(event.target===modalRoot){closeModal();return;}
    const close=event.target.closest('[data-close-modal]');
    if(close)return closeModal();
    const download=event.target.closest('[data-download-file]');
    if(download){downloadAttachment(download.dataset.downloadFile,download.dataset.fileName,download);return;}
    const preview=event.target.closest('[data-preview-file]');
    if(preview)return openFilePreview(preview.dataset.previewFile,preview.dataset.fileName,preview.dataset.fileMime,preview.dataset.previewTaskId||null,preview.dataset.previewReview==='true');
    const previewDeliveryReview=event.target.closest('[data-preview-delivery-review]');
    if(previewDeliveryReview){
      const feedback=document.getElementById('gxPreviewReviewFeedback')?.value||'';
      const approve=previewDeliveryReview.dataset.previewDeliveryReview==='approve';
      if(!approve&&!feedback.trim())return toast('Escribe los comentarios que debe revisar el responsable.');
      return reviewCreatorDelivery(previewDeliveryReview.dataset.taskId,approve,feedback);
    }
    const deliveryReview=event.target.closest('[data-delivery-review]');
    if(deliveryReview)return reviewCreatorDelivery(deliveryReview.dataset.taskId,deliveryReview.dataset.deliveryReview==='approve');
    const review=event.target.closest('[data-review]');
    if(review)return reviewTask(review.dataset.taskId,review.dataset.review==='approve');
    const reassign=event.target.closest('[data-reassign]');
    if(reassign)return reassignTask(reassign.dataset.reassign);
  });

  init();
})();
