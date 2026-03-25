import { useState, useRef, useCallback } from 'react'
import { createTranscriptionSession, type TranscriptionSession } from './realtime-transcription'
import { getOpenAIKey } from '@/components/Credentials'

interface UseRealtimeTranscriptionOptions {
  onTranscriptUpdate?: (fullText: string) => void
}

interface UseRealtimeTranscriptionReturn {
  isRecording: boolean
  isConnecting: boolean
  isSpeaking: boolean
  error: string | null
  startRecording: () => void
  stopRecording: () => void
}

/**
 * Hook for real-time transcription using OpenAI Realtime API.
 * 
 * @param onTranscriptUpdate - Called with the accumulated transcript as it grows
 */
export function useRealtimeTranscription(
  options: UseRealtimeTranscriptionOptions = {}
): UseRealtimeTranscriptionReturn {
  const { onTranscriptUpdate } = options
  
  const [isRecording, setIsRecording] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const sessionRef = useRef<TranscriptionSession | null>(null)
  const transcriptRef = useRef<string>('')
  const onTranscriptUpdateRef = useRef(onTranscriptUpdate)
  
  // Keep callback ref updated
  onTranscriptUpdateRef.current = onTranscriptUpdate

  const startRecording = useCallback(() => {
    const apiKey = getOpenAIKey()
    if (!apiKey) {
      setError('No OpenAI API key configured')
      return
    }

    setError(null)
    setIsConnecting(true)
    transcriptRef.current = ''

    const session = createTranscriptionSession(apiKey, {
      onConnected: () => {
        setIsConnecting(false)
        setIsRecording(true)
      },
      onDisconnected: () => {
        setIsRecording(false)
        setIsConnecting(false)
        setIsSpeaking(false)
      },
      onError: (err) => {
        setError(err)
        setIsRecording(false)
        setIsConnecting(false)
      },
      onSpeechStarted: () => {
        setIsSpeaking(true)
      },
      onSpeechStopped: () => {
        setIsSpeaking(false)
      },
      onTranscriptDelta: (delta) => {
        transcriptRef.current += delta
        onTranscriptUpdateRef.current?.(transcriptRef.current)
      },
      onTranscriptComplete: (transcript) => {
        // Use the complete transcript if different from accumulated
        if (transcript && transcript !== transcriptRef.current) {
          transcriptRef.current = transcript
          onTranscriptUpdateRef.current?.(transcript)
        }
        // Add a space for the next utterance
        transcriptRef.current += ' '
      },
    })

    sessionRef.current = session
  }, [])

  const stopRecording = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.disconnect()
      sessionRef.current = null
    }
    setIsRecording(false)
    setIsConnecting(false)
    setIsSpeaking(false)
  }, [])

  return {
    isRecording,
    isConnecting,
    isSpeaking,
    error,
    startRecording,
    stopRecording,
  }
}
