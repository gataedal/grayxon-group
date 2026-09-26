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

async function content() {
  const { data } = await sb.from('site_content').select('id,content').in('id', ['home', 'benefits']);
  const c = structuredClone(fallback);
  (data || []).forEach(x => c[x.id] = x.content);
  return c;
}

function nav(p, push = true) {
  if (push && current !== p) history.pushState({ page: p }, '', window.location.href);
  current = p;
  ['home', 'benefits', 'auth', 'space', 'training', 'missions', 'profile', 'admin'].forEach(id => $('#' + id).classList.toggle('hidden', id !== p));
  render();
  window.scrollTo(0, 0);
}

async function render() {
  const c = await content();
  if (current === 'home') $('#home').innerHTML = homeTpl(c.home);
  if (current === 'benefits') $('#benefits').innerHTML = benefitsTpl(c.benefits);
  if (current === 'auth') $('#auth').innerHTML = authTpl(authMode);
  if (current === 'space') await spaceTpl();
  if (current === 'training') await trainingTpl();
  if (current === 'missions') await missionsTpl();
  if (current === 'profile') $('#profile').innerHTML = await profileTpl();
  if (current === 'admin') await adminTpl(c);
  bind();
  updateProfileBadge();
  $$('.nav button').forEach(b => b.classList.toggle('active', b.dataset.page === current));
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
    <div class="profile-head card"><div class="profile-avatar-wrap">${avatar}</div><div><div class="eyebrow">MI PERFIL</div><h1>${esc(profile.full_name||profile.username)}</h1><p class="muted">@${esc(profile.username)} · ${profile.role==='admin'?'Administrador':'Creador'}</p></div></div>
    <div class="card profile-photo-card"><div class="profile-photo-row"><div class="profile-photo-preview">${avatar}</div><div class="profile-photo-actions"><div><strong>Foto de perfil</strong><p class="muted small">Cambia o elimina tu foto cuando quieras.</p></div><button type="button" class="photo-edit-btn" id="profilePhotoEdit" aria-label="Editar foto de perfil">✎</button><input id="profileAvatar" class="hidden" type="file" accept="image/png,image/jpeg,image/webp"><button type="button" class="photo-delete-btn ${d.avatar_url ? '' : 'hidden'}" id="deleteProfileAvatar" aria-label="Eliminar foto de perfil">🗑</button></div></div><div id="profileAvatarStatus" class="muted small"></div></div>
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
  const { data } = await sb.from('profiles').select('id,username,full_name,role,active').eq('id', session.user.id).single();
  return data;
}

async function spaceTpl() {
  if (!session) { $('#space').innerHTML = authTpl('creator'); return; }
  profile = await getProfile();
  if (!profile || !profile.active) {
    await sb.auth.signOut(); session = null; profile = null;
    $('#space').innerHTML = '<div class="login"><h2>Tu acceso está desactivado</h2><p class="muted">Tu acceso al portal de Grayxon ha sido desactivado. Contacta con tu manager para solicitar la reactivación.</p></div>';
    return;
  }

  const [{data: details}, {data: pm}, {data: modules}, {data: lessons}, {data: lessonProgress}, {data: missions}, {data: missionProgress}] = await Promise.all([
    sb.from('profile_details').select('*').eq('user_id', session.user.id).maybeSingle(),
    sb.from('payment_methods').select('*').eq('user_id', session.user.id).order('is_primary',{ascending:false}).limit(1).maybeSingle(),
    sb.from('modules').select('id').eq('published', true),
    sb.from('lessons').select('id,module_id').eq('published', true),
    sb.from('lesson_progress').select('lesson_id').eq('user_id', session.user.id),
    sb.rpc('get_my_published_missions'),
    sb.from('mission_progress').select('mission_id,value,completed').eq('user_id', session.user.id)
  ]);

  const profileFields = [details?.email, details?.phone, details?.country, details?.state_region, details?.city, details?.address, details?.avatar_url, pm?.method_type && (pm.method_type === 'paypal' ? pm.paypal_email : pm.account_number)].filter(Boolean).length;
  const profilePct = Math.round(profileFields / 8 * 100);
  const doneLessons = new Set((lessonProgress || []).map(x => x.lesson_id));
  const formationTotal = (lessons || []).length;
  const formationDone = (lessons || []).filter(x => doneLessons.has(x.id)).length;
  const formationPct = formationTotal ? Math.round(formationDone / formationTotal * 100) : 0;
  const today = new Date().toISOString().slice(0,10);
  const activeMissions = (missions || []).filter(m => (!m.week_start || m.week_start <= today) && (!m.week_end || m.week_end >= today) && (!m.assigned_to || m.assigned_to === session.user.id));
  const mp = new Map((missionProgress || []).map(x => [x.mission_id, x]));
  const missionPctFor = m => {
    const x = mp.get(m.id); if (!x) return 0;
    if (m.type === 'checkbox') return x.completed ? 100 : 0;
    return m.target > 0 ? Math.min(100, Math.round(Number(x.value || 0) / Number(m.target) * 100)) : 0;
  };
  const missionTotal = activeMissions.length;
  const missionDone = activeMissions.filter(m => missionPctFor(m) >= 100).length;
  const missionPct = missionTotal ? Math.round(activeMissions.reduce((a,m) => a + missionPctFor(m),0) / missionTotal) : 0;

  const card = (icon,title,desc,pct,action,meta) => `<button class="space-card" data-space-action="${action}"><div class="space-card-icon">${icon}</div><div class="space-card-main"><div class="space-card-top"><strong>${title}</strong><span>${pct}%</span></div><p>${desc}</p><div class="space-progress"><span style="width:${pct}%"></span></div><small>${meta}</small></div><b class="space-card-arrow">›</b></button>`;

  $('#space').innerHTML = `<div class="space-page">
    <div class="space-hero"><div><div class="eyebrow">TU ESPACIO</div><h1>Hola, ${esc(profile.full_name || profile.username)} 👋</h1><p class="muted">Aquí tienes todo lo que necesitas para avanzar dentro de Grayxon.</p></div><div class="space-total"><span>PROGRESO GENERAL</span><strong>${Math.round((profilePct + formationPct + missionPct) / 3)}%</strong></div></div>
    <div class="space-grid">
      ${card('👤','Tu perfil','Completa tus datos para mantener tu información actualizada.',profilePct,'profile',`${profilePct === 100 ? 'Perfil completo' : `${profileFields} de 8 datos completos`}`)}
      ${card('🎓','Formación','Aprende con los módulos, lecciones, videos y recursos de Grayxon.',formationPct,'training',formationTotal ? `${formationDone} de ${formationTotal} lecciones completadas` : 'Aún no hay formación publicada')}
      ${card('🎯','Tus misiones','Cumple tus objetivos semanales y registra tus avances.',missionPct,'missions',missionTotal ? `${missionDone} de ${missionTotal} misiones completadas` : 'No hay misiones activas esta semana')}
    </div>
  </div>`;
}

async function missionsTpl() {
  if (!session) { $('#missions').innerHTML = authTpl('creator'); return; }
  const { data: ms, error } = await sb.rpc('get_my_published_missions');
  if (error) { $('#missions').innerHTML = `<div class="card"><h2>Tus misiones</h2><div class="error">${esc(error.message)}</div><p class="muted small">Si acabas de activar las misiones, ejecuta el SQL de la carpeta del proyecto en Supabase.</p></div>`; return; }
  const today = new Date().toISOString().slice(0,10);
  const { data: ps } = await sb.from('mission_progress').select('mission_id,value,completed').eq('user_id', session.user.id);
  const progress = new Map((ps || []).map(x => [x.mission_id, x]));
  const pct = m => { const p=progress.get(m.id); if(!p)return 0; if(m.type==='checkbox')return p.completed?100:0; return m.target>0?Math.min(100,Math.round(Number(p.value||0)/Number(m.target)*100)):0; };
  const fmt = n => Number(n||0).toLocaleString('es-CO');
  const week = m => m.week_start || m.week_end ? `${m.week_start ? new Date(m.week_start+'T12:00:00').toLocaleDateString('es-CO',{day:'2-digit',month:'short'}) : '—'}${m.week_end ? ' · '+new Date(m.week_end+'T12:00:00').toLocaleDateString('es-CO',{day:'2-digit',month:'short'}) : ''}` : 'Misión activa';
  const isFinished = m => pct(m) >= 100 || (!!m.week_end && m.week_end < today);
  const assignedMissions = (ms || []).filter(m => (!m.assigned_to || m.assigned_to === session.user.id) && !isFinished(m));
  const completedMissions = (ms || []).filter(m => (!m.assigned_to || m.assigned_to === session.user.id) && isFinished(m));
  const missionCard = (m, finished=false) => {
    const p=progress.get(m.id)||{value:0,completed:false};
    const v=pct(m);
    const expired=!!m.week_end && m.week_end < today && v<100;
    return `<div class="mission-card ${v>=100?'mission-complete':''} ${expired?'mission-expired':''}"><div class="mission-head"><div class="mission-icon">${v>=100?'✓':expired?'⌁':m.type==='checkbox'?'✓':'↗'}</div><div><strong>${esc(m.title)}</strong><p class="muted small">${esc(m.description||'')}</p><small>${esc(week(m))}${expired?' · Semana finalizada':''}</small></div><span class="mission-pct">${v}%</span></div><div class="space-progress mission-progress"><span style="width:${v}%"></span></div><div class="mission-actions">${m.link_url?`<a class="mission-link" href="${esc(m.link_url)}" target="_blank" rel="noopener noreferrer">🔗 Abrir recurso</a>`:''}${!finished && !expired && m.type==='checkbox'?`<button class="mission-check ${p.completed?'checked':''}" data-complete-mission="${m.id}">${p.completed?'✓ Misión realizada':'Marcar como realizada'}</button>`:''}${!finished && !expired && m.type==='numeric'?`<div class="mission-number-wrap"><input type="number" min="0" step="1" value="${esc(p.value||0)}" id="missionValue-${m.id}" placeholder="0"><span>/ ${fmt(m.target)}</span></div><button class="mission-save" data-save-mission="${m.id}">Guardar avance</button>`:''}${finished?`<span class="mission-status-pill">✓ Completada</span>`:''}${expired?`<span class="mission-status-pill expired">Semana finalizada</span>`:''}</div></div>`;
  };
  const section=(title,icon,items,finished=false)=>`<section class="mission-section"><div class="mission-section-head"><div><div class="eyebrow">${icon} ${title.toUpperCase()}</div><p class="muted small">${finished?'Misiones que ya alcanzaron su objetivo o cuya semana terminó.':'Misiones que tienes pendientes de completar.'}</p></div><span class="mission-count">${items.length}</span></div><div class="missions-list">${items.map(m=>missionCard(m,finished)).join('') || `<div class="card mission-empty compact"><h3>${finished?'Aún no hay misiones completadas':'No tienes misiones asignadas'}</h3><p class="muted small">${finished?'Cuando completes una misión aparecerá aquí.':'Cuando Grayxon te asigne nuevas misiones aparecerán aquí.'}</p></div>`}</div></section>`;
  $('#missions').innerHTML = `<div class="missions-page"><div class="row"><div><div class="eyebrow">TUS MISIONES</div><h1 style="margin:7px 0">Objetivos de la semana 🎯</h1><p class="muted">Aquí encontrarás todas tus misiones. Las pendientes permanecen en <b>Misiones asignadas</b> y las completadas pasan automáticamente a <b>Misiones completadas</b>.</p></div><button class="secondary" data-space-action="space">← Tu espacio</button></div>${section('Misiones asignadas','🎯',assignedMissions,false)}${section('Misiones completadas','✓',completedMissions,true)}</div>`;
}

async function completeMission(id){
  if(!session)return;
  const {error}=await sb.from('mission_progress').upsert({user_id:session.user.id,mission_id:id,value:1,completed:true,updated_at:new Date().toISOString()},{onConflict:'user_id,mission_id'});
  if(error)return toast(error.message);
  toast('Misión completada ✓'); await missionsTpl(); bind();
}
async function saveMissionProgress(id){
  if(!session)return;
  const input=$(`#missionValue-${id}`); const value=Math.max(0,Number(input?.value||0));
  const {data:m,error:me}=await sb.from('missions').select('target').eq('id',id).single(); if(me)return toast(me.message);
  const completed=Number(value)>=Number(m?.target||0);
  const {error}=await sb.from('mission_progress').upsert({user_id:session.user.id,mission_id:id,value,completed,updated_at:new Date().toISOString()},{onConflict:'user_id,mission_id'});
  if(error)return toast(error.message); toast(completed?'Misión completada ✓':'Avance guardado ✓'); await missionsTpl(); bind();
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
  else body = await adminFormation();
  $('#admin').innerHTML = `<div class="admin-shell"><aside class="admin-side"><b>ADMIN</b><div class="hr"></div>${[['dashboard','Resumen'],['home','Inicio'],['benefits','Beneficios y requisitos'],['creators','Creadores'],['formation','Formación']].map(([id,t]) => `<button class="${adminView === id ? 'active' : ''}" data-admin="${id}">${t}</button>`).join('')}<div class="hr"></div><button id="adminLogout">Cerrar sesión</button></aside><div>${body}</div></div>`;
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
  const { data, error } = await sb.from('profiles').select('id,username,full_name,active,role').eq('role','creator').order('full_name');
  if (error) return `<div class="card"><h2>Creadores</h2><div class="error">${esc(error.message)}</div></div>`;
  return `<div class="card"><div class="row"><div><h2>Creadores</h2><p class="muted small">Cada creador entra con usuario + contraseña. El correo técnico nunca se muestra.</p></div><button class="primary" id="newCreator">+ Crear creador</button></div><div class="list" style="margin-top:18px">${(data || []).map(x => `<div class="item creator-admin-row"><div class="row"><div><b>${esc(x.full_name || x.username)}</b><div class="muted small">@${esc(x.username)}</div></div><div class="inline creator-access-actions"><span class="pill ${x.active ? 'ok' : ''}">${x.active ? 'Activo · acceso permitido' : 'Inactivo · acceso bloqueado'}</span><button class="secondary small creator-toggle ${x.active ? 'danger' : 'ok'}" data-toggle-creator="${x.id}">${x.active ? '🔒 Desactivar acceso' : '🔓 Activar acceso'}</button><button class="secondary small" data-view-profile="${x.id}">👤 Perfil y misiones</button></div></div></div>`).join('') || '<p class="muted">Aún no hay creadores.</p>'}</div></div>`;
}


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
    sb.from('profiles').select('id,username,full_name,active').eq('id',id).single(),
    sb.from('missions').select('id,title,description,type,target,week_start,week_end,assigned_to,published,link_url,created_at').eq('assigned_to',id).order('week_start',{ascending:false}).order('created_at',{ascending:false}),
    sb.from('mission_progress').select('mission_id,value,completed').eq('user_id',id)
  ]);
  if(pr) return toast(pr.message);
  if(me) return toast(me.message);
  const modalEl=document.createElement('div'); modalEl.className='modal-backdrop';
  const safe=x=>x?esc(x):'—';
  const today=new Date().toISOString().slice(0,10);
  const prog=new Map((progress||[]).map(x=>[x.mission_id,x]));
  const missionPct=m=>{const x=prog.get(m.id);if(!x)return 0;if(m.type==='checkbox')return x.completed?100:0;return Number(m.target)>0?Math.min(100,Math.round(Number(x.value||0)/Number(m.target)*100)):0;};
  const finished=m=>missionPct(m)>=100 || (!!m.week_end && m.week_end < today);
  const renderMissionRow=m=>{const pct=missionPct(m), expired=!!m.week_end&&m.week_end<today&&pct<100;return `<div class="item creator-mission-row ${pct>=100?'creator-mission-done':''}"><div class="row"><div><b>${esc(m.title)}</b><div class="muted small">${esc(m.description||'')}</div><div class="muted small" style="margin-top:5px">${m.type==='checkbox'?'Marcable':'Meta numérica'}${m.type==='numeric'?` · ${Number(m.target||0).toLocaleString('es-CO')}`:''}${m.week_start||m.week_end?` · ${esc(m.week_start||'')} → ${esc(m.week_end||'')}`:''}</div>${m.link_url?`<a class="mission-admin-link" href="${esc(m.link_url)}" target="_blank" rel="noopener noreferrer">🔗 ${esc(m.link_url)}</a>`:''}</div><div class="inline creator-mission-actions"><span class="pill ${m.published?'ok':''}">${m.published?'Publicada':'Oculta'}</span><span class="pill ${pct>=100?'ok':''}">${pct}%</span>${pct>=100?'<span class="pill ok">✓ Completada</span>':expired?'<span class="pill">Semana finalizada</span>':''}<button class="secondary small" data-edit-creator-mission="${m.id}" data-creator-id="${id}">Editar</button><button class="secondary small ${m.published?'danger':'ok'}" data-toggle-creator-mission="${m.id}" data-creator-id="${id}">${m.published?'Ocultar':'Publicar'}</button><button class="secondary small danger" data-delete-creator-mission="${m.id}" data-creator-id="${id}">Eliminar</button></div></div><div class="space-progress" style="margin-top:10px"><span style="width:${pct}%"></span></div></div>`;};
  const assigned=(missions||[]).filter(m=>!finished(m));
  const completed=(missions||[]).filter(m=>finished(m));
  const missionSection=(title,icon,items)=>`<div class="creator-mission-group"><div class="row"><div><h3 style="margin-bottom:3px">${icon} ${title}</h3><p class="muted small" style="margin:0">${title==='Misiones asignadas'?'Objetivos pendientes de este creador.':'Misiones completadas o semanas que ya finalizaron.'}</p></div><span class="mission-count">${items.length}</span></div><div class="list" style="margin-top:12px">${items.map(renderMissionRow).join('')||`<div class="item"><p class="muted small" style="margin:0">${title==='Misiones asignadas'?'No hay misiones pendientes.':'Aún no hay misiones completadas.'}</p></div>`}</div></div>`;
  modalEl.innerHTML=`<div class="card modal creator-profile-modal"><div class="row"><div><h2>${safe(p.full_name||p.username)}</h2><div class="muted small">@${safe(p.username)} · ${p.active?'Activo':'Inactivo'}</div></div><button class="secondary" id="closeProfileModal">Cerrar</button></div><div class="hr"></div><h3>Información personal</h3><div class="list"><div class="item">Correo: ${safe(d?.email)}</div><div class="item">Teléfono: ${safe(d?.phone)}</div><div class="item">Ubicación: ${safe(d?.country)} · ${safe(d?.state_region)} · ${safe(d?.city)}</div><div class="item">Dirección: ${safe(d?.address)}</div></div><h3 style="margin-top:22px">Pago</h3><div class="list">${pm?.method_type==='paypal'?`<div class="item">PayPal: ${safe(pm.paypal_email)}</div>`:`<div class="item">Banco: ${safe(pm?.bank_name)} · ${safe(pm?.bank_country)}</div><div class="item">Tipo: ${safe(pm?.account_type==='savings'?'Ahorros':pm?.account_type==='checking'?'Corriente':pm?.account_type)}</div><div class="item">Cuenta: <span class="sensitive-value">${safe(pm?.account_number)}</span></div>`}</div><div class="creator-missions-section"><div class="row"><div><h3 style="margin-bottom:3px">🎯 Misiones del creador</h3><p class="muted small" style="margin:0">Agrega todas las misiones que necesites directamente aquí. Puedes tener varias por semana.</p></div><button class="primary small" id="newCreatorMission">+ Agregar misión</button></div>${missionSection('Misiones asignadas','🎯',assigned)}${missionSection('Misiones completadas','✓',completed)}</div></div>`;
  document.body.appendChild(modalEl);
  $('#closeProfileModal').onclick=()=>modalEl.remove();
  $('#newCreatorMission').onclick=()=>creatorMissionModal(id);
  modalEl.querySelectorAll('[data-edit-creator-mission]').forEach(b=>b.onclick=()=>creatorMissionModal(id,b.dataset.editCreatorMission));
  modalEl.querySelectorAll('[data-toggle-creator-mission]').forEach(b=>b.onclick=async()=>{const {data,error}=await sb.from('missions').select('published').eq('id',b.dataset.toggleCreatorMission).single();if(error)return toast(error.message);const {error:e}=await sb.from('missions').update({published:!data.published}).eq('id',b.dataset.toggleCreatorMission);if(e)return toast(e.message);toast(data.published?'Misión ocultada':'Misión publicada ✓');modalEl.remove();await adminProfileModal(id);});
  modalEl.querySelectorAll('[data-delete-creator-mission]').forEach(b=>b.onclick=async()=>{if(!confirm('¿Eliminar esta misión y su progreso?'))return;const {error}=await sb.from('missions').delete().eq('id',b.dataset.deleteCreatorMission);if(error)return toast(error.message);toast('Misión eliminada');modalEl.remove();await adminProfileModal(id);});
}

async function creatorMissionModal(creatorId, existingId=null){
  let existing=null;
  if(existingId){const {data,error}=await sb.from('missions').select('*').eq('id',existingId).single();if(error)return toast(error.message);existing=data;}
  const week=currentWeekRange();
  const el=document.createElement('div'); el.className='modal-backdrop';
  const creatorName=(await sb.from('profiles').select('full_name,username').eq('id',creatorId).single()).data;
  el.innerHTML=`<div class="card modal"><div class="row"><div><div class="eyebrow">MISIÓN DEL CREADOR</div><h2>${existing?'Editar misión':'Agregar misión'}</h2></div><button class="secondary" id="cancelCreatorMission">Cerrar</button></div>${field('cmTitle','Título',existing?.title||'')}${field('cmDesc','Descripción',existing?.description||'',true)}<label class="field"><span>Tipo</span><select id="cmType"><option value="checkbox" ${existing?.type!=='numeric'?'selected':''}>Marcable</option><option value="numeric" ${existing?.type==='numeric'?'selected':''}>Meta numérica</option></select></label>${field('cmTarget','Meta numérica (si aplica)',existing?.target||'')}<div class="grid"><div class="field"><label>Inicio</label><input id="cmStart" type="date" value="${existing?.week_start||week.start}"></div><div class="field"><label>Fin</label><input id="cmEnd" type="date" value="${existing?.week_end||week.end}"></div></div>${field('cmLink','Link clickeable (opcional)',existing?.link_url||'')}<label class="field"><span>Estado</span><select id="cmPublished"><option value="true" ${existing?.published!==false?'selected':''}>Publicada</option><option value="false" ${existing?.published===false?'selected':''}>Oculta</option></select></label><div class="creator-mission-target-note">Esta misión se asignará exclusivamente a <b>${esc(creatorName?.full_name || creatorName?.username || 'este creador')}</b>. Puedes crear varias misiones para la misma semana.</div><div class="mission-form-actions" style="margin-top:18px">${existing?'<button class="primary" id="saveCreatorMission">Guardar cambios</button>':'<button class="secondary" id="saveAndAddAnother">Guardar y agregar otra</button><button class="primary" id="saveCreatorMission">Guardar misión</button>'}</div><div id="creatorMissionErr" class="error"></div></div>`;
  document.body.appendChild(el);
  $('#cancelCreatorMission').onclick=()=>el.remove();
  const save=async(keepOpen=false)=>{
    const btn=$('#saveCreatorMission'); const other=$('#saveAndAddAnother'); if(btn)btn.disabled=true;if(other)other.disabled=true;
    const link=validMissionLink($('#cmLink').value);if($('#cmLink').value.trim()&&!link){$('#creatorMissionErr').textContent='El link debe comenzar con http:// o https://';if(btn)btn.disabled=false;if(other)other.disabled=false;return;}
    const type=$('#cmType').value;const target=Math.max(0,Number($('#cmTarget').value||0));
    if(!$('#cmTitle').value.trim()){ $('#creatorMissionErr').textContent='Escribe un título.';if(btn)btn.disabled=false;if(other)other.disabled=false;return;}
    if(type==='numeric'&&!target){$('#creatorMissionErr').textContent='Define una meta numérica.';if(btn)btn.disabled=false;if(other)other.disabled=false;return;}
    const payload={title:$('#cmTitle').value.trim(),description:$('#cmDesc').value.trim(),type,target,week_start:$('#cmStart').value||null,week_end:$('#cmEnd').value||null,assigned_to:creatorId,published:$('#cmPublished').value==='true',link_url:link};
    const r=existingId?await sb.from('missions').update(payload).eq('id',existingId):await sb.from('missions').insert(payload);
    if(r.error){$('#creatorMissionErr').textContent=r.error.message;if(btn)btn.disabled=false;if(other)other.disabled=false;return;}
    toast(existingId?'Misión actualizada ✓':'Misión asignada ✓');
    if(keepOpen && !existingId){
      $('#cmTitle').value='';$('#cmDesc').value='';$('#cmType').value='checkbox';$('#cmTarget').value='';$('#cmLink').value='';$('#cmPublished').value='true';$('#creatorMissionErr').textContent='';
      if(btn)btn.disabled=false;if(other)other.disabled=false;$('#cmTitle').focus();return;
    }
    el.remove();const old=document.querySelector('.creator-profile-modal')?.parentElement;if(old)old.remove();await adminProfileModal(creatorId);
  };
  $('#saveCreatorMission').onclick=()=>save(false);
  $('#saveAndAddAnother')?.addEventListener('click',()=>save(true));
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

function creatorModal() {
  const el = document.createElement('div');
  el.className = 'modal-backdrop';
  el.innerHTML = `<div class="card modal"><h2>Crear creador</h2>${field('newName','Nombre completo','')}${field('newUser','Usuario','')}${field('newPass','Contraseña','')}<div class="muted small">Mínimo 8 caracteres. El creador solo verá su usuario, nunca el correo técnico.</div><div class="inline" style="margin-top:18px"><button class="primary" id="createCreator">Crear cuenta</button><button class="secondary" id="cancelCreator">Cancelar</button></div><div id="createErr" class="error"></div></div>`;
  document.body.appendChild(el);
  $('#cancelCreator').onclick = () => el.remove();
  $('#createCreator').onclick = async () => {
    const btn = $('#createCreator'); btn.disabled = true;
    const { data, error } = await sb.functions.invoke('create-creator', { body: { username: $('#newUser').value.trim(), full_name: $('#newName').value.trim(), password: $('#newPass').value } });
    if (error || data?.error) { $('#createErr').textContent = data?.error || error.message; btn.disabled = false; return; }
    el.remove(); toast('Creador creado ✓'); render();
  };
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
    const { error } = await sb.from('modules').update({ title, description: $('#moduleDesc').value.trim(), published: $('#modulePublished').value === 'true' }).eq('id', id);
    if (error) { $('#moduleErr').textContent = error.message; return; }
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
    const result = existing ? await sb.from('lessons').update(payload).eq('id', existing.id) : await sb.from('lessons').insert(payload);
    if (result.error) throw result.error;
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
  const { error: e } = await sb.from('modules').update({ published: !data.published }).eq('id', id);
  if (e) return toast(e.message);
  toast(data.published ? 'Módulo ocultado' : 'Módulo publicado ✓'); render();
}

async function toggleLesson(id) {
  const { data, error } = await sb.from('lessons').select('published').eq('id', id).single();
  if (error || !data) return toast(errorText(error));
  const { error: e } = await sb.from('lessons').update({ published: !data.published }).eq('id', id);
  if (e) return toast(e.message);
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
  $('#loginBtn')?.addEventListener('click', login);
  $('#adminLogout')?.addEventListener('click', logout);
  $$('[data-lesson]').forEach(b => b.onclick = () => openLesson(b.dataset.lesson));
  $$('[data-complete-mission]').forEach(b => b.onclick = () => completeMission(b.dataset.completeMission));
  $$('[data-save-mission]').forEach(b => b.onclick = () => saveMissionProgress(b.dataset.saveMission));
  $$('[data-admin]').forEach(b => b.onclick = () => { adminView = b.dataset.admin; render(); });
  $$('[data-toggle-creator]').forEach(b => b.onclick = () => toggleCreator(b.dataset.toggleCreator));
  $$('[data-view-profile]').forEach(b => b.onclick = () => adminProfileModal(b.dataset.viewProfile));
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
  toast('Perfil guardado ✓'); await loadProfileDetails(); updateProfileBadge(); closeProfileMenu(); nav('training');
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
  await sb.auth.signOut(); session = null; profile = null; profileDetails = null; paymentMethod = null; updateProfileBadge(); nav('home');
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
  const profileMenu = $('#profileMenu');
  const openMyProfile = $('#openMyProfile');
  const menuLogout = $('#menuLogout');

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
  if (menuLogout) menuLogout.addEventListener('click', () => {
    closeProfileMenu();
    logout();
  });
  document.addEventListener('click', () => closeProfileMenu());

  const { data } = await sb.auth.getSession();
  session = data.session;
  if (session) { profile = await getProfile(); await loadProfileDetails(); }
  nav('home');
}

init();

window.addEventListener('popstate', () => {
  const page = history.state?.page || 'home';
  current = ['home','benefits','auth','space','training','missions','profile','admin'].includes(page) ? page : 'home';
  render();
  window.scrollTo(0, 0);
});
