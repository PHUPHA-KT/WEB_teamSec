-- ============================================================
-- ระบบจัดการงานคัดเรื่อง — Supabase setup
-- รันทั้งไฟล์นี้ใน Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================================

-- 1) ตารางเก็บข้อมูล (key-value เดียวกับ API เดิมของแอป)
--    scope = 'global'        -> ข้อมูลรวมของทีม (appdata, last_reset_week)
--    scope = 'u:<user uuid>' -> ค่าส่วนตัวของแต่ละคน (theme, me, auto_today)
create table if not exists public.app_kv (
  scope      text        not null,
  key        text        not null,
  value      text,
  updated_at timestamptz not null default now(),
  primary key (scope, key)
);

-- 2) เปิด RLS: ถ้าไม่มี policy ตรงเงื่อนไข = เข้าถึงไม่ได้เลย
alter table public.app_kv enable row level security;

-- 3) ตัด role anon ออกทั้งหมด — ไม่ล็อกอิน = แตะข้อมูลไม่ได้
revoke all on public.app_kv from anon;
grant select, insert, update on public.app_kv to authenticated;

-- 4) ขอบเขตที่ผู้ใช้แต่ละคนแตะได้: แถวรวมของทีม + แถวส่วนตัวของตัวเองเท่านั้น
create or replace function public.kv_allowed(s text)
returns boolean
language sql
stable
as $$
  select s = 'global' or s = 'u:' || auth.uid()::text;
$$;

-- 5) Policies (ไม่มี policy สำหรับ delete = ลบแถวไม่ได้ กันข้อมูลหายถาวร)
drop policy if exists app_kv_select on public.app_kv;
create policy app_kv_select on public.app_kv
  for select to authenticated
  using (public.kv_allowed(scope));

drop policy if exists app_kv_insert on public.app_kv;
create policy app_kv_insert on public.app_kv
  for insert to authenticated
  with check (public.kv_allowed(scope));

drop policy if exists app_kv_update on public.app_kv;
create policy app_kv_update on public.app_kv
  for update to authenticated
  using (public.kv_allowed(scope))
  with check (public.kv_allowed(scope));

-- ============================================================
-- 6) เปิด Realtime ให้ตาราง app_kv
--    ทีมจะเห็นการแก้ของกันภายใน <1 วิ แทนที่จะรอ poll 12 วิ
--    (RLS ยังบังคับใช้กับ realtime ด้วย — คนไม่ล็อกอินไม่ได้รับ event)
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_kv'
  ) then
    alter publication supabase_realtime add table public.app_kv;
  end if;
end
$$;

-- ============================================================
-- 7) ตั้งชื่อให้แต่ละบัญชี — ใช้แสดงในประวัติแก้ไข และตั้ง "ฉันคือใคร" ให้อัตโนมัติ
--    แก้อีเมลให้ตรงกับที่สร้างไว้ใน Authentication -> Users แล้วรัน
--    (ชื่อต้องเป็น เหนือ / บิ๊ก / ยูตะ / น๊อต เป๊ะ ถึงจะจับคู่กับคนในทีมได้)
-- ============================================================
update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"name":"เหนือ"}' where email = 'nuea@example.com';
update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"name":"บิ๊ก"}'  where email = 'big@example.com';
update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"name":"ยูตะ"}'  where email = 'yuta@example.com';
update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"name":"น๊อต"}'  where email = 'not@example.com';

-- เช็คว่าตั้งครบ:
-- select email, raw_user_meta_data->>'name' as name from auth.users order by email;
