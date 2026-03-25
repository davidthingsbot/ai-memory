/**
 * PCM16 audio utilities for the OpenAI Realtime API.
 * 
 * The Realtime API sends/receives PCM16 audio at 24kHz,
 * encoded as base64 strings over WebSocket. Browsers capture audio as Float32
 * at the AudioContext's sample rate (typically 48kHz).
 */

/**
 * Convert Float32 samples [-1.0, 1.0] to PCM16 Int16 samples [-32768, 32767].
 */
export function float32ToPcm16(float32Array: Float32Array): Int16Array {
  const len = float32Array.length
  const result = new Int16Array(len)
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]))
    result[i] = s < 0 ? s * 32768 : s * 32767
  }
  return result
}

/**
 * Convert PCM16 Int16 samples to Float32 samples.
 */
export function pcm16ToFloat32(int16Array: Int16Array): Float32Array {
  const len = int16Array.length
  const result = new Float32Array(len)
  for (let i = 0; i < len; i++) {
    result[i] = int16Array[i] / 32768
  }
  return result
}

/**
 * Encode an Int16Array as a base64 string for WebSocket transport.
 */
export function pcm16ToBase64(int16Array: Int16Array): string {
  const bytes = new Uint8Array(int16Array.buffer, int16Array.byteOffset, int16Array.byteLength)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Decode a base64 string to an Int16Array.
 */
export function base64ToPcm16(base64String: string): Int16Array {
  if (!base64String) return new Int16Array(0)
  const binary = atob(base64String)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Int16Array(bytes.buffer)
}

/**
 * Downsample Float32 audio from one sample rate to another using linear interpolation.
 * Typically used to convert 48kHz browser audio to 24kHz for the Realtime API.
 */
export function downsample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (samples.length === 0) return new Float32Array(0)
  if (fromRate === toRate) return new Float32Array(samples)

  const ratio = fromRate / toRate
  const outLength = Math.round(samples.length / ratio)
  const result = new Float32Array(outLength)

  for (let i = 0; i < outLength; i++) {
    const srcIndex = i * ratio
    const lo = Math.floor(srcIndex)
    const hi = Math.min(lo + 1, samples.length - 1)
    const frac = srcIndex - lo
    result[i] = samples[lo] * (1 - frac) + samples[hi] * frac
  }

  return result
}
