import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Check, Eye, EyeOff, Key, GitBranch } from 'lucide-react'

const STORAGE_KEY_OPENAI = 'ai-memory:openai-key'
const STORAGE_KEY_GITHUB = 'ai-memory:github-pat'

interface CredentialsProps {
  onCredentialsChange?: (hasOpenAI: boolean, hasGitHub: boolean) => void
}

export function Credentials({ onCredentialsChange }: CredentialsProps) {
  const [openaiKey, setOpenaiKey] = useState('')
  const [githubPat, setGithubPat] = useState('')
  const [hasStoredOpenAI, setHasStoredOpenAI] = useState(false)
  const [hasStoredGitHub, setHasStoredGitHub] = useState(false)
  const [showOpenAI, setShowOpenAI] = useState(false)
  const [showGitHub, setShowGitHub] = useState(false)
  const [openaiSaved, setOpenaiSaved] = useState(false)
  const [githubSaved, setGithubSaved] = useState(false)

  // Check for stored keys on mount
  useEffect(() => {
    const storedOpenAI = localStorage.getItem(STORAGE_KEY_OPENAI)
    const storedGitHub = localStorage.getItem(STORAGE_KEY_GITHUB)
    setHasStoredOpenAI(!!storedOpenAI)
    setHasStoredGitHub(!!storedGitHub)
    onCredentialsChange?.(!!storedOpenAI, !!storedGitHub)
  }, [onCredentialsChange])

  const saveOpenAIKey = () => {
    if (openaiKey.trim()) {
      localStorage.setItem(STORAGE_KEY_OPENAI, openaiKey.trim())
      setHasStoredOpenAI(true)
      setOpenaiKey('')
      setOpenaiSaved(true)
      setTimeout(() => setOpenaiSaved(false), 2000)
      onCredentialsChange?.(true, hasStoredGitHub)
    }
  }

  const saveGitHubPat = () => {
    if (githubPat.trim()) {
      localStorage.setItem(STORAGE_KEY_GITHUB, githubPat.trim())
      setHasStoredGitHub(true)
      setGithubPat('')
      setGithubSaved(true)
      setTimeout(() => setGithubSaved(false), 2000)
      onCredentialsChange?.(hasStoredOpenAI, true)
    }
  }

  const clearOpenAIKey = () => {
    localStorage.removeItem(STORAGE_KEY_OPENAI)
    setHasStoredOpenAI(false)
    onCredentialsChange?.(false, hasStoredGitHub)
  }

  const clearGitHubPat = () => {
    localStorage.removeItem(STORAGE_KEY_GITHUB)
    setHasStoredGitHub(false)
    onCredentialsChange?.(hasStoredOpenAI, false)
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          Credentials
        </CardTitle>
        <CardDescription>
          API keys are stored locally in your browser. They never leave your device except to call the respective APIs directly.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* OpenAI API Key */}
        <div className="space-y-2">
          <Label htmlFor="openai-key" className="flex items-center gap-2">
            OpenAI API Key
            {hasStoredOpenAI && (
              <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <Check className="h-3 w-3" /> Saved
              </span>
            )}
          </Label>
          
          {hasStoredOpenAI ? (
            <div className="flex gap-2">
              <Input
                type="password"
                value="••••••••••••••••••••••••••••••••"
                disabled
                className="flex-1 font-mono"
              />
              <Button variant="outline" size="sm" onClick={clearOpenAIKey}>
                Clear
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="openai-key"
                  type={showOpenAI ? 'text' : 'password'}
                  placeholder="sk-..."
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveOpenAIKey()}
                  className="pr-10 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowOpenAI(!showOpenAI)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showOpenAI ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button onClick={saveOpenAIKey} disabled={!openaiKey.trim()}>
                {openaiSaved ? <Check className="h-4 w-4" /> : 'Save'}
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Get yours at{' '}
            <a 
              href="https://platform.openai.com/api-keys" 
              target="_blank" 
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              platform.openai.com/api-keys
            </a>
          </p>
        </div>

        {/* GitHub PAT */}
        <div className="space-y-2">
          <Label htmlFor="github-pat" className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            GitHub Personal Access Token
            {hasStoredGitHub && (
              <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <Check className="h-3 w-3" /> Saved
              </span>
            )}
          </Label>
          
          {hasStoredGitHub ? (
            <div className="flex gap-2">
              <Input
                type="password"
                value="••••••••••••••••••••••••••••••••"
                disabled
                className="flex-1 font-mono"
              />
              <Button variant="outline" size="sm" onClick={clearGitHubPat}>
                Clear
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="github-pat"
                  type={showGitHub ? 'text' : 'password'}
                  placeholder="ghp_... or github_pat_..."
                  value={githubPat}
                  onChange={(e) => setGithubPat(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveGitHubPat()}
                  className="pr-10 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowGitHub(!showGitHub)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showGitHub ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button onClick={saveGitHubPat} disabled={!githubPat.trim()}>
                {githubSaved ? <Check className="h-4 w-4" /> : 'Save'}
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Get yours at{' '}
            <a 
              href="https://github.com/settings/tokens" 
              target="_blank" 
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              github.com/settings/tokens
            </a>
            {' '}— needs <code className="text-xs">repo</code> scope
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

// Utility to get stored keys (for use by other components)
export function getOpenAIKey(): string | null {
  return localStorage.getItem(STORAGE_KEY_OPENAI)
}

export function getGitHubPat(): string | null {
  return localStorage.getItem(STORAGE_KEY_GITHUB)
}
