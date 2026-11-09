-- Grayxon Trabajo: cancellation, safe deletion and streamlined request conversion.
ALTER TABLE public.gx_tasks
  DROP CONSTRAINT IF EXISTS gx_tasks_status_check;

ALTER TABLE public.gx_tasks
  ADD CONSTRAINT gx_tasks_status_check
  CHECK (status = ANY (ARRAY['pending','in_progress','blocked','submitted','completed','cancelled']::text[]));

CREATE OR REPLACE FUNCTION public.gx_admin_cancel_task(p_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task public.gx_tasks%rowtype;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede cancelar tareas.' USING errcode = '42501';
  END IF;

  SELECT * INTO v_task
  FROM public.gx_tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La tarea no existe.' USING errcode = 'P0002';
  END IF;

  IF v_task.status <> 'pending' THEN
    RAISE EXCEPTION 'Solo se pueden cancelar tareas que todavía no han comenzado.' USING errcode = '22023';
  END IF;

  UPDATE public.gx_tasks
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_task_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.gx_admin_delete_task(p_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task public.gx_tasks%rowtype;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede eliminar tareas.' USING errcode = '42501';
  END IF;

  SELECT * INTO v_task
  FROM public.gx_tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La tarea no existe.' USING errcode = 'P0002';
  END IF;

  IF v_task.status NOT IN ('pending','cancelled') THEN
    RAISE EXCEPTION 'Solo se pueden eliminar tareas que no hayan comenzado o que estén canceladas.' USING errcode = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.gx_creator_deliveries WHERE task_id = p_task_id) THEN
    RAISE EXCEPTION 'No se puede eliminar una tarea que ya generó una entrega para un creador.' USING errcode = '23503';
  END IF;

  IF v_task.source_request_id IS NOT NULL THEN
    UPDATE public.gx_task_requests
    SET status = 'pending',
        reviewed_by = NULL,
        reviewed_at = NULL,
        converted_task_id = NULL,
        admin_note = NULL,
        updated_at = now()
    WHERE id = v_task.source_request_id
      AND converted_task_id = p_task_id;
  END IF;

  DELETE FROM public.gx_tasks WHERE id = p_task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.gx_admin_cancel_task(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gx_admin_delete_task(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gx_admin_cancel_task(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gx_admin_delete_task(uuid) TO authenticated;
