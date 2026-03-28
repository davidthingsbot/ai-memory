import { useEffect, useRef, useState } from 'react'

interface BlinkingCursorProps {
  visible: boolean
  recording?: boolean
}

export function BlinkingCursor({ visible, recording = false }: BlinkingCursorProps) {
  const cursorRef = useRef<HTMLSpanElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!visible) {
      setPosition(null)
      return
    }

    const updatePosition = () => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) {
        setPosition(null)
        return
      }

      const range = selection.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      
      if (rect.width === 0 && rect.height === 0) {
        // Collapsed selection (just a cursor position) - use caret position
        const caretRect = range.getClientRects()[0]
        if (caretRect) {
          setPosition({ top: caretRect.top, left: caretRect.left })
        }
      } else {
        // Selection exists - put cursor at end
        setPosition({ top: rect.top, left: rect.right })
      }
    }

    // Update on selection change
    document.addEventListener('selectionchange', updatePosition)
    updatePosition()

    return () => {
      document.removeEventListener('selectionchange', updatePosition)
    }
  }, [visible])

  if (!visible || !position) return null

  return (
    <span
      ref={cursorRef}
      className="fixed pointer-events-none z-50 flex items-center"
      style={{
        top: position.top,
        left: position.left,
        height: '1.2em',
      }}
    >
      {/* Blinking cursor line */}
      <span 
        className={`
          w-0.5 h-full 
          ${recording ? 'bg-red-500' : 'bg-foreground'}
          animate-blink
        `}
      />
      {/* Recording indicator */}
      {recording && (
        <span className="ml-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
      )}
    </span>
  )
}
