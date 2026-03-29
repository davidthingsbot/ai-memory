import { useState, useRef, useCallback } from 'react'
import { startRecording, stopRecording, transcribeAudio } from './audio-transcribe'

interface UseWhisperTranscriptionOptions {
  onTranscriptInsert?: (newText: string, insertPosition: number) => void
}

interface UseWhisperTranscriptionReturn {
  isRecording: boolean
  isConnecting: boolean  // true while transcribing (after recording stops)
  isSpeaking: boolean
  error: string | null
  startRecording: (cursorPosition: number) => void
  stopRecording: () => void
}

/**
 * Hook for transcription using the standard Whisper API.
 * Records audio, then transcribes when stopped.
 * Same interface as useRealtimeTranscription for drop-in replacement.
 */
export function useWhisperTranscription(
  options: UseWhisperTranscriptionOptions = {}
): UseWhisperTranscriptionReturn {
  const { onTranscriptInsert } = options

  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const insertPositionRef = useRef<number>(0)
  const onTranscriptInsertRef = useRef(onTranscriptInsert)
  onTranscriptInsertRef.current = onTranscriptInsert

  const handleStartRecording = useCallback((cursorPosition: number) => {
    setError(null)
    insertPositionRef.current = cursorPosition

    startRecording()
      .then(() => {
        setIsRecording(true)
        console.log('[whisper] Recording started')
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to start recording')
      })
  }, [])

  const handleStopRecording = useCallback(async () => {
    setIsRecording(false)
    setIsTranscribing(true)
    console.log('[whisper] Recording stopped, transcribing...')

    try {
      const blob = await stopRecording()
      const text = await transcribeAudio(blob)
      console.log('[whisper] Transcription:', text)
      if (text.trim()) {
        onTranscriptInsertRef.current?.(text, insertPositionRef.current)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transcription failed'
      console.error('[whisper] Error:', msg)
      // Don't show "too short" as an error — just ignore it
      if (!msg.includes('too short')) {
        setError(msg)
      }
    } finally {
      setIsTranscribing(false)
    }
  }, [])

  return {
    isRecording,
    isConnecting: isTranscribing,
    isSpeaking: isRecording,
    error,
    startRecording: handleStartRecording,
    stopRecording: handleStopRecording,
  }
}
