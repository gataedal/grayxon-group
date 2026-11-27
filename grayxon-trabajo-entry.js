(() => {
  const client = window.GRAYXON_SUPABASE_CLIENT;
  if (!client) { console.warn('[Gestión Grayxon] No está disponible el cliente de autenticación compartido.'); return; }
  let checking=false, retryRequested=false, checkedUserId=null, observer=null, syncTimer=null, memberCache={userId:null,allowed:false};

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

  async function syncDashboardCard(){
    if(checking){retryRequested=true;return;}
    checking=true;
    retryRequested=false;
    try{
      const targetBefore=getDashboardTarget();
      if(!targetBefore){removeCard();return;}
      const {data,error:sessionError}=await client.auth.getSession();
      const user=data?.session?.user;
      if(sessionError||!user){removeCard();memberCache={userId:null,allowed:false};return;}

      const dashboardRole=targetBefore.role;
      let allowed=memberCache.userId===user.id&&memberCache.dashboardRole===dashboardRole?memberCache.allowed:null;
      if(allowed===null){
        const {data:member,error:memberError}=await client.from('gx_internal_members').select('id,active').eq('user_id',user.id).maybeSingle();
        allowed=!memberError&&!!member&&member.active===true;

        // Los managers no necesariamente pertenecen a gx_internal_members.
        // Su acceso se valida con el mismo vínculo perfil -> managers que usa Gestión.
        if(!allowed&&dashboardRole==='manager'){
          const {data:profile,error:profileError}=await client.from('profiles')
            .select('id,role,active,manager_id').eq('id',user.id).maybeSingle();
          if(!profileError&&profile?.role==='manager'&&profile.active===true&&profile.manager_id){
            const {data:manager,error:managerError}=await client.from('managers')
              .select('id,user_id,active').eq('id',profile.manager_id)
              .eq('user_id',user.id).eq('active',true).maybeSingle();
            allowed=!managerError&&!!manager;
          }
        }
        memberCache={userId:user.id,allowed,dashboardRole};
      }
      if(!allowed){removeCard();return;}

      // La aplicación puede reconstruir el dashboard mientras se consulta Supabase.
      // Volver a buscar el contenedor justo antes de insertar evita usar un nodo obsoleto.
      const target=getDashboardTarget();
      if(!target||!target.grid.isConnected){retryRequested=true;return;}

      installStyles();
      let card=document.getElementById('gxTrabajoDashboardCard');
      if(!card){
        card=document.createElement('a');
        card.id='gxTrabajoDashboardCard';
        card.href='./grayxon-trabajo.html';
        card.className='admin-dashboard-card manager-dashboard-card gx-trabajo-dashboard-card';
        card.setAttribute('aria-label','Abrir Gestión');
        card.innerHTML='<span class="gx-trabajo-card-icon" aria-hidden="true">▤</span><span class="gx-trabajo-card-copy"><strong>Gestión</strong><small>Organiza tareas, solicitudes y seguimiento del equipo.</small></span><span class="gx-trabajo-card-arrow" aria-hidden="true">›</span>';
      }
      if(card.parentElement!==target.grid)target.grid.appendChild(card);
      checkedUserId=user.id;
    }catch(error){
      console.warn('[Gestión Grayxon] No se pudo sincronizar la tarjeta del dashboard:',error?.message||error);
    }finally{
      checking=false;
      if(retryRequested){
        retryRequested=false;
        setTimeout(syncDashboardCard,120);
      }
    }
  }

  function scheduleSync(){
    if(syncTimer)clearTimeout(syncTimer);
    syncTimer=setTimeout(()=>{syncTimer=null;syncDashboardCard()},100);
  }

  function observeDashboard(){
    if(observer)return;
    observer=new MutationObserver(scheduleSync);
    observer.observe(document.body,{childList:true,subtree:true});
    scheduleSync();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observeDashboard,{once:true});
  else observeDashboard();
  window.addEventListener('load',scheduleSync,{once:true});
  window.addEventListener('hashchange',scheduleSync);
  client.auth.onAuthStateChange(()=>{memberCache={userId:null,allowed:false};scheduleSync()});
  // Respaldo tras los ciclos de render iniciales del portal.
  [300,900,1800,3000].forEach(delay=>setTimeout(scheduleSync,delay));
})();