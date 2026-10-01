'use client'
import { useState, useEffect, useCallback } from 'react'
import type { AppUser } from '@/lib/store'
import { getTasks, addTask, updateTask, deleteTask, getCompanies, getUsers } from '@/lib/store'
import type { Task, Priority, TaskStatus } from '@/lib/types'
import { format, isPast, parseISO } from 'date-fns'
import { getInitials, getAvatarColor } from '@/lib/types'

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'todo', label: 'To Do', color: '#F3F4F6' },
  { id: 'doing', label: 'In Progress', color: '#EFF6FF' },
  { id: 'done', label: 'Done', color: '#F0FDF4' },
]

const PRIORITY_COLORS: Record<Priority, string> = {
  high: '#DC2626',
  medium: '#D97706',
  low: '#16A34A',
}

function TaskCard({ task, onUpdate, onDelete }: { task: Task; onUpdate: (id: string, data: Partial<Task>) => void; onDelete: (id: string) => void }) {
  const isOverdue = task.due_at && isPast(parseISO(task.due_at)) && task.status !== 'done'
  const isDone = task.status === 'done'
  
  return (
    <div className="kanban-card" style={{ opacity: isDone ? 0.65 : 1 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
        {/* Quick complete circle */}
        <button
          onClick={() => onUpdate(task.id, { status: isDone ? 'todo' : 'done' })}
          style={{
            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
            border: `2px solid ${isDone ? '#16A34A' : '#DDD'}`,
            background: isDone ? '#16A34A' : 'transparent',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s', marginTop: 1,
          }}
          title={isDone ? 'Mark as to-do' : 'Mark as done'}
        >
          {isDone && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3, textDecoration: isDone ? 'line-through' : 'none', color: isDone ? '#AAA' : undefined }}>{task.title}</div>
          {task.description && (
            <div style={{ fontSize: 12, color: '#888', marginTop: 4, lineHeight: 1.4 }}>{task.description}</div>
          )}
        </div>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: PRIORITY_COLORS[task.priority], flexShrink: 0, marginTop: 5 }} />
      </div>
      
      {task.company_name && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#F9F9F9', borderRadius: 6, padding: '3px 8px', fontSize: 11, color: '#555', marginBottom: 8 }}>
          🏢 {task.company_name}
        </div>
      )}
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%',
            background: getAvatarColor(task.assignee_name),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 700,
          }}>
            {getInitials(task.assignee_name)}
          </div>
          <span style={{ fontSize: 11, color: '#888' }}>{task.assignee_name}</span>
        </div>
        
        {task.due_at && (
          <span style={{ 
            fontSize: 11, fontWeight: 600,
            color: isOverdue ? '#DC2626' : '#888',
          }}>
            {isOverdue ? '⚠ ' : ''}
            {format(parseISO(task.due_at), 'dd MMM')}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, marginTop: 10, paddingTop: 8, borderTop: '1px solid #F5F5F5' }}>
        {COLUMNS.filter(c => c.id !== task.status).map(col => (
          <button
            key={col.id}
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 11, padding: '3px 8px' }}
            onClick={() => onUpdate(task.id, { status: col.id })}
          >
            → {col.label}
          </button>
        ))}
        <button
          className="btn btn-ghost btn-sm"
          style={{ fontSize: 11, padding: '3px 8px', color: '#DC2626', marginLeft: 'auto' }}
          onClick={() => onDelete(task.id)}
        >
          ×
        </button>
      </div>
    </div>
  )
}

export default function TasksPage({ user }: { user: AppUser }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [showAll, setShowAll] = useState(user.role === 'admin')
  const [newTitle, setNewTitle] = useState('')
  const [newPriority, setNewPriority] = useState<Priority>('medium')
  const [newDue, setNewDue] = useState('')
  const [newAssignee, setNewAssignee] = useState(user.id)
  const [users] = useState(getUsers())

  const loadTasks = useCallback(() => {
    const all = getTasks(showAll ? undefined : user.id)
    setTasks(all)
  }, [showAll, user.id])

  useEffect(() => { loadTasks() }, [loadTasks])

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    const assigneeUser = users.find(u => u.id === newAssignee)
    addTask({
      title: newTitle.trim(),
      assignee_id: newAssignee,
      assignee_name: assigneeUser?.name || user.name,
      priority: newPriority,
      status: 'todo',
      due_at: newDue || undefined,
      created_by: user.id,
    })
    setNewTitle('')
    setNewDue('')
    loadTasks()
  }

  const handleUpdate = (id: string, data: Partial<Task>) => {
    updateTask(id, data)
    loadTasks()
  }

  const handleDelete = (id: string) => {
    deleteTask(id)
    loadTasks()
  }

  const todoCount = tasks.filter(t => t.status === 'todo').length
  const doingCount = tasks.filter(t => t.status === 'doing').length
  const doneCount = tasks.filter(t => t.status === 'done').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <div className="greeting" style={{ fontSize: 18 }}>Tasks</div>
          <div className="greeting-sub">{todoCount} to do · {doingCount} in progress · {doneCount} done</div>
        </div>
        <div className="header-actions">
          {user.role === 'admin' && (
            <button className={`btn btn-ghost btn-sm`} onClick={() => setShowAll(!showAll)}>
              {showAll ? '👥 Team view' : '👤 My tasks'}
            </button>
          )}
          <div className="tab-list" style={{ width: 'auto' }}>
            <button className={`tab-item ${view === 'kanban' ? 'active' : ''}`} onClick={() => setView('kanban')}>Kanban</button>
            <button className={`tab-item ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>List</button>
          </div>
        </div>
      </div>

      {/* Quick add */}
      <form onSubmit={handleAddTask} style={{ 
        padding: '10px 20px', borderBottom: '1px solid #F0F0F0',
        display: 'flex', gap: 8, flexShrink: 0,
      }}>
        <input
          className="input"
          placeholder="+ Quick add task…"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          style={{ flex: 1 }}
        />
        <div className="select-wrap">
          <select value={newPriority} onChange={e => setNewPriority(e.target.value as Priority)}>
            <option value="high">🔴 High</option>
            <option value="medium">🟡 Medium</option>
            <option value="low">🟢 Low</option>
          </select>
        </div>
        {user.role === 'admin' && (
          <div className="select-wrap">
            <select value={newAssignee} onChange={e => setNewAssignee(e.target.value)}>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}
        <input type="date" className="input" style={{ width: 140 }} value={newDue} onChange={e => setNewDue(e.target.value)} />
        <button className="btn btn-primary" type="submit">Add</button>
      </form>

      {/* Kanban / List view */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {view === 'kanban' ? (
          <div style={{ display: 'flex', gap: 12, height: '100%', alignItems: 'flex-start' }}>
            {COLUMNS.map(col => {
              const colTasks = tasks.filter(t => t.status === col.id)
              return (
                <div key={col.id} className="kanban-column" style={{ background: col.color }}>
                  <div style={{ 
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                    marginBottom: 4, paddingBottom: 8, borderBottom: '1px solid rgba(0,0,0,0.06)'
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{col.label}</div>
                    <span style={{ 
                      width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.08)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700,
                    }}>{colTasks.length}</span>
                  </div>
                  {colTasks.length === 0 ? (
                    <div className="empty-state" style={{ padding: '20px 0', fontSize: 12 }}>
                      <div style={{ fontSize: 20 }}>✓</div>
                      {col.id === 'done' ? 'All done!' : 'Nothing here'}
                    </div>
                  ) : (
                    colTasks.map(task => (
                      <TaskCard key={task.id} task={task} onUpdate={handleUpdate} onDelete={handleDelete} />
                    ))
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tasks.length === 0 ? (
              <div className="empty-state">
                <div style={{ fontSize: 32 }}>🎉</div>
                <div style={{ fontWeight: 600 }}>No tasks yet</div>
                <div style={{ fontSize: 13, color: '#888' }}>Use the quick-add bar above</div>
              </div>
            ) : tasks.map(task => {
              const isOverdue = task.due_at && isPast(parseISO(task.due_at)) && task.status !== 'done'
              return (
                <div key={task.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 12,
                  border: `1px solid ${isOverdue ? '#FECACA' : '#F0F0F0'}`,
                  background: isOverdue ? '#FFF5F5' : 'white',
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: PRIORITY_COLORS[task.priority], flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 13, textDecoration: task.status === 'done' ? 'line-through' : 'none', color: task.status === 'done' ? '#AAA' : undefined }}>
                      {task.title}
                    </div>
                    {task.company_name && <div style={{ fontSize: 11, color: '#888' }}>🏢 {task.company_name}</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: getAvatarColor(task.assignee_name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>
                      {getInitials(task.assignee_name)}
                    </div>
                    <span style={{ fontSize: 11, color: '#888' }}>{task.assignee_name}</span>
                  </div>
                  {task.due_at && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: isOverdue ? '#DC2626' : '#888' }}>
                      {isOverdue ? '⚠ ' : ''}{format(parseISO(task.due_at), 'dd MMM')}
                    </span>
                  )}
                  <div className="select-wrap">
                    <select value={task.status} onChange={e => handleUpdate(task.id, { status: e.target.value as TaskStatus })} style={{ fontSize: 11 }}>
                      <option value="todo">To Do</option>
                      <option value="doing">In Progress</option>
                      <option value="done">Done</option>
                    </select>
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{ color: '#DC2626', padding: '3px 8px' }} onClick={() => handleDelete(task.id)}>×</button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
