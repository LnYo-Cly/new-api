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
import { useEffect, useMemo, useState } from 'react'
import * as z from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, FilePenLine, Plus, Trash2, Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type {
  AnnouncementAudienceScope,
  AnnouncementDisplayMode,
  AnnouncementItem,
  AnnouncementType,
} from '@/lib/announcement-utils'
import dayjs from '@/lib/dayjs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Markdown } from '@/components/ui/markdown'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { DateTimePicker } from '@/components/datetime-picker'
import { StatusBadge } from '@/components/status-badge'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

type Announcement = AnnouncementItem & {
  id: number
  publishDate: string
  type: AnnouncementType
  displayMode: AnnouncementDisplayMode
  audienceScope: AnnouncementAudienceScope
}

type AnnouncementsSectionProps = {
  enabled: boolean
  data: string
}

const announcementSchema = z.object({
  content: z
    .string()
    .min(1, 'Content is required')
    .max(500, 'Content must be less than 500 characters'),
  publishDate: z.string().min(1, 'Publish date is required'),
  type: z.enum(['default', 'ongoing', 'success', 'warning', 'error']),
  displayMode: z.enum(['silent', 'global']),
  audienceScope: z.enum(['all', 'admins', 'users']),
  extra: z
    .string()
    .max(100, 'Extra must be less than 100 characters')
    .optional(),
})

type AnnouncementFormValues = z.infer<typeof announcementSchema>

const typeOptions = [
  {
    value: 'default',
    label: 'Default',
    color: 'bg-gray-500',
    badgeVariant: 'neutral' as const,
  },
  {
    value: 'ongoing',
    label: 'Ongoing',
    color: 'bg-blue-500',
    badgeVariant: 'info' as const,
  },
  {
    value: 'success',
    label: 'Success',
    color: 'bg-green-500',
    badgeVariant: 'success' as const,
  },
  {
    value: 'warning',
    label: 'Warning',
    color: 'bg-orange-500',
    badgeVariant: 'warning' as const,
  },
  {
    value: 'error',
    label: 'Error',
    color: 'bg-red-500',
    badgeVariant: 'danger' as const,
  },
]

const displayModeOptions = [
  { value: 'silent', label: 'Silent Display' },
  { value: 'global', label: 'Global Display' },
] as const

const audienceScopeOptions = [
  { value: 'all', label: 'All Logged-in Users' },
  { value: 'admins', label: 'Admins Only' },
  { value: 'users', label: 'Users Only' },
] as const

export function AnnouncementsSection({
  enabled,
  data,
}: AnnouncementsSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [isEnabled, setIsEnabled] = useState(enabled)
  const [hasChanges, setHasChanges] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editingAnnouncement, setEditingAnnouncement] =
    useState<Announcement | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<'single' | 'batch'>('single')

  const form = useForm<AnnouncementFormValues>({
    resolver: zodResolver(announcementSchema),
    defaultValues: {
      content: '',
      publishDate: new Date().toISOString(),
      type: 'default',
      displayMode: 'silent',
      audienceScope: 'all',
      extra: '',
    },
  })

  useEffect(() => {
    try {
      const parsed = JSON.parse(data || '[]')
      if (Array.isArray(parsed)) {
        setAnnouncements(
          parsed.map((item, idx) => ({
            ...item,
            id: item.id || idx + 1,
            displayMode: item.displayMode || 'silent',
            audienceScope: item.audienceScope || 'all',
            type: item.type || 'default',
          }))
        )
        if (parsed.length > 0) {
          const firstItem = parsed
            .map((item, idx) => ({
              ...item,
              id: item.id || idx + 1,
              displayMode: item.displayMode || 'silent',
              audienceScope: item.audienceScope || 'all',
              type: item.type || 'default',
            }))[0] as Announcement
          setEditingAnnouncement(firstItem)
          form.reset({
            content: firstItem.content,
            publishDate: firstItem.publishDate,
            type: firstItem.type,
            displayMode: firstItem.displayMode,
            audienceScope: firstItem.audienceScope,
            extra: firstItem.extra || '',
          })
        } else {
          setEditingAnnouncement(null)
        }
      }
    } catch {
      setAnnouncements([])
      setEditingAnnouncement(null)
    }
  }, [data, form])

  useEffect(() => {
    setIsEnabled(enabled)
  }, [enabled])

  const handleToggleEnabled = async (checked: boolean) => {
    try {
      await updateOption.mutateAsync({
        key: 'console_setting.announcements_enabled',
        value: checked,
      })
      setIsEnabled(checked)
      toast.success(t('Setting saved'))
    } catch {
      toast.error(t('Failed to update setting'))
    }
  }

  const handleAdd = () => {
    setEditingAnnouncement(null)
    form.reset({
      content: '',
      publishDate: new Date().toISOString(),
      type: 'default',
      displayMode: 'silent',
      audienceScope: 'all',
      extra: '',
    })
  }

  const handleSelectAnnouncement = (announcement: Announcement) => {
    setEditingAnnouncement(announcement)
    form.reset({
      content: announcement.content,
      publishDate: announcement.publishDate,
      type: announcement.type,
      displayMode: announcement.displayMode,
      audienceScope: announcement.audienceScope,
      extra: announcement.extra || '',
    })
  }

  const handleDelete = (announcement: Announcement) => {
    setEditingAnnouncement(announcement)
    setDeleteTarget('single')
    setShowDeleteDialog(true)
  }

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) {
      toast.error(t('Please select items to delete'))
      return
    }
    setDeleteTarget('batch')
    setShowDeleteDialog(true)
  }

  const confirmDelete = () => {
    if (deleteTarget === 'single' && editingAnnouncement) {
      setAnnouncements((prev) =>
        prev.filter((item) => item.id !== editingAnnouncement.id)
      )
      setHasChanges(true)
      toast.success(t('Announcement deleted. Click "Save Settings" to apply.'))
    } else if (deleteTarget === 'batch') {
      setAnnouncements((prev) =>
        prev.filter((item) => !selectedIds.includes(item.id))
      )
      setSelectedIds([])
      setHasChanges(true)
      toast.success(
        t('{{count}} announcements deleted. Click "Save Settings" to apply.', {
          count: selectedIds.length,
        })
      )
    }
    setShowDeleteDialog(false)
    setEditingAnnouncement(null)
  }

  const handleSubmitForm = (values: AnnouncementFormValues) => {
    const normalizedValues: AnnouncementFormValues = {
      ...values,
      audienceScope: values.displayMode === 'global' ? values.audienceScope : 'all',
    }

    if (editingAnnouncement) {
      setAnnouncements((prev) => {
        const next = prev.map((item) =>
          item.id === editingAnnouncement.id
            ? { ...item, ...normalizedValues }
            : item
        )
        const updated = next.find((item) => item.id === editingAnnouncement.id) || null
        setEditingAnnouncement(updated)
        return next
      })
      toast.success(t('Announcement updated. Click "Save Settings" to apply.'))
    } else {
      const newId = Math.max(...announcements.map((item) => item.id), 0) + 1
      const newAnnouncement = { id: newId, ...normalizedValues }
      setAnnouncements((prev) => [...prev, newAnnouncement])
      setEditingAnnouncement(newAnnouncement)
      toast.success(t('Announcement added. Click "Save Settings" to apply.'))
    }
    setHasChanges(true)
  }

  const handleSaveAll = async () => {
    try {
      await updateOption.mutateAsync({
        key: 'console_setting.announcements',
        value: JSON.stringify(announcements),
      })
      setHasChanges(false)
      toast.success(t('Announcements saved successfully'))
    } catch {
      toast.error(t('Failed to save announcements'))
    }
  }

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? announcements.map((item) => item.id) : [])
  }

  const toggleSelectOne = (id: number, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((item) => item !== id)
    )
  }

  const sortedAnnouncements = useMemo(() => {
    return [...announcements].sort((a, b) => {
      return (
        new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime()
      )
    })
  }, [announcements])

  const getRelativeTime = (date: string) => {
    const now = new Date()
    const past = new Date(date)
    const diffMs = now.getTime() - past.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  const watchedContent = form.watch('content')
  const watchedExtra = form.watch('extra')
  const watchedDisplayMode = form.watch('displayMode')
  const watchedAudienceScope = form.watch('audienceScope')
  const watchedType = form.watch('type')
  const watchedPublishDate = form.watch('publishDate')

  return (
    <SettingsSection
      title={t('Announcements')}
      description={t('Broadcast short system notices on the dashboard')}
    >
      <div className='space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div className='flex flex-wrap items-center gap-2'>
            <Button onClick={handleAdd} size='sm'>
              <Plus className='mr-2 h-4 w-4' />
              {t('Add Announcement')}
            </Button>
            <Button
              onClick={handleBatchDelete}
              size='sm'
              variant='destructive'
              disabled={selectedIds.length === 0}
            >
              <Trash2 className='mr-2 h-4 w-4' />
              {t('Delete (')}
              {selectedIds.length})
            </Button>
            <Button
              onClick={handleSaveAll}
              size='sm'
              variant='secondary'
              disabled={!hasChanges || updateOption.isPending}
            >
              <Save className='mr-2 h-4 w-4' />
              {updateOption.isPending ? t('Saving...') : t('Save Settings')}
            </Button>
          </div>
          <div className='flex items-center gap-2'>
            <span className='text-muted-foreground text-sm'>
              {t('Enabled')}
            </span>
            <Switch checked={isEnabled} onCheckedChange={handleToggleEnabled} />
          </div>
        </div>

        <div className='grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]'>
          <Card className='overflow-hidden'>
            <CardHeader className='pb-3'>
              <div className='flex items-center justify-between gap-3'>
                <div>
                  <CardTitle>{t('Announcement Timeline')}</CardTitle>
                  <p className='text-muted-foreground mt-1 text-sm'>
                    {t('Browse publish history and select an announcement to edit.')}
                  </p>
                </div>
                <div className='flex items-center gap-2'>
                  <Checkbox
                    checked={
                      selectedIds.length === announcements.length &&
                      announcements.length > 0
                    }
                    onCheckedChange={toggleSelectAll}
                  />
                  <span className='text-muted-foreground text-xs'>
                    {t('Select All')}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className='space-y-3'>
              {sortedAnnouncements.length === 0 ? (
                <div className='text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm'>
                  {t(
                    'No announcements yet. Click "Add Announcement" to create one.'
                  )}
                </div>
              ) : (
                sortedAnnouncements.map((announcement, index) => {
                  const active = editingAnnouncement?.id === announcement.id
                  return (
                    <div key={announcement.id} className='relative pl-6'>
                      <span className='bg-border absolute top-0 bottom-0 left-2 w-px' />
                      <span className='bg-background absolute top-5 left-0.5 h-3 w-3 rounded-full border-2 border-current text-sky-500' />
                      <button
                        type='button'
                        className={`w-full rounded-xl border p-4 text-left transition ${
                          active
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => handleSelectAnnouncement(announcement)}
                      >
                        <div className='mb-2 flex items-start justify-between gap-3'>
                          <div className='space-y-2'>
                            <div className='flex flex-wrap items-center gap-2'>
                              <StatusBadge
                                label={
                                  typeOptions.find(
                                    (opt) => opt.value === announcement.type
                                  )?.label
                                }
                                variant={
                                  typeOptions.find(
                                    (opt) => opt.value === announcement.type
                                  )?.badgeVariant ?? 'neutral'
                                }
                                copyable={false}
                              />
                              <StatusBadge
                                label={t(
                                  displayModeOptions.find(
                                    (option) =>
                                      option.value === announcement.displayMode
                                  )?.label || 'Silent Display'
                                )}
                                variant='neutral'
                                copyable={false}
                              />
                            </div>
                            <div className='text-sm font-medium'>
                              {dayjs(announcement.publishDate).format(
                                'YYYY-MM-DD HH:mm:ss'
                              )}
                            </div>
                            <div className='text-muted-foreground text-xs'>
                              {getRelativeTime(announcement.publishDate)}
                            </div>
                          </div>
                          <Checkbox
                            checked={selectedIds.includes(announcement.id)}
                            onCheckedChange={(checked) =>
                              toggleSelectOne(announcement.id, checked as boolean)
                            }
                            onClick={(event) => event.stopPropagation()}
                          />
                        </div>
                        <p className='line-clamp-3 text-sm'>{announcement.content}</p>
                        <div className='text-muted-foreground mt-3 flex flex-wrap items-center gap-3 text-xs'>
                          <span>
                            {t('Audience Scope')}:{' '}
                            {announcement.displayMode === 'global'
                              ? t(
                                  audienceScopeOptions.find(
                                    (option) =>
                                      option.value === announcement.audienceScope
                                  )?.label || 'All Logged-in Users'
                                )
                              : '-'}
                          </span>
                          {announcement.extra && (
                            <span className='line-clamp-1'>
                              {t('Extra')}: {announcement.extra}
                            </span>
                          )}
                        </div>
                      </button>
                      {index < sortedAnnouncements.length - 1 && (
                        <div className='h-3' />
                      )}
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>

          <div className='grid gap-4'>
            <Card>
              <CardHeader className='pb-3'>
                <div className='flex items-center justify-between gap-3'>
                  <div>
                    <CardTitle>
                      {editingAnnouncement
                        ? t('Edit Announcement')
                        : t('Create Announcement')}
                    </CardTitle>
                    <p className='text-muted-foreground mt-1 text-sm'>
                      {t('Create or update system announcements for the dashboard')}
                    </p>
                  </div>
                  {editingAnnouncement && (
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => handleDelete(editingAnnouncement)}
                    >
                      <Trash2 className='mr-2 h-4 w-4' />
                      {t('Delete')}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(handleSubmitForm)}
                    className='space-y-4'
                  >
                    <FormField
                      control={form.control}
                      name='content'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('Content')}</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder={t(
                                'Enter announcement content (supports Markdown/HTML)'
                              )}
                              rows={6}
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            {t(
                              'Maximum 500 characters. Supports Markdown and HTML.'
                            )}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className='grid gap-4 md:grid-cols-2'>
                      <FormField
                        control={form.control}
                        name='publishDate'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('Publish Date')}</FormLabel>
                            <FormControl>
                              <DateTimePicker
                                value={
                                  field.value ? new Date(field.value) : undefined
                                }
                                onChange={(date) =>
                                  field.onChange(date ? date.toISOString() : '')
                                }
                                placeholder={t('Select publish date')}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name='type'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('Type')}</FormLabel>
                            <Select
                              items={typeOptions.map((option) => ({
                                value: option.value,
                                label: (
                                  <div className='flex items-center gap-2'>
                                    <div
                                      className={`h-3 w-3 rounded-full ${option.color}`}
                                    />
                                    {option.label}
                                  </div>
                                ),
                              }))}
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue
                                    placeholder={t('Select announcement type')}
                                  />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent alignItemWithTrigger={false}>
                                <SelectGroup>
                                  {typeOptions.map((option) => (
                                    <SelectItem
                                      key={option.value}
                                      value={option.value}
                                    >
                                      <div className='flex items-center gap-2'>
                                        <div
                                          className={`h-3 w-3 rounded-full ${option.color}`}
                                        />
                                        {option.label}
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className='grid gap-4 md:grid-cols-2'>
                      <FormField
                        control={form.control}
                        name='displayMode'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('Display Mode')}</FormLabel>
                            <Select
                              items={displayModeOptions.map((option) => ({
                                value: option.value,
                                label: t(option.label),
                              }))}
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue
                                    placeholder={t('Select display mode')}
                                  />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent alignItemWithTrigger={false}>
                                <SelectGroup>
                                  {displayModeOptions.map((option) => (
                                    <SelectItem
                                      key={option.value}
                                      value={option.value}
                                    >
                                      {t(option.label)}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              {t(
                                'Silent display only appears in the announcement list. Global display forces a dialog after login.'
                              )}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name='audienceScope'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('Audience Scope')}</FormLabel>
                            <Select
                              items={audienceScopeOptions.map((option) => ({
                                value: option.value,
                                label: t(option.label),
                              }))}
                              onValueChange={field.onChange}
                              value={field.value}
                              disabled={watchedDisplayMode !== 'global'}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue
                                    placeholder={t('Select audience scope')}
                                  />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent alignItemWithTrigger={false}>
                                <SelectGroup>
                                  {audienceScopeOptions.map((option) => (
                                    <SelectItem
                                      key={option.value}
                                      value={option.value}
                                    >
                                      {t(option.label)}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              {t(
                                'Only selected logged-in users will receive the forced dialog.'
                              )}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name='extra'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('Extra Notes (Optional)')}</FormLabel>
                          <FormControl>
                            <Input
                              placeholder={t('Additional information')}
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            {t(
                              'Optional supplementary information (max 100 characters)'
                            )}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className='flex flex-wrap justify-end gap-2'>
                      <Button type='button' variant='outline' onClick={handleAdd}>
                        {t('Reset')}
                      </Button>
                      <Button type='submit'>
                        <FilePenLine className='mr-2 h-4 w-4' />
                        {editingAnnouncement ? t('Update') : t('Add')}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='pb-3'>
                <CardTitle className='flex items-center gap-2'>
                  <Eye className='h-4 w-4' />
                  {t('Live Preview')}
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='flex flex-wrap items-center gap-2'>
                  <StatusBadge
                    label={
                      typeOptions.find((opt) => opt.value === watchedType)?.label
                    }
                    variant={
                      typeOptions.find((opt) => opt.value === watchedType)
                        ?.badgeVariant ?? 'neutral'
                    }
                    copyable={false}
                  />
                  <StatusBadge
                    label={t(
                      displayModeOptions.find(
                        (option) => option.value === watchedDisplayMode
                      )?.label || 'Silent Display'
                    )}
                    variant='neutral'
                    copyable={false}
                  />
                  {watchedDisplayMode === 'global' && (
                    <StatusBadge
                      label={t(
                        audienceScopeOptions.find(
                          (option) => option.value === watchedAudienceScope
                        )?.label || 'All Logged-in Users'
                      )}
                      variant='neutral'
                      copyable={false}
                    />
                  )}
                </div>
                <div className='text-muted-foreground text-sm'>
                  {watchedPublishDate
                    ? dayjs(watchedPublishDate).format('YYYY-MM-DD HH:mm:ss')
                    : '-'}
                </div>
                <Separator />
                <div className='min-h-24 text-sm'>
                  {watchedContent ? (
                    <Markdown>{watchedContent}</Markdown>
                  ) : (
                    <span className='text-muted-foreground'>
                      {t('Enter announcement content (supports Markdown/HTML)')}
                    </span>
                  )}
                </div>
                {watchedExtra && (
                  <>
                    <Separator />
                    <div className='text-muted-foreground text-sm'>
                      <Markdown>{watchedExtra}</Markdown>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Are you sure?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget === 'single'
                ? 'This announcement will be removed from the list.'
                : `${selectedIds.length} announcements will be removed from the list.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              {t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  )
}
