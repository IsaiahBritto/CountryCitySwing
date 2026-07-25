-- Optional per-event refund policy text. When set, signups must acknowledge it.
alter table public.events
  add column if not exists refund_statement text;
