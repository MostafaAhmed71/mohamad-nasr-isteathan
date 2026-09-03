#!/usr/bin/env node
/**
 * Seed demo auth users + profiles + students + sample requests.
 * Requires:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnv() {
  const envPath = resolve(root, '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    const key = m[1].trim()
    const val = m[2].trim()
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv()

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function ensureUser({ email, password, profile, classAssign }) {
  const list = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  let user = list.data.users.find((u) => u.email === email)
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error) throw error
    user = data.user
  }

  const { error: upsertErr } = await admin.from('profiles').upsert({
    id: user.id,
    ...profile,
    is_active: true,
  })
  if (upsertErr) throw upsertErr

  if (classAssign) {
    await admin.from('classes').update({ staff_profile_id: null }).eq('staff_profile_id', user.id)
    const { error } = await admin
      .from('classes')
      .update({ staff_profile_id: user.id })
      .eq('grade', classAssign.grade)
      .eq('section', classAssign.section)
    if (error) throw error
  }

  return user
}

async function main() {
  const adminUser = await ensureUser({
    email: 'admin@admin.isteathan.local',
    password: 'Admin123!',
    profile: {
      full_name: 'مدير المدرسة',
      role: 'ADMIN',
      username: 'admin',
      phone: null,
    },
  })

  const { data: allClasses, error: allClassErr } = await admin.from('classes').select('*').order('grade').order('section')
  if (allClassErr) throw allClassErr
  const classIndex = (grade, section) =>
    allClasses.findIndex((c) => c.grade === grade && c.section === section) + 1

  const displayUsers = []
  for (const s of [
    { grade: 1, section: 'أ', name: 'شاشة الأول المتوسط أ' },
    { grade: 3, section: 'ب', name: 'شاشة الثالث المتوسط ب' },
    { grade: 5, section: 'أ', name: 'شاشة الثاني الثانوي أ' },
  ]) {
    const idx = classIndex(s.grade, s.section)
    const username = `c${idx}`
    displayUsers.push(
      await ensureUser({
        email: `${username}@g.com`,
        password: 'c123456',
        profile: {
          full_name: s.name,
          role: 'CLASS_STAFF',
          username,
          phone: null,
        },
        classAssign: { grade: s.grade, section: s.section },
      }),
    )
  }

  const gate1 = await ensureUser({
    email: 'gate1@gate.isteathan.local',
    password: 'Gate123!',
    profile: {
      full_name: 'مناوب البوابة — أ',
      role: 'GATE_OFFICER',
      username: 'gate1',
      phone: null,
    },
  })

  await ensureUser({
    email: 'gate2@gate.isteathan.local',
    password: 'Gate123!',
    profile: {
      full_name: 'مناوب البوابة — ب',
      role: 'GATE_OFFICER',
      username: 'gate2',
      phone: null,
    },
  })

  const { data: classes, error: classErr } = await admin.from('classes').select('*')
  if (classErr) throw classErr
  const findClass = (grade, section) => classes.find((c) => c.grade === grade && c.section === section)

  const studentDefs = [
    { national_id: '2000000001', full_name: 'أحمد محمد', grade: 3, section: 'ب' },
    { national_id: '2000000002', full_name: 'خالد محمد', grade: 5, section: 'أ' },
    { national_id: '2000000003', full_name: 'نورة سارة', grade: 1, section: 'أ' },
  ]

  for (const s of studentDefs) {
    const c = findClass(s.grade, s.section)
    if (!c) throw new Error(`Missing class ${s.grade}${s.section}`)
    const { error } = await admin.from('students').upsert(
      {
        national_id: s.national_id,
        full_name: s.full_name,
        grade: s.grade,
        class_id: c.id,
        is_active: true,
      },
      { onConflict: 'national_id' },
    )
    if (error) throw error
  }

  const { data: students } = await admin.from('students').select('*')
  const ahmed = students.find((s) => s.national_id === '2000000001')
  const khaled = students.find((s) => s.national_id === '2000000002')
  const noura = students.find((s) => s.national_id === '2000000003')

  await admin.from('permission_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  const samples = [
    {
      student_id: ahmed.id,
      class_id: ahmed.class_id,
      reason: '',
      status: 'PENDING',
      created_by: gate1.id,
      request_source: 'GATE',
    },
    {
      student_id: khaled.id,
      class_id: khaled.class_id,
      reason: '',
      status: 'APPROVED',
      created_by: gate1.id,
      request_source: 'GATE',
      decided_at: new Date().toISOString(),
      decided_by: displayUsers[2].id,
    },
    {
      student_id: noura.id,
      class_id: noura.class_id,
      reason: '',
      status: 'REJECTED',
      created_by: gate1.id,
      request_source: 'GATE',
      rejection_reason: 'الطلب خارج وقت الدوام',
      decided_at: new Date().toISOString(),
      decided_by: displayUsers[0].id,
    },
  ]

  const { error: reqErr } = await admin.from('permission_requests').insert(samples)
  if (reqErr) throw reqErr

  console.log('Seed complete.')
  console.log('Admin: admin@admin.isteathan.local / Admin123!')
  console.log('Gate: gate1@gate.isteathan.local / Gate123!')
  console.log('Display: c1@g.com … c24@g.com / c123456')
  console.log('Admin user id:', adminUser.id)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
