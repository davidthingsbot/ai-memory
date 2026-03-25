/**
 * ImageUpload - Component for adding images to the changeset
 * 
 * Supports:
 * - File picker
 * - Drag and drop
 * - Paste from clipboard
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { 
  addStagedImage, 
  removeStagedImage, 
  getAllStagedImages, 
  fileToStagedImage,
  subscribeToImageStore,
  type StagedImage 
} from '@/lib/image-store'
import { ImagePlus, X, Image as ImageIcon, ChevronDown, ChevronRight } from 'lucide-react'

interface ImageUploadProps {
  targetDir: string  // Where images will be placed (e.g., "docs/images")
}

export function ImageUpload({ targetDir }: ImageUploadProps) {
  const [images, setImages] = useState<StagedImage[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Subscribe to image store changes
  useEffect(() => {
    const update = () => setImages(getAllStagedImages())
    update() // Initial load
    return subscribeToImageStore(update)
  }, [])

  // Handle file selection
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(f => f.type.startsWith('image/'))
    
    for (const file of fileArray) {
      try {
        const staged = await fileToStagedImage(file, targetDir)
        addStagedImage(staged)
      } catch (err) {
        console.error('Failed to stage image:', err)
      }
    }
  }, [targetDir])

  // File input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files)
      e.target.value = '' // Reset for re-upload of same file
    }
  }, [handleFiles])

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files)
    }
  }, [handleFiles])

  // Paste handler (for clipboard images)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      
      const imageItems = Array.from(items).filter(item => item.type.startsWith('image/'))
      if (imageItems.length === 0) return
      
      // Only handle if we're focused on this component area
      const files = imageItems.map(item => item.getAsFile()).filter((f): f is File => f !== null)
      if (files.length > 0) {
        handleFiles(files)
      }
    }
    
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [handleFiles])

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (images.length === 0) {
    return (
      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
          isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleInputChange}
          className="hidden"
        />
        <ImagePlus className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground mb-2">
          Drag images here, paste from clipboard, or
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          Choose Files
        </Button>
        <p className="text-xs text-muted-foreground mt-2">
          Images will be added to: {targetDir}/
        </p>
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-left bg-muted/50 hover:bg-muted/70 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        <ImageIcon className="h-4 w-4 shrink-0" />
        <span className="flex-1">Staged Images</span>
        <span className="text-xs text-muted-foreground">
          {images.length} image{images.length !== 1 ? 's' : ''}
        </span>
      </button>

      {isExpanded && (
        <div className="p-3 space-y-3">
          {/* Image list */}
          <div className="space-y-2">
            {images.map((img) => (
              <div 
                key={img.path}
                className="flex items-center gap-3 p-2 rounded border bg-background"
              >
                <img 
                  src={img.dataUrl} 
                  alt={img.name}
                  className="h-12 w-12 object-cover rounded"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{img.name}</p>
                  <p className="text-xs text-muted-foreground">{img.path}</p>
                  <p className="text-xs text-muted-foreground">{formatSize(img.size)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeStagedImage(img.path)}
                  className="shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          {/* Add more */}
          <div
            className={`border-2 border-dashed rounded-lg p-3 text-center transition-colors ${
              isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleInputChange}
              className="hidden"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="h-4 w-4 mr-2" />
              Add More Images
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
