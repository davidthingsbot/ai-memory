import { useAppStore, type ActiveTab } from '@/store'
import { Settings, FolderOpen, GitCommit } from 'lucide-react'

export function TabNavigation() {
  const { activeTab, setActiveTab, pendingChanges } = useAppStore()
  
  const tabs: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'setup', label: 'Setup', icon: <Settings className="h-4 w-4" /> },
    { id: 'repository', label: 'Repository', icon: <FolderOpen className="h-4 w-4" /> },
    { id: 'commit', label: 'Commit', icon: <GitCommit className="h-4 w-4" /> },
  ]
  
  return (
    <div className="border-b bg-background">
      <nav className="flex" aria-label="Tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              relative flex items-center gap-2 px-6 py-3 text-sm font-medium
              border-b-2 transition-colors
              ${activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50'
              }
            `}
          >
            {tab.icon}
            {tab.label}
            {/* Badge for pending changes on Commit tab */}
            {tab.id === 'commit' && pendingChanges.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {pendingChanges.length}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  )
}
