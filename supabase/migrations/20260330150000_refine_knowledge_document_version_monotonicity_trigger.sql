create or replace function public.enforce_knowledge_documents_document_version_monotonicity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_max_document_version integer;
  v_duplicate_version_exists boolean;
  v_duplicate_tuple_exists boolean;
begin
  select exists (
    select 1
    from public.knowledge_documents
    where doc_id = new.doc_id
      and dataset_version = new.dataset_version
      and document_version = new.document_version
      and (
        tg_op <> 'UPDATE'
        or id <> new.id
      )
  )
  into v_duplicate_tuple_exists;

  if not v_duplicate_tuple_exists then
    select exists (
      select 1
      from public.knowledge_documents
      where doc_id = new.doc_id
        and document_version = new.document_version
        and (
          tg_op <> 'UPDATE'
          or id <> new.id
        )
    )
    into v_duplicate_version_exists;

    if v_duplicate_version_exists then
      raise exception
        using
          errcode = '23514',
          message = 'knowledge_documents.document_version must be strictly increasing per doc_id',
          detail = format(
            'doc_id=%s already has document_version=%s',
            new.doc_id,
            new.document_version
          );
    end if;
  end if;

  select max(document_version)
  into v_max_document_version
  from public.knowledge_documents
  where doc_id = new.doc_id
    and (
      tg_op <> 'UPDATE'
      or id <> new.id
    );

  if v_max_document_version is not null
    and new.document_version < v_max_document_version then
    raise exception
      using
        errcode = '23514',
        message = 'knowledge_documents.document_version must be strictly increasing per doc_id',
        detail = format(
          'doc_id=%s already has max(document_version)=%s, attempted document_version=%s',
          new.doc_id,
          v_max_document_version,
          new.document_version
        );
  end if;

  return new;
end;
$$;

drop trigger if exists knowledge_documents_document_version_monotonicity_trigger
on public.knowledge_documents;

create trigger knowledge_documents_document_version_monotonicity_trigger
before insert or update of doc_id, dataset_version, document_version
on public.knowledge_documents
for each row
execute function public.enforce_knowledge_documents_document_version_monotonicity();
