(() => {
  const cfg = window.GRAYXON_CONFIG;
  const root = document.getElementById('gxApp');
  const login = document.getElementById('gxLogin');
  const main = document.getElementById('gxMain');
  const nav = document.getElementById('gxNav');
  const modalRoot = document.getElementById('gxModalRoot');
  const toastEl = document.getElementById('gxToast');

  if (!window.supabase || !cfg?.SUPABASE_URL || !cfg?.SUPABASE_PUBLISHABLE_KEY) {
    document.getElementById('gxLoginError').textContent = 'No se pudo iniciar Gestión. Recarga la página.';
    return;
  }

  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  const state = {
    session: null, member: null, isAdmin: false, isManager: false, tab: 'home', followupStep: 0,
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
      console.error('[Gestión Grayxon] membership lookup', error);
      showAccessMessage('No se pudo validar tu acceso en este momento. Vuelve al portal e inténtalo nuevamente.');
      return;
    }
    if (data && data.active === true) {
      state.member = data;
      state.isAdmin = data.access_level === 'admin';
      state.isManager = false;
      document.getElementById('gxUserName').textContent = data.display_name || user.email || 'Equipo Grayxon';
      document.getElementById('gxUserJob').textContent = [data.job_title, data.department?.name].filter(Boolean).join(' · ');
      document.getElementById('gxAccessBadge').textContent = state.isAdmin ? 'Administración' : 'Operativo';
      setAuthView(true);
      await loadData();
      renderNav();
      renderPage();
      handleNotificationTarget();
      return;
    }

    // Managers use a separate, least-privilege entry path. Their profile and
    // linked managers row must both be active and point to the same auth user.
    const { data: profile, error: profileError } = await sb
      .from('profiles')
      .select('id,role,active,manager_id,full_name')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) {
      console.error('[Gestión Grayxon] manager profile lookup', profileError);
      showAccessMessage('No se pudo validar tu acceso de manager. Inténtalo nuevamente.');
      return;
    }
    if (profile?.role !== 'manager' || profile.active !== true || !profile.manager_id) {
      showAccessMessage('Esta cuenta no tiene acceso a Gestión. Si consideras que es un error, comunícate con administración.');
      return;
    }
    const { data: managerRow, error: managerError } = await sb
      .from('managers')
      .select('id,user_id,name,active')
      .eq('id', profile.manager_id)
      .eq('user_id', user.id)
      .eq('active', true)
      .maybeSingle();
    if (managerError || !managerRow) {
      if (managerError) console.error('[Gestión Grayxon] manager record lookup', managerError);
      showAccessMessage('No se pudo confirmar el registro activo de este manager.');
      return;
    }

    state.member = {
      id: managerRow.id, user_id: user.id, display_name: managerRow.name || profile.full_name || user.email,
      access_level: 'manager', active: true
    };
    state.isAdmin = false;
    state.isManager = true;
    state.tab = 'followup';
    document.getElementById('gxUserName').textContent = state.member.display_name;
    document.getElementById('gxUserJob').textContent = 'Manager · Seguimiento de creadores';
    document.getElementById('gxAccessBadge').textContent = 'Manager';
    setAuthView(true);
    // Deliberately do not load internal gx_tasks, requests, staff, departments,
    // activity or calendar for manager accounts.
    renderNav();
    renderPage();
  }

  async function init() {
    const { data, error } = await sb.auth.getSession();
    if (error) console.warn('[Gestión Grayxon] session', error.message);
    state.session = data?.session || null;
    if (state.session) await loadMember();
    else showAccessMessage('Para entrar a Gestión, primero inicia sesión en el portal Grayxon con tu cuenta habitual.');

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
      console.warn('[Gestión Grayxon] ' + label, error.message);
      return [];
    }
    return data || [];
  }

  async function loadData() {
    if (state.isManager) return;
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
    const items = state.isManager
      ? [['followup','◎','Seguimiento'],['reports','▥','Reportes']]
      : state.isAdmin
        ? [
            ['home','⌂','Resumen'],['tasks','▤','Tareas'],['requests','↗','Solicitudes'],['followup','◎','Seguimiento'],['reports','▥','Reportes'],
            ['team','♙','Equipo'],['departments','▦','Áreas y cargos'],['activity','◷','Actividad'],['calendar','▦','Calendario']
          ]
        : [
            ['home','⌂','Resumen'],['tasks','▤','Tareas'],['requests','↗','Solicitudes'],['followup','◎','Seguimiento'],['reports','▥','Reportes'],
            ['calendar','▦','Calendario']
          ];
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
    const title = state.isAdmin ? 'Resumen operativo' : 'Resumen de gestión';
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
    main.innerHTML = pageHead(state.isAdmin?'Todas las tareas':'Mis tareas',state.isAdmin?'Consulta y administra las tareas de todo el equipo.':'Consulta tus tareas, actualiza avances y entrega resultados para revisión.',state.isAdmin?'<button class="gxt-btn primary" data-action="new-task">＋ Crear tarea</button>':'')+
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

  async function refreshGeneralReportReadiness(){
    const button=main.querySelector('[data-generate-general-report]');
    const status=document.getElementById('gxGeneralReportStatus');
    if(!button||!state.isManager)return;
    const creators=followupCreatorCache||[];
    const plans=window.gxFollowupPlans||[];
    const month=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit'}).format(new Date());
    const notes=window.gxFollowupNotes||[];
    const missing=creators.filter(creator=>!plans.some(plan=>plan.creator_user_id===creator.id&&plan.status!=='cancelled'&&String(plan.created_at||'').slice(0,7)===month)&&!notes.some(note=>note.creator_user_id===creator.id&&String(note.created_at||'').slice(0,7)===month));
    const ready=creators.length>0&&missing.length===0;
    button.disabled=creators.length===0;
    button.textContent='Generar informe general';
    if(status)status.textContent=!creators.length?'No hay creadores activos asignados a tu equipo.':'Informe disponible: '+(creators.length-missing.length)+' de '+creators.length+' creadores con gestión registrada. '+missing.length+' pendientes. La información se actualiza con cada registro.';
    button.title='Actualizar el informe con la información disponible del equipo';
  }

  async function generateGeneralFollowupReport(){
    const button=main.querySelector('[data-generate-general-report]');
    if(!button||button.disabled)return;
    button.disabled=true;
    button.textContent='Generando…';
    const {data,error}=await sb.rpc('gx_manager_generate_general_followup_report');
    if(error){
      toast('No se pudo generar el informe: '+error.message);
      await refreshGeneralReportReadiness();
      button.textContent='Generar informe general';
      return;
    }
    toast('Informe general enviado a Reportes.');
    button.textContent='Informe generado';
    await refreshGeneralReportReadiness();
  }

  function renderFollowupPage() {
    main.innerHTML = pageHead('Seguimiento de creadores','Evaluaciones por periodo, novedades internas y planes de acción del equipo.',state.isManager?'<button type="button" class="gxt-btn primary" data-generate-general-report disabled>Generar informe general</button>':'')+
      '<section class="gxt-panel gxt-followup-import"><div class="gxt-panel-head"><div><h2>Importar reporte de TikTok LIVE</h2><p>Sube el Excel. El periodo se detecta automáticamente desde el reporte.</p></div><span class="gxt-chip">Vista previa</span></div>'+
      '<div class="gxt-followup-upload-controls"><label class="gxt-field"><span>Archivo Excel</span><input id="gxFollowupFile" type="file" accept=".xlsx,.xls"></label><button type="button" class="gxt-btn gxt-btn-process" data-followup-preview '+(followupImportFile?'':'disabled')+'><span aria-hidden="true">↗</span> Analizar archivo</button></div>'+
      '<div id="gxFollowupFileName" class="gxt-muted gxt-followup-file-name">'+(followupImportFile?esc(followupImportFile.name):'Ningún archivo seleccionado')+'</div>'+'<div class="gxt-followup-rules"><div><strong>Metas mensuales</strong><span>90 horas LIVE · 22 días válidos</span></div><div><strong>Recomendación de constancia</strong><span>2 h 30 min diarios · 6 días por semana</span></div></div>'+
      '<div id="gxFollowupPreview" class="gxt-followup-preview">'+(followupPreviewMarkup||'<div class="gxt-status-note">Selecciona un Excel para analizarlo. El periodo se tomará automáticamente del archivo.</div>')+'</div></section>'+
      
      (state.isManager?'<section class="gxt-panel"><div class="gxt-panel-head"><h2>Informe general del equipo</h2></div><p id="gxGeneralReportStatus" class="gxt-muted">Comprobando si todos tus creadores tienen un plan o una novedad registrada…</p></section>':'')+
      '<section class="gxt-panel" id="gxFollowupHistory"><div class="gxt-panel-head"><h2>Historial de evaluaciones</h2></div><div class="gxt-empty">Cargando historial…</div></section>'+
      '<section class="gxt-panel gxt-followup-workspace" id="gxFollowupWorkspaceSection" hidden><div class="gxt-panel-head"><div><h2 id="gxFollowupCreatorTitle">Plan de trabajo</h2><p id="gxFollowupCreatorSubtitle">Seguimiento individual del creador.</p></div><div class="gxt-actions"><button type="button" class="gxt-btn ghost" data-followup-back>← Atrás</button><button type="button" class="gxt-btn ghost" data-followup-close>× Cerrar</button></div></div>'+
      '<select hidden id="gxFollowupCreator" aria-hidden="true"></select>'+
      ''+
      '<div class="gxt-followup-workspace-grid">'+
      '<div id="gxFollowupPlanPreview" class="gxt-followup-workspace-card" hidden></div><div id="gxFollowupSavedPlanActions" class="gxt-actions" hidden><button type="button" class="gxt-btn danger" data-followup-delete-plan>Eliminar plan</button><button type="button" class="gxt-btn primary" data-followup-send-plan>Enviar</button><button type="button" class="gxt-btn primary" data-followup-open-progress>Registrar avance</button></div><form id="gxActionPlanForm" class="gxt-followup-workspace-card is-active" data-followup-step="0"><h3>Plan de trabajo del creador</h3><input type="hidden" name="plan_id"><label class="gxt-field"><span>Nombre del plan</span><input name="title" maxlength="180" required placeholder="Ej. Objetivos de diciembre"></label><label class="gxt-field"><span>Objetivo / acuerdos</span><textarea name="objective" maxlength="5000" required placeholder="Define qué debe lograr el creador durante este periodo."></textarea></label><div class="gxt-followup-date-grid"><label class="gxt-field"><span>Desde</span><input name="start_date" type="date" required></label><label class="gxt-field"><span>Hasta</span><input name="target_date" type="date" required></label></div><h4>Metas del periodo</h4><div class="gxt-followup-target-grid"><label class="gxt-field"><span>Diamantes</span><input name="diamonds" type="number" min="0" step="1" placeholder="Meta"></label><label class="gxt-field"><span>Horas LIVE</span><input name="live_hours" type="number" min="0" step="0.25" placeholder="Meta"></label><label class="gxt-field"><span>Días válidos</span><input name="valid_days" type="number" min="0" step="1" placeholder="Meta"></label><label class="gxt-field"><span>Batallas</span><input name="battles" type="number" min="0" step="1" placeholder="Meta"></label><label class="gxt-field"><span>Miembros del club de fans</span><input name="fan_club_members" type="number" min="0" step="1" placeholder="Meta"></label></div><div class="gxt-followup-reminder-inline"><h4>Recordatorio del plan</h4><p class="gxt-muted">Puedes dejarlo programado desde aquí, sin pasar a otra sección.</p><label class="gxt-field"><span>Fecha y hora (Colombia)</span><input name="reminder_at" type="datetime-local"></label><label class="gxt-field"><span>Nota del recordatorio</span><input name="reminder_note" maxlength="2000" placeholder="Ej. Revisar avances a mitad del periodo"></label></div><button class="gxt-btn primary" type="submit">Guardar plan de trabajo</button></form>'+
      '<form id="gxActionPlanUpdateForm" class="gxt-followup-workspace-card" data-followup-step="1" hidden><h3>Registrar avance del plan</h3><p class="gxt-muted" id="gxFollowupPlanStatus">Primero debes crear un plan para habilitar los avances.</p><input type="hidden" name="plan_id"><div class="gxt-followup-target-grid"><label class="gxt-field"><span>Diamantes alcanzados</span><input name="diamonds" type="number" min="0" step="1"></label><label class="gxt-field"><span>Horas LIVE acumuladas</span><input name="live_hours" type="number" min="0" step="0.25"></label><label class="gxt-field"><span>Días válidos</span><input name="valid_days" type="number" min="0" step="1"></label><label class="gxt-field"><span>Batallas realizadas</span><input name="battles" type="number" min="0" step="1"></label><label class="gxt-field"><span>Miembros del club de fans</span><input name="fan_club_members" type="number" min="0" step="1"></label></div><label class="gxt-field"><span>Resumen del avance</span><textarea name="progress_summary" maxlength="5000" required></textarea></label><label class="gxt-field"><span>Observaciones / acuerdos</span><textarea name="proposed_changes" maxlength="5000" placeholder="Deja observaciones sobre el avance, compromisos o ajustes necesarios."></textarea></label><label class="gxt-field"><span>Estado</span><select name="plan_status"><option value="active">En curso</option><option value="paused">Pausado</option><option value="completed">Completado</option><option value="cancelled">Cancelado</option></select></label><button class="gxt-btn primary" type="submit" disabled>Guardar avance</button></form>'+
      '</div>'+
      '<div id="gxFollowupOperations" class="gxt-followup-operations"><div class="gxt-empty">Cargando registros…</div></div></section>';    loadFollowupHistory();
    loadFollowupWorkspace();
    const fileInput=document.getElementById('gxFollowupFile');
    const button=main.querySelector('[data-followup-preview]');
    fileInput?.addEventListener('change',()=>{
      followupImportFile=fileInput.files?.[0]||null;
      document.getElementById('gxFollowupFileName').textContent=followupImportFile?followupImportFile.name:'Ningún archivo seleccionado';
      button.disabled=!followupImportFile;
      followupPreviewMarkup='';
      const previewTarget=document.getElementById('gxFollowupPreview');
      if(previewTarget)previewTarget.innerHTML='<div class="gxt-status-note">Archivo seleccionado. Pulsa “Analizar archivo” para revisar sus datos.</div>';
    });
    bindFollowupPreviewActions(document.getElementById('gxFollowupPreview'));
  }

  async function previewFollowupImport() {
    const target=document.getElementById('gxFollowupPreview');
    const file=followupImportFile||document.getElementById('gxFollowupFile')?.files?.[0]||window.grayxonFollowupFile;
    if(!file)return toast('Selecciona primero el Excel de TikTok.');
    if(!window.XLSX||!window.GRAYXON_FOLLOWUP_IMPORT)return toast('No está disponible el lector de Excel. Recarga la página e inténtalo nuevamente.');
    target.innerHTML='<div class="gxt-status-note">Leyendo el archivo y validando los datos…</div>';
    try{
      const buffer=await file.arrayBuffer();
      const workbook=window.XLSX.read(buffer,{type:'array',cellDates:true});
      const preview=window.GRAYXON_FOLLOWUP_IMPORT.parseWorkbook(workbook);
      const [{data:creatorData,error:creatorError},{data:parameterRows,error:parameterError}]=await Promise.all([
        sb.from('profiles').select('id,username,full_name,tiktok_username,tiktok_creator_id,manager_id,created_at,active').eq('role','creator'),
        sb.from('gx_creator_followup_parameters').select('version,monthly_live_hours,monthly_valid_days,early_review_min_evaluable_days,high_risk_threshold_pct,observation_threshold_pct,consistency_hours_per_day,consistency_days_per_week,timezone').eq('active',true).order('version',{ascending:false}).limit(1)
      ]);
      if(creatorError)throw new Error('No se pudieron consultar los creadores autorizados: '+creatorError.message);
      if(parameterError)throw new Error('No se pudieron cargar los parámetros de evaluación: '+parameterError.message);
      const activeParameters=parameterRows?.[0];
      if(!activeParameters)throw new Error('No hay parámetros activos de Seguimiento. Solicita a administración que los configure.');
      preview.parameters=activeParameters;
      const byTikTok=new Map(), byCreatorId=new Map();
      const addIndex=(map,key,creator)=>{
        if(!key)return;
        const normalized=String(key).replace(/^@/,'').trim().toLowerCase();
        if(!normalized)return;
        const list=map.get(normalized)||[];
        if(!list.some(item=>item.id===creator.id))list.push(creator);
        map.set(normalized,list);
      };
      (creatorData||[]).forEach(creator=>{
        addIndex(byTikTok,creator.tiktok_username,creator);
        addIndex(byTikTok,creator.username,creator);
        addIndex(byCreatorId,creator.tiktok_creator_id,creator);
      });
      preview.rows=preview.rows.map(row=>{
        const idMatches=row.creatorId?byCreatorId.get(row.creatorId)||[]:[];
        const usernameMatches=byTikTok.get(row.username.toLowerCase())||[];
        const matches=idMatches.length?idMatches:usernameMatches;
        const matchedProfile=matches.length===1?matches[0]:null;
        const inactiveProfile=!!matchedProfile&&matchedProfile.active===false;
        const profile=row.agencyDeparted||inactiveProfile?null:matchedProfile;
        const linkStatus=row.agencyDeparted?'agency_left':matches.length>1?'ambiguous':inactiveProfile?'portal_inactive':profile?'linked':'not_in_portal';
        const evaluation=linkStatus!=='linked'
          ? {status:'not_evaluable',reason:row.agencyDeparted?'El reporte indica que abandonó la agencia.':'No existe una cuenta activa vinculada en el portal.'}
          : preview.mixedPeriods
            ? {status:'needs_daily_data',reason:'El archivo mezcla periodos y debe separarse antes de evaluar.'}
            : window.GRAYXON_FOLLOWUP_CALCULATIONS?.calculateEvaluation({
                periodStart:preview.sourcePeriod.start,periodEnd:preview.sourcePeriod.end,coverageStart:preview.sourcePeriod.start,coverageEnd:preview.sourcePeriod.end,
                granularity:preview.granularity,joinDate:row.joinedAt,
                validLiveDays:row.validDays,liveSeconds:row.liveHours==null?null:Math.round(row.liveHours*3600),
                monthlyLiveHours:activeParameters.monthly_live_hours,
                monthlyValidDays:activeParameters.monthly_valid_days,
                earlyReviewMinDays:activeParameters.early_review_min_evaluable_days,
                highRiskThresholdPct:activeParameters.high_risk_threshold_pct,
                observationThresholdPct:activeParameters.observation_threshold_pct,
                consistencyHoursPerDay:activeParameters.consistency_hours_per_day,
                consistencyDaysPerWeek:activeParameters.consistency_days_per_week
              })||{status:'not_evaluable',reason:'No está disponible el motor de evaluación.'};
        return {...row,profile,linkStatus,evaluation};
      });
      preview.summary.matched=preview.rows.filter(row=>row.linkStatus==='linked').length;
      preview.summary.ambiguous=preview.rows.filter(row=>row.linkStatus==='ambiguous').length;
      preview.summary.unmatched=preview.rows.filter(row=>row.linkStatus==='not_in_portal').length;
      preview.summary.agencyDeparted=preview.rows.filter(row=>row.linkStatus==='agency_left').length;
      preview.unmatchedRows=preview.rows.filter(row=>row.linkStatus!=='linked');
      const evaluableProfiles=preview.rows.filter(row=>row.profile);
      preview.canEvaluate=!preview.mixedPeriods&&evaluableProfiles.length>0&&evaluableProfiles.every(row=>row.diamonds!=null&&row.liveHours!=null&&row.validDays!=null);

      const matchedCreatorIds=preview.rows.map(row=>row.profile?.id).filter(Boolean);
      const {data:existingPlans,error:plansError}=matchedCreatorIds.length
        ? await sb.from('gx_creator_action_plans').select('id,creator_user_id,title,status,created_at').in('creator_user_id',matchedCreatorIds).order('created_at',{ascending:false})
        : {data:[],error:null};
      if(plansError)throw new Error('No se pudieron consultar los planes de seguimiento: '+plansError.message);
      const plansByCreator=new Map();
      (existingPlans||[]).forEach(plan=>{if(!plansByCreator.has(plan.creator_user_id))plansByCreator.set(plan.creator_user_id,plan);});
      window.grayxonFollowupPreview=preview;
      window.grayxonFollowupFile=file;
      const workspaceSection=document.getElementById('gxFollowupWorkspaceSection');if(workspaceSection)workspaceSection.hidden=true;
      const period=preview.sourcePeriod||{start:'Varios periodos',end:'Varios periodos'};
      const status=preview.mixedPeriods?'El archivo contiene periodos mezclados y no puede evaluarse.':preview.canEvaluate?'El archivo está listo para guardarse en el archivo mensual.':'El archivo no permite completar la evaluación.';
      const warnings=preview.warnings.length?'<ul>'+preview.warnings.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul>':'<p>Sin advertencias de formato ni duplicados.</p>';
      target.innerHTML='<div class="gxt-followup-summary"><div><strong>'+preview.summary.matched+'</strong><small>Creadores del portal</small></div><div><strong>'+preview.summary.creators+'</strong><small>Registros analizados</small></div></div>'+
        '<div class="gxt-status-note">'+esc(status)+' Periodo del reporte: '+esc(period.start)+' al '+esc(period.end)+'.</div>'+
        (preview.restriction?'<div class="gxt-status-note gxt-followup-warning">'+esc(preview.restriction)+'</div>':'')+
        '<div class="gxt-followup-warnings">'+warnings+'</div>'+
        (preview.canEvaluate && preview.rows.length>0 && preview.rows.filter(row=>row.profile).every(row=>row.evaluation.status==='evaluated'||row.evaluation.status==='not_evaluable')
          ? '<div class="gxt-status-note">Análisis correcto. Archivando automáticamente el reporte…</div>'
          : '<div class="gxt-status-note gxt-followup-warning">No se puede guardar: verifica que haya creadores vinculados con métricas completas y que el reporte cubra un único periodo.</div>');
      followupPreviewMarkup=target.innerHTML;
      bindFollowupPreviewActions(target);
      if(preview.canEvaluate&&preview.rows.length>0&&preview.rows.filter(row=>row.profile).every(row=>row.evaluation.status==='evaluated'||row.evaluation.status==='not_evaluable'))saveFollowupImport();
    }catch(error){
      console.error('[Gestión · Seguimiento] import preview',error);
      target.innerHTML='<div class="gxt-status-note gxt-followup-warning">'+esc(error.message||'No se pudo analizar el archivo.')+'</div>';
    }
  }

  let followupCreatorCache=[];
  let followupImportFile=null;
  let followupPreviewMarkup='';
  function bindFollowupPreviewActions(target){
    if(!target)return;
  }

  async function openFollowupCreator(creatorId,step=0,planId=''){
    const section=document.getElementById('gxFollowupWorkspaceSection');
    const select=document.getElementById('gxFollowupCreator');
    if(!section||!select)return toast('La ficha de seguimiento aún se está cargando.');
    section.hidden=false;
    section.classList.add('is-open');
    select.value=creatorId;
    if(select.value!==creatorId)return toast('No se encontró el creador en la lista autorizada.');
    if(typeof select.onchange==='function')await select.onchange();
    if(planId){const planSelect=document.getElementById('gxActionPlanSelect');if(planSelect)planSelect.value=planId;}
    const plan=(window.gxFollowupPlans||[]).find(item=>item.id===planId)||(window.gxFollowupPlans||[]).find(item=>item.creator_user_id===creatorId&&item.status!=='completed'&&item.status!=='cancelled')||(window.gxFollowupPlans||[]).find(item=>item.creator_user_id===creatorId);
    const form=document.getElementById('gxActionPlanForm');
    if(form&&plan){
      form.elements.plan_id.value=plan.id;form.elements.title.value=plan.title||'';form.elements.objective.value=plan.objective||'';
      form.elements.start_date.value=plan.start_date||'';form.elements.target_date.value=plan.target_date||'';
      const targets=plan.targets||{};['diamonds','live_hours','valid_days','battles','fan_club_members'].forEach(key=>form.elements[key].value=targets[key]??'');
      form.querySelector('button[type=submit]').textContent='Guardar cambios del plan';
    }
    const advance=document.getElementById('gxActionPlanUpdateForm');
    if(advance)updateFollowupProgressGate(plan);
    setFollowupStep(0);
    section.scrollTop=0;
  }

  function followupProgressEligibility(plan){
    if(!plan||plan.status==='cancelled')return {allowed:false,end:plan?.target_date||''};
    return {allowed:true,end:String(plan.target_date||'')};
  }
  function updateFollowupProgressGate(plan){
    const form=document.getElementById('gxActionPlanUpdateForm');
    const status=document.getElementById('gxFollowupPlanStatus');
    const button=document.querySelector('[data-followup-open-progress]');
    if(!form)return;
    const gate=followupProgressEligibility(plan);
    form.elements.plan_id.value=plan?.id||'';
    form.querySelectorAll('input:not([type="hidden"]),textarea,select,button').forEach(control=>{control.disabled=!gate.allowed;});
    if(button)button.disabled=!gate.allowed;
    if(status)status.textContent=!plan?'Primero debes crear un plan de trabajo.':plan.status==='cancelled'?'No se pueden registrar avances en un plan cancelado.':'Puedes registrar avances durante el desarrollo del plan, sin esperar a la fecha final.';
    form.classList.toggle('is-locked',!gate.allowed);
  }

  function setFollowupStep(index){state.followupStep=Number(index)||0;const form=document.getElementById('gxActionPlanForm'),progress=document.getElementById('gxActionPlanUpdateForm'),preview=document.getElementById('gxFollowupPlanPreview'),actions=document.getElementById('gxFollowupSavedPlanActions');const showingProgress=state.followupStep===1;if(form)form.hidden=showingProgress||!!(preview&&!preview.hidden);if(progress)progress.hidden=!showingProgress;if(preview&&showingProgress)preview.hidden=true;if(actions&&showingProgress)actions.hidden=true;}
  function renderFollowupActivityForCreator(creatorId){
    const host=document.getElementById('gxFollowupOperations');if(!host)return;
    const rows=(window.gxFollowupActivityRows||[]).filter(x=>x.creator_user_id===creatorId).sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,60);
    host.innerHTML=creatorId?(rows.length?'<div class="gxt-panel-head"><h3>Actividad reciente</h3><span class="gxt-chip">'+rows.length+' registros</span></div>'+rows.map(x=>'<div class="gxt-followup-operation"><strong>'+esc(x.title)+'</strong><small>'+esc(x.creator)+' · '+dateTimeLabel(x.date)+'</small><p>'+esc(x.detail)+'</p></div>').join(''):'<div class="gxt-empty">Este creador todavía no tiene actividad registrada.</div>'):'<div class="gxt-empty">Selecciona un creador para consultar su actividad.</div>';
  }
  function renderSavedActionPlan(plan,reminder){
    const form=document.getElementById('gxActionPlanForm'),preview=document.getElementById('gxFollowupPlanPreview'),actions=document.getElementById('gxFollowupSavedPlanActions');if(!form||!preview||!actions)return;
    if(!plan){preview.hidden=true;actions.hidden=true;form.hidden=false;return;}
    const targets=plan.targets||{};const labels=[['Diamantes','diamonds'],['Horas LIVE','live_hours'],['Días válidos','valid_days'],['Batallas','battles'],['Miembros del club de fans','fan_club_members']];
    preview.innerHTML='<h3>'+esc(plan.title)+'</h3><p>'+esc(plan.objective||'Sin objetivo adicional')+'</p><p><strong>Periodo:</strong> '+esc(plan.start_date)+' al '+esc(plan.target_date)+'</p><ul>'+labels.filter(x=>targets[x[1]]!=null).map(x=>'<li>'+x[0]+': '+esc(targets[x[1]])+'</li>').join('')+'</ul>'+(reminder?'<p><strong>Recordatorio:</strong> '+esc(new Date(reminder.scheduled_at).toLocaleString('es-CO',{dateStyle:'medium',timeStyle:'short'}))+' · '+esc(reminder.note||'Sin nota')+'</p>':'<p>Sin recordatorio programado.</p>');
    preview.hidden=false;actions.hidden=false;form.hidden=true;const sendButton=actions.querySelector('[data-followup-send-plan]');if(sendButton){sendButton.disabled=!!plan.sent_to_creator_at;sendButton.textContent=plan.sent_to_creator_at?'Enviado a Mis entregas':'Enviar';}const advanceButton=actions.querySelector('[data-followup-open-progress]');if(advanceButton)advanceButton.disabled=!followupProgressEligibility(plan).allowed;
  }
  async function loadFollowupWorkspace() {
    const select=document.getElementById('gxFollowupCreator');
    const host=document.getElementById('gxFollowupOperations');
    if(!select||!host)return;
    try{
      const {data:creators,error}=await sb.from('profiles').select('id,username,full_name,manager_id').eq('role','creator').eq('active',true).order('username');
      if(error)throw error;
      followupCreatorCache=creators||[];
      const previouslySelectedCreator=select.value;
      select.innerHTML='<option value="">Selecciona un creador</option>'+followupCreatorCache.map(p=>'<option value="'+esc(p.id)+'" '+(!p.manager_id&&!state.isAdmin?'disabled':'')+'>'+esc(p.full_name||p.username)+' · @'+esc(p.username)+(p.manager_id?'':' (sin manager asignado)')+'</option>').join('');
      if(previouslySelectedCreator)select.value=previouslySelectedCreator;
      const planSelect=document.getElementById('gxActionPlanSelect');
      select.onchange=async()=>{
        const creator=followupCreatorCache.find(p=>p.id===select.value);
        if(creator){document.getElementById('gxFollowupWorkspaceSection')?.classList.add('is-open');setFollowupStep(0);}
        if(!creator){return;}
        const selectedReport=window.gxFollowupSelectedReport||null;
        const reportRow=(selectedReport?.gx_creator_followup_evaluations||[]).find(row=>row.creator_user_id===creator.id)||null;
        const eligiblePlans=(window.gxFollowupPlans||[]).filter(plan=>plan.creator_user_id===creator.id);
        if(planSelect)planSelect.innerHTML='<option value="">Selecciona un plan</option>'+eligiblePlans.map(plan=>'<option value="'+esc(plan.id)+'">'+esc(plan.title)+'</option>').join('');
        const planForm=document.getElementById('gxActionPlanForm');
        if(planForm){
          ['plan_id','title','objective','start_date','target_date','diamonds','live_hours','valid_days','battles','fan_club_members','reminder_at','reminder_note'].forEach(key=>{if(planForm.elements[key])planForm.elements[key].value='';});
          planForm.querySelector('button[type=submit]').textContent='Guardar plan de trabajo';
        }
        const currentPlan=eligiblePlans.find(plan=>plan.status!=='cancelled'&&plan.status!=='completed')||eligiblePlans.find(plan=>plan.status!=='cancelled')||eligiblePlans[0]||null;
        if(currentPlan&&planForm){
          planForm.elements.plan_id.value=currentPlan.id;planForm.elements.title.value=currentPlan.title||'';
          planForm.elements.objective.value=currentPlan.objective||'';planForm.elements.start_date.value=currentPlan.start_date||'';
          planForm.elements.target_date.value=currentPlan.target_date||'';
          const targets=currentPlan.targets||{};
          ['diamonds','live_hours','valid_days','battles','fan_club_members'].forEach(key=>{planForm.elements[key].value=targets[key]??'';});
          planForm.querySelector('button[type=submit]').textContent='Guardar cambios del plan';
          if(planSelect)planSelect.value=currentPlan.id;
        }
        updateFollowupProgressGate(currentPlan);
        renderFollowupActivityForCreator(creator.id);
        renderSavedActionPlan(currentPlan,(window.gxFollowupReminders||[]).find(r=>r.action_plan_id===currentPlan?.id&&r.status!=='cancelled')||null);
      };
      const [notes,plans,planUpdates,reminders]=await Promise.all([
        sb.from('gx_creator_followup_notes').select('id,creator_user_id,manager_id,note_type,body,created_at').order('created_at',{ascending:false}).limit(1000),
        sb.from('gx_creator_action_plans').select('id,creator_user_id,title,objective,status,start_date,target_date,targets,created_at,manager_id,sent_to_creator_at').order('created_at',{ascending:false}).limit(1000),
        sb.from('gx_creator_action_plan_updates').select('id,plan_id,progress_summary,proposed_changes,status,created_at,review_note').order('created_at',{ascending:false}).limit(30),
        sb.from('gx_creator_followup_reminders').select('id,creator_user_id,action_plan_id,scheduled_at,status,note').order('scheduled_at',{ascending:true}).limit(30)
      ]);
      const failed=[notes,plans,planUpdates,reminders].find(x=>x.error);
      if(failed)throw failed.error;
      window.gxFollowupPlans=plans.data||[];
      window.gxFollowupNotes=notes.data||[];
      await refreshGeneralReportReadiness();
      window.gxFollowupReminders=reminders.data||[];
      const selectedCreatorId=select.value;
      const activePlan=(window.gxFollowupPlans||[]).find(plan=>plan.creator_user_id===selectedCreatorId&&plan.status!=='completed'&&plan.status!=='cancelled')||(window.gxFollowupPlans||[]).find(plan=>plan.creator_user_id===selectedCreatorId);
      state.followupHasPlan=!!activePlan;
      const planForm=document.getElementById('gxActionPlanForm');
      if(planForm){
        planForm.elements.plan_id.value=activePlan?.id||'';planForm.elements.title.value=activePlan?.title||'';planForm.elements.objective.value=activePlan?.objective||'';
        planForm.elements.start_date.value=activePlan?.start_date||new Date().toLocaleDateString('en-CA');planForm.elements.target_date.value=activePlan?.target_date||'';
        const targets=activePlan?.targets||{};['diamonds','live_hours','valid_days','battles','fan_club_members'].forEach(key=>planForm.elements[key].value=targets[key]??'');
        planForm.querySelector('button[type=submit]').textContent=activePlan?'Guardar cambios del plan':'Crear plan de trabajo';
      }
      const progressForm=document.getElementById('gxActionPlanUpdateForm');
      if(progressForm){progressForm.elements.plan_id.value=activePlan?.id||'';progressForm.querySelector('button[type=submit]').disabled=!activePlan;}
      updateFollowupProgressGate(activePlan);
      const name=id=>{const p=followupCreatorCache.find(x=>x.id===id);return p?'@'+p.username:'Creador';};
      if(planSelect){
        const selectedCreator=select.value;
        const eligiblePlans=window.gxFollowupPlans.filter(plan=>plan.creator_user_id===selectedCreator);
        planSelect.innerHTML='<option value="">Selecciona un plan</option>'+eligiblePlans.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.title)+'</option>').join('');
      }
      const rows=[
        ...(notes.data||[]).map(x=>({creator_user_id:x.creator_user_id,date:x.created_at,title:'Nota · '+x.note_type,creator:name(x.creator_user_id),detail:x.body})),
        ...(plans.data||[]).map(x=>{const reminder=(reminders.data||[]).find(item=>item.action_plan_id===x.id&&item.status!=='cancelled');return {creator_user_id:x.creator_user_id,date:x.created_at,title:'Plan creado · '+x.title,creator:name(x.creator_user_id),detail:x.objective+' · '+x.status+(reminder?' · Recordatorio: '+dateTimeLabel(reminder.scheduled_at):'')};}),
        ...(planUpdates.data||[]).map(x=>({creator_user_id:(plans.data||[]).find(p=>p.id===x.plan_id)?.creator_user_id,date:x.created_at,title:'Avance registrado · '+x.status,creator:(plans.data||[]).find(p=>p.id===x.plan_id)?name((plans.data||[]).find(p=>p.id===x.plan_id).creator_user_id):'Creador',detail:x.progress_summary+' '+(x.proposed_changes||''),updateId:x.id,status:x.status}))
      ].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,60);
      window.gxFollowupActivityRows=rows;
      renderFollowupActivityForCreator(select.value);
      if(select.value&&typeof select.onchange==='function')await select.onchange();
    }catch(error){
      console.error('[Gestión · Seguimiento] workspace',error);
      host.innerHTML='<div class="gxt-status-note gxt-followup-warning">No se pudieron cargar los registros: '+esc(error.message||'Error de consulta')+'</div>';
    }
  }

  async function reviewActionPlanUpdate(updateId,decision) {
    if(!state.isAdmin)return toast('Solo administración puede revisar estas propuestas.');
    if(!['approved','rejected'].includes(decision))return;
    const {error}=await sb.from('gx_creator_action_plan_updates').update({
      status:decision,reviewed_by:state.session.user.id,reviewed_at:new Date().toISOString()
    }).eq('id',updateId).eq('status','pending_manager_review');
    if(error)return toast('No se pudo revisar la propuesta: '+error.message);
    toast(decision==='approved'?'Cambios aprobados.':'Propuesta rechazada.');
    loadFollowupWorkspace();
  }

  async function submitFollowupRecord(form,event) {
    event.preventDefault();
    const creator=followupCreatorCache.find(x=>x.id===document.getElementById('gxFollowupCreator')?.value);
    if(!creator)return toast('No se encontró el creador seleccionado.');
    const data=new FormData(form);
    const common={creator_user_id:creator.id,manager_id:state.isAdmin?creator.manager_id:state.member.id,created_by:state.session.user.id};
    const metricKeys=['diamonds','live_hours','valid_days','battles','fan_club_members'];
    const readMetrics=prefix=>Object.fromEntries(metricKeys.map(key=>[key,Number(data.get(key)||0)]));
    if(form.id==='gxFollowupNoveltyForm'){const body=String(data.get('body')||'').trim();if(!body)return toast('Escribe la novedad que deseas reportar.');const {error}=await sb.from('gx_creator_followup_notes').insert({...common,note_type:'observation',body});if(error)return toast('No se pudo enviar la novedad: '+error.message);closeModal();const workspace=document.getElementById('gxFollowupWorkspaceSection');if(workspace){workspace.classList.remove('is-open');workspace.hidden=true;}toast('Novedad enviada a administración.');return;}
    if(form.id==='gxActionPlanForm'){
      const start=String(data.get('start_date')||''),end=String(data.get('target_date')||'');
      if(!start||!end||end<start)return toast('Define un rango de fechas válido para el plan.');
      const targets=readMetrics();
      const planId=String(data.get('plan_id')||'');
      const payload={title:String(data.get('title')||'').trim(),objective:String(data.get('objective')||'').trim(),start_date:start,target_date:end,targets,status:'active',updated_at:new Date().toISOString()};
      const sourceReport=window.gxFollowupSelectedReport||null;
      const sourcePeriodStart=sourceReport?.source_start_date||sourceReport?.selected_start_date||start;
      const sourcePeriodEnd=sourceReport?.source_end_date||sourceReport?.selected_end_date||end;
      let result;
      if(planId)return toast('Este plan ya fue creado y no se puede editar. Puedes registrar avances desde su vista.');
      result=await sb.from('gx_creator_action_plans').insert({...common,...payload,source_import_id:sourceReport?.id||null,source_period_start:sourcePeriodStart,source_period_end:sourcePeriodEnd}).select('id').single();
      if(result.error)return toast('No se pudo guardar el plan: '+result.error.message);
      const reminderLocal=String(data.get('reminder_at')||'');
      const existingReminder=(window.gxFollowupReminders||[]).find(item=>item.action_plan_id===result.data.id&&item.status!=='cancelled');
      if(reminderLocal){
        const scheduledAt=window.GRAYXON_FOLLOWUP_CALCULATIONS?.toBogotaISOString(reminderLocal);
        if(!scheduledAt)return toast('El plan se guardó, pero la fecha del recordatorio no es válida.');
        const reminderPayload={scheduled_at:scheduledAt,timezone:'America/Bogota',note:String(data.get('reminder_note')||'').trim()||null,status:'pending',updated_at:new Date().toISOString()};
        const reminder=existingReminder?await sb.from('gx_creator_followup_reminders').update(reminderPayload).eq('id',existingReminder.id):await sb.from('gx_creator_followup_reminders').insert({...common,action_plan_id:result.data.id,...reminderPayload});
        if(reminder.error)return toast('El plan se guardó, pero no se pudo actualizar el recordatorio: '+reminder.error.message);
      }else if(existingReminder){const removed=await sb.from('gx_creator_followup_reminders').delete().eq('id',existingReminder.id);if(removed.error)return toast('El plan se guardó, pero no se pudo retirar el recordatorio: '+removed.error.message);}
      form.elements.reminder_at.value='';form.elements.reminder_note.value='';
      toast('Plan creado correctamente.');
      await loadFollowupWorkspace();setFollowupStep(0);return;
    }
    if(form.id==='gxActionPlanUpdateForm'){
      const planId=String(data.get('plan_id')||'');
      if(!planId)return toast('Primero crea un plan de trabajo.');
      const progress=String(data.get('progress_summary')||'').trim();
      if(!progress)return toast('Describe el avance del plan.');
      const metrics=readMetrics();
      const {error}=await sb.rpc('gx_manager_update_creator_action_plan',{p_plan_id:planId,p_progress_summary:progress,p_proposed_changes:String(data.get('proposed_changes')||'').trim()||null,p_new_status:String(data.get('plan_status')||'active'),p_progress_metrics:metrics});
      if(error)return toast('No se pudo guardar el avance: '+error.message);
      form.elements.progress_summary.value='';form.elements.proposed_changes.value='';
      toast('Avance registrado correctamente.');await loadFollowupWorkspace();return;
    }
  }

  async function loadFollowupHistory() {
    const host=document.getElementById('gxFollowupHistory');
    if(!host)return;
    try{
      const {data,error}=await sb.from('gx_creator_followup_imports')
        .select('id,file_name,selected_start_date,selected_end_date,source_start_date,source_end_date,status,created_at,gx_creator_followup_evaluations(id,creator_user_id,creator_username_snapshot,classification,diamonds,live_seconds,valid_live_days),gx_creator_followup_import_unmatched_rows(id,creator_username_snapshot,reason)')
        .order('source_start_date',{ascending:false}).order('created_at',{ascending:false}).limit(200);
      if(error)throw error;
      const groups=new Map();
      (data||[]).forEach(item=>{
        const date=item.source_start_date||item.selected_start_date||item.created_at;
        const key=String(date||'').slice(0,7)||'Sin fecha';
        const list=groups.get(key)||[];list.push(item);groups.set(key,list);
      });
      const monthLabel=key=>{
        if(key==='Sin fecha')return key;
        const [y,m]=key.split('-').map(Number);
        return new Intl.DateTimeFormat('es-CO',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,1)));
      };
      const classes={high_risk:'Riesgo alto',observation:'En observación',on_track:'En línea',early_review:'Revisión temprana',not_evaluable:'No evaluable',needs_daily_data:'Requiere datos diarios'};
      const monthBlocks=Array.from(groups.entries()).map(([month,items])=>{
        const reports=items.map(item=>{
          const evaluations=item.gx_creator_followup_evaluations||[];
          const unmatched=(item.gx_creator_followup_import_unmatched_rows||[]).filter(row=>row.reason!=='agency_left');
          const noPortal=unmatched.filter(row=>row.reason==='not_in_portal'||row.reason==='portal_inactive');
          const alertTotal=noPortal.length;
          const creatorRows=evaluations.map(row=>{
            const tone=row.classification==='on_track'?'success':row.classification==='observation'?'observation':row.classification==='high_risk'?'risk':'neutral';
            return '<tr><td class="gxt-followup-creator-cell is-'+tone+'"><button type="button" class="gxt-followup-creator-link" data-followup-open-creator="'+esc(row.creator_user_id)+'"><strong>@'+esc(row.creator_username_snapshot)+'</strong></button></td><td>'+esc(classes[row.classification]||row.classification)+'</td><td>'+Number(row.diamonds||0).toLocaleString('es-CO')+'</td><td>'+(row.live_seconds==null?'—':(Number(row.live_seconds)/3600).toFixed(2)+' h')+'</td><td>'+(row.valid_live_days==null?'—':esc(row.valid_live_days))+'</td></tr>';
          }).join('');
          const alertButton=alertTotal
            ? '<button type="button" class="gxt-followup-month-alert" data-followup-report-alert="'+esc(item.id)+'"><span class="gxt-followup-alert-dot">!</span><span><strong>Alertas</strong><small>'+noPortal.length+' sin acceso al portal</small></span><b>'+alertTotal+'</b></button>'
            : '<span class="gxt-followup-month-alert is-clear">Sin alertas pendientes</span>';
          return '<details class="gxt-followup-history-report"><summary><span class="gxt-followup-report-title"><strong>'+esc(item.file_name)+'</strong><small>'+esc(item.source_start_date||item.selected_start_date)+' a '+esc(item.source_end_date||item.selected_end_date)+'</small></span><span class="gxt-chip">'+evaluations.length+' creadores</span><span class="gxt-followup-report-alert-slot">'+alertButton+'</span></summary>'+
            '<div class="gxt-followup-history-report-body">'+
            (evaluations.length?'<h4>Creadores del portal</h4><div class="gxt-followup-table-wrap"><table class="gxt-followup-table"><thead><tr><th>Creador</th><th>Evaluación</th><th>Diamantes</th><th>Horas LIVE</th><th>Días válidos</th></tr></thead><tbody>'+creatorRows+'</tbody></table></div>':'<p class="gxt-muted">No hay creadores activos del portal para este reporte.</p>')+
            '</div></details>';
        }).join('');
        return '<details class="gxt-followup-history-month" data-followup-month="'+esc(month)+'"><summary><strong>'+esc(monthLabel(month))+'</strong><span class="gxt-chip">'+items.length+' reportes</span></summary><div class="gxt-followup-history-month-content"><div class="gxt-followup-month-toolbar"><button type="button" class="gxt-btn ghost" data-followup-month-back>← Volver a los meses</button><strong>'+esc(monthLabel(month))+'</strong><button type="button" class="gxt-btn danger" data-followup-delete-month="'+esc(month)+'">'+(state.isAdmin?'Eliminar mes y planes':'Eliminar mi reporte y planes')+'</button></div>'+reports+'</div></details>';
      }).join('');
      host.innerHTML='<div class="gxt-panel-head"><h2>Archivo mensual de seguimiento</h2><span class="gxt-chip">'+(data||[]).length+' reportes guardados</span></div>'+
        (monthBlocks||'<div class="gxt-empty">Todavía no hay reportes guardados. Al analizar un Excel, el mes se creará automáticamente.</div>');
      host.querySelectorAll('.gxt-followup-history-month').forEach(month=>{
        month.addEventListener('toggle',()=>{
          if(month.open){host.querySelectorAll('.gxt-followup-history-month').forEach(other=>{if(other!==month){other.open=false;other.classList.remove('is-fullscreen');}});month.classList.add('is-fullscreen');}
          else month.classList.remove('is-fullscreen');
        });
      });
      if(window.gxFollowupOpenMonth){const targetMonth=host.querySelector('[data-followup-month="'+window.gxFollowupOpenMonth+'"]');if(targetMonth)targetMonth.open=true;window.gxFollowupOpenMonth=null;}
      host.querySelectorAll('[data-followup-month-back]').forEach(button=>button.addEventListener('click',()=>{
        const month=button.closest('.gxt-followup-history-month');if(month){month.open=false;month.classList.remove('is-fullscreen');}
      }));
      host.querySelectorAll('[data-followup-delete-month]').forEach(button=>button.addEventListener('click',async()=>{
        const month=button.dataset.followupDeleteMonth;
        const actionLabel=state.isAdmin?'Eliminar mes y planes':'Eliminar mi reporte y planes';
        if(!month||!confirm('¿'+actionLabel+' de '+month+'? Esta acción no se puede deshacer.'))return;
        button.disabled=true;button.textContent='Eliminando…';
        const {data,error}=await sb.rpc('gx_manager_delete_followup_month',{p_month:month+'-01'});
        if(error){button.disabled=false;button.textContent=actionLabel;return toast('No se pudo eliminar el mes: '+error.message);}
        const paths=Array.isArray(data?.storage_paths)?data.storage_paths.filter(Boolean):[];
        let storageWarning='';
        if(paths.length){
          const {error:storageError}=await sb.storage.from('gx-creator-followup-reports').remove(paths);
          if(storageError)storageWarning=' Los archivos Excel quedaron pendientes de limpieza: '+storageError.message;
        }
        toast('Mes eliminado: '+Number(data?.deleted_imports||0)+' reportes y '+Number(data?.deleted_plans||0)+' planes.'+storageWarning);
        await loadFollowupHistory();
      }));
      host.querySelectorAll('[data-followup-open-creator]').forEach(button=>button.addEventListener('click',()=>{const creatorId=button.dataset.followupOpenCreator;const report=Array.from(data||[]).find(item=>(item.gx_creator_followup_evaluations||[]).some(row=>row.creator_user_id===creatorId));window.gxFollowupSelectedReport=report||null;const creator=followupCreatorCache.find(item=>item.id===creatorId);const label=creator?.full_name||creator?.username||'este creador';const existingPlan=(window.gxFollowupPlans||[]).find(plan=>plan.creator_user_id===creatorId&&!['completed','cancelled'].includes(plan.status))||(window.gxFollowupPlans||[]).find(plan=>plan.creator_user_id===creatorId);const planButton=existingPlan?'<button type="button" class="gxt-btn primary" data-choice-view-plan="'+esc(existingPlan.id)+'" data-choice-creator="'+esc(creatorId)+'">Ver plan</button>':'<button type="button" class="gxt-btn primary" data-choice-create-plan="'+esc(creatorId)+'">Crear plan</button>';const noveltyButton=existingPlan?'':'<button type="button" class="gxt-btn" data-choice-report-novelty="'+esc(creatorId)+'">Reportar</button>';openModal('Gestionar seguimiento','Selecciona qué deseas hacer con '+esc(label)+'.','<div class="gxt-modal-actions">'+planButton+noveltyButton+'</div>');}));
      host.querySelectorAll('[data-followup-report-alert]').forEach(button=>button.addEventListener('click',event=>{
        event.preventDefault();event.stopPropagation();
        const item=(data||[]).find(entry=>entry.id===button.dataset.followupReportAlert);
        if(!item)return;
        const evaluations=item.gx_creator_followup_evaluations||[];
        const unmatched=(item.gx_creator_followup_import_unmatched_rows||[]).filter(row=>row.reason==='not_in_portal'||row.reason==='portal_inactive');
        const group=(label,rows,render)=>rows.length?'<section class="gxt-followup-alert-group"><strong>'+esc(label)+' ('+rows.length+')</strong>'+rows.map(render).join('')+'</section>':'';
        const body=group('Sin acceso al portal',unmatched,row=>'<div class="gxt-followup-alert-person">@'+esc(row.creator_username_snapshot)+'</div>');
        openModal('Alertas del reporte','Solo se muestran creadores que requieren acceso al portal o actualizar su teléfono.','<div class="gxt-followup-alert-list">'+body+'</div>',true);
      }));
    }catch(error){
      console.error('[Gestión · Seguimiento] history',error);
      host.innerHTML='<div class="gxt-panel-head"><h2>Archivo mensual de seguimiento</h2></div><div class="gxt-status-note gxt-followup-warning">No se pudo cargar el historial: '+esc(error.message||'Error de consulta')+'</div>';
    }
  }


  async function saveFollowupImport() {
    const preview=window.grayxonFollowupPreview;
    const file=window.grayxonFollowupFile||followupImportFile;
    if(!preview||!file)return toast('Vuelve a analizar el archivo antes de guardarlo.');
    if(!preview.canEvaluate||preview.rows.length<1||
      !preview.rows.filter(row=>row.profile).every(row=>['evaluated','not_evaluable'].includes(row.evaluation.status))) {
      return toast('El archivo todavía no cumple las condiciones para guardarse.');
    }
    const button=main.querySelector('[data-followup-save]');
    if(button){button.disabled=true;button.textContent='Guardando…';}
    let objectPath=null;
    try{
      if(!window.crypto?.subtle)throw new Error('Este navegador no permite verificar el archivo de forma segura.');
      const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
      const hash=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
      const safeName=file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-180)||'reporte.xlsx';
      objectPath=state.session.user.id+'/'+crypto.randomUUID()+'-'+safeName;
      const {error:uploadError}=await sb.storage.from('gx-creator-followup-reports').upload(objectPath,file,{upsert:false,contentType:file.type||'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
      if(uploadError)throw new Error('No se pudo subir el archivo original: '+uploadError.message);
      const evaluations=preview.rows.filter(row=>row.profile).map(row=>({
        creator_user_id:row.profile.id,username:row.username,join_date:row.joinedAt||null,
        evaluated_start:row.evaluation.evaluatedStart||null,evaluated_end:row.evaluation.evaluatedEnd||null,
        evaluable_days:row.evaluation.evaluableDays||0,valid_live_days:row.validDays,
        live_seconds:row.liveHours==null?null:Math.round(row.liveHours*3600),diamonds:row.diamonds,
        target_valid_days:row.evaluation.targetValidDays??null,target_live_seconds:row.evaluation.targetLiveSeconds??null,
        valid_days_pct:row.evaluation.validDaysPct??null,live_hours_pct:row.evaluation.liveHoursPct??null,
        classification:row.evaluation.classification||'not_evaluable',
        raw_metrics:{source_group:row.group,source_agent:row.agent,days_since_join:row.daysSinceJoin,source_period:row.sourcePeriod}
      }));
      const unmatchedRows=preview.rows.filter(row=>!row.profile).map(row=>({username:row.username,creator_id:row.creatorId,reason:row.linkStatus==='agency_left'?'agency_left':row.linkStatus==='ambiguous'?'ambiguous':row.linkStatus==='portal_inactive'?'portal_inactive':'not_in_portal',agency_status:row.agencyStatus,raw_metrics:{diamonds:row.diamonds,live_hours:row.liveHours,valid_days:row.validDays,source_group:row.group,source_agent:row.agent}}));
      const {data:importId,error:saveError}=await sb.rpc('gx_save_creator_followup_import_with_unmatched',{
        p_file_name:file.name,p_storage_path:objectPath,p_file_sha256:hash,
        p_selected_start:preview.selectedPeriod.start,p_selected_end:preview.selectedPeriod.end,
        p_source_start:preview.sourcePeriod.start,p_source_end:preview.sourcePeriod.end,
        p_granularity:preview.granularity,p_evaluations:evaluations,p_unmatched_rows:unmatchedRows
      });
      if(saveError)throw new Error('El archivo se subió, pero no se pudo registrar la evaluación: '+saveError.message);
      toast('Reporte archivado correctamente.');
      targetReloadFollowup(importId);
      loadFollowupHistory();
    }catch(error){
      if(objectPath)await sb.storage.from('gx-creator-followup-reports').remove([objectPath]).catch(()=>{});
      console.error('[Gestión · Seguimiento] save import',error);
      toast(error.message||'No se pudo guardar la evaluación.');
      if(button){button.disabled=false;button.textContent='Guardar evaluación';}
    }
  }

  function targetReloadFollowup(importId) {
    const target=document.getElementById('gxFollowupPreview');
    const period=window.grayxonFollowupPreview?.sourcePeriod;
    const month=String(period?.start||'').slice(0,7);
    if(month)window.gxFollowupOpenMonth=month;
    const label=month?new Intl.DateTimeFormat('es-CO',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T00:00:00Z')):'el mes correspondiente';
    if(target){target.innerHTML='<div class="gxt-status-note">Reporte archivado automáticamente en '+esc(label)+'.</div>';followupPreviewMarkup=target.innerHTML;}
  }

  async function renderReportsPage() {
    main.innerHTML=pageHead('Reportes','Informes generales de los equipos y sus actualizaciones.')+
      '<section class="gxt-panel"><div class="gxt-panel-head"><h2>Informes generales</h2></div><div id="gxGeneralReportsList" class="gxt-empty">Cargando informes…</div></section>';
    const host=document.getElementById('gxGeneralReportsList');
    try{
      const {data:reports,error}=await sb.from('gx_creator_followup_general_reports')
        .select('id,manager_id,team_id,creator_count,period_start,period_end,generated_at,updated_at')
        .order('generated_at',{ascending:false}).limit(200);
      if(error)throw error;
      if(!reports?.length){host.innerHTML='<div class="gxt-empty">Todavía no hay actividad registrada en los informes del equipo.</div>';return;}
      const managerIds=[...new Set(reports.map(report=>report.manager_id))];
      const teamIds=[...new Set(reports.map(report=>report.team_id).filter(Boolean))];
      const [managerResult,teamResult]=await Promise.all([
        sb.from('managers').select('id,name').in('id',managerIds),
        teamIds.length?sb.from('teams').select('id,name').in('id',teamIds):Promise.resolve({data:[],error:null})
      ]);
      if(managerResult.error)throw managerResult.error;
      if(teamResult.error)throw teamResult.error;
      const managerNames=new Map((managerResult.data||[]).map(row=>[row.id,row.name]));
      const teamNames=new Map((teamResult.data||[]).map(row=>[row.id,row.name]));
      const {data:creators,error:creatorError}=await sb.from('profiles')
        .select('id,username,full_name,manager_id,team_id').eq('role','creator').eq('active',true).in('manager_id',managerIds).order('username');
      if(creatorError)throw creatorError;
      const creatorRows=creators||[];
      const creatorIds=creatorRows.map(row=>row.id);
      const [plansResult,updatesResult,evaluationsResult,notesResult,contactsResult,remindersResult]=await Promise.all([
        sb.from('gx_creator_action_plans').select('id,creator_user_id,title,status,updated_at,manager_id').in('manager_id',managerIds).order('updated_at',{ascending:false}).limit(2000),
        sb.from('gx_creator_action_plan_updates').select('id,plan_id,progress_summary,created_at,status').order('created_at',{ascending:false}).limit(2000),
        creatorIds.length?sb.from('gx_creator_followup_evaluations').select('id,creator_user_id,diamonds,live_seconds,valid_live_days,classification,created_at').in('creator_user_id',creatorIds).order('created_at',{ascending:false}).limit(3000):Promise.resolve({data:[],error:null}),
        creatorIds.length?sb.from('gx_creator_followup_notes').select('id,creator_user_id,note_type,body,created_at').in('creator_user_id',creatorIds).order('created_at',{ascending:false}).limit(3000):Promise.resolve({data:[],error:null}),
        creatorIds.length?sb.from('gx_creator_followup_contacts').select('id,creator_user_id,contact_status,channel,message_text,created_at').in('creator_user_id',creatorIds).order('created_at',{ascending:false}).limit(3000):Promise.resolve({data:[],error:null}),
        creatorIds.length?sb.from('gx_creator_followup_reminders').select('id,creator_user_id,status,scheduled_at,note').in('creator_user_id',creatorIds).order('scheduled_at',{ascending:false}).limit(3000):Promise.resolve({data:[],error:null})
      ]);
      const failed=[plansResult,updatesResult,evaluationsResult,notesResult,contactsResult,remindersResult].find(result=>result.error);
      if(failed)throw failed.error;
      const plans=plansResult.data||[],updates=updatesResult.data||[],evaluations=evaluationsResult.data||[],notes=notesResult.data||[],contacts=contactsResult.data||[],reminders=remindersResult.data||[];
      const date=value=>value?new Date(value).toLocaleString('es-CO',{dateStyle:'medium',timeStyle:'short'}):'—';
      host.innerHTML=reports.map(report=>{
        const teamCreators=creatorRows.filter(row=>row.manager_id===report.manager_id);
        const inPeriod=(value)=>value&&String(value).slice(0,10)>=report.period_start&&String(value).slice(0,10)<=report.period_end;
        const teamPlans=plans.filter(plan=>plan.manager_id===report.manager_id&&plan.status!=='cancelled');
        const planIds=new Set(teamPlans.map(plan=>plan.id));
        const teamUpdates=updates.filter(update=>planIds.has(update.plan_id)&&inPeriod(update.created_at));
        const teamEvaluations=evaluations.filter(evaluation=>teamCreators.some(creator=>creator.id===evaluation.creator_user_id)&&inPeriod(evaluation.created_at));
        const teamNotes=notes.filter(note=>teamCreators.some(creator=>creator.id===note.creator_user_id)&&inPeriod(note.created_at));
        const teamContacts=contacts.filter(contact=>teamCreators.some(creator=>creator.id===contact.creator_user_id)&&inPeriod(contact.created_at));
        const teamReminders=reminders.filter(reminder=>teamCreators.some(creator=>creator.id===reminder.creator_user_id)&&inPeriod(reminder.scheduled_at));
        const latestByCreator=new Map();
        teamEvaluations.forEach(item=>{if(!latestByCreator.has(item.creator_user_id))latestByCreator.set(item.creator_user_id,item);});
        const managed=teamCreators.filter(creator=>teamPlans.some(plan=>plan.creator_user_id===creator.id&&plan.status!=='cancelled')).length;
        return '<details class="gxt-accordion"><summary><div class="gxt-accordion-main"><strong>Informe de seguimiento · '+esc(report.period_start)+' al '+esc(report.period_end)+'</strong><div class="gxt-card-meta"><span class="gxt-chip">'+report.creator_count+' creadores al generar</span><span class="gxt-chip">'+managed+' gestionados actualmente</span><span class="gxt-chip">Manager: '+esc(managerNames.get(report.manager_id)||'Sin nombre')+'</span><span class="gxt-chip">Equipo: '+esc(teamNames.get(report.team_id)||'Sin identificar')+'</span></div></div><span class="gxt-accordion-chevron">⌄</span></summary><div class="gxt-accordion-body"><p><strong>Generado:</strong> '+date(report.generated_at)+'</p><p><strong>Última actualización:</strong> '+date(report.updated_at)+'</p><p><strong>Planes:</strong> '+teamPlans.length+' · <strong>Avances:</strong> '+teamUpdates.length+' · <strong>Evaluaciones:</strong> '+teamEvaluations.length+' · <strong>Observaciones:</strong> '+teamNotes.length+' · <strong>Contactos:</strong> '+teamContacts.length+' · <strong>Recordatorios:</strong> '+teamReminders.length+'</p><div class="gxt-followup-table-wrap"><table class="gxt-followup-table"><thead><tr><th>Creador</th><th>Plan</th><th>Últimos diamantes</th><th>Horas LIVE</th><th>Días válidos</th></tr></thead><tbody>'+teamCreators.map(creator=>{
          const plan=teamPlans.find(item=>item.creator_user_id===creator.id&&item.status!=='cancelled');
          const evaluation=latestByCreator.get(creator.id);
          const note=teamNotes.filter(item=>item.creator_user_id===creator.id).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0];
          const hasUpdate=plan&&teamUpdates.some(item=>planIds.has(item.plan_id)&&item.plan_id===plan.id);
          const label=plan?(hasUpdate?'Plan + avance':'Plan creado'):(note?'Novedad':'Pendiente');
          const tone=evaluation?.classification==='high_risk'?'risk':evaluation?.classification==='observation'?'observation':evaluation?.classification==='on_track'?'success':evaluation?.classification==='early_review'?'early':(note?'observation':plan?'success':'neutral');
          const badgeClass=label==='Pendiente'?'is-neutral':label==='Novedad'?'is-observation':label==='Plan creado'?'is-success':'is-early';
          return '<tr class="gxt-followup-row is-'+tone+'"><td><div class="gxt-followup-report-creator"><strong>@'+esc(creator.username)+'</strong><span class="gxt-followup-trace '+badgeClass+'">'+label+'</span></div></td><td>'+esc(plan?.title||'—')+'</td><td>'+(evaluation?.diamonds==null?'—':Number(evaluation.diamonds).toLocaleString('es-CO'))+'</td><td>'+(evaluation?.live_seconds==null?'—':(Number(evaluation.live_seconds)/3600).toFixed(1)+' h')+'</td><td>'+(evaluation?.valid_live_days??'—')+'</td></tr>';
        }).join('')+'</tbody></table></div></div></details>';
      }).join('');
    }catch(error){
      console.error('[Gestión · Reportes] load',error);
      host.innerHTML='<div class="gxt-status-note gxt-followup-warning">No se pudieron cargar los informes: '+esc(error.message||'Error de consulta')+'</div>';
    }
  }


  function renderPage() {
    renderNav();
    if (state.isManager) {
      if (state.tab === 'reports') return renderReportsPage();
      return renderFollowupPage();
    }
    if (state.tab === 'tasks') return renderTasksPage();
    if (state.tab === 'requests') return renderRequestsPage();
    if (state.tab === 'team' && state.isAdmin) return renderTeamPage();
    if (state.tab === 'departments' && state.isAdmin) return renderDepartmentsPage();
    if (state.tab === 'activity' && state.isAdmin) return renderActivityPage();
    if (state.tab === 'calendar') return renderCalendarLinkPage();
    if (state.tab === 'followup') return renderFollowupPage();
    if (state.tab === 'reports') return renderReportsPage();
    renderDashboard();
  }

  function openModal(title, subtitle, body, wide = false) {
    modalRoot.innerHTML = '<section class="gxt-modal '+(wide?'wide':'')+'" role="dialog" aria-modal="true"><header class="gxt-modal-head"><div><h2>'+esc(title)+'</h2><p>'+esc(subtitle)+'</p></div><button type="button" class="gxt-close" data-close-modal aria-label="Cerrar">×</button></header>'+body+'</section>';
    modalRoot.querySelector('.gxt-modal-head [data-close-modal]').addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();closeModal();});

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

  main.addEventListener('submit',event=>{
    const form=event.target.closest('#gxActionPlanForm,#gxActionPlanUpdateForm,#gxFollowupNoveltyForm');
    if(form)submitFollowupRecord(form,event);
  });

  main.addEventListener('click',async event=>{
    if(event.target.closest('[data-generate-general-report]'))return generateGeneralFollowupReport();
    if(event.target.closest('[data-followup-close]')){const section=document.getElementById('gxFollowupWorkspaceSection');section?.classList.remove('is-open');if(section)section.hidden=true;return;}
    if(event.target.closest('[data-followup-back]')){if(state.followupStep===1){setFollowupStep(0);const creatorId=document.getElementById('gxFollowupCreator')?.value;const plan=(window.gxFollowupPlans||[]).find(item=>item.creator_user_id===creatorId&&item.status!=='cancelled')||null;renderSavedActionPlan(plan,(window.gxFollowupReminders||[]).find(r=>r.action_plan_id===plan?.id&&r.status!=='cancelled')||null);return;}const section=document.getElementById('gxFollowupWorkspaceSection');if(section){section.classList.remove('is-open');section.hidden=true;}return;}
    const openFollowup=event.target.closest('[data-followup-open-creator]');
    if(openFollowup){openFollowupCreator(openFollowup.dataset.followupOpenCreator,Number(openFollowup.dataset.followupStep)||0,openFollowup.dataset.followupPlanId||'');return;}
    if(event.target.closest('[data-followup-next]')&&state.followupStep===0&&!state.followupHasPlan&&!document.querySelector('#gxActionPlanForm [name=plan_id]')?.value)return toast('Primero guarda el plan de trabajo para continuar.');
    if(event.target.closest('[data-followup-prev]'))return setFollowupStep(state.followupStep-1);
    if(event.target.closest('[data-followup-next]')){if(state.followupStep===2){const section=document.getElementById('gxFollowupWorkspaceSection');section?.classList.remove('is-open');if(section)section.hidden=true;return;}return setFollowupStep(state.followupStep+1);}
    const registerProgress=event.target.closest('[data-followup-open-progress]');if(registerProgress&&!registerProgress.disabled){const planId=document.querySelector('#gxActionPlanForm [name=plan_id]')?.value;const plan=(window.gxFollowupPlans||[]).find(item=>item.id===planId);const progress=document.getElementById('gxActionPlanUpdateForm');if(progress){progress.hidden=false;progress.elements.plan_id.value=planId||'';const targets=plan?.targets||{};['diamonds','live_hours','valid_days','battles','fan_club_members'].forEach(key=>{if(progress.elements[key])progress.elements[key].placeholder='Meta: '+(targets[key]??'—');});}const preview=document.getElementById('gxFollowupPlanPreview'),actions=document.getElementById('gxFollowupSavedPlanActions'),planForm=document.getElementById('gxActionPlanForm');if(preview)preview.hidden=true;if(actions)actions.hidden=true;if(planForm)planForm.hidden=true;state.followupStep=1;return;}
    const deleteSavedPlan=event.target.closest('[data-followup-delete-plan]');
    if(deleteSavedPlan){const form=document.getElementById('gxActionPlanForm'),planId=form?.elements.plan_id.value,creatorId=document.getElementById('gxFollowupCreator')?.value;if(!planId)return;if(!window.confirm('¿Eliminar este plan de trabajo y sus recordatorios?'))return;const reminders=(window.gxFollowupReminders||[]).filter(r=>r.action_plan_id===planId);for(const r of reminders){const del=await sb.from('gx_creator_followup_reminders').delete().eq('id',r.id);if(del.error)return toast('No se pudo eliminar el recordatorio: '+del.error.message);}const delPlan=await sb.from('gx_creator_action_plans').delete().eq('id',planId).eq('creator_user_id',creatorId);if(delPlan.error)return toast('No se pudo eliminar el plan: '+delPlan.error.message);toast('Plan eliminado.');await loadFollowupWorkspace();if(creatorId)await openFollowupCreator(creatorId,0);return;}
    const sendPlan=event.target.closest('[data-followup-send-plan]');if(sendPlan){const planId=document.querySelector('#gxActionPlanForm [name=plan_id]')?.value;if(!planId)return toast('Guarda primero el plan.');sendPlan.disabled=true;const {error}=await sb.from('gx_creator_action_plans').update({sent_to_creator_at:new Date().toISOString()}).eq('id',planId).eq('creator_user_id',document.getElementById('gxFollowupCreator')?.value);if(error){sendPlan.disabled=false;return toast('No se pudo enviar el plan: '+error.message);}toast('Plan enviado a Mis entregas.');await loadFollowupWorkspace();return;}
    const reviewPlan=event.target.closest('[data-review-plan-update]');
    if(reviewPlan)return reviewActionPlanUpdate(reviewPlan.dataset.reviewPlanUpdate,reviewPlan.dataset.reviewDecision);
    const followupPreview=event.target.closest('[data-followup-preview]');
    if(followupPreview)return previewFollowupImport();
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

  modalRoot.addEventListener('submit',event=>{const form=event.target.closest('#gxFollowupNoveltyForm');if(form)submitFollowupRecord(form,event);});

  modalRoot.addEventListener('click',event=>{
    if(event.target===modalRoot){closeModal();return;}
    const close=event.target.closest('[data-close-modal]');
    if(close)return closeModal();
    const createPlan=event.target.closest('[data-choice-create-plan]');if(createPlan){const id=createPlan.dataset.choiceCreatePlan;closeModal();openFollowupCreator(id,0);return;}const viewPlan=event.target.closest('[data-choice-view-plan]');if(viewPlan){const id=viewPlan.dataset.choiceCreator;const planId=viewPlan.dataset.choiceViewPlan;closeModal();openFollowupCreator(id,0,planId);return;}
    const reportNovelty=event.target.closest('[data-choice-report-novelty]');if(reportNovelty){const id=reportNovelty.dataset.choiceReportNovelty;const workspace=document.getElementById('gxFollowupWorkspaceSection');if(workspace){workspace.classList.remove('is-open');workspace.hidden=true;}const creator=followupCreatorCache.find(item=>item.id===id);const hidden=document.getElementById('gxFollowupCreator');if(hidden)hidden.value=id;openModal('Reportar novedad','Registro interno para administración · '+esc(creator?.full_name||creator?.username||'Creador'),'<form id="gxFollowupNoveltyForm"><label class="gxt-field"><span>Novedad / seguimiento realizado</span><textarea name="body" maxlength="5000" required placeholder="Describe la situación, gestión realizada o seguimiento pendiente."></textarea></label><div class="gxt-modal-actions"><button type="button" class="gxt-btn ghost" data-close-modal>× Cerrar</button><button type="submit" class="gxt-btn primary">Enviar novedades</button></div></form>');return;}
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
