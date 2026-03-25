import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Check, Eye, EyeOff, Key, GitBranch, Search, Plus } from 'lucide-react'

const STORAGE_KEY_OPENAI = 'ai-memory:openai-key'
const STORAGE_KEY_GITHUB_TOKENS = 'ai-memory:github-tokens'
const STORAGE_KEY_BRAVE = 'ai-memory:brave-key'

// Legacy key for migration
const STORAGE_KEY_GITHUB_LEGACY = 'ai-memory:github-pat'

export interface GitHubToken {
  label: string
  token: string
}

interface CredentialsProps {
  onCredentialsChange?: (hasOpenAI: boolean, hasGitHub: boolean) => void
}

export function Credentials({ onCredentialsChange }: CredentialsProps) {
  const [openaiKey, setOpenaiKey] = useState('')
  const [braveKey, setBraveKey] = useState('')
  const [hasStoredOpenAI, setHasStoredOpenAI] = useState(false)
  const [hasStoredBrave, setHasStoredBrave] = useState(false)
  const [showOpenAI, setShowOpenAI] = useState(false)
  const [showBrave, setShowBrave] = useState(false)
  const [openaiSaved, setOpenaiSaved] = useState(false)
  const [braveSaved, setBraveSaved] = useState(false)

  // GitHub tokens (multiple)
  const [githubTokens, setGithubTokens] = useState<GitHubToken[]>([])
  const [newTokenLabel, setNewTokenLabel] = useState('')
  const [newTokenValue, setNewTokenValue] = useState('')
  const [showNewToken, setShowNewToken] = useState(false)
  const [tokenSaved, setTokenSaved] = useState(false)

  // Load stored credentials on mount
  useEffect(() => {
    const storedOpenAI = localStorage.getItem(STORAGE_KEY_OPENAI)
    const storedBrave = localStorage.getItem(STORAGE_KEY_BRAVE)
    
    // Load GitHub tokens (with migration from legacy single token)
    let tokens: GitHubToken[] = []
    const storedTokens = localStorage.getItem(STORAGE_KEY_GITHUB_TOKENS)
    if (storedTokens) {
      try {
        tokens = JSON.parse(storedTokens)
      } catch {
        tokens = []
      }
    } else {
      // Migrate legacy single token
      const legacyToken = localStorage.getItem(STORAGE_KEY_GITHUB_LEGACY)
      if (legacyToken) {
        tokens = [{ label: 'Default', token: legacyToken }]
        localStorage.setItem(STORAGE_KEY_GITHUB_TOKENS, JSON.stringify(tokens))
        localStorage.removeItem(STORAGE_KEY_GITHUB_LEGACY)
      }
    }
    
    setHasStoredOpenAI(!!storedOpenAI)
    setHasStoredBrave(!!storedBrave)
    setGithubTokens(tokens)
    onCredentialsChange?.(!!storedOpenAI, tokens.length > 0)
  }, [onCredentialsChange])

  const saveOpenAIKey = () => {
    if (openaiKey.trim()) {
      localStorage.setItem(STORAGE_KEY_OPENAI, openaiKey.trim())
      setHasStoredOpenAI(true)
      setOpenaiKey('')
      setOpenaiSaved(true)
      setTimeout(() => setOpenaiSaved(false), 2000)
      onCredentialsChange?.(true, githubTokens.length > 0)
    }
  }

  const addGitHubToken = () => {
    if (newTokenValue.trim()) {
      const label = newTokenLabel.trim() || `Token ${githubTokens.length + 1}`
      const newTokens = [...githubTokens, { label, token: newTokenValue.trim() }]
      setGithubTokens(newTokens)
      localStorage.setItem(STORAGE_KEY_GITHUB_TOKENS, JSON.stringify(newTokens))
      setNewTokenLabel('')
      setNewTokenValue('')
      setShowNewToken(false)
      setTokenSaved(true)
      setTimeout(() => setTokenSaved(false), 2000)
      onCredentialsChange?.(hasStoredOpenAI, true)
    }
  }

  const removeGitHubToken = (index: number) => {
    const newTokens = githubTokens.filter((_, i) => i !== index)
    setGithubTokens(newTokens)
    localStorage.setItem(STORAGE_KEY_GITHUB_TOKENS, JSON.stringify(newTokens))
    onCredentialsChange?.(hasStoredOpenAI, newTokens.length > 0)
  }

  const saveBraveKey = () => {
    if (braveKey.trim()) {
      localStorage.setItem(STORAGE_KEY_BRAVE, braveKey.trim())
      setHasStoredBrave(true)
      setBraveKey('')
      setBraveSaved(true)
      setTimeout(() => setBraveSaved(false), 2000)
    }
  }

  const clearOpenAIKey = () => {
    localStorage.removeItem(STORAGE_KEY_OPENAI)
    setHasStoredOpenAI(false)
    onCredentialsChange?.(false, githubTokens.length > 0)
  }

  const clearBraveKey = () => {
    localStorage.removeItem(STORAGE_KEY_BRAVE)
    setHasStoredBrave(false)
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

        {/* GitHub PATs (Multiple) */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            GitHub Personal Access Token{githubTokens.length !== 1 ? 's' : ''}
            {githubTokens.length > 0 && (
              <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <Check className="h-3 w-3" /> {githubTokens.length} saved
              </span>
            )}
          </Label>
          
          {githubTokens.length > 0 ? (
            // Show saved tokens with Add button
            <div className="space-y-2">
              {githubTokens.map((t, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    type="password"
                    value="••••••••••••••••••••••••••••••••"
                    disabled
                    className="flex-1 font-mono"
                  />
                  <span className="flex items-center text-xs text-muted-foreground min-w-[60px]">
                    {t.label}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => removeGitHubToken(index)}>
                    Clear
                  </Button>
                </div>
              ))}
              
              {/* Add button or add form */}
              {!showNewToken ? (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowNewToken(true)}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Another Token
                </Button>
              ) : (
                <div className="flex gap-2 pt-2 border-t">
                  <Input
                    placeholder="Label"
                    value={newTokenLabel}
                    onChange={(e) => setNewTokenLabel(e.target.value)}
                    className="w-24"
                  />
                  <Input
                    type="password"
                    placeholder="ghp_... or github_pat_..."
                    value={newTokenValue}
                    onChange={(e) => setNewTokenValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addGitHubToken()}
                    className="flex-1 font-mono"
                  />
                  <Button onClick={addGitHubToken} disabled={!newTokenValue.trim()}>
                    {tokenSaved ? <Check className="h-4 w-4" /> : 'Add'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setShowNewToken(false); setNewTokenLabel(''); setNewTokenValue('') }}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          ) : (
            // No tokens yet - show add form directly
            <div className="flex gap-2">
              <Input
                placeholder="Label (e.g., Personal)"
                value={newTokenLabel}
                onChange={(e) => setNewTokenLabel(e.target.value)}
                className="w-32"
              />
              <Input
                type="password"
                placeholder="ghp_... or github_pat_..."
                value={newTokenValue}
                onChange={(e) => setNewTokenValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addGitHubToken()}
                className="flex-1 font-mono"
              />
              <Button onClick={addGitHubToken} disabled={!newTokenValue.trim()}>
                {tokenSaved ? <Check className="h-4 w-4" /> : 'Save'}
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

        {/* Brave Search API Key */}
        <div className="space-y-2">
          <Label htmlFor="brave-key" className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Brave Search API Key
            <span className="text-xs text-muted-foreground">(optional)</span>
            {hasStoredBrave && (
              <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <Check className="h-3 w-3" /> Saved
              </span>
            )}
          </Label>
          
          {hasStoredBrave ? (
            <div className="flex gap-2">
              <Input
                type="password"
                value="••••••••••••••••••••••••••••••••"
                disabled
                className="flex-1 font-mono"
              />
              <Button variant="outline" size="sm" onClick={clearBraveKey}>
                Clear
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="brave-key"
                  type={showBrave ? 'text' : 'password'}
                  placeholder="BSA..."
                  value={braveKey}
                  onChange={(e) => setBraveKey(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveBraveKey()}
                  className="pr-10 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowBrave(!showBrave)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showBrave ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button onClick={saveBraveKey} disabled={!braveKey.trim()}>
                {braveSaved ? <Check className="h-4 w-4" /> : 'Save'}
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Enables web research. Get yours at{' '}
            <a 
              href="https://brave.com/search/api/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              brave.com/search/api
            </a>
            {' '}— free tier: 2,000 queries/month
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

export function getGitHubTokens(): GitHubToken[] {
  const stored = localStorage.getItem(STORAGE_KEY_GITHUB_TOKENS)
  if (!stored) return []
  try {
    return JSON.parse(stored)
  } catch {
    return []
  }
}

// Legacy function - returns first token for backward compatibility
export function getGitHubPat(): string | null {
  const tokens = getGitHubTokens()
  return tokens.length > 0 ? tokens[0].token : null
}

export function getBraveKey(): string | null {
  return localStorage.getItem(STORAGE_KEY_BRAVE)
}
