/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface MarkdownProps {
  children: string
  className?: string
}

export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div
      className={cn(
        'prose prose-sm dark:prose-invert max-w-none',
        'prose-headings:font-semibold prose-headings:tracking-tight',
        'prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg',
        'prose-p:leading-relaxed prose-p:my-2',
        'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
        'prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none',
        'prose-pre:bg-muted prose-pre:border',
        'prose-blockquote:border-l-primary prose-blockquote:bg-muted/50 prose-blockquote:py-1',
        'prose-ul:my-2 prose-ol:my-2 prose-li:my-1',
        'prose-img:rounded-lg prose-img:shadow-sm',
        '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        '[overflow-wrap:anywhere] break-words',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target='_blank' rel='noopener noreferrer' />
          ),
          table: ({ node, className: tableClassName, ...props }) => (
            <div className='my-4 w-full overflow-x-auto rounded-lg border'>
              <table
                {...props}
                className={cn(
                  'w-full min-w-max border-collapse text-sm',
                  tableClassName
                )}
              />
            </div>
          ),
          thead: ({ node, className: theadClassName, ...props }) => (
            <thead {...props} className={cn('bg-muted/60', theadClassName)} />
          ),
          tbody: ({ node, className: tbodyClassName, ...props }) => (
            <tbody
              {...props}
              className={cn('[&_tr:last-child]:border-b-0', tbodyClassName)}
            />
          ),
          tr: ({ node, className: trClassName, ...props }) => (
            <tr
              {...props}
              className={cn('border-b transition-colors', trClassName)}
            />
          ),
          th: ({ node, className: thClassName, ...props }) => (
            <th
              {...props}
              className={cn(
                'border-r px-3 py-2 text-left align-top font-semibold last:border-r-0',
                thClassName
              )}
            />
          ),
          td: ({ node, className: tdClassName, ...props }) => (
            <td
              {...props}
              className={cn(
                'border-r px-3 py-2 align-top last:border-r-0',
                tdClassName
              )}
            />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
