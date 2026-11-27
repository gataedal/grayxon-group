CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE SCHEMA storage;
CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT string_to_array($1, '/')
$$;
CREATE TABLE storage.objects(id bigserial PRIMARY KEY,bucket_id text NOT NULL,name text NOT NULL);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.profiles(
  id uuid PRIMARY KEY, username text, full_name text, role text NOT NULL,
  active boolean NOT NULL DEFAULT true, team_id uuid, manager_id uuid, tiktok_username text
);
CREATE TABLE public.profile_details(
  user_id uuid PRIMARY KEY, email text, phone text, birth_date date, country text,
  state_region text, city text, address text, avatar_url text, avatar_path text, updated_at timestamptz
);
CREATE TABLE public.modules(id uuid PRIMARY KEY,title text,published boolean NOT NULL DEFAULT true,sort_order integer);
CREATE TABLE public.lessons(id uuid PRIMARY KEY,module_id uuid,title text,published boolean NOT NULL DEFAULT true,type text,sort_order integer);
CREATE TABLE public.lesson_progress(user_id uuid NOT NULL,lesson_id uuid NOT NULL,PRIMARY KEY(user_id,lesson_id));
CREATE TABLE public.portal_secret(id integer PRIMARY KEY,secret text);

CREATE TABLE public.managers(id uuid PRIMARY KEY,user_id uuid,active boolean DEFAULT true);
CREATE TABLE public.teams(id uuid PRIMARY KEY,manager_id uuid,name text);
CREATE TABLE public.announcements(id uuid PRIMARY KEY,target_type text,author_id uuid);
CREATE TABLE public.announcement_teams(announcement_id uuid,team_id uuid);
CREATE TABLE public.missions(
 id uuid PRIMARY KEY,title text,description text,type text,target numeric,week_start date,week_end date,
 assigned_to uuid,published boolean,link_url text,created_at timestamptz DEFAULT now()
);
CREATE TABLE public.mission_reads(user_id uuid,mission_id uuid);
CREATE TABLE public.gx_events(
 id uuid PRIMARY KEY,created_by uuid,status text,audience text,registration_open boolean DEFAULT true,
 ends_at timestamptz,battle_enabled boolean DEFAULT false
);
CREATE TABLE public.gx_event_audience_targets(event_id uuid,target_type text,target_id uuid);
CREATE TABLE public.gx_event_posts(id uuid PRIMARY KEY,event_id uuid,user_id uuid,created_at timestamptz DEFAULT now());
CREATE TABLE public.gx_event_post_reads(user_id uuid,post_id uuid);
CREATE TABLE public.gx_event_responses(event_id uuid,user_id uuid,response text,tiktok_username text,responded_at timestamptz);
CREATE TABLE public.gx_event_participants(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid,user_id uuid,status text,tiktok_username text,registered_at timestamptz);
CREATE TABLE public.gx_polls(id uuid PRIMARY KEY,target_type text,author_id uuid);
CREATE TABLE public.gx_poll_teams(poll_id uuid,team_id uuid);
CREATE TABLE public.gx_poll_votes(poll_id uuid,option_id uuid,user_id uuid);
CREATE TABLE public.gx_poll_views(poll_id uuid,user_id uuid);
CREATE TABLE public.gx_payments(id uuid PRIMARY KEY,recipient_user_id uuid,created_at timestamptz,payment_date date);
CREATE TABLE public.notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,type text,title text,message text,link_page text,link_target text);
CREATE TABLE public.creator_tasks(id uuid PRIMARY KEY,creator_id uuid,completed boolean DEFAULT false,completed_at timestamptz);
CREATE TABLE public.live_trainings(id uuid PRIMARY KEY,created_by uuid,status text);
CREATE TABLE public.live_training_audience(training_id uuid,target_type text,target_id uuid);

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t.tablename);
  END LOOP;
END $$;

CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin' AND active)
$$;
CREATE FUNCTION public.gx_event_audience_matches(p_event_id uuid,p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT true $$;
CREATE FUNCTION public.gx_poll_visible(p_poll_id uuid,p_user_id uuid DEFAULT auth.uid()) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT true $$;

CREATE SCHEMA private;
CREATE FUNCTION private.gx_announcement_author_profiles(p_author_ids uuid[])
RETURNS TABLE(author_id uuid,full_name text,username text,avatar_url text)
LANGUAGE sql STABLE AS $$ SELECT NULL::uuid,NULL::text,NULL::text,NULL::text WHERE false $$;

CREATE FUNCTION public.get_my_published_missions()
RETURNS TABLE(id uuid,title text,description text,type text,target numeric,week_start date,week_end date,assigned_to uuid,published boolean,link_url text,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT * FROM public.missions WHERE false $$;
CREATE FUNCTION public.grayxon_announcement_visible(uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT true $$;
CREATE FUNCTION public.gx_create_own_push_test_notification() RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.gx_event_can_view(uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT true $$;
CREATE FUNCTION public.gx_event_unread_count(uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT 0 $$;
CREATE FUNCTION public.gx_events_latest_unread_post()
RETURNS TABLE(post_id uuid,event_id uuid,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT NULL::uuid,NULL::uuid,NULL::timestamptz WHERE false $$;
CREATE FUNCTION public.gx_events_unread_count() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT 0 $$;
CREATE FUNCTION public.gx_missions_unread_count() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT 0 $$;
CREATE FUNCTION public.gx_poll_results(uuid[])
RETURNS TABLE(poll_id uuid,option_id uuid,vote_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT NULL::uuid,NULL::uuid,0::bigint WHERE false $$;
CREATE FUNCTION public.gx_poll_unread_count() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT 0 $$;
CREATE FUNCTION public.gx_events_respond(uuid,text,text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public.can_view_live_training(uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT true $$;
CREATE FUNCTION public.creator_can_view_live_training(uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT true $$;
CREATE FUNCTION public.complete_creator_task(uuid) RETURNS public.creator_tasks
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT NULL::public.creator_tasks $$;
CREATE FUNCTION public.gx_announcement_author_profiles(uuid[])
RETURNS TABLE(author_id uuid,full_name text,username text,avatar_url text)
LANGUAGE sql STABLE SET search_path=public,private,auth AS $$ SELECT * FROM private.gx_announcement_author_profiles($1) $$;

GRANT USAGE ON SCHEMA public,auth,storage,private TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
GRANT EXECUTE ON FUNCTION storage.foldername(text) TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public,storage TO authenticated;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING(id=auth.uid() OR public.is_admin());
CREATE POLICY "Admins can manage profiles" ON public.profiles FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
CREATE POLICY profile_details_select_own_admin ON public.profile_details FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.is_admin());
CREATE POLICY profile_details_insert_own ON public.profile_details FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() OR public.is_admin());
CREATE POLICY profile_details_update_own_admin ON public.profile_details FOR UPDATE TO authenticated USING(user_id=auth.uid() OR public.is_admin()) WITH CHECK(user_id=auth.uid() OR public.is_admin());
CREATE POLICY "Creators can view published modules" ON public.modules FOR SELECT TO authenticated USING(published IS TRUE OR public.is_admin());
CREATE POLICY "Admins can manage modules" ON public.modules FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
CREATE POLICY "Creators can view published lessons" ON public.lessons FOR SELECT TO authenticated USING(published IS TRUE OR public.is_admin());
CREATE POLICY "Admins can manage lessons" ON public.lessons FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
CREATE POLICY "Creators can view own progress" ON public.lesson_progress FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY "Creators can register own progress" ON public.lesson_progress FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() OR public.is_admin());
CREATE POLICY "Creators can save own progress" ON public.lesson_progress FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());
CREATE POLICY "Creators can update own progress" ON public.lesson_progress FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY "Admins can delete progress" ON public.lesson_progress FOR DELETE TO authenticated USING(public.is_admin());
CREATE POLICY portal_secret_read ON public.portal_secret FOR SELECT TO authenticated USING(true);
CREATE POLICY profile_avatars_public_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='profile-avatars');
CREATE POLICY profile_avatars_insert_own ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='profile-avatars' AND name LIKE auth.uid()::text||'/%');
CREATE POLICY training_videos_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='training-videos');
CREATE POLICY training_resources_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='training-resources');
