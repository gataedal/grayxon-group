-- Creator onboarding: only newly-created creator accounts are gated.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

CREATE OR REPLACE FUNCTION public.gx_creator_onboarding_pending()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT COALESCE((
    SELECT p.role = 'creator' AND p.active IS TRUE
       AND p.onboarding_required IS TRUE AND p.onboarding_completed_at IS NULL
    FROM public.profiles p WHERE p.id = auth.uid()
  ), false);
$$;
REVOKE ALL ON FUNCTION public.gx_creator_onboarding_pending() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gx_creator_onboarding_pending() TO authenticated;

DROP POLICY IF EXISTS "Creators can view published modules" ON public.modules;
CREATE POLICY gx_onboarding_modules_select ON public.modules FOR SELECT TO authenticated
USING (published IS TRUE AND (NOT public.gx_creator_onboarding_pending() OR id IN (
  'a676aec5-1514-4640-8884-8e9e02b2e90a',
  'b7666174-c171-48ed-afe2-970b47c0c8fa',
  '5d5e7196-7f15-4d9e-a53e-6940b21d5a75'
)));

DROP POLICY IF EXISTS "Creators can view published lessons" ON public.lessons;
CREATE POLICY gx_onboarding_lessons_select ON public.lessons FOR SELECT TO authenticated
USING (published IS TRUE AND (NOT public.gx_creator_onboarding_pending() OR id IN (
  'eed00a62-1b8a-45fb-bab3-60a7b12462c9',
  '07ae251c-29dc-42d8-b7d2-d486948c444d',
  'a581d37a-0fdb-4fde-8371-b221fe7ac2ce',
  '375a9472-2d97-474e-b603-c44996b28678',
  '4cbdfda7-e057-4758-8b18-0f2c91919dce'
)));

DROP POLICY IF EXISTS "Creators can register own progress" ON public.lesson_progress;
DROP POLICY IF EXISTS "Creators can save own progress" ON public.lesson_progress;
DROP POLICY IF EXISTS "Creators can update own progress" ON public.lesson_progress;
CREATE POLICY gx_lesson_progress_insert_non_onboarding ON public.lesson_progress FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND NOT public.gx_creator_onboarding_pending());
CREATE POLICY gx_lesson_progress_update_non_onboarding ON public.lesson_progress FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND NOT public.gx_creator_onboarding_pending())
WITH CHECK (user_id = auth.uid() AND NOT public.gx_creator_onboarding_pending());

CREATE OR REPLACE FUNCTION public.gx_complete_creator_onboarding_video(p_lesson_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_details public.profile_details%ROWTYPE;
  v_required uuid[] := ARRAY[
    'eed00a62-1b8a-45fb-bab3-60a7b12462c9'::uuid,
    '07ae251c-29dc-42d8-b7d2-d486948c444d'::uuid,
    'a581d37a-0fdb-4fde-8371-b221fe7ac2ce'::uuid,
    '375a9472-2d97-474e-b603-c44996b28678'::uuid,
    '4cbdfda7-e057-4758-8b18-0f2c91919dce'::uuid
  ];
  v_next uuid;
  v_done integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_profile FROM public.profiles
  WHERE id = v_uid AND role = 'creator' AND active IS TRUE FOR UPDATE;
  IF NOT FOUND OR v_profile.onboarding_required IS NOT TRUE THEN
    RAISE EXCEPTION 'Esta cuenta no tiene un onboarding pendiente' USING ERRCODE = '42501';
  END IF;
  IF v_profile.onboarding_completed_at IS NOT NULL THEN
    RETURN jsonb_build_object('completed', true, 'completed_count', 5, 'total_count', 5);
  END IF;

  SELECT * INTO v_details FROM public.profile_details WHERE user_id = v_uid;
  IF NOT FOUND OR NULLIF(btrim(v_details.email), '') IS NULL
     OR NULLIF(btrim(v_details.phone), '') IS NULL OR v_details.birth_date IS NULL
     OR NULLIF(btrim(v_details.country), '') IS NULL
     OR NULLIF(btrim(v_details.state_region), '') IS NULL
     OR NULLIF(btrim(v_details.city), '') IS NULL
     OR NULLIF(btrim(v_details.avatar_url), '') IS NULL THEN
    RAISE EXCEPTION 'Primero debes completar tus datos personales y subir tu foto' USING ERRCODE = '23514';
  END IF;

  IF NOT (p_lesson_id = ANY(v_required)) THEN
    RAISE EXCEPTION 'Este video no forma parte del onboarding obligatorio' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (SELECT 1 FROM public.lesson_progress WHERE user_id = v_uid AND lesson_id = p_lesson_id) THEN
    SELECT count(DISTINCT lesson_id)::integer INTO v_done FROM public.lesson_progress
    WHERE user_id = v_uid AND lesson_id = ANY(v_required);
    RETURN jsonb_build_object('completed', v_done = 5, 'completed_count', v_done, 'total_count', 5);
  END IF;

  SELECT required_id INTO v_next
  FROM unnest(v_required) WITH ORDINALITY AS required(required_id, position)
  WHERE NOT EXISTS (SELECT 1 FROM public.lesson_progress lp
                    WHERE lp.user_id = v_uid AND lp.lesson_id = required.required_id)
  ORDER BY position LIMIT 1;
  IF v_next IS DISTINCT FROM p_lesson_id THEN
    RAISE EXCEPTION 'Debes completar los videos en el orden indicado' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.lesson_progress(user_id, lesson_id) VALUES (v_uid, p_lesson_id);
  SELECT count(DISTINCT lesson_id)::integer INTO v_done FROM public.lesson_progress
  WHERE user_id = v_uid AND lesson_id = ANY(v_required);
  IF v_done = 5 THEN
    UPDATE public.profiles SET onboarding_completed_at = now() WHERE id = v_uid;
  END IF;
  RETURN jsonb_build_object('completed', v_done = 5, 'completed_count', v_done, 'total_count', 5);
END;
$$;
REVOKE ALL ON FUNCTION public.gx_complete_creator_onboarding_video(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gx_complete_creator_onboarding_video(uuid) TO authenticated;

-- Restrictive policies close every other public table for pending creators only.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    AND tablename NOT IN ('profiles', 'profile_details', 'modules', 'lessons', 'lesson_progress')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS gx_creator_onboarding_gate ON public.%I', t.tablename);
    EXECUTE format(
      'CREATE POLICY gx_creator_onboarding_gate ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.gx_creator_onboarding_pending()) WITH CHECK (NOT public.gx_creator_onboarding_pending())',
      t.tablename
    );
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS gx_creator_onboarding_storage_gate ON storage.objects;
CREATE POLICY gx_creator_onboarding_storage_gate ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
USING (
  NOT public.gx_creator_onboarding_pending()
  OR bucket_id IN ('training-videos', 'training-resources')
  OR (bucket_id = 'profile-avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
)
WITH CHECK (
  NOT public.gx_creator_onboarding_pending()
  OR (bucket_id = 'profile-avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
);
