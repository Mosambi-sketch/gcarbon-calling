import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const STATUS_MAP = {
  'Not Called': 'Not Called',
  'Not Picked': 'Attempted',
  'Not Reachable / Out of Service': 'Attempted',
  'Invalid Number': 'Dead',
  'Wrong Person / Left Firm': 'Attempted',
  'Call Back Later': 'Follow-up Due',
  'Connected - Interested': 'Interested',
  'Meeting Scheduled': 'Meeting Scheduled',
  'Profile / Mail Sent': 'Follow-up Due',
  'Not Interested': 'Lost',
  'Already Handled Internally': 'Lost',
}

function computeStatusFromOutcome(outcome) {
  return STATUS_MAP[outcome] || 'Attempted'
}

describe('Call Log Outcomes & Company Status Mapping', () => {
  it('maps all CRM outcome types to expected company statuses accurately', () => {
    assert.strictEqual(computeStatusFromOutcome('Connected - Interested'), 'Interested')
    assert.strictEqual(computeStatusFromOutcome('Meeting Scheduled'), 'Meeting Scheduled')
    assert.strictEqual(computeStatusFromOutcome('Call Back Later'), 'Follow-up Due')
    assert.strictEqual(computeStatusFromOutcome('Profile / Mail Sent'), 'Follow-up Due')
    assert.strictEqual(computeStatusFromOutcome('Not Interested'), 'Lost')
    assert.strictEqual(computeStatusFromOutcome('Already Handled Internally'), 'Lost')
    assert.strictEqual(computeStatusFromOutcome('Invalid Number'), 'Dead')
    assert.strictEqual(computeStatusFromOutcome('Not Picked'), 'Attempted')
    assert.strictEqual(computeStatusFromOutcome('Not Reachable / Out of Service'), 'Attempted')
    assert.strictEqual(computeStatusFromOutcome('Wrong Person / Left Firm'), 'Attempted')
    assert.strictEqual(computeStatusFromOutcome('Not Called'), 'Not Called')
  })

  it('defaults unknown outcomes to Attempted safely', () => {
    assert.strictEqual(computeStatusFromOutcome('Unmapped Custom Status'), 'Attempted')
  })
})
