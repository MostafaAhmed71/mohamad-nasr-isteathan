-- RLS — خروج

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.permission_requests enable row level security;

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active = true;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'ADMIN' and is_active = true
  );
$$;

create or replace function public.is_gate_officer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'GATE_OFFICER' and is_active = true
  );
$$;

create or replace function public.staff_class_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.classes c
  where c.staff_profile_id = auth.uid() and c.is_active = true
  limit 1;
$$;

-- PROFILES
drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_own_or_admin on public.profiles;
create policy profiles_update_own_or_admin on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists profiles_insert_admin on public.profiles;
drop policy if exists profiles_insert_self_parent_or_admin on public.profiles;
create policy profiles_insert_admin on public.profiles
  for insert to authenticated
  with check (public.is_admin());

-- CLASSES
drop policy if exists classes_select_authenticated on public.classes;
create policy classes_select_authenticated on public.classes
  for select to authenticated
  using (
    public.is_admin()
    or staff_profile_id = auth.uid()
    or public.is_gate_officer()
  );

drop policy if exists classes_admin_write on public.classes;
drop policy if exists classes_admin_all on public.classes;
create policy classes_admin_write on public.classes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- STUDENTS (مناوب البوابة يبحث عبر RPC فقط)
drop policy if exists students_select on public.students;
create policy students_select on public.students
  for select to authenticated
  using (
    public.is_admin()
    or class_id = public.staff_class_id()
  );

drop policy if exists students_admin_write on public.students;
create policy students_admin_write on public.students
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- PERMISSION REQUESTS
drop policy if exists requests_select on public.permission_requests;
create policy requests_select on public.permission_requests
  for select to authenticated
  using (
    class_id = public.staff_class_id()
    or public.is_admin()
    or (public.is_gate_officer() and created_by = auth.uid())
  );

drop policy if exists requests_admin_all on public.permission_requests;
create policy requests_admin_all on public.permission_requests
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Realtime
do $$
begin
  alter publication supabase_realtime add table public.permission_requests;
exception
  when duplicate_object then null;
end $$;
