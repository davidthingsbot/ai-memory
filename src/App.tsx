import { Button } from '@/components/ui/button'

function App() {
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
          <div className="rounded-lg border bg-card p-6">
            <p className="text-center text-muted-foreground mb-4">
              Ready to start capturing memories.
            </p>
            <div className="flex justify-center">
              <Button>Get Started</Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
