import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type ColumnDef,
  type PaginationState,
  type VisibilityState,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  CalendarClock,
  Clock,
  BarChart3,
  Search,
  Trash2,
  UserMinus,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StatusBadge } from '@/components/status-badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DataTableColumnHeader,
  DataTablePage,
} from '@/components/data-table'
import { useMediaQuery } from '@/hooks'
import {
  formatLogQuota,
  formatTimestampForInput,
  parseTimestampFromInput,
} from '@/lib/format'
import {
  adjustUserSubscriptionTime,
  deleteUserSubscription,
  getAdminPlans,
  getAdminUserSubscriptionOverview,
  invalidateUserSubscription,
} from '../api'
import {
  formatInternalQuota,
  formatSubscriptionQuota,
  formatTimestamp,
} from '../lib'
import type {
  AdminUserSubscriptionRecord,
  AdminUserSubscriptionStats,
  PlanRecord,
  UserSubscriptionRecord,
} from '../types'
import { useSubscriptions } from './subscriptions-provider'

const EMPTY_STATS: AdminUserSubscriptionStats = {
  total: 0,
  active: 0,
  expired: 0,
  cancelled: 0,
  expiring_7d: 0,
  today_used: 0,
  last_7d_used: 0,
  unlimited: 0,
  quota_limited: 0,
}

function getStatus(
  sub: UserSubscriptionRecord['subscription']
): 'active' | 'expired' | 'cancelled' {
  const now = Date.now() / 1000
  if (sub.status === 'cancelled') return 'cancelled'
  if (sub.status === 'active' && sub.end_time > now) return 'active'
  return 'expired'
}

function SubscriptionStatusBadge({
  sub,
}: {
  sub: UserSubscriptionRecord['subscription']
}) {
  const { t } = useTranslation()
  const status = getStatus(sub)
  if (status === 'active') {
    return <StatusBadge label={t('Active')} variant='success' copyable={false} />
  }
  if (status === 'cancelled') {
    return (
      <StatusBadge label={t('Invalidated')} variant='neutral' copyable={false} />
    )
  }
  return <StatusBadge label={t('Expired')} variant='neutral' copyable={false} />
}

function DailyUsageTooltip({
  dailyUsage,
}: {
  dailyUsage?: Record<string, number>
}) {
  const { t } = useTranslation()
  const entries = Object.entries(dailyUsage || {})
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 7)

  if (entries.length === 0) return null

  return (
    <TooltipProvider delay={100}>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type='button'
              className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs'
            />
          }
        >
          <BarChart3 className='h-3.5 w-3.5' />
          {t('Daily usage')}
        </TooltipTrigger>
        <TooltipContent className='border-border bg-popover text-popover-foreground max-w-xs border shadow-xl [&>svg]:bg-popover [&>svg]:fill-popover'>
          <div className='space-y-1 text-xs'>
            <div className='font-medium'>{t('Last 7 Days Usage')}</div>
            {entries.map(([date, value]) => (
              <div key={date} className='flex justify-between gap-4'>
                <span className='font-mono'>{date}</span>
                <span className='font-mono'>{formatLogQuota(value)}</span>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function StatStrip({ stats }: { stats: AdminUserSubscriptionStats }) {
  const { t } = useTranslation()
  const items = [
    { label: t('Total'), value: stats.total },
    { label: t('Active'), value: stats.active },
    { label: t('Expired'), value: stats.expired },
    { label: t('Invalidated'), value: stats.cancelled },
    { label: t('Expiring in 7 days'), value: stats.expiring_7d },
    { label: t('Today Usage'), value: formatLogQuota(stats.today_used) },
    { label: t('Last 7 Days Usage'), value: formatLogQuota(stats.last_7d_used) },
  ]

  return (
    <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7'>
      {items.map((item) => (
        <div
          key={item.label}
          className='bg-muted/30 rounded-md border px-3 py-2'
        >
          <div className='text-muted-foreground truncate text-xs'>
            {item.label}
          </div>
          <div className='mt-1 truncate text-sm font-semibold tabular-nums'>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  )
}

function UserSubscriptionToolbar({
  keyword,
  setKeyword,
  status,
  setStatus,
  planId,
  setPlanId,
  plans,
}: {
  keyword: string
  setKeyword: (value: string) => void
  status: string
  setStatus: (value: string) => void
  planId: string
  setPlanId: (value: string) => void
  plans: PlanRecord[]
}) {
  const { t } = useTranslation()
  return (
    <div className='flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between'>
      <div className='relative w-full lg:max-w-sm'>
        <Search className='text-muted-foreground absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2' />
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={t('Search user, email, user ID or subscription ID...')}
          className='pl-8'
        />
      </div>
      <div className='flex flex-col gap-2 sm:flex-row'>
        <Select
          value={status}
          onValueChange={(value) => setStatus(value || 'all')}
        >
          <SelectTrigger className='w-full sm:w-[160px]'>
            <SelectValue placeholder={t('Status')} />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              <SelectItem value='all'>{t('All Statuses')}</SelectItem>
              <SelectItem value='active'>{t('Active')}</SelectItem>
              <SelectItem value='expired'>{t('Expired')}</SelectItem>
              <SelectItem value='cancelled'>{t('Invalidated')}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          value={planId}
          onValueChange={(value) => setPlanId(value || 'all')}
        >
          <SelectTrigger className='w-full sm:w-[200px]'>
            <SelectValue placeholder={t('Plan')} />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              <SelectItem value='all'>{t('All Plans')}</SelectItem>
              {plans.map((record) => (
                <SelectItem key={record.plan.id} value={String(record.plan.id)}>
                  {record.plan.title || `#${record.plan.id}`}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function useOverviewColumns({
  onAdjust,
  onInvalidate,
  onDelete,
}: {
  onAdjust: (sub: UserSubscriptionRecord['subscription']) => void
  onInvalidate: (subId: number) => void
  onDelete: (subId: number) => void
}): ColumnDef<AdminUserSubscriptionRecord>[] {
  const { t } = useTranslation()

  return useMemo(
    () => [
      {
        accessorFn: (row) => row.subscription.id,
        id: 'id',
        meta: { label: 'ID', mobileHidden: true },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='ID' />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            #{row.original.subscription.id}
          </span>
        ),
        size: 70,
      },
      {
        id: 'user',
        meta: { label: t('User'), mobileTitle: true },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('User')} />
        ),
        cell: ({ row }) => {
          const user = row.original.user
          return (
            <div className='min-w-[180px]'>
              <div className='font-medium'>
                {user?.username || `#${row.original.subscription.user_id}`}
              </div>
              <div className='text-muted-foreground truncate text-xs'>
                ID: {row.original.subscription.user_id}
                {user?.email ? ` · ${user.email}` : ''}
              </div>
            </div>
          )
        },
        size: 240,
      },
      {
        id: 'plan',
        meta: { label: t('Plan') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Plan')} />
        ),
        cell: ({ row }) => (
          <div>
            <div className='font-medium'>
              {row.original.plan?.title || `#${row.original.subscription.plan_id}`}
            </div>
            <div className='text-muted-foreground text-xs'>
              {t('Source')}: {row.original.subscription.source || '-'}
            </div>
          </div>
        ),
        size: 180,
      },
      {
        id: 'status',
        meta: { label: t('Status'), mobileBadge: true },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Status')} />
        ),
        cell: ({ row }) => (
          <SubscriptionStatusBadge sub={row.original.subscription} />
        ),
        size: 100,
      },
      {
        id: 'usage',
        meta: { label: t('Subscription Usage') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Subscription Usage')} />
        ),
        cell: ({ row }) => {
          const sub = row.original.subscription
          const total = Number(sub.amount_total || 0)
          const used = Number(sub.amount_used || 0)
          return (
            <div className='min-w-[150px]'>
              <div className='font-medium'>
                {total > 0
                  ? `${formatSubscriptionQuota(used, t)} / ${formatSubscriptionQuota(total, t)}`
                  : t('Unlimited')}
              </div>
              {total > 0 && (
                <div className='text-muted-foreground text-xs'>
                  {t('Internal quota units')}: {formatInternalQuota(used)} /{' '}
                  {formatInternalQuota(total)}
                </div>
              )}
            </div>
          )
        },
        size: 200,
      },
      {
        id: 'recent_usage',
        meta: { label: t('Recent Usage'), mobileHidden: true },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Recent Usage')} />
        ),
        cell: ({ row }) => (
          <div className='space-y-1 text-xs'>
            <div>
              {t('Today')}: {formatLogQuota(row.original.today_used || 0)}
            </div>
            <div className='text-muted-foreground'>
              {t('Last 7 Days')}: {formatLogQuota(row.original.last_7d_used || 0)}
            </div>
            <DailyUsageTooltip dailyUsage={row.original.daily_usage} />
          </div>
        ),
        size: 150,
      },
      {
        id: 'expires',
        meta: { label: t('Expiry Time'), mobileHidden: true },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Expiry Time')} />
        ),
        cell: ({ row }) => {
          const days = Number(row.original.remaining_days || 0)
          return (
            <div className='text-xs'>
              <div>{formatTimestamp(row.original.subscription.end_time)}</div>
              <div className='text-muted-foreground'>
                {days > 0
                  ? t('{{count}} days left', {
                      count: Number(days.toFixed(1)),
                    })
                  : t('Expired')}
              </div>
            </div>
          )
        },
        size: 170,
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const sub = row.original.subscription
          const canInvalidate = getStatus(sub) === 'active'
          return (
            <div className='flex justify-end gap-1'>
              <Button
                size='sm'
                variant='outline'
                onClick={() => onAdjust(sub)}
              >
                <CalendarClock className='h-4 w-4' />
              </Button>
              <Button
                size='sm'
                variant='outline'
                disabled={!canInvalidate}
                onClick={() => onInvalidate(sub.id)}
              >
                <UserMinus className='h-4 w-4' />
              </Button>
              <Button
                size='sm'
                variant='destructive'
                onClick={() => onDelete(sub.id)}
              >
                <Trash2 className='h-4 w-4' />
              </Button>
            </div>
          )
        },
        size: 140,
      },
    ],
    [onAdjust, onDelete, onInvalidate, t]
  )
}

export function UserSubscriptionsOverviewTable() {
  const { t } = useTranslation()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const queryClient = useQueryClient()
  const { refreshTrigger } = useSubscriptions()
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('all')
  const [planId, setPlanId] = useState('all')
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [confirmAction, setConfirmAction] = useState<{
    type: 'invalidate' | 'delete'
    subId: number
  } | null>(null)
  const [adjustTarget, setAdjustTarget] = useState<
    UserSubscriptionRecord['subscription'] | null
  >(null)
  const [adjustDays, setAdjustDays] = useState('')
  const [adjustEndTime, setAdjustEndTime] = useState('')

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: isMobile ? 10 : 20,
  })

  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }))
  }, [keyword, status, planId])

  const { data: plansData } = useQuery({
    queryKey: ['admin-subscription-plans', 'overview-filter'],
    queryFn: getAdminPlans,
  })
  const plans = plansData?.data || []

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'admin-user-subscriptions',
      pagination.pageIndex,
      pagination.pageSize,
      keyword,
      status,
      planId,
      refreshTrigger,
    ],
    queryFn: async () => {
      const res = await getAdminUserSubscriptionOverview({
        p: pagination.pageIndex + 1,
        page_size: pagination.pageSize,
        keyword: keyword.trim() || undefined,
        status: status === 'all' ? undefined : status,
        plan_id: planId === 'all' ? undefined : Number(planId),
      })
      if (!res.success) {
        toast.error(res.message || t('Loading failed'))
        return { items: [], total: 0, stats: EMPTY_STATS }
      }
      return res.data || { items: [], total: 0, stats: EMPTY_STATS }
    },
    placeholderData: (previousData) => previousData,
  })

  const invalidateMutation = useMutation({
    mutationFn: invalidateUserSubscription,
    onSuccess: (res) => {
      if (res.success) {
        toast.success(res.data?.message || t('Has been invalidated'))
        queryClient.invalidateQueries({ queryKey: ['admin-user-subscriptions'] })
      } else {
        toast.error(res.message || t('Operation failed'))
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteUserSubscription,
    onSuccess: (res) => {
      if (res.success) {
        toast.success(t('Deleted'))
        queryClient.invalidateQueries({ queryKey: ['admin-user-subscriptions'] })
      } else {
        toast.error(res.message || t('Operation failed'))
      }
    },
  })

  const adjustMutation = useMutation({
    mutationFn: ({
      subId,
      payload,
    }: {
      subId: number
      payload: { delta_days?: number; end_time?: number }
    }) => adjustUserSubscriptionTime(subId, payload),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(res.data?.message || t('Adjusted successfully'))
        setAdjustTarget(null)
        queryClient.invalidateQueries({ queryKey: ['admin-user-subscriptions'] })
      } else {
        toast.error(res.message || t('Operation failed'))
      }
    },
  })

  const columns = useOverviewColumns({
    onAdjust: (sub) => {
      setAdjustTarget(sub)
      setAdjustDays('')
      setAdjustEndTime(formatTimestampForInput(sub.end_time || 0))
    },
    onInvalidate: (subId) => setConfirmAction({ type: 'invalidate', subId }),
    onDelete: (subId) => setConfirmAction({ type: 'delete', subId }),
  })

  const items = data?.items || []
  const total = data?.total || 0
  const stats = data?.stats || EMPTY_STATS

  const table = useReactTable({
    data: items,
    columns,
    pageCount: Math.ceil(total / pagination.pageSize),
    state: {
      pagination,
      columnVisibility,
    },
    onPaginationChange: setPagination,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  })

  const pageCount = table.getPageCount()
  useEffect(() => {
    if (pageCount > 0 && pagination.pageIndex + 1 > pageCount) {
      setPagination((prev) => ({ ...prev, pageIndex: 0 }))
    }
  }, [pageCount, pagination.pageIndex])

  const handleConfirmAction = async () => {
    if (!confirmAction) return
    if (confirmAction.type === 'invalidate') {
      await invalidateMutation.mutateAsync(confirmAction.subId)
    } else {
      await deleteMutation.mutateAsync(confirmAction.subId)
    }
    setConfirmAction(null)
  }

  const handleAdjust = async () => {
    if (!adjustTarget) return
    const trimmedDays = adjustDays.trim()
    const payload: { delta_days?: number; end_time?: number } = {}
    if (trimmedDays) {
      const days = Number(trimmedDays)
      if (!Number.isFinite(days) || !Number.isInteger(days) || days === 0) {
        toast.error(t('Please enter a non-zero integer day count'))
        return
      }
      payload.delta_days = days
    } else {
      const parsed = parseTimestampFromInput(adjustEndTime)
      if (!adjustEndTime || parsed <= 0) {
        toast.error(t('Please enter days or set an expiry time'))
        return
      }
      payload.end_time = parsed
    }
    await adjustMutation.mutateAsync({ subId: adjustTarget.id, payload })
  }

  return (
    <>
      <div className='space-y-3'>
        <StatStrip stats={stats} />
        <DataTablePage
          table={table}
          columns={columns}
          isLoading={isLoading}
          isFetching={isFetching}
          totalRows={total}
          emptyTitle={t('No subscription users found')}
          emptyDescription={t(
            'Users with subscription records will appear here.'
          )}
          skeletonKeyPrefix='user-subscriptions-overview-skeleton'
          applyHeaderSize
          toolbar={
            <UserSubscriptionToolbar
              keyword={keyword}
              setKeyword={setKeyword}
              status={status}
              setStatus={setStatus}
              planId={planId}
              setPlanId={setPlanId}
              plans={plans}
            />
          }
        />
      </div>

      {confirmAction && (
        <ConfirmDialog
          open
          onOpenChange={(v) => !v && setConfirmAction(null)}
          title={
            confirmAction.type === 'invalidate'
              ? t('Confirm invalidate')
              : t('Confirm delete')
          }
          desc={
            confirmAction.type === 'invalidate'
              ? t(
                  'After invalidating, this subscription will be immediately deactivated. Historical records are not affected. Continue?'
                )
              : t(
                  'Deleting will permanently remove this subscription record (including benefit details). Continue?'
                )
          }
          handleConfirm={handleConfirmAction}
          destructive={confirmAction.type === 'delete'}
        />
      )}

      <Dialog
        open={!!adjustTarget}
        onOpenChange={(open) => !open && setAdjustTarget(null)}
      >
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>{t('Adjust subscription time')}</DialogTitle>
            <DialogDescription>
              {t(
                'Enter positive days to extend, negative days to reduce, or set an exact expiry time.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            <div className='space-y-1.5'>
              <label className='text-sm font-medium'>
                {t('Days adjustment')}
              </label>
              <Input
                type='number'
                step={1}
                placeholder={t('Example: 3 or -2')}
                value={adjustDays}
                onChange={(e) => setAdjustDays(e.target.value)}
              />
            </div>
            <div className='space-y-1.5'>
              <label className='text-sm font-medium'>
                {t('Exact expiry time')}
              </label>
              <Input
                type='datetime-local'
                value={adjustEndTime}
                onChange={(e) => setAdjustEndTime(e.target.value)}
                disabled={adjustDays.trim() !== ''}
              />
              <p className='text-muted-foreground flex items-center gap-1 text-xs'>
                <Clock className='h-3.5 w-3.5' />
                {t(
                  'Exact expiry time is used only when days adjustment is empty.'
                )}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setAdjustTarget(null)}
              disabled={adjustMutation.isPending}
            >
              {t('Cancel')}
            </Button>
            <Button onClick={handleAdjust} disabled={adjustMutation.isPending}>
              {adjustMutation.isPending ? t('Submitting...') : t('Confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
