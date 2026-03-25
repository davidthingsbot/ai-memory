import { useState, useCallback, useRef, useEffect } from 'react'
import { Credentials } from '@/components/Credentials'
import { ModelSelector } from '@/components/ModelSelector'
import { RepoSelection, type Repository } from '@/components/RepoSelection'
import { RepoBrowser, type BrowseScope } from '@/components/RepoBrowser'
import { ContentEditor } from '@/components/ContentEditor'

function App() {
  const [hasOpenAI, setHasOpenAI] = useState(false)
  const [hasGitHub, setHasGitHub] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null)
  const [browseScope, setBrowseScope] = useState<BrowseScope | null>(null)
  const [contentKey, setContentKey] = useState(0)
  const [browserKey, setBrowserKey] = useState(0)
  const [browserRefreshPending, setBrowserRefreshPending] = useState(false)

  // Refs for scrolling
  const credentialsRef = useRef<HTMLDivElement>(null)
  const repoRef = useRef<HTMLDivElement>(null)
  const contextRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // Scroll to the next section that needs attention
  const scrollToNextSection = useCallback(() => {
    // Small delay to let DOM update
    setTimeout(() => {
      if (!hasOpenAI || !hasGitHub) {
        credentialsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else if (!selectedRepo) {
        repoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else {
        // Everything ready - focus on context
        contextRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 100)
  }, [hasOpenAI, hasGitHub, selectedRepo])

  // On initial load, scroll to the appropriate section
  useEffect(() => {
    scrollToNextSection()
  }, []) // Only on mount

  // When credentials become ready, scroll to repo selection
  useEffect(() => {
    if (hasOpenAI && hasGitHub && !selectedRepo) {
      repoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [hasOpenAI, hasGitHub, selectedRepo])

  // When repo is selected, scroll to context
  useEffect(() => {
    if (selectedRepo) {
      contextRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [selectedRepo])

  const handleCredentialsChange = useCallback((openai: boolean, github: boolean) => {
    setHasOpenAI(openai)
    setHasGitHub(github)
  }, [])

  const handleRepoChange = useCallback((repo: Repository | null) => {
    setSelectedRepo(repo)
    setBrowseScope(null)
    setContentKey(k => k + 1)
  }, [])

  const handleScopeSelect = useCallback((scope: BrowseScope | null) => {
    setBrowseScope(scope)
  }, [])

  const handleScopeChange = useCallback(() => {
    setContentKey(k => k + 1)
  }, [])

  const handleContentComplete = useCallback((wasCommit?: boolean) => {
    // Reset content and scroll back to context for another entry
    setContentKey(k => k + 1)
    setBrowseScope(null)
    
    // If there was a commit, schedule a browser refresh after GitHub processes
    if (wasCommit) {
      setBrowserRefreshPending(true)
      setTimeout(() => {
        setBrowserRefreshPending(false)
        setBrowserKey(k => k + 1)
      }, 6000) // 6 seconds for GitHub to process
    }
    
    // Scroll to context section
    setTimeout(() => {
      contextRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }, [])

  const credentialsReady = hasOpenAI && hasGitHub

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">ai-memory</h1>
          <p className="text-muted-foreground">
            Capture your knowledge. Store it forever.
          </p>
        </header>

        <main className="space-y-6">
          {/* Step 1: Credentials */}
          <div ref={credentialsRef}>
            <Credentials onCredentialsChange={handleCredentialsChange} />
          </div>

          {/* Model Selection */}
          {hasOpenAI && <ModelSelector />}

          {/* Step 2: Repository Selection */}
          {credentialsReady && (
            <div ref={repoRef}>
              <RepoSelection onRepoChange={handleRepoChange} />
            </div>
          )}

          {/* Step 3: Context - optional scope selection */}
          {selectedRepo && (
            <div ref={contextRef}>
              <RepoBrowser 
                key={browserKey}
                repoName={selectedRepo.full_name}
                onScopeSelect={handleScopeSelect}
                onScopeChange={handleScopeChange}
                refreshPending={browserRefreshPending}
              />
            </div>
          )}

          {/* Step 4: Content - always visible once repo selected */}
          {selectedRepo && (
            <div ref={contentRef}>
              <ContentEditor
                key={contentKey}
                scope={browseScope}
                repoName={selectedRepo.full_name}
                onComplete={handleContentComplete}
              />
            </div>
          )}

          {/* Placeholder when not ready */}
          {!credentialsReady && (
            <div className="rounded-lg border bg-muted/50 p-6 text-center">
              <p className="text-muted-foreground text-sm">
                Add your API keys above to continue.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
