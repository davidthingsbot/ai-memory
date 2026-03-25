import { useState, useCallback } from 'react'
import { Credentials } from '@/components/Credentials'
import { RepoSelection, type Repository } from '@/components/RepoSelection'
import { TopicFinder, type TopicResult } from '@/components/TopicFinder'
import { ContentEditor } from '@/components/ContentEditor'

function App() {
  const [hasOpenAI, setHasOpenAI] = useState(false)
  const [hasGitHub, setHasGitHub] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null)
  const [topicResult, setTopicResult] = useState<TopicResult | null>(null)
  const [contentKey, setContentKey] = useState(0) // Key to force reset ContentEditor

  const handleCredentialsChange = useCallback((openai: boolean, github: boolean) => {
    setHasOpenAI(openai)
    setHasGitHub(github)
  }, [])

  const handleRepoChange = useCallback((repo: Repository | null) => {
    setSelectedRepo(repo)
    // Reset topic and content when repo changes
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

          {/* Step 2: Repository Selection */}
          {credentialsReady && (
            <RepoSelection onRepoChange={handleRepoChange} />
          )}

          {/* Step 3: Topic / Location Finding - always visible once repo selected */}
          {selectedRepo && (
            <TopicFinder 
              repoName={selectedRepo.full_name} 
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
