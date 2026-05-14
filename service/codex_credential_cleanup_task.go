package service

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"

	"github.com/bytedance/gopkg/util/gopool"
)

const codexCredentialCleanupTickInterval = 30 * time.Minute

var (
	codexCredentialCleanupOnce    sync.Once
	codexCredentialCleanupRunning atomic.Bool
)

func StartCodexCredentialCleanupTask() {
	codexCredentialCleanupOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		model.RegisterScheduledTask(model.ScheduledTaskDefinition{
			TaskKey:         "codex_credential_cleanup",
			Name:            "Codex Credential Cleanup",
			Category:        "codex",
			Description:     "Delete Codex channels whose credential status is marked invalid.",
			Source:          "service.codex_credential_cleanup_task",
			ScheduleMode:    "interval",
			IntervalSeconds: int(codexCredentialCleanupTickInterval / time.Second),
			Enabled:         true,
			CanManualRun:    true,
			RunNow: func(ctx context.Context) (string, error) {
				return runCodexCredentialCleanupOnce()
			},
		})

		gopool.Go(func() {
			logger.LogInfo(context.Background(), fmt.Sprintf("codex credential cleanup task started: tick=%s", codexCredentialCleanupTickInterval))

			ticker := time.NewTicker(codexCredentialCleanupTickInterval)
			defer ticker.Stop()

			nextRunAt := time.Now().Add(codexCredentialCleanupTickInterval).Unix()
			model.SetScheduledTaskState("codex_credential_cleanup", true, nextRunAt)
			for range ticker.C {
				nextRunAt = time.Now().Add(codexCredentialCleanupTickInterval).Unix()
				model.SetScheduledTaskState("codex_credential_cleanup", true, nextRunAt)
				_, _ = model.ObserveScheduledTaskRun(context.Background(), "codex_credential_cleanup", model.ScheduledTaskTriggerAuto, nextRunAt, func(ctx context.Context) (string, error) {
					return runCodexCredentialCleanupOnce()
				})
			}
		})
	})
}

func runCodexCredentialCleanupOnce() (string, error) {
	if !codexCredentialCleanupRunning.CompareAndSwap(false, true) {
		return "codex credential cleanup already running", nil
	}
	defer codexCredentialCleanupRunning.Store(false)

	rows, err := model.DeleteCredentialInvalidCodexChannels()
	if err != nil {
		return "", err
	}

	summary := fmt.Sprintf("deleted %d credential-invalid codex channels", rows)
	logger.LogInfo(context.Background(), "codex credential cleanup: "+summary)
	return summary, nil
}
