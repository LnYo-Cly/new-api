import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { batchUpdateChannelModels } from '../../api'
import { channelsQueryKeys } from '../../lib'
import type { BatchUpdateModelsMode, BatchUpdateModelsResponse } from '../../types'

type BatchModelsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedIds: number[]
  onCompleted?: () => void
}

const modes: Array<{
  value: BatchUpdateModelsMode
  labelKey: string
  descriptionKey: string
}> = [
  {
    value: 'replace',
    labelKey: 'Replace models',
    descriptionKey: 'Replace selected channels with the entered model list.',
  },
  {
    value: 'append',
    labelKey: 'Append models',
    descriptionKey: 'Add entered models while keeping existing channel models.',
  },
  {
    value: 'remove',
    labelKey: 'Remove models',
    descriptionKey: 'Remove entered models from selected channels.',
  },
  {
    value: 'refresh_upstream',
    labelKey: 'Refresh from upstream',
    descriptionKey:
      'Fetch each channel upstream model list and replace that channel models.',
  },
]

function parseModelText(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}

export function BatchModelsDialog(props: BatchModelsDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<BatchUpdateModelsMode>('replace')
  const [modelsText, setModelsText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<BatchUpdateModelsResponse['data']>()

  const models = useMemo(() => parseModelText(modelsText), [modelsText])
  const selectedMode = useMemo(
    () => modes.find((item) => item.value === mode) || modes[0],
    [mode]
  )
  const requiresModels = mode !== 'refresh_upstream'
  const canSubmit =
    props.selectedIds.length > 0 &&
    !isSubmitting &&
    (!requiresModels || models.length > 0)

  const handleSubmit = async () => {
    if (!canSubmit) return
    setIsSubmitting(true)
    setResult(undefined)

    try {
      const response = await batchUpdateChannelModels({
        ids: props.selectedIds,
        mode,
        models: requiresModels ? models : [],
      })

      if (!response.success || !response.data) {
        toast.error(response.message || t('Batch model update failed'))
        return
      }

      setResult(response.data)
      toast.success(
        t(
          'Batch model update completed: {{updated}} updated, {{failed}} failed',
          {
            updated: response.data.updated_channels,
            failed: response.data.failed_channels,
          }
        )
      )
      await queryClient.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
      props.onCompleted?.()
      props.onOpenChange(false)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('Batch model update failed')
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = (open: boolean) => {
    if (isSubmitting) return
    if (!open) {
      setResult(undefined)
    }
    props.onOpenChange(open)
  }

  return (
    <Dialog open={props.open} onOpenChange={handleClose}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('Batch Models')}</DialogTitle>
          <DialogDescription>
            {t('Apply model changes to {{count}} selected channel(s).', {
              count: props.selectedIds.length,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='grid gap-2'>
            <Label>{t('Operation')}</Label>
            <Select
              value={mode}
              onValueChange={(value) => {
                setMode(value as BatchUpdateModelsMode)
                setResult(undefined)
              }}
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder={t('Select operation')} />
              </SelectTrigger>
              <SelectContent>
                {modes.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {t(item.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className='text-muted-foreground text-xs'>
              {t(selectedMode.descriptionKey)}
            </p>
          </div>

          {requiresModels ? (
            <div className='grid gap-2'>
              <div className='flex items-center justify-between gap-2'>
                <Label htmlFor='batch-models'>{t('Models')}</Label>
                <span className='text-muted-foreground text-xs'>
                  {t('{{count}} model(s)', { count: models.length })}
                </span>
              </div>
              <Textarea
                id='batch-models'
                value={modelsText}
                onChange={(event) => {
                  setModelsText(event.target.value)
                  setResult(undefined)
                }}
                placeholder={t('One model per line or comma separated')}
                className='min-h-36 font-mono text-sm'
                spellCheck={false}
              />
            </div>
          ) : (
            <Alert>
              <RefreshCw className='h-4 w-4' />
              <AlertDescription>
                {t(
                  'Each selected channel will call its upstream models endpoint. Codex channels use the OAuth account access_token and account_id.'
                )}
              </AlertDescription>
            </Alert>
          )}

          {result && (
            <div className='rounded-md border p-3'>
              <div className='grid grid-cols-3 gap-2 text-center text-sm'>
                <div>
                  <div className='font-medium'>{result.updated_channels}</div>
                  <div className='text-muted-foreground text-xs'>
                    {t('Updated')}
                  </div>
                </div>
                <div>
                  <div className='font-medium'>{result.failed_channels}</div>
                  <div className='text-muted-foreground text-xs'>
                    {t('Failed')}
                  </div>
                </div>
                <div>
                  <div className='font-medium'>{result.total_models}</div>
                  <div className='text-muted-foreground text-xs'>
                    {t('Models')}
                  </div>
                </div>
              </div>

              {result.failures && result.failures.length > 0 && (
                <ScrollArea className='mt-3 h-28 rounded border p-2'>
                  <div className='space-y-1'>
                    {result.failures.map((failure) => (
                      <div
                        key={failure.channel_id}
                        className='text-muted-foreground text-xs'
                      >
                        <span className='font-medium'>
                          #{failure.channel_id} {failure.channel_name}
                        </span>
                        : {failure.message}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            disabled={isSubmitting}
            onClick={() => handleClose(false)}
          >
            {t('Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isSubmitting && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {mode === 'refresh_upstream'
              ? t('Refresh Models')
              : t('Update Models')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
