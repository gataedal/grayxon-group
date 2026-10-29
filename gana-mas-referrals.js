/* Grayxon Gana más · módulo de referidos */
(function () {
  'use strict';
  if (window.gxReferralsBooted) return;
  window.gxReferralsBooted = true;

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => new Intl.NumberFormat('es-CO',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(value)||0);
  const dateFmt = value => value ? new Intl.DateTimeFormat('es-CO',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value)) : '—';
  const statusInfo = status => ({pending:['Pendiente','pending'],approved:['Activo','approved'],rejected:['No aprobado','rejected'],paid:['Pagado','paid']})[status] || [status || 'Pendiente','pending'];
  const codeFor = username => 'GX-' + String(username || 'GRAYXON').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,18);
  let previousPage = null;
  let isOpen = false;
  let loaded = false;
  let referrals = [];
  let commissions = [];
  let heroBackgroundUrl = null;
  let earningPrograms = [];
  let adminProfiles = [];
  let adminTab = 'overview';
  let editingProgramId = null;
  let selectedAdminProgramId = null;
  let adminProgramSection = 'overview';

  function currentProfile(){ try { return typeof profile !== 'undefined' ? profile : window.profile || null; } catch (_) { return window.profile || null; } }
  function currentSession(){ try { return typeof session !== 'undefined' ? session : window.session || null; } catch (_) { return window.session || null; } }
  function db(){ try { return typeof sb !== 'undefined' ? sb : window.sb || null; } catch (_) { return window.sb || null; } }
  function userId(){ return currentSession()?.user?.id || currentProfile()?.id || null; }
  function isAdmin(){ return currentProfile()?.role === 'admin'; }
  function notify(message, isError=false){
    const toast=$('toast');
    if(toast){toast.textContent=message;toast.classList.remove('hidden');toast.style.background=isError?'#ff8585':'#f0f1f3';toast.style.color='#08090a';setTimeout(()=>toast.classList.add('hidden'),3500);}
    else alert(message);
  }
  function ensurePage(){
    let page=$('gxReferralsPage');
    if(!page){
      page=document.createElement('section');
      page.id='gxReferralsPage';page.className='page hidden';page.setAttribute('aria-label','Gana más');
      const main=document.querySelector('main.wrap');
      if(!main) return null;
      main.appendChild(page);
    }
    return page;
  }
  function ensureButton(){
    let button=$('gxOpenReferrals');
    const host=document.querySelector('header.top .header-actions');
    if(!host) return;
    if(!button){
      button=document.createElement('button');button.id='gxOpenReferrals';button.type='button';
      button.className='gx-referral-header-btn';
      button.innerHTML='<span aria-hidden="true">✦</span><span>Gana más</span>';
      button.addEventListener('click',openPage);
      host.insertBefore(button,host.firstChild);
    }
    const loggedIn=!!userId() && !!currentProfile()?.active;
    // El administrador accede al programa desde su panel, no desde el botón global.
    button.classList.toggle('gx-referral-hidden',!loggedIn || isAdmin());
    ensureAdminProgramCard();
  }

  function ensureAdminProgramCard(){
    if(!isAdmin() || !currentProfile()?.active)return;
    const adminPage=$('admin');
    const grid=adminPage?.querySelector('.admin-dashboard-grid');
    if(!grid)return;
    let card=$('gxAdminReferralProgramCard');
    if(card && card.parentElement!==grid)card.remove();
    if($('gxAdminReferralProgramCard'))return;
    card=document.createElement('button');
    card.type='button';
    card.id='gxAdminReferralProgramCard';
    card.className='admin-dashboard-card';
    card.innerHTML='<span class="admin-dashboard-card-icon" aria-hidden="true">🎁</span><span class="admin-dashboard-card-copy"><strong>Programas para ganar más</strong><small>Crea programas, define beneficios y administra referidos, estados y liquidaciones.</small></span><span class="admin-dashboard-card-arrow" aria-hidden="true">›</span>';
    card.addEventListener('click',openPage);
    grid.appendChild(card);
  }

  function closePage(){
    const page=$('gxReferralsPage');if(!page)return;
    page.classList.add('hidden');page.style.removeProperty('display');isOpen=false;document.body.classList.remove('gx-referrals-mode');
    const visible=previousPage && document.contains(previousPage) ? previousPage : null;
    document.querySelectorAll('main.wrap > .page').forEach(p=>p.classList.add('hidden'));
    if(visible)visible.classList.remove('hidden');
    else if(typeof window.grayxonNavigateToDashboard==='function')window.grayxonNavigateToDashboard();
    else { const home=$('home'); if(home)home.classList.remove('hidden'); }
    const button=$('gxOpenReferrals');if(button)button.classList.remove('is-active');
    window.scrollTo({top:0,behavior:'smooth'});
  }
  async function openPage(){
    const page=ensurePage();if(!page)return;
    if(!userId()){notify('Inicia sesión para acceder a Gana más.',true);return;}
    previousPage=document.querySelector('main.wrap > .page:not(.hidden)');
    if(previousPage===page)previousPage=null;
    document.body.classList.add('gx-referrals-mode');
    document.querySelectorAll('main.wrap > .page').forEach(p=>{p.classList.add('hidden');p.style.removeProperty('display');});
    page.classList.remove('hidden');page.style.display='block';isOpen=true;
    const button=$('gxOpenReferrals');if(button)button.classList.add('is-active');
    window.scrollTo({top:0,behavior:'instant'});
    await loadData();
    render();
  }

  function renderAdminDashboard(page){
    const selected=earningPrograms.find(p=>p.id===selectedAdminProgramId)||null;
    const active=earningPrograms.filter(p=>p.status==='active').length;
    const pending=referrals.filter(r=>r.status==='pending').length;
    const paid=commissions.filter(c=>c.status==='paid').reduce((s,c)=>s+Number(c.commission_amount||0),0);
    const awaiting=commissions.filter(c=>c.status==='pending').reduce((s,c)=>s+Number(c.commission_amount||0),0);
    let content='';
    if(adminTab==='create-program'){
      content='<section class="gx-admin-block"><div class="gx-admin-block-head"><div><span class="gx-ref-eyebrow">CONFIGURACIÓN</span><h3>'+(editingProgramId?'Editar programa':'Crear programa')+'</h3></div><button type="button" class="gx-admin-secondary-btn" data-admin-back>← Resumen</button></div>'+adminProgramForm(earningPrograms.find(p=>p.id===editingProgramId)||null)+'</section>';
    }else if(adminTab==='program-detail'&&selected){
      const refs=referrals.filter(r=>r.program_id===selected.id), ids=refs.map(r=>r.id), cs=commissions.filter(c=>ids.includes(c.referral_id));
      const sections=[['overview','Resumen'],['referrals','Referidos'],['commissions','Liquidaciones'],['settings','Configuración']];
      const nav=sections.map(([id,label])=>'<button type="button" class="gx-admin-tab '+(adminProgramSection===id?'active':'')+'" data-program-section="'+id+'">'+label+'</button>').join('');
      let body='';
      if(adminProgramSection==='overview'){
        body='<div class="gx-admin-kpis"><article><small>Referidos registrados</small><strong>'+refs.length+'</strong></article><article><small>Por validar</small><strong>'+refs.filter(r=>r.status==='pending').length+'</strong></article><article><small>Validados</small><strong>'+refs.filter(r=>r.status==='approved').length+'</strong></article><article><small>Comisiones pagadas</small><strong>'+money(cs.filter(c=>c.status==='paid').reduce((s,c)=>s+Number(c.commission_amount||0),0))+'</strong></article></div><div class="gx-admin-quick-grid gx-admin-program-actions"><button type="button" data-program-section="referrals"><span>↗</span><strong>Administrar referidos</strong><small>Registrar, cambiar estados y eliminar registros.</small></button><button type="button" data-program-section="commissions"><span>＄</span><strong>Liquidaciones</strong><small>Registrar, aprobar y controlar pagos de este programa.</small></button><button type="button" data-program-section="settings"><span>⚙</span><strong>Configuración</strong><small>Editar condiciones o eliminar el programa.</small></button></div><section class="gx-admin-block"><span class="gx-ref-eyebrow">CONDICIONES DEL PROGRAMA</span><h3>'+esc(selected.name)+'</h3><p>'+esc(selected.description||'Sin descripción configurada.')+'</p><div class="gx-admin-program-conditions">'+esc(selected.requirements||'No se han definido requisitos adicionales.')+'</div></section>';
      }else if(adminProgramSection==='referrals'){
        body='<section class="gx-admin-block"><div class="gx-admin-block-head"><div><span class="gx-ref-eyebrow">REGISTRO</span><h3>Registrar referido</h3><p>Se asociará a '+esc(selected.name)+'.</p></div></div>'+adminReferralForm(selected.id)+'</section><section class="gx-admin-block"><div class="gx-admin-block-head"><div><span class="gx-ref-eyebrow">SEGUIMIENTO</span><h3>Referidos del programa</h3><div class="gx-admin-filter"><label for="gxAdminReferralFilter">Estado</label><select id="gxAdminReferralFilter"><option value="all">Todos</option><option value="pending">Por validar</option><option value="approved">Validados</option><option value="rejected">Rechazados</option></select></div></div></div><div id="gxAdminReferralRows">'+renderAdminReferralRows(refs)+'</div></section>';
      }else if(adminProgramSection==='commissions'){
        body='<section class="gx-admin-block"><div class="gx-admin-block-head"><div><span class="gx-ref-eyebrow">CONTROL FINANCIERO</span><h3>Registrar liquidación</h3><p>Solo se incluyen referidos validados de este programa.</p></div></div>'+adminCommissionForm(refs.filter(r=>r.status==='approved'))+'</section><section class="gx-admin-block"><div class="gx-admin-block-head"><div><span class="gx-ref-eyebrow">HISTORIAL</span><h3>Liquidaciones del programa</h3></div></div>'+renderAdminCommissionRows(cs)+'</section>';
      }else{
        body='<section class="gx-admin-block"><div class="gx-admin-block-head"><div><span class="gx-ref-eyebrow">CONFIGURACIÓN</span><h3>Editar programa</h3></div></div>'+adminProgramForm(selected)+'<div class="gx-admin-danger-zone"><div><strong>Eliminar programa</strong><p>Los referidos y las liquidaciones existentes se conservarán en el historial.</p></div><button type="button" class="gx-admin-danger-btn" id="gxAdminDeleteProgram">Eliminar programa</button></div></section>';
      }
      content='<div class="gx-admin-detail-heading"><button type="button" class="gx-admin-back-btn" data-admin-back>← Todos los programas</button><div><span class="gx-ref-eyebrow">PROGRAMA</span><h2>'+esc(selected.name)+'</h2><p>'+esc(({draft:'Borrador',active:'Activo',paused:'Pausado',archived:'Archivado'})[selected.status]||selected.status)+'</p></div></div><nav class="gx-admin-tabs" aria-label="Secciones del programa">'+nav+'</nav><div class="gx-admin-tab-content">'+body+'</div>';
    }else{
      content='<div class="gx-admin-kpis"><article><small>Programas activos</small><strong>'+active+'</strong></article><article><small>Referidos por validar</small><strong>'+pending+'</strong></article><article><small>Comisiones por aprobar</small><strong>'+money(awaiting)+'</strong></article><article><small>Comisiones pagadas</small><strong>'+money(paid)+'</strong></article></div><div class="gx-admin-programs-header"><div><span class="gx-ref-eyebrow">RESUMEN GENERAL</span><h2>Tus programas</h2><p>Abre cada programa para administrar todo lo relacionado con él.</p></div><button type="button" class="gx-ref-submit gx-admin-create-btn" id="gxAdminCreateProgram">+ Crear programa</button></div><div class="gx-admin-program-grid">'+(earningPrograms.length?earningPrograms.map(p=>{const rs=referrals.filter(r=>r.program_id===p.id),pc=commissions.filter(c=>rs.some(r=>r.id===c.referral_id));return '<button type="button" class="gx-admin-program-card" data-open-program="'+p.id+'">'+(p.hero_image_url?'<img class="gx-admin-program-card-cover" src="'+esc(p.hero_image_url)+'" alt="" loading="lazy">':'')+'<span class="gx-admin-program-card-top"><span class="gx-admin-program-icon">✦</span><span class="gx-admin-status '+esc(p.status)+'">'+esc(({draft:'Borrador',active:'Activo',paused:'Pausado',archived:'Archivado'})[p.status]||p.status)+'</span></span><strong>'+esc(p.name)+'</strong><small>'+esc(({referrals:'Referidos',monthly_bonus:'Bonificación mensual',missions:'Misiones',events:'Eventos',other:'Programa especial'})[p.program_type]||'Programa')+'</small><p>'+esc(p.description||'Administra condiciones, estados y liquidaciones.')+'</p><span class="gx-admin-program-card-stats"><span>'+rs.length+' referidos</span><span>'+money(pc.filter(c=>c.status==='paid').reduce((s,c)=>s+Number(c.commission_amount||0),0))+' pagados</span></span><span class="gx-admin-program-card-cta">Abrir programa ↗</span></button>';}).join(''):'<div class="gx-admin-empty"><strong>Aún no hay programas</strong><p>Crea el primero para empezar.</p></div>')+'</div>';
    }
    page.innerHTML='<div class="gx-admin-center"><header class="gx-admin-center-hero"><span class="gx-ref-eyebrow">GRAYXON GROUP · ADMINISTRACIÓN</span><h1>Programas para ganar más</h1><p>Resumen general y administración independiente para cada programa.</p></header>'+content+'</div>';
    page.querySelectorAll('[data-admin-back]').forEach(b=>b.addEventListener('click',()=>{adminTab='overview';selectedAdminProgramId=null;editingProgramId=null;render();}));
    $('gxAdminCreateProgram')?.addEventListener('click',()=>{editingProgramId=null;adminTab='create-program';render();});
    page.querySelectorAll('[data-open-program]').forEach(b=>b.addEventListener('click',()=>{selectedAdminProgramId=b.dataset.openProgram;adminProgramSection='overview';adminTab='program-detail';render();window.scrollTo({top:0,behavior:'smooth'});}));
    page.querySelectorAll('[data-program-section]').forEach(b=>b.addEventListener('click',()=>{adminProgramSection=b.dataset.programSection;render();}));
    $('gxAdminProgramForm')?.addEventListener('submit',saveAdminProgram);
    $('gxAdminContentMode')?.addEventListener('change',e=>{const media=e.target.value==='media';$('gxAdminTextContent')?.toggleAttribute('hidden',media);$('gxAdminMediaContent')?.toggleAttribute('hidden',!media);});
    $('gxAdminHeroFile')?.addEventListener('change',e=>{const file=e.target.files?.[0];if(!file)return;$('gxAdminHeroFileName').textContent=file.name;const preview=$('gxAdminHeroPreview');if(preview&&file.type.startsWith('image/')){const url=URL.createObjectURL(file);if(preview.tagName==='IMG')preview.src=url;else{const img=document.createElement('img');img.className='gx-admin-upload-preview';img.id='gxAdminHeroPreview';img.alt='Vista previa de la portada';img.src=url;preview.replaceWith(img);}}});
    $('gxAdminContentFile')?.addEventListener('change',e=>{const file=e.target.files?.[0];if(file)$('gxAdminContentFileName').textContent='Archivo seleccionado: '+file.name;});
    $('gxAdminRewardType')?.addEventListener('change',()=>{const t=$('gxAdminRewardType').value,h=$('gxAdminRewardHelp');if(h)h.textContent=t==='percentage'?'Para referidos, este será el porcentaje predeterminado.':t==='fixed_amount'?'Este será el monto fijo predeterminado en USD.':t==='points'?'Esta será la cantidad general de puntos.':'Describe las condiciones específicas del incentivo.';});
    $('gxAdminCancelEdit')?.addEventListener('click',()=>{editingProgramId=null;adminTab=selectedAdminProgramId?'program-detail':'overview';adminProgramSection='settings';render();});
    $('gxAdminReferralForm')?.addEventListener('submit',saveAdminReferral);
    $('gxAdminReferralFilter')?.addEventListener('change',e=>{const rows=referrals.filter(r=>(!selectedAdminProgramId||r.program_id===selectedAdminProgramId)&&(e.target.value==='all'||r.status===e.target.value));$('gxAdminReferralRows').innerHTML=renderAdminReferralRows(rows);bindAdminReferralActions();});
    $('gxAdminCommissionForm')?.addEventListener('submit',saveAdminCommission);
    const preview=()=>{const net=Number($('gxAdminCommissionNet')?.value)||0,rate=Number($('gxAdminCommissionRate')?.value)||0;if($('gxAdminCommissionPreview'))$('gxAdminCommissionPreview').textContent=money(net*rate/100);};
    $('gxAdminCommissionNet')?.addEventListener('input',preview);$('gxAdminCommissionRate')?.addEventListener('input',preview);$('gxAdminCommissionReferral')?.addEventListener('change',e=>{const rate=e.target.selectedOptions?.[0]?.dataset?.rate;if(rate!==undefined&&rate!==''){$('gxAdminCommissionRate').value=rate;preview();}});
    $('gxAdminDeleteProgram')?.addEventListener('click',deleteSelectedAdminProgram);
    bindAdminReferralActions();
  }
  function adminProgramForm(e){
    const mode=e?.content_media_url?'media':'text';
    return '<form id="gxAdminProgramForm" class="gx-admin-form"><input type="hidden" id="gxAdminProgramId" value="'+esc(e?.id||'')+'"><div class="gx-admin-form-grid"><div><label for="gxAdminProgramName">Nombre del programa</label><input id="gxAdminProgramName" required maxlength="120" value="'+esc(e?.name||'')+'" placeholder="Ej. Programa de referidos"></div><div><label for="gxAdminProgramType">Tipo de programa</label><select id="gxAdminProgramType"><option value="referrals" '+(e?.program_type==='referrals'?'selected':'')+'>Referidos</option><option value="monthly_bonus" '+(e?.program_type==='monthly_bonus'?'selected':'')+'>Bonificación mensual</option><option value="missions" '+(e?.program_type==='missions'?'selected':'')+'>Misiones</option><option value="events" '+(e?.program_type==='events'?'selected':'')+'>Eventos</option><option value="other" '+(e?.program_type==='other'?'selected':'')+'>Otro</option></select></div><div><label for="gxAdminRewardType">Tipo de recompensa general</label><select id="gxAdminRewardType"><option value="percentage" '+(e?.reward_type==='percentage'?'selected':'')+'>Porcentaje (%)</option><option value="fixed_amount" '+(e?.reward_type==='fixed_amount'?'selected':'')+'>Monto fijo (USD)</option><option value="points" '+(e?.reward_type==='points'?'selected':'')+'>Puntos</option><option value="custom" '+(e?.reward_type==='custom'?'selected':'')+'>Definida en requisitos</option></select><small class="gx-admin-field-help">Esta es la recompensa general. Puedes definir excepciones individuales al registrar cada referido.</small></div><div><label for="gxAdminRewardValue">Valor general</label><input id="gxAdminRewardValue" type="number" min="0" step="0.01" required value="'+esc(e?.reward_value??0)+'" placeholder="Ej. 10"><small class="gx-admin-field-help" id="gxAdminRewardHelp">Para referidos, este será el porcentaje predeterminado.</small></div><div><label for="gxAdminProgramStatus">Estado</label><select id="gxAdminProgramStatus"><option value="draft" '+(e?.status==='draft'?'selected':'')+'>Borrador</option><option value="active" '+(e?.status==='active'?'selected':'')+'>Activo</option><option value="paused" '+(e?.status==='paused'?'selected':'')+'>Pausado</option><option value="archived" '+(e?.status==='archived'?'selected':'')+'>Archivado</option></select></div><div><label for="gxAdminProgramStart">Fecha de inicio</label><input id="gxAdminProgramStart" type="date" value="'+esc(e?.starts_on||'')+'"></div><div><label for="gxAdminProgramEnd">Fecha de finalización</label><input id="gxAdminProgramEnd" type="date" value="'+esc(e?.ends_on||'')+'"></div></div><section class="gx-admin-media-editor"><div><span class="gx-ref-eyebrow">IDENTIDAD VISUAL</span><h4>Imagen de portada</h4><p>JPG, PNG o WEBP; máximo 10 MB.</p></div>'+(e?.hero_image_url?'<img class="gx-admin-upload-preview" id="gxAdminHeroPreview" src="'+esc(e.hero_image_url)+'" alt="Portada actual">':'<div class="gx-admin-upload-placeholder" id="gxAdminHeroPreview">Sin imagen de portada</div>')+'<label class="gx-admin-upload-control" for="gxAdminHeroFile">Elegir imagen<input id="gxAdminHeroFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label><small id="gxAdminHeroFileName">Puedes mantener la imagen actual o seleccionar otra.</small></section><section class="gx-admin-media-editor"><div><span class="gx-ref-eyebrow">CONTENIDO PARA PARTICIPANTES</span><h4>Descripción o archivo multimedia</h4><p>Puedes usar texto o adjuntar un video, imagen o PDF.</p></div><label for="gxAdminContentMode">Formato de contenido</label><select id="gxAdminContentMode"><option value="text" '+(mode==='text'?'selected':'')+'>Descripción en texto</option><option value="media" '+(mode==='media'?'selected':'')+'>Adjuntar archivo o video</option></select><div id="gxAdminTextContent" '+(mode==='media'?'hidden':'')+'><label for="gxAdminProgramDescription">Descripción para los participantes</label><textarea id="gxAdminProgramDescription" rows="4" maxlength="4000">'+esc(e?.description||'')+'</textarea></div><div id="gxAdminMediaContent" '+(mode!=='media'?'hidden':'')+'><label class="gx-admin-upload-control gx-admin-media-drop" for="gxAdminContentFile"><strong>Seleccionar video o archivo</strong><small>MP4/MOV/WebM, imágenes o PDF. Máximo 100 MB.</small><input id="gxAdminContentFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,application/pdf"></label><small id="gxAdminContentFileName">'+(e?.content_media_name?'Archivo actual: '+esc(e.content_media_name):'Si ya existe un archivo, se conservará mientras no selecciones otro.')+'</small>'+(e?.content_media_url?'<a class="gx-admin-existing-media" href="'+esc(e.content_media_url)+'" target="_blank" rel="noopener">Ver archivo actual ↗</a>':'')+'</div></section><section class="gx-admin-media-editor"><div><span class="gx-ref-eyebrow">CONDICIONES</span><h4>Requisitos y condiciones</h4><p>Especifica elegibilidad, fechas, permanencia y cálculo de la recompensa.</p></div><textarea id="gxAdminProgramRequirements" rows="4" maxlength="4000">'+esc(e?.requirements||'')+'</textarea></section><div class="gx-admin-form-actions"><button class="gx-ref-submit" type="submit">'+(e?'Guardar cambios':'Crear programa')+' →</button>'+(e?'<button type="button" class="gx-admin-secondary-btn" id="gxAdminCancelEdit">Cancelar</button>':'')+'</div></form>';
  }
  function adminReferralForm(programId){
    const p=earningPrograms.find(x=>x.id===programId);const defaultRate=p?.reward_type==='percentage'?Number(p.reward_value)||0:null;
    return '<form id="gxAdminReferralForm" class="gx-admin-form"><div class="gx-admin-form-grid"><div><label for="gxAdminReferrer">Persona que refiere</label><select id="gxAdminReferrer" required><option value="">Selecciona usuario de Grayxon</option>'+adminProfiles.map(p=>'<option value="'+p.id+'">'+esc(p.full_name||p.username||p.id)+' · '+esc(p.username||p.role)+'</option>').join('')+'</select></div><div><label for="gxAdminReferredUsername">Usuario de TikTok referido</label><input id="gxAdminReferredUsername" required maxlength="80" placeholder="@usuario"></div><div><label for="gxAdminReferredName">Nombre visible (opcional)</label><input id="gxAdminReferredName" maxlength="120" placeholder="Nombre del creador"></div></div><div class="gx-admin-rate-override"><label for="gxAdminReferralRate">Porcentaje individual (%) <span>Opcional</span></label><input id="gxAdminReferralRate" type="number" min="0" max="100" step="0.01" placeholder="'+(defaultRate===null?'Usar condiciones del programa':defaultRate+'% · general')+'"><small>Déjalo vacío para usar el porcentaje general. Si escribes uno, tendrá prioridad para esta persona.</small></div><input type="hidden" id="gxAdminReferralProgram" value="'+esc(programId)+'"><label for="gxAdminReferralNote">Nota administrativa (opcional)</label><input id="gxAdminReferralNote" maxlength="500" placeholder="Contexto o comprobación de la atribución"><button class="gx-ref-submit" type="submit">Registrar referido →</button></form>';
  }
  function adminCommissionForm(approvedRefs){
    return '<form id="gxAdminCommissionForm" class="gx-admin-form"><div class="gx-admin-form-grid"><div><label for="gxAdminCommissionReferral">Referido validado</label><select id="gxAdminCommissionReferral" required><option value="">Selecciona un referido aprobado</option>'+approvedRefs.map(r=>{const rp=earningPrograms.find(p=>p.id===r.program_id);const rate=r.commission_rate_override??(rp?.reward_type==='percentage'?rp.reward_value:'');return '<option value="'+r.id+'" data-rate="'+esc(rate)+'">@'+esc(r.referred_tiktok_username)+' · '+esc(adminProfiles.find(p=>p.id===r.referrer_user_id)?.username||'')+'</option>';}).join('')+'</select></div><div><label for="gxAdminCommissionMonth">Mes liquidado</label><input id="gxAdminCommissionMonth" type="month" required></div><div><label for="gxAdminCommissionNet">Ingreso neto para la agencia (USD)</label><input id="gxAdminCommissionNet" type="number" min="0" step="0.01" required placeholder="0"></div><div><label for="gxAdminCommissionRate">Porcentaje acordado (%)</label><input id="gxAdminCommissionRate" type="number" min="0" max="100" step="0.01" required placeholder="0"></div></div><div class="gx-admin-calculated"><span>Comisión calculada</span><strong id="gxAdminCommissionPreview">'+money(0)+'</strong></div><label for="gxAdminCommissionNotes">Notas</label><input id="gxAdminCommissionNotes" maxlength="250" placeholder="Observaciones de la liquidación"><button class="gx-ref-submit" type="submit">Guardar liquidación →</button></form>';
  }
  async function deleteSelectedAdminProgram(){
    const id=selectedAdminProgramId;if(!id||!isAdmin())return;
    if(!confirm('¿Eliminar este programa? Los referidos asociados quedarán sin programa, y las liquidaciones históricas se conservarán.'))return;
    const client=db();if(!client)return;
    const result=await client.from('gx_earning_programs').delete().eq('id',id);
    if(result.error){console.error(result.error);notify('No se pudo eliminar el programa.',true);return;}
    notify('Programa eliminado.');selectedAdminProgramId=null;adminTab='overview';await loadData();render();
  }
  function renderAdminPrograms(){
    if(!earningPrograms.length)return '<div class="gx-admin-empty"><strong>Aún no hay programas</strong><p>Crea el primero para organizar los incentivos.</p></div>';
    return '<div class="gx-admin-list">'+earningPrograms.map(p=>'<article class="gx-admin-list-row"><div class="gx-admin-list-main"><strong>'+esc(p.name)+'</strong><small>'+esc(({referrals:'Referidos',monthly_bonus:'Bonificación mensual',missions:'Misiones',events:'Eventos',other:'Otro'})[p.program_type]||p.program_type)+' · '+esc(({draft:'Borrador',active:'Activo',paused:'Pausado',archived:'Archivado'})[p.status]||p.status)+' · '+esc(({percentage:'Porcentaje',fixed_amount:'Monto fijo',points:'Puntos',custom:'Personalizado'})[p.reward_type]||p.reward_type)+'</small><p>'+esc(p.description||'Sin descripción')+'</p></div><div class="gx-admin-list-actions"><button type="button" data-program-edit="'+p.id+'">Editar</button><button type="button" data-program-status="'+(p.status==='active'?'paused':'active')+'" data-program-id="'+p.id+'">'+(p.status==='active'?'Pausar':'Activar')+'</button></div></article>').join('')+'</div>';
  }
  function renderAdminReferralRows(rows){
    if(!rows.length)return '<div class="gx-admin-empty"><strong>No hay referidos en esta lista</strong><p>Cuando registres invitaciones, aparecerán aquí.</p></div>';
    return '<div class="gx-admin-list">'+rows.map(r=>'<article class="gx-admin-list-row"><div class="gx-admin-list-main"><strong>@'+esc(r.referred_tiktok_username)+'</strong><small>'+esc(adminProfiles.find(p=>p.id===r.referrer_user_id)?.full_name||adminProfiles.find(p=>p.id===r.referrer_user_id)?.username||'Usuario no encontrado')+' · '+esc(dateFmt(r.created_at))+'</small><p>Estado: '+esc(({pending:'Por validar',approved:'Validado',rejected:'Rechazado'})[r.status]||r.status)+'</p></div><div class="gx-admin-list-actions">'+(r.status==='pending'?'<button type="button" data-ref-action="approve" data-ref-id="'+r.id+'">Validar</button><button type="button" data-ref-action="reject" data-ref-id="'+r.id+'">Rechazar</button>':'<button type="button" data-ref-action="pending" data-ref-id="'+r.id+'">Volver a pendiente</button>')+'<button type="button" data-ref-action="delete" data-ref-id="'+r.id+'">Eliminar</button></div></article>').join('')+'</div>';
  }
  function renderAdminCommissionRows(rows=commissions){
    if(!rows.length)return '<div class="gx-admin-empty"><strong>No hay liquidaciones registradas</strong><p>Registra la primera liquidación para que quede en el historial.</p></div>';
    const refMap=new Map(referrals.map(r=>[r.id,r]));
    return '<div class="gx-admin-list">'+rows.map(c=>{const r=refMap.get(c.referral_id);return '<article class="gx-admin-list-row"><div class="gx-admin-list-main"><strong>@'+esc(r?.referred_tiktok_username||'Referido')+' · '+money(c.commission_amount)+'</strong><small>'+esc(c.period_month)+' · '+esc(Number(c.commission_rate).toLocaleString('es-CO'))+'% sobre '+money(c.agency_net_amount)+'</small><p>Estado: '+esc(({pending:'Pendiente de aprobación',approved:'Aprobada, por pagar',paid:'Pagada'})[c.status]||c.status)+'</p></div><div class="gx-admin-list-actions">'+(c.status==='pending'?'<button type="button" data-commission-action="approve" data-commission-id="'+c.id+'">Aprobar</button>':c.status==='approved'?'<button type="button" data-commission-action="paid" data-commission-id="'+c.id+'">Marcar pagada</button>':'')+'<button type="button" data-commission-action="delete" data-commission-id="'+c.id+'">Eliminar</button></div></article>';}).join('')+'</div>';
  }
  function bindAdminReferralActions(){
    $('gxReferralsPage')?.querySelectorAll('[data-ref-action]').forEach(btn=>{if(btn.dataset.bound)return;btn.dataset.bound='1';btn.addEventListener('click',()=>handleAdminAction(btn.dataset.refAction,btn.dataset.refId));});
    $('gxReferralsPage')?.querySelectorAll('[data-commission-action]').forEach(btn=>{if(btn.dataset.bound)return;btn.dataset.bound='1';btn.addEventListener('click',()=>btn.dataset.commissionAction==='delete'?deleteCommission(btn.dataset.commissionId):updateCommissionStatus(btn.dataset.commissionId,btn.dataset.commissionAction));});
  }
  async function uploadProgramMedia(file,kind){
    if(!file)return null;
    const client=db();if(!client)throw new Error('No hay conexión con el almacenamiento.');
    const max=kind==='cover'?10*1024*1024:100*1024*1024;
    if(file.size>max)throw new Error(kind==='cover'?'La portada supera el límite de 10 MB.':'El archivo supera el límite de 100 MB.');
    const safeName=file.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'_');
    const path=(kind==='cover'?'covers':'content')+'/'+Date.now()+'-'+Math.random().toString(36).slice(2,9)+'-'+safeName;
    const result=await client.storage.from('gx-earning-program-media').upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});
    if(result.error)throw result.error;
    return {url:client.storage.from('gx-earning-program-media').getPublicUrl(result.data.path).data.publicUrl,name:file.name,type:file.type||'application/octet-stream'};
  }
  async function saveAdminProgram(event){
    event.preventDefault();const client=db();if(!client||!isAdmin())return;
    const name=$('gxAdminProgramName')?.value.trim();if(!name)return;
    const id=$('gxAdminProgramId')?.value,existing=earningPrograms.find(p=>p.id===id),mode=$('gxAdminContentMode')?.value||'text';
    const payload={name,description:mode==='text'?($('gxAdminProgramDescription')?.value.trim()||''):'',program_type:$('gxAdminProgramType')?.value||'other',reward_type:$('gxAdminRewardType')?.value||'custom',reward_value:Number($('gxAdminRewardValue')?.value)||0,status:$('gxAdminProgramStatus')?.value||'draft',starts_on:$('gxAdminProgramStart')?.value||null,ends_on:$('gxAdminProgramEnd')?.value||null,requirements:$('gxAdminProgramRequirements')?.value.trim()||'',hero_image_url:existing?.hero_image_url||null,content_media_url:mode==='media'?(existing?.content_media_url||null):null,content_media_type:mode==='media'?(existing?.content_media_type||null):null,content_media_name:mode==='media'?(existing?.content_media_name||null):null,created_by:userId(),updated_at:new Date().toISOString()};
    try{
      const cover=$('gxAdminHeroFile')?.files?.[0],content=mode==='media'?$('gxAdminContentFile')?.files?.[0]:null;
      if(mode==='media'&&!content&&!existing?.content_media_url)throw new Error('Selecciona el archivo o video que quieres adjuntar.');
      if(cover){if(!/^image\/(jpeg|png|webp|gif)$/.test(cover.type))throw new Error('La portada debe ser JPG, PNG, WEBP o GIF.');payload.hero_image_url=(await uploadProgramMedia(cover,'cover')).url;}
      if(content){if(!/^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime)|application\/pdf)$/.test(content.type))throw new Error('Formato no admitido. Usa una imagen, video MP4/MOV/WebM o PDF.');const media=await uploadProgramMedia(content,'content');payload.content_media_url=media.url;payload.content_media_type=media.type;payload.content_media_name=media.name;}
      if(mode==='text'){payload.content_media_url=null;payload.content_media_type=null;payload.content_media_name=null;}
      const result=id?await client.from('gx_earning_programs').update(payload).eq('id',id):await client.from('gx_earning_programs').insert(payload);
      if(result.error)throw result.error;
      notify(id?'Programa actualizado.':'Programa creado.');editingProgramId=null;await loadData();if(!id){adminTab='overview';selectedAdminProgramId=null;}else if(selectedAdminProgramId){adminTab='program-detail';adminProgramSection='settings';}render();
    }catch(error){console.error('Gana más: no se pudo guardar programa',error);notify(error.message||'No se pudo guardar el programa.',true);}
  }
  async function saveAdminReferral(event){
    event.preventDefault();const client=db();if(!client||!isAdmin())return;
    const username=String($('gxAdminReferredUsername')?.value||'').trim().replace(/^@/,'');const referrer=$('gxAdminReferrer')?.value;
    if(!username||!referrer)return;
    const rateRaw=$('gxAdminReferralRate')?.value;const override=rateRaw===''||rateRaw===undefined?null:Number(rateRaw);if(override!==null&&(!Number.isFinite(override)||override<0||override>100)){notify('El porcentaje individual debe estar entre 0 y 100.',true);return;}const payload={referrer_user_id:referrer,referred_tiktok_username:username,referred_display_name:$('gxAdminReferredName')?.value.trim()||null,program_id:$('gxAdminReferralProgram')?.value||selectedAdminProgramId||null,commission_rate_override:override,status:'pending',admin_note:$('gxAdminReferralNote')?.value.trim()||null};
    const result=await client.from('gx_referrals').insert(payload);
    if(result.error){console.error(result.error);notify(result.error.code==='23505'?'Ese usuario de TikTok ya está registrado.':'No se pudo registrar el referido.',true);return;}
    notify('Referido registrado y pendiente de validación.');await loadData();if(selectedAdminProgramId){adminTab='program-detail';adminProgramSection='referrals';}render();
  }
  async function saveAdminCommission(event){
    event.preventDefault();const client=db();if(!client||!isAdmin())return;
    const referralId=$('gxAdminCommissionReferral')?.value,month=$('gxAdminCommissionMonth')?.value,net=Number($('gxAdminCommissionNet')?.value),rate=Number($('gxAdminCommissionRate')?.value);
    if(!referralId||!month||net<0||rate<0||rate>100)return;
    const result=await client.from('gx_referral_commissions').insert({referral_id:referralId,period_month:month+'-01',agency_net_amount:net,commission_rate:rate,commission_amount:Math.round(net*rate)/100,status:'pending',notes:$('gxAdminCommissionNotes')?.value.trim()||null});
    if(result.error){console.error(result.error);notify('No se pudo registrar la liquidación.',true);return;}
    notify('Liquidación registrada.');await loadData();if(selectedAdminProgramId){adminTab='program-detail';adminProgramSection='commissions';}render();
  }
  async function changeProgramStatus(id,status){
    if(!isAdmin())return;const client=db();if(!client)return;
    const result=await client.from('gx_earning_programs').update({status,updated_at:new Date().toISOString()}).eq('id',id);
    if(result.error){notify('No se pudo actualizar el estado del programa.',true);return;}
    await loadData();render();
  }

  function referralCard(r){
    const [label,klass]=statusInfo(r.status);
    return '<article class="gx-referral-row"><div class="gx-referral-avatar" aria-hidden="true">↗</div><div class="gx-referral-row-main"><strong>@'+esc(r.referred_tiktok_username)+'</strong><span>'+esc(r.referred_display_name||'Referido registrado')+' · '+esc(dateFmt(r.created_at))+'</span></div><span class="gx-ref-status '+klass+'">'+label+'</span>'+(isAdmin()?'<div class="gx-ref-admin-actions">'+(r.status==='pending'?'<button type="button" data-ref-action="approve" data-ref-id="'+r.id+'">Validar</button><button type="button" data-ref-action="reject" data-ref-id="'+r.id+'">Rechazar</button>':'')+'<button type="button" data-ref-action="commission" data-ref-id="'+r.id+'">Liquidar mes</button></div>':'')+'</article>';
  }
  function commissionCard(c, refMap){
    const r=refMap.get(c.referral_id);
    const [label,klass]=statusInfo(c.status);
    return '<article class="gx-commission-row"><div><strong>@'+esc(r?.referred_tiktok_username||'Creador referido')+'</strong><span>Periodo '+esc(new Intl.DateTimeFormat('es-CO',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(c.period_month+'T12:00:00Z')))+' · '+esc(Number(c.commission_rate).toLocaleString('es-CO'))+'%</span></div><div class="gx-commission-value"><strong>'+money(c.commission_amount)+'</strong><span class="gx-ref-status '+klass+'">'+label+'</span>'+(isAdmin()&&c.status!=='paid'?'<button type="button" class="gx-ref-commission-status" data-commission-action="'+(c.status==='pending'?'approve':'paid')+'" data-commission-id="'+c.id+'">'+(c.status==='pending'?'Aprobar comisión':'Marcar pagada')+'</button>':'')+'</div></article>';
  }
  async function loadData(){
    const client=db(),uid=userId();if(!client||!uid){referrals=[];commissions=[];return;}
    const page=$('gxReferralsPage');if(page)page.innerHTML='<div class="gx-ref-loading"><span class="gx-ref-spinner"></span><p>Cargando tu programa de referidos…</p></div>';
    try{
      let query=client.from('gx_referrals').select('id,referrer_user_id,referred_tiktok_username,referred_display_name,referred_user_id,status,created_at,reviewed_at,admin_note,program_id,commission_rate_override');
      if(!isAdmin())query=query.eq('referrer_user_id',uid);
      const result=await query.order('created_at',{ascending:false});
      if(result.error)throw result.error;
      referrals=result.data||[];
      let cq=client.from('gx_referral_commissions').select('id,referral_id,period_month,agency_net_amount,commission_rate,commission_amount,status,paid_at,notes');
      if(!isAdmin()){
        const ids=referrals.map(r=>r.id);
        if(!ids.length)commissions=[];
        else {
          cq=cq.in('referral_id',ids);
          const cr=await cq.order('period_month',{ascending:false});
          if(cr.error)throw cr.error;
          commissions=cr.data||[];
        }
      } else {
        const cr=await cq.order('period_month',{ascending:false});
        if(cr.error)throw cr.error;
        commissions=cr.data||[];
      }
      const settingsResult=await client.from('gx_referral_settings').select('hero_background_url').eq('id',1).maybeSingle();
      if(!settingsResult.error)heroBackgroundUrl=settingsResult.data?.hero_background_url||null;
      const programQuery=client.from('gx_earning_programs').select('*').order('created_at',{ascending:false});
      const programResult=isAdmin()?await programQuery:await programQuery.eq('status','active');
      if(programResult.error)throw programResult.error;
      earningPrograms=programResult.data||[];
      if(isAdmin()){
        const profileResult=await client.from('profiles').select('id,username,full_name,role,active,tiktok_username').eq('active',true).order('username',{ascending:true});
        if(!profileResult.error)adminProfiles=profileResult.data||[];
      }
      loaded=true;
    }catch(error){
      console.error('Gana más: no se pudieron cargar los datos',error);
      notify('No pudimos cargar los referidos. Revisa la conexión e inténtalo de nuevo.',true);
    }
  }
  function render(){
    document.body.classList.remove('gx-program-fullscreen');
    const page=ensurePage();if(!page)return;
    if(isAdmin()){renderAdminDashboard(page);return;}
    const typeLabels={referrals:'PROGRAMA ACTIVO',monthly_bonus:'BONIFICACIÓN ACTIVA',missions:'MISIÓN ACTIVA',events:'EVENTO ACTIVO',other:'PROGRAMA ACTIVO'};
    const rewardLabel=p=>p.reward_type==='percentage'?Number(p.reward_value||0)+'%':p.reward_type==='fixed_amount'?money(p.reward_value):p.reward_type==='points'?Number(p.reward_value||0)+' PUNTOS':'SEGÚN CONDICIONES';
    page.innerHTML='<div class="gx-referrals-shell gx-programs-home"><section class="gx-programs-heading"><span class="gx-ref-eyebrow">GRAYXON GROUP</span><h1>Gana más<span>.</span></h1><p>Explora los programas disponibles y participa para obtener beneficios exclusivos.</p></section>'+
      (earningPrograms.length?'<section class="gx-ref-program-catalog"><div class="gx-ref-program-grid gx-program-banner-list">'+earningPrograms.map(p=>'<article class="gx-ref-program-card gx-ref-program-tile gx-program-banner-card">'+(p.hero_image_url?'<img class="gx-ref-program-card-cover" src="'+esc(p.hero_image_url)+'" alt="" loading="lazy">':'<div class="gx-ref-program-card-placeholder"><span>✦</span><small>GRAYXON GROUP</small></div>')+'<div class="gx-program-banner-shade"></div><div class="gx-program-banner-content"><span class="gx-program-live-tag">'+esc(typeLabels[p.program_type]||'PROGRAMA ACTIVO')+'</span><div class="gx-program-banner-main"><div class="gx-program-banner-copy"><h2>'+esc(p.name)+'</h2><p>'+esc(p.description||'Consulta la descripción y las condiciones de este programa.')+'</p></div><div class="gx-program-banner-reward"><small>RECOMPENSA</small><strong>'+esc(rewardLabel(p))+'</strong></div></div><div class="gx-program-banner-footer"><span>'+esc(p.ends_on?'Hasta '+dateFmt(p.ends_on):'Participación disponible')+'</span><button type="button" class="gx-ref-program-cta-btn" data-program-detail="'+p.id+'">Ver programa <span>↗</span></button></div></div></article>').join('')+'</div></section>':'<section class="gx-ref-empty gx-programs-empty"><span>✦</span><strong>Pronto habrá programas para ti</strong><p>Cuando Grayxon publique un programa activo, aparecerá aquí.</p></section>')+
      '<div class="gx-ref-modal hidden" id="gxRefModal" role="dialog" aria-modal="true" aria-labelledby="gxRefModalTitle"><div class="gx-ref-modal-backdrop" data-gx-modal-close></div><section class="gx-ref-modal-card"><button type="button" class="gx-ref-modal-close" id="gxRefModalClose" aria-label="Cerrar ventana">×</button><span class="gx-ref-eyebrow">GRAYXON GROUP · PROGRAMAS</span><h2 id="gxRefModalTitle">Detalles del programa</h2><div id="gxRefModalBody"></div></section></div></div>';
    $('gxRefModalClose')?.addEventListener('click',closeDetailModal);
    $('gxRefModal')?.querySelector('[data-gx-modal-close]')?.addEventListener('click',closeDetailModal);
    page.querySelectorAll('[data-program-detail]').forEach(btn=>btn.addEventListener('click',()=>showParticipantProgram(btn.dataset.programDetail)));
  }

  function openDetailModal(title, html){
    const modal=$('gxRefModal');if(!modal)return;
    $('gxRefModalTitle').textContent=title;$('gxRefModalBody').innerHTML=html;
    modal.classList.remove('hidden');document.body.classList.add('gx-ref-modal-open');
    $('gxRefModalClose')?.focus();
  }
  function closeDetailModal(){const modal=$('gxRefModal');if(modal)modal.classList.add('hidden');document.body.classList.remove('gx-ref-modal-open');}

  function showParticipantProgram(id){
    const p=earningPrograms.find(x=>x.id===id);if(!p)return;const page=ensurePage();if(!page)return;
    document.body.classList.add('gx-program-fullscreen');
    const type=({referrals:'Referidos',monthly_bonus:'Bonificación mensual',missions:'Misiones',events:'Eventos',other:'Programa especial'})[p.program_type]||'Programa';
    const reward=({percentage:'Porcentaje',fixed_amount:'Monto fijo',points:'Puntos',custom:'Según condiciones'})[p.reward_type]||'Recompensa';
    const refs=referrals.filter(r=>r.program_id===p.id||(p.program_type==='referrals'&&!r.program_id));
    const related=commissions.filter(c=>refs.some(r=>r.id===c.referral_id));
    const paid=related.filter(c=>c.status==='paid').reduce((sum,c)=>sum+Number(c.commission_amount||0),0);
    const earned=related.reduce((sum,c)=>sum+Number(c.commission_amount||0),0);
    const media=p.content_media_url?(p.content_media_type?.startsWith('video/')?'<video class="gx-ref-program-media" controls playsinline preload="metadata" src="'+esc(p.content_media_url)+'"></video>':p.content_media_type?.startsWith('image/')?'<img class="gx-ref-program-media" src="'+esc(p.content_media_url)+'" alt="'+esc(p.content_media_name||p.name)+'">':'<a class="gx-ref-program-file" href="'+esc(p.content_media_url)+'" target="_blank" rel="noopener">📄 Abrir archivo · '+esc(p.content_media_name||'Ver archivo')+' ↗</a>'):'';
    const hero='<section class="gx-program-detail-hero gx-program-event-style">'+(p.hero_image_url?'<img class="gx-program-detail-banner" src="'+esc(p.hero_image_url)+'" alt="'+esc(p.name)+'">':'<div class="gx-program-detail-banner gx-program-no-banner"><span>✦ GRAYXON GROUP</span></div>')+'<div class="gx-program-detail-overlay"><div class="gx-program-detail-topline"><span class="gx-program-live-tag">'+esc(type.toUpperCase())+'</span><span class="gx-program-detail-validity">'+esc(p.ends_on?'Hasta '+dateFmt(p.ends_on):'Programa disponible')+'</span></div><div class="gx-program-detail-main"><div class="gx-program-detail-titleblock"><h1>'+esc(p.name)+'</h1><p class="gx-program-hero-description">'+esc(p.description||'Consulta la información de este programa.')+'</p></div><div class="gx-program-detail-reward"><small>RECOMPENSA</small><strong>'+esc(reward)+(p.reward_type==='percentage'?' · '+esc(p.reward_value)+'%':p.reward_type==='fixed_amount'?' · '+money(p.reward_value):p.reward_type==='points'?' · '+esc(p.reward_value)+' puntos':'')+'</strong></div></div><div class="gx-program-hero-actions"><button type="button" class="gx-ref-program-cta-btn" id="gxProgramSummaryBtn">Ver resumen</button><button type="button" class="gx-admin-secondary-btn" id="gxProgramRequirementsBtn">Ver requisitos</button></div></div></section>';
    const activity=p.program_type==='referrals'?'<section class="gx-program-activity-section"><div class="gx-program-section-heading"><span class="gx-ref-eyebrow">TU ACTIVIDAD</span><h2>Tu actividad</h2></div><div class="gx-program-activity-grid gx-program-activity-grid-two"><button type="button" data-open-program-referrals><span class="gx-program-activity-icon">↗</span><span class="gx-program-activity-card-copy"><small>Referidos</small><strong>'+refs.length+'</strong><em>'+refs.filter(r=>r.status==='approved').length+' validados · '+refs.filter(r=>r.status==='pending').length+' por validar</em></span><span class="gx-program-card-chevron">›</span></button><button type="button" data-open-program-earnings><span class="gx-program-activity-icon">$</span><span class="gx-program-activity-card-copy"><small>Tus ganancias</small><strong>'+money(earned)+'</strong><em>'+money(paid)+' pagados</em></span><span class="gx-program-card-chevron">›</span></button></div><section class="gx-program-personal-code"><div><span class="gx-ref-eyebrow">TU CÓDIGO PERSONAL</span><p>Compártelo con alguien que todavía no pertenezca a Grayxon.</p><strong>'+esc(codeFor(currentProfile()?.username))+'</strong></div><div class="gx-program-code-actions"><button type="button" id="gxCopyCode">Copiar código</button><button type="button" id="gxShareWhatsApp">WhatsApp ↗</button></div></section></section>':'';
    page.innerHTML='<div class="gx-referrals-shell gx-program-detail-page">'+hero+media+activity+'<div class="gx-ref-modal hidden" id="gxRefModal" role="dialog" aria-modal="true" aria-labelledby="gxRefModalTitle"><div class="gx-ref-modal-backdrop" data-gx-modal-close></div><section class="gx-ref-modal-card"><button type="button" class="gx-ref-modal-close" id="gxRefModalClose" aria-label="Cerrar ventana">×</button><span class="gx-ref-eyebrow">GRAYXON GROUP · PROGRAMAS</span><h2 id="gxRefModalTitle">Resumen del programa</h2><div id="gxRefModalBody"></div></section></div></div>';
    $('gxProgramSummaryBtn')?.addEventListener('click',()=>openDetailModal('Resumen del programa','<div class="gx-program-description-popup"><div class="gx-program-description-text">'+esc(p.description||'Este programa no tiene un resumen adicional.')+'</div>'+(media||'')+'</div>'));
    $('gxProgramRequirementsBtn')?.addEventListener('click',()=>openDetailModal('Requisitos y condiciones','<section class="gx-program-description-popup"><div class="gx-ref-program-requirements">'+esc(p.requirements||'Consulta con el equipo de Grayxon las condiciones específicas de este programa.')+'</div></section>'));
    $('gxRefModalClose')?.addEventListener('click',closeDetailModal);$('gxRefModal')?.querySelector('[data-gx-modal-close]')?.addEventListener('click',closeDetailModal);
    page.querySelector('[data-open-program-referrals]')?.addEventListener('click',()=>showProgramActivity(p.id));
    page.querySelector('[data-open-program-earnings]')?.addEventListener('click',()=>showProgramEarnings(p.id));
    $('gxCopyCode')?.addEventListener('click',async()=>{const code=codeFor(currentProfile()?.username);try{await navigator.clipboard.writeText(code);}catch(_){const input=document.createElement('textarea');input.value=code;document.body.appendChild(input);input.select();document.execCommand('copy');input.remove();}notify('Código copiado.');});
    $('gxShareWhatsApp')?.addEventListener('click',()=>{const code=codeFor(currentProfile()?.username);window.open('https://wa.me/?text='+encodeURIComponent('¡Te invito a Grayxon Group para crecer en TikTok LIVE! Mi código de referido es '+code+'. Compártelo con el equipo al registrarte.'),'_blank','noopener,noreferrer');});
  }
  function showProgramActivity(programId,statusFilter='all'){
    document.body.classList.remove('gx-program-fullscreen');
    const p=earningPrograms.find(x=>x.id===programId);if(!p)return;const page=ensurePage();if(!page)return;
    const allRefs=referrals.filter(r=>r.program_id===p.id||(p.program_type==='referrals'&&!r.program_id));
    const counts={all:allRefs.length,pending:0,approved:0,rejected:0};allRefs.forEach(r=>{if(counts[r.status]!==undefined)counts[r.status]++;});
    const refs=allRefs.filter(r=>statusFilter==='all'||r.status===statusFilter);
    const chips=[['all','Todos'],['pending','Pendientes'],['approved','Validados'],['rejected','Rechazados']].map(([key,label])=>'<button type="button" class="gx-program-filter-chip '+(statusFilter===key?'active':'')+'" data-ref-filter="'+key+'">'+label+' <span>'+counts[key]+'</span></button>').join('');
    const rows=refs.length?'<div class="gx-ref-detail-list gx-program-referrals-list">'+refs.map(r=>{const [label,klass]=statusInfo(r.status);return '<button type="button" class="gx-program-referral-row" data-referral-history="'+esc(r.id)+'"><span class="gx-program-referral-row-main"><strong>@'+esc(r.referred_tiktok_username)+'</strong><small>Registrado · '+esc(dateFmt(r.created_at))+'</small></span><span class="gx-ref-status '+klass+'">'+label+'</span><span class="gx-program-row-open">Ver ganancias ›</span></button>';}).join('')+'</div>':'<div class="gx-ref-empty"><span>↗</span><strong>'+(statusFilter==='all'?'Todavía no tienes referidos':'No hay referidos en este estado')+'</strong><p>Los referidos aparecerán aquí con su fecha, estado e historial de ganancias.</p></div>';
    page.innerHTML='<div class="gx-referrals-shell gx-program-activity-page"><section class="gx-ref-panel gx-program-referrals-panel"><button type="button" class="gx-program-panel-close" id="gxCloseReferralsList" aria-label="Cerrar y volver al programa">×</button><span class="gx-ref-eyebrow">TU ACTIVIDAD · '+esc(p.name.toUpperCase())+'</span><h1>Referidos</h1><div class="gx-program-filter-row">'+chips+'</div>'+rows+'</section></div>';
    $('gxCloseReferralsList')?.addEventListener('click',()=>showParticipantProgram(programId));
    page.querySelectorAll('[data-ref-filter]').forEach(btn=>btn.addEventListener('click',()=>showProgramActivity(programId,btn.dataset.refFilter)));
    page.querySelectorAll('[data-referral-history]').forEach(btn=>btn.addEventListener('click',()=>showReferralEarnings(programId,btn.dataset.referralHistory)));
  }
  function showProgramEarnings(programId){
    document.body.classList.remove('gx-program-fullscreen');
    const p=earningPrograms.find(x=>x.id===programId);if(!p)return;const page=ensurePage();if(!page)return;
    const refs=referrals.filter(r=>r.program_id===p.id||(p.program_type==='referrals'&&!r.program_id)),ids=refs.map(r=>r.id);
    const items=commissions.filter(c=>ids.includes(c.referral_id)).sort((a,b)=>String(b.period_month).localeCompare(String(a.period_month)));
    const total=items.reduce((sum,c)=>sum+Number(c.commission_amount||0),0),paid=items.filter(c=>c.status==='paid').reduce((sum,c)=>sum+Number(c.commission_amount||0),0);
    const rows=items.length?'<div class="gx-ref-detail-list">'+items.map(c=>{const r=refs.find(x=>x.id===c.referral_id);return '<button type="button" class="gx-program-earnings-row" data-earnings-ref="'+esc(c.referral_id)+'"><span><strong>@'+esc(r?.referred_tiktok_username||'Referido')+'</strong><small>'+esc(new Intl.DateTimeFormat('es-CO',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(c.period_month+'T12:00:00Z')))+'</small></span><span class="gx-program-earning-value"><strong>'+money(c.commission_amount)+'</strong><em>'+esc(({pending:'Pendiente',approved:'Aprobada',paid:'Pagada'})[c.status]||c.status)+'</em></span></button>';}).join('')+'</div>':'<div class="gx-ref-empty"><span>$</span><strong>Aún no hay ganancias registradas</strong><p>Cuando se registren liquidaciones, aparecerán aquí las comisiones mensuales por referido.</p></div>';
    page.innerHTML='<div class="gx-referrals-shell gx-program-activity-page"><section class="gx-ref-panel gx-program-referrals-panel"><button type="button" class="gx-program-panel-close" id="gxCloseProgramEarnings" aria-label="Cerrar ganancias">×</button><span class="gx-ref-eyebrow">TU ACTIVIDAD · '+esc(p.name.toUpperCase())+'</span><h1>Tus ganancias</h1><div class="gx-program-earnings-summary"><div><small>Comisiones registradas</small><strong>'+money(total)+'</strong></div><div><small>Comisiones pagadas</small><strong>'+money(paid)+'</strong></div></div>'+rows+'</section></div>';
    $('gxCloseProgramEarnings')?.addEventListener('click',()=>showParticipantProgram(programId));
    page.querySelectorAll('[data-earnings-ref]').forEach(btn=>btn.addEventListener('click',()=>showReferralEarnings(programId,btn.dataset.earningsRef)));
  }
  function showReferralEarnings(programId,referralId){
    document.body.classList.remove('gx-program-fullscreen');
    const p=earningPrograms.find(x=>x.id===programId),r=referrals.find(x=>x.id===referralId);if(!p||!r)return;const page=ensurePage();if(!page)return;
    const items=commissions.filter(c=>c.referral_id===r.id).sort((a,b)=>String(b.period_month).localeCompare(String(a.period_month)));
    const total=items.reduce((sum,c)=>sum+Number(c.commission_amount||0),0),paid=items.filter(c=>c.status==='paid').reduce((sum,c)=>sum+Number(c.commission_amount||0),0);
    const history=items.length?'<div class="gx-ref-detail-list">'+items.map(c=>'<article><div><strong>'+esc(new Intl.DateTimeFormat('es-CO',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(c.period_month+'T12:00:00Z')))+'</strong><small>Ingreso neto agencia: '+money(c.agency_net_amount)+' · Porcentaje: '+esc(c.commission_rate)+'%</small></div><div class="gx-program-earning-value"><strong>'+money(c.commission_amount)+'</strong><span class="gx-ref-status '+(c.status==='paid'?'approved':c.status==='approved'?'approved':'pending')+'">'+esc(({pending:'Pendiente',approved:'Aprobada',paid:'Pagada'})[c.status]||c.status)+'</span></div></article>').join('')+'</div>':'<div class="gx-ref-empty"><span>$</span><strong>Aún no hay ganancias registradas</strong><p>Cuando Grayxon registre liquidaciones, podrás consultar aquí el historial mensual.</p></div>';
    page.innerHTML='<div class="gx-referrals-shell gx-program-activity-page"><section class="gx-ref-panel gx-program-referrals-panel"><button type="button" class="gx-program-panel-close" id="gxCloseReferralHistory" aria-label="Cerrar historial">×</button><span class="gx-ref-eyebrow">HISTORIAL DE GANANCIAS</span><h1>@'+esc(r.referred_tiktok_username)+'</h1><p class="gx-program-list-intro">Registrado el '+esc(dateFmt(r.created_at))+' · Estado: '+esc(statusInfo(r.status)[0])+'</p><div class="gx-program-earnings-summary"><div><small>Comisiones registradas</small><strong>'+money(total)+'</strong></div><div><small>Comisiones pagadas</small><strong>'+money(paid)+'</strong></div></div>'+history+'</section></div>';
    $('gxCloseReferralHistory')?.addEventListener('click',()=>showProgramActivity(programId));
  }

  function showParticipantDescription(p){
    const media=p.content_media_url?(p.content_media_type?.startsWith('video/')?'<video class="gx-ref-program-media" controls playsinline preload="metadata" src="'+esc(p.content_media_url)+'"></video>':p.content_media_type?.startsWith('image/')?'<img class="gx-ref-program-media" src="'+esc(p.content_media_url)+'" alt="'+esc(p.content_media_name||p.name)+'">':'<a class="gx-ref-program-file" href="'+esc(p.content_media_url)+'" target="_blank" rel="noopener">📄 Abrir archivo · '+esc(p.content_media_name||'Ver archivo')+' ↗</a>'):'';
    openDetailModal('Descripción del programa','<section class="gx-program-description-popup"><span class="gx-ref-eyebrow">DESCRIPCIÓN</span><div class="gx-program-description-text">'+esc(p.description||'Este programa no tiene una descripción adicional.')+'</div>'+media+'<span class="gx-ref-eyebrow gx-program-requirements-eyebrow">REQUISITOS Y CONDICIONES</span><div class="gx-ref-program-requirements">'+esc(p.requirements||'Consulta con el equipo de Grayxon las condiciones específicas de este programa.')+'</div></section>');
  }

  function showRequirements(){
    openDetailModal('Requisitos del programa',
      '<div class="gx-ref-detail-intro">Para que una invitación pueda generar comisiones, debe cumplir estas condiciones:</div>'+
      '<ul class="gx-ref-requirements-list"><li><span>01</span><div><strong>Invitación real</strong><p>El referido debe haber llegado a Grayxon por recomendación tuya y no pertenecer previamente a la agencia.</p></div></li><li><span>02</span><div><strong>Registro y validación</strong><p>Registra su usuario de TikTok y espera la validación del equipo. Un registro no significa aprobación automática.</p></div></li><li><span>03</span><div><strong>Permanencia en Grayxon</strong><p>El creador debe permanecer vinculado a la agencia para que pueda liquidarse la comisión correspondiente.</p></div></li><li><span>04</span><div><strong>Liquidación mensual</strong><p>La comisión se calcula sobre el ingreso neto que el creador genere para Grayxon, aplicando el porcentaje aprobado para el referido.</p></div></li><li><span>05</span><div><strong>Validación de pagos</strong><p>Las liquidaciones se revisan al cierre del mes y aparecen en tu historial cuando el equipo las registra. No se garantizan montos fijos.</p></div></li></ul>'+
      '<p class="gx-ref-detail-note">El porcentaje aplicable y cualquier condición adicional son los que Grayxon haya aprobado para el programa; esta pantalla no presupone una tarifa fija.</p>');
  }
  function showDetail(type){
    const titles={registered:'Todos mis referidos',approved:'Referidos validados',pending:'Referidos por validar',paid:'Historial de comisiones pagadas'};
    let html='';
    if(type==='paid'){
      const rows=commissions.filter(c=>c.status==='paid' && referrals.some(r=>r.id===c.referral_id));
      html=rows.length?'<div class="gx-ref-detail-list">'+rows.map(c=>{const r=referrals.find(x=>x.id===c.referral_id);return '<article><div><strong>@'+esc(r?.referred_tiktok_username||'Creador referido')+'</strong><small>'+esc(new Intl.DateTimeFormat('es-CO',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(c.period_month+'T12:00:00Z')))+'</small></div><strong class="gx-ref-detail-amount">'+money(c.commission_amount)+'</strong></article>';}).join('')+'</div>':'<div class="gx-ref-empty"><span>＄</span><strong>Aún no tienes pagos registrados</strong><p>Las comisiones pagadas aparecerán aquí con su periodo y valor.</p></div>';
    }else{
      const rows=referrals.filter(r=>type==='registered'||(type==='approved'?r.status==='approved':r.status==='pending'));
      html=rows.length?'<div class="gx-ref-detail-list">'+rows.map(r=>{const [label,klass]=statusInfo(r.status);return '<article><div><strong>@'+esc(r.referred_tiktok_username)+'</strong><small>'+esc(r.referred_display_name||'Referido registrado')+' · '+esc(dateFmt(r.created_at))+'</small></div><span class="gx-ref-status '+klass+'">'+label+'</span></article>';}).join('')+'</div>':'<div class="gx-ref-empty"><span>↗</span><strong>'+(type==='pending'?'No tienes referidos pendientes':'Todavía no hay registros')+'</strong><p>Cuando tengas actividad en esta categoría, podrás consultarla aquí.</p></div>';
    }
    openDetailModal(titles[type]||'Detalle del programa',html);
  }
  async function uploadHeroImage(event){
    if(!isAdmin())return;
    const file=event.currentTarget.files?.[0];if(!file)return;
    const status=$('gxRefHeroImageStatus'),client=db();
    if(!client){if(status)status.textContent='No hay conexión disponible.';return;}
    if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>10*1024*1024){if(status)status.textContent='Elige una imagen JPG, PNG o WEBP de máximo 10 MB.';event.currentTarget.value='';return;}
    if(status)status.textContent='Subiendo imagen…';
    try{
      const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
      const path='hero/grayxon-referrals-'+Date.now()+'.'+ext;
      const uploaded=await client.storage.from('gx-referral-assets').upload(path,file,{upsert:true,contentType:file.type,cacheControl:'3600'});
      if(uploaded.error)throw uploaded.error;
      const publicUrl=client.storage.from('gx-referral-assets').getPublicUrl(path).data.publicUrl;
      const saved=await client.from('gx_referral_settings').upsert({id:1,hero_background_url:publicUrl,updated_by:userId(),updated_at:new Date().toISOString()},{onConflict:'id'});
      if(saved.error)throw saved.error;
      heroBackgroundUrl=publicUrl;notify('Imagen de fondo actualizada.');render();
    }catch(error){console.error('Gana más: error al subir imagen de fondo',error);if(status)status.textContent='No se pudo guardar la imagen. Revisa los permisos e inténtalo de nuevo.';notify('No se pudo actualizar la imagen de fondo.',true);}
  }

  async function submitReferral(event){
    event.preventDefault();const form=event.currentTarget,client=db(),uid=userId(),message=$('gxRefFormMessage'),button=form.querySelector('button[type="submit"]');
    if(!client||!uid){if(message)message.textContent='Tu sesión no está disponible. Inicia sesión de nuevo.';return;}
    const username=String($('gxRefUsername')?.value||'').trim().replace(/^@/,'').toLowerCase();
    const displayName=String($('gxRefDisplayName')?.value||'').trim();
    if(username.length<2){if(message)message.textContent='Escribe un usuario de TikTok válido.';return;}
    if(username===String(currentProfile()?.tiktok_username||currentProfile()?.username||'').replace(/^@/,'').toLowerCase()){if(message)message.textContent='No puedes registrarte a ti mismo como referido.';return;}
    button.disabled=true;button.querySelector('span').textContent='Registrando…';if(message)message.textContent='';
    try{
      const programId=form.dataset.programId||null;const result=await client.from('gx_referrals').insert({referrer_user_id:uid,referred_tiktok_username:username,referred_display_name:displayName||null,program_id:programId}).select('id').single();
      if(result.error)throw result.error;
      notify('Referido registrado. Queda pendiente de validación.');
      await loadData();render();
    }catch(error){
      console.error('Gana más: error al registrar referido',error);
      const duplicate=/duplicate|unique/i.test(error?.message||'');
      if(message)message.textContent=duplicate?'Ese usuario ya está registrado en el programa.':'No se pudo registrar. Verifica que el usuario no esté registrado y vuelve a intentarlo.';
      button.disabled=false;button.querySelector('span').textContent='Registrar invitación';
    }
  }
  async function submitCommission(event){
    event.preventDefault();if(!isAdmin())return;
    const client=db(),message=$('gxRefCommissionMessage'),button=event.currentTarget.querySelector('button[type="submit"]');
    const referralId=$('gxRefCommissionReferral')?.value,month=$('gxRefCommissionMonth')?.value,net=Number($('gxRefCommissionNet')?.value),rate=Number($('gxRefCommissionRate')?.value),notes=String($('gxRefCommissionNotes')?.value||'').trim();
    if(!referralId||!month||net<0||rate<0||rate>100){if(message)message.textContent='Revisa los datos de la liquidación.';return;}
    const commission=Math.round((net*rate/100)*100)/100;
    button.disabled=true;button.querySelector('span').textContent='Guardando…';
    try{
      const result=await client.from('gx_referral_commissions').upsert({referral_id:referralId,period_month:month+'-01',agency_net_amount:net,commission_rate:rate,commission_amount:commission,status:'pending',notes:notes||null,created_by:userId(),updated_at:new Date().toISOString()},{onConflict:'referral_id,period_month'}).select('id').single();
      if(result.error)throw result.error;
      notify('Liquidación mensual guardada.');
      await loadData();render();
    }catch(error){console.error('Gana más: error al guardar liquidación',error);if(message)message.textContent='No se pudo guardar la liquidación. Comprueba los datos y los permisos.';button.disabled=false;button.querySelector('span').textContent='Guardar liquidación';}
  }
  async function deleteCommission(id){
    if(!isAdmin()||!id)return;
    if(!confirm('¿Eliminar esta liquidación del historial? Verifica que el pago no se haya realizado antes de continuar.'))return;
    const client=db();if(!client)return;
    const result=await client.from('gx_referral_commissions').delete().eq('id',id);
    if(result.error){console.error(result.error);notify('No se pudo eliminar la liquidación.',true);return;}
    notify('Liquidación eliminada.');await loadData();render();
  }
  async function updateCommissionStatus(id,next){
    if(!isAdmin()||!id)return;
    const client=db();if(!client)return;
    const label=next==='paid'?'marcar como pagada':'aprobar';
    if(!confirm('¿Confirmas '+label+' esta comisión?'))return;
    const patch={status:next,updated_at:new Date().toISOString()};
    if(next==='paid')patch.paid_at=new Date().toISOString();
    const result=await client.from('gx_referral_commissions').update(patch).eq('id',id);
    if(result.error){console.error('Gana más: no se pudo actualizar comisión',result.error);notify('No se pudo actualizar la comisión.',true);return;}
    notify(next==='paid'?'Comisión marcada como pagada.':'Comisión aprobada.');
    await loadData();render();
  }
  async function handleAdminAction(action,id){
    if(!isAdmin())return;
    const client=db();if(!client)return;
    if(action==='delete'){
      const related=await client.from('gx_referral_commissions').select('id').eq('referral_id',id).limit(1);
      if(related.error){notify('No se pudo comprobar el historial de liquidaciones.',true);return;}
      if(related.data?.length){notify('No se puede eliminar: este referido tiene liquidaciones asociadas. Conserva el historial financiero.',true);return;}
      if(!confirm('¿Eliminar este referido? Esta acción no se puede deshacer.'))return;
      const deleted=await client.from('gx_referrals').delete().eq('id',id);
      if(deleted.error){notify('No se pudo eliminar el referido.',true);return;}
      notify('Referido eliminado.');await loadData();render();return;
    }
    if(action==='commission'){
      const sel=$('gxRefCommissionReferral');if(sel){sel.value=id;document.getElementById('gxRefCommissionForm')?.scrollIntoView({behavior:'smooth',block:'center'});sel.focus();}
      return;
    }
    const next=action==='approve'?'approved':action==='pending'?'pending':'rejected';
    const promptText=next==='approved'?'¿Confirmas que este referido fue validado?':next==='pending'?'¿Quieres devolver este referido al estado pendiente?':'¿Quieres rechazar este referido?';
    if(!confirm(promptText))return;
    const result=await client.from('gx_referrals').update({status:next,reviewed_at:next==='pending'?null:new Date().toISOString(),reviewed_by:userId()}).eq('id',id);
    if(result.error){console.error(result.error);notify('No se pudo actualizar el referido.',true);return;}
    notify(next==='approved'?'Referido validado.':next==='pending'?'Referido devuelto a pendiente.':'Referido rechazado.');
    await loadData();render();
  }
  function watchAuth(){
    ensureButton();
    const observer=new MutationObserver(()=>{ensureButton();ensureAdminProgramCard();});
    observer.observe(document.body,{attributes:true,attributeFilter:['class'],childList:true,subtree:true});
    const main=document.querySelector('main.wrap');
    if(main)new MutationObserver(()=>{ensureButton();if(isOpen&&$('gxReferralsPage')?.classList.contains('hidden')){isOpen=false;}}).observe(main,{childList:true,subtree:false});
    setInterval(()=>{ensureButton();},1800);
  }
  function boot(){
    ensurePage();ensureButton();watchAuth();
    const bottomNav=$('grayxonBottomNav');
    if(bottomNav && !bottomNav.dataset.gxRefBound){
      bottomNav.dataset.gxRefBound='1';
      bottomNav.addEventListener('click',event=>{
        if(!isOpen)return;
        if(event.target.closest('button[data-gx-bottom]'))closePage();
      },true);
    }
    document.addEventListener('click',event=>{
      if(isOpen && !event.target.closest('#grayxonBottomNav') && !event.target.closest('#gxReferralsPage') && !event.target.closest('#gxOpenReferrals')){
        const current=document.querySelector('main.wrap > .page:not(.hidden)');
        if(current && current.id!=='gxReferralsPage')isOpen=false;
      }
    },true);
    window.addEventListener('pageshow',ensureButton);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();