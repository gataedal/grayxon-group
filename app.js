// GRAYXON BUILD V33.7
const CFG = window.GRAYXON_CONFIG || {};
// Auth uses a syntactically valid internal domain. Users still log in only with
// their Grayxon username; this address is never shown in the portal UI.
const LOGIN_EMAIL_DOMAIN = 'users.grayxongroup.com';
const LEGACY_LOGIN_EMAIL_DOMAIN = 'users.grayxon.local';
const sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_PUBLISHABLE_KEY);


// GRAYXON PUSH V2
// The VAPID public key is safe to expose in the browser. The private key remains
// exclusively in the Supabase Edge Function `grayxon-push`.
const GRAYXON_VAPID_PUBLIC_KEY = 'BIdCS8TZ7hC_cC3krXcLbkW7YNZKMuYJM-5egWej63jdGrcTei4wiTuXW3hENBMIrrSnYoj2gptF0NGJ_4THZz8';
let pushRegistrationPromise = null;
let grayxonInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  grayxonInstallPrompt = event;
  refreshGrayxonPwaPreferenceUI();
});
window.addEventListener('appinstalled', () => {
  grayxonInstallPrompt = null;
  refreshGrayxonPwaPreferenceUI();
  toast('Grayxon se instaló correctamente ✓');
});

function isGrayxonStandalone(){
  try {
    return Boolean(
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.matchMedia?.('(display-mode: fullscreen)').matches ||
      window.navigator.standalone === true ||
      String(document.referrer||'').startsWith('android-app://')
    );
  } catch (_) { return window.navigator.standalone === true; }
}

function showGrayxonInstallHelp(){
  const el = modal(`
    <div class="eyebrow">GRAYXON · INSTALACIÓN</div>
    <h2 style="margin-top:8px">Instala Grayxon 📲</h2>
    <p class="muted" style="line-height:1.65">Añade Grayxon a la pantalla de inicio de tu dispositivo para tenerlo siempre a mano.</p>
    <div class="item" style="margin-top:14px;line-height:1.65">
      <b>¿Cómo hacerlo?</b>
      <p class="muted small" style="margin:7px 0 0">Abre el menú de tu navegador y busca una opción como <b>“Instalar Grayxon”</b> o <b>“Añadir a pantalla de inicio”</b>. Después abre Grayxon desde ese nuevo icono.</p>
    </div>
    <div class="inline" style="margin-top:18px"><button class="primary" id="closeGrayxonInstallHelp">Entendido</button></div>
  `);
  $('#closeGrayxonInstallHelp')?.addEventListener('click',()=>el.remove());
}

async function installGrayxonApp(){
  if(isGrayxonStandalone()){
    toast('Grayxon ya está instalado ✓');
    return;
  }
  if(grayxonInstallPrompt){
    try{
      await grayxonInstallPrompt.prompt();
      await grayxonInstallPrompt.userChoice;
    }catch(e){
      console.warn('Instalación de Grayxon:',e);
    }finally{
      grayxonInstallPrompt=null;
      refreshGrayxonPwaPreferenceUI();
    }
    return;
  }
  showGrayxonInstallHelp();
}

function refreshGrayxonPwaPreferenceUI(){
  const installBtn=$('#installGrayxonDashboard');
  const installed=isGrayxonStandalone();
  if(installBtn){
    installBtn.style.display=installed ? 'none' : '';
    installBtn.disabled=false;
    installBtn.style.border='1px solid rgba(254,44,85,.45)';
    installBtn.style.boxShadow='0 8px 24px rgba(254,44,85,.18)';
    installBtn.style.fontWeight='800';
  }
}

async function showGrayxonPushPrompt(){
  if(!session?.user?.id || profile?.role!=='creator' || !isGrayxonStandalone()) return;
  if(document.getElementById('grayxonPushPrompt')) return;

  // If this installation already has a valid subscription, silently repair the
  // database row (for example after clearing account data) and do not bother the creator.
  try{
    if('serviceWorker' in navigator && 'PushManager' in window){
      const registration=await navigator.serviceWorker.getRegistration('./') || await navigator.serviceWorker.register('./sw.js?v=42',{scope:'./'});
      const existing=await registration?.pushManager?.getSubscription();
      if(existing){
        if('Notification' in window && Notification.permission==='granted'){
          await registerGrayxonPush({requestPermission:false});
          return;
        }
      }
    }
  }catch(e){ console.warn('Estado de suscripción Grayxon:',e); }

  if('Notification' in window && Notification.permission==='granted'){
    // Permission exists but there is no subscription yet: show the repair/activation prompt.
  } else if(!('PushManager' in window)) {
    return;
  }

  const wrap=document.createElement('div');
  wrap.id='grayxonPushPrompt';
  wrap.innerHTML=`<div style="position:fixed;inset:auto 14px 14px 14px;z-index:10000;display:flex;justify-content:center;pointer-events:none">
    <div class="card" style="width:min(520px,100%);padding:18px 18px 16px;border:1px solid rgba(254,44,85,.24);box-shadow:0 18px 55px rgba(0,0,0,.48);pointer-events:auto;background:rgba(15,17,21,.98)">
      <div style="display:flex;gap:13px;align-items:flex-start"><div style="font-size:28px;line-height:1">🔔</div><div style="flex:1"><div class="eyebrow">GRAYXON · AVISOS</div><h3 style="margin:5px 0 5px">Activa las notificaciones</h3><p class="muted small" style="margin:0;line-height:1.55">Recibe en tu celular avisos de entrenamientos, tareas y novedades de Grayxon, incluso cuando no estés dentro del portal.</p></div></div>
      <div class="inline" style="margin-top:14px;justify-content:flex-end"><button type="button" class="secondary small" id="closeGrayxonPushPrompt">Ahora no</button><button type="button" class="primary small" id="activateGrayxonPushPrompt">🔔 Activar</button></div>
    </div>
  </div>`;
  document.body.appendChild(wrap);
  $('#closeGrayxonPushPrompt')?.addEventListener('click',()=>wrap.remove());
  $('#activateGrayxonPushPrompt')?.addEventListener('click',async()=>{
    const btn=$('#activateGrayxonPushPrompt'); if(btn) btn.disabled=true;
    const subscription=await registerGrayxonPush({requestPermission:true});
    wrap.remove();
    if(subscription) toast('Notificaciones activadas ✓');
    else if('Notification' in window && Notification.permission==='denied') toast('Las notificaciones están bloqueadas. Actívalas desde los permisos de Grayxon.');
    else if(!('Notification' in window) || !('PushManager' in window)) toast('Este dispositivo no permite notificaciones web en esta instalación.');
    else toast('No se pudieron activar las notificaciones.');
  });
}
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

function ensureGrayxonPwaLinks() {
  if (!document.querySelector('link[rel="manifest"]')) {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = './manifest.webmanifest?v=41';
    document.head.appendChild(link);
  }
  if (!document.querySelector('meta[name="theme-color"]')) {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#0b0d10';
    document.head.appendChild(meta);
  }
  if (!document.querySelector('link[rel="apple-touch-icon"]')) {
    const icon = document.createElement('link');
    icon.rel = 'apple-touch-icon';
    icon.href = './assets/grayxon-logo.png';
    document.head.appendChild(icon);
  }
}

async function registerGrayxonPush({requestPermission=false}={}) {
  if (!session?.user?.id || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return null;
  if (!window.isSecureContext || !GRAYXON_VAPID_PUBLIC_KEY) return null;
  if (pushRegistrationPromise) return pushRegistrationPromise;

  pushRegistrationPromise = (async () => {
    try {
      ensureGrayxonPwaLinks();
      const registration = await navigator.serviceWorker.register('./sw.js?v=42', { scope: './' });
      await navigator.serviceWorker.ready;

      let permission = Notification.permission;
      if (permission === 'default' && requestPermission) permission = await Notification.requestPermission();
      if (permission !== 'granted') return null;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(GRAYXON_VAPID_PUBLIC_KEY)
        });
      }

      const json = subscription.toJSON();
      const endpoint = json.endpoint || subscription.endpoint;
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;
      if (!endpoint || !p256dh || !auth) throw new Error('La suscripción Push no devolvió todas las claves necesarias.');

      const { error } = await sb.from('push_subscriptions').upsert({
        user_id: session.user.id,
        endpoint,
        p256dh,
        auth,
        user_agent: navigator.userAgent.slice(0, 500),
        is_active: true,
        last_seen_at: new Date().toISOString()
      }, { onConflict: 'endpoint' });
      if (error) throw error;
      return subscription;
    } catch (error) {
      console.warn('Grayxon Push no pudo registrarse:', error);
      return null;
    } finally {
      pushRegistrationPromise = null;
    }
  })();
  try {
    return await pushRegistrationPromise;
  } finally {
    pushRegistrationPromise = null;
  }
}

async function deactivateCurrentPushSubscription() {
  if (!session?.user?.id || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration('./');
    const subscription = await registration?.pushManager?.getSubscription();
    if (subscription?.endpoint) {
      await sb.from('push_subscriptions').update({is_active:false,last_seen_at:new Date().toISOString()})
        .eq('endpoint',subscription.endpoint).eq('user_id',session.user.id);
    }
  } catch (_) {}
}

async function enableGrayxonPushFromAccount() {
  if (!session?.user?.id) return toast('Inicia sesión para activar las notificaciones.');
  const subscription = await registerGrayxonPush({requestPermission:true});
  if (subscription) toast('Notificaciones activadas ✓');
  else if (Notification.permission === 'denied') toast('Las notificaciones están bloqueadas en el navegador.');
  else toast('No se pudo activar las notificaciones. Revisa la consola del navegador.');
}

// GRAYXON BUILD V32
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
let creatorLiveDashboardWatcher = null;
let creatorLiveDashboardWatcherToken = 0;
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


async function updateAdminUserAccess(userId, username, password) {
  const { data: sessionData } = await sb.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error('Tu sesión de administrador no está disponible. Vuelve a iniciar sesión.');
  const res = await fetch(`${CFG.SUPABASE_URL}/functions/v1/admin-update-user-access`, {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'apikey':CFG.SUPABASE_PUBLISHABLE_KEY,
      'Authorization':`Bearer ${accessToken}`
    },
    body:JSON.stringify({user_id:userId,username,password:password||undefined})
  });
  let data=null; try{data=await res.json();}catch(_){}
  if(!res.ok || data?.error) throw new Error(data?.error || data?.message || `Error ${res.status} al actualizar el acceso.`);
  return data;
}


let current = 'home';
let navGeneration = 0;
let session = null;
let profile = null;
let adminView = 'dashboard';
let managerView = 'dashboard';
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

// LIVE notification diagnostics are intentionally silent in production.
function showLiveNotificationDiagnostic() {}

function errorText(error, fallbackText = 'Ocurrió un error.') {
  return error?.message || fallbackText;
}

function restoreLiveNotificationDiagnostic() {
  try {
    const raw = sessionStorage.getItem('grayxon_live_diag');
    if (!raw) return;
    const diag = JSON.parse(raw);
    if (!diag?.title || !Array.isArray(diag.lines)) return;
    sessionStorage.removeItem('grayxon_live_diag');
    showLiveNotificationDiagnostic(diag.title, diag.lines, false);
  } catch (_) {}
}

async function loadNotifications() {
  if (!session?.user?.id) { notifications = []; updateNotificationsUI(); return; }
  const { data, error } = await sb.from('notifications').select('id,type,title,message,link_page,link_target,related_week_start,related_week_end,read_at,created_at').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(30);
  if (error) { notifications = []; updateNotificationsUI(); return; }
  notifications = data || [];
  updateNotificationsUI();
}

function notificationIcon(type) { return type === 'mission' ? '🎯' : type === 'training' ? '🎥' : type === 'formation' ? '🎓' : type === 'manager_task' ? '📋' : type === 'manager_assignment' ? '👥' : '🔔'; }

function ensureHeaderNotificationsLayout(){
  if(document.getElementById('grayxon-header-notifications-layout')) return;
  const style=document.createElement('style');
  style.id='grayxon-header-notifications-layout';
  style.textContent=`
    /* Header: campana independiente, al lado del avatar y nunca superpuesta. */
    .header-actions #adminOpen.grayxon-manager-header-hidden,
    body.grayxon-manager-session .header-actions #adminOpen{display:none!important}
    .header-actions .profile-menu-wrap{
      position:relative!important;
      display:flex!important;
      flex-direction:row!important;
      align-items:center!important;
      justify-content:flex-end!important;
      gap:8px!important;
      width:auto!important;
      min-width:0!important;
      height:40px!important;
      flex:0 0 auto!important;
    }
    .header-actions #mobileProfile{
      position:relative!important;
      order:0!important;
      flex:0 0 40px!important;
    }
    .header-actions #notificationsBtn{
      position:relative!important;
      order:-1!important;
      inset:auto!important;
      left:auto!important;
      right:auto!important;
      top:auto!important;
      bottom:auto!important;
      width:40px!important;
      height:40px!important;
      min-width:40px!important;
      min-height:40px!important;
      flex:0 0 40px!important;
      border:1px solid #333941!important;
      border-radius:12px!important;
      background:#111418!important;
      color:#fff!important;
      display:grid!important;
      place-items:center!important;
      padding:0!important;
      margin:0!important;
      box-shadow:none!important;
      font-size:18px!important;
      line-height:1!important;
      transform:none!important;
    }
    .header-actions #notificationsBtn.hidden{display:none!important}
    .header-actions #notificationsPanel{
      position:absolute!important;
      right:0!important;
      left:auto!important;
      top:calc(100% + 10px)!important;
    }
  `;
  document.head.appendChild(style);
}

function updateNotificationsUI() {
  ensureHeaderNotificationsLayout();
  const btn = $('#notificationsBtn');
  const badge = $('#notificationsBadge');
  if (!btn || !badge) return;
  const unread = notifications.filter(n => !n.read_at).length;
  badge.textContent = unread > 9 ? '9+' : String(unread);
  badge.classList.toggle('hidden', unread === 0 || !session);
  btn.classList.toggle('hidden', !session);
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
  if (n.link_target) {
    const target = String(n.link_target);
    if (target.startsWith('#')) { window.location.hash = target.slice(1); return; }
    if (/^(https?:|mailto:|tel:)/i.test(target)) { window.location.href = target; return; }
    const page = target.replace(/^\//, '').split(/[?#]/)[0].toLowerCase();
    // LIVE: si la notificación guarda el UUID del entrenamiento, abrimos exactamente ese LIVE.
    if(profile?.role==='creator' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(page)){
      const {data:targetLive}=await sb.from('live_trainings').select('id,title,description,scheduled_at,room_name,status,created_by,instructor_name,created_at,started_at,ended_at').eq('id',page).eq('status','live').maybeSingle();
      if(targetLive){ currentLiveTraining=targetLive; pendingLiveTrainingAutoStart={id:targetLive.id}; window.location.hash=`live-training/${targetLive.id}`; nav('live-training', false); return; }
    }
    const targetMap = {
      dashboard:'space', space:'space', 'mi-espacio':'space',
      training:'training', formation:'training', 'live-training':'live-training',
      missions:'missions', mission:'missions', profile:'profile', 'mi-perfil':'profile',
      manager:'manager', admin:'admin', announcements:'announcements', comunicados:'announcements', home:'home', benefits:'benefits', auth:'auth'
    };
    const destination = targetMap[page];
    if (destination) {
      if(destination==='live-training' && profile?.role==='creator'){
        const live=await fetchCreatorLiveTrainingFast();
        if(live){ currentLiveTraining=live; pendingLiveTrainingAutoStart={id:live.id}; }
      }
      nav(destination); return;
    }
  }
  if (n.link_page === 'missions') {
    pendingNotificationTarget = { type:'missions', weekStart:n.related_week_start || null, weekEnd:n.related_week_end || null };
    nav('missions');
  } else if (n.link_page === 'announcements') nav('announcements');
  else if (n.link_page === 'training') nav('training');
  else if (n.link_page === 'live-training') {
    if(profile?.role==='creator'){
      const live=await fetchCreatorLiveTrainingFast();
      if(live){ currentLiveTraining=live; pendingLiveTrainingAutoStart={id:live.id}; }
    }
    nav('live-training');
  }
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
  const payload = { user_id:userId, type:'mission', title, message, link_page:linkPage, link_target:linkPage, related_week_start:weekStart || null, related_week_end:weekEnd || null };
  // Las misiones conservan exactamente su flujo actual.
  const rpc = await sb.rpc('create_notification', { p_user_id:userId, p_type:'mission', p_title:title, p_message:message, p_link_page:linkPage, p_week_start:weekStart || null, p_week_end:weekEnd || null });
  if (!rpc.error) return {ok:true};
  const direct = await sb.from('notifications').insert(payload);
  if (!direct.error) return {ok:true};
  const detail = `RPC: ${rpc.error.message || rpc.error.code || 'error desconocido'} · INSERT: ${direct.error.message || direct.error.code || 'error desconocido'}`;
  console.warn('No se pudo crear la notificación:', {rpc:rpc.error, direct:direct.error, userId});
  return {ok:false,error:detail};
}

async function notifyLiveTrainingCreator(userId, title, message, trainingId=null) {
  if (!userId) return {ok:false,error:'Falta el ID del creador.'};
  const linkPage='live-training';
  const payload = {
    user_id:userId,
    type:'training',
    title,
    message,
    link_page:linkPage,
    link_target:trainingId ? String(trainingId) : linkPage,
    related_week_start:null,
    related_week_end:null
  };

  // LIVE tiene su propio tipo de notificación; no reutilizamos el tipo mission.
  const rpc = await sb.rpc('create_notification', {
    p_user_id:userId,
    p_type:'training',
    p_title:title,
    p_message:message,
    p_link_page:linkPage,
    p_week_start:null,
    p_week_end:null
  });
  if (!rpc.error) {
    // create_notification no recibe link_target; lo fijamos después con el UUID devuelto.
    if(trainingId && rpc.data){
      const {error:updateTargetError}=await sb.from('notifications').update({link_target:String(trainingId)}).eq('id',rpc.data).eq('user_id',userId);
      if(updateTargetError) console.warn('No se pudo guardar el LIVE objetivo de la notificación:', updateTargetError.message);
    }
    return {ok:true};
  }

  // Compatibilidad: algunas instalaciones antiguas solo contemplan los tipos
  // existentes en la migración original. En ese caso usamos formation, pero
  // mantenemos link_target=live-training para que abra el LIVE.
  const fallbackPayload={...payload,type:'formation'};
  const rpcFallback=await sb.rpc('create_notification', {
    p_user_id:userId,
    p_type:'formation',
    p_title:title,
    p_message:message,
    p_link_page:linkPage,
    p_week_start:null,
    p_week_end:null
  });
  if(!rpcFallback.error)return {ok:true};

  // Último respaldo para un admin/usuario con permiso de INSERT.
  const direct=await sb.from('notifications').insert(payload);
  if(!direct.error)return {ok:true};
  const directFallback=await sb.from('notifications').insert(fallbackPayload);
  if(!directFallback.error)return {ok:true};

  const detail=[
    `RPC training: ${rpc.error?.message||rpc.error?.code||'error'}`,
    `RPC formation: ${rpcFallback.error?.message||rpcFallback.error?.code||'error'}`,
    `INSERT training: ${direct.error?.message||direct.error?.code||'error'}`,
    `INSERT formation: ${directFallback.error?.message||directFallback.error?.code||'error'}`
  ].join(' · ');
  console.warn('No se pudo crear la notificación del LIVE:', {userId,detail});
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
      #live-training.page-section:not(.hidden){display:block!important;min-height:0!important;height:auto!important;margin:0!important;padding:0!important;align-self:auto!important}
      #live-training.page-section:not(.hidden){position:relative!important;top:auto!important;bottom:auto!important;transform:none!important;float:none!important;clear:both!important;order:initial!important;}
      header.top,.top{position:relative!important;z-index:5000!important}
      .profile-menu-wrap{z-index:5001!important}
      #profileMenu{z-index:5002!important}
      body.grayxon-live-training-active #space{display:none!important;visibility:hidden!important;height:0!important;min-height:0!important;overflow:hidden!important} body.grayxon-live-training-active #live-training{display:block!important;visibility:visible!important}
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
        #live-training.page-section:not(.hidden){display:block!important;min-height:0!important;height:auto!important;margin:0!important;padding:0!important}
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

function ensureCreatorSpaceFloat(){
  let btn=document.getElementById('grayxonCreatorSpaceFloat');
  if(btn)return btn;
  btn=document.createElement('button');
  btn.id='grayxonCreatorSpaceFloat';
  btn.type='button';
  btn.className='grayxon-creator-space-float';
  btn.innerHTML='<span class="grayxon-creator-space-float-icon">⌂</span><span>Mi espacio</span>';
  btn.setAttribute('aria-label','Volver a Mi espacio');
  btn.addEventListener('click',()=>{ if(session?.user?.id) nav('space'); });
  document.body.appendChild(btn);
  return btn;
}

function updateCreatorSpaceFloat(){
  const btn=ensureCreatorSpaceFloat();
  const creatorSession=!!session && (profile?.role==='creator' || document.body.classList.contains('grayxon-creator-session'));
  const inLiveCall=document.body.classList.contains('grayxon-live-training-call');
  const visible=creatorSession && current!=='space' && current!=='auth' && current!=='home' && !inLiveCall;
  document.body.classList.toggle('grayxon-creator-session',creatorSession);
  btn.classList.toggle('is-visible',visible);
  btn.style.setProperty('display', visible ? 'flex' : 'none', 'important');
  btn.style.setProperty('opacity', visible ? '1' : '0', 'important');
  btn.style.setProperty('pointer-events', visible ? 'auto' : 'none', 'important');
  btn.style.setProperty('transform', visible ? 'none' : 'translateY(10px) scale(.96)', 'important');
  btn.setAttribute('aria-hidden',visible?'false':'true');
}

function updateCreatorTopNav(){
  const buttons=$$('[data-page="space"]');
  const hide=!!session && (profile?.role==='creator' || document.body.classList.contains('grayxon-creator-session'));
  buttons.forEach(b=>{
    b.classList.toggle('hidden',hide);
    b.style.setProperty('display',hide?'none':'', 'important');
    b.setAttribute('aria-hidden',hide?'true':'false');
  });
}

function isCreatorSession(){
  return !!session && (profile?.role === 'creator' || document.body.classList.contains('grayxon-creator-session'));
}

function nav(p, push = true) {
  const thisNav = ++navGeneration;
  const pages = ['home','benefits','auth','space','manager','training','live-training','missions','profile','admin','announcements','force-password'];
  if (!pages.includes(p)) p = 'home';
  if (p === 'force-password' && !session) p = 'auth';
  if (session && profile?.must_change_password && p !== 'force-password') p = 'force-password';
  // La portada pública oficial vive en index.html. No mostrar el inicio antiguo del portal
  // cuando no hay sesión; conservar las rutas de autenticación y los enlaces profundos.
  if (!session && p === 'home') {
  window.location.replace('./index.html');
  return;
}
  // Una cuenta autenticada nunca vuelve a la portada pública por accidente.
  // Su entrada natural siempre es su espacio/panel correspondiente.
  if (session && p === 'home') {
    p = profile?.role === 'admin' ? 'admin' : profile?.role === 'manager' ? 'manager' : 'space';
  }
  if (session && p === 'space' && profile?.role === 'manager') p = 'manager';
  if (p === 'manager') managerView = 'dashboard';
  if (p === 'live-training') ensureLiveTrainingPage();
  // Para creadores, Mi espacio debe volver a pintar inmediatamente el dashboard real.
  // Evita pasar primero por el shell antiguo con estados de carga al volver desde
  // Misiones, Mi perfil o Formación.
  if (p === 'space' && isCreatorSession()) renderCreatorSpaceImmediate();
  if (p === 'live-training') { const se=$('#space'); if(se){se.hidden=true;se.classList.add('hidden');se.style.setProperty('display','none','important');} document.body.classList.add('grayxon-live-training-active'); }
  if (push && current !== p) {
    const url = p === 'home'
      ? `${window.location.pathname}${window.location.search}`
      : `${window.location.pathname}${window.location.search}#${p}`;
    history.pushState({page:p}, '', url);
  }
  current = p;
  if(p==='space' && isCreatorSession()) startCreatorLiveDashboardWatcher(); else stopCreatorLiveDashboardWatcher();
  updateCreatorSpaceFloat();
  updateCreatorTopNav();

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

  // Mi espacio debe desaparecer COMPLETAMENTE mientras estamos en Entrenamientos,
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
  // El render de la página activa lo controla render(). Para creadores no
  // pintamos el shell antiguo aquí porque provocaba el estado "Cargando mi espacio..."
  // al volver desde Misiones/Mi perfil.
  // Para creadores, Mi espacio ya fue pintado de inmediato. No dejamos que un render
  // asíncrono antiguo vuelva a pisarlo mientras el usuario navega.
  if (p === 'space' && isCreatorSession()) {
    // Nunca bloqueamos la navegación esperando datos remotos. El dashboard ya está visible;
    // la actualización se ejecuta en segundo plano y solo pinta si seguimos en Mi espacio.
    creatorDashboardTpl(thisNav).catch(e => console.warn('Creator dashboard:', e));
  } else {
    Promise.resolve(render()).catch(e => console.warn('Render:', e));
  }
  window.scrollTo(0,0);
}

function spaceCard(icon,title,desc,pct,action,detail){
  return `<button class="space-card card" data-space-action="${esc(action)}"><span class="space-card-icon">${icon}</span><div class="space-card-main"><div class="space-card-top"><strong>${esc(title)}</strong><span>${pct}%</span></div><p>${esc(desc)}</p><div class="space-progress"><span style="width:${Math.max(0,Math.min(100,pct))}%"></span></div><small>${esc(detail)}</small></div><span class="space-card-arrow">›</span></button>`;
}
function renderSpaceShell(){
  const el=$('#space'); if(!el) return;
  if(!session){ el.innerHTML=authTpl(); return; }
  const base=profile||{full_name:session.user.user_metadata?.full_name||'',username:session.user.user_metadata?.username||session.user.email?.split('@')[0]||'creador'};
  el.innerHTML=`<div class="space-page"><div class="space-hero"><div class="space-hero-main"><div class="eyebrow">MI ESPACIO</div><h1>Hola, ${esc(base.username||'creador')} 👋</h1><p class="muted space-intro">Aquí tienes todo lo que necesitas para avanzar dentro de Grayxon.</p></div><div class="space-total"><span>PROGRESO GENERAL</span><strong id="spaceOverallPct">0%</strong></div><div id="spaceTeamBlock" class="space-team-inline"><div class="space-team-card space-team-card-loading"><div class="space-team-card-info"><span class="space-team-label">TU EQUIPO</span><strong>Cargando equipo...</strong></div></div></div></div><div class="space-grid" id="spaceCards">${spaceCard('👤','Tu perfil','Completa tus datos para mantener tu información actualizada.',0,'profile','Cargando información…')}${spaceCard('🎓','Formación','Aprende con los módulos, lecciones, videos y recursos de Grayxon.',0,'training','Cargando formación…')}${spaceCard('🎯','Tus misiones','Cumple tus objetivos semanales y registra tus avances.',0,'missions','Cargando misiones…')}${spaceCard('📣','Centro de comunicados','Consulta novedades, avisos importantes y recursos de tu equipo.',0,'announcements','Ver comunicados recientes')}<button class="space-card card live-training-space-card" data-space-action="live-training"><span class="space-card-icon">🎥</span><div class="space-card-main"><div class="space-card-top"><strong>Entrenamientos</strong><span class="live-training-card-status">Sin entrenamiento</span></div><p class="live-training-card-title">Consulta los entrenamientos en vivo de Grayxon.</p><div class="space-progress"><span style="width:0%"></span></div><small class="live-training-card-detail">Cuando haya uno activo aparecerá aquí.</small></div><span class="space-card-arrow">›</span></button></div></div>`;
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
  if(current==='announcements') await announcementsTpl();
  if(current==='auth')$('#auth').innerHTML=authTpl();
  if(current==='force-password')$('#force-password').innerHTML=forcePasswordTpl();
  if(current==='space') { if(profile?.role==='manager') await managerTpl(); else await spaceTpl(); }
  if(current==='manager')await managerTpl();
  if(current==='training')await trainingTpl();
  if(current==='live-training')await liveTrainingTpl();
  if(current==='missions')await missionsTpl();
  if(current==='profile')$('#profile').innerHTML=await profileTpl();
  bind(); updateHeaderAccessUI(); updateProfileBadge(); updateNotificationsUI(); updateCreatorSpaceFloat(); updateCreatorTopNav();
  if(session && ['space','manager','admin'].includes(current)) gxRefreshAnnouncementUnreadCount();
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
            <button class="hero-action hero-action-secondary" data-page="auth" data-auth-mode="creator">Mi espacio <span>›</span></button>
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
  CO:['Bancolombia','Banco de Bogotá','Davivienda','BBVA Colombia','Banco de Occidente','Banco Popular','Banco AV Villas','Banco Agrario de Colombia','Banco Caja Social','Banco Falabella','Banco Finandina','Banco Pichincha','Banco W','Banco Serfinanza','Bancoomeva','Bancamía','Mundo Mujer','Scotiabank Colpatria','Itaú Colombia','Lulo Bank','Nu Colombia','Nequi','Daviplata','dale!','MOVii','RappiPay'],
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
  const uid=session.user.id;
  const [dRes, pRes] = await Promise.all([
    sb.from('profile_details').select('*').eq('user_id', uid).maybeSingle(),
    // Do not use maybeSingle() here: older data can contain more than one payment row.
    // We keep the newest primary row without allowing a duplicate to break the profile.
    sb.from('payment_methods').select('*').eq('user_id', uid).order('is_primary',{ascending:false}).order('updated_at',{ascending:false}).limit(1)
  ]);
  const paymentRows=Array.isArray(pRes?.data) ? pRes.data : [];
  // Payment data is optional. A read-policy error must not poison the entire profile UI.
  profileDetails=dRes?.data||null;
  paymentMethod=paymentRows[0]||null;
  return {details:profileDetails,payment:paymentMethod,detailsError:dRes?.error||null,paymentError:pRes?.error||null};
}
function normalizeCountryCode(value){
  const v=String(value||'').trim();
  if(!v)return 'CO';
  if(profileCountries.some(([c])=>c===v))return v;
  const found=profileCountries.find(([,name])=>name.toLowerCase()===v.toLowerCase());
  return found?.[0]||'CO';
}

function profileTpl(){
  ensureGrayxonPreferencesStyles();
  if (!session || !profile) return authTpl();
  const d=profileDetails||{}; const pm=paymentMethod||{};
  const avatar = d.avatar_url ? `<img class="profile-avatar-img" src="${esc(d.avatar_url)}" alt="Foto de perfil">` : `<span>${esc(profileInitial())}</span>`;
  const countries=profileCountries.map(([c,n])=>`<option value="${c}" ${d.country===c?'selected':''}>${n}</option>`).join('');
  const bankCountry=normalizeCountryCode(pm.bank_country || d.country || 'CO');
  const banks=(bankSeed[bankCountry]||[]).map(b=>`<option value="${esc(b)}" ${pm.bank_name===b?'selected':''}>${esc(b)}</option>`).join('');
  return `<div class="profile-page">
    <div class="profile-head card"><div class="profile-avatar-wrap profile-avatar-editable">${avatar}<button type="button" class="avatar-edit-fab" id="profilePhotoEdit" aria-label="Cambiar foto">✎</button><button type="button" class="avatar-delete-fab ${d.avatar_url ? '' : 'hidden'}" id="deleteProfileAvatar" aria-label="Eliminar foto">🗑</button><input id="profileAvatar" class="hidden" type="file" accept="image/png,image/jpeg,image/webp"></div><div><div class="eyebrow">MI PERFIL</div><h1>${esc(profile.full_name||profile.username)}</h1><p class="muted">@${esc(profile.username)} · ${profile.role==='admin'?'Administrador':profile.role==='manager'?'Manager':'Creador'}</p><div id="profileAvatarStatus" class="muted small" style="margin-top:8px"></div></div></div>
    <div class="card"><h2>Información personal</h2>${field('pEmail','Correo electrónico',d.email||'')}${field('pPhone','Número de teléfono',d.phone||'')}
      <label class="field"><span>País</span><select id="pCountry">${countries}</select></label>${field('pState','Estado / Departamento / Provincia',d.state_region||'')}${field('pCity','Ciudad',d.city||'')}${field('pAddress','Dirección',d.address||'',true)}
    </div>
    <div class="card"><h2>Información de pagos</h2><label class="field"><span>Método de pago</span><select id="pMethod"><option value="bank" ${pm.method_type!=='paypal'?'selected':''}>Cuenta bancaria</option><option value="paypal" ${pm.method_type==='paypal'?'selected':''}>PayPal</option></select></label>
      <div id="bankFields" ${pm.method_type==='paypal'?'style="display:none"':''}><label class="field"><span>País del banco</span><select id="pBankCountry">${profileCountries.map(([c,n])=>`<option value="${c}" ${bankCountry===c?'selected':''}>${n}</option>`).join('')}</select></label><label class="field"><span>Banco</span><select id="pBank"><option value="">Selecciona tu banco</option>${banks}</select></label><label class="field"><span>Tipo de cuenta</span><select id="pAccountType"><option value="savings" ${pm.account_type==='savings'?'selected':''}>Ahorros</option><option value="checking" ${pm.account_type==='checking'?'selected':''}>Corriente</option><option value="other" ${pm.account_type==='other'?'selected':''}>Otro</option></select></label>${field('pAccountNumber','Número de cuenta',pm.account_number||'')}</div>
      <div id="paypalFields" ${pm.method_type==='paypal'?'':'style="display:none"'}>${field('pPaypal','Correo de PayPal',pm.paypal_email||'')}</div>
      <label class="field"><span>Preferencia</span><label style="display:flex;gap:8px;align-items:center;color:#ddd"><input id="pPrimary" type="checkbox" ${pm.is_primary!==false?'checked':''}> Usar como método principal de pago</label></label>
    </div>
    <div class="profile-save-wrap"><button class="primary profile-save-btn" id="saveProfile">Guardar</button></div><div id="profileErr" class="error"></div>
  </div>`;
}
function forcePasswordTpl(){
  const who=esc(profile?.username||'creador');
  return `<div class="login card" style="max-width:560px;margin:34px auto"><div class="eyebrow">GRAYXON · SEGURIDAD</div><h2 style="margin-top:8px">Crea tu contraseña personal</h2><p class="muted">Hola, @${who}. Este es tu primer ingreso. Por seguridad, debes cambiar la contraseña temporal antes de continuar.</p><div class="field"><label>Nueva contraseña</label><input id="firstPassword" type="password" autocomplete="new-password" minlength="8" placeholder="Mínimo 8 caracteres"></div><div class="field"><label>Repite la contraseña</label><input id="firstPasswordConfirm" type="password" autocomplete="new-password" minlength="8" placeholder="Confirma tu contraseña"></div><div id="firstPasswordError" class="error"></div><button class="primary" id="saveFirstPassword">Guardar y continuar</button><p class="muted small" style="margin-top:12px">No compartas tu contraseña con nadie. Grayxon no puede mostrarte una contraseña después de guardarla.</p></div>`;
}
async function saveFirstPassword(){
  const a=$('#firstPassword')?.value||'', b=$('#firstPasswordConfirm')?.value||'', err=$('#firstPasswordError'), btn=$('#saveFirstPassword');
  if(a.length<8){if(err)err.textContent='La contraseña debe tener al menos 8 caracteres.';return;}
  if(a!==b){if(err)err.textContent='Las contraseñas no coinciden.';return;}
  if(!session?.user?.id||!profile?.must_change_password){nav('auth');return;}
  if(btn)btn.disabled=true;if(err)err.textContent='Actualizando contraseña…';
  const {data:completeData,error:profileError}=await sb.functions.invoke('complete-first-login',{body:{password:a,confirm_password:b}});
  if(profileError||completeData?.error){if(err)err.textContent=completeData?.error||profileError?.message||'No se pudo completar el cambio de contraseña.';if(btn)btn.disabled=false;return;}
  profile.must_change_password=false;toast('Contraseña actualizada ✓');
  nav(profile.role==='admin'?'admin':profile.role==='manager'?'manager':'space');
}

function authTpl() {
  return `<div class="login"><div class="eyebrow">GRAYXON · ACCESO</div><h2 style="margin-top:8px">Inicia sesión</h2><p class="muted">Usa el usuario o correo y la contraseña de tu cuenta. Grayxon detectará automáticamente si eres administrador, manager o creador y abrirá el panel correspondiente.</p><div class="field"><label>Usuario o correo</label><input id="loginUser" autocomplete="username" placeholder="Ej. andrea.onyx o correo@ejemplo.com"></div><div class="field"><label>Contraseña</label><input id="loginPass" type="password" autocomplete="current-password" placeholder="••••••••"></div><div id="loginErr" class="error"></div><button class="primary" id="loginBtn">Ingresar</button><button class="secondary small" id="forgotPasswordBtn" style="margin-top:10px">¿Olvidaste tu contraseña?</button><div id="resetBox" class="hidden" style="margin-top:14px"><div class="muted small" style="margin-bottom:8px">Escribe tu correo para recibir un enlace de recuperación.</div><input id="resetEmail" type="email" placeholder="correo@ejemplo.com"><button class="secondary small" id="sendResetBtn" style="margin-top:8px">Enviar enlace</button><div id="resetErr" class="error" style="margin-top:8px"></div></div></div>`;
}

async function getProfile() {
  if (!session) return null;
  try {
    const query = sb.from('profiles').select('id,username,full_name,role,active,team_id,manager_id,must_change_password').eq('id', session.user.id).maybeSingle();
    const result = await Promise.race([query, new Promise(resolve => setTimeout(() => resolve({data:null,error:new Error('timeout')}), 5000))]);
    if (result?.data) return result.data;
  } catch(e) {}
  return { id: session.user.id, username: session.user.user_metadata?.username || session.user.email?.split('@')[0] || 'creador', full_name: session.user.user_metadata?.full_name || '', role:'creator', active:true, team_id:null, manager_id:null, must_change_password:false };
}

async function loadCreatorAssignment(){
  if(!session?.user?.id) return {team:null,manager:null};
  // Nunca permitir que una consulta lenta de equipo/manager bloquee
  // la carga de Mi espacio al volver desde Misiones o Mi perfil.
  const fallback={team:null,manager:null};
  try {
    const work=(async()=>{
      const {data:pr,error:pe} = await sb.from('profiles').select('team_id').eq('id',session.user.id).maybeSingle();
      if(pe || !pr?.team_id) return fallback;
      const {data:team,error:te} = await sb.from('teams').select('id,name,manager_id').eq('id',pr.team_id).maybeSingle();
      if(te || !team) return fallback;
      const {data:manager} = team.manager_id ? await sb.from('managers').select('id,name,phone,email').eq('id',team.manager_id).maybeSingle() : {data:null};
      return {team,manager:manager||null};
    })();
    return await Promise.race([
      work,
      new Promise(resolve=>setTimeout(()=>resolve(fallback),3500))
    ]);
  } catch(e) { return fallback; }
}
function managerWhatsapp(phone){
  const raw=String(phone||'').replace(/[^0-9]/g,'');
  return raw ? `https://wa.me/${raw}` : '#';
}

function ensureCreatorDashboardStyles(){
  if($('#grayxon-creator-dashboard-styles')) return;
  const style=document.createElement('style');
  style.id='grayxon-creator-dashboard-styles';
  style.textContent=`
    .creator-dashboard{max-width:980px;margin:0 auto;display:grid;gap:14px}
    .creator-dashboard-loading-card{min-height:120px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.08);border-radius:18px;background:rgba(15,16,20,.96);color:#8f96a2;font-size:14px}
    .creator-dashboard-hero{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:16px;padding:20px 22px;border:1px solid rgba(255,255,255,.08);border-radius:20px;background:linear-gradient(145deg,rgba(20,22,27,.98),rgba(10,11,14,.98));box-shadow:0 18px 50px rgba(0,0,0,.18)}
    .creator-dashboard-avatar{width:74px;height:74px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:#16191e;border:1px solid rgba(255,255,255,.13);font-size:25px;font-weight:900;color:#fff;flex:0 0 74px}
    .creator-dashboard-avatar img{width:100%;height:100%;object-fit:cover;display:block}
    .creator-dashboard-identity h1{margin:3px 0 4px;font-size:27px;line-height:1.1}
    .creator-dashboard-identity .creator-username{color:#8f96a2;font-size:13px}
    .creator-dashboard-role{justify-self:end;text-align:right}
    .creator-dashboard-role .role-pill{display:inline-flex;align-items:center;gap:7px;padding:7px 10px;border:1px solid rgba(255,255,255,.09);border-radius:999px;background:rgba(255,255,255,.035);font-size:11px;font-weight:800;color:#d9dce1}
    .creator-dashboard-role small{display:block;color:#7d8490;margin-top:6px}
    .creator-assignment-card{display:grid;grid-template-columns:1fr auto;align-items:center;gap:16px;padding:16px 18px;border:1px solid rgba(255,255,255,.08);border-radius:17px;background:rgba(255,255,255,.025)}
    .creator-assignment-main{display:flex;align-items:center;gap:13px;min-width:0}
    .creator-assignment-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:13px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09);font-size:20px;flex:0 0 42px}
    .creator-assignment-main strong{display:block;font-size:15px}
    .creator-assignment-main small{display:block;color:#858c98;margin-top:4px;line-height:1.4}
    .creator-contact-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:40px;padding:0 14px;border:1px solid rgba(37,244,238,.2);border-radius:12px;background:rgba(37,244,238,.06);color:#dff; text-decoration:none;font-weight:800;font-size:12px}
    .creator-performance{padding:18px;border:1px solid rgba(255,255,255,.08);border-radius:18px;background:rgba(255,255,255,.025)}
    .creator-section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:13px}
    .creator-section-head h2{margin:2px 0 0;font-size:19px}
    .creator-performance-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .creator-metric{padding:13px;border:1px solid rgba(255,255,255,.07);border-radius:14px;background:rgba(0,0,0,.12)}
    .creator-metric-top{display:flex;justify-content:space-between;align-items:center;gap:8px}.creator-metric-top span{color:#8a919d;font-size:11px;font-weight:800}.creator-metric-top strong{font-size:19px}
    .creator-metric .space-progress{margin-top:10px}.creator-metric small{display:block;color:#777f8b;margin-top:7px;font-size:10px;line-height:1.4}
    .creator-dashboard-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .creator-dashboard-card{min-height:145px;padding:17px;border:1px solid rgba(255,255,255,.08);border-radius:17px;background:rgba(255,255,255,.025);color:#fff;text-align:left;position:relative;overflow:hidden}
    .creator-dashboard-card:hover{background:rgba(255,255,255,.04)}
    .creator-dashboard-card-icon{width:40px;height:40px;display:grid;place-items:center;border-radius:12px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);font-size:19px;margin-bottom:13px}
    .creator-dashboard-card strong{display:block;font-size:15px}.creator-dashboard-card p{margin:5px 0 0;color:#858c98;font-size:11px;line-height:1.45}.creator-dashboard-card-meta{position:absolute;right:14px;top:14px;color:#8b929d;font-size:11px;font-weight:800}.creator-dashboard-card-arrow{position:absolute;right:14px;bottom:13px;color:#7d8490;font-size:21px}
    .creator-profile-incomplete{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 15px;border:1px solid rgba(255,255,255,.08);border-radius:15px;background:rgba(255,255,255,.02)}
    .creator-profile-incomplete strong{display:block;font-size:13px}.creator-profile-incomplete small{display:block;color:#858c98;margin-top:4px}.creator-profile-incomplete .primary{white-space:nowrap}
    @media(max-width:800px){
      .creator-dashboard{gap:11px}.creator-dashboard-hero{grid-template-columns:auto 1fr;gap:12px;padding:15px 16px;border-radius:17px}.creator-dashboard-avatar{width:58px;height:58px;flex-basis:58px;font-size:20px}.creator-dashboard-identity h1{font-size:20px}.creator-dashboard-role{grid-column:1/-1;justify-self:stretch;text-align:left}.creator-dashboard-role .role-pill{padding:6px 9px}.creator-dashboard-role small{display:inline;margin-left:7px}.creator-assignment-card{grid-template-columns:1fr;gap:11px;padding:14px}.creator-contact-btn{width:100%}.creator-performance{padding:14px}.creator-performance-grid{grid-template-columns:1fr;gap:8px}.creator-metric{padding:11px}.creator-dashboard-grid{grid-template-columns:1fr 1fr;gap:9px}.creator-dashboard-card{min-height:128px;padding:14px}.creator-profile-incomplete{align-items:flex-start;flex-direction:column}.creator-profile-incomplete .primary{width:100%}
    }
  `;
  document.head.appendChild(style);
}

function ensureGrayxonPreferencesStyles(){
  if(document.getElementById('grayxon-preferences-v33-1')) return;
  const style=document.createElement('style');
  style.id='grayxon-preferences-v33-1';
  style.textContent=`
    .grayxon-preferences-card{display:grid;gap:12px}
    .grayxon-preference-item{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.02)}
    .grayxon-preference-item strong{display:block;color:#fff}.grayxon-preference-item p{margin:5px 0 0;line-height:1.45}
    .grayxon-preference-item button{flex:0 0 auto;white-space:nowrap}
    @media(max-width:700px){.grayxon-preference-item{align-items:flex-start;flex-direction:column}.grayxon-preference-item button{width:100%}}
  `;
  document.head.appendChild(style);
}

function creatorDashboardAvatar(){
  if(profileDetails?.avatar_url) return `<img src="${esc(profileDetails.avatar_url)}" alt="Foto de perfil">`;
  return `<span>${esc(profileInitial())}</span>`;
}

async function creatorDashboardTpl(expectedNav = navGeneration){
  ensureCreatorDashboardStyles();
  if(!session){ $('#space').innerHTML=authTpl(); return; }
  const uid=session.user.id;
  const spaceEl=$('#space');

  // Pintamos inmediatamente un dashboard real, usando el contexto ya disponible.
  // Las consultas se refrescan en segundo plano para que volver desde Mi perfil/Misiones
  // nunca deje la pantalla atrapada en "Cargando...".
  const cachedName=profile?.full_name||profile?.username||'Grayxon';
  const cachedUser=profile?.username||'creador';
  const cachedAvatar=profileDetails?.avatar_url ? `<img src="${esc(profileDetails.avatar_url)}" alt="Foto de perfil">` : `<span>${esc(profileInitial())}</span>`;
  if(spaceEl){
    spaceEl.innerHTML=`<div class="creator-dashboard creator-dashboard-fast">
      <section class="creator-dashboard-hero">
        <div class="creator-dashboard-avatar">${cachedAvatar}</div>
        <div class="creator-dashboard-identity"><div class="eyebrow">MI ESPACIO</div><h1>${esc(cachedName)}</h1><span class="creator-username">@${esc(cachedUser)}</span></div>
        <div class="creator-dashboard-role" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end"><button type="button" class="primary small install-grayxon-dashboard" id="installGrayxonDashboard" style="white-space:nowrap">📲 Instalar Grayxon</button><span class="role-pill">● CREADOR GRAYXON</span><small>Tu cuenta está activa</small></div>
      </section>
      <div class="creator-assignment-card"><div class="creator-assignment-main"><span class="creator-assignment-icon">👥</span><div><strong>Tu equipo y manager</strong><small>Actualizando tu información…</small></div></div></div>
      <section class="creator-performance"><div class="creator-section-head"><div><div class="eyebrow">TU DESEMPEÑO</div><h2>Cómo vas dentro de Grayxon</h2></div></div><div class="creator-performance-grid">
        <div class="creator-metric"><div class="creator-metric-top"><span>CUMPLIMIENTO</span><strong>—</strong></div><div class="space-progress"><span style="width:0%"></span></div><small>Actualizando tus misiones…</small></div>
        <div class="creator-metric"><div class="creator-metric-top"><span>FORMACIÓN</span><strong>—</strong></div><div class="space-progress"><span style="width:0%"></span></div><small>Actualizando tu formación…</small></div>
      </div></section>
      <div class="creator-dashboard-grid">
        <button type="button" class="creator-dashboard-card" data-space-action="training"><span class="creator-dashboard-card-icon">🎓</span><span class="creator-dashboard-card-meta">—</span><strong>Formación</strong><p>Ver tu formación de Grayxon.</p><span class="creator-dashboard-card-arrow">›</span></button>
        <button type="button" class="creator-dashboard-card" data-space-action="live-training"><span class="creator-dashboard-card-icon">🎥</span><span class="creator-dashboard-card-meta">—</span><strong>Entrenamientos</strong><p>Consulta tus entrenamientos.</p><span class="creator-dashboard-card-arrow">›</span></button>
        <button type="button" class="creator-dashboard-card" data-space-action="missions"><span class="creator-dashboard-card-icon">🎯</span><span class="creator-dashboard-card-meta">—</span><strong>Tus misiones</strong><p>Consulta tus objetivos.</p><span class="creator-dashboard-card-arrow">›</span></button>
        ${gxAnnouncementDashboardCard(true)}
      </div>
    </div>`;
    bind();
  }

  const safe=async(promise,fallback,ms=2200)=>{
    try{
      const r=await Promise.race([promise,new Promise(resolve=>setTimeout(()=>resolve({data:fallback,error:true}),ms))]);
      return r?.error?fallback:(r?.data??fallback);
    }catch{return fallback;}
  };

  const [assignment, profileRow, details, payment, lessons, lessonProgress, missions, missionProgress, activeTraining] = await Promise.all([
    loadCreatorAssignment(),
    safe(sb.from('profiles').select('id,username,full_name,active,team_id,manager_id,role').eq('id',uid).maybeSingle(),profile),
    safe(sb.from('profile_details').select('*').eq('user_id',uid).maybeSingle(),profileDetails),
    safe(sb.from('payment_methods').select('*').eq('user_id',uid).order('is_primary',{ascending:false}).limit(1).maybeSingle(),paymentMethod),
    safe(sb.from('lessons').select('id').eq('published',true),[]),
    safe(sb.from('lesson_progress').select('lesson_id').eq('user_id',uid),[]),
    safe(sb.from('missions').select('id,type,target,week_start,week_end,assigned_to').eq('published',true).or(`assigned_to.is.null,assigned_to.eq.${uid}`).order('week_start',{ascending:false}),[]),
    safe(sb.from('mission_progress').select('mission_id,value,completed').eq('user_id',uid),[])
  ]);

  // Si el usuario ya navegó a otra pantalla, este render atrasado no debe tocarla.
  if(expectedNav!==navGeneration || current!=='space' || !session?.user?.id || session.user.id!==uid) return;

  if(profileRow) profile=profileRow;
  if(details!==undefined) profileDetails=details;
  if(payment!==undefined) paymentMethod=payment;
  // LIVE se resuelve por separado y directamente sobre la tarjeta.
  // No dejamos que una consulta lenta del dashboard pueda pintar un estado
  // falso de "Sin sesión activa" después de que el LIVE ya esté disponible.
  currentLiveTraining=null;

  const d=profileDetails||{}; const pm=paymentMethod||{};
  const completionValues=[d.email,d.phone,d.country,d.state_region,d.city,d.address,d.avatar_url,pm.method_type&&(pm.method_type==='paypal'?pm.paypal_email:pm.account_number)];
  const completionCount=completionValues.filter(Boolean).length;
  const completionPct=Math.round(completionCount/8*100);
  const today=new Date().toISOString().slice(0,10);
  const mp=new Map((missionProgress||[]).map(x=>[x.mission_id,x]));
  const visibleMissions=(missions||[]).filter(m=>(!m.week_start||m.week_start<=today)&&(!m.week_end||m.week_end>=today)&&(!m.assigned_to||m.assigned_to===uid));
  const missionPct=m=>{const x=mp.get(m.id);if(!x)return 0;if(m.type==='checkbox')return x.completed?100:0;const target=Number(m.target||0);return target>0?Math.min(100,Math.round(Number(x.value||0)/target*100)):0;};
  const hasActiveMissions=visibleMissions.length>0;
  const missionCompletion=hasActiveMissions?Math.round(visibleMissions.reduce((sum,m)=>sum+missionPct(m),0)/visibleMissions.length):null;
  const missionCompletionLabel=hasActiveMissions?`${missionCompletion}%`:'—';
  const completedMissions=visibleMissions.filter(m=>missionPct(m)>=100).length;
  const lessonDone=new Set((lessonProgress||[]).map(x=>x.lesson_id));
  const lessonTotal=(lessons||[]).length; const lessonCompleted=(lessons||[]).filter(x=>lessonDone.has(x.id)).length;
  const formationPct=lessonTotal?Math.round(lessonCompleted/lessonTotal*100):0;
  const team=assignment?.team; const manager=assignment?.manager;
  const managerContact=manager?.phone?`<a class="creator-contact-btn" href="${esc(managerWhatsapp(manager.phone))}" target="_blank" rel="noopener noreferrer">WhatsApp · Contactar ↗</a>`:'';
  const managerBlock=team?`<div class="creator-assignment-card"><div class="creator-assignment-main"><span class="creator-assignment-icon">👥</span><div><strong>${esc(team.name)}</strong><small>Manager: <b>${esc(manager?.name||'Sin manager asignado')}</b></small></div></div>${managerContact}</div>`:`<div class="creator-assignment-card"><div class="creator-assignment-main"><span class="creator-assignment-icon">👥</span><div><strong>Sin equipo asignado</strong><small>Cuando tengas un equipo aparecerá aquí tu manager.</small></div></div></div>`;
  const profileIncomplete=completionPct<100?`<div class="creator-profile-incomplete"><div><strong>Completa tu perfil · ${completionPct}%</strong><small>${completionCount} de 8 datos completos. Mantén tu información actualizada.</small></div><button class="primary small" data-space-action="profile">Completar perfil</button></div>`:'';
  const trainingMeta='Buscando LIVE…';
  const trainingDesc='Comprobando si hay un entrenamiento en vivo…';
  const trainingCard=`<button type="button" class="creator-dashboard-card" data-space-action="live-training"><span class="creator-dashboard-card-icon">🎥</span><span class="creator-dashboard-card-meta">${esc(trainingMeta)}</span><strong>Entrenamientos</strong><p>${esc(trainingDesc)}</p><span class="creator-dashboard-card-arrow">›</span></button>`;
  const formationCard=`<button type="button" class="creator-dashboard-card" data-space-action="training"><span class="creator-dashboard-card-icon">🎓</span><span class="creator-dashboard-card-meta">${formationPct}%</span><strong>Formación</strong><p>${lessonTotal?`${lessonCompleted} de ${lessonTotal} lecciones completadas.`:'Aún no hay formación publicada.'}</p><span class="creator-dashboard-card-arrow">›</span></button>`;
  const missionsCard=`<button type="button" class="creator-dashboard-card" data-space-action="missions"><span class="creator-dashboard-card-icon">🎯</span><span class="creator-dashboard-card-meta">${missionCompletionLabel}</span><strong>Tus misiones</strong><p>${hasActiveMissions?`${completedMissions} de ${visibleMissions.length} activas completadas.`:'No tienes tareas pendientes.'}</p><span class="creator-dashboard-card-arrow">›</span></button>`;

  $('#space').innerHTML=`<div class="creator-dashboard">
    <section class="creator-dashboard-hero"><div class="creator-dashboard-avatar">${creatorDashboardAvatar()}</div><div class="creator-dashboard-identity"><div class="eyebrow">MI ESPACIO</div><h1>${esc(profile?.full_name||profile?.username||'Grayxon')}</h1><span class="creator-username">@${esc(profile?.username||'creador')}</span></div><div class="creator-dashboard-role" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end"><button type="button" class="primary small install-grayxon-dashboard" id="installGrayxonDashboard" style="white-space:nowrap">📲 Instalar Grayxon</button><span class="role-pill">● CREADOR GRAYXON</span><small>Tu cuenta está activa</small></div></section>
    ${managerBlock}
    <section class="creator-performance"><div class="creator-section-head"><div><div class="eyebrow">TU DESEMPEÑO</div><h2>Cómo vas dentro de Grayxon</h2></div></div><div class="creator-performance-grid"><div class="creator-metric"><div class="creator-metric-top"><span>CUMPLIMIENTO</span><strong>${missionCompletionLabel}</strong></div><div class="space-progress"><span style="width:${missionCompletion||0}%"></span></div><small>${hasActiveMissions?`${completedMissions} de ${visibleMissions.length} misiones activas completadas.`:'No tienes tareas pendientes esta semana.'}</small></div><div class="creator-metric"><div class="creator-metric-top"><span>FORMACIÓN</span><strong>${formationPct}%</strong></div><div class="space-progress"><span style="width:${formationPct}%"></span></div><small>${lessonCompleted} de ${lessonTotal} lecciones completadas.</small></div></div></section>
    <div class="creator-dashboard-grid">${formationCard}${trainingCard}${missionsCard}${gxAnnouncementDashboardCard(true)}</div>${profileIncomplete}
  </div>`;
  bind();
  refreshLiveTrainingCard();
  setTimeout(()=>{ if(current==='space' && isCreatorSession()) refreshLiveTrainingCard(); },300);
  setTimeout(()=>{ if(current==='space' && isCreatorSession()) refreshLiveTrainingCard(); },1500);
}

function renderCreatorSpaceImmediate(){
  ensureCreatorDashboardStyles();
  if(!session||profile?.role!=='creator') return;
  const el=$('#space'); if(!el)return;
  const name=profile?.full_name||profile?.username||'Grayxon';
  const user=profile?.username||'creador';
  const avatar=profileDetails?.avatar_url?`<img src="${esc(profileDetails.avatar_url)}" alt="Foto de perfil">`:`<span>${esc(profileInitial())}</span>`;
  el.innerHTML=`<div class="creator-dashboard creator-dashboard-fast"><section class="creator-dashboard-hero"><div class="creator-dashboard-avatar">${avatar}</div><div class="creator-dashboard-identity"><div class="eyebrow">MI ESPACIO</div><h1>${esc(name)}</h1><span class="creator-username">@${esc(user)}</span></div><div class="creator-dashboard-role" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end"><button type="button" class="primary small install-grayxon-dashboard" id="installGrayxonDashboard" style="white-space:nowrap">📲 Instalar Grayxon</button><span class="role-pill">● CREADOR GRAYXON</span></div></section><div class="creator-assignment-card"><div class="creator-assignment-main"><span class="creator-assignment-icon">👥</span><div><strong>Tu equipo y manager</strong><small>Actualizando…</small></div></div></div><section class="creator-performance"><div class="creator-section-head"><div><div class="eyebrow">TU DESEMPEÑO</div><h2>Cómo vas dentro de Grayxon</h2></div></div><div class="creator-performance-grid"><div class="creator-metric"><div class="creator-metric-top"><span>CUMPLIMIENTO</span><strong>—</strong></div><div class="space-progress"><span style="width:0%"></span></div><small>Actualizando…</small></div><div class="creator-metric"><div class="creator-metric-top"><span>FORMACIÓN</span><strong>—</strong></div><div class="space-progress"><span style="width:0%"></span></div><small>Actualizando…</small></div></div></section><div class="creator-dashboard-grid"><button type="button" class="creator-dashboard-card" data-space-action="training"><span class="creator-dashboard-card-icon">🎓</span><strong>Formación</strong><p>Ver tu formación.</p><span class="creator-dashboard-card-arrow">›</span></button><button type="button" class="creator-dashboard-card" data-space-action="live-training"><span class="creator-dashboard-card-icon">🎥</span><strong>Entrenamientos</strong><p>Ver tus entrenamientos.</p><span class="creator-dashboard-card-arrow">›</span></button><button type="button" class="creator-dashboard-card" data-space-action="missions"><span class="creator-dashboard-card-icon">🎯</span><strong>Tus misiones</strong><p>Ver tus objetivos.</p><span class="creator-dashboard-card-arrow">›</span></button>${gxAnnouncementDashboardCard(true)}</div></div>`;
  bind();
}

async function spaceTpl(){
  if(!session){$('#space').innerHTML=authTpl();return;}
  if(profile?.role==='creator'){
    renderCreatorSpaceImmediate();
    await creatorDashboardTpl();
    return;
  }
  return renderSpaceShell();
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

  $('#missions').innerHTML = `<div class="missions-page"><div class="row"><div><div class="eyebrow">TUS MISIONES</div><h1 style="margin:7px 0">Tus objetivos 🎯</h1><p class="muted">Tus misiones están organizadas por semanas. Toca una semana para ver todas las misiones que contiene.</p></div>${(profile?.role==='creator' || document.body.classList.contains('grayxon-creator-session'))?'':`<button class="secondary" data-space-action="space" aria-label="Volver a Mi espacio">← Mi espacio</button>`}</div>${congratulations}${section('Misiones asignadas','🎯',assignedGroups,'assigned','No tienes misiones asignadas')}${section('Misiones completadas','✓',completedGroups,'completed','Aún no tienes historial de misiones')}</div>`;
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


async function fetchCreatorLiveTrainingFast(){
  if(!session?.user?.id) return null;
  const uid=session.user.id;
  try{
    // Siempre usamos el perfil fresco para que Mi espacio no dependa de un team_id/manager_id obsoleto.
    const {data:freshProfile}=await sb.from('profiles').select('id,role,active,team_id,manager_id').eq('id',uid).maybeSingle();
    const p=freshProfile || profile || await getProfile();
    const {data:rawLive,error:liveError}=await sb.from('live_trainings')
      .select('id,title,description,scheduled_at,room_name,status,created_by,instructor_name,created_at,started_at,ended_at')
      .eq('status','live')
      .order('started_at',{ascending:false});
    if(liveError || !rawLive?.length) return null;
    const liveIds=rawLive.map(t=>t.id);
    const {data:aud,error:audError}=await sb.from('live_training_audience')
      .select('training_id,target_type,target_id')
      .in('training_id',liveIds);
    if(audError) return null;
    const teamId=p?.team_id||null;
    const allowedIds=new Set((aud||[]).filter(a=>
      a.target_type==='all_creators' ||
      (a.target_type==='creator' && a.target_id===uid) ||
      (a.target_type==='team' && teamId && a.target_id===teamId)
    ).map(a=>a.training_id));
    let active=rawLive.find(t=>allowedIds.has(t.id))||null;
    if(active) return active;
    const adminCreated=rawLive.filter(t=>t.created_by && !(aud||[]).some(a=>a.training_id===t.id));
    if(adminCreated.length){
      const {data:owners}=await sb.from('profiles').select('id,role').in('id',[...new Set(adminCreated.map(t=>t.created_by))]);
      const adminIds=new Set((owners||[]).filter(o=>o.role==='admin').map(o=>o.id));
      active=adminCreated.find(t=>adminIds.has(t.created_by))||null;
      if(active) return active;
    }
    if(teamId){
      const managerUserIds=[...new Set(rawLive.map(t=>t.created_by).filter(Boolean))];
      if(managerUserIds.length){
        const {data:managerRows}=await sb.from('managers').select('id,user_id').in('user_id',managerUserIds).eq('active',true);
        const managerIds=(managerRows||[]).map(m=>m.id);
        if(managerIds.length){
          const {data:managedTeam}=await sb.from('teams').select('id,manager_id').eq('id',teamId).in('manager_id',managerIds).maybeSingle();
          if(managedTeam?.manager_id){
            const managerByUser=new Map((managerRows||[]).map(m=>[m.user_id,m.id]));
            active=rawLive.find(t=>managerByUser.get(t.created_by)===managedTeam.manager_id)||null;
            if(active) return active;
          }
        }
      }
    }
    return null;
  }catch(e){ console.warn('No se pudo consultar rápidamente el LIVE del creador:',e?.message||e); return null; }
}

async function fetchActiveLiveTraining(){
  const fallback=null;
  try {
    const role=profile?.role;
    const uid=session?.user?.id;
    let q=sb.from('live_trainings')
      .select('id,title,description,scheduled_at,room_name,status,created_by,instructor_name,created_at,started_at,ended_at')
      .eq('status','live')
      .order('started_at',{ascending:false});
    const {data:trainings,error}=await q;
    if(error){ console.warn('No se pudo consultar el entrenamiento activo:',error.message); return fallback; }
    if(!trainings?.length) return fallback;

    // Admin puede abrir cualquier entrenamiento EN VIVO.
    if(role==='admin') return trainings[0];

    // Managers: solo su propio entrenamiento o uno dirigido a su cuenta.
    if(role==='manager'){
      const {data:me}=await sb.from('managers').select('id').eq('user_id',uid).maybeSingle();
      if(!me) return fallback;
      const ids=trainings.map(t=>t.id);
      const {data:aud,error:ae}=ids.length
        ? await sb.from('live_training_audience').select('training_id,target_type,target_id').in('training_id',ids)
        : {data:[],error:null};
      if(ae){ console.warn('No se pudo consultar la audiencia del entrenamiento:',ae.message); return trainings.find(t=>t.created_by===uid)||fallback; }
      const allowed=new Set((aud||[]).filter(a =>
        a.target_type==='all_managers' ||
        (a.target_type==='manager' && a.target_id===me.id)
      ).map(a=>a.training_id));
      return trainings.find(t=>t.created_by===uid || allowed.has(t.id))||fallback;
    }

    // Creator: use the same visibility model as the Entrenamientos page so
    // Mi espacio and Entrenamientos cannot disagree about an active LIVE.
    if(role==='creator'){
      const {data:creatorRow}=await sb.from('profiles').select('id,role,active,team_id').eq('id',uid).maybeSingle();
      const p=creatorRow||profile||{};
      const liveIds=trainings.map(t=>t.id);
      const {data:aud,error:ae}=liveIds.length
        ? await sb.from('live_training_audience').select('training_id,target_type,target_id').in('training_id',liveIds)
        : {data:[],error:null};
      if(ae){ console.warn('No se pudo consultar la audiencia del LIVE:',ae.message); return fallback; }

      const allowed=new Set((aud||[]).filter(a =>
        a.target_type==='all_creators' ||
        (a.target_type==='creator' && a.target_id===uid) ||
        (a.target_type==='team' && p.team_id && a.target_id===p.team_id)
      ).map(a=>a.training_id));
      const audienceLive=trainings.find(t=>allowed.has(t.id));
      if(audienceLive) return audienceLive;

      // Legacy compatibility: an older training may have been created without
      // an audience row. For an admin-created LIVE, the historical default was
      // all creators; keep that LIVE visible instead of leaving Mi espacio in
      // conflict with the Entrenamientos page.
      const adminLive=trainings.find(t=>t.created_by && (aud||[]).every(a=>a.training_id!==t.id));
      if(adminLive){
        const {data:creatorOwner}=await sb.from('profiles').select('id,role').eq('id',adminLive.created_by).maybeSingle();
        if(creatorOwner?.role==='admin') return adminLive;
      }

      // Legacy compatibility for manager-created LIVE without explicit team
      // audience: derive access from the creator's current team.
      const creatorTeamId=p?.team_id||null;
      if(creatorTeamId){
        const managerUserIds=[...new Set(trainings.map(t=>t.created_by).filter(Boolean))];
        if(managerUserIds.length){
          const {data:managerRows}=await sb.from('managers').select('id,user_id').in('user_id',managerUserIds).eq('active',true);
          const managerIds=(managerRows||[]).map(m=>m.id);
          if(managerIds.length){
            const {data:managedTeams}=await sb.from('teams').select('id,manager_id').eq('id',creatorTeamId).in('manager_id',managerIds);
            const managerByUser=new Map((managerRows||[]).map(m=>[m.user_id,m.id]));
            const teamManagerId=managedTeams?.[0]?.manager_id;
            if(teamManagerId){
              const ownedLive=trainings.find(t=>managerByUser.get(t.created_by)===teamManagerId);
              if(ownedLive) return ownedLive;
            }
          }
        }
      }

      // Final safe fallback: if the creator is already participating in a LIVE,
      // reflect that existing participation only.
      const {data:participating}=await sb.from('live_training_participants')
        .select('training_id')
        .eq('user_id',uid)
        .is('left_at',null)
        .in('training_id',liveIds)
        .order('joined_at',{ascending:false})
        .limit(1);
      const participatingId=participating?.[0]?.training_id;
      return trainings.find(t=>t.id===participatingId)||fallback;
    }
    return fallback;
  } catch(e){
    console.warn('No se pudo consultar el entrenamiento activo:',e?.message||e);
    return fallback;
  }
}
async function fetchCreatorLiveTrainingForDashboard(){
  if(!session?.user?.id) return null;
  const uid=session.user.id;
  try{
    // Mi espacio usa una comprobación mínima y directa. Primero busca LIVE activos
    // y, para all_creators, no depende de team_id/manager_id ni de otra carga del dashboard.
    const {data:liveRows,error:liveError}=await sb.from('live_trainings')
      .select('id,title,description,scheduled_at,room_name,status,created_by,instructor_name,created_at,started_at,ended_at')
      .eq('status','live')
      .order('started_at',{ascending:false});
    if(liveError || !liveRows?.length) return null;

    const ids=liveRows.map(t=>t.id);
    const {data:aud,error:audError}=await sb.from('live_training_audience')
      .select('training_id,target_type,target_id')
      .in('training_id',ids);
    if(audError) return null;

    // 1) Público: no requiere ningún dato adicional del perfil.
    const publicLiveIds=new Set((aud||[])
      .filter(a=>a.target_type==='all_creators')
      .map(a=>a.training_id));
    const publicLive=liveRows.find(t=>publicLiveIds.has(t.id));
    if(publicLive) return publicLive;

    // 2) Creator específico / equipo: ahora sí cargamos el perfil fresco.
    const {data:p}=await sb.from('profiles')
      .select('id,role,active,team_id,manager_id')
      .eq('id',uid)
      .maybeSingle();
    const teamId=p?.team_id||profile?.team_id||null;

    const directLive=liveRows.find(t=>(aud||[]).some(a=>
      a.training_id===t.id && (
        (a.target_type==='creator' && a.target_id===uid) ||
        (a.target_type==='team' && teamId && a.target_id===teamId)
      )
    ));
    if(directLive) return directLive;

    // 3) Compatibilidad con LIVE antiguos sin audiencia: admin => todos los creadores.
    const noAudience=liveRows.filter(t=>!(aud||[]).some(a=>a.training_id===t.id));
    if(noAudience.length){
      const ownerIds=[...new Set(noAudience.map(t=>t.created_by).filter(Boolean))];
      if(ownerIds.length){
        const {data:owners}=await sb.from('profiles').select('id,role').in('id',ownerIds);
        const admins=new Set((owners||[]).filter(x=>x.role==='admin').map(x=>x.id));
        const legacyAdmin=noAudience.find(t=>admins.has(t.created_by));
        if(legacyAdmin) return legacyAdmin;
      }
    }

    // 4) Compatibilidad con LIVE antiguos creados por un manager sin fila de audiencia.
    if(teamId){
      const creatorManagerUserIds=[...new Set(liveRows.map(t=>t.created_by).filter(Boolean))];
      if(creatorManagerUserIds.length){
        const {data:managerRows}=await sb.from('managers').select('id,user_id').in('user_id',creatorManagerUserIds).eq('active',true);
        const managerByUser=new Map((managerRows||[]).map(m=>[m.user_id,m.id]));
        const managerIds=[...(managerByUser.values())];
        if(managerIds.length){
          const {data:teamRow}=await sb.from('teams').select('id,manager_id').eq('id',teamId).in('manager_id',managerIds).maybeSingle();
          if(teamRow?.manager_id){
            const legacyManager=liveRows.find(t=>managerByUser.get(t.created_by)===teamRow.manager_id && !(aud||[]).some(a=>a.training_id===t.id));
            if(legacyManager) return legacyManager;
          }
        }
      }
    }
    return null;
  }catch(e){
    console.warn('Dashboard LIVE directo:',e?.message||e);
    return null;
  }
}

async function refreshLiveTrainingCard(){
  const card=document.querySelector('.live-training-space-card');
  const dashboardCard=document.querySelector('.creator-dashboard-card[data-space-action="live-training"]');
  const target=card||dashboardCard;
  if(!target)return;
  try{
    const live=profile?.role==='creator'
      ? await fetchCreatorLiveTrainingForDashboard()
      : await fetchActiveLiveTraining();
    currentLiveTraining=live||null;

    const status=target.querySelector('.live-training-card-status') || target.querySelector('.creator-dashboard-card-meta');
    const title=target.querySelector('.live-training-card-title');
    const detail=target.querySelector('.live-training-card-detail');
    const bar=target.querySelector('.space-progress span');
    const desc=target.querySelector('p');

    if(live){
      if(status)status.textContent='🔴 EN VIVO';
      if(title)title.textContent=live.title;
      if(desc)desc.textContent=live.title;
      if(detail)detail.textContent='🔴 EN VIVO · Entra ahora al entrenamiento →';
      if(bar)bar.style.width='100%';
      target.dataset.liveTrainingId=live.id;
      target.classList.add('live-training-active-card');
      target.setAttribute('aria-label',`Entrar al entrenamiento en vivo: ${live.title}`);
      return;
    }

    if(status)status.textContent='Sin sesión activa';
    if(title)title.textContent='Consulta tus entrenamientos en vivo de Grayxon.';
    if(desc)desc.textContent='Cuando haya uno activo aparecerá aquí.';
    if(detail)detail.textContent='Cuando haya uno activo aparecerá aquí.';
    if(bar)bar.style.width='0%';
    target.classList.remove('live-training-active-card');
    delete target.dataset.liveTrainingId;
  }catch(e){
    console.warn('No se pudo actualizar la tarjeta de LIVE:',e?.message||e);
  }
}

async function refreshManagerLiveDashboardCard(){
  if(profile?.role!=='manager' || managerView!=='dashboard') return;
  const status=document.querySelector('#manager [data-manager-live-status]');
  if(!status) return;
  try{
    const live=await fetchActiveLiveTraining();
    if(live){
      status.textContent=`🔴 EN VIVO: ${live.title||'Entrenamiento activo'} · Entra para unirte.`;
      status.dataset.liveTrainingId=live.id;
      status.closest('[data-manager-view="training"]')?.classList.add('manager-live-training-active');
    }else{
      status.textContent=status.dataset.defaultText||'Consulta y gestiona las sesiones LIVE de la agencia.';
      delete status.dataset.liveTrainingId;
      status.closest('[data-manager-view="training"]')?.classList.remove('manager-live-training-active');
    }
  }catch(e){
    console.warn('No se pudo actualizar el LIVE del dashboard manager:',e?.message||e);
  }
}

function stopCreatorLiveDashboardWatcher(){
  creatorLiveDashboardWatcherToken++;
  if(creatorLiveDashboardWatcher){clearInterval(creatorLiveDashboardWatcher);creatorLiveDashboardWatcher=null;}
}
function startCreatorLiveDashboardWatcher(){
  stopCreatorLiveDashboardWatcher();
  if(profile?.role!=='creator' || current!=='space' || !session?.user?.id)return;
  const token=creatorLiveDashboardWatcherToken;
  refreshLiveTrainingCard();
  creatorLiveDashboardWatcher=setInterval(()=>{
    if(token!==creatorLiveDashboardWatcherToken || current!=='space' || profile?.role!=='creator'){
      stopCreatorLiveDashboardWatcher(); return;
    }
    refreshLiveTrainingCard();
  },5000);
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
      updateCreatorSpaceFloat();
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

async function markLiveTrainingViewed(trainingId){
  if(!trainingId||!session?.user?.id)return false;
  const {error}=await sb.from('live_training_views').upsert({training_id:trainingId,user_id:session.user.id,viewed_at:new Date().toISOString()},{onConflict:'training_id,user_id'});
  if(error){console.warn('No se pudo registrar la visualización:',error.message);return false;}
  return true;
}

function showCreatorTrainingDetail(training){
  const existing=document.querySelector('.grayxon-training-detail-modal'); if(existing) existing.remove();
  const el=document.createElement('div');
  el.className='modal-backdrop grayxon-training-detail-modal';
  el.innerHTML=`<div class="card modal" style="max-width:700px"><div class="row"><div><div class="eyebrow">GRAYXON · ENTRENAMIENTO</div><h2>${esc(training.title)}</h2></div><button class="secondary" id="closeCreatorTrainingDetail">Cerrar</button></div><div class="hr"></div><div class="grid"><div class="item"><b>Instructor</b><div class="muted small">${esc(training.instructor_name||'Grayxon')}</div></div><div class="item"><b>Fecha</b><div class="muted small">${formatDateTime(training.started_at||training.scheduled_at||training.created_at)}</div></div><div class="item"><b>Duración</b><div class="muted small">${liveTrainingDuration(training.started_at,training.ended_at)}</div></div><div class="item"><b>Estado</b><div class="muted small">${training.status==='live'?'EN VIVO':training.status==='scheduled'?'Programado':'Completado'}</div></div></div><div class="item" style="margin-top:18px"><b>Contenido</b><p class="muted" style="margin:8px 0 0;line-height:1.65">${esc(training.description||'Este entrenamiento no tiene una descripción adicional.')}</p></div>${training.status==='live'?'<div style="margin-top:18px"><button class="primary" id="detailEnterLive">Entrar al entrenamiento</button></div>':''}</div>`;
  document.body.appendChild(el);
  $('#closeCreatorTrainingDetail').onclick=()=>el.remove();
  $('#detailEnterLive')?.addEventListener('click',async()=>{el.remove();await enterCreatorLiveTraining(training);});
}

async function enterCreatorLiveTraining(training){
  if(!training?.id) return;
  pendingLiveTrainingAutoStart={id:training.id};
  currentLiveTraining=training;
  current='live-training';
  updateCreatorSpaceFloat();
  updateCreatorTopNav();
  document.body.classList.add('grayxon-live-training-active');
  const pages=['home','benefits','auth','space','manager','training','live-training','missions','profile','admin'];
  pages.forEach(id=>{
    const node=$('#'+id); if(!node)return;
    const active=id==='live-training';
    node.classList.toggle('hidden',!active);
    node.hidden=!active;
    if(active) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden','true');
  });
  const spaceEl=$('#space');
  if(spaceEl){spaceEl.hidden=true;spaceEl.classList.add('hidden');spaceEl.style.setProperty('display','none','important');}
  if(history.state?.page!=='live-training') history.pushState({page:'live-training'},'',`${window.location.pathname}${window.location.search}#live-training`);
  await liveTrainingTpl(training);
  $('#enterGrayxonTraining')?.click();
}

async function creatorTrainingsTpl(){
  const el=ensureLiveTrainingPage();
  document.body.classList.add('grayxon-live-training-active');
  const spaceEl=$('#space'); if(spaceEl){spaceEl.hidden=true;spaceEl.classList.add('hidden');spaceEl.style.setProperty('display','none','important');}
  if(!session){el.innerHTML=authTpl();return;}
  profile=await getProfile();
  if(!profile?.active){await sb.auth.signOut();session=null;profile=null;el.innerHTML='<div class="login"><h2>Tu acceso está desactivado</h2></div>';return;}

  // Para CREADORES, la pantalla de Entrenamientos no es una biblioteca de
  // entrenamientos programados. Solo debe destacar un LIVE al que realmente
  // pueda entrar. El resto de la pantalla es un historial compacto de los
  // entrenamientos a los que efectivamente asistió.
  const {data:rawLive,error:liveError}=await sb.from('live_trainings')
    .select('id,title,description,scheduled_at,room_name,status,created_by,instructor_name,created_at,started_at,ended_at')
    .eq('status','live')
    .order('started_at',{ascending:false});
  if(liveError){
    el.innerHTML=`<div class="live-training-page"><div class="live-training-feature"><div class="live-training-feature-inner"><h2>No pudimos cargar tus entrenamientos</h2><p class="muted">${esc(liveError.message)}</p></div></div></div>`;
    return;
  }

  const uid=session.user.id;
  const p=profile||{};
  const liveIds=(rawLive||[]).map(t=>t.id);
  const {data:liveAudience}=liveIds.length
    ? await sb.from('live_training_audience').select('training_id,target_type,target_id').in('training_id',liveIds)
    : {data:[]};

  // IMPORTANTE: target_type=manager NUNCA da acceso a un creador.
  const allowedLiveIds=new Set((liveAudience||[]).filter(a =>
    a.target_type==='all_creators' ||
    (a.target_type==='creator' && a.target_id===uid) ||
    (a.target_type==='team' && a.target_id===p.team_id)
  ).map(a=>a.training_id));

  let liveTrainings=(rawLive||[]).filter(t=>allowedLiveIds.has(t.id));

  // Compatibilidad con LIVE antiguos sin audiencia guardada.
  // Si el instructor es admin, el comportamiento histórico por defecto era
  // permitir a todos los creadores entrar; si es manager, se deriva por equipo.
  if(!liveTrainings.length && rawLive?.length){
    const adminCreated=(rawLive||[]).filter(t=>t.created_by && !liveAudience?.some(a=>a.training_id===t.id));
    if(adminCreated.length){
      const {data:owners}=await sb.from('profiles').select('id,role').in('id',[...new Set(adminCreated.map(t=>t.created_by))]);
      const adminIds=new Set((owners||[]).filter(o=>o.role==='admin').map(o=>o.id));
      liveTrainings=adminCreated.filter(t=>adminIds.has(t.created_by));
    }
  }

  // Compatibilidad con LIVE antiguos de manager que no tienen audiencia guardada.
  // Si el creador pertenece a un equipo administrado por el instructor, ese LIVE
  // sigue siendo válido para él.
  if(!liveTrainings.length && rawLive?.length && p.team_id){
    const managerUserIds=[...new Set(rawLive.map(t=>t.created_by).filter(Boolean))];
    if(managerUserIds.length){
      const {data:managerRows}=await sb.from('managers').select('id,user_id').in('user_id',managerUserIds).eq('active',true);
      const managerIds=(managerRows||[]).map(m=>m.id);
      if(managerIds.length){
        const {data:managedTeam}=await sb.from('teams').select('id,manager_id').eq('id',p.team_id).in('manager_id',managerIds).maybeSingle();
        if(managedTeam?.manager_id){
          const managerByUser=new Map((managerRows||[]).map(m=>[m.user_id,m.id]));
          liveTrainings=(rawLive||[]).filter(t=>managerByUser.get(t.created_by)===managedTeam.manager_id);
        }
      }
    }
  }
  const pendingId=pendingLiveTrainingAutoStart?.id||null;
  const activeLive=(pendingId && (rawLive||[]).find(t=>t.id===pendingId)) || liveTrainings[0] || null;
  if(pendingId) pendingLiveTrainingAutoStart=null;
  currentLiveTraining=activeLive||null;

  // Historial real = entrenamientos donde el creador tiene un registro de
  // participación. Una simple apertura/visualización no cuenta como asistencia.
  const {data:participantRows, error:participantError}=await sb.from('live_training_participants')
    .select('training_id,joined_at,left_at,duration_seconds')
    .eq('user_id',uid)
    .order('joined_at',{ascending:false});

  let attended=[];
  if(!participantError && participantRows?.length){
    const attendedIds=[...new Set(participantRows.map(r=>r.training_id).filter(Boolean))];
    const {data:attendedTrainings}=await sb.from('live_trainings')
      .select('id,title,description,scheduled_at,room_name,status,created_by,instructor_name,created_at,started_at,ended_at')
      .in('id',attendedIds)
      .order('started_at',{ascending:false});
    const tm=new Map((attendedTrainings||[]).map(t=>[t.id,t]));
    attended=participantRows.map(r=>({training:tm.get(r.training_id),participant:r})).filter(x=>x.training);
  }

  const uniqueAttended=[];
  const seenAttended=new Set();
  for(const item of attended){
    if(seenAttended.has(item.training.id)) continue;
    seenAttended.add(item.training.id);
    uniqueAttended.push(item);
  }

  const liveCard=activeLive ? `<section class="creator-live-now-section">
    <div class="eyebrow">ENTRENAMIENTO EN VIVO</div>
    <div class="creator-live-now-card">
      <div class="creator-live-now-copy">
        <div class="creator-live-now-badge"><span></span> EN VIVO</div>
        <h2>${esc(activeLive.title)}</h2>
        <p class="muted">Instructor: ${esc(activeLive.instructor_name||'Grayxon')}</p>
        ${activeLive.description?`<p class="muted small">${esc(activeLive.description)}</p>`:''}
      </div>
      <button type="button" class="primary" id="enterCreatorLiveNow">Entrar al entrenamiento</button>
    </div>
  </section>` : '';

  const historyItems=uniqueAttended.map(({training:t,participant:r})=>`<div class="creator-attended-item">
    <div class="creator-attended-main">
      <span class="creator-training-icon">🎥</span>
      <span><strong>${esc(t.title)}</strong><small>${esc(t.instructor_name||'Grayxon')} · ${formatDateTime(t.started_at||t.scheduled_at||t.created_at)}</small></span>
    </div>
    <span class="creator-attended-duration">${t.started_at ? liveTrainingDuration(r.joined_at,r.left_at||t.ended_at) : 'Asistencia registrada'}</span>
  </div>`).join('');

  el.innerHTML=`<div class="live-training-page creator-training-library">
    <div class="live-training-hero"><div><div class="live-training-kicker">GRAYXON · ENTRENAMIENTOS</div><h1>Tus entrenamientos 🎥</h1><p>Entra directamente cuando un entrenamiento esté EN VIVO y consulta abajo tu historial de asistencia.</p></div></div>
    ${liveCard}
    <section class="creator-attended-section">
      <button type="button" class="creator-attended-toggle" id="creatorAttendedToggle" aria-expanded="false">
        <span><span class="eyebrow">HISTORIAL</span><strong>Entrenamientos a los que asististe</strong></span>
        <span class="creator-attended-toggle-right"><b>${uniqueAttended.length}</b><span class="creator-training-chevron">›</span></span>
      </button>
      <div id="creatorAttendedPanel" class="creator-attended-panel hidden">
        ${historyItems || '<div class="creator-training-empty">Todavía no has asistido a ningún entrenamiento.</div>'}
      </div>
    </section>
  </div>`;

  $('#enterCreatorLiveNow')?.addEventListener('click',async()=>{
    if(!activeLive)return;
    await enterCreatorLiveTraining(activeLive);
  });
  $('#creatorAttendedToggle')?.addEventListener('click',()=>{
    const panel=$('#creatorAttendedPanel');
    const btn=$('#creatorAttendedToggle');
    if(!panel||!btn)return;
    const open=panel.classList.contains('hidden');
    panel.classList.toggle('hidden',!open);
    btn.setAttribute('aria-expanded',open?'true':'false');
    btn.classList.toggle('open',open);
  });
}

async function liveTrainingTpl(trainingOverride=null) {
  if((profile?.role==='creator' || document.body.classList.contains('grayxon-creator-session')) && !trainingOverride) return creatorTrainingsTpl();
  const el=ensureLiveTrainingPage();
  document.body.classList.add('grayxon-live-training-active');
  const spaceEl=$('#space'); if(spaceEl){spaceEl.hidden=true;spaceEl.classList.add('hidden');spaceEl.style.setProperty('display','none','important');}
  if(!session){el.innerHTML=authTpl();return;}
  profile=await getProfile();
  if(!profile||!profile.active){await sb.auth.signOut();session=null;profile=null;el.innerHTML='<div class="login"><h2>Tu acceso está desactivado</h2></div>';destroyJaasMeeting();return;}
  const training=trainingOverride || await fetchActiveLiveTraining(); currentLiveTraining=training;
  const isHost=!!training?.created_by && training.created_by===session?.user?.id;
  const isModerator=profile.role==='admin'||profile.role==='manager';
  const backPage=isModerator?(profile.role==='admin'?'admin':'manager'):'space';
  if(!training){
    el.innerHTML=`<div class="live-training-page"><div class="live-training-hero"><div><div class="live-training-kicker">GRAYXON · ENTRENAMIENTOS</div><h1>Entrenamientos en vivo 🎥</h1><p>Cuando Grayxon inicie un entrenamiento, aparecerá aquí automáticamente.</p></div>${isModerator?`<button class="secondary" data-space-action="${backPage}">← ${isHost?'Volver al panel':'Volver'}</button>`:''}</div><section class="live-training-feature live-training-empty-compact"><div class="live-training-feature-inner live-training-empty-state"><span class="live-training-idle-icon">○</span><h2>No hay un entrenamiento en vivo</h2><p class="live-training-subtitle">En este momento no hay ninguna sesión activa.</p></div></section></div>`;
    bind();
    return;
  }
  el.innerHTML=`<div class="live-training-page"><div class="live-training-hero"><div><div class="live-training-kicker">GRAYXON · ENTRENAMIENTOS</div><h1>Entrenamiento en vivo 🎥</h1><p>Sesión activa dentro del portal Grayxon.</p></div>${isModerator?`<button class="secondary" data-space-action="${backPage}">← Volver</button>`:''}</div><section class="live-training-feature"><div class="live-training-feature-inner"><div class="live-training-feature-top"><div><span class="live-training-badge"><i class="live-training-badge-dot"></i> EN VIVO</span><h2 class="live-training-title">${esc(training.title)}</h2><p class="live-training-subtitle">${esc(training.description||'Entrenamiento en vivo de Grayxon Group.')}</p></div></div><div class="live-training-meta"><span class="live-training-meta-item">👤 <b>Instructor:</b>&nbsp; ${esc(training.instructor_name||'Grayxon')}</span><span class="live-training-meta-item">🕒 <b>Inició:</b>&nbsp; ${formatDateTime(training.started_at)}</span><span class="live-training-meta-item">🎙️ <b>Rol:</b>&nbsp; ${isHost?'Anfitrión':isModerator?'Moderador':'Participante'}</span></div><div class="live-training-actions"><button class="primary live-training-enter" id="enterGrayxonTraining">Entrar</button></div></div></section><div id="grayxonTrainingRoomWrap" class="hidden" hidden style="display:none!important"><div class="live-training-shell"><div id="grayxonJaasMeet" class="live-training-meet"></div></div></div></div>`;
  bind();
  const autoStart=pendingLiveTrainingAutoStart?.id===training.id;if(autoStart)pendingLiveTrainingAutoStart=null;
  $('#enterGrayxonTraining')?.addEventListener('click',async()=>{const btn=$('#enterGrayxonTraining'),wrap=$('#grayxonTrainingRoomWrap'),hero=$('.live-training-hero'),feature=$('.live-training-feature');document.body.classList.add('grayxon-live-training-call');if(btn){btn.disabled=true;btn.textContent='Entrando…';}if(hero){hero.classList.add('hidden');hero.hidden=true;hero.style.setProperty('display','none','important');}if(feature){feature.classList.add('hidden');feature.hidden=true;feature.style.setProperty('display','none','important');}if(wrap){wrap.classList.remove('hidden');wrap.hidden=false;wrap.style.setProperty('display','block','important');}window.scrollTo(0,0);await startGrayxonLiveTraining(training);});
  if(autoStart) $('#enterGrayxonTraining')?.click();
}

async function trainingTpl() {
  if (!session) {
    $('#training').innerHTML = authTpl();
    return;
  }
  profile = await getProfile();
  ensureFormationMobileV34Styles();
  if (!profile || !profile.active) {
    await sb.auth.signOut();
    session = null;
    profile = null;
    $('#training').innerHTML = '<div class="login"><h2>Acceso desactivado</h2><p class="muted">Tu acceso al portal de Grayxon ha sido desactivado.</p></div>';
    return;
  }

  const [{ data: modules }, { data: lessons }, { data: progress }] = await Promise.all([
    sb.from('modules').select('id,title,description,sort_order').eq('published', true).order('sort_order'),
    sb.from('lessons').select('id,module_id,title,description,type,content,video_path,resource_path,sort_order').eq('published', true).order('sort_order'),
    sb.from('lesson_progress').select('lesson_id').eq('user_id', session.user.id)
  ]);

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

  const moduleData = (modules || []).map((m, mi) => {
    const ml = orderedLessons.filter(l => l.module_id === m.id);
    const md = ml.filter(l => done.has(l.id)).length;
    const complete = ml.length > 0 && md === ml.length;
    return { m, mi, ml, md, complete, pct: ml.length ? Math.round(md / ml.length * 100) : 0 };
  });
  const pendingModules = moduleData.filter(x => !x.complete);
  const completedModules = moduleData.filter(x => x.complete);

  const moduleCard = (x, section) => {
    const {m, mi, ml, md, complete, pct} = x;
    const panelId = `formation-module-${section}-${m.id}`;
    return `<div class="formation-module-accordion ${complete ? 'formation-module-complete' : ''}">
      <button type="button" class="formation-module-toggle" data-formation-module-toggle="${esc(panelId)}" aria-expanded="false">
        <span class="formation-module-number">${String(mi + 1).padStart(2,'0')}</span>
        <span class="formation-module-copy"><strong>${esc(m.title)}</strong><small>${esc(m.description || '')}</small></span>
        <span class="formation-module-meta"><b>${complete ? '✓' : `${md}/${ml.length}`}</b><span class="formation-module-chevron">›</span></span>
      </button>
      <div id="${esc(panelId)}" class="formation-module-panel hidden">
        <div class="formation-module-progress"><span style="width:${pct}%"></span></div>
        <div class="formation-module-progress-label">${complete ? 'Módulo completado' : `${md} de ${ml.length} lecciones completadas`}</div>
        <div class="formation-lessons-list">
          ${ml.map((l, li) => `<div class="lesson ${done.has(l.id) ? 'lesson-done' : ''} ${nextPending?.id === l.id ? 'lesson-next' : ''}">
            <button type="button" data-lesson="${l.id}">
              <span class="lesson-index">${done.has(l.id) ? '✓' : li + 1}</span>
              <span class="lesson-text"><strong>${esc(l.title)}</strong><small>${l.type === 'video' ? 'Video' : l.type === 'resource' ? 'Recurso' : 'Contenido'}${done.has(l.id) ? ' · Completado' : ''}</small></span>
            </button>
            ${nextPending?.id === l.id ? '<span class="next-badge">SIGUIENTE</span>' : ''}
          </div>`).join('') || '<div class="muted small">Este módulo todavía no tiene lecciones.</div>'}
        </div>
      </div>
    </div>`;
  };

  const sectionHtml = (title, kicker, items, section, emptyText, defaultOpen=false) => {
    const panelId=`formation-section-${section}`;
    return `<section class="formation-group ${defaultOpen?'is-open':''}">
      <button type="button" class="formation-group-toggle" data-formation-group-toggle="${panelId}" aria-expanded="${defaultOpen?'true':'false'}">
        <span><span class="eyebrow">${kicker}</span><strong>${title}</strong></span>
        <span class="formation-group-toggle-right"><b>${items.length}</b><span class="formation-group-chevron">›</span></span>
      </button>
      <div id="${panelId}" class="formation-group-panel ${defaultOpen?'':'hidden'}">
        <div class="formation-group-list">${items.length ? items.map(x => moduleCard(x, section)).join('') : `<div class="formation-empty-group">${emptyText}</div>`}</div>
      </div>
    </section>`;
  };

  $('#training').innerHTML = `<div class="formation-page">
    <div class="row"><div><div class="eyebrow">FORMACIÓN</div><h1 style="margin:7px 0">Aprende con Grayxon 🎓</h1><p class="muted">Aquí encontrarás tus módulos y lecciones. Abre un módulo para ver su contenido.</p></div>${profile?.role==='creator' ? '' : '<button class="secondary" data-space-action="space">← Mi espacio</button>'}</div>
    <div class="card formation-progress-card" style="margin-top:18px"><div class="row"><div><b>Tu progreso</b><div class="muted small">${totalDone} de ${totalLessons} lecciones completadas</div></div><b class="progress-percent">${totalPct}%</b></div><div class="progress-track"><div class="progress-fill" style="width:${totalPct}%"></div></div></div>
    <div class="formation-groups" style="margin-top:22px">
      ${sectionHtml('Por ver','POR VER',pendingModules,'pending','No tienes módulos pendientes. 🎉',pendingModules.length>0)}
      ${sectionHtml('Completados','COMPLETADOS',completedModules,'completed','Todavía no has completado ningún módulo.',false)}
    </div>
    <div class="lesson-view hidden" id="lessonView"></div>
  </div>`;

  window._lessons = orderedLessons;
  window._modules = modules || [];
  window._done = done;
}

function getLessonById(id){
  return (window._lessons || []).find(x => x.id === id) || null;
}

function getModuleLessons(moduleId){
  return (window._lessons || []).filter(x => x.module_id === moduleId);
}

function getNextLessonAfter(id){
  const lesson = getLessonById(id);
  if(!lesson) return null;
  const lessons = getModuleLessons(lesson.module_id)
    .slice()
    .sort((a,b) => Number(a.sort_order||0) - Number(b.sort_order||0));
  const currentIndex = lessons.findIndex(x => x.id === id);
  if(currentIndex < 0) return null;
  // En revisión también debe existir un “Siguiente contenido”: aquí buscamos
  // el siguiente contenido real del módulo, aunque ya esté completado.
  return lessons[currentIndex + 1] || null;
}

function getNextPendingModuleLesson(currentModuleId){
  const modules = window._modules || [];
  const lessons = window._lessons || [];
  const done = window._done || new Set();
  const currentIndex = modules.findIndex(m => m.id === currentModuleId);
  for(let i = Math.max(0, currentIndex + 1); i < modules.length; i++){
    const firstPending = lessons
      .filter(l => l.module_id === modules[i].id)
      .sort((a,b) => Number(a.sort_order||0)-Number(b.sort_order||0))
      .find(l => !done.has(l.id));
    if(firstPending) return firstPending;
  }
  return null;
}

function showModuleCompletionPopup(module, nextLesson){
  return new Promise(resolve => {
    const nextLabel = nextLesson ? `Siguiente módulo: ${nextLesson.title}` : 'Has completado toda la formación disponible.';
    const destinationLabel = nextLesson ? 'Continuar formación →' : 'Ir a Formación →';
    const el = modal(`
      <div class="module-completion-popup">
        <div class="module-completion-icon">✓</div>
        <div class="eyebrow">MÓDULO COMPLETADO</div>
        <h2>¡Felicitaciones!</h2>
        <p class="module-completion-message">Has completado <strong>${esc(module?.title || 'este módulo')}</strong>.</p>
        <div class="module-completion-next">${esc(nextLabel)}</div>
        <div class="inline module-completion-actions">
          <button class="primary module-completion-cta" id="acceptModuleCompletion">${destinationLabel}</button>
        </div>
      </div>`);
    el.classList.add('formation-completion-backdrop');
    const accept = $('#acceptModuleCompletion');
    const finish = async () => {
      el.remove();
      resolve(true);
      if(nextLesson){
        await openLesson(nextLesson.id, {skipReload:true});
      } else {
        nav('training');
      }
    };
    accept?.addEventListener('click', finish);
  });
}

let lessonAdvanceTimer = null;

function dismissLessonAdvancePrompt(){
  if(lessonAdvanceTimer){ clearTimeout(lessonAdvanceTimer); lessonAdvanceTimer = null; }
  document.getElementById('lessonNextPrompt')?.remove();
}

function showLessonAdvancePrompt(nextLesson, delayMs = 3500){
  dismissLessonAdvancePrompt();
  return new Promise(resolve => {
    const host = document.createElement('div');
    host.id = 'lessonNextPrompt';
    host.className = 'lesson-next-prompt';
    host.innerHTML = `
      <div class="lesson-next-prompt-copy">
        <span class="eyebrow">SIGUIENTE CONTENIDO</span>
        <strong>${esc(nextLesson?.title || 'Siguiente contenido')}</strong>
        <span class="lesson-next-countdown">Abriendo automáticamente… <b>${Math.ceil(delayMs / 1000)}</b></span>
      </div>
      <button type="button" class="primary lesson-next-prompt-btn">Siguiente →</button>`;
    document.body.appendChild(host);

    let remaining = Math.ceil(delayMs / 1000);
    const countdown = host.querySelector('.lesson-next-countdown b');
    const interval = setInterval(() => {
      remaining -= 1;
      if(countdown) countdown.textContent = Math.max(0, remaining);
      if(remaining <= 0) clearInterval(interval);
    }, 1000);

    const go = async () => {
      clearInterval(interval);
      if(lessonAdvanceTimer){ clearTimeout(lessonAdvanceTimer); lessonAdvanceTimer = null; }
      host.remove();
      resolve(true);
      await openLesson(nextLesson.id, {skipReload:true});
    };
    host.querySelector('.lesson-next-prompt-btn')?.addEventListener('click', go, {once:true});
    lessonAdvanceTimer = setTimeout(go, delayMs);
  });
}

async function advanceAfterLesson(id, options = {}){
  const lesson = getLessonById(id);
  if(!lesson) return;

  const nextSameModule = getNextLessonAfter(id);
  if(nextSameModule){
    // Tanto en un contenido nuevo como al repasar un contenido ya visto,
    // primero se ofrece el siguiente contenido REAL del mismo módulo.
    if(options.fromVideo){
      await showLessonAdvancePrompt(nextSameModule);
    } else {
      await openLesson(nextSameModule.id, {skipReload:true});
      toast(`Siguiente contenido: ${nextSameModule.title}`);
    }
    return;
  }

  // Solo el último contenido puede disparar el popup de módulo completado,
  // y únicamente cuando todos los contenidos de ese módulo están completados.
  const moduleLessons = getModuleLessons(lesson.module_id);
  const done = window._done || new Set();
  const moduleComplete = moduleLessons.length > 0 && moduleLessons.every(l => done.has(l.id));
  if(moduleComplete){
    const module = (window._modules || []).find(m => m.id === lesson.module_id);
    const nextModuleLesson = getNextPendingModuleLesson(lesson.module_id);
    await showModuleCompletionPopup(module, nextModuleLesson);
  }
}

async function renderSelectedLesson(l) {
  if (!l || !$('#lessonView')) return;
  let media = '';
  if (l.type === 'video' && l.video_path) {
    const { data, error } = await sb.storage.from('training-videos').createSignedUrl(l.video_path, 3600);
    if (!error && data?.signedUrl) media = `<div class="video-wrap"><video id="lessonVideo" class="video" controls playsinline preload="metadata" src="${data.signedUrl}"></video><div id="videoCompletion" class="video-hint">▶ Reproduce el video completo. Al terminar, pasarás automáticamente al siguiente contenido.</div></div>`;
  } else if (l.type === 'resource' && l.resource_path) {
    const { data, error } = await sb.storage.from('training-resources').createSignedUrl(l.resource_path, 3600);
    if (!error && data?.signedUrl) media = `<a class="secondary" href="${data.signedUrl}" target="_blank" rel="noopener noreferrer">Abrir recurso</a>`;
  }
  const isVideo = l.type === 'video' && !!l.video_path;
  const alreadyDone = window._done.has(l.id);
  const actionLabel = 'Continuar';
  $('#lessonView').classList.remove('hidden');
  $('#lessonView').innerHTML = `<div class="eyebrow">LECCIÓN</div><div class="lesson-header"><div><h2>${esc(l.title)}</h2><p class="muted">${esc(l.description || '')}</p></div><span class="lesson-state ${alreadyDone ? 'completed' : ''}">${alreadyDone ? '✓ COMPLETADA' : isVideo ? 'EN CURSO' : 'PENDIENTE'}</span></div>${media}${l.content ? `<div class="section">${esc(l.content).replace(/\n/g, '<br>')}</div>` : ''}${!isVideo ? `<button class="primary" id="completeLesson">${actionLabel}</button>` : ''}`;

  if (isVideo) {
    const video = $('#lessonVideo');
    if (video) {
      video.addEventListener('ended', async () => {
        const hint = $('#videoCompletion');
        if (hint) hint.textContent = alreadyDone ? '✓ Video terminado. Preparando el siguiente contenido…' : '✓ Video terminado. Guardando tu avance…';
        await completeLesson(l.id, { autoAdvance: true, fromVideo: true });
      }, {once:true});
    }
  } else {
    $('#completeLesson')?.addEventListener('click', async () => {
      await completeLesson(l.id, {autoAdvance:true});
    });
  }

  const formationPage = $('#training .formation-page');
  const modulesList = $('.formation-groups');
  formationPage?.classList.add('lesson-focus-mode');
  modulesList?.classList.add('lesson-focus-hidden');
  $('#lessonView')?.classList.add('lesson-focus-active');
  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

async function openLesson(id, options = {}) {
  const l = getLessonById(id);
  if (!l) return;
  selectedLesson = l;

  if(!options.skipReload){
    await trainingTpl();
    bind();
  }

  await renderSelectedLesson(l);
}

async function completeLesson(id, options = {}) {
  const lesson = getLessonById(id);
  if(!lesson) return;

  // If the lesson was already completed, the Continue button simply advances.
  if(window._done.has(id)){
    await advanceAfterLesson(id, {fromVideo: !!options.fromVideo});
    return;
  }

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
      btn.textContent = 'Continuar';
    }
    const hint = $('#videoCompletion');
    if (hint) hint.textContent = 'No pudimos guardar tu avance. Inténtalo nuevamente.';
    toast(`No se pudo guardar: ${error.message || 'error desconocido'}`);
    return;
  }

  window._done.add(id);
  toast('Lección completada ✓');

  // Avanzamos sobre la vista actual. No refrescamos Formación después porque ese render
  // podía destruir la lección que acabábamos de abrir. El progreso local ya está actualizado.
  await advanceAfterLesson(id, {fromVideo: !!options.fromVideo});
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
  const managerUpcomingRes=await sb.from('live_trainings').select('id,title,scheduled_at,status,instructor_name,created_by').eq('status','scheduled').order('scheduled_at',{ascending:true}).limit(10);
  const managerUpcoming=(managerUpcomingRes.data||[]).filter(t=>t.scheduled_at && new Date(t.scheduled_at)>=new Date()).slice(0,3);
  const trainingManagement=await liveTrainingManagementTpl('manager',false);
  const managerCard=(view,icon,title,desc,meta='›')=>`<button type="button" class="manager-dashboard-card" data-manager-view="${view}"><span class="manager-dashboard-card-icon">${icon}</span><span class="manager-dashboard-card-copy"><strong>${title}</strong><small ${view==='training'?`data-manager-live-status data-default-text="${esc(desc)}"`:''}>${desc}</small></span><span class="manager-dashboard-card-arrow">${meta}</span></button>`;
  const managerCommsCard=`<button type="button" class="manager-dashboard-card" data-manager-view="announcements"><span class="manager-dashboard-card-icon gx-manager-comms-icon">📣</span><span class="manager-dashboard-card-copy"><strong>Centro de comunicados</strong><small>Novedades, avisos importantes y recursos de tu equipo.</small><span class="gx-ann-unread-badge hidden" data-gx-ann-unread-badge aria-live="polite"><b>0</b> pendientes por leer</span></span><span class="manager-dashboard-card-arrow">›</span></button>`;
  const dashboardMarkup=`<div class="manager-dashboard-grid">${managerCommsCard}${managerCard('training','🎥','Entrenamientos en vivo',`${managerUpcoming.length} próximos programados · Consulta y gestiona las sesiones.`)}${managerCard('creators','👥','Mis creadores','Consulta y administra los creadores asignados a tu equipo.',(creators||[]).length)}${managerCard('tasks','📋','Tareas asignadas','Consulta y completa las tareas que te asignó la administración.',tasks.length)}</div>`;
  const pageHeader=(title,desc)=>`<div class="manager-subpage-header"><button type="button" class="secondary" data-manager-back>← Volver a Tu espacio</button><div><div class="eyebrow">PANEL DE MANAGER</div><h2>${title}</h2><p class="muted small">${desc}</p></div></div>`;
  let managerContent='';
  if(managerView==='dashboard') managerContent=dashboardMarkup;
  else if(managerView==='creators') managerContent=`${pageHeader('Mis creadores','Solo aparecen los creadores que actualmente están asignados a ti.')}<section class="card manager-creators-fullpage"><div class="manager-creator-search"><span aria-hidden="true">⌕</span><input id="managerCreatorSearch" type="search" placeholder="Buscar por nombre o usuario…" autocomplete="off"></div><div id="managerCreatorNoResults" class="item hidden"><p class="muted small" style="margin:0">No encontramos un creador con esa búsqueda.</p></div><div class="manager-creators-list" id="managerCreatorsList">${creatorRows}</div></section>`;
  else if(managerView==='tasks') managerContent=`${pageHeader('Tareas asignadas','Consulta y completa las tareas que te ha asignado la administración.')}<section class="card manager-tasks-fullpage"><div class="manager-tasks-list">${taskHtml}</div></section>`;
  else if(managerView==='training') managerContent=`${pageHeader('Entrenamientos en vivo','Consulta y gestiona las sesiones LIVE de la agencia.')}<section class="manager-training-fullpage">${trainingManagement}</section>`;
  else managerContent=dashboardMarkup;
  $('#manager').innerHTML=`<div class="manager-page"><div class="manager-hero card"><div><div class="eyebrow">PANEL DE MANAGER</div><h1>Hola, ${esc(me?.name||profile.username)} 👋</h1><p class="muted">${managerView==='dashboard'?'Aquí puedes ver tus creadores, asignar misiones y gestionar tus entrenamientos en vivo.':'Gestiona esta sección de tu equipo desde una vista completa.'}</p></div><div class="manager-hero-stat"><strong>${(creators||[]).length}</strong><span>CREADORES</span></div></div>${managerContent}</div>`;
  $$('[data-manager-view]').forEach(b=>b.onclick=async()=>{if(b.dataset.busy==='1')return;b.dataset.busy='1';const next=b.dataset.managerView;if(next==='announcements'){nav('announcements');return;}managerView=next;await render();window.scrollTo(0,0);});
  $$('[data-manager-back]').forEach(b=>b.onclick=async()=>{if(b.dataset.busy==='1')return;b.dataset.busy='1';managerView='dashboard';await render();window.scrollTo(0,0);});
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
  if(managerView==='dashboard') refreshManagerLiveDashboardCard();
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
  const [{data:team,error:te},{data:creators,error:ce},{data:managerRow,error:me}]=await Promise.all([
    sb.from('teams').select('id,name,manager_id').eq('id',teamId).single(),
    sb.from('profiles').select('id,username,full_name,active,team_id,manager_id').eq('team_id',teamId).eq('role','creator').order('full_name'),
    sb.from('teams').select('manager_id,managers:manager_id(id,name,username,active,user_id,phone,email)').eq('id',teamId).maybeSingle()
  ]);
  if(te||ce) return toast((te||ce)?.message||'No se pudo cargar el equipo.');
  const m=managerRow?.managers||null; const ids=(creators||[]).map(c=>c.id);
  const [mr,pr,tr,trainRes]=await Promise.all([
    ids.length?sb.from('missions').select('id,title,description,type,target,week_start,week_end,assigned_to,published,created_at,created_by,created_by_role').in('assigned_to',ids).order('week_start',{ascending:false}).order('created_at',{ascending:false}):Promise.resolve({data:[],error:null}),
    ids.length?sb.from('mission_progress').select('mission_id,user_id,value,completed').in('user_id',ids):Promise.resolve({data:[],error:null}),
    team?.manager_id?sb.from('manager_tasks').select('id,title,description,due_at,assigned_at,completed,completed_at').eq('manager_id',team.manager_id).order('assigned_at',{ascending:false}):Promise.resolve({data:[],error:null}),
    sb.from('live_trainings').select('id,title,description,instructor_name,created_by,created_at,scheduled_at,started_at,ended_at,status').order('created_at',{ascending:false})
  ]);
  if(mr.error||pr.error||tr.error||trainRes.error) return toast((mr.error||pr.error||tr.error||trainRes.error)?.message||'No se pudo cargar el dashboard del equipo.');
  const missions=mr.data||[], progress=pr.data||[], tasks=tr.data||[], allTrainings=trainRes.data||[];
  const [audRes,partRes]=await Promise.all([
    allTrainings.length?sb.from('live_training_audience').select('training_id,target_type,target_id').in('training_id',allTrainings.map(t=>t.id)):Promise.resolve({data:[],error:null}),
    allTrainings.length?sb.from('live_training_participants').select('training_id,user_id,joined_at,left_at,duration_seconds').in('training_id',allTrainings.map(t=>t.id)):Promise.resolve({data:[],error:null})
  ]);
  const audience=audRes.data||[], participants=partRes.data||[];
  const teamTrainings=allTrainings.filter(t=>audience.some(a=>a.training_id===t.id && a.target_type==='team' && a.target_id===teamId) || (m?.user_id===t.created_by));
  const prog=new Map(progress.map(x=>[`${x.user_id}:${x.mission_id}`,x]));
  const pct=(mission,userId)=>{const x=prog.get(`${userId}:${mission.id}`);if(!x)return 0;if(mission.type==='checkbox')return x.completed?100:0;const target=Number(mission.target||0);return target>0?Math.min(100,Math.round(Number(x.value||0)/target*100)):0;};
  const monthKey=d=>{const dt=d?new Date(d):null;if(!dt||Number.isNaN(dt.getTime()))return 'Sin fecha';return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}`;};
  const monthLabel=k=>{if(k==='Sin fecha')return k;const [y,mo]=k.split('-');return new Date(Number(y),Number(mo)-1,1).toLocaleDateString('es-CO',{month:'long',year:'numeric'});};
  const monthMap={}; missions.forEach(x=>{(monthMap[monthKey(x.week_start||x.created_at)] ||= []).push(x);});
  const months=Object.keys(monthMap).sort().reverse();
  const monthHtml=months.length?months.map((mk,i)=>{
    const ms=monthMap[mk]; const completed=ms.filter(x=>pct(x,x.assigned_to)>=100).length; const byCreator=new Map();
    ms.forEach(x=>{const arr=byCreator.get(x.assigned_to)||[];arr.push(x);byCreator.set(x.assigned_to,arr);});
    const rows=(creators||[]).map(c=>{const cm=byCreator.get(c.id)||[]; const done=cm.filter(x=>pct(x,c.id)>=100).length; return `<div class="item"><div class="row"><div><b>${esc(c.full_name||c.username)}</b><div class="muted small">${cm.length?`${cm.length} misión${cm.length===1?'':'es'} asignada${cm.length===1?'':'s'} · ${done} completada${done===1?'':'s'}`:'Sin tareas asignadas este mes'}</div></div><span class="pill ${cm.length&&done===cm.length?'ok':''}">${cm.length?`${done}/${cm.length}`:'Sin tareas'}</span></div>${cm.length?`<div class="team-month-missions">${cm.map(x=>`<div class="item"><div class="row"><div><b>${esc(x.title)}</b><div class="muted small">${esc(x.week_start||'')} → ${esc(x.week_end||'')} · ${x.created_by_role==='manager'?'Asignada por manager':'Asignada desde administración'}</div></div><span class="pill ${pct(x,c.id)>=100?'ok':''}">${pct(x,c.id)}%</span></div></div>`).join('')}</div>`:''}</div>`;}).join('');
    return `<div class="item team-performance-month"><button type="button" class="team-dashboard-accordion" data-team-month="tm-${i}"><span>📅 ${esc(monthLabel(mk))}</span><span class="team-dashboard-chevron">›</span></button><div id="tm-${i}" class="hidden team-dashboard-panel"><div class="team-month-summary"><span>${ms.length} misiones</span><span>${completed} completadas</span><span>${Math.max(0,(creators||[]).filter(c=>!(byCreator.get(c.id)||[]).length).length)} sin tareas</span></div>${rows}</div></div>`;
  }).join(''):'<div class="item"><span class="muted small">Aún no hay historial de misiones para este equipo.</span></div>';
  const creatorHtml=(creators||[]).map(c=>{const cm=missions.filter(x=>x.assigned_to===c.id);return `<div class="item"><button type="button" class="team-dashboard-accordion" data-team-creator="tc-${c.id}"><span><b>${esc(c.full_name||c.username)}</b><small>@${esc(c.username)} · ${c.active?'Activo':'Inactivo'} · ${cm.length} misión${cm.length===1?'':'es'}</small></span><span class="team-dashboard-chevron">›</span></button><div id="tc-${c.id}" class="hidden team-dashboard-panel">${cm.length?cm.map(x=>`<div class="item"><div class="row"><div><b>${esc(x.title)}</b><div class="muted small">${esc(x.week_start||'')} → ${esc(x.week_end||'')}</div></div><span class="pill ${pct(x,c.id)>=100?'ok':''}">${pct(x,c.id)}%</span></div></div>`).join(''):'<div class="muted small">Este creador no tiene misiones registradas.</div>'}</div></div>`;}).join('') || '<div class="item"><span class="muted small">Este equipo no tiene creadores asignados.</span></div>';
  const taskHtml=tasks.length?tasks.map(t=>`<div class="item"><div class="row"><div><b>${esc(t.title)}</b>${t.description?`<div class="muted small">${esc(t.description)}</div>`:''}<div class="muted small">Asignada: ${formatDateTime(t.assigned_at)}${t.due_at?` · Vence: ${formatDateTime(t.due_at)}`:''}${t.completed_at?` · Lista: ${formatDateTime(t.completed_at)}`:''}</div></div><div class="inline"><span class="pill ${t.completed?'ok':''}">${t.completed?'✓ Lista':'Pendiente'}</span><button class="secondary small danger" data-delete-manager-task="${t.id}">Eliminar</button></div></div></div>`).join(''):'<div class="item"><span class="muted small">El manager no tiene tareas asignadas.</span></div>';
  const trainingHtml=teamTrainings.length?teamTrainings.map(t=>{const n=new Set(participants.filter(p=>p.training_id===t.id&&p.user_id!==t.created_by).map(p=>p.user_id)).size;return `<div class="item"><button type="button" class="team-dashboard-accordion" data-team-training="tt-${t.id}"><span><b>${esc(t.title)}</b><small>${esc(t.instructor_name||'Grayxon')} · ${formatDateTime(t.started_at||t.scheduled_at||t.created_at)} · ${n} participantes</small></span><span class="team-dashboard-chevron">›</span></button><div id="tt-${t.id}" class="hidden team-dashboard-panel"><div class="grid"><div class="item"><b>Estado</b><div class="muted small">${t.status==='live'?'EN VIVO':t.status==='scheduled'?'Programado':'Finalizado'}</div></div><div class="item"><b>Duración</b><div class="muted small">${liveTrainingDuration(t.started_at,t.ended_at)}</div></div><div class="item"><b>Instructor</b><div class="muted small">${esc(t.instructor_name||'Grayxon')}</div></div></div><button class="secondary small" data-view-live-history="${t.id}">Ver historial</button></div></div>`;}).join(''):'<div class="item"><span class="muted small">No hay entrenamientos dirigidos a este equipo.</span></div>';
  const el=document.createElement('div');el.className='modal-backdrop';
  el.innerHTML=`<div class="card modal team-dashboard-modal"><div class="row"><div><div class="eyebrow">DASHBOARD DEL EQUIPO</div><h2>${esc(team?.name||'Equipo')}</h2><p class="muted small">Manager: ${esc(m?.name||'Sin manager')}</p></div><button class="secondary" id="closeAdminTeam">Cerrar</button></div><div class="team-dashboard-stats"><div class="item"><b>${creators.length}</b><small>CREADORES</small></div><div class="item"><b>${missions.length}</b><small>MISIONES</small></div><div class="item"><b>${teamTrainings.length}</b><small>ENTRENAMIENTOS</small></div><div class="item"><b>${tasks.length}</b><small>TAREAS MANAGER</small></div></div><section class="team-dashboard-section"><button class="team-dashboard-section-head" data-team-section="team-creators"><span>👥 Creadores</span><span>›</span></button><div id="team-creators" class="team-dashboard-section-body hidden">${creatorHtml}</div></section><section class="team-dashboard-section"><button class="team-dashboard-section-head" data-team-section="team-trainings"><span>🎥 Entrenamientos</span><span>›</span></button><div id="team-trainings" class="team-dashboard-section-body hidden">${trainingHtml}</div></section><section class="team-dashboard-section"><div class="team-dashboard-section-head static"><span>📋 Tareas del manager</span><span class="inline"><button class="primary small" id="teamAssignTask">+ Asignar tarea</button><span>${tasks.length}</span></span></div><div class="team-dashboard-section-body">${taskHtml}</div></section><section class="team-dashboard-section"><button class="team-dashboard-section-head" data-team-section="team-performance"><span>📊 Desempeño</span><span>›</span></button><div id="team-performance" class="team-dashboard-section-body hidden"><p class="muted small">Selecciona un mes para revisar lo que el manager hizo con cada creador, las misiones asignadas y quienes quedaron sin tareas.</p>${monthHtml}</div></section></div>`;
  document.body.appendChild(el);
  $('#closeAdminTeam').onclick=()=>el.remove();
  el.querySelectorAll('[data-team-section]').forEach(b=>b.onclick=()=>{const p=$('#'+b.dataset.teamSection);if(!p)return;p.classList.toggle('hidden');b.classList.toggle('open');});
  el.querySelectorAll('[data-team-month]').forEach(b=>b.onclick=()=>{const p=$('#'+b.dataset.teamMonth);if(p)p.classList.toggle('hidden');b.classList.toggle('open');});
  el.querySelectorAll('[data-team-creator]').forEach(b=>b.onclick=()=>{const p=$('#'+b.dataset.teamCreator);if(p)p.classList.toggle('hidden');b.classList.toggle('open');});
  el.querySelectorAll('[data-team-training]').forEach(b=>b.onclick=()=>{const p=$('#'+b.dataset.teamTraining);if(p)p.classList.toggle('hidden');b.classList.toggle('open');});
  el.querySelectorAll('[data-delete-manager-task]').forEach(b=>b.onclick=()=>deleteManagerTask(b.dataset.deleteManagerTask));
  $('#teamAssignTask').onclick=()=>{el.remove();managerTaskModal();};
  el.querySelectorAll('[data-view-live-history]').forEach(b=>b.onclick=()=>openLiveTrainingHistory(b.dataset.viewLiveHistory));
}

async function deleteManagerTask(id){
  if(!confirm('¿Eliminar esta tarea del manager?')) return;
  const {error}=await sb.rpc('delete_manager_task',{p_task_id:id});
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
  if(!$('#grayxon-formation-group-styles')){const fs=document.createElement('style');fs.id='grayxon-formation-group-styles';fs.textContent=`
    .formation-page{display:grid;gap:0}.formation-groups{display:grid;gap:22px}.formation-group{display:grid;gap:10px}.formation-group-head{display:flex;align-items:end;justify-content:space-between;gap:12px}.formation-group-head h2{margin:4px 0 0;font-size:22px}.formation-group-count{min-width:32px;height:32px;padding:0 9px;border-radius:999px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.035);font-size:12px;font-weight:900}.formation-group-list{display:grid;gap:9px}.formation-module-accordion{overflow:hidden;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:rgba(255,255,255,.02)}.formation-module-toggle{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:12px;text-align:left;border:0;background:transparent;color:#fff;padding:15px 16px;cursor:pointer}.formation-module-toggle:hover{background:rgba(255,255,255,.025)}.formation-module-number{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;border:1px solid rgba(37,244,238,.18);background:rgba(37,244,238,.04);font-size:11px;font-weight:900;color:#b9c0ca}.formation-module-copy{min-width:0}.formation-module-copy strong{display:block;font-size:15px}.formation-module-copy small{display:block;margin-top:4px;color:#858c98;line-height:1.4}.formation-module-meta{display:flex;align-items:center;gap:10px;color:#aeb5bf}.formation-module-chevron{font-size:22px;transition:transform .18s ease}.formation-module-toggle.is-open .formation-module-chevron{transform:rotate(90deg)}.formation-module-panel{border-top:1px solid rgba(255,255,255,.07);padding:14px 16px 16px}.formation-module-panel.hidden{display:none!important}.formation-module-progress{height:5px;border-radius:999px;background:rgba(255,255,255,.07);overflow:hidden}.formation-module-progress span{display:block;height:100%;background:linear-gradient(90deg,#25f4ee,#fe2c55)}.formation-module-progress-label{margin-top:7px;color:#858c98;font-size:11px}.formation-lessons-list{display:grid;gap:7px;margin-top:12px}.formation-lessons-list .lesson{display:flex;align-items:center;gap:8px}.formation-lessons-list .lesson button{flex:1;min-width:0}.formation-empty-group{padding:16px;border:1px dashed rgba(255,255,255,.10);border-radius:14px;color:#858c98;font-size:13px}.lesson-view.hidden{display:none!important}.lesson-view{margin-top:22px}.formation-module-complete .formation-module-number{border-color:rgba(110,231,183,.25);color:#6ee7b7}@media(max-width:800px){.formation-module-toggle{grid-template-columns:36px minmax(0,1fr) auto;padding:13px}.formation-module-number{width:34px;height:34px}.formation-module-copy strong{font-size:14px}.formation-module-copy small{font-size:11px}}`;document.head.appendChild(fs);}
}
function liveTrainingDuration(start,end){if(!start)return '—';const seconds=Math.max(0,Math.floor(((end?new Date(end):new Date()).getTime()-new Date(start).getTime())/1000));const h=Math.floor(seconds/3600),m=Math.floor((seconds%3600)/60),s=seconds%60;if(h)return `${h}h ${String(m).padStart(2,'0')}m`;if(m)return `${m}m ${String(s).padStart(2,'0')}s`;return `${s}s`;}
async function liveTrainingManagementData(){
  const {data:rawTrainings,error}=await sb.from('live_trainings').select('id,title,description,scheduled_at,room_name,status,created_by,instructor_name,created_at,started_at,ended_at').order('created_at',{ascending:false});
  if(error)throw error;
  // RLS ya determina qué entrenamientos puede consultar cada rol.
  // El manager debe ver tanto los que creó como los que Admin le asignó.
  const trainings=rawTrainings||[];
  const ids=trainings.map(t=>t.id);let participants=[],audience=[];
  if(ids.length){
    const [{data:parts,error:pe},{data:aud,error:ae}]=await Promise.all([
      sb.from('live_training_participants').select('id,training_id,user_id,joined_at,left_at,duration_seconds').in('training_id',ids).order('joined_at',{ascending:true}),
      sb.from('live_training_audience').select('id,training_id,target_type,target_id').in('training_id',ids)
    ]);
    if(pe)throw pe;if(ae)throw ae;participants=parts||[];audience=aud||[];
  }
  const userIds=[...new Set(participants.map(x=>x.user_id))];let profiles=[];
  if(userIds.length){const {data,error:ue}=await sb.from('profiles').select('id,username,full_name').in('id',userIds);if(ue)throw ue;profiles=data||[];}
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
        const {error:ae}=await sb.from('live_training_audience').insert(rows);if(ae){await sb.from('live_trainings').delete().eq('id',created.id);throw ae;}
      } else if(profile?.role==='manager'){
        // Los entrenamientos creados por un manager deben quedar dirigidos
        // explícitamente a los creadores de su(s) equipo(s). Antes faltaba
        // esta fila de audiencia y por eso Mi espacio podía no detectar el LIVE.
        const {data:me}=await sb.from('managers').select('id').eq('user_id',session.user.id).eq('active',true).maybeSingle();
        const {data:teams}=me ? await sb.from('teams').select('id').eq('manager_id',me.id) : {data:[]};
        const rows=(teams||[]).map(t=>({training_id:created.id,target_type:'team',target_id:t.id}));
        if(!rows.length)throw new Error('Tu manager no tiene un equipo asignado para este entrenamiento.');
        const {error:ae}=await sb.from('live_training_audience').insert(rows);if(ae){await sb.from('live_trainings').delete().eq('id',created.id);throw ae;}
      }
      close();toast('Entrenamiento creado ✓');render();
    }catch(e){
      $('#ltErr').textContent=e?.message||'No se pudo crear el entrenamiento.';btn.disabled=false;
    }
  };
}

async function ensureLiveTrainingAudience(training){
  if(!training?.id) return {data:[], error:new Error('Entrenamiento inválido.')};
  const {data:existing,error:readError}=await sb.from('live_training_audience')
    .select('id,target_type,target_id').eq('training_id',training.id);
  if(readError) return {data:[], error:readError};
  if((existing||[]).length) return {data:existing, error:null};

  // Legacy repair: V33.6 could leave an orphan LIVE without audience when an
  // older/cached build created it. Repair it at the moment it is started.
  const {data:owner,error:ownerError}=await sb.from('profiles')
    .select('id,role').eq('id',training.created_by).maybeSingle();
  if(ownerError) return {data:[], error:ownerError};

  let rows=[];
  if(owner?.role==='admin'){
    // Historical admin default: all creators.
    rows=[{training_id:training.id,target_type:'all_creators',target_id:null}];
  }else if(owner?.role==='manager'){
    const {data:manager,error:managerError}=await sb.from('managers')
      .select('id').eq('user_id',training.created_by).eq('active',true).maybeSingle();
    if(managerError) return {data:[], error:managerError};
    const {data:teams,error:teamsError}=manager
      ? await sb.from('teams').select('id').eq('manager_id',manager.id)
      : {data:[],error:null};
    if(teamsError) return {data:[], error:teamsError};
    rows=(teams||[]).map(t=>({training_id:training.id,target_type:'team',target_id:t.id}));
  }

  if(!rows.length) return {data:[], error:new Error('Este entrenamiento no tiene una audiencia válida configurada.')};
  const {data:inserted,error:insertError}=await sb.from('live_training_audience').insert(rows).select('id,target_type,target_id');
  if(insertError) return {data:[], error:insertError};
  return {data:inserted||rows,error:null};
}

async function notifyLiveTrainingAudience(training){
  const diag = [];
  if(!training?.id){
    showLiveNotificationDiagnostic('No se pudo iniciar el diagnóstico', ['Falta training.id.']);
    return {ok:false,stage:'input',error:'Falta training.id'};
  }
  try{
    diag.push(`Entrenamiento: ${training.title||'—'}`);
    diag.push(`ID: ${training.id}`);
    diag.push('1. LIVE confirmado por la base de datos: OK');

    const {data:aud,error:ae}=await ensureLiveTrainingAudience(training);
    if(ae){
      diag.push(`2. Audiencia: ERROR · ${ae.message||ae.code||ae}`);
      showLiveNotificationDiagnostic('Falló la audiencia del LIVE', diag);
      console.warn('No se pudo asegurar la audiencia del LIVE:',ae);
      return {ok:false,stage:'audience',error:ae.message||String(ae)};
    }
    const rows=aud||[];
    diag.push(`2. Filas de audiencia: ${rows.length}`);
    diag.push(rows.length ? `   Tipos: ${rows.map(a=>a.target_type).join(', ')}` : '   ⚠️ Sin filas de audiencia');

    // Los destinatarios se resuelven según el tipo de audiencia seleccionado.
    // Una audiencia "manager" notifica a la cuenta de ese manager, no a sus creadores.
    const creatorIds=new Set();
    const managerUserIds=new Set();

    if(rows.some(a=>a.target_type==='all_creators')){
      const {data:creators,error}=await sb.from('profiles').select('id,username').eq('role','creator').eq('active',true);
      if(error){
        diag.push(`3. Buscar creadores: ERROR · ${error.message}`);
        showLiveNotificationDiagnostic('Falló la búsqueda de creadores', diag);
        return {ok:false,stage:'creators',error:error.message};
      }
      (creators||[]).forEach(c=>creatorIds.add(c.id));
      diag.push(`3. Creadores activos encontrados: ${creators?.length||0}`);
      if(creators?.length) diag.push(`   Usuarios: ${creators.slice(0,8).map(c=>c.username||c.id).join(', ')}`);
    }

    const teamIds=rows.filter(a=>a.target_type==='team'&&a.target_id).map(a=>a.target_id);
    if(teamIds.length){
      const {data:creators,error}=await sb.from('profiles').select('id,username').eq('role','creator').eq('active',true).in('team_id',teamIds);
      if(error){
        diag.push(`3. Buscar creadores por equipo: ERROR · ${error.message}`);
      } else {
        (creators||[]).forEach(c=>creatorIds.add(c.id));
        diag.push(`3. Creadores por equipo: ${creators?.length||0}`);
      }
    }

    const directIds=rows.filter(a=>a.target_type==='creator'&&a.target_id).map(a=>a.target_id);
    directIds.forEach(id=>creatorIds.add(id));
    if(directIds.length) diag.push(`3. Creadores directos: ${directIds.length}`);

    const selectedManagerIds=rows.filter(a=>a.target_type==='manager'&&a.target_id).map(a=>a.target_id);
    const allManagers=rows.some(a=>a.target_type==='all_managers');
    if(selectedManagerIds.length || allManagers){
      let managerQuery=sb.from('managers').select('id,user_id,name,active').eq('active',true);
      if(selectedManagerIds.length && !allManagers) managerQuery=managerQuery.in('id',selectedManagerIds);
      const {data:managers,error}=await managerQuery;
      if(error){
        diag.push(`3. Buscar cuentas manager: ERROR · ${error.message}`);
        showLiveNotificationDiagnostic('Falló la búsqueda de managers', diag);
        return {ok:false,stage:'managers',error:error.message};
      }
      (managers||[]).filter(m=>m.user_id).forEach(m=>managerUserIds.add(m.user_id));
      diag.push(`3. Managers destinatarios encontrados: ${managerUserIds.size}`);
      if(managers?.length && !allManagers){
        diag.push(`   Selección: ${(managers||[]).map(m=>m.name||m.id).join(', ')}`);
      }
    }

    const recipientIds=new Set([...creatorIds,...managerUserIds]);
    if(!recipientIds.size){
      diag.push('4. Notificaciones: NO SE EJECUTARON · 0 destinatarios para la audiencia seleccionada');
      showLiveNotificationDiagnostic('LIVE iniciado, pero no hay destinatarios', diag);
      return {ok:false,stage:'recipients',error:'0 destinatarios'};
    }

    const message=`El entrenamiento “${training.title||'Grayxon'}” ya está EN VIVO. Entra ahora desde Grayxon.`;
    diag.push(`4. Intentando crear ${recipientIds.size} notificación(es)...`);
    const results=await Promise.all([...recipientIds].map(uid=>notifyLiveTrainingCreator(uid,'🔴 Entrenamiento EN VIVO',message,training.id)));
    const failed=results.filter(r=>!r?.ok);
    const okCount=results.filter(r=>r?.ok).length;
    diag.push(`5. Resultado: ${okCount}/${results.length} creada(s)`);
    if(failed.length){
      failed.slice(0,5).forEach((r,i)=>diag.push(`   ❌ Error ${i+1}: ${r.error||'error desconocido'}`));
      showLiveNotificationDiagnostic('El LIVE arrancó, pero falló la notificación', diag);
      console.warn('Algunos avisos de LIVE no se pudieron crear:',failed);
      return {ok:false,stage:'notifications',created:okCount,total:results.length,failed};
    }
    diag.push('   ✅ Notificación(es) creada(s) correctamente.');
    showLiveNotificationDiagnostic('Notificación LIVE creada', diag);
    return {ok:true,stage:'notifications',created:okCount,total:results.length};
  }catch(e){
    diag.push(`❌ ERROR INESPERADO: ${e?.message||e}`);
    showLiveNotificationDiagnostic('Error inesperado al crear avisos', diag);
    console.warn('No se pudieron enviar avisos del LIVE:',e);
    return {ok:false,stage:'exception',error:e?.message||String(e)};
  }
}
async function deleteLiveTraining(id){
  if(profile?.role!=='admin'){toast('Solo un administrador puede eliminar el historial de entrenamientos.');return;}
  if(!confirm('¿Eliminar este entrenamiento del historial? Esta acción no se puede deshacer.'))return;
  const {error}=await sb.from('live_trainings').delete().eq('id',id);
  if(error){toast(error.message);return;}
  toast('Entrenamiento eliminado ✓');render();
}
async function openLiveTrainingHistory(id){
  const {data:t,error}=await sb.from('live_trainings').select('id,title,description,instructor_name,created_by,created_at,scheduled_at,started_at,ended_at,status').eq('id',id).maybeSingle();if(error||!t)return toast(error?.message||'No se encontró el entrenamiento.');const [{data:rows,error:pe},{data:audience,error:ae}]=await Promise.all([sb.from('live_training_participants').select('id,user_id,joined_at,left_at,duration_seconds').eq('training_id',id).order('joined_at',{ascending:true}),sb.from('live_training_audience').select('target_type,target_id').eq('training_id',id)]);if(pe)return toast(pe.message);if(ae)return toast(ae.message);const ids=[...new Set((rows||[]).map(x=>x.user_id))];const {data:ps}=ids.length?await sb.from('profiles').select('id,username,full_name').in('id',ids):{data:[]};const pm=new Map((ps||[]).map(p=>[p.id,p]));const attendees=[...new Map((rows||[]).filter(x=>x.user_id!==t.created_by).map(x=>[x.user_id,x])).values()];const el=document.createElement('div');el.className='modal-backdrop';el.innerHTML=`<div class="card modal" style="max-width:780px"><div class="row"><div><div class="eyebrow">HISTORIAL</div><h2>${esc(t.title)}</h2></div><button class="secondary" id="closeLiveHistory">Cerrar</button></div><div class="hr"></div><div class="grid"><div class="item"><b>Fecha</b><div class="muted small">${formatDateTime(t.started_at||t.scheduled_at||t.created_at)}</div></div><div class="item"><b>Instructor</b><div class="muted small">${esc(t.instructor_name)}</div></div><div class="item"><b>Duración</b><div class="muted small">${liveTrainingDuration(t.started_at,t.ended_at)}</div></div><div class="item"><b>Participantes</b><div class="muted small">${attendees.length}</div></div><div class="item"><b>Público</b><div class="muted small">${audience.some(x=>x.target_type==='all_creators')?'Todos los creadores':audience.some(x=>x.target_type==='all_managers')?'Todos los managers':`${audience.length} segmentación${audience.length===1?'':'es'}`}</div></div></div><h3 style="margin-top:20px">Participantes</h3><div class="list">${attendees.length?attendees.map(x=>{const p=pm.get(x.user_id)||{};return `<div class="live-training-participant"><span><b>${esc(p.full_name||p.username||'Usuario')}</b><span class="muted"> · @${esc(p.username||'—')}</span></span><span class="muted">${liveTrainingDuration(x.joined_at,x.left_at)}</span></div>`}).join(''):'<div class="item"><p class="muted small" style="margin:0">No hay participantes registrados.</p></div>'}</div></div>`;document.body.appendChild(el);$('#closeLiveHistory').onclick=()=>el.remove();
}
async function managerCanManageAssignedTraining(id){
  if(profile?.role!=='manager'||!session?.user?.id)return false;
  const [{data:me},{data:aud}]=await Promise.all([
    sb.from('managers').select('id').eq('user_id',session.user.id).eq('active',true).maybeSingle(),
    sb.from('live_training_audience').select('target_type,target_id').eq('training_id',id)
  ]);
  if(!me)return false;
  return (aud||[]).some(a=>a.target_type==='all_managers'||(a.target_type==='manager'&&a.target_id===me.id));
}
async function rescheduleLiveTraining(id){
  if(!id)return;
  const t=(await sb.from('live_trainings').select('id,title,scheduled_at,status,created_by').eq('id',id).maybeSingle()).data;
  if(!t||t.status!=='scheduled')return toast('Solo puedes reprogramar entrenamientos programados.');
  const own=profile?.role==='manager'&&t.created_by===session?.user?.id;
  const assigned=await managerCanManageAssignedTraining(id);
  const can=profile?.role==='admin'||own||assigned;
  if(!can)return toast('No tienes permiso para reprogramar este entrenamiento.');
  const current=t.scheduled_at?new Date(t.scheduled_at):new Date();
  const localValue=new Date(current.getTime()-current.getTimezoneOffset()*60000).toISOString().slice(0,16);
  const value=window.prompt('Nueva fecha y hora (AAAA-MM-DDTHH:MM):',localValue);
  if(!value)return;
  const dt=new Date(value);
  if(Number.isNaN(dt.getTime()))return toast('La fecha indicada no es válida.');
  const {error}=await sb.from('live_trainings').update({scheduled_at:dt.toISOString()}).eq('id',id).eq('status','scheduled');
  if(error)return toast(error.message);
  toast('Entrenamiento reprogramado ✓');render();
}
async function cancelLiveTraining(id){
  if(!id)return;
  const {data:t}=await sb.from('live_trainings').select('id,title,status,created_by').eq('id',id).maybeSingle();
  if(!t||t.status!=='scheduled')return toast('Solo puedes cancelar entrenamientos programados.');
  const own=profile?.role==='manager'&&t.created_by===session?.user?.id;
  const assigned=await managerCanManageAssignedTraining(id);
  const can=profile?.role==='admin'||own||assigned;
  if(!can)return toast('No tienes permiso para cancelar este entrenamiento.');
  if(!confirm(`¿Cancelar “${t.title}”? El entrenamiento quedará en el historial como cancelado.`))return;
  const {error}=await sb.from('live_trainings').update({status:'cancelled'}).eq('id',id).eq('status','scheduled');
  if(error)return toast(error.message);
  toast('Entrenamiento cancelado ✓');render();
}
async function startLiveTraining(id){
  if(!id)return;
  const {data:t}=await sb.from('live_trainings').select('id,title,status,created_by').eq('id',id).maybeSingle();
  if(!t||t.status!=='scheduled')return toast('Este entrenamiento ya no está programado.');
  const can=profile?.role==='admin'||(profile?.role==='manager'&&t.created_by===session?.user?.id);
  if(!can)return toast('Solo el instructor o un administrador puede iniciar este entrenamiento.');

  // Before going LIVE, repair any legacy training that has no audience rows.
  const {error:audienceError}=await ensureLiveTrainingAudience(t);
  if(audienceError){toast(audienceError.message||'Este entrenamiento no tiene una audiencia válida.');return;}

  const {data,error}=await sb.from('live_trainings').update({status:'live',started_at:new Date().toISOString(),ended_at:null}).eq('id',id).eq('status','scheduled').select('id,title,description,room_name,created_by,instructor_name,scheduled_at,status,started_at').single();
  if(error){toast(error.code==='23505'?'Ya hay otro entrenamiento EN VIVO. Finalízalo antes de iniciar uno nuevo.':error.message);return;}
  currentLiveTraining=data;
  pendingLiveTrainingAutoStart=data;
  // Create the in-app notifications only after the database confirms LIVE.
  const notificationResult = await notifyLiveTrainingAudience(data);
  if(notificationResult?.ok) toast('Entrenamiento EN VIVO + aviso enviado ✓');
  else if(notificationResult?.stage) toast('Entrenamiento EN VIVO. Revisa el diagnóstico.');
  nav('live-training');
}
async function finishLiveTraining(id){if(!id)return;const {data:t}=await sb.from('live_trainings').select('id,title,status,created_by').eq('id',id).maybeSingle();if(!t||t.status!=='live')return toast('Este entrenamiento no está EN VIVO.');const can=profile?.role==='admin'||(profile?.role==='manager'&&t.created_by===session?.user?.id);if(!can)return toast('No tienes permiso para finalizar este entrenamiento.');if(!confirm('¿Finalizar este entrenamiento?'))return;const endedAt=new Date().toISOString();const {data,error}=await sb.from('live_trainings').update({status:'finished',ended_at:endedAt}).eq('id',id).eq('status','live').select('id,title').single();if(error){toast(error.message);return;}await sb.from('live_training_participants').update({left_at:endedAt}).eq('training_id',id).is('left_at',null);toast(`“${data?.title||'Entrenamiento'}” finalizado ✓`);render();}
async function deleteLiveTraining(id){
  if(profile?.role!=='admin'){toast('Solo un administrador puede eliminar el historial de entrenamientos.');return;}
  if(!confirm('¿Eliminar este entrenamiento? Esta acción no se puede deshacer.'))return;
  const {error}=await sb.from('live_trainings').delete().eq('id',id);
  if(error){toast(error.message);return;}
  toast('Entrenamiento eliminado ✓');render();
}
async function openLiveTrainingHistory(id){
  const {data:t,error}=await sb.from('live_trainings').select('id,title,description,instructor_name,created_by,created_at,scheduled_at,started_at,ended_at,status').eq('id',id).maybeSingle();
  if(error||!t)return toast(error?.message||'No se encontró el entrenamiento.');
  const [{data:rows,error:pe},{data:audience,error:ae}]=await Promise.all([sb.from('live_training_participants').select('id,user_id,joined_at,left_at,duration_seconds').eq('training_id',id).order('joined_at',{ascending:true}),sb.from('live_training_audience').select('target_type,target_id').eq('training_id',id)]);
  if(pe)return toast(pe.message);if(ae)return toast(ae.message);
  const ids=[...new Set((rows||[]).map(x=>x.user_id))];const {data:ps}=ids.length?await sb.from('profiles').select('id,username,full_name').in('id',ids):{data:[]};const pm=new Map((ps||[]).map(p=>[p.id,p]));
  const attendees=[...new Map((rows||[]).filter(x=>x.user_id!==t.created_by).map(x=>[x.user_id,x])).values()];
  const el=document.createElement('div');el.className='modal-backdrop';
  el.innerHTML=`<div class="card modal" style="max-width:780px"><div class="row"><div><div class="eyebrow">HISTORIAL</div><h2>${esc(t.title)}</h2></div><button class="secondary" id="closeLiveHistory">Cerrar</button></div><div class="hr"></div><div class="grid"><div class="item"><b>Fecha</b><div class="muted small">${formatDateTime(t.started_at||t.scheduled_at||t.created_at)}</div></div><div class="item"><b>Instructor</b><div class="muted small">${esc(t.instructor_name)}</div></div><div class="item"><b>Duración</b><div class="muted small">${t.status==='cancelled'?'Cancelado':liveTrainingDuration(t.started_at,t.ended_at)}</div></div><div class="item"><b>Participantes</b><div class="muted small">${attendees.length}</div></div><div class="item"><b>Público</b><div class="muted small">${audience.some(x=>x.target_type==='all_creators')?'Todos los creadores':audience.some(x=>x.target_type==='all_managers')?'Todos los managers':`${audience.length} segmentación${audience.length===1?'':'es'}`}</div></div></div><h3 style="margin-top:20px">Participantes</h3><div class="list">${attendees.length?attendees.map(x=>{const p=pm.get(x.user_id)||{};return `<div class="live-training-participant"><span><b>${esc(p.full_name||p.username||'Usuario')}</b><span class="muted"> · @${esc(p.username||'—')}</span></span><span class="muted">${liveTrainingDuration(x.joined_at,x.left_at)}</span></div>`}).join(''):'<div class="item"><p class="muted small" style="margin:0">No hay participantes registrados.</p></div>'}</div></div>`;
  document.body.appendChild(el);
  const closeHistory=()=>{el.remove();};
  $('#closeLiveHistory')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();closeHistory();});
  el.addEventListener('click',e=>{if(e.target===el)closeHistory();});
}
async function openScheduledLiveTraining(id){
  const {data:t,error}=await sb.from('live_trainings').select('id,title,description,instructor_name,scheduled_at,status').eq('id',id).maybeSingle();
  if(error||!t)return toast(error?.message||'No se encontró el entrenamiento.');
  const el=document.createElement('div');el.className='modal-backdrop';
  el.innerHTML=`<div class="card modal" style="max-width:680px"><div class="row"><div><div class="eyebrow">ENTRENAMIENTO PROGRAMADO</div><h2>${esc(t.title)}</h2></div><button class="secondary" id="closeScheduledTraining">Cerrar</button></div><div class="hr"></div><div class="grid"><div class="item"><b>Fecha</b><div class="muted small">${formatDateTime(t.scheduled_at)}</div></div><div class="item"><b>Instructor</b><div class="muted small">${esc(t.instructor_name||'Grayxon')}</div></div></div><div class="item" style="margin-top:16px"><b>Descripción</b><div class="muted small" style="margin-top:6px;line-height:1.6">${esc(t.description||'Sin descripción.')}</div></div></div>`;
  document.body.appendChild(el);
  const close=()=>el.remove();
  $('#closeScheduledTraining')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();close();});
  el.addEventListener('click',e=>{if(e.target===el)close();});
}

async function liveTrainingManagementTpl(role='manager',collapsible=false){
  ensureLiveTrainingManagementStyles();
  let data;try{data=await liveTrainingManagementData();}catch(e){return `<div class="card"><h2>Entrenamientos</h2><div class="error">${esc(e?.message||'No se pudo cargar los entrenamientos.')}</div></div>`;}
  const {trainings,participants,audience}=data;
  const active=trainings.find(t=>t.status==='live');
  const scheduled=trainings.filter(t=>t.status==='scheduled' && !t.started_at && !t.ended_at);
  const finished=trainings.filter(t=>t.status==='finished' || (t.status!=='scheduled' && !!t.ended_at && t.status!=='cancelled'));
  const cancelled=trainings.filter(t=>t.status==='cancelled');
  const countParticipants=t=>new Set(participants.filter(p=>p.training_id===t.id&&p.user_id!==t.created_by).map(p=>p.user_id)).size;
  const audienceFor=t=>audience.filter(a=>a.training_id===t.id);
  const audienceLabel=t=>{const a=audienceFor(t);if(!a.length)return 'Sin público definido';if(a.some(x=>x.target_type==='all_creators'))return 'Todos los creadores';if(a.some(x=>x.target_type==='all_managers'))return 'Todos los managers';return `${a.length} segmentación${a.length===1?'':'es'} configurada${a.length===1?'':'s'}`;};
  const managerIdForCurrentUser=role==='manager' ? (await sb.from('managers').select('id').eq('user_id',session?.user?.id).maybeSingle()).data?.id : null;
  const canOwn=t=>role==='admin'||(role==='manager'&&t.created_by===session?.user?.id);
  const canManageScheduled=t=>role==='admin'||canOwn(t)||(role==='manager'&&t.status==='scheduled'&&audience.some(a=>a.training_id===t.id&&(a.target_type==='all_managers'||(a.target_type==='manager'&&a.target_id===managerIdForCurrentUser))));
  const canViewAssigned=t=>role==='manager' && !canOwn(t);
  const scheduledHtml=scheduled.length?scheduled.map(t=>`<div class="live-training-row"><div class="live-training-row-main"><b>${esc(t.title)}</b><div class="muted small">${esc(t.instructor_name)} · ${t.scheduled_at?formatDateTime(t.scheduled_at):'Sin fecha programada'} · ${esc(audienceLabel(t))}${canViewAssigned(t)?' · ASIGNADO A TI':''}</div></div><div class="live-training-row-actions">${canManageScheduled(t)?`${canViewAssigned(t)?`<button class="secondary small" data-view-scheduled-training="${t.id}">Ver</button>`:''}${canOwn(t)?`<button class="primary small" data-start-live-training="${t.id}">▶ Iniciar entrenamiento</button>`:''}<button class="secondary small" data-reschedule-live-training="${t.id}">↗ Reprogramar</button><button class="secondary small danger" data-cancel-live-training="${t.id}">Cancelar</button>${role==='admin'?`<button class="secondary small danger" data-delete-live-training="${t.id}">Eliminar</button>`:''}`:`${canViewAssigned(t)?'<span class="pill">Asignado a ti</span>':''}`}</div></div>`).join(''):'<div class="item"><p class="muted small" style="margin:0">No hay entrenamientos programados.</p></div>';
  const historyHtml=finished.length?finished.map(t=>`<div class="live-training-row"><div class="live-training-row-main"><b>${esc(t.title)}</b><div class="muted small">${formatDateTime(t.started_at||t.created_at)} · ${esc(t.instructor_name)} · ${liveTrainingDuration(t.started_at,t.ended_at)} · ${countParticipants(t)} participantes · ${esc(audienceLabel(t))}</div></div><div class="live-training-row-actions"><button class="secondary small" data-view-live-history="${t.id}">Ver historial</button>${role==='admin'?`<button class="secondary small danger" data-delete-live-training="${t.id}">Eliminar</button>`:''}</div></div>`).join(''):'<div class="item"><p class="muted small" style="margin:0">Todavía no hay entrenamientos finalizados.</p></div>';
  const activeHtml=active?`<div class="live-training-row"><div class="live-training-row-main"><b>${esc(active.title)}</b><div class="muted small">EN VIVO · ${esc(active.instructor_name)} · Inició ${formatDateTime(active.started_at)} · ${countParticipants(active)} participantes · ${esc(audienceLabel(active))}${canViewAssigned(active)?' · ASIGNADO A TI':''}</div></div><div class="live-training-row-actions"><button class="primary small" data-open-live-training="${active.id}">🎥 Abrir entrenamiento</button>${canOwn(active)?`<button class="secondary small danger" data-finish-live-training="${active.id}">■ Finalizar</button>`:''}</div></div>`:'<div class="item"><p class="muted small" style="margin:0">No hay ningún entrenamiento EN VIVO.</p></div>';
  const cancelledHtml=cancelled.length?cancelled.slice(0,20).map(t=>`<div class="live-training-row"><div class="live-training-row-main"><b>${esc(t.title)}</b><div class="muted small">CANCELADO · ${formatDateTime(t.scheduled_at||t.created_at)} · ${esc(t.instructor_name)}</div></div><div class="live-training-row-actions">${role==='admin'?`<button class="secondary small danger" data-delete-live-training="${t.id}">Eliminar</button>`:''}</div></div>`).join(''):'';
  const content=`<div class="live-training-management"><div class="live-training-management-head"><div><div class="eyebrow">GRAYXON · ENTRENAMIENTOS</div><h2>Entrenamientos en vivo</h2><p class="muted small">Aquí se gestionan únicamente los entrenamientos LIVE. La Formación contiene los módulos y lecciones.</p></div><div class="live-training-management-actions"><button class="primary" id="newLiveTraining">+ Crear entrenamiento</button></div></div><div class="live-training-management-grid"><div class="live-training-stat"><strong>${active?'1':'0'}</strong><span>EN VIVO</span></div><div class="live-training-stat"><strong>${scheduled.length}</strong><span>PROGRAMADOS</span></div><div class="live-training-stat"><strong>${finished.length}</strong><span>FINALIZADOS</span></div></div><div><h3>Entrenamiento actual / próximos</h3><div class="list">${activeHtml}${scheduledHtml}</div></div><div style="margin-top:18px"><h3>Historial de entrenamientos</h3><div class="list">${historyHtml}</div></div>${cancelledHtml?`<div style="margin-top:18px"><h3>Cancelados</h3><div class="list">${cancelledHtml}</div></div>`:''}</div>`;
  if(!collapsible)return `<div class="card live-training-management">${content}</div>`;
  return `<div class="card grayxon-manager-accordion"><button type="button" class="grayxon-manager-accordion-toggle" id="toggleManagerTraining" aria-expanded="false"><span class="grayxon-manager-accordion-toggle-main"><span class="grayxon-manager-accordion-icon">🎥</span><span class="grayxon-manager-accordion-copy"><strong>Entrenamientos en vivo</strong><small>Crea, consulta y gestiona entrenamientos LIVE de tu equipo.</small></span></span><span class="grayxon-manager-accordion-meta"><b>${active?'EN VIVO':`${scheduled.length} programados`}</b><span class="grayxon-manager-accordion-chevron">›</span></span></button><div id="managerTrainingPanel" class="grayxon-manager-accordion-panel hidden">${content}</div></div>`;
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

  const adminSections = [
    ['home','🏠','Inicio del sitio','Edita el contenido principal de la web.'],
    ['benefits','✨','Beneficios y requisitos','Actualiza beneficios, requisitos e imagen destacada.'],
    ['users','👥','Todos los usuarios','Administra roles, accesos y cuentas.'],
    ['creators','🎥','Creadores','Crea cuentas y administra creadores.'],
    ['teams','🧩','Equipos y managers','Gestiona equipos y responsables.'],
    ['manager_tasks','📋','Asignar tareas','Organiza las tareas de los managers.'],
    ['live_trainings','📡','Entrenamientos en vivo','Gestiona las sesiones LIVE de la agencia.'],
    ['formation','🎓','Formación','Administra módulos, lecciones y videos.']
  ];
  let body = '';
  if (adminView === 'dashboard') {
    body = `<div class="admin-dashboard">
      <section class="admin-dashboard-hero"><div><div class="eyebrow">GRAYXON GROUP · ADMINISTRACIÓN</div><h1>Panel de administración</h1><p class="muted">Gestiona la agencia desde un solo lugar.</p></div><div class="admin-dashboard-hero-actions"><span class="pill ok">Sesión de administrador</span><button id="adminLogout" class="secondary">Cerrar sesión</button></div></section>
      <div class="admin-dashboard-grid">${adminSections.map(([id,icon,title,desc])=>`<button type="button" class="admin-dashboard-card" data-admin="${id}"><span class="admin-dashboard-card-icon">${icon}</span><span class="admin-dashboard-card-copy"><strong>${title}</strong><small>${desc}</small></span><span class="admin-dashboard-card-arrow">›</span></button>`).join('')}${gxAnnouncementDashboardCard()}</div>
    </div>`;
  } else {
    if (adminView === 'home') body = adminHome(c.home);
    else if (adminView === 'benefits') body = adminBenefits(c.benefits);
    else if (adminView === 'creators') body = await adminCreators();
    else if (adminView === 'users') body = await adminUsers();
    else if (adminView === 'teams') body = await adminTeams();
    else if (adminView === 'manager_tasks') body = await adminManagerTasks();
    else if (adminView === 'live_trainings') body = await liveTrainingManagementTpl('admin');
    else body = await adminFormation();
    const sectionTitle = adminSections.find(x=>x[0]===adminView)?.[2] || 'Administración';
    body = `<div class="admin-subpage"><div class="admin-subpage-header"><button type="button" class="secondary" data-admin="dashboard">← Volver al panel</button><div class="admin-subpage-title"><div class="eyebrow">GRAYXON GROUP · ADMINISTRACIÓN</div><h1>${sectionTitle}</h1></div><button id="adminLogout" class="secondary">Cerrar sesión</button></div>${body}</div>`;
  }
  $('#admin').innerHTML = `<div class="admin-main">${body}</div>`;
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

async function adminUsers(){
  const [{data:users,error:ue},{data:teams},{data:managers}] = await Promise.all([
    sb.from('profiles').select('id,username,full_name,role,active,team_id,manager_id').order('full_name'),
    sb.from('teams').select('id,name').order('name'),
    sb.from('managers').select('id,name,user_id,active').order('name')
  ]);
  if(ue) return `<div class="card"><h2>Todos los usuarios</h2><div class="error">${esc(ue.message)}</div></div>`;
  const tm=new Map((teams||[]).map(x=>[x.id,x.name]));
  const mm=new Map((managers||[]).map(x=>[x.id,x]));
  const roleLabel=r=>r==='admin'?'Administrador':r==='manager'?'Manager':'Creador';
  const rows=(users||[]).map(u=>{
    const m=mm.get(u.manager_id);
    return `<div class="item admin-user-row"><div class="admin-user-main"><div><b>${esc(u.full_name||u.username||'Usuario')}</b><div class="muted small">@${esc(u.username||'—')} · ${roleLabel(u.role)} · ${u.active?'Activo':'Inactivo'}</div><div class="muted small">${esc(tm.get(u.team_id)||'Sin equipo')}${m?` · Manager: ${esc(m.name)}`:''}</div></div><span class="pill ${u.active?'ok':''}">${u.active?'Activo':'Inactivo'}</span></div><div class="admin-user-actions"><select class="admin-user-role" data-user-role="${u.id}"><option value="creator" ${u.role==='creator'?'selected':''}>Creador</option><option value="manager" ${u.role==='manager'?'selected':''}>Manager</option><option value="admin" ${u.role==='admin'?'selected':''}>Administrador</option></select><button class="secondary small" data-save-user-role="${u.id}">Guardar rol</button><button class="secondary small" data-view-user="${u.id}">Ver información</button><button class="secondary small ${u.active?'danger':'ok'}" data-toggle-user="${u.id}">${u.active?'Desactivar':'Activar'}</button>${u.id!==session?.user?.id?`<button class="secondary small danger" data-delete-user="${u.id}">Eliminar</button>`:''}</div></div>`;
  }).join('');
  return `<div class="card admin-users-page"><div class="row"><div><h2>Todos los usuarios</h2><p class="muted small">Administra el acceso y el rol de todas las cuentas Grayxon. Los cambios de rol respetan la estructura de equipos y managers.</p></div><span class="pill">${(users||[]).length} usuarios</span></div><div class="admin-users-list" style="margin-top:18px">${rows||'<div class="item"><span class="muted small">No hay usuarios.</span></div>'}</div></div>`;
}


async function adminUserModal(id){
  const [{data:p,error:pe},{data:d},{data:pm},{data:teams},{data:managers}]=await Promise.all([
    sb.from('profiles').select('id,username,full_name,role,active,team_id,manager_id').eq('id',id).single(),
    sb.from('profile_details').select('*').eq('user_id',id).maybeSingle(),
    sb.from('payment_methods').select('*').eq('user_id',id).order('is_primary',{ascending:false}).limit(1).maybeSingle(),
    sb.from('teams').select('id,name').order('name'),
    sb.from('managers').select('id,name').order('name')
  ]);
  if(pe||!p)return toast(pe?.message||'No se encontró el usuario.');
  const tm=new Map((teams||[]).map(x=>[x.id,x.name])), mm=new Map((managers||[]).map(x=>[x.id,x.name]));
  const safe=x=>x?esc(x):'—';
  const canChangeUsername=p.role!=='admin';
  const el=document.createElement('div');el.className='modal-backdrop';
  el.innerHTML=`<div class="card modal creator-profile-modal" style="max-width:760px;max-height:90vh;overflow:auto">
    <div class="row"><div><div class="eyebrow">USUARIO</div><h2>${safe(p.full_name||p.username)}</h2><div class="muted small">@${safe(p.username)} · ${p.role==='admin'?'Administrador':p.role==='manager'?'Manager':'Creador'} · ${p.active?'Activo':'Inactivo'}</div></div><button class="secondary" id="closeAdminUser">Cerrar</button></div>
    <div class="hr"></div>
    <h3>Acceso al portal</h3>
    <p class="muted small">El usuario seguirá ingresando con username + contraseña. El correo técnico de Supabase nunca se muestra en el portal.</p>
    <div class="field"><label>Usuario</label><input id="adminUserUsername" value="${safe(p.username||'')}" autocomplete="off" ${canChangeUsername?'':'disabled'}><small class="muted">${canChangeUsername?'Se actualizará también el identificador técnico de acceso.':'El username del administrador principal se conserva para proteger el acceso administrativo.'}</small></div>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
      <div class="field"><label>Nueva contraseña</label><input id="adminUserPassword" type="password" autocomplete="new-password" placeholder="Dejar vacía para conservarla"></div>
      <div class="field"><label>Confirmar contraseña</label><input id="adminUserPassword2" type="password" autocomplete="new-password" placeholder="Repite la nueva contraseña"></div>
    </div>
    <div id="adminUserAccessErr" class="error"></div>
    <button class="primary" id="saveAdminUserAccess">Guardar cambios de acceso</button>
    <div class="hr" style="margin-top:22px"></div>
    <h3>Información personal</h3>
    <div class="list"><div class="item">Correo: ${safe(d?.email)}</div><div class="item">Teléfono: ${safe(d?.phone)}</div><div class="item">Ubicación: ${safe(d?.country)} · ${safe(d?.state_region)} · ${safe(d?.city)}</div><div class="item">Dirección: ${safe(d?.address)}</div></div>
    <h3 style="margin-top:22px">Pago</h3>
    <div class="list">${pm?.method_type==='paypal'?`<div class="item">PayPal: ${safe(pm.paypal_email)}</div>`:`<div class="item">Banco / medio: ${safe(pm?.bank_name)}</div><div class="item">País: ${safe(pm?.bank_country)}</div><div class="item">Tipo: ${safe(pm?.account_type)}</div><div class="item">Cuenta: <span class="sensitive-value">${safe(pm?.account_number)}</span></div>`}</div>
    <div class="item" style="margin-top:16px"><b>Equipo:</b> ${safe(tm.get(p.team_id))} · <b>Manager:</b> ${safe(mm.get(p.manager_id))}</div>
  </div>`;
  document.body.appendChild(el);
  $('#closeAdminUser').onclick=()=>el.remove();
  $('#saveAdminUserAccess').onclick=async()=>{
    const btn=$('#saveAdminUserAccess'),err=$('#adminUserAccessErr');
    const username=$('#adminUserUsername')?.value.trim().toLowerCase()||'';
    const password=$('#adminUserPassword')?.value||'';
    const password2=$('#adminUserPassword2')?.value||'';
    err.textContent='';
    if(canChangeUsername && !/^[a-z0-9._-]{3,40}$/.test(username)){err.textContent='El usuario debe tener entre 3 y 40 caracteres y usar solo letras, números, punto, guion o guion bajo.';return;}
    if(password && password.length<6){err.textContent='La contraseña debe tener al menos 6 caracteres.';return;}
    if(password!==password2){err.textContent='Las contraseñas no coinciden.';return;}
    btn.disabled=true; btn.textContent='Guardando…';
    try{
      const result=await updateAdminUserAccess(id,canChangeUsername?username:p.username,password||null);
      if(result?.username && result.username!==p.username){p.username=result.username;}
      toast('Acceso actualizado ✓');
      el.remove();
      await render();
    }catch(e){err.textContent=e?.message||'No se pudo actualizar el acceso.';btn.disabled=false;btn.textContent='Guardar cambios de acceso';}
  };
}

async function saveAdminUserRole(id, role){
  const {error}=await sb.rpc('admin_set_user_role',{p_user_id:id,p_role:role});
  if(error)return toast(error.message); toast('Rol actualizado ✓'); await render();
}
async function toggleAdminUser(id){
  const {data:p,error}=await sb.from('profiles').select('active,full_name,username').eq('id',id).single();
  if(error)return toast(error.message);
  const next=!p.active;
  const {error:e}=await sb.rpc('admin_set_user_active',{p_user_id:id,p_active:next});
  if(e)return toast(e.message); toast(next?'Usuario activado ✓':'Usuario desactivado ✓'); await render();
}
async function deleteAdminUser(id){
  if(id===session?.user?.id)return toast('No puedes eliminar tu propia cuenta de administrador desde aquí.');
  if(!confirm('¿Eliminar definitivamente este usuario y su acceso a Grayxon? Esta acción no se puede deshacer.'))return;
  const {error}=await sb.rpc('admin_delete_user',{p_user_id:id});
  if(error)return toast(error.message); toast('Usuario eliminado ✓'); await render();
}

function normalizeImportText(v){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();}
function parseCsvRows(text){
  const headerLine=text.split(/\r?\n/).find(line=>normalizeImportText(line).includes('id de creador')&&normalizeImportText(line).includes('nombre de usuario'))||text.split(/\r?\n/).find(Boolean)||'';
  const commas=(headerLine.match(/,/g)||[]).length, semicolons=(headerLine.match(/;/g)||[]).length, delimiter=semicolons>commas?';':',';
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'&&quoted&&text[i+1]==='"'){cell+='"';i++;continue;}
    if(ch==='"'){quoted=!quoted;continue;}
    if(ch===delimiter&&!quoted){row.push(cell);cell='';continue;}
    if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>String(x).trim()!==''))rows.push(row);row=[];cell='';continue;}
    cell+=ch;
  }
  if(cell!==''||row.length){row.push(cell);if(row.some(x=>String(x).trim()!==''))rows.push(row);}
  return rows;
}
async function loadXlsxParser(){
  if(window.XLSX)return window.XLSX;
  if(window.__grayxonXlsxPromise)return window.__grayxonXlsxPromise;
  window.__grayxonXlsxPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';script.onload=()=>window.XLSX?resolve(window.XLSX):reject(new Error('No se pudo cargar el lector de Excel.'));script.onerror=()=>reject(new Error('No se pudo cargar el lector de Excel. Revisa la conexión o guarda el archivo como CSV UTF-8.'));document.head.appendChild(script);});
  return window.__grayxonXlsxPromise;
}
async function readCreatorImportFile(file){
  const ext=(file.name.split('.').pop()||'').toLowerCase();let rows;
  if(ext==='csv'){rows=parseCsvRows(await file.text());}
  else if(ext==='xlsx'||ext==='xls'){const XLSX=await loadXlsxParser();const wb=XLSX.read(await file.arrayBuffer(),{type:'array',raw:false});const ws=wb.Sheets[wb.SheetNames[0]];rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false});}
  else throw new Error('Selecciona un archivo .xlsx, .xls o .csv.');
  const headerIndex=rows.findIndex(r=>r.some(c=>normalizeImportText(c).includes('id de creador'))&&r.some(c=>normalizeImportText(c).includes('nombre de usuario')));
  if(headerIndex<0)throw new Error('No encontramos los encabezados “ID de creador” y “Nombre de usuario del creador”.');
  const headers=rows[headerIndex].map(normalizeImportText);
  const idx={id:headers.findIndex(x=>x.includes('id de creador')),username:headers.findIndex(x=>x.includes('nombre de usuario')),group:headers.findIndex(x=>x==='grupo'||x.includes('grupo')),agent:headers.findIndex(x=>x==='agente'||x.includes('agente'))};
  if(idx.id<0||idx.username<0)throw new Error('Faltan las columnas de ID de creador o nombre de usuario.');
  return rows.slice(headerIndex+1).filter(r=>r.some(c=>String(c??'').trim()!=='')).map((r,i)=>({source_row:headerIndex+i+2,tiktok_creator_id:String(r[idx.id]??'').trim(),tiktok_username:String(r[idx.username]??'').trim().replace(/^@/,''),group:idx.group>=0?String(r[idx.group]??'').trim():'',agent:idx.agent>=0?String(r[idx.agent]??'').trim().toLowerCase():''}));
}
function creatorImportModal(){
  const el=document.createElement('div');el.className='modal-backdrop';
  el.innerHTML=`<div class="card modal" style="max-width:920px"><div class="row"><div><div class="eyebrow">GRAYXON · IMPORTACIÓN</div><h2>Importar creadores en bloque</h2></div><button class="secondary" id="closeCreatorImport">Cerrar</button></div><p class="muted small">Carga el Excel/CSV de Backstage. Primero revisaremos los IDs, usuarios, equipos y managers; nada se creará hasta que confirmes la importación.</p><div class="field"><label>Archivo de Backstage</label><input id="creatorImportFile" type="file" accept=".xlsx,.xls,.csv"><span class="muted small">Se requiere ID de creador, nombre de usuario, grupo y agente.</span></div><div class="inline" style="margin-top:12px"><button class="primary" id="previewCreatorImport">Revisar archivo</button></div><div id="creatorImportStatus" class="muted small" style="margin-top:12px"></div><div id="creatorImportPreview"></div></div>`;
  document.body.appendChild(el);let mappedRows=[];let validRows=[];
  const close=()=>el.remove();el.querySelector('#closeCreatorImport').onclick=close;
  el.querySelector('#previewCreatorImport').onclick=async()=>{
    const btn=el.querySelector('#previewCreatorImport'),status=el.querySelector('#creatorImportStatus'),preview=el.querySelector('#creatorImportPreview'),file=el.querySelector('#creatorImportFile').files?.[0];
    if(!file){status.textContent='Selecciona primero el archivo.';return;}btn.disabled=true;status.textContent='Leyendo archivo y verificando asignaciones…';preview.innerHTML='';
    try{
      const raw=await readCreatorImportFile(file);
      const [{data:teams,error:te},{data:managers,error:me}]=await Promise.all([sb.from('teams').select('id,name,manager_id'),sb.from('managers').select('id,name,email,user_id,active')]);
      if(te||me)throw new Error((te||me).message||'No se pudieron leer los equipos y managers.');
      const teamMap=new Map((teams||[]).map(t=>[normalizeImportText(t.name),t]));const managerMap=new Map((managers||[]).map(m=>[m.id,m]));
      const seenIds=new Set(),seenUsers=new Set();mappedRows=raw.map(r=>{
        const id=r.tiktok_creator_id.replace(/\s/g,'');const handle=r.tiktok_username.trim();const username=handle.toLowerCase().replace(/[^a-z0-9._-]/g,'');const g=normalizeImportText(r.group);let team=null;
        if(g&&!g.includes('no esta en ningun grupo')&&!g.includes('sin grupo')){
          team=teamMap.get(g)||[...(teams||[])].find(t=>normalizeImportText(t.name).includes(g)||g.includes(normalizeImportText(t.name)))||null;
        }
        const issues=[];
        if(!/^\d{10,30}$/.test(id))issues.push('ID de TikTok inválido');
        if(!/^[a-z0-9._-]{3,30}$/.test(username))issues.push('Usuario no válido para el acceso');
        if(!team&&g&&!g.includes('no esta en ningun grupo')&&!g.includes('sin grupo'))issues.push(`Equipo no encontrado: ${r.group}`);
        if(seenIds.has(id))issues.push('ID repetido en el archivo');else if(id)seenIds.add(id);
        if(seenUsers.has(username))issues.push('Usuario repetido en el archivo');else if(username)seenUsers.add(username);
        if(team&&r.agent){const manager=managerMap.get(team.manager_id);if(manager?.email&&manager.email.toLowerCase()!==r.agent)issues.push(`Agente no coincide con manager del equipo (${manager.email})`);}
        return {...r,tiktok_creator_id:id,tiktok_username:handle,username,team_id:team?.id||null,team_name:team?.name||'Sin equipo',manager_id:team?.manager_id||null,manager_name:team?.manager_id?(managerMap.get(team.manager_id)?.name||'Manager sin nombre'):'Sin manager',issues};
      });
      validRows=mappedRows.filter(r=>!r.issues.length);
      const invalid=mappedRows.length-validRows.length;
      status.textContent=`Archivo leído: ${mappedRows.length} registros · ${validRows.length} válidos · ${invalid} por revisar. Los registros sin grupo quedarán sin equipo ni manager.`;
      const importTeamOptions=[...new Set(mappedRows.map(r=>r.team_name))].sort((a,b)=>a.localeCompare(b,'es'));
      preview.innerHTML=`<div class="grid" style="margin-top:12px"><div class="item"><b>${mappedRows.length}</b><div class="muted small">Filas encontradas</div></div><div class="item"><b>${validRows.length}</b><div class="muted small">Listas para importar</div></div><div class="item"><b>${invalid}</b><div class="muted small">Con observaciones</div></div></div><div class="grid" style="margin-top:12px;align-items:end"><label class="field"><span>Buscar por usuario, ID de TikTok o manager</span><input id="creatorImportSearch" type="search" placeholder="Ej. karlozpiedraoficial"></label><label class="field"><span>Filtrar por equipo</span><select id="creatorImportTeamFilter"><option value="">Todos los equipos</option>${importTeamOptions.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('')}</select></label></div><p id="creatorImportMatchCount" class="muted small" style="margin:8px 0">Mostrando ${mappedRows.length} de ${mappedRows.length} registros.</p><div style="max-height:420px;overflow:auto;margin-top:8px"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr><th style="text-align:left;padding:8px;position:sticky;top:0;background:#111318">ID TikTok</th><th style="text-align:left;padding:8px;position:sticky;top:0;background:#111318">Usuario</th><th style="text-align:left;padding:8px;position:sticky;top:0;background:#111318">Equipo</th><th style="text-align:left;padding:8px;position:sticky;top:0;background:#111318">Manager</th><th style="text-align:left;padding:8px;position:sticky;top:0;background:#111318">Estado</th></tr></thead><tbody id="creatorImportRows"></tbody></table></div><div class="inline" style="margin-top:16px"><button class="primary" id="confirmCreatorImport" ${validRows.length?'':'disabled'}>Importar ${validRows.length} registros válidos</button><button class="secondary" id="cancelCreatorImport">Cancelar</button></div><p class="muted small" style="margin-top:8px">Los conflictos con cuentas ya existentes también se comprobarán de forma segura en el servidor antes de crear cada cuenta.</p>`;
      const renderImportRows=()=>{
        const query=normalizeImportText(preview.querySelector('#creatorImportSearch')?.value||'');
        const selectedTeam=preview.querySelector('#creatorImportTeamFilter')?.value||'';
        const filteredRows=mappedRows.filter(r=>{
          const searchable=normalizeImportText([r.tiktok_creator_id,r.tiktok_username,r.username,r.team_name,r.manager_name,r.issues.join(' ')].join(' '));
          return (!query||searchable.includes(query))&&(!selectedTeam||r.team_name===selectedTeam);
        });
        const tbody=preview.querySelector('#creatorImportRows');
        tbody.innerHTML=filteredRows.length?filteredRows.map(r=>`<tr style="border-top:1px solid #333"><td style="padding:8px">${esc(r.tiktok_creator_id)}</td><td style="padding:8px">@${esc(r.tiktok_username)}</td><td style="padding:8px">${esc(r.team_name)}</td><td style="padding:8px">${esc(r.manager_name)}</td><td style="padding:8px;color:${r.issues.length?'#ff8b8b':'#7fe0ad'}">${r.issues.length?esc(r.issues.join('; ')):'Listo'}</td></tr>`).join(''):'<tr><td colspan="5" class="muted small" style="padding:12px">No hay registros que coincidan con la búsqueda.</td></tr>';
        const count=preview.querySelector('#creatorImportMatchCount');
        if(count)count.textContent=`Mostrando ${filteredRows.length} de ${mappedRows.length} registros.`;
      };
      preview.querySelector('#creatorImportSearch')?.addEventListener('input',renderImportRows);
      preview.querySelector('#creatorImportTeamFilter')?.addEventListener('change',renderImportRows);
      renderImportRows();
      preview.querySelector('#cancelCreatorImport')?.addEventListener('click',close);
      preview.querySelector('#confirmCreatorImport')?.addEventListener('click',async()=>{
        if(!validRows.length)return;
        if(!confirm(`Vas a crear hasta ${validRows.length} cuentas. Se generarán contraseñas temporales y será obligatorio cambiarlas al primer ingreso. ¿Continuar?`))return;
        const confirmBtn=preview.querySelector('#confirmCreatorImport');confirmBtn.disabled=true;status.textContent='Creando cuentas de forma segura… No cierres esta ventana.';
        try{
          const {data,error}=await sb.functions.invoke('bulk-import-creators',{body:{rows:validRows.map(r=>({source_row:r.source_row,tiktok_creator_id:r.tiktok_creator_id,tiktok_username:r.tiktok_username,username:r.username,team_id:r.team_id}))}});
          if(error||data?.error)throw new Error(data?.error||error?.message||'Falló la importación.');
          const results=data.results||[];const created=results.filter(r=>r.status==='created');const skipped=results.filter(r=>r.status==='already_exists');const failed=results.filter(r=>r.status==='failed');
          window.__grayxonCreatorImportReport={created,skipped,failed,all:results};
          preview.innerHTML=`<div class="item" style="margin-top:16px"><h3>Importación finalizada</h3><div class="grid"><div><b>${created.length}</b><div class="muted small">Cuentas creadas</div></div><div><b>${skipped.length}</b><div class="muted small">IDs ya registrados</div></div><div><b>${failed.length}</b><div class="muted small">No creadas</div></div></div><p class="muted small" style="margin-top:12px">Descarga el informe ahora. Incluye las contraseñas temporales de las cuentas creadas; se muestran una sola vez y no se guardan en texto plano en la base de datos.</p><div class="inline"><button class="primary" id="downloadCreatorImportReport">Descargar informe CSV y credenciales</button><button class="secondary" id="closeCreatorImportDone">Cerrar</button></div></div>`;
          status.textContent='Proceso terminado. Revisa el informe y guarda las credenciales antes de cerrar.';
          preview.querySelector('#downloadCreatorImportReport').onclick=downloadCreatorImportReport;
          preview.querySelector('#closeCreatorImportDone').onclick=()=>{close();render();};
        }catch(e){status.textContent=e.message||'No se pudo completar la importación.';confirmBtn.disabled=false;}
      });
    }catch(e){status.textContent=e.message||'No se pudo leer el archivo.';}
    finally{btn.disabled=false;}
  };
}
function downloadCreatorImportReport(){
  const report=window.__grayxonCreatorImportReport;if(!report)return;
  const rows=[['Estado','Fila Excel','ID TikTok','Usuario TikTok','Usuario Grayxon','Equipo','Contraseña temporal','Detalle']];
  for(const r of report.all||[]){rows.push([r.status||'',r.source_row||'',r.tiktok_creator_id||'',r.tiktok_username||'',r.username||'',r.team_name||'',r.temporary_password||'',r.message||'']);}
  const csv='\ufeff'+rows.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=`Grayxon_Importacion_Creadores_${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function adminCreators() {
  const { data, error } = await sb.from('profiles').select('id,username,full_name,active,role,team_id,manager_id').eq('role','creator').order('full_name');
  if (error) return `<div class="card"><h2>Creadores</h2><div class="error">${esc(error.message)}</div></div>`;
  const [{data:teams},{data:managers}] = await Promise.all([sb.from('teams').select('id,name'),sb.from('managers').select('id,name')]);
  const tm=new Map((teams||[]).map(x=>[x.id,x.name])), mm=new Map((managers||[]).map(x=>[x.id,x.name]));
  return `<div class="card"><div class="row"><div><h2>Creadores</h2><p class="muted small">Cada creador entra con usuario + contraseña. El correo técnico nunca se muestra.</p></div><div class="inline"><button class="secondary" id="importCreators">⇧ Importar Excel/CSV</button><button class="primary" id="newCreator">+ Crear creador</button></div></div><div class="list" style="margin-top:18px">${(data || []).map(x => `<div class="item creator-admin-row"><div class="row"><div><b>${esc(x.full_name || x.username)}</b><div class="muted small">@${esc(x.username)}</div><div class="muted small">${esc(tm.get(x.team_id)||'Sin equipo')} · ${esc(mm.get(x.manager_id)||'Sin manager')}</div></div><div class="inline creator-access-actions"><span class="pill ${x.active ? 'ok' : ''}">${x.active ? 'Activo · acceso permitido' : 'Inactivo · acceso bloqueado'}</span><button class="secondary small creator-toggle ${x.active ? 'danger' : 'ok'}" data-toggle-creator="${x.id}">${x.active ? '🔒 Desactivar acceso' : '🔓 Activar acceso'}</button><button class="secondary small" data-view-profile="${x.id}">👤 Perfil y misiones</button></div></div></div>`).join('') || '<p class="muted">Aún no hay creadores.</p>'}</div></div>`;
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
  let v=String(url).trim();
  if(!v) return null;
  // Para que el formulario sea más amable, aceptamos también tiktok.com/... o www.tiktok.com/...
  // y añadimos HTTPS automáticamente. Los esquemas distintos de HTTP/HTTPS siguen bloqueados.
  if(!/^https?:\/\//i.test(v)){
    if(/^[^\s/]+\.[^\s/]+(?:[/?#].*)?$/i.test(v)) v=`https://${v}`;
    else return null;
  }
  try { const u=new URL(v); return ['http:','https:'].includes(u.protocol) && u.hostname ? u.href : null; }
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
  document.body.appendChild(el); const syncNewManager=async()=>{const teamId=$('#newTeam')?.value||'';const preview=$('#newManagerPreview');if(!preview)return;if(!teamId){preview.textContent='Sin equipo / sin manager';return;}const {data:t}=await sb.from('teams').select('manager_id').eq('id',teamId).maybeSingle();const managerId=t?.manager_id||null;const {data:m}=managerId?await sb.from('managers').select('name').eq('id',managerId).maybeSingle():{data:null};preview.textContent=m?.name||'Este equipo no tiene manager asignado';}; $('#newTeam')?.addEventListener('change',syncNewManager); syncNewManager(); $('#cancelCreator').onclick=()=>el.remove(); $('#createCreator').onclick=async()=>{const btn=$('#createCreator');btn.disabled=true;try{const username=$('#newUser').value.trim(),full_name=$('#newName').value.trim(),password=$('#newPass').value,team_id=$('#newTeam').value||null;let manager_id=null;if(team_id){const {data:t,error:te}=await sb.from('teams').select('manager_id').eq('id',team_id).maybeSingle();if(te)throw te;manager_id=t?.manager_id||null;}const {data,error}=await sb.functions.invoke('create-creator',{body:{username,full_name,password}});if(error||data?.error){let detail=data?.error||error?.message||'No se pudo crear el creador.';try{const ctx=error?.context;if(ctx?.clone){const response=ctx.clone();const raw=await response.text();if(raw){try{const payload=JSON.parse(raw);detail=payload.error||payload.message||payload.msg||payload.details||JSON.stringify(payload);}catch{detail=raw;}}}}catch{}throw new Error(detail);}const creatorId=data?.user?.id||data?.profile?.id||data?.id;let id=creatorId;if(!id){const {data:p}=await sb.from('profiles').select('id').eq('username',username.toLowerCase()).maybeSingle();id=p?.id;}if(!id)throw new Error('La cuenta se creó, pero no pudimos recuperar el creador para asignarle equipo y manager.');const {error:ae}=await sb.from('profiles').update({team_id,manager_id}).eq('id',id);if(ae)throw ae;el.remove();toast('Creador creado y asignado ✓');render();}catch(e){$('#createErr').textContent=e.message||'No se pudo crear el creador.';btn.disabled=false;}};
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

function ensureCreatorNotificationMenuAction(){
  const menu=$('#profileMenu');
  if(!menu || profile?.role!=='creator' || !session?.user?.id) return;
  let btn=$('#grayxonMenuPush');
  if(!btn){
    btn=document.createElement('button');
    btn.type='button';
    btn.id='grayxonMenuPush';
    btn.className='secondary small';
    btn.style.cssText='width:100%;margin-top:8px;text-align:left;justify-content:flex-start;';
    menu.appendChild(btn);
  }
  const standalone=isGrayxonStandalone();
  const hasSupport=('serviceWorker' in navigator)&&('PushManager' in window)&&('Notification' in window);
  const denied=hasSupport && Notification.permission==='denied';
  btn.textContent=denied ? '🔕 Notificaciones bloqueadas' : '🔔 Activar notificaciones';
  btn.disabled=denied;
  btn.onclick=async(e)=>{
    e.preventDefault(); e.stopPropagation();
    if(!hasSupport){ toast('Este dispositivo/navegador no permite notificaciones web.'); return; }
    if(/iPhone|iPad|iPod/i.test(navigator.userAgent) && !standalone){
      showGrayxonInstallHelp();
      toast('En iPhone primero debes abrir Grayxon como app instalada.');
      return;
    }
    const subscription=await registerGrayxonPush({requestPermission:true});
    if(subscription){
      toast('Notificaciones activadas ✓');
      btn.textContent='🔔 Notificaciones activadas';
      closeProfileMenu();
    }else if(Notification.permission==='denied'){
      toast('Las notificaciones están bloqueadas. Actívalas en los permisos de Grayxon.');
    }else{
      toast('No se pudieron activar las notificaciones.');
    }
  };
}

function toggleProfileMenu(){
  const menu=$('#profileMenu'); if(!menu) return;
  const willOpen=menu.classList.contains('hidden');
  menu.classList.toggle('hidden', !willOpen);
  if(willOpen){
    ensureCreatorNotificationMenuAction();
    const name=$('#profileMenuName'); const role=$('#profileMenuRole');
    if(name) name.textContent=profile?.full_name || profile?.username || 'Mi cuenta';
    if(role) role.textContent=profile?.role==='admin' ? 'Administrador' : profile?.role==='manager' ? 'Manager' : 'Creador';
  }
}
function closeProfileMenu(){ const menu=$('#profileMenu'); if(menu) menu.classList.add('hidden'); }



function updateHeaderAccessUI(){
  updateCreatorTopNav();
  ensureCreatorNotificationMenuAction();
  const isManagerSession = !!(session && profile?.role === 'manager');
  document.body.classList.toggle('grayxon-manager-session', isManagerSession);
  const btn=$('#adminOpen');
  if(!btn) return;
  // Ocultar el acceso duplicado de Manager en el encabezado.
  // El rol y los permisos no se modifican; el acceso sigue en el menú del perfil.
  btn.classList.toggle('grayxon-manager-header-hidden', isManagerSession);
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


function ensureFormationMobileV34Styles(){
  if(document.getElementById('grayxon-formation-mobile-v34')) return;
  const style=document.createElement('style');
  style.id='grayxon-formation-mobile-v34';
  style.textContent=`
    #training .formation-page{width:100%!important;box-sizing:border-box!important}
    #training .formation-groups{display:grid!important;gap:10px!important}
    #training .formation-group{background:#0f1115!important;border:1px solid rgba(255,255,255,.10)!important;border-radius:16px!important;overflow:hidden!important}
    #training .formation-group-toggle{display:flex!important;width:100%!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;min-height:60px!important;padding:13px 14px!important;background:#0f1115!important;color:#fff!important;border:0!important;box-shadow:none!important;text-align:left!important}
    #training .formation-group-toggle strong{font-size:16px!important;line-height:1.2!important;color:#fff!important}
    #training .formation-group-toggle .eyebrow{font-size:9px!important;letter-spacing:.15em!important;color:#858c98!important}
    #training .formation-group-toggle-right{display:flex!important;align-items:center!important;gap:8px!important}
    #training .formation-group-toggle-right b{min-width:28px!important;height:28px!important;padding:0 7px!important;display:grid!important;place-items:center!important;border-radius:999px!important;border:1px solid rgba(255,255,255,.10)!important;background:rgba(255,255,255,.035)!important;color:#cfd5dc!important;font-size:10px!important}
    #training .formation-group-panel.hidden{display:none!important}
    #training .formation-group-panel{background:#0b0d11!important;padding:0 8px 8px!important;border-top:1px solid rgba(255,255,255,.07)!important}
    #training .formation-group-list{display:grid!important;gap:7px!important;padding-top:8px!important}
    #training .formation-module-accordion{background:#11141a!important;border:1px solid rgba(255,255,255,.08)!important;border-radius:13px!important;overflow:hidden!important}
    #training .formation-module-toggle{display:grid!important;grid-template-columns:32px minmax(0,1fr) auto!important;align-items:center!important;gap:9px!important;width:100%!important;min-height:55px!important;padding:10px 11px!important;background:#11141a!important;color:#fff!important;border:0!important;box-shadow:none!important;text-align:left!important}
    #training .formation-module-number{width:30px!important;height:30px!important;border-radius:9px!important;font-size:9px!important}
    #training .formation-module-copy strong{font-size:13px!important;color:#fff!important;line-height:1.25!important}
    #training .formation-module-copy small{font-size:10px!important;color:#858c98!important;line-height:1.3!important}
    #training .formation-module-meta{font-size:10px!important;color:#aeb5bf!important}
    #training .formation-module-panel{background:#0d1014!important;padding:10px 11px 11px!important;border-top:1px solid rgba(255,255,255,.07)!important}
    #training .formation-lessons-list .lesson{display:flex!important;min-width:0!important}
    #training .formation-lessons-list .lesson button{background:transparent!important;border:0!important;color:#fff!important;text-align:left!important;padding:9px 5px!important}
    #training .formation-group.is-open .formation-group-chevron{transform:rotate(90deg)!important}
  `;
  document.head.appendChild(style);
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
  $$('[data-formation-module-toggle]').forEach(b => b.onclick = () => { const panel=$('#'+b.dataset.formationModuleToggle); if(!panel)return; const open=panel.classList.contains('hidden'); panel.classList.toggle('hidden',!open); b.classList.toggle('is-open',open); b.setAttribute('aria-expanded',open?'true':'false'); });
  $$('[data-formation-group-toggle]').forEach(b => b.onclick = () => { const panel=$('#'+b.dataset.formationGroupToggle); if(!panel)return; const open=panel.classList.contains('hidden'); panel.classList.toggle('hidden',!open); b.setAttribute('aria-expanded',open?'true':'false'); b.closest('.formation-group')?.classList.toggle('is-open',open); });
  $$('[data-lesson]').forEach(b => b.onclick = () => openLesson(b.dataset.lesson));
  $$('[data-complete-mission]').forEach(b => b.onclick = () => completeMission(b.dataset.completeMission));
  $$('[data-save-mission]').forEach(b => b.onclick = () => saveMissionProgress(b.dataset.saveMission));
  $$('[data-mission-week]').forEach(b => b.onclick = () => { const id = b.dataset.missionWeek; const panel = $('#details-' + id); if (panel) panel.classList.toggle('hidden'); b.classList.toggle('open'); });
  $$('[data-creator-training-toggle]').forEach(b=>b.onclick=()=>{const id=b.dataset.creatorTrainingToggle;const panel=$('#creator-training-detail-'+id);if(!panel)return;const open=panel.classList.contains('hidden');panel.classList.toggle('hidden',!open);b.classList.toggle('open',open);b.setAttribute('aria-expanded',open?'true':'false');});
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
  $$('[data-save-user-role]').forEach(b => b.onclick = () => { const sel = $(`[data-user-role="${b.dataset.saveUserRole}"]`); if(sel) saveAdminUserRole(b.dataset.saveUserRole, sel.value); });
  $$('[data-toggle-user]').forEach(b => b.onclick = () => toggleAdminUser(b.dataset.toggleUser));
  $$('[data-delete-user]').forEach(b => b.onclick = () => deleteAdminUser(b.dataset.deleteUser));
  $$('[data-view-user]').forEach(b => b.onclick = () => adminUserModal(b.dataset.viewUser));
  $('#newTeamManager')?.addEventListener('click',()=>teamManagerModal());
  $$('[data-view-team]').forEach(b=>b.onclick=()=>adminTeamModal(b.dataset.viewTeam));
  $$('[data-edit-team]').forEach(b=>b.onclick=()=>editTeam(b.dataset.editTeam));
  $$('[data-delete-team]').forEach(b=>b.onclick=()=>deleteTeam(b.dataset.deleteTeam));
  $$('[data-delete-manager-task]').forEach(b=>b.onclick=()=>deleteManagerTask(b.dataset.deleteManagerTask));
  $('#newLiveTraining')?.addEventListener('click',createLiveTrainingModal);
  $$('[data-start-live-training]').forEach(b=>b.onclick=()=>startLiveTraining(b.dataset.startLiveTraining));
  $$('[data-reschedule-live-training]').forEach(b=>b.onclick=()=>rescheduleLiveTraining(b.dataset.rescheduleLiveTraining));
  $$('[data-cancel-live-training]').forEach(b=>b.onclick=()=>cancelLiveTraining(b.dataset.cancelLiveTraining));
  $$('[data-finish-live-training]').forEach(b=>b.onclick=()=>finishLiveTraining(b.dataset.finishLiveTraining));
  $$('[data-delete-live-training]').forEach(b=>b.onclick=()=>deleteLiveTraining(b.dataset.deleteLiveTraining));
  $$('[data-view-live-history]').forEach(b=>b.onclick=()=>openLiveTrainingHistory(b.dataset.viewLiveHistory));
  $$('[data-view-scheduled-training]').forEach(b=>b.onclick=()=>openScheduledLiveTraining(b.dataset.viewScheduledTraining));
  $$('[data-open-live-training]').forEach(b=>b.onclick=()=>{pendingLiveTrainingAutoStart={id:b.dataset.openLiveTraining};nav('live-training');});
  // Account menu is wired once globally below. Do not bind it here on every render.
  const saveProfileBtn = $('#saveProfile');
  if (saveProfileBtn) saveProfileBtn.onclick = saveProfile;
  // bind() runs after every render; use direct handlers so payment listeners are never duplicated.
  const pMethodEl=$('#pMethod');
  if(pMethodEl) pMethodEl.onchange=togglePaymentFields;
  const pBankCountryEl=$('#pBankCountry');
  if(pBankCountryEl) pBankCountryEl.onchange=()=>populateBanks();
  togglePaymentFields();
  populateBanks();
  ensureGrayxonPreferencesStyles();
  $('#installGrayxonDashboard')?.addEventListener('click',installGrayxonApp);
  refreshGrayxonPwaPreferenceUI();
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
  $('#importCreators')?.addEventListener('click', creatorImportModal);
  $('#saveFirstPassword')?.addEventListener('click', saveFirstPassword);
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


function togglePaymentFields(){
  const paypal=$('#pMethod')?.value==='paypal';
  if($('#bankFields')) $('#bankFields').style.display=paypal?'none':'';
  if($('#paypalFields')) $('#paypalFields').style.display=paypal?'':'none';
}
function populateBanks(){
  const country=normalizeCountryCode($('#pBankCountry')?.value||'CO');
  const sel=$('#pBank');
  if(!sel) return;
  const banks=Array.isArray(bankSeed[country]) ? bankSeed[country] : [];
  const current=paymentMethod?.bank_name||'';
  const canKeepCurrent=current && banks.includes(current);
  sel.innerHTML='<option value="">Selecciona tu banco</option>'+banks.map(b=>`<option value="${esc(b)}" ${canKeepCurrent && current===b?'selected':''}>${esc(b)}</option>`).join('');
  if(!canKeepCurrent) sel.value='';
}
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
  const btn=$('#saveProfile'); if(btn) btn.disabled=true;
  try{
    const uid=session.user.id;
    const d={user_id:uid,email:$('#pEmail')?.value.trim()||null,phone:$('#pPhone')?.value.trim()||null,country:$('#pCountry')?.value||null,state_region:$('#pState')?.value.trim()||null,city:$('#pCity')?.value.trim()||null,address:$('#pAddress')?.value.trim()||null,updated_at:new Date().toISOString()};
    const {error:de}=await sb.from('profile_details').upsert(d);
    if(de) throw new Error(`Información personal: ${de.message}`);

    const method=$('#pMethod')?.value==='paypal'?'paypal':'bank';
    const pm={user_id:uid,method_type:method,is_primary:$('#pPrimary')?.checked,updated_at:new Date().toISOString()};
    if(method==='paypal'){
      pm.paypal_email=$('#pPaypal')?.value.trim()||null;
      pm.bank_country=null;pm.bank_name=null;pm.account_type=null;pm.account_number=null;
    } else {
      pm.bank_country=normalizeCountryCode($('#pBankCountry')?.value||'CO');
      pm.bank_name=$('#pBank')?.value||null;
      pm.account_type=$('#pAccountType')?.value||null;
      pm.account_number=$('#pAccountNumber')?.value.trim()||null;
      pm.paypal_email=null;
    }

    // Read as a list so duplicate legacy rows cannot produce a maybeSingle() error.
    const {data:existingRows,error:readPaymentError}=await sb.from('payment_methods')
      .select('id,is_primary,updated_at')
      .eq('user_id',uid)
      .order('is_primary',{ascending:false})
      .order('updated_at',{ascending:false})
      .limit(1);
    if(readPaymentError) throw new Error(`Información de pago: ${readPaymentError.message}`);
    const existing=existingRows?.[0];
    const paymentResult=existing?.id
      ? await sb.from('payment_methods').update(pm).eq('id',existing.id)
      : await sb.from('payment_methods').insert(pm);
    if(paymentResult?.error) throw new Error(`Información de pago: ${paymentResult.error.message}`);

    await loadProfileDetails();
    updateProfileBadge();
    toast('Perfil guardado ✓');
    closeProfileMenu();
    nav('space');
  }catch(e){
    if(err) err.textContent=e?.message||'No se pudo guardar la información.';
  }finally{
    if(btn) btn.disabled=false;
  }
}
function updateProfileBadge(){
  ensureCreatorNotificationMenuAction();
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
  document.body.classList.toggle('grayxon-creator-session', profile?.role==='creator');
  document.body.classList.toggle('grayxon-manager-session', profile?.role === 'manager');
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
  if(profile?.must_change_password){ nav('force-password'); return; }
  nav(profile.role === 'admin' ? 'admin' : profile.role === 'manager' ? 'manager' : 'space');
  if(profile.role==='creator') setTimeout(showGrayxonPushPrompt,900);
}

async function logout() {
  await sb.auth.signOut();
  session = null;
  profile = null;
  document.body.classList.remove('grayxon-creator-session', 'grayxon-manager-session');
  profileDetails = null;
  paymentMethod = null;
  notifications = [];
  $('#notificationsPanel')?.classList.add('hidden');
  updateHeaderAccessUI();
  updateProfileBadge();
  updateNotificationsUI();
  // Al cerrar sesión, volver a la nueva portada pública oficial.
  window.location.replace('./index.html');
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
  if (session) { profile = await getProfile(); document.body.classList.toggle('grayxon-creator-session', profile?.role==='creator'); document.body.classList.toggle('grayxon-manager-session', profile?.role === 'manager'); await loadProfileDetails(); await loadNotifications(); }
  else updateNotificationsUI();
  updateHeaderAccessUI();

  const hashPage = window.location.hash.replace(/^#/, '');
  const roleHome = profile?.role === 'admin' ? 'admin' : profile?.role === 'manager' ? 'manager' : 'space';
  const deepLiveMatch = hashPage.match(/^live-training\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);
  if (session && profile?.role === 'creator' && deepLiveMatch) {
    const liveId = deepLiveMatch[1];
    const { data: targetLive } = await sb.from('live_trainings')
      .select('id,title,description,scheduled_at,room_name,status,created_by,instructor_name,created_at,started_at,ended_at')
      .eq('id', liveId)
      .eq('status', 'live')
      .maybeSingle();
    if (targetLive) {
      currentLiveTraining = targetLive;
      pendingLiveTrainingAutoStart = { id: targetLive.id };
      nav('live-training', false);
      if(session && profile?.role==='creator') setTimeout(showGrayxonPushPrompt,1200);
      return;
    }
  }
  const requestedPage = ['home','benefits','auth','space','manager','training','live-training','missions','profile','admin','force-password'].includes(hashPage) ? hashPage : null;
  const initialPage = session ? (profile?.must_change_password ? 'force-password' : (requestedPage && requestedPage !== 'home' ? requestedPage : roleHome)) : (requestedPage || 'home');
  nav(initialPage, false);
  if(session && profile?.role==='creator') setTimeout(showGrayxonPushPrompt,1200);
}

sb.auth.onAuthStateChange((event,newSession)=>{
  if(event==='PASSWORD_RECOVERY' && newSession){
    session=newSession;
    setTimeout(()=>finishPasswordRecovery(),0);
  }
});


/* v15 · Manager compact layout */
(function applyManagerCompactLayout(){
  if(document.getElementById('grayxon-manager-compact-v15')) return;
  const style=document.createElement('style');
  style.id='grayxon-manager-compact-v15';
  style.textContent=`
    /* Header compacto del panel de manager */
    .manager-page .manager-hero{
      display:flex!important;
      align-items:center!important;
      justify-content:space-between!important;
      gap:16px!important;
      padding:14px 16px!important;
      min-height:0!important;
    }
    .manager-page .manager-hero > div:first-child{
      min-width:0!important;
      flex:1 1 auto!important;
    }
    .manager-page .manager-hero h1{
      margin:3px 0 0!important;
      font-size:clamp(21px,5.2vw,30px)!important;
      line-height:1.08!important;
      white-space:nowrap!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
    }
    .manager-page .manager-hero .muted{
      margin:6px 0 0!important;
      font-size:11px!important;
      line-height:1.35!important;
    }
    .manager-page .manager-hero-stat{
      flex:0 0 auto!important;
      min-width:66px!important;
      padding:8px 10px!important;
      border-radius:13px!important;
    }
    .manager-page .manager-hero-stat strong{font-size:21px!important;line-height:1!important}
    .manager-page .manager-hero-stat span{font-size:8px!important;letter-spacing:.12em!important;margin-top:3px!important}

    /* Todos los acordeones compactos y con la misma jerarquía visual */
    .manager-page .grayxon-manager-accordion,
    .manager-page .manager-creators-section,
    .manager-page .manager-task-accordion{
      margin-top:10px!important;
      padding:0!important;
      overflow:hidden!important;
    }
    .manager-page .grayxon-manager-accordion-toggle,
    .manager-page .manager-creators-toggle{
      min-height:0!important;
      padding:13px 15px!important;
    }
    .manager-page .grayxon-manager-accordion-toggle-main{gap:10px!important}
    .manager-page .grayxon-manager-accordion-icon{
      width:34px!important;height:34px!important;flex-basis:34px!important;
      border-radius:10px!important;font-size:16px!important;
    }
    .manager-page .grayxon-manager-accordion-copy strong,
    .manager-page .manager-creators-toggle strong{font-size:14px!important;line-height:1.15!important}
    .manager-page .grayxon-manager-accordion-copy small,
    .manager-page .manager-creators-toggle small{
      margin-top:3px!important;
      font-size:10px!important;
      line-height:1.3!important;
    }
    .manager-page .grayxon-manager-accordion-meta,
    .manager-page .manager-creators-toggle-meta{gap:7px!important}
    .manager-page .grayxon-manager-accordion-meta b,
    .manager-page .manager-creators-toggle-meta b{font-size:12px!important}
    .manager-page .grayxon-manager-accordion-chevron{font-size:20px!important}
    .manager-page .grayxon-manager-accordion-panel{padding:0 15px 15px!important}
    .manager-page .manager-creators-panel{padding:0 15px 15px!important}
    .manager-page .manager-creators-toggle-meta .manager-creator-chevron{font-size:20px!important}

    @media(max-width:800px){
      .manager-page .manager-hero{
        padding:12px 14px!important;
        gap:10px!important;
      }
      .manager-page .manager-hero .eyebrow{font-size:9px!important;letter-spacing:.12em!important}
      .manager-page .manager-hero h1{font-size:22px!important}
      .manager-page .manager-hero .muted{display:none!important}
      .manager-page .manager-hero-stat{min-width:58px!important;padding:7px 8px!important}
      .manager-page .manager-hero-stat strong{font-size:19px!important}
      .manager-page .manager-hero-stat span{font-size:7px!important}
      .manager-page .grayxon-manager-accordion-toggle,
      .manager-page .manager-creators-toggle{padding:12px 14px!important}
    }
  `;
  document.head.appendChild(style);
})();

/* v18 · creator navigation + TikTok LIVE visual accents */
(function applyV18Visuals(){
  if(document.getElementById('grayxon-v18-visuals')) return;
  const style=document.createElement('style');
  style.id='grayxon-v18-visuals';
  style.textContent=`
    .grayxon-creator-space-float{
      position:fixed!important;right:18px!important;bottom:18px!important;z-index:4900!important;
      display:flex!important;align-items:center!important;gap:8px!important;
      min-height:46px!important;padding:0 15px!important;border-radius:999px!important;
      border:1px solid rgba(37,244,238,.38)!important;
      background:linear-gradient(135deg,rgba(14,20,24,.96),rgba(18,12,19,.96))!important;
      color:#fff!important;font-weight:850!important;font-size:12px!important;
      box-shadow:0 12px 32px rgba(0,0,0,.34),-5px 0 18px rgba(37,244,238,.12),5px 0 18px rgba(254,44,85,.12)!important;
      opacity:0!important;pointer-events:none!important;transform:translateY(10px) scale(.96)!important;
      transition:opacity .18s ease,transform .18s ease,box-shadow .18s ease!important;
      cursor:pointer!important;overflow:hidden!important;
    }
    .grayxon-creator-space-float:before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:linear-gradient(180deg,#25f4ee,#fe2c55);border-radius:999px 0 0 999px}
    .grayxon-creator-space-float.is-visible{opacity:1!important;pointer-events:auto!important;transform:none!important}
    .grayxon-creator-space-float:hover{box-shadow:0 16px 38px rgba(0,0,0,.42),-6px 0 20px rgba(37,244,238,.18),6px 0 20px rgba(254,44,85,.18)!important}
    /* Creator navigation: the floating Mi espacio button is the only return control. */
    body.grayxon-creator-session .missions-page > .row > .secondary,
    body.grayxon-creator-session .live-training-page .live-training-hero > .secondary,
    body.grayxon-creator-session .training-page > .row > .secondary,
    body.grayxon-creator-session .training-page .secondary[data-space-action="space"]{
      display:none!important;
    }
    .grayxon-creator-space-float-icon{font-size:19px;line-height:1}

    /* Acentos laterales estilo TikTok LIVE, sin cambiar el branding Grayxon. */
    .creator-dashboard .creator-dashboard-card{box-shadow:inset 3px 0 0 rgba(37,244,238,.75),0 12px 30px rgba(0,0,0,.14)!important}
    .creator-dashboard .creator-dashboard-card:nth-child(2){box-shadow:inset 3px 0 0 rgba(254,44,85,.78),0 12px 30px rgba(0,0,0,.14)!important}
    .creator-dashboard .creator-dashboard-card:nth-child(3){box-shadow:inset 3px 0 0 rgba(177,110,255,.72),0 12px 30px rgba(0,0,0,.14)!important}
    .creator-dashboard .creator-dashboard-card:hover{transform:translateY(-1px);border-color:rgba(255,255,255,.13)!important}
    .creator-dashboard .creator-assignment-card{box-shadow:inset 3px 0 0 rgba(37,244,238,.65),0 12px 30px rgba(0,0,0,.12)!important}
    .creator-dashboard .creator-performance{position:relative;overflow:hidden}
    .creator-dashboard .creator-performance:before{content:"";position:absolute;left:0;top:18px;bottom:18px;width:3px;border-radius:4px;background:linear-gradient(180deg,#25f4ee,#fe2c55);opacity:.75}
    .creator-dashboard .creator-metric{border-color:rgba(255,255,255,.09)!important;background:rgba(255,255,255,.025)!important}
    .creator-dashboard .creator-metric:nth-child(1){box-shadow:inset 2px 0 0 rgba(254,44,85,.65)}
    .creator-dashboard .creator-metric:nth-child(2){box-shadow:inset 2px 0 0 rgba(37,244,238,.65)}
    .creator-dashboard .creator-profile-incomplete{border-left:3px solid #fe2c55!important;border-right:1px solid rgba(37,244,238,.16)!important}
    .manager-page .grayxon-manager-accordion,.manager-page .manager-creators-section,.manager-page .manager-task-accordion{position:relative}
    .manager-page .grayxon-manager-accordion:before,.manager-page .manager-creators-section:before,.manager-page .manager-task-accordion:before{content:"";position:absolute;left:0;top:12px;bottom:12px;width:3px;border-radius:4px;background:linear-gradient(180deg,#25f4ee,#fe2c55);opacity:.75;pointer-events:none}
    .manager-page .manager-creators-section:before{background:#25f4ee}
    .manager-page .manager-task-accordion:before{background:#fe2c55}
    @media(max-width:800px){
      .grayxon-creator-space-float{right:13px!important;bottom:13px!important;min-height:44px!important;padding:0 13px!important}
    }
  `;
  document.head.appendChild(style);
  ensureCreatorSpaceFloat();
  updateCreatorSpaceFloat();
  updateCreatorTopNav();
})();

/* v24 · creator training library */
(function applyV31TrainingAndFormationStyles(){
  if(document.getElementById('grayxon-v31-training-creator-ui')) return;
  const style=document.createElement('style'); style.id='grayxon-v31-training-creator-ui'; style.textContent=`
    .formation-module-accordion{background:#0f1115!important;border:1px solid rgba(255,255,255,.10)!important;border-radius:16px!important;overflow:hidden!important}
    .formation-module-toggle{appearance:none!important;-webkit-appearance:none!important;background:#0f1115!important;color:#fff!important;border:0!important;border-radius:0!important;box-shadow:none!important;padding:14px 16px!important;text-transform:none!important;letter-spacing:normal!important;min-height:68px!important}
    .formation-module-toggle:hover{background:#151820!important}
    .formation-module-copy strong{color:#fff!important}
    .formation-module-copy small{color:#858c98!important}
    .formation-module-meta{color:#aeb5bf!important}
    .formation-module-number{background:rgba(37,244,238,.04)!important}
    .creator-live-now-section{margin-top:24px}
    .creator-live-now-card{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:20px;border:1px solid rgba(37,244,238,.28);border-radius:20px;background:linear-gradient(145deg,rgba(37,244,238,.07),rgba(255,255,255,.025));box-shadow:0 18px 55px rgba(0,0,0,.22)}
    .creator-live-now-copy h2{margin:8px 0 5px;color:#fff;font-size:24px}.creator-live-now-copy p{margin:4px 0;line-height:1.5}
    .creator-live-now-badge{display:inline-flex;align-items:center;gap:7px;color:#6ee7b7;font-size:11px;font-weight:900;letter-spacing:.08em}.creator-live-now-badge span{width:8px;height:8px;border-radius:50%;background:#fe2c55;box-shadow:0 0 12px rgba(254,44,85,.7)}
    .creator-attended-section{margin-top:26px;border:1px solid rgba(255,255,255,.09);border-radius:18px;background:rgba(255,255,255,.018);overflow:hidden}
    .creator-attended-toggle{width:100%;display:flex!important;align-items:center;justify-content:space-between;gap:12px;text-align:left!important;background:#101217!important;color:#fff!important;border:0!important;border-radius:0!important;box-shadow:none!important;padding:17px 18px!important;appearance:none!important;-webkit-appearance:none!important}
    .creator-attended-toggle>span:first-child{display:grid;gap:4px}.creator-attended-toggle strong{font-size:16px}.creator-attended-toggle-right{display:flex;align-items:center;gap:10px;color:#9aa0ab}.creator-attended-toggle-right b{min-width:30px;height:30px;padding:0 8px;display:grid;place-items:center;border-radius:999px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.035);font-size:11px}.creator-attended-toggle.open .creator-training-chevron{transform:rotate(90deg)}
    .creator-attended-panel{padding:10px 12px 12px;border-top:1px solid rgba(255,255,255,.07)}.creator-attended-panel.hidden{display:none!important}.creator-attended-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 8px;border-bottom:1px solid rgba(255,255,255,.06)}.creator-attended-item:last-child{border-bottom:0}.creator-attended-main{display:flex;align-items:center;gap:10px;min-width:0}.creator-attended-main strong{display:block;color:#fff;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.creator-attended-main small{display:block;margin-top:3px;color:#858c98;font-size:10px}.creator-attended-duration{color:#858c98;font-size:10px;white-space:nowrap}
    @media(max-width:800px){.creator-live-now-card{display:block;padding:17px}.creator-live-now-card .primary{width:100%;margin-top:14px}.creator-live-now-copy h2{font-size:21px}.creator-attended-item{align-items:flex-start}.creator-attended-duration{padding-top:4px}}
  `; document.head.appendChild(style);
})();

(function applyV24TrainingLibraryStyles(){
  if(document.getElementById('grayxon-v24-training-library')) return;
  const style=document.createElement('style'); style.id='grayxon-v24-training-library';
  style.textContent=`
    .creator-training-library{max-width:980px!important}
    .creator-training-section{margin-top:22px}
    .creator-training-section-head{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:10px}
    .creator-training-section-head h2{margin:4px 0 0;font-size:21px}
    .creator-training-section-head>span{min-width:32px;height:32px;padding:0 9px;border-radius:999px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.035);font-size:12px;font-weight:900}
    .creator-training-list{display:grid;gap:9px}
    .creator-training-item{border:1px solid rgba(255,255,255,.09);border-radius:16px;background:rgba(255,255,255,.025);overflow:hidden;box-shadow:inset 3px 0 0 rgba(37,244,238,.55)}
    .creator-training-item:nth-child(even){box-shadow:inset 3px 0 0 rgba(254,44,85,.55)}
    .creator-training-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;background:transparent;border:0;color:#fff;text-align:left}
    .creator-training-toggle-main{display:flex;align-items:center;gap:12px;min-width:0}.creator-training-icon{width:38px;height:38px;display:grid;place-items:center;border-radius:11px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);flex:0 0 38px}.creator-training-toggle strong{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.creator-training-toggle small{display:block;margin-top:4px;color:#858c98;font-size:11px}.creator-training-chevron{font-size:22px;color:#858c98;transition:transform .16s ease}.creator-training-toggle.open .creator-training-chevron{transform:rotate(90deg)}
    .creator-training-detail{padding:0 16px 15px 66px}.creator-training-detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.creator-training-detail-grid span{display:block;padding:9px 10px;border:1px solid rgba(255,255,255,.07);border-radius:11px;background:rgba(0,0,0,.12);color:#dfe3e8;font-size:11px}.creator-training-detail-grid b{display:block;color:#7f8793;font-size:9px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:3px}.creator-training-description{line-height:1.55;margin:11px 0}.creator-training-detail-actions{display:flex;justify-content:flex-end}.creator-training-empty{padding:17px;border:1px dashed rgba(255,255,255,.10);border-radius:14px;color:#858c98;text-align:center;background:rgba(255,255,255,.018)}
    @media(max-width:800px){.creator-training-detail{padding-left:16px}.creator-training-detail-grid{grid-template-columns:1fr 1fr}.creator-training-toggle{padding:13px 14px}}
  `; document.head.appendChild(style);
})();

(function applyV24CreatorReturnCleanup(){
  if(document.getElementById('grayxon-v24-return-cleanup')) return;
  const style=document.createElement('style'); style.id='grayxon-v24-return-cleanup'; style.textContent=`
    body.grayxon-creator-session #missions .missions-page > .row > button[data-space-action="space"],
    body.grayxon-creator-session #training .row > button[data-space-action="space"],
    body.grayxon-creator-session #live-training .live-training-hero > button[data-space-action="space"]{display:none!important}
  `; document.head.appendChild(style);
})();

/* GRAYXON v26 · Payment flow hardening and compact navigation */
(function applyV25Styles(){
  if(document.getElementById('grayxon-v25-styles')) return;
  const style=document.createElement('style');style.id='grayxon-v26-styles';style.textContent=`
    .admin-users-list{display:grid;gap:10px}.admin-user-row{padding:14px}.admin-user-main{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.admin-user-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}.admin-user-role{min-width:130px;border:1px solid rgba(255,255,255,.10);background:#111318;color:#fff;border-radius:10px;padding:8px 10px}.team-dashboard-modal{max-width:980px!important}.team-dashboard-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}.team-dashboard-stats .item{text-align:center;padding:13px}.team-dashboard-stats b{display:block;font-size:23px}.team-dashboard-stats small{display:block;color:#858c98;letter-spacing:.08em;font-weight:800;font-size:9px;margin-top:3px}.team-dashboard-section{margin-top:12px;border:1px solid rgba(255,255,255,.08);border-radius:15px;background:rgba(255,255,255,.018);overflow:hidden}.team-dashboard-section-head{width:100%;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 18px;border:0;background:transparent;color:#fff;font-weight:800;text-align:left}.team-dashboard-section-head.static{cursor:default}.team-dashboard-section-body{padding:0 14px 14px}.team-dashboard-accordion{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;border:0;background:transparent;color:#fff;text-align:left;padding:12px 6px}.team-dashboard-accordion small{display:block;color:#858c98;font-weight:500;margin-top:4px}.team-dashboard-chevron{transition:transform .16s ease;color:#858c98}.team-dashboard-accordion.open .team-dashboard-chevron{transform:rotate(90deg)}.team-month-summary{display:flex;gap:8px;flex-wrap:wrap;padding:10px 0}.team-month-summary span{padding:6px 9px;border-radius:999px;background:rgba(37,244,238,.06);border:1px solid rgba(37,244,238,.12);font-size:10px;color:#cbd2da}.team-month-missions{display:grid;gap:7px;margin-top:8px}.live-training-empty-compact{margin-top:14px!important}.live-training-empty-compact .live-training-empty-state{padding:24px 20px!important}.live-training-empty-compact .live-training-idle-icon{width:34px;height:34px;font-size:18px}.live-training-empty-compact h2{font-size:18px;margin:10px 0 5px}.live-training-empty-compact p{font-size:12px;line-height:1.45}.profile-payment-note{font-size:11px;color:#7f8793;margin-top:5px}
     .compact-empty-lesson{padding:22px 18px!important;min-height:0!important;text-align:center;border:1px dashed rgba(255,255,255,.10);border-radius:14px;background:rgba(255,255,255,.018)}.compact-empty-lesson .empty-icon{font-size:24px;margin-bottom:7px}.compact-empty-lesson h2{font-size:17px;margin:0 0 5px}.compact-empty-lesson p{font-size:12px;margin:0}.creator-training-detail-actions .primary.small,.creator-training-detail-actions .secondary.small{min-height:36px}
@media(max-width:800px){.team-dashboard-stats{grid-template-columns:1fr 1fr}.admin-user-actions>*{flex:1 1 auto}.team-dashboard-section-head{padding:14px}.team-dashboard-modal{width:calc(100vw - 20px)!important}}
  `;document.head.appendChild(style);
})();


/* GRAYXON v30 · formación: avance automático y cierre de módulo */
(function applyV30FormationFlowStyles(){
  if(document.getElementById('grayxon-v30-formation-flow')) return;
  const style=document.createElement('style');
  style.id='grayxon-v30-formation-flow';
  style.textContent=`
    .module-completion-popup{text-align:center;padding:8px 4px 2px}
    .module-completion-icon{width:64px;height:64px;border-radius:50%;display:grid;place-items:center;margin:2px auto 14px;border:1px solid rgba(110,231,183,.35);background:rgba(110,231,183,.08);color:#6ee7b7;font-size:30px;font-weight:900;box-shadow:0 0 0 7px rgba(110,231,183,.035)}
    .module-completion-popup h2{margin:7px 0 8px;font-size:24px}
    .module-completion-message{margin:0 auto;max-width:430px;color:#cfd5dc;line-height:1.6}
    .module-completion-next{margin:16px auto 4px;max-width:430px;padding:11px 13px;border:1px solid rgba(37,244,238,.13);border-radius:12px;background:rgba(255,255,255,.025);color:#aeb5bf;font-size:12px}
    .module-completion-actions{justify-content:center;margin-top:18px}
    .module-completion-actions .primary{min-width:190px}
    #lessonView > #completeLesson{margin-top:14px}
  `;
  document.head.appendChild(style);
})();

/* GRAYXON v32 · final UI/navigation hardening */
(function applyV32FinalFixes(){
  if(document.getElementById('grayxon-v32-final-fixes')) return;
  const style=document.createElement('style');
  style.id='grayxon-v32-final-fixes';
  style.textContent=`
    /* Formación: two-level compact accordions, same visual language as Entrenamientos. */
    #training .formation-page{display:block!important;width:100%!important;box-sizing:border-box!important}
    #training .formation-groups{display:grid!important;gap:12px!important;margin-top:18px!important}
    #training .formation-group{display:block!important;overflow:hidden!important;border:1px solid rgba(255,255,255,.09)!important;border-radius:18px!important;background:#0f1115!important;box-shadow:none!important}
    #training .formation-group-toggle{display:flex!important;align-items:center!important;justify-content:space-between!important;width:100%!important;min-height:66px!important;padding:14px 16px!important;background:#0f1115!important;color:#fff!important;border:0!important;border-radius:0!important;box-shadow:none!important;text-align:left!important;appearance:none!important;-webkit-appearance:none!important}
    #training .formation-group-toggle>span:first-child{display:grid!important;gap:3px!important}
    #training .formation-group-toggle .eyebrow{margin:0!important;font-size:10px!important;letter-spacing:.16em!important}
    #training .formation-group-toggle strong{font-size:18px!important;line-height:1.2!important}
    #training .formation-group-toggle-right{display:flex!important;align-items:center!important;gap:9px!important}
    #training .formation-group-toggle-right b{min-width:30px!important;height:30px!important;padding:0 8px!important;display:grid!important;place-items:center!important;border-radius:999px!important;border:1px solid rgba(255,255,255,.10)!important;background:rgba(255,255,255,.035)!important;color:#cfd5dc!important;font-size:11px!important}
    #training .formation-group-chevron{font-size:22px!important;color:#858c98!important;transition:transform .18s ease!important}
    #training .formation-group.is-open .formation-group-chevron{transform:rotate(90deg)!important}
    #training .formation-group-panel{display:block!important;padding:0 10px 10px!important;border-top:1px solid rgba(255,255,255,.07)!important}
    #training .formation-group-panel.hidden{display:none!important}
    #training .formation-group-list{display:grid!important;gap:8px!important;padding-top:10px!important}
    #training .formation-module-accordion{background:#11141a!important;border:1px solid rgba(255,255,255,.08)!important;border-radius:15px!important;overflow:hidden!important}
    #training .formation-module-toggle{background:#11141a!important;color:#fff!important;border:0!important;box-shadow:none!important;min-height:62px!important;padding:12px 13px!important}
    #training .formation-module-copy strong{color:#fff!important}
    #training .formation-module-copy small{color:#858c98!important}
    #training .formation-module-meta{color:#aeb5bf!important}
    #training .formation-module-panel{background:#0d1014!important}
    #training .formation-lessons-list .lesson button{background:transparent!important;color:#fff!important;border:0!important;box-shadow:none!important;text-align:left!important}
    @media(max-width:800px){
      #training .row>h1,#training h1{font-size:34px!important;line-height:1.08!important}
      #training .formation-progress-card{margin-top:14px!important;padding:14px!important}
      #training .formation-group-toggle{min-height:62px!important;padding:13px 14px!important}
      #training .formation-group-toggle strong{font-size:17px!important}
      #training .formation-group-panel{padding:0 7px 8px!important}
      #training .formation-module-toggle{min-height:58px!important;padding:12px!important}
    }

    /* Instalación Grayxon: botón premium, no gris. */
    #installGrayxonDashboard{
      border:1px solid rgba(255,255,255,.20)!important;
      box-shadow:0 10px 28px rgba(0,0,0,.28)!important;
      font-weight:700!important;
      letter-spacing:.01em!important;
      min-height:40px!important;
      padding:9px 14px!important;
    }
    #installGrayxonDashboard:hover{transform:translateY(-1px);}

    /* Creator Entrenamientos: only an actual LIVE goes in the main area. */
    #live-training .creator-training-library .creator-live-now-section{margin-top:18px!important}
    #live-training .creator-training-library .creator-attended-section{margin-top:18px!important}
    #live-training .creator-training-library .creator-attended-toggle{min-height:62px!important}
    #live-training .creator-training-library .creator-attended-panel.hidden{display:none!important}
  `;
  document.head.appendChild(style);
})();

try{ sessionStorage.removeItem('grayxon_live_diag'); }catch(_){}
init();

document.addEventListener('visibilitychange', () => { if (!document.hidden && session) { loadNotifications(); if(profile?.role==='creator' && current==='space') refreshLiveTrainingCard(); refreshGrayxonPwaPreferenceUI(); if(profile?.role==='creator') { registerGrayxonPush({requestPermission:false}).catch(()=>{}); setTimeout(()=>showGrayxonPushPrompt(),500); } } });
setInterval(() => { if (!document.hidden && session) { loadNotifications(); if(profile?.role==='manager' && managerView==='dashboard') refreshManagerLiveDashboardCard(); if(profile?.role==='creator' && current==='space') refreshLiveTrainingCard(); } }, 5000);

window.addEventListener('popstate', () => {
  const hashPage = window.location.hash.replace(/^#/, '');
  const page = history.state?.page || hashPage || 'home';
  if (page === 'live-training') ensureLiveTrainingPage();
  current = ['home','benefits','auth','space','manager','training','live-training','missions','profile','admin','announcements'].includes(page) ? page : 'home';
  render();
  updateCreatorSpaceFloat();
  updateCreatorTopNav();
  window.scrollTo(0, 0);
});

async function handleGrayxonDeepLinkUrl(urlValue) {
  try {
    const parsed = new URL(String(urlValue || ''), window.location.href);
    const page = parsed.hash.replace(/^#/, '') || 'home';
    const deepLiveMatch = page.match(/^live-training\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);
    if (!(session && profile?.role === 'creator' && deepLiveMatch)) return false;

    const liveId = deepLiveMatch[1];
    const { data: targetLive } = await sb.from('live_trainings')
      .select('id,title,description,scheduled_at,room_name,status,created_by,instructor_name,created_at,started_at,ended_at')
      .eq('id', liveId)
      .eq('status', 'live')
      .maybeSingle();

    if (!targetLive) return false;
    currentLiveTraining = targetLive;
    pendingLiveTrainingAutoStart = { id: targetLive.id };
    if (window.location.hash !== `#live-training/${targetLive.id}`) {
      window.history.replaceState({ page: 'live-training' }, '', `${window.location.pathname}${window.location.search}#live-training/${targetLive.id}`);
    }
    if (current !== 'live-training') {
      current = 'live-training';
      render();
    } else {
      ensureLiveTrainingPage();
    }
    updateCreatorSpaceFloat();
    updateCreatorTopNav();
    window.scrollTo(0, 0);
    return true;
  } catch (_) {
    return false;
  }
}

window.addEventListener('message', async (event) => {
  const data = event?.data;
  if (!data || data.type !== 'GRAYXON_NOTIFICATION_NAVIGATE' || !data.url) return;
  await handleGrayxonDeepLinkUrl(data.url);
});

window.addEventListener('hashchange', async () => {
  const page = window.location.hash.replace(/^#/, '') || 'home';
  const deepLiveMatch = page.match(/^live-training\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);

  // Deep-link LIVE: también debe funcionar cuando Grayxon ya está abierto.
  // No modificamos el flujo normal de live-training; solo interceptamos URLs con UUID.
  if (session && profile?.role === 'creator' && deepLiveMatch) {
    const liveId = deepLiveMatch[1];
    const { data: targetLive } = await sb.from('live_trainings')
      .select('id,title,description,scheduled_at,room_name,status,created_by,instructor_name,created_at,started_at,ended_at')
      .eq('id', liveId)
      .eq('status', 'live')
      .maybeSingle();

    if (targetLive) {
      currentLiveTraining = targetLive;
      pendingLiveTrainingAutoStart = { id: targetLive.id };
      if (current !== 'live-training') {
        current = 'live-training';
        render();
      } else {
        ensureLiveTrainingPage();
      }
      updateCreatorSpaceFloat();
      updateCreatorTopNav();
      window.scrollTo(0, 0);
      return;
    }
  }

  if (page === 'live-training') ensureLiveTrainingPage();
  if (!['home','benefits','auth','space','manager','training','live-training','missions','profile','admin','announcements'].includes(page)) return;
  if (current === page) return;
  current = page;
  render();
  updateCreatorSpaceFloat();
  window.scrollTo(0, 0);
});
/* v23 · creator space return stability */


/* GRAYXON v38 · next-content prompt for video lessons */
(function ensureLessonNextPromptStyles(){
  if(document.getElementById('grayxon-v38-next-content')) return;
  const style=document.createElement('style');
  style.id='grayxon-v38-next-content';
  style.textContent=`
    .lesson-next-prompt{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:9998;width:min(760px,calc(100vw - 28px));display:flex;align-items:center;justify-content:space-between;gap:18px;padding:14px 16px;border:1px solid rgba(255,255,255,.12);border-radius:16px;background:rgba(13,15,20,.96);box-shadow:0 18px 60px rgba(0,0,0,.45);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
    .lesson-next-prompt-copy{display:grid;gap:3px;min-width:0}.lesson-next-prompt-copy .eyebrow{font-size:9px;letter-spacing:.16em;color:#858c98}.lesson-next-prompt-copy strong{font-size:14px;line-height:1.3;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lesson-next-countdown{font-size:10px;color:#aeb5bf}.lesson-next-prompt-btn{white-space:nowrap;min-height:38px;padding:0 16px}
    @media(max-width:640px){.lesson-next-prompt{bottom:12px;width:calc(100vw - 20px);padding:12px;gap:10px}.lesson-next-prompt-copy strong{font-size:13px}.lesson-next-prompt-btn{min-height:36px;padding:0 12px;font-size:12px}}
  `;
  document.head.appendChild(style);
})();

/* GRAYXON v35 · live dashboard + focused formation content */
(function applyV35Fixes(){
  if(document.getElementById('grayxon-v35-fixes')) return;
  const style=document.createElement('style');
  style.id='grayxon-v35-fixes';
  style.textContent=`
    /* When a lesson is open, the lesson is the only formation content shown. */
    #training .formation-page.lesson-focus-mode{max-width:none!important;width:100%!important;min-height:calc(100vh - 40px)!important}
    #training .formation-page.lesson-focus-mode>.row,
    #training .formation-page.lesson-focus-mode>.formation-progress-card,
    #training .formation-page.lesson-focus-mode>.formation-groups{display:none!important}
    #training .formation-page.lesson-focus-mode>#lessonView.lesson-focus-active{display:block!important;visibility:visible!important;position:relative!important;margin:0!important;padding:clamp(18px,4vw,42px)!important;min-height:calc(100vh - 40px)!important;width:100%!important;box-sizing:border-box!important;border:0!important;border-radius:0!important;background:#08090c!important}
    #training .lesson-focus-active .lesson-header{max-width:1000px!important;margin:0 auto 24px!important}
    #training .lesson-focus-active .video-wrap{width:min(1100px,100%)!important;margin:0 auto!important}
    #training .lesson-focus-active .video-wrap video{display:block!important;width:100%!important;max-height:72vh!important;object-fit:contain!important;background:#000!important;border-radius:16px!important}
    #training .lesson-focus-active>.section{max-width:1000px!important;margin:22px auto!important}
    #training .lesson-focus-active>#completeLesson{display:block!important;margin:20px auto!important;min-width:190px!important}
    @media(max-width:800px){
      #training .formation-page.lesson-focus-mode>#lessonView.lesson-focus-active{padding:12px 10px 24px!important;min-height:calc(100vh - 20px)!important}
      #training .lesson-focus-active .lesson-header{margin-bottom:14px!important}
      #training .lesson-focus-active .video-wrap video{max-height:64vh!important;border-radius:10px!important}
    }
  `;
  document.head.appendChild(style);
})();


/* GRAYXON v39 · formación: siguiente contenido + popup centrados */
(function applyV39FormationFlowStyles(){
  if(document.getElementById('grayxon-v39-formation-flow')) return;
  const style=document.createElement('style');
  style.id='grayxon-v39-formation-flow';
  style.textContent=`
    /* El aviso de siguiente contenido debe aparecer en el centro de la pantalla. */
    .lesson-next-prompt{
      position:fixed!important;
      left:50%!important;
      top:50%!important;
      bottom:auto!important;
      transform:translate(-50%,-50%)!important;
      z-index:10050!important;
      width:min(460px,calc(100vw - 30px))!important;
      display:grid!important;
      gap:18px!important;
      padding:24px!important;
      border:1px solid rgba(255,255,255,.14)!important;
      border-radius:20px!important;
      background:linear-gradient(145deg,rgba(18,21,27,.98),rgba(8,10,14,.98))!important;
      box-shadow:0 28px 90px rgba(0,0,0,.58),0 0 0 1px rgba(255,255,255,.025)!important;
      backdrop-filter:blur(18px)!important;
      -webkit-backdrop-filter:blur(18px)!important;
      text-align:center!important;
    }
    .lesson-next-prompt-copy{display:grid!important;gap:7px!important;min-width:0!important;justify-items:center!important}
    .lesson-next-prompt-copy .eyebrow{font-size:10px!important;letter-spacing:.18em!important;color:#8f98a5!important}
    .lesson-next-prompt-copy strong{font-size:18px!important;line-height:1.35!important;color:#fff!important;white-space:normal!important;overflow:visible!important;text-overflow:clip!important}
    .lesson-next-countdown{font-size:11px!important;color:#9fa7b2!important}
    .lesson-next-prompt-btn,
    .module-completion-cta{
      width:100%!important;
      min-height:46px!important;
      border:0!important;
      border-radius:12px!important;
      background:linear-gradient(135deg,#f4f6f8 0%,#c5cbd2 48%,#8f969f 100%)!important;
      color:#090b0f!important;
      font-weight:900!important;
      box-shadow:0 10px 28px rgba(255,255,255,.10)!important;
      transition:transform .16s ease,filter .16s ease,box-shadow .16s ease!important;
    }
    .lesson-next-prompt-btn:hover,
    .module-completion-cta:hover{filter:brightness(1.06)!important;transform:translateY(-1px)!important;box-shadow:0 14px 34px rgba(255,255,255,.14)!important}

    /* Popup de módulo completado: centrado real, sin quedar pegado arriba. */
    .formation-completion-backdrop{
      position:fixed!important;
      inset:0!important;
      z-index:10040!important;
      display:flex!important;
      align-items:center!important;
      justify-content:center!important;
      padding:20px!important;
      box-sizing:border-box!important;
      overflow:auto!important;
    }
    .formation-completion-backdrop>.modal{
      width:min(520px,calc(100vw - 32px))!important;
      max-width:520px!important;
      margin:auto!important;
      transform:none!important;
    }
    .formation-completion-backdrop .module-completion-popup{text-align:center!important}
    .formation-completion-backdrop .module-completion-actions{display:flex!important;justify-content:center!important}
    @media(max-width:640px){
      .lesson-next-prompt{width:calc(100vw - 28px)!important;padding:20px!important;border-radius:18px!important}
      .lesson-next-prompt-copy strong{font-size:16px!important}
      .lesson-next-prompt-btn{min-height:44px!important}
      .formation-completion-backdrop{padding:14px!important}
      .formation-completion-backdrop>.modal{width:calc(100vw - 28px)!important}
    }
  `;
  document.head.appendChild(style);
})();


/* GRAYXON · CENTRO DE COMUNICADOS (aditivo, sin modificar el sistema LIVE/push existente) */
let gxAnnouncementsTeams = [];
let gxAnnouncementFiles = [];
const GX_ANNOUNCEMENT_BUCKET = 'announcement-media';
function gxAnnouncementCanPublish(){ return !!session && ['admin','manager'].includes(profile?.role); }
function gxAnnouncementEsc(v){ return esc(String(v ?? '')); }
function gxAnnouncementDashboardCard(creatorCard=false){
  const cls=creatorCard?'creator-dashboard-card gx-ann-dashboard-card':'dashboard-announcement-card gx-ann-dashboard-card';
  return `<button type="button" class="${cls}" data-page="announcements"><span class="gx-ann-dashboard-icon">📣</span><span class="gx-ann-dashboard-copy"><strong>Centro de comunicados</strong><small>Novedades, avisos importantes y recursos de tu equipo.</small><span class="gx-ann-unread-badge hidden" data-gx-ann-unread-badge aria-live="polite"><b>0</b> pendientes por leer</span></span><span class="gx-ann-dashboard-arrow">›</span></button>`;
}
let gxAnnouncementUnreadRequest=null;
async function gxRefreshAnnouncementUnreadCount(){
  if(!session?.user?.id||!sb)return;
  if(!document.querySelector('[data-gx-ann-unread-badge]'))return;
  if(gxAnnouncementUnreadRequest)return gxAnnouncementUnreadRequest;
  gxAnnouncementUnreadRequest=(async()=>{
    const visibleIds=[];
    for(let start=0;start<100000;start+=1000){
      const {data,error}=await sb.from('announcements').select('id').order('created_at',{ascending:false}).range(start,start+999);
      if(error){console.warn('Comunicados: no se pudo calcular el contador',error.message);return;}
      const page=data||[];visibleIds.push(...page.map(x=>x.id));
      if(page.length<1000)break;
    }
    let unread=0;
    if(visibleIds.length){
      const readIds=new Set();
      for(let start=0;start<visibleIds.length;start+=500){
        const chunk=visibleIds.slice(start,start+500);
        const {data,error}=await sb.from('announcement_reads').select('announcement_id').eq('user_id',session.user.id).in('announcement_id',chunk);
        if(error){console.warn('Comunicados: no se pudo consultar las lecturas',error.message);return;}
        (data||[]).forEach(x=>readIds.add(x.announcement_id));
      }
      unread=visibleIds.filter(id=>!readIds.has(id)).length;
    }
    document.querySelectorAll('[data-gx-ann-unread-badge]').forEach(badge=>{
      const number=badge.querySelector('b');if(number)number.textContent=String(unread);
      badge.classList.toggle('hidden',unread===0);
      badge.setAttribute('aria-label',`${unread} comunicados pendientes por leer`);
    });
  })();
  try{await gxAnnouncementUnreadRequest;}finally{gxAnnouncementUnreadRequest=null;}
}
(function gxBindAnnouncementUnreadRefresh(){
  if(window.__gxAnnUnreadRefreshBound)return;window.__gxAnnUnreadRefreshBound=true;
  window.addEventListener('focus',()=>{if(session)gxRefreshAnnouncementUnreadCount();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&session)gxRefreshAnnouncementUnreadCount();});
})();
function gxAnnouncementDashboardTarget(){ return profile?.role==='admin'?'admin':profile?.role==='manager'?'manager':'space'; }
async function gxLoadAnnouncementTeams(){
  const {data,error}=await sb.from('teams').select('id,name,manager_id').order('name');
  if(error){ console.warn('Comunicados: equipos',error.message); return []; }
  let teams=data||[];
  if(profile?.role==='manager'){
    const {data:ownTeamIds,error:teamError}=await sb.rpc('grayxon_my_team_ids');
    const ids=new Set((ownTeamIds||[]).map(x=>typeof x==='string'?x:(x?.grayxon_my_team_ids||'')));
    teams=teamError?teams.filter(t=>t.id===profile.team_id):teams.filter(t=>ids.has(t.id));
  }
  gxAnnouncementsTeams=teams; return teams;
}
async function announcementsTpl(){
  const el=$('#announcements'); if(!el)return;
  if(!session){el.innerHTML=`<div class="gx-ann-wrap"><div class="gx-ann-hero"><span class="eyebrow">GRAYXON · COMUNIDAD</span><h1>Centro de comunicados</h1><p>Inicia sesión para consultar los avisos de tu agencia.</p><button class="btn primary" data-page="auth">Iniciar sesión</button></div></div>`;return;}
  el.innerHTML=`<div class="gx-ann-wrap"><div class="gx-ann-topbar"><button type="button" class="gx-ann-back" data-page="${gxAnnouncementDashboardTarget()}">← Volver al dashboard</button></div><div class="gx-ann-hero"><div><span class="eyebrow">GRAYXON · COMUNIDAD</span><h1>Centro de comunicados</h1><p>Información importante, novedades y recursos de tu equipo, en un solo lugar.</p></div><span class="gx-ann-mark">📣</span></div><div id="gxAnnComposerMount"></div><div class="gx-ann-feed-head"><div><h2>Comunicados recientes</h2><p>Los avisos que corresponden a tu perfil y equipo.</p></div><button class="gx-ann-refresh" id="gxAnnRefresh">↻ Actualizar</button></div><div id="gxAnnFeed" class="gx-ann-feed"><div class="gx-ann-empty">Cargando comunicados…</div></div></div>`;
  const teams=await gxLoadAnnouncementTeams();
  if(gxAnnouncementCanPublish()){
    const admin=profile.role==='admin';
    $('#gxAnnComposerMount').innerHTML=`<details id="gxAnnComposerDetails" class="gx-ann-composer-details"><summary class="gx-ann-composer-summary"><span class="gx-ann-compose-icon">✦</span><span><strong>Crear comunicado</strong><small>Comparte información con las personas correspondientes.</small></span><b class="gx-ann-compose-chevron">⌄</b></summary><form id="gxAnnComposer" class="gx-ann-composer"><label>Título<input id="gxAnnTitle" maxlength="140" required placeholder="Ej. Información importante de esta semana"></label><label>Mensaje<textarea id="gxAnnBody" rows="4" maxlength="12000" placeholder="Escribe aquí el comunicado…"></textarea></label><div class="gx-ann-targets"><label>Dirigido a<select id="gxAnnTarget" ${admin?'':'disabled'}>${admin?'<option value="agency">Toda la agencia (managers y creadores)</option><option value="managers">Solo managers</option><option value="teams">Equipos específicos</option>':'<option value="teams">Mi equipo</option>'}</select></label><div id="gxAnnTeamChoices" class="gx-ann-team-choices ${admin?'hidden':''}">${teams.map(t=>`<label><input type="checkbox" name="gxAnnTeam" value="${gxAnnouncementEsc(t.id)}" ${!admin?'checked disabled':''}><span>${gxAnnouncementEsc(t.name)}</span></label>`).join('')||'<small>No tienes un equipo asignado. Contacta al administrador.</small>'}</div></div><label class="gx-ann-upload">Adjuntar contenido para visualizar<input id="gxAnnFiles" type="file" multiple accept="image/*,video/*,audio/*,.pdf"><small id="gxAnnFileNames">Formatos de vista previa: imágenes, video, audio y PDF. No se mostrarán botones de descarga. Máximo 50 MB por archivo.</small></label><button class="gx-ann-publish" type="submit">Publicar comunicado <span>↗</span></button><div id="gxAnnComposerStatus" class="gx-ann-status" aria-live="polite"></div></form></details>`;
    $('#gxAnnTarget')?.addEventListener('change',e=>$('#gxAnnTeamChoices')?.classList.toggle('hidden',e.target.value!=='teams'));
    $('#gxAnnFiles')?.addEventListener('change',e=>{gxAnnouncementFiles=Array.from(e.target.files||[]);$('#gxAnnFileNames').textContent=gxAnnouncementFiles.length?gxAnnouncementFiles.map(f=>`${f.name} (${(f.size/1048576).toFixed(1)} MB)`).join(' · '):'Puedes adjuntar varios archivos. Tamaño máximo recomendado: 50 MB por archivo.';});
    $('#gxAnnComposer')?.addEventListener('submit',gxPublishAnnouncement);
  }
  $('#gxAnnRefresh')?.addEventListener('click',gxLoadAnnouncements);
  await gxLoadAnnouncements();
}
async function gxLoadAnnouncements(){
  const feed=$('#gxAnnFeed'); if(!feed||!session)return;
  feed.innerHTML='<div class="gx-ann-empty">Actualizando comunicados…</div>';
  const {data,error}=await sb.from('announcements').select('id,author_id,title,body,target_type,created_at,author:profiles!announcements_author_id_fkey(full_name,username,role),announcement_teams(team_id,team:teams(name)),announcement_attachments(id,file_name,mime_type,file_size,storage_path)').order('created_at',{ascending:false}).limit(60);
  if(error){feed.innerHTML=`<div class="gx-ann-empty"><strong>No se pudieron cargar los comunicados.</strong><span>${gxAnnouncementEsc(error.message)}<br>Si es la primera instalación, ejecuta primero el SQL incluido en el paquete.</span></div>`;return;}
  const items=data||[]; if(!items.length){feed.innerHTML='<div class="gx-ann-empty"><strong>Aún no hay comunicados.</strong><span>Cuando se publique uno para tu audiencia, aparecerá aquí.</span></div>';await gxRefreshAnnouncementUnreadCount();return;}
  const ids=items.map(x=>x.id);
  const [{data:reads},{data:reactions},{data:mineReads},{data:mineReactions}]=await Promise.all([
    profile?.role==='admin'?sb.rpc('grayxon_announcement_read_status',{p_announcement_ids:ids}):Promise.resolve({data:[]}),
    sb.from('announcement_reactions').select('announcement_id,emoji,user_id').in('announcement_id',ids),
    sb.from('announcement_reads').select('announcement_id').eq('user_id',session.user.id).in('announcement_id',ids),
    sb.from('announcement_reactions').select('announcement_id,emoji').eq('user_id',session.user.id).in('announcement_id',ids)
  ]);
  const readSet=new Set((mineReads||[]).map(x=>x.announcement_id)); const myReactions=new Set((mineReactions||[]).map(x=>`${x.announcement_id}:${x.emoji}`));
  feed.innerHTML=items.map(a=>{
    const author=a.author?.full_name||a.author?.username||'Grayxon';
    const aud=a.target_type==='agency'?'Toda la agencia':a.target_type==='managers'?'Managers':(a.announcement_teams||[]).map(x=>x.team?.name).filter(Boolean).join(', ')||'Equipo';
    const media=(a.announcement_attachments||[]).map(f=>`<div class="gx-ann-inline-media" data-ann-inline-path="${gxAnnouncementEsc(f.storage_path)}" data-ann-inline-name="${gxAnnouncementEsc(f.file_name)}" data-ann-inline-mime="${gxAnnouncementEsc(f.mime_type)}"><span class="gx-ann-media-loading">${f.mime_type?.startsWith('image/')?'🖼️':f.mime_type?.startsWith('video/')?'🎬':f.mime_type?.startsWith('audio/')?'🎧':f.mime_type==='application/pdf'?'📄':'👁️'} ${gxAnnouncementEsc(f.file_name)}</span></div>`).join('');
    const rx=(reactions||[]).filter(r=>r.announcement_id===a.id);const emojiCounts=['👍','❤️','👏','🔥','😂'].map(e=>{const count=rx.filter(r=>r.emoji===e).length;return `<button class="gx-ann-reaction ${myReactions.has(`${a.id}:${e}`)?'is-active':''}" data-ann-react="${a.id}" data-ann-emoji="${e}" aria-label="Reaccionar ${e}">${e}<small>${count||''}</small></button>`}).join('');
    const own=a.author_id===session.user.id; const canDelete=profile?.role==='admin'||(profile?.role==='manager'&&own);
    const readRows=(reads||[]).filter(r=>r.announcement_id===a.id);const readCount=readRows.filter(r=>r.has_read).length;const adminReads=profile?.role==='admin'?`<details class="gx-ann-reads"><summary>Lecturas · ${readCount}/${readRows.length} leyeron</summary><div class="gx-ann-read-list">${readRows.length?readRows.map(r=>`<span>${r.has_read?'✓':'○'} ${gxAnnouncementEsc(r.full_name||r.username||'Usuario')} <small>${r.has_read?`Leído ${new Date(r.read_at).toLocaleString('es-CO')}`:'Pendiente de lectura'}</small></span>`).join(''):'No hay destinatarios activos para este comunicado.'}</div></details>`:'';
    return `<article class="gx-ann-card" data-ann-card="${a.id}"><div class="gx-ann-card-top"><div class="gx-ann-avatar">${gxAnnouncementEsc(author.trim().charAt(0).toUpperCase()||'G')}</div><div class="gx-ann-byline"><strong>${gxAnnouncementEsc(author)}</strong><small>${new Date(a.created_at).toLocaleString('es-CO',{dateStyle:'medium',timeStyle:'short'})} · ${gxAnnouncementEsc(aud)}</small></div>${canDelete?`<button class="gx-ann-delete" data-ann-delete="${a.id}" title="Eliminar comunicado">Eliminar</button>`:''}</div><h3>${gxAnnouncementEsc(a.title)}</h3><div class="gx-ann-body">${gxAnnouncementEsc(a.body||'').replace(/\n/g,'<br>')}</div>${media?`<div class="gx-ann-media-grid">${media}</div>`:''}<div class="gx-ann-reactions">${emojiCounts}</div>${adminReads}</article>`;
  }).join('');
  // Record the read after rendering. The unique key makes repeat visits safe.
  const unread=ids.filter(id=>!readSet.has(id)); if(unread.length) await sb.from('announcement_reads').upsert(unread.map(announcement_id=>({announcement_id,user_id:session.user.id})),{onConflict:'announcement_id,user_id',ignoreDuplicates:true});
  await gxRefreshAnnouncementUnreadCount();
  for(const node of feed.querySelectorAll('[data-ann-inline-path]')){const path=node.dataset.annInlinePath;const mime=node.dataset.annInlineMime;const name=node.dataset.annInlineName;const {data:d}=await sb.storage.from(GX_ANNOUNCEMENT_BUCKET).createSignedUrl(path,300,{download:false});if(!d?.signedUrl){node.innerHTML='<span class="gx-ann-preview-error">No se pudo cargar la vista previa.</span>';continue;}if(mime?.startsWith('image/')){node.innerHTML=`<button type="button" class="gx-ann-image-open" aria-label="Ampliar imagen"><img src="${d.signedUrl}" alt="${gxAnnouncementEsc(name)}" loading="lazy" draggable="false" oncontextmenu="return false"><span>Ampliar imagen ⤢</span></button>`;node.querySelector('button')?.addEventListener('click',()=>gxOpenAnnouncementPreview(d.signedUrl,'image',name));}else if(mime?.startsWith('video/'))node.innerHTML=`<video controls controlsList="nodownload noremoteplayback" disablepictureinpicture playsinline preload="metadata" oncontextmenu="return false" src="${d.signedUrl}"></video>`;else if(mime?.startsWith('audio/'))node.innerHTML=`<audio controls controlsList="nodownload noremoteplayback" preload="metadata" oncontextmenu="return false" src="${d.signedUrl}"></audio>`;else if(mime==='application/pdf')node.innerHTML=`<div class="gx-ann-pdf-wrap"><div class="gx-ann-pdf-label">📄 ${gxAnnouncementEsc(name)} · Vista previa</div><iframe title="Vista previa de ${gxAnnouncementEsc(name)}" src="${d.signedUrl}#toolbar=0&navpanes=0&scrollbar=0" loading="lazy" oncontextmenu="return false"></iframe></div>`;else node.innerHTML=`<div class="gx-ann-preview-error">${gxAnnouncementEsc(name)} · Este formato no admite vista previa integrada. Adjunta una imagen, video, audio o PDF para que el contenido se vea aquí sin un botón de descarga.</div>`;}
  feed.querySelectorAll('[data-ann-react]').forEach(b=>b.onclick=()=>gxToggleAnnouncementReaction(b.dataset.annReact,b.dataset.annEmoji));
  feed.querySelectorAll('[data-ann-delete]').forEach(b=>b.onclick=()=>gxDeleteAnnouncement(b.dataset.annDelete));
}
async function gxPublishAnnouncement(e){
  e.preventDefault(); const status=$('#gxAnnComposerStatus');const btn=e.submitter;const title=$('#gxAnnTitle')?.value.trim();const body=$('#gxAnnBody')?.value.trim();const target=$('#gxAnnTarget')?.value||'teams';
  const teamIds=target==='teams'?Array.from(document.querySelectorAll('input[name="gxAnnTeam"]:checked')).map(x=>x.value):[];
  if(!title||(!body&&!gxAnnouncementFiles.length)){status.textContent='Escribe un título y un mensaje o adjunta al menos un archivo.';return;}
  if(target==='teams'&&!teamIds.length){status.textContent='Selecciona al menos un equipo.';return;}
  if(gxAnnouncementFiles.some(f=>f.size>50*1024*1024)){status.textContent='Cada archivo debe pesar máximo 50 MB.';return;}
  if(gxAnnouncementFiles.some(f=>!(f.type.startsWith('image/')||f.type.startsWith('video/')||f.type.startsWith('audio/')||f.type==='application/pdf'))){status.textContent='Para mantener los comunicados en modo visualización, adjunta imágenes, video, audio o PDF.';return;}
  btn.disabled=true;status.textContent='Publicando comunicado…';
  try{
    const {data:a,error}=await sb.from('announcements').insert({author_id:session.user.id,title,body:body||'',target_type:target}).select('id').single();
    if(error)throw error;
    if(teamIds.length){const {error:te}=await sb.from('announcement_teams').insert(teamIds.map(team_id=>({announcement_id:a.id,team_id})));if(te)throw te;}
    for(const file of gxAnnouncementFiles){const safeName=(file.name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^_+|_+$/g,'').slice(-100)||'archivo');const path=`${a.id}/${crypto.randomUUID()}-${safeName}`;const {error:up}=await sb.storage.from(GX_ANNOUNCEMENT_BUCKET).upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});if(up)throw up;const {error:meta}=await sb.from('announcement_attachments').insert({announcement_id:a.id,uploaded_by:session.user.id,file_name:file.name,mime_type:file.type||'application/octet-stream',file_size:file.size,storage_path:path});if(meta)throw meta;}
    const {error:notifyError}=await sb.rpc('notify_announcement_recipients',{p_announcement_id:a.id});if(notifyError)console.warn('Comunicado publicado; notificación pendiente:',notifyError.message);
    gxAnnouncementFiles=[];await announcementsTpl();toast('Comunicado publicado ✓');
  }catch(err){console.error('Publicar comunicado',err);status.textContent=`No se pudo completar: ${err.message||err}. Revisa que la migración SQL esté aplicada y los permisos de almacenamiento configurados.`;}
  finally{if(btn)btn.disabled=false;}
}
async function gxToggleAnnouncementReaction(id,emoji){
  const {data:existing,error:readError}=await sb.from('announcement_reactions').select('announcement_id').eq('announcement_id',id).eq('user_id',session.user.id).eq('emoji',emoji).maybeSingle();if(readError){toast('No se pudo consultar la reacción.');return;}
  const result=existing?await sb.from('announcement_reactions').delete().eq('announcement_id',id).eq('user_id',session.user.id).eq('emoji',emoji):await sb.from('announcement_reactions').insert({announcement_id:id,user_id:session.user.id,emoji});
  if(result.error){toast('No se pudo guardar la reacción.');return;}await gxLoadAnnouncements();
}
async function gxDeleteAnnouncement(id){
  if(!confirm('¿Eliminar este comunicado y sus adjuntos? Esta acción no se puede deshacer.'))return;
  const {data:files}=await sb.from('announcement_attachments').select('storage_path').eq('announcement_id',id);
  if(files?.length)await sb.storage.from(GX_ANNOUNCEMENT_BUCKET).remove(files.map(f=>f.storage_path));
  const {error}=await sb.from('announcements').delete().eq('id',id);if(error){toast(`No se pudo eliminar: ${error.message}`);return;}toast('Comunicado eliminado ✓');await gxLoadAnnouncements();
}
function gxOpenAnnouncementPreview(url,type,name){
  let overlay=document.getElementById('gxAnnPreviewOverlay');if(!overlay){overlay=document.createElement('div');overlay.id='gxAnnPreviewOverlay';overlay.className='gx-ann-preview-overlay';overlay.innerHTML='<button type="button" class="gx-ann-preview-close" aria-label="Cerrar vista previa">✕</button><div class="gx-ann-preview-stage"></div>';document.body.appendChild(overlay);overlay.addEventListener('click',e=>{if(e.target===overlay||e.target.closest('.gx-ann-preview-close')){overlay.classList.remove('is-open');overlay.querySelector('.gx-ann-preview-stage').replaceChildren();}});document.addEventListener('keydown',e=>{if(e.key==='Escape'){overlay.classList.remove('is-open');overlay.querySelector('.gx-ann-preview-stage').replaceChildren();}});}
  const stage=overlay.querySelector('.gx-ann-preview-stage');stage.replaceChildren();const img=document.createElement('img');img.src=url;img.alt=name||'Vista previa';stage.appendChild(img);overlay.classList.add('is-open');
}
(function gxAnnouncementStyles(){if(document.getElementById('gx-announcement-styles'))return;const style=document.createElement('style');style.id='gx-announcement-styles';style.textContent=`
.gx-ann-dashboard-card{width:100%;display:flex;align-items:center;gap:14px;text-align:left;box-sizing:border-box;padding:16px 18px;border:1px solid rgba(37,244,238,.22);border-radius:17px;background:linear-gradient(115deg,rgba(37,244,238,.055),rgba(254,44,85,.055) 60%,rgba(255,255,255,.025));color:#f5f6f8;cursor:pointer;transition:border-color .15s ease,transform .15s ease,background .15s ease;margin:0 0 14px}.gx-ann-dashboard-card:hover{border-color:rgba(37,244,238,.5);background:linear-gradient(115deg,rgba(37,244,238,.09),rgba(254,44,85,.08) 60%,rgba(255,255,255,.035));transform:translateY(-1px)}.gx-ann-dashboard-icon{width:43px;height:43px;flex:0 0 43px;display:grid;place-items:center;border:1px solid rgba(254,44,85,.24);border-radius:13px;background:rgba(254,44,85,.09);font-size:22px}.gx-ann-dashboard-copy{display:grid;gap:5px;min-width:0;flex:1}.gx-ann-dashboard-copy strong{font-size:14px}.gx-ann-dashboard-copy small{font-size:11px;line-height:1.45;color:#929ba7;font-weight:500}.gx-ann-dashboard-arrow{font-size:25px;color:#25f4ee}.gx-ann-unread-badge{justify-self:start;display:inline-flex;align-items:center;gap:5px;width:max-content;max-width:100%;margin-top:4px;padding:5px 9px;border:1px solid rgba(254,44,85,.35);border-radius:999px;background:rgba(254,44,85,.13);color:#ff9db5;font-size:11px;font-weight:700;line-height:1.2}.gx-ann-unread-badge b{display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 3px;box-sizing:border-box;border-radius:999px;background:#fe2c55;color:#fff;font-size:11px}.creator-dashboard-card.gx-ann-dashboard-card{display:grid;grid-template-columns:40px 1fr 16px;grid-template-rows:auto 1fr;align-items:start;gap:0 10px;padding:17px;min-height:145px}.creator-dashboard-card.gx-ann-dashboard-card .gx-ann-dashboard-icon{grid-column:1;grid-row:1;width:40px;height:40px;flex-basis:40px;margin-bottom:13px;font-size:19px}.creator-dashboard-card.gx-ann-dashboard-card .gx-ann-dashboard-copy{grid-column:1/-1;grid-row:2;gap:5px}.creator-dashboard-card.gx-ann-dashboard-card .gx-ann-dashboard-copy strong{font-size:15px}.creator-dashboard-card.gx-ann-dashboard-card .gx-ann-dashboard-copy small{font-size:11px;line-height:1.45;color:#858c98}.creator-dashboard-card.gx-ann-dashboard-card .gx-ann-dashboard-arrow{position:absolute;right:14px;bottom:13px;font-size:21px;color:#25f4ee}.gx-ann-topbar{display:flex;justify-content:flex-start;margin:0 0 12px}.gx-ann-back{border:1px solid #343942;border-radius:10px;background:#111419;color:#dce1e7;padding:9px 12px;font-size:12px;font-weight:700;cursor:pointer}.gx-ann-back:hover{border-color:#25f4ee}.@media(max-width:650px){.gx-ann-dashboard-card{padding:13px;gap:10px}.gx-ann-dashboard-icon{width:38px;height:38px;flex-basis:38px}.creator-dashboard-card.gx-ann-dashboard-card{min-height:128px;padding:14px}}
#announcements .gx-ann-wrap{max-width:980px;margin:0 auto;padding:8px 0 36px;color:#f5f6f8}.gx-ann-hero{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:26px 28px;border:1px solid #30343b;border-radius:22px;background:radial-gradient(ellipse at 90% 0%,#25202a 0%,transparent 45%),linear-gradient(135deg,#15181d,#090b0e);margin-bottom:18px}.gx-ann-hero h1{font-size:clamp(25px,4vw,36px);letter-spacing:-.04em;margin:7px 0}.gx-ann-hero p,.gx-ann-feed-head p{color:#a1a8b2;margin:0;line-height:1.55;font-size:13px}.gx-ann-mark{font-size:42px;filter:drop-shadow(0 0 18px #fe2c5544)}.gx-ann-composer,.gx-ann-card{border:1px solid #2d323a;border-radius:18px;background:linear-gradient(145deg,#121519,#0b0d10);padding:20px;margin-bottom:18px;box-shadow:0 12px 32px #0002}.gx-ann-composer-title{display:flex;gap:12px;align-items:center;margin-bottom:17px}.gx-ann-composer-title>span{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:#242027;color:#f4a2c2;font-size:20px}.gx-ann-composer-title div{display:grid;gap:3px}.gx-ann-composer-title strong{font-size:15px}.gx-ann-composer-title small{color:#9199a4;font-size:11px}.gx-ann-composer label{display:grid;gap:7px;margin:12px 0;color:#d7dbe1;font-size:12px;font-weight:700}.gx-ann-composer input:not([type=checkbox]),.gx-ann-composer textarea,.gx-ann-composer select{box-sizing:border-box;width:100%;border:1px solid #353b44;border-radius:11px;background:#090b0e;color:#fff;padding:12px;font:inherit;font-weight:400;outline:none}.gx-ann-composer textarea{resize:vertical;line-height:1.55}.gx-ann-composer input:focus,.gx-ann-composer textarea:focus,.gx-ann-composer select:focus{border-color:#c25d84}.gx-ann-targets{display:grid;grid-template-columns:1fr 1fr;gap:12px}.gx-ann-team-choices{display:flex;flex-wrap:wrap;gap:7px;align-content:start;padding-top:4px}.gx-ann-team-choices label{display:flex;align-items:center;gap:7px;border:1px solid #353b44;background:#0a0c0f;padding:8px 10px;border-radius:9px;margin:0}.gx-ann-team-choices input{accent-color:#fe2c55}.gx-ann-upload{border:1px dashed #4a4e58;padding:13px;border-radius:12px;background:#0b0d10}.gx-ann-upload input{padding:6px!important;border:0!important;background:transparent!important}.gx-ann-upload small{color:#9199a4;font-weight:400;line-height:1.5}.gx-ann-publish{width:100%;border:0;border-radius:12px;background:linear-gradient(120deg,#f4f5f6,#bfc5cc);color:#101216;padding:13px 16px;font-weight:900;cursor:pointer;margin-top:8px}.gx-ann-publish:disabled{opacity:.55}.gx-ann-publish span{margin-left:6px}.gx-ann-status{font-size:12px;color:#f2b5ce;margin-top:10px;line-height:1.5}.gx-ann-feed-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:25px 0 14px}.gx-ann-feed-head h2{font-size:20px;margin:0 0 4px}.gx-ann-refresh{border:1px solid #343942;background:#111419;color:#d8dce2;border-radius:10px;padding:9px 12px;cursor:pointer}.gx-ann-empty{padding:34px 20px;border:1px dashed #333841;border-radius:16px;text-align:center;color:#dce0e6;display:grid;gap:8px}.gx-ann-empty span{color:#9299a4;font-size:12px;line-height:1.5}.gx-ann-card-top{display:flex;align-items:center;gap:10px;margin-bottom:17px}.gx-ann-avatar{width:39px;height:39px;flex:none;display:grid;place-items:center;border-radius:13px;background:linear-gradient(145deg,#31343c,#15171c);border:1px solid #464b54;font-weight:900}.gx-ann-byline{display:grid;gap:4px;min-width:0;flex:1}.gx-ann-byline strong{font-size:13px}.gx-ann-byline small{font-size:10px;color:#9299a4;line-height:1.4}.gx-ann-delete{border:1px solid #4b3039;color:#f2a5bb;background:#1a1014;border-radius:8px;padding:7px 9px;font-size:10px;cursor:pointer}.gx-ann-card h3{font-size:19px;line-height:1.35;margin:0 0 10px}.gx-ann-body{font-size:13px;color:#d2d6dc;line-height:1.75;overflow-wrap:anywhere}.gx-ann-media-grid,.gx-ann-files{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:14px}.gx-ann-media-btn,.gx-ann-file,.gx-ann-media-note{min-width:0;display:flex;align-items:center;gap:10px;text-align:left;border:1px solid #303640;background:#0a0c0f;border-radius:11px;padding:11px;color:#f2f4f7}.gx-ann-media-btn,.gx-ann-media-note button{cursor:pointer}.gx-ann-file>span:nth-child(2){min-width:0;flex:1;display:grid;gap:4px}.gx-ann-file strong{font-size:11px;overflow-wrap:anywhere}.gx-ann-file small{font-size:10px;color:#9098a3}.gx-ann-file>b{color:#e4c2d0}.gx-ann-media-note{grid-column:1/-1;font-size:11px;flex-wrap:wrap}.gx-ann-media-note button{margin-left:auto;border:1px solid #414751;border-radius:8px;background:#171a20;color:#fff;padding:7px 10px}.gx-ann-reactions{display:flex;gap:7px;flex-wrap:wrap;margin-top:15px}.gx-ann-reaction{border:1px solid #353a43;border-radius:999px;background:#101318;color:#fff;padding:6px 10px;cursor:pointer;display:flex;align-items:center;gap:5px}.gx-ann-reaction small{color:#a6adb8;font-size:10px}.gx-ann-reaction.is-active{border-color:#c75b84;background:#2a1620}.gx-ann-reads{border-top:1px solid #2b3037;margin-top:15px;padding-top:12px;color:#d6dbe1;font-size:11px}.gx-ann-reads summary{cursor:pointer}.gx-ann-read-list{display:grid;gap:7px;margin-top:10px}.gx-ann-read-list span{display:flex;justify-content:space-between;gap:10px}.gx-ann-read-list small{color:#89919c;font-size:10px}.gx-ann-composer .hidden{display:none!important}@media(max-width:650px){#announcements .gx-ann-wrap{padding:0 0 28px}.gx-ann-hero{padding:20px 17px;border-radius:17px}.gx-ann-mark{font-size:32px}.gx-ann-composer,.gx-ann-card{padding:15px;border-radius:15px}.gx-ann-targets{grid-template-columns:1fr;gap:0}.gx-ann-media-grid,.gx-ann-files{grid-template-columns:1fr}.gx-ann-feed-head{align-items:flex-start}.gx-ann-card h3{font-size:17px}}
/* Responsive feed media: never let an attachment exceed its card or viewport. */
#announcements{min-width:0;width:100%;box-sizing:border-box}#announcements .gx-ann-wrap{width:100%;max-width:1080px;box-sizing:border-box;padding-left:clamp(0px,1.2vw,14px);padding-right:clamp(0px,1.2vw,14px)}#announcements .gx-ann-card,#announcements .gx-ann-hero,#announcements .gx-ann-composer-details{min-width:0;max-width:100%;box-sizing:border-box}#announcements .gx-ann-media-grid{grid-template-columns:minmax(0,1fr)}#announcements .gx-ann-inline-media{width:100%;max-width:100%;min-width:0;overflow:hidden;margin-top:12px;border-radius:12px;background:#050608;border:1px solid #252b34;box-sizing:border-box}#announcements .gx-ann-inline-media>img,#announcements .gx-ann-inline-media video,#announcements .gx-ann-inline-media audio,#announcements .gx-ann-inline-media iframe{display:block;width:100%;max-width:100%;box-sizing:border-box}#announcements .gx-ann-inline-media img{max-height:78vh;object-fit:contain;cursor:zoom-in}#announcements .gx-ann-inline-media video{max-height:78vh;background:#000}#announcements .gx-ann-inline-media audio{padding:8px;min-height:54px}#announcements .gx-ann-image-open{position:relative;display:block;width:100%;max-width:100%;padding:0;border:0;background:#050608;cursor:zoom-in}#announcements .gx-ann-image-open img{width:100%;max-width:100%;max-height:78vh;object-fit:contain;display:block}#announcements .gx-ann-image-open span{position:absolute;right:9px;bottom:9px;padding:6px 9px;border-radius:8px;background:#000b;color:#fff;font-size:11px}#announcements .gx-ann-pdf-wrap{width:100%;min-width:0}#announcements .gx-ann-pdf-label{padding:9px 11px;font-size:11px;color:#aeb6c2;border-bottom:1px solid #252b34}#announcements .gx-ann-pdf-wrap iframe{height:min(78vh,850px);border:0;background:#fff}#announcements .gx-ann-preview-error{display:block;padding:14px;color:#aeb6c2;font-size:12px;line-height:1.5;overflow-wrap:anywhere}#announcements .gx-ann-composer-details{margin-bottom:18px;border:1px solid #2d323a;border-radius:17px;background:linear-gradient(145deg,#121519,#0b0d10);box-shadow:0 12px 32px #0002;overflow:hidden}#announcements .gx-ann-composer-summary{display:flex;align-items:center;gap:12px;padding:15px 17px;cursor:pointer;list-style:none}#announcements .gx-ann-composer-summary::-webkit-details-marker{display:none}#announcements .gx-ann-compose-icon{width:40px;height:40px;flex:0 0 40px;border-radius:12px;display:grid;place-items:center;background:#242027;color:#f4a2c2;font-size:20px}#announcements .gx-ann-composer-summary>span:nth-child(2){display:grid;gap:4px;min-width:0;flex:1}#announcements .gx-ann-composer-summary strong{font-size:14px}#announcements .gx-ann-composer-summary small{font-size:11px;color:#9199a4;line-height:1.4}#announcements .gx-ann-compose-chevron{font-size:21px;color:#25f4ee;transition:transform .15s}#announcements .gx-ann-composer-details[open] .gx-ann-compose-chevron{transform:rotate(180deg)}#announcements .gx-ann-composer{border:0;border-top:1px solid #2b3037;border-radius:0;box-shadow:none;margin:0;padding:16px}#gxAnnPreviewOverlay.gx-ann-preview-overlay{display:none;position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.96);align-items:center;justify-content:center;padding:18px;box-sizing:border-box}#gxAnnPreviewOverlay.gx-ann-preview-overlay.is-open{display:flex}#gxAnnPreviewOverlay .gx-ann-preview-stage{display:flex;align-items:center;justify-content:center;width:100%;height:100%;min-width:0;min-height:0}#gxAnnPreviewOverlay .gx-ann-preview-stage img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain}#gxAnnPreviewOverlay .gx-ann-preview-close{position:absolute;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));z-index:1;width:44px;height:44px;border:1px solid #ffffff55;border-radius:50%;background:#171a20;color:#fff;font-size:20px;cursor:pointer}@media(max-width:650px){#announcements .gx-ann-wrap{padding:0 10px 24px}#announcements .gx-ann-hero{padding:18px 15px}#announcements .gx-ann-card{padding:13px}#announcements .gx-ann-card-top{align-items:flex-start}#announcements .gx-ann-inline-media img,#announcements .gx-ann-inline-media video,#announcements .gx-ann-pdf-wrap iframe{max-height:72vh}#announcements .gx-ann-composer-summary{padding:13px}#announcements .gx-ann-composer{padding:13px}.gx-ann-preview-overlay{padding:8px!important}}
`;document.head.appendChild(style);})();
