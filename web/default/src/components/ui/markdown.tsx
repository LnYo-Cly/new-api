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
        'max-w-none text-sm leading-7 text-foreground',
        '[overflow-wrap:anywhere] break-words',
        '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          h1: ({ node, className: headingClassName, ...props }) => (
            <h1
              {...props}
              className={cn(
                'mt-6 mb-4 text-2xl font-semibold tracking-tight',
                headingClassName
              )}
            />
          ),
          h2: ({ node, className: headingClassName, ...props }) => (
            <h2
              {...props}
              className={cn(
                'mt-5 mb-3 text-xl font-semibold tracking-tight',
                headingClassName
              )}
            />
          ),
          h3: ({ node, className: headingClassName, ...props }) => (
            <h3
              {...props}
              className={cn(
                'mt-4 mb-2 text-lg font-semibold tracking-tight',
                headingClassName
              )}
            />
          ),
          h4: ({ node, className: headingClassName, ...props }) => (
            <h4
              {...props}
              className={cn('mt-4 mb-2 text-base font-semibold', headingClassName)}
            />
          ),
          h5: ({ node, className: headingClassName, ...props }) => (
            <h5
              {...props}
              className={cn('mt-3 mb-2 text-sm font-semibold', headingClassName)}
            />
          ),
          h6: ({ node, className: headingClassName, ...props }) => (
            <h6
              {...props}
              className={cn(
                'mt-3 mb-2 text-sm font-semibold text-muted-foreground',
                headingClassName
              )}
            />
          ),
          p: ({ node, className: paragraphClassName, ...props }) => (
            <p {...props} className={cn('my-2 leading-7', paragraphClassName)} />
          ),
          a: ({ node, ...props }) => (
            <a
              {...props}
              target='_blank'
              rel='noopener noreferrer'
              className={cn(
                'text-primary underline-offset-4 hover:underline',
                props.className
              )}
            />
          ),
          ul: ({ node, className: listClassName, ...props }) => (
            <ul {...props} className={cn('my-3 list-disc pl-6', listClassName)} />
          ),
          ol: ({ node, className: listClassName, ...props }) => (
            <ol
              {...props}
              className={cn('my-3 list-decimal pl-6', listClassName)}
            />
          ),
          li: ({ node, className: itemClassName, ...props }) => (
            <li {...props} className={cn('my-1 pl-1', itemClassName)} />
          ),
          strong: ({ node, className: strongClassName, ...props }) => (
            <strong {...props} className={cn('font-semibold', strongClassName)} />
          ),
          blockquote: ({ node, className: quoteClassName, ...props }) => (
            <blockquote
              {...props}
              className={cn(
                'my-4 border-l-4 border-primary/40 bg-muted/40 px-4 py-2 italic',
                quoteClassName
              )}
            />
          ),
          hr: ({ node, className: hrClassName, ...props }) => (
            <hr {...props} className={cn('my-6 border-border', hrClassName)} />
          ),
          code: ({ node, className: codeClassName, ...props }) => (
            <code
              {...props}
              className={cn(
                'rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]',
                codeClassName
              )}
            />
          ),
          pre: ({ node, className: preClassName, ...props }) => (
            <pre
              {...props}
              className={cn(
                'my-4 overflow-x-auto rounded-lg border bg-muted p-4 text-sm',
                preClassName
              )}
            />
          ),
          img: ({ node, className: imgClassName, alt, ...props }) => (
            <img
              {...props}
              alt={alt}
              className={cn('my-4 rounded-lg shadow-sm', imgClassName)}
            />
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
