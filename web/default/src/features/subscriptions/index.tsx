import { Info } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SectionPageLayout } from '@/components/layout'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SubscriptionsDialogs } from './components/subscriptions-dialogs'
import { SubscriptionsPrimaryButtons } from './components/subscriptions-primary-buttons'
import { SubscriptionsProvider } from './components/subscriptions-provider'
import { SubscriptionsTable } from './components/subscriptions-table'
import { UserSubscriptionsOverviewTable } from './components/user-subscriptions-overview-table'

export function Subscriptions() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('plans')
  return (
    <SubscriptionsProvider>
      <SectionPageLayout>
        <SectionPageLayout.Title>
          {t('Subscription Management')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Description>
          {t('Manage subscription plan creation, pricing and status')}
        </SectionPageLayout.Description>
        <SectionPageLayout.Actions>
          <div className='flex items-center gap-2'>
            <Alert variant='default' className='hidden px-3 py-2 sm:flex'>
              <Info className='h-4 w-4' />
              <AlertDescription className='text-xs'>
                {t(
                  'Stripe/Creem requires creating products on the third-party platform and entering the ID'
                )}
              </AlertDescription>
            </Alert>
            <SubscriptionsPrimaryButtons />
          </div>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <div className='space-y-3'>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className='h-auto max-w-full flex-wrap justify-start'>
                <TabsTrigger value='plans'>{t('Plans')}</TabsTrigger>
                <TabsTrigger value='users'>
                  {t('User Subscriptions')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {activeTab === 'plans' ? (
              <SubscriptionsTable />
            ) : (
              <UserSubscriptionsOverviewTable />
            )}
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <SubscriptionsDialogs />
    </SubscriptionsProvider>
  )
}
