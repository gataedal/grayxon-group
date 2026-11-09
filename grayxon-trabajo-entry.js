(() => {
  const cfg = window.GRAYXON_CONFIG;
  if (!window.supabase || !cfg?.SUPABASE_URL || !cfg?.SUPABASE_PUBLISHABLE_KEY) return;

  const client = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  let checking = false;
  async function addEntry() {
    if (checking || document.getElementById('gxTrabajoEntry')) return;
    checking = true;
    try {
      const { data } = await client.auth.getSession();
      const user = data?.session?.user;
      if (!user) return;
      const { data: member, error } = await client
        .from('gx_internal_members')
        .select('id,active')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error || !member || member.active !== true) return;

      const host = document.querySelector('.header-actions');
      if (!host) return;
      const link = document.createElement('a');
      link.id = 'gxTrabajoEntry';
      link.href = './grayxon-trabajo.html';
      link.className = 'admin-btn';
      link.textContent = 'Trabajo';
      link.setAttribute('aria-label', 'Abrir Grayxon Trabajo');
      link.style.textDecoration = 'none';
      link.style.display = 'inline-flex';
      link.style.alignItems = 'center';
      link.style.justifyContent = 'center';
      host.insertBefore(link, host.firstChild);
    } catch (error) {
      console.warn('[Grayxon Trabajo] No se pudo mostrar el acceso:', error?.message || error);
    } finally {
      checking = false;
    }
  }

  addEntry();
  window.addEventListener('load', addEntry, { once: true });
  client.auth.onAuthStateChange(() => { addEntry(); });
})();
