import { getOpenAIKey } from '@/components/Credentials'

let mediaRecorder: MediaRecorder | null = null
let audioChunks: Blob[] = []
let stream: MediaStream | null = null

/**
 * Start recording audio from the microphone
 */
export async function startRecording(): Promise<void> {
  // Get microphone access
  stream = await navigator.mediaDevices.getUserMedia({ 
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
    }
  })

  // Create MediaRecorder
  mediaRecorder = new MediaRecorder(stream, {
    mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
  })

  audioChunks = []

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      audioChunks.push(event.data)
    }
  }

  mediaRecorder.start(100) // Collect data every 100ms
}

/**
 * Stop recording and return the audio blob
 */
export function stopRecording(): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!mediaRecorder) {
      reject(new Error('No recording in progress'))
      return
    }

    // Request any remaining data before stopping
    if (mediaRecorder.state === 'recording') {
      mediaRecorder.requestData()
    }

    mediaRecorder.onstop = () => {
      const mimeType = mediaRecorder?.mimeType || 'audio/webm'
      const audioBlob = new Blob(audioChunks, { type: mimeType })
      
      // Clean up
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
        stream = null
      }
      mediaRecorder = null
      
      // Check if we actually got any audio
      if (audioBlob.size < 1000) {
        audioChunks = []
        reject(new Error('Recording too short. Hold the button longer.'))
        return
      }

      audioChunks = []
      resolve(audioBlob)
    }

    mediaRecorder.onerror = () => {
      reject(new Error('Recording error'))
    }

    mediaRecorder.stop()
  })
}

/**
 * Cancel recording without returning audio
 */
export function cancelRecording(): void {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
  if (stream) {
    stream.getTracks().forEach(track => track.stop())
    stream = null
  }
  mediaRecorder = null
  audioChunks = []
}

/**
 * Check if currently recording
 */
export function isRecording(): boolean {
  return mediaRecorder?.state === 'recording'
}

/**
 * Transcribe audio using OpenAI Whisper API
 */
export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const apiKey = getOpenAIKey()
  if (!apiKey) throw new Error('No OpenAI API key')

  // Create form data with the audio file
  const formData = new FormData()
  
  // Determine file extension from mime type
  const ext = audioBlob.type.includes('webm') ? 'webm' : 
              audioBlob.type.includes('mp4') ? 'mp4' : 
              audioBlob.type.includes('wav') ? 'wav' : 'webm'
  
  formData.append('file', audioBlob, `recording.${ext}`)
  formData.append('model', 'whisper-1')
  formData.append('language', 'en') // Can make this configurable

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Transcription failed: ${error}`)
  }

  const data = await response.json()
  return data.text
}

/**
 * Record audio and transcribe in one call
 * Returns a controller to stop recording
 */
export function recordAndTranscribe(
  onTranscript: (text: string) => void,
  onError: (error: Error) => void
): { stop: () => void; cancel: () => void } {
  
  startRecording().catch(onError)

  return {
    stop: async () => {
      try {
        const blob = await stopRecording()
        const text = await transcribeAudio(blob)
        onTranscript(text)
      } catch (err) {
        onError(err instanceof Error ? err : new Error('Transcription failed'))
      }
    },
    cancel: () => {
      cancelRecording()
    }
  }
}
