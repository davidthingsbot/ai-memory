import { useState, useEffect, useCallback } from 'react'
import { Octokit } from 'octokit'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getGitHubTokens } from '@/components/Credentials'
import { FolderGit2, Check, RefreshCw, Search, Lock, Globe, User } from 'lucide-react'
import { clearContext, prefetchRepoStructure } from '@/lib/topic-finder'

const STORAGE_KEY_REPO = 'ai-memory:selected-repo'

export interface Repository {
  id: number
  full_name: string
  name: string
  owner: { login: string }
  private: boolean
  description: string | null
  default_branch: string
  // Track which token provides access
  _tokenLabel?: string
  _tokenIndex?: number
}

interface RepoSelectionProps {
  onRepoChange?: (repo: Repository | null) => void
}

export function RepoSelection({ onRepoChange }: RepoSelectionProps) {
  const [repos, setRepos] = useState<Repository[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null)
  const [filter, setFilter] = useState('')
  const [tokenErrors, setTokenErrors] = useState<string[]>([])

  // Load saved repo on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY_REPO)
    if (saved) {
      try {
        const repo = JSON.parse(saved) as Repository
        setSelectedRepo(repo)
        onRepoChange?.(repo)
      } catch {
        // Invalid JSON, ignore
      }
    }
  }, [onRepoChange])

  const fetchRepos = useCallback(async () => {
    const tokens = getGitHubTokens()
    if (tokens.length === 0) {
      setError('No GitHub tokens found')
      return
    }

    setLoading(true)
    setError(null)
    setTokenErrors([])

    const allRepos: Repository[] = []
    const seenRepoIds = new Set<number>()
    const errors: string[] = []

    // Query each token
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      try {
        const octokit = new Octokit({ auth: token.token })
        
        const response = await octokit.rest.repos.listForAuthenticatedUser({
          sort: 'updated',
          per_page: 100,
          type: 'all'
        })

        // Add repos with token tracking, deduping by ID
        for (const repo of response.data) {
          if (!seenRepoIds.has(repo.id)) {
            seenRepoIds.add(repo.id)
            allRepos.push({
              ...repo as Repository,
              _tokenLabel: token.label,
              _tokenIndex: i,
            })
          }
        }
      } catch (err) {
        console.error(`Failed to fetch repos for token "${token.label}":`, err)
        if (err instanceof Error) {
          if (err.message.includes('401')) {
            errors.push(`${token.label}: Invalid or expired token`)
          } else if (err.message.includes('403')) {
            errors.push(`${token.label}: Token lacks repo permissions`)
          } else {
            errors.push(`${token.label}: ${err.message}`)
          }
        } else {
          errors.push(`${token.label}: Unknown error`)
        }
      }
    }

    // Sort by most recently updated
    allRepos.sort((a, b) => {
      // Repos might not have pushed_at, fall back to alphabetical
      return a.full_name.localeCompare(b.full_name)
    })

    setRepos(allRepos)
    setTokenErrors(errors)

    if (allRepos.length === 0) {
      if (errors.length > 0) {
        setError('Failed to fetch repositories from all tokens')
      } else {
        setError('No repositories found. Check your token permissions.')
      }
    }

    setLoading(false)
  }, [])

  // Fetch repos on mount
  useEffect(() => {
    fetchRepos()
  }, [fetchRepos])

  const selectRepo = (repo: Repository) => {
    // Clear any cached context from previous repo
    clearContext()
    
    setSelectedRepo(repo)
    localStorage.setItem(STORAGE_KEY_REPO, JSON.stringify(repo))
    onRepoChange?.(repo)
    
    // Pre-fetch the new repo's structure in background
    prefetchRepoStructure()
  }

  const clearSelection = () => {
    setSelectedRepo(null)
    localStorage.removeItem(STORAGE_KEY_REPO)
    onRepoChange?.(null)
  }

  const filteredRepos = repos.filter(repo => 
    repo.full_name.toLowerCase().includes(filter.toLowerCase()) ||
    (repo.description?.toLowerCase().includes(filter.toLowerCase()) ?? false)
  )

  // Group repos by token for display
  const tokens = getGitHubTokens()

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderGit2 className="h-5 w-5" />
          Repository
          {selectedRepo && (
            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 ml-2">
              <Check className="h-3 w-3" /> Selected
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Choose which repository to store your memories in.
          {tokens.length > 1 && ` Searching ${tokens.length} accounts.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {selectedRepo ? (
          // Show selected repo
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
              {selectedRepo.private ? (
                <Lock className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Globe className="h-4 w-4 text-muted-foreground" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{selectedRepo.full_name}</p>
                {selectedRepo.description && (
                  <p className="text-sm text-muted-foreground truncate">
                    {selectedRepo.description}
                  </p>
                )}
                {selectedRepo._tokenLabel && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <User className="h-3 w-3" /> via {selectedRepo._tokenLabel}
                  </p>
                )}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={clearSelection}>
              Change Repository
            </Button>
          </div>
        ) : (
          // Show repo picker
          <div className="space-y-3">
            {/* Search and refresh */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter repositories..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button 
                variant="outline" 
                size="icon"
                onClick={fetchRepos}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {/* Token errors */}
            {tokenErrors.length > 0 && (
              <div className="text-xs text-amber-600 dark:text-amber-400 space-y-1">
                {tokenErrors.map((err, i) => (
                  <p key={i}>⚠️ {err}</p>
                ))}
              </div>
            )}

            {/* Error message */}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {/* Repo list */}
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading repositories...
              </div>
            ) : filteredRepos.length > 0 ? (
              <div className="max-h-64 overflow-y-auto space-y-1 rounded-lg border p-1">
                {filteredRepos.map(repo => (
                  <button
                    key={repo.id}
                    onClick={() => selectRepo(repo)}
                    className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-muted text-left transition-colors"
                  >
                    {repo.private ? (
                      <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{repo.full_name}</p>
                      <div className="flex items-center gap-2">
                        {repo.description && (
                          <p className="text-sm text-muted-foreground truncate flex-1">
                            {repo.description}
                          </p>
                        )}
                        {tokens.length > 1 && repo._tokenLabel && (
                          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                            {repo._tokenLabel}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : repos.length > 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No repositories match "{filter}"
              </div>
            ) : null}

            {/* Count */}
            {repos.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {filteredRepos.length} of {repos.length} repositories
                {tokens.length > 1 && ` from ${tokens.length} accounts`}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Utility to get selected repo
export function getSelectedRepo(): Repository | null {
  const saved = localStorage.getItem(STORAGE_KEY_REPO)
  if (!saved) return null
  try {
    return JSON.parse(saved) as Repository
  } catch {
    return null
  }
}

// Get the token for the selected repo
export function getSelectedRepoToken(): string | null {
  const repo = getSelectedRepo()
  if (!repo) return null
  
  const tokens = getGitHubTokens()
  if (repo._tokenIndex !== undefined && tokens[repo._tokenIndex]) {
    return tokens[repo._tokenIndex].token
  }
  
  // Fallback: try to find by label
  if (repo._tokenLabel) {
    const token = tokens.find(t => t.label === repo._tokenLabel)
    if (token) return token.token
  }
  
  // Last resort: return first token
  return tokens.length > 0 ? tokens[0].token : null
}
