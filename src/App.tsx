import { useState, useCallback } from 'react'
import { Credentials } from '@/components/Credentials'
import { ModelSelector } from '@/components/ModelSelector'
import { RepoSelection, type Repository } from '@/components/RepoSelection'
import { RepoBrowser, type BrowseScope } from '@/components/RepoBrowser'
import { TopicFinder, type TopicResult } from '@/components/TopicFinder'
import { ContentEditor } from '@/components/ContentEditor'

function App() {
  const [hasOpenAI, setHasOpenAI] = useState(false)
  const [hasGitHub, setHasGitHub] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null)
  const [topicResult, setTopicResult] = useState<TopicResult | null>(null)
  const [browseScope, setBrowseScope] = useState<BrowseScope | null>(null)
  const [contentKey, setContentKey] = useState(0) // Key to force reset ContentEditor

  const handleCredentialsChange = useCallback((openai: boolean, github: boolean) => {
    setHasOpenAI(openai)
    setHasGitHub(github)
  }, [])

  const handleRepoChange = useCallback((repo: Repository | null) => {
    setSelectedRepo(repo)
    // Reset everything when repo changes
    setTopicResult(null)
    setBrowseScope(null)
    setContentKey(k => k + 1)
  }, [])

  const handleScopeSelect = useCallback((scope: BrowseScope | null) => {
    setBrowseScope(scope)
  }, [])

  const handleScopeChange = useCallback(() => {
    // Clear topic result when scope changes so user can enter new topic
    setTopicResult(null)
    setContentKey(k => k + 1)
  }, [])

  const handleLocationFound = useCallback((result: TopicResult) => {
    // If topic changed, reset content editor
    if (topicResult && (topicResult.path !== result.path || topicResult.action !== result.action)) {
      setContentKey(k => k + 1)
    }
    setTopicResult(result)
  }, [topicResult])

  const handleContentComplete = useCallback(() => {
    // Reset topic for another entry
    setTopicResult(null)
    setContentKey(k => k + 1)
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
          <Credentials onCredentialsChange={handleCredentialsChange} />

          {/* Model Selection */}
          {hasOpenAI && <ModelSelector />}

          {/* Step 2: Repository Selection */}
          {credentialsReady && (
            <RepoSelection onRepoChange={handleRepoChange} />
          )}

          {/* Step 3: Browse Repository - optional scope selection */}
          {selectedRepo && (
            <RepoBrowser 
              repoName={selectedRepo.full_name}
              onScopeSelect={handleScopeSelect}
              onScopeChange={handleScopeChange}
            />
          )}

          {/* Step 4: Topic / Location Finding - always visible once repo selected */}
          {selectedRepo && (
            <TopicFinder 
              repoName={selectedRepo.full_name}
              scope={browseScope}
              onLocationFound={handleLocationFound}
            />
          )}

          {/* Step 4: Content Entry & Generation - visible once topic found */}
          {selectedRepo && topicResult && (
            <ContentEditor
              key={contentKey}
              topicResult={topicResult}
              onComplete={handleContentComplete}
            />
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
