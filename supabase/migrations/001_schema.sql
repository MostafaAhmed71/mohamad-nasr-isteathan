-- خروج — schema (متوسط + ثانوي، مناوبو البوابة)
-- الصفوف 1–3 متوسط، 4–6 ثانوي × شعب أ ب ج د = 24 فصل

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('GATE_OFFICER', 'CLASS_STAFF', 'ADMIN')),
  username text unique,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_identifier_check check (
    (role in ('CLASS_STAFF', 'GATE_OFFICER') and username is not null)
    or (role = 'ADMIN')
  )
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  grade integer not null check (grade between 1 and 6),
  section text not null check (section in ('أ', 'ب', 'ج', 'د')),
  name text not null,
  staff_profile_id uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (grade, section)
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  national_id text unique not null,
  full_name text not null,
  grade integer not null check (grade between 1 and 6),
  class_id uuid not null references public.classes(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permission_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  class_id uuid not null references public.classes(id),
  reason text not null default '',
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  rejection_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  request_source text not null default 'GATE'
    check (request_source in ('GATE')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create unique index if not exists permission_requests_one_pending_per_student
  on public.permission_requests (student_id)
  where status = 'PENDING';

create index if not exists idx_students_class on public.students (class_id);
create index if not exists idx_students_name on public.students (full_name);
create index if not exists idx_requests_class on public.permission_requests (class_id);
create index if not exists idx_requests_created_by on public.permission_requests (created_by);
create index if not exists idx_requests_status on public.permission_requests (status);
create index if not exists idx_requests_created on public.permission_requests (created_at desc);
create index if not exists idx_profiles_username on public.profiles (username);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists students_updated_at on public.students;
create trigger students_updated_at
  before update on public.students
  for each row execute function public.set_updated_at();

drop trigger if exists permission_requests_updated_at on public.permission_requests;
create trigger permission_requests_updated_at
  before update on public.permission_requests
  for each row execute function public.set_updated_at();

alter table public.permission_requests replica identity full;

insert into public.classes (grade, section, name)
select g, s, g::text || ' ' || s
from generate_series(1, 6) as g
cross join (values ('أ'), ('ب'), ('ج'), ('د')) as sections(s)
on conflict (grade, section) do nothing;
