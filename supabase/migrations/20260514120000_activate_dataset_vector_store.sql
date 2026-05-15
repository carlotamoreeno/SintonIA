alter table public.knowledge_vector_store_registry
  add column if not exists is_active boolean not null default false,
  add column if not exists activated_at timestamptz,
  add column if not exists activated_by_user_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'knowledge_vector_store_registry_activated_by_user_id_fkey'
      and conrelid = 'public.knowledge_vector_store_registry'::regclass
  ) then
    alter table public.knowledge_vector_store_registry
      add constraint knowledge_vector_store_registry_activated_by_user_id_fkey
      foreign key (activated_by_user_id)
      references public.users (id)
      on delete set null;
  end if;
end $$;

create unique index if not exists knowledge_vector_store_registry_single_active_idx
  on public.knowledge_vector_store_registry (is_active)
  where is_active;

create index if not exists knowledge_vector_store_registry_activated_by_user_id_idx
  on public.knowledge_vector_store_registry (activated_by_user_id)
  where activated_by_user_id is not null;

create table if not exists public.knowledge_dataset_activation_events (
  id uuid primary key default extensions.gen_random_uuid(),
  previous_dataset_version text,
  previous_vector_store_id text,
  next_dataset_version text not null,
  next_vector_store_id text not null,
  activated_by_user_id uuid,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'knowledge_dataset_activation_events_activated_by_user_id_fkey'
      and conrelid = 'public.knowledge_dataset_activation_events'::regclass
  ) then
    alter table public.knowledge_dataset_activation_events
      add constraint knowledge_dataset_activation_events_activated_by_user_id_fkey
      foreign key (activated_by_user_id)
      references public.users (id)
      on delete set null;
  end if;
end $$;

create index if not exists knowledge_dataset_activation_events_created_at_idx
  on public.knowledge_dataset_activation_events (created_at desc);

create index if not exists knowledge_dataset_activation_events_activated_by_user_id_idx
  on public.knowledge_dataset_activation_events (activated_by_user_id)
  where activated_by_user_id is not null;

alter table public.knowledge_dataset_activation_events enable row level security;

alter table public.conversations
  add column if not exists dataset_version text,
  add column if not exists vector_store_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversations_dataset_vector_store_pair_check'
      and conrelid = 'public.conversations'::regclass
  ) then
    alter table public.conversations
      add constraint conversations_dataset_vector_store_pair_check
      check (
        (dataset_version is null and vector_store_id is null)
        or (dataset_version is not null and vector_store_id is not null)
      );
  end if;
end $$;

create index if not exists conversations_dataset_version_idx
  on public.conversations (dataset_version)
  where dataset_version is not null;

drop function if exists public.create_conversation_with_first_message(uuid, text, text);
drop function if exists public.persist_assistant_message_with_citations(uuid, uuid, text, text, jsonb);
drop function if exists public.persist_chat_exchange_with_citations(uuid, uuid, text, text, text, jsonb);
drop function if exists public.list_conversation_history_for_user(uuid);

create or replace function public.activate_knowledge_dataset(
  p_dataset_version text,
  p_activated_by_user_id uuid default null
)
returns table (
  previous_dataset_version text,
  previous_vector_store_id text,
  active_dataset_version text,
  active_vector_store_id text,
  changed boolean,
  activated_at timestamptz
)
language plpgsql
set search_path = public
as $$
declare
  v_target public.knowledge_vector_store_registry%rowtype;
  v_previous public.knowledge_vector_store_registry%rowtype;
  v_created_at timestamptz := now();
  v_changed boolean := false;
begin
  if p_dataset_version is null or btrim(p_dataset_version) = '' then
    raise exception 'dataset_version is required';
  end if;

  select *
  into v_target
  from public.knowledge_vector_store_registry
  where dataset_version = btrim(p_dataset_version)
  for update;

  if not found then
    raise exception 'No vector store is registered for dataset_version=%.', btrim(p_dataset_version);
  end if;

  select *
  into v_previous
  from public.knowledge_vector_store_registry
  where is_active is true
  order by activated_at desc nulls last, updated_at desc
  limit 1
  for update;

  v_changed := v_previous.id is distinct from v_target.id;

  if v_changed then
    update public.knowledge_vector_store_registry
    set
      is_active = false,
      updated_at = v_created_at
    where is_active is true
      and id <> v_target.id;

    update public.knowledge_vector_store_registry
    set
      is_active = true,
      activated_at = v_created_at,
      activated_by_user_id = p_activated_by_user_id,
      updated_at = v_created_at
    where id = v_target.id
    returning *
    into v_target;
  elsif v_target.activated_at is null then
    update public.knowledge_vector_store_registry
    set
      activated_at = v_created_at,
      activated_by_user_id = coalesce(activated_by_user_id, p_activated_by_user_id),
      updated_at = v_created_at
    where id = v_target.id
    returning *
    into v_target;
  end if;

  insert into public.knowledge_dataset_activation_events (
    previous_dataset_version,
    previous_vector_store_id,
    next_dataset_version,
    next_vector_store_id,
    activated_by_user_id,
    created_at
  )
  values (
    v_previous.dataset_version,
    v_previous.vector_store_id,
    v_target.dataset_version,
    v_target.vector_store_id,
    p_activated_by_user_id,
    v_created_at
  );

  return query
  select
    v_previous.dataset_version,
    v_previous.vector_store_id,
    v_target.dataset_version,
    v_target.vector_store_id,
    v_changed,
    v_target.activated_at;
end;
$$;

create or replace function public.create_conversation_with_first_message(
  p_user_id uuid,
  p_title text,
  p_content text,
  p_dataset_version text default null,
  p_vector_store_id text default null
)
returns table (
  conversation_id uuid,
  message_id uuid,
  title text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  last_message_at timestamptz,
  dataset_version text,
  vector_store_id text
)
language plpgsql
set search_path = public
as $$
declare
  v_conversation public.conversations%rowtype;
  v_message public.messages%rowtype;
begin
  insert into public.conversations (
    user_id,
    title,
    status,
    last_message_at,
    dataset_version,
    vector_store_id
  )
  values (
    p_user_id,
    p_title,
    'active',
    now(),
    p_dataset_version,
    p_vector_store_id
  )
  returning *
  into v_conversation;

  insert into public.messages (
    conversation_id,
    user_id,
    role,
    content,
    created_at
  )
  values (
    v_conversation.id,
    p_user_id,
    'user',
    p_content,
    v_conversation.last_message_at
  )
  returning *
  into v_message;

  update public.conversations
  set
    last_message_at = v_message.created_at,
    updated_at = now()
  where id = v_conversation.id
  returning *
  into v_conversation;

  return query
  select
    v_conversation.id,
    v_message.id,
    v_conversation.title,
    v_conversation.status,
    v_conversation.created_at,
    v_conversation.updated_at,
    v_conversation.last_message_at,
    v_conversation.dataset_version,
    v_conversation.vector_store_id;
end;
$$;

create or replace function public.persist_assistant_message_with_citations(
  p_conversation_id uuid,
  p_user_id uuid,
  p_content text,
  p_provider_message_id text,
  p_citations jsonb default '[]'::jsonb,
  p_dataset_version text default null,
  p_vector_store_id text default null
)
returns table (
  assistant_message_id uuid,
  assistant_created_at timestamptz,
  last_message_at timestamptz,
  dataset_version text,
  vector_store_id text
)
language plpgsql
set search_path = public
as $$
declare
  v_assistant_message public.messages%rowtype;
  v_conversation public.conversations%rowtype;
  v_assistant_created_at timestamptz;
begin
  select *
  into v_conversation
  from public.conversations
  where id = p_conversation_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Conversation % was not found for user %.', p_conversation_id, p_user_id;
  end if;

  v_assistant_created_at := greatest(
    clock_timestamp(),
    coalesce(v_conversation.last_message_at, clock_timestamp()) + interval '1 millisecond'
  );

  insert into public.messages (
    conversation_id,
    user_id,
    role,
    content,
    provider_message_id,
    created_at
  )
  values (
    v_conversation.id,
    p_user_id,
    'assistant',
    p_content,
    p_provider_message_id,
    v_assistant_created_at
  )
  returning *
  into v_assistant_message;

  perform public.insert_message_citations(v_assistant_message.id, p_citations);

  update public.conversations
  set
    dataset_version = coalesce(v_conversation.dataset_version, p_dataset_version),
    vector_store_id = coalesce(v_conversation.vector_store_id, p_vector_store_id),
    last_message_at = v_assistant_message.created_at,
    updated_at = now()
  where id = v_conversation.id
  returning *
  into v_conversation;

  return query
  select
    v_assistant_message.id,
    v_assistant_message.created_at,
    v_conversation.last_message_at,
    v_conversation.dataset_version,
    v_conversation.vector_store_id;
end;
$$;

create or replace function public.persist_chat_exchange_with_citations(
  p_conversation_id uuid,
  p_user_id uuid,
  p_user_content text,
  p_assistant_content text,
  p_assistant_provider_message_id text,
  p_citations jsonb default '[]'::jsonb,
  p_dataset_version text default null,
  p_vector_store_id text default null
)
returns table (
  user_message_id uuid,
  assistant_message_id uuid,
  user_created_at timestamptz,
  assistant_created_at timestamptz,
  last_message_at timestamptz,
  dataset_version text,
  vector_store_id text
)
language plpgsql
set search_path = public
as $$
declare
  v_assistant_created_at timestamptz;
  v_conversation public.conversations%rowtype;
  v_user_message public.messages%rowtype;
  v_assistant_message public.messages%rowtype;
begin
  select *
  into v_conversation
  from public.conversations
  where id = p_conversation_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Conversation % was not found for user %.', p_conversation_id, p_user_id;
  end if;

  insert into public.messages (
    conversation_id,
    user_id,
    role,
    content,
    created_at
  )
  values (
    v_conversation.id,
    p_user_id,
    'user',
    p_user_content,
    greatest(
      clock_timestamp(),
      coalesce(v_conversation.last_message_at, clock_timestamp()) + interval '1 millisecond'
    )
  )
  returning *
  into v_user_message;

  v_assistant_created_at := greatest(
    clock_timestamp(),
    v_user_message.created_at + interval '1 millisecond'
  );

  insert into public.messages (
    conversation_id,
    user_id,
    role,
    content,
    provider_message_id,
    created_at
  )
  values (
    v_conversation.id,
    p_user_id,
    'assistant',
    p_assistant_content,
    p_assistant_provider_message_id,
    v_assistant_created_at
  )
  returning *
  into v_assistant_message;

  perform public.insert_message_citations(v_assistant_message.id, p_citations);

  update public.conversations
  set
    dataset_version = coalesce(v_conversation.dataset_version, p_dataset_version),
    vector_store_id = coalesce(v_conversation.vector_store_id, p_vector_store_id),
    last_message_at = v_assistant_message.created_at,
    updated_at = now()
  where id = v_conversation.id
  returning *
  into v_conversation;

  return query
  select
    v_user_message.id,
    v_assistant_message.id,
    v_user_message.created_at,
    v_assistant_message.created_at,
    v_conversation.last_message_at,
    v_conversation.dataset_version,
    v_conversation.vector_store_id;
end;
$$;

create or replace function public.list_conversation_history_for_user(
  p_user_id uuid
)
returns table (
  conversation_id uuid,
  title text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  last_message_at timestamptz,
  dataset_version text,
  vector_store_id text,
  messages jsonb
)
language sql
stable
set search_path = public
as $$
  select
    conversations.id as conversation_id,
    conversations.title,
    conversations.status,
    conversations.created_at,
    conversations.updated_at,
    conversations.last_message_at,
    conversations.dataset_version,
    conversations.vector_store_id,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',
          messages.id,
          'role',
          messages.role,
          'content',
          messages.content,
          'createdAt',
          messages.created_at,
          'providerMessageId',
          messages.provider_message_id,
          'citations',
          coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'documentId',
                  message_citations.document_id,
                  'documentName',
                  message_citations.document_name,
                  'fileId',
                  message_citations.file_id,
                  'snippet',
                  message_citations.snippet,
                  'vectorStoreId',
                  message_citations.vector_store_id
                )
                order by message_citations.citation_index
              )
              from public.message_citations
              where message_citations.message_id = messages.id
            ),
            '[]'::jsonb
          )
        )
        order by messages.created_at
      ) filter (where messages.id is not null),
      '[]'::jsonb
    ) as messages
  from public.conversations
  left join public.messages
    on messages.conversation_id = conversations.id
  where conversations.user_id = p_user_id
  group by conversations.id
  order by
    conversations.last_message_at desc nulls last,
    conversations.created_at desc;
$$;
