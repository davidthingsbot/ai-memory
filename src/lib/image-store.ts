/**
 * Image Store - Holds staged images until commit
 * 
 * Images are stored as data URLs and can be referenced in markdown previews.
 * On commit, they're converted to base64 for the GitHub API.
 */

export interface StagedImage {
  path: string        // e.g., "docs/images/diagram.png"
  dataUrl: string     // data:image/png;base64,...
  mimeType: string    // image/png, image/jpeg, etc.
  size: number        // bytes
  name: string        // original filename
}

// In-memory store for staged images
const stagedImages: Map<string, StagedImage> = new Map()

// Listeners for changes
const listeners: Set<() => void> = new Set()

export function addStagedImage(image: StagedImage): void {
  stagedImages.set(image.path, image)
  notifyListeners()
}

export function removeStagedImage(path: string): void {
  stagedImages.delete(path)
  notifyListeners()
}

export function getStagedImage(path: string): StagedImage | undefined {
  return stagedImages.get(path)
}

export function getAllStagedImages(): StagedImage[] {
  return Array.from(stagedImages.values())
}

export function clearStagedImages(): void {
  stagedImages.clear()
  notifyListeners()
}

export function hasStagedImages(): boolean {
  return stagedImages.size > 0
}

// Check if a relative path matches a staged image
// Handles paths like "images/foo.png" or "./images/foo.png"
export function findStagedImageByRelativePath(relativePath: string, basePath: string): StagedImage | undefined {
  // Normalize the relative path
  let normalizedPath = relativePath
  if (relativePath.startsWith('./')) {
    normalizedPath = relativePath.slice(2)
  }
  
  // Try full path from base
  const fullPath = basePath ? `${basePath}/${normalizedPath}` : normalizedPath
  if (stagedImages.has(fullPath)) {
    return stagedImages.get(fullPath)
  }
  
  // Try just the normalized path
  if (stagedImages.has(normalizedPath)) {
    return stagedImages.get(normalizedPath)
  }
  
  // Try matching just the filename across all staged images
  const filename = normalizedPath.split('/').pop()
  for (const image of stagedImages.values()) {
    if (image.path.endsWith(`/${filename}`) || image.path === filename) {
      return image
    }
  }
  
  return undefined
}

// Subscribe to changes
export function subscribeToImageStore(callback: () => void): () => void {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

function notifyListeners(): void {
  listeners.forEach(cb => cb())
}

// Convert data URL to base64 content (for GitHub API)
export function dataUrlToBase64(dataUrl: string): string {
  const base64Match = dataUrl.match(/^data:[^;]+;base64,(.+)$/)
  return base64Match ? base64Match[1] : ''
}

// Read a File object and create a StagedImage
export async function fileToStagedImage(file: File, targetDir: string): Promise<StagedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const path = `${targetDir}/${file.name}`.replace(/^\/+/, '').replace(/\/+/g, '/')
      resolve({
        path,
        dataUrl,
        mimeType: file.type,
        size: file.size,
        name: file.name,
      })
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

// Get file extension from mime type
export function mimeToExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
  }
  return map[mimeType] || 'png'
}
