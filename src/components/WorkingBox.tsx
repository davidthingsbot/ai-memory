import { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'

interface WorkingBoxProps {
  steps: string[]
  isWorking: boolean
}

export function WorkingBox({ steps, isWorking }: WorkingBoxProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new steps arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [steps])

  if (steps.length === 0 && !isWorking) return null

  return (
    <div className="rounded-lg border bg-muted/30 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/50">
        {isWorking && <Loader2 className="h-4 w-4 animate-spin" />}
        <span className="text-sm font-medium">
          {isWorking ? 'Working...' : 'Completed'}
        </span>
      </div>
      <div 
        ref={scrollRef}
        className="max-h-32 overflow-y-auto p-2 text-xs font-mono text-muted-foreground space-y-1"
      >
        {steps.map((step, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-muted-foreground/50 select-none">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span>{step}</span>
          </div>
        ))}
        {isWorking && steps.length > 0 && (
          <div className="flex gap-2 animate-pulse">
            <span className="text-muted-foreground/50 select-none">
              {String(steps.length + 1).padStart(2, '0')}
            </span>
            <span>...</span>
          </div>
        )}
      </div>
    </div>
  )
}
