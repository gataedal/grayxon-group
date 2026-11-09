(() => {
  const cfg = window.GRAYXON_CONFIG;
  if (!window.supabase || !cfg?.SUPABASE_URL || !cfg?.SUPABASE_PUBLISHABLE_KEY) return;
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dateLabel = value => value ? new Intl.DateTimeFormat('es-CO',{day:'2-digit',month:'long',year:'numeric'}).format(new Date(value)) : '';
  const dateTimeLabel = value => value ? new Intl.DateTimeFormat('es-CO',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value)) : '';
  let currentUserId = null, deliveries = [], filesByDelivery = new Map(), signedFiles = new Map(), previousOverflow = '';
  let screen, listRoot, detailRoot, navButton;

  function installStyles(){
    if(document.getElementById('gxCreatorDeliveriesStyles'))return;
    const style=document.createElement('style');style.id='gxCreatorDeliveriesStyles';
    style.textContent=`
      #gxCreatorDeliveriesScreen{position:fixed;inset:0;z-index:16000;overflow:auto;background:radial-gradient(ellipse at 12% 0%,#17212a 0%,#080a0d 42%,#070809 100%);color:#f4f6f8;padding:calc(env(safe-area-inset-top,0px) + 15px) 16px calc(env(safe-area-inset-bottom,0px) + 28px);box-sizing:border-box}
      #gxCreatorDeliveriesScreen[hidden]{display:none!important}
      .gx-delivery-shell{width:min(900px,100%);margin:0 auto}
      .gx-delivery-head{display:flex;align-items:center;gap:13px;padding:4px 0 18px;border-bottom:1px solid #29323c}
      .gx-delivery-back{width:42px;height:42px;flex:0 0 42px;border:1px solid #3a4653;border-radius:13px;background:linear-gradient(145deg,#202a35,#10151b);color:#eaf1f6;font-size:23px;cursor:pointer}
      .gx-delivery-head-copy{min-width:0;flex:1}.gx-delivery-head-copy h1{margin:0;font-size:clamp(23px,4vw,30px);letter-spacing:-.04em}.gx-delivery-head-copy p{margin:4px 0 0;color:#96a4b2;font-size:12px}
      .gx-delivery-brandline{font-size:9px;letter-spacing:.22em;color:#25dce1;font-weight:800;margin-bottom:4px}
      .gx-delivery-intro{margin:20px 0 15px;padding:17px;border:1px solid transparent;border-radius:17px;background:linear-gradient(#10151b,#10151b) padding-box,linear-gradient(120deg,#25f4ee,#52606e 42%,#fe2c55) border-box;box-shadow:0 12px 35px #0005}
      .gx-delivery-intro strong{font-size:14px}.gx-delivery-intro p{margin:6px 0 0;color:#aab6c3;font-size:12px;line-height:1.55}
      .gx-delivery-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}
      .gx-delivery-card{min-width:0;border:1px solid #303d49;border-radius:16px;background:linear-gradient(145deg,#151c24,#0d1117);overflow:hidden;box-shadow:0 9px 24px #0004}
      .gx-delivery-card-top{display:flex;align-items:flex-start;gap:11px;padding:14px}
      .gx-delivery-thumb{width:78px;height:78px;flex:0 0 78px;display:grid;place-items:center;border:1px solid #34434f;border-radius:12px;background:linear-gradient(145deg,#1d2b33,#12171d);overflow:hidden;color:#76e6e8;font-size:25px}
      .gx-delivery-thumb img{width:100%;height:100%;object-fit:cover}
      .gx-delivery-card-copy{min-width:0;flex:1}.gx-delivery-card-copy h2{font-size:14px;line-height:1.35;margin:1px 0 6px}.gx-delivery-card-copy p{font-size:10px;line-height:1.45;color:#91a0af;margin:0}
      .gx-delivery-version{display:inline-flex;padding:4px 7px;margin-top:8px;border:1px solid #36575c;border-radius:999px;background:#13262a;color:#8ae8e7;font-size:9px;font-weight:750}
      .gx-delivery-card-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 13px;border-top:1px solid #28333d;background:#0b1016}
      .gx-delivery-card-foot small{font-size:9px;color:#8392a1}
      .gx-delivery-btn{min-height:35px;padding:0 13px;border:1px solid #7de8e8;border-radius:10px;background:linear-gradient(110deg,#c8d4df,#25e8e8);color:#071114;font-size:11px;font-weight:850;cursor:pointer;box-shadow:0 4px 14px #25f4ee18}
      .gx-delivery-empty,.gx-delivery-loading{padding:34px 18px;text-align:center;border:1px dashed #35424e;border-radius:16px;color:#9ba9b7;font-size:12px;line-height:1.6;background:#0d1218}
      .gx-delivery-empty-icon{font-size:32px;margin-bottom:8px;color:#6fdde0}
      .gx-delivery-modal{position:fixed;inset:0;z-index:16010;display:flex;align-items:center;justify-content:center;padding:14px;background:#020406d9;backdrop-filter:blur(9px)}
      .gx-delivery-modal[hidden]{display:none!important}
      .gx-delivery-dialog{width:min(760px,100%);max-height:90dvh;overflow:auto;border:1px solid transparent;border-radius:19px;background:linear-gradient(#0d1117,#0d1117) padding-box,linear-gradient(135deg,#25f4ee,#394652 42%,#fe2c55) border-box;box-shadow:0 25px 80px #000b}
      .gx-delivery-dialog-head{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:12px;padding:15px 17px;background:#10151bf2;border-bottom:1px solid #2b3540;backdrop-filter:blur(12px)}
      .gx-delivery-dialog-head>div:first-child{min-width:0;flex:1}.gx-delivery-dialog-head h2{font-size:17px;margin:0}.gx-delivery-dialog-head p{font-size:10px;color:#8f9eac;margin:4px 0 0}
      .gx-delivery-close{width:35px;height:35px;border:1px solid #3b4652;border-radius:10px;background:#171e26;color:#eaf0f5;font-size:22px;cursor:pointer}
      .gx-delivery-dialog-body{padding:15px;display:grid;gap:12px}
      .gx-delivery-file{display:flex;align-items:center;gap:10px;padding:11px;border:1px solid #2d3a46;border-radius:13px;background:linear-gradient(145deg,#141b23,#0d1218)}
      .gx-delivery-file-icon{width:38px;height:38px;flex:0 0 38px;display:grid;place-items:center;border:1px solid #3c5c62;border-radius:10px;background:#15282d;color:#8de8e8}
      .gx-delivery-file-copy{min-width:0;flex:1}.gx-delivery-file-copy strong{display:block;font-size:11px;overflow-wrap:anywhere}.gx-delivery-file-copy small{display:block;color:#8291a0;font-size:9px;margin-top:4px}
      .gx-delivery-file-actions{display:flex;gap:6px;flex-wrap:wrap}.gx-delivery-file-actions button{min-height:32px;padding:0 10px;border:1px solid #3b4b58;border-radius:9px;background:#19222b;color:#dbe5ec;font-size:10px;font-weight:750;cursor:pointer}.gx-delivery-file-actions .primary{border-color:#7de8e8;background:linear-gradient(110deg,#c8d4df,#25e8e8);color:#071114}
      .gx-delivery-preview{min-height:180px;max-height:55dvh;display:grid;place-items:center;border:1px solid #2d3a46;border-radius:13px;background:#080c11;overflow:hidden}
      .gx-delivery-preview img,.gx-delivery-preview video{display:block;max-width:100%;max-height:55dvh;object-fit:contain}
      .gx-delivery-preview iframe{width:100%;height:55dvh;border:0;background:#fff}
      .gx-delivery-preview-note{padding:24px;text-align:center;color:#9eacb9;font-size:12px;line-height:1.6}
      @media(max-width:620px){.gx-delivery-list{grid-template-columns:1fr}.gx-delivery-card-top{padding:12px}.gx-delivery-thumb{width:70px;height:70px;flex-basis:70px}.gx-delivery-modal{padding:7px}.gx-delivery-dialog{max-height:92dvh;border-radius:15px}.gx-delivery-dialog-body{padding:10px}.gx-delivery-file{align-items:flex-start;flex-wrap:wrap}.gx-delivery-file-copy{max-width:calc(100% - 52px)}.gx-delivery-file-actions{width:100%;padding-left:48px}}
    `;
    document.head.appendChild(style);
  }

  function ensureScreen(){
    if(screen)return;
    installStyles();
    screen=document.createElement('section');
    screen.id='gxCreatorDeliveriesScreen';
    screen.hidden=true;
    screen.innerHTML=`<div class="gx-delivery-shell">
      <header class="gx-delivery-head">
        <button type="button" class="gx-delivery-back" id="gxDeliveriesBack" aria-label="Volver">‹</button>
        <div class="gx-delivery-head-copy"><div class="gx-delivery-brandline">GRAYXON · CONTENIDO</div><h1>Mis entregas</h1><p>Material aprobado y publicado para ti</p></div>
      </header>
      <div class="gx-delivery-intro"><strong>Tu contenido, listo para descargar.</strong><p>Aquí encontrarás los flyers, imágenes, videos y materiales que el equipo Grayxon haya aprobado y enviado a tu cuenta.</p></div>
      <div id="gxCreatorDeliveriesList" class="gx-delivery-list"><div class="gx-delivery-loading">Cargando tus entregas…</div></div>
    </div>
    <div id="gxCreatorDeliveryDetail" class="gx-delivery-modal" hidden><section class="gx-delivery-dialog" role="dialog" aria-modal="true" aria-label="Detalle de entrega"><header class="gx-delivery-dialog-head"><div><h2 id="gxCreatorDeliveryTitle">Entrega</h2><p id="gxCreatorDeliveryMeta"></p></div><button type="button" class="gx-delivery-close" id="gxCreatorDeliveryClose" aria-label="Cerrar">×</button></header><div class="gx-delivery-dialog-body" id="gxCreatorDeliveryFiles"></div></section></div>`;
    document.body.appendChild(screen);
    listRoot=screen.querySelector('#gxCreatorDeliveriesList');
    detailRoot=screen.querySelector('#gxCreatorDeliveryDetail');
    screen.querySelector('#gxDeliveriesBack').addEventListener('click',closeScreen);
    screen.querySelector('#gxCreatorDeliveryClose').addEventListener('click',closeDetail);
    detailRoot.addEventListener('click',e=>{if(e.target===detailRoot)closeDetail()});
    screen.addEventListener('click',e=>{
      const open=e.target.closest('[data-open-delivery]');
      if(open)openDelivery(open.dataset.openDelivery);
      const view=e.target.closest('[data-view-delivery-file]');
      if(view)previewFile(view.dataset.viewDeliveryFile);
      const download=e.target.closest('[data-download-delivery-file]');
      if(download)downloadFile(download.dataset.downloadDeliveryFile,download.dataset.fileName,download);
      const close=e.target.closest('[data-close-delivery-preview]');
      if(close)document.getElementById('gxCreatorDeliveryPreview')?.remove();
    });
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!detailRoot.hidden)closeDetail();else if(!screen.hidden)closeScreen()}});
  }

  async function getSessionAndRole(){
    const {data,error}=await sb.auth.getSession();
    if(error||!data?.session?.user?.id)return null;
    const uid=data.session.user.id;
    const {data:profile,error:profileError}=await sb.from('profiles').select('id,role,active').eq('id',uid).maybeSingle();
    if(profileError||profile?.role!=='creator'||profile.active!==true)return null;
    currentUserId=uid;
    return uid;
  }

  async function loadDeliveries(){
    if(!currentUserId){listRoot.innerHTML='<div class="gx-delivery-empty">Inicia sesión con tu cuenta de creador para consultar tus entregas.</div>';return;}
    listRoot.innerHTML='<div class="gx-delivery-loading">Cargando tus entregas…</div>';
    const {data,error}=await sb.from('gx_creator_deliveries').select('*').eq('creator_user_id',currentUserId).not('published_at','is',null).order('published_at',{ascending:false});
    if(error){console.error('[Mis entregas]',error);listRoot.innerHTML='<div class="gx-delivery-empty">No pudimos cargar tus entregas. Intenta nuevamente.</div>';return;}
    deliveries=data||[];
    signedFiles.clear();filesByDelivery.clear();
    const ids=deliveries.map(d=>d.id);
    let fileRows=[];
    if(ids.length){
      const {data:rows,error:fileError}=await sb.from('gx_creator_delivery_files').select('*').in('delivery_id',ids).order('created_at',{ascending:true});
      if(fileError)console.warn('[Mis entregas archivos]',fileError.message);
      fileRows=rows||[];
    }
    for(const file of fileRows){
      const {data:signed,error:signedError}=await sb.storage.from(file.bucket_id).createSignedUrl(file.object_path,3600);
      if(signedError||!signed?.signedUrl)continue;
      const enriched={...file,url:signed.signedUrl};
      signedFiles.set(file.id,enriched);
      if(!filesByDelivery.has(file.delivery_id))filesByDelivery.set(file.delivery_id,[]);
      filesByDelivery.get(file.delivery_id).push(enriched);
    }
    renderList();
  }

  function renderList(){
    if(!deliveries.length){listRoot.innerHTML='<div class="gx-delivery-empty"><div class="gx-delivery-empty-icon">✧</div><strong>Aún no tienes entregas.</strong><br>Cuando Grayxon apruebe y publique contenido para ti, aparecerá aquí.</div>';return;}
    listRoot.innerHTML=deliveries.map(d=>{
      const files=filesByDelivery.get(d.id)||[];
      const first=files[0];
      const thumb=first&&String(first.mime_type||'').startsWith('image/')?'<img src="'+esc(first.url)+'" alt="">':'<span>'+(first&&String(first.mime_type||'').startsWith('video/')?'▶':'✧')+'</span>';
      return '<article class="gx-delivery-card"><div class="gx-delivery-card-top"><div class="gx-delivery-thumb">'+thumb+'</div><div class="gx-delivery-card-copy"><h2>'+esc(d.title)+'</h2><p>Publicado el '+esc(dateTimeLabel(d.published_at))+' · '+files.length+' archivo(s)</p><span class="gx-delivery-version">VERSIÓN '+esc(d.version)+'</span></div></div><div class="gx-delivery-card-foot"><small>Contenido aprobado por Grayxon</small><button type="button" class="gx-delivery-btn" data-open-delivery="'+esc(d.id)+'">Ver entrega</button></div></article>';
    }).join('');
  }

  function openScreen(deliveryId){
    ensureScreen();
    previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    screen.hidden=false;
    loadDeliveries().then(()=>{if(deliveryId)openDelivery(deliveryId)});
  }
  function closeScreen(){
    if(!screen)return;
    screen.hidden=true;closeDetail();
    document.body.style.overflow=previousOverflow;
  }
  function closeDetail(){if(detailRoot)detailRoot.hidden=true;document.getElementById('gxCreatorDeliveryPreview')?.remove()}
  function openDelivery(id){
    const d=deliveries.find(x=>x.id===id);
    if(!d)return;
    const files=filesByDelivery.get(id)||[];
    screen.querySelector('#gxCreatorDeliveryTitle').textContent=d.title||'Entrega';
    screen.querySelector('#gxCreatorDeliveryMeta').textContent='Publicado '+dateLabel(d.published_at)+' · Versión '+d.version;
    const body=screen.querySelector('#gxCreatorDeliveryFiles');
    body.innerHTML=files.length?files.map(f=>'<article class="gx-delivery-file"><div class="gx-delivery-file-icon">↧</div><div class="gx-delivery-file-copy"><strong>'+esc(f.file_name)+'</strong><small>'+esc(f.mime_type||'Archivo')+' · '+(f.size_bytes?Math.max(1,Math.round(f.size_bytes/1024))+' KB':'Tamaño original')+'</small></div><div class="gx-delivery-file-actions"><button type="button" data-view-delivery-file="'+esc(f.id)+'">Ver</button><button type="button" class="primary" data-download-delivery-file="'+esc(f.id)+'" data-file-name="'+esc(f.file_name)+'">Descargar</button></div></article>').join(''):'<div class="gx-delivery-empty">Esta entrega no tiene archivos disponibles.</div>';
    detailRoot.hidden=false;
  }

  function previewFile(id){
    const f=signedFiles.get(id);if(!f)return;
    document.getElementById('gxCreatorDeliveryPreview')?.remove();
    let preview='';
    if((f.mime_type||'').startsWith('image/'))preview='<img src="'+esc(f.url)+'" alt="'+esc(f.file_name)+'">';
    else if((f.mime_type||'').startsWith('video/'))preview='<video controls playsinline src="'+esc(f.url)+'"></video>';
    else if(f.mime_type==='application/pdf')preview='<iframe src="'+esc(f.url)+'" title="'+esc(f.file_name)+'"></iframe>';
    else preview='<div class="gx-delivery-preview-note">La vista previa no está disponible para este formato.<br>Descarga el archivo para abrirlo con la aplicación correspondiente.</div>';
    const wrap=document.createElement('div');wrap.id='gxCreatorDeliveryPreview';wrap.className='gx-delivery-modal';
    wrap.innerHTML='<section class="gx-delivery-dialog" role="dialog" aria-modal="true"><header class="gx-delivery-dialog-head"><div><h2>'+esc(f.file_name)+'</h2><p>Vista previa</p></div><button type="button" class="gx-delivery-close" data-close-delivery-preview>×</button></header><div class="gx-delivery-dialog-body"><div class="gx-delivery-preview">'+preview+'</div><div class="gx-delivery-file-actions"><button type="button" class="primary" data-download-delivery-file="'+esc(f.id)+'" data-file-name="'+esc(f.file_name)+'">Descargar original</button></div></div></section>';
    wrap.addEventListener('click',e=>{if(e.target===wrap||e.target.closest('[data-close-delivery-preview]'))wrap.remove()});
    screen.appendChild(wrap);
  }

  async function downloadFile(id,name,button){
    const f=signedFiles.get(id);if(!f)return;
    const old=button.textContent;button.disabled=true;button.textContent='Descargando…';
    try{
      const response=await fetch(f.url);if(!response.ok)throw new Error('download failed');
      const blob=await response.blob(),objectUrl=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=objectUrl;a.download=name||f.file_name||'archivo';document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(objectUrl),2000);
    }catch(err){alert('No se pudo descargar el archivo. Intenta nuevamente.')}
    finally{button.disabled=false;button.textContent=old}
  }

  async function init(){
    ensureScreen();
    const uid=await getSessionAndRole();
    if(uid){
      navButton=document.querySelector('#grayxonBottomNav [data-gx-bottom="deliveries"]');
      if(navButton){navButton.hidden=false;document.body.classList.add('gx-has-creator-deliveries')}
    }
    sb.auth.onAuthStateChange(()=>setTimeout(async()=>{
      const nextUid=await getSessionAndRole();
      const btn=document.querySelector('#grayxonBottomNav [data-gx-bottom="deliveries"]');
      if(btn){btn.hidden=!nextUid;document.body.classList.toggle('gx-has-creator-deliveries',!!nextUid)}
      if(!nextUid&&screen&&!screen.hidden)closeScreen();
    },0));
    const target=new URLSearchParams(window.location.search).get('delivery');
    if(uid&&target)openScreen(target);
  }

  document.addEventListener('click',e=>{
    const button=e.target.closest('[data-gx-bottom="deliveries"]');
    if(button){e.preventDefault();e.stopImmediatePropagation();openScreen();return;}
    const notification=e.target.closest('[data-notification-id]');
    if(!notification)return;
    const title=notification.querySelector('.notification-copy strong')?.textContent||'';
    const isCreatorDelivery=/nuevo contenido disponible/i.test(title);
    const isRequesterReview=/propuesta lista para revisar/i.test(title);
    if(!isCreatorDelivery&&!isRequesterReview)return;
    e.preventDefault();e.stopImmediatePropagation();
    (async()=>{
      const {data:sessionData}=await sb.auth.getSession();
      const uid=currentUserId||sessionData?.session?.user?.id;
      if(!uid)return;
      const {data}=await sb.from('notifications').select('id,user_id,type,link_page,link_target,read_at').eq('id',notification.dataset.notificationId).eq('user_id',uid).maybeSingle();
      if(!data)return;
      if(!data.read_at)await sb.from('notifications').update({read_at:new Date().toISOString()}).eq('id',data.id).eq('user_id',uid);
      if(data.type==='creator_delivery_review'&&data.link_page==='grayxon-trabajo'){
        window.location.href='./grayxon-trabajo.html?task='+encodeURIComponent(data.link_target||'');
        return;
      }
      if(data.type==='creator_delivery'&&data.link_page==='creator-delivery'){
        const creatorUid=currentUserId||await getSessionAndRole();
        if(creatorUid)openScreen(data.link_target);
      }
    })();
  },true);

  window.grayxonOpenCreatorDeliveries=(id)=>openScreen(id);
  window.addEventListener('DOMContentLoaded',init,{once:true});
  if(document.readyState!=='loading')init();
})();