export type UserRole = 'GATE_OFFICER' | 'CLASS_STAFF' | 'ADMIN'

export type RequestSource = 'GATE'

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

export interface Profile {
  id: string
  full_name: string
  role: UserRole
  username: string | null
  phone: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SchoolClass {
  id: string
  grade: number
  section: string
  name: string
  staff_profile_id: string | null
  is_active: boolean
  created_at: string
}

export interface Student {
  id: string
  national_id: string
  full_name: string
  grade: number
  class_id: string
  is_active: boolean
  created_at: string
  updated_at: string
  classes?: SchoolClass | null
}

export interface PermissionRequest {
  id: string
  student_id: string
  class_id: string
  reason: string
  status: RequestStatus
  rejection_reason: string | null
  created_by: string | null
  request_source?: RequestSource
  created_at: string
  decided_at: string | null
  decided_by: string | null
  updated_at: string
  students?: Student | null
  gate_officer?: Pick<Profile, 'id' | 'full_name'> | null
  classes?: SchoolClass | null
}

/** Internal grade 1–3 = متوسط، 4–6 = ثانوي (كل مرحلة 3 صفوف × 4 شعب) */
export const GRADE_LABELS: Record<number, string> = {
  1: 'الأول المتوسط',
  2: 'الثاني المتوسط',
  3: 'الثالث المتوسط',
  4: 'الأول الثانوي',
  5: 'الثاني الثانوي',
  6: 'الثالث الثانوي',
}

export const STAGE_LABELS = {
  MIDDLE: 'متوسط',
  SECONDARY: 'ثانوي',
} as const

export const MIDDLE_GRADES = [1, 2, 3] as const
export const SECONDARY_GRADES = [4, 5, 6] as const

export function stageLabelForGrade(grade: number): string {
  return grade <= 3 ? STAGE_LABELS.MIDDLE : STAGE_LABELS.SECONDARY
}

export const STATUS_LABELS: Record<RequestStatus, string> = {
  PENDING: 'قيد الانتظار',
  APPROVED: 'تمت الموافقة',
  REJECTED: 'تم الرفض',
  CANCELLED: 'ملغي',
}

export const SECTIONS = ['أ', 'ب', 'ج', 'د'] as const

export function classLabel(grade: number, section: string): string {
  return `الصف ${GRADE_LABELS[grade] ?? grade} — ${section}`
}

export function formatDateTime(value: string): string {
  try {
    return new Intl.DateTimeFormat('ar-SA', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

/** Map login identifier to Supabase Auth email */
export function authEmailForStaff(username: string): string {
  return `${username.trim().toLowerCase()}@staff.isteathan.local`
}

export function authEmailForGateOfficer(username: string): string {
  return `${username.trim().toLowerCase()}@gate.isteathan.local`
}

export function authEmailForAdmin(username: string): string {
  return `${username.trim().toLowerCase()}@admin.isteathan.local`
}

export function requestOriginLabel(
  request: Pick<PermissionRequest, 'gate_officer'>,
): string {
  return request.gate_officer?.full_name
    ? `البوابة — ${request.gate_officer.full_name}`
    : 'البوابة'
}

export function homePathForRole(role: UserRole): string {
  switch (role) {
    case 'CLASS_STAFF':
      return '/display/class'
    case 'GATE_OFFICER':
      return '/gate'
    case 'ADMIN':
      return '/admin'
  }
}
