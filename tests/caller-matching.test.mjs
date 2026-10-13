import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'

function matchCaller(raw) {
  if (!raw || !raw.trim()) return 'Unknown'
  const r = raw.trim().toLowerCase()
  const team = ['aadarsh', 'ajinkya', 'himanshi', 'tamanna', 'kunal', 'ankesh', 'naresh', 'pranita']
  for (const member of team) {
    if (r.includes(member)) return member.charAt(0).toUpperCase() + member.slice(1)
  }
  return raw.trim()
}

describe('Caller Matching Logic', () => {
  it('correctly maps all 8 team members by name', () => {
    const team = [
      { input: 'Aadarsh', expected: 'Aadarsh' },
      { input: 'aadarsh', expected: 'Aadarsh' },
      { input: 'Ajinkya', expected: 'Ajinkya' },
      { input: 'ajinkya patil', expected: 'Ajinkya' },
      { input: 'Himanshi', expected: 'Himanshi' },
      { input: 'himanshi sharma', expected: 'Himanshi' },
      { input: 'Tamanna', expected: 'Tamanna' },
      { input: 'tamanna gcarbon', expected: 'Tamanna' },
      { input: 'Kunal', expected: 'Kunal' },
      { input: 'kunal-114', expected: 'Kunal' },
      { input: 'Ankesh', expected: 'Ankesh' },
      { input: 'ankesh team', expected: 'Ankesh' },
      { input: 'Naresh', expected: 'Naresh' },
      { input: 'naresh caller', expected: 'Naresh' },
      { input: 'Pranita', expected: 'Pranita' },
      { input: 'pranita g', expected: 'Pranita' },
    ]

    for (const { input, expected } of team) {
      assert.strictEqual(matchCaller(input), expected, `Failed for input: ${input}`)
    }
  })

  it('handles empty or missing caller values gracefully', () => {
    assert.strictEqual(matchCaller(undefined), 'Unknown')
    assert.strictEqual(matchCaller(''), 'Unknown')
    assert.strictEqual(matchCaller('   '), 'Unknown')
  })

  it('preserves unrecognized external caller names without crash', () => {
    assert.strictEqual(matchCaller('Special Guest Caller'), 'Special Guest Caller')
  })
})
