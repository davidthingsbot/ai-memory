import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { getSelectedRepo } from './RepoSelection'
import { findStagedImageByRelativePath } from '@/lib/image-store'
import 'katex/dist/katex.min.css'

interface MarkdownPreviewProps {
  content: string
  basePath?: string // Current file's directory path for resolving relative links
  onNavigate?: (path: string) => void // Called when clicking internal links
  className?: string
}

export function MarkdownPreview({ 
  content, 
  basePath = '', 
  onNavigate,
  className = ''
}: MarkdownPreviewProps) {
  const repo = getSelectedRepo()
  const repoFullName = repo?.full_name || ''

  // Convert relative image URLs to raw GitHub URLs (or staged image data URLs)
  const resolveImageUrl = (src: string): string => {
    if (!src) return src
    
    // Already absolute URL or data URL
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
      return src
    }
    
    // Check if this is a staged image first (for preview before commit)
    const stagedImage = findStagedImageByRelativePath(src, basePath)
    if (stagedImage) {
      return stagedImage.dataUrl
    }
    
    // Resolve relative path
    let resolvedPath = src
    if (src.startsWith('./')) {
      resolvedPath = basePath ? `${basePath}/${src.slice(2)}` : src.slice(2)
    } else if (src.startsWith('../')) {
      // Handle parent directory references
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
      // Relative to current directory
      resolvedPath = basePath ? `${basePath}/${src}` : src
    } else {
      // Absolute from repo root
      resolvedPath = src.slice(1)
    }
    
    // Convert to raw GitHub URL
    return `https://raw.githubusercontent.com/${repoFullName}/main/${resolvedPath}`
  }

  // Handle link clicks
  const handleLinkClick = (href: string, e: React.MouseEvent) => {
    if (!href) return
    
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
            const isInline = !match && !className
            
            if (isInline) {
              return (
                <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                  {children}
                </code>
              )
            }
            
            return (
              <SyntaxHighlighter
                style={oneDark}
                language={match?.[1] || 'text'}
                PreTag="div"
                className="rounded-lg !my-3"
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            )
          },
          
          // Images with resolved URLs
          img({ src, alt, ...props }) {
            const resolvedSrc = resolveImageUrl(src || '')
            return (
              <img 
                src={resolvedSrc} 
                alt={alt || ''} 
                className="max-w-full h-auto rounded-lg"
                loading="lazy"
                {...props}
              />
            )
          },
          
          // Links with navigation handling
          a({ href, children, ...props }) {
            const isExternal = href?.startsWith('http://') || href?.startsWith('https://')
            
            return (
              <a
                href={href}
                onClick={(e) => handleLinkClick(href || '', e)}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                className="text-blue-600 dark:text-blue-400 hover:underline"
                {...props}
              >
                {children}
              </a>
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
}

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
