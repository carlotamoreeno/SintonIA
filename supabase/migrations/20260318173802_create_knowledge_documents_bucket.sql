insert into storage.buckets (id, name, public)
values ('knowledge-documents', 'knowledge-documents', false)
on conflict (id) do nothing;
