GRAYXON GROUP — v63 MANAGER PASSWORD RESET

Purpose
-------
Adds a server-side Edge Function to let an authenticated Grayxon admin reset the password of an existing manager without creating a new Auth user or exposing the service_role key in the browser.

Changes from v62
----------------
- Added edge-functions/update-manager-password/index.ts
- Added an admin-only “Cambiar contraseña” action to the existing Teams & Managers modal.
- Bumped app.js cache-busting from v62 to v63.
- No database schema changes.
- Existing create-manager function was not replaced.

Deployment
----------
1. In Supabase Dashboard → Edge Functions, create/deploy a function named:
   update-manager-password
2. Paste/upload edge-functions/update-manager-password/index.ts.
3. Deploy the function.
4. Publish the updated frontend files from this ZIP to GitHub Pages.
5. As admin, open Admin → Equipos y managers → Editar Andrea Torres.
6. Enter a new password (minimum 8 characters) and click “Cambiar contraseña”.
7. Test login with username: andrea.onyx and the new password.

Security
--------
- The function validates the caller's Supabase session.
- It checks public.profiles for role=admin and active=true.
- It accepts only an existing public.managers.id and uses that row's user_id.
- The Supabase service-role key is read only from the Edge Function environment and is never placed in app.js/config.js.
- It does not change profiles, managers, roles, team assignments, or UUIDs.
