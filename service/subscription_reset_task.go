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

const (
	subscriptionResetTickInterval = 1 * time.Minute
	subscriptionResetBatchSize    = 300
	subscriptionCleanupInterval   = 30 * time.Minute
)

var (
	subscriptionResetOnce    sync.Once
	subscriptionResetRunning atomic.Bool
	subscriptionCleanupLast  atomic.Int64
)

func StartSubscriptionQuotaResetTask() {
	subscriptionResetOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		model.RegisterScheduledTask(model.ScheduledTaskDefinition{
			TaskKey:         "subscription_quota_reset",
			Name:            "Subscription Quota Reset",
			Category:        "billing",
			Description:     "Expire due subscriptions, reset quotas, and clean pre-consume records.",
			Source:          "service.subscription_reset_task",
			ScheduleMode:    "interval",
			IntervalSeconds: int(subscriptionResetTickInterval / time.Second),
			Enabled:         true,
			CanManualRun:    true,
			RunNow: func(ctx context.Context) (string, error) {
				runSubscriptionQuotaResetOnce()
				return "subscription quota maintenance completed", nil
			},
		})
		gopool.Go(func() {
			logger.LogInfo(context.Background(), fmt.Sprintf("subscription quota reset task started: tick=%s", subscriptionResetTickInterval))
			ticker := time.NewTicker(subscriptionResetTickInterval)
			defer ticker.Stop()

			nextRunAt := time.Now().Add(subscriptionResetTickInterval).Unix()
			model.SetScheduledTaskState("subscription_quota_reset", true, nextRunAt)
			_, _ = model.ObserveScheduledTaskRun(context.Background(), "subscription_quota_reset", model.ScheduledTaskTriggerBoot, nextRunAt, func(ctx context.Context) (string, error) {
				runSubscriptionQuotaResetOnce()
				return "subscription quota maintenance completed", nil
			})
			for range ticker.C {
				nextRunAt = time.Now().Add(subscriptionResetTickInterval).Unix()
				model.SetScheduledTaskState("subscription_quota_reset", true, nextRunAt)
				_, _ = model.ObserveScheduledTaskRun(context.Background(), "subscription_quota_reset", model.ScheduledTaskTriggerAuto, nextRunAt, func(ctx context.Context) (string, error) {
					runSubscriptionQuotaResetOnce()
					return "subscription quota maintenance completed", nil
				})
			}
		})
	})
}

func runSubscriptionQuotaResetOnce() {
	if !subscriptionResetRunning.CompareAndSwap(false, true) {
		return
	}
	defer subscriptionResetRunning.Store(false)

	ctx := context.Background()
	totalReset := 0
	totalExpired := 0
	for {
		n, err := model.ExpireDueSubscriptions(subscriptionResetBatchSize)
		if err != nil {
			logger.LogWarn(ctx, fmt.Sprintf("subscription expire task failed: %v", err))
			return
		}
		if n == 0 {
			break
		}
		totalExpired += n
		if n < subscriptionResetBatchSize {
			break
		}
	}
	for {
		n, err := model.ResetDueSubscriptions(subscriptionResetBatchSize)
		if err != nil {
			logger.LogWarn(ctx, fmt.Sprintf("subscription quota reset task failed: %v", err))
			return
		}
		if n == 0 {
			break
		}
		totalReset += n
		if n < subscriptionResetBatchSize {
			break
		}
	}
	lastCleanup := time.Unix(subscriptionCleanupLast.Load(), 0)
	if time.Since(lastCleanup) >= subscriptionCleanupInterval {
		if _, err := model.CleanupSubscriptionPreConsumeRecords(7 * 24 * 3600); err == nil {
			subscriptionCleanupLast.Store(time.Now().Unix())
		}
	}
	if common.DebugEnabled && (totalReset > 0 || totalExpired > 0) {
		logger.LogDebug(ctx, "subscription maintenance: reset_count=%d, expired_count=%d", totalReset, totalExpired)
	}
}
