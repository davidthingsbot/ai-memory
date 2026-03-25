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
          content: `You are a text editor. Clean up the user's text:
- Fix spelling mistakes
- Fix grammatical errors  
- Fix punctuation
- Improve formatting (paragraphs, lists, etc.)
- Ensure proper nouns, product names, and technical terms are capitalized correctly
- Do NOT change the meaning or add new content
- Do NOT remove any information
- Keep the same tone and style
- Use plain ASCII quotes (" and ') only - never curly/smart quotes
${contextInfo ? `\n${contextInfo}` : ''}${existingDoc}

If something is genuinely ambiguous, use the ask_user tool. Otherwise return ONLY the cleaned text.`
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
          content: `You are a writing coach. Give brief, actionable suggestions to improve the user's text.
${contextInfo ? `\n${contextInfo}` : ''}${existingDoc}

In just 2-3 short paragraphs, suggest:
- How to rephrase awkward or unclear sentences
- How to improve structure and flow
- Any obvious gaps or redundancies

Be concise and specific. Reference actual phrases from the text.
Do NOT rewrite the text yourself.
Do NOT do research or comprehensive analysis.
Use plain ASCII quotes (" and ') only.

If something is genuinely ambiguous, use the ask_user tool. Otherwise return ONLY your brief suggestions.`
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

  onProgress?.('✓ Suggestions ready')
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

  const systemPrompt = `You are an expert editor and writing consultant. Create a comprehensive SPECIFICATION for improving the user's text. Do NOT rewrite the text yourself.
${contextInfo ? `\n${contextInfo}` : ''}${existingDoc}

Your spec should cover:
- **Proper Names & Terms**: Capitalization and consistency issues
- **Structure**: How to reorganize for better flow
- **Clarity**: Which sections are unclear and how to fix them
- **Gaps**: What's missing that should be added
- **Redundancy**: What can be cut or consolidated
- **Research**: Specific facts/details to look up and add
${researchContext ? '\n- **From Research**: Specific information from the search results to incorporate' : ''}

Format as a detailed, actionable checklist. Be specific - reference actual sentences or paragraphs.
Use plain ASCII quotes (" and ') only.

If something is genuinely ambiguous (unclear acronyms, ambiguous references), use the ask_user tool. Otherwise return ONLY the spec.`

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
