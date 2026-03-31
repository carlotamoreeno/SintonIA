create table if not exists public.chat_rate_limits (
  user_id uuid not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, window_start),
  constraint chat_rate_limits_request_count_check check (request_count >= 0)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chat_rate_limits_user_id_fkey'
      and conrelid = 'public.chat_rate_limits'::regclass
  ) then
    alter table public.chat_rate_limits
      add constraint chat_rate_limits_user_id_fkey
      foreign key (user_id)
      references public.users (id)
      on delete cascade;
  end if;
end $$;

create index if not exists chat_rate_limits_window_start_idx
  on public.chat_rate_limits (window_start);

alter table public.chat_rate_limits enable row level security;

create or replace function public.consume_chat_rate_limit(
  p_user_id uuid,
  p_limit integer,
  p_now timestamptz default now()
)
returns table (
  allowed boolean,
  remaining integer,
  request_count integer,
  window_start timestamptz
)
language plpgsql
as $$
declare
  v_request_count integer;
  v_window_start timestamptz := (
    date_trunc('minute', p_now at time zone 'UTC') at time zone 'UTC'
  );
begin
  if p_limit <= 0 then
    raise exception 'Chat rate limit must be positive.'
      using errcode = '22023';
  end if;

  insert into public.chat_rate_limits (
    user_id,
    window_start,
    request_count,
    created_at,
    updated_at
  )
  values (
    p_user_id,
    v_window_start,
    1,
    now(),
    now()
  )
  on conflict do nothing
  returning chat_rate_limits.request_count
  into v_request_count;

  if found then
    return query
    select true, greatest(p_limit - v_request_count, 0), v_request_count, v_window_start;
    return;
  end if;

  update public.chat_rate_limits
  set request_count = chat_rate_limits.request_count + 1,
      updated_at = now()
  where chat_rate_limits.user_id = p_user_id
    and chat_rate_limits.window_start = v_window_start
    and chat_rate_limits.request_count < p_limit
  returning chat_rate_limits.request_count
  into v_request_count;

  if found then
    return query
    select true, greatest(p_limit - v_request_count, 0), v_request_count, v_window_start;
    return;
  end if;

  select chat_rate_limits.request_count
    into v_request_count
  from public.chat_rate_limits
  where chat_rate_limits.user_id = p_user_id
    and chat_rate_limits.window_start = v_window_start;

  return query
  select false, 0, coalesce(v_request_count, p_limit), v_window_start;
end;
$$;
