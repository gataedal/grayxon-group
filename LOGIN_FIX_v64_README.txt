Grayxon Group — v64

Cambios de navegación y acceso:
- Unifica el inicio de sesión para admin, manager y creator.
- El rol se determina desde profiles.role después de autenticar.
- Redirige automáticamente a admin, manager o space según el rol.
- Corrige la navegación de “Tu espacio” desde el menú de cuenta para respetar el rol en todos los dispositivos.
- El botón superior cambia según la sesión: Iniciar sesión / Admin / Manager / Mi espacio.
- El acceso administrativo ya no requiere una pantalla de login separada.
- No modifica tablas, RLS, triggers ni Edge Functions.
- Mantiene intacta la corrección aplicada a Andrea (profiles.manager_id).

Archivos modificados respecto a v63:
- app.js
- index.html

Base: Grayxon_Group_GITHUB_PAGES_PRO_v63_MANAGER_HARDENED.zip
