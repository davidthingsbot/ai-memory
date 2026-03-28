import { useEffect, useRef, useState } from 'react'

interface BlinkingCursorProps {
  visible: boolean
  recording?: boolean
}

export function BlinkingCursor({ visible, recording = false }: BlinkingCursorProps) {
  const cursorRef = useRef<HTMLSpanElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number; height: number } | null>(null)

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

      // Only show cursor for collapsed caret, not text selections
      if (!selection.isCollapsed) {
        setPosition(null)
        return
      }

      const range = selection.getRangeAt(0)
      const rects = range.getClientRects()
      if (rects.length > 0) {
        setPosition({ top: rects[0].top, left: rects[0].left, height: rects[0].height })
      } else {
        // Fallback for positions between block elements
        const rect = range.getBoundingClientRect()
        if (rect.height > 0) {
          setPosition({ top: rect.top, left: rect.left, height: rect.height })
        } else {
          setPosition(null)
        }
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
        height: position.height,
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
