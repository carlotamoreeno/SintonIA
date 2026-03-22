create or replace function public.create_conversation_with_first_message(
  p_user_id uuid,
  p_title text,
  p_content text
)
returns table (
  conversation_id uuid,
  message_id uuid,
  title text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  last_message_at timestamptz
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
    last_message_at
  )
  values (
    p_user_id,
    p_title,
    'active',
    now()
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
          messages.created_at
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
