/* Grayxon LiveKit device discovery.
   Preserve the browser's native mediaDevices API and never request permissions just to list devices. */
(()=>{
  const media=navigator.mediaDevices;
  if(!media || !media.enumerateDevices) return;
  const nativeEnumerate=media.enumerateDevices.bind(media);
  let refreshInFlight=null;
  const modal=()=>document.querySelector('.gx-device-settings-modal');
  const note=()=>document.querySelector('[data-gx-device-note]');
  const populate=devices=>{
    const camera=document.querySelector('[data-gx-device-camera]');
    const microphone=document.querySelector('[data-gx-device-microphone]');
    if(!camera||!microphone)return;
    const fill=(select,kind,label)=>{
      const previous=select.value;
      const list=devices.filter(device=>device.kind===kind);
      select.replaceChildren();
      if(!list.length){
        const option=document.createElement('option');
        option.value='';
        option.textContent='No se encontraron dispositivos';
        select.appendChild(option);
        return;
      }
      list.forEach((device,index)=>{
        const option=document.createElement('option');
        option.value=device.deviceId;
        option.textContent=device.label||label+' '+(index+1);
        select.appendChild(option);
      });
      if(list.some(device=>device.deviceId===previous))select.value=previous;
    };
    fill(camera,'videoinput','Cámara');
    fill(microphone,'audioinput','Micrófono');
    const status=note();
    if(status)status.textContent='Lista actualizada. Si falta un dispositivo recién conectado, pulsa «Actualizar lista».';
  };
  const refresh=async()=>{
    if(refreshInFlight)return refreshInFlight;
    refreshInFlight=(async()=>{
      const status=note();
      if(status)status.textContent='Actualizando dispositivos…';
      try{
        const devices=await nativeEnumerate();
        populate(devices);
        if(status && !devices.some(d=>d.kind==='videoinput' || d.kind==='audioinput'))status.textContent='Chrome no está exponiendo cámaras ni micrófonos a esta página. Revisa los permisos del sitio y del sistema.';
      }catch(error){if(status)status.textContent='No se pudieron actualizar los dispositivos: '+(error?.message||error);}
    })().finally(()=>{refreshInFlight=null;});
    return refreshInFlight;
  };
  const installRefreshButton=()=>{
    const head=modal()?.querySelector('.gx-device-settings-head');
    if(!head || head.querySelector('[data-gx-device-refresh]'))return;
    const button=document.createElement('button');
    button.type='button';
    button.dataset.gxDeviceRefresh='';
    button.textContent='↻';
    button.title='Actualizar lista de dispositivos';
    button.setAttribute('aria-label','Actualizar lista de dispositivos');
    button.style.cssText='min-width:42px;margin-left:auto;margin-right:8px;color:#25f4ee;font-size:18px;';
    head.insertBefore(button,head.querySelector('[data-gx-device-close]')||null);
    button.addEventListener('click',()=>refresh());
  };
  media.addEventListener?.('devicechange',()=>{
    const current=modal();
    if(current && !current.hidden)refresh();
  });
  document.addEventListener('click',event=>{
    if(event.target.closest?.('[data-gx-more="devices"],[data-gx-settings-devices]')){
      Promise.resolve().then(installRefreshButton);
      return;
    }
  });
})();