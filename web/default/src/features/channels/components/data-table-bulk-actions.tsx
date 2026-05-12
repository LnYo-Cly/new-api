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
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { type Table } from '@tanstack/react-table'
import {
  Activity,
  BarChart3,
  BrainCircuit,
  KeyRound,
  Loader2,
  Power,
  PowerOff,
  RotateCcw,
  Tag,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { StatusBadge, type StatusBadgeProps } from '@/components/status-badge'
import { DataTableBulkActions as BulkActionsToolbar } from '@/components/data-table'
import {
  batchClearCodexPoolState,
  batchRefreshCodexCredentials,
  batchRefreshCodexUsage,
  batchTestChannels,
} from '../api'
import { CHANNEL_TYPE_CODEX } from '../constants'
import {
  handleBatchDelete,
  handleBatchDisable,
  handleBatchEnable,
  handleBatchSetTag,
} from '../lib'
import type { Channel } from '../types'
import { BatchModelsDialog } from './dialogs/batch-models-dialog'

interface DataTableBulkActionsProps<TData> {
  table: Table<TData>
}

type BatchFailure = {
  channel_id: number
  channel_name: string
  message: string
  error_code?: string
}

type BatchOperationResult = {
  title: string
  summary: Array<{
    label: string
    value: number
    variant?: StatusBadgeProps['variant']
  }>
  failures: BatchFailure[]
}

function BatchOperationResultDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: BatchOperationResult | null
}) {
  const { t } = useTranslation()

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='flex max-h-[85vh] flex-col overflow-hidden sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('Batch operation results')}</DialogTitle>
          <DialogDescription>{props.result?.title}</DialogDescription>
        </DialogHeader>

        <div className='min-h-0 flex-1 space-y-4 overflow-hidden'>
          <div className='flex flex-wrap gap-2'>
            {props.result?.summary.map((item) => (
              <StatusBadge
                key={item.label}
                label={`${t(item.label)}: ${item.value}`}
                variant={item.variant ?? 'neutral'}
                copyable={false}
              />
            ))}
          </div>

          <div className='rounded-lg border'>
            <div className='border-b px-3 py-2 text-sm font-medium'>
              {t('Failures')} ({props.result?.failures.length ?? 0})
            </div>
            <ScrollArea className='h-[min(45vh,360px)]'>
              {props.result?.failures.length ? (
                <div className='divide-y'>
                  {props.result.failures.map((failure) => (
                    <div
                      key={`${failure.channel_id}-${failure.error_code ?? ''}-${failure.message}`}
                      className='space-y-1 px-3 py-2 text-xs'
                    >
                      <div className='flex flex-wrap items-center gap-2'>
                        <span className='font-mono'>#{failure.channel_id}</span>
                        <span className='font-medium'>
                          {failure.channel_name || '-'}
                        </span>
                        {failure.error_code && (
                          <StatusBadge
                            label={failure.error_code}
                            variant='neutral'
                            copyable={false}
                          />
                        )}
                      </div>
                      <div className='text-muted-foreground break-words'>
                        {failure.message}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className='text-muted-foreground px-3 py-6 text-center text-sm'>
                  {t('No failures')}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => props.onOpenChange(false)}>
            {t('Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DataTableBulkActions<TData>(
  props: DataTableBulkActionsProps<TData>
) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [showTagDialog, setShowTagDialog] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showRefreshCodexConfirm, setShowRefreshCodexConfirm] = useState(false)
  const [showModelsDialog, setShowModelsDialog] = useState(false)
  const [resultDialogOpen, setResultDialogOpen] = useState(false)
  const [batchResult, setBatchResult] = useState<BatchOperationResult | null>(
    null
  )
  const [batchLoading, setBatchLoading] = useState<
    'test' | 'codex_usage' | 'codex_pool_clear' | 'codex_token' | null
  >(null)
  const [tagValue, setTagValue] = useState('')

  const selectedRows = props.table.getFilteredSelectedRowModel().rows
  const selectedIds = selectedRows.reduce<number[]>((ids, row) => {
    const id = (row.original as Channel).id

    if (typeof id === 'number') {
      ids.push(id)
    }

    return ids
  }, [])
  const codexSelectedCount = selectedRows.reduce((count, row) => {
    return (row.original as Channel).type === CHANNEL_TYPE_CODEX
      ? count + 1
      : count
  }, 0)

  const handleClearSelection = () => {
    props.table.resetRowSelection()
  }

  const handleEnableAll = () => {
    handleBatchEnable(selectedIds, queryClient, handleClearSelection)
  }

  const handleDisableAll = () => {
    handleBatchDisable(selectedIds, queryClient, handleClearSelection)
  }

  const handleDeleteAll = () => {
    handleBatchDelete(selectedIds, queryClient, () => {
      setShowDeleteConfirm(false)
      handleClearSelection()
    })
  }

  const handleSetTag = () => {
    handleBatchSetTag(selectedIds, tagValue || null, queryClient, () => {
      setShowTagDialog(false)
      setTagValue('')
      handleClearSelection()
    })
  }

  const handleRefreshCodexCredentials = async () => {
    if (selectedIds.length === 0 || batchLoading) return
    setBatchLoading('codex_token')
    setShowRefreshCodexConfirm(false)
    try {
      const response = await batchRefreshCodexCredentials({ ids: selectedIds })
      if (!response.success || !response.data) {
        throw new Error(
          response.message || t('Batch Codex token refresh failed')
        )
      }
      showResult({
        title: t(
          'Codex token refresh completed: {{refreshed}} refreshed, {{failed}} failed, {{disabled}} disabled',
          {
            refreshed: response.data.refreshed_channels,
            failed: response.data.failed_channels,
            disabled: response.data.disabled_channels,
          }
        ),
        summary: [
          {
            label: 'Refreshed',
            value: response.data.refreshed_channels,
            variant: 'success',
          },
          {
            label: 'Failed',
            value: response.data.failed_channels,
            variant: response.data.failed_channels > 0 ? 'danger' : 'neutral',
          },
          {
            label: 'Disabled',
            value: response.data.disabled_channels,
            variant:
              response.data.disabled_channels > 0 ? 'warning' : 'neutral',
          },
        ],
        failures: response.data.failures ?? [],
      })
      queryClient.invalidateQueries({ queryKey: ['channels', 'list'] })
      handleClearSelection()
    } catch (error) {
      showResult({
        title:
          error instanceof Error
            ? error.message
            : t('Batch Codex token refresh failed'),
        summary: [
          { label: 'Failed', value: selectedIds.length, variant: 'danger' },
        ],
        failures: [],
      })
    } finally {
      setBatchLoading(null)
    }
  }

  const showResult = (result: BatchOperationResult) => {
    setBatchResult(result)
    setResultDialogOpen(true)
  }

  const handleBatchTestSelected = async () => {
    if (selectedIds.length === 0 || batchLoading) return
    setBatchLoading('test')
    try {
      const response = await batchTestChannels({ ids: selectedIds })
      if (!response.success || !response.data) {
        throw new Error(response.message || t('Batch channel test failed'))
      }
      showResult({
        title: t(
          'Batch channel test completed: {{tested}} tested, {{failed}} failed',
          {
            tested: response.data.tested_channels,
            failed: response.data.failed_channels,
          }
        ),
        summary: [
          {
            label: 'Tested',
            value: response.data.tested_channels,
            variant: 'success',
          },
          {
            label: 'Failed',
            value: response.data.failed_channels,
            variant: response.data.failed_channels > 0 ? 'danger' : 'neutral',
          },
          {
            label: 'Codex status updated',
            value: response.data.codex_status_updated_channels ?? 0,
            variant:
              (response.data.codex_status_updated_channels ?? 0) > 0
                ? 'success'
                : 'neutral',
          },
          {
            label: 'Codex status failed',
            value: response.data.codex_status_failed_channels ?? 0,
            variant:
              (response.data.codex_status_failed_channels ?? 0) > 0
                ? 'warning'
                : 'neutral',
          },
          {
            label: 'Codex credential invalid',
            value: response.data.codex_status_invalid_channels ?? 0,
            variant:
              (response.data.codex_status_invalid_channels ?? 0) > 0
                ? 'danger'
                : 'neutral',
          },
        ],
        failures: response.data.failures ?? [],
      })
      queryClient.invalidateQueries({ queryKey: ['channels', 'list'] })
      handleClearSelection()
    } catch (error) {
      showResult({
        title:
          error instanceof Error
            ? error.message
            : t('Batch channel test failed'),
        summary: [
          { label: 'Failed', value: selectedIds.length, variant: 'danger' },
        ],
        failures: [],
      })
    } finally {
      setBatchLoading(null)
    }
  }

  const handleRefreshCodexUsage = async () => {
    if (selectedIds.length === 0 || batchLoading) return
    setBatchLoading('codex_usage')
    try {
      const response = await batchRefreshCodexUsage({ ids: selectedIds })
      if (!response.success || !response.data) {
        throw new Error(
          response.message || t('Batch Codex usage refresh failed')
        )
      }
      showResult({
        title: t(
          'Codex usage refresh completed: {{updated}} updated, {{failed}} failed, {{invalid}} invalid, {{exhausted}} exhausted',
          {
            updated: response.data.updated_channels,
            failed: response.data.failed_channels,
            invalid: response.data.invalid_channels,
            exhausted: response.data.exhausted_channels,
          }
        ),
        summary: [
          {
            label: 'Updated',
            value: response.data.updated_channels,
            variant: 'success',
          },
          {
            label: 'Failed',
            value: response.data.failed_channels,
            variant: response.data.failed_channels > 0 ? 'danger' : 'neutral',
          },
          {
            label: 'Invalid',
            value: response.data.invalid_channels,
            variant: response.data.invalid_channels > 0 ? 'danger' : 'neutral',
          },
          {
            label: 'Exhausted',
            value: response.data.exhausted_channels,
            variant:
              response.data.exhausted_channels > 0 ? 'warning' : 'neutral',
          },
        ],
        failures: response.data.failures ?? [],
      })
      queryClient.invalidateQueries({ queryKey: ['channels', 'list'] })
      handleClearSelection()
    } catch (error) {
      showResult({
        title:
          error instanceof Error
            ? error.message
            : t('Batch Codex usage refresh failed'),
        summary: [
          { label: 'Failed', value: selectedIds.length, variant: 'danger' },
        ],
        failures: [],
      })
    } finally {
      setBatchLoading(null)
    }
  }

  const handleClearCodexPoolState = async () => {
    if (selectedIds.length === 0 || batchLoading) return
    setBatchLoading('codex_pool_clear')
    try {
      const response = await batchClearCodexPoolState({ ids: selectedIds })
      if (!response.success || !response.data) {
        throw new Error(response.message || t('Clear Codex pool state failed'))
      }
      showResult({
        title: t(
          'Codex pool state cleared: {{updated}} updated, {{failed}} failed',
          {
            updated: response.data.updated_channels,
            failed: response.data.failed_channels,
          }
        ),
        summary: [
          {
            label: 'Updated',
            value: response.data.updated_channels,
            variant: 'success',
          },
          {
            label: 'Failed',
            value: response.data.failed_channels,
            variant: response.data.failed_channels > 0 ? 'danger' : 'neutral',
          },
        ],
        failures: response.data.failures ?? [],
      })
      queryClient.invalidateQueries({ queryKey: ['channels', 'list'] })
      handleClearSelection()
    } catch (error) {
      showResult({
        title:
          error instanceof Error
            ? error.message
            : t('Clear Codex pool state failed'),
        summary: [
          { label: 'Failed', value: selectedIds.length, variant: 'danger' },
        ],
        failures: [],
      })
    } finally {
      setBatchLoading(null)
    }
  }

  return (
    <>
      <BulkActionsToolbar table={props.table} entityName='channel'>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='outline'
                size='icon'
                onClick={handleBatchTestSelected}
                disabled={Boolean(batchLoading)}
                className='size-8'
                aria-label={t('Run tests for selected channels')}
                title={t('Run tests for selected channels')}
              />
            }
          >
            {batchLoading === 'test' ? (
              <Loader2 className='animate-spin' />
            ) : (
              <Activity />
            )}
            <span className='sr-only'>
              {t('Run tests for selected channels')}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('Run tests for selected channels')}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='outline'
                size='icon'
                onClick={handleClearCodexPoolState}
                disabled={codexSelectedCount === 0 || Boolean(batchLoading)}
                className='size-8'
                aria-label={t('Clear selected Codex pool state')}
                title={t('Clear selected Codex pool state')}
              />
            }
          >
            {batchLoading === 'codex_pool_clear' ? (
              <Loader2 className='animate-spin' />
            ) : (
              <RotateCcw />
            )}
            <span className='sr-only'>
              {t('Clear selected Codex pool state')}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('Clear selected Codex pool state')}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='outline'
                size='icon'
                onClick={handleRefreshCodexUsage}
                disabled={codexSelectedCount === 0 || Boolean(batchLoading)}
                className='size-8'
                aria-label={t('Refresh selected Codex usage')}
                title={t('Refresh selected Codex usage')}
              />
            }
          >
            {batchLoading === 'codex_usage' ? (
              <Loader2 className='animate-spin' />
            ) : (
              <BarChart3 />
            )}
            <span className='sr-only'>
              {t('Refresh selected Codex usage')}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('Refresh selected Codex usage')}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='outline'
                size='icon'
                onClick={handleEnableAll}
                className='size-8'
                aria-label={t('Enable selected channels')}
                title={t('Enable selected channels')}
              />
            }
          >
            <Power />
            <span className='sr-only'>{t('Enable selected channels')}</span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('Enable selected channels')}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='outline'
                size='icon'
                onClick={() => setShowRefreshCodexConfirm(true)}
                disabled={codexSelectedCount === 0 || Boolean(batchLoading)}
                className='size-8'
                aria-label={t('Refresh selected Codex OAuth tokens')}
                title={t('Refresh selected Codex OAuth tokens')}
              />
            }
          >
            {batchLoading === 'codex_token' ? (
              <Loader2 className='animate-spin' />
            ) : (
              <KeyRound />
            )}
            <span className='sr-only'>
              {t('Refresh selected Codex OAuth tokens')}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('Refresh selected Codex OAuth tokens')}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='outline'
                size='icon'
                onClick={() => setShowModelsDialog(true)}
                className='size-8'
                aria-label={t('Batch update selected channel models')}
                title={t('Batch update selected channel models')}
              />
            }
          >
            <BrainCircuit />
            <span className='sr-only'>
              {t('Batch update selected channel models')}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('Batch update selected channel models')}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='outline'
                size='icon'
                onClick={handleDisableAll}
                className='size-8'
                aria-label={t('Disable selected channels')}
                title={t('Disable selected channels')}
              />
            }
          >
            <PowerOff />
            <span className='sr-only'>{t('Disable selected channels')}</span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('Disable selected channels')}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='outline'
                size='icon'
                onClick={() => setShowTagDialog(true)}
                className='size-8'
                aria-label={t('Set tag for selected channels')}
                title={t('Set tag for selected channels')}
              />
            }
          >
            <Tag />
            <span className='sr-only'>
              {t('Set tag for selected channels')}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('Set tag for selected channels')}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='destructive'
                size='icon'
                onClick={() => setShowDeleteConfirm(true)}
                className='size-8'
                aria-label={t('Delete selected channels')}
                title={t('Delete selected channels')}
              />
            }
          >
            <Trash2 />
            <span className='sr-only'>{t('Delete selected channels')}</span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('Delete selected channels')}</p>
          </TooltipContent>
        </Tooltip>
      </BulkActionsToolbar>

      {/* Set Tag Dialog */}
      <Dialog open={showTagDialog} onOpenChange={setShowTagDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Set Tag')}</DialogTitle>
            <DialogDescription>
              {t('Set a tag for')} {selectedIds.length}{' '}
              {t('selected channel(s). Leave empty to remove tag.')}
            </DialogDescription>
          </DialogHeader>

          <div className='grid gap-4 py-4'>
            <div className='grid gap-2'>
              <Label htmlFor='tag'>{t('Tag')}</Label>
              <Input
                id='tag'
                placeholder={t('Enter tag name (optional)')}
                value={tagValue}
                onChange={(e) => setTagValue(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => {
                setShowTagDialog(false)
                setTagValue('')
              }}
            >
              {t('Cancel')}
            </Button>
            <Button onClick={handleSetTag}>{t('Set Tag')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Codex Token Refresh Confirmation Dialog */}
      <Dialog
        open={showRefreshCodexConfirm}
        onOpenChange={setShowRefreshCodexConfirm}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Refresh Codex OAuth Tokens?')}</DialogTitle>
            <DialogDescription>
              {t(
                'This will refresh OAuth tokens for {{codex}} Codex channel(s) in {{total}} selected channel(s). Non-Codex or multi-key channels will be skipped with a failure result.',
                {
                  codex: codexSelectedCount,
                  total: selectedIds.length,
                }
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setShowRefreshCodexConfirm(false)}
            >
              {t('Cancel')}
            </Button>
            <Button
              onClick={handleRefreshCodexCredentials}
              disabled={batchLoading === 'codex_token'}
            >
              {t('Refresh Tokens')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Delete Channels?')}</DialogTitle>
            <DialogDescription>
              {t('Are you sure you want to delete')} {selectedIds.length}{' '}
              {t('channel(s)? This action cannot be undone.')}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setShowDeleteConfirm(false)}
            >
              {t('Cancel')}
            </Button>
            <Button variant='destructive' onClick={handleDeleteAll}>
              {t('Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BatchModelsDialog
        open={showModelsDialog}
        onOpenChange={setShowModelsDialog}
        selectedIds={selectedIds}
        onCompleted={handleClearSelection}
      />

      <BatchOperationResultDialog
        open={resultDialogOpen}
        onOpenChange={setResultDialogOpen}
        result={batchResult}
      />
    </>
  )
}
