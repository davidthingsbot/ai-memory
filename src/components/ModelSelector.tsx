import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Cpu } from 'lucide-react'

const STORAGE_KEY = 'ai-memory:model'

const MODELS = [
  { id: 'gpt-5.2', name: 'GPT-5.2', description: 'Latest, most capable' },
  { id: 'gpt-5', name: 'GPT-5', description: 'Powerful, slightly faster' },
  { id: 'gpt-4o', name: 'GPT-4o', description: 'Great balance of speed/quality' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast and economical' },
]

const DEFAULT_MODEL = 'gpt-4o-mini'

interface ModelSelectorProps {
  onModelChange?: (model: string) => void
}

export function ModelSelector({ onModelChange }: ModelSelectorProps) {
  const [selected, setSelected] = useState(DEFAULT_MODEL)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && MODELS.some(m => m.id === stored)) {
      setSelected(stored)
      onModelChange?.(stored)
    }
  }, [onModelChange])

  const handleChange = (modelId: string) => {
    setSelected(modelId)
    localStorage.setItem(STORAGE_KEY, modelId)
    onModelChange?.(modelId)
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Cpu className="h-4 w-4" />
          Model
        </CardTitle>
        <CardDescription className="text-xs">
          Choose the AI model for research and generation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {MODELS.map(model => (
            <button
              key={model.id}
              onClick={() => handleChange(model.id)}
              className={`p-2 rounded-lg border text-left transition-colors ${
                selected === model.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-muted/50'
              }`}
            >
              <p className={`text-sm font-medium ${selected === model.id ? 'text-primary' : ''}`}>
                {model.name}
              </p>
              <p className="text-xs text-muted-foreground">{model.description}</p>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function getSelectedModel(): string {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_MODEL
}
