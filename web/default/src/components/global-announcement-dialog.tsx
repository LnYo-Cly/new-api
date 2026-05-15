import { useTranslation } from 'react-i18next'
import type { AnnouncementItem } from '@/lib/announcement-utils'
import { formatDateTimeObject } from '@/lib/time'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Markdown } from '@/components/ui/markdown'
import { ScrollArea } from '@/components/ui/scroll-area'

interface GlobalAnnouncementDialogProps {
  announcement: AnnouncementItem | null
  onConfirmClose: () => void
}

export function GlobalAnnouncementDialog({
  announcement,
  onConfirmClose,
}: GlobalAnnouncementDialogProps) {
  const { t } = useTranslation()
  const open = Boolean(announcement)

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className='max-h-[90vh] sm:max-w-2xl'
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>{t('System Announcement')}</DialogTitle>
        </DialogHeader>

        {announcement && (
          <>
            <ScrollArea className='max-h-[60vh] pr-4'>
              <div className='space-y-4'>
                {announcement.publishDate && (
                  <div className='text-muted-foreground text-xs'>
                    {formatDateTimeObject(new Date(announcement.publishDate))}
                  </div>
                )}
                <Markdown>{announcement.content}</Markdown>
                {announcement.extra && (
                  <div className='text-muted-foreground text-sm'>
                    <Markdown>{announcement.extra}</Markdown>
                  </div>
                )}
              </div>
            </ScrollArea>

            <DialogFooter>
              <Button onClick={onConfirmClose}>{t('Close')}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
