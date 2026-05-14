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
import type { QueryClient } from '@tanstack/react-query'
import i18next from 'i18next'
import { toast } from 'sonner'
import { formatCurrencyFromUSD } from '@/lib/currency'
import {
  batchRefreshCodexCredentials,
  batchRefreshCodexUsage,
  copyChannel,
  deleteChannel,
  deleteCredentialInvalidCodexChannels,
  getChannels,
  testChannel,
  searchChannels,
  updateChannel,
  batchDeleteChannels,
  batchSetChannelTag,
  enableTagChannels,
  disableTagChannels,
  deleteDisabledChannels,
  fixChannelAbilities,
  editTagChannels,
  testAllChannels,
  updateAllChannelsBalance,
  updateChannelBalance,
} from '../api'
import {
  CHANNEL_STATUS,
  CHANNEL_TYPE_CODEX,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
} from '../constants'
import type {
  CopyChannelParams,
  GetChannelsParams,
  SearchChannelsParams,
} from '../types'

// ============================================================================
// Query Keys
// ============================================================================

export const channelsQueryKeys = {
  all: ['channels'] as const,
  lists: () => [...channelsQueryKeys.all, 'list'] as const,
  list: (params: Record<string, unknown>) =>
    [...channelsQueryKeys.lists(), params] as const,
  details: () => [...channelsQueryKeys.all, 'detail'] as const,
  detail: (id: number) => [...channelsQueryKeys.details(), id] as const,
}

const CHANNEL_BATCH_PAGE_SIZE = 200
const CODEX_USAGE_BATCH_SIZE = 50

type CodexAuthorizationFilterParams = {
  keyword?: string
  model?: string
  group?: string
  status?: string
  type?: number
  codex_status?: string
  id_sort?: boolean
  tag_mode?: boolean
}

function chunkNumbers(values: number[], size: number): number[][] {
  const chunks: number[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

function buildListParams(
  params: CodexAuthorizationFilterParams,
  page: number
): GetChannelsParams {
  return {
    group: params.group,
    status: params.status,
    type: params.type,
    codex_status: params.codex_status,
    tag_mode: params.tag_mode,
    id_sort: params.id_sort,
    p: page,
    page_size: CHANNEL_BATCH_PAGE_SIZE,
  }
}

function buildSearchParams(
  params: CodexAuthorizationFilterParams,
  page: number
): SearchChannelsParams {
  return {
    keyword: params.keyword,
    model: params.model,
    group: params.group,
    status: params.status,
    type: params.type,
    codex_status: params.codex_status,
    tag_mode: params.tag_mode,
    id_sort: params.id_sort,
    p: page,
    page_size: CHANNEL_BATCH_PAGE_SIZE,
  }
}

// ============================================================================
// Single Channel Actions
// ============================================================================

/**
 * Enable a channel
 */
export async function handleEnableChannel(
  id: number,
  queryClient?: QueryClient,
  onSuccess?: () => void
): Promise<void> {
  try {
    const response = await updateChannel(id, { status: CHANNEL_STATUS.ENABLED })
    if (response.success) {
      toast.success(i18next.t(SUCCESS_MESSAGES.ENABLED))
      queryClient?.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
      onSuccess?.()
    }
  } catch (_error) {
    toast.error(i18next.t(ERROR_MESSAGES.UPDATE_FAILED))
  }
}

/**
 * Disable a channel
 */
export async function handleDisableChannel(
  id: number,
  queryClient?: QueryClient,
  onSuccess?: () => void
): Promise<void> {
  try {
    const response = await updateChannel(id, {
      status: CHANNEL_STATUS.MANUAL_DISABLED,
    })
    if (response.success) {
      toast.success(i18next.t(SUCCESS_MESSAGES.DISABLED))
      queryClient?.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
      onSuccess?.()
    }
  } catch (_error) {
    toast.error(i18next.t(ERROR_MESSAGES.UPDATE_FAILED))
  }
}

/**
 * Toggle channel status (enable/disable)
 */
export async function handleToggleChannelStatus(
  id: number,
  currentStatus: number,
  queryClient?: QueryClient,
  onSuccess?: () => void
): Promise<void> {
  if (currentStatus === CHANNEL_STATUS.ENABLED) {
    await handleDisableChannel(id, queryClient, onSuccess)
  } else {
    await handleEnableChannel(id, queryClient, onSuccess)
  }
}

/**
 * Delete a channel
 */
export async function handleDeleteChannel(
  id: number,
  queryClient?: QueryClient,
  onSuccess?: () => void
): Promise<void> {
  try {
    const response = await deleteChannel(id)
    if (response.success) {
      toast.success(i18next.t(SUCCESS_MESSAGES.DELETED))
      queryClient?.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
      onSuccess?.()
    }
  } catch (_error) {
    toast.error(i18next.t(ERROR_MESSAGES.DELETE_FAILED))
  }
}

/**
 * Update a specific channel field (e.g., priority, weight)
 */
export async function handleUpdateChannelField(
  id: number,
  fieldName: string,
  value: number,
  queryClient?: QueryClient,
  onSuccess?: () => void
): Promise<void> {
  try {
    const response = await updateChannel(id, { [fieldName]: value })
    if (response.success) {
      // Show success toast with field name
      const fieldLabel =
        fieldName.charAt(0).toUpperCase() + fieldName.slice(1).toLowerCase()
      toast.success(
        i18next.t('{{field}} updated to {{value}}', {
          field: fieldLabel,
          value,
        })
      )
      queryClient?.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
      onSuccess?.()
    } else {
      toast.error(response.message || i18next.t(ERROR_MESSAGES.UPDATE_FAILED))
    }
  } catch (_error) {
    toast.error(i18next.t(ERROR_MESSAGES.UPDATE_FAILED))
  }
}

/**
 * Update a specific field for all channels with a tag
 */
export async function handleUpdateTagField(
  tag: string,
  fieldName: 'priority' | 'weight',
  value: number,
  queryClient?: QueryClient,
  onSuccess?: () => void
): Promise<void> {
  try {
    const params = { tag, [fieldName]: value }
    const response = await editTagChannels(params)
    if (response.success) {
      // Show success toast with field name
      const fieldLabel =
        fieldName.charAt(0).toUpperCase() + fieldName.slice(1).toLowerCase()
      toast.success(
        i18next.t('{{field}} updated to {{value}} for tag: {{tag}}', {
          field: fieldLabel,
          value,
          tag,
        })
      )
      queryClient?.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
      onSuccess?.()
    } else {
      toast.error(response.message || i18next.t(ERROR_MESSAGES.UPDATE_FAILED))
    }
  } catch (_error) {
    toast.error(i18next.t(ERROR_MESSAGES.UPDATE_FAILED))
  }
}

/**
 * Test channel connectivity
 */
export async function handleTestChannel(
  id: number,
  options?: { testModel?: string; endpointType?: string; stream?: boolean },
  queryClient?: QueryClient,
  onTestComplete?: (
    success: boolean,
    responseTime?: number,
    error?: string,
    errorCode?: string
  ) => void
): Promise<void> {
  const payload =
    options && (options.testModel || options.endpointType || options.stream)
      ? {
          ...(options.testModel ? { model: options.testModel } : {}),
          ...(options.endpointType
            ? { endpoint_type: options.endpointType }
            : {}),
          ...(options.stream ? { stream: true } : {}),
        }
      : undefined

  try {
    const response = await testChannel(id, payload)
    if (response.success) {
      toast.success(i18next.t(SUCCESS_MESSAGES.TESTED))
      queryClient?.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
      onTestComplete?.(true, response.data?.response_time ?? response.time)
    } else {
      toast.error(response.message || i18next.t(ERROR_MESSAGES.TEST_FAILED))
      queryClient?.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
      onTestComplete?.(false, undefined, response.message, response.error_code)
    }
  } catch (_error: unknown) {
    const err = _error as { response?: { data?: { message?: string } } }
    const errorMsg =
      err?.response?.data?.message || i18next.t(ERROR_MESSAGES.TEST_FAILED)
    toast.error(errorMsg)
    onTestComplete?.(false, undefined, errorMsg)
  }
}

/**
 * Copy a channel
 */
export async function handleCopyChannel(
  id: number,
  params: CopyChannelParams,
  queryClient?: QueryClient,
  onSuccess?: (newId: number) => void
): Promise<void> {
  try {
    const response = await copyChannel(id, params)
    if (response.success && response.data?.id) {
      toast.success(i18next.t(SUCCESS_MESSAGES.COPIED))
      queryClient?.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
      onSuccess?.(response.data.id)
    }
  } catch (_error) {
    toast.error(i18next.t('Failed to copy channel'))
  }
}

/**
 * Update channel balance
 */
export async function handleUpdateChannelBalance(
  id: number,
  queryClient?: QueryClient,
  onSuccess?: (balance: number) => void
): Promise<void> {
  try {
    const response = await updateChannelBalance(id)
    if (response.success && response.balance !== undefined) {
      const balance = response.balance
      toast.success(
        i18next.t('Balance updated: {{balance}}', {
          balance: formatCurrencyFromUSD(balance, {
            digitsLarge: 2,
            digitsSmall: 4,
            abbreviate: false,
          }),
        })
      )
      queryClient?.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
      onSuccess?.(balance)
    } else {
      toast.error(response.message || i18next.t('Failed to update balance'))
    }
  } catch (_error: unknown) {
    toast.error(
      _error instanceof Error
        ? _error.message
        : i18next.t('Failed to update balance')
    )
  }
}

// ============================================================================
// Batch Actions
// ============================================================================

/**
 * Batch delete channels
 */
export async function handleBatchDelete(
  ids: number[],
  queryClient?: QueryClient,
  onSuccess?: (deletedCount: number) => void
): Promise<void> {
  if (ids.length === 0) {
    toast.error(i18next.t('No channels selected'))
    return
  }

  try {
    const response = await batchDeleteChannels({ ids })
    if (response.success) {
      toast.success(
        i18next.t('{{count}} channel(s) deleted', {
          count: response.data || ids.length,
        })
      )
      queryClient?.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
      onSuccess?.(response.data || ids.length)
    }
  } catch (_error) {
    toast.error(i18next.t(ERROR_MESSAGES.DELETE_FAILED))
  }
}

/**
 * Batch enable channels
 */
export async function handleBatchEnable(
  ids: number[],
  queryClient?: QueryClient,
  onSuccess?: () => void
): Promise<void> {
  if (ids.length === 0) {
    toast.error(i18next.t('No channels selected'))
    return
  }

  try {
    // Update each channel individually
    const promises = ids.map((id) =>
      updateChannel(id, { status: CHANNEL_STATUS.ENABLED })
    )
    const results = await Promise.allSettled(promises)

    const successCount = results.filter((r) => r.status === 'fulfilled').length
    const failCount = results.filter((r) => r.status === 'rejected').length

    if (successCount > 0) {
      toast.success(
        i18next.t('{{count}} channel(s) enabled', { count: successCount })
      )
      queryClient?.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
      onSuccess?.()
    }

    if (failCount > 0) {
      toast.error(
        i18next.t('{{count}} channel(s) failed to enable', { count: failCount })
      )
    }
  } catch (_error) {
    toast.error(i18next.t('Failed to enable channels'))
  }
}

/**
 * Batch disable channels
 */
export async function handleBatchDisable(
  ids: number[],
  queryClient?: QueryClient,
  onSuccess?: () => void
): Promise<void> {
  if (ids.length === 0) {
    toast.error(i18next.t('No channels selected'))
    return
  }

  try {
    // Update each channel individually
    const promises = ids.map((id) =>
      updateChannel(id, { status: CHANNEL_STATUS.MANUAL_DISABLED })
    )
    const results = await Promise.allSettled(promises)

    const successCount = results.filter((r) => r.status === 'fulfilled').length
    const failCount = results.filter((r) => r.status === 'rejected').length

    if (successCount > 0) {
      toast.success(
        i18next.t('{{count}} channel(s) disabled', { count: successCount })
      )
      queryClient?.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
      onSuccess?.()
    }

    if (failCount > 0) {
      toast.error(
        i18next.t('{{count}} channel(s) failed to disable', {
          count: failCount,
        })
      )
    }
  } catch (_error) {
    toast.error(i18next.t('Failed to disable channels'))
  }
}

/**
 * Batch set tag
 */
export async function handleBatchSetTag(
  ids: number[],
  tag: string | null,
  queryClient?: QueryClient,
  onSuccess?: () => void
): Promise<void> {
  if (ids.length === 0) {
    toast.error(i18next.t('No channels selected'))
    return
  }

  try {
    const response = await batchSetChannelTag({ ids, tag })
    if (response.success) {
      toast.success(i18next.t(SUCCESS_MESSAGES.TAG_SET))
      queryClient?.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
      onSuccess?.()
    }
  } catch (_error) {
    toast.error(i18next.t('Failed to set tag'))
  }
}

/**
 * Batch refresh Codex OAuth credentials.
 */
export async function handleBatchRefreshCodexCredentials(
  ids: number[],
  queryClient?: QueryClient,
  onSuccess?: () => void
): Promise<void> {
  if (ids.length === 0) {
    toast.error(i18next.t('No channels selected'))
    return
  }

  try {
    const response = await batchRefreshCodexCredentials({ ids })
    if (!response.success || !response.data) {
      toast.error(
        response.message || i18next.t('Batch Codex token refresh failed')
      )
      return
    }

    const { refreshed_channels, failed_channels, disabled_channels } =
      response.data
    toast.success(
      i18next.t(
        'Codex token refresh completed: {{refreshed}} refreshed, {{failed}} failed, {{disabled}} disabled',
        {
          refreshed: refreshed_channels,
          failed: failed_channels,
          disabled: disabled_channels,
        }
      )
    )
    if (failed_channels > 0) {
      toast.warning(
        i18next.t('{{count}} Codex channel(s) failed to refresh', {
          count: failed_channels,
        })
      )
    }
    queryClient?.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
    onSuccess?.()
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : i18next.t('Batch Codex token refresh failed')
    )
  }
}

/**
 * Refresh Codex account authorization status for all channels that match the current filters.
 */
export async function handleTestCodexAuthorizationByFilters(
  params: CodexAuthorizationFilterParams,
  queryClient?: QueryClient,
  onSuccess?: () => void
): Promise<void> {
  try {
    const shouldSearch = Boolean(params.keyword?.trim() || params.model?.trim())
    const channelIds: number[] = []
    let page = 1
    let total = 0

    do {
      const response = shouldSearch
        ? await searchChannels(buildSearchParams(params, page))
        : await getChannels(buildListParams(params, page))

      if (!response.success || !response.data) {
        throw new Error(
          response.message || i18next.t('Failed to load channels for authorization test')
        )
      }

      const items = response.data.items || []
      total = response.data.total || 0
      for (const channel of items) {
        if (
          channel.type === CHANNEL_TYPE_CODEX &&
          !channel.channel_info?.is_multi_key
        ) {
          channelIds.push(channel.id)
        }
      }
      page += 1
    } while ((page - 1) * CHANNEL_BATCH_PAGE_SIZE < total)

    if (channelIds.length === 0) {
      toast.error(i18next.t('No eligible Codex channels found for authorization test'))
      return
    }

    let updatedChannels = 0
    let failedChannels = 0
    let invalidChannels = 0
    let exhaustedChannels = 0

    for (const ids of chunkNumbers(channelIds, CODEX_USAGE_BATCH_SIZE)) {
      const response = await batchRefreshCodexUsage({ ids })
      if (!response.success || !response.data) {
        throw new Error(
          response.message || i18next.t('Batch Codex usage refresh failed')
        )
      }

      updatedChannels += response.data.updated_channels
      failedChannels += response.data.failed_channels
      invalidChannels += response.data.invalid_channels
      exhaustedChannels += response.data.exhausted_channels
    }

    toast.success(
      i18next.t(
        'Account authorization test completed: {{updated}} updated, {{failed}} failed, {{invalid}} invalid, {{exhausted}} exhausted',
        {
          updated: updatedChannels,
          failed: failedChannels,
          invalid: invalidChannels,
          exhausted: exhaustedChannels,
        }
      )
    )
    if (failedChannels > 0 || invalidChannels > 0) {
      toast.warning(
        i18next.t(
          'Some Codex channels require attention after authorization test: {{failed}} failed, {{invalid}} invalid',
          {
            failed: failedChannels,
            invalid: invalidChannels,
          }
        )
      )
    }

    queryClient?.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
    onSuccess?.()
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : i18next.t('Failed to test account authorization')
    )
  }
}

// ============================================================================
// Tag-Based Actions
// ============================================================================

/**
 * Enable all channels with a tag
 */
export async function handleEnableTagChannels(
  tag: string,
  queryClient?: QueryClient,
  onSuccess?: () => void
): Promise<void> {
  try {
    const response = await enableTagChannels(tag)
    if (response.success) {
      toast.success(
        i18next.t('Enabled all channels with tag: {{tag}}', { tag })
      )
      queryClient?.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
      onSuccess?.()
    }
  } catch (_error) {
    toast.error(i18next.t('Failed to enable tag channels'))
  }
}

/**
 * Disable all channels with a tag
 */
export async function handleDisableTagChannels(
  tag: string,
  queryClient?: QueryClient,
  onSuccess?: () => void
): Promise<void> {
  try {
    const response = await disableTagChannels(tag)
    if (response.success) {
      toast.success(
        i18next.t('Disabled all channels with tag: {{tag}}', { tag })
      )
      queryClient?.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
      onSuccess?.()
    }
  } catch (_error) {
    toast.error(i18next.t('Failed to disable tag channels'))
  }
}

// ============================================================================
// System Actions
// ============================================================================

/**
 * Delete all disabled channels
 */
export async function handleDeleteAllDisabled(
  queryClient?: QueryClient,
  onSuccess?: (deletedCount: number) => void
): Promise<number> {
  try {
    const response = await deleteDisabledChannels()
    if (response.success) {
      toast.success(
        i18next.t('{{count}} disabled channel(s) deleted', {
          count: response.data || 0,
        })
      )
      queryClient?.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
      const deletedCount = response.data || 0
      onSuccess?.(deletedCount)
      return deletedCount
    }
  } catch (_error) {
    toast.error(i18next.t('Failed to delete disabled channels'))
  }
  return 0
}

/**
 * Delete all Codex channels with credential invalid status
 */
export async function handleDeleteCredentialInvalidCodexChannels(
  queryClient?: QueryClient,
  onSuccess?: (deletedCount: number) => void
): Promise<number> {
  try {
    const response = await deleteCredentialInvalidCodexChannels()
    if (response.success) {
      const deletedCount = response.data || 0
      toast.success(
        i18next.t('{{count}} credential-invalid Codex channel(s) deleted', {
          count: deletedCount,
        })
      )
      queryClient?.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
      onSuccess?.(deletedCount)
      return deletedCount
    }
  } catch (_error) {
    toast.error(i18next.t('Failed to delete credential-invalid Codex channels'))
  }
  return 0
}

/**
 * Fix channel abilities
 */
export async function handleFixAbilities(
  queryClient?: QueryClient,
  onSuccess?: (result: { success: number; fails: number }) => void
): Promise<void> {
  try {
    const response = await fixChannelAbilities()
    if (response.success && response.data) {
      toast.success(
        i18next.t('Fixed abilities: {{success}} succeeded, {{fails}} failed', {
          success: response.data.success,
          fails: response.data.fails,
        })
      )
      queryClient?.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
      onSuccess?.(response.data)
    }
  } catch (_error) {
    toast.error(i18next.t('Failed to fix abilities'))
  }
}

/**
 * Test all enabled channels
 */
export async function handleTestAllChannels(
  queryClient?: QueryClient,
  onSuccess?: () => void
): Promise<void> {
  try {
    const response = await testAllChannels()
    if (response.success) {
      toast.success(
        i18next.t(
          'Testing all enabled channels started. Please refresh to see results.'
        )
      )
      queryClient?.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
      onSuccess?.()
    } else {
      toast.error(
        response.message || i18next.t('Failed to start testing all channels')
      )
    }
  } catch (_error) {
    toast.error(i18next.t('Failed to test all channels'))
  }
}

/**
 * Update balance for all enabled channels
 */
export async function handleUpdateAllBalances(
  queryClient?: QueryClient,
  onSuccess?: () => void
): Promise<void> {
  try {
    const response = await updateAllChannelsBalance()
    if (response.success) {
      toast.success(
        i18next.t(
          'Updating all channel balances. This may take a while. Please refresh to see results.'
        )
      )
      queryClient?.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
      onSuccess?.()
    } else {
      toast.error(
        response.message || i18next.t('Failed to update all balances')
      )
    }
  } catch (_error) {
    toast.error(i18next.t('Failed to update all balances'))
  }
}
