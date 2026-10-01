'use client'
import { useState, useEffect } from 'react'
import type { AppUser } from '@/lib/store'
import { getContacts, getCallLogs, addCallLog, addTask, addEvent } from '@/lib/store'
import type { Contact, CallLog, OutcomeType } from '@/lib/types'
import { OUTCOMES, getAvatarColor, getInitials } from '@/lib/types'
import { format, addDays } from 'date-fns'

interface Row {
  company: { id: string; name: string; list_id: string; status: string }
  primaryContact?: Contact
  lastLog?: CallLog
}

const OUTCOME_GROUPS: { label: string; outcomes: OutcomeType[]; variant: string }[] = [
  {
    label: '✅ Positive',
    variant: 'positive',
    outcomes: ['Connected - Interested', 'Meeting Scheduled', 'Profile / Mail Sent'],
  },
  {
    label: '⏳ Follow-up',
    variant: 'warning',
    outcomes: ['Call Back Later', 'Not Picked'],
  },
  {
    label: '❌ No Result',
    variant: 'neutral',
    outcomes: ['Not Reachable / Out of Service', 'Invalid Number', 'Wrong Person / Left Firm', 'Not Interested', 'Already Handled Internally'],
  },
]

const DATE_SHORTCUTS: { label: string; days: number }[] = [
  { label: 'Tomorrow', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '15 days', days: 15 },
  { label: '1 month', days: 30 },
]

export default function LogCallDrawer({ 
  row, user, onClose, onSaved 
}: { 
  row: Row; user: AppUser; onClose: () => void; onSaved: () => void 
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [outcome, setOutcome] = useState<OutcomeType | ''>('')
  const [remark, setRemark] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [callHistory, setCallHistory] = useState<CallLog[]>([])
  const [selectedShortcut, setSelectedShortcut] = useState<number | null>(null)

  useEffect(() => {
    setContacts(getContacts(row.company.id))
    setCallHistory(getCallLogs(row.company.id))
  }, [row.company.id])

  const handleShortcut = (days: number, idx: number) => {
    const d = addDays(new Date(), days)
    setFollowUpDate(d.toISOString().split('T')[0])
    setSelectedShortcut(idx)
  }

  const handleSave = async () => {
    if (!outcome) return
    setSaving(true)
    
    try {
      const now = new Date().toISOString()
      
      // Add call log
      addCallLog({
        company_id: row.company.id,
        contact_id: row.primaryContact?.id,
        caller_id: user.id,
        caller_name: user.name,
        called_at: now,
        outcome: outcome as OutcomeType,
        remark: remark || undefined,
        next_action: undefined,
        follow_up_date: followUpDate || undefined,
      })

      // Auto-create task for follow-up
      if (followUpDate && (outcome === 'Call Back Later' || outcome === 'Connected - Interested')) {
        addTask({
          title: `Follow up with ${row.company.name}`,
          description: remark,
          assignee_id: user.id,
          assignee_name: user.name,
          company_id: row.company.id,
          company_name: row.company.name,
          due_at: followUpDate + 'T09:00:00',
          priority: outcome === 'Connected - Interested' ? 'high' : 'medium',
          status: 'todo',
          created_by: user.id,
        })
      }

      // Auto-create calendar event for meetings
      if (outcome === 'Meeting Scheduled' && followUpDate) {
        addEvent({
          title: `Meeting: ${row.company.name}`,
          start: followUpDate + 'T10:00:00',
          end: followUpDate + 'T11:00:00',
          type: 'meeting',
          company_id: row.company.id,
          owner_id: user.id,
        })
      } else if (followUpDate) {
        addEvent({
          title: `Follow-up: ${row.company.name}`,
          start: followUpDate + 'T09:00:00',
          end: followUpDate + 'T09:30:00',
          type: 'follow-up',
          company_id: row.company.id,
          owner_id: user.id,
        })
      }

      await new Promise(r => setTimeout(r, 300))
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const primaryContact = row.primaryContact || contacts[0]

  return (
    <>
      {/* Overlay */}
      <div 
        className="drawer-overlay" 
        onClick={onClose}
        style={{ animation: 'none' }}
      />
      
      {/* Drawer */}
      <div className="drawer animate-slide-in-right">
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #F0F0F0', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{row.company.name}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                {row.company.list_id.replace(/-/g, ' ')} · {row.company.status}
              </div>
            </div>
            <button 
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#888', lineHeight: 1, padding: 4 }}
            >
              ×
            </button>
          </div>

          {/* Contact info */}
          {primaryContact && (
            <div style={{ 
              display: 'flex', alignItems: 'center', gap: 12, 
              marginTop: 14, padding: 12, background: '#F9F9F9', borderRadius: 12 
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: getAvatarColor(primaryContact.name),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 14, color: '#0B0B0B',
              }}>
                {getInitials(primaryContact.name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{primaryContact.name}</div>
                {primaryContact.designation && (
                  <div style={{ fontSize: 12, color: '#888' }}>{primaryContact.designation}</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {primaryContact.phones.map((ph, i) => (
                  <a
                    key={i}
                    href={`tel:${ph}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                    onClick={e => e.stopPropagation()}
                  >
                    <button className="btn btn-lime btn-sm">
                      📞 {ph}
                    </button>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {/* Step indicator */}
          <div style={{ 
            display: 'flex', gap: 0, padding: '12px 24px',
            borderBottom: '1px solid #F0F0F0',
          }}>
            {['Pick Outcome', 'Add Remark', 'Set Follow-up'].map((s, i) => {
              const stepNum = (i + 1) as 1 | 2 | 3
              const isActive = step === stepNum
              const isDone = step > stepNum
              return (
                <div
                  key={s}
                  onClick={() => setStep(stepNum)}
                  style={{
                    flex: 1, textAlign: 'center', padding: '6px 4px',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    borderBottom: `2px solid ${isActive ? '#0B0B0B' : isDone ? '#D9F56B' : 'transparent'}`,
                    color: isActive ? '#0B0B0B' : isDone ? '#555' : '#AAA',
                  }}
                >
                  {isDone ? '✓ ' : `${stepNum}. `}{s}
                </div>
              )
            })}
          </div>

          <div style={{ padding: 24 }}>
            {/* Step 1: Outcome */}
            {step === 1 && (
              <div className="animate-fade-in">
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>What happened on this call?</div>
                {OUTCOME_GROUPS.map(group => (
                  <div key={group.label} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {group.label}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {group.outcomes.map(o => (
                        <button
                          key={o}
                          className={`outcome-chip ${outcome === o ? 'selected' : ''} ${outcome === o ? '' : `outcome-${group.variant}`}`}
                          onClick={() => { setOutcome(o); setStep(2) }}
                          style={{ textAlign: 'center', fontSize: 12 }}
                        >
                          {o}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Step 2: Remark */}
            {step === 2 && (
              <div className="animate-fade-in">
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                  Outcome: <span style={{ color: '#0B0B0B' }}>{outcome}</span>
                </div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>Add a note about this call</div>
                <textarea
                  className="rich-editor"
                  placeholder="e.g. Spoke with Nitin, asked us to send a profile. Interested in GHG audit."
                  value={remark}
                  onChange={e => setRemark(e.target.value)}
                  style={{ minHeight: 120, resize: 'none' }}
                  autoFocus
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                  <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>
                  <button className="btn btn-primary" onClick={() => setStep(3)}>Next →</button>
                </div>
              </div>
            )}

            {/* Step 3: Follow-up date */}
            {step === 3 && (
              <div className="animate-fade-in">
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Set a follow-up date</div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>Optional — creates a task and calendar event</div>
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {DATE_SHORTCUTS.map((s, i) => (
                    <button
                      key={s.label}
                      className={`date-shortcut ${selectedShortcut === i ? 'selected' : ''}`}
                      onClick={() => handleShortcut(s.days, i)}
                    >
                      {s.label}
                    </button>
                  ))}
                  <button
                    className={`date-shortcut ${selectedShortcut === -1 ? 'selected' : ''}`}
                    onClick={() => { setFollowUpDate(''); setSelectedShortcut(-1) }}
                  >
                    No follow-up
                  </button>
                </div>

                <input
                  type="date"
                  className="input"
                  value={followUpDate}
                  onChange={e => { setFollowUpDate(e.target.value); setSelectedShortcut(null) }}
                  min={new Date().toISOString().split('T')[0]}
                />

                {followUpDate && (
                  <div style={{ 
                    marginTop: 12, padding: '10px 14px',
                    background: '#F0F9FF', borderRadius: 10, fontSize: 12, color: '#1D4ED8'
                  }}>
                    📅 Follow-up on {format(new Date(followUpDate + 'T00:00:00'), 'EEEE, dd MMMM yyyy')}
                    {outcome === 'Meeting Scheduled' ? ' — Calendar event will be created' : ' — Task + calendar event will be created'}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                  <button className="btn btn-ghost" onClick={() => setStep(2)}>← Back</button>
                  <button 
                    className="btn btn-lime"
                    onClick={handleSave}
                    disabled={saving || !outcome}
                    style={{ minWidth: 120, justifyContent: 'center' }}
                  >
                    {saving ? <span className="spinner" style={{ borderTopColor: '#0B0B0B' }} /> : '✓ Save Call Log'}
                  </button>
                </div>
              </div>
            )}

            {/* Call history */}
            {callHistory.length > 0 && (
              <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid #F0F0F0' }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14, color: '#555' }}>
                  Call History ({callHistory.length})
                </div>
                <div className="timeline">
                  {callHistory.slice(0, 8).map(log => (
                    <div key={log.id} className="timeline-item">
                      <div className="timeline-dot" style={{
                        background: log.outcome === 'Connected - Interested' || log.outcome === 'Meeting Scheduled' 
                          ? '#D9F56B' 
                          : log.outcome === 'Not Interested' || log.outcome === 'Already Handled Internally' || log.outcome === 'Invalid Number' 
                          ? '#DC2626' 
                          : '#0B0B0B'
                      }} />
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 600, fontSize: 12 }}>{log.outcome}</span>
                          <span style={{ fontSize: 11, color: '#AAA' }}>
                            {format(new Date(log.called_at), 'dd MMM, hh:mm a')}
                          </span>
                          <span style={{ fontSize: 11, color: '#888' }}>by {log.caller_name}</span>
                        </div>
                        {log.remark && (
                          <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{log.remark}</div>
                        )}
                        {log.follow_up_date && (
                          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                            📅 Follow-up: {format(new Date(log.follow_up_date + 'T00:00:00'), 'dd MMM')}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom save bar (quick save if outcome already selected) */}
        {step !== 3 && outcome && (
          <div style={{ 
            padding: '14px 24px', borderTop: '1px solid #F0F0F0',
            display: 'flex', gap: 10, flexShrink: 0
          }}>
            <button
              className="btn btn-lime"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => setStep(3)}
            >
              Continue →
            </button>
          </div>
        )}
      </div>
    </>
  )
}
