import { describe, it, expect } from 'vitest'
import {
  findSelectionInRaw,
  findImageMarkdown,
  findCodeFenceBounds,
  findTableBounds,
  expandToBlockBoundaries,
} from './selection-helpers'

// ---------------------------------------------------------------------------
// Sample markdown used across tests
// ---------------------------------------------------------------------------
const SAMPLE_MD = `# My Document

Some introductory text here.

![screenshot](images/shot.png)

Here is a **bold** paragraph with [a link](https://example.com).

\`\`\`typescript
const x = 1
const y = 2
console.log(x + y)
\`\`\`

Some text between blocks.

| Name  | Value |
| ----- | ----- |
| alpha | 1     |
| beta  | 2     |

Final paragraph.`

// ---------------------------------------------------------------------------
// findSelectionInRaw
// ---------------------------------------------------------------------------
describe('findSelectionInRaw', () => {
  it('finds exact plain text', () => {
    const result = findSelectionInRaw('introductory text', SAMPLE_MD)
    expect(result).not.toBeNull()
    expect(SAMPLE_MD.slice(result!.start, result!.end)).toBe('introductory text')
  })

  it('finds text spanning bold markers', () => {
    // The rendered text "bold paragraph" appears in raw as "**bold** paragraph"
    // Direct search should fail, fallback to word-chunk search
    const result = findSelectionInRaw('bold paragraph', SAMPLE_MD)
    expect(result).not.toBeNull()
    // Should find at least the start
    expect(result!.start).toBeGreaterThan(0)
  })

  it('returns null for empty string', () => {
    expect(findSelectionInRaw('', SAMPLE_MD)).toBeNull()
    expect(findSelectionInRaw('   ', SAMPLE_MD)).toBeNull()
  })

  it('returns null for text not in document', () => {
    expect(findSelectionInRaw('xyzzy not found', SAMPLE_MD)).toBeNull()
  })

  it('finds text at the very start', () => {
    const result = findSelectionInRaw('# My Document', SAMPLE_MD)
    expect(result).not.toBeNull()
    expect(result!.start).toBe(0)
  })

  it('finds text at the very end', () => {
    const result = findSelectionInRaw('Final paragraph.', SAMPLE_MD)
    expect(result).not.toBeNull()
    expect(SAMPLE_MD.slice(result!.start, result!.end)).toBe('Final paragraph.')
  })
})

// ---------------------------------------------------------------------------
// findImageMarkdown
// ---------------------------------------------------------------------------
describe('findImageMarkdown', () => {
  it('finds image by exact alt and src', () => {
    const result = findImageMarkdown('images/shot.png', 'screenshot', SAMPLE_MD)
    expect(result).not.toBeNull()
    expect(SAMPLE_MD.slice(result!.start, result!.end)).toBe('![screenshot](images/shot.png)')
  })

  it('finds image with empty alt', () => {
    const md = 'before ![](logo.svg) after'
    const result = findImageMarkdown('logo.svg', '', md)
    expect(result).not.toBeNull()
    expect(md.slice(result!.start, result!.end)).toBe('![](logo.svg)')
  })

  it('finds image by src alone when alt differs', () => {
    const result = findImageMarkdown('images/shot.png', 'wrong-alt', SAMPLE_MD)
    expect(result).not.toBeNull()
    expect(SAMPLE_MD.slice(result!.start, result!.end)).toContain('images/shot.png')
  })

  it('returns null when src not in document', () => {
    expect(findImageMarkdown('nope.jpg', 'nope', SAMPLE_MD)).toBeNull()
  })

  it('handles special regex characters in src', () => {
    const md = 'text ![pic](path/file (1).png) end'
    const result = findImageMarkdown('path/file (1).png', 'pic', md)
    expect(result).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// findCodeFenceBounds
// ---------------------------------------------------------------------------
describe('findCodeFenceBounds', () => {
  const codeStart = SAMPLE_MD.indexOf('const x = 1')
  const codeEnd = SAMPLE_MD.indexOf('console.log(x + y)') + 'console.log(x + y)'.length

  it('finds opening and closing fences around code content', () => {
    const result = findCodeFenceBounds(codeStart, codeEnd, SAMPLE_MD)
    expect(result).not.toBeNull()
    const slice = SAMPLE_MD.slice(result!.start, result!.end)
    expect(slice).toContain('```typescript')
    expect(slice).toContain('console.log(x + y)')
  })

  it('includes the opening fence language tag', () => {
    const result = findCodeFenceBounds(codeStart, codeEnd, SAMPLE_MD)
    expect(result).not.toBeNull()
    expect(SAMPLE_MD.slice(result!.start, result!.start + 15)).toContain('```typescript')
  })

  it('returns null when position is not inside a code fence', () => {
    const textPos = SAMPLE_MD.indexOf('introductory')
    const result = findCodeFenceBounds(textPos, textPos + 5, SAMPLE_MD)
    expect(result).toBeNull()
  })

  it('returns null when there is no closing fence', () => {
    const broken = '```js\ncode here\nno closing'
    const result = findCodeFenceBounds(6, 10, broken)
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// findTableBounds
// ---------------------------------------------------------------------------
describe('findTableBounds', () => {
  const cellPos = SAMPLE_MD.indexOf('alpha')

  it('expands to include full table from a cell position', () => {
    const result = findTableBounds(cellPos, cellPos + 5, SAMPLE_MD)
    expect(result).not.toBeNull()
    const slice = SAMPLE_MD.slice(result!.start, result!.end)
    expect(slice).toContain('| Name')
    expect(slice).toContain('| beta')
    expect(slice).toContain('| ----- |')
  })

  it('includes header row and separator', () => {
    const headerPos = SAMPLE_MD.indexOf('| Name')
    const result = findTableBounds(headerPos, headerPos + 5, SAMPLE_MD)
    expect(result).not.toBeNull()
    const slice = SAMPLE_MD.slice(result!.start, result!.end)
    // Should contain all table rows
    const pipeLines = slice.split('\n').filter(l => l.trimStart().startsWith('|'))
    expect(pipeLines.length).toBe(4) // header + separator + 2 data rows
  })

  it('returns null when position is not in a table', () => {
    const textPos = SAMPLE_MD.indexOf('introductory')
    expect(findTableBounds(textPos, textPos + 5, SAMPLE_MD)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// expandToBlockBoundaries
// ---------------------------------------------------------------------------
describe('expandToBlockBoundaries', () => {
  it('expands to code fence when selection covers most of the code', () => {
    const codeStart = SAMPLE_MD.indexOf('const x = 1')
    const codeEnd = SAMPLE_MD.indexOf('console.log(x + y)') + 'console.log(x + y)'.length
    const result = expandToBlockBoundaries(codeStart, codeEnd, SAMPLE_MD)
    const slice = SAMPLE_MD.slice(result.start, result.end)
    expect(slice).toContain('```typescript')
  })

  it('does not expand small selection inside code block', () => {
    const pos = SAMPLE_MD.indexOf('const x')
    const result = expandToBlockBoundaries(pos, pos + 5, SAMPLE_MD)
    // Should return the same range (not expanded)
    expect(result.start).toBe(pos)
    expect(result.end).toBe(pos + 5)
  })

  it('expands to full table when selection covers most of it', () => {
    const tableStart = SAMPLE_MD.indexOf('| Name')
    const tableEnd = SAMPLE_MD.indexOf('| beta  | 2     |') + '| beta  | 2     |'.length
    const result = expandToBlockBoundaries(tableStart, tableEnd, SAMPLE_MD)
    const slice = SAMPLE_MD.slice(result.start, result.end)
    expect(slice).toContain('| Name')
    expect(slice).toContain('| beta')
  })

  it('does not expand for plain text', () => {
    const pos = SAMPLE_MD.indexOf('introductory')
    const result = expandToBlockBoundaries(pos, pos + 12, SAMPLE_MD)
    expect(result.start).toBe(pos)
    expect(result.end).toBe(pos + 12)
  })
})
