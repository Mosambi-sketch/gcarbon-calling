import { useState } from 'react'
import type { CompanyStatus } from '@/lib/types'
import type { AppUser } from '@/lib/store'
import { CheckSquare, X, UserCheck, Tag, Archive, Download, Loader2 } from 'lucide-react'

interface Props {
  selectedCount: number
  users: AppUser[]
  onClearSelection: () => void
  onBulkStatusChange: (status: CompanyStatus) => Promise<void>
  onBulkOwnerChange: (ownerId: string, ownerName: string) => Promise<void>
  onBulkArchive: () => Promise<void>
  onExportSelected: () => void
}

const STATUS_OPTIONS: CompanyStatus[] = [
  'Not Called',
  'Attempted',
  'In Progress',
  'Connected',
  'Qualified',
  'Interested',
  'Follow-up Due',
  'Meeting Scheduled',
  'Proposal Sent',
  'Negotiation',
  'Won',
  'Lost',
  'Dead',
]

export default function BulkActionsBar({
  selectedCount,
  users,
  onClearSelection,
  onBulkStatusChange,
  onBulkOwnerChange,
  onBulkArchive,
  onExportSelected,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [showOwnerMenu, setShowOwnerMenu] = useState(false)

  if (selectedCount === 0) return null

  const handleStatusSelect = async (st: CompanyStatus) => {
    setShowStatusMenu(false)
    setLoading(true)
    try {
      await onBulkStatusChange(st)
    } finally {
      setLoading(false)
    }
  }

  const handleOwnerSelect = async (user: AppUser) => {
    setShowOwnerMenu(false)
    setLoading(true)
    try {
      await onBulkOwnerChange(user.id, user.name)
    } finally {
      setLoading(false)
    }
  }

  const handleArchive = async () => {
    if (!window.confirm(`Are you sure you want to archive ${selectedCount} leads?`)) return
    setLoading(true)
    try {
      await onBulkArchive()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 18px',
        backgroundColor: '#0B0B0B',
        color: '#FFFFFF',
        borderRadius: 20,
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 12, borderRight: '1px solid rgba(255,255,255,0.2)' }}>
        <CheckSquare size={16} color="#D9F56B" />
        <span>
          <strong style={{ color: '#D9F56B' }}>{selectedCount}</strong> selected
        </span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#AAA' }}>
          <Loader2 size={16} className="animate-spin" color="#D9F56B" />
          <span>Updating leads...</span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Status Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setShowStatusMenu(!showStatusMenu); setShowOwnerMenu(false) }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.12)',
                color: '#FFF',
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <Tag size={13} />
              <span>Change Status</span>
            </button>
            {showStatusMenu && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: 0,
                  marginBottom: 8,
                  width: 180,
                  backgroundColor: '#1E1E1E',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: 12,
                  boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                  padding: 4,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  zIndex: 60,
                  maxHeight: 240,
                  overflowY: 'auto',
                }}
              >
                {STATUS_OPTIONS.map((st) => (
                  <button
                    key={st}
                    onClick={() => handleStatusSelect(st)}
                    style={{
                      textAlign: 'left',
                      padding: '6px 10px',
                      borderRadius: 6,
                      background: 'none',
                      border: 'none',
                      color: '#EEE',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    {st}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Owner Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setShowOwnerMenu(!showOwnerMenu); setShowStatusMenu(false) }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.12)',
                color: '#FFF',
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <UserCheck size={13} />
              <span>Assign Caller</span>
            </button>
            {showOwnerMenu && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: 0,
                  marginBottom: 8,
                  width: 180,
                  backgroundColor: '#1E1E1E',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: 12,
                  boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                  padding: 4,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  zIndex: 60,
                  maxHeight: 240,
                  overflowY: 'auto',
                }}
              >
                {users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleOwnerSelect(u)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      textAlign: 'left',
                      padding: '6px 10px',
                      borderRadius: 6,
                      background: 'none',
                      border: 'none',
                      color: '#EEE',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: u.color || '#E5E7EB',
                      }}
                    />
                    <span>{u.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Export Selected */}
          <button
            onClick={onExportSelected}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 8,
              background: 'rgba(255, 255, 255, 0.12)',
              color: '#FFF',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
            title="Export Selected"
          >
            <Download size={13} />
            <span>Export</span>
          </button>

          {/* Archive Selected */}
          <button
            onClick={handleArchive}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 8,
              background: 'rgba(239, 68, 68, 0.2)',
              color: '#FCA5A5',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
            title="Archive Selected"
          >
            <Archive size={13} />
            <span>Archive</span>
          </button>
        </div>
      )}

      {/* Clear selection */}
      <button
        onClick={onClearSelection}
        style={{
          background: 'none',
          border: 'none',
          color: '#888',
          cursor: 'pointer',
          padding: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="Deselect All"
      >
        <X size={16} />
      </button>
    </div>
  )
}
