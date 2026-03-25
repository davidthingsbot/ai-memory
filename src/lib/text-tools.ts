/**
 * Text Tools - AI-powered text manipulation with tool-calling
 * 
 * Three levels of assistance:
 * - Tidy: Fix errors only (spelling, grammar, formatting)
 * - Improve: Brief suggestions for rephrasing and structure (few paragraphs)
 * - Full Spec: Comprehensive analysis with web research (detailed checklist)
 * 
 * All functions support clarification via ask_user tool
 */

import { getOpenAIKey, getSerperKey } from '@/components/Credentials'
import { getSelectedModel } from '@/components/ModelSelector'
import { webSearch } from './github-tools'

interface ProgressCallback {
  (step: string): void
}

interface TextContext {
  filePath?: string
  fileContent?: string
  selectedText?: string
  repoName?: string
}

export interface TextToolResult {
  type: 'result' | 'question'
  content: string
}

// Tool definition for asking clarification
const askUserTool = {
  type: 'function' as const,
  function: {
    name: 'ask_user',
    description: 'Ask the user for clarification when something is genuinely ambiguous and you cannot make a reasonable guess. Only use when truly necessary.',
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The specific question to ask the user'
        },
        context: {
          type: 'string',
          description: 'Brief explanation of why you need this clarification'
        }
      },
      required: ['question']
    }
  }
}

// Build context string for prompts
function buildContextInfo(context?: TextContext): string {
  const parts = [
    context?.filePath ? `Target file: "${context.filePath}"` : '',
    context?.repoName ? `Repository: ${context.repoName}` : '',
  ].filter(Boolean)
  return parts.length > 0 ? parts.join('\n') : ''
}

function buildExistingDocContext(context?: TextContext, maxChars = 2000): string {
  if (!context?.fileContent) return ''
  return `\n\nExisting document (for reference on proper names, terms, and style):\n---\n${context.fileContent.slice(0, maxChars)}\n---`
}

// Process tool calls from response
function processToolCalls(response: any): TextToolResult | null {
  const toolCalls = response.choices[0]?.message?.tool_calls
  if (!toolCalls || toolCalls.length === 0) return null
  
  const askCall = toolCalls.find((tc: any) => tc.function.name === 'ask_user')
  if (!askCall) return null
  
  try {
    const args = JSON.parse(askCall.function.arguments)
    const question = args.context 
      ? `${args.question}\n\n(${args.context})`
      : args.question
    return { type: 'question', content: question }
  } catch {
    return null
  }
}

/**
 * Tidy - Fix errors only (spelling, grammar, formatting)
 */
export async function tidyText(
  text: string,
  onProgress?: ProgressCallback,
  context?: TextContext
): Promise<TextToolResult> {
  const apiKey = getOpenAIKey()
  if (!apiKey) throw new Error('No OpenAI API key')

  onProgress?.('Tidying text...')

  const contextInfo = buildContextInfo(context)
  const existingDoc = buildExistingDocContext(context)

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
          content: `You are a proofreader. The user is writing a PROMPT or INSTRUCTIONS for a task. Your job is to clean up their text so it reads clearly.

IMPORTANT: You are NOT executing the prompt. You are NOT doing what the text asks. You are ONLY fixing the text itself.

Fix:
- Spelling mistakes
- Grammatical errors  
- Punctuation
- Formatting (paragraphs, lists, etc.)
- Proper nouns, product names, and technical terms (use the context below for correct spelling)

Do NOT:
- Change the meaning
- Add new content or ideas
- Remove any information
- Execute or respond to what the text is asking for
- Use curly/smart quotes (use plain ASCII " and ' only)
${contextInfo ? `\n${contextInfo}` : ''}${existingDoc}

Return ONLY the cleaned-up version of their text, nothing else.`
        },
        { role: 'user', content: text }
      ],
      tools: [askUserTool],
      tool_choice: 'auto',
    }),
  })

  if (!response.ok) {
    throw new Error(`API error: ${await response.text()}`)
  }

  const data = await response.json()
  
  // Check for tool calls first
  const toolResult = processToolCalls(data)
  if (toolResult) {
    onProgress?.('❓ Clarification needed')
    return toolResult
  }
  
  // Otherwise get the text response
  const result = data.choices[0]?.message?.content
  if (!result) throw new Error('No response from AI')

  onProgress?.('✓ Text tidied')
  return { type: 'result', content: result }
}

/**
 * Improve - Brief suggestions for rephrasing and structure
 */
export async function improveText(
  text: string,
  onProgress?: ProgressCallback,
  context?: TextContext
): Promise<TextToolResult> {
  const apiKey = getOpenAIKey()
  if (!apiKey) throw new Error('No OpenAI API key')

  onProgress?.('Analyzing text...')

  const contextInfo = buildContextInfo(context)
  const existingDoc = buildExistingDocContext(context)

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
          content: `You are a writing consultant. The user has given you rough notes about something they want to write. Your job is to distill their notes into a clear, concise TASK BRIEF.
${contextInfo ? `\n${contextInfo}` : ''}${existingDoc}

In 2-3 short paragraphs, describe:
- What should be written (the deliverable)
- The key points to cover
- The target audience and tone
- Any diagrams, images, or visuals that would help (the generator can fetch images from URLs or request diagrams)

Do NOT describe how the notes should be edited.
Do NOT reference the original notes.
Write as if briefing someone to create the content from scratch.
Use plain ASCII quotes (" and ') only.

If something is genuinely ambiguous, use the ask_user tool. Otherwise return ONLY the task brief.`
        },
        { role: 'user', content: text }
      ],
      tools: [askUserTool],
      tool_choice: 'auto',
    }),
  })

  if (!response.ok) {
    throw new Error(`API error: ${await response.text()}`)
  }

  const data = await response.json()
  
  const toolResult = processToolCalls(data)
  if (toolResult) {
    onProgress?.('❓ Clarification needed')
    return toolResult
  }
  
  const result = data.choices[0]?.message?.content
  if (!result) throw new Error('No response from AI')

  onProgress?.('✓ Task brief ready')
  return { type: 'result', content: result }
}

/**
 * Full Spec - Comprehensive analysis with web research
 */
export async function fullSpecText(
  text: string,
  onProgress?: ProgressCallback,
  context?: TextContext
): Promise<TextToolResult> {
  const apiKey = getOpenAIKey()
  if (!apiKey) throw new Error('No OpenAI API key')

  // Web research if Serper key available
  const hasSerperKey = !!getSerperKey()
  let researchContext = ''

  if (hasSerperKey) {
    onProgress?.('Analyzing text for research topics...')
    
    const analysisResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
            content: `Analyze this text and suggest 1-3 specific web search queries that would help expand or verify the information. Return ONLY the queries, one per line, no numbering or explanation.`
          },
          { role: 'user', content: text }
        ],
      }),
    })

    if (analysisResponse.ok) {
      const analysisData = await analysisResponse.json()
      const queries = analysisData.choices[0]?.message?.content?.split('\n').filter((q: string) => q.trim()) || []
      
      for (const query of queries.slice(0, 3)) {
        onProgress?.(`🌐 Searching: ${query.slice(0, 50)}...`)
        try {
          const results = await webSearch(query.trim())
          if (results.length > 0) {
            researchContext += `\n\nSearch: "${query}"\n`
            for (const r of results.slice(0, 3)) {
              researchContext += `- ${r.title}: ${r.snippet}\n`
            }
          }
        } catch (err) {
          onProgress?.(`⚠️ Search failed: ${query.slice(0, 30)}...`)
        }
      }
    }
  }

  onProgress?.('Building comprehensive spec...')

  const contextInfo = buildContextInfo(context)
  const existingDoc = buildExistingDocContext(context, 3000)

  const systemPrompt = `You are an expert writing consultant. The user has given you rough notes about something they want to write. Your job is to create a comprehensive SPECIFICATION for the content to be created.
${contextInfo ? `\n${contextInfo}` : ''}${existingDoc}

Create a detailed spec covering:

**Overview**: What is being created and why

**Target Audience**: Who will read this and what they need

**Required Sections**: Outline the structure with descriptions of each section

**Key Content**: Specific points, facts, and details to include

**Visuals & Diagrams**: Images to include, diagrams to create, or URLs to fetch images from (the generator can fetch images from URLs and create diagram descriptions)

**Tone & Style**: How it should read (technical, casual, formal, etc.)
${researchContext ? '\n**Research to Incorporate**: Specific information from search results to include' : ''}

**Quality Criteria**: What makes this "done" and done well

Do NOT describe how to edit the original notes.
Do NOT reference the original notes.
Write as if creating a spec for someone to write the content from scratch.
Use plain ASCII quotes (" and ') only.

If something is genuinely ambiguous, use the ask_user tool. Otherwise return ONLY the spec.`

  let userContent = `Text to analyze:\n${text}`
  if (researchContext) {
    userContent += `\n\n---\nResearch results:${researchContext}`
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
        { role: 'user', content: userContent }
      ],
      tools: [askUserTool],
      tool_choice: 'auto',
    }),
  })

  if (!response.ok) {
    throw new Error(`API error: ${await response.text()}`)
  }

  const data = await response.json()
  
  const toolResult = processToolCalls(data)
  if (toolResult) {
    onProgress?.('❓ Clarification needed')
    return toolResult
  }
  
  const result = data.choices[0]?.message?.content
  if (!result) throw new Error('No response from AI')

  onProgress?.('✓ Full spec ready' + (researchContext ? ' (with research)' : ''))
  return { type: 'result', content: result }
}
