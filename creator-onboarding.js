/* Grayxon creator onboarding. Loaded after app.js; all state and data remain in the existing portal. */
(function(){
  'use strict';
  const REQUIRED_LESSONS = [
    'eed00a62-1b8a-45fb-bab3-60a7b12462c9',
    '07ae251c-29dc-42d8-b7d2-d486948c444d',
    'a581d37a-0fdb-4fde-8371-b221fe7ac2ce',
    '375a9472-2d97-474e-b603-c44996b28678',
    '4cbdfda7-e057-4758-8b18-0f2c91919dce'
  ];
  const REQUIRED_MODULES = [
    'a676aec5-1514-4640-8884-8e9e02b2e90a',
    'b7666174-c171-48ed-afe2-970b47c0c8fa',
    '5d5e7196-7f15-4d9e-a53e-6940b21d5a75'
  ];
  const original = {
    nav: window.nav,
    profileTpl: window.profileTpl,
    saveProfilePersonal: window.saveProfilePersonal,
    trainingTpl: window.trainingTpl,
    completeLesson: window.completeLesson,
    advanceAfterLesson: window.advanceAfterLesson,
    login: window.login,
    getProfile: window.getProfile
  };

  if(typeof original.getProfile === 'function'){
    window.getProfile = async function(){
      const result = await original.getProfile.apply(this,arguments);
      if(result && session?.user?.id){
        const {data,error}=await sb.from('profiles')
          .select('onboarding_required,onboarding_completed_at')
          .eq('id',session.user.id).maybeSingle();
        if(error) throw error;
        if(data) Object.assign(result,data);
      }
      return result;
    };
  }

  function pending(){
    return !!(profile && profile.role === 'creator' && profile.onboarding_required === true && !profile.onboarding_completed_at);
  }
  function profileComplete(d){
    d = d || profileDetails || {};
    return [d.email,d.phone,d.birth_date,d.country,d.state_region,d.city,d.avatar_url]
      .every(v => String(v == null ? '' : v).trim() !== '');
  }
  function creatorAdultDateLimit(){
    const d=new Date(); d.setHours(12,0,0,0); d.setFullYear(d.getFullYear()-18);
    return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  }
  function creatorIsAdult(dateValue){
    if(!dateValue) return false;
    const birth=new Date(dateValue+'T12:00:00');
    const cutoff=new Date(); cutoff.setHours(12,0,0,0); cutoff.setFullYear(cutoff.getFullYear()-18);
    return !Number.isNaN(birth.getTime()) && birth<=cutoff;
  }
  async function refreshState(){
    if(!session || !session.user || !session.user.id || !profile) return false;
    const {data,error} = await sb.from('profiles')
      .select('onboarding_required,onboarding_completed_at')
      .eq('id',session.user.id).maybeSingle();
    if(error) throw error;
    if(data) Object.assign(profile,data);
    return pending();
  }
  function completedScreen(){
    const host = document.getElementById('training');
    if(!host) return;
    host.innerHTML = '<div class="formation-page library-page"><section class="formation-complete-state" style="max-width:720px;margin:40px auto;text-align:center"><div class="formation-complete-icon">✓</div><span class="library-eyebrow">GRAYXON · PRIMEROS PASOS</span><h1>¡Ya estás listo para comenzar!</h1><p>Completaste tu perfil y los cinco videos de bienvenida. Si quieres, cuéntanos por WhatsApp que terminaste tus primeros pasos. Este mensaje es opcional.</p><a class="primary benefits-cta" href="https://wa.me/573126283007?text=Ya%20complete%20mis%20primeros%20pasos" target="_blank" rel="noopener noreferrer">Ya complete mis primeros pasos</a><div style="margin-top:18px"><button type="button" class="secondary" id="gxOnboardingEnterPortal">Entrar al portal</button></div></section></div>';
    document.getElementById('gxOnboardingEnterPortal')?.addEventListener('click',()=>nav('space'));
  }

  if(typeof original.nav === 'function'){
    window.nav = function(page,push){
      if(pending()){
        if(!['profile','training','force-password','auth'].includes(page)) page='profile';
        if(page==='training' && !profileComplete()) page='profile';
      }
      return original.nav.call(this,page,push);
    };
  }

  if(typeof original.profileTpl === 'function'){
    window.profileTpl = function(){
      if(!pending()) return original.profileTpl.apply(this,arguments);
      const d=profileDetails||{};
      const countries=profileCountries.map(([code,name])=>'<option value="'+esc(code)+'" '+(d.country===code?'selected':'')+'>'+esc(name)+'</option>').join('');
      const avatar=d.avatar_url
        ? '<img src="'+esc(d.avatar_url)+'" alt="Foto de perfil" style="width:88px;height:88px;border-radius:50%;object-fit:cover">'
        : '<span style="width:88px;height:88px;border-radius:50%;display:grid;place-items:center;background:#1c252e;color:#25F4EE;font-size:30px">＋</span>';
      return '<div class="profile-page gx-profile-settings"><section class="card" style="max-width:760px;margin:28px auto;padding:clamp(20px,4vw,36px)"><span class="library-eyebrow">GRAYXON · PRIMEROS PASOS</span><h1 style="margin:8px 0">Completa tu perfil</h1><p class="muted">Antes de entrar al portal, necesitamos estos datos para acompañarte correctamente. Los campos marcados son obligatorios.</p><div style="display:flex;align-items:center;gap:18px;margin:24px 0"><div class="creator-dashboard-avatar creator-dashboard-avatar-editable" style="width:100px;height:100px;min-width:100px">'+avatar+'<button type="button" class="creator-avatar-edit" id="profilePhotoEdit" aria-label="Subir foto" title="Subir foto">✎</button><input id="profileAvatar" class="hidden" type="file" accept="image/*"></div><div><strong>Tu foto de perfil *</strong><p class="muted small">Sube una foto clara para que tu equipo pueda reconocerte.</p><div id="profileAvatarStatus" aria-live="polite"></div></div></div><div class="gx-profile-editor"><h3>Datos personales</h3>'+field('pEmail','Correo electrónico *',d.email||'')+field('pPhone','Número de teléfono *',d.phone||'')+'<label class="field"><span>Fecha de nacimiento *</span><input id="pBirthDate" type="date" value="'+esc(d.birth_date||'')+'" max="'+creatorAdultDateLimit()+'" autocomplete="bday"></label><label class="field"><span>País *</span><select id="pCountry"><option value="">Selecciona tu país</option>'+countries+'</select></label>'+field('pState','Departamento / Región *',d.state_region||'')+field('pCity','Ciudad *',d.city||'')+field('pAddress','Dirección (opcional)',d.address||'',true)+'<div id="gxProfilePersonalError" class="error" aria-live="polite"></div><div class="gx-profile-editor-actions"><button type="button" class="primary gx-profile-btn gx-profile-btn-primary" id="gxSavePersonal">Guardar y continuar</button></div></div></section></div>';
    };
  }

  if(typeof original.saveProfilePersonal === 'function'){
    window.saveProfilePersonal = async function(){
      if(!pending()) return original.saveProfilePersonal.apply(this,arguments);
      const err=document.getElementById('gxProfilePersonalError');
      const btn=document.getElementById('gxSavePersonal');
      if(err) err.textContent='';
      if(!session?.user?.id) return;
      if(btn) btn.disabled=true;
      try{
        const data={
          user_id:session.user.id,
          email:document.getElementById('pEmail')?.value.trim()||null,
          phone:document.getElementById('pPhone')?.value.trim()||null,
          birth_date:document.getElementById('pBirthDate')?.value||null,
          country:document.getElementById('pCountry')?.value||null,
          state_region:document.getElementById('pState')?.value.trim()||null,
          city:document.getElementById('pCity')?.value.trim()||null,
          address:document.getElementById('pAddress')?.value.trim()||null,
          updated_at:new Date().toISOString()
        };
        if([data.email,data.phone,data.birth_date,data.country,data.state_region,data.city].some(v=>!String(v||'').trim()))
          throw new Error('Completa todos los campos obligatorios antes de continuar.');
        if(!creatorIsAdult(data.birth_date)) throw new Error('Para ingresar a Grayxon debes tener al menos 18 años.');
        if(!profileDetails?.avatar_url) throw new Error('Primero debes subir tu foto de perfil.');
        const {error}=await sb.from('profile_details').upsert(data);
        if(error) throw error;
        await loadProfileDetails();
        if(!profileComplete()) throw new Error('No pudimos validar todos tus datos. Revisa la información y tu foto.');
        toast('Perfil completado ✓');
        nav('training');
      }catch(e){
        if(err) err.textContent=e?.message||'No se pudieron guardar los datos personales.';
      }finally{
        if(btn) btn.disabled=false;
      }
    };
  }

  if(typeof original.trainingTpl === 'function'){
    window.trainingTpl = async function(options){
      if(!pending()) return original.trainingTpl.apply(this,arguments);
      try{ await refreshState(); }catch(e){ toast('No pudimos validar tu proceso. Inténtalo nuevamente.'); return; }
      if(!pending()) return original.trainingTpl.apply(this,arguments);
      if(!profileComplete()){ nav('profile'); return; }
      const result=await original.trainingTpl.apply(this,arguments);
      try{ await refreshState(); }catch(e){ toast('No pudimos validar tu proceso. Inténtalo nuevamente.'); return; }
      if(Array.isArray(window._lessons)){
        window._lessons=window._lessons.filter(l=>REQUIRED_LESSONS.includes(l.id) && l.type==='video');
      }
      if(Array.isArray(window._modules)){
        window._modules=window._modules.filter(m=>REQUIRED_MODULES.includes(m.id));
      }
      const heading=document.querySelector('#training .library-page-heading h1');
      if(heading) heading.textContent='Tu formación inicial';
      const eyebrow=document.querySelector('#training .library-page-heading .library-eyebrow');
      if(eyebrow) eyebrow.textContent='GRAYXON · PRIMEROS PASOS';
      const subtitle=document.querySelector('#training .library-subtitle');
      if(subtitle) subtitle.textContent='Completa estos cinco videos para desbloquear tu portal.';
      const summary=document.querySelector('#training .library-progress-summary span');
      if(summary) summary.textContent='TUS PRIMEROS PASOS';
      return result;
    };
  }

  if(typeof original.completeLesson === 'function'){
    window.completeLesson = async function(id,options){
      if(!pending()) return original.completeLesson.apply(this,arguments);
      const lesson=(window._lessons||[]).find(x=>x.id===id);
      if(!lesson || lesson.type!=='video' || !REQUIRED_LESSONS.includes(id)){
        toast('Este contenido no forma parte de tus primeros pasos.');
        return;
      }
      if(window._done?.has(id)) return original.advanceAfterLesson.call(this,id,options||{});
      if(!options?.fromVideo){
        toast('El video debe llegar al final para registrar este paso.');
        return;
      }
      const hint=document.getElementById('videoCompletion');
      if(hint) hint.textContent='Video terminado. Guardando tu avance…';
      const result=await sb.rpc('gx_complete_creator_onboarding_video',{p_lesson_id:id});
      if(result.error){
        if(hint) hint.textContent=result.error.message||'No pudimos guardar tu avance. Inténtalo nuevamente.';
        toast(result.error.message||'No se pudo guardar tu avance.');
        return;
      }
      window._done?.add(id);
      if(typeof syncFormationLessonListState==='function') syncFormationLessonListState();
      if(result.data?.completed){
        if(profile) profile.onboarding_completed_at = profile.onboarding_completed_at || new Date().toISOString();
        try{await refreshState();}catch(e){}
        completedScreen();
        return;
      }
      toast('Video completado ✓');
      return original.advanceAfterLesson.call(this,id,{fromVideo:true});
    };
  }

  if(typeof original.advanceAfterLesson === 'function'){
    window.advanceAfterLesson = async function(id,options){
      if(profile?.onboarding_required && profile?.onboarding_completed_at){ completedScreen(); return; }
      return original.advanceAfterLesson.apply(this,arguments);
    };
  }

  if(typeof original.login === 'function'){
    window.login = async function(){
      const result=await original.login.apply(this,arguments);
      if(session && profile){
        try{
          await refreshState();
          if(pending()) nav('profile');
        }catch(e){ console.warn('No se pudo validar el onboarding:',e); }
      }
      return result;
    };
  }

  document.addEventListener('click',function(event){
    if(pending() && event.target?.closest?.('#gxSavePersonal')){
      event.preventDefault();
      if(typeof saveProfilePersonal==='function') saveProfilePersonal();
    }
  },true);

  document.addEventListener('click',function(event){
    if(event.target?.closest?.('#profilePhotoEdit')){
      event.preventDefault();
      document.getElementById('profileAvatar')?.click();
    }
  },true);
  document.addEventListener('change',async function(event){
    if(event.target?.id!=='profileAvatar' || typeof uploadProfileAvatar!=='function') return;
    await uploadProfileAvatar();
    const url=profileDetails?.avatar_url;
    const root=document.querySelector('#profile .creator-dashboard-avatar-editable');
    if(root && url){
      let img=root.querySelector('img');
      if(!img){
        img=document.createElement('img');
        img.alt='Foto de perfil';
        img.style.cssText='width:88px;height:88px;border-radius:50%;object-fit:cover';
        root.querySelector('span')?.remove();
        root.insertBefore(img,root.querySelector('#profilePhotoEdit')||root.firstChild);
      }
      img.src=url;
    }
  },true);

  // Restore the correct mandatory step when a returning session is already active.
  if(session && profile){
    refreshState().then(isPending=>{
      if(isPending) nav('profile',false);
    }).catch(error=>console.warn('No se pudo validar el onboarding inicial:',error));
  }
})();
