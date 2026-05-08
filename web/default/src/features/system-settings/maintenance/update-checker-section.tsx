import { useState } from 'react'
import {
  DownloadIcon,
  ExternalLinkIcon,
  PowerIcon,
  RefreshCcwIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { formatTimestamp, formatTimestampToDate } from '@/lib/format'
import { ROLE } from '@/lib/roles'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Markdown } from '@/components/ui/markdown'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SettingsSection } from '../components/settings-section'
import {
  applySystemUpdate,
  checkSystemUpdate,
  restartSystem,
  type SystemUpdateCommandResult,
  type SystemUpdateInfo,
  type SystemUpdateReleaseInfo,
} from './update-api'

type UpdateCheckerSectionProps = {
  currentVersion?: string | null
  startTime?: number | null
}

export function UpdateCheckerSection({
  currentVersion,
  startTime,
}: UpdateCheckerSectionProps) {
  const { t } = useTranslation()
  const userRole = useAuthStore((state) => state.auth.user?.role)
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [updateConfirmOpen, setUpdateConfirmOpen] = useState(false)
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<SystemUpdateInfo | null>(null)
  const [release, setRelease] = useState<SystemUpdateReleaseInfo | null>(null)
  const [commandResult, setCommandResult] =
    useState<SystemUpdateCommandResult | null>(null)

  const uptime = startTime ? formatTimestamp(startTime) : t('Unknown')
  const version = updateInfo?.current_version || currentVersion || t('Unknown')
  const latestVersion = updateInfo?.latest_version || t('Unknown')
  const isRoot = userRole === ROLE.SUPER_ADMIN
  const canApplyUpdate = Boolean(
    isRoot &&
    updateInfo?.self_update_enabled &&
    updateInfo?.update_command_configured &&
    updateInfo?.has_update
  )
  const canRestart = Boolean(
    isRoot &&
    updateInfo?.self_update_enabled &&
    updateInfo?.restart_command_configured
  )

  const handleCheckUpdates = async () => {
    setChecking(true)
    try {
      const data = await checkSystemUpdate()
      setUpdateInfo(data)
      setRelease(data.release_info ?? null)

      if (!data.has_update) {
        toast.success(
          t('You are running the latest version ({{version}}).', {
            version: data.current_version,
          })
        )
        return
      }

      setDialogOpen(true)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t('Failed to check for updates')
      toast.error(message)
    } finally {
      setChecking(false)
    }
  }

  const handleApplyUpdate = async () => {
    setUpdating(true)
    try {
      const result = await applySystemUpdate()
      setCommandResult(result)
      toast.success(t('Update command completed'))
      setUpdateConfirmOpen(false)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('Update command failed')
      toast.error(message)
    } finally {
      setUpdating(false)
    }
  }

  const handleRestart = async () => {
    setRestarting(true)
    try {
      const result = await restartSystem()
      setCommandResult(result)
      toast.success(t('Restart command submitted'))
      setRestartConfirmOpen(false)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('Restart command failed')
      toast.error(message)
    } finally {
      setRestarting(false)
    }
  }

  const goToRelease = () => {
    if (release?.html_url) {
      window.open(release.html_url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <>
      <SettingsSection
        title={t('System maintenance')}
        description={t('Review current version and fetch release notes.')}
      >
        <div className='space-y-6'>
          <div className='grid gap-4 md:grid-cols-3'>
            <div className='rounded-lg border p-4'>
              <div className='text-muted-foreground text-sm'>
                {t('Current version')}
              </div>
              <div className='text-lg font-semibold'>{version}</div>
            </div>
            <div className='rounded-lg border p-4'>
              <div className='text-muted-foreground text-sm'>
                {t('Latest version')}
              </div>
              <div className='text-lg font-semibold'>{latestVersion}</div>
            </div>
            <div className='rounded-lg border p-4'>
              <div className='text-muted-foreground text-sm'>
                {t('Uptime since')}
              </div>
              <div className='text-lg font-semibold'>{uptime}</div>
            </div>
          </div>

          <div className='flex flex-wrap gap-2'>
            <Button onClick={handleCheckUpdates} disabled={checking}>
              {checking ? (
                t('Checking updates...')
              ) : (
                <>
                  <RefreshCcwIcon className='me-2 h-4 w-4' />
                  {t('Check for updates')}
                </>
              )}
            </Button>
            {isRoot && (
              <>
                <Button
                  variant='secondary'
                  onClick={() => setUpdateConfirmOpen(true)}
                  disabled={!canApplyUpdate || updating}
                >
                  <DownloadIcon className='me-2 h-4 w-4' />
                  {updating ? t('Updating...') : t('Apply update')}
                </Button>
                <Button
                  variant='outline'
                  onClick={() => setRestartConfirmOpen(true)}
                  disabled={!canRestart || restarting}
                >
                  <PowerIcon className='me-2 h-4 w-4' />
                  {restarting ? t('Restarting...') : t('Restart service')}
                </Button>
              </>
            )}
          </div>

          {isRoot && updateInfo && !updateInfo.self_update_enabled && (
            <p className='text-muted-foreground text-sm'>
              {t(
                'Self-update is disabled. Set SELF_UPDATE_ENABLED=true and configure update commands to enable these actions.'
              )}
            </p>
          )}
          {isRoot &&
            updateInfo?.self_update_enabled &&
            (!updateInfo.update_command_configured ||
              !updateInfo.restart_command_configured) && (
              <p className='text-muted-foreground text-sm'>
                {t(
                  'Self-update is enabled, but one or more commands are not configured.'
                )}
              </p>
            )}
          {commandResult?.output && (
            <div className='rounded-lg border p-4'>
              <div className='mb-2 text-sm font-medium'>
                {t('Command output')}
              </div>
              <pre className='bg-muted max-h-64 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap'>
                {commandResult.output}
              </pre>
            </div>
          )}
        </div>
      </SettingsSection>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className='max-h-[80vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>
              {release?.tag_name
                ? t('New version available: {{version}}', {
                    version: release.tag_name,
                  })
                : t('Release details')}
            </DialogTitle>
            {release?.published_at && (
              <DialogDescription>
                {t('Published')}{' '}
                {formatTimestampToDate(
                  new Date(release.published_at).getTime(),
                  'milliseconds'
                )}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className='space-y-4'>
            {release?.body ? (
              <Markdown>{release.body}</Markdown>
            ) : (
              <p className='text-muted-foreground text-sm'>
                {t('No release notes provided.')}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type='button'
              variant='secondary'
              onClick={() => setDialogOpen(false)}
            >
              {t('Close')}
            </Button>
            {release?.html_url && (
              <Button type='button' onClick={goToRelease}>
                <ExternalLinkIcon className='me-2 h-4 w-4' />
                {t('Open release')}
              </Button>
            )}
            {isRoot && release && (
              <Button
                type='button'
                onClick={() => {
                  setDialogOpen(false)
                  setUpdateConfirmOpen(true)
                }}
                disabled={!canApplyUpdate}
              >
                <DownloadIcon className='me-2 h-4 w-4' />
                {t('Apply update')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={updateConfirmOpen}
        onOpenChange={setUpdateConfirmOpen}
        title={t('Apply system update?')}
        desc={t(
          'The server will run the configured SELF_UPDATE_COMMAND. Continue only during a maintenance window.'
        )}
        confirmText={updating ? t('Updating...') : t('Apply update')}
        isLoading={updating}
        disabled={!canApplyUpdate}
        handleConfirm={handleApplyUpdate}
      />

      <ConfirmDialog
        open={restartConfirmOpen}
        onOpenChange={setRestartConfirmOpen}
        title={t('Restart service?')}
        desc={t(
          'The server will run the configured SELF_RESTART_COMMAND and may become temporarily unavailable.'
        )}
        confirmText={restarting ? t('Restarting...') : t('Restart service')}
        isLoading={restarting}
        disabled={!canRestart}
        handleConfirm={handleRestart}
      />
    </>
  )
}
