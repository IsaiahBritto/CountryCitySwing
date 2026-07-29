-- Class-only "All Three Classes" registration option.
-- When events.all_three_classes is true, signups must include planned_class_level.

alter table public.events
  add column if not exists all_three_classes boolean not null default false;

alter table public.signups
  add column if not exists planned_class_level text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'signups_planned_class_level_check'
  ) then
    alter table public.signups
      add constraint signups_planned_class_level_check
      check (
        planned_class_level is null
        or planned_class_level in ('beginner_side', 'lower_level', 'upper_level')
      );
  end if;
end $$;
