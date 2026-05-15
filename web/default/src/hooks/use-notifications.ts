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
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth-store'
import { useNotificationStore } from '@/stores/notification-store'
import type { AnnouncementItem } from '@/lib/announcement-utils'
import { getAnnouncementKey } from '@/lib/announcement-utils'
import { getNotice } from '@/lib/api'
import { useStatus } from '@/hooks/use-status'

/**
 * Hook to manage notifications (Notice + Announcements)
 * Provides unread counts and read status management
 */
export function useNotifications() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'notice' | 'announcements'>(
    'notice'
  )
  const user = useAuthStore((state) => state.auth.user)

  // Fetch Notice from API
  const {
    data: noticeResponse,
    isLoading: noticeLoading,
    refetch: refetchNotice,
  } = useQuery({
    queryKey: ['notice'],
    queryFn: getNotice,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  // Fetch Announcements from status
  const { status, loading: statusLoading } = useStatus()
  const announcementsEnabled = status?.announcements_enabled ?? false
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const announcements: AnnouncementItem[] = announcementsEnabled
    ? ((status?.announcements || []) as AnnouncementItem[]).slice(0, 20)
    : []

  // Notification store
  const {
    lastReadNotice,
    markNoticeRead,
    markAnnouncementsRead,
    dismissGlobalAnnouncement,
    isAnnouncementRead,
    isGlobalAnnouncementDismissed,
    isNoticeClosed,
    setClosedUntilDate,
  } = useNotificationStore()

  // Extract notice content
  const noticeContent = noticeResponse?.success
    ? (noticeResponse.data || '').trim()
    : ''

  // Calculate unread counts
  const unreadCounts = useMemo(() => {
    const noticeUnread =
      noticeContent && noticeContent !== lastReadNotice ? 1 : 0

    const announcementsUnread = announcements.filter((item) => {
      const key = getAnnouncementKey(item)
      return !isAnnouncementRead(key)
    }).length

    return {
      notice: noticeUnread,
      announcements: announcementsUnread,
      total: noticeUnread + announcementsUnread,
    }
  }, [noticeContent, lastReadNotice, announcements, isAnnouncementRead])

  // Handle dialog open
  const handleOpenDialog = (tab?: 'notice' | 'announcements') => {
    // Mark Notice as read when opening dialog
    if (noticeContent) {
      markNoticeRead(noticeContent)
    }

    setActiveTab(tab || 'notice')
    setDialogOpen(true)
  }

  // Handle tab change - mark announcements as read when switching to that tab
  const handleTabChange = (tab: 'notice' | 'announcements') => {
    setActiveTab(tab)

    if (tab === 'announcements' && announcements.length > 0) {
      const allKeys = announcements.map((item) => getAnnouncementKey(item))
      markAnnouncementsRead(allKeys)
    }
  }

  const pendingGlobalAnnouncements = useMemo(() => {
    if (!user) return []

    return announcements.filter((item) => {
      if ((item.displayMode || 'silent') !== 'global') {
        return false
      }
      const key = getAnnouncementKey(item)
      return !isGlobalAnnouncementDismissed(key)
    })
  }, [announcements, isGlobalAnnouncementDismissed, user])

  const activeGlobalAnnouncement = pendingGlobalAnnouncements[0] || null

  const handleDismissGlobalAnnouncement = () => {
    if (!activeGlobalAnnouncement) return
    dismissGlobalAnnouncement(getAnnouncementKey(activeGlobalAnnouncement))
  }

  // Handle "Close Today" action
  const handleCloseToday = () => {
    const today = new Date().toDateString()
    setClosedUntilDate(today)
    setDialogOpen(false)
  }

  return {
    // Data
    notice: noticeContent,
    announcements,
    activeGlobalAnnouncement,
    loading: noticeLoading || statusLoading,

    // Unread counts
    unreadCount: unreadCounts.total,
    unreadNoticeCount: unreadCounts.notice,
    unreadAnnouncementsCount: unreadCounts.announcements,

    // Dialog state
    dialogOpen,
    setDialogOpen,
    activeTab,
    setActiveTab: handleTabChange,

    // Actions
    openDialog: handleOpenDialog,
    closeDialog: () => setDialogOpen(false),
    closeToday: handleCloseToday,
    dismissGlobalAnnouncement: handleDismissGlobalAnnouncement,
    refetchNotice,

    // Status
    isNoticeClosed: isNoticeClosed(),
  }
}
