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
import { STORAGE_KEYS } from '../constants'
import type { PlaygroundConfig, ParameterEnabled, Message } from '../types'
import { sanitizeMessagesOnLoad } from './message-utils'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function extractLegacyTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (!Array.isArray(content)) {
    return ''
  }

  const textParts = content
    .filter(
      (part): part is { type?: string; text?: unknown } =>
        isRecord(part) && part.type === 'text'
    )
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)

  return textParts.join('\n')
}

function normalizeLoadedMessages(saved: unknown): {
  messages: Message[] | null
  mutated: boolean
} {
  let mutated = false
  let rawMessages = saved

  if (isRecord(saved) && Array.isArray(saved.messages)) {
    rawMessages = saved.messages
    mutated = true
  }

  if (!Array.isArray(rawMessages)) {
    return { messages: null, mutated: true }
  }

  const messages: Message[] = []

  rawMessages.forEach((rawMessage, index) => {
    if (!isRecord(rawMessage)) {
      mutated = true
      return
    }

    const from =
      typeof rawMessage.from === 'string'
        ? rawMessage.from
        : typeof rawMessage.role === 'string'
          ? rawMessage.role
          : null

    if (from !== 'user' && from !== 'assistant' && from !== 'system') {
      mutated = true
      return
    }

    let versions = Array.isArray(rawMessage.versions)
      ? rawMessage.versions
          .map((version, versionIndex) => {
            if (!isRecord(version)) {
              mutated = true
              return null
            }

            const content =
              typeof version.content === 'string'
                ? version.content
                : extractLegacyTextContent(version.content)

            return {
              id:
                typeof version.id === 'string'
                  ? version.id
                  : `${index}-${versionIndex}`,
              content,
            }
          })
          .filter((version): version is NonNullable<typeof version> =>
            Boolean(version)
          )
      : []

    if (versions.length === 0) {
      versions = [
        {
          id:
            typeof rawMessage.key === 'string'
              ? rawMessage.key
              : typeof rawMessage.id === 'string'
                ? rawMessage.id
                : `${index}`,
          content: extractLegacyTextContent(rawMessage.content),
        },
      ]
      mutated = true
    }

    const reasoningContent = isRecord(rawMessage.reasoning)
      ? rawMessage.reasoning.content
      : rawMessage.reasoningContent

    const status =
      rawMessage.status === 'incomplete' ? 'streaming' : rawMessage.status

    messages.push({
      key:
        typeof rawMessage.key === 'string'
          ? rawMessage.key
          : typeof rawMessage.id === 'string'
            ? rawMessage.id
            : `${index}`,
      from,
      versions,
      reasoning:
        typeof reasoningContent === 'string' && reasoningContent
          ? {
              content: reasoningContent,
              duration:
                isRecord(rawMessage.reasoning) &&
                typeof rawMessage.reasoning.duration === 'number'
                  ? rawMessage.reasoning.duration
                  : 0,
            }
          : undefined,
      isReasoningStreaming:
        typeof rawMessage.isReasoningStreaming === 'boolean'
          ? rawMessage.isReasoningStreaming
          : false,
      isReasoningComplete:
        typeof rawMessage.isReasoningComplete === 'boolean'
          ? rawMessage.isReasoningComplete
          : undefined,
      isContentComplete:
        typeof rawMessage.isContentComplete === 'boolean'
          ? rawMessage.isContentComplete
          : undefined,
      status:
        status === 'loading' ||
        status === 'streaming' ||
        status === 'complete' ||
        status === 'error'
          ? status
          : undefined,
      errorCode:
        typeof rawMessage.errorCode === 'string' ? rawMessage.errorCode : null,
    })
  })

  return { messages, mutated }
}

/**
 * Load playground config from localStorage
 */
export function loadConfig(): Partial<PlaygroundConfig> {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.CONFIG)
    if (saved) {
      return JSON.parse(saved)
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load config:', error)
  }
  return {}
}

/**
 * Save playground config to localStorage
 */
export function saveConfig(config: Partial<PlaygroundConfig>): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config))
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to save config:', error)
  }
}

/**
 * Load parameter enabled state from localStorage
 */
export function loadParameterEnabled(): Partial<ParameterEnabled> {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.PARAMETER_ENABLED)
    if (saved) {
      return JSON.parse(saved)
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load parameter enabled:', error)
  }
  return {}
}

/**
 * Save parameter enabled state to localStorage
 */
export function saveParameterEnabled(
  parameterEnabled: Partial<ParameterEnabled>
): void {
  try {
    localStorage.setItem(
      STORAGE_KEYS.PARAMETER_ENABLED,
      JSON.stringify(parameterEnabled)
    )
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to save parameter enabled:', error)
  }
}

/**
 * Load messages from localStorage
 */
export function loadMessages(): Message[] | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.MESSAGES)
    if (saved) {
      const parsed = JSON.parse(saved) as unknown
      const { messages, mutated } = normalizeLoadedMessages(parsed)
      if (!messages) {
        return null
      }

      const sanitized = sanitizeMessagesOnLoad(messages)
      // Persist normalized/sanitized result to avoid future crashes from old data
      if (mutated || sanitized !== messages) {
        saveMessages(sanitized)
      }
      return sanitized
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load messages:', error)
  }
  return null
}

/**
 * Save messages to localStorage
 */
export function saveMessages(messages: Message[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages))
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to save messages:', error)
  }
}

/**
 * Clear all playground data
 */
export function clearPlaygroundData(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.CONFIG)
    localStorage.removeItem(STORAGE_KEYS.PARAMETER_ENABLED)
    localStorage.removeItem(STORAGE_KEYS.MESSAGES)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to clear playground data:', error)
  }
}
