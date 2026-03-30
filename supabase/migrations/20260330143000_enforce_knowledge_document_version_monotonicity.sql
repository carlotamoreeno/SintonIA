create or replace function public.enforce_knowledge_documents_document_version_monotonicity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_max_document_version integer;
begin
  select max(document_version)
  into v_max_document_version
  from public.knowledge_documents
  where doc_id = new.doc_id
    and (
      tg_op <> 'UPDATE'
      or id <> new.id
    );

  if v_max_document_version is not null
    and new.document_version <= v_max_document_version then
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
before insert or update of doc_id, document_version
on public.knowledge_documents
for each row
execute function public.enforce_knowledge_documents_document_version_monotonicity();
