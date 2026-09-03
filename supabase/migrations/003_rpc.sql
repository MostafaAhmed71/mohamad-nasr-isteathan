-- RPCs — مناوب البوابة + موافقة الفصل + إعداد المدير

create or replace function public.bootstrap_admin_profile(p_full_name text default 'مدير النظام')
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'غير مصرح';
  end if;

  if exists (select 1 from public.profiles where role = 'ADMIN') then
    raise exception 'يوجد مدير مسبقًا';
  end if;

  insert into public.profiles (id, full_name, role, username, phone, is_active)
  values (
    auth.uid(),
    coalesce(nullif(trim(p_full_name), ''), 'مدير النظام'),
    'ADMIN',
    'admin',
    null,
    true
  )
  on conflict (id) do update
    set role = 'ADMIN',
        full_name = excluded.full_name,
        username = 'admin',
        is_active = true
  returning * into v_profile;

  return v_profile;
end;
$$;

create or replace function public.search_students_for_gate(p_query text)
returns table (
  id uuid,
  full_name text,
  grade integer,
  class_id uuid,
  class_label text,
  has_pending boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_q text;
begin
  if auth.uid() is null or not public.is_gate_officer() then
    raise exception 'غير مصرح';
  end if;

  v_q := trim(p_query);
  if length(v_q) < 2 then
    return;
  end if;

  return query
  select
    s.id,
    s.full_name,
    s.grade,
    s.class_id,
    (s.grade::text || ' ' || c.section) as class_label,
    exists (
      select 1 from public.permission_requests pr
      where pr.student_id = s.id and pr.status = 'PENDING'
    ) as has_pending
  from public.students s
  join public.classes c on c.id = s.class_id and c.is_active = true
  where s.is_active = true
    and s.full_name ilike '%' || v_q || '%'
  order by s.full_name
  limit 20;
end;
$$;

create or replace function public.create_gate_exit_request(p_student_id uuid)
returns public.permission_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students;
  v_request public.permission_requests;
begin
  if auth.uid() is null or not public.is_gate_officer() then
    raise exception 'غير مصرح';
  end if;

  select * into v_student
  from public.students
  where id = p_student_id and is_active = true;

  if not found then
    raise exception 'الطالب غير موجود';
  end if;

  if exists (
    select 1 from public.permission_requests
    where student_id = p_student_id and status = 'PENDING'
  ) then
    raise exception 'يوجد بالفعل طلب خروج قيد الانتظار لهذا الطالب.';
  end if;

  insert into public.permission_requests (
    student_id, class_id, reason, status, created_by, request_source
  ) values (
    v_student.id, v_student.class_id, '', 'PENDING', auth.uid(), 'GATE'
  )
  returning * into v_request;

  return v_request;
end;
$$;

create or replace function public.decide_permission_request(
  p_request_id uuid,
  p_decision text,
  p_rejection_reason text default null
)
returns public.permission_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_id uuid;
  v_request public.permission_requests;
begin
  if auth.uid() is null then
    raise exception 'غير مصرح';
  end if;

  if p_decision not in ('APPROVED', 'REJECTED') then
    raise exception 'قرار غير صالح';
  end if;

  if p_decision = 'REJECTED' and (p_rejection_reason is null or length(trim(p_rejection_reason)) < 2) then
    raise exception 'سبب الرفض مطلوب';
  end if;

  v_class_id := public.staff_class_id();
  if v_class_id is null and not public.is_admin() then
    raise exception 'ليس لديك صلاحية على أي فصل';
  end if;

  select * into v_request
  from public.permission_requests
  where id = p_request_id
    and status = 'PENDING'
    and (class_id = v_class_id or public.is_admin())
  for update;

  if not found then
    raise exception 'الطلب غير موجود أو تمت معالجته';
  end if;

  update public.permission_requests
  set
    status = p_decision,
    rejection_reason = case when p_decision = 'REJECTED' then trim(p_rejection_reason) else null end,
    decided_at = now(),
    decided_by = auth.uid(),
    updated_at = now()
  where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.bootstrap_admin_profile(text) from public;
revoke all on function public.search_students_for_gate(text) from public;
revoke all on function public.create_gate_exit_request(uuid) from public;
revoke all on function public.decide_permission_request(uuid, text, text) from public;

grant execute on function public.bootstrap_admin_profile(text) to authenticated;
grant execute on function public.search_students_for_gate(text) to authenticated;
grant execute on function public.create_gate_exit_request(uuid) to authenticated;
grant execute on function public.decide_permission_request(uuid, text, text) to authenticated;
