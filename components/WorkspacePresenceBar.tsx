import React from 'react'
import type { WorkspaceCollaborator } from '@/lib/presence'
import { getInitials } from '@/lib/types'
import { Edit2, Phone } from 'lucide-react'

interface Props {
  collaborators: WorkspaceCollaborator[]
}

export default function WorkspacePresenceBar({ collaborators }: Props) {
  if (collaborators.length === 0) return null

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 10px',
        borderRadius: 20,
        background: 'rgba(255, 255, 255, 0.8)',
        border: '1px solid var(--border)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontWeight: 500 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: '#10B981',
            boxShadow: '0 0 0 2px rgba(16, 185, 129, 0.2)',
            display: 'inline-block',
          }}
        />
        <span>Online ({collaborators.length}):</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', marginLeft: 2 }}>
        {collaborators.map((c, idx) => {
          let activityBadge = null
          let tooltip = `${c.userName} is viewing`

          if (c.activity === 'editing') {
            activityBadge = (
              <span
                style={{
                  position: 'absolute',
                  bottom: -2,
                  right: -2,
                  background: '#2563EB',
                  color: '#FFF',
                  borderRadius: '50%',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1.5px solid #FFF',
                }}
              >
                <Edit2 size={7} />
              </span>
            )
            tooltip = `${c.userName} is editing ${c.companyName || 'a client'}`
          } else if (c.activity === 'calling') {
            activityBadge = (
              <span
                style={{
                  position: 'absolute',
                  bottom: -2,
                  right: -2,
                  background: '#F59E0B',
                  color: '#FFF',
                  borderRadius: '50%',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1.5px solid #FFF',
                }}
              >
                <Phone size={7} />
              </span>
            )
            tooltip = `${c.userName} is calling ${c.companyName || 'a client'}`
          }

          return (
            <div
              key={c.userId}
              title={tooltip}
              style={{
                position: 'relative',
                marginLeft: idx > 0 ? -6 : 0,
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#111',
                  border: '2px solid #FFF',
                  backgroundColor: c.userColor || '#E5E7EB',
                  overflow: 'hidden',
                }}
              >
                {c.userAvatar ? (
                  <img src={c.userAvatar} alt={c.userName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  getInitials(c.userName)
                )}
              </div>
              {activityBadge}
            </div>
          )
        })}
      </div>
    </div>
  )
}

