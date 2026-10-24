-- The Academy starts at Year 1. The "Reception" year group seeded in 0018 is
-- removed where nothing is attached to it (classes and children would be set
-- to null by the FK, so we only delete when none reference it, to be safe).
delete from public.year_groups yg
where yg.name = 'Reception'
  and not exists (select 1 from public.children c where c.year_group_id = yg.id)
  and not exists (select 1 from public.classes cl where cl.year_group_id = yg.id);
