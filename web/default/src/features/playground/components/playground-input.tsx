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
import { useRef, useState } from 'react'
import {
  PaperclipIcon,
  FileIcon,
  ImageIcon,
  ScreenShareIcon,
  CameraIcon,
  GlobeIcon,
  SendIcon,
  SquareIcon,
  BarChartIcon,
  BoxIcon,
  NotepadTextIcon,
  CodeSquareIcon,
  GraduationCapIcon,
} from 'lucide-react'
import type { FileUIPart } from 'ai'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  PromptInput,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputButton,
  PromptInputFooter,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'
import { ModelGroupSelector } from '@/components/model-group-selector'
import { cn } from '@/lib/utils'
import type {
  ModelOption,
  GroupOption,
  PlaygroundSubmitMessage,
} from '../types'

interface PlaygroundInputProps {
  onSubmit: (message: PlaygroundSubmitMessage) => void
  onStop?: () => void
  disabled?: boolean
  isGenerating?: boolean
  models: ModelOption[]
  modelValue: string
  onModelChange: (value: string) => void
  isModelLoading?: boolean
  groups: GroupOption[]
  groupValue: string
  onGroupChange: (value: string) => void
}

function PlaygroundAttachmentTools({
  disabled,
  searchEnabled,
  onToggleSearch,
}: {
  disabled?: boolean
  searchEnabled: boolean
  onToggleSearch: () => void
}) {
  const { t } = useTranslation()
  const attachments = usePromptInputAttachments()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    attachments.add(files)
  }

  const handleTakeScreenshot = async () => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getDisplayMedia
    ) {
      toast.error(t('This browser does not support screenshot capture.'))
      return
    }

    let stream: MediaStream | undefined
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      })

      const track = stream.getVideoTracks()[0]
      if (!track) {
        throw new Error('no_video_track')
      }

      const video = document.createElement('video')
      video.srcObject = stream
      video.muted = true
      video.playsInline = true
      await video.play()

      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 1920
      canvas.height = video.videoHeight || 1080
      const context = canvas.getContext('2d')
      if (!context) {
        throw new Error('no_canvas_context')
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png')
      )
      if (!blob) {
        throw new Error('no_blob')
      }

      attachments.add([
        new File([blob], `screenshot-${Date.now()}.png`, {
          type: 'image/png',
        }),
      ])
    } catch {
      toast.error(t('Failed to capture screenshot.'))
    } finally {
      stream?.getTracks().forEach((track) => track.stop())
    }
  }

  return (
    <>
      <input
        className='hidden'
        multiple
        onChange={(event) => {
          addFiles(event.currentTarget.files)
          event.currentTarget.value = ''
        }}
        ref={fileInputRef}
        type='file'
      />
      <input
        accept='image/*'
        className='hidden'
        multiple
        onChange={(event) => {
          addFiles(event.currentTarget.files)
          event.currentTarget.value = ''
        }}
        ref={imageInputRef}
        type='file'
      />
      <input
        accept='image/*'
        capture='environment'
        className='hidden'
        onChange={(event) => {
          addFiles(event.currentTarget.files)
          event.currentTarget.value = ''
        }}
        ref={cameraInputRef}
        type='file'
      />

      <PromptInputTools>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <PromptInputButton
                className='border font-medium'
                disabled={disabled}
                variant='outline'
              />
            }
          >
            <PaperclipIcon size={16} />
            <span className='hidden sm:inline'>{t('Attach')}</span>
            <span className='sr-only sm:hidden'>{t('Attach')}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start'>
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
              <FileIcon className='mr-2' size={16} />
              {t('Upload file')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
              <ImageIcon className='mr-2' size={16} />
              {t('Upload photo')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleTakeScreenshot}>
              <ScreenShareIcon className='mr-2' size={16} />
              {t('Take screenshot')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => cameraInputRef.current?.click()}>
              <CameraIcon className='mr-2' size={16} />
              {t('Take photo')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <PromptInputButton
          aria-pressed={searchEnabled}
          className={cn(
            'border font-medium',
            searchEnabled &&
              'border-primary bg-primary/10 text-primary hover:bg-primary/15'
          )}
          disabled={disabled}
          onClick={onToggleSearch}
          variant='outline'
        >
          <GlobeIcon size={16} />
          <span className='hidden sm:inline'>{t('Search')}</span>
          <span className='sr-only sm:hidden'>{t('Search')}</span>
        </PromptInputButton>
      </PromptInputTools>
    </>
  )
}

const suggestions = [
  { icon: BarChartIcon, text: 'Analyze data', color: '#76d0eb' },
  { icon: BoxIcon, text: 'Surprise me', color: '#76d0eb' },
  { icon: NotepadTextIcon, text: 'Summarize text', color: '#ea8444' },
  { icon: CodeSquareIcon, text: 'Code', color: '#6c71ff' },
  { icon: GraduationCapIcon, text: 'Get advice', color: '#76d0eb' },
  { icon: null, text: 'More' },
]

export function PlaygroundInput({
  onSubmit,
  onStop,
  disabled,
  isGenerating,
  models,
  modelValue,
  onModelChange,
  isModelLoading = false,
  groups,
  groupValue,
  onGroupChange,
}: PlaygroundInputProps) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [searchEnabled, setSearchEnabled] = useState(false)

  const isModelSelectDisabled =
    disabled || isModelLoading || models.length === 0
  const isGroupSelectDisabled = disabled || groups.length === 0

  const handleSubmit = (message: PromptInputMessage) => {
    const trimmedText = message.text?.trim() || ''
    const files = (message.files || []) as FileUIPart[]
    if ((!trimmedText && files.length === 0) || disabled) return
    onSubmit({
      text: trimmedText,
      files,
      useSearch: searchEnabled,
    })
    setText('')
  }

  const handleSuggestionClick = (suggestion: string) => {
    onSubmit({
      text: suggestion,
      useSearch: searchEnabled,
    })
  }

  return (
    <div className='grid shrink-0 gap-4 px-1 md:pb-4'>
      <PromptInput
        groupClassName='rounded-xl'
        multiple
        onSubmit={handleSubmit}
      >
        <div className='px-5 pt-3'>
          <PromptInputAttachments>
            {(attachment) => <PromptInputAttachment data={attachment} />}
          </PromptInputAttachments>
        </div>

        <PromptInputTextarea
          autoComplete='off'
          autoCorrect='off'
          autoCapitalize='off'
          spellCheck={false}
          className='px-5 md:text-base'
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('Ask anything')}
          value={text}
        />

        <PromptInputFooter className='p-2.5'>
          <PlaygroundAttachmentTools
            disabled={disabled}
            searchEnabled={searchEnabled}
            onToggleSearch={() => setSearchEnabled((prev) => !prev)}
          />

          <div className='flex items-center gap-1.5 md:gap-2'>
            <ModelGroupSelector
              selectedModel={modelValue}
              models={models}
              onModelChange={onModelChange}
              selectedGroup={groupValue}
              groups={groups}
              onGroupChange={onGroupChange}
              disabled={isModelSelectDisabled || isGroupSelectDisabled}
            />

            {isGenerating && onStop ? (
              <PromptInputButton
                className='text-foreground font-medium'
                onClick={onStop}
                variant='secondary'
              >
                <SquareIcon className='fill-current' size={16} />
                <span className='hidden sm:inline'>{t('Stop')}</span>
                <span className='sr-only sm:hidden'>{t('Stop')}</span>
              </PromptInputButton>
            ) : (
              <PromptInputButton
                className='text-foreground font-medium'
                disabled={disabled}
                type='submit'
                variant='secondary'
              >
                <SendIcon size={16} />
                <span className='hidden sm:inline'>{t('Send')}</span>
                <span className='sr-only sm:hidden'>{t('Send')}</span>
              </PromptInputButton>
            )}
          </div>
        </PromptInputFooter>
      </PromptInput>

      <Suggestions>
        {suggestions.map(({ icon: Icon, text, color }) => (
          <Suggestion
            className={`text-xs font-normal sm:text-sm ${
              text === 'More' ? 'hidden sm:flex' : ''
            }`}
            key={text}
            onClick={() => handleSuggestionClick(text)}
            suggestion={text}
          >
            {Icon && <Icon size={16} style={{ color }} />}
            {text}
          </Suggestion>
        ))}
      </Suggestions>
    </div>
  )
}
