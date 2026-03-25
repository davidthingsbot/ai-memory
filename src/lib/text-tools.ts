/**
 * Text Tools - AI-powered text manipulation
 * 
 * Three levels of assistance:
 * - Tidy: Fix errors only (spelling, grammar, formatting)
 * - Improve: Brief suggestions for rephrasing and structure (few paragraphs)
 * - Full Spec: Comprehensive analysis with web research (detailed checklist)
 */

import { getOpenAIKey, getSerperKey } from '@/components/Credentials'
import { getSelectedModel } from '@/components/ModelSelector'
import { webSearch } from './github-tools'

interface ProgressCallback {
  (step: string): void
}

interface TextContext {
  filePath?: string        // Target file path for context
  fileContent?: string     // Existing file content (for updates)
  selectedText?: string    // Selected text in file
  repoName?: string        // Repository name
}

export interface TextToolResult {
  type: 'result' | 'question'
  content: string
}

// Check if AI response is asking for clarification
function parseResponse(response: string): TextToolResult {
  const clarificationMarkers = [
    /^CLARIFICATION:\s*/i,
    /^QUESTION:\s*/i,
    /^I need to ask:\s*/i,
    /^Before I can proceed,?\s*/i,
    /^Could you (please )?(clarify|explain|tell me)/i,
  ]
  
  for (const marker of clarificationMarkers) {
    if (marker.test(response.trim())) {
      return {
        type: 'question',
        content: response.replace(marker, '').trim(),
      }
    }
  }
  
  return { type: 'result', content: response }
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

/**
 * Tidy - Fix errors only (spelling, grammar, formatting)
 * Does NOT change meaning or add content
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

If genuinely ambiguous, start with "CLARIFICATION:" and ask. Otherwise return ONLY the cleaned text.`
        },
        { role: 'user', content: text }
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`API error: ${await response.text()}`)
  }

  const data = await response.json()
  const result = data.choices[0]?.message?.content

  if (!result) throw new Error('No response from AI')

  const parsed = parseResponse(result)
  onProgress?.(parsed.type === 'question' ? '❓ Clarification needed' : '✓ Text tidied')
  return parsed
}

/**
 * Improve - Brief suggestions for rephrasing and structure
 * No research, just a few paragraphs of guidance
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

If genuinely ambiguous, start with "CLARIFICATION:" and ask. Otherwise return ONLY your brief suggestions.`
        },
        { role: 'user', content: text }
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`API error: ${await response.text()}`)
  }

  const data = await response.json()
  const result = data.choices[0]?.message?.content

  if (!result) throw new Error('No response from AI')

  const parsed = parseResponse(result)
  onProgress?.(parsed.type === 'question' ? '❓ Clarification needed' : '✓ Suggestions ready')
  return parsed
}

/**
 * Full Spec - Comprehensive analysis with web research
 * Detailed actionable checklist covering all aspects
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

If genuinely ambiguous (unclear acronyms, ambiguous references), start with "CLARIFICATION:" and ask. Otherwise return ONLY the spec.`

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
    }),
  })

  if (!response.ok) {
    throw new Error(`API error: ${await response.text()}`)
  }

  const data = await response.json()
  const result = data.choices[0]?.message?.content

  if (!result) throw new Error('No response from AI')

  const parsed = parseResponse(result)
  onProgress?.(parsed.type === 'question' 
    ? '❓ Clarification needed' 
    : '✓ Full spec ready' + (researchContext ? ' (with research)' : ''))
  return parsed
}
