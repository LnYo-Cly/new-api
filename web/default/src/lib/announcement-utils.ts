export type AnnouncementType =
  | 'default'
  | 'ongoing'
  | 'success'
  | 'warning'
  | 'error'

export type AnnouncementDisplayMode = 'silent' | 'global'

export type AnnouncementAudienceScope = 'all' | 'admins' | 'users'

export interface AnnouncementItem {
  id?: number
  content: string
  publishDate?: string
  type?: AnnouncementType
  extra?: string
  displayMode?: AnnouncementDisplayMode
  audienceScope?: AnnouncementAudienceScope
}

function hashString(input: string): string {
  let hash = 0
  if (!input) return '0'

  for (let i = 0; i < input.length; i += 1) {
    const chr = input.charCodeAt(i)
    hash = (hash << 5) - hash + chr
    hash |= 0
  }

  return hash.toString(36)
}

export function getAnnouncementKey(item: AnnouncementItem): string {
  if (!item) return ''

  if (item.id !== undefined && item.id !== null) {
    return `id:${item.id}`
  }

  const fingerprint = JSON.stringify({
    publishDate: item.publishDate || '',
    content: (item.content || '').trim(),
    extra: (item.extra || '').trim(),
    type: item.type || '',
    displayMode: item.displayMode || 'silent',
    audienceScope: item.audienceScope || 'all',
  })
  return `hash:${hashString(fingerprint)}`
}
