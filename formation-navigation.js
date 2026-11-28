(function () {
  'use strict';
  if (window.__gxFormationNavigationV1) return;
  window.__gxFormationNavigationV1 = true;

  const style = document.createElement('style');
  style.id = 'gx-formation-navigation-style';
  style.textContent = `
    #training .gx-formation-v3 [data-gx-formation-target] { scroll-margin-top: 24px; }
    #training .gx-formation-tabs a { transition: color .18s ease; }
    #training .gx-formation-tabs a:focus-visible { outline: 2px solid #25f4ee; outline-offset: 5px; border-radius: 3px; }
    @media (prefers-reduced-motion: reduce) {
      #training .gx-formation-tabs a { transition: none; }
    }
  `;
  document.head.appendChild(style);

  function activate(tabs, active) {
    tabs.querySelectorAll('a[href^="#gx-formation-"]').forEach(function (link) {
      const selected = link === active;
      link.classList.toggle('is-active', selected);
      if (selected) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }

  function configure(root) {
    const tabs = root.querySelector('.gx-formation-tabs');
    const hero = root.querySelector('.gx-formation-hero');
    const modules = root.querySelector('.formation-section') ||
      root.querySelector('.gx-formation-section-intro') ||
      root.querySelector('.formation-groups');
    if (!tabs || !hero || !modules) return;

    hero.id = 'gx-formation-route-target';
    hero.setAttribute('data-gx-formation-target', 'route');
    modules.id = 'gx-formation-modules-target';
    modules.setAttribute('data-gx-formation-target', 'modules');

    const links = Array.from(tabs.querySelectorAll('a'));
    const routeLink = links.find(link => /ruta de aprendizaje/i.test(link.textContent));
    const modulesLink = links.find(link => /mis módulos/i.test(link.textContent));
    if (!routeLink || !modulesLink) return;

    routeLink.href = '#gx-formation-route-target';
    modulesLink.href = '#gx-formation-modules-target';
    activate(tabs, routeLink);

    if (window.__gxFormationObserver) window.__gxFormationObserver.disconnect();
    if ('IntersectionObserver' in window) {
      window.__gxFormationObserver = new IntersectionObserver(function (entries) {
        const visible = entries.filter(entry => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        activate(tabs, visible.target.getAttribute('data-gx-formation-target') === 'modules' ? modulesLink : routeLink);
      }, { root: null, threshold: [0.15, 0.35, 0.6], rootMargin: '-12% 0px -58% 0px' });
      window.__gxFormationObserver.observe(hero);
      window.__gxFormationObserver.observe(modules);
    }

    tabs.setAttribute('aria-label', 'Navegación de formación');
  }

  document.addEventListener('click', function (event) {
    const link = event.target.closest('#training .gx-formation-tabs a[href^="#gx-formation-"]');
    if (!link) return;
    const target = document.getElementById(link.getAttribute('href').slice(1));
    if (!target) return;
    event.preventDefault();
    activate(link.closest('.gx-formation-tabs'), link);
    target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });

  const training = document.getElementById('training');
  if (!training) return;
  const observer = new MutationObserver(function () { configure(training); });
  observer.observe(training, { childList: true, subtree: true });
  configure(training);
})();
