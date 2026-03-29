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
      // Dedicated transcription session (GA format — no response generation)
      const url = `${REALTIME_URL}?intent=transcription`
      ws = new WebSocket(url, [
        'realtime',
        `openai-insecure-api-key.${apiKey}`,
      ])

      ws.onopen = async () => {
        connected = true
        console.log('[voice] WebSocket connected (transcription session)')

        const sessionConfig = {
          type: 'session.update',
          session: {
            type: 'transcription',
            audio: {
              input: {
                format: { type: 'audio/pcm', rate: 24000 },
                transcription: {
                  model: 'gpt-4o-transcribe',
                  language: 'en',
                },
                noise_reduction: { type: 'near_field' },
                turn_detection: {
                  type: 'server_vad',
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 500,
                },
              },
            },
          },
        }
        console.log('[voice] Sending session config:', sessionConfig)
        ws?.send(JSON.stringify(sessionConfig))

        // Set up audio capture
        try {
          audioContext = new AudioContext()
          mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })

          const actualRate = audioContext.sampleRate
          const source = audioContext.createMediaStreamSource(mediaStream)
          processor = audioContext.createScriptProcessor(4096, 1, 1)

          processor.onaudioprocess = (e) => {
            if (!connected || !ws || ws.readyState !== WebSocket.OPEN) return

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

          console.log(`[voice] Audio capture started (sample rate: ${actualRate}Hz, downsampling to 24kHz)`)
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

        // Log all non-audio messages
        console.log('[voice] <<', data.type, data.type === 'error' ? data.error : '')

        switch (data.type) {
          case 'session.created':
          case 'session.updated':
            console.log('[voice] Session:', JSON.stringify(data.session || data, null, 2).slice(0, 500))
            break

          case 'input_audio_buffer.speech_started':
            callbacks.onSpeechStarted?.()
            break

          case 'input_audio_buffer.speech_stopped':
            callbacks.onSpeechStopped?.()
            break

          // Streaming transcript delta
          case 'conversation.item.input_audio_transcription.delta':
            console.log('[voice] delta:', JSON.stringify(data.delta || ''))
            transcriptAcc += data.delta || ''
            callbacks.onTranscriptDelta?.(data.delta || '')
            break

          // Final transcript
          case 'conversation.item.input_audio_transcription.completed': {
            const finalText = data.transcript || transcriptAcc
            console.log('[voice] complete:', JSON.stringify(finalText))
            transcriptAcc = ''
            callbacks.onTranscriptComplete?.(finalText)
            break
          }

          case 'error':
            console.error('[voice] ERROR:', data.error)
            callbacks.onError?.(data.error?.message || 'Unknown error')
            break
        }
      }

      ws.onclose = (event) => {
        console.log(`[voice] WebSocket closed (code: ${event.code}, reason: ${event.reason || 'none'})`)
        connected = false
        cleanup()
        callbacks.onDisconnected?.()
      }

      ws.onerror = (event) => {
        console.error('[voice] WebSocket error:', event)
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
