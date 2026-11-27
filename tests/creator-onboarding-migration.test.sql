-- Apply after the two creator-onboarding migrations.
INSERT INTO public.profiles(id,username,full_name,role,active) VALUES
 ('11111111-1111-4111-8111-111111111111','newcreator','New Creator','creator',true),
 ('22222222-2222-4222-8222-222222222222','oldcreator','Existing Creator','creator',true),
 ('33333333-3333-4333-8333-333333333333','underage','Underage Creator','creator',true),
 ('44444444-4444-4444-8444-444444444444','brazil','Brazil Creator','creator',true),
 ('55555555-5555-4555-8555-555555555555','manager','Manager','manager',true),
 ('66666666-6666-4666-8666-666666666666','admin','Admin','admin',true);
UPDATE public.profiles SET onboarding_required=true
WHERE id IN ('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444');

INSERT INTO public.profile_details(user_id,email,phone,birth_date,country,state_region,city,avatar_url,avatar_path) VALUES
 ('11111111-1111-4111-8111-111111111111','new@example.com','3000000000','1995-10-12','CO','Antioquia','Medellin','https://example.test/new.jpg','11111111-1111-4111-8111-111111111111/new.jpg'),
 ('22222222-2222-4222-8222-222222222222','old@example.com','3000000001','1995-10-12','CO','Antioquia','Medellin','https://example.test/old.jpg','22222222-2222-4222-8222-222222222222/old.jpg'),
 ('33333333-3333-4333-8333-333333333333','young@example.com','3000000002',(current_date - interval '17 years')::date,'CO','Antioquia','Medellin','https://example.test/young.jpg','33333333-3333-4333-8333-333333333333/young.jpg'),
 ('44444444-4444-4444-8444-444444444444','br@example.com','3000000003','1995-10-12','BR','Sao Paulo','Sao Paulo','https://example.test/br.jpg','44444444-4444-4444-8444-444444444444/br.jpg');

INSERT INTO storage.objects(bucket_id,name) VALUES
 ('profile-avatars','11111111-1111-4111-8111-111111111111/new.jpg'),
 ('profile-avatars','22222222-2222-4222-8222-222222222222/old.jpg'),
 ('profile-avatars','33333333-3333-4333-8333-333333333333/young.jpg'),
 ('profile-avatars','44444444-4444-4444-8444-444444444444/br.jpg'),
 ('training-videos','welcome/video.mp4'),
 ('public-assets','private/asset.png');

INSERT INTO public.modules(id,title,published,sort_order) VALUES
 ('a676aec5-1514-4640-8884-8e9e02b2e90a','Basicos de Grayxon',true,1),
 ('b7666174-c171-48ed-afe2-970b47c0c8fa','Normas comunitarias',true,2),
 ('5d5e7196-7f15-4d9e-a53e-6940b21d5a75','Básicos del Live',true,3),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Otro módulo',true,4);
INSERT INTO public.lessons(id,module_id,title,published,type,sort_order) VALUES
 ('eed00a62-1b8a-45fb-bab3-60a7b12462c9','a676aec5-1514-4640-8884-8e9e02b2e90a','Bienvenido',true,'video',1),
 ('07ae251c-29dc-42d8-b7d2-d486948c444d','a676aec5-1514-4640-8884-8e9e02b2e90a','Como moverte en nuestra agencia',true,'video',2),
 ('a581d37a-0fdb-4fde-8371-b221fe7ac2ce','b7666174-c171-48ed-afe2-970b47c0c8fa','Normas comunitarias',true,'video',1),
 ('375a9472-2d97-474e-b603-c44996b28678','5d5e7196-7f15-4d9e-a53e-6940b21d5a75','Qué es TikTok Live y como se monetiza',true,'video',1),
 ('4cbdfda7-e057-4758-8b18-0f2c91919dce','5d5e7196-7f15-4d9e-a53e-6940b21d5a75','Preparación para tu LIVE',true,'video',2),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Extra',true,'video',1);

INSERT INTO public.portal_secret VALUES(1,'internal portal data');
INSERT INTO public.missions(id,title,assigned_to,published) VALUES
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','Mission for new creator','11111111-1111-4111-8111-111111111111',true);
INSERT INTO public.gx_events(id,created_by,status,audience,registration_open,battle_enabled) VALUES
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','66666666-6666-4666-8666-666666666666','published','all',true,false);
INSERT INTO public.gx_event_posts(id,event_id,user_id) VALUES
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','dddddddd-dddd-4ddd-8ddd-dddddddddddd','22222222-2222-4222-8222-222222222222');
INSERT INTO public.gx_polls(id,target_type,author_id) VALUES
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','agency','22222222-2222-4222-8222-222222222222');
INSERT INTO public.gx_poll_votes(poll_id,option_id,user_id) VALUES
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222');
INSERT INTO public.creator_tasks(id,creator_id,completed) VALUES
 ('99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111',false);
INSERT INTO public.live_trainings(id,created_by,status) VALUES
 ('88888888-8888-4888-8888-888888888888','66666666-6666-4666-8666-666666666666','live');
INSERT INTO public.live_training_audience(training_id,target_type,target_id) VALUES
 ('88888888-8888-4888-8888-888888888888','all_creators',NULL);

SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SET ROLE authenticated;
DO $$
DECLARE
  v_id uuid;
  v_result jsonb;
  v_count integer;
  v_lesson uuid;
BEGIN
  IF NOT public.gx_creator_onboarding_pending() THEN RAISE EXCEPTION 'pending creator was not detected'; END IF;
  SELECT count(*) INTO v_count FROM public.modules;
  IF v_count <> 3 THEN RAISE EXCEPTION 'pending creator saw % modules, expected 3',v_count; END IF;
  SELECT count(*) INTO v_count FROM public.lessons;
  IF v_count <> 5 THEN RAISE EXCEPTION 'pending creator saw % lessons, expected 5',v_count; END IF;
  SELECT count(*) INTO v_count FROM public.portal_secret;
  IF v_count <> 0 THEN RAISE EXCEPTION 'pending creator accessed protected portal table'; END IF;
  SELECT count(*) INTO v_count FROM storage.objects WHERE bucket_id='training-videos';
  IF v_count <> 1 THEN RAISE EXCEPTION 'pending creator cannot read training videos'; END IF;
  SELECT count(*) INTO v_count FROM storage.objects WHERE bucket_id='public-assets';
  IF v_count <> 0 THEN RAISE EXCEPTION 'pending creator accessed unrelated storage bucket'; END IF;

  IF public.gx_event_can_view('dddddddd-dddd-4ddd-8ddd-dddddddddddd') THEN RAISE EXCEPTION 'event RPC bypass'; END IF;
  IF public.gx_poll_visible('ffffffff-ffff-4fff-8fff-ffffffffffff',auth.uid()) THEN RAISE EXCEPTION 'poll RPC bypass'; END IF;
  IF public.can_view_live_training('88888888-8888-4888-8888-888888888888') THEN RAISE EXCEPTION 'live training RPC bypass'; END IF;
  IF public.creator_can_view_live_training('88888888-8888-4888-8888-888888888888') THEN RAISE EXCEPTION 'creator live training RPC bypass'; END IF;
  IF (SELECT count(*) FROM public.get_my_published_missions()) <> 0 THEN RAISE EXCEPTION 'missions RPC bypass'; END IF;
  IF public.gx_missions_unread_count() <> 0 THEN RAISE EXCEPTION 'missions unread RPC bypass'; END IF;
  IF public.grayxon_announcement_visible('dddddddd-dddd-4ddd-8ddd-dddddddddddd') THEN RAISE EXCEPTION 'announcement RPC bypass'; END IF;
  IF (SELECT count(*) FROM public.gx_announcement_author_profiles(ARRAY[]::uuid[])) <> 0 THEN RAISE EXCEPTION 'announcement author RPC bypass'; END IF;
  IF public.gx_event_unread_count('dddddddd-dddd-4ddd-8ddd-dddddddddddd') <> 0 THEN RAISE EXCEPTION 'event unread RPC bypass'; END IF;
  IF public.gx_events_unread_count() <> 0 THEN RAISE EXCEPTION 'events unread RPC bypass'; END IF;
  IF (SELECT count(*) FROM public.gx_events_latest_unread_post()) <> 0 THEN RAISE EXCEPTION 'latest event post RPC bypass'; END IF;
  IF (SELECT count(*) FROM public.gx_poll_results(ARRAY['ffffffff-ffff-4fff-8fff-ffffffffffff']::uuid[])) <> 0 THEN RAISE EXCEPTION 'poll results RPC bypass'; END IF;
  IF public.gx_poll_unread_count() <> 0 THEN RAISE EXCEPTION 'poll unread RPC bypass'; END IF;

  BEGIN
    INSERT INTO public.lesson_progress(user_id,lesson_id) VALUES(auth.uid(),'eed00a62-1b8a-45fb-bab3-60a7b12462c9');
    RAISE EXCEPTION 'direct lesson progress insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.gx_complete_creator_onboarding_video('07ae251c-29dc-42d8-b7d2-d486948c444d');
    RAISE EXCEPTION 'out-of-order onboarding video unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    PERFORM public.complete_creator_task('99999999-9999-4999-8999-999999999999');
    RAISE EXCEPTION 'creator task RPC unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.gx_events_respond('dddddddd-dddd-4ddd-8ddd-dddddddddddd','yes',NULL);
    RAISE EXCEPTION 'event response RPC unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.gx_create_own_push_test_notification();
    RAISE EXCEPTION 'push test RPC unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  FOR v_lesson IN SELECT unnest(ARRAY[
    'eed00a62-1b8a-45fb-bab3-60a7b12462c9'::uuid,
    '07ae251c-29dc-42d8-b7d2-d486948c444d'::uuid,
    'a581d37a-0fdb-4fde-8371-b221fe7ac2ce'::uuid,
    '375a9472-2d97-474e-b603-c44996b28678'::uuid,
    '4cbdfda7-e057-4758-8b18-0f2c91919dce'::uuid
  ]) LOOP
    v_result := public.gx_complete_creator_onboarding_video(v_lesson);
  END LOOP;
  IF (v_result->>'completed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'onboarding did not complete after five videos'; END IF;
  IF public.gx_creator_onboarding_pending() THEN RAISE EXCEPTION 'onboarding remains pending after fifth video'; END IF;
  SELECT count(*) INTO v_count FROM public.portal_secret;
  IF v_count <> 1 THEN RAISE EXCEPTION 'completed creator still cannot access portal'; END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.gx_complete_creator_onboarding_video('eed00a62-1b8a-45fb-bab3-60a7b12462c9');
    RAISE EXCEPTION 'underage creator unexpectedly passed onboarding';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.gx_complete_creator_onboarding_video('eed00a62-1b8a-45fb-bab3-60a7b12462c9');
    RAISE EXCEPTION 'Brazil-based creator unexpectedly passed onboarding';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
SET ROLE authenticated;
DO $$
DECLARE n integer;
BEGIN
  IF public.gx_creator_onboarding_pending() THEN RAISE EXCEPTION 'existing creator was incorrectly gated'; END IF;
  SELECT count(*) INTO n FROM public.modules;
  IF n<>4 THEN RAISE EXCEPTION 'existing creator did not retain all modules'; END IF;
  SELECT count(*) INTO n FROM public.lessons;
  IF n<>6 THEN RAISE EXCEPTION 'existing creator did not retain all lessons'; END IF;
  SELECT count(*) INTO n FROM public.portal_secret;
  IF n<>1 THEN RAISE EXCEPTION 'existing creator cannot access portal table'; END IF;
  INSERT INTO public.lesson_progress(user_id,lesson_id) VALUES(auth.uid(),'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',false);
SET ROLE authenticated;
DO $$ BEGIN
  IF public.gx_creator_onboarding_pending() THEN RAISE EXCEPTION 'manager was incorrectly gated'; END IF;
  IF (SELECT count(*) FROM public.portal_secret)<>1 THEN RAISE EXCEPTION 'manager cannot access portal data'; END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',false);
SET ROLE authenticated;
DO $$ BEGIN
  IF public.gx_creator_onboarding_pending() THEN RAISE EXCEPTION 'admin was incorrectly gated'; END IF;
  IF (SELECT count(*) FROM public.portal_secret)<>1 THEN RAISE EXCEPTION 'admin cannot access portal data'; END IF;
END $$;
RESET ROLE;
