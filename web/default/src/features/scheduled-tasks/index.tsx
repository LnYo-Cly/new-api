import {
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'
import { formatTimestampToDate } from '@/lib/format'
import { Badge, badgeVariants } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SectionPageLayout } from '@/components/layout'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { VariantProps } from 'class-variance-authority'
import {
  getScheduledTaskRuns,
  getScheduledTasks,
  runScheduledTaskNow,
} from './api'
import type { ScheduledTaskItem, ScheduledTaskRunItem } from './types'

const PAGE_SIZE = 100
const RUN_PAGE_SIZE = 10
const ALL_FILTER = '__all__'

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>

const scheduledTaskCategoryLabels: Record<string, string> = {
  billing: 'Billing',
  channels: 'Channels',
  codex: 'Codex',
  dashboard: 'Dashboard',
  maintenance: 'Maintenance',
  metrics: 'Metrics',
  tasks: 'Tasks',
}

const scheduledTaskNameLabels: Record<string, string> = {
  subscription_quota_reset: 'Subscription Quota Reset',
  channel_auto_test: 'Channel Auto Test',
  channel_cache_sync: 'Channel Cache Sync',
  channel_upstream_update: 'Channel Upstream Update',
  codex_credential_cleanup: 'Codex Credential Cleanup',
  codex_credential_refresh: 'Codex Credential Refresh',
  quota_data_export: 'Quota Data Export',
  sync_options: 'Option Sync',
  perf_metrics_flush: 'Performance Metrics Flush',
  task_polling: 'Async Task Polling',
  channel_balance_update: 'Channel Balance Update',
  batch_updater: 'Batch Updater',
}

function statusVariant(status: string): BadgeVariant {
  if (status === 'failed') return 'destructive'
  if (status === 'running') return 'default'
  if (status === 'success') return 'secondary'
  return 'outline'
}

export function ScheduledTasks() {
  const { t } = useTranslation()
  const [tasks, setTasks] = useState<ScheduledTaskItem[]>([])
  const [runs, setRuns] = useState<ScheduledTaskRunItem[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [loadingRuns, setLoadingRuns] = useState(false)
  const [selectedKey, setSelectedKey] = useState('')
  const [selectedRun, setSelectedRun] = useState<ScheduledTaskRunItem | null>(null)
  const [runDetailOpen, setRunDetailOpen] = useState(false)
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState(ALL_FILTER)

  const categories = useMemo<string[]>(
    () => [
      ALL_FILTER,
      ...new Set(tasks.map((task: ScheduledTaskItem) => task.category)),
    ],
    [tasks]
  )
  const selectedTask = useMemo<ScheduledTaskItem | null>(
    () =>
      tasks.find(
        (task: ScheduledTaskItem) => task.task_key === selectedKey
      ) ?? null,
    [tasks, selectedKey]
  )

  const loadTasks = useEffectEvent(async () => {
    setLoadingTasks(true)
    try {
      const res = await getScheduledTasks({
        p: 1,
        page_size: PAGE_SIZE,
        category: category === ALL_FILTER ? undefined : category,
        keyword: keyword.trim() || undefined,
      })
      const items: ScheduledTaskItem[] = res.data?.items ?? []
      setTasks(items)
      setSelectedKey((current: string) =>
        items.some((task: ScheduledTaskItem) => task.task_key === current)
          ? current
          : items[0]?.task_key || ''
      )
    } finally {
      setLoadingTasks(false)
    }
  })

  const loadRuns = useEffectEvent(async (taskKey: string) => {
    if (!taskKey) {
      setRuns([])
      return
    }
    setLoadingRuns(true)
    try {
      const res = await getScheduledTaskRuns(taskKey, {
        p: 1,
        page_size: RUN_PAGE_SIZE,
      })
      const items: ScheduledTaskRunItem[] = res.data?.items ?? []
      setRuns(items)
    } finally {
      setLoadingRuns(false)
    }
  })

  useEffect(() => {
    void loadTasks()
  }, [category, keyword])

  useEffect(() => {
    void loadRuns(selectedKey)
  }, [selectedKey])

  useEffect(() => {
    if (!selectedRun) return
    const refreshed =
      runs.find((run: ScheduledTaskRunItem) => run.id === selectedRun.id) ??
      null
    setSelectedRun(refreshed)
  }, [runs, selectedRun?.id])

  const handleSearch = () => {
    setKeyword(keywordInput.trim())
  }

  const handleRunNow = async () => {
    if (!selectedTask) return
    await runScheduledTaskNow(selectedTask.task_key)
    toast.success(t('Triggered {{name}}', { name: selectedTask.name }))
    window.setTimeout(() => {
      void loadTasks()
      void loadRuns(selectedTask.task_key)
    }, 1000)
  }
  const handleRunTask = async (task: ScheduledTaskItem) => {
    await runScheduledTaskNow(task.task_key)
    toast.success(
      t('Triggered {{name}}', {
        name: renderTaskNameText(task.name, task.task_key),
      })
    )
    setSelectedKey(task.task_key)
    window.setTimeout(() => {
      void loadTasks()
      void loadRuns(task.task_key)
    }, 1000)
  }

  const runningCount = tasks.filter(
    (task: ScheduledTaskItem) => task.is_running
  ).length
  const failedCount = tasks.filter(
    (task: ScheduledTaskItem) => task.last_status === 'failed'
  ).length
  const renderStatusText = (status: string, isRunning?: boolean) => {
    if (isRunning) return t('Running')
    if (status === 'success') return t('Success')
    if (status === 'failed') return t('Failed')
    if (status === 'running') return t('Running')
    if (status === 'idle' || !status) return t('Idle')
    return status
  }
  const renderCategoryText = (value: string) => {
    const key = scheduledTaskCategoryLabels[value]
    return key ? t(key) : value
  }
  const renderTaskNameText = (name: string, taskKey?: string) => {
    const key = taskKey ? scheduledTaskNameLabels[taskKey] : undefined
    return t(key || name)
  }
  const openRunDetail = (run: ScheduledTaskRunItem) => {
    setSelectedRun(run)
    setRunDetailOpen(true)
  }

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Scheduled Tasks')}</SectionPageLayout.Title>
        <SectionPageLayout.Description>
          {t('View task execution status, recent runs, and trigger manual runs.')}
        </SectionPageLayout.Description>
        <SectionPageLayout.Content>
          <div className='space-y-4'>
            <div className='grid gap-3 md:grid-cols-4'>
              <div className='rounded-xl border p-4'>
                <div className='text-muted-foreground text-sm'>{t('Tasks')}</div>
                <div className='text-2xl font-semibold'>{tasks.length}</div>
              </div>
              <div className='rounded-xl border p-4'>
                <div className='text-muted-foreground text-sm'>{t('Running')}</div>
                <div className='text-2xl font-semibold'>{runningCount}</div>
              </div>
              <div className='rounded-xl border p-4'>
                <div className='text-muted-foreground text-sm'>{t('Failed')}</div>
                <div className='text-2xl font-semibold'>{failedCount}</div>
              </div>
              <div className='rounded-xl border p-4'>
                <div className='text-muted-foreground text-sm'>{t('Selected')}</div>
                <div className='text-2xl font-semibold'>
                  {selectedTask
                    ? renderTaskNameText(selectedTask.name, selectedTask.task_key)
                    : '-'}
                </div>
              </div>
            </div>

            <div className='flex flex-col gap-3 lg:flex-row lg:items-center'>
              <Input
                value={keywordInput}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setKeywordInput(event.target.value)
                }
                onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleSearch()
                  }
                }}
                placeholder={t('Search task name, key, or description...')}
                className='lg:max-w-sm'
              />
              <select
                value={category}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setCategory(event.target.value)
                }
                className='border-input bg-background h-10 rounded-md border px-3 text-sm lg:w-52'
              >
                {categories.map((item: string) => (
                  <option key={item} value={item}>
                    {item === ALL_FILTER
                      ? t('All categories')
                      : renderCategoryText(item)}
                  </option>
                ))}
              </select>
              <Button type='button' onClick={handleSearch}>
                {t('Search')}
              </Button>
              <Button
                type='button'
                variant='outline'
                onClick={() => void loadTasks()}
                disabled={loadingTasks}
              >
                {t('Refresh')}
              </Button>
              <Button
                type='button'
                variant='secondary'
                onClick={() => void handleRunNow()}
                disabled={!selectedTask?.can_manual_run}
              >
                {t('Run now')}
              </Button>
            </div>

            <div className='grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]'>
              <div className='flex min-h-[32rem] flex-col rounded-xl border'>
                <ScrollArea className='min-h-0 flex-1'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('Task')}</TableHead>
                      <TableHead>{t('Status')}</TableHead>
                      <TableHead>{t('Interval')}</TableHead>
                      <TableHead>{t('Last run')}</TableHead>
                      <TableHead className='text-right'>{t('Action')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                      {tasks.map((task: ScheduledTaskItem) => (
                        <TableRow
                          key={task.task_key}
                          className={cn(
                            'cursor-pointer',
                            selectedKey === task.task_key && 'bg-muted/60'
                          )}
                          onClick={() => setSelectedKey(task.task_key)}
                        >
                          <TableCell>
                            <div className='space-y-1'>
                              <div className='font-medium'>
                                {renderTaskNameText(task.name, task.task_key)}
                              </div>
                              <div className='text-muted-foreground text-xs'>
                                {task.task_key}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(task.last_status)}>
                              {renderStatusText(task.last_status, task.is_running)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {task.interval_seconds > 0
                              ? `${task.interval_seconds}s`
                              : '-'}
                          </TableCell>
                          <TableCell>
                            {task.last_finished_at
                              ? formatTimestampToDate(task.last_finished_at)
                              : '-'}
                          </TableCell>
                          <TableCell className='text-right'>
                            <Button
                              type='button'
                              size='sm'
                              variant='outline'
                              disabled={!task.can_manual_run}
                              onClick={(event) => {
                                event.stopPropagation()
                                void handleRunTask(task)
                              }}
                            >
                              {t('Execute')}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>

              <div className='space-y-4 rounded-xl border p-4'>
                <div className='space-y-2'>
                  <div className='flex items-center justify-between gap-2'>
                    <div>
                      <div className='text-lg font-semibold'>
                        {selectedTask
                          ? renderTaskNameText(selectedTask.name, selectedTask.task_key)
                          : t('No task selected')}
                      </div>
                      <div className='text-muted-foreground text-sm'>
                        {selectedTask?.description ||
                          t('Select a task to inspect runs.')}
                      </div>
                    </div>
                    {selectedTask ? (
                      <Badge variant={statusVariant(selectedTask.last_status)}>
                        {renderStatusText(
                          selectedTask.last_status,
                          selectedTask.is_running
                        )}
                      </Badge>
                    ) : null}
                  </div>
                  {selectedTask ? (
                    <div className='text-muted-foreground grid gap-2 text-sm'>
                      <div>{t('Source')}: {selectedTask.source}</div>
                      <div>{t('Category')}: {renderCategoryText(selectedTask.category)}</div>
                      <div>{t('Runs')}: {selectedTask.run_count}</div>
                      <div>{t('Success')}: {selectedTask.success_count}</div>
                      <div>{t('Failure')}: {selectedTask.failure_count}</div>
                      {selectedTask.last_error ? (
                        <div className='text-destructive break-words'>
                          {t('Error')}: {selectedTask.last_error}
                        </div>
                      ) : null}
                      {selectedTask.last_summary ? (
                        <div className='break-words'>
                          {t('Summary')}: {selectedTask.last_summary}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className='space-y-2'>
                  <div className='font-medium'>{t('Recent runs')}</div>
                  <div className='border'>
                    <ScrollArea className='h-[22rem]'>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('Time')}</TableHead>
                            <TableHead>{t('Status')}</TableHead>
                            <TableHead>{t('Duration')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {loadingRuns ? (
                            <TableRow>
                              <TableCell colSpan={3}>{t('Loading...')}</TableCell>
                            </TableRow>
                          ) : runs.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={3}>{t('No runs')}</TableCell>
                            </TableRow>
                          ) : (
                            runs.map((run: ScheduledTaskRunItem) => (
                              <TableRow
                                key={run.id}
                                className='cursor-pointer'
                                onClick={() => openRunDetail(run)}
                              >
                                <TableCell>
                                  {formatTimestampToDate(run.started_at)}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={statusVariant(run.status)}>
                                    {renderStatusText(run.status)}
                                  </Badge>
                                </TableCell>
                                <TableCell>{run.duration_ms} ms</TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <Sheet open={runDetailOpen} onOpenChange={setRunDetailOpen}>
        <SheetContent className='w-full sm:max-w-xl'>
          <SheetHeader className='border-b pb-4 pr-10'>
            <SheetTitle>{t('Run details')}</SheetTitle>
            <SheetDescription>
              {selectedRun
                ? renderTaskNameText(selectedRun.task_name, selectedRun.task_key)
                : t('No run selected')}
            </SheetDescription>
          </SheetHeader>

          {selectedRun ? (
            <div className='space-y-4 p-4'>
              <div className='flex items-center justify-between gap-2'>
                <Badge variant={statusVariant(selectedRun.status)}>
                  {renderStatusText(selectedRun.status)}
                </Badge>
                <span className='text-muted-foreground text-xs'>
                  #{selectedRun.id}
                </span>
              </div>

              <div className='grid gap-3 text-sm'>
                <div>
                  <div className='text-muted-foreground'>{t('Task')}</div>
                  <div className='font-medium'>
                    {renderTaskNameText(selectedRun.task_name, selectedRun.task_key)}
                  </div>
                </div>
                <div>
                  <div className='text-muted-foreground'>{t('Trigger')}</div>
                  <div className='font-medium'>{selectedRun.trigger}</div>
                </div>
                <div>
                  <div className='text-muted-foreground'>{t('Time')}</div>
                  <div className='font-medium'>
                    {formatTimestampToDate(selectedRun.started_at)}
                  </div>
                </div>
                <div>
                  <div className='text-muted-foreground'>{t('Finished at')}</div>
                  <div className='font-medium'>
                    {selectedRun.finished_at
                      ? formatTimestampToDate(selectedRun.finished_at)
                      : '-'}
                  </div>
                </div>
                <div>
                  <div className='text-muted-foreground'>{t('Duration')}</div>
                  <div className='font-medium'>{selectedRun.duration_ms} ms</div>
                </div>
                {selectedRun.error_message ? (
                  <div>
                    <div className='text-muted-foreground'>{t('Error')}</div>
                    <div className='text-destructive break-words'>
                      {selectedRun.error_message}
                    </div>
                  </div>
                ) : null}
                {selectedRun.summary ? (
                  <div>
                    <div className='text-muted-foreground'>{t('Summary')}</div>
                    <div className='break-words'>{selectedRun.summary}</div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}
