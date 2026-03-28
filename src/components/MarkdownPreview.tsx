import React, { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'

import { findStagedImageByRelativePath } from '@/lib/image-store'
import { getFileAsDataUrl } from '@/lib/github-tools'
import 'katex/dist/katex.min.css'

interface MarkdownPreviewProps {
  content: string
  basePath?: string // Current file's directory path for resolving relative links
  onNavigate?: (path: string) => void // Called when clicking internal links
  darkMode?: boolean
  className?: string
}

// Async image component that fetches from GitHub API
function AsyncImage({ 
  src, 
  alt, 
  basePath,
  className 
}: { 
  src: string
  alt: string
  basePath: string
  className?: string 
}) {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadImage() {
      if (!src) {
        setError('No image source')
        setLoading(false)
        return
      }

      // Already absolute URL or data URL - use directly
      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
        setImageSrc(src)
        setLoading(false)
        return
      }

      // Check staged images first
      const stagedImage = findStagedImageByRelativePath(src, basePath)
      if (stagedImage) {
        setImageSrc(stagedImage.dataUrl)
        setLoading(false)
        return
      }

      // Resolve relative path to repo path
      let resolvedPath = src
      if (src.startsWith('./')) {
        resolvedPath = basePath ? `${basePath}/${src.slice(2)}` : src.slice(2)
      } else if (src.startsWith('../')) {
        const baseSegments = basePath.split('/').filter(Boolean)
        const srcSegments = src.split('/')
        for (const segment of srcSegments) {
          if (segment === '..') {
            baseSegments.pop()
          } else if (segment !== '.') {
            baseSegments.push(segment)
          }
        }
        resolvedPath = baseSegments.join('/')
      } else if (!src.startsWith('/')) {
        resolvedPath = basePath ? `${basePath}/${src}` : src
      } else {
        resolvedPath = src.slice(1)
      }

      // Fetch via GitHub API
      try {
        const dataUrl = await getFileAsDataUrl(resolvedPath)
        if (cancelled) return
        
        if (dataUrl) {
          setImageSrc(dataUrl)
        } else {
          setError(`Not found: ${resolvedPath}`)
        }
      } catch (err) {
        if (cancelled) return
        setError(`Failed to load: ${resolvedPath}`)
      }
      setLoading(false)
    }

    loadImage()
    return () => { cancelled = true }
  }, [src, basePath])

  if (loading) {
    return (
      <span className="inline-flex items-center gap-2 text-muted-foreground text-sm p-2 border rounded">
        <span className="animate-pulse">Loading image...</span>
      </span>
    )
  }

  if (error || !imageSrc) {
    return (
      <span
        className="inline-block p-4 border-2 border-dashed border-red-400 rounded text-sm text-red-600"
        title={error || 'Unknown error'}
      >
        {error || `Failed to load: ${src}`}
      </span>
    )
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      data-original-src={src}
      className={className || 'max-w-full h-auto rounded-lg'}
      loading="lazy"
    />
  )
}

export const MarkdownPreview = React.memo(function MarkdownPreview({
  content,
  basePath = '',
  onNavigate,
  darkMode = true,
  className = ''
}: MarkdownPreviewProps) {
  // Handle link clicks — require Ctrl/Cmd+click to follow
  const handleLinkClick = (href: string, e: React.MouseEvent) => {
    if (!href) return

    // Require Ctrl (or Cmd on Mac) to follow any link
    if (!e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      return
    }

    // External links - open in new tab
    if (href.startsWith('http://') || href.startsWith('https://')) {
      return // Let default behavior handle it
    }

    // Anchor links - scroll within page
    if (href.startsWith('#')) {
      const element = document.getElementById(href.slice(1))
      if (element) {
        e.preventDefault()
        element.scrollIntoView({ behavior: 'smooth' })
      }
      return
    }

    // Internal repo links
    if (onNavigate) {
      e.preventDefault()

      let resolvedPath = href
      if (href.startsWith('./')) {
        resolvedPath = basePath ? `${basePath}/${href.slice(2)}` : href.slice(2)
      } else if (href.startsWith('../')) {
        const baseSegments = basePath.split('/').filter(Boolean)
        const hrefSegments = href.split('/')

        for (const segment of hrefSegments) {
          if (segment === '..') {
            baseSegments.pop()
          } else if (segment !== '.') {
            baseSegments.push(segment)
          }
        }
        resolvedPath = baseSegments.join('/')
      } else if (!href.startsWith('/')) {
        resolvedPath = basePath ? `${basePath}/${href}` : href
      } else {
        resolvedPath = href.slice(1)
      }

      // Remove anchor from path for navigation
      const [pathWithoutAnchor] = resolvedPath.split('#')
      onNavigate(pathWithoutAnchor)
    }
  }

  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeKatex]}
        components={{
          // Code blocks with syntax highlighting
          code({ node, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            // Fenced code blocks (with or without language) have a <pre> parent
            const isBlock = node?.position?.start.line !== node?.position?.end.line
              || Boolean(className)
              || String(children).includes('\n')

            if (!isBlock) {
              return (
                <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                  {children}
                </code>
              )
            }

            return (
              <SyntaxHighlighter
                style={darkMode ? oneDark : oneLight}
                language={match?.[1] || 'text'}
                PreTag="div"
                className="rounded-lg !my-3"
                customStyle={{ margin: 0 }}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            )
          },
          
          // Images fetched via GitHub API for private repos
          img({ src, alt }) {
            return (
              <AsyncImage 
                src={src || ''} 
                alt={alt || ''} 
                basePath={basePath}
              />
            )
          },
          
          // Links with navigation handling
          a({ href, children, ...props }) {
            const isExternal = href?.startsWith('http://') || href?.startsWith('https://')

            return (
              <span
                role="link"
                className="text-blue-600 dark:text-blue-400 hover:underline cursor-text"
                title={`Ctrl+click to follow${href ? ': ' + href : ''}`}
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey) {
                    handleLinkClick(href || '', e)
                    if (isExternal) {
                      window.open(href!, '_blank', 'noopener,noreferrer')
                    }
                  }
                }}
                {...props}
              >
                {children}
              </span>
            )
          },
          
          // Tables with better styling
          table({ children, ...props }) {
            return (
              <div className="overflow-x-auto my-4">
                <table className="min-w-full border-collapse border border-border" {...props}>
                  {children}
                </table>
              </div>
            )
          },
          th({ children, ...props }) {
            return (
              <th className="border border-border bg-muted px-3 py-2 text-left font-semibold" {...props}>
                {children}
              </th>
            )
          },
          td({ children, ...props }) {
            return (
              <td className="border border-border px-3 py-2" {...props}>
                {children}
              </td>
            )
          },
          
          // Task lists
          input({ type, checked, ...props }) {
            if (type === 'checkbox') {
              return (
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  className="mr-2 h-4 w-4"
                  {...props}
                />
              )
            }
            return <input type={type} {...props} />
          },
          
          // Headings with IDs for anchor links
          h1({ children, ...props }) {
            const id = generateHeadingId(children)
            return <h1 id={id} className="text-2xl font-bold mt-6 mb-4 scroll-mt-4" {...props}>{children}</h1>
          },
          h2({ children, ...props }) {
            const id = generateHeadingId(children)
            return <h2 id={id} className="text-xl font-bold mt-5 mb-3 scroll-mt-4" {...props}>{children}</h2>
          },
          h3({ children, ...props }) {
            const id = generateHeadingId(children)
            return <h3 id={id} className="text-lg font-semibold mt-4 mb-2 scroll-mt-4" {...props}>{children}</h3>
          },
          h4({ children, ...props }) {
            const id = generateHeadingId(children)
            return <h4 id={id} className="text-base font-semibold mt-3 mb-2 scroll-mt-4" {...props}>{children}</h4>
          },
          
          // Blockquotes
          blockquote({ children, ...props }) {
            return (
              <blockquote className="border-l-4 border-muted-foreground/30 pl-4 my-4 italic text-muted-foreground" {...props}>
                {children}
              </blockquote>
            )
          },
          
          // Horizontal rules
          hr({ ...props }) {
            return <hr className="my-6 border-border" {...props} />
          },
          
          // Lists
          ul({ children, ...props }) {
            return <ul className="list-disc pl-6 my-2 space-y-1" {...props}>{children}</ul>
          },
          ol({ children, ...props }) {
            return <ol className="list-decimal pl-6 my-2 space-y-1" {...props}>{children}</ol>
          },
          
          // Paragraphs
          p({ children, ...props }) {
            return <p className="my-2 leading-relaxed" {...props}>{children}</p>
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})

// Generate URL-friendly ID from heading content
function generateHeadingId(children: React.ReactNode): string {
  const text = extractTextFromChildren(children)
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

function extractTextFromChildren(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(extractTextFromChildren).join('')
  if (React.isValidElement(children)) {
    const props = children.props as { children?: React.ReactNode }
    return extractTextFromChildren(props.children)
  }
  return ''
}
