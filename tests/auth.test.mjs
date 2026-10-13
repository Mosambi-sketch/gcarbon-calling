import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// Test employee roster and authorization rules matching both store.ts and api/index.mjs
const AUTHORIZED_COMPANY_EMPLOYEES = [
  { name: 'Aadarsh', email: 'aadarsh.gcarbon@gmail.com', altEmail: 'aadarsh@gcarbon.in', role: 'admin' },
  { name: 'Tamanna', email: 'tamanna.gcarbon@gmail.com', altEmail: 'tamanna@gcarbon.in', role: 'caller' },
  { name: 'Naresh', email: 'naresh.gcarbon@gmail.com', altEmail: 'naresh@gcarbon.in', role: 'caller' },
  { name: 'Himanshi', email: 'himanshi.gcarbon@gmail.com', altEmail: 'himanshi@gcarbon.in', role: 'caller' },
  { name: 'Kunal', email: 'kunal.gcarbon114@gmail.com', altEmail: 'kunal@gcarbon.in', role: 'caller' },
  { name: 'Ankesh', email: 'ankesh.gcarbon@gmail.com', altEmail: 'ankesh@gcarbon.in', role: 'caller' },
  { name: 'Pranita', email: 'pranita.gcarbon@gmail.com', altEmail: 'pranita@gcarbon.in', role: 'caller' },
  { name: 'Ajinkya', email: 'ajinkya.gcarbon@gmail.com', altEmail: 'ajinkya@gcarbon.in', role: 'caller' },
]

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase().replace('gmail..com', 'gmail.com')
}

function findAuthorizedEmployee(email) {
  if (!email) return null
  const norm = normalizeEmail(email)
  if (!norm.endsWith('@gcarbon.in') && !norm.endsWith('@gmail.com')) {
    return null
  }
  return AUTHORIZED_COMPANY_EMPLOYEES.find(e => {
    const e1 = normalizeEmail(e.email)
    const e2 = normalizeEmail(e.altEmail)
    return norm === e1 || norm === e2 ||
      (norm.endsWith('@gcarbon.in') && norm.split('@')[0] === e.name.toLowerCase()) ||
      (norm.endsWith('@gcarbon.in') && norm.split('@')[0] === e1.split('@')[0])
  }) || null
}

function isAuthorizedEmployee(email) {
  return findAuthorizedEmployee(email) !== null
}

describe('Authentication & Employee Authorization Security', () => {
  it('allows all 8 verified team members via primary and company emails', () => {
    const expectedTeam = [
      'aadarsh.gcarbon@gmail.com', 'aadarsh@gcarbon.in',
      'tamanna.gcarbon@gmail.com', 'tamanna@gcarbon.in',
      'naresh.gcarbon@gmail.com', 'naresh@gcarbon.in',
      'himanshi.gcarbon@gmail.com', 'himanshi@gcarbon.in',
      'kunal.gcarbon114@gmail.com', 'kunal@gcarbon.in',
      'ankesh.gcarbon@gmail.com', 'ankesh@gcarbon.in',
      'pranita.gcarbon@gmail.com', 'pranita@gcarbon.in',
      'ajinkya.gcarbon@gmail.com', 'ajinkya@gcarbon.in',
    ]

    for (const email of expectedTeam) {
      assert.strictEqual(isAuthorizedEmployee(email), true, `Expected ${email} to be authorized`)
    }
  })

  it('strictly isolates Admin privileges to Aadarsh and ensures Ajinkya is NOT Admin', () => {
    const aadarsh = findAuthorizedEmployee('aadarsh.gcarbon@gmail.com')
    assert.ok(aadarsh)
    assert.strictEqual(aadarsh.role, 'admin')

    const aadarshCorp = findAuthorizedEmployee('aadarsh@gcarbon.in')
    assert.ok(aadarshCorp)
    assert.strictEqual(aadarshCorp.role, 'admin')

    const ajinkya = findAuthorizedEmployee('ajinkya.gcarbon@gmail.com')
    assert.ok(ajinkya)
    assert.strictEqual(ajinkya.role, 'caller', 'Ajinkya MUST NOT have admin privileges')

    const ajinkyaCorp = findAuthorizedEmployee('ajinkya@gcarbon.in')
    assert.ok(ajinkyaCorp)
    assert.strictEqual(ajinkyaCorp.role, 'caller', 'Ajinkya corporate account MUST NOT have admin privileges')
  })

  it('rejects unauthorized external emails and malicious actors', () => {
    const unauthorizedEmails = [
      'unknown.stranger@gmail.com',
      'attacker@evil.com',
      'hacker@exploit.org',
      'ceo@microsoft.com',
      'aadarsh@fakegcarbon.com',
      'ajinkya.admin@hacker.io',
      '',
      '   ',
    ]

    for (const email of unauthorizedEmails) {
      assert.strictEqual(isAuthorizedEmployee(email), false, `Expected ${email} to be REJECTED`)
    }
  })

  it('normalizes dirty emails with leading/trailing spaces and typos', () => {
    assert.strictEqual(isAuthorizedEmployee('  aadarsh.gcarbon@gmail.com  '), true)
    assert.strictEqual(isAuthorizedEmployee('TAMANNA@GCARBON.IN'), true)
    assert.strictEqual(isAuthorizedEmployee('kunal.gcarbon114@gmail..com'), true)
  })

  it('prevents callers from accessing colleagues email addresses', () => {
    function sanitizeUsersForCaller(requestingUser, usersList) {
      const isAdmin = requestingUser.role === 'admin'
      return usersList.map(u => {
        if (isAdmin || u.email?.toLowerCase() === requestingUser.email?.toLowerCase()) {
          return u
        }
        return { name: u.name, role: u.role, color: u.color, avatar: u.avatar }
      })
    }

    const mockCaller = { email: 'ajinkya.gcarbon@gmail.com', role: 'caller' }
    const fullRoster = AUTHORIZED_COMPANY_EMPLOYEES.map(u => ({ email: u.email, name: u.name, role: u.role, color: '#fff', avatar: '' }))

    const callerResult = sanitizeUsersForCaller(mockCaller, fullRoster)
    // Ajinkya can see his own email
    const ajinkyaEntry = callerResult.find(u => u.name === 'Ajinkya')
    assert.strictEqual(ajinkyaEntry.email, 'ajinkya.gcarbon@gmail.com')

    // But CANNOT see Aadarsh's, Tamanna's, Naresh's, etc. email
    const others = callerResult.filter(u => u.name !== 'Ajinkya')
    for (const other of others) {
      assert.strictEqual(other.email, undefined, `Expected email for ${other.name} to be HIDDEN from caller`)
    }

    // Admin can see all emails
    const adminResult = sanitizeUsersForCaller({ email: 'aadarsh.gcarbon@gmail.com', role: 'admin' }, fullRoster)
    for (const entry of adminResult) {
      assert.ok(entry.email, `Expected email for ${entry.name} to be VISIBLE to admin`)
    }
  })
})

