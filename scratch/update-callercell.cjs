const fs = require('fs');
let code = fs.readFileSync('components/pages/CallingSheetPage.tsx', 'utf8');

// Replace CallerCell implementation
const startIdx = code.indexOf('function CallerCell({');
const endIdx = code.indexOf('export default function CallingSheetPage');

if (startIdx >= 0 && endIdx >= 0) {
  const newCallerCell = `function CallerCell({
  caller,
  onSave,
}: {
  caller?: string
  onSave: (val: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      setSearch('')
      return
    }
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    setTimeout(() => inputRef.current?.focus(), 50)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const isValidCaller = Boolean(
    caller &&
    !caller.toLowerCase().includes('reference') &&
    caller.toLowerCase() !== 'caller' &&
    caller.trim().length > 0
  )

  const filteredTeam = TEAM_CALLERS.filter(c => 
    c.toLowerCase().includes(search.toLowerCase())
  )

  const isCustomMatch = search.trim() && !TEAM_CALLERS.some(c => c.toLowerCase() === search.trim().toLowerCase())

  return (
    <div ref={ref} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <span
        onClick={() => setOpen(!open)}
        title="Touch or click to assign caller"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '3px 8px', borderRadius: 6, fontSize: 12, fontWeight: 500,
          cursor: 'pointer', transition: 'all 0.15s ease',
          background: isValidCaller ? '#F8FAFC' : 'transparent',
          border: isValidCaller ? '1px solid #E2E8F0' : '1px dashed #CBD5E1',
          maxWidth: 130,
        }}
        onMouseEnter={e => { 
          (e.currentTarget as HTMLElement).style.background = '#F1F5F9'; 
          (e.currentTarget as HTMLElement).style.borderColor = '#D9F56B' 
        }}
        onMouseLeave={e => { 
          (e.currentTarget as HTMLElement).style.background = isValidCaller ? '#F8FAFC' : 'transparent'; 
          (e.currentTarget as HTMLElement).style.borderColor = isValidCaller ? '#E2E8F0' : '1px dashed #CBD5E1' 
        }}
      >
        {isValidCaller ? (
          <>
            {getAvatar(caller!) ? (
              <img
                src={getAvatar(caller!)}
                alt={caller}
                style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', border: '1px solid #E2E8F0', flexShrink: 0 }}
              />
            ) : (
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                background: getAvatarColor(caller!),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8, fontWeight: 700, color: '#0B0B0B', flexShrink: 0
              }}>
                {getInitials(caller!)}
              </div>
            )}
            <span style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {caller}
            </span>
          </>
        ) : (
          <span style={{ color: '#94A3B8', fontSize: 11, fontStyle: 'italic', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <span>+</span> Assign
          </span>
        )}
      </span>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4,
          background: '#FFFFFF', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
          border: '1px solid #E2E8F0', zIndex: 120, minWidth: 190, padding: 6,
          animation: 'fadeIn 0.12s ease',
        }}>
          {/* Search or custom caller input */}
          <div style={{ marginBottom: 6, padding: '2px 4px' }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Filter or type caller..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && search.trim()) {
                  onSave(search.trim())
                  setOpen(false)
                } else if (e.key === 'Escape') {
                  setOpen(false)
                }
              }}
              style={{
                width: '100%', fontSize: 11, padding: '4px 8px',
                border: '1px solid #CBD5E1', borderRadius: 6, outline: 'none',
                background: '#F8FAFC', fontFamily: 'inherit'
              }}
            />
          </div>

          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {/* Clear option */}
            <div
              onClick={() => { onSave(''); setOpen(false) }}
              style={{
                padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
                fontSize: 11, color: '#DC2626', display: 'flex', alignItems: 'center', gap: 6,
                marginBottom: 4, background: '#FEF2F2'
              }}
            >
              <span>✕</span>
              <span>Unassign caller</span>
            </div>

            {/* Custom entered name option */}
            {isCustomMatch && (
              <div
                onClick={() => { onSave(search.trim()); setOpen(false) }}
                style={{
                  padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                  fontSize: 11, fontWeight: 600, color: '#0B0B0B',
                  background: '#D9F56B', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6
                }}
              >
                <span>✓</span>
                <span>Assign as "{search.trim()}"</span>
              </div>
            )}

            {/* Team callers */}
            {filteredTeam.map(c => {
              const isSelected = isValidCaller && c.toLowerCase() === (caller || '').toLowerCase()
              return (
                <div
                  key={c}
                  onClick={() => {
                    onSave(c)
                    setOpen(false)
                  }}
                  style={{
                    padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
                    fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8,
                    background: isSelected ? '#F1F5F9' : 'transparent',
                    transition: 'background 0.1s ease',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F8FAFC' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isSelected ? '#F1F5F9' : 'transparent' }}
                >
                  {getAvatar(c) ? (
                    <img src={getAvatar(c)} alt={c} style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: getAvatarColor(c), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700 }}>
                      {getInitials(c)}
                    </div>
                  )}
                  <span>{c}</span>
                  {isSelected && <span style={{ marginLeft: 'auto', color: '#16A34A', fontSize: 13, fontWeight: 700 }}>✓</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

`;

  code = code.slice(0, startIdx) + newCallerCell + code.slice(endIdx);
  fs.writeFileSync('components/pages/CallingSheetPage.tsx', code, 'utf8');
  console.log('CallerCell updated successfully');
} else {
  console.log('Could not find CallerCell range', startIdx, endIdx);
}
