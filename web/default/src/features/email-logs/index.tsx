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
import {
  type ReactNode,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { formatTimestampToDate } from '@/lib/format'
import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { LongText } from '@/components/long-text'
import { cn } from '@/lib/utils'
import { getEmailLogs } from '@/features/system-settings/api'
import type { EmailLogItem } from '@/features/system-settings/types'

const PAGE_SIZE = 10
const ALL_FILTER = '__all__'

function getStatusBadgeVariant(
  status: string
): 'destructive' | 'secondary' {
  return status === 'failed' ? 'destructive' : 'secondary'
}

export function EmailLogs() {
  const { t } = useTranslation()
  const [logs, setLogs] = useState<EmailLogItem[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState(ALL_FILTER)
  const [purpose, setPurpose] = useState(ALL_FILTER)
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const statusOptions = useMemo(
    () => [
      { value: ALL_FILTER, label: t('All Delivery Status') },
      { value: 'sent', label: t('Sent') },
      { value: 'failed', label: t('Failed') },
    ],
    [t]
  )

  const purposeOptions = useMemo(
    () => [
      { value: ALL_FILTER, label: t('All Email Types') },
      { value: 'email_verification', label: t('Verification Email') },
      { value: 'password_reset', label: t('Password Reset') },
      { value: 'user_notification', label: t('User Notification') },
    ],
    [t]
  )

  const selectedLog = useMemo(
    () => logs.find((item) => item.id === selectedId) ?? null,
    [logs, selectedId]
  )

  const loadLogs = useEffectEvent(async () => {
    setLoading(true)
    try {
      const res = await getEmailLogs({
        p: page,
        page_size: PAGE_SIZE,
        status: status === ALL_FILTER ? undefined : status,
        purpose: purpose === ALL_FILTER ? undefined : purpose,
        keyword: keyword.trim() || undefined,
      })
      const items = res.data?.items || []
      setLogs(items)
      setTotal(res.data?.total || 0)
      setSelectedId((current) => {
        if (items.length === 0) return null
        return items.some((item) => item.id === current) ? current : items[0].id
      })
    } finally {
      setLoading(false)
    }
  })

  useEffect(() => {
    void loadLogs()
  }, [page, status, purpose, keyword])

  const handleSearch = () => {
    setKeyword(keywordInput.trim())
    setPage(1)
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Email Logs')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button type='button' variant='outline' onClick={() => void loadLogs()}>
          {t('Refresh')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='space-y-4'>
          <div className='space-y-1'>
            <p className='text-muted-foreground text-sm'>
              {t('View sent email history and delivery status')}
            </p>
          </div>

          <div className='flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center'>
            <Input
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleSearch()
                }
              }}
              placeholder={t('Search recipient, subject or content...')}
              className='lg:max-w-sm'
            />
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value ?? ALL_FILTER)
                setPage(1)
              }}
            >
              <SelectTrigger className='w-full lg:w-44'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={purpose}
              onValueChange={(value) => {
                setPurpose(value ?? ALL_FILTER)
                setPage(1)
              }}
            >
              <SelectTrigger className='w-full lg:w-44'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {purposeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type='button' onClick={handleSearch}>
              {t('Search')}
            </Button>
          </div>

          <div className='grid gap-4 xl:grid-cols-[minmax(0,2.1fr)_minmax(0,2.4fr)]'>
            <div className='flex min-h-[32rem] flex-col rounded-xl border'>
              <ScrollArea className='min-h-0 flex-1'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('Time')}</TableHead>
                      <TableHead>{t('Status')}</TableHead>
                      <TableHead>{t('Recipient')}</TableHead>
                      <TableHead>{t('Subject')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow
                        key={log.id}
                        className={cn(
                          'cursor-pointer',
                          selectedId === log.id && 'bg-muted/60'
                        )}
                        onClick={() => setSelectedId(log.id)}
                      >
                        <TableCell className='text-xs'>
                          {formatTimestampToDate(log.created_at)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(log.status)}>
                            {log.status === 'failed' ? t('Failed') : t('Sent')}
                          </Badge>
                        </TableCell>
                        <TableCell className='max-w-40'>
                          <LongText>{log.receiver}</LongText>
                        </TableCell>
                        <TableCell className='max-w-48'>
                          <LongText>{log.subject}</LongText>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!loading && logs.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className='text-muted-foreground py-10 text-center'
                        >
                          <div className='space-y-1'>
                            <div>{t('No email logs found.')}</div>
                            <div className='text-xs'>
                              {t(
                                'SMTP email history will appear here after messages are sent'
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>

              <div className='flex items-center justify-between border-t p-3 text-sm'>
                <span className='text-muted-foreground'>
                  {t('Page {{current}} of {{total}}', {
                    current: page,
                    total: totalPages,
                  })}
                </span>
                <div className='flex gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    {t('Previous')}
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    disabled={page >= totalPages || loading}
                    onClick={() =>
                      setPage((current) => Math.min(totalPages, current + 1))
                    }
                  >
                    {t('Next')}
                  </Button>
                </div>
              </div>
            </div>

            <div className='flex min-h-[32rem] flex-col rounded-xl border'>
              <ScrollArea className='min-h-0 flex-1'>
                <div className='space-y-4 p-4'>
                  {selectedLog ? (
                    <>
                      <div className='grid gap-3 sm:grid-cols-2'>
                        <DetailItem
                          label={t('Time')}
                          value={formatTimestampToDate(selectedLog.created_at)}
                        />
                        <DetailItem
                          label={t('Status')}
                          value={
                            <Badge
                              variant={getStatusBadgeVariant(selectedLog.status)}
                            >
                              {selectedLog.status === 'failed'
                                ? t('Failed')
                                : t('Sent')}
                            </Badge>
                          }
                        />
                        <DetailItem
                          label={t('Email Type')}
                          value={resolvePurposeLabel(selectedLog.purpose, t)}
                        />
                        <DetailItem
                          label={t('From Address')}
                          value={selectedLog.from || '-'}
                        />
                        <DetailItem
                          label={t('Recipient')}
                          value={selectedLog.receiver || '-'}
                        />
                        <DetailItem
                          label={t('Subject')}
                          value={selectedLog.subject || '-'}
                        />
                      </div>

                      {selectedLog.error && (
                        <div className='space-y-2'>
                          <div className='text-sm font-medium'>
                            {t('Error Message')}
                          </div>
                          <div className='rounded-lg border border-red-200 bg-red-50 p-3 text-sm whitespace-pre-wrap text-red-700'>
                            {selectedLog.error}
                          </div>
                        </div>
                      )}

                      <div className='space-y-2'>
                        <div className='text-sm font-medium'>
                          {t('Email Preview')}
                        </div>
                        <div className='rounded-lg border p-4'>
                          <div
                            className='prose prose-sm max-w-none break-words'
                            dangerouslySetInnerHTML={{
                              __html: selectedLog.content || '',
                            }}
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className='text-muted-foreground flex min-h-[28rem] items-center justify-center text-sm'>
                      {loading
                        ? t('Loading...')
                        : t('Select an email record to preview its content')}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

function DetailItem({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className='space-y-1 rounded-lg border p-3'>
      <div className='text-muted-foreground text-xs'>{label}</div>
      <div className='text-sm break-all'>{value}</div>
    </div>
  )
}

function resolvePurposeLabel(
  purpose: string,
  t: (key: string) => string
): string {
  switch (purpose) {
    case 'email_verification':
      return t('Verification Email')
    case 'password_reset':
      return t('Password Reset')
    case 'user_notification':
      return t('User Notification')
    default:
      return purpose || '-'
  }
}
