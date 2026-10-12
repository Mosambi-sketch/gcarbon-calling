import React from 'react'
import { Lock, AlertCircle } from 'lucide-react'

interface Props {
  lockedBy: string
  lockedByColor?: string
}

export default function LeadLockBanner({ lockedBy, lockedByColor }: Props) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-amber-900 dark:text-amber-200 text-sm shadow-sm animate-fadeIn">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/60 flex items-center justify-center text-amber-700 dark:text-amber-300">
        <Lock size={16} />
      </div>
      <div className="flex-1">
        <p className="font-semibold text-xs flex items-center gap-1.5">
          <span>In-Use by {lockedBy}</span>
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: lockedByColor || '#F59E0B' }}
          />
        </p>
        <p className="text-[11px] text-amber-700 dark:text-amber-300/80">
          This lead is currently being handled by {lockedBy}. Form fields are restricted to view-only mode to prevent duplicate calls.
        </p>
      </div>
      <div className="flex-shrink-0">
        <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-amber-200/60 dark:bg-amber-900/80 text-amber-800 dark:text-amber-200">
          Locked
        </span>
      </div>
    </div>
  )
}
