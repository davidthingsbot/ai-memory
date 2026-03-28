import { getOpenAIKey } from '@/components/Credentials'
import { getSelectedModel } from '@/components/ModelSelector'
import type { Operation } from '@/store'

export interface Plan {
  description: string
  action: 'insert' | 'modify' | 'create' | 'delete'
  location?: string
  outline?: string[]
}

export interface PlanRequest {
  intent: string
  operation: Operation
  filePath?: string
  fileContent?: string
}

export interface ExecuteRequest {
  plan: Plan
  operation: Operation
  filePath?: string
  fileContent?: string
}

export interface ExecuteResult {
  path: string
  action: 'create' | 'modify' | 'delete'
  content: string
}

type ProgressCallback = (step: string) => void

/**
 * Generate a plan from user intent
 */
export async function generatePlan(
  request: PlanRequest,
  onProgress?: ProgressCallback
): Promise<Plan> {
  const apiKey = getOpenAIKey()
  if (!apiKey) throw new Error('No OpenAI API key')
  
  const model = getSelectedModel()
  onProgress?.(`Using model: ${model}`)
  
  const systemPrompt = `You are an AI assistant helping to plan content modifications for a markdown document.

Your task is to create a clear, actionable plan based on the user's intent.

Return a JSON object with:
- description: A clear description of what will be done
- action: One of "insert", "modify", "create", or "delete"
- location: Where in the document (e.g., "after 'Installation' section", "at the end")
- outline: An array of bullet points describing the content structure (optional)

Be specific and actionable. The plan should be clear enough that another AI can execute it.`

  const userPrompt = `Operation type: ${request.operation.type}
File: ${request.filePath || 'new file'}
${request.fileContent ? `\nCurrent content:\n\`\`\`\n${request.fileContent.slice(0, 2000)}${request.fileContent.length > 2000 ? '\n...(truncated)' : ''}\n\`\`\`` : ''}

User's intent: ${request.intent}

Generate a plan for this operation. Return only valid JSON.`

  onProgress?.('Generating plan...')
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`API error: ${error}`)
  }
  
  const data = await response.json()
  const content = data.choices[0]?.message?.content
  
  if (!content) {
    throw new Error('No response from API')
  }
  
  try {
    const plan = JSON.parse(content) as Plan
    onProgress?.(`Plan: ${plan.action} - ${plan.description.slice(0, 50)}...`)
    return plan
  } catch {
    throw new Error('Failed to parse plan response')
  }
}

/**
 * Execute a plan to generate content
 */
export async function executePlan(
  request: ExecuteRequest,
  onProgress?: ProgressCallback
): Promise<ExecuteResult> {
  const apiKey = getOpenAIKey()
  if (!apiKey) throw new Error('No OpenAI API key')
  
  const model = getSelectedModel()
  onProgress?.('Executing plan...')
  
  const systemPrompt = `You are an AI assistant executing a content modification plan.

Your task is to generate the actual content based on the plan.

Guidelines:
- Follow the plan description exactly
- Write clear, well-structured markdown
- If inserting, provide just the new content (not the whole file)
- If modifying, provide the complete updated file content
- Match the existing document's style if one exists

Return a JSON object with:
- path: The file path for the content
- action: "create", "modify", or "delete"
- content: The full content to write (the entire file content if modifying, just new section if inserting)`

  let userPrompt = `Plan:
- Description: ${request.plan.description}
- Action: ${request.plan.action}
- Location: ${request.plan.location || 'appropriate location'}
${request.plan.outline ? `- Outline:\n${request.plan.outline.map(o => `  - ${o}`).join('\n')}` : ''}

File: ${request.filePath || 'needs to be determined'}
${request.fileContent ? `\nCurrent content:\n\`\`\`\n${request.fileContent}\n\`\`\`` : ''}

Execute this plan and generate the content. Return only valid JSON.`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`API error: ${error}`)
  }
  
  const data = await response.json()
  const content = data.choices[0]?.message?.content
  
  if (!content) {
    throw new Error('No response from API')
  }
  
  try {
    const result = JSON.parse(content) as ExecuteResult
    onProgress?.(`Generated ${result.content.length} characters`)
    return {
      path: result.path || request.filePath || 'untitled.md',
      action: result.action || 'modify',
      content: result.content,
    }
  } catch {
    throw new Error('Failed to parse execution response')
  }
}
