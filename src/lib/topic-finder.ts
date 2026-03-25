import { getOpenAIKey } from '@/components/Credentials'
import { getSelectedModel } from '@/components/ModelSelector'
import { getSelectedRepo } from '@/components/RepoSelection'
import { TOOL_DEFINITIONS, executeTool, getRepoTree } from './github-tools'

export interface TopicResult {
  action: 'create' | 'update'
  path: string
  reason: string
  existingContent?: string
}

export interface BrowseScope {
  type: 'directory' | 'file' | 'selection'
  path: string
  selectedText?: string
  fileContent?: string
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

interface ExplorationContext {
  repoFullName: string
  repoStructure: string | null
  previousSearches: Array<{
    topic: string
    result: TopicResult
  }>
  exploredPaths: Set<string>
  fileContents: Map<string, string>
}

// Cached context per repository
const contextCache = new Map<string, ExplorationContext>()

function getContext(repoFullName: string): ExplorationContext {
  let ctx = contextCache.get(repoFullName)
  if (!ctx) {
    ctx = {
      repoFullName,
      repoStructure: null,
      previousSearches: [],
      exploredPaths: new Set(),
      fileContents: new Map(),
    }
    contextCache.set(repoFullName, ctx)
  }
  return ctx
}

/**
 * Pre-fetch repository structure (can be called early to warm the cache)
 */
export async function prefetchRepoStructure(): Promise<void> {
  const repo = getSelectedRepo()
  if (!repo) return

  const ctx = getContext(repo.full_name)
  if (ctx.repoStructure) return // Already cached

  try {
    const tree = await getRepoTree(3)
    const dirs = tree.filter(e => e.type === 'dir').map(e => `📁 ${e.path}`)
    const rootFiles = tree.filter(e => e.type === 'file' && !e.path.includes('/')).map(e => `📄 ${e.path}`)
    ctx.repoStructure = `Directories:\n${dirs.join('\n') || '(none)'}\n\nRoot files:\n${rootFiles.join('\n') || '(none)'}`
  } catch (err) {
    console.warn('Failed to prefetch repo structure:', err)
  }
}

/**
 * Clear cached context for current repo (useful when switching repos)
 */
export function clearContext(): void {
  const repo = getSelectedRepo()
  if (repo) {
    contextCache.delete(repo.full_name)
  }
}

/**
 * Get previous searches for display
 */
export function getPreviousSearches(): Array<{ topic: string; result: TopicResult }> {
  const repo = getSelectedRepo()
  if (!repo) return []
  const ctx = getContext(repo.full_name)
  return ctx.previousSearches
}

function buildSystemPrompt(ctx: ExplorationContext): string {
  let prompt = `You are a repository organization assistant. Your job is to find the best place in a GitHub repository to store a new piece of knowledge.

Given a topic description from the user, you should:
1. Review the repository structure (provided below if already known)
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

Be thorough but efficient. Use the cached information below when available.`

  // Add cached repo structure
  if (ctx.repoStructure) {
    prompt += `\n\n## Repository Structure (cached)\n${ctx.repoStructure}`
  }

  // Add previously explored paths
  if (ctx.exploredPaths.size > 0) {
    prompt += `\n\n## Previously Explored Paths\n${Array.from(ctx.exploredPaths).join('\n')}`
  }

  // Add cached file contents (summaries only to save tokens)
  if (ctx.fileContents.size > 0) {
    prompt += `\n\n## Previously Read Files`
    for (const [path, content] of ctx.fileContents) {
      // Include first 200 chars as summary
      const summary = content.slice(0, 200).replace(/\n/g, ' ')
      prompt += `\n- ${path}: ${summary}...`
    }
  }

  // Add previous search results
  if (ctx.previousSearches.length > 0) {
    prompt += `\n\n## Previous Searches in This Session`
    for (const search of ctx.previousSearches.slice(-5)) { // Last 5
      prompt += `\n- Topic: "${search.topic}" → ${search.result.action} ${search.result.path}`
    }
  }

  return prompt
}

export async function findTopicLocation(
  topicDescription: string,
  onProgress?: ProgressCallback,
  scope?: BrowseScope | null
): Promise<TopicResult> {
  const apiKey = getOpenAIKey()
  if (!apiKey) throw new Error('No OpenAI API key')
  
  const repo = getSelectedRepo()
  if (!repo) throw new Error('No repository selected')

  const ctx = getContext(repo.full_name)

  onProgress?.('Starting topic analysis...')
  
  // Show scope info
  if (scope) {
    onProgress?.(`Scope: ${scope.type} → ${scope.path}`)
  }

  // Pre-fetch structure if not cached
  if (!ctx.repoStructure) {
    onProgress?.('Fetching repository structure...')
    await prefetchRepoStructure()
    onProgress?.('Repository structure loaded')
  } else {
    onProgress?.('Using cached repository structure')
  }
  
  // Show previous context if available
  if (ctx.previousSearches.length > 0) {
    onProgress?.(`Context: ${ctx.previousSearches.length} previous searches available`)
  }

  // Build user message with scope context
  let userContent = `Repository: ${repo.full_name}\n\nTopic to document: "${topicDescription}"`
  
  if (scope) {
    userContent += `\n\n## Scope Provided by User`
    if (scope.type === 'directory') {
      userContent += `\nThe user has selected the directory: ${scope.path}`
      userContent += `\nFocus your search within this directory or create new content here.`
    } else if (scope.type === 'file') {
      userContent += `\nThe user has selected the file: ${scope.path}`
      if (scope.fileContent) {
        userContent += `\n\nFile content:\n\`\`\`\n${scope.fileContent.slice(0, 2000)}\n\`\`\``
      }
      userContent += `\nThis file is likely where the content should go (as an update).`
    } else if (scope.type === 'selection') {
      userContent += `\nThe user has selected a passage from: ${scope.path}`
      if (scope.selectedText) {
        userContent += `\n\nSelected text:\n> ${scope.selectedText}`
      }
      userContent += `\nThis selection indicates where or how the new content relates.`
    }
  }
  
  userContent += `\n\nPlease find the best location for this content.${ctx.repoStructure ? ' The repository structure is already cached above, so you may not need to call get_repo_structure unless you need more detail.' : ''}`

  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(ctx) },
    { role: 'user', content: userContent },
  ]

  const maxIterations = 10
  let iteration = 0

  while (iteration < maxIterations) {
    iteration++
    
    onProgress?.(`Thinking... (iteration ${iteration}/${maxIterations})`)

    // Call OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: getSelectedModel(),
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
          const result = JSON.parse(jsonMatch[0]) as TopicResult
          
          // Cache this search result
          ctx.previousSearches.push({
            topic: topicDescription,
            result,
          })
          
          onProgress?.('Analysis complete')
          return result
        } catch {
          throw new Error('Failed to parse AI response as JSON')
        }
      }
      throw new Error('AI did not return a valid location recommendation')
    }

    // Execute tool calls and cache results
    onProgress?.(`AI requested ${assistantMessage.tool_calls.length} tool call(s)`)
    
    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name
      const toolArgs = JSON.parse(toolCall.function.arguments)

      // Detailed tool call description
      let toolDesc = ''
      switch (toolName) {
        case 'list_directory':
          toolDesc = `📁 Listing directory: ${toolArgs.path || '(root)'}`
          break
        case 'read_file':
          toolDesc = `📄 Reading file: ${toolArgs.path}`
          break
        case 'search_files':
          toolDesc = `🔍 Searching repo for: "${toolArgs.query}"`
          break
        case 'get_repo_structure':
          toolDesc = `🗂️ Getting full repo structure`
          break
        case 'web_search':
          toolDesc = `🌐 Web search: "${toolArgs.query}"`
          break
        default:
          toolDesc = `⚙️ ${toolName}`
      }
      onProgress?.(toolDesc)

      const result = await executeTool(toolName, toolArgs)

      // Cache exploration results
      if (toolName === 'list_directory' && toolArgs.path) {
        ctx.exploredPaths.add(toolArgs.path)
      }
      if (toolName === 'read_file' && toolArgs.path) {
        // Cache file content (truncated)
        const content = result.replace(/^File:.*\n\n/, '')
        ctx.fileContents.set(toolArgs.path, content.slice(0, 500))
      }
      if (toolName === 'get_repo_structure' && !ctx.repoStructure) {
        ctx.repoStructure = result
      }

      messages.push({
        role: 'tool',
        content: result,
        tool_call_id: toolCall.id,
      })
    }
  }

  throw new Error('AI exploration exceeded maximum iterations')
}
