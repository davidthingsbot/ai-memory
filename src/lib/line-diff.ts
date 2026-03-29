import { diffLines, type Change } from 'diff'

export interface LineDiff {
  type: 'added' | 'removed' | 'unchanged'
  text: string
  lineNumber: number  // line number in the new file (for added/unchanged) or old file (for removed)
}

/** Compute line-level diff between old and new content */
export function computeLineDiff(oldContent: string, newContent: string): LineDiff[] {
  const changes: Change[] = diffLines(oldContent, newContent)
  const result: LineDiff[] = []
  let newLine = 1
  let oldLine = 1

  for (const change of changes) {
    const lines = change.value.replace(/\n$/, '').split('\n')
    for (const text of lines) {
      if (change.added) {
        result.push({ type: 'added', text, lineNumber: newLine++ })
      } else if (change.removed) {
        result.push({ type: 'removed', text, lineNumber: oldLine++ })
      } else {
        result.push({ type: 'unchanged', text, lineNumber: newLine++ })
        oldLine++
      }
    }
  }
  return result
}

/** Get sets of added/removed line numbers (in new-file terms) for margin indicators */
export function getChangedLineNumbers(oldContent: string, newContent: string): {
  added: Set<number>
  removed: Set<number>  // line numbers in new file AFTER which deletions occurred
} {
  const changes: Change[] = diffLines(oldContent, newContent)
  const added = new Set<number>()
  const removed = new Set<number>()
  let newLine = 1

  for (const change of changes) {
    const lineCount = change.value.replace(/\n$/, '').split('\n').length
    if (change.added) {
      for (let i = 0; i < lineCount; i++) added.add(newLine + i)
      newLine += lineCount
    } else if (change.removed) {
      // Mark the current new-file line as having deletions before it
      removed.add(newLine)
    } else {
      newLine += lineCount
    }
  }
  return { added, removed }
}
