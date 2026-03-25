import { useState, useEffect, useRef } from 'react'
import { Loader2, ChevronDown, ChevronRight, Clock, Zap } from 'lucide-react'

interface WorkingBoxProps {
  steps: string[]
  isWorking: boolean
  startTime?: number  // Timestamp when work started
}

export function WorkingBox({ steps, isWorking, startTime }: WorkingBoxProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isExpanded, setIsExpanded] = useState(true)
  const [elapsedMs, setElapsedMs] = useState(0)

  // Auto-expand when working starts
  useEffect(() => {
    if (isWorking) {
      setIsExpanded(true)
    }
  }, [isWorking])

  // Track elapsed time while working
  useEffect(() => {
    if (!isWorking || !startTime) {
      return
    }
    
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startTime)
    }, 100)
    
    return () => clearInterval(interval)
  }, [isWorking, startTime])

  // Auto-scroll to bottom when new steps arrive
  useEffect(() => {
    if (scrollRef.current && isExpanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [steps, isExpanded])

  // Auto-collapse after completion with a short delay
  useEffect(() => {
    if (!isWorking && steps.length > 0) {
      const timer = setTimeout(() => {
        setIsExpanded(false)
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [isWorking, steps.length])

  if (steps.length === 0 && !isWorking) return null

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const tenths = Math.floor((ms % 1000) / 100)
    return `${seconds}.${tenths}s`
  }

  return (
    <div className="rounded-lg border bg-muted/30 overflow-hidden">
      {/* Header - clickable to toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 border-b bg-muted/50 hover:bg-muted/70 transition-colors text-left"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        
        {isWorking ? (
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        ) : (
          <Zap className="h-4 w-4 text-green-600 shrink-0" />
        )}
        
        <span className="text-sm font-medium flex-1">
          {isWorking ? 'Working...' : 'AI Work Complete'}
        </span>

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatTime(elapsedMs)}
          </span>
          <span>{steps.length} step{steps.length !== 1 ? 's' : ''}</span>
        </div>
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div 
          ref={scrollRef}
          className="max-h-48 overflow-y-auto p-2 text-xs font-mono text-muted-foreground space-y-1"
        >
          {steps.map((step, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-muted-foreground/50 select-none shrink-0">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="break-words">{step}</span>
            </div>
          ))}
          {isWorking && steps.length > 0 && (
            <div className="flex gap-2 animate-pulse">
              <span className="text-muted-foreground/50 select-none shrink-0">
                {String(steps.length + 1).padStart(2, '0')}
              </span>
              <span>...</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
