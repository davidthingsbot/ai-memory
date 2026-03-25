/**
 * OpenAI Realtime API session for transcription only.
 * 
 * Connects via WebSocket, streams audio, receives real-time transcription.
 * No AI responses - just speech-to-text.
 */

import { float32ToPcm16, pcm16ToBase64, downsample } from './pcm-audio'

const REALTIME_URL = 'wss://api.openai.com/v1/realtime'

export interface TranscriptionCallbacks {
  onConnected?: () => void
  onDisconnected?: () => void
  onError?: (error: string) => void
  onTranscriptDelta?: (delta: string) => void
  onTranscriptComplete?: (transcript: string) => void
  onSpeechStarted?: () => void
  onSpeechStopped?: () => void
}

export interface TranscriptionSession {
  disconnect: () => void
  isConnected: () => boolean
}

/**
 * Create a transcription-only session with the Realtime API.
 */
export function createTranscriptionSession(
  apiKey: string,
  callbacks: TranscriptionCallbacks
): TranscriptionSession {
  let connected = false
  let ws: WebSocket | null = null
  let audioContext: AudioContext | null = null
  let mediaStream: MediaStream | null = null
  let processor: ScriptProcessorNode | null = null
  let transcriptAcc = ''

  const cleanup = () => {
    if (processor) {
      processor.disconnect()
      processor = null
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop())
      mediaStream = null
    }
    if (audioContext) {
      audioContext.close().catch(() => {})
      audioContext = null
    }
  }

  const connect = async () => {
    try {
      // Create WebSocket connection
      const url = `${REALTIME_URL}?model=gpt-4o-realtime-preview`
      ws = new WebSocket(url, [
        'realtime',
        `openai-insecure-api-key.${apiKey}`,
      ])

      ws.onopen = async () => {
        connected = true

        // Configure session for transcription
        ws?.send(JSON.stringify({
          type: 'session.update',
          session: {
            type: 'realtime',
            instructions: 'Transcribe speech only. Do not respond.',
            tools: [],
            audio: {
              input: {
                format: { type: 'audio/pcm', rate: 24000 },
                transcription: { model: 'whisper-1' },
                turn_detection: {
                  type: 'server_vad',
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 500,
                },
              },
              output: {
                format: { type: 'audio/pcm', rate: 24000 },
                voice: 'alloy',
              },
            },
          },
        }))

        // Set up audio capture
        try {
          audioContext = new AudioContext()
          mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
          
          const actualRate = audioContext.sampleRate
          const source = audioContext.createMediaStreamSource(mediaStream)
          processor = audioContext.createScriptProcessor(4096, 1, 1)

          processor.onaudioprocess = (e) => {
            if (!connected || !ws) return
            
            const inputData = e.inputBuffer.getChannelData(0)
            // Downsample to 24kHz if needed
            const samples = actualRate !== 24000
              ? downsample(inputData, actualRate, 24000)
              : inputData
            const pcm16 = float32ToPcm16(samples)
            const base64 = pcm16ToBase64(pcm16)
            
            ws.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: base64,
            }))
          }

          source.connect(processor)
          processor.connect(audioContext.destination)
          
          callbacks.onConnected?.()
        } catch (err) {
          callbacks.onError?.('Failed to access microphone')
          disconnect()
        }
      }

      ws.onmessage = (event) => {
        let data
        try {
          data = JSON.parse(event.data)
        } catch {
          return
        }

        switch (data.type) {
          case 'input_audio_buffer.speech_started':
            callbacks.onSpeechStarted?.()
            break

          case 'input_audio_buffer.speech_stopped':
            callbacks.onSpeechStopped?.()
            break

          // Streaming transcript delta
          case 'conversation.item.input_audio_transcription.delta':
            transcriptAcc += data.delta || ''
            callbacks.onTranscriptDelta?.(data.delta || '')
            break

          // Final transcript
          case 'conversation.item.input_audio_transcription.completed':
            const finalText = data.transcript || transcriptAcc
            transcriptAcc = ''
            callbacks.onTranscriptComplete?.(finalText)
            break

          case 'error':
            console.error('[realtime-transcription] error:', data.error)
            callbacks.onError?.(data.error?.message || 'Unknown error')
            break
        }
      }

      ws.onclose = () => {
        connected = false
        cleanup()
        callbacks.onDisconnected?.()
      }

      ws.onerror = () => {
        callbacks.onError?.('WebSocket connection failed')
      }

    } catch (err) {
      callbacks.onError?.(err instanceof Error ? err.message : 'Connection failed')
      cleanup()
    }
  }

  const disconnect = () => {
    connected = false
    if (ws) {
      ws.close()
      ws = null
    }
    cleanup()
  }

  // Start connection immediately
  connect()

  return {
    disconnect,
    isConnected: () => connected,
  }
}
