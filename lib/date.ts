// Indian Standard Time (IST, UTC+5:30) Date Utilities
// Prevents midnight UTC rollover bugs where dates before 5:30 AM IST show as yesterday.

export const TIMEZONE_IST = 'Asia/Kolkata'

/**
 * Returns YYYY-MM-DD formatted date string in Indian Standard Time (Asia/Kolkata).
 */
export function getISTDateStr(date: Date | string | number = new Date()): string {
  try {
    const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
    if (isNaN(d.getTime())) return ''
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE_IST,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d)
  } catch {
    // Fallback if Intl fails
    const now = new Date()
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000)
    const ist = new Date(utc + (3600000 * 5.5))
    const y = ist.getFullYear()
    const m = String(ist.getMonth() + 1).padStart(2, '0')
    const day = String(ist.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
}

/**
 * Adds N days to a date and returns YYYY-MM-DD in IST.
 */
export function addDaysIST(days: number, fromDate: Date | string | number = new Date()): string {
  const base = typeof fromDate === 'string' 
    ? new Date(fromDate.includes('T') ? fromDate : `${fromDate}T12:00:00+05:30`) 
    : typeof fromDate === 'number' ? new Date(fromDate) : fromDate
  const target = new Date(base.getTime() + days * 86400000)
  return getISTDateStr(target)
}

/**
 * Checks if a given YYYY-MM-DD string is today in IST.
 */
export function isTodayIST(dateStr?: string): boolean {
  if (!dateStr) return false
  const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr
  return clean === getISTDateStr()
}

/**
 * Checks if a given YYYY-MM-DD string is strictly before today in IST.
 */
export function isPastIST(dateStr?: string): boolean {
  if (!dateStr) return false
  const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr
  return clean < getISTDateStr()
}

/**
 * Checks if a given YYYY-MM-DD string is due today or overdue in IST.
 */
export function isDueOrOverdueIST(dateStr?: string): boolean {
  if (!dateStr) return false
  const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr
  return clean <= getISTDateStr()
}

/**
 * Formats a YYYY-MM-DD date into friendly relative text like "Today", "Tomorrow", "Yesterday", or "DD MMM".
 */
export function formatFriendlyDate(dateStr?: string): string {
  if (!dateStr) return '—'
  const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr
  const today = getISTDateStr()
  const tomorrow = addDaysIST(1)
  const yesterday = addDaysIST(-1)

  if (clean === today) return 'Today'
  if (clean === tomorrow) return 'Tomorrow'
  if (clean === yesterday) return 'Yesterday'

  try {
    const parts = clean.split('-')
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10)
      const monthIdx = parseInt(parts[1], 10) - 1
      const day = parseInt(parts[2], 10)
      const d = new Date(year, monthIdx, day)
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: TIMEZONE_IST,
        day: 'numeric',
        month: 'short',
        year: year !== new Date().getFullYear() ? 'numeric' : undefined,
      }).format(d)
    }
  } catch {
    // fallback
  }
  return clean
}
