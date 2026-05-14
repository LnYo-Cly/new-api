export interface ScheduledTaskItem {
  id: number
  task_key: string
  name: string
  category: string
  description: string
  source: string
  schedule_mode: string
  interval_seconds: number
  enabled: boolean
  can_manual_run: boolean
  is_running: boolean
  last_status: string
  last_trigger: string
  last_started_at: number
  last_finished_at: number
  last_success_at: number
  last_duration_ms: number
  last_error: string
  last_summary: string
  next_run_at: number
  run_count: number
  success_count: number
  failure_count: number
}

export interface ScheduledTaskRunItem {
  id: number
  task_id: number
  task_key: string
  task_name: string
  trigger: string
  status: string
  started_at: number
  finished_at: number
  duration_ms: number
  error_message: string
  summary: string
}

export interface PageResult<T> {
  page: number
  page_size: number
  total: number
  items: T[]
}
