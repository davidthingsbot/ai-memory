/**
 * Changeset Generator - supports multi-file operations
 * 
 * Can create, update, or delete multiple files in a single operation.
 */

import { getOpenAIKey } from '@/components/Credentials'
import { getSelectedModel } from '@/components/ModelSelector'
import { getSelectedRepo } from '@/components/RepoSelection'
import { readFile, listDirectory } from './github-tools'
import { addStagedImage, mimeToExtension } from './image-store'
import type { BrowseScope } from '@/components/RepoBrowser'

// A single file change in the changeset
export interface FileChange {
  action: 'create' | 'update' | 'delete' | 'rename'
  path: string
  content?: string          // New content for create/update
  previousContent?: string  // Original content for updates (for diff display)
  previousPath?: string     // Original path for renames
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
      // Selection context - user selected specific text
      const content = request.scope.fileContent || await fetchContent(request.scope.path)
      if (content) {
        existingFiles.push({ path: request.scope.path, content })
      }
      const selectedText = request.selectionContext || request.scope.selectedText || ''
      contextInfo = `Selected passage from ${request.scope.path}:\n> ${selectedText}`
      
      // Include position info if available
      if (request.scope.selectionStart !== undefined && request.scope.selectionEnd !== undefined) {
        contextInfo += `\n\n(Selection is at characters ${request.scope.selectionStart}-${request.scope.selectionEnd} in the file)`
        contextInfo += `\nIMPORTANT: The user selected this text. When updating the file, this is the area they want to modify or expand upon.`
      }
      if (content) {
        contextInfo += `\n\nFull file content:\n\`\`\`\n${content}\n\`\`\``
      }
    } else if (request.scope.type === 'cursor') {
      // Cursor context - user placed cursor at specific position
      const content = request.scope.fileContent || await fetchContent(request.scope.path)
      if (content) {
        existingFiles.push({ path: request.scope.path, content })
      }
      const cursorPos = request.scope.cursorPosition ?? 0
      
      // Show context around cursor position
      const before = content?.slice(Math.max(0, cursorPos - 100), cursorPos) || ''
      const after = content?.slice(cursorPos, cursorPos + 100) || ''
      
      contextInfo = `Cursor position in ${request.scope.path} at character ${cursorPos}:`
      contextInfo += `\n\nText before cursor:\n> ...${before}`
      contextInfo += `\n\nText after cursor:\n> ${after}...`
      contextInfo += `\n\nIMPORTANT: The user placed their cursor at this position. When updating the file, INSERT new content at this exact location (character ${cursorPos}).`
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
- RENAME files or folders to better organize content

Guidelines:
- Prefer updating existing files over creating new ones when the content fits
- Use clear, descriptive filenames for new files (ending in .md)
- Follow the repository's existing organizational structure
- When updating, integrate content naturally - don't just append
- Use rename when a file/folder should be moved or given a better name
- Provide clear markdown formatting
- Use plain ASCII quotes (" and ') only - never use curly/smart quotes (" " ' ')
- If referencing images, place them in an images/ subdirectory relative to the document (e.g., images/diagram.png)
- Use relative paths for images in markdown: ![description](images/filename.png)
- You have a fetch_image tool to download images from URLs - use it when the user mentions an image URL or when an image would enhance the documentation

You MUST respond with a JSON object in this exact format:
{
  "analysis": "Brief analysis of the repository structure and where content fits",
  "summary": "Human-readable summary of changes (e.g., 'Creating new file about X, updating Y to add section on Z')",
  "commitMessage": "Short git commit message",
  "changes": [
    {
      "action": "create" | "update" | "delete" | "rename",
      "path": "path/to/file.md",
      "previousPath": "old/path/to/file.md (only for rename)",
      "content": "Full file content for create/update/rename (omit for delete)",
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

  // Determine image directory based on scope
  const imageDir = request.scope?.type === 'file'
    ? request.scope.path.split('/').slice(0, -1).concat('images').join('/') || 'images'
    : request.scope?.type === 'directory'
      ? `${request.scope.path}/images`.replace(/^\//, '')
      : 'images'

  // Tool for fetching images
  const fetchImageTool = {
    type: 'function' as const,
    function: {
      name: 'fetch_image',
      description: 'Download an image from a URL and stage it for commit. Returns the relative markdown path to use.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL of the image to download' },
          filename: { type: 'string', description: 'Desired filename (without path). If omitted, derived from URL.' },
          description: { type: 'string', description: 'Alt text description for the image' },
        },
        required: ['url'],
      },
    },
  }

  // Messages for the conversation (may have multiple turns if tools are called)
  const messages: Array<{ role: string; content: string; tool_calls?: any[]; tool_call_id?: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  let finalResponse: any = null
  const maxToolCalls = 10 // Prevent infinite loops

  for (let i = 0; i < maxToolCalls; i++) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: getSelectedModel(),
        messages,
        tools: [fetchImageTool],
        tool_choice: 'auto',
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`API error: ${error}`)
    }

    const data = await response.json()
    const assistantMessage = data.choices[0]?.message

    if (!assistantMessage) {
      throw new Error('No response from AI')
    }

    // Check for tool calls
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      // Add assistant message with tool calls
      messages.push(assistantMessage)

      // Process each tool call
      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.function.name === 'fetch_image') {
          try {
            const args = JSON.parse(toolCall.function.arguments)
            onProgress?.(`📥 Fetching image: ${args.url.slice(0, 50)}...`)
            
            const result = await fetchAndStageImage(args.url, imageDir, args.filename)
            
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            })
            
            onProgress?.(`✓ Image staged: ${result.relativePath}`)
          } catch (err) {
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: err instanceof Error ? err.message : 'Failed to fetch image' }),
            })
            onProgress?.(`⚠️ Image fetch failed`)
          }
        }
      }
    } else {
      // No tool calls, this is the final response
      finalResponse = data
      break
    }
  }

  if (!finalResponse) {
    throw new Error('Max tool calls exceeded')
  }

  const data = finalResponse
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

  // Add previousContent for updates and renames
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
    } else if (change.action === 'rename' && change.previousPath) {
      // For renames, load content from the old path if not provided
      if (!change.content) {
        const content = await fetchContent(change.previousPath)
        if (content) {
          change.content = content
        }
      }
      change.previousContent = await fetchContent(change.previousPath) || undefined
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
 * Apply feedback to revise a changeset.
 * This MODIFIES the existing content rather than regenerating from scratch.
 */
export async function reviseChangeSet(
  currentChangeSet: ChangeSet,
  feedback: string,
  originalNotes: string,
  onProgress?: ProgressCallback
): Promise<ChangeSet> {
  const apiKey = getOpenAIKey()
  if (!apiKey) throw new Error('No OpenAI API key')

  onProgress?.('Analyzing feedback...')

  // Build a more detailed context showing exactly what was generated
  const currentChangesDetail = currentChangeSet.changes.map(c => {
    if (c.action === 'delete') {
      return `### ${c.action.toUpperCase()}: ${c.path}\nReason: ${c.reason || 'N/A'}`
    }
    return `### ${c.action.toUpperCase()}: ${c.path}
Reason: ${c.reason || 'N/A'}
Content:
\`\`\`markdown
${c.content}
\`\`\``
  }).join('\n\n')

  const systemPrompt = `You are a documentation assistant. You previously generated a changeset, and the user wants to modify it.

IMPORTANT: You are EDITING the existing content, not starting over. Make targeted changes based on the feedback while preserving the rest of the work.

Guidelines:
- Keep all content that isn't specifically addressed by the feedback
- Make surgical edits to address the feedback
- Don't rewrite sections that are already good
- Update the summary and commit message to reflect the changes
- If adding new content, integrate it naturally with what exists
- Use rename when asked to move or reorganize files/folders
- Use plain ASCII quotes (" and ') only - never use curly/smart quotes

Respond with the revised changeset in JSON format:
{
  "analysis": "What you changed and why",
  "summary": "Updated summary of all changes",
  "commitMessage": "Updated commit message",
  "changes": [
    {
      "action": "create" | "update" | "delete" | "rename",
      "path": "path/to/file.md",
      "previousPath": "old/path/to/file.md (only for rename)",
      "content": "The COMPLETE file content (with your edits applied)",
      "reason": "Why this change is being made"
    }
  ]
}`

  const userPrompt = `## Original User Notes
${originalNotes}

## Current Generated Changeset

Summary: ${currentChangeSet.summary}

${currentChangesDetail}

## User Feedback
"${feedback}"

Please revise the changeset according to the feedback. Keep what's good, fix what's requested.`

  onProgress?.(`Applying revision with ${getSelectedModel()}...`)

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

  onProgress?.(`Revised ${result.changes.length} change(s)`)

  return result
}

/**
 * Fetch an image from a URL and stage it for commit.
 * Returns the relative path to use in markdown.
 */
async function fetchAndStageImage(
  url: string,
  imageDir: string,
  suggestedFilename?: string
): Promise<{ relativePath: string; fullPath: string }> {
  // Fetch the image
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`)
  }

  const contentType = response.headers.get('content-type') || 'image/png'
  const blob = await response.blob()
  
  // Convert to data URL
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read image'))
    reader.readAsDataURL(blob)
  })

  // Determine filename
  let filename = suggestedFilename
  if (!filename) {
    // Try to extract from URL
    const urlPath = new URL(url).pathname
    filename = urlPath.split('/').pop() || 'image'
    
    // Ensure it has an extension
    if (!filename.includes('.')) {
      filename += '.' + mimeToExtension(contentType)
    }
  }

  // Clean filename
  filename = filename.replace(/[^a-zA-Z0-9._-]/g, '-')

  const fullPath = `${imageDir}/${filename}`.replace(/\/+/g, '/')
  const relativePath = `images/${filename}`

  // Stage the image
  addStagedImage({
    path: fullPath,
    dataUrl,
    mimeType: contentType,
    size: blob.size,
    name: filename,
  })

  return { relativePath, fullPath }
}
