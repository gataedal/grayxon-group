(() => {
  const cfg = window.GRAYXON_CONFIG;
  if (!window.supabase || !cfg?.SUPABASE_URL || !cfg?.SUPABASE_PUBLISHABLE_KEY) return;
  const client = window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  let checking=false, checkedUserId=null, observer=null;
  function removeHomeCard(){document.getElementById('gxTrabajoHomeCard')?.remove();checkedUserId=null;}
  function installStyles(){
    if(document.getElementById('gxTrabajoHomeStyles'))return;
    const style=document.createElement('style');style.id='gxTrabajoHomeStyles';
    style.textContent=`
      #gxTrabajoHomeCard{display:grid;grid-template-columns:58px minmax(0,1fr) 30px;align-items:center;gap:15px;width:100%;margin:18px 0 4px;padding:18px 20px;box-sizing:border-box;border:1px solid rgba(190,198,210,.2);border-radius:18px;background:linear-gradient(112deg,rgba(31,36,44,.98),rgba(13,16,21,.98));color:#f4f6f8;text-decoration:none;box-shadow:0 12px 32px rgba(0,0,0,.2);transition:border-color .18s ease,transform .18s ease,background .18s ease}
      #gxTrabajoHomeCard:hover{border-color:rgba(213,217,223,.55);transform:translateY(-2px);background:linear-gradient(112deg,#252b34,#11151b)}
      #gxTrabajoHomeCard .gxth-icon{width:58px;height:58px;display:grid;place-items:center;border:1px solid rgba(213,217,223,.24);border-radius:15px;background:linear-gradient(145deg,#303741,#171c23);font-size:25px}
      #gxTrabajoHomeCard .gxth-kicker{display:block;margin-bottom:5px;color:#aeb7c3;font-size:9px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}
      #gxTrabajoHomeCard h3{margin:0;color:#fff;font-size:17px;font-weight:800;letter-spacing:-.02em}
      #gxTrabajoHomeCard p{margin:5px 0 0;color:#aeb5bf;font-size:12px;line-height:1.45}
      #gxTrabajoHomeCard .gxth-arrow{justify-self:end;color:#d5d9df;font-size:24px}
      @media(max-width:540px){#gxTrabajoHomeCard{grid-template-columns:48px minmax(0,1fr) 20px;gap:12px;padding:14px;border-radius:15px;margin-top:14px}#gxTrabajoHomeCard .gxth-icon{width:48px;height:48px;border-radius:13px;font-size:22px}#gxTrabajoHomeCard h3{font-size:15px}#gxTrabajoHomeCard p{font-size:11px}}
    `;document.head.appendChild(style);
  }
  async function syncHomeCard(force=false){
    if(checking)return;
    const home=document.getElementById('home');if(!home)return;
    checking=true;
    try{
      const {data,error:sessionError}=await client.auth.getSession(),user=data?.session?.user;
      if(sessionError||!user){removeHomeCard();return;}
      if(!force&&checkedUserId===user.id&&document.getElementById('gxTrabajoHomeCard'))return;
      const {data:member,error}=await client.from('gx_internal_members').select('id,active').eq('user_id',user.id).maybeSingle();
      if(error||!member||member.active!==true){removeHomeCard();return;}
      installStyles();
      let card=document.getElementById('gxTrabajoHomeCard');
      if(!card){
        card=document.createElement('a');card.id='gxTrabajoHomeCard';card.href='./grayxon-trabajo.html';card.setAttribute('aria-label','Abrir Grayxon Trabajo');
        card.innerHTML='<span class="gxth-icon" aria-hidden="true">▤</span><span><small class="gxth-kicker">Espacio interno</small><h3>Grayxon Trabajo</h3><p>Consulta tus tareas, solicitudes y actividades del equipo.</p></span><span class="gxth-arrow" aria-hidden="true">›</span>';
      }
      if(card.parentElement!==home)home.appendChild(card);
      checkedUserId=user.id;
    }catch(error){console.warn('[Grayxon Trabajo] No se pudo sincronizar el acceso del inicio:',error?.message||error);removeHomeCard();}
    finally{checking=false;}
  }
  function observeHome(){
    const home=document.getElementById('home');if(!home||observer)return;
    observer=new MutationObserver(()=>{if(!document.getElementById('gxTrabajoHomeCard')){checkedUserId=null;syncHomeCard();}});
    observer.observe(home,{childList:true,subtree:false});syncHomeCard();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observeHome,{once:true});else observeHome();
  window.addEventListener('load',()=>syncHomeCard(true),{once:true});
  client.auth.onAuthStateChange(()=>{checkedUserId=null;setTimeout(()=>syncHomeCard(true),0);});
})();