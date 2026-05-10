import { type ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { formatQuota, formatTimestamp } from '@/lib/format'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DataTableColumnHeader } from '@/components/data-table'
import { GroupBadge } from '@/components/group-badge'
import { LongText } from '@/components/long-text'
import { StatusBadge, dotColorMap } from '@/components/status-badge'
import { USER_STATUSES, USER_ROLES, isUserDeleted } from '../constants'
import { type User, type UserActiveSubscription } from '../types'
import { DataTableRowActions } from './data-table-row-actions'

function getSubscriptionPeriodLabel(
  subscription: UserActiveSubscription,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  switch (subscription.quota_reset_period) {
    case 'daily':
      return t('Daily')
    case 'weekly':
      return t('Weekly')
    case 'monthly':
      return t('Monthly')
    case 'custom':
      return t('Custom')
    default:
      return t('Subscription')
  }
}

function renderSubscriptionQuota(
  subscription: UserActiveSubscription,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  if (subscription.amount_total <= 0) {
    return t('Unlimited')
  }
  return `${formatQuota(subscription.remaining_quota)} / ${formatQuota(subscription.amount_total)}`
}

export function useUsersColumns(): ColumnDef<User>[] {
  const { t } = useTranslation()
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label='Select all'
          className='translate-y-[2px]'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label='Select row'
          className='translate-y-[2px]'
        />
      ),
      enableSorting: false,
      enableHiding: false,
      meta: { label: t('Select') },
    },
    {
      accessorKey: 'id',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='ID' />
      ),
      cell: ({ row }) => {
        return <div className='w-[60px]'>{row.getValue('id')}</div>
      },
      meta: { label: t('ID'), mobileHidden: true },
    },
    {
      accessorKey: 'username',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Username')} />
      ),
      cell: ({ row }) => {
        const username = row.getValue('username') as string
        const displayName = row.original.display_name
        const remark = row.original.remark

        return (
          <div className='flex min-w-[160px] flex-col gap-1'>
            <div className='flex items-center gap-2'>
              <LongText className='max-w-[140px] font-medium'>
                {username}
              </LongText>
              {remark && (
                <Tooltip>
                  <TooltipTrigger
                    render={<StatusBadge variant='success' copyable={false} />}
                  >
                    <LongText className='max-w-[80px]'>{remark}</LongText>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className='text-xs'>{remark}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            {displayName && displayName !== username && (
              <LongText className='text-muted-foreground max-w-[180px] text-xs'>
                {displayName}
              </LongText>
            )}
          </div>
        )
      },
      enableHiding: false,
      meta: { label: t('Username'), mobileTitle: true },
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Status')} />
      ),
      cell: ({ row }) => {
        const user = row.original
        const requestCount = user.request_count

        const statusConfig = isUserDeleted(user)
          ? USER_STATUSES.DELETED
          : USER_STATUSES[user.status as keyof typeof USER_STATUSES]

        if (!statusConfig) {
          return null
        }

        return (
          <Tooltip>
            <TooltipTrigger render={<div className='cursor-help' />}>
              <StatusBadge
                label={t(statusConfig.labelKey)}
                variant={statusConfig.variant}
                showDot={statusConfig.showDot}
                copyable={false}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p className='text-xs'>
                {t('Requests:')} {requestCount.toLocaleString()}
              </p>
            </TooltipContent>
          </Tooltip>
        )
      },
      filterFn: (row, id, value) => {
        return value.includes(String(row.getValue(id)))
      },
      enableSorting: false,
      meta: { label: t('Status'), mobileBadge: true },
    },
    {
      id: 'subscription_balance',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Subscription Balance')}
        />
      ),
      cell: ({ row }) => {
        const subscriptions = row.original.active_subscriptions || []

        if (subscriptions.length === 0) {
          return (
            <StatusBadge
              label={t('No Active Subscription')}
              variant='neutral'
              copyable={false}
            />
          )
        }

        return (
          <div className='min-w-[240px] space-y-2'>
            {subscriptions.map((subscription) => (
              <Tooltip key={subscription.subscription_id}>
                <TooltipTrigger
                  render={
                    <div className='hover:bg-muted/40 cursor-help rounded-md border px-2.5 py-2 transition-colors' />
                  }
                >
                  <div className='flex items-start justify-between gap-3'>
                    <div className='min-w-0'>
                      <div className='text-sm font-medium'>
                        {getSubscriptionPeriodLabel(subscription, t)}
                      </div>
                      {subscription.plan_title && (
                        <div className='text-muted-foreground truncate text-xs'>
                          {subscription.plan_title}
                        </div>
                      )}
                    </div>
                    <div className='text-right text-sm font-medium tabular-nums'>
                      {renderSubscriptionQuota(subscription, t)}
                    </div>
                  </div>
                  <div className='text-muted-foreground mt-1.5 space-y-1 text-xs'>
                    <div>
                      {t('Next reset')}:{' '}
                      {subscription.next_reset_time
                        ? formatTimestamp(subscription.next_reset_time)
                        : t('No Reset')}
                    </div>
                    <div>
                      {t('Expiry Time')}:{' '}
                      {formatTimestamp(subscription.end_time)}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className='space-y-1 text-xs'>
                    <div>
                      {t('Plan')}: {subscription.plan_title || `#${subscription.plan_id}`}
                    </div>
                    <div>
                      {t('Used:')} {formatQuota(subscription.amount_used)}
                    </div>
                    <div>
                      {t('Remaining:')}{' '}
                      {subscription.amount_total > 0
                        ? formatQuota(subscription.remaining_quota)
                        : t('Unlimited')}
                    </div>
                    <div>
                      {t('Total:')}{' '}
                      {subscription.amount_total > 0
                        ? formatQuota(subscription.amount_total)
                        : t('Unlimited')}
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        )
      },
      enableSorting: false,
      meta: { label: t('Subscription Balance') },
    },
    {
      id: 'balance',
      accessorKey: 'quota',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Balance')} />
      ),
      cell: ({ row }) => {
        const user = row.original
        const used = user.used_quota
        const remaining = user.quota

        if (remaining === 0 && used === 0) {
          return (
            <StatusBadge
              label={t('No Quota')}
              variant='neutral'
              copyable={false}
            />
          )
        }

        return (
          <Tooltip>
            <TooltipTrigger
              render={<div className='w-[170px] cursor-help space-y-1' />}
            >
              <div className='space-y-1'>
                <div className='text-sm font-medium tabular-nums'>
                  {formatQuota(remaining)}
                </div>
                <div className='text-muted-foreground text-xs'>
                  {t('Used:')} {formatQuota(used)}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className='space-y-1 text-xs'>
                <div>
                  {t('Balance')}: {formatQuota(remaining)}
                </div>
                <div>
                  {t('Used:')} {formatQuota(used)}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        )
      },
      meta: { label: t('Balance') },
    },
    {
      accessorKey: 'group',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Group')} />
      ),
      cell: ({ row }) => {
        const group = row.getValue('group') as string
        return <GroupBadge group={group} />
      },
      filterFn: (row, id, value) => {
        const group = String(row.getValue(id) || t('User Group')).toLowerCase()
        const searchValue = String(value).toLowerCase()
        return group.includes(searchValue)
      },
      meta: { label: t('Group') },
    },
    {
      accessorKey: 'role',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Role')} />
      ),
      cell: ({ row }) => {
        const roleValue = row.getValue('role') as number
        const roleConfig = USER_ROLES[roleValue as keyof typeof USER_ROLES]

        if (!roleConfig) {
          return null
        }

        return (
          <div className='flex items-center gap-x-2'>
            {roleConfig.icon && (
              <roleConfig.icon size={16} className='text-muted-foreground' />
            )}
            <span className='text-sm'>{t(roleConfig.labelKey)}</span>
          </div>
        )
      },
      filterFn: (row, id, value) => {
        return value.includes(String(row.getValue(id)))
      },
      enableSorting: false,
      meta: { label: t('Role') },
    },
    {
      id: 'invite_info',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Invite Info')} />
      ),
      cell: ({ row }) => {
        const user = row.original
        const affCount = user.aff_count || 0
        const affHistoryQuota = user.aff_history_quota || 0
        const inviterId = user.inviter_id || 0

        return (
          <div className='flex items-center gap-1.5 text-xs font-medium'>
            <span
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                dotColorMap.neutral
              )}
              aria-hidden='true'
            />
            <Tooltip>
              <TooltipTrigger
                render={<span className='text-muted-foreground cursor-help' />}
              >
                {t('Invited')}: {affCount}
              </TooltipTrigger>
              <TooltipContent>
                <p className='text-xs'>{t('Number of users invited')}</p>
              </TooltipContent>
            </Tooltip>
            <span className='text-muted-foreground/30'>·</span>
            <Tooltip>
              <TooltipTrigger
                render={<span className='text-muted-foreground cursor-help' />}
              >
                {t('Revenue')}: {formatQuota(affHistoryQuota)}
              </TooltipTrigger>
              <TooltipContent>
                <p className='text-xs'>{t('Total invitation revenue')}</p>
              </TooltipContent>
            </Tooltip>
            {inviterId > 0 && (
              <>
                <span className='text-muted-foreground/30'>·</span>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className='text-muted-foreground cursor-help' />
                    }
                  >
                    {t('Inviter')}: {inviterId}
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className='text-xs'>
                      {t('Invited by user ID')} {inviterId}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </>
            )}
            {inviterId === 0 && (
              <>
                <span className='text-muted-foreground/30'>·</span>
                <span className='text-muted-foreground'>{t('No Inviter')}</span>
              </>
            )}
          </div>
        )
      },
      enableSorting: false,
      meta: { label: t('Invite Info'), mobileHidden: true },
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Created At')} />
      ),
      cell: ({ row }) => {
        const ts = row.getValue('created_at') as number | undefined
        return (
          <span className='text-muted-foreground text-sm'>
            {ts ? formatTimestamp(ts) : '-'}
          </span>
        )
      },
      meta: { label: t('Created At'), mobileHidden: true },
    },
    {
      accessorKey: 'last_login_at',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Last Login')} />
      ),
      cell: ({ row }) => {
        const ts = row.getValue('last_login_at') as number | undefined
        return (
          <span className='text-muted-foreground text-sm'>
            {ts ? formatTimestamp(ts) : '-'}
          </span>
        )
      },
      meta: { label: t('Last Login'), mobileHidden: true },
    },
    {
      id: 'actions',
      cell: ({ row }) => <DataTableRowActions row={row} />,
      meta: { label: t('Actions') },
    },
  ]
}
