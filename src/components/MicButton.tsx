import { useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Mic, Loader2 } from 'lucide-react'

interface MicButtonProps {
  recording: boolean
  transcribing: boolean
  disabled?: boolean
  onRecordingChange: (recording: boolean) => void
  size?: 'sm' | 'default' | 'icon'
  className?: string
}

export function MicButton({
  recording,
  transcribing,
  disabled,
  onRecordingChange,
  size = 'icon',
  className = '',
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

  // Red colors: idle = muted red, recording = bright red
  const baseClasses = 'transition-all duration-150'
  const colorClasses = recording
    ? 'bg-red-600 hover:bg-red-700 text-white border-red-600 shadow-lg shadow-red-500/30'
    : 'bg-red-100 hover:bg-red-200 text-red-600 border-red-200 dark:bg-red-950 dark:hover:bg-red-900 dark:text-red-400 dark:border-red-800'

  return (
    <Button
      variant="outline"
      size={size}
      disabled={disabled || transcribing}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={(e) => { e.preventDefault(); handleMouseDown(); handleClick() }}
      onTouchEnd={(e) => { e.preventDefault(); handleMouseUp() }}
      className={`${baseClasses} ${colorClasses} ${recording ? 'animate-pulse' : ''} ${className}`}
      title="Tap to start/stop or hold to record"
    >
      {transcribing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </Button>
  )
}
