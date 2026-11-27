begin;

-- La versión de cuatro argumentos quedó obsoleta al incorporar métricas.
-- El portal usa la RPC de cinco argumentos; eliminamos la sobrecarga antigua
-- para que no quede disponible una ruta heredada con reglas distintas.
revoke all on function public.gx_manager_update_creator_action_plan(uuid,text,text,text) from public, anon, authenticated;
drop function public.gx_manager_update_creator_action_plan(uuid,text,text,text);

commit;
