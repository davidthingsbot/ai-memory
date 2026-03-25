import { useState, useCallback } from 'react'
import { Credentials } from '@/components/Credentials'

function App() {
  const [hasOpenAI, setHasOpenAI] = useState(false)
  const [hasGitHub, setHasGitHub] = useState(false)

  const handleCredentialsChange = useCallback((openai: boolean, github: boolean) => {
    setHasOpenAI(openai)
    setHasGitHub(github)
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

          {/* Step 2: Repository Selection (shown when credentials ready) */}
          {credentialsReady && (
            <div className="rounded-lg border bg-card p-6">
              <h2 className="text-lg font-semibold mb-2">Repository</h2>
              <p className="text-muted-foreground text-sm">
                Select which repository to store your memories in.
              </p>
              <p className="text-muted-foreground text-sm mt-4 italic">
                (Coming soon)
              </p>
            </div>
          )}

          {/* Placeholder for remaining steps */}
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
