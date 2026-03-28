import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { TabNavigation } from '@/components/TabNavigation'
import { SetupTab } from '@/components/tabs/SetupTab'
import { RepositoryTab } from '@/components/tabs/RepositoryTab'
import { CommitTab } from '@/components/tabs/CommitTab'
import { PromptModal } from '@/components/PromptModal'
import { Sun, Moon } from 'lucide-react'

function App() {
  const { activeTab, darkMode, toggleDarkMode } = useAppStore()

  // Apply dark class to document root
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">ai-memory</h1>
            <p className="text-sm text-muted-foreground">
              Capture your knowledge. Store it forever.
            </p>
          </div>
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* Tab navigation */}
      <TabNavigation />

      {/* Main content area */}
      <main className="flex-1 min-h-0 overflow-hidden">
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
