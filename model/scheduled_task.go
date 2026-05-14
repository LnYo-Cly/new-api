package model

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	ScheduledTaskStatusIdle    = "idle"
	ScheduledTaskStatusRunning = "running"
	ScheduledTaskStatusSuccess = "success"
	ScheduledTaskStatusFailed  = "failed"

	ScheduledTaskTriggerAuto   = "auto"
	ScheduledTaskTriggerManual = "manual"
	ScheduledTaskTriggerBoot   = "startup"
)

type ScheduledTask struct {
	ID              int    `json:"id"`
	TaskKey         string `json:"task_key" gorm:"size:128;uniqueIndex"`
	Name            string `json:"name" gorm:"size:128;index"`
	Category        string `json:"category" gorm:"size:64;index"`
	Description     string `json:"description" gorm:"type:text"`
	Source          string `json:"source" gorm:"size:64"`
	ScheduleMode    string `json:"schedule_mode" gorm:"size:32"`
	IntervalSeconds int    `json:"interval_seconds"`
	Enabled         bool   `json:"enabled" gorm:"index;default:true"`
	CanManualRun    bool   `json:"can_manual_run" gorm:"default:false"`
	IsRunning       bool   `json:"is_running" gorm:"index;default:false"`
	LastStatus      string `json:"last_status" gorm:"size:32;index"`
	LastTrigger     string `json:"last_trigger" gorm:"size:32"`
	LastStartedAt   int64  `json:"last_started_at" gorm:"bigint;index"`
	LastFinishedAt  int64  `json:"last_finished_at" gorm:"bigint;index"`
	LastSuccessAt   int64  `json:"last_success_at" gorm:"bigint;index"`
	LastDurationMs  int64  `json:"last_duration_ms" gorm:"bigint"`
	LastError       string `json:"last_error" gorm:"type:text"`
	LastSummary     string `json:"last_summary" gorm:"type:text"`
	NextRunAt       int64  `json:"next_run_at" gorm:"bigint;index"`
	RunCount        int64  `json:"run_count" gorm:"bigint;default:0"`
	SuccessCount    int64  `json:"success_count" gorm:"bigint;default:0"`
	FailureCount    int64  `json:"failure_count" gorm:"bigint;default:0"`
	CreatedAt       int64  `json:"created_at" gorm:"bigint;autoCreateTime"`
	UpdatedAt       int64  `json:"updated_at" gorm:"bigint;autoUpdateTime"`
}

type ScheduledTaskRun struct {
	ID           int64  `json:"id"`
	TaskID       int    `json:"task_id" gorm:"index"`
	TaskKey      string `json:"task_key" gorm:"size:128;index"`
	TaskName     string `json:"task_name" gorm:"size:128"`
	Trigger      string `json:"trigger" gorm:"size:32;index"`
	Status       string `json:"status" gorm:"size:32;index"`
	StartedAt    int64  `json:"started_at" gorm:"bigint;index"`
	FinishedAt   int64  `json:"finished_at" gorm:"bigint;index"`
	DurationMs   int64  `json:"duration_ms" gorm:"bigint"`
	ErrorMessage string `json:"error_message" gorm:"type:text"`
	Summary      string `json:"summary" gorm:"type:text"`
	CreatedAt    int64  `json:"created_at" gorm:"bigint;autoCreateTime"`
	UpdatedAt    int64  `json:"updated_at" gorm:"bigint;autoUpdateTime"`
}

type ScheduledTaskDefinition struct {
	TaskKey         string
	Name            string
	Category        string
	Description     string
	Source          string
	ScheduleMode    string
	IntervalSeconds int
	Enabled         bool
	CanManualRun    bool
	RunNow          func(ctx context.Context) (string, error)
}

type scheduledTaskRuntime struct {
	def     ScheduledTaskDefinition
	running atomic.Bool
}

var (
	scheduledTaskRegistry sync.Map
)

func normalizeScheduledTaskDefinition(def ScheduledTaskDefinition) ScheduledTaskDefinition {
	def.TaskKey = strings.TrimSpace(def.TaskKey)
	def.Name = strings.TrimSpace(def.Name)
	def.Category = strings.TrimSpace(def.Category)
	def.Description = strings.TrimSpace(def.Description)
	def.Source = strings.TrimSpace(def.Source)
	def.ScheduleMode = strings.TrimSpace(def.ScheduleMode)
	if def.Name == "" {
		def.Name = def.TaskKey
	}
	if def.Category == "" {
		def.Category = "system"
	}
	if def.Source == "" {
		def.Source = "code"
	}
	if def.ScheduleMode == "" {
		def.ScheduleMode = "interval"
	}
	return def
}

func RegisterScheduledTask(def ScheduledTaskDefinition) {
	def = normalizeScheduledTaskDefinition(def)
	if def.TaskKey == "" {
		return
	}

	runtimeValue, loaded := scheduledTaskRegistry.LoadOrStore(def.TaskKey, &scheduledTaskRuntime{def: def})
	runtimeEntry := runtimeValue.(*scheduledTaskRuntime)
	if loaded {
		runtimeEntry.def = def
	}

	if DB == nil {
		return
	}

	record := ScheduledTask{
		TaskKey:         def.TaskKey,
		Name:            def.Name,
		Category:        def.Category,
		Description:     def.Description,
		Source:          def.Source,
		ScheduleMode:    def.ScheduleMode,
		IntervalSeconds: def.IntervalSeconds,
		Enabled:         def.Enabled,
		CanManualRun:    def.CanManualRun,
	}

	var task ScheduledTask
	err := DB.Where("task_key = ?", def.TaskKey).Assign(record).FirstOrCreate(&task).Error
	if err != nil {
		common.SysLog(fmt.Sprintf("failed to register scheduled task %s: %v", def.TaskKey, err))
	}
}

func SetScheduledTaskState(taskKey string, enabled bool, nextRunAt int64) {
	taskKey = strings.TrimSpace(taskKey)
	if taskKey == "" || DB == nil {
		return
	}

	updates := map[string]any{
		"enabled": enabled,
	}
	if nextRunAt >= 0 {
		updates["next_run_at"] = nextRunAt
	}
	if err := DB.Model(&ScheduledTask{}).Where("task_key = ?", taskKey).Updates(updates).Error; err != nil {
		common.SysLog(fmt.Sprintf("failed to update scheduled task state %s: %v", taskKey, err))
	}
}

func ObserveScheduledTaskRun(
	ctx context.Context,
	taskKey string,
	trigger string,
	nextRunAt int64,
	run func(context.Context) (string, error),
) (string, error) {
	taskKey = strings.TrimSpace(taskKey)
	if taskKey == "" {
		return "", errors.New("task key is required")
	}

	runtimeValue, ok := scheduledTaskRegistry.Load(taskKey)
	if !ok {
		RegisterScheduledTask(ScheduledTaskDefinition{
			TaskKey: taskKey,
			Name:    taskKey,
			Enabled: true,
		})
		runtimeValue, _ = scheduledTaskRegistry.Load(taskKey)
	}
	runtimeEntry := runtimeValue.(*scheduledTaskRuntime)

	if !runtimeEntry.running.CompareAndSwap(false, true) {
		return "", fmt.Errorf("scheduled task %s is already running", taskKey)
	}
	defer runtimeEntry.running.Store(false)

	if trigger == "" {
		trigger = ScheduledTaskTriggerAuto
	}

	startedAt := time.Now()
	runRecord := ScheduledTaskRun{
		TaskKey:   taskKey,
		TaskName:  runtimeEntry.def.Name,
		Trigger:   trigger,
		Status:    ScheduledTaskStatusRunning,
		StartedAt: startedAt.Unix(),
	}

	var taskRecord ScheduledTask
	if DB != nil {
		if err := DB.Where("task_key = ?", taskKey).First(&taskRecord).Error; err == nil {
			runRecord.TaskID = taskRecord.ID
		}
		if err := DB.Create(&runRecord).Error; err != nil {
			common.SysLog(fmt.Sprintf("failed to create scheduled task run for %s: %v", taskKey, err))
		}
		if err := DB.Model(&ScheduledTask{}).Where("task_key = ?", taskKey).Updates(map[string]any{
			"is_running":      true,
			"enabled":         runtimeEntry.def.Enabled,
			"last_status":     ScheduledTaskStatusRunning,
			"last_trigger":    trigger,
			"last_started_at": startedAt.Unix(),
		}).Error; err != nil {
			common.SysLog(fmt.Sprintf("failed to mark scheduled task %s running: %v", taskKey, err))
		}
	}

	summary, runErr := run(ctx)
	finishedAt := time.Now()
	durationMs := finishedAt.Sub(startedAt).Milliseconds()
	status := ScheduledTaskStatusSuccess
	errMsg := ""
	if runErr != nil {
		status = ScheduledTaskStatusFailed
		errMsg = runErr.Error()
	}

	if DB != nil {
		runUpdates := map[string]any{
			"status":        status,
			"finished_at":   finishedAt.Unix(),
			"duration_ms":   durationMs,
			"error_message": errMsg,
			"summary":       strings.TrimSpace(summary),
		}
		if runRecord.ID > 0 {
			if err := DB.Model(&ScheduledTaskRun{}).Where("id = ?", runRecord.ID).Updates(runUpdates).Error; err != nil {
				common.SysLog(fmt.Sprintf("failed to finish scheduled task run for %s: %v", taskKey, err))
			}
		}

		taskUpdates := map[string]any{
			"is_running":       false,
			"enabled":          runtimeEntry.def.Enabled,
			"last_status":      status,
			"last_trigger":     trigger,
			"last_finished_at": finishedAt.Unix(),
			"last_duration_ms": durationMs,
			"last_error":       errMsg,
			"last_summary":     strings.TrimSpace(summary),
			"run_count":        gorm.Expr("run_count + ?", 1),
		}
		if nextRunAt > 0 {
			taskUpdates["next_run_at"] = nextRunAt
		}
		if status == ScheduledTaskStatusSuccess {
			taskUpdates["last_success_at"] = finishedAt.Unix()
			taskUpdates["success_count"] = gorm.Expr("success_count + ?", 1)
		} else {
			taskUpdates["failure_count"] = gorm.Expr("failure_count + ?", 1)
		}
		if err := DB.Model(&ScheduledTask{}).Where("task_key = ?", taskKey).Updates(taskUpdates).Error; err != nil {
			common.SysLog(fmt.Sprintf("failed to update scheduled task %s after run: %v", taskKey, err))
		}
	}

	return summary, runErr
}

func ListScheduledTasks(startIdx int, pageSize int, category string, keyword string) ([]*ScheduledTask, int64, error) {
	var total int64
	query := DB.Model(&ScheduledTask{})
	if category = strings.TrimSpace(category); category != "" {
		query = query.Where("category = ?", category)
	}
	if keyword = strings.TrimSpace(keyword); keyword != "" {
		like := "%" + keyword + "%"
		query = query.Where("task_key LIKE ? OR name LIKE ? OR description LIKE ?", like, like, like)
	}
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	items := make([]*ScheduledTask, 0)
	err := query.Order("category asc").Order("name asc").Offset(startIdx).Limit(pageSize).Find(&items).Error
	return items, total, err
}

func GetScheduledTask(taskKey string) (*ScheduledTask, error) {
	var item ScheduledTask
	err := DB.Where("task_key = ?", strings.TrimSpace(taskKey)).First(&item).Error
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func ListScheduledTaskRuns(taskKey string, startIdx int, pageSize int) ([]*ScheduledTaskRun, int64, error) {
	var total int64
	query := DB.Model(&ScheduledTaskRun{}).Where("task_key = ?", strings.TrimSpace(taskKey))
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	items := make([]*ScheduledTaskRun, 0)
	err := query.Order("started_at desc").Order("id desc").Offset(startIdx).Limit(pageSize).Find(&items).Error
	return items, total, err
}

func TriggerScheduledTaskNow(ctx context.Context, taskKey string) error {
	runtimeValue, ok := scheduledTaskRegistry.Load(strings.TrimSpace(taskKey))
	if !ok {
		return fmt.Errorf("scheduled task %s is not registered", taskKey)
	}
	runtimeEntry := runtimeValue.(*scheduledTaskRuntime)
	if runtimeEntry.def.RunNow == nil {
		return fmt.Errorf("scheduled task %s does not support manual run", taskKey)
	}
	runCtx := context.Background()
	if ctx != nil {
		runCtx = context.WithoutCancel(ctx)
	}
	go func(def ScheduledTaskDefinition) {
		_, err := ObserveScheduledTaskRun(runCtx, def.TaskKey, ScheduledTaskTriggerManual, 0, def.RunNow)
		if err != nil {
			common.SysLog(fmt.Sprintf("failed to trigger scheduled task %s manually: %v", def.TaskKey, err))
		}
	}(runtimeEntry.def)
	return nil
}
