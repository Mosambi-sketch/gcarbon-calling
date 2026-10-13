import { useState, useEffect, useRef, useCallback } from 'react'
import type { AppUser } from '@/lib/store'
import { getNotes, addNote, updateNote, deleteNote } from '@/lib/store'
import type { Note } from '@/lib/types'
import { format, parseISO } from 'date-fns'

export default function NotesPage({ user }: { user: AppUser }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'editor'>('list')
  const [search, setSearch] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const loadNotes = useCallback(() => {
    const loaded = getNotes(user.id)
    setNotes(loaded)
    return loaded
  }, [user.id])

  useEffect(() => {
    const loaded = loadNotes()
    if (loaded.length > 0 && !selectedNote) {
      selectNote(loaded[0])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectNote = (note: Note) => {
    setSelectedNote(note)
    setEditTitle(note.title)
    setEditBody(note.body)
    setMobileView('editor')
  }

  useEffect(() => {
    const handleSharedNotesChange = () => {
      const loaded = loadNotes()
      const current = selectedNote ? loaded.find(note => note.id === selectedNote.id) : undefined
      if (current) selectNote(current)
      else if (loaded[0]) selectNote(loaded[0])
      else setSelectedNote(null)
    }
    window.addEventListener('gc:data-changed', handleSharedNotesChange)
    return () => window.removeEventListener('gc:data-changed', handleSharedNotesChange)
  }, [loadNotes, selectedNote])

  const handleNewNote = () => {
    const note = addNote({
      owner_id: user.id,
      title: 'New Note',
      body: '',
      pinned: false,
    })
    const loaded = loadNotes()
    selectNote(note)
    setMobileView('editor')
  }

  const handleDelete = (id: string) => {
    deleteNote(id)
    const loaded = loadNotes()
    if (selectedNote?.id === id) {
      if (loaded.length > 0) selectNote(loaded[0])
      else setSelectedNote(null)
    }
  }

  const handlePin = (note: Note) => {
    updateNote(note.id, { pinned: !note.pinned })
    const loaded = loadNotes()
    if (selectedNote?.id === note.id) {
      const updated = loaded.find(n => n.id === note.id)
      if (updated) selectNote(updated)
    }
  }

  // Autosave on edit
  const triggerSave = useCallback((title: string, body: string) => {
    if (!selectedNote) return
    clearTimeout(saveTimer.current)
    setSaved(false)
    saveTimer.current = setTimeout(() => {
      setSaving(true)
      updateNote(selectedNote.id, { title, body })
      setNotes(getNotes(user.id))
      setTimeout(() => { setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000) }, 500)
    }, 800)
  }, [selectedNote, user.id])

  const handleTitleChange = (v: string) => {
    setEditTitle(v)
    triggerSave(v, editBody)
  }

  const handleBodyChange = (v: string) => {
    setEditBody(v)
    triggerSave(editTitle, v)
  }

  const filtered = notes.filter(n => 
    !search || 
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    n.body.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="page-header">
        <div className="page-header-left">
          <div className="greeting" style={{ fontSize: 18 }}>My Notes</div>
          <div className="greeting-sub">{notes.length} note{notes.length !== 1 ? 's' : ''} · Private to you only</div>
        </div>
        <button className="btn btn-primary" onClick={handleNewNote}>+ New Note</button>
      </div>

      <div className="notes-body-layout">
        {/* Notes list sidebar */}
        <div className={`notes-sidebar ${mobileView === 'editor' ? 'hide-on-mobile' : ''}`}>
          {/* Search */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <div className="search-input">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="#AAA" strokeWidth={2}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                placeholder="Search notes…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Notes list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
            {filtered.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px 10px' }}>
                <div>📝</div>
                <div style={{ fontSize: 12 }}>No notes yet</div>
                <button className="btn btn-ghost btn-sm" onClick={handleNewNote}>Create one →</button>
              </div>
            ) : filtered.map(note => (
              <div
                key={note.id}
                className={`note-card ${selectedNote?.id === note.id ? 'active' : ''}`}
                onClick={() => selectNote(note)}
                style={{ marginBottom: 6 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ 
                      fontWeight: 600, fontSize: 13,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>
                      {note.pinned ? '📌 ' : ''}{note.title || 'Untitled'}
                    </div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                      {format(parseISO(note.updated_at), 'dd MMM')}
                    </div>
                    {note.body && (
                      <div style={{
                        fontSize: 11, color: '#AAA', marginTop: 3,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {note.body.substring(0, 60)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Editor */}
        {selectedNote ? (
          <div className={`notes-editor-pane ${mobileView === 'list' ? 'hide-on-mobile' : ''}`}>
            {/* Editor toolbar */}
            <div style={{ 
              padding: '10px 16px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
            }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm notes-mobile-back"
                onClick={() => setMobileView('list')}
                style={{ padding: '4px 8px', fontSize: 12 }}
              >
                ← Notes
              </button>
              <div style={{ flex: 1 }}>
                <input
                  style={{ 
                    fontSize: 18, fontWeight: 700, border: 'none', outline: 'none',
                    width: '100%', background: 'transparent', fontFamily: 'inherit', color: 'var(--text)',
                  }}
                  value={editTitle}
                  onChange={e => handleTitleChange(e.target.value)}
                  placeholder="Note title…"
                />
              </div>
              {saving && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Saving…</span>}
              {!saving && saved && <span style={{ fontSize: 11, color: '#16A34A' }}>✓ Saved</span>}
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handlePin(selectedNote)}
                style={{ color: selectedNote.pinned ? '#F59E0B' : 'var(--text-muted)' }}
              >
                {selectedNote.pinned ? '📌 Pinned' : '📌 Pin'}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: '#DC2626' }}
                onClick={() => handleDelete(selectedNote.id)}
              >
                🗑
              </button>
            </div>

            {/* Editor area */}
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                Last updated {format(parseISO(selectedNote.updated_at), 'dd MMM yyyy, hh:mm a')}
              </div>
              <textarea
                style={{
                  width: '100%', minHeight: 400, border: 'none', outline: 'none',
                  fontFamily: 'inherit', fontSize: 14, lineHeight: 1.7,
                  color: 'var(--text)', resize: 'none', background: 'transparent',
                }}
                value={editBody}
                onChange={e => handleBodyChange(e.target.value)}
                placeholder="Start writing… (autosaved)"
              />
            </div>
          </div>
        ) : (
          <div className="empty-state" style={{ flex: 1 }}>
            <div style={{ fontSize: 48 }}>📝</div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Your private notes</div>
            <div style={{ fontSize: 13, color: '#888', maxWidth: 280, textAlign: 'center' }}>
              Notes are private to you only — not visible to your team.
            </div>
            <button className="btn btn-primary" onClick={handleNewNote}>+ Create your first note</button>
          </div>
        )}
      </div>
    </div>
  )
}
