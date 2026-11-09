(() => {
  const cfg = window.GRAYXON_CONFIG;
  if (!window.supabase || !cfg?.SUPABASE_URL || !cfg?.SUPABASE_PUBLISHABLE_KEY) return;
  const client = window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  let checking=false, checkedUserId=null, observer=null;

  function removeCard(){
    document.getElementById('gxTrabajoDashboardCard')?.remove();
    checkedUserId=null;
  }

  function installStyles(){
    if(document.getElementById('gxTrabajoDashboardStyles'))return;
    const style=document.createElement('style');
    style.id='gxTrabajoDashboardStyles';
    style.textContent=`
      .gx-trabajo-dashboard-card{box-sizing:border-box!important;text-decoration:none!important;min-width:0!important;width:100%;color:var(--text,#f5f6f8)!important}
      .gx-trabajo-dashboard-card .gx-trabajo-card-icon{flex:0 0 42px;width:42px;height:42px;display:grid;place-items:center;border:1px solid rgba(213,217,223,.24);border-radius:12px;background:linear-gradient(145deg,#303741,#171c23);font-size:21px}
      .gx-trabajo-dashboard-card .gx-trabajo-card-copy{display:flex;flex:1;flex-direction:column;gap:7px;min-width:0}
      .gx-trabajo-dashboard-card .gx-trabajo-card-copy strong{font-size:15px;color:#f4f5f7}
      .gx-trabajo-dashboard-card .gx-trabajo-card-copy small{font-size:12px;line-height:1.5;color:#a7b0bf}
      .gx-trabajo-dashboard-card .gx-trabajo-card-arrow{align-self:flex-end;color:#25f4ee;font-size:25px;line-height:1}
    `;
    document.head.appendChild(style);
  }

  function getDashboardTarget(){
    const admin=document.querySelector('#admin:not(.hidden) .admin-dashboard-grid');
    if(admin)return {grid:admin,role:'admin'};
    const manager=document.querySelector('#manager:not(.hidden) .manager-dashboard-grid');
    if(manager)return {grid:manager,role:'manager'};
    return null;
  }

  async function syncDashboardCard(force=false){
    if(checking)return;
    checking=true;
    try{
      const target=getDashboardTarget();
      if(!target){removeCard();return;}
      const {data,error:sessionError}=await client.auth.getSession();
      const user=data?.session?.user;
      if(sessionError||!user){removeCard();return;}
      if(!force&&checkedUserId===user.id&&document.getElementById('gxTrabajoDashboardCard'))return;
      const {data:member,error}=await client.from('gx_internal_members').select('id,active').eq('user_id',user.id).maybeSingle();
      if(error||!member||member.active!==true){removeCard();return;}

      installStyles();
      let card=document.getElementById('gxTrabajoDashboardCard');
      if(!card){
        card=document.createElement('a');
        card.id='gxTrabajoDashboardCard';
        card.href='./grayxon-trabajo.html';
        card.className='admin-dashboard-card manager-dashboard-card gx-trabajo-dashboard-card';
        card.setAttribute('aria-label','Abrir Grayxon Trabajo');
        card.innerHTML='<span class="gx-trabajo-card-icon" aria-hidden="true">▤</span><span class="gx-trabajo-card-copy"><strong>Grayxon Trabajo</strong><small>Consulta tus tareas, solicitudes y actividades del equipo.</small></span><span class="gx-trabajo-card-arrow" aria-hidden="true">›</span>';
      }
      if(card.parentElement!==target.grid)target.grid.appendChild(card);
      checkedUserId=user.id;
    }catch(error){
      console.warn('[Grayxon Trabajo] No se pudo sincronizar la tarjeta del dashboard:',error?.message||error);
      removeCard();
    }finally{checking=false;}
  }

  function observeDashboard(){
    if(observer)return;
    observer=new MutationObserver(()=>syncDashboardCard());
    observer.observe(document.body,{childList:true,subtree:true});
    syncDashboardCard(true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observeDashboard,{once:true});
  else observeDashboard();
  window.addEventListener('load',()=>syncDashboardCard(true),{once:true});
  window.addEventListener('hashchange',()=>{checkedUserId=null;syncDashboardCard(true)});
  client.auth.onAuthStateChange(()=>{checkedUserId=null;setTimeout(()=>syncDashboardCard(true),0)});
})();