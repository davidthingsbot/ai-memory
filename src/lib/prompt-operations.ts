import { getOpenAIKey } from '@/components/Credentials'
import { getSelectedModel } from '@/components/ModelSelector'
import type { Operation } from '@/store'

export interface Plan {
  description: string
  action: 'insert' | 'modify' | 'create' | 'delete'
  location?: string
  outline?: string[]
}

export interface DirectoryContext {
  path: string
  listing: string[]        // file/folder names in the directory
  referenceFile?: {        // nearby file for style reference
    path: string
    content: string
  }
}

export interface PlanRequest {
  intent: string
  operation: Operation
  filePath?: string
  fileContent?: string
  directoryContext?: DirectoryContext
}

export interface ExecuteRequest {
  plan: Plan
  operation: Operation
  filePath?: string
  fileContent?: string
  directoryContext?: DirectoryContext
}

export interface ExecuteResult {
  path: string
  action: 'create' | 'modify' | 'delete'
  content: string
}

type ProgressCallback = (step: string) => void

/** Build a human-readable description of the selection/position context */
function buildSelectionContext(operation: Operation, fileContent?: string): string {
  const parts: string[] = []

  if (operation.selection?.text) {
    const sel = operation.selection
    const text = sel.text.length > 500
      ? sel.text.slice(0, 497) + '...'
      : sel.text
    parts.push(`Selected text: "${text}"`)
    if (sel.start >= 0 && fileContent) {
      const line = fileContent.slice(0, sel.start).split('\n').length
      const endLine = fileContent.slice(0, sel.end).split('\n').length
      parts.push(`Selection span: line ${line}${endLine !== line ? ` to line ${endLine}` : ''} (characters ${sel.start}-${sel.end})`)
    }
  } else if (operation.position != null && fileContent) {
    const line = fileContent.slice(0, operation.position).split('\n').length
    const lineStart = fileContent.lastIndexOf('\n', operation.position - 1) + 1
    const col = operation.position - lineStart + 1
    // Show surrounding context
    const contextStart = Math.max(0, lineStart)
    const lineEnd = fileContent.indexOf('\n', operation.position)
    const currentLine = fileContent.slice(contextStart, lineEnd >= 0 ? lineEnd : undefined)
    parts.push(`Cursor position: line ${line}, column ${col}`)
    parts.push(`Line content: "${currentLine}"`)
  }

  return parts.length > 0 ? '\n' + parts.join('\n') : ''
}

/**
 * Generate a plan from user intent
 */
export async function generatePlan(
  request: PlanRequest,
  onProgress?: ProgressCallback
): Promise<Plan> {
  const apiKey = getOpenAIKey()
  if (!apiKey) throw new Error('No OpenAI API key')
  
  const model = getSelectedModel()
  onProgress?.(`Using model: ${model}`)
  
  const systemPrompt = `You are an AI assistant helping to plan content modifications for a document.

Your task is to create a clear, actionable plan based on the user's intent.

If the user has selected specific text, the plan should target ONLY that selection.
If the user has a cursor position, the plan should target that location.
If no selection or position, operate on the whole file or create new content.

Return a JSON object with:
- description: A clear description of what will be done
- action: One of "insert", "modify", "create", or "delete"
- location: Where in the document (e.g., "the selected text", "line 42", "after 'Installation' section")
- outline: An array of bullet points describing the content structure (optional, for larger changes)

Be specific and actionable. The plan should be clear enough that another AI can execute it.`

  const selectionContext = buildSelectionContext(request.operation, request.fileContent)

  const dirContext = request.directoryContext
  const dirContextStr = dirContext ? `
Directory: ${dirContext.path || '/'}
Contents: ${dirContext.listing.join(', ')}
${dirContext.referenceFile ? `\nReference file (${dirContext.referenceFile.path}) for style:\n\`\`\`\n${dirContext.referenceFile.content.slice(0, 2000)}${dirContext.referenceFile.content.length > 2000 ? '\n...(truncated)' : ''}\n\`\`\`` : ''}` : ''

  const isNewOp = request.operation.type === 'new-file' || request.operation.type === 'new-folder'
  const parentDir = isNewOp ? (request.filePath || '') : ''

  const userPrompt = `Operation type: ${request.operation.type}
${isNewOp ? `Parent directory: ${parentDir || '/'}\nIMPORTANT: Any new files or folders MUST be created inside "${parentDir || '/'}"` : `File: ${request.filePath || 'new file'}`}
${selectionContext}${dirContextStr}
${request.fileContent ? `\nCurrent content:\n\`\`\`\n${request.fileContent.slice(0, 2000)}${request.fileContent.length > 2000 ? '\n...(truncated)' : ''}\n\`\`\`` : ''}

User's intent: ${request.intent}

Generate a plan for this operation. Return only valid JSON.`

  onProgress?.('Generating plan...')
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`API error: ${error}`)
  }
  
  const data = await response.json()
  const content = data.choices[0]?.message?.content
  
  if (!content) {
    throw new Error('No response from API')
  }
  
  try {
    const plan = JSON.parse(content) as Plan
    onProgress?.(`Plan: ${plan.action} - ${plan.description.slice(0, 50)}...`)
    return plan
  } catch {
    throw new Error('Failed to parse plan response')
  }
}

/** Extract surrounding context lines around a character range */
function getSurroundingContext(content: string, start: number, end: number, contextLines = 10): { before: string; after: string } {
  const lines = content.split('\n')
  let charPos = 0
  let startLine = 0, endLine = lines.length - 1

  for (let i = 0; i < lines.length; i++) {
    if (charPos + lines[i].length >= start && startLine === 0) startLine = i
    if (charPos + lines[i].length >= end) { endLine = i; break }
    charPos += lines[i].length + 1
  }

  const beforeStart = Math.max(0, startLine - contextLines)
  const afterEnd = Math.min(lines.length - 1, endLine + contextLines)

  return {
    before: lines.slice(beforeStart, startLine).join('\n'),
    after: lines.slice(endLine + 1, afterEnd + 1).join('\n'),
  }
}

/**
 * Execute a plan to generate content.
 *
 * For selection/cursor operations: sends only the targeted text + surrounding
 * context, then splices the AI's output back into the full file.
 * For whole-file/new-file operations: sends full content as before.
 */
export async function executePlan(
  request: ExecuteRequest,
  onProgress?: ProgressCallback
): Promise<ExecuteResult> {
  const apiKey = getOpenAIKey()
  if (!apiKey) throw new Error('No OpenAI API key')

  const model = getSelectedModel()
  onProgress?.('Executing plan...')

  const op = request.operation
  const hasSelection = op.selection && op.selection.start >= 0 && op.selection.text
  const hasCursor = !hasSelection && op.position != null && op.position >= 0
  const isNarrow = (hasSelection || hasCursor) && request.fileContent

  let systemPrompt: string
  let userPrompt: string

  if (isNarrow && hasSelection && request.fileContent) {
    // NARROW: selection — AI only modifies the selected text
    const sel = op.selection!
    const ctx = getSurroundingContext(request.fileContent, sel.start, sel.end)

    systemPrompt = `You are an AI assistant modifying a specific selection within a document.

You will receive:
- The SELECTED TEXT that you must modify
- Context BEFORE and AFTER the selection (read-only, for reference only)
- A plan describing what to do

Return a JSON object with:
- content: The replacement text for the selection ONLY (not the whole file)

Rules:
- Return ONLY the replacement for the selected text
- Do NOT include the surrounding context in your output
- Match the style and formatting of the surrounding content
- If the plan says to delete, return empty string for content`

    userPrompt = `Plan: ${request.plan.description}

Context before (read-only):
\`\`\`
${ctx.before}
\`\`\`

SELECTED TEXT (modify this):
\`\`\`
${sel.text}
\`\`\`

Context after (read-only):
\`\`\`
${ctx.after}
\`\`\`

File: ${request.filePath}
${request.fileContent ? `\nFull file for background reference (DO NOT reproduce — only return the replacement for the selected text):\n\`\`\`\n${request.fileContent.slice(0, 4000)}${request.fileContent.length > 4000 ? '\n...(truncated)' : ''}\n\`\`\`` : ''}
Return only valid JSON with the replacement content.`

  } else if (isNarrow && hasCursor && request.fileContent) {
    // NARROW: cursor — AI generates content to insert at cursor position
    const pos = op.position!
    const ctx = getSurroundingContext(request.fileContent, pos, pos)

    systemPrompt = `You are an AI assistant inserting new content at a specific position in a document.

You will receive:
- Context BEFORE and AFTER the cursor position (read-only, for reference)
- A plan describing what to insert

Return a JSON object with:
- content: The new content to INSERT at the cursor position (not the whole file)

Rules:
- Return ONLY the new content to insert
- Do NOT include the surrounding context in your output
- Match the style and formatting of the surrounding content
- Include appropriate newlines/spacing to fit naturally`

    userPrompt = `Plan: ${request.plan.description}

Context before cursor (read-only):
\`\`\`
${ctx.before}
\`\`\`

--- CURSOR IS HERE ---

Context after cursor (read-only):
\`\`\`
${ctx.after}
\`\`\`

File: ${request.filePath}
${request.plan.outline ? `Outline:\n${request.plan.outline.map(o => `- ${o}`).join('\n')}` : ''}
${request.fileContent ? `\nFull file for background reference (DO NOT reproduce — only return the new content to insert):\n\`\`\`\n${request.fileContent.slice(0, 4000)}${request.fileContent.length > 4000 ? '\n...(truncated)' : ''}\n\`\`\`` : ''}
Return only valid JSON with the content to insert.`

  } else {
    // WIDE: whole file or new file
    systemPrompt = `You are an AI assistant executing a content modification plan.

Your task is to generate the actual content based on the plan.

Guidelines:
- Follow the plan description exactly
- Write clear, well-structured content matching the file type
- If modifying an existing file, return the complete updated file content
- If creating a new file, return the new content
- Match the existing document's style if one exists

Return a JSON object with:
- path: The file path for the content
- action: "create", "modify", or "delete"
- content: The complete file content`

    const selectionContext = buildSelectionContext(request.operation, request.fileContent)

    const dirContext = request.directoryContext
    const dirContextStr = dirContext ? `
Directory: ${dirContext.path || '/'}
Contents: ${dirContext.listing.join(', ')}
${dirContext.referenceFile ? `\nReference file (${dirContext.referenceFile.path}) for style:\n\`\`\`\n${dirContext.referenceFile.content.slice(0, 2000)}${dirContext.referenceFile.content.length > 2000 ? '\n...(truncated)' : ''}\n\`\`\`` : ''}` : ''

    const isNewOp = request.operation.type === 'new-file' || request.operation.type === 'new-folder'
    const parentDir = isNewOp ? (request.filePath || '') : ''

    userPrompt = `Plan:
- Description: ${request.plan.description}
- Action: ${request.plan.action}
- Location: ${request.plan.location || 'appropriate location'}
${request.plan.outline ? `- Outline:\n${request.plan.outline.map(o => `  - ${o}`).join('\n')}` : ''}

${isNewOp ? `Parent directory: ${parentDir || '/'}\nIMPORTANT: The path in your response MUST start with "${parentDir ? parentDir + '/' : ''}"` : `File: ${request.filePath || 'needs to be determined'}`}
${selectionContext}${dirContextStr}
${request.fileContent ? `\nCurrent content:\n\`\`\`\n${request.fileContent}\n\`\`\`` : ''}

Execute this plan and generate the content. Return only valid JSON.`
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`API error: ${error}`)
  }

  const data = await response.json()
  const rawContent = data.choices[0]?.message?.content

  if (!rawContent) {
    throw new Error('No response from API')
  }

  try {
    const parsed = JSON.parse(rawContent)
    const aiContent: string = parsed.content ?? ''

    // Splice narrow results back into the full file
    if (isNarrow && request.fileContent) {
      let fullContent: string
      if (hasSelection) {
        const sel = op.selection!
        fullContent = request.fileContent.slice(0, sel.start) + aiContent + request.fileContent.slice(sel.end)
      } else {
        // Insert at cursor
        const pos = op.position!
        fullContent = request.fileContent.slice(0, pos) + aiContent + request.fileContent.slice(pos)
      }
      onProgress?.(`Modified ${aiContent.length} characters at target`)
      return {
        path: request.filePath || 'untitled.md',
        action: 'modify',
        content: fullContent,
      }
    }

    // Wide result — return as-is
    onProgress?.(`Generated ${aiContent.length} characters`)
    return {
      path: parsed.path || request.filePath || 'untitled.md',
      action: parsed.action || 'modify',
      content: aiContent,
    }
  } catch {
    throw new Error('Failed to parse execution response')
  }
}
