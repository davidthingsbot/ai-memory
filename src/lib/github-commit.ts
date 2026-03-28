import { Octokit } from 'octokit'
import { getSelectedRepo, getSelectedRepoToken } from '@/components/RepoSelection'
import type { ChangeSet } from './changeset-generator'
import type { FileChange } from '@/store'
import { getAllStagedImages, clearStagedImages, dataUrlToBase64 } from './image-store'

interface CommitResult {
  success: boolean
  sha?: string
  url?: string
  error?: string
}

interface MultiCommitResult {
  success: boolean
  sha?: string
  url?: string
  error?: string
  filesChanged: number
}

/**
 * Create or update a file in the repository
 */
export async function commitFile(
  path: string,
  content: string,
  message: string
): Promise<CommitResult> {
  const token = getSelectedRepoToken()
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

/**
 * Commit multiple file changes atomically using Git tree API.
 * Supports create, update, and delete operations in a single commit.
 */
export async function commitChangeSet(
  changeSet: ChangeSet
): Promise<MultiCommitResult> {
  const token = getSelectedRepoToken()
  if (!token) {
    return { success: false, error: 'No GitHub token', filesChanged: 0 }
  }

  const repo = getSelectedRepo()
  if (!repo) {
    return { success: false, error: 'No repository selected', filesChanged: 0 }
  }

  if (changeSet.changes.length === 0) {
    return { success: false, error: 'No changes to commit', filesChanged: 0 }
  }

  const octokit = new Octokit({ auth: token })
  const owner = repo.owner.login
  const repoName = repo.name
  const branch = repo.default_branch

  try {
    // 1. Get the current commit SHA for the branch
    const { data: refData } = await octokit.rest.git.getRef({
      owner,
      repo: repoName,
      ref: `heads/${branch}`,
    })
    const currentCommitSha = refData.object.sha

    // 2. Get the tree SHA from the current commit
    const { data: commitData } = await octokit.rest.git.getCommit({
      owner,
      repo: repoName,
      commit_sha: currentCommitSha,
    })
    const baseTreeSha = commitData.tree.sha

    // 3. Create blobs for new/updated files and build tree entries
    const treeEntries: Array<{
      path: string
      mode: '100644' | '100755' | '040000' | '160000' | '120000'
      type: 'blob' | 'tree' | 'commit'
      sha?: string | null
      content?: string
    }> = []

    // Include staged images in the commit
    const stagedImages = getAllStagedImages()
    for (const image of stagedImages) {
      const base64Content = dataUrlToBase64(image.dataUrl)
      if (base64Content) {
        const { data: blobData } = await octokit.rest.git.createBlob({
          owner,
          repo: repoName,
          content: base64Content,
          encoding: 'base64', // Images are base64 encoded
        })
        treeEntries.push({
          path: image.path,
          mode: '100644',
          type: 'blob',
          sha: blobData.sha,
        })
      }
    }

    for (const change of changeSet.changes) {
      if (change.action === 'delete') {
        // For deletes, set sha to null
        treeEntries.push({
          path: change.path,
          mode: '100644',
          type: 'blob',
          sha: null,
        })
      } else if (change.action === 'rename' && change.previousPath) {
        // For renames: delete old path + create at new path
        treeEntries.push({
          path: change.previousPath,
          mode: '100644',
          type: 'blob',
          sha: null, // Delete old path
        })
        if (change.content !== undefined) {
          const { data: blobData } = await octokit.rest.git.createBlob({
            owner,
            repo: repoName,
            content: change.content,
            encoding: 'utf-8',
          })
          treeEntries.push({
            path: change.path,
            mode: '100644',
            type: 'blob',
            sha: blobData.sha, // Create at new path
          })
        }
      } else if (change.content !== undefined) {
        // For create/update, create a blob with the content
        const { data: blobData } = await octokit.rest.git.createBlob({
          owner,
          repo: repoName,
          content: change.content,
          encoding: 'utf-8',
        })
        treeEntries.push({
          path: change.path,
          mode: '100644',
          type: 'blob',
          sha: blobData.sha,
        })
      }
    }

    // 4. Create a new tree with the changes
    const { data: newTree } = await octokit.rest.git.createTree({
      owner,
      repo: repoName,
      base_tree: baseTreeSha,
      tree: treeEntries,
    })

    // 5. Create a new commit pointing to the new tree
    const { data: newCommit } = await octokit.rest.git.createCommit({
      owner,
      repo: repoName,
      message: changeSet.commitMessage,
      tree: newTree.sha,
      parents: [currentCommitSha],
    })

    // 6. Update the branch reference to point to the new commit
    await octokit.rest.git.updateRef({
      owner,
      repo: repoName,
      ref: `heads/${branch}`,
      sha: newCommit.sha,
    })

    // Clear staged images after successful commit
    const imagesCommitted = stagedImages.length
    if (imagesCommitted > 0) {
      clearStagedImages()
    }

    return {
      success: true,
      sha: newCommit.sha,
      url: `https://github.com/${owner}/${repoName}/commit/${newCommit.sha}`,
      filesChanged: changeSet.changes.length + imagesCommitted,
    }
  } catch (err) {
    console.error('Multi-file commit failed:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Commit failed',
      filesChanged: 0,
    }
  }
}

/**
 * Commit an array of FileChange objects atomically.
 * Simpler interface for the v2 UI.
 */
export async function commitFiles(
  changes: FileChange[],
  message: string
): Promise<MultiCommitResult> {
  const token = getSelectedRepoToken()
  if (!token) {
    return { success: false, error: 'No GitHub token', filesChanged: 0 }
  }

  const repo = getSelectedRepo()
  if (!repo) {
    return { success: false, error: 'No repository selected', filesChanged: 0 }
  }

  if (changes.length === 0) {
    return { success: false, error: 'No changes to commit', filesChanged: 0 }
  }

  const octokit = new Octokit({ auth: token })
  const owner = repo.owner.login
  const repoName = repo.name
  const branch = repo.default_branch

  try {
    // 1. Get the current commit SHA for the branch
    const { data: refData } = await octokit.rest.git.getRef({
      owner,
      repo: repoName,
      ref: `heads/${branch}`,
    })
    const currentCommitSha = refData.object.sha

    // 2. Get the tree SHA from the current commit
    const { data: commitData } = await octokit.rest.git.getCommit({
      owner,
      repo: repoName,
      commit_sha: currentCommitSha,
    })
    const baseTreeSha = commitData.tree.sha

    // 3. Create blobs for new/updated files and build tree entries
    const treeEntries: Array<{
      path: string
      mode: '100644' | '100755' | '040000' | '160000' | '120000'
      type: 'blob' | 'tree' | 'commit'
      sha?: string | null
      content?: string
    }> = []

    for (const change of changes) {
      if (change.action === 'delete') {
        treeEntries.push({
          path: change.path,
          mode: '100644',
          type: 'blob',
          sha: null,
        })
      } else if (change.content !== undefined) {
        const { data: blobData } = await octokit.rest.git.createBlob({
          owner,
          repo: repoName,
          content: change.content,
          encoding: 'utf-8',
        })
        treeEntries.push({
          path: change.path,
          mode: '100644',
          type: 'blob',
          sha: blobData.sha,
        })
      }
    }

    // 4. Create a new tree with the changes
    const { data: newTree } = await octokit.rest.git.createTree({
      owner,
      repo: repoName,
      base_tree: baseTreeSha,
      tree: treeEntries,
    })

    // 5. Create a new commit pointing to the new tree
    const { data: newCommit } = await octokit.rest.git.createCommit({
      owner,
      repo: repoName,
      message,
      tree: newTree.sha,
      parents: [currentCommitSha],
    })

    // 6. Update the branch reference to point to the new commit
    await octokit.rest.git.updateRef({
      owner,
      repo: repoName,
      ref: `heads/${branch}`,
      sha: newCommit.sha,
    })

    return {
      success: true,
      sha: newCommit.sha,
      url: `https://github.com/${owner}/${repoName}/commit/${newCommit.sha}`,
      filesChanged: changes.length,
    }
  } catch (err) {
    console.error('commitFiles failed:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Commit failed',
      filesChanged: 0,
    }
  }
}
