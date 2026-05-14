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
import { nanoid } from 'nanoid'
import { MESSAGE_ROLES, MESSAGE_STATUS, ERROR_MESSAGES } from '../constants'
import type {
  Message,
  MessageVersion,
  ChatCompletionMessage,
  ContentPart,
  FileContentPart,
  ImageContentPart,
  PlaygroundSubmitMessage,
} from '../types'

/**
 * Create a new message version
 */
export function createMessageVersion(
  content: string | ContentPart[]
): MessageVersion {
  return {
    id: nanoid(),
    content,
  }
}

/**
 * Get current version from message (always returns the first version)
 */
export function getCurrentVersion(message: Message): MessageVersion {
  return message.versions[0] || { id: 'default', content: '' }
}

/**
 * Update current version content in message
 */
export function updateCurrentVersionContent(
  message: Message,
  content: string | ContentPart[]
): Message {
  const currentVersion = getCurrentVersion(message)
  return {
    ...message,
    versions: [{ ...currentVersion, content }],
  }
}

/**
 * Create a user message
 */
export function createUserMessage(content: string): Message {
  return createUserMessageFromSubmit({
    text: content,
  })
}

export function createUserMessageFromSubmit(
  input: PlaygroundSubmitMessage
): Message {
  return {
    key: nanoid(),
    from: MESSAGE_ROLES.USER,
    versions: [createMessageVersion(buildMessageContent(input.text, input.files))],
    requestOptions: {
      useSearch: input.useSearch,
    },
  }
}

/**
 * Create a loading assistant message
 */
export function createLoadingAssistantMessage(): Message {
  return {
    key: nanoid(),
    from: MESSAGE_ROLES.ASSISTANT,
    versions: [createMessageVersion('')],
    reasoning: undefined,
    isReasoningComplete: false,
    isContentComplete: false,
    isReasoningStreaming: false,
    status: MESSAGE_STATUS.LOADING,
  }
}

/**
 * Build message content with optional images
 */
export function buildMessageContent(
  text: string,
  files: Array<{
    url?: string
    mediaType?: string
    filename?: string
  }> = []
): string | ContentPart[] {
  const textContent = text || ''
  const validFiles = files.filter((file) => file.url?.trim())

  if (validFiles.length === 0) {
    return text
  }

  const inferTextMimeType = (filename?: string) => {
    const lower = filename?.toLowerCase() || ''
    if (
      lower.endsWith('.txt') ||
      lower.endsWith('.md') ||
      lower.endsWith('.log') ||
      lower.endsWith('.json') ||
      lower.endsWith('.yaml') ||
      lower.endsWith('.yml') ||
      lower.endsWith('.xml') ||
      lower.endsWith('.html') ||
      lower.endsWith('.css') ||
      lower.endsWith('.js') ||
      lower.endsWith('.ts') ||
      lower.endsWith('.tsx') ||
      lower.endsWith('.jsx') ||
      lower.endsWith('.go') ||
      lower.endsWith('.py') ||
      lower.endsWith('.java') ||
      lower.endsWith('.c') ||
      lower.endsWith('.cpp') ||
      lower.endsWith('.h') ||
      lower.endsWith('.hpp') ||
      lower.endsWith('.rs') ||
      lower.endsWith('.sh') ||
      lower.endsWith('.bat') ||
      lower.endsWith('.cmd') ||
      lower.endsWith('.ps1')
    ) {
      return 'text/plain'
    }

    return 'application/octet-stream'
  }

  const normalizeFileData = (
    url: string,
    filename?: string,
    mediaType?: string
  ) => {
    const trimmed = url.trim()
    if (trimmed.startsWith('data:')) {
      return trimmed
    }

    const mimeType = mediaType?.trim() || inferTextMimeType(filename)
    return `data:${mimeType};base64,${trimmed}`
  }

  const parts: ContentPart[] = [
    {
      type: 'text',
      text: textContent,
    },
    ...validFiles.map((file) =>
      file.mediaType?.startsWith('image/')
        ? ({
            type: 'image_url',
            image_url: { url: file.url!.trim() },
            filename: file.filename,
            mediaType: file.mediaType,
          } as const)
        : ({
            type: 'file',
            file: {
              filename: file.filename || 'attachment',
              file_data: normalizeFileData(
                file.url!,
                file.filename,
                file.mediaType
              ),
            },
            mediaType: file.mediaType,
          } as const)
    ),
  ]

  return parts
}

/**
 * Extract text content from message content
 */
export function getTextContent(content: string | ContentPart[]): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    const textPart = content.find((part) => part.type === 'text')
    return textPart?.text || ''
  }

  return ''
}

export function getAttachmentParts(
  content: string | ContentPart[]
): Array<ImageContentPart | FileContentPart> {
  if (!Array.isArray(content)) {
    return []
  }

  return content.filter(
    (part): part is ImageContentPart | FileContentPart =>
      part.type === 'image_url' || part.type === 'file'
  )
}

export function replaceTextContent(
  content: string | ContentPart[],
  text: string
): string | ContentPart[] {
  if (!Array.isArray(content)) {
    return text
  }

  const attachments = getAttachmentParts(content)
  if (attachments.length === 0) {
    return text
  }

  return [
    {
      type: 'text',
      text,
    },
    ...attachments,
  ]
}

/**
 * Format message for API request
 */
export function formatMessageForAPI(message: Message): ChatCompletionMessage {
  const currentVersion = getCurrentVersion(message)
  return {
    role: message.from,
    content: currentVersion.content,
  }
}

/**
 * Check if message is valid for API request
 * Excludes loading/streaming assistant messages and empty content
 */
export function isValidMessage(message: Message): boolean {
  if (!message || !message.from || !message.versions.length) return false

  const content = message.versions[0]?.content
  if (content === undefined) return false

  if (typeof content === 'string') {
    if (message.from === 'assistant' && !content.trim()) return false
    return true
  }

  const hasText = content.some(
    (part) => part.type === 'text' && part.text.trim() !== ''
  )
  const hasAttachment = content.some(
    (part) => part.type === 'image_url' || part.type === 'file'
  )

  if (message.from === 'assistant' && !hasText && !hasAttachment) return false

  return true
}

/**
 * Parse content to separate thinking from visible text
 * Handles both complete and incomplete <think> tags
 */
export function parseThinkTags(content: string): {
  visibleContent: string
  reasoning: string
  hasUnclosedTag: boolean
} {
  if (!content.includes('<think>')) {
    return { visibleContent: content, reasoning: '', hasUnclosedTag: false }
  }

  const visibleParts: string[] = []
  const reasoningParts: string[] = []
  let currentPos = 0
  let hasUnclosed = false

  while (true) {
    // Find next <think> tag
    const openPos = content.indexOf('<think>', currentPos)

    if (openPos === -1) {
      // No more think tags, add remaining content
      if (currentPos < content.length) {
        visibleParts.push(content.substring(currentPos))
      }
      break
    }

    // Add visible content before this tag
    if (openPos > currentPos) {
      visibleParts.push(content.substring(currentPos, openPos))
    }

    // Look for matching </think> tag
    const closePos = content.indexOf('</think>', openPos + 7)

    if (closePos === -1) {
      // Unclosed tag: rest is reasoning buffer
      reasoningParts.push(content.substring(openPos + 7))
      hasUnclosed = true
      break
    }

    // Extract reasoning content between tags
    reasoningParts.push(content.substring(openPos + 7, closePos))
    currentPos = closePos + 8
  }

  return {
    visibleContent: visibleParts.join('').trim(),
    reasoning: reasoningParts.join('\n\n').trim(),
    hasUnclosedTag: hasUnclosed,
  }
}

/**
 * Update the last assistant message with an error
 * @param messages - Current messages array
 * @param errorMessage - Error message to display
 * @returns Updated messages array
 */
export function updateAssistantMessageWithError(
  messages: Message[],
  errorMessage: string,
  errorCode?: string
): Message[] {
  return updateLastAssistantMessage(messages, (message) => {
    const updatedMessage = updateCurrentVersionContent(
      message,
      `${ERROR_MESSAGES.API_REQUEST_ERROR}: ${errorMessage}`
    )
    return {
      ...updatedMessage,
      status: MESSAGE_STATUS.ERROR,
      isReasoningStreaming: false,
      errorCode: errorCode || null,
    }
  })
}

/**
 * Helper function to update the last assistant message
 * @param messages - Current messages array
 * @param updater - Function to update the message
 * @returns Updated messages array or original if no assistant message found
 */
export function updateLastAssistantMessage(
  messages: Message[],
  updater: (message: Message) => Message
): Message[] {
  if (messages.length === 0) return messages
  const last = messages[messages.length - 1]
  if (!last || last.from !== MESSAGE_ROLES.ASSISTANT) return messages

  const updated = [...messages]
  updated[updated.length - 1] = updater(last)
  return updated
}

/**
 * Process content chunk during streaming
 * Separates <think> reasoning from visible content in real-time
 * Note: versions[0].content keeps the full raw content (with tags) during streaming
 */
export function processStreamingContent(
  message: Message,
  contentChunk?: string
): Message {
  const currentVersion = getCurrentVersion(message)
  const existingContent =
    typeof currentVersion.content === 'string' ? currentVersion.content : ''
  const fullContent = contentChunk
    ? existingContent + contentChunk
    : existingContent

  const { reasoning, hasUnclosedTag } = parseThinkTags(fullContent)

  // Preserve existing reasoning if no think tags found (e.g., from API reasoning_content)
  const finalReasoning = reasoning
    ? { content: reasoning, duration: 0 }
    : message.reasoning

  return {
    ...updateCurrentVersionContent(message, fullContent),
    reasoning: finalReasoning,
    isReasoningStreaming: hasUnclosedTag,
  }
}

/**
 * Finalize message after streaming completes
 * Cleans content and consolidates reasoning from all sources
 */
export function finalizeMessage(
  message: Message,
  apiReasoningContent?: string
): Message {
  const currentVersion = getCurrentVersion(message)
  const rawContent =
    typeof currentVersion.content === 'string' ? currentVersion.content : ''
  const { visibleContent, reasoning } = parseThinkTags(rawContent)

  // Priority:
  // 1. API reasoning_content passed as parameter (non-streaming response)
  // 2. Existing message.reasoning (from streaming reasoning_content)
  // 3. Extracted think tags from content
  const finalReasoning =
    apiReasoningContent || message.reasoning?.content || reasoning || ''

  return {
    ...updateCurrentVersionContent(message, visibleContent),
    reasoning: finalReasoning
      ? { content: finalReasoning, duration: message.reasoning?.duration || 0 }
      : undefined,
    isReasoningStreaming: false,
  }
}

/**
 * Sanitize messages loaded from storage
 * Converts stuck loading/streaming messages to stable state
 */
export function sanitizeMessagesOnLoad(messages: Message[]): Message[] {
  let targetIndex = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (
      m?.from === MESSAGE_ROLES.ASSISTANT &&
      (m?.status === MESSAGE_STATUS.LOADING ||
        m?.status === MESSAGE_STATUS.STREAMING)
    ) {
      targetIndex = i
      break
    }
  }

  if (targetIndex === -1) return messages

  const finalized = finalizeMessage(messages[targetIndex])
  const hasContent = getTextContent(finalized.versions?.[0]?.content || '').trim()
  const hasReasoning = finalized.reasoning?.content?.trim()

  const sanitized: Message =
    hasContent || hasReasoning
      ? {
          ...finalized,
          status: MESSAGE_STATUS.COMPLETE,
          isReasoningStreaming: false,
        }
      : {
          ...updateCurrentVersionContent(
            finalized,
            `${ERROR_MESSAGES.API_REQUEST_ERROR}: ${ERROR_MESSAGES.INTERRUPTED}`
          ),
          status: MESSAGE_STATUS.ERROR,
          isReasoningStreaming: false,
        }

  const result = [...messages]
  result[targetIndex] = sanitized
  return result
}
