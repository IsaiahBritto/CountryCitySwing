-- Upper Level lead/follow registration: optional per-role capacity on events,
-- and planned_dance_role on signups when planned_class_level = 'upper_level'.

alter table public.events
  add column if not exists upper_level_lead_capacity integer,
  add column if not exists upper_level_follow_capacity integer;

alter table public.signups
  add column if not exists planned_dance_role text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'signups_planned_dance_role_check'
  ) then
    alter table public.signups
      add constraint signups_planned_dance_role_check
      check (
        planned_dance_role is null
        or planned_dance_role in ('lead', 'follow')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_upper_level_lead_capacity_check'
  ) then
    alter table public.events
      add constraint events_upper_level_lead_capacity_check
      check (
        upper_level_lead_capacity is null
        or upper_level_lead_capacity >= 0
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_upper_level_follow_capacity_check'
  ) then
    alter table public.events
      add constraint events_upper_level_follow_capacity_check
      check (
        upper_level_follow_capacity is null
        or upper_level_follow_capacity >= 0
      );
  end if;
end $$;
