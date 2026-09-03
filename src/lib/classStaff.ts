import { classLabel, type SchoolClass } from './types'

export const CLASS_DEFAULT_PASSWORD = 'c123456'

const SECTION_ORDER: Record<string, number> = { أ: 0, ب: 1, ج: 2, د: 3 }

export function sortClasses(classes: SchoolClass[]): SchoolClass[] {
  return [...classes].sort((a, b) => {
    if (a.grade !== b.grade) return a.grade - b.grade
    return (SECTION_ORDER[a.section] ?? 99) - (SECTION_ORDER[b.section] ?? 99)
  })
}

export function classStaffIndex(classes: SchoolClass[], classId: string): number {
  return sortClasses(classes).findIndex((c) => c.id === classId) + 1
}

export function classStaffLogin(index: number): { username: string; email: string } {
  const username = `c${index}`
  return { username, email: `${username}@g.com` }
}

export function classDisplayName(grade: number, section: string): string {
  return `شاشة ${classLabel(grade, section)}`
}

/** @deprecated use classDisplayName */
export function classStaffName(grade: number, section: string): string {
  return classDisplayName(grade, section)
}

export function loginFromUsername(username: string | null | undefined): string {
  const u = username?.trim()
  if (!u) return ''
  if (u.includes('@')) return u
  if (/^c\d+$/i.test(u)) return `${u.toLowerCase()}@g.com`
  return u
}

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}
