import { useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Mic } from 'lucide-react'

interface MicButtonProps {
  recording: boolean
  transcribing: boolean
  disabled?: boolean
  onRecordingChange: (recording: boolean) => void
  size?: 'sm' | 'default' | 'icon'
  className?: string
  showStatus?: boolean // Show status text next to button
}

export function MicButton({
  recording,
  transcribing,
  disabled,
  onRecordingChange,
  size = 'icon',
  className = '',
  showStatus = true,
}: MicButtonProps) {
  const isHoldMode = useRef(false)
  const recordStartTime = useRef(0)

  const handleClick = useCallback(() => {
    if (disabled || transcribing) return
    
    if (recording) {
      // Stop recording
      isHoldMode.current = false
      onRecordingChange(false)
    } else {
      // Start recording
      isHoldMode.current = false
      recordStartTime.current = Date.now()
      onRecordingChange(true)
    }
  }, [disabled, transcribing, recording, onRecordingChange])

  const handleMouseDown = useCallback(() => {
    isHoldMode.current = true
    recordStartTime.current = Date.now()
  }, [])

  const handleMouseUp = useCallback(() => {
    if (isHoldMode.current && recording) {
      const duration = Date.now() - recordStartTime.current
      if (duration > 300) {
        onRecordingChange(false)
      }
    }
  }, [recording, onRecordingChange])

  const handleMouseLeave = useCallback(() => {
    if (isHoldMode.current && recording) {
      onRecordingChange(false)
    }
  }, [recording, onRecordingChange])

  const baseClasses = 'transition-all duration-150'
  const colorClasses = recording
    ? 'bg-red-600 hover:bg-red-700 text-white border-red-600'
    : 'bg-muted hover:bg-muted/80 text-muted-foreground border-border'

  const statusText = transcribing
    ? 'Transcribing...'
    : recording
      ? 'Recording... tap to stop'
      : null

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size={size}
        disabled={disabled}
        onClick={handleClick}
        onMouseDown={(e) => { e.preventDefault(); handleMouseDown() }}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={(e) => { e.preventDefault(); handleMouseDown(); handleClick() }}
        onTouchEnd={(e) => { e.preventDefault(); handleMouseUp() }}
        className={`${baseClasses} ${colorClasses} ${className}`}
        title="Tap to start/stop or hold to record"
        tabIndex={-1}
      >
        <span className="relative flex items-center justify-center">
          <Mic className="h-4 w-4" />
          {transcribing && (
            <span className="absolute inset-[-4px] rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />
          )}
        </span>
      </Button>
      {showStatus && statusText && (
        <span className="text-xs text-muted-foreground animate-pulse">
          {statusText}
        </span>
      )}
    </div>
  )
}
