/**
 * Pure helper functions for mapping between rendered preview positions
 * and raw markdown offsets. These have no DOM dependencies and are testable.
 */

/** Find raw-text offset range for selected text in preview */
export function findSelectionInRaw(selectedText: string, fileContent: string): { start: number; end: number } | null {
  const trimmed = selectedText.trim()
  if (!trimmed) return null

  const directIdx = fileContent.indexOf(trimmed)
  if (directIdx >= 0) return { start: directIdx, end: directIdx + trimmed.length }

  const words = trimmed.split(/\s+/).filter(w => w.length > 0)
  if (words.length === 0) return null

  let startIdx = -1
  for (let n = Math.min(words.length, 5); n >= 1; n--) {
    const startChunk = words.slice(0, n).join(' ')
    startIdx = fileContent.indexOf(startChunk)
    if (startIdx >= 0) break
  }

  let endIdx = -1
  for (let n = Math.min(words.length, 5); n >= 1; n--) {
    const endChunk = words.slice(-n).join(' ')
    const searchFrom = startIdx >= 0 ? startIdx : 0
    endIdx = fileContent.indexOf(endChunk, searchFrom)
    if (endIdx >= 0) { endIdx += endChunk.length; break }
  }

  if (startIdx >= 0 && endIdx > startIdx) return { start: startIdx, end: endIdx }
  if (startIdx >= 0) return { start: startIdx, end: startIdx }
  return null
}

/** Find image markdown tag in raw content: ![alt](src) */
export function findImageMarkdown(originalSrc: string, alt: string, content: string): { start: number; end: number } | null {
  for (const pattern of [`![${alt}](${originalSrc})`, `![](${originalSrc})`]) {
    const idx = content.indexOf(pattern)
    if (idx >= 0) return { start: idx, end: idx + pattern.length }
  }
  const escaped = originalSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`!\\[[^\\]]*\\]\\(${escaped}[^)]*\\)`)
  const match = content.match(re)
  if (match && match.index != null) return { start: match.index, end: match.index + match[0].length }
  return null
}

/** Find code fence block boundaries around a position range */
export function findCodeFenceBounds(start: number, end: number, content: string): { start: number; end: number } | null {
  let searchPos = start
  while (searchPos > 0) {
    const lineStart = content.lastIndexOf('\n', searchPos - 1) + 1
    const line = content.slice(lineStart, content.indexOf('\n', lineStart))
    if (line.trimStart().startsWith('```')) {
      const closeSearch = content.indexOf('\n```', end)
      if (closeSearch >= 0) {
        const closeEnd = content.indexOf('\n', closeSearch + 4)
        return { start: lineStart, end: closeEnd >= 0 ? closeEnd : content.length }
      }
      return null
    }
    if (lineStart === 0) break
    searchPos = lineStart - 1
  }
  return null
}

/** Find full table boundaries around a position range */
export function findTableBounds(start: number, end: number, content: string): { start: number; end: number } | null {
  const lines = content.split('\n')
  let offset = 0
  let startLine = -1, endLine = -1
  for (let i = 0; i < lines.length; i++) {
    const lineEnd = offset + lines[i].length
    // Line contains position if offset <= pos <= lineEnd
    if (startLine < 0 && start >= offset && start <= lineEnd) startLine = i
    if (end >= offset && end <= lineEnd) endLine = i
    offset = lineEnd + 1
  }
  if (startLine < 0 || endLine < 0) return null
  if (!lines[startLine].trimStart().startsWith('|')) return null
  // Expand upward to include all contiguous table rows
  let tableStart = startLine
  while (tableStart > 0 && lines[tableStart - 1].trimStart().startsWith('|')) tableStart--
  // Expand downward
  let tableEnd = endLine
  while (tableEnd < lines.length - 1 && lines[tableEnd + 1].trimStart().startsWith('|')) tableEnd++
  // Calculate character offsets
  let charStart = 0
  for (let i = 0; i < tableStart; i++) charStart += lines[i].length + 1
  let charEnd = charStart
  for (let i = tableStart; i <= tableEnd; i++) charEnd += lines[i].length + 1
  return { start: charStart, end: charEnd - 1 }
}

/** Expand a selection range to include block framing when selection covers most of the block */
export function expandToBlockBoundaries(start: number, end: number, content: string): { start: number; end: number } {
  const selLen = end - start

  const codeFence = findCodeFenceBounds(start, end, content)
  if (codeFence) {
    const blockContentLen = codeFence.end - codeFence.start
    if (selLen > blockContentLen * 0.5) return codeFence
  }

  const table = findTableBounds(start, end, content)
  if (table) {
    const tableLen = table.end - table.start
    if (selLen > tableLen * 0.5) return table
  }

  return { start, end }
}
