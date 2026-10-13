import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'

function simulateUpdateCompany({ existing, updates }) {
  if (existing) {
    if (
      updates.expected_version !== undefined &&
      existing.version !== undefined &&
      Number(updates.expected_version) < Number(existing.version)
    ) {
      return {
        status: 409,
        body: {
          error: 'Conflict: This company was modified by another employee. Please refresh and review before saving.',
          currentRecord: existing,
        }
      }
    }
    const newVersion = (Number(existing.version) || 1) + 1
    const updatedFields = {
      ...updates,
      version: newVersion,
      updated_at: '2026-10-13T12:00:00.000Z',
    }
    delete updatedFields.expected_version
    return {
      status: 200,
      body: { id: existing.id, ...updatedFields }
    }
  }

  const company = {
    id: updates.id || 'test-id',
    ...updates,
    version: 1,
    updated_at: '2026-10-13T12:00:00.000Z',
  }
  delete company.expected_version
  return {
    status: 200,
    body: company
  }
}

describe('Optimistic Concurrency Control (Conflict Detection)', () => {
  it('allows updates when expected_version matches existing version', () => {
    const existing = { id: 'comp-1', name: 'Acme', version: 3 }
    const updates = { name: 'Acme Corp', expected_version: 3 }

    const res = simulateUpdateCompany({ existing, updates })
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.body.name, 'Acme Corp')
    assert.strictEqual(res.body.version, 4)
    assert.strictEqual(res.body.expected_version, undefined)
  })

  it('rejects stale update with 409 Conflict when expected_version is older', () => {
    const existing = { id: 'comp-1', name: 'Acme Corp (Updated by Colleague)', version: 5 }
    // A user submitted an edit based on stale version 4
    const updates = { name: 'Acme Stale Name', expected_version: 4 }

    const res = simulateUpdateCompany({ existing, updates })
    assert.strictEqual(res.status, 409)
    assert.match(res.body.error, /Conflict: This company was modified by another employee/)
    assert.strictEqual(res.body.currentRecord.version, 5)
  })

  it('initializes version 1 on new company creation', () => {
    const updates = { id: 'comp-new', name: 'Brand New Co' }
    const res = simulateUpdateCompany({ existing: null, updates })
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.body.version, 1)
  })
})
