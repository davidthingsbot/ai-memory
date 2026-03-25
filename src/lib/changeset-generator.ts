/**
 * Changeset Generator - supports multi-file operations
 * 
 * Can create, update, or delete multiple files in a single operation.
 */

import { getOpenAIKey } from '@/components/Credentials'
import { getSelectedModel } from '@/components/ModelSelector'
import { getSelectedRepo } from '@/components/RepoSelection'
import { readFile, listDirectory } from './github-tools'
import type { BrowseScope } from '@/components/RepoBrowser'

// A single file change in the changeset
export interface FileChange {
  action: 'create' | 'update' | 'delete'
  path: string
  content?: string          // New content for create/update
  previousContent?: string  // Original content for updates (for diff display)
  reason?: string           // Why this change is being made
}

// The complete set of changes to be committed
export interface ChangeSet {
  changes: FileChange[]
  summary: string           // Human-readable summary of all changes
  commitMessage: string     // Git commit message
  analysis?: string         // AI's analysis of the repository structure
}

export interface ChangeSetRequest {
  rawContent: string              // User's notes/description
  scope: BrowseScope | null       // Selected context (file/folder/selection)
  selectionContext?: string       // Selected text if any
}

interface ProgressCallback {
  (step: string): void
}

/**
 * Generate a changeset based on user input and repository context.
 * The AI decides what files to create, update, or delete.
 */
export async function generateChangeSet(
  request: ChangeSetRequest,
  onProgress?: ProgressCallback
): Promise<ChangeSet> {
  const apiKey = getOpenAIKey()
  if (!apiKey) throw new Error('No OpenAI API key')

  const repo = getSelectedRepo()
  if (!repo) throw new Error('No repository selected')

  onProgress?.('Analyzing request...')

  // Gather context based on scope
  let contextInfo = ''
  let existingFiles: Array<{ path: string; content: string }> = []

  if (request.scope) {
    onProgress?.(`Scope: ${request.scope.type} - ${request.scope.path}`)
    
    if (request.scope.type === 'file') {
      // Single file context
      const content = request.scope.fileContent || await fetchContent(request.scope.path)
      if (content) {
        existingFiles.push({ path: request.scope.path, content })
        contextInfo = `Selected file: ${request.scope.path}\n\nCurrent content:\n\`\`\`\n${content}\n\`\`\``
      }
    } else if (request.scope.type === 'directory') {
      // Directory context - list files
      onProgress?.('Loading directory contents...')
      const entries = await listDirectory(request.scope.path)
      const fileList = entries.map(e => `${e.type === 'dir' ? '📁' : '📄'} ${e.path}`).join('\n')
      contextInfo = `Selected directory: ${request.scope.path}\n\nContents:\n${fileList}`
      
      // Load content of markdown files in the directory (up to 5)
      const mdFiles = entries.filter(e => e.type === 'file' && e.path.endsWith('.md')).slice(0, 5)
      for (const file of mdFiles) {
        onProgress?.(`Reading ${file.path}...`)
        const content = await fetchContent(file.path)
        if (content) {
          existingFiles.push({ path: file.path, content })
        }
      }
    } else if (request.scope.type === 'selection') {
      // Selection context
      const content = request.scope.fileContent || await fetchContent(request.scope.path)
      if (content) {
        existingFiles.push({ path: request.scope.path, content })
      }
      contextInfo = `Selected passage from ${request.scope.path}:\n> ${request.selectionContext || request.scope.selectedText}`
      if (content) {
        contextInfo += `\n\nFull file content:\n\`\`\`\n${content}\n\`\`\``
      }
    }
  } else {
    // No scope - load repo structure
    onProgress?.('Loading repository structure...')
    const entries = await listDirectory('')
    const structure = entries.map(e => `${e.type === 'dir' ? '📁' : '📄'} ${e.path}`).join('\n')
    contextInfo = `Repository root:\n${structure}`
  }

  // Build the system prompt
  const systemPrompt = `You are a documentation assistant that helps organize knowledge in a GitHub repository.

Given the user's notes and the repository context, determine what file operations are needed:
- CREATE new files where appropriate
- UPDATE existing files to add or modify content
- DELETE files if they should be removed or consolidated

Guidelines:
- Prefer updating existing files over creating new ones when the content fits
- Use clear, descriptive filenames for new files (ending in .md)
- Follow the repository's existing organizational structure
- When updating, integrate content naturally - don't just append
- Provide clear markdown formatting

You MUST respond with a JSON object in this exact format:
{
  "analysis": "Brief analysis of the repository structure and where content fits",
  "summary": "Human-readable summary of changes (e.g., 'Creating new file about X, updating Y to add section on Z')",
  "commitMessage": "Short git commit message",
  "changes": [
    {
      "action": "create" | "update" | "delete",
      "path": "path/to/file.md",
      "content": "Full file content for create/update (omit for delete)",
      "reason": "Why this change is being made"
    }
  ]
}`

  // Build existing files context
  let existingFilesContext = ''
  if (existingFiles.length > 0) {
    existingFilesContext = '\n\n## Existing Files\n'
    for (const file of existingFiles) {
      existingFilesContext += `\n### ${file.path}\n\`\`\`markdown\n${file.content.slice(0, 3000)}\n\`\`\`\n`
    }
  }

  const userPrompt = `## Repository Context
${contextInfo}
${existingFilesContext}

## User's Notes
${request.rawContent}

Based on the above, determine what file operations are needed and return the changeset JSON.`

  onProgress?.(`Generating changeset with ${getSelectedModel()}...`)

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: getSelectedModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
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
    throw new Error('No response from AI')
  }

  onProgress?.('Parsing changeset...')

  let result: ChangeSet
  try {
    result = JSON.parse(content)
  } catch {
    throw new Error('Failed to parse AI response as JSON')
  }

  // Validate and enrich the changeset
  if (!result.changes || !Array.isArray(result.changes)) {
    throw new Error('Invalid changeset: missing changes array')
  }

  // Add previousContent for updates
  for (const change of result.changes) {
    if (change.action === 'update') {
      const existing = existingFiles.find(f => f.path === change.path)
      if (existing) {
        change.previousContent = existing.content
      } else {
        // Fetch if not already loaded
        const content = await fetchContent(change.path)
        if (content) {
          change.previousContent = content
        }
      }
    }
  }

  onProgress?.(`Generated ${result.changes.length} change(s)`)

  return result
}

async function fetchContent(path: string): Promise<string | null> {
  try {
    const file = await readFile(path)
    return file?.content || null
  } catch {
    return null
  }
}

/**
 * Apply feedback to revise a changeset
 */
export async function reviseChangeSet(
  currentChangeSet: ChangeSet,
  feedback: string,
  onProgress?: ProgressCallback
): Promise<ChangeSet> {
  const apiKey = getOpenAIKey()
  if (!apiKey) throw new Error('No OpenAI API key')

  onProgress?.('Revising changeset based on feedback...')

  const systemPrompt = `You are a documentation assistant. The user has provided feedback on a proposed changeset.
Revise the changeset according to their feedback.

Respond with the same JSON format:
{
  "analysis": "...",
  "summary": "...",
  "commitMessage": "...",
  "changes": [...]
}`

  const userPrompt = `## Current Changeset
\`\`\`json
${JSON.stringify(currentChangeSet, null, 2)}
\`\`\`

## User Feedback
${feedback}

Please revise the changeset according to the feedback.`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: getSelectedModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
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
    throw new Error('No response from AI')
  }

  onProgress?.('Parsing revised changeset...')

  const result: ChangeSet = JSON.parse(content)
  
  // Preserve previousContent from original changeset
  for (const change of result.changes) {
    if (change.action === 'update') {
      const original = currentChangeSet.changes.find(c => c.path === change.path)
      if (original?.previousContent) {
        change.previousContent = original.previousContent
      }
    }
  }

  return result
}
