import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ViewMode = 'preview' | 'edit' | 'raw'
export type ActiveTab = 'setup' | 'repository' | 'commit'

export interface FileChange {
  path: string
  action: 'create' | 'modify' | 'delete'
  content?: string
  oldContent?: string
}

export interface Operation {
  type: 'insert' | 'modify' | 'new-file' | 'new-folder' | 'add-image'
  path: string
  position?: number
  selection?: { start: number; end: number; text: string }
}

export interface AppState {
  // Setup
  setupComplete: boolean
  selectedRepoFullName: string | null
  
  // Tabs
  activeTab: ActiveTab
  
  // Repository browser state
  currentPath: string
  selectedFile: string | null
  fileContent: string | null
  viewMode: ViewMode
  
  // Changes/Commit state
  pendingChanges: FileChange[]
  commitMessage: string
  
  // Prompt modal state
  promptModalOpen: boolean
  promptModalOperation: Operation | null
  
  // Actions
  setSetupComplete: (complete: boolean) => void
  setSelectedRepoFullName: (name: string | null) => void
  setActiveTab: (tab: ActiveTab) => void
  setCurrentPath: (path: string) => void
  selectFile: (path: string, content: string) => void
  clearSelectedFile: () => void
  setViewMode: (mode: ViewMode) => void
  setFileContent: (content: string) => void
  addPendingChange: (change: FileChange) => void
  removePendingChange: (path: string) => void
  clearPendingChanges: () => void
  setCommitMessage: (message: string) => void
  openPromptModal: (operation: Operation) => void
  closePromptModal: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Initial state
      setupComplete: false,
      selectedRepoFullName: null,
      activeTab: 'setup',
      currentPath: '',
      selectedFile: null,
      fileContent: null,
      viewMode: 'preview',
      pendingChanges: [],
      commitMessage: '',
      promptModalOpen: false,
      promptModalOperation: null,
      
      // Actions
      setSetupComplete: (complete) => set({ 
        setupComplete: complete,
        activeTab: complete ? 'repository' : 'setup'
      }),
      setSelectedRepoFullName: (name) => set({ selectedRepoFullName: name }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setCurrentPath: (path) => set({ currentPath: path }),
      selectFile: (path, content) => set({ 
        selectedFile: path, 
        fileContent: content 
      }),
      clearSelectedFile: () => set({ 
        selectedFile: null, 
        fileContent: null 
      }),
      setViewMode: (mode) => set({ viewMode: mode }),
      setFileContent: (content) => set({ fileContent: content }),
      addPendingChange: (change) => set((state) => {
        const existing = state.pendingChanges.findIndex(c => c.path === change.path)
        if (existing >= 0) {
          const updated = [...state.pendingChanges]
          updated[existing] = change
          return { pendingChanges: updated }
        }
        return { pendingChanges: [...state.pendingChanges, change] }
      }),
      removePendingChange: (path) => set((state) => ({
        pendingChanges: state.pendingChanges.filter(c => c.path !== path)
      })),
      clearPendingChanges: () => set({ 
        pendingChanges: [],
        commitMessage: '' 
      }),
      setCommitMessage: (message) => set({ commitMessage: message }),
      openPromptModal: (operation) => set({
        promptModalOpen: true,
        promptModalOperation: operation,
      }),
      closePromptModal: () => set({
        promptModalOpen: false,
        promptModalOperation: null,
      }),
    }),
    {
      name: 'ai-memory-v2-store',
      partialize: (state) => ({
        // Only persist these fields
        setupComplete: state.setupComplete,
        selectedRepoFullName: state.selectedRepoFullName,
      }),
    }
  )
)
