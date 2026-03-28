import { useAppStore } from '@/store'
import { TabNavigation } from '@/components/TabNavigation'
import { SetupTab } from '@/components/tabs/SetupTab'
import { RepositoryTab } from '@/components/tabs/RepositoryTab'
import { CommitTab } from '@/components/tabs/CommitTab'
import { PromptModal } from '@/components/PromptModal'

function App() {
  const { activeTab } = useAppStore()

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">ai-memory</h1>
            <p className="text-sm text-muted-foreground">
              Capture your knowledge. Store it forever.
            </p>
          </div>
        </div>
      </header>

      {/* Tab navigation */}
      <TabNavigation />

      {/* Main content area */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'setup' && <SetupTab />}
        {activeTab === 'repository' && <RepositoryTab />}
        {activeTab === 'commit' && <CommitTab />}
      </main>

      {/* Prompt modal (overlay) */}
      <PromptModal />
    </div>
  )
}

export default App
