import { Octokit } from 'octokit'
import { getGitHubPat } from '@/components/Credentials'
import { getSelectedRepo } from '@/components/RepoSelection'

interface CommitResult {
  success: boolean
  sha?: string
  url?: string
  error?: string
}

/**
 * Create or update a file in the repository
 */
export async function commitFile(
  path: string,
  content: string,
  message: string
): Promise<CommitResult> {
  const token = getGitHubPat()
  if (!token) {
    return { success: false, error: 'No GitHub token' }
  }

  const repo = getSelectedRepo()
  if (!repo) {
    return { success: false, error: 'No repository selected' }
  }

  const octokit = new Octokit({ auth: token })

  try {
    // Check if file exists (need SHA for update)
    let existingSha: string | undefined
    try {
      const existing = await octokit.rest.repos.getContent({
        owner: repo.owner.login,
        repo: repo.name,
        path,
      })
      if (!Array.isArray(existing.data) && 'sha' in existing.data) {
        existingSha = existing.data.sha
      }
    } catch (err) {
      // File doesn't exist, that's fine for create
      if ((err as any)?.status !== 404) {
        throw err
      }
    }

    // Create or update the file
    const result = await octokit.rest.repos.createOrUpdateFileContents({
      owner: repo.owner.login,
      repo: repo.name,
      path,
      message,
      content: btoa(unescape(encodeURIComponent(content))), // UTF-8 safe base64
      sha: existingSha, // Required for updates
      branch: repo.default_branch,
    })

    return {
      success: true,
      sha: result.data.commit.sha,
      url: result.data.content?.html_url,
    }
  } catch (err) {
    console.error('Commit failed:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Commit failed',
    }
  }
}
