create table if not exists public.knowledge_vector_store_registry (
  id uuid primary key default extensions.gen_random_uuid(),
  dataset_version text not null,
  vector_store_id text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'knowledge_vector_store_registry_dataset_version_key'
      and conrelid = 'public.knowledge_vector_store_registry'::regclass
  ) then
    alter table public.knowledge_vector_store_registry
      add constraint knowledge_vector_store_registry_dataset_version_key
      unique (dataset_version);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'knowledge_vector_store_registry_vector_store_id_key'
      and conrelid = 'public.knowledge_vector_store_registry'::regclass
  ) then
    alter table public.knowledge_vector_store_registry
      add constraint knowledge_vector_store_registry_vector_store_id_key
      unique (vector_store_id);
  end if;
end $$;

alter table public.knowledge_vector_store_registry enable row level security;
