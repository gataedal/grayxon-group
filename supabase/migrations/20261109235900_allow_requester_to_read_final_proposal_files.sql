-- Allow the internal requester to open final-proposal files in the private task bucket.
-- The proposal table is already RLS-limited to the requester, assignee and admins;
-- mirror that narrow access at the Storage layer using the exact registered object path.
DROP POLICY IF EXISTS gx_internal_task_proposal_requester_read ON storage.objects;

CREATE POLICY gx_internal_task_proposal_requester_read
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'gx-internal-task-files'
  AND EXISTS (
    SELECT 1
    FROM public.gx_creator_delivery_proposal_files pf
    JOIN public.gx_tasks t ON t.id = pf.task_id
    WHERE pf.object_path = objects.name
      AND t.requester_id = (SELECT auth.uid())
      AND public.gx_is_internal_member()
  )
);
