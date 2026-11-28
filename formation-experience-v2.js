(function () {
  'use strict';
  if (window.__gxFormationExperienceV2) return;
  window.__gxFormationExperienceV2 = true;

  const style = document.createElement('style');
  style.id = 'gx-formation-experience-v2-style';
  style.textContent = `
    #training .gx-formation-v3 > .gx-formation-header,
    #training .gx-formation-v3 > .gx-formation-hero,
    #training .gx-formation-v3 > .gx-formation-stats,
    #training .gx-formation-v3 > .gx-formation-next,
    #training .gx-formation-v3 > .gx-formation-tabs { display:none!important; }
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
    #training .gx-formation-v3 .library-module-card .library-toggle { justify-content:center!important;gap:8px!important;padding:11px!important;border:1px solid rgba(255,255,255,.1)!important;border-radius:10px!important;background:rgba(255,255,255,.035)!important;color:#eafafa!important;cursor:pointer!important; }
    #training .gx-formation-v3 .library-module-card .library-toggle b { display:none!important; }
    #training .gx-formation-v3 .library-module-card .library-module-lessons { display:none!important; }
    #training .gx-formation-v3 .library-module-card.cover-0 { border-color:rgba(37,244,238,.42)!important; }
    #training .gx-formation-v3 .library-module-card:has(.cover-1) { border-color:rgba(178,194,214,.42)!important; }
    #training .gx-formation-v3 .library-module-card:has(.cover-2) { border-color:rgba(157,123,255,.48)!important; }
    #training .gx-formation-v3 .library-module-card:has(.cover-3) { border-color:rgba(254,91,128,.42)!important; }
    #training .gx-formation-module-page { display:grid;gap:18px; }
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
    #training .gx-formation-content-page { display:grid;gap:16px; }
    #training .gx-formation-content-body { padding:20px;border:1px solid #303943;border-radius:16px;background:linear-gradient(145deg,#151a20,#0d1115);color:#e8edf2;font-size:14px;line-height:1.8;overflow-wrap:anywhere; }
    #training .gx-formation-content-body a { color:#78e8e3; }
    #training .gx-formation-content-page .lesson-header { align-items:flex-start; }
    @media(max-width:600px){
      #training .gx-formation-v3 .library-module-grid { grid-template-columns:minmax(0,1fr)!important; }
      #training .gx-formation-v3 .library-module-card { display:grid!important;grid-template-columns:108px minmax(0,1fr)!important; }
      #training .gx-formation-v3 .library-module-card .library-module-cover { grid-column:1;grid-row:1;min-height:100%!important; }
      #training .gx-formation-v3 .library-module-card .library-module-body { grid-column:2;grid-row:1;padding:12px!important; }
      #training .gx-formation-module-lessons .lesson button { grid-template-columns:32px minmax(0,1fr)!important; }
      #training .gx-formation-module-lessons .formation-lesson-action { grid-column:2;justify-self:start;margin-top:5px; }
      #training .gx-formation-content-body { padding:16px;font-size:13px; }
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
    groups.after(activeModulePage);
    activeModulePage.querySelector('.gx-formation-back').addEventListener('click', closeModule);
    root.querySelectorAll(':scope > .gx-formation-header,:scope > .gx-formation-hero,:scope > .gx-formation-stats,:scope > .gx-formation-next').forEach(el => el.hidden = true);
    window.scrollTo({top:0,behavior:'smooth'});
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
    document.querySelectorAll('#training .gx-formation-v3 > .gx-formation-header,#training .gx-formation-v3 > .gx-formation-hero,#training .gx-formation-v3 > .gx-formation-stats,#training .gx-formation-v3 > .gx-formation-next').forEach(el => el.hidden = false);
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }

  async function openSupplementary(button) {
    const id = button.dataset.lesson;
    const lesson = (window._lessons || []).find(item => item.id === id);
    if (!lesson || lesson.type === 'video') return false;
    const returnModule = activeModule;
    if (typeof window.openLesson !== 'function') return false;
    await window.openLesson(id);
    const view = document.querySelector('#training #lessonView');
    if (!view) return true;
    view.classList.remove('hidden');
    view.classList.add('gx-formation-content-page');
    const header = view.querySelector('.lesson-header');
    const eyebrow = view.querySelector('.eyebrow');
    if (eyebrow) eyebrow.textContent = 'CONTENIDO DEL MÓDULO';
    if (header) {
      const title = header.querySelector('h2');
      const desc = header.querySelector('p');
      const top = document.createElement('div');
      top.className = 'gx-formation-module-top';
      top.innerHTML = '<button type="button" class="gx-formation-back" aria-label="Volver al módulo">‹</button><div class="gx-formation-module-heading"><small>RECURSO DE APRENDIZAJE</small></div>';
      if (title) top.querySelector('.gx-formation-module-heading').appendChild(title);
      if (desc) top.querySelector('.gx-formation-module-heading').appendChild(desc);
      header.replaceWith(top);
      top.querySelector('button').addEventListener('click', async () => {
        view.classList.remove('gx-formation-content-page');
        view.classList.add('hidden');
        if (returnModule) {
          await trainingTpl({skipAutoOpen:true});
          const card = document.querySelector('#training [data-formation-module-card="' + CSS.escape(returnModule) + '"]');
          if (card) openModule(card);
        }
      });
    }
    const content = view.querySelector('.section');
    if (content) content.classList.add('gx-formation-content-body');
    const media = view.querySelector('.video-wrap');
    if (media) media.classList.add('gx-formation-content-body');
    lessonPageReturn = returnModule;
    window.scrollTo({top:0,behavior:'smooth'});
    return true;
  }

  document.addEventListener('click', async event => {
    const lessonButton = event.target.closest('#training .gx-formation-module-lessons [data-lesson]');
    if (!lessonButton) return;
    const lesson = (window._lessons || []).find(item => item.id === lessonButton.dataset.lesson);
    if (!lesson || lesson.type === 'video') return;
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