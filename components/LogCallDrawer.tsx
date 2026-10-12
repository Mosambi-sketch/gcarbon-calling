import { syncLeadToExcel, deleteLeadFromExcel } from '@/lib/excel-live-sync'
import { useState, useEffect, useRef, useMemo } from 'react'
import type { AppUser } from '@/lib/store'
import { getContacts, getCallLogs, addCallLog, addTask, addEvent, deleteCompany } from '@/lib/store'
import type { Contact, CallLog, OutcomeType, Company } from '@/lib/types'
import { getAvatarColor, getInitials, getAvatar } from '@/lib/types'
import { getISTDateStr, addDaysIST, formatFriendlyDate } from '@/lib/date'
import { 
  Phone, MessageSquare, Mail, Calendar, Clock, CheckCircle2, 
  ChevronDown, ChevronUp, Copy, Check, ArrowRight, SkipForward,
  Sparkles, AlertCircle, BookOpen, ShieldAlert
} from 'lucide-react'
import toast from 'react-hot-toast'
import { acquireLeadLock, releaseLeadLock } from '@/lib/workspace-db'
import { isGoogleCalendarConnected, createGoogleCalendarEvent } from '@/lib/google-calendar'
import LeadLockBanner from './LeadLockBanner'

export interface Row {
  company: Company | { id: string; name: string; list_id: string; status: string; sector?: string; location?: string; owner_name?: string }
  primaryContact?: Contact
  lastLog?: CallLog
}

export interface OutcomeOption {
  num: number
  outcome: OutcomeType
  label: string
  category: 'positive' | 'warning' | 'negative'
  defaultDays: number | null // null means no follow up
}

const OUTCOME_OPTIONS: OutcomeOption[] = [
  { num: 1, outcome: 'Not Picked', label: 'Not Picked', category: 'warning', defaultDays: 1 },
  { num: 2, outcome: 'Call Back Later', label: 'Call Back Later', category: 'warning', defaultDays: 3 },
  { num: 3, outcome: 'Connected - Interested', label: 'Connected - Interested', category: 'positive', defaultDays: 2 },
  { num: 4, outcome: 'Meeting Scheduled', label: 'Meeting Scheduled', category: 'positive', defaultDays: 1 },
  { num: 5, outcome: 'Profile / Mail Sent', label: 'Profile / Mail Sent', category: 'positive', defaultDays: 2 },
  { num: 6, outcome: 'Not Interested', label: 'Not Interested', category: 'negative', defaultDays: null },
  { num: 7, outcome: 'Not Reachable / Out of Service', label: 'Not Reachable', category: 'warning', defaultDays: 1 },
  { num: 8, outcome: 'Invalid Number', label: 'Invalid Number', category: 'negative', defaultDays: null },
  { num: 9, outcome: 'Wrong Person / Left Firm', label: 'Wrong Person', category: 'negative', defaultDays: null },
]

const QUICK_SNIPPETS = [
  'Spoke to assistant',
  'Call after 3 PM',
  'Interested in audit',
  'Send WhatsApp catalog',
  'Decision maker travelling',
]

interface LogCallDrawerProps {
  row: Row
  user: AppUser
  onClose: () => void
  onSaved: (log: CallLog, companyName: string) => void
  queueMode?: boolean
  queueIndex?: number
  queueTotal?: number
  onSkip?: () => void
  presenceWarning?: string
}

export default function LogCallDrawer({
  row,
  user,
  onClose,
  onSaved,
  queueMode = false,
  queueIndex = 1,
  queueTotal = 1,
  onSkip,
  presenceWarning,
}: LogCallDrawerProps) {
  const [outcome, setOutcome] = useState<OutcomeType | ''>('')
  const [remark, setRemark] = useState('')
  const [followUpDate, setFollowUpDate] = useState<string>('')
  const [selectedShortcutDays, setSelectedShortcutDays] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [callHistory, setCallHistory] = useState<CallLog[]>([])
  const [activeTab, setActiveTab] = useState<'script' | 'templates' | 'history' | null>(null)
  const [copiedTemplate, setCopiedTemplate] = useState<string | null>(null)
  const [lockInfo, setLockInfo] = useState<{ success: boolean; locked_by?: string; locked_by_color?: string }>({ success: true })
  
  const remarkRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let active = true
    acquireLeadLock(row.company.id, { id: user.id, name: user.name, color: user.color }).then((res) => {
      if (active) setLockInfo(res)
    })

    return () => {
      active = false
      releaseLeadLock(row.company.id, user.id)
    }
  }, [row.company.id, user.id, user.name, user.color])

  useEffect(() => {
    setContacts(getContacts(row.company.id))
    const logs = getCallLogs(row.company.id)
    setCallHistory(logs)
    // Reset inputs on company change
    setOutcome('')
    setRemark('')
    setFollowUpDate('')
    setSelectedShortcutDays(null)
  }, [row.company.id])

  // Count prior Not Picked attempts for retry cadence
  const priorNotPickedCount = useMemo(() => {
    return callHistory.filter(l => l.outcome === 'Not Picked').length
  }, [callHistory])

  // Smart outcome selection with defaults
  const handleSelectOutcome = (opt: OutcomeOption) => {
    setOutcome(opt.outcome)
    if (opt.defaultDays !== null) {
      const nextDate = addDaysIST(opt.defaultDays)
      setFollowUpDate(nextDate)
      setSelectedShortcutDays(opt.defaultDays)
    } else {
      setFollowUpDate('')
      setSelectedShortcutDays(null)
    }
  }

  // Follow-up shortcut handlers
  const handleFollowUpDays = (days: number | null) => {
    setSelectedShortcutDays(days)
    if (days === null) {
      setFollowUpDate('')
    } else {
      setFollowUpDate(addDaysIST(days))
    }
  }

  // Keyboard shortcuts: 1-9 for outcomes, Cmd+Enter to save, S for skip in queue mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

      // Cmd+Enter or Ctrl+Enter to save
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        if (outcome && !saving) {
          executeSave()
        }
        return
      }

      // Escape to close
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      // If typing in textarea, do not trigger single-key shortcuts
      if (isInput) return

      // Number keys 1-9 for outcomes
      const keyNum = parseInt(e.key, 10)
      if (!isNaN(keyNum) && keyNum >= 1 && keyNum <= 9) {
        e.preventDefault()
        const opt = OUTCOME_OPTIONS.find(o => o.num === keyNum)
        if (opt) {
          handleSelectOutcome(opt)
        }
      }

      // S key to skip in queue mode
      if ((e.key === 's' || e.key === 'S') && queueMode && onSkip) {
        e.preventDefault()
        onSkip()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [outcome, followUpDate, remark, saving, queueMode, onSkip])

  const executeSave = async () => {
    if (!outcome) return
    setSaving(true)

    try {
      const now = new Date().toISOString()
      
      // Add call log
      const createdLog = addCallLog({
        company_id: row.company.id,
        contact_id: row.primaryContact?.id,
        caller_id: user.id,
        caller_name: user.name,
        called_at: now,
        outcome: outcome as OutcomeType,
        remark: remark.trim() || undefined,
        next_action: undefined,
        follow_up_date: followUpDate || undefined,
      })

      // Auto-create task for follow-ups
      if (followUpDate && (outcome === 'Call Back Later' || outcome === 'Connected - Interested' || outcome === 'Profile / Mail Sent')) {
        addTask({
          title: `Follow up with ${row.company.name}`,
          description: remark || `Outcome: ${outcome}`,
          assignee_id: user.id,
          assignee_name: user.name,
          company_id: row.company.id,
          company_name: row.company.name,
          due_at: followUpDate + 'T09:30:00',
          priority: outcome === 'Connected - Interested' ? 'high' : 'medium',
          status: 'todo',
          created_by: user.id,
        })
      }

      // Auto-create calendar event for meetings
      if (outcome === 'Meeting Scheduled' && followUpDate) {
        let meetLink: string | undefined
        let gcalId: string | undefined
        let gcalHtmlLink: string | undefined

        if (isGoogleCalendarConnected()) {
          try {
            const gcal = await createGoogleCalendarEvent({
              title: `Meeting: ${row.company.name}`,
              description: `Meeting with ${row.primaryContact?.name || 'Client'} from ${row.company.name}.\nRemarks: ${remark || 'None'}`,
              startISO: followUpDate + 'T11:00:00',
              endISO: followUpDate + 'T12:00:00',
              createMeet: true,
            })
            if (gcal.event) {
              meetLink = gcal.event.hangoutLink
              gcalId = gcal.event.id
              gcalHtmlLink = gcal.event.htmlLink
              toast.success('Google Meet meeting created!')
            }
          } catch {
            // quiet ignore
          }
        }

        addEvent({
          title: `Meeting: ${row.company.name}`,
          start: followUpDate + 'T11:00:00',
          end: followUpDate + 'T12:00:00',
          type: 'meeting',
          company_id: row.company.id,
          owner_id: user.id,
          meet_link: meetLink,
          gcal_id: gcalId,
          gcal_html_link: gcalHtmlLink,
        })
      } else if (followUpDate && outcome !== 'Not Picked') {
        addEvent({
          title: `Follow-up: ${row.company.name}`,
          start: followUpDate + 'T09:30:00',
          end: followUpDate + 'T10:00:00',
          type: 'follow-up',
          company_id: row.company.id,
          owner_id: user.id,
        })
      }

            syncLeadToExcel(row.company.list_id, row.company.name, {
        callerName: user.name,
        remark: remark.trim() || undefined,
        followUpDate: followUpDate || undefined,
        status: outcome,
      })
      onSaved(createdLog, row.company.name)
    } finally {
      setSaving(false)
    }
  }

  const primaryContact = row.primaryContact || contacts[0]
  const cleanPhone = primaryContact?.phones?.[0]?.replace(/\D/g, '') || ''
  const whatsappUrl = cleanPhone 
    ? `https://wa.me/${cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone}?text=${encodeURIComponent(`Hi ${primaryContact?.name || ''}, this is ${user.name} from Gcarbon regarding your carbon & energy compliance.`)}` 
    : ''

  const handleCopyTemplate = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedTemplate(id)
    toast.success('Template copied to clipboard!')
    setTimeout(() => setCopiedTemplate(null), 2500)
  }

  const handleDeleteFromDrawer = async () => {
    if (window.confirm('Permanently delete "' + row.company.name + '" from CRM & Excel?')) {
      deleteCompany(row.company.id)
      deleteLeadFromExcel(row.company.list_id, row.company.name)
      fetch('/api/companies/' + row.company.id, { method: 'DELETE' }).catch(() => {})
      toast.success('Deleted "' + row.company.name + '" from CRM & Excel')
      onClose()
      window.dispatchEvent(new CustomEvent('gc:data-changed'))
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className="drawer-overlay" 
        onClick={onClose}
        style={{ animation: 'none' }}
      />
      
      {/* Drawer */}
      <div 
        className="drawer animate-slide-in-right" 
        style={{ width: 560, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--card)' }}
      >
        {/* Presence Warning */}
        {presenceWarning && (
          <div role="alert" style={{
            background: 'rgba(245, 158, 11, 0.15)',
            color: '#F59E0B',
            padding: '8px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            fontWeight: 600,
            borderBottom: '1px solid rgba(245, 158, 11, 0.3)'
          }}>
            <AlertCircle size={14} />
            <span>{presenceWarning}</span>
          </div>
        )}

        {/* Lead Lock Banner */}
        {!lockInfo.success && lockInfo.locked_by && (
          <div className="px-6 pt-4">
            <LeadLockBanner
              lockedBy={lockInfo.locked_by}
              lockedByColor={lockInfo.locked_by_color}
            />
          </div>
        )}

        {/* Queue Banner if in queue mode */}
        {queueMode && (
          <div style={{
            background: 'var(--surface-2)',
            color: 'var(--text)',
            padding: '8px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12,
            fontWeight: 600,
            borderBottom: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ 
                background: 'var(--lime)', color: '#09090B', padding: '2px 7px', borderRadius: 12, 
                fontSize: 10, fontWeight: 800 
              }}>
                QUEUE MODE
              </span>
              <span>Calling {queueIndex} of {queueTotal} today</span>
            </div>
            {onSkip && (
              <button 
                type="button"
                onClick={onSkip}
                style={{
                  background: 'var(--surface-3)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  borderRadius: 6,
                  padding: '3px 8px',
                  fontSize: 11,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                }}
                title="Keyboard: S"
              >
                <SkipForward size={12} /> Skip (S)
              </button>
            )}
          </div>
        )}

        {/* Header */}
        <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)' }}>{row.company.name}</span>
                <span style={{ 
                  background: 'var(--surface-2)', 
                  fontSize: 11, 
                  fontWeight: 600, 
                  padding: '2px 8px', 
                  borderRadius: 6, 
                  color: 'var(--text-secondary)' 
                }}>
                  {row.company.status}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                {row.company.list_id?.replace(/-/g, ' ')}
                {row.company.sector ? ` · ${row.company.sector}` : ''}
                {row.company.location ? ` · ${row.company.location}` : ''}
              </div>
            </div>
            <button 
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text-muted)', padding: 4 }}
              title="Close (Esc)"
            >
              ×
            </button>
          </div>

          {/* Contact Box with quick actions */}
          {primaryContact ? (
            <div style={{ 
              display: 'flex', alignItems: 'center', gap: 12, 
              marginTop: 12, padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 10,
              border: '1px solid var(--border)'
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: getAvatarColor(primaryContact.name),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 13, color: '#09090B',
              }}>
                {getInitials(primaryContact.name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{primaryContact.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{primaryContact.designation || 'Primary Contact'}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {primaryContact.phones.map((ph, i) => (
                  <a 
                    key={i} 
                    href={`tel:${ph}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <button 
                      type="button" 
                      className="btn btn-sm"
                      style={{ 
                        background: 'var(--lime)', color: '#09090B', fontWeight: 700, 
                        fontSize: 11, display: 'flex', alignItems: 'center', gap: 4,
                        padding: '6px 10px', borderRadius: 8, border: 'none'
                      }}
                    >
                      <Phone size={12} /> {ph}
                    </button>
                  </a>
                ))}
                {whatsappUrl && (
                  <a 
                    href={whatsappUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ textDecoration: 'none' }}
                  >
                    <button 
                      type="button" 
                      className="btn btn-sm"
                      style={{ 
                        background: '#25D366', color: '#FFFFFF', fontWeight: 600, 
                        fontSize: 11, display: 'flex', alignItems: 'center', gap: 4,
                        padding: '6px 10px', borderRadius: 8, border: 'none'
                      }}
                      title="Open WhatsApp chat"
                    >
                      <MessageSquare size={12} /> WhatsApp
                    </button>
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>No contact phone listed</div>
          )}
        </div>

        {/* Scrollable Single-Screen Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          
          {/* Section: 1-Click Outcome Selection */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                1. Call Outcome <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>(Press 1–9)</span>
              </div>
              {priorNotPickedCount > 0 && outcome === 'Not Picked' && (
                <span style={{ 
                  fontSize: 11, fontWeight: 700, color: priorNotPickedCount >= 2 ? '#EF4444' : '#F59E0B',
                  background: priorNotPickedCount >= 2 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                  padding: '2px 8px', borderRadius: 6
                }}>
                  {priorNotPickedCount >= 2 ? '⚠ Attempt #3 (Tried 3x State)' : `Retry cadence: Attempt #${priorNotPickedCount + 1}`}
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {OUTCOME_OPTIONS.map(opt => {
                const isSelected = outcome === opt.outcome
                let bg = 'var(--surface-2)'
                let border = 'var(--border)'
                let textColor = 'var(--text)'

                if (isSelected) {
                  bg = opt.category === 'positive' ? 'var(--lime)' : opt.category === 'warning' ? '#FEF08A' : '#FECACA'
                  border = opt.category === 'positive' ? 'var(--lime)' : 'var(--text)'
                  textColor = '#09090B'
                }

                return (
                  <button
                    key={opt.num}
                    type="button"
                    onClick={() => handleSelectOutcome(opt)}
                    style={{
                      background: bg,
                      border: `1.5px solid ${border}`,
                      borderRadius: 10,
                      padding: '8px 10px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.12s ease',
                      position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{
                        background: isSelected ? '#09090B' : 'var(--surface-3)',
                        color: isSelected ? '#FFFFFF' : 'var(--text-muted)',
                        fontSize: 10,
                        fontWeight: 800,
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 4,
                      }}>
                        {opt.num}
                      </span>
                      {isSelected && <Check size={14} color="#09090B" strokeWidth={2.5} />}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: isSelected ? 700 : 500, color: textColor, lineHeight: 1.25 }}>
                      {opt.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Section: Follow-up Date (Smart Defaults) */}
          <div style={{ marginBottom: 18, padding: '14px', background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={14} color="var(--text-muted)" />
                2. Follow-up Date
              </div>
              {followUpDate && (
                <span style={{ fontSize: 12, fontWeight: 700, color: '#3B82F6' }}>
                  {formatFriendlyDate(followUpDate)} ({followUpDate})
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {[
                { label: 'None', days: null },
                { label: 'Tomorrow (+1d)', days: 1 },
                { label: '3 Days (+3d)', days: 3 },
                { label: '1 Week (+7d)', days: 7 },
                { label: '15 Days (+15d)', days: 15 },
              ].map(item => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => handleFollowUpDays(item.days)}
                  style={{
                    background: selectedShortcutDays === item.days ? 'var(--text)' : 'var(--card)',
                    color: selectedShortcutDays === item.days ? 'var(--bg)' : 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '5px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.12s',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Custom Date:</span>
              <input
                type="date"
                className="input"
                value={followUpDate}
                onChange={e => {
                  setFollowUpDate(e.target.value)
                  setSelectedShortcutDays(null)
                }}
                min={getISTDateStr()}
                style={{ padding: '4px 10px', height: 32, fontSize: 12, width: 160 }}
              />
            </div>
          </div>

          {/* Section: Remark & Quick Snippets */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                3. Call Remark <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>(Optional)</span>
              </div>
            </div>

            {/* Quick snippet chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {QUICK_SNIPPETS.map(snippet => (
                <button
                  key={snippet}
                  type="button"
                  onClick={() => {
                    setRemark(prev => prev ? `${prev}. ${snippet}` : snippet)
                    remarkRef.current?.focus()
                  }}
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '3px 8px',
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  + {snippet}
                </button>
              ))}
            </div>

            <textarea
              ref={remarkRef}
              className="rich-editor"
              placeholder="e.g. Spoke to Nitin. Sent presentation deck. Needs pricing proposal for GHG scope 1 & 2 audit."
              value={remark}
              onChange={e => setRemark(e.target.value)}
              style={{ minHeight: 70, height: 75, resize: 'vertical', fontSize: 12, padding: '8px 10px' }}
            />
          </div>

          {/* Drawer Quick Assistance Accordions: Call Script / Templates / Timeline */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => setActiveTab(activeTab === 'script' ? null : 'script')}
                style={{
                  flex: 1,
                  background: activeTab === 'script' ? 'var(--text)' : 'var(--surface-2)',
                  color: activeTab === 'script' ? 'var(--bg)' : 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '7px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <BookOpen size={13} /> Call Script & Objections {activeTab === 'script' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab(activeTab === 'templates' ? null : 'templates')}
                style={{
                  flex: 1,
                  background: activeTab === 'templates' ? 'var(--text)' : 'var(--surface-2)',
                  color: activeTab === 'templates' ? 'var(--bg)' : 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '7px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <MessageSquare size={13} /> Quick Templates {activeTab === 'templates' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab(activeTab === 'history' ? null : 'history')}
                style={{
                  flex: 1,
                  background: activeTab === 'history' ? 'var(--text)' : 'var(--surface-2)',
                  color: activeTab === 'history' ? 'var(--bg)' : 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '7px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <Clock size={13} /> Past History ({callHistory.length}) {activeTab === 'history' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            </div>

            {/* Panel: Call Script & Objections */}
            {activeTab === 'script' && (
              <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: 14, fontSize: 12, marginBottom: 12, border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>🎯 Opening Hook:</div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: 12, background: 'var(--card)', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}>
                  "Hello {primaryContact?.name ? primaryContact.name.split(' ')[0] : 'Sir/Ma\'am'}, this is {user.name} from <strong>Gcarbon</strong>. We help manufacturing and industrial plants track energy efficiency and meet carbon disclosure norms with zero software hassle. Do you handle sustainability and plant audits at {row.company.name}?"
                </div>

                <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>🛡️ Common Objections & Comebacks:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ background: 'var(--card)', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}>
                    <span style={{ fontWeight: 600, color: '#F59E0B' }}>"Send me an email first":</span>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
                      "Gladly! To make sure I don't flood your inbox, are you focused on energy conservation, BRSR reporting, or ISO compliance?"
                    </p>
                  </div>
                  <div style={{ background: 'var(--card)', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}>
                    <span style={{ fontWeight: 600, color: '#F59E0B' }}>"We already have a vendor":</span>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
                      "Understood! Most clients we work with had existing auditors. We usually integrate or audit the gaps they miss. When does your current vendor term renew?"
                    </p>
                  </div>
                  <div style={{ background: 'var(--card)', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}>
                    <span style={{ fontWeight: 600, color: '#F59E0B' }}>"Not interested / Busy right now":</span>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
                      "Completely understand. Shall I reconnect on Thursday afternoon after 3 PM when things are quieter?"
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Panel: WhatsApp & Email Templates */}
            {activeTab === 'templates' && (
              <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: 14, fontSize: 12, marginBottom: 12, border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>💬 WhatsApp Intro Message</span>
                  <button
                    type="button"
                    onClick={() => handleCopyTemplate(
                      `Hi ${primaryContact?.name || ''}, pleasure speaking briefly! Sharing the Gcarbon credentials deck covering industrial energy audits and carbon compliance. Let us know a convenient time for a 10-min virtual demo this week. Best, ${user.name} (Gcarbon)`,
                      'wa'
                    )}
                    style={{ background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    {copiedTemplate === 'wa' ? <Check size={10} /> : <Copy size={10} />} Copy
                  </button>
                </div>
                <div style={{ background: 'var(--card)', padding: 8, borderRadius: 6, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 12, border: '1px solid var(--border)' }}>
                  Hi {primaryContact?.name || ''}, pleasure speaking briefly! Sharing the Gcarbon credentials deck covering industrial energy audits and carbon compliance. Let us know a convenient time for a 10-min virtual demo this week. Best, {user.name} (Gcarbon)
                </div>

                <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>✉️ Email Follow-up Template</span>
                  <button
                    type="button"
                    onClick={() => handleCopyTemplate(
                      `Subject: Introduction: Gcarbon Energy & Carbon Compliance Solutions for ${row.company.name}\n\nDear ${primaryContact?.name || 'Sir/Ma\'am'},\n\nThank you for taking my call today. As discussed, Gcarbon assists industrial and commercial facilities in optimizing energy footprints and meeting regulatory carbon reporting standards.\n\nPlease find attached our company profile and case studies. Would you be open for a brief 15-minute call on ${addDaysIST(2)} at 11:30 AM?\n\nWarm regards,\n${user.name}\nGcarbon Team`,
                      'email'
                    )}
                    style={{ background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    {copiedTemplate === 'email' ? <Check size={10} /> : <Copy size={10} />} Copy
                  </button>
                </div>
                <div style={{ background: 'var(--card)', padding: 8, borderRadius: 6, color: 'var(--text-secondary)', lineHeight: 1.4, border: '1px solid var(--border)' }}>
                  Subject: Introduction: Gcarbon Energy & Carbon Compliance Solutions for {row.company.name}...
                </div>
              </div>
            )}

            {/* Panel: Timeline */}
            {activeTab === 'history' && (
              <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: 14, fontSize: 12, marginBottom: 12, border: '1px solid var(--border)', maxHeight: 220, overflowY: 'auto' }}>
                {callHistory.length > 0 ? (
                  <div className="timeline">
                    {callHistory.map(log => (
                      <div key={log.id} className="timeline-item">
                        <div className="timeline-dot" style={{
                          background: log.outcome === 'Connected - Interested' || log.outcome === 'Meeting Scheduled' 
                            ? 'var(--lime)' 
                            : log.outcome === 'Not Interested' || log.outcome === 'Already Handled Internally' || log.outcome === 'Invalid Number' 
                            ? '#EF4444' 
                            : 'var(--text)'
                        }} />
                        <div style={{ width: '100%' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text)' }}>{log.outcome}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {formatFriendlyDate(log.called_at)}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{log.caller_name}</span>
                          </div>
                          {log.remark && (
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{log.remark}</div>
                          )}
                          {log.follow_up_date && (
                            <div style={{ fontSize: 11, color: '#3B82F6', marginTop: 2 }}>
                              📅 Follow-up: {formatFriendlyDate(log.follow_up_date)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)' }}>No prior calls logged yet for this company.</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action Footer */}
        <div style={{ 
          padding: '16px 24px', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--card)', flexShrink: 0 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--text-muted)' }}>
            <button
              type="button"
              onClick={handleDeleteFromDrawer}
              style={{
                background: '#FEF2F2',
                color: '#DC2626',
                border: '1px solid #FECACA',
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
              title="Delete this company from CRM & Excel"
            >
              🗑 Delete Company
            </button>
            <span><kbd style={{ background: 'var(--kbd-bg)', border: '1px solid var(--kbd-border)', color: 'var(--text)', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>⌘↵</kbd> save</span>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button 
              type="button" 
              className="btn btn-ghost" 
              onClick={onClose}
              disabled={saving}
            >
              Cancel (Esc)
            </button>
            <button
              type="button"
              className="btn btn-lime"
              onClick={executeSave}
              disabled={saving || !outcome}
              style={{ minWidth: 150, justifyContent: 'center', fontWeight: 700 }}
            >
              {saving ? (
                <span className="spinner" style={{ borderTopColor: 'var(--black)' }} />
              ) : queueMode ? (
                <>Save & Next <ArrowRight size={14} /></>
              ) : (
                '✓ Save Call Log'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
