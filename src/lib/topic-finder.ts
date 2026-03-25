import { getOpenAIKey } from '@/components/Credentials'
import { getSelectedRepo } from '@/components/RepoSelection'
import { TOOL_DEFINITIONS, executeTool } from './github-tools'

export interface TopicResult {
  action: 'create' | 'update'
  path: string
  reason: string
  existingContent?: string
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

interface ProgressCallback {
  (step: string): void
}

const SYSTEM_PROMPT = `You are a repository organization assistant. Your job is to find the best place in a GitHub repository to store a new piece of knowledge.

Given a topic description from the user, you should:
1. First, get an overview of the repository structure using get_repo_structure
2. Look for existing files or folders that relate to the topic
3. Decide whether to CREATE a new file or UPDATE an existing file
4. Determine the exact path

When deciding:
- If an existing file already covers this topic or a closely related one, prefer UPDATE
- If no relevant file exists but there's a good folder for it, prefer CREATE in that folder
- If the repo has a clear organizational pattern (e.g., folders by category), follow it
- For new files, suggest a descriptive filename ending in .md

After exploring, respond with a JSON object (and nothing else) in this format:
{
  "action": "create" or "update",
  "path": "path/to/file.md",
  "reason": "Brief explanation of why this location was chosen"
}

Be thorough but efficient. Don't read every file - use search and directory listings to narrow down, then read specific files only if needed to confirm.`

export async function findTopicLocation(
  topicDescription: string,
  onProgress?: ProgressCallback
): Promise<TopicResult> {
  const apiKey = getOpenAIKey()
  if (!apiKey) throw new Error('No OpenAI API key')
  
  const repo = getSelectedRepo()
  if (!repo) throw new Error('No repository selected')

  onProgress?.('Starting analysis...')

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { 
      role: 'user', 
      content: `Repository: ${repo.full_name}\n\nTopic to document: "${topicDescription}"\n\nPlease find the best location for this content.`
    },
  ]

  const maxIterations = 10
  let iteration = 0

  while (iteration < maxIterations) {
    iteration++

    // Call OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        tools: TOOL_DEFINITIONS,
        tool_choice: 'auto',
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenAI API error: ${error}`)
    }

    const data = await response.json()
    const choice = data.choices[0]
    const assistantMessage = choice.message

    // Add assistant's response to messages
    messages.push({
      role: 'assistant',
      content: assistantMessage.content || '',
      tool_calls: assistantMessage.tool_calls,
    })

    // Check if we're done (no tool calls, just a final response)
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      // Parse the JSON response
      const content = assistantMessage.content || ''
      
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[0])
          onProgress?.('Analysis complete')
          return {
            action: result.action,
            path: result.path,
            reason: result.reason,
          }
        } catch {
          throw new Error('Failed to parse AI response as JSON')
        }
      }
      throw new Error('AI did not return a valid location recommendation')
    }

    // Execute tool calls
    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name
      const toolArgs = JSON.parse(toolCall.function.arguments)

      onProgress?.(`Exploring: ${toolName}${toolArgs.path ? ` (${toolArgs.path})` : toolArgs.query ? ` "${toolArgs.query}"` : ''}`)

      const result = await executeTool(toolName, toolArgs)

      messages.push({
        role: 'tool',
        content: result,
        tool_call_id: toolCall.id,
      })
    }
  }

  throw new Error('AI exploration exceeded maximum iterations')
}
