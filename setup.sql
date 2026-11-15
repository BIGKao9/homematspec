-- Home Material Spec : Supabase setup
-- วางทั้งหมดนี้ใน Supabase > SQL Editor แล้วกด Run (รันซ้ำได้ ข้อมูลเดิมไม่หาย)

-- 1) ตารางเก็บข้อมูลแบบเอกสาร (โครงการ รูป แบบ แชท)
create table if not exists public.docs (
  path       text primary key,            -- เช่น projects/p123 หรือ projects/p123/photos/i456
  parent     text not null,               -- เช่น projects หรือ projects/p123/photos
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists docs_parent_idx on public.docs (parent);
alter table public.docs enable row level security;

-- เว็บไม่มีระบบล็อกอิน: ทุกคนที่มีลิงก์อ่าน/เขียนได้ (รหัส 4 หลักเป็นตัวกั้นในหน้าเว็บเท่านั้น)
drop policy if exists "hms docs public read"   on public.docs;
drop policy if exists "hms docs public insert" on public.docs;
drop policy if exists "hms docs public update" on public.docs;
drop policy if exists "hms docs public delete" on public.docs;
create policy "hms docs public read"   on public.docs for select to anon, authenticated using (true);
create policy "hms docs public insert" on public.docs for insert to anon, authenticated with check (true);
create policy "hms docs public update" on public.docs for update to anon, authenticated using (true) with check (true);
create policy "hms docs public delete" on public.docs for delete to anon, authenticated using (true);
grant select, insert, update, delete on public.docs to anon, authenticated;

-- 2) เปิด Realtime ให้ทุกเครื่องเห็นข้อมูลใหม่ทันที
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;

-- 3) ที่เก็บรูปและ PDF (bucket สาธารณะชื่อ hms) จำกัด 25 MB ต่อไฟล์ และรับเฉพาะรูป/PDF
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hms', 'hms', true, 26214400, array['image/jpeg','image/png','image/webp','image/gif','application/pdf'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "hms files public read"   on storage.objects;
drop policy if exists "hms files public upload" on storage.objects;
drop policy if exists "hms files public delete" on storage.objects;
create policy "hms files public read"   on storage.objects for select to anon, authenticated using (bucket_id = 'hms');
create policy "hms files public upload" on storage.objects for insert to anon, authenticated with check (bucket_id = 'hms');
create policy "hms files public delete" on storage.objects for delete to anon, authenticated using (bucket_id = 'hms');
