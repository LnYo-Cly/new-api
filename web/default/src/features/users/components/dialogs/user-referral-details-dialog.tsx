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
import { useEffect, useState } from 'react'
import { Loader2, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatTimestamp } from '@/lib/format'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { getUserReferralDetails } from '../../api'
import type { UserReferralDetails } from '../../types'

interface UserReferralDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: number
  username: string
}

function DetailTimeItem({
  label,
  value,
}: {
  label: string
  value?: number
}) {
  return (
    <div className='space-y-1'>
      <div className='text-muted-foreground text-[11px]'>{label}</div>
      <div className='text-xs font-medium'>{value ? formatTimestamp(value) : '-'}</div>
    </div>
  )
}

export function UserReferralDetailsDialog({
  open,
  onOpenChange,
  userId,
  username,
}: UserReferralDetailsDialogProps) {
  const { t } = useTranslation()
  const [data, setData] = useState<UserReferralDetails | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    let mounted = true
    setData(null)
    const run = async () => {
      setLoading(true)
      try {
        const result = await getUserReferralDetails(userId)
        if (!mounted) {
          return
        }
        if (result.success) {
          setData(result.data || null)
        } else {
          setData(null)
          toast.error(result.message || t('Failed to fetch referral details'))
        }
      } catch (_error) {
        if (mounted) {
          setData(null)
          toast.error(t('Failed to fetch referral details'))
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void run()
    return () => {
      mounted = false
    }
  }, [open, t, userId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>{t('Referral Details')}</DialogTitle>
          <DialogDescription>
            {t('View inviter information and the users invited by {{username}}.', {
              username,
            })}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className='flex items-center justify-center py-10'>
            <Loader2 className='text-muted-foreground size-5 animate-spin' />
          </div>
        ) : (
          <div className='space-y-4'>
            <div className='grid gap-3 sm:grid-cols-2'>
              <div className='rounded-xl border bg-background p-3'>
                <div className='text-muted-foreground text-xs'>
                  {t('Inviter')}
                </div>
                <div className='mt-1 text-sm font-semibold'>
                  {data?.inviter_name || t('No Inviter')}
                </div>
              </div>
              <div className='rounded-xl border bg-background p-3'>
                <div className='text-muted-foreground text-xs'>
                  {t('Invited Users')}
                </div>
                <div className='mt-1 text-sm font-semibold'>
                  {data?.invitees.length || 0}
                </div>
              </div>
            </div>

            <div className='rounded-xl border'>
              <div className='border-b px-4 py-3 text-sm font-medium'>
                {t('Invited Users')}
              </div>
              <ScrollArea className='max-h-[420px]'>
                <div className='divide-y'>
                  {(data?.invitees.length || 0) > 0 ? (
                    data?.invitees.map((invitee) => (
                      <div
                        key={invitee.id}
                        className='flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between'
                      >
                        <div className='min-w-0'>
                          <div className='flex items-center gap-2'>
                            <UserRound className='text-muted-foreground size-4 shrink-0' />
                            <div className='truncate text-sm font-medium'>
                              {invitee.display_name || invitee.username}
                            </div>
                          </div>
                          <div className='text-muted-foreground mt-1 truncate text-xs'>
                            @{invitee.username}
                            {invitee.email ? ` · ${invitee.email}` : ''}
                          </div>
                        </div>
                        <div className='grid grid-cols-2 gap-3 sm:min-w-[280px]'>
                          <DetailTimeItem
                            label={t('Created At')}
                            value={invitee.created_at}
                          />
                          <DetailTimeItem
                            label={t('Last Login')}
                            value={invitee.last_login_at}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className='text-muted-foreground px-4 py-8 text-center text-sm'>
                      {t('No invited users yet')}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
