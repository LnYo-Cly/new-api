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
  operation_status?: SystemUpdateOperationStatus
}

export type SystemUpdateOperationStatus = {
  running: boolean
  action?: string
  operation_id?: string
  started_at?: number
}

export type SystemUpdateCommandResult = {
  message: string
  operation_id?: string
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

export async function getSystemUpdateOperationStatus(): Promise<SystemUpdateOperationStatus> {
  const res = await api.get<ApiResponse<SystemUpdateOperationStatus>>(
    '/api/system/update/status',
    {
      disableDuplicate: true,
      skipBusinessError: true,
    } as Record<string, unknown>
  )
  return requireSuccess(res.data)
}

export async function getSystemRuntimeStatus(): Promise<
  Record<string, unknown>
> {
  const res = await api.get<ApiResponse<Record<string, unknown>>>(
    '/api/status',
    {
      disableDuplicate: true,
      skipBusinessError: true,
      skipErrorHandler: true,
    } as Record<string, unknown>
  )
  return requireSuccess(res.data)
}

export async function applySystemUpdate(
  operationId: string
): Promise<SystemUpdateCommandResult> {
  const res = await api.post<ApiResponse<SystemUpdateCommandResult>>(
    '/api/system/update/apply',
    { operation_id: operationId },
    { skipBusinessError: true } as Record<string, unknown>
  )
  return requireSuccess(res.data)
}

export async function restartSystem(
  operationId: string
): Promise<SystemUpdateCommandResult> {
  const res = await api.post<ApiResponse<SystemUpdateCommandResult>>(
    '/api/system/update/restart',
    { operation_id: operationId },
    { skipBusinessError: true } as Record<string, unknown>
  )
  return requireSuccess(res.data)
}
