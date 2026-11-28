(function () {
  'use strict';
  if (window.__gxFormationExperienceV2) return;
  window.__gxFormationExperienceV2 = true;

  const style = document.createElement('style');
  style.id = 'gx-formation-experience-v2-style';
  style.textContent = `
    #training .gx-formation-v3 > .gx-formation-header,
    #training .gx-formation-v3 > .gx-formation-next,
    #training .gx-formation-v3 > .gx-formation-tabs { display:none!important; }
    /* Mantener visible el resumen superior y la barra de progreso (incluido el 100%). */
    #training .gx-formation-v3 > .gx-formation-hero { display:block!important; }
    /* La tarjeta superior concentra los datos; se elimina el bloque inferior duplicado. */
    #training .gx-formation-v3 > .gx-formation-stats { display:none!important; }
    #training .gx-formation-v3 > .gx-formation-hero { position:relative!important; }
    #training .gx-formation-v3 .gx-formation-percent-subtle { position:absolute!important;top:16px!important;right:18px!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;color:#a9bac4!important;font-size:clamp(17px,2vw,22px)!important;font-weight:750!important;line-height:1!important; }
    #training .gx-formation-v3 .formation-groups { margin-top:0!important; }
    #training .gx-formation-v3 .gx-formation-section-intro { margin:0 0 18px!important; }
    #training .gx-formation-v3 .gx-formation-section-intro .library-eyebrow { font-size:10px!important; }
    #training .gx-formation-v3 .gx-formation-section-intro h2 { margin:0!important;font-size:22px!important; }
    #training .gx-formation-v3 .gx-formation-section-intro p { display:none!important; }
    #training .gx-formation-v3 .library-section-heading { display:none!important; }
    #training .gx-formation-v3 .library-module-grid { grid-template-columns:repeat(auto-fit,minmax(245px,1fr))!important;gap:16px!important; }
    #training .gx-formation-v3 .library-module-card { border-radius:18px!important;border-width:1px!important;cursor:pointer;transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease!important; }
    #training .gx-formation-v3 .library-module-card:hover { transform:translateY(-3px);box-shadow:0 14px 34px #0006!important; }
    #training .gx-formation-v3 .library-module-card .library-module-cover { min-height:142px!important; }
    #training .gx-formation-v3 .library-module-card .library-module-body { padding:16px!important; }
    #training .gx-formation-v3 .library-module-card .library-module-body h3 { font-size:16px!important; }
    #training .gx-formation-v3 .library-module-card .library-module-body p { min-height:0!important;font-size:11px!important; }
    #training .gx-formation-v3 .library-module-card .library-toggle { justify-content:center!important;gap:8px!important;padding:11px!important;border:1.5px solid #25f4ee!important;border-radius:10px!important;background:linear-gradient(135deg,rgba(37,244,238,.12),rgba(37,244,238,.035))!important;color:#f4ffff!important;box-shadow:inset 0 0 0 1px rgba(37,244,238,.12),0 0 14px rgba(37,244,238,.12)!important;font-weight:800!important;cursor:pointer!important;transition:background .18s ease,border-color .18s ease,box-shadow .18s ease,transform .18s ease!important; }
    #training .gx-formation-v3 .library-module-card .library-toggle:hover { border-color:#8afffb!important;background:rgba(37,244,238,.18)!important;box-shadow:0 0 0 2px rgba(37,244,238,.16),0 0 22px rgba(37,244,238,.2)!important;transform:translateY(-1px); }
    #training .gx-formation-v3 .library-module-card .library-toggle:focus-visible { outline:3px solid #25f4ee!important;outline-offset:3px!important; }
    #training .gx-formation-v3 .library-module-card .library-toggle b { display:none!important; }
    #training .gx-formation-v3 .library-module-card .library-module-lessons { display:none!important; }
    #training .gx-formation-module-page .library-module-lessons.gx-formation-module-lessons-active { display:grid!important; }
    #training .gx-formation-v3 .library-module-card.cover-0 { border-color:rgba(37,244,238,.42)!important; }
    #training .gx-formation-v3 .library-module-card:has(.cover-1) { border-color:rgba(178,194,214,.42)!important; }
    #training .gx-formation-v3 .library-module-card:has(.cover-2) { border-color:rgba(157,123,255,.48)!important; }
    #training .gx-formation-v3 .library-module-card:has(.cover-3) { border-color:rgba(254,91,128,.42)!important; }
    #training .gx-formation-module-page { position:fixed!important;inset:0!important;z-index:30000!important;width:100vw!important;height:100vh!important;height:100dvh!important;max-height:100dvh!important;overflow-y:auto!important;overscroll-behavior:contain!important;box-sizing:border-box!important;padding:clamp(18px,3vw,36px)!important;padding-bottom:calc(clamp(18px,3vw,36px) + env(safe-area-inset-bottom))!important;background:radial-gradient(ellipse at 12% 0%,rgba(37,244,238,.09),transparent 38%),linear-gradient(145deg,#0b1015,#080b0f 72%)!important;display:grid;align-content:start;gap:22px; }
    #training .gx-formation-module-top { display:flex;align-items:center;gap:14px; }
    #training .gx-formation-back { display:inline-flex;align-items:center;justify-content:center;min-width:42px;height:42px;border:1px solid #35414b;border-radius:12px;background:#12181e;color:#eef5f8;font-size:20px;cursor:pointer; }
    #training .gx-formation-module-heading { display:grid;gap:5px;min-width:0; }
    #training .gx-formation-module-heading small { color:#8edfdc;font-size:9px;font-weight:850;letter-spacing:.15em;text-transform:uppercase; }
    #training .gx-formation-module-heading h2 { margin:0;font-size:clamp(22px,3vw,30px);letter-spacing:-.04em; }
    #training .gx-formation-module-heading p { margin:0;color:#9ba6b2;font-size:12px;line-height:1.6; }
    #training .gx-formation-module-lessons { display:grid;gap:9px; }
    #training .gx-formation-module-lessons .lesson { border:1px solid #2b333c;border-radius:14px;background:linear-gradient(135deg,#151b21,#0d1115);overflow:hidden; }
    #training .gx-formation-module-lessons .lesson button { min-height:70px;padding:14px!important;grid-template-columns:36px minmax(0,1fr) auto!important;gap:12px!important; }
    #training .gx-formation-module-lessons .lesson-index { width:34px!important;height:34px!important;border-radius:10px!important; }
    #training .gx-formation-module-lessons .lesson-text strong { font-size:12px!important; }
    #training .gx-formation-module-lessons .lesson-text small { font-size:10px!important; }
    #training .gx-formation-module-lessons .formation-lesson-action { min-width:68px;text-align:center; }
    #training .gx-formation-module-lessons .lesson button:disabled { opacity:.42; }
    #training .gx-formation-module-lessons .lesson-done { border-color:rgba(91,202,133,.28); }
    #training .gx-formation-module-lessons .lesson-next { border-color:rgba(37,244,238,.4); }
    /* La lección (video o contenido) es una vista independiente, fuera del layout de Formación. */
    .gx-formation-content-page { position:fixed!important;inset:0!important;z-index:31000!important;width:100vw!important;height:100vh!important;height:100dvh!important;max-height:100dvh!important;overflow-y:auto!important;overscroll-behavior:contain!important;box-sizing:border-box!important;padding:clamp(18px,3vw,36px)!important;padding-top:calc(clamp(18px,3vw,36px) + env(safe-area-inset-top))!important;padding-bottom:calc(clamp(18px,3vw,36px) + env(safe-area-inset-bottom))!important;background:radial-gradient(ellipse at 12% 0%,rgba(37,244,238,.08),transparent 38%),linear-gradient(145deg,#0b1015,#080b0f 72%)!important;color:#e8edf2!important;display:grid!important;align-content:start!important;gap:16px!important; }
    .gx-formation-content-page .lesson-header { display:flex!important;align-items:flex-start!important;gap:14px!important;margin:0!important;padding:0 0 12px!important;border:0!important;background:transparent!important; }
    .gx-formation-content-page .gx-formation-module-top { display:flex;align-items:center;gap:14px; }
    .gx-formation-content-page .gx-formation-module-heading { display:grid;gap:5px;min-width:0; }
    .gx-formation-content-page .gx-formation-module-heading small { color:#8edfdc;font-size:9px;font-weight:850;letter-spacing:.15em;text-transform:uppercase; }
    .gx-formation-content-page .gx-formation-module-heading h2 { margin:0;font-size:clamp(22px,3vw,30px);letter-spacing:-.04em; }
    .gx-formation-content-page .gx-formation-module-heading p { margin:0;color:#9ba6b2;font-size:12px;line-height:1.6; }
    .gx-formation-content-page .gx-formation-back { display:inline-flex;align-items:center;justify-content:center;min-width:42px;height:42px;border:1px solid #35414b;border-radius:12px;background:#12181e;color:#eef5f8;font-size:20px;cursor:pointer; }
    .gx-formation-content-body { min-width:0;padding:20px;border:1px solid #303943;border-radius:16px;background:linear-gradient(145deg,#151a20,#0d1115);color:#e8edf2;font-size:14px;line-height:1.8;overflow-wrap:anywhere; }
    .gx-formation-content-page .video-wrap { width:100%!important;max-width:1100px!important;margin:0 auto!important; }
    .gx-formation-content-page video,.gx-formation-content-page iframe { max-width:100%!important; }
    #training .gx-formation-content-body a { color:#78e8e3; }
    #training .gx-formation-content-page .lesson-header { align-items:flex-start; }
    @media(max-width:600px){
      #training .gx-formation-module-page { padding:16px!important;padding-top:calc(16px + env(safe-area-inset-top))!important; }
      #training .gx-formation-v3 .library-module-grid { grid-template-columns:minmax(0,1fr)!important; }
      #training .gx-formation-v3 .library-module-card { display:grid!important;grid-template-columns:108px minmax(0,1fr)!important; }
      #training .gx-formation-v3 .library-module-card .library-module-cover { grid-column:1;grid-row:1;min-height:100%!important; }
      #training .gx-formation-v3 .library-module-card .library-module-body { grid-column:2;grid-row:1;padding:12px!important; }
      #training .gx-formation-module-lessons .lesson button { grid-template-columns:32px minmax(0,1fr)!important; }
      #training .gx-formation-module-lessons .formation-lesson-action { grid-column:2;justify-self:start;margin-top:5px; }
      .gx-formation-content-page { padding:14px!important;padding-top:calc(14px + env(safe-area-inset-top))!important;padding-bottom:calc(14px + env(safe-area-inset-bottom))!important; }
      .gx-formation-content-body { padding:16px;font-size:13px; }
      .gx-formation-content-page .lesson-header { gap:10px!important; }
    }
    body.gx-internal-session #notificationsPanel,
    body.gx-internal-session .notification-panel { position:absolute!important;top:calc(100% + 10px)!important;right:0!important;left:auto!important; }
    body.gx-internal-session .gx-bell-anchor #notificationsPanel { position:absolute!important;top:calc(100% + 10px)!important;right:0!important;left:auto!important; }
    .gx-bell-anchor { position:relative!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 40px!important;width:40px!important;height:40px!important; }
    .gx-bell-anchor #notificationsPanel { position:absolute!important;top:calc(100% + 10px)!important;right:0!important;left:auto!important;z-index:15000!important; }
    #grayxonBottomNav [data-gx-bottom="notifications"],
    #grayxonBottomNav [data-gx-bottom="notification"],
    #grayxonBottomNav [data-gx-bottom="bell"] { display:none!important; }
  `;
  document.head.appendChild(style);

  let activeModule = null;
  let activeModulePage = null;
  let lessonPageReturn = null;
  let lessonViewOriginalParent = null;
  let lessonViewOriginalNext = null;

  function lessonsFor(moduleId) {
    return (window._lessons || []).filter(item => item.module_id === moduleId)
      .sort((a,b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  }

  function prepare(root) {
    if (!root || root.dataset.gxFormationPrepared === '1') return;
    root.dataset.gxFormationPrepared = '1';
    root.querySelectorAll('.gx-formation-header .library-eyebrow').forEach(el => el.remove());
    root.querySelectorAll('.gx-formation-header .library-subtitle').forEach(el => el.remove());
    root.querySelectorAll('.gx-formation-section-intro .library-eyebrow').forEach(el => { el.textContent = 'RUTA DE APRENDIZAJE'; });
    root.querySelectorAll('.gx-formation-section-intro h2').forEach(el => { el.textContent = 'Tu ruta de aprendizaje'; });
    root.querySelectorAll('.gx-formation-section-intro p').forEach(el => el.remove());
    // Ocultar solo el mensaje de cierre; conservar hero, resumen y barra de progreso.
    root.querySelectorAll('*').forEach(el => {
      if (el.children.length === 0 && /has completado toda tu formación/i.test(el.textContent || '')) {
        el.hidden = true;
        el.setAttribute('aria-hidden', 'true');
      }
    });
    const hero = root.querySelector('.gx-formation-hero');
    if (hero) hero.querySelectorAll('*').forEach(el => {
      if (el.children.length === 0 && /^100%$/.test((el.textContent || '').trim())) el.classList.add('gx-formation-percent-subtle');
    });
    root.querySelectorAll('.library-module-card').forEach(card => {
      const toggle = card.querySelector('[data-library-toggle]');
      const lessons = card.querySelector('.library-module-lessons');
      if (!toggle || !lessons || toggle.dataset.gxModuleBound === '1') return;
      toggle.dataset.gxModuleBound = '1';
      toggle.removeAttribute('data-library-toggle');
      toggle.removeAttribute('aria-expanded');
      toggle.innerHTML = '<span>Entrar al módulo</span><b>→</b>';
      toggle.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        openModule(card);
      });
      card.querySelectorAll('.formation-lesson-action').forEach(action => {
        const lessonButton = action.closest('[data-lesson]');
        const lesson = lessonButton && (window._lessons || []).find(item => item.id === lessonButton.dataset.lesson);
        if (lesson && lesson.type !== 'video') action.textContent = 'Ver contenido';
      });
    });
    root.querySelectorAll('[data-formation-section="completed"] .library-completed-toggle').forEach(el => {
      el.textContent = 'Módulos completados';
    });
  }

  function openModule(card) {
    const id = card.getAttribute('data-formation-module-card');
    const module = (window._modules || []).find(item => item.id === id);
    if (!module) return;
    const root = card.closest('.gx-formation-v3');
    const groups = root?.querySelector('.formation-groups');
    if (!root || !groups) return;
    const lessonList = card.querySelector('.library-module-lessons');
    if (!lessonList) return;
    activeModule = id;
    activeModulePage = document.createElement('section');
    activeModulePage.className = 'gx-formation-module-page';
    activeModulePage.innerHTML = `
      <div class="gx-formation-module-top">
        <button type="button" class="gx-formation-back" aria-label="Volver a la ruta">‹</button>
        <div class="gx-formation-module-heading">
          <small>RUTA DE APRENDIZAJE · MÓDULO ${String((window._modules || []).findIndex(item => item.id === id) + 1).padStart(2,'0')}</small>
          <h2>${escapeHtml(module.title)}</h2>
          <p>${escapeHtml(module.description || 'Explora los contenidos de este módulo.')}</p>
        </div>
      </div>
      <div class="gx-formation-module-lessons"></div>`;
    const target = activeModulePage.querySelector('.gx-formation-module-lessons');
    target.appendChild(lessonList);
    lessonList.hidden = false;
    lessonList.style.display = 'grid';
    lessonList.classList.add('gx-formation-module-lessons-active');
    groups.hidden = true;
    root.appendChild(activeModulePage);
    activeModulePage.querySelector('.gx-formation-back').addEventListener('click', closeModule);
    document.body.classList.add('gx-formation-fullscreen-open');
    document.documentElement.style.overflow = 'hidden';
    window.scrollTo({top:0,behavior:'instant'});
  }

  function closeModule() {
    if (!activeModulePage || !activeModule) return;
    const card = document.querySelector('#training [data-formation-module-card="' + CSS.escape(activeModule) + '"]');
    const groups = document.querySelector('#training .formation-groups');
    const lessonList = activeModulePage.querySelector('.library-module-lessons');
    if (card && lessonList) { card.appendChild(lessonList); lessonList.hidden = true; lessonList.style.display = ''; lessonList.classList.remove('gx-formation-module-lessons-active'); }
    activeModulePage.remove();
    activeModulePage = null;
    activeModule = null;
    if (groups) groups.hidden = false;
    document.body.classList.remove('gx-formation-fullscreen-open');
    document.documentElement.style.overflow = '';
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }

  async function openSupplementary(button) {
    const id = button.dataset.lesson;
    const lesson = (window._lessons || []).find(item => item.id === id);
    if (!lesson) return false;
    const returnModule = activeModule;
    if (typeof window.openLesson !== 'function') return false;
    const view = document.querySelector('#training #lessonView');
    if (!view) return false;
    lessonViewOriginalParent = view.parentNode;
    lessonViewOriginalNext = view.nextSibling;
    await window.openLesson(id);
    view.classList.remove('hidden');
    view.classList.add('gx-formation-content-page');
    const header = view.querySelector('.lesson-header');
    const eyebrow = view.querySelector('.eyebrow');
    if (eyebrow) eyebrow.textContent = lesson.type === 'video' ? 'VIDEO DEL MÓDULO' : 'CONTENIDO DEL MÓDULO';
    if (header) {
      const title = header.querySelector('h2');
      const desc = header.querySelector('p');
      const top = document.createElement('div');
      top.className = 'gx-formation-module-top';
      top.innerHTML = '<button type="button" class="gx-formation-back" aria-label="Volver al módulo">‹</button><div class="gx-formation-module-heading"><small>' + (lesson.type === 'video' ? 'VIDEO DE APRENDIZAJE' : 'RECURSO DE APRENDIZAJE') + '</small></div>';
      if (title) top.querySelector('.gx-formation-module-heading').appendChild(title);
      if (desc) top.querySelector('.gx-formation-module-heading').appendChild(desc);
      header.replaceWith(top);
      top.querySelector('button').addEventListener('click', closeLessonView);
    }
    const content = view.querySelector('.section');
    if (content) content.classList.add('gx-formation-content-body');
    const media = view.querySelector('.video-wrap');
    if (media) media.classList.add('gx-formation-content-body');
    lessonPageReturn = returnModule;
    // Sácala del contenedor de Formación para evitar que herede su layout y sus tarjetas.
    document.body.appendChild(view);
    document.body.classList.add('gx-formation-fullscreen-open');
    document.documentElement.style.overflow = 'hidden';
    window.scrollTo({top:0,behavior:'instant'});
    return true;
  }

  function closeLessonView() {
    const view = document.querySelector('#lessonView.gx-formation-content-page');
    if (!view) return;
    view.classList.remove('gx-formation-content-page');
    view.classList.add('hidden');
    if (lessonViewOriginalParent) {
      if (lessonViewOriginalNext && lessonViewOriginalNext.parentNode === lessonViewOriginalParent) {
        lessonViewOriginalParent.insertBefore(view, lessonViewOriginalNext);
      } else {
        lessonViewOriginalParent.appendChild(view);
      }
    }
    document.body.classList.remove('gx-formation-fullscreen-open');
    document.documentElement.style.overflow = '';
    lessonViewOriginalParent = null;
    lessonViewOriginalNext = null;
    lessonPageReturn = null;
    window.scrollTo({top:0,behavior:'instant'});
  }

  document.addEventListener('click', async event => {
    const lessonButton = event.target.closest('#training .gx-formation-module-lessons [data-lesson]');
    if (!lessonButton) return;
    const lesson = (window._lessons || []).find(item => item.id === lessonButton.dataset.lesson);
    if (!lesson) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    await openSupplementary(lessonButton);
  }, true);

  function anchorNotificationPanel() {
    const button = document.getElementById('notificationsBtn');
    const panel = document.getElementById('notificationsPanel');
    if (!button || !panel) return;
    let anchor = button.closest('.gx-bell-anchor');
    if (!anchor) {
      anchor = document.createElement('span');
      anchor.className = 'gx-bell-anchor';
      button.parentNode.insertBefore(anchor, button);
      anchor.appendChild(button);
    }
    if (panel.parentNode !== anchor) anchor.appendChild(panel);
  }

  function removeBottomBell() {
    const nav = document.getElementById('grayxonBottomNav');
    if (!nav) return;
    nav.querySelectorAll('button,a,[role="button"]').forEach(button => {
      const text = (button.getAttribute('aria-label') || button.textContent || '').toLowerCase();
      if (/notific|campan|bell/.test(text) || button.querySelector('svg[data-icon*="bell"],.fa-bell,.icon-bell')) button.remove();
    });
    const count = nav.querySelectorAll('button,a,[role="button"]').length;
    if (count) nav.style.setProperty('grid-template-columns', 'repeat(' + count + ', minmax(0,1fr))', 'important');
  }

  function apply() {
    const root = document.querySelector('#training .gx-formation-v3');
    if (root) prepare(root);
    anchorNotificationPanel();
    removeBottomBell();
  }

  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, {childList:true,subtree:true});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, {once:true});
  else apply();
})();