import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/store'
import { Credentials } from '@/components/Credentials'
import { ModelSelector } from '@/components/ModelSelector'
import { RepoSelection, type Repository } from '@/components/RepoSelection'
import { BranchSelector } from '@/components/BranchSelector'
import { Button } from '@/components/ui/button'
import { Check, ArrowRight } from 'lucide-react'

export function SetupTab() {
  const { setSetupComplete, setSelectedRepoFullName, setActiveTab } = useAppStore()
  
  const [hasOpenAI, setHasOpenAI] = useState(false)
  const [hasGitHub, setHasGitHub] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null)
  
  const credentialsReady = hasOpenAI && hasGitHub
  const setupReady = credentialsReady && selectedRepo !== null
  
  const handleCredentialsChange = useCallback((openai: boolean, github: boolean) => {
    setHasOpenAI(openai)
    setHasGitHub(github)
  }, [])
  
  const handleRepoChange = useCallback((repo: Repository | null) => {
    setSelectedRepo(repo)
    setSelectedRepoFullName(repo?.full_name || null)
  }, [setSelectedRepoFullName])
  
  const handleContinue = useCallback(() => {
    if (setupReady) {
      setSetupComplete(true)
      setActiveTab('repository')
    }
  }, [setupReady, setSetupComplete, setActiveTab])
  
  // Restore saved credentials on mount. Only auto-redirect if setup
  // isn't already marked complete (i.e., first time with saved creds).
  // Once complete, activeTab is persisted in the store — the user lands
  // wherever they left off, and can always click the Setup tab to return.
  const { setupComplete } = useAppStore()

  useEffect(() => {
    const storedOpenAI = localStorage.getItem('ai-memory:openai-key')
    const storedTokens = localStorage.getItem('ai-memory:github-tokens')
    const storedRepo = localStorage.getItem('ai-memory:selected-repo')

    if (storedOpenAI && storedTokens && storedRepo) {
      try {
        const repo = JSON.parse(storedRepo) as Repository
        setSelectedRepo(repo)
        setSelectedRepoFullName(repo.full_name)
        setHasOpenAI(true)
        setHasGitHub(true)
        // Auto-redirect only when setup wasn't already completed
        if (!setupComplete) {
          setSetupComplete(true)
        }
      } catch {
        // Invalid stored data, stay on setup
      }
    }
  }, [setSelectedRepoFullName, setSetupComplete, setupComplete])
  
  return (
    <div className="max-w-2xl mx-auto space-y-6 p-6 overflow-auto h-full">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Setup</h2>
        <p className="text-muted-foreground">
          Configure your API keys and select a repository to get started.
        </p>
      </div>
      
      {/* Step 1: Credentials */}
      <Credentials onCredentialsChange={handleCredentialsChange} />
      
      {/* Step 2: Model Selection */}
      {hasOpenAI && <ModelSelector />}
      
      {/* Step 3: Repository Selection */}
      {credentialsReady && (
        <RepoSelection onRepoChange={handleRepoChange} />
      )}

      {/* Step 4: Branch Selection */}
      {selectedRepo && <BranchSelector />}

      {/* Continue button */}
      {setupReady && (
        <div className="flex justify-center pt-4">
          <Button size="lg" onClick={handleContinue} className="gap-2">
            <Check className="h-4 w-4" />
            Continue to Repository
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
      
      {/* Status indicator */}
      <div className="flex justify-center gap-4 text-sm text-muted-foreground">
        <span className={hasOpenAI ? 'text-green-600' : ''}>
          {hasOpenAI ? '✓' : '○'} OpenAI
        </span>
        <span className={hasGitHub ? 'text-green-600' : ''}>
          {hasGitHub ? '✓' : '○'} GitHub
        </span>
        <span className={selectedRepo ? 'text-green-600' : ''}>
          {selectedRepo ? '✓' : '○'} Repository
        </span>
        <span className={selectedRepo ? 'text-green-600' : ''}>
          {selectedRepo ? '✓' : '○'} Branch
        </span>
      </div>
    </div>
  )
}
