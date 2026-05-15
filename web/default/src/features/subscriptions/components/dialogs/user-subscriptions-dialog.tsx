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
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { StatusBadge } from '@/components/status-badge'
import {
  getAdminPlans,
  getUserSubscriptions,
  createUserSubscription,
  invalidateUserSubscription,
  adjustUserSubscriptionTime,
  deleteUserSubscription,
} from '../../api'
import { formatTimestamp } from '../../lib'
import {
  formatTimestampForInput,
  parseTimestampFromInput,
} from '@/lib/format'
import {
  formatInternalQuota,
  formatSubscriptionPrice,
  formatSubscriptionQuota,
} from '../../lib'
import type { PlanRecord, UserSubscriptionRecord } from '../../types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: { id: number; username?: string } | null
  onSuccess?: () => void
}

function SubscriptionStatusBadge(props: {
  sub: UserSubscriptionRecord['subscription']
  t: (key: string) => string
}) {
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now() / 1000
  const isExpired = (props.sub.end_time || 0) > 0 && props.sub.end_time < now
  const isActive = props.sub.status === 'active' && !isExpired
  if (isActive)
    return (
      <StatusBadge
        label={props.t('Active')}
        variant='success'
        copyable={false}
      />
    )
  if (props.sub.status === 'cancelled')
    return (
      <StatusBadge
        label={props.t('Invalidated')}
        variant='neutral'
        copyable={false}
      />
    )
  return (
    <StatusBadge
      label={props.t('Expired')}
      variant='neutral'
      copyable={false}
    />
  )
}

export function UserSubscriptionsDialog(props: Props) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [plans, setPlans] = useState<PlanRecord[]>([])
  const [subs, setSubs] = useState<UserSubscriptionRecord[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<string>('')
  const [confirmAction, setConfirmAction] = useState<{
    type: 'invalidate' | 'delete'
    subId: number
  } | null>(null)
  const [adjustTarget, setAdjustTarget] = useState<
    UserSubscriptionRecord['subscription'] | null
  >(null)
  const [adjustDays, setAdjustDays] = useState('')
  const [adjustEndTime, setAdjustEndTime] = useState('')
  const [adjusting, setAdjusting] = useState(false)

  const planTitleMap = useMemo(() => {
    const map = new Map<number, string>()
    plans.forEach((p) => {
      if (p.plan.id) map.set(p.plan.id, p.plan.title || `#${p.plan.id}`)
    })
    return map
  }, [plans])

  const loadData = useCallback(async () => {
    if (!props.user?.id) return
    setLoading(true)
    try {
      const [plansRes, subsRes] = await Promise.all([
        getAdminPlans(),
        getUserSubscriptions(props.user.id),
      ])
      if (plansRes.success) setPlans(plansRes.data || [])
      if (subsRes.success) setSubs(subsRes.data || [])
    } catch {
      toast.error(t('Loading failed'))
    } finally {
      setLoading(false)
    }
  }, [props.user?.id, t])

  useEffect(() => {
    if (props.open && props.user?.id) {
      setSelectedPlanId('')
      loadData()
    }
  }, [props.open, props.user?.id, loadData])

  const handleCreate = async () => {
    if (!props.user?.id || !selectedPlanId) {
      toast.error(t('Please select a subscription plan'))
      return
    }
    setCreating(true)
    try {
      const res = await createUserSubscription(props.user.id, {
        plan_id: Number(selectedPlanId),
      })
      if (res.success) {
        toast.success(res.data?.message || t('Added successfully'))
        setSelectedPlanId('')
        await loadData()
        props.onSuccess?.()
      }
    } catch {
      toast.error(t('Request failed'))
    } finally {
      setCreating(false)
    }
  }

  const handleConfirmAction = async () => {
    if (!confirmAction) return
    try {
      if (confirmAction.type === 'invalidate') {
        const res = await invalidateUserSubscription(confirmAction.subId)
        if (res.success) {
          toast.success(res.data?.message || t('Has been invalidated'))
          await loadData()
          props.onSuccess?.()
        }
      } else {
        const res = await deleteUserSubscription(confirmAction.subId)
        if (res.success) {
          toast.success(t('Deleted'))
          await loadData()
          props.onSuccess?.()
        }
      }
    } catch {
      toast.error(t('Operation failed'))
    } finally {
      setConfirmAction(null)
    }
  }

  const openAdjustDialog = (sub: UserSubscriptionRecord['subscription']) => {
    setAdjustTarget(sub)
    setAdjustDays('')
    setAdjustEndTime(formatTimestampForInput(sub.end_time || 0))
  }

  const closeAdjustDialog = () => {
    setAdjustTarget(null)
    setAdjustDays('')
    setAdjustEndTime('')
  }

  const handleAdjustTime = async () => {
    if (!adjustTarget) return
    const trimmedDays = adjustDays.trim()
    const payload: { delta_days?: number; end_time?: number } = {}
    if (trimmedDays !== '') {
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
      if (parsed === adjustTarget.end_time) {
        toast.error(t('Please enter days or change the expiry time'))
        return
      }
      payload.end_time = parsed
    }
    setAdjusting(true)
    try {
      const res = await adjustUserSubscriptionTime(adjustTarget.id, payload)
      if (res.success) {
        toast.success(res.data?.message || t('Adjusted successfully'))
        closeAdjustDialog()
        await loadData()
        props.onSuccess?.()
      }
    } catch {
      toast.error(t('Operation failed'))
    } finally {
      setAdjusting(false)
    }
  }

  return (
    <>
      <Sheet open={props.open} onOpenChange={props.onOpenChange}>
        <SheetContent className='overflow-y-auto sm:max-w-2xl'>
          <SheetHeader>
            <SheetTitle>{t('User Subscription Management')}</SheetTitle>
            <SheetDescription>
              {props.user?.username || '-'} (ID: {props.user?.id || '-'})
            </SheetDescription>
          </SheetHeader>

          <div className='mt-4 space-y-4'>
            <div className='flex gap-2'>
              <Select
                items={[
                  ...plans.map((p) => ({
                    value: String(p.plan.id),
                    label: (
                      <>
                        {p.plan.title}(
                        {formatSubscriptionPrice(p.plan.price_amount)})
                      </>
                    ),
                  })),
                ]}
                value={selectedPlanId}
                onValueChange={(v) => v !== null && setSelectedPlanId(v)}
              >
                <SelectTrigger className='flex-1'>
                  <SelectValue placeholder={t('Select subscription plan')} />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {plans.map((p) => (
                      <SelectItem key={p.plan.id} value={String(p.plan.id)}>
                        {p.plan.title} (
                        {formatSubscriptionPrice(p.plan.price_amount)})
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                onClick={handleCreate}
                disabled={creating || !selectedPlanId}
              >
                <Plus className='mr-1 h-4 w-4' />
                {t('Add subscription')}
              </Button>
            </div>

            <div className='rounded-md border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>{t('Plan')}</TableHead>
                    <TableHead>{t('Status')}</TableHead>
                    <TableHead>{t('Validity')}</TableHead>
                    <TableHead>{t('Total Quota')}</TableHead>
                    <TableHead className='text-right'>{t('Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className='py-8 text-center'>
                        {t('Loading...')}
                      </TableCell>
                    </TableRow>
                  ) : subs.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className='text-muted-foreground py-8 text-center'
                      >
                        {t('No subscription records')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    subs.map((record) => {
                      const sub = record.subscription
                      const now = Date.now() / 1000
                      const isExpired =
                        (sub.end_time || 0) > 0 && sub.end_time < now
                      const isActive = sub.status === 'active' && !isExpired
                      const total = Number(sub.amount_total || 0)
                      const used = Number(sub.amount_used || 0)

                      return (
                        <TableRow key={sub.id}>
                          <TableCell>#{sub.id}</TableCell>
                          <TableCell>
                            <div>
                              <div className='font-medium'>
                                {planTitleMap.get(sub.plan_id) ||
                                  `#${sub.plan_id}`}
                              </div>
                              <div className='text-muted-foreground text-xs'>
                                {t('Source')}: {sub.source || '-'}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <SubscriptionStatusBadge sub={sub} t={t} />
                          </TableCell>
                          <TableCell>
                            <div className='text-xs'>
                              <div>
                                {t('Start')}: {formatTimestamp(sub.start_time)}
                              </div>
                              <div>
                                {t('End')}: {formatTimestamp(sub.end_time)}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {total > 0 ? (
                              <div className='text-xs'>
                                <div>
                                  {formatSubscriptionQuota(used, t)} /{' '}
                                  {formatSubscriptionQuota(total, t)}
                                </div>
                                <div className='text-muted-foreground'>
                                  {t('Internal quota units')}:{' '}
                                  {formatInternalQuota(used)} /{' '}
                                  {formatInternalQuota(total)}
                                </div>
                              </div>
                            ) : (
                              t('Unlimited')
                            )}
                          </TableCell>
                          <TableCell className='text-right'>
                            <div className='flex flex-wrap justify-end gap-1'>
                              <Button
                                size='sm'
                                variant='outline'
                                onClick={() => openAdjustDialog(sub)}
                              >
                                <CalendarClock className='mr-1 h-4 w-4' />
                                {t('Adjust')}
                              </Button>
                              <Button
                                size='sm'
                                variant='outline'
                                disabled={!isActive}
                                onClick={() =>
                                  setConfirmAction({
                                    type: 'invalidate',
                                    subId: sub.id,
                                  })
                                }
                              >
                                {t('Invalidate')}
                              </Button>
                              <Button
                                size='sm'
                                variant='destructive'
                                onClick={() =>
                                  setConfirmAction({
                                    type: 'delete',
                                    subId: sub.id,
                                  })
                                }
                              >
                                {t('Delete')}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </SheetContent>
      </Sheet>

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
        onOpenChange={(v) => !v && closeAdjustDialog()}
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
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Exact expiry time is used only when days adjustment is empty.'
                )}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={closeAdjustDialog}
              disabled={adjusting}
            >
              {t('Cancel')}
            </Button>
            <Button onClick={handleAdjustTime} disabled={adjusting}>
              {adjusting ? t('Submitting...') : t('Confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
