const CFG = window.GRAYXON_CONFIG || {};
// Auth uses a syntactically valid internal domain. Users still log in only with
// their Grayxon username; this address is never shown in the portal UI.
const LOGIN_EMAIL_DOMAIN = 'users.grayxongroup.com';
const LEGACY_LOGIN_EMAIL_DOMAIN = 'users.grayxon.local';
const sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_PUBLISHABLE_KEY);

// Grayxon live trainings use Jitsi as a Service (JaaS).
// The App ID is public; the private signing key stays exclusively in the
// Supabase Edge Function `generate-jaas-jwt`.
const JAAS_APP_ID = 'vpaas-magic-cookie-7db4f66a87d64b5696c9aa9ac4b08b7e';
const JAAS_DOMAIN = '8x8.vc';
const JAAS_JWT_FUNCTION = 'generate-jaas-jwt';
const GRAYXON_LIVE_TRAINING_ROOM = 'grayxon-live-training';
// v14: training audiences are controlled by live_training_audience + RLS.
let jaasApi = null;
let jaasApiRoom = null;
let currentLiveTraining = null;
let currentLiveParticipantRow = null;
let liveTrainingEnding = false;
let liveTrainingHostUserId = null;
let pendingLiveTrainingAutoStart = null;

async function createManagerAccess(body){
  const { data: sessionData } = await sb.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if(!accessToken) throw new Error('Tu sesión de administrador no está disponible. Vuelve a iniciar sesión.');
  const res = await fetch(`${CFG.SUPABASE_URL}/functions/v1/create-manager`, {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'apikey': CFG.SUPABASE_PUBLISHABLE_KEY,
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify(body)
  });
  let data=null;
  try{ data=await res.json(); }catch(_){}
  if(!res.ok){
    const msg=data?.error || data?.message || `Error ${res.status} al crear el acceso del manager.`;
    throw new Error(msg);
  }
  if(data?.error) throw new Error(data.error);
  return data;
}

async function updateManagerPassword(managerId, password){
  const { data: sessionData } = await sb.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if(!accessToken) throw new Error('Tu sesión de administrador no está disponible. Vuelve a iniciar sesión.');
  const res = await fetch(`${CFG.SUPABASE_URL}/functions/v1/update-manager-password`, {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'apikey': CFG.SUPABASE_PUBLISHABLE_KEY,
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({manager_id: managerId, password})
  });
  let data=null;
  try{ data=await res.json(); }catch(_){}
  if(!res.ok){
    const msg=data?.error || data?.message || `Error ${res.status} al cambiar la contraseña del manager.`;
    throw new Error(msg);
  }
  if(data?.error) throw new Error(data.error);
  return data;
}


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

function notificationIcon(type) { return type === 'mission' ? '🎯' : type === 'formation' ? '🎓' : type === 'manager_task' ? '📋' : type === 'manager_assignment' ? '👥' : '🔔'; }

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
  else if (n.link_page === 'manager') nav('manager');
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

function ensureLiveTrainingPage() {
  let el = $('#live-training');
  if (el) return el;

  el = document.createElement('section');
  el.id = 'live-training';
  el.className = 'hidden page-section';

  // Keep Entrenamientos inside the same page container as the existing portal sections.
  // This prevents the section from being pushed below the main viewport/footer.
  const pageContainer = $('#home')?.parentElement || document.body;
  pageContainer.appendChild(el);

  if (!$('#grayxon-live-training-styles')) {
    const style = document.createElement('style');
    style.id = 'grayxon-live-training-styles';
    style.textContent = `
      .live-training-page{max-width:1180px;margin:0 auto!important;padding:10px 20px 55px!important}
      .live-training-hero{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:24px}
      .live-training-kicker{font-size:11px;letter-spacing:.18em;color:#9aa0ab;font-weight:800}
      .live-training-hero h1{margin:8px 0 10px;font-size:clamp(32px,4vw,48px);letter-spacing:-.03em}
      .live-training-hero p{max-width:720px;margin:0;color:#a7adb7;font-size:16px;line-height:1.6}
      .live-training-badge{display:inline-flex;align-items:center;gap:8px;padding:9px 13px;border-radius:999px;border:1px solid rgba(254,44,85,.45);background:rgba(254,44,85,.08);color:#ff7d9a;font-size:11px;font-weight:900;letter-spacing:.08em}
      .live-training-badge-dot{width:7px;height:7px;border-radius:50%;background:#fe2c55;box-shadow:0 0 12px rgba(254,44,85,.75)}
      .live-training-feature{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.11);border-radius:24px;background:linear-gradient(145deg,#11141a 0%,#0a0c10 58%,#08090c 100%);box-shadow:0 24px 80px rgba(0,0,0,.30)}
      .live-training-feature:before{content:"";position:absolute;inset:-120px auto auto -80px;width:300px;height:300px;border-radius:50%;background:rgba(37,244,238,.08);filter:blur(50px);pointer-events:none}
      .live-training-feature:after{content:"";position:absolute;right:-90px;bottom:-120px;width:360px;height:360px;border-radius:50%;background:rgba(254,44,85,.08);filter:blur(60px);pointer-events:none}
      .live-training-feature-inner{position:relative;z-index:1;padding:28px}
      .live-training-feature-top{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}
      .live-training-title{margin:10px 0 7px;color:#fff;font-size:clamp(24px,3vw,34px);letter-spacing:-.02em}
      .live-training-subtitle{margin:0;color:#9ba1ab;line-height:1.55;max-width:680px}
      .live-training-meta{display:flex;flex-wrap:wrap;gap:10px;margin:22px 0}
      .live-training-meta-item{display:inline-flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.025);color:#d9dde4;font-size:13px}
      .live-training-meta-item b{color:#fff}
      .live-training-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
      .live-training-enter{
        min-width:210px;
        min-height:48px;
        padding:13px 24px;
        border-radius:14px;
        font-size:15px;
        font-weight:900;
        letter-spacing:.01em;
        box-shadow:0 10px 28px rgba(0,0,0,.22);
        transition:transform .18s ease, box-shadow .18s ease, filter .18s ease;
      }
      .live-training-enter:hover{
        transform:translateY(-1px);
        box-shadow:0 14px 34px rgba(0,0,0,.30);
        filter:brightness(1.04);
      }
      .live-training-access{font-size:12px;color:#7dd3a9}
      .live-training-shell{margin-top:22px;overflow:hidden;border:1px solid rgba(255,255,255,.10);border-radius:20px;background:#0b0d11;box-shadow:0 20px 70px rgba(0,0,0,.28)}
      .live-training-toolbar{display:flex;justify-content:space-between;align-items:center;gap:15px;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.08)}
      .live-training-toolbar-copy strong{display:block;color:#fff}
      .live-training-toolbar-copy span{display:block;margin-top:4px;color:#8d929c;font-size:12px}
      .live-training-meet{min-height:650px;background:#050608}
      .live-training-loading{min-height:650px;display:flex;align-items:center;justify-content:center;text-align:center;padding:40px;color:#aeb3bd}
      .live-training-loading strong{display:block;color:#fff;font-size:18px;margin-bottom:8px}
      .live-training-error{padding:45px 28px;text-align:center}
      .live-training-error h3{margin:0 0 8px;color:#fff}
      .live-training-error p{margin:0 auto 18px;max-width:620px;color:#9298a3}
      .live-training-space-card{position:relative}
      .live-training-space-card .live-training-card-status{color:#6ee7b7;font-size:11px;font-weight:900;letter-spacing:.05em;white-space:nowrap}
      .live-training-space-card .space-progress{background:rgba(255,255,255,.07)}
      #live-training.page-section{display:block!important;min-height:0!important;height:auto!important;margin:0!important;padding:0!important;align-self:auto!important}
      #live-training.page-section{position:relative!important;top:auto!important;bottom:auto!important;transform:none!important;float:none!important;clear:both!important;order:initial!important;}
      body.grayxon-live-training-active #space{display:none!important;visibility:hidden!important;height:0!important;min-height:0!important;overflow:hidden!important}
      body.grayxon-live-training-call #space{display:none!important;visibility:hidden!important;height:0!important;min-height:0!important;overflow:hidden!important}
      body.grayxon-live-training-call #live-training .live-training-hero,
      body.grayxon-live-training-call #live-training .live-training-feature{display:none!important}
      body.grayxon-live-training-call #grayxonTrainingRoomWrap{display:block!important;visibility:visible!important;margin:0!important;padding:0!important}
      body.grayxon-live-training-call #grayxonTrainingRoomWrap .live-training-shell{margin:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;background:transparent!important}
      body.grayxon-live-training-call #grayxonTrainingRoomWrap .live-training-toolbar{display:none!important}
      body.grayxon-live-training-call #grayxonJaasMeet{min-height:0!important;height:calc(100vh - 8px)!important;background:#050608!important}
      body.grayxon-live-training-call #grayxonJaasMeet iframe{height:100%!important;min-height:0!important}
      body.grayxon-live-training-call .live-training-loading{display:none!important}
      .page-section[hidden], #space[hidden], #home[hidden], #benefits[hidden], #auth[hidden], #manager[hidden], #training[hidden], #live-training[hidden], #missions[hidden], #profile[hidden], #admin[hidden]{display:none!important;}
      .live-training-space-card .space-progress span{width:100%;background:linear-gradient(90deg,#25f4ee,#fe2c55)}
      @media(max-width:800px){
        #live-training.page-section{display:block!important;min-height:0!important;height:auto!important;margin:0!important;padding:0!important}
        .live-training-page{width:100%;max-width:none;box-sizing:border-box;margin:0!important;padding:10px 14px 34px!important}
        .live-training-hero{display:block;margin-bottom:16px}
        .live-training-hero h1{font-size:34px;line-height:1.08;margin:7px 0 10px}
        .live-training-hero p{font-size:15px;line-height:1.55}
        .live-training-hero .secondary{margin-top:13px}
        .live-training-feature{width:100%;box-sizing:border-box;border-radius:20px}
        .live-training-feature-inner{padding:20px 16px}
        .live-training-feature-top{display:block}
        .live-training-badge{margin-top:13px}
        .live-training-title{font-size:25px;line-height:1.15;margin:9px 0 8px}
        .live-training-subtitle{font-size:14px;line-height:1.5}
        .live-training-meta{display:grid;grid-template-columns:1fr;gap:9px;margin:18px 0}
        .live-training-meta-item{width:100%;min-width:0;min-height:0;box-sizing:border-box;padding:11px 12px;display:flex;align-items:flex-start;white-space:normal;overflow:hidden;line-height:1.35}
        .live-training-meta-item b{flex:0 0 auto}
        .live-training-actions{display:block}
        .live-training-enter{
          width:100%;
          min-width:0;
          min-height:52px;
          margin-bottom:0;
          box-sizing:border-box;
          border-radius:15px;
          font-size:16px;
          font-weight:900;
        }
        .live-training-access{display:block;line-height:1.45}
        .live-training-meet,.live-training-loading{min-height:560px}
        .live-training-toolbar{align-items:flex-start;flex-direction:column}
      }
    `;
    document.head.appendChild(style);
  }

  return el;
}

function nav(p, push = true) {
  const pages = ['home','benefits','auth','space','manager','training','live-training','missions','profile','admin'];
  if (!pages.includes(p)) p = 'home';
  if (p === 'live-training') ensureLiveTrainingPage();
  if (push && current !== p) {
    const url = p === 'home'
      ? `${window.location.pathname}${window.location.search}`
      : `${window.location.pathname}${window.location.search}#${p}`;
    history.pushState({page:p}, '', url);
  }
  current = p;

  // Estado global de la sección de entrenamientos.
  document.body.classList.toggle('grayxon-live-training-active', p === 'live-training');

  // Hide every portal page robustly.
  pages.forEach(id => {
    const el = $('#'+id);
    if (!el) return;
    const isActive = id === p;
    el.classList.toggle('hidden', !isActive);
    el.hidden = !isActive;
    if (isActive) el.removeAttribute('aria-hidden');
    else el.setAttribute('aria-hidden','true');
  });

  // Tu espacio debe desaparecer COMPLETAMENTE mientras estamos en Entrenamientos,
  // incluso si alguna regla móvil intenta mostrar .page-section.
  const spaceEl = $('#space');
  if (spaceEl) {
    if (p === 'live-training') {
      spaceEl.hidden = true;
      spaceEl.setAttribute('aria-hidden','true');
      spaceEl.classList.add('hidden');
      spaceEl.style.setProperty('display', 'none', 'important');
    } else if (p === 'space') {
      spaceEl.hidden = false;
      spaceEl.removeAttribute('aria-hidden');
      spaceEl.classList.remove('hidden');
      spaceEl.style.removeProperty('display');
    }
  }

  if (p !== 'live-training' && jaasApi) destroyJaasMeeting();
  if (p === 'space') { try { renderSpaceShell(); } catch(e) { console.error(e); } }
  Promise.resolve(render()).catch(e => console.warn('Render:', e));
  window.scrollTo(0,0);
}

function spaceCard(icon,title,desc,pct,action,detail){
  return `<button class="space-card card" data-space-action="${esc(action)}"><span class="space-card-icon">${icon}</span><div class="space-card-main"><div class="space-card-top"><strong>${esc(title)}</strong><span>${pct}%</span></div><p>${esc(desc)}</p><div class="space-progress"><span style="width:${Math.max(0,Math.min(100,pct))}%"></span></div><small>${esc(detail)}</small></div><span class="space-card-arrow">›</span></button>`;
}
function renderSpaceShell(){
  const el=$('#space'); if(!el) return;
  if(!session){ el.innerHTML=authTpl(); return; }
  const base=profile||{full_name:session.user.user_metadata?.full_name||'',username:session.user.user_metadata?.username||session.user.email?.split('@')[0]||'creador'};
  el.innerHTML=`<div class="space-page"><div class="space-hero"><div class="space-hero-main"><div class="eyebrow">TU ESPACIO</div><h1>Hola, ${esc(base.username||'creador')} 👋</h1><p class="muted space-intro">Aquí tienes todo lo que necesitas para avanzar dentro de Grayxon.</p></div><div class="space-total"><span>PROGRESO GENERAL</span><strong id="spaceOverallPct">0%</strong></div><div id="spaceTeamBlock" class="space-team-inline"><div class="space-team-card space-team-card-loading"><div class="space-team-card-info"><span class="space-team-label">TU EQUIPO</span><strong>Cargando equipo...</strong></div></div></div></div><div class="space-grid" id="spaceCards">${spaceCard('👤','Tu perfil','Completa tus datos para mantener tu información actualizada.',0,'profile','Cargando información…')}${spaceCard('🎓','Formación','Aprende con los módulos, lecciones, videos y recursos de Grayxon.',0,'training','Cargando formación…')}${spaceCard('🎯','Tus misiones','Cumple tus objetivos semanales y registra tus avances.',0,'missions','Cargando misiones…')}<button class="space-card card live-training-space-card" data-space-action="live-training"><span class="space-card-icon">🎥</span><div class="space-card-main"><div class="space-card-top"><strong>Entrenamientos</strong><span class="live-training-card-status">Sin entrenamiento</span></div><p class="live-training-card-title">Consulta los entrenamientos en vivo de Grayxon.</p><div class="space-progress"><span style="width:0%"></span></div><small class="live-training-card-detail">Cuando haya uno activo aparecerá aquí.</small></div><span class="space-card-arrow">›</span></button></div></div>`;
  bind();
  refreshLiveTrainingCard();
}
function updateSpaceTeam(a){
  const el=$('#spaceTeamBlock'); if(!el)return;
  if(a?.team){
    const m=a.manager;
    const contact = m?.phone
      ? `<a class="space-team-contact" href="${esc(managerWhatsapp(m.phone))}" target="_blank" rel="noopener noreferrer"><img src="assets/whatsapp-icon.svg" alt=""><span>Contactar</span><span class="space-team-contact-arrow">↗</span></a>`
      : '';
    el.innerHTML=`<div class="space-team-card"><div class="space-team-card-info"><span class="space-team-label">TU EQUIPO</span><strong>${esc(a.team.name)}</strong><span>Manager: <b>${esc(m?.name||'Sin manager asignado')}</b></span></div>${contact}</div>`;
  } else {
    el.innerHTML=`<div class="space-team-card space-team-card-empty"><span>Tu equipo: aún no tienes equipo asignado</span></div>`;
  }
}
function updateSpaceCard(action,pct,detail){const b=document.querySelector(`[data-space-action="${action}"]`);if(!b)return;const p=b.querySelector('.space-card-top span'),bar=b.querySelector('.space-progress span'),d=b.querySelector('small');if(p)p.textContent=`${pct}%`;if(bar)bar.style.width=`${Math.max(0,Math.min(100,pct))}%`;if(d)d.textContent=detail;}

async function render(){
  if(current==='home'||current==='benefits'||current==='admin'){
    const c=await content();
    if(current==='home')$('#home').innerHTML=homeTpl(c.home);
    if(current==='benefits')$('#benefits').innerHTML=benefitsTpl(c.benefits);
    if(current==='admin')await adminTpl(c);
  }
  if(current==='auth')$('#auth').innerHTML=authTpl();
  if(current==='space') { if(profile?.role==='manager') await managerTpl(); else await spaceTpl(); }
  if(current==='manager')await managerTpl();
  if(current==='training')await trainingTpl();
  if(current==='live-training')await liveTrainingTpl();
  if(current==='missions')await missionsTpl();
  if(current==='profile')$('#profile').innerHTML=await profileTpl();
  bind(); updateHeaderAccessUI(); updateProfileBadge(); updateNotificationsUI();
  $$('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===current || (b.dataset.page==='space' && current==='manager')));
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
  if (!session || !profile) return authTpl();
  const d=profileDetails||{}; const pm=paymentMethod||{};
  const avatar = d.avatar_url ? `<img class="profile-avatar-img" src="${esc(d.avatar_url)}" alt="Foto de perfil">` : `<span>${esc(profileInitial())}</span>`;
  const countries=profileCountries.map(([c,n])=>`<option value="${c}" ${d.country===c?'selected':''}>${n}</option>`).join('');
  const banks=(bankSeed[pm.bank_country || d.country]||[]).map(b=>`<option value="${esc(b)}" ${pm.bank_name===b?'selected':''}>${esc(b)}</option>`).join('');
  return `<div class="profile-page">
    <div class="profile-head card"><div class="profile-avatar-wrap profile-avatar-editable">${avatar}<button type="button" class="avatar-edit-fab" id="profilePhotoEdit" aria-label="Cambiar foto">✎</button><button type="button" class="avatar-delete-fab ${d.avatar_url ? '' : 'hidden'}" id="deleteProfileAvatar" aria-label="Eliminar foto">🗑</button><input id="profileAvatar" class="hidden" type="file" accept="image/png,image/jpeg,image/webp"></div><div><div class="eyebrow">MI PERFIL</div><h1>${esc(profile.full_name||profile.username)}</h1><p class="muted">@${esc(profile.username)} · ${profile.role==='admin'?'Administrador':profile.role==='manager'?'Manager':'Creador'}</p><div id="profileAvatarStatus" class="muted small" style="margin-top:8px"></div></div></div>
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
function authTpl() {
  return `<div class="login"><div class="eyebrow">GRAYXON · ACCESO</div><h2 style="margin-top:8px">Inicia sesión</h2><p class="muted">Usa el usuario o correo y la contraseña de tu cuenta. Grayxon detectará automáticamente si eres administrador, manager o creador y abrirá el panel correspondiente.</p><div class="field"><label>Usuario o correo</label><input id="loginUser" autocomplete="username" placeholder="Ej. andrea.onyx o correo@ejemplo.com"></div><div class="field"><label>Contraseña</label><input id="loginPass" type="password" autocomplete="current-password" placeholder="••••••••"></div><div id="loginErr" class="error"></div><button class="primary" id="loginBtn">Ingresar</button><button class="secondary small" id="forgotPasswordBtn" style="margin-top:10px">¿Olvidaste tu contraseña?</button><div id="resetBox" class="hidden" style="margin-top:14px"><div class="muted small" style="margin-bottom:8px">Escribe tu correo para recibir un enlace de recuperación.</div><input id="resetEmail" type="email" placeholder="correo@ejemplo.com"><button class="secondary small" id="sendResetBtn" style="margin-top:8px">Enviar enlace</button><div id="resetErr" class="error" style="margin-top:8px"></div></div></div>`;
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
  if(!session){$('#space').innerHTML=authTpl();return;}
  if(!$('#space')?.innerHTML.trim()) renderSpaceShell();
  const uid=session.user.id;
  // Cargar el perfil en paralelo; no bloquea la pantalla.
  getProfile().then(p=>{ if(!p)return; profile=p; const h=$('#space h1'); if(h)h.innerHTML=`Hola, ${esc(p.username||'creador')} 👋`; updateProfileBadge(); }).catch(()=>{});
  const safe=async(promise,fallback,ms=2500)=>{try{const r=await Promise.race([promise,new Promise(resolve=>setTimeout(()=>resolve({data:fallback,error:true}),ms))]);return r?.error?fallback:(r?.data??fallback);}catch{return fallback;}};
  const profileP=Promise.all([safe(sb.from('profile_details').select('*').eq('user_id',uid).maybeSingle(),null),safe(sb.from('payment_methods').select('*').eq('user_id',uid).order('is_primary',{ascending:false}).limit(1).maybeSingle(),null)]).then(([d,pm])=>{const n=[d?.email,d?.phone,d?.country,d?.state_region,d?.city,d?.address,d?.avatar_url,pm?.method_type&&(pm.method_type==='paypal'?pm.paypal_email:pm.account_number)].filter(Boolean).length;const pct=Math.round(n/8*100);updateSpaceCard('profile',pct,pct===100?'Perfil completo':`${n} de 8 datos completos`);return pct;});
  const trainingP=Promise.all([safe(sb.from('lessons').select('id').eq('published',true),[]),safe(sb.from('lesson_progress').select('lesson_id').eq('user_id',uid),[])]).then(([ls,lp])=>{const done=new Set((lp||[]).map(x=>x.lesson_id));const total=(ls||[]).length;const fin=(ls||[]).filter(x=>done.has(x.id)).length;const pct=total?Math.round(fin/total*100):0;updateSpaceCard('training',pct,total?`${fin} de ${total} lecciones completadas`:'Aún no hay formación publicada');return pct;});
  const missionsP=Promise.all([safe(sb.from('missions').select('id,type,target,week_start,week_end,assigned_to').eq('published',true).or(`assigned_to.is.null,assigned_to.eq.${uid}`).order('week_start',{ascending:false}),[]),safe(sb.from('mission_progress').select('mission_id,value,completed').eq('user_id',uid),[])]).then(([ms,mp])=>{const today=new Date().toISOString().slice(0,10);const active=(ms||[]).filter(m=>(!m.week_start||m.week_start<=today)&&(!m.week_end||m.week_end>=today)&&(!m.assigned_to||m.assigned_to===uid));const map=new Map((mp||[]).map(x=>[x.mission_id,x]));const pctFor=m=>{const x=map.get(m.id);if(!x)return 0;if(m.type==='checkbox')return x.completed?100:0;return Number(m.target)>0?Math.min(100,Math.round(Number(x.value||0)/Number(m.target)*100)):0};const total=active.length,done=active.filter(m=>pctFor(m)>=100).length,pct=total?Math.round(active.reduce((a,m)=>a+pctFor(m),0)/total):0;updateSpaceCard('missions',pct,total?`${done} de ${total} misiones completadas`:'No hay misiones activas esta semana');return pct;});
  const teamP=loadCreatorAssignment().then(a=>{updateSpaceTeam(a);return 0;}).catch(()=>{updateSpaceTeam({team:null,manager:null});return 0;});
  Promise.all([profileP,trainingP,missionsP,teamP]).then(v=>{const pct=Math.round((v[0]+v[1]+v[2])/3);const el=$('#spaceOverallPct');if(el)el.textContent=`${pct}%`;}).catch(()=>{});
}

async function missionsTpl() {
  if (!session) { $('#missions').innerHTML = authTpl(); return; }
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

  $('#missions').innerHTML = `<div class="missions-page"><div class="row"><div><div class="eyebrow">TUS MISIONES</div><h1 style="margin:7px 0">Tus objetivos 🎯</h1><p class="muted">Tus misiones están organizadas por semanas. Toca una semana para ver todas las misiones que contiene.</p></div><button class="secondary" data-space-action="space" aria-label="Volver a Tu espacio">← Tu espacio</button></div>${congratulations}${section('Misiones asignadas','🎯',assignedGroups,'assigned','No tienes misiones asignadas')}${section('Misiones completadas','✓',completedGroups,'completed','Aún no tienes historial de misiones')}</div>`;
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


async function fetchActiveLiveTraining(){
  const {data,error}=await sb.from('live_trainings').select('id,title,description,scheduled_at,room_name,status,created_by,instructor_name,created_at,started_at,ended_at').eq('status','live').order('started_at',{ascending:false}).limit(1).maybeSingle();
  if(error){ console.warn('No se pudo consultar el entrenamiento activo:',error.message); return null; }
  return data||null;
}
async function refreshLiveTrainingCard(){
  const card=document.querySelector('.live-training-space-card'); if(!card)return;
  const status=card.querySelector('.live-training-card-status'), title=card.querySelector('.live-training-card-title'), detail=card.querySelector('.live-training-card-detail'), bar=card.querySelector('.space-progress span');
  try{const t=await fetchActiveLiveTraining();currentLiveTraining=t;if(t){if(status){status.textContent='EN VIVO';status.style.color='#6ee7b7';}if(title)title.textContent=t.title;if(detail)detail.textContent=`Instructor: ${t.instructor_name||'Grayxon'} · Entra directamente desde tu cuenta.`;if(bar)bar.style.width='100%';}else{if(status){status.textContent='Sin entrenamiento';status.style.color='';}if(title)title.textContent='Consulta los entrenamientos en vivo de Grayxon.';if(detail)detail.textContent='Cuando haya uno activo aparecerá aquí.';if(bar)bar.style.width='0%';}}catch(e){console.warn('Estado de entrenamiento:',e);}
}

function loadJaasIframeApi() {
  return new Promise((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) return resolve(window.JitsiMeetExternalAPI);

    const existing = document.querySelector('script[data-grayxon-jaas-api]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.JitsiMeetExternalAPI));
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar el sistema de videollamada.')));
      return;
    }

    const script = document.createElement('script');
    script.src = `https://${JAAS_DOMAIN}/${JAAS_APP_ID}/external_api.js`;
    script.async = true;
    script.dataset.grayxonJaasApi = 'true';
    script.onload = () => window.JitsiMeetExternalAPI
      ? resolve(window.JitsiMeetExternalAPI)
      : reject(new Error('La API de videollamada no quedó disponible.'));
    script.onerror = () => reject(new Error('No se pudo cargar la API de videollamada.'));
    document.head.appendChild(script);
  });
}

async function getJaasJwt(room = GRAYXON_LIVE_TRAINING_ROOM) {
  const { data: sessionData } = await sb.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error('Tu sesión de Grayxon no está disponible. Vuelve a iniciar sesión.');

  const res = await fetch(`${CFG.SUPABASE_URL}/functions/v1/${JAAS_JWT_FUNCTION}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': CFG.SUPABASE_PUBLISHABLE_KEY,
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({ room })
  });

  let data = null;
  try { data = await res.json(); } catch (_) {}

  if (!res.ok || data?.error) {
    throw new Error(data?.error || data?.message || `No se pudo preparar el entrenamiento (${res.status}).`);
  }

  if (!data?.token || !data?.roomName) {
    throw new Error('El servidor no devolvió los datos necesarios para entrar al entrenamiento.');
  }

  return data;
}

function destroyJaasMeeting() {
  if (jaasApi) { try { jaasApi.dispose(); } catch (_) {} }
  jaasApi = null; jaasApiRoom = null;
}
async function recordLiveTrainingJoin(trainingId){
  if(!trainingId||!session?.user?.id)return null;
  const {data,error}=await sb.from('live_training_participants').insert({training_id:trainingId,user_id:session.user.id}).select('id,training_id,user_id,joined_at').single();
  if(error){console.warn('No se pudo registrar la entrada:',error.message);return null;} currentLiveParticipantRow=data; return data;
}
async function recordLiveTrainingLeave(){
  const row=currentLiveParticipantRow; currentLiveParticipantRow=null; if(!row?.id)return;
  const {error}=await sb.from('live_training_participants').update({left_at:new Date().toISOString()}).eq('id',row.id).eq('user_id',session?.user?.id||'');
  if(error)console.warn('No se pudo registrar la salida:',error.message);
}
async function endLiveTrainingConference(api, trainingId) {
  if (!api) return;
  liveTrainingEnding = true;
  try {
    // Prefer the native moderator command when the deployment supports it.
    try { api.executeCommand('endConference'); } catch (_) {}
    // Also explicitly kick remote participants so the training is closed even
    // if End Conference is not enabled for the deployment.
    try {
      const rooms = await api.getRoomsInfo?.();
      const participants = (rooms?.rooms || []).flatMap(r => r.participants || []);
      const localId = participants.find(p => p.userContext?.id === session?.user?.id)?.id;
      for (const p of participants) {
        if (p.id && p.id !== localId) {
          try { api.executeCommand('kickParticipant', p.id); } catch (_) {}
        }
      }
    } catch (_) {}
    try { api.executeCommand('hangup'); } catch (_) {}
  } finally {
    // The database state is the source of truth for the Grayxon EN VIVO badge.
    if (trainingId) {
      const endedAt = new Date().toISOString();
      const { error } = await sb.from('live_trainings')
        .update({ status:'finished', ended_at:endedAt })
        .eq('id',trainingId).eq('status','live');
      if (error) console.warn('No se pudo finalizar el entrenamiento:',error.message);
      await sb.from('live_training_participants').update({left_at:endedAt})
        .eq('training_id',trainingId).is('left_at',null);
    }
  }
}

async function startGrayxonLiveTraining(training, options={}){
  const host=$('#grayxonJaasMeet'); if(!host||!training?.room_name)return;
  destroyJaasMeeting();
  host.innerHTML='<div id="grayxonJaasLoading" class="live-training-loading" aria-hidden="true"></div>';
  liveTrainingHostUserId = training.created_by || null;
  liveTrainingEnding = false;
  const isHost = !!session?.user?.id && training.created_by === session.user.id;
  const isAdmin = profile?.role === 'admin';
  try{
    const [{token,roomName},JitsiMeetExternalAPI]=await Promise.all([getJaasJwt(training.room_name),loadJaasIframeApi()]);
    if(!$('#grayxonJaasMeet'))return;
    const api=new JitsiMeetExternalAPI(JAAS_DOMAIN,{
      roomName,
      jwt:token,
      parentNode:$('#grayxonJaasMeet'),
      width:'100%',
      height:'650px',
      lang:'es',
      userInfo:{displayName:profile?.full_name||profile?.username||session?.user?.email?.split('@')[0]||'Participante Grayxon',email:session?.user?.email||''},
      configOverwrite:{
        prejoinConfig:{enabled:false},
        // Do not request camera/mic permissions until the participant explicitly
        // tries to enable them. Everyone enters muted.
        disableInitialGUM:true,
        startWithAudioMuted:true,
        startWithVideoMuted:true,
        // Expose the hangup click so the host can end the entire training.
        buttonsWithNotifyClick:[{key:'hangup',preventExecution:true}],
        // AV moderation makes participants request permission before unmuting.
        // Moderators can approve/ask-to-unmute from the participant controls.
      }
    });
    jaasApi=api; jaasApiRoom=roomName;

    api.addEventListener?.('videoConferenceJoined',async(ev)=>{
      // The host is automatically placed on the main stage. Follow-me is enabled
      // for the host so participants follow the host's stage instead of freely
      // promoting another participant. Admins retain moderator controls.
      if (isHost) {
        try { if (ev?.id) api.executeCommand('pinParticipant',ev.id); } catch (_) {}
        try { api.executeCommand('setLargeVideoParticipant',ev?.id); } catch (_) {}
        try { api.executeCommand('setFollowMe',true,false); } catch (_) {}
        try { api.executeCommand('toggleModeration',true,'audio'); } catch (_) {}
        try { api.executeCommand('toggleModeration',true,'video'); } catch (_) {}
      } else if (isAdmin) {
        // The administrator has moderator control, but does not automatically
        // replace the host on stage. They can choose the stage participant manually.
        try { api.executeCommand('setFollowMe',false,false); } catch (_) {}
      }
      await recordLiveTrainingJoin(training.id);
      toast(isHost?'Entraste al entrenamiento como anfitrión ✓':isAdmin?'Entraste como administrador ✓':'Entraste al entrenamiento ✓');
    });

    api.addEventListener?.('toolbarButtonClicked',async(ev)=>{
      if(ev?.key!=='hangup')return;
      if(isHost){
        await endLiveTrainingConference(api,training.id);
      }else{
        try { api.executeCommand('hangup'); } catch (_) {}
      }
    });

    api.addEventListener?.('participantJoined',()=>{
      if(isHost){
        // Re-assert the host as the stage leader when a new participant arrives.
        try { api.executeCommand('setFollowMe',true,false); } catch (_) {}
      }
    });

    api.addEventListener?.('readyToClose',async()=>{
      await recordLiveTrainingLeave();
      // If the host ended the conference, the DB was already marked finished.
      // A participant closing their own call must not finish the training.
      destroyJaasMeeting();
      document.body.classList.remove('grayxon-live-training-call');
      const wrap=$('#grayxonTrainingRoomWrap'),meet=$('#grayxonJaasMeet');
      if(meet)meet.innerHTML='';
      if(wrap){wrap.classList.add('hidden');wrap.hidden=true;wrap.style.setProperty('display','none','important');}
      const shouldReturnToPanel = profile?.role==='admin' ? 'admin' : profile?.role==='manager' ? 'manager' : 'space';
      nav(shouldReturnToPanel,false);
      liveTrainingEnding=false;
    });
  }catch(error){
    liveTrainingEnding=false;
    console.error('GRAYXON JAAAS ERROR:',error);
    host.innerHTML=`<div class="live-training-error"><h3>No pudimos abrir el entrenamiento</h3><p>${esc(error?.message||'Ocurrió un error al preparar la videollamada.')}</p><button class="primary" id="retryGrayxonTraining">Intentar nuevamente</button></div>`;
    $('#retryGrayxonTraining')?.addEventListener('click',()=>startGrayxonLiveTraining(training,options));
  }
}

async function liveTrainingTpl() {
  const el=ensureLiveTrainingPage();
  if(!session){el.innerHTML=authTpl();return;}
  profile=await getProfile();
  if(!profile||!profile.active){await sb.auth.signOut();session=null;profile=null;el.innerHTML='<div class="login"><h2>Tu acceso está desactivado</h2><p class="muted">Tu acceso al portal de Grayxon ha sido desactivado. Si crees que esto es un error o necesitas volver a ingresar, contacta con tu manager.</p></div>';destroyJaasMeeting();return;}
  const isHost=!!training?.created_by && training.created_by===session?.user?.id;
  const isModerator=profile.role==='admin'||profile.role==='manager';
  const training=await fetchActiveLiveTraining(); currentLiveTraining=training;
  const backPage=isModerator?(profile.role==='admin'?'admin':'manager'):'space';
  if(!training){
    el.innerHTML=`<div class="live-training-page"><div class="live-training-hero"><div><div class="live-training-kicker">GRAYXON · ENTRENAMIENTOS</div><h1>Entrenamientos en vivo 🎥</h1><p>Cuando Grayxon inicie un entrenamiento, aparecerá aquí automáticamente.</p></div><button class="secondary" data-space-action="${backPage}">← ${isHost?'Volver al panel':'Tu espacio'}</button></div><section class="live-training-feature"><div class="live-training-feature-inner live-training-empty-state"><span class="live-training-idle-icon">○</span><h2>No hay un entrenamiento en vivo</h2><p class="live-training-subtitle">En este momento no hay ninguna sesión activa. El estado <b>EN VIVO</b> solo aparecerá cuando un administrador o manager inicie un entrenamiento.</p></div></section></div>`;
    bind();return;
  }
  el.innerHTML=`<div class="live-training-page"><div class="live-training-hero"><div><div class="live-training-kicker">GRAYXON · ENTRENAMIENTOS</div><h1>Entrenamiento en vivo 🎥</h1><p>Sesión activa dentro del portal Grayxon.</p></div><button class="secondary" data-space-action="${backPage}">← ${isHost?'Volver al panel':'Tu espacio'}</button></div><section class="live-training-feature"><div class="live-training-feature-inner"><div class="live-training-feature-top"><div><span class="live-training-badge"><i class="live-training-badge-dot"></i> EN VIVO</span><h2 class="live-training-title">${esc(training.title)}</h2><p class="live-training-subtitle">${esc(training.description||'Entrenamiento en vivo de Grayxon Group.')}</p></div></div><div class="live-training-meta"><span class="live-training-meta-item">👤 <b>Instructor:</b>&nbsp; ${esc(training.instructor_name||'Grayxon')}</span><span class="live-training-meta-item">🕒 <b>Inició:</b>&nbsp; ${formatDateTime(training.started_at)}</span><span class="live-training-meta-item">${isHost?'🎙️':'👥'} <b>Rol:</b>&nbsp; ${isHost?'Anfitrión':isModerator?'Moderador':'Participante'}</span></div><div class="live-training-actions"><button class="primary live-training-enter" id="enterGrayxonTraining">Entrar</button></div></div></section><div id="grayxonTrainingRoomWrap" class="hidden" hidden style="display:none!important"><div class="live-training-shell"><div class="live-training-toolbar"><div class="live-training-toolbar-copy"><strong>${esc(training.title)}</strong><span>${isHost?'Tienes permisos de anfitrión para dirigir el entrenamiento.':isModerator?'Tienes permisos de moderación.':'Conectado con tu cuenta Grayxon.'}</span></div><span class="pill ok">Acceso protegido</span></div><div id="grayxonJaasMeet" class="live-training-meet"><div class="live-training-loading"><div><strong>Preparando el entrenamiento…</strong><span>La videollamada se abrirá aquí.</span></div></div></div></div></div></div>`;
  bind();
  const autoStart = pendingLiveTrainingAutoStart?.id === training.id;
  if(autoStart) pendingLiveTrainingAutoStart=null;
  $('#enterGrayxonTraining')?.addEventListener('click',async()=>{const btn=$('#enterGrayxonTraining'),wrap=$('#grayxonTrainingRoomWrap'),hero=$('.live-training-hero'),feature=$('.live-training-feature');document.body.classList.add('grayxon-live-training-call');if(btn){btn.disabled=true;btn.textContent='Entrando…';}if(hero){hero.classList.add('hidden');hero.hidden=true;hero.style.setProperty('display','none','important');}if(feature){feature.classList.add('hidden');feature.hidden=true;feature.style.setProperty('display','none','important');}if(wrap){wrap.classList.remove('hidden');wrap.hidden=false;wrap.style.setProperty('display','block','important');}window.scrollTo(0,0);await startGrayxonLiveTraining(training);});
  if(autoStart){
    const btn=$('#enterGrayxonTraining');
    if(btn) btn.click();
  }
}

async function trainingTpl() {
  if (!session) {
    $('#training').innerHTML = authTpl();
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


async function managerTpl(){
  if(!session){ $('#manager').innerHTML=authTpl(); return; }
  if(profile?.role!=='manager'){ $('#manager').innerHTML='<div class="login"><h2>Acceso restringido</h2><p class="muted">Esta sección es solo para managers.</p></div>'; return; }
  const {data:me,error:meErr}=await sb.from('managers').select('id,name,phone,email,username,active').eq('user_id',session.user.id).maybeSingle();
  if(meErr||!me){ $('#manager').innerHTML=`<div class="card"><h2>Panel de manager</h2><div class="error">${esc(meErr?.message||'No se encontró tu registro de manager.')}</div></div>`; return; }
  const {data:creators,error:crErr}=await sb.from('profiles').select('id,username,full_name,active,team_id,manager_id').eq('role','creator').eq('manager_id',me.id).order('full_name');
  if(meErr||crErr){ $('#manager').innerHTML=`<div class="card"><h2>Panel de manager</h2><div class="error">${esc((meErr||crErr)?.message||'No se pudo cargar tu panel.')}</div></div>`; return; }
  const creatorIds=(creators||[]).map(x=>x.id);
  let missions=[], progress=[];
  if(creatorIds.length){
    const [mRes,pRes]=await Promise.all([
      sb.from('missions').select('id,title,type,target,week_start,week_end,assigned_to,published,created_at').in('assigned_to',creatorIds).order('week_start',{ascending:false}),
      sb.from('mission_progress').select('mission_id,user_id,value,completed').in('user_id',creatorIds)
    ]);
    missions=mRes.data||[]; progress=pRes.data||[];
  }
  const tmIds=[...new Set((creators||[]).map(c=>c.team_id).filter(Boolean))];
  const {data:teams}=tmIds.length?await sb.from('teams').select('id,name').in('id',tmIds):{data:[]};
  const tm=new Map((teams||[]).map(t=>[t.id,t.name]));
  const {data:creatorDetails}=creatorIds.length?await sb.from('profile_details').select('user_id,avatar_url').in('user_id',creatorIds):{data:[]};
  const avatarMap=new Map((creatorDetails||[]).map(d=>[d.user_id,d.avatar_url]));
  const pm=new Map(progress.map(x=>[`${x.user_id}:${x.mission_id}`,x]));
  const missionPct=m=>{const x=pm.get(`${m.assigned_to}:${m.id}`);if(!x)return 0;if(m.type==='checkbox')return x.completed?100:0;return Number(m.target)>0?Math.min(100,Math.round(Number(x.value||0)/Number(m.target)*100)):0;};
  const creatorCard=(c)=>{
    const avatar=avatarMap.get(c.id);
    const initials=esc((c.full_name||c.username||'C').trim().charAt(0).toUpperCase());
    const avatarHtml=avatar
      ? `<img src="${esc(avatar)}" alt="Foto de ${esc(c.full_name||c.username)}" loading="eager" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.classList.remove('hidden')"><span class="manager-creator-avatar-fallback hidden">${initials}</span>`
      : `<span class="manager-creator-avatar-fallback">${initials}</span>`;
    return `<div class="item manager-creator-card" data-manager-creator-row="${c.id}" data-search="${esc(`${c.username||''} ${c.full_name||''}`.toLowerCase())}"><button type="button" class="manager-creator-summary" data-manager-creator-toggle="${c.id}"><span class="manager-creator-identity"><span class="manager-creator-avatar">${avatarHtml}</span><span class="manager-creator-name"><b>@${esc(c.username)}</b></span></span><span class="manager-creator-chevron">›</span></button><div class="manager-creator-actions hidden" data-manager-actions="${c.id}"><button class="secondary manager-action-btn" data-manager-view-creator="${c.id}">👤 Ver perfil</button><button class="secondary manager-action-btn" data-manager-missions="${c.id}">🎯 Misiones</button></div></div>`;
  };
  const creatorRows=(creators||[]).map(creatorCard).join('') || '<div class="item"><p class="muted small" style="margin:0">No tienes creadores asignados actualmente.</p></div>';
  const tasksRes=await sb.from('manager_tasks').select('id,title,description,due_at,assigned_at,completed,completed_at').eq('manager_id',me?.id||'').order('completed',{ascending:true}).order('assigned_at',{ascending:false});
  const tasks=tasksRes.data||[];
  const taskHtml=tasks.length?tasks.map(t=>`<div class="item manager-task-row ${t.completed?'task-done':''}"><div><b>${esc(t.title)}</b>${t.description?`<div class="muted small" style="margin-top:4px">${esc(t.description)}</div>`:''}<div class="muted small" style="margin-top:6px">Asignada: <b>${formatDateTime(t.assigned_at)}</b>${t.due_at?` · Vence: <b>${formatDateTime(t.due_at)}</b>`:''}${t.completed_at?` · Lista: <b>${formatDateTime(t.completed_at)}</b>`:''}</div></div><div>${t.completed?'<span class="pill ok">✓ Lista</span>':'<button class="primary small" data-complete-manager-task="'+t.id+'">Marcar como lista</button>'}</div></div>`).join(''):'<div class="item"><p class="muted small" style="margin:0">No tienes tareas asignadas.</p></div>';
  const trainingManagement=await liveTrainingManagementTpl('manager',true);
  $('#manager').innerHTML=`<div class="manager-page"><div class="manager-hero card"><div><div class="eyebrow">PANEL DE MANAGER</div><h1>Hola, ${esc(me?.name||profile.username)} 👋</h1><p class="muted">Aquí puedes ver tus creadores, asignar misiones y gestionar tus entrenamientos en vivo.</p></div><div class="manager-hero-stat"><strong>${(creators||[]).length}</strong><span>CREADORES</span></div></div>${trainingManagement}<div class="card manager-creators-section"><button type="button" class="manager-creators-toggle" id="toggleMyCreators" aria-expanded="false"><span><strong>Mis creadores</strong><small>Solo aparecen los creadores que actualmente están asignados a ti.</small></span><span class="manager-creators-toggle-meta"><b>${(creators||[]).length}</b><span class="manager-creator-chevron">›</span></span></button><div id="managerCreatorsPanel" class="manager-creators-panel hidden"><div class="manager-creator-search"><span aria-hidden="true">⌕</span><input id="managerCreatorSearch" type="search" placeholder="Buscar por nombre o usuario…" autocomplete="off"></div><div id="managerCreatorNoResults" class="item hidden"><p class="muted small" style="margin:0">No encontramos un creador con esa búsqueda.</p></div><div class="manager-creators-list" id="managerCreatorsList">${creatorRows}</div></div></div><div class="card manager-task-accordion"><button type="button" class="grayxon-manager-accordion-toggle" id="toggleManagerTasks" aria-expanded="false"><span class="grayxon-manager-accordion-toggle-main"><span class="grayxon-manager-accordion-icon">📋</span><span class="grayxon-manager-accordion-copy"><strong>Tareas asignadas</strong><small>Consulta y completa las tareas que te ha asignado la administración.</small></span></span><span class="grayxon-manager-accordion-meta"><b>${tasks.length}</b><span class="grayxon-manager-accordion-chevron">›</span></span></button><div id="managerTasksPanel" class="grayxon-manager-accordion-panel hidden"><div class="manager-tasks-list">${taskHtml}</div></div></div></div>`;
  $('#toggleMyCreators')?.addEventListener('click',()=>{
    const panel=$('#managerCreatorsPanel');
    const btn=$('#toggleMyCreators');
    if(!panel||!btn)return;
    const open=panel.classList.contains('hidden');
    panel.classList.toggle('hidden',!open);
    btn.setAttribute('aria-expanded',open?'true':'false');
    btn.classList.toggle('is-open',open);
    if(open) setTimeout(()=>$('#managerCreatorSearch')?.focus(),40);
  });
  $('#toggleManagerTraining')?.addEventListener('click',()=>{
    const panel=$('#managerTrainingPanel');
    const btn=$('#toggleManagerTraining');
    if(!panel||!btn)return;
    const open=panel.classList.contains('hidden');
    panel.classList.toggle('hidden',!open);
    btn.setAttribute('aria-expanded',open?'true':'false');
    btn.classList.toggle('is-open',open);
  });
  $('#toggleManagerTasks')?.addEventListener('click',()=>{
    const panel=$('#managerTasksPanel');
    const btn=$('#toggleManagerTasks');
    if(!panel||!btn)return;
    const open=panel.classList.contains('hidden');
    panel.classList.toggle('hidden',!open);
    btn.setAttribute('aria-expanded',open?'true':'false');
    btn.classList.toggle('is-open',open);
  });
  $('#managerCreatorSearch')?.addEventListener('input',e=>{
    const q=(e.target.value||'').trim().toLowerCase();
    let visible=0;
    $$('#managerCreatorsList [data-manager-creator-row]').forEach(row=>{
      const match=!q || (row.dataset.search||'').includes(q);
      row.classList.toggle('hidden',!match);
      if(match) visible++;
    });
    $('#managerCreatorNoResults')?.classList.toggle('hidden',visible!==0);
  });
  bind();
}

async function managerCreatorModal(id){
  const [{data:d},{data:pm},{data:p}]=await Promise.all([
    sb.from('profile_details').select('*').eq('user_id',id).maybeSingle(),
    sb.from('payment_methods').select('*').eq('user_id',id).order('is_primary',{ascending:false}).limit(1).maybeSingle(),
    sb.from('profiles').select('id,username,full_name,active,team_id,manager_id').eq('id',id).single()
  ]);
  if(!p)return toast('No se encontró el creador.');

  const [{data:team},{data:manager}]=await Promise.all([
    p.team_id?sb.from('teams').select('name').eq('id',p.team_id).maybeSingle():{data:null},
    p.manager_id?sb.from('managers').select('name').eq('id',p.manager_id).maybeSingle():{data:null}
  ]);

  const el=document.createElement('div');el.className='modal-backdrop';
  const safe=x=>x?esc(x):'—';
  const avatar=d?.avatar_url?`<img class="creator-profile-modal-avatar" src="${esc(d.avatar_url)}" alt="Foto de ${safe(p.full_name||p.username)}">`:`<div class="creator-profile-modal-avatar creator-profile-modal-avatar-fallback">${esc((p.full_name||p.username||'C').trim().charAt(0).toUpperCase())}</div>`;
  el.innerHTML=`<div class="card modal creator-profile-modal">
    <div class="row"><div class="creator-profile-modal-head">${avatar}<div><div class="eyebrow">CREADOR</div><h2>${safe(p.full_name||p.username)}</h2><div class="muted small">@${safe(p.username)} · ${p.active?'Activo':'Inactivo'}</div></div></div><button class="secondary" id="closeManagerCreator">Cerrar</button></div>
    <div class="hr"></div>
    <h3>Información personal</h3>
    <div class="list"><div class="item">Correo: ${safe(d?.email)}</div><div class="item">Teléfono: ${safe(d?.phone)}</div><div class="item">Ubicación: ${safe(d?.country)} · ${safe(d?.state_region)} · ${safe(d?.city)}</div><div class="item">Dirección: ${safe(d?.address)}</div></div>
    <h3 style="margin-top:22px">Pago</h3>
    <div class="list">${pm?.method_type==='paypal'?`<div class="item">PayPal: ${safe(pm.paypal_email)}</div>`:`<div class="item">Banco: ${safe(pm?.bank_name)} · ${safe(pm?.bank_country)}</div><div class="item">Tipo: ${safe(pm?.account_type)}</div><div class="item">Cuenta: <span class="sensitive-value">${safe(pm?.account_number)}</span></div>`}</div>
    <div class="item" style="margin-top:16px"><b>Equipo:</b> ${safe(team?.name)} · <b>Manager:</b> ${safe(manager?.name)}</div>
  </div>`;
  document.body.appendChild(el);
  $('#closeManagerCreator').onclick=()=>el.remove();
}

async function managerMissionsModal(id){
  const [{data:p},{data:missions},{data:progress}]=await Promise.all([
    sb.from('profiles').select('id,username,full_name,active').eq('id',id).single(),
    sb.from('missions').select('id,title,description,type,target,week_start,week_end,published,link_url,created_at').eq('assigned_to',id).order('week_start',{ascending:false}).order('created_at',{ascending:false}),
    sb.from('mission_progress').select('mission_id,value,completed').eq('user_id',id)
  ]);
  if(!p)return toast('No se encontró el creador.');

  const el=document.createElement('div');el.className='modal-backdrop';
  const safe=x=>x?esc(x):'—';
  const today=new Date().toISOString().slice(0,10);
  const prog=new Map((progress||[]).map(x=>[x.mission_id,x]));
  const missionPct=m=>{
    const x=prog.get(m.id);
    if(!x)return 0;
    if(m.type==='checkbox')return x.completed?100:0;
    return Number(m.target)>0?Math.min(100,Math.round(Number(x.value||0)/Number(m.target)*100)):0;
  };
  const groupedWeeks=(()=>{
    const map=new Map();
    for(const m of (missions||[])){
      const key=`${m.week_start||'sin-inicio'}|${m.week_end||'sin-fin'}`;
      if(!map.has(key))map.set(key,{start:m.week_start||'',end:m.week_end||'',items:[]});
      map.get(key).items.push(m);
    }
    return Array.from(map.values()).sort((a,b)=>String(b.start||'').localeCompare(String(a.start||'')));
  })();
  const weekLabel=(start,end)=>start||end?`${start||'—'} → ${end||'—'}`:'Sin semana';
  const missionRow=m=>{
    const pct=missionPct(m);
    const expired=!!m.week_end&&m.week_end<today&&pct<100;
    return `<div class="item creator-mission-row ${pct>=100?'creator-mission-done':''}">
      <div class="row">
        <div style="min-width:0">
          <b>${esc(m.title)}</b>
          ${m.description?`<div class="muted small">${esc(m.description)}</div>`:''}
          <div class="muted small" style="margin-top:5px">${m.type==='checkbox'?'Marcable':'Meta numérica'}${m.type==='numeric'?` · Meta: ${Number(m.target||0).toLocaleString('es-CO')}`:''}</div>
          ${m.link_url?`<a class="mission-admin-link" href="${esc(m.link_url)}" target="_blank" rel="noopener noreferrer">🔗 Ver enlace</a>`:''}
        </div>
        <div class="inline creator-mission-actions">
          <span class="pill ${m.published?'ok':''}">${m.published?'Publicada':'Oculta'}</span>
          <span class="pill ${pct>=100?'ok':''}">${pct}%</span>
          ${pct>=100?'<span class="pill ok">✓ Completada</span>':expired?'<span class="pill">Semana finalizada</span>':'<span class="pill">En progreso</span>'}
          <button class="secondary small" data-manager-edit-mission="${m.id}">Editar</button>
          <button class="secondary small ${m.published?'danger':'ok'}" data-manager-toggle-mission="${m.id}">${m.published?'Ocultar':'Publicar'}</button>
          <button class="secondary small danger" data-manager-delete-mission="${m.id}">Eliminar</button>
        </div>
      </div>
      <div class="space-progress" style="margin-top:10px"><span style="width:${pct}%"></span></div>
    </div>`;
  };
  const weekCards=groupedWeeks.map((g,i)=>{
    const panelId=`managerMissionWeek-${id}-${i}`;
    const done=g.items.filter(m=>missionPct(m)>=100).length;
    const avg=g.items.length?Math.round(g.items.reduce((sum,m)=>sum+missionPct(m),0)/g.items.length):0;
    const current=today>=g.start&&today<=g.end;
    return `<div class="mission-week-group admin-mission-week-group">
      <button type="button" class="mission-week-card admin-mission-week-card" data-manager-mission-week="${panelId}" aria-expanded="false">
        <div class="mission-week-icon">🎯</div>
        <div class="mission-week-main">
          <div class="mission-week-top"><strong>Misiones ${esc(weekLabel(g.start,g.end))}</strong><span>${avg}%</span></div>
          <p>${g.items.length} ${g.items.length===1?'misión':'misiones'} · ${done} completada${done===1?'':'s'}${current?' · Semana actual':''}</p>
          <div class="space-progress"><span style="width:${avg}%"></span></div>
        </div>
        <b class="mission-week-arrow">›</b>
      </button>
      <div class="mission-week-details hidden" id="${panelId}">${g.items.map(missionRow).join('')}</div>
    </div>`;
  }).join('');

  el.innerHTML=`<div class="card modal creator-profile-modal">
    <div class="row"><div><div class="eyebrow">MISIONES DEL CREADOR</div><h2>${safe(p.full_name||p.username)}</h2><div class="muted small">@${safe(p.username)} · Aquí puedes ver las misiones que le has asignado, su progreso y cuáles ya completó.</div></div><button class="secondary" id="closeManagerMissions">Cerrar</button></div>
    <div class="creator-missions-section" style="margin-top:22px">
      <div class="row"><div><h3 style="margin-bottom:3px">🎯 Misiones asignadas</h3><p class="muted small" style="margin:0">Abre una semana para revisar cada misión, su progreso y estado.</p></div><button class="primary small" id="newManagerCreatorMission">+ Agregar misión</button></div>
      <div class="creator-mission-group" style="margin-top:14px"><div class="row"><div><h3 style="margin-bottom:3px">📅 Misiones por semana</h3><p class="muted small" style="margin:0">Las misiones cumplidas permanecen en el historial.</p></div><span class="mission-count">${groupedWeeks.length}</span></div>
      <div class="mission-weeks-list" style="margin-top:12px">${weekCards||'<div class="item"><p class="muted small" style="margin:0">Aún no has asignado misiones a este creador.</p></div>'}</div></div>
    </div>
  </div>`;
  document.body.appendChild(el);
  $('#closeManagerMissions').onclick=()=>el.remove();
  $('#newManagerCreatorMission').onclick=()=>creatorMissionModal(id,null,'manager-missions');
  el.querySelectorAll('[data-manager-mission-week]').forEach(b=>b.onclick=()=>{
    const panel=$('#'+b.dataset.managerMissionWeek);
    if(panel){const open=panel.classList.toggle('hidden')===false;b.classList.toggle('open',open);b.setAttribute('aria-expanded',String(open));}
  });
  el.querySelectorAll('[data-manager-edit-mission]').forEach(b=>b.onclick=()=>creatorMissionModal(id,b.dataset.managerEditMission,'manager-missions'));
  el.querySelectorAll('[data-manager-toggle-mission]').forEach(b=>b.onclick=async()=>{
    const {data,error}=await sb.from('missions').select('published').eq('id',b.dataset.managerToggleMission).single();
    if(error)return toast(error.message);
    const {error:e}=await sb.from('missions').update({published:!data.published}).eq('id',b.dataset.managerToggleMission);
    if(e)return toast(e.message);
    toast(data.published?'Misión ocultada':'Misión publicada ✓');
    el.remove();await managerMissionsModal(id);
  });
  el.querySelectorAll('[data-manager-delete-mission]').forEach(b=>b.onclick=async()=>{
    if(!confirm('¿Eliminar esta misión y su progreso?'))return;
    const {error}=await sb.from('missions').delete().eq('id',b.dataset.managerDeleteMission);
    if(error)return toast(error.message);
    toast('Misión eliminada');el.remove();await managerMissionsModal(id);
  });
}

async function adminManagerTasks(){
  const [{data:managers,error:me},{data:tasks,error:te}]=await Promise.all([
    sb.from('managers').select('id,name,username,user_id,active').order('name'),
    sb.from('manager_tasks').select('id,manager_id,title,description,due_at,assigned_at,assigned_by,completed,completed_at').order('assigned_at',{ascending:false})
  ]);
  if(me||te)return `<div class="card"><h2>Asignar tareas</h2><div class="error">${esc((me||te)?.message||'No se pudieron cargar las tareas.')}</div></div>`;
  const mm=new Map((managers||[]).map(m=>[m.id,m]));
  return `<div class="card"><div class="row"><div><h2>Asignar tareas</h2><p class="muted small">Asigna tareas a un manager y consulta su estado. La fecha de asignación se genera en la base de datos y la fecha de finalización se sella al marcarla como lista.</p></div><button class="primary" id="newManagerTask">+ Asignar tarea</button></div><div class="list" style="margin-top:18px">${(tasks||[]).map(t=>`<div class="item"><div class="row"><div style="min-width:0"><b>${esc(t.title)}</b><div class="muted small">Manager: ${esc(mm.get(t.manager_id)?.name||'Sin manager')}</div>${t.description?`<div class="muted small" style="margin-top:4px">${esc(t.description)}</div>`:''}<div class="muted small" style="margin-top:6px">Asignada: <b>${formatDateTime(t.assigned_at)}</b>${t.due_at?` · Vence: <b>${formatDateTime(t.due_at)}</b>`:''}${t.completed_at?` · Lista: <b>${formatDateTime(t.completed_at)}</b>`:''}</div></div><div class="inline"><span class="pill ${t.completed?'ok':''}">${t.completed?'✓ Lista':'Pendiente'}</span><button class="secondary small danger" data-delete-manager-task="${t.id}">Eliminar tarea</button></div></div></div>`).join('')||'<div class="item"><span class="muted small">Aún no hay tareas.</span></div>'}</div></div>`;
}

async function adminTeamModal(teamId){
  const [{data:team,error:te},{data:creators,error:ce},{data:manager,error:me}]=await Promise.all([
    sb.from('teams').select('id,name,manager_id').eq('id',teamId).single(),
    sb.from('profiles').select('id,username,full_name,active,team_id,manager_id').eq('team_id',teamId).eq('role','creator').order('full_name'),
    sb.from('teams').select('manager_id,managers:manager_id(id,name,username,active)').eq('id',teamId).maybeSingle()
  ]);
  if(te||ce) return toast((te||ce)?.message||'No se pudo cargar el equipo.');
  const m = manager?.managers || null;
  const ids=(creators||[]).map(c=>c.id);
  let missions=[], progress=[];
  if(ids.length){
    const [mr,pr]=await Promise.all([
      sb.from('missions').select('id,title,description,type,target,week_start,week_end,assigned_to,published,created_at').in('assigned_to',ids).order('week_start',{ascending:false}).order('created_at',{ascending:false}),
      sb.from('mission_progress').select('mission_id,user_id,value,completed').in('user_id',ids)
    ]);
    if(mr.error||pr.error) return toast((mr.error||pr.error)?.message||'No se pudieron cargar las misiones del equipo.');
    missions=mr.data||[]; progress=pr.data||[];
  }
  let tasks=[];
  if(team?.manager_id){
    const tr=await sb.from('manager_tasks').select('id,title,description,due_at,assigned_at,completed,completed_at').eq('manager_id',team.manager_id).order('assigned_at',{ascending:false});
    if(tr.error) return toast(tr.error.message);
    tasks=tr.data||[];
  }
  const prog=new Map((progress||[]).map(x=>[`${x.user_id}:${x.mission_id}`,x]));
  const pct=(mission,userId)=>{const x=prog.get(`${userId}:${mission.id}`);if(!x)return 0;if(mission.type==='checkbox')return x.completed?100:0;const target=Number(mission.target||0);return target>0?Math.min(100,Math.round(Number(x.value||0)/target*100)):0;};
  const weekKey=m=>`${m.week_start||'sin-fecha'}|${m.week_end||''}`;
  const groups={}; (missions||[]).forEach(x=>(groups[weekKey(x)] ||= []).push(x));
  const weekHtml=Object.entries(groups).map(([key,ms],i)=>{const [ws,we]=key.split('|');return `<div class="item" style="margin-top:10px"><button type="button" class="secondary" style="width:100%;text-align:left" data-team-week="${esc(`tw${i}`)}">📅 ${esc(ws)}${we?` → ${esc(we)}`:''} · ${ms.length} misión${ms.length===1?'':'es'}</button><div id="tw${i}" class="hidden" style="margin-top:8px">${ms.map(x=>{const c=(creators||[]).find(u=>u.id===x.assigned_to);const p=pct(x,x.assigned_to);return `<div class="item"><div class="row"><div><b>${esc(x.title)}</b><div class="muted small">${esc(c?.full_name||c?.username||'Creador')} · ${x.published?'Publicada':'Oculta'}</div>${x.description?`<div class="muted small">${esc(x.description)}</div>`:''}<div class="muted small" style="margin-top:5px">Progreso: <b>${p}%</b> · ${p>=100?'✓ Completada':'En progreso'}</div></div><span class="pill ${p>=100?'ok':''}">${p}%</span></div></div>`;}).join('')}</div></div>`;}).join('') || '<div class="item"><span class="muted small">No hay misiones asignadas a los creadores de este equipo.</span></div>';
  const creatorHtml=(creators||[]).map(c=>{const cm=missions.filter(x=>x.assigned_to===c.id);return `<div class="item"><div class="row"><div><b>${esc(c.full_name||c.username)}</b><div class="muted small">@${esc(c.username)} · ${c.active?'Activo':'Inactivo'}</div></div><span class="pill">${cm.length} misión${cm.length===1?'':'es'}</span></div></div>`;}).join('') || '<div class="item"><span class="muted small">Este equipo no tiene creadores asignados.</span></div>';
  const taskHtml=tasks.map(t=>`<div class="item"><div class="row"><div><b>${esc(t.title)}</b>${t.description?`<div class="muted small">${esc(t.description)}</div>`:''}<div class="muted small">Asignada: ${formatDateTime(t.assigned_at)}${t.due_at?` · Vence: ${formatDateTime(t.due_at)}`:''}${t.completed_at?` · Lista: ${formatDateTime(t.completed_at)}`:''}</div></div><span class="pill ${t.completed?'ok':''}">${t.completed?'✓ Lista':'Pendiente'}</span></div></div>`).join('') || '<div class="item"><span class="muted small">El manager de este equipo no tiene tareas asignadas.</span></div>';
  const el=document.createElement('div'); el.className='modal-backdrop';
  el.innerHTML=`<div class="card modal" style="max-width:900px"><div class="row"><div><div class="eyebrow">EQUIPO</div><h2>${esc(team?.name||'Equipo')}</h2><p class="muted small">Manager: ${esc(m?.name||'Sin manager')}</p></div><button class="secondary" id="closeAdminTeam">Cerrar</button></div><div class="card" style="margin-top:14px"><h3>👥 Creadores del equipo</h3>${creatorHtml}</div><div class="card" style="margin-top:14px"><h3>🎯 Misiones de los creadores</h3><p class="muted small">Aquí aparecen las misiones asignadas por los managers, incluidas las que aún no tienen progreso.</p>${weekHtml}</div><div class="card" style="margin-top:14px"><h3>📋 Tareas del manager</h3>${taskHtml}</div></div>`;
  document.body.appendChild(el);
  $('#closeAdminTeam').onclick=()=>el.remove();
  el.querySelectorAll('[data-team-week]').forEach(b=>b.onclick=()=>{const p=$('#'+b.dataset.teamWeek);if(p)p.classList.toggle('hidden');});
}

async function deleteManagerTask(id){
  if(!confirm('¿Eliminar esta tarea del manager?')) return;
  const {error}=await sb.from('manager_tasks').delete().eq('id',id);
  if(error) return toast(error.message);
  toast('Tarea eliminada ✓');
  render();
}

function managerTaskModal(){
  const el=document.createElement('div');el.className='modal-backdrop';
  el.innerHTML=`<div class="card modal"><h2>Asignar tarea a manager</h2><label class="field"><span>Manager</span><select id="mtManager"></select></label>${field('mtTitle','Título','')}${field('mtDesc','Descripción','',true)}<label class="field"><span>Fecha límite (opcional)</span><input id="mtDue" type="datetime-local"></label><div id="mtErr" class="error"></div><div class="inline" style="margin-top:18px"><button class="primary" id="saveManagerTask">Asignar tarea</button><button class="secondary" id="cancelManagerTask">Cancelar</button></div></div>`;
  document.body.appendChild(el);
  const select=$('#mtManager');
  sb.from('managers').select('id,name,active,user_id').order('name').then(({data,error})=>{if(error){$('#mtErr').textContent=error.message;return;}select.innerHTML=(data||[]).filter(m=>m.active&&m.user_id).map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('');});
  $('#cancelManagerTask').onclick=()=>el.remove();
  $('#saveManagerTask').onclick=async()=>{
    const btn=$('#saveManagerTask');btn.disabled=true;const managerId=select.value,title=$('#mtTitle').value.trim(),description=$('#mtDesc').value.trim()||null,due=$('#mtDue').value?new Date($('#mtDue').value).toISOString():null;
    if(!managerId||!title){$('#mtErr').textContent='Selecciona un manager y escribe el título.';btn.disabled=false;return;}
    const {data,error}=await sb.from('manager_tasks').insert({manager_id:managerId,title,description,due_at:due,assigned_by:session.user.id}).select('id').single();
    if(error){$('#mtErr').textContent=error.message;btn.disabled=false;return;}
    const {data:m}=await sb.from('managers').select('user_id,name').eq('id',managerId).single();
    if(m?.user_id){await sb.from('notifications').insert({user_id:m.user_id,type:'manager_task',title:'Nueva tarea asignada',message:`Tienes una nueva tarea: ${title}`,link_page:'manager'});}
    el.remove();toast('Tarea asignada ✓');render();
  };
}


function ensureLiveTrainingManagementStyles(){
  if($('#grayxon-live-training-management-styles'))return;const style=document.createElement('style');style.id='grayxon-live-training-management-styles';style.textContent=`.live-training-management{display:grid;gap:16px}.live-training-management-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}.live-training-management-actions{display:flex;gap:9px;flex-wrap:wrap}.live-training-management-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:16px}.live-training-stat{padding:16px;border:1px solid rgba(255,255,255,.08);border-radius:15px;background:rgba(255,255,255,.025)}.live-training-stat strong{display:block;font-size:25px;color:#fff}.live-training-stat span{display:block;margin-top:4px;color:#8f96a2;font-size:11px;letter-spacing:.08em;font-weight:800}.live-training-row{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:16px;border:1px solid rgba(255,255,255,.08);border-radius:15px;background:rgba(255,255,255,.02)}.live-training-row-main{min-width:0}.live-training-row-main b{display:block;color:#fff}.live-training-row-main .muted{margin-top:5px}.live-training-row-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.live-training-participant{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:13px}.live-training-participant:last-child{border-bottom:0}.live-training-check-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;max-height:260px;overflow:auto;padding:2px}.live-training-check{display:flex;align-items:center;gap:9px;padding:10px 11px;border:1px solid rgba(255,255,255,.08);border-radius:11px;background:rgba(255,255,255,.02);cursor:pointer}.live-training-check input{accent-color:#25f4ee}.live-training-check span{font-size:12px;color:#e7e9ed}.live-training-check small{display:block;color:#7f8691;margin-top:2px}.live-training-audience-help{margin-top:8px;line-height:1.5}.live-training-manager-audience{margin-top:12px}.live-training-idle-icon{display:inline-flex;width:44px;height:44px;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.12);border-radius:50%;color:#8d929c;font-size:24px}.live-training-empty-state{padding:46px 28px;text-align:center}.live-training-empty-state h2{margin:16px 0 8px;color:#fff}.live-training-empty-state p{max-width:680px;margin:0 auto;color:#9298a3;line-height:1.6}.grayxon-manager-accordion{margin-top:16px;overflow:hidden}.grayxon-manager-accordion-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;gap:16px;text-align:left;border:0;background:transparent;color:#fff;padding:18px 20px;cursor:pointer}.grayxon-manager-accordion-toggle:hover{background:rgba(255,255,255,.025)}.grayxon-manager-accordion-toggle-main{display:flex;align-items:center;gap:12px;min-width:0}.grayxon-manager-accordion-icon{width:40px;height:40px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.035);font-size:19px;flex:0 0 40px}.grayxon-manager-accordion-copy strong{display:block;font-size:15px}.grayxon-manager-accordion-copy small{display:block;margin-top:4px;color:#858c98;font-size:11px;line-height:1.4}.grayxon-manager-accordion-meta{display:flex;align-items:center;gap:10px;color:#9da4af}.grayxon-manager-accordion-chevron{font-size:23px;line-height:1;transition:transform .18s ease}.grayxon-manager-accordion-toggle.is-open .grayxon-manager-accordion-chevron{transform:rotate(90deg)}.grayxon-manager-accordion-panel{border-top:1px solid rgba(255,255,255,.07);padding:0 20px 20px}.grayxon-manager-accordion-panel.hidden{display:none!important}.manager-task-accordion{margin-top:16px}.manager-task-accordion .manager-tasks-list{padding-top:2px}@media(max-width:800px){.live-training-management-grid{grid-template-columns:1fr}.live-training-row{display:block}.live-training-row-actions{justify-content:flex-start;margin-top:12px}.live-training-management-actions{width:100%}.live-training-management-actions button{flex:1;min-width:150px}}`;document.head.appendChild(style);
}
function liveTrainingDuration(start,end){if(!start)return '—';const seconds=Math.max(0,Math.floor(((end?new Date(end):new Date()).getTime()-new Date(start).getTime())/1000));const h=Math.floor(seconds/3600),m=Math.floor((seconds%3600)/60),s=seconds%60;if(h)return `${h}h ${String(m).padStart(2,'0')}m`;if(m)return `${m}m ${String(s).padStart(2,'0')}s`;return `${s}s`;}
async function liveTrainingManagementData(){
  const {data:rawTrainings,error}=await sb.from('live_trainings').select('id,title,description,scheduled_at,room_name,status,created_by,instructor_name,created_at,started_at,ended_at').order('created_at',{ascending:false});if(error)throw error;
  const trainings=profile?.role==='manager'?(rawTrainings||[]).filter(t=>t.created_by===session?.user?.id):(rawTrainings||[]);
  const ids=trainings.map(t=>t.id);let participants=[],audience=[];
  if(ids.length){
    const [{data:parts,error:pe},{data:aud,error:ae}]=await Promise.all([
      sb.from('live_training_participants').select('id,training_id,user_id,joined_at,left_at,duration_seconds').in('training_id',ids).order('joined_at',{ascending:true}),
      sb.from('live_training_audience').select('id,training_id,target_type,target_id').in('training_id',ids)
    ]);
    if(pe)throw pe;if(ae)throw ae;participants=parts||[];audience=aud||[];
  }
  const userIds=[...new Set(participants.map(x=>x.user_id))];let profiles=[];if(userIds.length){const {data,error:ue}=await sb.from('profiles').select('id,username,full_name').in('id',userIds);if(ue)throw ue;profiles=data||[];}
  return {trainings,participants,audience,pm:new Map(profiles.map(p=>[p.id,p]))};
}
async function createLiveTrainingModal(){
  const isAdmin = profile?.role === 'admin';
  const el=document.createElement('div');el.className='modal-backdrop';
  const now=new Date();now.setMinutes(now.getMinutes()-now.getTimezoneOffset());
  const defaultDate=now.toISOString().slice(0,16);
  let audienceHtml='';
  if(isAdmin){
    const [{data:teams},{data:managers},{data:creators}]=await Promise.all([
      sb.from('teams').select('id,name').order('name'),
      sb.from('managers').select('id,name,username,active').eq('active',true).order('name'),
      sb.from('profiles').select('id,username,full_name,active,team_id,manager_id').eq('role','creator').eq('active',true).order('full_name')
    ]);
    audienceHtml=`<div class="field"><label>¿Quién puede asistir?</label><select id="ltAudienceType">
      <option value="all_creators">Todos los creadores</option>
      <option value="all_managers">Todos los managers</option>
      <option value="teams">Uno o varios equipos</option>
      <option value="managers">Managers específicos</option>
      <option value="creators">Creadores específicos</option>
    </select></div>
    <div id="ltAudiencePicker" class="field live-training-audience-picker"></div>
    <div class="muted small live-training-audience-help">Como administrador puedes invitar equipos, managers o creadores concretos. Esto no cambia su manager ni su equipo; solo define quién puede entrar a este entrenamiento.</div>`;
    setTimeout(()=>{
      const picker=$('#ltAudiencePicker'),type=$('#ltAudienceType');
      const renderPicker=()=>{
        if(!picker||!type)return;
        const v=type.value;
        if(v==='all_creators') {picker.innerHTML='<div class="item">👥 Todos los creadores de Grayxon podrán asistir.</div>';return;}
        if(v==='all_managers') {picker.innerHTML='<div class="item">👨‍💼 Todos los managers de Grayxon podrán asistir.</div>';return;}
        if(v==='teams') picker.innerHTML=`<div class="live-training-check-grid">${(teams||[]).map(t=>`<label class="live-training-check"><input type="checkbox" value="${t.id}" data-lt-team><span>${esc(t.name)}</span></label>`).join('')||'<div class="item">No hay equipos disponibles.</div>'}</div>`;
        if(v==='managers') picker.innerHTML=`<div class="live-training-check-grid">${(managers||[]).map(m=>`<label class="live-training-check"><input type="checkbox" value="${m.id}" data-lt-manager><span>${esc(m.name)} <small>@${esc(m.username||'')}</small></span></label>`).join('')||'<div class="item">No hay managers disponibles.</div>'}</div>`;
        if(v==='creators') picker.innerHTML=`<div class="live-training-check-grid live-training-check-grid-creators">${(creators||[]).map(c=>`<label class="live-training-check"><input type="checkbox" value="${c.id}" data-lt-creator><span>${esc(c.full_name||c.username)} <small>@${esc(c.username||'')}</small></span></label>`).join('')||'<div class="item">No hay creadores disponibles.</div>'}</div>`;
      };
      type?.addEventListener('change',renderPicker);renderPicker();
    },0);
  } else {
    audienceHtml=`<div class="item live-training-manager-audience"><b>Público</b><div class="muted small">Solo podrán asistir los creadores que pertenecen a tu equipo.</div></div>`;
  }
  el.innerHTML=`<div class="card modal live-training-create-modal"><div class="row"><div><div class="eyebrow">GRAYXON · ENTRENAMIENTOS</div><h2>Crear entrenamiento</h2><p class="muted small">El instructor se asignará automáticamente con tu nombre de perfil.</p></div><button class="secondary" id="cancelLiveTraining">Cerrar</button></div><div class="hr"></div>${field('ltTitle','Nombre del entrenamiento','')}${field('ltDescription','Descripción','',true)}<div class="field"><label>Fecha y hora programada (opcional)</label><input id="ltScheduledAt" type="datetime-local" value="${defaultDate}"></div><div class="item" style="margin-top:10px"><b>Instructor</b><div class="muted small">${esc(profile?.full_name||profile?.username||'Tu perfil')}</div></div>${audienceHtml}<div id="ltErr" class="error"></div><div class="inline" style="margin-top:18px"><button class="primary" id="saveLiveTraining">Crear entrenamiento</button><button class="secondary" id="cancelLiveTraining2">Cancelar</button></div></div>`;
  document.body.appendChild(el);
  const close=()=>el.remove();$('#cancelLiveTraining').onclick=close;$('#cancelLiveTraining2').onclick=close;
  $('#saveLiveTraining').onclick=async()=>{
    const btn=$('#saveLiveTraining');btn.disabled=true;
    try{
      const title=$('#ltTitle').value.trim(),description=$('#ltDescription').value.trim()||null,scheduled=$('#ltScheduledAt').value?new Date($('#ltScheduledAt').value).toISOString():null;
      if(!title){$('#ltErr').textContent='Escribe el nombre del entrenamiento.';btn.disabled=false;return;}
      const {data:created,error}=await sb.from('live_trainings').insert({title,description,scheduled_at:scheduled}).select('id').single();
      if(error)throw error;
      if(isAdmin){
        const type=$('#ltAudienceType')?.value||'all_creators';let rows=[];
        if(type==='all_creators'||type==='all_managers') rows=[{training_id:created.id,target_type:type,target_id:null}];
        if(type==='teams') rows=[...document.querySelectorAll('[data-lt-team]:checked')].map(x=>({training_id:created.id,target_type:'team',target_id:x.value}));
        if(type==='managers') rows=[...document.querySelectorAll('[data-lt-manager]:checked')].map(x=>({training_id:created.id,target_type:'manager',target_id:x.value}));
        if(type==='creators') rows=[...document.querySelectorAll('[data-lt-creator]:checked')].map(x=>({training_id:created.id,target_type:'creator',target_id:x.value}));
        if(!rows.length)throw new Error('Selecciona al menos un equipo, manager o creador para este entrenamiento.');
        const {error:ae}=await sb.from('live_training_audience').insert(rows);if(ae)throw ae;
      }
      close();toast('Entrenamiento creado ✓');render();
    }catch(e){
      $('#ltErr').textContent=e?.message||'No se pudo crear el entrenamiento.';btn.disabled=false;
    }
  };
}

async function startLiveTraining(id){if(!id)return;const {data,error}=await sb.from('live_trainings').update({status:'live',started_at:new Date().toISOString(),ended_at:null}).eq('id',id).eq('status','scheduled').select('id,title,description,room_name,created_by,instructor_name,scheduled_at,status,started_at').single();if(error){toast(error.code==='23505'?'Ya hay otro entrenamiento EN VIVO. Finalízalo antes de iniciar uno nuevo.':error.message);return;}currentLiveTraining=data;pendingLiveTrainingAutoStart=data;nav('live-training');}
async function finishLiveTraining(id){if(!confirm('¿Finalizar este entrenamiento?'))return;const endedAt=new Date().toISOString();const {data,error}=await sb.from('live_trainings').update({status:'finished',ended_at:endedAt}).eq('id',id).eq('status','live').select('id,title').single();if(error){toast(error.message);return;}await sb.from('live_training_participants').update({left_at:endedAt}).eq('training_id',id).is('left_at',null);toast(`“${data?.title||'Entrenamiento'}” finalizado ✓`);render();}
async function deleteLiveTraining(id){if(!confirm('¿Eliminar este entrenamiento del historial? Esta acción no se puede deshacer.'))return;const {error}=await sb.from('live_trainings').delete().eq('id',id);if(error){toast(error.message);return;}toast('Entrenamiento eliminado ✓');render();}
async function openLiveTrainingHistory(id){
  const {data:t,error}=await sb.from('live_trainings').select('id,title,description,instructor_name,created_by,created_at,scheduled_at,started_at,ended_at,status').eq('id',id).maybeSingle();if(error||!t)return toast(error?.message||'No se encontró el entrenamiento.');const [{data:rows,error:pe},{data:audience,error:ae}]=await Promise.all([sb.from('live_training_participants').select('id,user_id,joined_at,left_at,duration_seconds').eq('training_id',id).order('joined_at',{ascending:true}),sb.from('live_training_audience').select('target_type,target_id').eq('training_id',id)]);if(pe)return toast(pe.message);if(ae)return toast(ae.message);const ids=[...new Set((rows||[]).map(x=>x.user_id))];const {data:ps}=ids.length?await sb.from('profiles').select('id,username,full_name').in('id',ids):{data:[]};const pm=new Map((ps||[]).map(p=>[p.id,p]));const attendees=[...new Map((rows||[]).filter(x=>x.user_id!==t.created_by).map(x=>[x.user_id,x])).values()];const el=document.createElement('div');el.className='modal-backdrop';el.innerHTML=`<div class="card modal" style="max-width:780px"><div class="row"><div><div class="eyebrow">HISTORIAL</div><h2>${esc(t.title)}</h2></div><button class="secondary" id="closeLiveHistory">Cerrar</button></div><div class="hr"></div><div class="grid"><div class="item"><b>Fecha</b><div class="muted small">${formatDateTime(t.started_at||t.scheduled_at||t.created_at)}</div></div><div class="item"><b>Instructor</b><div class="muted small">${esc(t.instructor_name)}</div></div><div class="item"><b>Duración</b><div class="muted small">${liveTrainingDuration(t.started_at,t.ended_at)}</div></div><div class="item"><b>Participantes</b><div class="muted small">${attendees.length}</div></div><div class="item"><b>Público</b><div class="muted small">${audience.some(x=>x.target_type==='all_creators')?'Todos los creadores':audience.some(x=>x.target_type==='all_managers')?'Todos los managers':`${audience.length} segmentación${audience.length===1?'':'es'}`}</div></div></div><h3 style="margin-top:20px">Participantes</h3><div class="list">${attendees.length?attendees.map(x=>{const p=pm.get(x.user_id)||{};return `<div class="live-training-participant"><span><b>${esc(p.full_name||p.username||'Usuario')}</b><span class="muted"> · @${esc(p.username||'—')}</span></span><span class="muted">${liveTrainingDuration(x.joined_at,x.left_at)}</span></div>`}).join(''):'<div class="item"><p class="muted small" style="margin:0">No hay participantes registrados.</p></div>'}</div></div>`;document.body.appendChild(el);$('#closeLiveHistory').onclick=()=>el.remove();
}
async function liveTrainingManagementTpl(role='manager',collapsible=false){
  ensureLiveTrainingManagementStyles();let data;try{data=await liveTrainingManagementData();}catch(e){return `<div class="card"><h2>Entrenamientos</h2><div class="error">${esc(e?.message||'No se pudo cargar el historial de entrenamientos.')}</div></div>`;}const {trainings,participants,audience}=data;const active=trainings.find(t=>t.status==='live'),scheduled=trainings.filter(t=>t.status==='scheduled'),finished=trainings.filter(t=>t.status==='finished');const countParticipants=t=>new Set(participants.filter(p=>p.training_id===t.id&&p.user_id!==t.created_by).map(p=>p.user_id)).size;const audienceFor=t=>audience.filter(a=>a.training_id===t.id);const audienceLabel=t=>{const a=audienceFor(t);if(!a.length)return 'Sin público definido';if(a.some(x=>x.target_type==='all_creators'))return 'Todos los creadores';if(a.some(x=>x.target_type==='all_managers'))return 'Todos los managers';return `${a.length} segmentación${a.length===1?'':'es'} configurada${a.length===1?'':'s'}`;};const canManage=t=>role==='admin'||t.created_by===session?.user?.id;
  const scheduledHtml=scheduled.length?scheduled.map(t=>`<div class="live-training-row"><div class="live-training-row-main"><b>${esc(t.title)}</b><div class="muted small">${esc(t.instructor_name)} · ${t.scheduled_at?formatDateTime(t.scheduled_at):'Sin fecha programada'} · ${esc(audienceLabel(t))}</div></div><div class="live-training-row-actions">${canManage(t)?`<button class="primary small" data-start-live-training="${t.id}">▶ Iniciar entrenamiento</button>`:''}</div></div>`).join(''):'<div class="item"><p class="muted small" style="margin:0">No hay entrenamientos programados.</p></div>';
  const historyHtml=finished.length?finished.map(t=>`<div class="live-training-row"><div class="live-training-row-main"><b>${esc(t.title)}</b><div class="muted small">${formatDateTime(t.started_at||t.created_at)} · ${esc(t.instructor_name)} · ${liveTrainingDuration(t.started_at,t.ended_at)} · ${countParticipants(t)} participantes · ${esc(audienceLabel(t))}</div></div><div class="live-training-row-actions"><button class="secondary small" data-view-live-history="${t.id}">Ver historial</button>${canManage(t)?`<button class="secondary small danger" data-delete-live-training="${t.id}">Eliminar</button>`:''}</div></div>`).join(''):'<div class="item"><p class="muted small" style="margin:0">Todavía no hay entrenamientos finalizados.</p></div>';
  const activeHtml=active?`<div class="live-training-row"><div class="live-training-row-main"><b>${esc(active.title)}</b><div class="muted small">EN VIVO · ${esc(active.instructor_name)} · Inició ${formatDateTime(active.started_at)} · ${countParticipants(active)} participantes · ${esc(audienceLabel(active))}</div></div><div class="live-training-row-actions"><button class="primary small" data-open-live-training="${active.id}">🎥 Abrir entrenamiento</button>${canManage(active)?`<button class="secondary small danger" data-finish-live-training="${active.id}">■ Finalizar</button>`:''}</div></div>`:'<div class="item"><p class="muted small" style="margin:0">No hay ningún entrenamiento EN VIVO.</p></div>';
  const content=`<div class="live-training-management"><div class="live-training-management-head"><div><div class="eyebrow">GRAYXON · ENTRENAMIENTOS</div><h2>Entrenamientos</h2><p class="muted small">Crea, inicia, finaliza y consulta el historial. El instructor se toma automáticamente de quien crea el entrenamiento.</p></div><div class="live-training-management-actions"><button class="primary" id="newLiveTraining">+ Crear entrenamiento</button></div></div><div class="live-training-management-grid"><div class="live-training-stat"><strong>${active?'1':'0'}</strong><span>EN VIVO</span></div><div class="live-training-stat"><strong>${scheduled.length}</strong><span>PROGRAMADOS</span></div><div class="live-training-stat"><strong>${finished.length}</strong><span>FINALIZADOS</span></div></div><div><h3>Iniciar entrenamiento</h3><div class="list">${activeHtml}${scheduledHtml}</div></div><div><h3>Historial de entrenamientos</h3><div class="list">${historyHtml}</div></div></div>`;
  if(!collapsible)return `<div class="card live-training-management">${content}</div>`;
  return `<div class="card grayxon-manager-accordion"><button type="button" class="grayxon-manager-accordion-toggle" id="toggleManagerTraining" aria-expanded="false"><span class="grayxon-manager-accordion-toggle-main"><span class="grayxon-manager-accordion-icon">🎥</span><span class="grayxon-manager-accordion-copy"><strong>Entrenamientos</strong><small>Crea entrenamientos para tu equipo, inícialos y consulta tu historial.</small></span></span><span class="grayxon-manager-accordion-meta"><b>${active?'EN VIVO':`${scheduled.length} programados`}</b><span class="grayxon-manager-accordion-chevron">›</span></span></button><div id="managerTrainingPanel" class="grayxon-manager-accordion-panel hidden">${content}</div></div>`;
}

async function adminTpl(c) {
  if (!session) {
    $('#admin').innerHTML = authTpl();
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
  else if (adminView === 'manager_tasks') body = await adminManagerTasks();
  else if (adminView === 'live_trainings') body = await liveTrainingManagementTpl('admin');
  else body = await adminFormation();
  $('#admin').innerHTML = `<div class="admin-shell"><aside class="admin-side"><b>ADMIN</b><div class="hr"></div>${[['dashboard','Resumen'],['home','Inicio'],['benefits','Beneficios y requisitos'],['creators','Creadores'],['teams','Equipos y managers'],['manager_tasks','Asignar tareas'],['live_trainings','Entrenamientos'],['formation','Formación']].map(([id,t]) => `<button class="${adminView === id ? 'active' : ''}" data-admin="${id}">${t}</button>`).join('')}<div class="hr"></div><button id="adminLogout">Cerrar sesión</button></aside><div>${body}</div></div>`;
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
  return `<div class="card"><div class="row"><div><h2>Equipos y managers</h2><p class="muted small">Crea equipos, asigna su manager y guarda su WhatsApp con indicativo para que los creadores puedan contactarlo directamente.</p></div><button class="primary" id="newTeamManager">+ Crear equipo</button></div><div class="list" style="margin-top:18px">${(teams||[]).map(t=>{const m=(managers||[]).find(x=>x.id===t.manager_id);return `<div class="item"><div class="row"><div><b>${esc(t.name)}</b><div class="muted small">Manager: ${esc(m?.name||'Sin asignar')}</div><div class="muted small">${m?.phone?`WhatsApp: ${esc(m.phone)}`:'Sin teléfono'}${m?.email?` · ${esc(m.email)}`:''}</div></div><div class="inline"><button class="secondary small" data-view-team="${t.id}">👥 Ver equipo</button><button class="secondary small" data-edit-team="${t.id}">✏️ Editar</button><button class="secondary small danger" data-delete-team="${t.id}">Eliminar</button></div></div></div>`}).join('')||'<p class="muted">Aún no hay equipos.</p>'}</div></div>`;
}
function teamManagerModal(existing=null){
  const el=document.createElement('div'); el.className='modal-backdrop';
  const needsAccess=!existing?.manager?.user_id;
  el.innerHTML=`<div class="card modal"><h2>${existing?'Editar':'Crear'} equipo</h2>${field('tmName','Nombre del equipo',existing?.name||'')}<h3 style="margin-top:18px">Manager</h3>${field('tmManagerName','Nombre completo',existing?.manager?.name||'')}<div class="field"><label>WhatsApp con indicativo</label><input id="tmManagerPhone" value="${esc(existing?.manager?.phone||'')}" placeholder="+573126283007"></div>${field('tmManagerEmail','Correo',existing?.manager?.email||'')}<div class="manager-access-box"><div class="eyebrow">ACCESO AL PORTAL</div>${needsAccess?`<div class="item" style="margin-bottom:12px"><b>Este manager ya existe.</b><div class="muted small">Aquí solo vamos a crear su acceso; no se creará otro manager.</div></div>${field('tmManagerUsername','Usuario del manager',existing?.manager?.username||'')}<div class="field"><label>Contraseña inicial</label><input id="tmManagerPassword" type="password" placeholder="Mínimo 8 caracteres"></div><p class="muted small">Se vinculará este acceso al manager actual y se conservará su registro.</p>`:`<div class="item"><b>Acceso ya creado</b><div class="muted small">@${esc(existing?.manager?.username||'manager')} · ${existing?.manager?.active!==false?'Activo':'Inactivo'}</div></div>${existing?.manager?.user_id?`<div class="manager-password-reset" style="margin-top:12px"><div class="field"><label>Nueva contraseña del manager</label><input id="tmManagerNewPassword" type="password" placeholder="Mínimo 8 caracteres" autocomplete="new-password"></div><button type="button" class="secondary small" id="changeManagerPassword">🔑 Cambiar contraseña</button><div id="tmPasswordMsg" class="muted small" style="margin-top:8px"></div></div>`:''}</div>`}<div id="tmErr" class="error"></div><div class="inline" style="margin-top:18px"><button class="primary" id="saveTeamManager">${needsAccess ? 'Crear acceso y guardar' : 'Guardar cambios'}</button><button class="secondary" id="cancelTeamManager">Cancelar</button></div></div>`;
  document.body.appendChild(el);
  $('#cancelTeamManager').onclick=()=>el.remove();
  if(existing?.manager?.user_id){
    $('#changeManagerPassword').onclick=async()=>{
      const btn=$('#changeManagerPassword');
      const msg=$('#tmPasswordMsg');
      const password=$('#tmManagerNewPassword').value;
      msg.textContent='';
      if(!password||password.length<8){ msg.textContent='La contraseña debe tener mínimo 8 caracteres.'; return; }
      btn.disabled=true;
      try{
        await updateManagerPassword(existing.manager_id, password);
        $('#tmManagerNewPassword').value='';
        msg.textContent='Contraseña actualizada correctamente.';
      }catch(e){
        msg.textContent=e?.message||'No se pudo cambiar la contraseña.';
      }finally{ btn.disabled=false; }
    };
  }
  $('#saveTeamManager').onclick=async()=>{
    const btn=$('#saveTeamManager');btn.disabled=true;
    const name=$('#tmName').value.trim(),mn=$('#tmManagerName').value.trim(),phone=$('#tmManagerPhone').value.trim(),email=$('#tmManagerEmail').value.trim()||null;
    const username=needsAccess?$('#tmManagerUsername')?.value.trim().toLowerCase():existing?.manager?.username;
    const password=needsAccess?$('#tmManagerPassword')?.value:'';
    if(!name||!mn){$('#tmErr').textContent='Escribe el nombre del equipo y del manager.';btn.disabled=false;return;}
    if(needsAccess&&(!username||!password||password.length<8)){ $('#tmErr').textContent='Define usuario y una contraseña de mínimo 8 caracteres para el manager.';btn.disabled=false;return; }
    try{
      let managerId=existing?.manager_id||null;
      let userId=existing?.manager?.user_id||null;

      // If this manager has no portal access yet, the Edge Function creates
      // BOTH the Auth user and the linked manager/profile records atomically
      // from the portal's point of view. Do not insert/update those records
      // again here; doing so used to create duplicate manager rows or hit the
      // creator-assignment protection trigger.
      if(needsAccess){
        const data=await createManagerAccess({username,full_name:mn,password,phone,email,manager_id:managerId});
        userId=data?.user?.id||data?.profile?.id||data?.id;
        managerId=data?.manager?.id||managerId;
        if(!userId||!managerId)throw new Error('El acceso se creó pero no pudimos recuperar el manager.');
      } else if(managerId){
        const {error}=await sb.from('managers').update({name:mn,phone,email,username,active:true,updated_at:new Date().toISOString()}).eq('id',managerId);
        if(error)throw error;
        if(userId){
          const {error:upe}=await sb.from('profiles').update({role:'manager',active:true,full_name:mn}).eq('id',userId);
          if(upe)throw upe;
        }
      } else {
        throw new Error('No se encontró el manager seleccionado.');
      }
      const payload={name,manager_id:managerId,updated_at:new Date().toISOString()};
      const {data:teamSaved,error}=existing?await sb.from('teams').update(payload).eq('id',existing.id).select('id').single():await sb.from('teams').insert(payload).select('id').single();
      if(error)throw error;
      if(teamSaved?.id){
        const {error:assignErr}=await sb.from('profiles').update({manager_id:managerId}).eq('team_id',teamSaved.id).eq('role','creator');
        if(assignErr)throw assignErr;
      }
      el.remove();toast(existing ? (needsAccess ? 'Acceso creado y manager actualizado ✓' : 'Equipo y manager actualizados ✓') : 'Equipo y acceso de manager creados ✓');render();
    }catch(e){$('#tmErr').textContent=e.message||'No se pudo guardar.';btn.disabled=false;}
  };
}

async function editTeam(id){const {data:t,error}=await sb.from('teams').select('*').eq('id',id).single();if(error||!t)return toast(error?.message||'No se encontró el equipo.');const {data:m}=t.manager_id?await sb.from('managers').select('*').eq('id',t.manager_id).maybeSingle():{data:null};teamManagerModal({...t,manager:m});}
async function deleteTeam(id){if(!confirm('¿Eliminar este equipo? Los creadores quedarán sin equipo asignado.'))return;await sb.from('profiles').update({team_id:null,manager_id:null}).eq('team_id',id);const {data:t}=await sb.from('teams').select('manager_id').eq('id',id).maybeSingle();if(t?.manager_id)await sb.from('managers').delete().eq('id',t.manager_id);const {error}=await sb.from('teams').delete().eq('id',id);if(error)return toast(error.message);toast('Equipo eliminado');render();}

function formatDateTime(value){ if(!value) return '—'; try{return new Date(value).toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short'});}catch(e){return String(value);} }
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

async function creatorMissionModal(creatorId, existingId=null, returnMode='admin'){
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
      payloads.push({title,description,type,target,week_start:start,week_end:endDate,assigned_to:creatorId,published:existing?$(`#cmPublished${i}`).value==='true':$(`#cmPublished${i}`).value==='true',link_url:link,...(!existing&&profile?.role==='manager'?{created_by:session.user.id,created_by_role:'manager'}:{})});
    }
    let result;
    if(existing){ result=await sb.from('missions').update(payloads[0]).eq('id',existingId); }
    else { result=await sb.from('missions').insert(payloads); }
    if(result.error){err.textContent=result.error.message;btn.disabled=false;return;}
    if(!existing && profile?.role==='manager'){
      const msg=`Se te han asignado ${payloads.length} ${payloads.length===1?'misión':'misiones'} para esta semana (${start} → ${endDate}).`;
      const nr=await sb.rpc('notify_creator_mission_week',{p_creator_id:creatorId,p_title:'Tienes una notificación nueva',p_message:msg,p_week_start:start,p_week_end:endDate});
      if(nr.error) console.warn('No se pudo notificar al creador:',nr.error.message);
    }
    toast(existing?'Misión actualizada ✓':`${payloads.length} misión${payloads.length===1?'':'es'} enviada${payloads.length===1?'':'s'} ✓`);
    el.remove();
    const old=document.querySelector('.creator-profile-modal')?.parentElement;if(old)old.remove();
    if(returnMode==='manager-missions'){ await managerMissionsModal(creatorId); } else if(returnMode==='manager'){ await managerCreatorModal(creatorId); } else { await adminProfileModal(creatorId); }
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
    if(role) role.textContent=profile?.role==='admin' ? 'Administrador' : profile?.role==='manager' ? 'Manager' : 'Creador';
  }
}
function closeProfileMenu(){ const menu=$('#profileMenu'); if(menu) menu.classList.add('hidden'); }

function updateHeaderAccessUI(){
  const btn=$('#adminOpen');
  if(!btn) return;
  if(!session){
    btn.textContent='Iniciar sesión';
    btn.onclick=()=>nav('auth');
    return;
  }
  if(profile?.role==='admin'){
    btn.textContent='⚙ Admin';
    btn.onclick=()=>nav('admin');
  } else if(profile?.role==='manager'){
    btn.textContent='👥 Manager';
    btn.onclick=()=>nav('manager');
  } else {
    btn.textContent='👤 Mi espacio';
    btn.onclick=()=>nav('space');
  }
}

function bind() {
  $('#homeBrand')?.addEventListener('click', () => nav('home'));
  $$('[data-page]').forEach(b => b.onclick = () => { const target = b.dataset.page; if (target === 'space' && session) nav(profile?.role === 'manager' ? 'manager' : 'space'); else if (target === 'auth' && session) nav(profile?.role === 'manager' ? 'manager' : profile?.role === 'creator' ? 'space' : 'admin'); else nav(target); });
  $$('[data-space-action]').forEach(b => b.onclick = () => { const action = b.dataset.spaceAction; if (action === 'missions') nav('missions'); else nav(action); });
  updateHeaderAccessUI();
  $('#mobileMenuBtn')?.addEventListener('click', () => { const m = $('#mobileNav'); const open = m?.classList.toggle('open'); $('#mobileMenuBtn')?.setAttribute('aria-expanded', open ? 'true' : 'false'); });
  $('#mobileAdminOpen')?.addEventListener('click', () => { if(session) nav(profile?.role==='admin'?'admin':profile?.role==='manager'?'manager':'space'); else nav('auth'); });
  $$('#mobileNav [data-page]').forEach(b => b.addEventListener('click', () => $('#mobileNav')?.classList.remove('open')));
  $('#loginBtn')?.addEventListener('click', login);
  $('#forgotPasswordBtn')?.addEventListener('click',()=>$('#resetBox')?.classList.toggle('hidden'));
  $('#sendResetBtn')?.addEventListener('click',sendPasswordReset);
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
  $$('[data-manager-creator-toggle]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.managerCreatorToggle;
    const actions=$(`[data-manager-actions="${id}"]`);
    if(!actions)return;
    const willOpen=actions.classList.contains('hidden');
    $$('.manager-creator-actions').forEach(x=>x.classList.add('hidden'));
    $$('[data-manager-creator-toggle]').forEach(x=>x.classList.remove('is-open'));
    if(willOpen){ actions.classList.remove('hidden'); b.classList.add('is-open'); }
  });
  $$('[data-manager-view-creator]').forEach(b=>b.onclick=e=>{e.stopPropagation();managerCreatorModal(b.dataset.managerViewCreator)});
  $$('[data-manager-missions]').forEach(b=>b.onclick=e=>{e.stopPropagation();managerMissionsModal(b.dataset.managerMissions)});
  $$('[data-complete-manager-task]').forEach(b=>b.onclick=async()=>{b.disabled=true;const {error}=await sb.rpc('complete_manager_task',{p_task_id:b.dataset.completeManagerTask});if(error){toast(error.message);b.disabled=false;return;}toast('Tarea marcada como lista ✓');await loadNotifications();render();});
  $('#newManagerTask')?.addEventListener('click',managerTaskModal);
  $$('[data-toggle-creator]').forEach(b => b.onclick = () => toggleCreator(b.dataset.toggleCreator));
  $$('[data-view-profile]').forEach(b => b.onclick = () => adminProfileModal(b.dataset.viewProfile));
  $('#newTeamManager')?.addEventListener('click',()=>teamManagerModal());
  $$('[data-view-team]').forEach(b=>b.onclick=()=>adminTeamModal(b.dataset.viewTeam));
  $$('[data-edit-team]').forEach(b=>b.onclick=()=>editTeam(b.dataset.editTeam));
  $$('[data-delete-team]').forEach(b=>b.onclick=()=>deleteTeam(b.dataset.deleteTeam));
  $$('[data-delete-manager-task]').forEach(b=>b.onclick=()=>deleteManagerTask(b.dataset.deleteManagerTask));
  $('#newLiveTraining')?.addEventListener('click',createLiveTrainingModal);
  $$('[data-start-live-training]').forEach(b=>b.onclick=()=>startLiveTraining(b.dataset.startLiveTraining));
  $$('[data-finish-live-training]').forEach(b=>b.onclick=()=>finishLiveTraining(b.dataset.finishLiveTraining));
  $$('[data-delete-live-training]').forEach(b=>b.onclick=()=>deleteLiveTraining(b.dataset.deleteLiveTraining));
  $$('[data-view-live-history]').forEach(b=>b.onclick=()=>openLiveTrainingHistory(b.dataset.viewLiveHistory));
  $$('[data-open-live-training]').forEach(b=>b.onclick=()=>nav('live-training'));
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
  if(role) role.textContent=session ? (profile?.role==='admin' ? 'Administrador' : profile?.role==='manager' ? 'Manager' : 'Creador') : 'Inicia sesión para acceder';
}
async function sendPasswordReset(){
  const email=($('#resetEmail')?.value||$('#loginUser')?.value||'').trim().toLowerCase();
  const err=$('#resetErr');
  if(!email || !email.includes('@')){if(err)err.textContent='Escribe un correo válido.';return;}
  const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+window.location.pathname});
  if(err)err.textContent=error?error.message:'Enlace enviado. Revisa tu correo.';
}

async function finishPasswordRecovery(){
  const box=document.createElement('div');box.className='modal-backdrop';
  box.innerHTML=`<div class="card modal"><h2>Crear nueva contraseña</h2><p class="muted small">Tu enlace de recuperación es válido. Define una nueva contraseña para volver a entrar.</p><div class="field"><label>Nueva contraseña</label><input id="newRecoveryPass" type="password" autocomplete="new-password"></div><div class="field"><label>Repetir contraseña</label><input id="newRecoveryPass2" type="password" autocomplete="new-password"></div><div id="recoveryErr" class="error"></div><div class="inline"><button class="primary" id="saveRecoveryPass">Guardar contraseña</button></div></div>`;
  document.body.appendChild(box);
  $('#saveRecoveryPass').onclick=async()=>{const a=$('#newRecoveryPass').value,b=$('#newRecoveryPass2').value,err=$('#recoveryErr');if(a.length<6){err.textContent='La contraseña debe tener al menos 6 caracteres.';return;}if(a!==b){err.textContent='Las contraseñas no coinciden.';return;}const btn=$('#saveRecoveryPass');btn.disabled=true;const {error}=await sb.auth.updateUser({password:a});if(error){err.textContent=error.message;btn.disabled=false;return;}box.remove();toast('Contraseña actualizada ✓');await sb.auth.signOut();session=null;profile=null;nav('auth');};
}

async function login() {
  const input = $('#loginUser')?.value.trim() || '';
  const p = $('#loginPass')?.value || '';
  const value = input.toLowerCase();
  if (!input || !p) { $('#loginErr').textContent = 'Ingresa tus datos para continuar.'; return; }

  // Si se usa username, conservamos la comprobación de acceso de creador
  // para mostrar un mensaje claro cuando una cuenta de creador está bloqueada.
  // Para managers y admins, si no existe en esa RPC, el flujo continúa con Auth.
  if (!value.includes('@')) {
    try {
      const { data: accessStatus } = await sb.rpc('creator_access_status', { p_username: value });
      if (accessStatus?.length && accessStatus[0]?.exists && accessStatus[0]?.active === false) {
        $('#loginErr').textContent = '🔒 Tu acceso al portal está desactivado. Contacta con tu manager para solicitar la reactivación.';
        return;
      }
    } catch (_) {}
  }

  // Un único acceso para los tres roles. Si el usuario escribe un username,
  // probamos los dominios técnicos internos en orden; si escribe un correo,
  // usamos exactamente ese correo. El correo técnico nunca se muestra al usuario.
  const candidateEmails = value.includes('@')
    ? [value]
    : [`${value}@${LOGIN_EMAIL_DOMAIN}`, `${value}@${LEGACY_LOGIN_EMAIL_DOMAIN}`];

  let data = null;
  for (const email of candidateEmails) {
    const result = await sb.auth.signInWithPassword({ email, password: p });
    if (!result.error && result.data?.session) {
      data = result.data;
      break;
    }
  }
  if (!data?.session) { $('#loginErr').textContent = 'Usuario o contraseña incorrectos.'; return; }

  session = data.session;
  profile = await getProfile();
  await loadProfileDetails();
  await loadNotifications();
  if (!profile?.active) {
    await sb.auth.signOut();
    session = null;
    profile = null;
    $('#loginErr').textContent = 'Tu acceso al portal ha sido desactivado. Si crees que esto es un error o necesitas volver a ingresar, contacta con tu manager.';
    updateHeaderAccessUI();
    return;
  }

  updateHeaderAccessUI();
  nav(profile.role === 'admin' ? 'admin' : profile.role === 'manager' ? 'manager' : 'space');
}

async function logout() {
  await sb.auth.signOut(); session = null; profile = null; profileDetails = null; paymentMethod = null; notifications = []; $('#notificationsPanel')?.classList.add('hidden'); updateHeaderAccessUI(); updateProfileBadge(); updateNotificationsUI(); nav('home');
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
    if (!session) { nav('auth'); return; }
    toggleNotifications();
  });
  if (notificationsPanel) notificationsPanel.addEventListener('click', (e) => e.stopPropagation());
  if (profileBtn) profileBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!session) {
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
  if (openMySpace) openMySpace.addEventListener('click', () => { closeProfileMenu(); if (session) nav(profile?.role==='admin' ? 'admin' : profile?.role==='manager' ? 'manager' : 'space'); else nav('auth'); });
  if (menuLogout) menuLogout.addEventListener('click', () => {
    closeProfileMenu();
    logout();
  });
  document.addEventListener('click', () => { closeProfileMenu(); $('#notificationsPanel')?.classList.add('hidden'); });

  const { data } = await sb.auth.getSession();
  session = data.session;
  if (session) { profile = await getProfile(); await loadProfileDetails(); await loadNotifications(); }
  else updateNotificationsUI();
  updateHeaderAccessUI();

  const hashPage = window.location.hash.replace(/^#/, '');
  const initialPage = ['home','benefits','auth','space','manager','training','live-training','missions','profile','admin'].includes(hashPage) ? hashPage : 'home';
  nav(initialPage, false);
}

sb.auth.onAuthStateChange((event,newSession)=>{
  if(event==='PASSWORD_RECOVERY' && newSession){
    session=newSession;
    setTimeout(()=>finishPasswordRecovery(),0);
  }
});

init();

document.addEventListener('visibilitychange', () => { if (!document.hidden && session) loadNotifications(); });
setInterval(() => { if (!document.hidden && session) loadNotifications(); }, 5000);

window.addEventListener('popstate', () => {
  const hashPage = window.location.hash.replace(/^#/, '');
  const page = history.state?.page || hashPage || 'home';
  if (page === 'live-training') ensureLiveTrainingPage();
  current = ['home','benefits','auth','space','manager','training','live-training','missions','profile','admin'].includes(page) ? page : 'home';
  render();
  window.scrollTo(0, 0);
});

window.addEventListener('hashchange', () => {
  const page = window.location.hash.replace(/^#/, '') || 'home';
  if (page === 'live-training') ensureLiveTrainingPage();
  if (!['home','benefits','auth','space','manager','training','live-training','missions','profile','admin'].includes(page)) return;
  if (current === page) return;
  current = page;
  render();
  window.scrollTo(0, 0);
});
