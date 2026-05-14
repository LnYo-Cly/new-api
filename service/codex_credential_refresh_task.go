package service

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/types"

	"github.com/bytedance/gopkg/util/gopool"
)

const (
	codexCredentialRefreshTickInterval = 10 * time.Minute
	codexCredentialRefreshThreshold    = 24 * time.Hour
	codexCredentialRefreshBatchSize    = 200
	codexCredentialRefreshTimeout      = 15 * time.Second
)

var (
	codexCredentialRefreshOnce    sync.Once
	codexCredentialRefreshRunning atomic.Bool
)

func shouldAutoRefreshCodexChannelStatus(status int) bool {
	return status == common.ChannelStatusEnabled || status == common.ChannelStatusAutoDisabled
}

func StartCodexCredentialAutoRefreshTask() {
	codexCredentialRefreshOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		model.RegisterScheduledTask(ScheduledTaskDefinition{
			TaskKey:         "codex_credential_refresh",
			Name:            "Codex Credential Refresh",
			Category:        "codex",
			Description:     "Refresh Codex OAuth credentials before they expire.",
			Source:          "service.codex_credential_refresh_task",
			ScheduleMode:    "interval",
			IntervalSeconds: int(codexCredentialRefreshTickInterval / time.Second),
			Enabled:         true,
			CanManualRun:    true,
			RunNow: func(ctx context.Context) (string, error) {
				runCodexCredentialAutoRefreshOnce()
				return "codex credential refresh sweep completed", nil
			},
		})

		gopool.Go(func() {
			logger.LogInfo(context.Background(), fmt.Sprintf("codex credential auto-refresh task started: tick=%s threshold=%s", codexCredentialRefreshTickInterval, codexCredentialRefreshThreshold))

			ticker := time.NewTicker(codexCredentialRefreshTickInterval)
			defer ticker.Stop()

			nextRunAt := time.Now().Add(codexCredentialRefreshTickInterval).Unix()
			model.SetScheduledTaskState("codex_credential_refresh", true, nextRunAt)
			_, _ = model.ObserveScheduledTaskRun(context.Background(), "codex_credential_refresh", model.ScheduledTaskTriggerBoot, nextRunAt, func(ctx context.Context) (string, error) {
				runCodexCredentialAutoRefreshOnce()
				return "codex credential refresh sweep completed", nil
			})
			for range ticker.C {
				nextRunAt = time.Now().Add(codexCredentialRefreshTickInterval).Unix()
				model.SetScheduledTaskState("codex_credential_refresh", true, nextRunAt)
				_, _ = model.ObserveScheduledTaskRun(context.Background(), "codex_credential_refresh", model.ScheduledTaskTriggerAuto, nextRunAt, func(ctx context.Context) (string, error) {
					runCodexCredentialAutoRefreshOnce()
					return "codex credential refresh sweep completed", nil
				})
			}
		})
	})
}

func runCodexCredentialAutoRefreshOnce() {
	if !codexCredentialRefreshRunning.CompareAndSwap(false, true) {
		return
	}
	defer codexCredentialRefreshRunning.Store(false)

	ctx := context.Background()
	now := time.Now()

	var refreshed int
	var scanned int

	offset := 0
	for {
		var channels []*model.Channel
		err := model.DB.
			Select("id", "name", "key", "status", "channel_info").
			Where("type = ? AND (status = ? OR status = ?)",
				constant.ChannelTypeCodex,
				common.ChannelStatusEnabled,
				common.ChannelStatusAutoDisabled,
			).
			Order("id asc").
			Limit(codexCredentialRefreshBatchSize).
			Offset(offset).
			Find(&channels).Error
		if err != nil {
			logger.LogError(ctx, fmt.Sprintf("codex credential auto-refresh: query channels failed: %v", err))
			return
		}
		if len(channels) == 0 {
			break
		}
		offset += codexCredentialRefreshBatchSize

		for _, ch := range channels {
			if ch == nil {
				continue
			}
			scanned++
			if ch.ChannelInfo.IsMultiKey {
				continue
			}

			rawKey := strings.TrimSpace(ch.Key)
			if rawKey == "" {
				continue
			}

			oauthKey, err := parseCodexOAuthKey(rawKey)
			if err != nil {
				continue
			}

			refreshToken := strings.TrimSpace(oauthKey.RefreshToken)
			if refreshToken == "" {
				continue
			}

			expiredAtRaw := strings.TrimSpace(oauthKey.Expired)
			expiredAt, err := time.Parse(time.RFC3339, expiredAtRaw)
			if err == nil && !expiredAt.IsZero() && expiredAt.Sub(now) > codexCredentialRefreshThreshold {
				continue
			}

			refreshCtx, cancel := context.WithTimeout(ctx, codexCredentialRefreshTimeout)
			newKey, _, err := RefreshCodexChannelCredential(refreshCtx, ch.Id, CodexCredentialRefreshOptions{ResetCaches: false})
			cancel()
			if err != nil {
				logger.LogWarn(ctx, fmt.Sprintf("codex credential auto-refresh: channel_id=%d name=%s refresh failed: %v", ch.Id, ch.Name, err))
				if IsCodexCredentialInvalidError(err) && ch.GetAutoBan() {
					DisableChannel(*types.NewChannelError(ch.Id, ch.Type, ch.Name, ch.ChannelInfo.IsMultiKey, "", ch.GetAutoBan()), err.Error())
				}
				continue
			}

			refreshed++
			logger.LogInfo(ctx, fmt.Sprintf("codex credential auto-refresh: channel_id=%d name=%s refreshed, expires_at=%s", ch.Id, ch.Name, newKey.Expired))
		}
	}

	if refreshed > 0 {
		func() {
			defer func() {
				if r := recover(); r != nil {
					logger.LogWarn(ctx, fmt.Sprintf("codex credential auto-refresh: InitChannelCache panic: %v", r))
				}
			}()
			model.InitChannelCache()
		}()
		ResetProxyClientCache()
	}

	if common.DebugEnabled {
		logger.LogDebug(ctx, "codex credential auto-refresh: scanned=%d refreshed=%d", scanned, refreshed)
	}
}
