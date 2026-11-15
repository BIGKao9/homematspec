-- Home Material Spec : Supabase setup
-- วางทั้งหมดนี้ใน Supabase > SQL Editor แล้วกด Run ครั้งเดียว
-- (รันซ้ำได้ ไม่ทำให้ข้อมูลเดิมหาย)

-- 1) ตารางเก็บข้อมูล (โครงการ รูป แบบ แชท) แบบเอกสาร
create table if not exists public.docs (
  path       text primary key,            -- เช่น projects/p123 หรือ projects/p123/photos/i456
  parent     text not null,               -- เช่น projects หรือ projects/p123/photos
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists docs_parent_idx on public.docs (parent);

alter table public.docs enable row level security;

-- เว็บนี้ไม่มีระบบล็อกอิน: ทุกคนที่มีลิงก์อ่าน/เขียนได้ (รหัส 4 หลักเป็นแค่ตัวกั้นในหน้าเว็บ)
drop policy if exists "hms docs public read"   on public.docs;
drop policy if exists "hms docs public insert" on public.docs;
drop policy if exists "hms docs public update" on public.docs;
drop policy if exists "hms docs public delete" on public.docs;
create policy "hms docs public read"   on public.docs for select to anon, authenticated using (true);
create policy "hms docs public insert" on public.docs for insert to anon, authenticated with check (true);
create policy "hms docs public update" on public.docs for update to anon, authenticated using (true) with check (true);
create policy "hms docs public delete" on public.docs for delete to anon, authenticated using (true);

-- 2) เปิด Realtime ให้แชทและรายการอัปเดตทันที
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs'
  ) then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;

-- 3) ที่เก็บรูปและไฟล์ PDF (bucket สาธารณะชื่อ hms)
insert into storage.buckets (id, name, public)
values ('hms', 'hms', true)
on conflict (id) do update set public = true;

drop policy if exists "hms files public read"   on storage.objects;
drop policy if exists "hms files public upload" on storage.objects;
drop policy if exists "hms files public delete" on storage.objects;
create policy "hms files public read"   on storage.objects for select to anon, authenticated using (bucket_id = 'hms');
create policy "hms files public upload" on storage.objects for insert to anon, authenticated with check (bucket_id = 'hms');
create policy "hms files public delete" on storage.objects for delete to anon, authenticated using (bucket_id = 'hms');
