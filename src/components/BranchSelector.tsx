import { useState, useEffect, useCallback } from 'react'
import { Octokit } from 'octokit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getSelectedRepo, getSelectedRepoToken } from '@/components/RepoSelection'
import { useAppStore } from '@/store'
import { GitBranch, Plus, Loader2, Check } from 'lucide-react'

interface Branch {
  name: string
  protected: boolean
}

export function BranchSelector() {
  const { selectedBranch, setSelectedBranch } = useAppStore()
  const repo = getSelectedRepo()

  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // New branch creation
  const [showCreate, setShowCreate] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [creating, setCreating] = useState(false)

  const activeBranch = selectedBranch || repo?.default_branch || 'main'

  // Load branches
  useEffect(() => {
    if (!repo) return

    const token = getSelectedRepoToken()
    if (!token) return

    setLoading(true)
    setError(null)

    const octokit = new Octokit({ auth: token })
    octokit.rest.repos.listBranches({
      owner: repo.owner.login,
      repo: repo.name,
      per_page: 100,
    }).then(response => {
      setBranches(response.data.map(b => ({ name: b.name, protected: b.protected })))
    }).catch(() => {
      setError('Failed to load branches')
    }).finally(() => {
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo?.full_name])

  // Create new branch from current
  const handleCreateBranch = useCallback(async () => {
    if (!newBranchName.trim() || !repo) return

    const token = getSelectedRepoToken()
    if (!token) return

    setCreating(true)
    setError(null)

    try {
      const octokit = new Octokit({ auth: token })

      // Get the SHA of the current branch
      const refResponse = await octokit.rest.git.getRef({
        owner: repo.owner.login,
        repo: repo.name,
        ref: `heads/${activeBranch}`,
      })
      const sha = refResponse.data.object.sha

      // Create the new branch
      await octokit.rest.git.createRef({
        owner: repo.owner.login,
        repo: repo.name,
        ref: `refs/heads/${newBranchName.trim()}`,
        sha,
      })

      // Add to list and select it
      const created = { name: newBranchName.trim(), protected: false }
      setBranches(prev => [...prev, created])
      setSelectedBranch(created.name)
      setNewBranchName('')
      setShowCreate(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create branch')
    } finally {
      setCreating(false)
    }
  }, [newBranchName, repo, activeBranch, setSelectedBranch])

  if (!repo) return null

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-medium text-sm">Branch</h3>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading branches...
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <div className="space-y-2">
          {/* Branch list */}
          <div className="grid gap-1 max-h-40 overflow-y-auto">
            {branches.map(branch => (
              <button
                key={branch.name}
                onClick={() => setSelectedBranch(branch.name)}
                className={`
                  flex items-center gap-2 px-3 py-1.5 text-sm rounded-md text-left
                  ${branch.name === activeBranch
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'hover:bg-muted text-foreground'
                  }
                `}
              >
                {branch.name === activeBranch && <Check className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate">{branch.name}</span>
                {branch.name === repo.default_branch && (
                  <span className="text-xs text-muted-foreground ml-auto shrink-0">default</span>
                )}
              </button>
            ))}
          </div>

          {/* Create new branch */}
          {showCreate ? (
            <div className="flex gap-2 items-center pt-1 border-t">
              <Input
                value={newBranchName}
                onChange={e => setNewBranchName(e.target.value)}
                placeholder="new-branch-name"
                className="h-8 text-sm font-mono"
                onKeyDown={e => e.key === 'Enter' && handleCreateBranch()}
                autoFocus
              />
              <Button
                size="sm"
                className="h-8 shrink-0"
                onClick={handleCreateBranch}
                disabled={!newBranchName.trim() || creating}
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Create'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 shrink-0"
                onClick={() => { setShowCreate(false); setNewBranchName('') }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              New branch from {activeBranch}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
