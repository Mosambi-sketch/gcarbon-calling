import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'

function sanitizeCellValue(val) {
  if (val === null || val === undefined) return ''
  const str = String(val)
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`
  }
  return str
}

describe('Excel Formula Injection Sanitization', () => {
  it('escapes formulas starting with equals (=)', () => {
    assert.strictEqual(sanitizeCellValue('=1+1'), "'=1+1")
    assert.strictEqual(sanitizeCellValue('=cmd|"/C calc"!A0'), "'=cmd|\"/C calc\"!A0")
    assert.strictEqual(sanitizeCellValue('=SUM(A1:A10)'), "'=SUM(A1:A10)")
  })

  it('escapes formulas starting with plus (+)', () => {
    assert.strictEqual(sanitizeCellValue('+123'), "'+123")
    assert.strictEqual(sanitizeCellValue('+cmd|"/C notepad"!A0'), "'+cmd|\"/C notepad\"!A0")
  })

  it('escapes values starting with minus (-)', () => {
    assert.strictEqual(sanitizeCellValue('-500'), "'-500")
    assert.strictEqual(sanitizeCellValue('-2+3'), "'-2+3")
  })

  it('escapes values starting with at-symbol (@)', () => {
    assert.strictEqual(sanitizeCellValue('@SUM(A1:A10)'), "'@SUM(A1:A10)")
  })

  it('escapes tab and carriage return control characters', () => {
    assert.strictEqual(sanitizeCellValue('\tcmd'), "'\tcmd")
    assert.strictEqual(sanitizeCellValue('\rcmd'), "'\rcmd")
  })

  it('leaves safe alphanumeric strings and symbols untouched', () => {
    assert.strictEqual(sanitizeCellValue('Gcarbon Technologies'), 'Gcarbon Technologies')
    assert.strictEqual(sanitizeCellValue('test@gcarbon.in'), 'test@gcarbon.in')
    assert.strictEqual(sanitizeCellValue('9876543210'), '9876543210')
    assert.strictEqual(sanitizeCellValue(''), '')
  })

  it('safely handles null and undefined values', () => {
    assert.strictEqual(sanitizeCellValue(null), '')
    assert.strictEqual(sanitizeCellValue(undefined), '')
  })
})
