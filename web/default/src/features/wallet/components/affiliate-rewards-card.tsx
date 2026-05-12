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
import { Share2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatQuota } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { CopyButton } from '@/components/copy-button'
import type { UserWalletData } from '../types'

interface AffiliateRewardsCardProps {
  user: UserWalletData | null
  affiliateLink: string
  onTransfer: () => void
  loading?: boolean
}

export function AffiliateRewardsCard({
  user,
  affiliateLink,
  onTransfer,
  loading,
}: AffiliateRewardsCardProps) {
  const { t } = useTranslation()
  if (loading) {
    return (
      <Card className='bg-muted/20 py-0'>
        <CardContent className='space-y-4 p-3 sm:p-4'>
          <div>
            <Skeleton className='h-5 w-32' />
            <Skeleton className='mt-2 h-4 w-48' />
          </div>
          <Skeleton className='h-14 rounded-lg' />
          <Skeleton className='h-10 rounded-lg' />
        </CardContent>
      </Card>
    )
  }

  const hasRewards = (user?.aff_quota ?? 0) > 0
  const hasAffiliateLink = affiliateLink.trim().length > 0

  return (
    <Card className='bg-muted/20 py-0'>
      <CardContent className='space-y-4 p-3 sm:p-4'>
        <div className='flex min-w-0 items-center gap-2.5'>
          <div className='bg-background flex size-8 shrink-0 items-center justify-center rounded-lg border'>
            <Share2 className='text-muted-foreground size-4' />
          </div>
          <div className='min-w-0'>
            <h3 className='truncate text-sm font-semibold'>
              {t('Referral Program')}
            </h3>
            <p className='text-muted-foreground line-clamp-1 text-xs'>
              {t(
                'Earn rewards when your referrals add funds. Transfer accumulated rewards to your balance anytime.'
              )}
            </p>
          </div>
        </div>

        <div className='grid grid-cols-3 gap-2 rounded-xl border bg-background/60 p-3 text-center'>
          {[
            [t('Pending'), formatQuota(user?.aff_quota ?? 0)],
            [t('Total Earned'), formatQuota(user?.aff_history_quota ?? 0)],
            [t('Invites'), String(user?.aff_count ?? 0)],
          ].map(([label, value]) => (
            <div key={label}>
              <div className='text-muted-foreground truncate text-[10px] font-medium tracking-wider uppercase'>
                {label}
              </div>
              <div className='mt-0.5 truncate text-sm font-semibold tabular-nums'>
                {value}
              </div>
            </div>
          ))}
        </div>

        <div className='space-y-2'>
          <Label className='text-muted-foreground text-[11px] font-medium tracking-wider uppercase'>
            {t('Your Referral Link')}
          </Label>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
            <Input
              value={affiliateLink}
              readOnly
              placeholder={
                hasAffiliateLink
                  ? undefined
                  : t('Referral link will appear here')
              }
              className='border-muted bg-background/70 h-9 min-w-0 flex-1 font-mono text-xs'
            />
            <div className='flex items-center gap-2'>
              <CopyButton
                value={affiliateLink}
                variant='outline'
                className='bg-background size-9 shrink-0'
                iconClassName='size-4'
                tooltip={t('Copy referral link')}
                aria-label={t('Copy referral link')}
                disabled={!hasAffiliateLink}
              />
              {hasRewards && (
                <Button
                  onClick={onTransfer}
                  className='h-9 flex-1 px-3 sm:flex-none'
                  size='sm'
                >
                  {t('Transfer to Balance')}
                </Button>
              )}
            </div>
          </div>
          {!hasAffiliateLink && (
            <p className='text-muted-foreground text-xs'>
              {t(
                'The invitation link will be available after the system generates your affiliate code.'
              )}
            </p>
          )}
          {hasAffiliateLink && !hasRewards && (
            <p className='text-muted-foreground text-xs'>
              {t('Share this link with friends. Rewards will appear here after they recharge.')}
            </p>
          )}
        </div>
        {hasRewards && (
          <div className='rounded-xl border bg-background/60 p-3'>
            <div className='mb-2 text-xs font-medium'>
              {t('Available referral rewards')}
            </div>
            <div className='text-lg font-semibold tabular-nums'>
              {formatQuota(user?.aff_quota ?? 0)}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
