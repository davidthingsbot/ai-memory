import { useState, useCallback, useRef, useEffect } from 'react'
import { useAppStore } from '@/store'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MicButton } from '@/components/MicButton'
import { WorkingBox } from '@/components/WorkingBox'
import { useRealtimeTranscription } from '@/lib/useRealtimeTranscription'
import { generatePlan, executePlan, type DirectoryContext } from '@/lib/prompt-operations'
import { listDirectory, readFile, getOldestFileInDirectory } from '@/lib/github-tools'
import { tidyText, improveText, fullSpecText } from '@/lib/text-tools'
import { ClarificationBox } from '@/components/ClarificationBox'
import { Loader2, Sparkles, Check, AlertCircle, Wand2, Lightbulb, FileSearch, X, Undo2, Redo2 } from 'lucide-react'
import { Input } from '@/components/ui/input'

type Stage = 'prompt' | 'executing' | 'done' | 'error'

export function PromptModal() {
  const { 
    promptModalOpen, 
    promptModalOperation, 
    closePromptModal,
    fileContent,
    selectedFile,
    addPendingChange,
    setActiveTab,
  } = useAppStore()
  
  const [stage, setStage] = useState<Stage>('prompt')
  const [intent, setIntentRaw] = useState('')
  const undoStack = useRef<string[]>([])
  const redoStack = useRef<string[]>([])

  // Set intent with undo tracking (for programmatic changes like refine)
  const pushIntent = useCallback((value: string) => {
    undoStack.current.push(intent)
    redoStack.current = []
    setIntentRaw(value)
  }, [intent])

  // Typing — snapshot on pause (debounced)
  const intentSnapshotTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setIntent = useCallback((value: string) => {
    setIntentRaw(value)
    if (intentSnapshotTimer.current) clearTimeout(intentSnapshotTimer.current)
    intentSnapshotTimer.current = setTimeout(() => {
      // Only push if different from last snapshot
      const last = undoStack.current[undoStack.current.length - 1]
      if (value !== last && value !== '') {
        undoStack.current.push(value)
        redoStack.current = []
      }
    }, 1000)
  }, [])

  const handleUndo = useCallback(() => {
    if (undoStack.current.length === 0) return
    redoStack.current.push(intent)
    setIntentRaw(undoStack.current.pop()!)
  }, [intent])

  const handleRedo = useCallback(() => {
    if (redoStack.current.length === 0) return
    undoStack.current.push(intent)
    setIntentRaw(redoStack.current.pop()!)
  }, [intent])
  const [steps, setSteps] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [startTime, setStartTime] = useState<number | null>(null)
  
  const intentInputRef = useRef<HTMLTextAreaElement>(null)
  const intentBaseRef = useRef<string>('')
  
  // Voice transcription
  const transcription = useRealtimeTranscription({
    onTranscriptInsert: (newText, insertPos) => {
      const base = intentBaseRef.current
      const before = base.slice(0, insertPos)
      const after = base.slice(insertPos)
      setIntent(before + newText + after)
    },
  })
  
  const addStep = useCallback((step: string) => {
    setSteps(prev => [...prev, step])
  }, [])

  // Build context object for logging
  const buildContext = useCallback(() => ({
    operation: promptModalOperation,
    file: selectedFile,
    fileContentLength: fileContent?.length ?? 0,
    fileContentPreview: fileContent ? fileContent.slice(0, 200) + (fileContent.length > 200 ? '...' : '') : null,
  }), [promptModalOperation, selectedFile, fileContent])

  // Log full context when modal opens
  useEffect(() => {
    if (promptModalOpen && promptModalOperation) {
      console.group('%c[AI Modal] Opened', 'color: #3b82f6; font-weight: bold')
      console.log('Context:', buildContext())
      console.groupEnd()
    }
  }, [promptModalOpen, promptModalOperation, buildContext])
  
  // Reset state when modal opens/closes
  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      closePromptModal()
      // Reset state
      setStage('prompt')
      setIntent('')
      setInstruction('')
      setSteps([])
      setError(null)
      setIsGenerating(false)
      setStartTime(null)
      setClarificationQuestion(null)
      pendingRefineMode.current = null
      undoStack.current = []
      redoStack.current = []
    }
  }, [closePromptModal])
  
  // GO! — generate plan and execute in one step
  const handleGo = useCallback(async () => {
    if (!promptModalOperation) return
    const effectiveIntent = intent.trim() || `${promptModalOperation.type} at ${promptModalOperation.path}`

    console.group('%c[AI Modal] GO!', 'color: #22c55e; font-weight: bold')
    console.log('Prompt:', effectiveIntent)
    console.log('Context:', buildContext())
    console.groupEnd()

    setIsGenerating(true)
    setError(null)
    setSteps([])
    setStartTime(Date.now())
    setStage('executing')
    addStep('Working...')

    try {
      // Gather directory context for new-file/new-folder operations
      let directoryContext: DirectoryContext | undefined
      const isDirectoryOp = promptModalOperation.type === 'new-file' || promptModalOperation.type === 'new-folder'
      if (isDirectoryOp) {
        addStep('Loading directory context...')
        const dirPath = promptModalOperation.path
        const entries = await listDirectory(dirPath)
        const listing = entries.map(e => e.type === 'dir' ? e.name + '/' : e.name)

        // Find a reference file: README.md first, then file matching directory basename
        let referenceFile: DirectoryContext['referenceFile']
        const dirName = dirPath.split('/').filter(Boolean).pop() || ''
        const readme = entries.find(e => e.type === 'file' && e.name.toLowerCase() === 'readme.md')
        const nameMatch = !readme && dirName
          ? entries.find(e => e.type === 'file' && e.name.replace(/\.[^.]+$/, '').toLowerCase() === dirName.toLowerCase())
          : undefined
        // 3rd priority: oldest file in the directory (most foundational)
        let firstFile: typeof entries[0] | undefined
        if (!readme && !nameMatch) {
          const oldestPath = await getOldestFileInDirectory(dirPath, entries.filter(e => e.type === 'file').map(e => e.path))
          if (oldestPath) firstFile = entries.find(e => e.path === oldestPath)
        }
        const refEntry = readme || nameMatch || firstFile
        if (refEntry) {
          const file = await readFile(refEntry.path)
          if (file) {
            referenceFile = { path: refEntry.path, content: file.content }
            addStep(`Using ${refEntry.name} as style reference`)
          }
        }

        directoryContext = { path: dirPath, listing, referenceFile }
      }

      // For directory ops, use operation.path as the base; for file ops, use selectedFile
      const effectiveFilePath = selectedFile || (isDirectoryOp ? promptModalOperation.path : undefined)

      const generatedPlan = await generatePlan({
        intent: effectiveIntent,
        operation: promptModalOperation,
        filePath: effectiveFilePath,
        fileContent: fileContent || undefined,
        directoryContext,
      }, addStep)

      const result = await executePlan({
        plan: generatedPlan,
        operation: promptModalOperation,
        filePath: effectiveFilePath,
        fileContent: fileContent || undefined,
        directoryContext,
      }, addStep)

      addPendingChange({
        path: result.path,
        action: result.action,
        content: result.content,
        oldContent: fileContent || undefined,
      })
      addStep(`✓ Changes staged: ${result.path}`)
      setStage('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed')
      setStage('error')
    } finally {
      setIsGenerating(false)
    }
  }, [intent, promptModalOperation, selectedFile, fileContent, addStep, buildContext, addPendingChange])
  
  // Go back to intent stage
  const handleBack = useCallback(() => {
    setStage('prompt')
    setSteps([])
    setError(null)
  }, [])
  
  // Handle completion - go to commit tab
  const handleGoToCommit = useCallback(() => {
    handleOpenChange(false)
    setActiveTab('commit')
  }, [handleOpenChange, setActiveTab])
  
  // Handle voice recording
  const handleRecordingChange = useCallback((recording: boolean) => {
    if (recording) {
      intentBaseRef.current = intent
      transcription.startRecording(intent.length)
    } else {
      transcription.stopRecording()
    }
  }, [intent, transcription])
  
  // Refine intent text with AI (tidy/improve/full-spec)
  const [isRefining, setIsRefining] = useState(false)
  const [clarificationQuestion, setClarificationQuestion] = useState<string | null>(null)
  const pendingRefineMode = useRef<'tidy' | 'improve' | 'fullspec' | null>(null)

  const runRefine = useCallback(async (mode: 'tidy' | 'improve' | 'fullspec', text: string) => {
    setIsRefining(true)
    setClarificationQuestion(null)
    const context = {
      filePath: selectedFile || undefined,
      fileContent: fileContent || undefined,
      selectedText: promptModalOperation?.selection?.text,
      repoName: useAppStore.getState().selectedRepoFullName || undefined,
    }
    const fn = mode === 'tidy' ? tidyText : mode === 'improve' ? improveText : fullSpecText

    console.group(`%c[AI Modal] Refine: ${mode}`, 'color: #a855f7; font-weight: bold')
    console.log('Input:', text)
    console.log('Context:', context)
    console.groupEnd()

    try {
      const result = await fn(text, addStep, context)
      if (result.type === 'result') {
        pushIntent(result.content)
      } else if (result.type === 'question') {
        pendingRefineMode.current = mode
        setClarificationQuestion(result.content)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refine failed')
    } finally {
      setIsRefining(false)
    }
  }, [selectedFile, fileContent, promptModalOperation, addStep, pushIntent])

  const handleRefine = useCallback((mode: 'tidy' | 'improve' | 'fullspec') => {
    if (!intent.trim()) return
    runRefine(mode, intent)
  }, [intent, runRefine])

  const handleClarificationAnswer = useCallback((answer: string) => {
    const mode = pendingRefineMode.current
    if (!mode) return
    // Re-run refine with the answer appended to the intent
    const augmented = `${intent}\n\n[Clarification: ${answer}]`
    runRefine(mode, augmented)
  }, [intent, runRefine])

  const handleClarificationSkip = useCallback(() => {
    setClarificationQuestion(null)
    pendingRefineMode.current = null
  }, [])

  // Apply custom instruction to modify the prompt
  const handleApplyInstruction = useCallback(async () => {
    if (!instruction.trim() || !intent.trim()) return
    setIsRefining(true)
    setClarificationQuestion(null)

    const apiKey = (await import('@/components/Credentials')).getOpenAIKey()
    if (!apiKey) { setError('No OpenAI API key'); setIsRefining(false); return }
    const model = (await import('@/components/ModelSelector')).getSelectedModel()

    console.group('%c[AI Modal] Custom instruction', 'color: #a855f7; font-weight: bold')
    console.log('Instruction:', instruction)
    console.log('Current prompt:', intent)
    console.groupEnd()

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: `The user is developing a prompt/request that will be sent to an AI. They have given you an instruction to modify their current prompt. Apply the instruction and return ONLY the revised prompt. Do not add commentary, explanations, or meta-text. Keep the same general format and scope unless the instruction says otherwise.` },
            { role: 'user', content: `Current prompt:\n${intent}\n\nInstruction: ${instruction}` },
          ],
        }),
      })
      if (!response.ok) throw new Error(`API error: ${await response.text()}`)
      const data = await response.json()
      const result = data.choices[0]?.message?.content
      if (result) {
        pushIntent(result)
        setInstruction('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply instruction')
    } finally {
      setIsRefining(false)
    }
  }, [instruction, intent, pushIntent])

  // Voice for instruction box
  const instructionBaseRef = useRef<string>('')
  const instructionTranscription = useRealtimeTranscription({
    onTranscriptInsert: (newText, insertPos) => {
      const base = instructionBaseRef.current
      setInstruction(base.slice(0, insertPos) + newText + base.slice(insertPos))
    },
  })

  // Get operation title
  const getTitle = () => {
    if (!promptModalOperation) return 'AI Operation'
    switch (promptModalOperation.type) {
      case 'insert': return 'Insert Section'
      case 'modify': return 'Modify Content'
      case 'new-file': return 'Create New File'
      case 'new-folder': return 'Create New Folder'
      case 'add-image': return 'Add Image'
      default: return 'AI Operation'
    }
  }

  // Build context description for display
  const contextDescription = (() => {
    const op = promptModalOperation
    if (!op) return null
    const parts: string[] = []
    if (op.path) parts.push(op.path)
    if (op.selection?.text) {
      const preview = op.selection.text.length > 80
        ? op.selection.text.slice(0, 77).replace(/\n/g, ' ') + '...'
        : op.selection.text.replace(/\n/g, ' ')
      parts.push(`selection: "${preview}"`)
    } else if (op.position != null && fileContent) {
      const line = fileContent.slice(0, op.position).split('\n').length
      const col = op.position - fileContent.lastIndexOf('\n', op.position - 1)
      parts.push(`line ${line}, col ${col}`)
    }
    return parts.join(' \u2022 ')
  })()

  return (
    <Dialog open={promptModalOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              {getTitle()}
            </DialogTitle>
            <button
              onClick={() => handleOpenChange(false)}
              className="rounded-sm opacity-70 hover:opacity-100 transition-opacity"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {contextDescription && (
            <div className="mt-1">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground px-3 py-0.5 rounded bg-muted ring-1 ring-border max-w-full">
                <span className="font-medium shrink-0">Context:</span>
                <span className="truncate">{contextDescription}</span>
              </span>
            </div>
          )}
        </DialogHeader>
        
        <div className="flex-1 overflow-auto space-y-4">
          {/* Prompt development */}
          {stage === 'prompt' && (
            <>
              {/* Main prompt textarea */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Prompt</label>
                <div className="flex gap-2">
                  <MicButton
                    recording={transcription.isRecording}
                    transcribing={transcription.isConnecting}
                    onRecordingChange={handleRecordingChange}
                    size="sm"
                    className="shrink-0"
                  />
                  <Textarea
                    ref={intentInputRef}
                    value={intent}
                    onChange={(e) => setIntent(e.target.value)}
                    placeholder="Describe what you want..."
                    className="min-h-[100px] resize-none"
                    disabled={transcription.isRecording}
                  />
                </div>
                {transcription.error && (
                  <p className="text-xs text-destructive">{transcription.error}</p>
                )}
              </div>

              {/* Instruction box — voice/text to modify the prompt */}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Refine the prompt with an instruction</label>
                <div className="flex gap-2 items-center">
                  <MicButton
                    recording={instructionTranscription.isRecording}
                    transcribing={instructionTranscription.isConnecting}
                    onRecordingChange={(recording) => {
                      if (recording) {
                        instructionBaseRef.current = instruction
                        instructionTranscription.startRecording(instruction.length)
                      } else {
                        instructionTranscription.stopRecording()
                      }
                    }}
                    size="sm"
                    showStatus={false}
                    className="shrink-0"
                  />
                  <Input
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleApplyInstruction()}
                    placeholder='e.g. "focus on error handling" or "make it shorter"'
                    className="h-8 text-sm"
                    disabled={isRefining}
                  />
                  <Button
                    variant="outline" size="sm" className="h-8 shrink-0"
                    onClick={handleApplyInstruction}
                    disabled={!instruction.trim() || !intent.trim() || isRefining}
                  >
                    Apply
                  </Button>
                </div>
              </div>

              {/* Tool buttons + GO */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost" size="sm" className="h-7 w-7 p-0"
                  onClick={handleUndo}
                  disabled={undoStack.current.length === 0}
                  title="Undo"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost" size="sm" className="h-7 w-7 p-0"
                  onClick={handleRedo}
                  disabled={redoStack.current.length === 0}
                  title="Redo"
                >
                  <Redo2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline" size="sm" className="h-7 gap-1 text-xs"
                  onClick={() => handleRefine('tidy')}
                  disabled={!intent.trim() || isRefining || isGenerating}
                  title="Fix spelling, grammar, formatting"
                >
                  <Wand2 className="h-3 w-3" /> Tidy
                </Button>
                <Button
                  variant="outline" size="sm" className="h-7 gap-1 text-xs"
                  onClick={() => handleRefine('improve')}
                  disabled={!intent.trim() || isRefining || isGenerating}
                  title="Restructure and clarify"
                >
                  <Lightbulb className="h-3 w-3" /> Improve
                </Button>
                <Button
                  variant="outline" size="sm" className="h-7 gap-1 text-xs"
                  onClick={() => handleRefine('fullspec')}
                  disabled={!intent.trim() || isRefining || isGenerating}
                  title="Comprehensive analysis with web research"
                >
                  <FileSearch className="h-3 w-3" /> Full Spec
                </Button>
                {isRefining && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                <div className="flex-1" />
                <Button size="sm" onClick={handleGo} disabled={isGenerating || isRefining}>
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Go!
                </Button>
              </div>

              {/* Clarification from Full Spec */}
              {clarificationQuestion && (
                <ClarificationBox
                  question={clarificationQuestion}
                  onAnswer={handleClarificationAnswer}
                  onSkip={handleClarificationSkip}
                />
              )}
            </>
          )}
          
          {/* Stage: Executing */}
          {stage === 'executing' && (
            <div className="space-y-4">
              <WorkingBox steps={steps} isWorking={true} startTime={startTime || undefined} />
            </div>
          )}
          
          {/* Stage: Done */}
          {stage === 'done' && (
            <div className="text-center py-8 space-y-4">
              <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-4 inline-flex">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold">Changes Staged</h3>
              <p className="text-muted-foreground">
                Your changes have been staged. Review and commit them in the Commit tab.
              </p>
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={() => handleOpenChange(false)}>
                  Continue Editing
                </Button>
                <Button onClick={handleGoToCommit}>
                  Go to Commit
                </Button>
              </div>
            </div>
          )}
          
          {/* Stage: Error */}
          {stage === 'error' && (
            <div className="text-center py-8 space-y-4">
              <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-4 inline-flex">
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold">Operation Failed</h3>
              <p className="text-destructive">{error}</p>
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={handleBack}>
                  Try Again
                </Button>
                <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          
        </div>
      </DialogContent>
    </Dialog>
  )
}
