alter table public.messages
  add column if not exists provider_message_id text;

create unique index if not exists messages_provider_message_id_unique_idx
  on public.messages (provider_message_id)
  where provider_message_id is not null;

create table if not exists public.message_citations (
  id uuid primary key default extensions.gen_random_uuid(),
  message_id uuid not null,
  citation_index integer not null,
  document_id text not null,
  document_name text not null,
  snippet text not null,
  file_id text not null,
  vector_store_id text not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'message_citations_message_id_fkey'
      and conrelid = 'public.message_citations'::regclass
  ) then
    alter table public.message_citations
      add constraint message_citations_message_id_fkey
      foreign key (message_id)
      references public.messages (id)
      on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'message_citations_citation_index_check'
      and conrelid = 'public.message_citations'::regclass
  ) then
    alter table public.message_citations
      add constraint message_citations_citation_index_check
      check (citation_index >= 0);
  end if;
end $$;

create unique index if not exists message_citations_message_id_citation_index_idx
  on public.message_citations (message_id, citation_index);

alter table public.message_citations enable row level security;

create or replace function public.insert_message_citations(
  p_message_id uuid,
  p_citations jsonb default '[]'::jsonb
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if jsonb_typeof(coalesce(p_citations, '[]'::jsonb)) <> 'array' then
    raise exception 'p_citations must be a JSON array';
  end if;

  insert into public.message_citations (
    message_id,
    citation_index,
    document_id,
    document_name,
    snippet,
    file_id,
    vector_store_id
  )
  select
    p_message_id,
    citations.ordinality - 1,
    citations.value ->> 'documentId',
    citations.value ->> 'documentName',
    citations.value ->> 'snippet',
    citations.value ->> 'fileId',
    citations.value ->> 'vectorStoreId'
  from jsonb_array_elements(coalesce(p_citations, '[]'::jsonb)) with ordinality as citations(value, ordinality);
end;
$$;

create or replace function public.persist_assistant_message_with_citations(
  p_conversation_id uuid,
  p_user_id uuid,
  p_content text,
  p_provider_message_id text,
  p_citations jsonb default '[]'::jsonb
)
returns table (
  assistant_message_id uuid,
  assistant_created_at timestamptz,
  last_message_at timestamptz
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
    last_message_at = v_assistant_message.created_at,
    updated_at = now()
  where id = v_conversation.id
  returning *
  into v_conversation;

  return query
  select
    v_assistant_message.id,
    v_assistant_message.created_at,
    v_conversation.last_message_at;
end;
$$;

create or replace function public.persist_chat_exchange_with_citations(
  p_conversation_id uuid,
  p_user_id uuid,
  p_user_content text,
  p_assistant_content text,
  p_assistant_provider_message_id text,
  p_citations jsonb default '[]'::jsonb
)
returns table (
  user_message_id uuid,
  assistant_message_id uuid,
  user_created_at timestamptz,
  assistant_created_at timestamptz,
  last_message_at timestamptz
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
    v_conversation.last_message_at;
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
