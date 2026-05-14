import { api } from '@/lib/api'
import type {
  PageResult,
  ScheduledTaskItem,
  ScheduledTaskRunItem,
} from './types'

export async function getScheduledTasks(params: {
  p?: number
  page_size?: number
  category?: string
  keyword?: string
}): Promise<{ success: boolean; message?: string; data?: PageResult<ScheduledTaskItem> }> {
  const res = await api.get('/api/scheduled_tasks', { params })
  return res.data
}

export async function getScheduledTaskRuns(
  taskKey: string,
  params: {
    p?: number
    page_size?: number
  }
): Promise<{
  success: boolean
  message?: string
  data?: PageResult<ScheduledTaskRunItem>
}> {
  const res = await api.get(`/api/scheduled_tasks/${taskKey}/runs`, { params })
  return res.data
}

export async function runScheduledTaskNow(taskKey: string): Promise<{
  success: boolean
  message?: string
}> {
  const res = await api.post(`/api/scheduled_tasks/${taskKey}/run`)
  return res.data
}
