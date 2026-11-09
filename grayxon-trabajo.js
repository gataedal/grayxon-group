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
    tasks: [], requests: [], members: [], departments: [], activity: []
  };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const statusLabels = {
    pending:'Pendiente', in_progress:'En progreso', blocked:'Bloqueada',
    submitted:'Entregada para revisión', completed:'Completada'
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
    const taskQuery = sb.from('gx_tasks')
      .select('*,assignee:gx_internal_members!gx_tasks_assigned_to_fkey(display_name,job_title),department:gx_departments(name)')
      .order('created_at', { ascending: false });
    const requestQuery = sb.from('gx_task_requests')
      .select('*,requester:gx_internal_members!gx_task_requests_requester_id_fkey(display_name,job_title),department:gx_departments(name)')
      .order('created_at', { ascending: false });
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

    const [tasks, requests, members, departments, activity] = await Promise.all([
      queryRows(taskQuery, 'tasks'),
      queryRows(requestQuery, 'requests'),
      queryRows(memberQuery, 'members'),
      queryRows(departmentQuery, 'departments'),
      queryRows(activityQuery, 'activity')
    ]);
    state.tasks = tasks;
    state.requests = requests;
    state.members = members;
    state.departments = departments;
    state.activity = activity;
  }

  function handleNotificationTarget() {
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get('task');
    const requestId = params.get('request');
    if (taskId && state.tasks.some(t => t.id === taskId)) {
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
    return '<button type="button" class="gxt-card" data-open-task="'+task.id+'" style="text-align:left;color:inherit;width:100%">'+
      '<div class="gxt-card-top"><div><h3>'+esc(task.title)+'</h3><p>'+esc(task.description || 'Sin descripción adicional.')+'</p></div>'+taskChip(task.status)+'</div>'+
      '<div class="gxt-card-meta"><span class="gxt-chip">'+esc(priorityLabels[task.priority] || task.priority)+'</span>'+
      (state.isAdmin?'<span class="gxt-chip">'+esc(assignee)+'</span>':'')+
      '<span class="gxt-chip">'+esc(task.department?.name || 'Sin área')+'</span><span class="gxt-chip">'+esc(due)+'</span></div></button>';
  }

  function requestCard(request) {
    const requester = request.requester?.display_name || 'Integrante';
    let actions = '';
    if (state.isAdmin && request.status === 'pending') {
      actions = '<div class="gxt-actions"><button class="gxt-btn" data-request-action="approve" data-request-id="'+request.id+'">Aprobar</button><button class="gxt-btn danger" data-request-action="reject" data-request-id="'+request.id+'">Rechazar</button></div>';
    } else if (state.isAdmin && request.status === 'approved') {
      actions = '<div class="gxt-actions"><button class="gxt-btn primary" data-request-action="convert" data-request-id="'+request.id+'">Convertir en tarea</button></div>';
    }
    return '<article id="gx-request-'+request.id+'" data-request-id="'+request.id+'" class="gxt-card"><div class="gxt-card-top"><div><h3>'+esc(request.title)+'</h3><p>'+esc(request.description || 'Sin detalles adicionales.')+'</p></div><span class="gxt-chip">'+esc(requestLabels[request.status] || request.status)+'</span></div>'+
      '<div class="gxt-card-meta"><span class="gxt-chip">'+esc(request.urgency)+'</span><span class="gxt-chip">'+esc(request.department?.name || 'Sin área')+'</span>'+
      (state.isAdmin?'<span class="gxt-chip">Solicitó: '+esc(requester)+'</span>':'')+
      '<span class="gxt-chip">'+dateLabel(request.created_at)+'</span></div>'+
      '<div class="gxt-actions"><button type="button" class="gxt-btn ghost" data-open-request="'+request.id+'">Ver solicitud y comentarios</button></div>'+actions+'</article>';
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
    const requestList = state.isAdmin
      ? requests.filter(r=>r.status==='pending').slice(0,4).map(requestCard).join('') || '<div class="gxt-empty">No hay solicitudes pendientes.</div>'
      : requests.slice(0,3).map(requestCard).join('') || '<div class="gxt-empty">Aún no has enviado solicitudes.</div>';
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
      '<section class="gxt-panel"><div class="gxt-panel-head"><h2>'+(state.isAdmin?'Solicitudes pendientes':'Mis solicitudes')+'</h2><button class="gxt-btn ghost" data-tab="requests">Ver solicitudes</button></div><div class="gxt-list">'+requestList+'</div></section>'+
      '<div class="gxt-status-note">Las tareas solo se consideran completadas cuando administración aprueba la entrega. Las solicitudes no se convierten en tareas hasta que administración lo decide.</div>';
  }

  function renderTasksPage() {
    const list = state.tasks.map(taskCard).join('') || '<div class="gxt-empty">No hay tareas para mostrar.</div>';
    main.innerHTML = pageHead(state.isAdmin?'Todas las tareas':'Mi trabajo',state.isAdmin?'Consulta y administra las tareas de todo el equipo.':'Consulta tus tareas, actualiza avances y entrega resultados para revisión.',state.isAdmin?'<button class="gxt-btn primary" data-action="new-task">＋ Crear tarea</button>':'')+
      '<section class="gxt-panel"><div class="gxt-panel-head"><h2>'+state.tasks.length+' tareas</h2><small>Ordenadas por creación</small></div><div class="gxt-list">'+list+'</div></section>';
  }

  function renderRequestsPage() {
    const list = state.requests.map(requestCard).join('') || '<div class="gxt-empty">No hay solicitudes para mostrar.</div>';
    main.innerHTML = pageHead(state.isAdmin?'Solicitudes del equipo':'Mis solicitudes',state.isAdmin?'Revisa, aprueba, rechaza o convierte las solicitudes en tareas.':'Envía solicitudes al administrador y consulta únicamente las que tú has creado.', '<button class="gxt-btn primary" data-action="new-request">＋ Nueva solicitud</button>')+
      '<section class="gxt-panel"><div class="gxt-panel-head"><h2>'+state.requests.length+' solicitudes</h2></div><div class="gxt-list">'+list+'</div></section>';
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
      urgency: String(form.get('urgency')||'normal')
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
        .select('*,requester:gx_internal_members!gx_task_requests_requester_id_fkey(display_name,job_title),department:gx_departments(name)')
        .eq('id',requestId).maybeSingle();
      request = data;
    }
    if (!request) return toast('No se pudo encontrar la solicitud o no tienes acceso.');
    const [comments, attachments] = await Promise.all([
      queryRows(sb.from('gx_task_request_comments').select('id,body,author_name,created_at').eq('request_id',requestId).order('created_at'), 'request comments'),
      queryRows(sb.from('gx_task_request_attachments').select('*').eq('request_id',requestId).order('created_at'), 'request attachments')
    ]);
    const attachmentHtml = await Promise.all(attachments.map(async a=>{
      const { data } = await sb.storage.from('gx-internal-request-files').createSignedUrl(a.object_path,1800,{download:a.file_name});
      return '<div class="gxt-comment"><strong>📎 '+esc(a.file_name)+'</strong><small>'+dateTimeLabel(a.created_at)+'</small>'+(data?.signedUrl?'<p><a href="'+esc(data.signedUrl)+'" target="_blank" rel="noopener">Abrir</a> · <a href="'+esc(data.signedUrl)+'">Descargar '+esc(a.file_name)+'</a></p>':'<p>No fue posible generar el enlace del archivo.</p>')+'</div>';
    }));
    const commentHtml = comments.map(c=>'<div class="gxt-comment"><strong>'+esc(c.author_name||'Integrante')+'</strong><small>'+dateTimeLabel(c.created_at)+'</small><p>'+esc(c.body)+'</p></div>').join('') || '<div class="gxt-empty">Todavía no hay comentarios.</div>';
    const requester = request.requester?.display_name || 'Integrante';
    const adminNote = request.admin_note ? '<div class="gxt-status-note"><strong>Observación de administración</strong><br>'+esc(request.admin_note)+'</div>' : '';
    openModal(request.title,'Solicitud de '+requester+' · '+dateLabel(request.created_at),
      '<div class="gxt-card-meta"><span class="gxt-chip">'+esc(requestLabels[request.status]||request.status)+'</span><span class="gxt-chip">'+esc(request.urgency)+'</span><span class="gxt-chip">'+esc(request.department?.name||'Sin área')+'</span></div>'+
      '<section class="gxt-panel"><p>'+esc(request.description||'Sin detalles adicionales.')+'</p>'+adminNote+'</section>'+
      '<section class="gxt-panel"><div class="gxt-panel-head"><h2>Seguimiento</h2></div><div class="gxt-list">'+commentHtml+(attachmentHtml.join('')||'')+'</div><form id="gxRequestCommentForm" style="margin-top:12px"><div class="gxt-field"><label>Mensaje (opcional si adjuntas archivos)</label><textarea name="body" maxlength="5000" placeholder="Escribe una actualización o respuesta."></textarea></div><div class="gxt-field"><label>Adjuntar archivos o imágenes</label><input name="files" type="file" multiple><small class="gxt-hint">Hasta 5 archivos, máximo 20 MB cada uno. Se conserva el formato original.</small></div><button class="gxt-btn primary" type="submit">Publicar en seguimiento</button></form></section>',true);
    const commentForm = document.getElementById('gxRequestCommentForm');
    if (commentForm) commentForm.addEventListener('submit',async event=>{
      event.preventDefault();
      const formData=new FormData(commentForm);
      const body=String(formData.get('body')||'').trim();
      const files=formData.getAll('files').filter(file=>file instanceof File&&file.size>0);
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
    openModal('Convertir solicitud en tarea','La solicitud pasará a tarea únicamente después de esta decisión administrativa.',
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
      closeModal(); await refresh(); toast('Solicitud convertida en tarea.');
      if (data) openTaskDetail(data);
    });
  }

  async function openTaskDetail(taskId) {
    let task = state.tasks.find(t=>t.id===taskId);
    if (!task) {
      const { data } = await sb.from('gx_tasks').select('*,assignee:gx_internal_members!gx_tasks_assigned_to_fkey(display_name,job_title),department:gx_departments(name)').eq('id',taskId).maybeSingle();
      task = data;
    }
    if (!task) return toast('No se pudo encontrar la tarea.');
    const [taskComments, taskAttachments, activity, sharedComments, sharedAttachments] = await Promise.all([
      queryRows(sb.from('gx_task_comments').select('id,body,author_name,created_at').eq('task_id',taskId).order('created_at'), 'task comments'),
      queryRows(sb.from('gx_task_attachments').select('*').eq('task_id',taskId).order('created_at'), 'task attachments'),
      queryRows(sb.from('gx_task_activity').select('id,action,details,actor_name,created_at').eq('task_id',taskId).order('created_at',{ascending:false}).limit(20), 'task activity'),
      task.source_request_id ? queryRows(sb.from('gx_task_request_comments').select('id,body,author_name,created_at').eq('request_id',task.source_request_id).order('created_at'),'shared request comments') : Promise.resolve([]),
      task.source_request_id ? queryRows(sb.from('gx_task_request_attachments').select('*').eq('request_id',task.source_request_id).order('created_at'),'shared request attachments') : Promise.resolve([])
    ]);
    const comments=[...taskComments,...sharedComments].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
    const attachments=[...taskAttachments,...sharedAttachments].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
    const isAssignee = task.assigned_to === state.session.user.id;
    const canProgress = !state.isAdmin && isAssignee && !['submitted','completed'].includes(task.status);
    const canReview = state.isAdmin && task.status === 'submitted';
    const attachmentHtml = await Promise.all(attachments.map(async a=>{
      const bucket=a.request_id?'gx-internal-request-files':'gx-internal-task-files';
      const { data } = await sb.storage.from(bucket).createSignedUrl(a.object_path,1800,{download:a.file_name});
      return '<div class="gxt-comment"><strong>📎 '+esc(a.file_name)+'</strong><small>'+dateTimeLabel(a.created_at)+'</small>'+(data?.signedUrl?'<p><a href="'+esc(data.signedUrl)+'" target="_blank" rel="noopener">Abrir</a> · <a href="'+esc(data.signedUrl)+'">Descargar '+esc(a.file_name)+'</a></p>':'')+'</div>';
    }));
    const commentHtml = comments.map(c=>'<div class="gxt-comment"><strong>'+esc(c.author_name||'Integrante')+'</strong><small>'+dateTimeLabel(c.created_at)+'</small><p>'+esc(c.body)+'</p></div>').join('') || '<div class="gxt-empty">Todavía no hay comentarios.</div>';
    const activityHtml = activity.map(a=>'<div class="gxt-comment"><strong>'+esc(a.actor_name||'Sistema')+'</strong><small>'+dateTimeLabel(a.created_at)+'</small><p>'+esc(a.action==='created'?'Creó la tarea':a.action==='status_changed'?'Cambió el estado':a.action==='comment_added'?'Añadió un comentario':a.action==='attachment_added'?'Adjuntó una evidencia':a.action==='reassigned'?'Reasignó la tarea':'Actualizó la tarea')+'</p></div>').join('');
    const progressHtml = canProgress
      ? '<form id="gxProgressForm"><div class="gxt-form-grid"><div class="gxt-field"><label>Estado</label><select name="status"><option value="in_progress" '+(task.status==='in_progress'?'selected':'')+'>En progreso</option><option value="blocked" '+(task.status==='blocked'?'selected':'')+'>Bloqueada</option><option value="submitted">Entregada para revisión</option></select></div><div class="gxt-field full"><label>Comentario de avance (opcional)</label><textarea name="comment" placeholder="Describe lo que avanzaste o lo que entregas."></textarea></div></div><div class="gxt-actions"><button class="gxt-btn primary" type="submit">Guardar avance</button></div></form>'
      : '';
    const reviewHtml = canReview
      ? '<div class="gxt-status-note">El responsable entregó esta tarea. Solo administración puede aprobarla o solicitar correcciones.</div><div class="gxt-field"><label>Observaciones de revisión</label><textarea id="gxReviewFeedback" placeholder="Escribe los ajustes necesarios o una nota de aprobación."></textarea></div><div class="gxt-actions"><button class="gxt-btn primary" data-review="approve" data-task-id="'+task.id+'">Aprobar y completar</button><button class="gxt-btn danger" data-review="return" data-task-id="'+task.id+'">Solicitar correcciones</button></div>'
      : '';
    const reassignHtml = state.isAdmin
      ? '<div class="gxt-field"><label>Responsable</label><div class="gxt-actions"><select id="gxReassignSelect" style="flex:1;min-width:180px;background:#090c10;border:1px solid #343b45;border-radius:9px;color:#fff;padding:10px">'+activeMembersOptions(task.assigned_to)+'</select><button class="gxt-btn" data-reassign="'+task.id+'">Reasignar</button></div></div>'
      : '';
    openModal(task.title, 'Creada por administración · '+(task.assignee?.display_name||'Responsable'), 
      '<div class="gxt-card-meta">'+taskChip(task.status)+'<span class="gxt-chip">'+esc(priorityLabels[task.priority]||task.priority)+'</span><span class="gxt-chip">'+esc(task.department?.name||'Sin área')+'</span></div>'+
      '<section class="gxt-panel"><p>'+esc(task.description||'Sin descripción adicional.')+'</p><div class="gxt-card-meta"><span class="gxt-chip">Inicio: '+dateLabel(task.starts_at)+'</span><span class="gxt-chip">Vence: '+dateLabel(task.due_at)+'</span></div>'+reassignHtml+reviewHtml+progressHtml+'</section>'+
      '<section class="gxt-panel"><div class="gxt-panel-head"><h2>Seguimiento</h2></div><div class="gxt-list">'+commentHtml+(attachmentHtml.join('')||'')+'</div><form id="gxCommentForm" style="margin-top:12px"><div class="gxt-field"><label>Mensaje (opcional si adjuntas archivos)</label><textarea name="body" maxlength="5000" placeholder="Escribe una actualización o respuesta."></textarea></div><div class="gxt-field"><label>Adjuntar archivos o imágenes</label><input type="file" name="files" multiple><small class="gxt-hint">Hasta 5 archivos, máximo 20 MB cada uno. Se conserva el formato original.</small></div><button class="gxt-btn" type="submit">Publicar en seguimiento</button></form></section>'+
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

    const commentForm = document.getElementById('gxCommentForm');
    if (commentForm) commentForm.addEventListener('submit', async event=>{
      event.preventDefault();
      const formData=new FormData(commentForm);
      const body=String(formData.get('body')||'').trim();
      const files=formData.getAll('files').filter(file=>file instanceof File&&file.size>0);
      if(!body&&!files.length)return toast('Escribe un mensaje o adjunta al menos un archivo.');
      if(files.length>5)return toast('Puedes adjuntar máximo 5 archivos por publicación.');
      if(files.some(file=>file.size>20*1024*1024))return toast('Cada archivo debe pesar máximo 20 MB.');
      if(task.source_request_id){
        if(body){
          const {error}=await sb.from('gx_task_request_comments').insert({request_id:task.source_request_id,author_id:state.session.user.id,body});
          if(error)return toast('No se pudo publicar: '+error.message);
        }
      }else if(body){
        const {error}=await sb.from('gx_task_comments').insert({task_id:task.id,author_id:state.session.user.id,body});
        if(error)return toast('No se pudo publicar: '+error.message);
      }
      for(const file of files){
        const safeName=file.name.replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-100);
        const objectPath=(task.source_request_id||task.id)+'/'+crypto.randomUUID()+'-'+safeName;
        const bucket=task.source_request_id?'gx-internal-request-files':'gx-internal-task-files';
        const {error:uploadError}=await sb.storage.from(bucket).upload(objectPath,file,{upsert:false});
        if(uploadError)return toast('No se pudo adjuntar '+file.name+': '+uploadError.message);
        const table=task.source_request_id?'gx_task_request_attachments':'gx_task_attachments';
        const row=task.source_request_id
          ? {request_id:task.source_request_id,uploaded_by:state.session.user.id,object_path:objectPath,file_name:file.name,mime_type:file.type||null,size_bytes:file.size}
          : {task_id:task.id,uploaded_by:state.session.user.id,object_path:objectPath,file_name:file.name,mime_type:file.type||null,size_bytes:file.size};
        const {error:rowError}=await sb.from(table).insert(row);
        if(rowError){await sb.storage.from(bucket).remove([objectPath]);return toast('No se pudo registrar '+file.name+': '+rowError.message);}
      }
      if(task.source_request_id&&!body&&files.length){
        const {error}=await sb.from('gx_task_request_comments').insert({request_id:task.source_request_id,author_id:state.session.user.id,body:'Adjuntó archivos: '+files.map(file=>file.name).join(', ')});
        if(error)return toast('Los archivos se adjuntaron, pero no se pudo notificar al equipo: '+error.message);
      }
      await openTaskDetail(task.id); toast('Seguimiento publicado.');
    });


  }

  async function reviewTask(taskId, approve) {
    if (!state.isAdmin) return;
    const feedback = String(document.getElementById('gxReviewFeedback')?.value || '').trim();
    const { error } = await sb.rpc('gx_task_review', {p_task_id:taskId,p_approved:approve,p_feedback:feedback});
    if (error) return toast('No se pudo revisar la tarea: '+error.message);
    closeModal(); await refresh(); toast(approve?'Tarea aprobada y completada.':'Tarea devuelta para correcciones.');
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
    const review=event.target.closest('[data-review]');
    if(review)return reviewTask(review.dataset.taskId,review.dataset.review==='approve');
    const reassign=event.target.closest('[data-reassign]');
    if(reassign)return reassignTask(reassign.dataset.reassign);
  });

  init();
})();
