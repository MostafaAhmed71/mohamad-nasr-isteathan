/** Fold Arabic/Latin text for tolerant grade matching in import files. */
export function foldGradeText(raw: string): string {
  return String(raw ?? '')
    .replace(/^\uFEFF/, '')
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[_./\\|:;،,-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

const GRADE_FROM_LABEL: Record<string, number> = {
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  // — متوسط —
  'الاول متوسط': 1,
  'اول متوسط': 1,
  'الأول المتوسط': 1,
  'الاول المتوسط': 1,
  'الثاني المتوسط': 2,
  'ثاني متوسط': 2,
  'الثالث المتوسط': 3,
  'ثالث متوسط': 3,
  'الصف الاول متوسط': 1,
  'الصف الأول متوسط': 1,
  'الصف الثاني متوسط': 2,
  'الصف الثالث متوسط': 3,
  // — ثانوي —
  'الاول ثانوي': 4,
  'اول ثانوي': 4,
  'الأول الثانوي': 4,
  'الاول الثانوي': 4,
  'الثاني الثانوي': 5,
  'ثاني ثانوي': 5,
  'الثالث الثانوي': 6,
  'ثالث ثانوي': 6,
  'الصف الاول ثانوي': 4,
  'الصف الأول ثانوي': 4,
  'الصف الثاني ثانوي': 5,
  'الصف الثالث ثانوي': 6,
  // — ابتدائي (تر compat للملفات القديمة) —
  'الأول الابتدائي': 1,
  'الاول الابتدائي': 1,
  'الثاني الابتدائي': 2,
  'الثالث الابتدائي': 3,
  'الرابع الابتدائي': 4,
  'الخامس الابتدائي': 5,
  'السادس الابتدائي': 6,
}

const MIDDLE_ORDINALS: Array<{ needle: string; grade: number }> = [
  { needle: 'ثالث', grade: 3 },
  { needle: 'ثاني', grade: 2 },
  { needle: 'اول', grade: 1 },
]

const LEGACY_ORDINALS: Array<{ needle: string; grade: number }> = [
  { needle: 'سادس', grade: 6 },
  { needle: 'خامس', grade: 5 },
  { needle: 'رابع', grade: 4 },
  ...MIDDLE_ORDINALS,
]

export function parseGradeFromText(raw: string): number | null {
  const value = String(raw ?? '').trim()
  if (!value) return null

  if (GRADE_FROM_LABEL[value] != null) return GRADE_FROM_LABEL[value]

  const folded = foldGradeText(value)
  if (!folded) return null
  if (GRADE_FROM_LABEL[folded] != null) return GRADE_FROM_LABEL[folded]

  const isSecondary = folded.includes('ثانوي') || folded.includes('ثانو')
  const isMiddle = folded.includes('متوسط')
  const isLegacyPrimary = folded.includes('ابتدائي')

  const digitMatch = folded.match(/(?:^|[^\d])([1-6])(?:[^\d]|$)/)
  if (digitMatch) {
    const n = Number(digitMatch[1])
    if (isSecondary && n >= 1 && n <= 3) return n + 3
    if (isMiddle && n >= 1 && n <= 3) return n
    return n
  }

  if (isSecondary) {
    for (const { needle, grade } of MIDDLE_ORDINALS) {
      if (folded.includes(needle)) return grade + 3
    }
  }

  if (isMiddle) {
    for (const { needle, grade } of MIDDLE_ORDINALS) {
      if (folded.includes(needle)) return grade
    }
  }

  if (isLegacyPrimary) {
    for (const { needle, grade } of LEGACY_ORDINALS) {
      if (folded.includes(needle)) return grade
    }
  }

  for (const { needle, grade } of MIDDLE_ORDINALS) {
    if (folded.includes(needle)) return grade
  }

  return null
}
