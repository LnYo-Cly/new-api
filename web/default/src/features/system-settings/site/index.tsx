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
import { useMemo } from 'react'
import { useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { getOptionValue, useSystemOptions } from '../hooks/use-system-options'
import type { SiteSettings } from '../types'
import {
  SITE_DEFAULT_SECTION,
  getSiteSectionContent,
} from './section-registry.tsx'

const defaultSiteSettings: SiteSettings = {
  'theme.frontend': 'default',
  Notice: '',
  'console_setting.announcements': '[]',
  'console_setting.announcements_enabled': true,
  SystemName: 'New API',
  Logo: '',
  Footer: '',
  About: '',
  HomePageContent: '',
  ServerAddress: '',
  'legal.user_agreement': '',
  'legal.privacy_policy': '',
  HeaderNavModules: '',
  SidebarModulesAdmin: '',
}

export function SiteSettings() {
  const { t } = useTranslation()
  const { data, isLoading } = useSystemOptions()
  const params = useParams({
    from: '/_authenticated/system-settings/site/$section',
  })

  const settings = useMemo(() => {
    const resolved = getOptionValue(data?.data, defaultSiteSettings)
    const optionMap = new Map(
      (data?.data ?? []).map((item) => [item.key, item.value])
    )

    if (!optionMap.has('console_setting.announcements')) {
      const legacy = optionMap.get('Announcements')
      if (legacy !== undefined) {
        resolved['console_setting.announcements'] = legacy
      }
    }

    if (!optionMap.has('console_setting.announcements_enabled')) {
      resolved['console_setting.announcements_enabled'] = true
    }

    return resolved
  }, [data?.data])

  if (isLoading) {
    return (
      <div className='flex items-center justify-center py-12'>
        <div className='text-muted-foreground'>{t('Loading settings...')}</div>
      </div>
    )
  }

  const activeSection = (params?.section ?? SITE_DEFAULT_SECTION) as
    | 'system-info'
    | 'notice'
    | 'header-navigation'
    | 'sidebar-modules'

  const sectionContent = getSiteSectionContent(activeSection, settings)

  return (
    <div className='flex h-full w-full flex-1 flex-col'>
      <div className='faded-bottom h-full w-full overflow-y-auto scroll-smooth pe-4 pb-12'>
        <div className='space-y-4'>{sectionContent}</div>
      </div>
    </div>
  )
}
