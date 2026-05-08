import { api } from '@/lib/api'

export type SystemUpdateReleaseInfo = {
  tag_name: string
  name?: string
  body?: string
  html_url?: string
  published_at?: string
}

export type SystemUpdateInfo = {
  current_version: string
  latest_version: string
  has_update: boolean
  release_info?: SystemUpdateReleaseInfo
  repository: string
  self_update_enabled: boolean
  update_command_configured: boolean
  restart_command_configured: boolean
}

export type SystemUpdateCommandResult = {
  message: string
  output?: string
  need_restart?: boolean
}

type ApiResponse<T> = {
  success: boolean
  message?: string
  data?: T
}

function requireSuccess<T>(response: ApiResponse<T>): T {
  if (!response.success || !response.data) {
    throw new Error(response.message || 'Request failed')
  }
  return response.data
}

export async function checkSystemUpdate(): Promise<SystemUpdateInfo> {
  const res = await api.get<ApiResponse<SystemUpdateInfo>>(
    '/api/system/update/check',
    {
      disableDuplicate: true,
      skipBusinessError: true,
    } as Record<string, unknown>
  )
  return requireSuccess(res.data)
}

export async function applySystemUpdate(): Promise<SystemUpdateCommandResult> {
  const res = await api.post<ApiResponse<SystemUpdateCommandResult>>(
    '/api/system/update/apply',
    undefined,
    { skipBusinessError: true } as Record<string, unknown>
  )
  return requireSuccess(res.data)
}

export async function restartSystem(): Promise<SystemUpdateCommandResult> {
  const res = await api.post<ApiResponse<SystemUpdateCommandResult>>(
    '/api/system/update/restart',
    undefined,
    { skipBusinessError: true } as Record<string, unknown>
  )
  return requireSuccess(res.data)
}
