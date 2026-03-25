/**
 * Text Tools - AI-powered text manipulation
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
  // Check for clarification markers
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

/**
 * Tidy up text - fix formatting, spelling, grammar without changing content
 */
export async function tidyText(
  text: string,
  onProgress?: ProgressCallback,
  context?: TextContext
): Promise<TextToolResult> {
  const apiKey = getOpenAIKey()
  if (!apiKey) throw new Error('No OpenAI API key')

  onProgress?.('Tidying text...')

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
          content: `You are a text editor. Your job is to clean up the user's text:
- Fix spelling mistakes
- Fix grammatical errors  
- Fix punctuation
- Improve formatting (paragraphs, lists, etc.)
- Ensure proper nouns, product names, and technical terms are capitalized correctly
- Do NOT change the meaning or add new content
- Do NOT remove any information
- Keep the same tone and style
- Use plain ASCII quotes (" and ') only - never curly/smart quotes
${context?.filePath ? `\nContext: This text is for "${context.filePath}"` : ''}
${context?.fileContent ? `\nExisting document content (for reference on proper names/terms):\n---\n${context.fileContent.slice(0, 2000)}\n---` : ''}

If something is genuinely ambiguous and you cannot make a reasonable guess, start your response with "CLARIFICATION:" followed by a specific question. Only ask if truly necessary.

Otherwise, return ONLY the cleaned up text, nothing else.`
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

  if (!result) {
    throw new Error('No response from AI')
  }

  const parsed = parseResponse(result)
  
  if (parsed.type === 'question') {
    onProgress?.('❓ Clarification needed')
  } else {
    onProgress?.('✓ Text tidied')
  }
  
  return parsed
}

/**
 * Improve text - reorganize, clarify, extend with web research
 */
export async function improveText(
  text: string,
  onProgress?: ProgressCallback,
  context?: TextContext
): Promise<TextToolResult> {
  const apiKey = getOpenAIKey()
  if (!apiKey) throw new Error('No OpenAI API key')

  // Check if we have Serper key for web search
  const hasSerperKey = !!getSerperKey()
  let researchContext = ''

  if (hasSerperKey) {
    onProgress?.('Analyzing text for research topics...')
    
    // First, ask AI what to research
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
      
      // Perform web searches
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

  onProgress?.('Analyzing improvements...')

  // Build context info for the prompt
  const contextInfo = [
    context?.filePath ? `Target file: "${context.filePath}"` : '',
    context?.repoName ? `Repository: ${context.repoName}` : '',
  ].filter(Boolean).join('\n')

  const existingDocContext = context?.fileContent 
    ? `\n\nExisting document (for reference on proper names, terms, and style):\n---\n${context.fileContent.slice(0, 3000)}\n---`
    : ''

  const systemPrompt = `You are an expert editor and writing consultant. Analyze the user's text and create a clear SPECIFICATION for how it should be improved. Do NOT rewrite the text yourself.
${contextInfo ? `\n${contextInfo}` : ''}

Your spec should include:
- **Proper Names & Terms**: Verify capitalization and consistency of product names, people, technical terms
- **Structure**: How to reorganize for better flow
- **Clarity**: Which sections are unclear and how to fix them
- **Gaps**: What's missing that should be added
- **Redundancy**: What can be cut or consolidated
- **Research**: Specific facts/details to look up and add
${researchContext ? '\n- **From Research**: Specific information from the search results that should be incorporated' : ''}

Format as a clear, actionable checklist. Be specific - reference actual sentences or paragraphs.
Use plain ASCII quotes (" and ') only.

If something is genuinely ambiguous (e.g., unclear acronyms, ambiguous references, missing critical context), start your response with "CLARIFICATION:" followed by a specific question. Only ask if truly necessary.

Otherwise, return ONLY the improvement specification, not rewritten text.`

  let userContent = `Text to analyze:\n${text}`
  if (existingDocContext) {
    userContent += existingDocContext
  }
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

  if (!result) {
    throw new Error('No response from AI')
  }

  const parsed = parseResponse(result)
  
  if (parsed.type === 'question') {
    onProgress?.('❓ Clarification needed')
  } else {
    onProgress?.('✓ Improvement spec ready' + (researchContext ? ' (with research)' : ''))
  }
  
  return parsed
}
