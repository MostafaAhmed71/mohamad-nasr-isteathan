#!/usr/bin/env node
/**
 * Create CLASS_STAFF accounts for every class.
 * Emails: c1@g.com, c2@g.com, ... (sequential by grade then section).
 * Skips classes that already have staff_profile_id (unless --force).
 *
 * Requires:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional:
 *   STAFF_DEFAULT_PASSWORD (default: c123456)
 *   --force   reassign / reset password for existing class emails
 */
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GRADE_LABELS } from './grade-labels.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FORCE = process.argv.includes('--force')

const SECTION_ORDER = { أ: 0, ب: 1, ج: 2, د: 3 }

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
const password = process.env.STAFF_DEFAULT_PASSWORD || 'c123456'

if (!url || !serviceKey) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function credentialsFor(index) {
  const username = `c${index}`
  return { username, email: `${username}@g.com` }
}

function fullNameFor(grade, section) {
  return `شاشة ${GRADE_LABELS[grade] ?? grade} — ${section}`
}

function sortClasses(classes) {
  return [...classes].sort((a, b) => {
    if (a.grade !== b.grade) return a.grade - b.grade
    return (SECTION_ORDER[a.section] ?? 99) - (SECTION_ORDER[b.section] ?? 99)
  })
}

async function findAuthUserByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (found) return found
    if (data.users.length < 200) break
  }
  return null
}

async function ensureStaff({ grade, section, classId, index }) {
  const { username, email } = credentialsFor(index)
  const full_name = fullNameFor(grade, section)

  let user = await findAuthUserByEmail(email)
  let created = false

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'CLASS_STAFF', full_name },
    })
    if (error) throw new Error(`${email}: ${error.message}`)
    user = data.user
    created = true
  } else if (FORCE) {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { role: 'CLASS_STAFF', full_name },
    })
    if (error) throw new Error(`${email} update: ${error.message}`)
  }

  const { error: profileErr } = await admin.from('profiles').upsert({
    id: user.id,
    full_name,
    role: 'CLASS_STAFF',
    username,
    national_id: null,
    phone: null,
    is_active: true,
  })
  if (profileErr) throw new Error(`${email} profile: ${profileErr.message}`)

  await admin.from('classes').update({ staff_profile_id: null }).eq('staff_profile_id', user.id)
  const { error: classErr } = await admin
    .from('classes')
    .update({ staff_profile_id: user.id })
    .eq('id', classId)
  if (classErr) throw new Error(`${email} assign: ${classErr.message}`)

  return {
    grade,
    section,
    classLabel: `الصف ${GRADE_LABELS[grade] ?? grade} — ${section}`,
    username,
    email,
    password,
    status: created ? 'created' : FORCE ? 'updated' : 'existing',
  }
}

async function main() {
  const { data: classes, error } = await admin
    .from('classes')
    .select('id, grade, section, staff_profile_id, is_active')
    .order('grade')
    .order('section')

  if (error) throw error
  if (!classes?.length) {
    console.error('No classes found. Apply migration 001_schema.sql first.')
    process.exit(1)
  }

  const ordered = sortClasses(classes)
  const results = []
  const skipped = []

  for (let i = 0; i < ordered.length; i++) {
    const c = ordered[i]
    const index = i + 1
    if (c.staff_profile_id && !FORCE) {
      skipped.push({
        grade: c.grade,
        section: c.section,
        classLabel: `الصف ${GRADE_LABELS[c.grade] ?? c.grade} — ${c.section}`,
        reason: 'already has staff',
      })
      continue
    }
    try {
      results.push(
        await ensureStaff({
          grade: c.grade,
          section: c.section,
          classId: c.id,
          index,
        }),
      )
      process.stdout.write('.')
    } catch (err) {
      const { username, email } = credentialsFor(index)
      console.error(`\nFailed ${email}:`, err.message || err)
      results.push({
        grade: c.grade,
        section: c.section,
        classLabel: `الصف ${GRADE_LABELS[c.grade] ?? c.grade} — ${c.section}`,
        username,
        email,
        password,
        status: `error: ${err.message || err}`,
      })
    }
  }

  console.log('\n')

  const outPath = resolve(root, 'class-staff-credentials.csv')
  const header = 'class,username,email,password,status'
  const lines = [
    header,
    ...results.map(
      (r) => `"${r.classLabel}",${r.username},${r.email},${r.password},${r.status}`,
    ),
  ]
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')

  console.log(
    `Done. Created/updated: ${results.filter((r) => !String(r.status).startsWith('error')).length}`,
  )
  console.log(`Skipped (already assigned): ${skipped.length}`)
  console.log(`Credentials written to: ${outPath}`)
  console.log('')
  console.log('Login with email + password, e.g.:')
  console.log(`  c1@g.com  /  ${password}`)
  if (!FORCE && skipped.length) {
    console.log('\nTip: pass --force to reset passwords and reassign all classes.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
