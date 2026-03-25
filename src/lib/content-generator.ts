import { getOpenAIKey } from '@/components/Credentials'
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
  insertAfter?: string // For updates: insert after this heading/section
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

  onProgress?.('Preparing...')

  // Fetch existing content if updating
  let existingContent = request.existingContent
  if (request.topicResult.action === 'update' && !existingContent) {
    onProgress?.('Reading existing file...')
    existingContent = await fetchExistingContent(request.topicResult.path) || undefined
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
You are UPDATING an existing document. You need to:
1. Analyze the existing document structure
2. Determine the best place to insert the new content
3. Return the COMPLETE updated document with the new content integrated

Return a JSON object with:
- "markdown": the complete updated document
- "commitMessage": a brief commit message describing the change
- "insertAfter": the heading or section name where you inserted content (for reference)
`
    userPrompt = `## Existing Document (${request.topicResult.path})

${existingContent}

## New Content to Add

The user wants to add the following information:

${request.rawContent}

${request.feedback ? `## Additional Instructions\n\n${request.feedback}` : ''}

Please integrate this new content into the existing document at the most appropriate location. Return the complete updated document.`

  } else {
    systemPrompt += `
You are CREATING a new document. Generate a complete, well-structured markdown file.

Return a JSON object with:
- "markdown": the complete document content
- "commitMessage": a brief commit message describing what was added
`
    userPrompt = `## New Document

File: ${request.topicResult.path}
Repository: ${repo.full_name}

## User's Notes

${request.rawContent}

${request.feedback ? `## Additional Instructions\n\n${request.feedback}` : ''}

Please create a well-structured markdown document from these notes.`
  }

  onProgress?.('Generating content...')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
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

  const data = await response.json()
  const content = data.choices[0].message.content

  try {
    const result = JSON.parse(content)
    onProgress?.('Done')
    return {
      markdown: result.markdown,
      commitMessage: result.commitMessage || `Add documentation for ${request.topicResult.path}`,
      insertAfter: result.insertAfter,
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

  onProgress?.('Revising...')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
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

  const data = await response.json()
  const content = data.choices[0].message.content

  try {
    const result = JSON.parse(content)
    onProgress?.('Done')
    return {
      markdown: result.markdown,
      commitMessage: result.commitMessage || `Update ${topicResult.path}`,
    }
  } catch {
    throw new Error('Failed to parse AI response')
  }
}
