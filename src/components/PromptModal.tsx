import { useState, useCallback, useRef } from 'react'
import { useAppStore, type FileChange } from '@/store'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MicButton } from '@/components/MicButton'
import { WorkingBox } from '@/components/WorkingBox'
import { useRealtimeTranscription } from '@/lib/useRealtimeTranscription'
import { generatePlan, executePlan, type Plan } from '@/lib/prompt-operations'
import { Loader2, Sparkles, ArrowLeft, Check, AlertCircle } from 'lucide-react'

type Stage = 'intent' | 'plan' | 'executing' | 'done' | 'error'

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
  
  const [stage, setStage] = useState<Stage>('intent')
  const [intent, setIntent] = useState('')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [editedPlan, setEditedPlan] = useState('')
  const [steps, setSteps] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
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
  
  // Reset state when modal opens/closes
  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      closePromptModal()
      // Reset state
      setStage('intent')
      setIntent('')
      setPlan(null)
      setEditedPlan('')
      setSteps([])
      setError(null)
      setIsGenerating(false)
      setStartTime(null)
    }
  }, [closePromptModal])
  
  // Generate plan from intent
  const handleGeneratePlan = useCallback(async () => {
    if (!intent.trim() || !promptModalOperation) return
    
    setIsGenerating(true)
    setError(null)
    setSteps([])
    setStartTime(Date.now())
    addStep('Analyzing intent...')
    
    try {
      const generatedPlan = await generatePlan({
        intent,
        operation: promptModalOperation,
        filePath: selectedFile || undefined,
        fileContent: fileContent || undefined,
      }, addStep)
      
      setPlan(generatedPlan)
      setEditedPlan(generatedPlan.description)
      setStage('plan')
      addStep('✓ Plan generated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate plan')
      setStage('error')
    } finally {
      setIsGenerating(false)
    }
  }, [intent, promptModalOperation, selectedFile, fileContent, addStep])
  
  // Execute the plan
  const handleExecute = useCallback(async () => {
    if (!plan || !promptModalOperation) return
    
    setStage('executing')
    setError(null)
    setStartTime(Date.now())
    addStep('Executing plan...')
    
    try {
      const result = await executePlan({
        plan: { ...plan, description: editedPlan },
        operation: promptModalOperation,
        filePath: selectedFile || undefined,
        fileContent: fileContent || undefined,
      }, addStep)
      
      // Add the change to pending changes
      const change: FileChange = {
        path: result.path,
        action: result.action,
        content: result.content,
        oldContent: fileContent || undefined,
      }
      addPendingChange(change)
      
      addStep(`✓ Changes staged: ${result.path}`)
      setStage('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed')
      setStage('error')
    }
  }, [plan, editedPlan, promptModalOperation, selectedFile, fileContent, addStep, addPendingChange])
  
  // Skip plan review and execute directly
  const handleSkipPlan = useCallback(async () => {
    // Generate and execute in one step
    if (!intent.trim() || !promptModalOperation) return
    
    setIsGenerating(true)
    setStage('executing')
    setError(null)
    setSteps([])
    setStartTime(Date.now())
    addStep('Generating and executing...')
    
    try {
      const generatedPlan = await generatePlan({
        intent,
        operation: promptModalOperation,
        filePath: selectedFile || undefined,
        fileContent: fileContent || undefined,
      }, addStep)
      
      const result = await executePlan({
        plan: generatedPlan,
        operation: promptModalOperation,
        filePath: selectedFile || undefined,
        fileContent: fileContent || undefined,
      }, addStep)
      
      const change: FileChange = {
        path: result.path,
        action: result.action,
        content: result.content,
        oldContent: fileContent || undefined,
      }
      addPendingChange(change)
      
      addStep(`✓ Changes staged: ${result.path}`)
      setStage('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed')
      setStage('error')
    } finally {
      setIsGenerating(false)
    }
  }, [intent, promptModalOperation, selectedFile, fileContent, addStep, addPendingChange])
  
  // Go back to intent stage
  const handleBack = useCallback(() => {
    setStage('intent')
    setPlan(null)
    setEditedPlan('')
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
  
  return (
    <Dialog open={promptModalOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            {getTitle()}
            {selectedFile && (
              <code className="text-xs font-normal text-muted-foreground ml-2">
                {selectedFile}
              </code>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto space-y-4">
          {/* Stage: Intent */}
          {stage === 'intent' && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  What do you want to {promptModalOperation?.type === 'insert' ? 'add' : 'change'}?
                </label>
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
                    placeholder="Describe what you want in natural language..."
                    className="min-h-[100px] resize-none"
                    disabled={transcription.isRecording}
                  />
                </div>
                {transcription.error && (
                  <p className="text-xs text-destructive">{transcription.error}</p>
                )}
              </div>
              
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={handleSkipPlan} disabled={!intent.trim() || isGenerating}>
                  Skip Plan
                </Button>
                <Button onClick={handleGeneratePlan} disabled={!intent.trim() || isGenerating}>
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Generate Plan
                </Button>
              </div>
            </>
          )}
          
          {/* Stage: Plan Review */}
          {stage === 'plan' && plan && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">AI-Generated Plan</label>
                <p className="text-xs text-muted-foreground">
                  Review and edit the plan below, then execute.
                </p>
                <Textarea
                  value={editedPlan}
                  onChange={(e) => setEditedPlan(e.target.value)}
                  className="min-h-[150px] font-mono text-sm"
                />
              </div>
              
              {plan.outline && plan.outline.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Outline</label>
                  <ul className="text-sm space-y-1 pl-4">
                    {plan.outline.map((item, i) => (
                      <li key={i} className="list-disc text-muted-foreground">{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div className="flex justify-between">
                <Button variant="ghost" onClick={handleBack}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => handleOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleExecute}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Execute
                  </Button>
                </div>
              </div>
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
          
          {/* Working steps - show during intent/plan stages too if generating */}
          {(stage === 'intent' || stage === 'plan') && steps.length > 0 && (
            <WorkingBox steps={steps} isWorking={isGenerating} startTime={startTime || undefined} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
