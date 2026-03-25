import { useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { findTopicLocation, type TopicResult } from '@/lib/topic-finder'
import { MessageSquare, Search, FileText, FilePlus, Loader2, Check, RotateCcw } from 'lucide-react'

interface TopicFinderProps {
  repoName: string
  onLocationFound?: (result: TopicResult) => void
}

export function TopicFinder({ repoName, onLocationFound }: TopicFinderProps) {
  const [topic, setTopic] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<string>('')
  const [result, setResult] = useState<TopicResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = useCallback(async () => {
    if (!topic.trim()) return

    setLoading(true)
    setProgress('Starting...')
    setResult(null)
    setError(null)

    try {
      const location = await findTopicLocation(topic, setProgress)
      setResult(location)
      onLocationFound?.(location)
    } catch (err) {
      console.error('Topic search failed:', err)
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoading(false)
      setProgress('')
    }
  }, [topic, onLocationFound])

  const handleReset = useCallback(() => {
    setResult(null)
    setError(null)
    setTopic('')
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !loading) {
      e.preventDefault()
      handleSearch()
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Topic
          {result && (
            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 ml-2">
              <Check className="h-3 w-3" /> Found
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Describe what you want to document. AI will find the best location in <code className="text-xs">{repoName}</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {result ? (
          // Show result
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
              {/* Action type */}
              <div className="flex items-center gap-2">
                {result.action === 'create' ? (
                  <>
                    <FilePlus className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <span className="font-medium">Create new file</span>
                  </>
                ) : (
                  <>
                    <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <span className="font-medium">Update existing file</span>
                  </>
                )}
              </div>

              {/* Path */}
              <div>
                <p className="text-sm text-muted-foreground">Location:</p>
                <code className="text-sm font-mono bg-background px-2 py-1 rounded">
                  {result.path}
                </code>
              </div>

              {/* Reason */}
              <div>
                <p className="text-sm text-muted-foreground">Reasoning:</p>
                <p className="text-sm">{result.reason}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Try Different Topic
              </Button>
            </div>
          </div>
        ) : (
          // Show input
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="e.g., How to prune apple trees, or Notes about our Q3 planning meeting"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                className="flex-1"
              />
              <Button onClick={handleSearch} disabled={loading || !topic.trim()}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Progress indicator */}
            {loading && progress && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {progress}
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <p className="text-xs text-muted-foreground">
              The AI will explore your repository structure to find the best place for this content.
              It may create a new file or suggest adding to an existing one.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export type { TopicResult }
