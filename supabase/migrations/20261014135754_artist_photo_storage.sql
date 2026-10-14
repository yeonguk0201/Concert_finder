-- Public, licensed artist photos only. Uploads/deletes use the admin-checked Edge
-- Function with a server-only key. No client INSERT/UPDATE/DELETE policies.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('artist-photos', 'artist-photos', true, 2097152, array['image/png']);
-- Public image URLs do not grant bucket listing. Only administrators can audit.
create policy artist_photos_admin_read on storage.objects for select to authenticated
using (bucket_id = 'artist-photos' and (select private.is_admin()));
