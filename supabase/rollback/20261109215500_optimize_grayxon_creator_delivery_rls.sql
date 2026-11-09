-- Rollback only the performance optimization, preserving the delivery feature.
drop index if exists public.gx_creator_deliveries_task_idx;
drop index if exists public.gx_creator_deliveries_request_idx;
drop index if exists public.gx_creator_deliveries_requester_idx;
drop index if exists public.gx_creator_deliveries_assignee_idx;
-- The prior policies are restored by reapplying the original policy definitions in
-- 20261109212806_grayxon_creator_delivery_approval_flow.sql if a rollback is needed.