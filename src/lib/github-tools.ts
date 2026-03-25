import { Octokit } from 'octokit'
import { getBraveKey } from '@/components/Credentials'
import { getSelectedRepo, getSelectedRepoToken } from '@/components/RepoSelection'

export interface DirectoryEntry {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
}

export interface FileContent {
  path: string
  content: string
  size: number
  sha: string
}

function getOctokit(): Octokit {
  const token = getSelectedRepoToken()
  if (!token) throw new Error('No GitHub token')
  return new Octokit({ auth: token })
}

function getRepoInfo(): { owner: string; repo: string } {
  const repo = getSelectedRepo()
  if (!repo) throw new Error('No repository selected')
  return { owner: repo.owner.login, repo: repo.name }
}

/**
 * List contents of a directory in the repository
 */
export async function listDirectory(path: string = ''): Promise<DirectoryEntry[]> {
  const octokit = getOctokit()
  const { owner, repo } = getRepoInfo()

  try {
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: path || '',
    })

    if (!Array.isArray(response.data)) {
      // It's a file, not a directory
      return []
    }

    return response.data.map(item => ({
      name: item.name,
      path: item.path,
      type: item.type === 'dir' ? 'dir' : 'file',
      size: item.size,
    }))
  } catch (err) {
    if ((err as any)?.status === 404) {
      return [] // Path doesn't exist
    }
    throw err
  }
}

/**
 * Read the content of a file
 */
export async function readFile(path: string): Promise<FileContent | null> {
  const octokit = getOctokit()
  const { owner, repo } = getRepoInfo()

  try {
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
    })

    if (Array.isArray(response.data)) {
      return null // It's a directory
    }

    if (response.data.type !== 'file' || !('content' in response.data)) {
      return null
    }

    // Decode base64 content
    const content = atob(response.data.content.replace(/\n/g, ''))

    return {
      path: response.data.path,
      content,
      size: response.data.size,
      sha: response.data.sha,
    }
  } catch (err) {
    if ((err as any)?.status === 404) {
      return null
    }
    throw err
  }
}

/**
 * Search for files matching a query in the repository
 */
export async function searchFiles(query: string): Promise<{ path: string; matches: string[] }[]> {
  const octokit = getOctokit()
  const { owner, repo } = getRepoInfo()

  try {
    // GitHub code search
    const response = await octokit.rest.search.code({
      q: `${query} repo:${owner}/${repo}`,
      per_page: 10,
    })

    return response.data.items.map(item => ({
      path: item.path,
      matches: (item.text_matches?.map(m => m.fragment).filter((f): f is string => !!f)) || [],
    }))
  } catch (err) {
    // Code search may not be available for all repos
    console.warn('Code search failed:', err)
    return []
  }
}

/**
 * Get repository tree (recursive directory listing)
 */
export async function getRepoTree(maxDepth: number = 3): Promise<DirectoryEntry[]> {
  const octokit = getOctokit()
  const { owner, repo } = getRepoInfo()
  const selectedRepo = getSelectedRepo()
  
  try {
    const response = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: selectedRepo?.default_branch || 'main',
      recursive: 'true',
    })

    return response.data.tree
      .filter(item => {
        // Filter by depth
        const depth = (item.path?.split('/').length || 0)
        return depth <= maxDepth
      })
      .map(item => ({
        name: item.path?.split('/').pop() || '',
        path: item.path || '',
        type: item.type === 'tree' ? 'dir' : 'file',
        size: item.size,
      }))
  } catch (err) {
    console.error('Failed to get repo tree:', err)
    return []
  }
}

/**
 * Search the web using Brave Search API
 */
export async function webSearch(query: string): Promise<{ title: string; url: string; snippet: string }[]> {
  const apiKey = getBraveKey()
  if (!apiKey) {
    throw new Error('Brave Search API key not configured')
  }

  const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`, {
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': apiKey,
    },
  })

  if (!response.ok) {
    throw new Error(`Brave Search error: ${response.status}`)
  }

  const data = await response.json()
  
  return (data.web?.results || []).map((r: any) => ({
    title: r.title,
    url: r.url,
    snippet: r.description,
  }))
}

// Tool definitions for OpenAI function calling
export const TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'list_directory',
      description: 'List the contents of a directory in the repository. Returns files and subdirectories.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the directory (empty string for root)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read the contents of a file in the repository. Use this to check if a file already covers a topic.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_files',
      description: 'Search for files containing specific text or keywords. Good for finding existing content about a topic.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query (keywords or phrases)',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_repo_structure',
      description: 'Get an overview of the repository structure (all directories and files up to 3 levels deep). Use this first to understand how the repository is organized.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'web_search',
      description: 'Search the web for information using Brave Search. Use this to research topics, find supporting information, or verify facts. Returns titles, URLs, and snippets.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query',
          },
        },
        required: ['query'],
      },
    },
  },
]

/**
 * Execute a tool call from the AI
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  try {
    switch (name) {
      case 'list_directory': {
        const entries = await listDirectory((args.path as string) || '')
        if (entries.length === 0) {
          return 'Directory is empty or does not exist.'
        }
        return entries
          .map(e => `${e.type === 'dir' ? '📁' : '📄'} ${e.path}`)
          .join('\n')
      }

      case 'read_file': {
        const file = await readFile(args.path as string)
        if (!file) {
          return 'File not found or is not a text file.'
        }
        // Truncate very long files
        const maxLen = 4000
        const content = file.content.length > maxLen 
          ? file.content.slice(0, maxLen) + '\n\n[... truncated ...]'
          : file.content
        return `File: ${file.path} (${file.size} bytes)\n\n${content}`
      }

      case 'search_files': {
        const results = await searchFiles(args.query as string)
        if (results.length === 0) {
          return 'No files found matching the query.'
        }
        return results
          .map(r => `📄 ${r.path}${r.matches.length > 0 ? '\n   ' + r.matches[0].slice(0, 100) : ''}`)
          .join('\n')
      }

      case 'get_repo_structure': {
        const tree = await getRepoTree(3)
        if (tree.length === 0) {
          return 'Could not retrieve repository structure.'
        }
        // Group by top-level directory
        const dirs = tree.filter(e => e.type === 'dir').map(e => `📁 ${e.path}`)
        const rootFiles = tree.filter(e => e.type === 'file' && !e.path.includes('/')).map(e => `📄 ${e.path}`)
        return `Repository structure:\n\nDirectories:\n${dirs.join('\n') || '(none)'}\n\nRoot files:\n${rootFiles.join('\n') || '(none)'}`
      }

      case 'web_search': {
        try {
          const results = await webSearch(args.query as string)
          if (results.length === 0) {
            return 'No results found.'
          }
          return results
            .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
            .join('\n\n')
        } catch (err) {
          if (err instanceof Error && err.message.includes('not configured')) {
            return 'Web search not available (Brave API key not configured).'
          }
          throw err
        }
      }

      default:
        return `Unknown tool: ${name}`
    }
  } catch (err) {
    return `Error executing ${name}: ${err instanceof Error ? err.message : 'Unknown error'}`
  }
}
