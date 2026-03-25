import { useState, useEffect, useCallback } from 'react'
import { Octokit } from 'octokit'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getGitHubPat } from '@/components/Credentials'
import { FolderGit2, Check, RefreshCw, Search, Lock, Globe } from 'lucide-react'
import { clearContext, prefetchRepoStructure } from '@/lib/topic-finder'

const STORAGE_KEY_REPO = 'ai-memory:selected-repo'

interface Repository {
  id: number
  full_name: string
  name: string
  owner: { login: string }
  private: boolean
  description: string | null
  default_branch: string
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
    const token = getGitHubPat()
    if (!token) {
      setError('No GitHub token found')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const octokit = new Octokit({ auth: token })
      
      // Fetch repos the token has access to
      // This works for both classic PATs (all repos) and fine-grained (specific repos)
      const response = await octokit.rest.repos.listForAuthenticatedUser({
        sort: 'updated',
        per_page: 100,
        type: 'all'
      })

      setRepos(response.data as Repository[])
      
      if (response.data.length === 0) {
        setError('No repositories found. Check your token permissions.')
      }
    } catch (err) {
      console.error('Failed to fetch repos:', err)
      if (err instanceof Error) {
        if (err.message.includes('401')) {
          setError('Invalid or expired token. Please update your GitHub PAT.')
        } else if (err.message.includes('403')) {
          setError('Token lacks permission to list repositories.')
        } else {
          setError(`Failed to fetch repositories: ${err.message}`)
        }
      } else {
        setError('Failed to fetch repositories')
      }
    } finally {
      setLoading(false)
    }
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
                      {repo.description && (
                        <p className="text-sm text-muted-foreground truncate">
                          {repo.description}
                        </p>
                      )}
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

export type { Repository }
