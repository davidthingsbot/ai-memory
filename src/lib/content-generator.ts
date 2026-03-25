import { getOpenAIKey } from '@/components/Credentials'
import { getSelectedModel } from '@/components/ModelSelector'
import { getSelectedRepo } from '@/components/RepoSelection'
import { readFile } from './github-tools'
import type { TopicResult } from './topic-finder'

export interface GenerateRequest {
  topicResult: TopicResult
  rawContent: string
  existingContent?: string
  feedback?: string
}

export interface GeneratedContent {
  markdown: string
  commitMessage: string
  // For updates:
  analysis?: string      // What sections exist, where content fits
  strategy?: 'expand_section' | 'new_section' | 'inline_addition'
  location?: string      // The heading/section where content was placed
}

interface ProgressCallback {
  (step: string): void
}

async function fetchExistingContent(path: string): Promise<string | null> {
  try {
    const file = await readFile(path)
    return file?.content || null
  } catch {
    return null
  }
}

export async function generateContent(
  request: GenerateRequest,
  onProgress?: ProgressCallback
): Promise<GeneratedContent> {
  const apiKey = getOpenAIKey()
  if (!apiKey) throw new Error('No OpenAI API key')

  const repo = getSelectedRepo()
  if (!repo) throw new Error('No repository selected')

  onProgress?.('Preparing content generation...')
  onProgress?.(`Target: ${request.topicResult.path}`)
  onProgress?.(`Action: ${request.topicResult.action === 'create' ? 'Creating new file' : 'Updating existing file'}`)

  // Fetch existing content if updating
  let existingContent = request.existingContent
  if (request.topicResult.action === 'update' && !existingContent) {
    onProgress?.('Fetching existing file content...')
    existingContent = await fetchExistingContent(request.topicResult.path) || undefined
    if (existingContent) {
      onProgress?.(`Loaded ${existingContent.length} characters from existing file`)
    } else {
      onProgress?.('Note: Could not load existing file (will create new)')
    }
  }

  const isUpdate = request.topicResult.action === 'update'
  
  let systemPrompt = `You are a technical writer helping to document knowledge in a GitHub repository.

Your task is to take rough, informal notes and transform them into well-structured markdown documentation.

Guidelines:
- Write clear, concise documentation
- Use appropriate markdown formatting (headings, lists, code blocks, etc.)
- Preserve all the information from the user's notes
- Add structure and organization
- Fix grammar and spelling
- If the user mentioned wanting research on specific topics, include relevant details
- Keep the tone professional but approachable
`

  let userPrompt: string

  if (isUpdate && existingContent) {
    systemPrompt += `
You are UPDATING an existing document. Your task:

1. ANALYZE the existing document structure:
   - Identify all headings and sections
   - Understand the document's organizational pattern
   - Note any style conventions used

2. DECIDE on placement strategy:
   - EXPAND existing section: if the new content fits naturally under an existing heading
   - NEW section: if the content deserves its own heading
   - INLINE addition: if it's a small addition to existing paragraph content

3. INTEGRATE the content:
   - Match the existing document's tone and style
   - Use consistent heading levels
   - Maintain logical flow

4. Return a JSON object with:
   - "analysis": brief description of what sections exist and where content fits
   - "strategy": "expand_section" | "new_section" | "inline_addition"
   - "location": the heading/section name where you're placing content
   - "markdown": the complete updated document
   - "commitMessage": a brief commit message describing the change
`
    const hasNotes = request.rawContent.trim().length > 0
    userPrompt = `## Existing Document (${request.topicResult.path})

\`\`\`markdown
${existingContent}
\`\`\`

## Task

${hasNotes 
  ? `The user wants to add the following information:\n\n${request.rawContent}` 
  : `The user wants to expand or improve this document. No specific notes provided — review the document and suggest improvements, fill in gaps, or expand thin sections.`}

${request.feedback ? `## Additional Instructions\n\n${request.feedback}` : ''}

First, analyze the document structure and decide where this content should go. Then integrate it and return the complete updated document.`

  } else {
    systemPrompt += `
You are CREATING a new document. Generate a complete, well-structured markdown file.

If the user provides notes, incorporate them. If no notes are provided, create a reasonable starter document based on the topic/filename — include common sections, placeholders for key information, and helpful structure.

Return a JSON object with:
- "markdown": the complete document content
- "commitMessage": a brief commit message describing what was added
`
    const hasNotes = request.rawContent.trim().length > 0
    userPrompt = `## New Document

File: ${request.topicResult.path}
Repository: ${repo.full_name}
Topic reasoning: ${request.topicResult.reason}

${hasNotes ? `## User's Notes\n\n${request.rawContent}` : '## No Notes Provided\n\nThe user wants to create this document but hasn\'t provided specific notes. Generate a well-structured starter document based on the filename and topic. Include relevant sections and placeholders.'}

${request.feedback ? `## Additional Instructions\n\n${request.feedback}` : ''}

Please create a well-structured markdown document.`
  }

  onProgress?.(`Sending to AI (${getSelectedModel()})...`)
  if (request.rawContent.trim()) {
    onProgress?.(`Input: ${request.rawContent.length} chars of user notes`)
  } else {
    onProgress?.('No additional notes — generating from topic/scope alone')
  }
  if (request.feedback) {
    onProgress?.(`Feedback: "${request.feedback.slice(0, 50)}${request.feedback.length > 50 ? '...' : ''}"`)
  }

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
    throw new Error(`OpenAI API error: ${error}`)
  }

  onProgress?.('Received AI response, parsing...')
  
  const data = await response.json()
  const content = data.choices[0].message.content
  
  // Report token usage if available
  if (data.usage) {
    onProgress?.(`Tokens: ${data.usage.prompt_tokens} in → ${data.usage.completion_tokens} out`)
  }

  try {
    const result = JSON.parse(content)
    
    onProgress?.(`Generated ${result.markdown?.length || 0} characters of markdown`)
    
    // Report analysis for updates
    if (result.analysis) {
      onProgress?.(`📊 Analysis: ${result.analysis}`)
    }
    if (result.strategy) {
      const strategyLabels: Record<string, string> = {
        'expand_section': 'Expanding existing section',
        'new_section': 'Creating new section',
        'inline_addition': 'Adding inline content',
      }
      onProgress?.(`Strategy: ${strategyLabels[result.strategy] || result.strategy}`)
    }
    if (result.location) {
      onProgress?.(`Location: "${result.location}"`)
    }
    
    return {
      markdown: result.markdown,
      commitMessage: result.commitMessage || `Add documentation for ${request.topicResult.path}`,
      analysis: result.analysis,
      strategy: result.strategy,
      location: result.location,
    }
  } catch {
    throw new Error('Failed to parse AI response')
  }
}

export async function reviseContent(
  currentMarkdown: string,
  feedback: string,
  topicResult: TopicResult,
  onProgress?: ProgressCallback
): Promise<GeneratedContent> {
  const apiKey = getOpenAIKey()
  if (!apiKey) throw new Error('No OpenAI API key')

  onProgress?.('Preparing revision...')
  onProgress?.(`Current document: ${currentMarkdown.length} characters`)
  onProgress?.(`Feedback: "${feedback.slice(0, 100)}${feedback.length > 100 ? '...' : ''}"`)
  onProgress?.(`Sending to AI (${getSelectedModel()})...`)

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: getSelectedModel(),
      messages: [
        {
          role: 'system',
          content: `You are a technical writer revising documentation based on feedback.

Modify the document according to the user's feedback while preserving the overall structure and any content they didn't mention.

Return a JSON object with:
- "markdown": the revised document
- "commitMessage": a brief commit message describing the revision`,
        },
        {
          role: 'user',
          content: `## Current Document

${currentMarkdown}

## Feedback / Requested Changes

${feedback}

Please revise the document according to this feedback.`,
        },
      ],
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error: ${error}`)
  }

  onProgress?.('Received AI response, parsing...')
  
  const data = await response.json()
  const content = data.choices[0].message.content

  // Report token usage if available
  if (data.usage) {
    onProgress?.(`Tokens: ${data.usage.prompt_tokens} in → ${data.usage.completion_tokens} out`)
  }

  try {
    const result = JSON.parse(content)
    const sizeDiff = result.markdown.length - currentMarkdown.length
    onProgress?.(`Revised: ${result.markdown.length} chars (${sizeDiff >= 0 ? '+' : ''}${sizeDiff})`)
    return {
      markdown: result.markdown,
      commitMessage: result.commitMessage || `Update ${topicResult.path}`,
    }
  } catch {
    throw new Error('Failed to parse AI response')
  }
}
