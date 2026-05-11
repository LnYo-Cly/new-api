import { Link } from '@tanstack/react-router'
import { BarChart3, Share2, Users } from 'lucide-react'
import { useMemo } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SectionPageLayout } from '@/components/layout'
import { UsersDeleteDialog } from './components/users-delete-dialog'
import { UsersMutateDrawer } from './components/users-mutate-drawer'
import { UsersProvider, useUsers } from './components/users-provider'
import { UsersTable } from './components/users-table'

const referralsRoute = getRouteApi('/_authenticated/users/referrals')

function ReferralsContent() {
  const { t } = useTranslation()
  const { open, setOpen, currentRow } = useUsers()
  const search = referralsRoute.useSearch()
  const navigate = referralsRoute.useNavigate()

  const initialColumnVisibility = useMemo(
    () => ({
      subscription_balance: false,
      balance: false,
      total_usage: false,
      created_at: false,
      last_login_at: false,
    }),
    []
  )

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Referral Management')}</SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <Button variant='outline' render={<Link to='/users' />}>
            {t('Back to Users')}
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <div className='space-y-4'>
            <div className='grid gap-4 lg:grid-cols-3'>
              <Card>
                <CardHeader className='pb-3'>
                  <CardTitle className='flex items-center gap-2 text-base'>
                    <Share2 className='size-4' />
                    {t('Referral overview')}
                  </CardTitle>
                </CardHeader>
                <CardContent className='text-muted-foreground text-sm'>
                  {t('This page focuses on invitation relationships, referral revenue, and inviter information for each user.')}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className='pb-3'>
                  <CardTitle className='flex items-center gap-2 text-base'>
                    <Users className='size-4' />
                    {t('Key fields')}
                  </CardTitle>
                </CardHeader>
                <CardContent className='text-muted-foreground text-sm'>
                  {t('Use the Invite Info column to review invitation count, referral revenue, and each user’s inviter ID.')}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className='pb-3'>
                  <CardTitle className='flex items-center gap-2 text-base'>
                    <BarChart3 className='size-4' />
                    {t('Recommended workflow')}
                  </CardTitle>
                </CardHeader>
                <CardContent className='text-muted-foreground text-sm'>
                  {t('Search by username or email, then inspect the user row actions when you need more detail or manual adjustments.')}
                </CardContent>
              </Card>
            </div>

            <UsersTable
              search={search}
              navigate={navigate}
              initialColumnVisibility={initialColumnVisibility}
              searchPlaceholder={t('Filter referral users by username, name or email...')}
            />
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <UsersMutateDrawer
        open={open === 'create' || open === 'update'}
        onOpenChange={(isOpen) => !isOpen && setOpen(null)}
        currentRow={open === 'update' ? currentRow || undefined : undefined}
      />
      <UsersDeleteDialog />
    </>
  )
}

export function UserReferrals() {
  return (
    <UsersProvider>
      <ReferralsContent />
    </UsersProvider>
  )
}
