create table if not exists public.knowledge_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  doc_id text not null,
  title text not null,
  original_filename text not null,
  document_version integer not null,
  status text not null default 'pending',
  canonical_path text not null,
  mime_type text not null,
  sha256 text not null,
  dataset_version text not null,
  openai_file_id text,
  vector_store_id text,
  custom_metadata_json jsonb not null default '{}'::jsonb,
  last_indexed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'knowledge_documents_document_version_check'
      and conrelid = 'public.knowledge_documents'::regclass
  ) then
    alter table public.knowledge_documents
      add constraint knowledge_documents_document_version_check
      check (document_version > 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'knowledge_documents_status_check'
      and conrelid = 'public.knowledge_documents'::regclass
  ) then
    alter table public.knowledge_documents
      add constraint knowledge_documents_status_check
      check (
        status in (
          'pending',
          'uploaded',
          'attached',
          'ready',
          'failed',
          'retired'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'knowledge_documents_canonical_path_key'
      and conrelid = 'public.knowledge_documents'::regclass
  ) then
    alter table public.knowledge_documents
      add constraint knowledge_documents_canonical_path_key
      unique (canonical_path);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'knowledge_documents_dataset_doc_version_key'
      and conrelid = 'public.knowledge_documents'::regclass
  ) then
    alter table public.knowledge_documents
      add constraint knowledge_documents_dataset_doc_version_key
      unique (dataset_version, doc_id, document_version);
  end if;
end $$;

create index if not exists knowledge_documents_doc_id_idx
  on public.knowledge_documents (doc_id);

create index if not exists knowledge_documents_dataset_version_idx
  on public.knowledge_documents (dataset_version);

create index if not exists knowledge_documents_status_idx
  on public.knowledge_documents (status);

create index if not exists knowledge_documents_sha256_idx
  on public.knowledge_documents (sha256);

alter table public.knowledge_documents enable row level security;
