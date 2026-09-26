const CFG = window.GRAYXON_CONFIG || {};
const sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_PUBLISHABLE_KEY);

let current = 'home';
let session = null;
let profile = null;
let adminView = 'dashboard';
let selectedLesson = null;
let authMode = 'creator';
let profileDetails = null;
let paymentMethod = null;
let notifications = [];
let pendingNotificationTarget = null;

const fallback = {
  home: {
    eyebrow: 'GRAYXON GROUP · TIKTOK LIVE',
    title: 'Crea, aprende y conecta con Grayxon.',
    intro: 'Bienvenido/a al portal oficial de Grayxon.',
    about: 'Somos una agencia enfocada en acompañar talentos que quieren desarrollar su proceso en TikTok LIVE, con orientación, formación y recursos para comenzar con claridad.',
    badge: 'TikTok LIVE',
    cta: 'Ver beneficios y requisitos',
    trust: ['Formación', 'Acompañamiento', 'Comunidad']
  },
  benefits: {
    title: 'Beneficios y requisitos',
    intro: 'Conoce cómo funciona Grayxon, qué ofrecemos y qué necesitas para ingresar.',
    benefits: [
      'Acompañamiento durante tu proceso en TikTok LIVE',
      'Entrenamientos y material formativo',
      'Acceso a información, actividades y novedades de la agencia',
      'Orientación para desarrollar tu proceso en LIVE'
    ],
    requirements: [
      'Ser mayor de 18 años',
      'Residir en un país de LATAM habilitado para el proceso',
      'No pertenecer simultáneamente a otra agencia de TikTok LIVE',
      'No utilizar múltiples cuentas para el proceso de ingreso',
      'Tener disponibilidad para desarrollar tu proceso en TikTok LIVE'
    ]
  }
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function toast(t) {
  $('#toast').textContent = t;
  $('#toast').classList.remove('hidden');
  setTimeout(() => $('#toast').classList.add('hidden'), 2400);
}

function errorText(error, fallbackText = 'Ocurrió un error.') {
  return error?.message || fallbackText;
}

async function loadNotifications() {
  if (!session?.user?.id) { notifications = []; updateNotificationsUI(); return; }
  const { data, error } = await sb.from('notifications').select('id,type,title,message,link_page,related_week_start,related_week_end,read_at,created_at').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(30);
  if (error) { notifications = []; updateNotificationsUI(); return; }
  notifications = data || [];
  updateNotificationsUI();
}

function notificationIcon(type) { return type === 'mission' ? '🎯' : type === 'formation' ? '🎓' : '🔔'; }

function updateNotificationsUI() {
  const btn = $('#notificationsBtn');
  const badge = $('#notificationsBadge');
  if (!btn || !badge) return;
  const unread = notifications.filter(n => !n.read_at).length;
  badge.textContent = unread > 9 ? '9+' : String(unread);
  badge.classList.toggle('hidden', unread === 0 || !session);
  btn.classList.toggle('hidden', !session || unread === 0);
  btn.setAttribute('aria-label', session ? `Notificaciones${unread ? `: ${unread} nuevas` : ''}` : 'Iniciar sesión');
  const panel = $('#notificationsPanel');
  if (panel && !panel.classList.contains('hidden')) renderNotificationsPanel();
}

function renderNotificationsPanel() {
  const panel = $('#notificationsPanel');
  if (!panel) return;
  if (!session) {
    panel.innerHTML = `<div class="notification-empty"><strong>Inicia sesión</strong><span>Entra a tu cuenta para ver tus notificaciones.</span></div>`;
    return;
  }
  const unread = notifications.filter(n => !n.read_at).length;
  panel.innerHTML = `<div class="notification-panel-head"><div><strong>Notificaciones</strong><span>${unread ? `${unread} nueva${unread===1?'':'s'}` : 'Todo al día'}</span></div>${unread ? '<button type="button" id="markAllNotifications">Marcar como leídas</button>' : ''}</div><div class="notification-list">${notifications.length ? notifications.map(n => `<button type="button" class="notification-item ${n.read_at?'read':'unread'}" data-notification-id="${esc(n.id)}"><span class="notification-icon">${notificationIcon(n.type)}</span><span class="notification-copy"><strong>${esc(n.title)}</strong><span>${esc(n.message)}</span><small>${formatNotificationDate(n.created_at)}</small></span>${!n.read_at?'<i class="notification-dot"></i>':''}</button>`).join('') : '<div class="notification-empty"><strong>No tienes notificaciones.</strong><span>Cuando Grayxon te asigne algo nuevo, aparecerá aquí.</span></div>'}</div>`;
  $('#markAllNotifications')?.addEventListener('click', async (e) => { e.stopPropagation(); await markAllNotifications(); });
  panel.querySelectorAll('[data-notification-id]').forEach(b => b.addEventListener('click', () => openNotification(b.dataset.notificationId)));
}

function formatNotificationDate(value) {
  if (!value) return '';
  try { return new Date(value).toLocaleString('es-CO', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }); } catch { return ''; }
}

async function markNotificationRead(id) {
  const n = notifications.find(x => x.id === id);
  if (!n || n.read_at) return;
  const now = new Date().toISOString();
  const { error } = await sb.from('notifications').update({ read_at: now }).eq('id', id).eq('user_id', session.user.id);
  if (!error) { n.read_at = now; updateNotificationsUI(); }
}

async function markAllNotifications() {
  if (!session?.user?.id) return;
  const unread = notifications.filter(n => !n.read_at);
  if (!unread.length) return;
  const { error } = await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', session.user.id).is('read_at', null);
  if (error) return toast(error.message);
  notifications.forEach(n => { if (!n.read_at) n.read_at = new Date().toISOString(); });
  updateNotificationsUI();
  toast('Notificaciones marcadas como leídas ✓');
}

async function openNotification(id) {
  const n = notifications.find(x => x.id === id);
  if (!n) return;
  await markNotificationRead(id);
  $('#notificationsPanel')?.classList.add('hidden');
  if (n.link_page === 'missions') {
    pendingNotificationTarget = { type: 'missions', weekStart: n.related_week_start || null, weekEnd: n.related_week_end || null };
    nav('missions');
  } else if (n.link_page === 'training') nav('training');
  else nav('space');
}

function toggleNotifications() {
  const panel = $('#notificationsPanel');
  if (!panel) return;
  closeProfileMenu();
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) renderNotificationsPanel();
}

async function notifyCreators(title, message, linkPage='space') {
  const { error } = await sb.rpc('notify_all_creators', { p_type: 'formation', p_title: title, p_message: message, p_link_page: linkPage });
  if (error) console.warn('No se pudo crear la notificación:', error.message);
}

async function notifyCreator(userId, title, message, linkPage='space', weekStart=null, weekEnd=null) {
  if (!userId) return {ok:false,error:'Falta el ID del creador.'};
  const payload = { user_id:userId, type:'mission', title, message, link_page:linkPage, related_week_start:weekStart || null, related_week_end:weekEnd || null };
  // Usamos el RPC ya creado en la configuración de notificaciones.
  const rpc = await sb.rpc('create_notification', { p_user_id:userId, p_type:'mission', p_title:title, p_message:message, p_link_page:linkPage, p_week_start:weekStart || null, p_week_end:weekEnd || null });
  if (!rpc.error) return {ok:true};
  // Respaldo directo para administradores; la política RLS de v26 permite INSERT a admins.
  const direct = await sb.from('notifications').insert(payload);
  if (!direct.error) return {ok:true};
  const detail = `RPC: ${rpc.error.message || rpc.error.code || 'error desconocido'} · INSERT: ${direct.error.message || direct.error.code || 'error desconocido'}`;
  console.warn('No se pudo crear la notificación:', {rpc:rpc.error, direct:direct.error, userId});
  return {ok:false,error:detail};
}

async function notifyMissionWeek(creatorId, start, end, count) {
  if (!creatorId || !start || !end) return false;
  const message = `Se te han asignado ${count} ${count===1?'misión':'misiones'} para esta semana (${start} → ${end}).`;
  const result = await notifyCreator(creatorId, 'Tienes una notificación nueva', message, 'missions', start, end);
  if (result.ok) {
    if (session?.user?.id === creatorId) await loadNotifications();
    toast('Notificación enviada ✓');
    return true;
  }
  toast(`No se pudo enviar: ${result.error}`);
  return false;
}

async function content() {
  const { data } = await sb.from('site_content').select('id,content').in('id', ['home', 'benefits']);
  const c = structuredClone(fallback);
  (data || []).forEach(x => c[x.id] = x.content);
  return c;
}

function nav(p, push = true) {
  const pages = ['home','benefits','auth','space','training','missions','profile','admin'];
  if (!pages.includes(p)) p = 'home';
  if (push && current !== p) history.pushState({page:p}, '', window.location.href);
  current = p;
  pages.forEach(id => { const el=$('#'+id); if(el) el.classList.toggle('hidden', id !== p); });
  if (p === 'space') { try { renderSpaceShell(); } catch(e) { console.error(e); } }
  Promise.resolve(render()).catch(e => console.warn('Render:', e));
  window.scrollTo(0,0);
}

function spaceCard(icon,title,desc,pct,action,detail){
  return `<button class="space-card card" data-space-action="${esc(action)}"><span class="space-card-icon">${icon}</span><div class="space-card-main"><div class="space-card-top"><strong>${esc(title)}</strong><span>${pct}%</span></div><p>${esc(desc)}</p><div class="space-progress"><span style="width:${Math.max(0,Math.min(100,pct))}%"></span></div><small>${esc(detail)}</small></div><span class="space-card-arrow">›</span></button>`;
}
function renderSpaceShell(){
  const el=$('#space'); if(!el) return;
  if(!session){ el.innerHTML=authTpl('creator'); return; }
  const base=profile||{full_name:session.user.user_metadata?.full_name||'',username:session.user.user_metadata?.username||session.user.email?.split('@')[0]||'creador'};
  el.innerHTML=`<div class="space-page"><div class="space-hero"><div class="space-hero-main"><div class="eyebrow">TU ESPACIO</div><h1>Hola, ${esc(base.full_name||base.username)} 👋</h1><p class="muted space-intro">Aquí tienes todo lo que necesitas para avanzar dentro de Grayxon.</p><div id="spaceTeamBlock" class="space-team-inline"><div class="space-team-info"><span class="space-team-label">TU EQUIPO</span><strong>Cargando equipo...</strong><span class="space-manager-line">Manager: preparando información…</span></div></div></div><div class="space-total"><span>PROGRESO GENERAL</span><strong id="spaceOverallPct">0%</strong></div></div><div class="space-grid" id="spaceCards">${spaceCard('👤','Tu perfil','Completa tus datos para mantener tu información actualizada.',0,'profile','Cargando información…')}${spaceCard('🎓','Formación','Aprende con los módulos, lecciones, videos y recursos de Grayxon.',0,'training','Cargando formación…')}${spaceCard('🎯','Tus misiones','Cumple tus objetivos semanales y registra tus avances.',0,'missions','Cargando misiones…')}</div></div>`;
  bind();
}
function updateSpaceTeam(a){
  const el=$('#spaceTeamBlock'); if(!el)return;
  if(a?.team){const m=a.manager; el.innerHTML=`<div class="space-team-info"><span class="space-team-label">TU EQUIPO</span><strong>${esc(a.team.name)}</strong><div class="space-manager-row"><span class="space-manager-line">Manager: <b>${esc(m?.name||'Sin asignar')}</b></span>${m?.phone?`<a class="space-team-whatsapp" href="${esc(managerWhatsapp(m.phone))}" target="_blank" rel="noopener noreferrer"><img src="assets/whatsapp-icon.svg" alt=""><span>Contactar</span></a>`:''}</div></div>`;}
  else el.innerHTML=`<div><span class="space-team-label">TU EQUIPO</span><strong>Aún no tienes equipo asignado</strong><span>Cuando Grayxon te asigne un equipo y manager, aparecerán aquí.</span></div>`;
}
function updateSpaceCard(action,pct,detail){const b=document.querySelector(`[data-space-action="${action}"]`);if(!b)return;const p=b.querySelector('.space-card-top span'),bar=b.querySelector('.space-progress span'),d=b.querySelector('small');if(p)p.textContent=`${pct}%`;if(bar)bar.style.width=`${Math.max(0,Math.min(100,pct))}%`;if(d)d.textContent=detail;}

async function render(){
  if(current==='home'||current==='benefits'||current==='admin'){
    const c=await content();
    if(current==='home')$('#home').innerHTML=homeTpl(c.home);
    if(current==='benefits')$('#benefits').innerHTML=benefitsTpl(c.benefits);
    if(current==='admin')await adminTpl(c);
  }
  if(current==='auth')$('#auth').innerHTML=authTpl(authMode);
  if(current==='space')await spaceTpl();
  if(current==='training')await trainingTpl();
  if(current==='missions')await missionsTpl();
  if(current==='profile')$('#profile').innerHTML=await profileTpl();
  bind(); updateProfileBadge(); updateNotificationsUI();
  $$('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===current));
}

function homeTpl(h) {
  const d = fallback.home;
  const about = h?.about || d.about;
  const trust = Array.isArray(h?.trust) && h.trust.length ? h.trust : d.trust;
  return `<div class="home-modern">
    <section class="modern-hero">
      <div class="modern-hero-copy">
        <div class="modern-title-block">
          <h1>Crea, aprende y conecta con <em>Grayxon.</em></h1>
        </div>

        <div class="modern-about">
          <span class="about-copy"><small>QUIÉNES SOMOS</small><strong>${esc(about)}</strong></span>
        </div>

        <div class="modern-trust">${trust.slice(0,3).map(x => `<span>✓ ${esc(x)}</span>`).join('')}</div>

        <section class="menu-panel">
          <div class="home-menu-heading">NUESTRO MENÚ</div>
          <div class="hero-actions">
            <button class="hero-action hero-action-primary" data-page="benefits">Beneficios y requisitos <span>›</span></button>
            <button class="hero-action hero-action-secondary" data-page="auth" data-auth-mode="creator">Tu espacio <span>›</span></button>
          </div>
        </section>

        <section class="modern-socials hero-socials">
          <div class="modern-social-title">NUESTRAS REDES</div>
          <div class="modern-social-grid">
            <a class="modern-social-btn" href="https://www.tiktok.com/@grayxongroup" target="_blank" rel="noopener noreferrer"><span class="social-logo tiktok-mark"><img src="assets/tiktok-icon.svg" alt="TikTok"></span><strong>TikTok</strong><b>↗</b></a>
            <a class="modern-social-btn whatsapp-btn" href="https://wa.me/573126283007?text=Hola%20Grayxon%20%F0%9F%91%8B" target="_blank" rel="noopener noreferrer"><span class="social-logo whatsapp-mark"><img src="assets/whatsapp-icon.svg" alt="WhatsApp"></span><strong>Hablar por WhatsApp</strong><b>↗</b></a>
          </div>
        </section>

      </div>
      <div class="modern-creator-art" aria-hidden="true">
        <div class="creator-aura"></div>
        <img src="assets/creator-grayxon.png" alt="">
      </div>
    </section>
  </div>`;
}
function benefitsTpl(b) {
  const bonusSections = [
    { icon:'💎', title:'1. ¿Qué puedes ganar?', body:'Además de las recompensas de TikTok, puedes ganar bonos mensuales por tu producción.', bullets:['Bonos por mantener e incrementar tu producción.','Más herramientas para ayudarte a crecer.','Acompañamiento real de un equipo que quiere verte crecer.'] },
    { icon:'📅', title:'2. ¿Cómo ganar tu bono?', body:'Para que tu producción sea válida y puedas participar en el programa, debes cumplir:', bullets:['90 horas al mes','22 días válidos','Cumplir las condiciones del programa'], note:'Los bonos están sujetos a las condiciones del programa. Si una sanción genera un débito para la agencia y está relacionado con el creador, el valor correspondiente podrá descontarse del bono generado por ese creador.' },
    { icon:'💰', title:'3. ¿Cuánto puedes ganar?', tiers:[['100K','$15'],['150K','$25'],['300K','$40'],['500K','$60'],['800K','$90'],['1.2M','$130'],['1.8M','$200']], increment:[['100K','$40'],['150K','$60'],['300K','$100'],['500K','$140'],['800K','$220'],['1.2M','$320'],['1.8M','$500']] },
    { icon:'🎁', title:'4. ¿Cómo recibes tu bono?', body:'Una vez cumplas las condiciones del programa y generes tu bono, podrás recibirlo mediante:', bullets:['Regalos de TikTok','PayPal','Tu cuenta bancaria local'] },
    { icon:'🚀', title:'5. Todo lo que tienes en Grayxon para seguir creciendo', bullets:['Academia Grayxon · Cursos, guías y tutoriales disponibles 24/7.','Capacitaciones en vivo · Entrenamientos semanales con estrategias para crecer.','Acompañamiento personalizado · Orientación para resolver tus dudas.','Soporte especializado · Ayuda con restricciones, bloqueos, apelaciones y errores.','Comunidad Grayxon · Conecta con otros talentos y participa en actividades.','Concursos y eventos · Actividades y premios para nuestra comunidad.'] },
    { icon:'✨', title:'6. Tú también puedes', body:'No importa dónde estás hoy. Lo importante es cuánto puedes crecer mañana.', bullets:['💎 $100K → puedes.','💎 $300K → puedes.','💎 $1 MILLÓN → también puedes.'], note:'Crecer juntos. Llegar más lejos.' }
  ];
  return `<div class="section benefits-page">
    <div class="eyebrow">GRAYXON · INFORMACIÓN</div>
    <h2>${esc(b.title || 'Beneficios y requisitos')}</h2>
    <p class="muted">${esc(b.intro || fallback.benefits.intro)}</p>
    <div class="benefits-media">
      <div class="section">
        <div class="benefits-media-label"><span>🎥</span><div><strong>Conoce Grayxon</strong><small>Te explicamos cómo funciona nuestro proceso.</small></div></div>
        <video class="video" controls playsinline preload="metadata" src="assets/Beneficios_y_requisitos.mp4"></video>
      </div>
    </div>

    <section class="bonus-module section">
      <div class="bonus-module-head"><div><div class="eyebrow">PROGRAMA GRAYXON</div><h3>Bonificaciones</h3><p>Consulta de forma rápida cómo funciona nuestro programa de bonos y qué necesitas para acceder a ellos.</p></div><span class="bonus-live-badge">BONOS</span></div>
      <div class="bonus-accordion">${bonusSections.map((x,i)=>`<details class="bonus-item" ${i===0?'open':''}><summary><span class="bonus-icon">${x.icon}</span><span class="bonus-title">${x.title}</span><span class="bonus-chevron">⌄</span></summary><div class="bonus-content">${x.body?`<p>${esc(x.body)}</p>`:''}${x.bullets?`<div class="bonus-bullets">${x.bullets.map(v=>`<div>✓ <span>${esc(v)}</span></div>`).join('')}</div>`:''}${x.tiers?`<div class="bonus-subtitle">Bono por mantener tu producción</div><div class="bonus-tiers">${x.tiers.map(v=>`<div><b>${v[0]}</b><span>${v[1]}</span></div>`).join('')}</div><div class="bonus-subtitle second">Bono por incrementar 10% o más tu producción</div><div class="bonus-tiers">${x.increment.map(v=>`<div><b>${v[0]}</b><span>hasta ${v[1]}</span></div>`).join('')}</div>`:''}${x.note?`<div class="bonus-note">${esc(x.note)}</div>`:''}</div></details>`).join('')}</div>
    </section>

    <div class="benefits-lists">
      <div class="section benefits-list-card"><h3>Beneficios</h3><div class="list">${(b.benefits || fallback.benefits.benefits).map(x => `<div class="item">✓ ${esc(x)}</div>`).join('')}</div></div>
      <div class="section benefits-list-card"><h3>Requisitos</h3><div class="list">${(b.requirements || fallback.benefits.requirements).map(x => `<div class="item">✓ ${esc(x)}</div>`).join('')}</div></div>
    </div>
    <a class="primary benefits-cta" href="https://wa.me/573126283007?text=Quiero%20continuar%20con%20mi%20proceso%20de%20ingreso" target="_blank" rel="noopener noreferrer">Quiero continuar con mi proceso →</a>
  </div>`;
}


const profileCountries = [
  ['CO','Colombia'],['MX','México'],['AR','Argentina'],['CL','Chile'],['PE','Perú'],['EC','Ecuador'],['VE','Venezuela'],['PA','Panamá'],['CR','Costa Rica'],['GT','Guatemala'],['SV','El Salvador'],['HN','Honduras'],['NI','Nicaragua'],['DO','República Dominicana'],['BO','Bolivia'],['PY','Paraguay'],['UY','Uruguay'],['CU','Cuba'],['HT','Haití']
];
const bankSeed = {
  CO:['Bancolombia','Banco de Bogotá','Davivienda','BBVA Colombia','Banco de Occidente','Banco Popular','Banco AV Villas','Scotiabank Colpatria','Itaú Colombia','Banco Caja Social','Banco Falabella','Banco W','Lulo Bank','Nu Colombia'],
  MX:['BBVA México','Santander México','Banorte','Citibanamex','HSBC México','Scotiabank México','Banco Azteca','BanCoppel','Inbursa','Afirme','Banregio','Hey Banco'],
  AR:['Banco Nación','Banco Provincia','Banco Galicia','Santander Argentina','BBVA Argentina','Banco Macro','ICBC Argentina','HSBC Argentina','Banco Credicoop','Brubank'],
  CL:['Banco de Chile','BancoEstado','Santander Chile','BCI','Scotiabank Chile','Itaú Chile','Banco Falabella','Banco Ripley','Tenpo'],
  PE:['BCP','Interbank','BBVA Perú','Scotiabank Perú','Banco de la Nación','BanBif','Banco Pichincha','Mibanco','Caja Arequipa'],
  EC:['Banco Pichincha','Banco del Pacífico','Produbanco','Banco Guayaquil','Banco Bolivariano','Banco Internacional','Banco Machala','Banco Solidario'],
  VE:['Banco de Venezuela','Banesco','Mercantil Banco Universal','BBVA Provincial','Banco Nacional de Crédito','Banco del Tesoro','Bancamiga','Banco Exterior'],
  PA:['Banco General','Global Bank','Banistmo','BAC Credomatic Panamá','Caja de Ahorros','Multibank','Towerbank'],
  CR:['Banco Nacional de Costa Rica','Banco de Costa Rica','BAC Credomatic','Banco Popular','Scotiabank Costa Rica','Promerica Costa Rica'],
  GT:['Banco Industrial','Banrural','G&T Continental','BAC Guatemala','Promerica Guatemala','Banco de los Trabajadores'],
  SV:['Banco Agrícola','Banco Cuscatlán','BAC Credomatic El Salvador','Banco Davivienda Salvadoreño','Promerica El Salvador','Banco Hipotecario'],
  HN:['Banco Atlántida','BAC Honduras','Ficohsa','Banpaís','Davivienda Honduras','Banco de Occidente Honduras'],
  NI:['Banpro','BAC Nicaragua','LAFISE Bancentro','Ficohsa Nicaragua','Banco Avanz','Banco Atlántida Nicaragua'],
  DO:['BanReservas','Banco Popular Dominicano','Banco BHD','Scotiabank República Dominicana','Banco Santa Cruz','Banco Caribe','Asociación Popular de Ahorros y Préstamos'],
  BO:['Banco Nacional de Bolivia','Banco Mercantil Santa Cruz','Banco Bisa','Banco Unión','Banco de Crédito de Bolivia','Banco Económico','Banco Ganadero'],
  PY:['Banco Nacional de Fomento','Banco Continental','Banco GNB Paraguay','Banco Familiar','Sudameris Paraguay','Itaú Paraguay'],
  UY:['Banco República','Santander Uruguay','BBVA Uruguay','Scotiabank Uruguay','Itaú Uruguay','HSBC Uruguay','BROU'],
  CU:['Banco Nacional de Cuba','Banco Metropolitano','Banco Popular de Ahorro'],
  HT:['Sogebank','Unibank','BUH','Capital Bank']
};
function profileInitial(p = profile){
  const n = (p?.full_name || p?.username || 'G').trim();
  return (n.charAt(0) || 'G').toUpperCase();
}
async function loadProfileDetails(){
  if (!session?.user?.id) return { details:null, payment:null };
  const [{data: d}, {data: pm}] = await Promise.all([
    sb.from('profile_details').select('*').eq('user_id', session.user.id).maybeSingle(),
    sb.from('payment_methods').select('*').eq('user_id', session.user.id).order('is_primary',{ascending:false}).order('updated_at',{ascending:false}).limit(1).maybeSingle()
  ]);
  profileDetails=d||null; paymentMethod=pm||null; return {details:profileDetails,payment:paymentMethod};
}
function profileTpl(){
  if (!session || !profile) return authTpl('creator');
  const d=profileDetails||{}; const pm=paymentMethod||{};
  const avatar = d.avatar_url ? `<img class="profile-avatar-img" src="${esc(d.avatar_url)}" alt="Foto de perfil">` : `<span>${esc(profileInitial())}</span>`;
  const countries=profileCountries.map(([c,n])=>`<option value="${c}" ${d.country===c?'selected':''}>${n}</option>`).join('');
  const banks=(bankSeed[pm.bank_country || d.country]||[]).map(b=>`<option value="${esc(b)}" ${pm.bank_name===b?'selected':''}>${esc(b)}</option>`).join('');
  return `<div class="profile-page">
    <div class="profile-head card"><div class="profile-avatar-wrap profile-avatar-editable">${avatar}<button type="button" class="avatar-edit-fab" id="profilePhotoEdit" aria-label="Cambiar foto">✎</button><button type="button" class="avatar-delete-fab ${d.avatar_url ? '' : 'hidden'}" id="deleteProfileAvatar" aria-label="Eliminar foto">🗑</button><input id="profileAvatar" class="hidden" type="file" accept="image/png,image/jpeg,image/webp"></div><div><div class="eyebrow">MI PERFIL</div><h1>${esc(profile.full_name||profile.username)}</h1><p class="muted">@${esc(profile.username)} · ${profile.role==='admin'?'Administrador':'Creador'}</p><div id="profileAvatarStatus" class="muted small" style="margin-top:8px"></div></div></div>
    <div class="card"><h2>Información personal</h2>${field('pEmail','Correo electrónico',d.email||'')}${field('pPhone','Número de teléfono',d.phone||'')}
      <label class="field"><span>País</span><select id="pCountry">${countries}</select></label>${field('pState','Estado / Departamento / Provincia',d.state_region||'')}${field('pCity','Ciudad',d.city||'')}${field('pAddress','Dirección',d.address||'',true)}
    </div>
    <div class="card"><h2>Información de pagos</h2><label class="field"><span>Método de pago</span><select id="pMethod"><option value="bank" ${pm.method_type!=='paypal'?'selected':''}>Cuenta bancaria</option><option value="paypal" ${pm.method_type==='paypal'?'selected':''}>PayPal</option></select></label>
      <div id="bankFields" ${pm.method_type==='paypal'?'style="display:none"':''}><label class="field"><span>País del banco</span><select id="pBankCountry">${profileCountries.map(([c,n])=>`<option value="${c}" ${pm.bank_country===c?'selected':''}>${n}</option>`).join('')}</select></label><label class="field"><span>Banco</span><select id="pBank"><option value="">Selecciona tu banco</option>${banks}</select></label><label class="field"><span>Tipo de cuenta</span><select id="pAccountType"><option value="savings" ${pm.account_type==='savings'?'selected':''}>Ahorros</option><option value="checking" ${pm.account_type==='checking'?'selected':''}>Corriente</option><option value="other" ${pm.account_type==='other'?'selected':''}>Otro</option></select></label>${field('pAccountNumber','Número de cuenta',pm.account_number||'')}</div>
      <div id="paypalFields" ${pm.method_type==='paypal'?'':'style="display:none"'}>${field('pPaypal','Correo de PayPal',pm.paypal_email||'')}</div>
      <label class="field"><span>Preferencia</span><label style="display:flex;gap:8px;align-items:center;color:#ddd"><input id="pPrimary" type="checkbox" ${pm.is_primary!==false?'checked':''}> Usar como método principal de pago</label></label>
    </div>
    <div class="profile-save-wrap"><button class="primary profile-save-btn" id="saveProfile">Guardar</button></div><div id="profileErr" class="error"></div>
  </div>`;
}
function authTpl(mode = 'creator') {
  const isAdmin = mode === 'admin';
  return `<div class="login"><h2>${isAdmin ? 'Acceso administrativo' : 'Mi formación'}</h2><p class="muted">${isAdmin ? 'Ingresa con tu usuario o correo y contraseña de administrador.' : 'Ingresa con el usuario y contraseña asignados por Grayxon.'}</p><div class="field"><label>${isAdmin ? 'Usuario o correo' : 'Usuario'}</label><input id="loginUser" autocomplete="username" placeholder="${isAdmin ? 'Ej. edwar o correo@ejemplo.com' : 'Ej. maria123'}"></div><div class="field"><label>Contraseña</label><input id="loginPass" type="password" autocomplete="current-password" placeholder="••••••••"></div><div id="loginErr" class="error"></div><button class="primary" id="loginBtn">Ingresar</button>${isAdmin ? '<button class="ghost" id="creatorLoginLink" style="display:block;width:100%;margin-top:10px">← Volver a acceso de creador</button>' : '<button class="ghost" id="adminLoginLink" style="display:block;width:100%;margin-top:10px">Acceso administrativo</button>'}</div>`;
}

async function getProfile() {
  if (!session) return null;
  try {
    const query = sb.from('profiles').select('id,username,full_name,role,active,team_id,manager_id').eq('id', session.user.id).maybeSingle();
    const result = await Promise.race([query, new Promise(resolve => setTimeout(() => resolve({data:null,error:new Error('timeout')}), 5000))]);
    if (result?.data) return result.data;
  } catch(e) {}
  return { id: session.user.id, username: session.user.user_metadata?.username || session.user.email?.split('@')[0] || 'creador', full_name: session.user.user_metadata?.full_name || '', role:'creator', active:true, team_id:null, manager_id:null };
}

async function loadCreatorAssignment(){
  if(!session?.user?.id) return {team:null,manager:null};
  try {
    const {data:pr,error:pe} = await sb.from('profiles').select('team_id').eq('id',session.user.id).maybeSingle();
    if(pe || !pr?.team_id) return {team:null,manager:null};
    const {data:team,error:te} = await sb.from('teams').select('id,name,manager_id').eq('id',pr.team_id).maybeSingle();
    if(te || !team) return {team:null,manager:null};
    const {data:manager} = team.manager_id ? await sb.from('managers').select('id,name,phone,email').eq('id',team.manager_id).maybeSingle() : {data:null};
    return {team,manager:manager||null};
  } catch(e) { return {team:null,manager:null}; }
}
function managerWhatsapp(phone){
  const raw=String(phone||'').replace(/[^0-9]/g,'');
  return raw ? `https://wa.me/${raw}` : '#';
}

async function spaceTpl(){
  if(!session){$('#space').innerHTML=authTpl('creator');return;}
  if(!$('#space')?.innerHTML.trim()) renderSpaceShell();
  const uid=session.user.id;
  // Cargar el perfil en paralelo; no bloquea la pantalla.
  getProfile().then(p=>{ if(!p)return; profile=p; const h=$('#space h1'); if(h)h.innerHTML=`Hola, ${esc(p.full_name||p.username)} 👋`; updateProfileBadge(); }).catch(()=>{});
  const safe=async(promise,fallback,ms=2500)=>{try{const r=await Promise.race([promise,new Promise(resolve=>setTimeout(()=>resolve({data:fallback,error:true}),ms))]);return r?.error?fallback:(r?.data??fallback);}catch{return fallback;}};
  const profileP=Promise.all([safe(sb.from('profile_details').select('*').eq('user_id',uid).maybeSingle(),null),safe(sb.from('payment_methods').select('*').eq('user_id',uid).order('is_primary',{ascending:false}).limit(1).maybeSingle(),null)]).then(([d,pm])=>{const n=[d?.email,d?.phone,d?.country,d?.state_region,d?.city,d?.address,d?.avatar_url,pm?.method_type&&(pm.method_type==='paypal'?pm.paypal_email:pm.account_number)].filter(Boolean).length;const pct=Math.round(n/8*100);updateSpaceCard('profile',pct,pct===100?'Perfil completo':`${n} de 8 datos completos`);return pct;});
  const trainingP=Promise.all([safe(sb.from('lessons').select('id').eq('published',true),[]),safe(sb.from('lesson_progress').select('lesson_id').eq('user_id',uid),[])]).then(([ls,lp])=>{const done=new Set((lp||[]).map(x=>x.lesson_id));const total=(ls||[]).length;const fin=(ls||[]).filter(x=>done.has(x.id)).length;const pct=total?Math.round(fin/total*100):0;updateSpaceCard('training',pct,total?`${fin} de ${total} lecciones completadas`:'Aún no hay formación publicada');return pct;});
  const missionsP=Promise.all([safe(sb.from('missions').select('id,type,target,week_start,week_end,assigned_to').eq('published',true).or(`assigned_to.is.null,assigned_to.eq.${uid}`).order('week_start',{ascending:false}),[]),safe(sb.from('mission_progress').select('mission_id,value,completed').eq('user_id',uid),[])]).then(([ms,mp])=>{const today=new Date().toISOString().slice(0,10);const active=(ms||[]).filter(m=>(!m.week_start||m.week_start<=today)&&(!m.week_end||m.week_end>=today)&&(!m.assigned_to||m.assigned_to===uid));const map=new Map((mp||[]).map(x=>[x.mission_id,x]));const pctFor=m=>{const x=map.get(m.id);if(!x)return 0;if(m.type==='checkbox')return x.completed?100:0;return Number(m.target)>0?Math.min(100,Math.round(Number(x.value||0)/Number(m.target)*100)):0};const total=active.length,done=active.filter(m=>pctFor(m)>=100).length,pct=total?Math.round(active.reduce((a,m)=>a+pctFor(m),0)/total):0;updateSpaceCard('missions',pct,total?`${done} de ${total} misiones completadas`:'No hay misiones activas esta semana');return pct;});
  const teamP=loadCreatorAssignment().then(a=>{updateSpaceTeam(a);return 0;}).catch(()=>{updateSpaceTeam({team:null,manager:null});return 0;});
  Promise.all([profileP,trainingP,missionsP,teamP]).then(v=>{const pct=Math.round((v[0]+v[1]+v[2])/3);const el=$('#spaceOverallPct');if(el)el.textContent=`${pct}%`;}).catch(()=>{});
}

async function missionsTpl() {
  if (!session) { $('#missions').innerHTML = authTpl('creator'); return; }
  // Leemos directamente las misiones publicadas asignadas a este creador.
  // Esto garantiza que cada nueva misión tenga su propio progreso 0% hasta que
  // el creador la guarde, incluso cuando ya haya completado misiones anteriores.
  const { data: ms, error } = await sb.from('missions')
    .select('id,title,description,type,target,week_start,week_end,assigned_to,published,link_url,created_at')
    .eq('published', true)
    .or(`assigned_to.is.null,assigned_to.eq.${session.user.id}`)
    .order('week_start',{ascending:false}).order('created_at',{ascending:false});
  if (error) { $('#missions').innerHTML = `<div class="card"><h2>Tus misiones</h2><div class="error">${esc(error.message)}</div></div>`; return; }
  const today = new Date().toISOString().slice(0,10);
  const { data: ps } = await sb.from('mission_progress').select('mission_id,value,completed').eq('user_id', session.user.id);
  const progress = new Map((ps || []).map(x => [x.mission_id, x]));
  const fmt = n => Number(n||0).toLocaleString('es-CO');
  const pct = m => { const p=progress.get(m.id); if(!p)return 0; if(m.type==='checkbox')return p.completed?100:0; return m.target>0?Math.min(100,Math.round(Number(p.value||0)/Number(m.target)*100)):0; };
  const dateLabel = d => d ? new Date(d+'T12:00:00').toLocaleDateString('es-CO',{day:'2-digit',month:'short'}) : '—';
  const weekKey = m => `${m.week_start||'sin-inicio'}__${m.week_end||'sin-fin'}`;
  const weekLabel = (start,end) => start || end ? `${dateLabel(start)}${end ? ' · '+dateLabel(end) : ''}` : 'Sin semana definida';
  const isCurrentWeek = (start,end) => (!start || start<=today) && (!end || end>=today);
  const isFinished = m => { const p = progress.get(m.id); return !!p?.completed || (!!m.week_end && m.week_end < today); };
  const visible = (ms || []).filter(m => !m.assigned_to || m.assigned_to === session.user.id);
  const assignedMissions = visible.filter(m => !isFinished(m));
  const completedMissions = visible.filter(m => isFinished(m));

  const missionCard = (m, historical=false) => {
    const p=progress.get(m.id)||{value:0,completed:false};
    const v=pct(m);
    const expired=!!m.week_end && m.week_end < today && v<100;
    const submitted = !!p.completed;
    return `<div class="mission-card ${submitted?'mission-complete':''} ${expired?'mission-expired':''}" data-mission-card-id="${m.id}">
      <div class="mission-head"><div class="mission-icon">${v>=100?'✓':expired?'⌁':m.type==='checkbox'?'✓':'↗'}</div><div><strong>${esc(m.title)}</strong><p class="muted small">${esc(m.description||'')}</p><small>${esc(weekLabel(m.week_start,m.week_end))}${expired?' · Semana finalizada':''}</small></div><span class="mission-pct">${v}%</span></div>
      <div class="space-progress mission-progress"><span style="width:${v}%"></span></div>
      <div class="mission-actions">
        ${m.link_url?`<a class="mission-link" href="${esc(m.link_url)}" target="_blank" rel="noopener noreferrer">🔗 Abrir recurso</a>`:''}
        ${!historical && !expired && m.type==='checkbox'?`<button class="mission-check ${p.completed?'checked':''}" data-complete-mission="${m.id}">${p.completed?'✓ Guardado':'Guardar'}</button>`:''}
        ${!historical && !expired && m.type==='numeric'?`<div class="mission-number-wrap"><input type="number" min="0" step="1" value="${esc(p.value||0)}" id="missionValue-${m.id}" placeholder="0"><span>/ ${fmt(m.target)}</span></div><button class="mission-save" data-save-mission="${m.id}">Guardar</button>`:''}
        ${historical?`<span class="mission-status-pill ${expired?'expired':''}">${expired?'Semana finalizada':(p.completed && v<100?'✓ Guardada':'✓ Completada')}</span>`:''}
      </div>
    </div>`;
  };

  const groupByWeek = items => {
    const map = new Map();
    items.forEach(m => {
      const key = weekKey(m);
      if (!map.has(key)) map.set(key, {start:m.week_start||'', end:m.week_end||'', items:[]});
      map.get(key).items.push(m);
    });
    return [...map.values()].sort((a,b) => String(b.start||'').localeCompare(String(a.start||'')) || String(b.end||'').localeCompare(String(a.end||'')));
  };

  const weekCard = (g, type) => {
    const current = isCurrentWeek(g.start,g.end);
    const done = g.items.filter(m => pct(m)>=100).length;
    const total = g.items.length;
    const avg = total ? Math.round(g.items.reduce((sum,m)=>sum+pct(m),0)/total) : 0;
    const id = `${type}-${String(g.start||'none').replace(/[^0-9a-z]/gi,'')}-${String(g.end||'none').replace(/[^0-9a-z]/gi,'')}`;
    return `<button type="button" class="mission-week-card" data-mission-week="${id}" data-week-start="${esc(g.start)}" data-week-end="${esc(g.end)}">
      <div class="mission-week-icon">${type==='assigned'?'🎯':'✓'}</div>
      <div class="mission-week-main"><div class="mission-week-top"><strong>${current && type==='assigned'?'Misiones para esta semana':'Semana '+weekLabel(g.start,g.end)}</strong><span>${avg}%</span></div><p>${type==='assigned'?`${total} ${total===1?'misión asignada':'misiones asignadas'} · ${done} completada${done===1?'':'s'}`:`${total} ${total===1?'misión':'misiones'} · ${done} completada${done===1?'':'s'}`}</p><div class="space-progress"><span style="width:${avg}%"></span></div></div><b class="mission-week-arrow">›</b>
    </button>`;
  };

  const groupDetails = (groups, type) => groups.map((g,idx) => {
    const id = `${type}-${String(g.start||'none').replace(/[^0-9a-z]/gi,'')}-${String(g.end||'none').replace(/[^0-9a-z]/gi,'')}`;
    return `<div class="mission-week-group"><div>${weekCard(g,type)}</div><div class="mission-week-details hidden" id="details-${id}">${g.items.map(m=>missionCard(m,type==='completed')).join('')}</div></div>`;
  }).join('');

  const assignedGroups = groupByWeek(assignedMissions);
  const completedGroups = groupByWeek(completedMissions);
  const currentWeekItems = visible.filter(m => isCurrentWeek(m.week_start, m.week_end));
  const currentWeekComplete = currentWeekItems.length > 0 && currentWeekItems.every(m => progress.get(m.id)?.completed === true);
  const congratulations = currentWeekComplete ? `<div class="card mission-congrats"><div style="font-size:34px">🎉</div><div><h3 style="margin:0 0 5px">¡Felicidades!</h3><p class="muted" style="margin:0">Has completado todas las misiones para esta semana. 🖤</p></div></div>` : '';
  const section = (title,icon,groups,type,emptyText) => `<section class="mission-section"><div class="mission-section-head"><div><div class="eyebrow">${icon} ${title.toUpperCase()}</div><p class="muted small">${type==='assigned'?'Abre una semana para ver todas sus misiones y completar tus objetivos.':'Abre una semana para consultar las misiones que completaste o cuya semana ya terminó.'}</p></div><span class="mission-count">${groups.length}</span></div><div class="mission-weeks-list">${groupDetails(groups,type) || `<div class="card mission-empty compact"><h3>${emptyText}</h3><p class="muted small">${type==='assigned'?'Cuando Grayxon te asigne nuevas misiones aparecerán aquí.':'Cuando completes misiones o termine una semana, aparecerán aquí.'}</p></div>`}</div></section>`;

  $('#missions').innerHTML = `<div class="missions-page"><div class="row"><div><div class="eyebrow">TUS MISIONES</div><h1 style="margin:7px 0">Tus objetivos 🎯</h1><p class="muted">Tus misiones están organizadas por semanas. Toca una semana para ver todas las misiones que contiene.</p></div><button class="secondary" data-space-action="space">← Tu espacio</button></div>${congratulations}${section('Misiones asignadas','🎯',assignedGroups,'assigned','No tienes misiones asignadas')}${section('Misiones completadas','✓',completedGroups,'completed','Aún no tienes historial de misiones')}</div>`;
}

async function focusNextPendingMission(currentId=null){
  const pending = [...document.querySelectorAll('#missions .mission-week-details:not(.hidden) [data-complete-mission], #missions .mission-week-details:not(.hidden) [data-save-mission]')]
    .filter(b => b.dataset.completeMission !== currentId && b.dataset.saveMission !== currentId);
  if (pending.length) { pending[0].scrollIntoView({behavior:'smooth', block:'center'}); return; }
  // If the current week was collapsed after re-render, open the first week with pending missions.
  const weekCards = [...document.querySelectorAll('#missions [data-mission-week]')];
  for (const card of weekCards) {
    const panel = $('#details-' + card.dataset.missionWeek);
    if (panel?.querySelector('[data-complete-mission], [data-save-mission]')) {
      if (panel.classList.contains('hidden')) { panel.classList.remove('hidden'); card.classList.add('open'); }
      const next = panel.querySelector('[data-complete-mission], [data-save-mission]');
      if (next) { next.scrollIntoView({behavior:'smooth', block:'center'}); return; }
    }
  }
}

async function refreshAfterMissionSave(id){
  await missionsTpl(); bind();
  const currentWeekPending = [...document.querySelectorAll('#missions [data-complete-mission], #missions [data-save-mission]')]
    .filter(b => b.dataset.completeMission !== id && b.dataset.saveMission !== id);
  if (currentWeekPending.length) { 
    const panel = currentWeekPending[0].closest('.mission-week-details');
    if (panel?.classList.contains('hidden')) {
      const card = panel.previousElementSibling?.querySelector('[data-mission-week]');
      panel.classList.remove('hidden'); card?.classList.add('open');
    }
    currentWeekPending[0].scrollIntoView({behavior:'smooth', block:'center'});
  }
}

async function completeMission(id){
  if(!session)return;
  const {error}=await sb.from('mission_progress').upsert({user_id:session.user.id,mission_id:id,value:1,completed:true,updated_at:new Date().toISOString()},{onConflict:'user_id,mission_id'});
  if(error)return toast(error.message);
  toast('Misión guardada ✓'); await refreshAfterMissionSave(id);
}
async function saveMissionProgress(id){
  if(!session)return;
  const input=$(`#missionValue-${id}`); const value=Math.max(0,Number(input?.value||0));
  const {data:m,error:me}=await sb.from('missions').select('target').eq('id',id).single(); if(me)return toast(me.message);
  const completed=true; // Guardar cierra la misión aunque la meta no se haya alcanzado; el porcentaje conserva el avance real.
  const {error}=await sb.from('mission_progress').upsert({user_id:session.user.id,mission_id:id,value,completed,updated_at:new Date().toISOString()},{onConflict:'user_id,mission_id'});
  if(error)return toast(error.message); toast(completed?'Misión guardada ✓':'Avance guardado ✓'); await refreshAfterMissionSave(id);
}

async function trainingTpl() {
  if (!session) {
    $('#training').innerHTML = authTpl('creator');
    return;
  }
  profile = await getProfile();
  if (!profile || !profile.active) {
    await sb.auth.signOut();
    session = null;
    profile = null;
    $('#training').innerHTML = '<div class="login"><h2>Tu acceso está desactivado</h2><p class="muted">Tu acceso al portal de Grayxon ha sido desactivado. Si crees que esto es un error o necesitas volver a ingresar, contacta con tu manager.</p></div>';
    return;
  }

  const { data: modules } = await sb.from('modules').select('id,title,description,sort_order').eq('published', true).order('sort_order');
  const { data: lessons } = await sb.from('lessons').select('id,module_id,title,description,type,content,video_path,resource_path,sort_order').eq('published', true).order('sort_order');
  const { data: progress } = await sb.from('lesson_progress').select('lesson_id').eq('user_id', session.user.id);
  const done = new Set((progress || []).map(x => x.lesson_id));
  const moduleOrder = new Map((modules || []).map((m, i) => [m.id, i]));
  const orderedLessons = [...(lessons || [])].sort((a, b) => {
    const ma = moduleOrder.get(a.module_id) ?? 9999;
    const mb = moduleOrder.get(b.module_id) ?? 9999;
    return ma - mb || (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
  const totalLessons = orderedLessons.length;
  const totalDone = orderedLessons.filter(l => done.has(l.id)).length;
  const totalPct = totalLessons ? Math.round(totalDone / totalLessons * 100) : 0;
  const nextPending = orderedLessons.find(l => !done.has(l.id));

  $('#training').innerHTML = `<div class="row"><div><div class="eyebrow">FORMACIÓN</div><h1 style="margin:7px 0">Aprende con Grayxon 🎓</h1><p class="muted">Avanza por los módulos a tu ritmo. Los videos se completan automáticamente cuando terminan.</p></div><button class="secondary" data-space-action="space">← Tu espacio</button></div>
  <div class="card progress-card" style="margin-top:20px"><div class="row"><div><b>Tu progreso</b><div class="muted small">${totalDone} de ${totalLessons} lecciones completadas</div></div><b class="progress-percent">${totalPct}%</b></div><div class="progress-track"><div class="progress-fill" style="width:${totalPct}%"></div></div></div>
  <div class="training-grid" style="margin-top:22px"><div class="modules-list">${(modules || []).map((m, mi) => { const ml = orderedLessons.filter(l => l.module_id === m.id); const md = ml.filter(l => done.has(l.id)).length; const pct = ml.length ? Math.round(md / ml.length * 100) : 0; return `<div class="module ${pct === 100 && ml.length ? 'module-complete' : ''}"><div class="module-head"><div class="module-number">${String(mi + 1).padStart(2,'0')}</div><div class="module-copy"><div class="module-title">${esc(m.title)}</div><p class="muted small">${esc(m.description || '')}</p></div><div class="module-status">${pct === 100 && ml.length ? '✓' : `${md}/${ml.length}`}</div></div><div class="module-progress"><span style="width:${pct}%"></span></div><div class="module-label">${pct === 100 && ml.length ? 'Módulo completado' : `${md} de ${ml.length} completadas`}</div>${ml.map((l, li) => `<div class="lesson ${done.has(l.id) ? 'lesson-done' : ''} ${nextPending?.id === l.id ? 'lesson-next' : ''}"><button data-lesson="${l.id}"><span class="lesson-index">${done.has(l.id) ? '✓' : li + 1}</span><span class="lesson-text"><strong>${esc(l.title)}</strong><small>${l.type === 'video' ? 'Video' : l.type === 'resource' ? 'Recurso' : 'Contenido'}</small></span></button>${nextPending?.id === l.id ? '<span class="next-badge">SIGUIENTE</span>' : ''}</div>`).join('')}</div>`; }).join('') || '<div class="card"><p class="muted">Todavía no hay formación publicada.</p></div>'}</div><div class="lesson-view" id="lessonView"><div class="empty-lesson"><div class="empty-icon">▶</div><h2>Comienza tu formación</h2><p class="muted">Selecciona una lección para empezar. En móvil, el reproductor ocupará esta pantalla para que puedas ver el contenido sin buscarlo abajo.</p></div></div></div>`;
  window._lessons = orderedLessons;
  window._done = done;
}

async function openLesson(id) {
  const l = (window._lessons || []).find(x => x.id === id);
  if (!l) return;
  selectedLesson = l;
  let media = '';
  if (l.type === 'video' && l.video_path) {
    const { data, error } = await sb.storage.from('training-videos').createSignedUrl(l.video_path, 3600);
    if (!error && data?.signedUrl) media = `<div class="video-wrap"><video id="lessonVideo" class="video" controls playsinline preload="metadata" src="${data.signedUrl}"></video><div id="videoCompletion" class="video-hint">▶ Reproduce el video completo. Al terminar, tu avance se guardará automáticamente.</div></div>`;
  } else if (l.type === 'resource' && l.resource_path) {
    const { data, error } = await sb.storage.from('training-resources').createSignedUrl(l.resource_path, 3600);
    if (!error && data?.signedUrl) media = `<a class="secondary" href="${data.signedUrl}" target="_blank">Abrir recurso</a>`;
  }
  const isVideo = l.type === 'video' && !!l.video_path;
  const alreadyDone = window._done.has(l.id);
  $('#lessonView').innerHTML = `<button class="mobile-back-lessons" id="backToLessons">← Volver a módulos</button><div class="eyebrow">LECCIÓN</div><div class="lesson-header"><div><h2>${esc(l.title)}</h2><p class="muted">${esc(l.description || '')}</p></div><span class="lesson-state ${alreadyDone ? 'completed' : ''}">${alreadyDone ? '✓ COMPLETADA' : isVideo ? 'EN CURSO' : 'PENDIENTE'}</span></div>${media}${l.content ? `<div class="section">${esc(l.content).replace(/\n/g, '<br>')}</div>` : ''}${!isVideo ? `<button class="primary" id="completeLesson">${alreadyDone ? '✓ Lección completada' : 'Completar lección'}</button>` : ''}`;

  if (isVideo) {
    const video = $('#lessonVideo');
    if (video) {
      video.addEventListener('ended', async () => {
        if (window._done.has(l.id)) return;
        const hint = $('#videoCompletion');
        if (hint) hint.textContent = '✓ Video terminado. Guardando tu avance…';
        await completeLesson(l.id, { autoAdvance: true });
      });
    }
  } else {
    $('#completeLesson').onclick = () => completeLesson(l.id);
  }

  // On mobile, show the selected lesson as its own screen instead of placing
  // the player after the entire module list.
  if (window.matchMedia('(max-width: 800px)').matches) {
    const modulesList = $('.modules-list');
    if (modulesList) modulesList.classList.add('mobile-lesson-open');
    $('#lessonView')?.classList.add('mobile-lesson-active');
    $('#backToLessons')?.addEventListener('click', () => {
      modulesList?.classList.remove('mobile-lesson-open');
      $('#lessonView')?.classList.remove('mobile-lesson-active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }
}

async function completeLesson(id, options = {}) {
  const btn = $('#completeLesson');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Guardando…';
  }

  const { error } = await sb.from('lesson_progress').insert({
    user_id: session.user.id,
    lesson_id: id
  });

  if (error && error.code !== '23505') {
    console.error('COMPLETE LESSON ERROR:', error);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Completar lección';
    }
    const hint = $('#videoCompletion');
    if (hint) hint.textContent = 'No pudimos guardar tu avance. Inténtalo nuevamente.';
    toast(`No se pudo guardar: ${error.message || 'error desconocido'}`);
    return;
  }

  window._done.add(id);
  toast('Lección completada ✓');

  const currentIndex = (window._lessons || []).findIndex(x => x.id === id);
  const next = currentIndex >= 0 ? window._lessons[currentIndex + 1] : null;

  await trainingTpl();
  bind();

  if (options.autoAdvance && next) {
    await openLesson(next.id);
    toast(`Siguiente tema: ${next.title}`);
  } else if (options.autoAdvance && !next) {
    $('#lessonView').innerHTML = `<div class="empty-lesson completion-final"><div class="empty-icon">✓</div><h2>¡Formación completada!</h2><p class="muted">Terminaste todas las lecciones disponibles en Grayxon Group.</p></div>`;
    toast('¡Terminaste toda la formación! 🎉');
  } else {
    await openLesson(id);
  }
}

async function adminTpl(c) {
  if (!session) {
    $('#admin').innerHTML = authTpl('admin');
    return;
  }
  profile = await getProfile();
  if (!profile || profile.role !== 'admin') {
    $('#admin').innerHTML = '<div class="login"><h2>Acceso restringido</h2><p class="muted">Esta sección es solo para administradores.</p></div>';
    return;
  }
  let body = '';
  if (adminView === 'dashboard') body = `<div class="card"><h2>Grayxon Group</h2><p class="muted">Panel de administración. Desde aquí controlas el contenido público, creadores y formación.</p><div class="grid"><div class="item"><b>Contenido público</b><p class="muted small">Inicio y beneficios/requisitos.</p></div><div class="item"><b>Creadores</b><p class="muted small">Cuentas con usuario + contraseña.</p></div><div class="item"><b>Formación</b><p class="muted small">Módulos, lecciones y videos privados.</p></div></div></div>`;
  else if (adminView === 'home') body = adminHome(c.home);
  else if (adminView === 'benefits') body = adminBenefits(c.benefits);
  else if (adminView === 'creators') body = await adminCreators();
  else if (adminView === 'teams') body = await adminTeams();
  else body = await adminFormation();
  $('#admin').innerHTML = `<div class="admin-shell"><aside class="admin-side"><b>ADMIN</b><div class="hr"></div>${[['dashboard','Resumen'],['home','Inicio'],['benefits','Beneficios y requisitos'],['creators','Creadores'],['teams','Equipos y managers'],['formation','Formación']].map(([id,t]) => `<button class="${adminView === id ? 'active' : ''}" data-admin="${id}">${t}</button>`).join('')}<div class="hr"></div><button id="adminLogout">Cerrar sesión</button></aside><div>${body}</div></div>`;
}

function field(id, label, val, area = false) {
  return `<div class="field"><label>${label}</label>${area ? `<textarea id="${id}">${esc(val)}</textarea>` : `<input id="${id}" value="${esc(val)}">`}</div>`;
}

function adminHome(h) {
  return `<div class="card"><h2>Inicio</h2>${field('hEy','Etiqueta',h.eyebrow)}${field('hTitle','Título',h.title,true)}${field('hIntro','Introducción',h.intro,true)}${field('hAbout','Quiénes somos',h.about,true)}${field('hBadge','Badge',h.badge)}${field('hCta','Botón',h.cta)}<button class="primary" id="saveHome">Guardar cambios</button></div>`;
}

function adminBenefits(b) {
  const preview = b.image_url ? `<div class="media-preview"><img src="${esc(b.image_url)}" alt="Imagen actual"><div class="muted small">Imagen actual. Selecciona otra para reemplazarla.</div></div>` : `<div class="media-empty">No hay imagen destacada configurada.</div>`;
  return `<div class="card"><h2>Beneficios y requisitos</h2><p class="muted small">Aquí puedes editar el contenido público y agregar una imagen destacada que aparecerá en esta sección.</p>${field('bTitle','Título',b.title || 'Beneficios y requisitos')}${field('bIntro','Introducción',b.intro,true)}<div class="field"><label>Imagen destacada</label><input id="bImage" type="file" accept="image/png,image/jpeg,image/webp"><div id="bImagePreview" style="margin-top:10px">${preview}</div><div class="muted small" style="margin-top:7px">Recomendado: JPG, PNG o WebP. Idealmente 1600 px de ancho o menos.</div></div>${field('bBenefits','Beneficios (uno por línea)',(b.benefits || []).join('\n'),true)}${field('bReq','Requisitos (uno por línea)',(b.requirements || []).join('\n'),true)}<button class="primary" id="saveBenefits">Guardar cambios</button><div id="benefitsProgress" class="muted small" style="margin-top:10px"></div><div id="benefitsErr" class="error"></div></div>`;
}

async function adminCreators() {
  const { data, error } = await sb.from('profiles').select('id,username,full_name,active,role,team_id,manager_id').eq('role','creator').order('full_name');
  if (error) return `<div class="card"><h2>Creadores</h2><div class="error">${esc(error.message)}</div></div>`;
  const [{data:teams},{data:managers}] = await Promise.all([sb.from('teams').select('id,name'),sb.from('managers').select('id,name')]);
  const tm=new Map((teams||[]).map(x=>[x.id,x.name])), mm=new Map((managers||[]).map(x=>[x.id,x.name]));
  return `<div class="card"><div class="row"><div><h2>Creadores</h2><p class="muted small">Cada creador entra con usuario + contraseña. El correo técnico nunca se muestra.</p></div><button class="primary" id="newCreator">+ Crear creador</button></div><div class="list" style="margin-top:18px">${(data || []).map(x => `<div class="item creator-admin-row"><div class="row"><div><b>${esc(x.full_name || x.username)}</b><div class="muted small">@${esc(x.username)}</div><div class="muted small">${esc(tm.get(x.team_id)||'Sin equipo')} · ${esc(mm.get(x.manager_id)||'Sin manager')}</div></div><div class="inline creator-access-actions"><span class="pill ${x.active ? 'ok' : ''}">${x.active ? 'Activo · acceso permitido' : 'Inactivo · acceso bloqueado'}</span><button class="secondary small creator-toggle ${x.active ? 'danger' : 'ok'}" data-toggle-creator="${x.id}">${x.active ? '🔒 Desactivar acceso' : '🔓 Activar acceso'}</button><button class="secondary small" data-view-profile="${x.id}">👤 Perfil y misiones</button></div></div></div>`).join('') || '<p class="muted">Aún no hay creadores.</p>'}</div></div>`;
}


async function adminTeams(){
  const [{data:teams,error:te},{data:managers,error:me}] = await Promise.all([sb.from('teams').select('*').order('name'),sb.from('managers').select('*').order('name')]);
  if(te||me) return `<div class="card"><h2>Equipos y managers</h2><div class="error">${esc((te||me)?.message||'No se pudo cargar la configuración.')}</div></div>`;
  return `<div class="card"><div class="row"><div><h2>Equipos y managers</h2><p class="muted small">Crea equipos, asigna su manager y guarda su WhatsApp con indicativo para que los creadores puedan contactarlo directamente.</p></div><button class="primary" id="newTeamManager">+ Crear equipo</button></div><div class="list" style="margin-top:18px">${(teams||[]).map(t=>{const m=(managers||[]).find(x=>x.id===t.manager_id);return `<div class="item"><div class="row"><div><b>${esc(t.name)}</b><div class="muted small">Manager: ${esc(m?.name||'Sin asignar')}</div><div class="muted small">${m?.phone?`WhatsApp: ${esc(m.phone)}`:'Sin teléfono'}${m?.email?` · ${esc(m.email)}`:''}</div></div><div class="inline"><button class="secondary small" data-edit-team="${t.id}">✏️ Editar</button><button class="secondary small danger" data-delete-team="${t.id}">Eliminar</button></div></div></div>`}).join('')||'<p class="muted">Aún no hay equipos.</p>'}</div></div>`;
}
function teamManagerModal(existing=null){
  const el=document.createElement('div'); el.className='modal-backdrop';
  el.innerHTML=`<div class="card modal"><h2>${existing?'Editar':'Crear'} equipo</h2>${field('tmName','Nombre del equipo',existing?.name||'')}<h3 style="margin-top:18px">Manager</h3>${field('tmManagerName','Nombre completo',existing?.manager?.name||'')}<div class="field"><label>WhatsApp con indicativo</label><input id="tmManagerPhone" value="${esc(existing?.manager?.phone||'')}" placeholder="+573126283007"></div>${field('tmManagerEmail','Correo',existing?.manager?.email||'')}<div id="tmErr" class="error"></div><div class="inline" style="margin-top:18px"><button class="primary" id="saveTeamManager">Guardar</button><button class="secondary" id="cancelTeamManager">Cancelar</button></div></div>`;
  document.body.appendChild(el); $('#cancelTeamManager').onclick=()=>el.remove(); $('#saveTeamManager').onclick=async()=>{const btn=$('#saveTeamManager');btn.disabled=true;const name=$('#tmName').value.trim(),mn=$('#tmManagerName').value.trim(),phone=$('#tmManagerPhone').value.trim(),email=$('#tmManagerEmail').value.trim()||null;if(!name||!mn){$('#tmErr').textContent='Escribe el nombre del equipo y del manager.';btn.disabled=false;return;}try{let managerId=existing?.manager_id||null;if(managerId){const {error}=await sb.from('managers').update({name:mn,phone,email,updated_at:new Date().toISOString()}).eq('id',managerId);if(error)throw error;}else{const {data,error}=await sb.from('managers').insert({name:mn,phone,email}).select('id').single();if(error)throw error;managerId=data.id;}const payload={name,manager_id:managerId,updated_at:new Date().toISOString()};const {error}=existing?await sb.from('teams').update(payload).eq('id',existing.id):await sb.from('teams').insert(payload);if(error)throw error;el.remove();toast(existing?'Equipo actualizado ✓':'Equipo creado ✓');render();}catch(e){$('#tmErr').textContent=e.message||'No se pudo guardar.';btn.disabled=false;}};
}
async function editTeam(id){const {data:t,error}=await sb.from('teams').select('*').eq('id',id).single();if(error||!t)return toast(error?.message||'No se encontró el equipo.');const {data:m}=t.manager_id?await sb.from('managers').select('*').eq('id',t.manager_id).maybeSingle():{data:null};teamManagerModal({...t,manager:m});}
async function deleteTeam(id){if(!confirm('¿Eliminar este equipo? Los creadores quedarán sin equipo asignado.'))return;await sb.from('profiles').update({team_id:null,manager_id:null}).eq('team_id',id);const {data:t}=await sb.from('teams').select('manager_id').eq('id',id).maybeSingle();if(t?.manager_id)await sb.from('managers').delete().eq('id',t.manager_id);const {error}=await sb.from('teams').delete().eq('id',id);if(error)return toast(error.message);toast('Equipo eliminado');render();}

function localDateISO(d){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function currentWeekRange(){
  const now=new Date();
  const day=now.getDay();
  const diffToMonday=day===0 ? -6 : 1-day;
  const start=new Date(now); start.setDate(now.getDate()+diffToMonday);
  const end=new Date(start); end.setDate(start.getDate()+6);
  return {start:localDateISO(start), end:localDateISO(end)};
}
function validMissionLink(url){
  if(!url) return null;
  const v=url.trim();
  if(!v) return null;
  try { const u=new URL(v); return ['http:','https:'].includes(u.protocol) ? u.href : null; }
  catch { return null; }
}

async function adminProfileModal(id){
  const [{data:d,error:de},{data:pm,error:pe},{data:p,error:pr},{data:missions,error:me},{data:progress,error:mpe}] = await Promise.all([
    sb.from('profile_details').select('*').eq('user_id',id).maybeSingle(),
    sb.from('payment_methods').select('*').eq('user_id',id).order('is_primary',{ascending:false}).limit(1).maybeSingle(),
    sb.from('profiles').select('id,username,full_name,active,team_id,manager_id').eq('id',id).single(),
    sb.from('missions').select('id,title,description,type,target,week_start,week_end,assigned_to,published,link_url,created_at').eq('assigned_to',id).order('week_start',{ascending:false}).order('created_at',{ascending:false}),
    sb.from('mission_progress').select('mission_id,value,completed').eq('user_id',id)
  ]);
  if(pr) return toast(pr.message);
  if(me) return toast(me.message);
  const [{data:teams},{data:managers}] = await Promise.all([sb.from('teams').select('id,name,manager_id').order('name'),sb.from('managers').select('id,name').order('name')]);
  const modalEl=document.createElement('div'); modalEl.className='modal-backdrop';
  const safe=x=>x?esc(x):'—';
  const today=new Date().toISOString().slice(0,10);
  const prog=new Map((progress||[]).map(x=>[x.mission_id,x]));
  const missionPct=m=>{const x=prog.get(m.id);if(!x)return 0;if(m.type==='checkbox')return x.completed?100:0;return Number(m.target)>0?Math.min(100,Math.round(Number(x.value||0)/Number(m.target)*100)):0;};
  const finished=m=>missionPct(m)>=100 || (!!m.week_end && m.week_end < today);
  const renderMissionRow=m=>{const pct=missionPct(m), expired=!!m.week_end&&m.week_end<today&&pct<100;return `<div class="item creator-mission-row ${pct>=100?'creator-mission-done':''}"><div class="row"><div><b>${esc(m.title)}</b><div class="muted small">${esc(m.description||'')}</div><div class="muted small" style="margin-top:5px">${m.type==='checkbox'?'Marcable':'Meta numérica'}${m.type==='numeric'?` · ${Number(m.target||0).toLocaleString('es-CO')}`:''}${m.week_start||m.week_end?` · ${esc(m.week_start||'')} → ${esc(m.week_end||'')}`:''}</div>${m.link_url?`<a class="mission-admin-link" href="${esc(m.link_url)}" target="_blank" rel="noopener noreferrer">🔗 ${esc(m.link_url)}</a>`:''}</div><div class="inline creator-mission-actions"><span class="pill ${m.published?'ok':''}">${m.published?'Publicada':'Oculta'}</span><span class="pill ${pct>=100?'ok':''}">${pct}%</span>${pct>=100?'<span class="pill ok">✓ Completada</span>':expired?'<span class="pill">Semana finalizada</span>':''}<button class="secondary small" data-edit-creator-mission="${m.id}" data-creator-id="${id}">Editar</button><button class="secondary small ${m.published?'danger':'ok'}" data-toggle-creator-mission="${m.id}" data-creator-id="${id}">${m.published?'Ocultar':'Publicar'}</button><button class="secondary small danger" data-delete-creator-mission="${m.id}" data-creator-id="${id}">Eliminar</button></div></div><div class="space-progress" style="margin-top:10px"><span style="width:${pct}%"></span></div></div>`;};
  const groupedWeeks=(()=>{
    const map=new Map();
    for(const m of (missions||[])){
      const key=`${m.week_start||'sin-inicio'}|${m.week_end||'sin-fin'}`;
      if(!map.has(key)) map.set(key,{start:m.week_start||'',end:m.week_end||'',items:[]});
      map.get(key).items.push(m);
    }
    return Array.from(map.values()).sort((a,b)=>String(b.start||'').localeCompare(String(a.start||'')));
  })();
  const adminWeekLabel=(start,end)=>start||end?`${start||'—'} → ${end||'—'}`:'Sin semana';
  const adminWeekCard=(g,i)=>{
    const weekPanelId=`adminMissionWeek-${i}`;
    const done=g.items.filter(m=>missionPct(m)>=100).length;
    const avg=g.items.length?Math.round(g.items.reduce((sum,m)=>sum+missionPct(m),0)/g.items.length):0;
    const current=today>=g.start && today<=g.end;
    const publishedCount=g.items.filter(m=>m.published).length;
    const notifyLabel=publishedCount?'🔔 Notificar':'Sin misiones publicadas';
    return `<div class="mission-week-group admin-mission-week-group"><div class="admin-week-card-row"><button type="button" class="mission-week-card admin-mission-week-card" data-admin-mission-week="${weekPanelId}" aria-expanded="false"><div class="mission-week-icon">🎯</div><div class="mission-week-main"><div class="mission-week-top"><strong>Misiones ${esc(adminWeekLabel(g.start,g.end))}</strong><span>${avg}%</span></div><p>${g.items.length} ${g.items.length===1?'misión':'misiones'} · ${done} completada${done===1?'':'s'}${current?' · Semana actual':''}</p><div class="space-progress"><span style="width:${avg}%"></span></div></div><b class="mission-week-arrow">›</b></button><button type="button" class="secondary small mission-notify-btn admin-week-notify" data-notify-mission-week="${esc(g.start)}|${esc(g.end)}" data-creator-id="${esc(id)}" ${publishedCount?'':'disabled'}>${notifyLabel}</button></div><div class="mission-week-details hidden" id="${weekPanelId}">${g.items.map(renderMissionRow).join('')}</div></div>`;
  };
  const missionWeeksHtml=groupedWeeks.map(adminWeekCard).join('') || `<div class="item"><p class="muted small" style="margin:0">Aún no hay misiones asignadas a este creador.</p></div>`;
  modalEl.innerHTML=`<div class="card modal creator-profile-modal"><div class="row"><div><h2>${safe(p.full_name||p.username)}</h2><div class="muted small">@${safe(p.username)} · ${p.active?'Activo':'Inactivo'}</div></div><button class="secondary" id="closeProfileModal">Cerrar</button></div><div class="hr"></div><h3>Información personal</h3><div class="list"><div class="item">Correo: ${safe(d?.email)}</div><div class="item">Teléfono: ${safe(d?.phone)}</div><div class="item">Ubicación: ${safe(d?.country)} · ${safe(d?.state_region)} · ${safe(d?.city)}</div><div class="item">Dirección: ${safe(d?.address)}</div></div><h3 style="margin-top:22px">Pago</h3><div class="list">${pm?.method_type==='paypal'?`<div class="item">PayPal: ${safe(pm.paypal_email)}</div>`:`<div class="item">Banco: ${safe(pm?.bank_name)} · ${safe(pm?.bank_country)}</div><div class="item">Tipo: ${safe(pm?.account_type==='savings'?'Ahorros':pm?.account_type==='checking'?'Corriente':pm?.account_type)}</div><div class="item">Cuenta: <span class="sensitive-value">${safe(pm?.account_number)}</span></div>`}</div><div class="card" style="margin-top:16px"><h3>Equipo y manager</h3><div class="grid"><label class="field"><span>Equipo</span><select id="adminCreatorTeam"><option value="">Sin equipo</option>${(teams||[]).map(t=>`<option value="${t.id}" ${p.team_id===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select></label><div class="field"><span>Manager asignado</span><div id="adminCreatorManagerPreview" class="item" style="min-height:44px;display:flex;align-items:center">${esc((managers||[]).find(m=>m.id===p.manager_id)?.name||'Selecciona un equipo')}</div></div></div><p class="muted small" style="margin:8px 0 12px">El manager pertenece al equipo. Al seleccionar un equipo, el manager se asigna automáticamente.</p><button class="primary small" id="saveCreatorAssignment">Guardar asignación</button></div><div class="creator-missions-section"><div class="row"><div><h3 style="margin-bottom:3px">🎯 Misiones del creador</h3><p class="muted small" style="margin:0">Agrega todas las misiones que necesites directamente aquí. Puedes tener varias por semana.</p></div><button class="primary small" id="newCreatorMission">+ Agregar misión</button></div><div class="creator-mission-group"><div class="row"><div><h3 style="margin-bottom:3px">📅 Misiones por semana</h3><p class="muted small" style="margin:0">Abre una semana para ver todas las misiones de ese periodo, junto con su progreso y estado.</p></div><span class="mission-count">${groupedWeeks.length}</span></div><div class="mission-weeks-list" style="margin-top:12px">${missionWeeksHtml}</div></div></div></div>`;
  document.body.appendChild(modalEl);
  $('#closeProfileModal').onclick=()=>modalEl.remove();
  const syncCreatorManagerPreview=async()=>{const teamId=$('#adminCreatorTeam')?.value||'';const preview=$('#adminCreatorManagerPreview');if(!preview)return;if(!teamId){preview.textContent='Sin equipo / sin manager';return;}const {data:t}=await sb.from('teams').select('manager_id').eq('id',teamId).maybeSingle();const managerId=t?.manager_id||null;const {data:m}=managerId?await sb.from('managers').select('name').eq('id',managerId).maybeSingle():{data:null};preview.textContent=m?.name||'Este equipo no tiene manager asignado';};
  $('#adminCreatorTeam')?.addEventListener('change',syncCreatorManagerPreview);
  $('#saveCreatorAssignment').onclick=async()=>{const btn=$('#saveCreatorAssignment');btn.disabled=true;const teamId=$('#adminCreatorTeam').value||null;let managerId=null;if(teamId){const {data:t,error:te}=await sb.from('teams').select('manager_id').eq('id',teamId).maybeSingle();if(te){toast(te.message);btn.disabled=false;return;}managerId=t?.manager_id||null;}const {error}=await sb.from('profiles').update({team_id:teamId,manager_id:managerId}).eq('id',id);if(error){toast(error.message);btn.disabled=false;return;}toast('Equipo y manager actualizados ✓');modalEl.remove();await adminProfileModal(id);};
  $('#newCreatorMission').onclick=()=>creatorMissionModal(id);
  modalEl.querySelectorAll('[data-edit-creator-mission]').forEach(b=>b.onclick=()=>creatorMissionModal(id,b.dataset.editCreatorMission));
  modalEl.querySelectorAll('[data-toggle-creator-mission]').forEach(b=>b.onclick=async()=>{const {data,error}=await sb.from('missions').select('published').eq('id',b.dataset.toggleCreatorMission).single();if(error)return toast(error.message);const {error:e}=await sb.from('missions').update({published:!data.published}).eq('id',b.dataset.toggleCreatorMission);if(e)return toast(e.message);toast(data.published?'Misión ocultada':'Misión publicada ✓');modalEl.remove();await adminProfileModal(id);});
  modalEl.querySelectorAll('[data-delete-creator-mission]').forEach(b=>b.onclick=async()=>{if(!confirm('¿Eliminar esta misión y su progreso?'))return;const {error}=await sb.from('missions').delete().eq('id',b.dataset.deleteCreatorMission);if(error)return toast(error.message);toast('Misión eliminada');modalEl.remove();await adminProfileModal(id);});
  modalEl.querySelectorAll('[data-admin-mission-week]').forEach(b=>b.onclick=()=>{const panel=$('#'+b.dataset.adminMissionWeek);if(panel){const open=panel.classList.toggle('hidden')===false;b.classList.toggle('open',open);b.setAttribute('aria-expanded',String(open));}});
  modalEl.querySelectorAll('[data-notify-mission-week]').forEach(b=>b.onclick=async(e)=>{
    e.stopPropagation();
    const [start,end]=String(b.dataset.notifyMissionWeek||'').split('|');
    const group=groupedWeeks.find(g=>g.start===start&&g.end===end);
    if(!group) return;
    const publishedCount=group.items.filter(m=>m.published).length;
    if(!publishedCount) return toast('No hay misiones publicadas para notificar.');
    b.disabled=true; b.textContent='Enviando…';
    const ok=await notifyMissionWeek(id,start,end,publishedCount);
    b.disabled=false; b.textContent=ok?'✓ Notificado':'🔔 Notificar';
  });
}

async function creatorMissionModal(creatorId, existingId=null){
  let existing=null;
  if(existingId){const {data,error}=await sb.from('missions').select('*').eq('id',existingId).single();if(error)return toast(error.message);existing=data;}
  const week=currentWeekRange();
  const el=document.createElement('div'); el.className='modal-backdrop';
  const creatorName=(await sb.from('profiles').select('full_name,username').eq('id',creatorId).single()).data;
  const missionFields=(i,data={})=>`<div class="mission-batch-item" data-mission-item="${i}"><div class="row" style="align-items:center"><div><div class="eyebrow">MISIÓN ${i+1}</div></div>${i>0?`<button type="button" class="secondary small danger" data-remove-mission="${i}">Eliminar</button>`:''}</div>${field(`cmTitle${i}`,'Título',data.title||'')}${field(`cmDesc${i}`,'Descripción',data.description||'',true)}<label class="field"><span>Tipo</span><select id="cmType${i}"><option value="checkbox" ${data.type!=='numeric'?'selected':''}>Marcable</option><option value="numeric" ${data.type==='numeric'?'selected':''}>Meta numérica</option></select></label>${field(`cmTarget${i}`,'Meta numérica (si aplica)',data.target||'')} ${field(`cmLink${i}`,'Link clickeable (opcional)',data.link_url||'')}<label class="field"><span>Estado</span><select id="cmPublished${i}"><option value="true" ${data.published!==false?'selected':''}>Publicada</option><option value="false" ${data.published===false?'selected':''}>Oculta</option></select></label></div>`;
  const headerDates=`<div class="creator-mission-week-box"><div><div class="eyebrow">SEMANA DE MISIONES</div><p class="muted small" style="margin:4px 0 0">Todas las misiones que agregues aquí se enviarán juntas al mismo creador y compartirán esta semana.</p></div><div class="grid"><div class="field"><label>Inicio</label><input id="cmStart" type="date" value="${existing?.week_start||week.start}"></div><div class="field"><label>Fin</label><input id="cmEnd" type="date" value="${existing?.week_end||week.end}"></div></div></div>`;
  el.innerHTML=`<div class="card modal creator-mission-batch-modal"><div class="row"><div><div class="eyebrow">MISIÓN DEL CREADOR</div><h2>${existing?'Editar misión':'Agregar misiones'}</h2></div><button class="secondary" id="cancelCreatorMission">Cerrar</button></div>${headerDates}<div id="missionBatchList">${missionFields(0,existing||{})}</div>${existing?'':'<div class="creator-mission-add-row"><button type="button" class="secondary" id="addAnotherMission">＋ Agregar otra</button><span class="muted small">Puedes agregar todas las misiones que necesites para esta semana.</span></div>'}<div class="creator-mission-target-note">${existing?'Esta misión pertenece exclusivamente a ': 'Estas misiones se asignarán exclusivamente a '}<b>${esc(creatorName?.full_name || creatorName?.username || 'este creador')}</b>.</div><div class="mission-form-actions" style="margin-top:18px"><button class="primary" id="saveCreatorMission">${existing?'Guardar cambios':'Enviar'}</button></div><div id="creatorMissionErr" class="error"></div></div>`;
  document.body.appendChild(el);
  $('#cancelCreatorMission').onclick=()=>el.remove();

  let count=1;
  if(!existing){
    $('#addAnotherMission').onclick=()=>{
      const list=$('#missionBatchList');
      list.insertAdjacentHTML('beforeend',missionFields(count,{}));
      const item=list.lastElementChild;
      item.scrollIntoView({behavior:'smooth',block:'nearest'});
      item.querySelector(`[data-remove-mission="${count}"]`).onclick=()=>item.remove();
      count++;
    };
  }

  $('#saveCreatorMission').onclick=async()=>{
    const btn=$('#saveCreatorMission'); btn.disabled=true;
    const err=$('#creatorMissionErr'); err.textContent='';
    const start=$('#cmStart').value||null,endDate=$('#cmEnd').value||null;
    if(!start||!endDate){err.textContent='Define el inicio y fin de la semana.';btn.disabled=false;return;}
    if(start>endDate){err.textContent='La fecha de inicio no puede ser posterior a la fecha final.';btn.disabled=false;return;}
    const items=Array.from(document.querySelectorAll('#missionBatchList [data-mission-item]'));
    const payloads=[];
    for(let pos=0;pos<items.length;pos++){
      const item=items[pos];
      const i=Number(item.dataset.missionItem||pos);
      const title=item.querySelector(`#cmTitle${i}`)?.value.trim()||'';
      const description=item.querySelector(`#cmDesc${i}`)?.value.trim()||'';
      const type=item.querySelector(`#cmType${i}`)?.value||'checkbox';
      const target=Math.max(0,Number(item.querySelector(`#cmTarget${i}`)?.value||0));
      const rawLink=item.querySelector(`#cmLink${i}`)?.value.trim()||'';
      const link=validMissionLink(rawLink);
      if(!title){err.textContent=`Escribe el título de la misión ${i+1}.`;btn.disabled=false;return;}
      if(type==='numeric'&&!target){err.textContent=`Define una meta numérica para la misión ${i+1}.`;btn.disabled=false;return;}
      if(rawLink&&!link){err.textContent=`El link de la misión ${i+1} debe comenzar con http:// o https://`;btn.disabled=false;return;}
      payloads.push({title,description,type,target,week_start:start,week_end:endDate,assigned_to:creatorId,published:existing?$(`#cmPublished${i}`).value==='true':$(`#cmPublished${i}`).value==='true',link_url:link});
    }
    let result;
    if(existing){ result=await sb.from('missions').update(payloads[0]).eq('id',existingId); }
    else { result=await sb.from('missions').insert(payloads); }
    if(result.error){err.textContent=result.error.message;btn.disabled=false;return;}
    toast(existing?'Misión actualizada ✓':`${payloads.length} misión${payloads.length===1?'':'es'} enviada${payloads.length===1?'':'s'} ✓`);
    el.remove();
    const old=document.querySelector('.creator-profile-modal')?.parentElement;if(old)old.remove();
    await adminProfileModal(creatorId);
  };
}

async function toggleCreator(id) {
  const { data: cur, error: readError } = await sb.from('profiles').select('id,username,full_name,active').eq('id', id).single();
  if (readError || !cur) return toast(readError?.message || 'No se encontró el creador.');
  const next = !cur.active;
  const { error } = await sb.from('profiles').update({ active: next }).eq('id', id);
  if (error) return toast(error.message);
  toast(next ? `Acceso activado para @${cur.username} ✓` : `Acceso bloqueado para @${cur.username} ✓`);
  render();
}

async function creatorModal() {
  const {data:teams} = await sb.from('teams').select('id,name').order('name');
  const el = document.createElement('div'); el.className = 'modal-backdrop';
  el.innerHTML = `<div class="card modal"><h2>Crear creador</h2>${field('newName','Nombre completo','')}${field('newUser','Usuario','')}${field('newPass','Contraseña','')}<label class="field"><span>Equipo</span><select id="newTeam"><option value="">Sin equipo</option>${(teams||[]).map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label><div class="field"><span>Manager asignado</span><div id="newManagerPreview" class="item" style="min-height:44px;display:flex;align-items:center">Selecciona un equipo</div></div><div class="muted small">El manager se toma automáticamente del equipo seleccionado. Mínimo 8 caracteres. El creador solo verá su usuario, nunca el correo técnico.</div><div class="inline" style="margin-top:18px"><button class="primary" id="createCreator">Crear cuenta</button><button class="secondary" id="cancelCreator">Cancelar</button></div><div id="createErr" class="error"></div></div>`;
  document.body.appendChild(el); const syncNewManager=async()=>{const teamId=$('#newTeam')?.value||'';const preview=$('#newManagerPreview');if(!preview)return;if(!teamId){preview.textContent='Sin equipo / sin manager';return;}const {data:t}=await sb.from('teams').select('manager_id').eq('id',teamId).maybeSingle();const managerId=t?.manager_id||null;const {data:m}=managerId?await sb.from('managers').select('name').eq('id',managerId).maybeSingle():{data:null};preview.textContent=m?.name||'Este equipo no tiene manager asignado';}; $('#newTeam')?.addEventListener('change',syncNewManager); syncNewManager(); $('#cancelCreator').onclick=()=>el.remove(); $('#createCreator').onclick=async()=>{const btn=$('#createCreator');btn.disabled=true;try{const username=$('#newUser').value.trim(),full_name=$('#newName').value.trim(),password=$('#newPass').value,team_id=$('#newTeam').value||null;let manager_id=null;if(team_id){const {data:t,error:te}=await sb.from('teams').select('manager_id').eq('id',team_id).maybeSingle();if(te)throw te;manager_id=t?.manager_id||null;}const {data,error}=await sb.functions.invoke('create-creator',{body:{username,full_name,password}});if(error||data?.error)throw new Error(data?.error||error.message);const creatorId=data?.user?.id||data?.profile?.id||data?.id;let id=creatorId;if(!id){const {data:p}=await sb.from('profiles').select('id').eq('username',username.toLowerCase()).maybeSingle();id=p?.id;}if(!id)throw new Error('La cuenta se creó, pero no pudimos recuperar el creador para asignarle equipo y manager.');const {error:ae}=await sb.from('profiles').update({team_id,manager_id}).eq('id',id);if(ae)throw ae;el.remove();toast('Creador creado y asignado ✓');render();}catch(e){$('#createErr').textContent=e.message||'No se pudo crear el creador.';btn.disabled=false;}};
}


async function adminFormation() {
  const { data: mods, error: modError } = await sb.from('modules').select('id,title,description,sort_order,published').order('sort_order');
  if (modError) return `<div class="card"><h2>Formación</h2><div class="error">${esc(modError.message)}</div></div>`;
  const { data: lessons, error: lessonError } = await sb.from('lessons').select('id,module_id,title,description,type,content,video_path,resource_path,sort_order,published').order('sort_order');
  if (lessonError) return `<div class="card"><h2>Formación</h2><div class="error">${esc(lessonError.message)}</div></div>`;

  const byModule = {};
  (lessons || []).forEach(l => (byModule[l.module_id] ||= []).push(l));

  return `<div class="card"><div class="row"><div><h2>Formación</h2><p class="muted small">Construye la academia por módulos y lecciones. Los videos y recursos pueden quedar privados.</p></div><button class="primary" id="newModule">+ Crear módulo</button></div>
  <div class="list" style="margin-top:18px">${(mods || []).map((m, idx) => moduleAdminCard(m, byModule[m.id] || [], idx, mods.length)).join('') || '<div class="item"><p class="muted">Aún no hay módulos. Crea el primero.</p></div>'}</div></div>`;
}

function moduleAdminCard(m, lessons, idx, total) {
  return `<div class="item module-admin"><div class="row"><div><b style="font-size:16px">${esc(m.title)}</b><div class="muted small">${esc(m.description || 'Sin descripción')}</div><div class="muted small" style="margin-top:6px">${lessons.length} ${lessons.length === 1 ? 'lección' : 'lecciones'}</div></div><span class="pill ${m.published ? 'ok' : ''}">${m.published ? 'Publicado' : 'Borrador'}</span></div>
  <div class="inline" style="margin-top:12px"><button class="secondary small" data-edit-module="${m.id}">✏️ Editar</button><button class="secondary small" data-toggle-module="${m.id}">${m.published ? 'Ocultar' : 'Publicar'}</button><button class="secondary small" data-move-module="up:${m.id}" ${idx === 0 ? 'disabled' : ''}>↑</button><button class="secondary small" data-move-module="down:${m.id}" ${idx === total - 1 ? 'disabled' : ''}>↓</button><button class="secondary small danger" data-delete-module="${m.id}">Eliminar</button></div>
  <div class="hr"></div><div class="row"><b>Lecciones</b><button class="secondary small" data-new-lesson="${m.id}">+ Añadir lección</button></div>
  <div class="list" style="margin-top:9px">${lessons.map((l, li) => lessonAdminRow(l, m.id, li, lessons.length)).join('') || '<span class="muted small">Sin lecciones todavía.</span>'}</div></div>`;
}

function lessonAdminRow(l, moduleId, idx, total) {
  const source = l.type === 'video' ? 'Video' : l.type === 'resource' ? 'Recurso' : 'Texto';
  return `<div class="item" style="padding:11px 12px"><div class="row"><div><b>${esc(l.title)}</b><div class="muted small">${source} · ${l.published ? 'Publicado' : 'Borrador'}${l.video_path || l.resource_path ? ' · Archivo cargado' : ''}</div></div><span class="pill ${l.published ? 'ok' : ''}">${l.published ? 'Publicado' : 'Borrador'}</span></div><div class="inline" style="margin-top:9px"><button class="secondary small" data-edit-lesson="${l.id}">✏️ Editar</button><button class="secondary small" data-toggle-lesson="${l.id}">${l.published ? 'Ocultar' : 'Publicar'}</button><button class="secondary small" data-move-lesson="up:${l.id}" ${idx === 0 ? 'disabled' : ''}>↑</button><button class="secondary small" data-move-lesson="down:${l.id}" ${idx === total - 1 ? 'disabled' : ''}>↓</button><button class="secondary small danger" data-delete-lesson="${l.id}">Eliminar</button></div></div>`;
}

function modal(html) {
  const el = document.createElement('div');
  el.className = 'modal-backdrop';
  el.innerHTML = `<div class="card modal">${html}</div>`;
  document.body.appendChild(el);
  return el;
}

async function newModule() {
  const el = modal(`<h2>Crear módulo</h2>${field('moduleTitle','Nombre del módulo','')}${field('moduleDesc','Descripción breve','',true)}<div class="inline"><button class="primary" id="saveModule">Crear módulo</button><button class="secondary" id="closeModal">Cancelar</button></div><div id="moduleErr" class="error"></div>`);
  $('#closeModal').onclick = () => el.remove();
  $('#saveModule').onclick = async () => {
    const title = $('#moduleTitle').value.trim();
    const description = $('#moduleDesc').value.trim();
    if (!title) { $('#moduleErr').textContent = 'Escribe un nombre para el módulo.'; return; }
    const { data: last } = await sb.from('modules').select('sort_order').order('sort_order', { ascending: false }).limit(1);
    const order = (last?.[0]?.sort_order ?? -1) + 1;
    const { error } = await sb.from('modules').insert({ title, description, sort_order: order, published: false });
    if (error) { $('#moduleErr').textContent = error.message; return; }
    el.remove(); toast('Módulo creado ✓'); render();
  };
}

async function editModule(id) {
  const { data: m, error } = await sb.from('modules').select('*').eq('id', id).single();
  if (error || !m) return toast(errorText(error, 'No se encontró el módulo.'));
  const el = modal(`<h2>Editar módulo</h2>${field('moduleTitle','Nombre del módulo',m.title)}${field('moduleDesc','Descripción breve',m.description || '',true)}<label class="field"><span style="display:block;color:#999;font-size:12px;margin-bottom:6px">Estado</span><select id="modulePublished"><option value="false" ${!m.published ? 'selected' : ''}>Borrador</option><option value="true" ${m.published ? 'selected' : ''}>Publicado</option></select></label><div class="inline"><button class="primary" id="saveModule">Guardar cambios</button><button class="secondary" id="closeModal">Cancelar</button></div><div id="moduleErr" class="error"></div>`);
  $('#closeModal').onclick = () => el.remove();
  $('#saveModule').onclick = async () => {
    const title = $('#moduleTitle').value.trim();
    if (!title) { $('#moduleErr').textContent = 'Escribe un nombre para el módulo.'; return; }
    const nextPublished = $('#modulePublished').value === 'true';
    const { data: before } = await sb.from('modules').select('published,title').eq('id', id).single();
    const { error } = await sb.from('modules').update({ title, description: $('#moduleDesc').value.trim(), published: nextPublished }).eq('id', id);
    if (error) { $('#moduleErr').textContent = error.message; return; }
    if (!before?.published && nextPublished) await notifyCreators('Nuevo contenido de formación', `Se ha agregado nuevo contenido para tu formación: ${title}.`, 'training');
    el.remove(); toast('Módulo actualizado ✓'); render();
  };
}

async function newLesson(moduleId) {
  const el = modal(lessonForm(null, moduleId));
  bindLessonForm(el, null, moduleId);
}

function lessonForm(l, moduleId) {
  return `<h2>${l ? 'Editar lección' : 'Nueva lección'}</h2><p class="muted small">${l ? 'Actualiza el contenido de esta lección.' : 'Añade una lección al módulo seleccionado.'}</p>${field('lessonTitle','Título',l?.title || '')}${field('lessonDesc','Descripción',l?.description || '',true)}<label class="field"><span style="display:block;color:#999;font-size:12px;margin-bottom:6px">Tipo de contenido</span><select id="lessonType"><option value="video" ${l?.type === 'video' ? 'selected' : ''}>Video</option><option value="text" ${l?.type === 'text' ? 'selected' : ''}>Texto</option><option value="resource" ${l?.type === 'resource' ? 'selected' : ''}>Recurso descargable</option></select></label>${field('lessonContent','Contenido / texto de la lección',l?.content || '',true)}<div class="field" id="fileField"><label id="fileLabel">${l?.type === 'resource' ? 'Archivo del recurso' : 'Video de la lección'}</label><input id="lessonFile" type="file" ${l ? '' : ''}><div id="currentFile" class="muted small">${l?.video_path || l?.resource_path ? 'Ya hay un archivo cargado. Puedes reemplazarlo seleccionando otro.' : 'Puedes dejarlo vacío y cargarlo después.'}</div></div><label class="field"><span style="display:block;color:#999;font-size:12px;margin-bottom:6px">Estado</span><select id="lessonPublished"><option value="false" ${!l?.published ? 'selected' : ''}>Borrador</option><option value="true" ${l?.published ? 'selected' : ''}>Publicado</option></select></label><div class="inline"><button class="primary" id="saveLesson">${l ? 'Guardar cambios' : 'Crear lección'}</button><button class="secondary" id="closeModal">Cancelar</button></div><div id="lessonErr" class="error"></div><div id="lessonProgress" class="muted small"></div>`;
}

function bindLessonForm(el, lesson, moduleId) {
  $('#closeModal').onclick = () => el.remove();
  const type = $('#lessonType');
  const file = $('#lessonFile');
  const label = $('#fileLabel');
  const content = $('#lessonContent');
  const updateType = () => {
    label.textContent = type.value === 'resource' ? 'Archivo del recurso' : 'Video de la lección';
    file.accept = type.value === 'video' ? 'video/*' : type.value === 'resource' ? '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.txt' : '';
    file.disabled = type.value === 'text';
    content.placeholder = type.value === 'text' ? 'Escribe aquí el contenido de la lección…' : 'Puedes añadir texto adicional que acompañe el archivo…';
  };
  type.onchange = updateType; updateType();
  $('#saveLesson').onclick = () => saveLesson(lesson, moduleId, el);
}

function safeFileName(name) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

async function uploadLargeFileResumable(bucket, path, file, progressEl) {
  const MAX_FREE_BYTES = 50 * 1024 * 1024;
  if (file.size > MAX_FREE_BYTES) {
    throw new Error(`Este archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. Tu proyecto Supabase Free permite archivos de hasta 50 MB. Para subirlo necesitas reducir su tamaño a menos de 50 MB o aumentar el límite del proyecto.`);
  }

  const { data: sessionData, error: sessionError } = await sb.auth.getSession();
  if (sessionError || !sessionData?.session?.access_token) {
    throw new Error('Tu sesión expiró. Cierra sesión, vuelve a entrar y prueba de nuevo.');
  }

  if (!window.tus?.Upload) {
    throw new Error('No se pudo cargar el motor de subida resumible. Recarga la página e inténtalo nuevamente.');
  }

  const projectId = GRAYXON_CONFIG.SUPABASE_URL.replace('https://', '').split('.')[0];
  const endpoint = `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`;
  const token = sessionData.session.access_token;

  return await new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${token}`,
        'x-upsert': 'false'
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: file.type || 'application/octet-stream',
        cacheControl: '3600'
      },
      chunkSize: 6 * 1024 * 1024,
      onError: (error) => reject(error),
      onProgress: (bytesUploaded, bytesTotal) => {
        const pct = Math.min(100, (bytesUploaded / bytesTotal) * 100);
        progressEl.textContent = `Subiendo archivo… ${pct.toFixed(0)}%`;
      },
      onSuccess: () => resolve(upload)
    });

    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length) {
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }
      upload.start();
    }).catch(reject);
  });
}

async function saveLesson(existing, moduleId, el) {
  const title = $('#lessonTitle').value.trim();
  const description = $('#lessonDesc').value.trim();
  const type = $('#lessonType').value;
  const content = $('#lessonContent').value;
  const published = $('#lessonPublished').value === 'true';
  const file = $('#lessonFile').files?.[0] || null;
  const err = $('#lessonErr');
  const progress = $('#lessonProgress');
  if (!title) { err.textContent = 'Escribe un título para la lección.'; return; }
  if (type === 'video' && file && !file.type.startsWith('video/')) { err.textContent = 'Selecciona un archivo de video válido.'; return; }
  if (type === 'resource' && !file && !existing?.resource_path) { err.textContent = 'Selecciona el archivo del recurso.'; return; }
  const btn = $('#saveLesson'); btn.disabled = true;
  try {
    let video_path = existing?.video_path || null;
    let resource_path = existing?.resource_path || null;
    if (type !== 'video') video_path = null;
    if (type !== 'resource') resource_path = null;
    if (file && type !== 'text') {
      progress.textContent = 'Subiendo archivo…';
      const bucket = type === 'video' ? 'training-videos' : 'training-resources';
      const path = `${moduleId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      if (type === 'video') {
        await uploadLargeFileResumable(bucket, path, file, progress);
      } else {
        progress.textContent = 'Subiendo archivo…';
        const { error: uploadError } = await sb.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (uploadError) throw uploadError;
      }
      if (type === 'video') video_path = path; else resource_path = path;
      if (existing?.video_path && type === 'video') await sb.storage.from('training-videos').remove([existing.video_path]);
      if (existing?.resource_path && type === 'resource') await sb.storage.from('training-resources').remove([existing.resource_path]);
    }
    let sort_order = existing?.sort_order;
    if (sort_order == null) {
      const { data: last } = await sb.from('lessons').select('sort_order').eq('module_id', moduleId).order('sort_order', { ascending: false }).limit(1);
      sort_order = (last?.[0]?.sort_order ?? -1) + 1;
    }
    const payload = { module_id: moduleId, title, description, type, content, video_path, resource_path, sort_order, published };
    const wasPublished = !!existing?.published;
    const result = existing ? await sb.from('lessons').update(payload).eq('id', existing.id) : await sb.from('lessons').insert(payload);
    if (result.error) throw result.error;
    if (published && !wasPublished) await notifyCreators('Nuevo contenido de formación', `Se ha agregado nuevo contenido para tu formación: ${title}.`, 'training');
    el.remove(); toast(existing ? 'Lección actualizada ✓' : 'Lección creada ✓'); render();
  } catch (e) {
    err.textContent = errorText(e);
    btn.disabled = false;
    progress.textContent = '';
  }
}

async function toggleModule(id) {
  const { data, error } = await sb.from('modules').select('published').eq('id', id).single();
  if (error || !data) return toast(errorText(error));
  const nextPublished = !data.published;
  const { data: moduleRow } = await sb.from('modules').select('title').eq('id', id).single();
  const { error: e } = await sb.from('modules').update({ published: nextPublished }).eq('id', id);
  if (e) return toast(e.message);
  if (nextPublished) await notifyCreators('Nuevo contenido de formación', `Se ha agregado nuevo contenido para tu formación: ${moduleRow?.title || 'un nuevo módulo'}.`, 'training');
  toast(data.published ? 'Módulo ocultado' : 'Módulo publicado ✓'); render();
}

async function toggleLesson(id) {
  const { data, error } = await sb.from('lessons').select('published').eq('id', id).single();
  if (error || !data) return toast(errorText(error));
  const nextPublished = !data.published;
  const { data: lessonRow } = await sb.from('lessons').select('title').eq('id', id).single();
  const { error: e } = await sb.from('lessons').update({ published: nextPublished }).eq('id', id);
  if (e) return toast(e.message);
  if (nextPublished) await notifyCreators('Nuevo contenido de formación', `Se ha agregado nuevo contenido para tu formación: ${lessonRow?.title || 'una nueva lección'}.`, 'training');
  toast(data.published ? 'Lección ocultada' : 'Lección publicada ✓'); render();
}

async function deleteModule(id) {
  if (!confirm('¿Eliminar este módulo y todas sus lecciones?')) return;
  const { data: ls } = await sb.from('lessons').select('video_path,resource_path').eq('module_id', id);
  for (const l of ls || []) {
    if (l.video_path) await sb.storage.from('training-videos').remove([l.video_path]);
    if (l.resource_path) await sb.storage.from('training-resources').remove([l.resource_path]);
  }
  const { error } = await sb.from('modules').delete().eq('id', id);
  if (error) return toast(error.message);
  toast('Módulo eliminado'); render();
}

async function deleteLesson(id) {
  if (!confirm('¿Eliminar esta lección?')) return;
  const { data: l } = await sb.from('lessons').select('video_path,resource_path').eq('id', id).single();
  if (l?.video_path) await sb.storage.from('training-videos').remove([l.video_path]);
  if (l?.resource_path) await sb.storage.from('training-resources').remove([l.resource_path]);
  const { error } = await sb.from('lessons').delete().eq('id', id);
  if (error) return toast(error.message);
  toast('Lección eliminada'); render();
}

async function moveModule(id, direction) {
  const { data: mods } = await sb.from('modules').select('id,sort_order').order('sort_order');
  const i = (mods || []).findIndex(m => m.id === id); const j = direction === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= mods.length) return;
  const a = mods[i], b = mods[j];
  const { error: e1 } = await sb.from('modules').update({ sort_order: b.sort_order }).eq('id', a.id);
  if (e1) return toast(e1.message);
  const { error: e2 } = await sb.from('modules').update({ sort_order: a.sort_order }).eq('id', b.id);
  if (e2) return toast(e2.message);
  render();
}

async function moveLesson(id, direction) {
  const { data: cur } = await sb.from('lessons').select('id,module_id,sort_order').eq('id', id).single();
  if (!cur) return;
  const { data: ls } = await sb.from('lessons').select('id,sort_order').eq('module_id', cur.module_id).order('sort_order');
  const i = (ls || []).findIndex(l => l.id === id); const j = direction === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ls.length) return;
  const a = ls[i], b = ls[j];
  const { error: e1 } = await sb.from('lessons').update({ sort_order: b.sort_order }).eq('id', a.id);
  if (e1) return toast(e1.message);
  const { error: e2 } = await sb.from('lessons').update({ sort_order: a.sort_order }).eq('id', b.id);
  if (e2) return toast(e2.message);
  render();
}

function toggleProfileMenu(){
  const menu=$('#profileMenu'); if(!menu) return;
  const willOpen=menu.classList.contains('hidden');
  menu.classList.toggle('hidden', !willOpen);
  if(willOpen){
    const name=$('#profileMenuName'); const role=$('#profileMenuRole');
    if(name) name.textContent=profile?.full_name || profile?.username || 'Mi cuenta';
    if(role) role.textContent=profile?.role==='admin' ? 'Administrador' : 'Creador';
  }
}
function closeProfileMenu(){ const menu=$('#profileMenu'); if(menu) menu.classList.add('hidden'); }

function bind() {
  $('#homeBrand')?.addEventListener('click', () => nav('home'));
  $$('[data-page]').forEach(b => b.onclick = () => { const target = b.dataset.page; if (target === 'auth' && session && profile?.role === 'creator') nav('space'); else nav(target); });
  $$('[data-space-action]').forEach(b => b.onclick = () => { const action = b.dataset.spaceAction; if (action === 'missions') nav('missions'); else nav(action); });
  $('#loginOpen')?.addEventListener('click', () => { authMode = 'creator'; nav('auth'); });
  $('#adminOpen')?.addEventListener('click', () => { authMode = 'admin'; nav('admin'); });
  $('#adminLoginLink')?.addEventListener('click', () => { authMode = 'admin'; render(); });
  $('#creatorLoginLink')?.addEventListener('click', () => { authMode = 'creator'; render(); });
  $('#mobileMenuBtn')?.addEventListener('click', () => { const m = $('#mobileNav'); const open = m?.classList.toggle('open'); $('#mobileMenuBtn')?.setAttribute('aria-expanded', open ? 'true' : 'false'); });
  $('#mobileAdminOpen')?.addEventListener('click', () => { authMode = 'admin'; nav('admin'); });
  $$('#mobileNav [data-page]').forEach(b => b.addEventListener('click', () => $('#mobileNav')?.classList.remove('open')));
  $('#openMySpace')?.addEventListener('click', () => { closeProfileMenu(); nav('space'); });
  $('#loginBtn')?.addEventListener('click', login);
  $('#adminLogout')?.addEventListener('click', logout);
  $$('[data-lesson]').forEach(b => b.onclick = () => openLesson(b.dataset.lesson));
  $$('[data-complete-mission]').forEach(b => b.onclick = () => completeMission(b.dataset.completeMission));
  $$('[data-save-mission]').forEach(b => b.onclick = () => saveMissionProgress(b.dataset.saveMission));
  $$('[data-mission-week]').forEach(b => b.onclick = () => { const id = b.dataset.missionWeek; const panel = $('#details-' + id); if (panel) panel.classList.toggle('hidden'); b.classList.toggle('open'); });
  if (pendingNotificationTarget?.type === 'missions') {
    const target = pendingNotificationTarget;
    pendingNotificationTarget = null;
    const btn = $$('[data-mission-week]').find(b => (b.dataset.weekStart || '') === (target.weekStart || '') && (b.dataset.weekEnd || '') === (target.weekEnd || ''));
    if (btn) {
      const panel = $('#details-' + btn.dataset.missionWeek);
      if (panel) { panel.classList.remove('hidden'); btn.classList.add('open'); setTimeout(() => btn.scrollIntoView({ behavior:'smooth', block:'center' }), 60); }
    }
  }
  $$('[data-admin]').forEach(b => b.onclick = () => { adminView = b.dataset.admin; render(); });
  $$('[data-toggle-creator]').forEach(b => b.onclick = () => toggleCreator(b.dataset.toggleCreator));
  $$('[data-view-profile]').forEach(b => b.onclick = () => adminProfileModal(b.dataset.viewProfile));
  $('#newTeamManager')?.addEventListener('click',()=>teamManagerModal());
  $$('[data-edit-team]').forEach(b=>b.onclick=()=>editTeam(b.dataset.editTeam));
  $$('[data-delete-team]').forEach(b=>b.onclick=()=>deleteTeam(b.dataset.deleteTeam));
  // Account menu is wired once globally below. Do not bind it here on every render.
  const saveProfileBtn = $('#saveProfile');
  if (saveProfileBtn) saveProfileBtn.onclick = saveProfile;
  $('#pMethod')?.addEventListener('change', togglePaymentFields);
  $('#pCountry')?.addEventListener('change', () => {});
  $('#pBankCountry')?.addEventListener('change', populateBanks);
  $('#profileAvatar')?.addEventListener('change', uploadProfileAvatar);
  $('#profilePhotoEdit')?.addEventListener('click', () => {
    const input = $('#profileAvatar');
    if (input) input.click();
  });
  $('#deleteProfileAvatar')?.addEventListener('click', deleteProfileAvatar);
  $('#saveHome')?.addEventListener('click', saveHome);
  $('#saveBenefits')?.addEventListener('click', saveBenefits);
  $('#bImage')?.addEventListener('change', previewBenefitsImage);
  $('#newCreator')?.addEventListener('click', creatorModal);
  $('#newModule')?.addEventListener('click', newModule);
  $$('[data-edit-module]').forEach(b => b.onclick = () => editModule(b.dataset.editModule));
  $$('[data-toggle-module]').forEach(b => b.onclick = () => toggleModule(b.dataset.toggleModule));
  $$('[data-delete-module]').forEach(b => b.onclick = () => deleteModule(b.dataset.deleteModule));
  $$('[data-move-module]').forEach(b => b.onclick = () => { const [dir, id] = b.dataset.moveModule.split(':'); moveModule(id, dir); });
  $$('[data-new-lesson]').forEach(b => b.onclick = () => newLesson(b.dataset.newLesson));
  $$('[data-edit-lesson]').forEach(b => b.onclick = () => editLesson(b.dataset.editLesson));
  $$('[data-toggle-lesson]').forEach(b => b.onclick = () => toggleLesson(b.dataset.toggleLesson));
  $$('[data-delete-lesson]').forEach(b => b.onclick = () => deleteLesson(b.dataset.deleteLesson));
  $$('[data-move-lesson]').forEach(b => b.onclick = () => { const [dir, id] = b.dataset.moveLesson.split(':'); moveLesson(id, dir); });
}

async function editLesson(id) {
  const { data: l, error } = await sb.from('lessons').select('*').eq('id', id).single();
  if (error || !l) return toast(errorText(error, 'No se encontró la lección.'));
  const el = modal(lessonForm(l, l.module_id));
  bindLessonForm(el, l, l.module_id);
}


function togglePaymentFields(){ const paypal=$('#pMethod')?.value==='paypal'; if($('#bankFields')) $('#bankFields').style.display=paypal?'none':''; if($('#paypalFields')) $('#paypalFields').style.display=paypal?'':'none'; }
function populateBanks(){ const c=$('#pBankCountry')?.value; const sel=$('#pBank'); if(!sel) return; const banks=bankSeed[c]||[]; sel.innerHTML='<option value="">Selecciona tu banco</option>'+banks.map(b=>`<option value="${esc(b)}">${esc(b)}</option>`).join(''); }
async function uploadProfileAvatar(){
  const file=$('#profileAvatar')?.files?.[0]; if(!file||!session) return; const status=$('#profileAvatarStatus');
  if(file.size>5*1024*1024){ if(status) status.textContent='La foto debe pesar menos de 5 MB.'; return; }
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg'; const path=`${session.user.id}/${Date.now()}.${ext}`;
  if(status) status.textContent='Subiendo foto…';
  const {error}=await sb.storage.from('profile-avatars').upload(path,file,{upsert:false,contentType:file.type});
  if(error){ if(status) status.textContent=error.message; return; }
  const url=sb.storage.from('profile-avatars').getPublicUrl(path).data.publicUrl;
  const {error:saveErr}=await sb.from('profile_details').upsert({user_id:session.user.id,avatar_path:path,avatar_url:url,updated_at:new Date().toISOString()});
  if(saveErr){ if(status) status.textContent=saveErr.message; return; }
  profileDetails={...(profileDetails||{}),avatar_path:path,avatar_url:url}; updateProfileBadge();
  if(status) status.textContent='Foto actualizada ✓';
  await render();
}

async function deleteProfileAvatar(){
  if(!session) return;
  const status=$('#profileAvatarStatus');
  const oldPath=profileDetails?.avatar_path;
  if(status) status.textContent='Eliminando foto…';
  if(oldPath) { try { await sb.storage.from('profile-avatars').remove([oldPath]); } catch(e) {} }
  const {error}=await sb.from('profile_details').upsert({user_id:session.user.id,avatar_path:null,avatar_url:null,updated_at:new Date().toISOString()});
  if(error){ if(status) status.textContent=error.message; return; }
  profileDetails={...(profileDetails||{}),avatar_path:null,avatar_url:null};
  updateProfileBadge();
  if(status) status.textContent='Foto eliminada ✓';
  await render();
}

async function saveProfile(){
  const err=$('#profileErr'); if(err) err.textContent=''; if(!session) return;
  const d={user_id:session.user.id,email:$('#pEmail')?.value.trim()||null,phone:$('#pPhone')?.value.trim()||null,country:$('#pCountry')?.value||null,state_region:$('#pState')?.value.trim()||null,city:$('#pCity')?.value.trim()||null,address:$('#pAddress')?.value.trim()||null,updated_at:new Date().toISOString()};
  const {error:de}=await sb.from('profile_details').upsert(d); if(de){if(err)err.textContent=de.message;return;}
  const method=$('#pMethod')?.value==='paypal'?'paypal':'bank'; const pm={user_id:session.user.id,method_type:method,is_primary:$('#pPrimary')?.checked,updated_at:new Date().toISOString()};
  if(method==='paypal'){pm.paypal_email=$('#pPaypal')?.value.trim()||null;pm.bank_country=null;pm.bank_name=null;pm.account_type=null;pm.account_number=null;} else {pm.bank_country=$('#pBankCountry')?.value||null;pm.bank_name=$('#pBank')?.value||null;pm.account_type=$('#pAccountType')?.value||null;pm.account_number=$('#pAccountNumber')?.value.trim()||null;pm.paypal_email=null;}
  const {data:existing}=await sb.from('payment_methods').select('id').eq('user_id',session.user.id).order('is_primary',{ascending:false}).limit(1).maybeSingle();
  const {error:pe}=existing?.id ? await sb.from('payment_methods').update(pm).eq('id',existing.id) : await sb.from('payment_methods').insert(pm);
  if(pe){if(err)err.textContent=pe.message;return;}
  toast('Perfil guardado ✓'); await loadProfileDetails(); updateProfileBadge(); closeProfileMenu(); nav('space');
}
function updateProfileBadge(){
  const b=$('#mobileProfile'); if(!b)return;
  if(profileDetails?.avatar_url)b.innerHTML=`<img src="${esc(profileDetails.avatar_url)}" alt="Perfil">`; else b.textContent=profileInitial();
  const name=$('#profileMenuName'); const role=$('#profileMenuRole');
  if(name) name.textContent=session ? (profile?.full_name || profile?.username || 'Mi cuenta') : 'Mi cuenta';
  if(role) role.textContent=session ? (profile?.role==='admin' ? 'Administrador' : 'Creador') : 'Inicia sesión para acceder';
}
async function login() {
  const input = $('#loginUser').value.trim();
  const p = $('#loginPass').value;
  const value = input.toLowerCase();
  if (!input || !p) { $('#loginErr').textContent = 'Ingresa tus datos para continuar.'; return; }

  // Creadores usan username. Antes de autenticar, comprobamos si la cuenta
  // existe y está activa para poder mostrar un mensaje claro cuando fue bloqueada.
  // Si no existe o la consulta falla, dejamos que Supabase valide las credenciales.
  if (authMode === 'creator' && !value.includes('@')) {
    const { data: accessStatus } = await sb.rpc('creator_access_status', { p_username: value });
    if (accessStatus?.length && accessStatus[0]?.exists && accessStatus[0]?.active === false) {
      $('#loginErr').textContent = '🔒 Tu acceso al portal está desactivado. Contacta con tu manager para solicitar la reactivación.';
      return;
    }
  }

  // Admin puede entrar con su correo real o con su username.
  // Creadores siempre usan username; su correo técnico nunca se muestra.
  const email = value.includes('@') ? value : `${value}@users.grayxon.local`;
  const { data, error } = await sb.auth.signInWithPassword({ email, password: p });
  if (error) { $('#loginErr').textContent = 'Usuario o contraseña incorrectos.'; return; }

  session = data.session;
  profile = await getProfile();
  await loadProfileDetails();
  await loadNotifications();
  if (!profile?.active) {
    await sb.auth.signOut();
    session = null;
    profile = null;
    $('#loginErr').textContent = 'Tu acceso al portal ha sido desactivado. Si crees que esto es un error o necesitas volver a ingresar, contacta con tu manager.';
    return;
  }

  if (authMode === 'admin' && profile.role !== 'admin') {
    await logout();
    $('#loginErr').textContent = 'Esta cuenta no tiene acceso administrativo.';
    return;
  }

  if (authMode === 'creator' && profile.role === 'admin') {
    // Si un admin entra desde el acceso de formación, lo llevamos a su panel.
    nav('admin');
    return;
  }

  nav(profile.role === 'admin' ? 'admin' : 'space');
}

async function logout() {
  await sb.auth.signOut(); session = null; profile = null; profileDetails = null; paymentMethod = null; notifications = []; $('#notificationsPanel')?.classList.add('hidden'); updateProfileBadge(); updateNotificationsUI(); nav('home');
}

async function saveHome() {
  const value = { eyebrow: $('#hEy').value, title: $('#hTitle').value, intro: $('#hIntro').value, about: $('#hAbout').value, badge: $('#hBadge').value, cta: $('#hCta').value, trust: ['Formación', 'Acompañamiento', 'Comunidad'] };
  const { error } = await sb.from('site_content').upsert({ id: 'home', content: value, updated_at: new Date().toISOString() });
  if (error) toast(error.message); else toast('Inicio guardado ✓');
}

function previewBenefitsImage() {
  const file = $('#bImage')?.files?.[0];
  const wrap = $('#bImagePreview');
  if (!file || !wrap) return;
  const url = URL.createObjectURL(file);
  wrap.innerHTML = `<div class="media-preview"><img src="${url}" alt="Vista previa"><div class="muted small">Vista previa. La imagen se guardará al pulsar “Guardar cambios”.</div></div>`;
}

async function saveBenefits() {
  const progress = $('#benefitsProgress');
  const errEl = $('#benefitsErr');
  if (progress) progress.textContent = '';
  if (errEl) errEl.textContent = '';
  let image_url = null;

  // Conserva la imagen actual si no se selecciona una nueva.
  const { data: existing, error: existingError } = await sb.from('site_content').select('content').eq('id', 'benefits').maybeSingle();
  if (existingError) { if (errEl) errEl.textContent = existingError.message; return; }
  image_url = existing?.content?.image_url || null;

  const file = $('#bImage')?.files?.[0];
  if (file) {
    if (!file.type.startsWith('image/')) { if (errEl) errEl.textContent = 'Selecciona una imagen válida.'; return; }
    if (file.size > 8 * 1024 * 1024) { if (errEl) errEl.textContent = 'La imagen debe pesar menos de 8 MB.'; return; }
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `site/benefits-${Date.now()}.${ext || 'jpg'}`;
    if (progress) progress.textContent = 'Subiendo imagen…';
    const { error: uploadError } = await sb.storage.from('public-assets').upload(path, file, { upsert: false, contentType: file.type });
    if (uploadError) { if (errEl) errEl.textContent = uploadError.message; if (progress) progress.textContent = ''; return; }
    image_url = sb.storage.from('public-assets').getPublicUrl(path).data.publicUrl;
  }

  const value = {
    title: $('#bTitle').value.trim() || 'Beneficios y requisitos',
    intro: $('#bIntro').value,
    image_url,
    benefits: $('#bBenefits').value.split('\n').map(x => x.trim()).filter(Boolean),
    requirements: $('#bReq').value.split('\n').map(x => x.trim()).filter(Boolean)
  };
  if (progress) progress.textContent = 'Guardando cambios…';
  const { error } = await sb.from('site_content').upsert({ id: 'benefits', content: value, updated_at: new Date().toISOString() });
  if (error) { if (errEl) errEl.textContent = error.message; if (progress) progress.textContent = ''; }
  else { toast('Beneficios y requisitos guardados ✓'); if (progress) progress.textContent = 'Cambios guardados correctamente.'; render(); }
}

async function init() {
  // Account controls live in the persistent header, so bind them once.
  const profileBtn = $('#mobileProfile');
  const notificationsBtn = $('#notificationsBtn');
  const notificationsPanel = $('#notificationsPanel');
  const profileMenu = $('#profileMenu');
  const openMyProfile = $('#openMyProfile');
  const openMySpace = $('#openMySpace');
  const menuLogout = $('#menuLogout');

  if (notificationsBtn) notificationsBtn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!session) { authMode = 'creator'; nav('auth'); return; }
    toggleNotifications();
  });
  if (notificationsPanel) notificationsPanel.addEventListener('click', (e) => e.stopPropagation());
  if (profileBtn) profileBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!session) {
      authMode = 'creator';
      nav('auth');
      return;
    }
    toggleProfileMenu();
  });
  if (profileMenu) profileMenu.addEventListener('click', (e) => e.stopPropagation());
  if (openMyProfile) openMyProfile.addEventListener('click', () => {
    closeProfileMenu();
    if (session) nav('profile'); else nav('auth');
  });
  if (openMySpace) openMySpace.addEventListener('click', () => { closeProfileMenu(); if (session) nav('space'); else nav('auth'); });
  if (menuLogout) menuLogout.addEventListener('click', () => {
    closeProfileMenu();
    logout();
  });
  document.addEventListener('click', () => { closeProfileMenu(); $('#notificationsPanel')?.classList.add('hidden'); });

  const { data } = await sb.auth.getSession();
  session = data.session;
  if (session) { profile = await getProfile(); await loadProfileDetails(); await loadNotifications(); }
  else updateNotificationsUI();
  nav('home');
}

init();

document.addEventListener('visibilitychange', () => { if (!document.hidden && session) loadNotifications(); });
setInterval(() => { if (!document.hidden && session) loadNotifications(); }, 5000);

window.addEventListener('popstate', () => {
  const page = history.state?.page || 'home';
  current = ['home','benefits','auth','space','training','missions','profile','admin'].includes(page) ? page : 'home';
  render();
  window.scrollTo(0, 0);
});
