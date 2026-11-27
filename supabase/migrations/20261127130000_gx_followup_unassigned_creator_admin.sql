-- Allow administrators to manage follow-up records for creators without an assigned manager.
-- Manager-scoped RLS policies remain unchanged; managers still require current team assignment.
ALTER TABLE public.gx_creator_followup_notes
  ALTER COLUMN manager_id DROP NOT NULL;

ALTER TABLE public.gx_creator_followup_contacts
  ALTER COLUMN manager_id DROP NOT NULL;

ALTER TABLE public.gx_creator_action_plans
  ALTER COLUMN manager_id DROP NOT NULL;

ALTER TABLE public.gx_creator_followup_reminders
  ALTER COLUMN manager_id DROP NOT NULL;

COMMENT ON COLUMN public.gx_creator_followup_notes.manager_id IS
  'Manager responsible for the record; NULL is permitted for administrator-managed creators without an assigned manager.';

COMMENT ON COLUMN public.gx_creator_followup_contacts.manager_id IS
  'Manager responsible for the contact; NULL is permitted for administrator-managed creators without an assigned manager.';

COMMENT ON COLUMN public.gx_creator_action_plans.manager_id IS
  'Manager responsible for the plan; NULL is permitted for administrator-managed creators without an assigned manager.';

COMMENT ON COLUMN public.gx_creator_followup_reminders.manager_id IS
  'Manager responsible for the reminder; NULL is permitted for administrator-managed creators without an assigned manager.';
