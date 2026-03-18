create table if not exists public.users (
  id uuid primary key default extensions.gen_random_uuid(),
  auth_provider text not null,
  auth_subject text not null,
  email text,
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_auth_provider_auth_subject_key'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_auth_provider_auth_subject_key
      unique (auth_provider, auth_subject);
  end if;
end $$;

create index if not exists users_email_lookup_idx
  on public.users (lower(email))
  where email is not null;

create table if not exists public.profiles (
  user_id uuid primary key,
  display_name text,
  avatar_url text,
  locale text,
  timezone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_user_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_user_id_fkey
      foreign key (user_id)
      references public.users (id)
      on delete cascade;
  end if;
end $$;

create table if not exists public.conversations (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null,
  title text,
  status text not null default 'active',
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversations_user_id_fkey'
      and conrelid = 'public.conversations'::regclass
  ) then
    alter table public.conversations
      add constraint conversations_user_id_fkey
      foreign key (user_id)
      references public.users (id)
      on delete cascade;
  end if;
end $$;

create index if not exists conversations_user_id_last_message_idx
  on public.conversations (user_id, last_message_at desc nulls last);

create table if not exists public.messages (
  id uuid primary key default extensions.gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_conversation_id_fkey'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_conversation_id_fkey
      foreign key (conversation_id)
      references public.conversations (id)
      on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_user_id_fkey'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_user_id_fkey
      foreign key (user_id)
      references public.users (id)
      on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_role_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_role_check
      check (role in ('user', 'assistant', 'system'));
  end if;
end $$;

create index if not exists messages_conversation_created_at_idx
  on public.messages (conversation_id, created_at);

create index if not exists messages_user_id_idx
  on public.messages (user_id);

create table if not exists public.consents (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null,
  consent_type text not null,
  status text not null,
  granted_at timestamptz,
  revoked_at timestamptz,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'consents_user_id_fkey'
      and conrelid = 'public.consents'::regclass
  ) then
    alter table public.consents
      add constraint consents_user_id_fkey
      foreign key (user_id)
      references public.users (id)
      on delete cascade;
  end if;
end $$;

create index if not exists consents_user_id_type_idx
  on public.consents (user_id, consent_type);

create table if not exists public.roles (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null,
  label text not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'roles_code_key'
      and conrelid = 'public.roles'::regclass
  ) then
    alter table public.roles
      add constraint roles_code_key
      unique (code);
  end if;
end $$;

insert into public.roles (code, label)
values
  ('user', 'User'),
  ('expert', 'Expert'),
  ('admin', 'Admin')
on conflict (code) do update
set label = excluded.label;

create table if not exists public.user_roles (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null,
  role_id uuid not null,
  granted_at timestamptz not null default now(),
  granted_by uuid
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_roles_user_id_fkey'
      and conrelid = 'public.user_roles'::regclass
  ) then
    alter table public.user_roles
      add constraint user_roles_user_id_fkey
      foreign key (user_id)
      references public.users (id)
      on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_roles_role_id_fkey'
      and conrelid = 'public.user_roles'::regclass
  ) then
    alter table public.user_roles
      add constraint user_roles_role_id_fkey
      foreign key (role_id)
      references public.roles (id)
      on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_roles_granted_by_fkey'
      and conrelid = 'public.user_roles'::regclass
  ) then
    alter table public.user_roles
      add constraint user_roles_granted_by_fkey
      foreign key (granted_by)
      references public.users (id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_roles_user_id_role_id_key'
      and conrelid = 'public.user_roles'::regclass
  ) then
    alter table public.user_roles
      add constraint user_roles_user_id_role_id_key
      unique (user_id, role_id);
  end if;
end $$;

create index if not exists user_roles_user_id_idx
  on public.user_roles (user_id);

create index if not exists user_roles_role_id_idx
  on public.user_roles (role_id);

create index if not exists user_roles_granted_by_idx
  on public.user_roles (granted_by)
  where granted_by is not null;

alter table public.users enable row level security;
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.consents enable row level security;
alter table public.roles enable row level security;
alter table public.user_roles enable row level security;
