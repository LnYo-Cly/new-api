package service

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
)

const (
	codexPoolInflightTTL = 10 * time.Minute
	codexPoolKeyPrefix   = "codex_account_pool"
)

var codexInflightFallback sync.Map
var codexCooldownFallback sync.Map

func init() {
	model.ChannelScheduleFilter = func(channel *model.Channel) (bool, string) {
		return ShouldSkipCodexChannelForScheduling(nil, channel)
	}
	model.ChannelWeightMultiplier = CodexChannelWeightMultiplier
}

type codexInflightCounter struct {
	mu    sync.Mutex
	count int
}

type CodexInflightHandle struct {
	ChannelID int
	Acquired  bool
	released  bool
	release   func()
}

func (h *CodexInflightHandle) Release() {
	if h == nil || !h.Acquired || h.released {
		return
	}
	h.released = true
	if h.release != nil {
		h.release()
	}
}

type CodexScheduleState struct {
	Status      string `json:"status"`
	CooldownTTL int64  `json:"cooldown_ttl,omitempty"`
	Inflight    int64  `json:"inflight,omitempty"`
	MaxInflight int    `json:"max_inflight,omitempty"`
	Reason      string `json:"reason,omitempty"`
}

type CodexRelayFailureAction struct {
	Retryable     bool
	Status        string
	CooldownUntil int64
	Disable       bool
	Message       string
}

func IsCodexChannel(channel *model.Channel) bool {
	return channel != nil && channel.Type == constant.ChannelTypeCodex && !channel.ChannelInfo.IsMultiKey
}

func CodexChannelMaxInflight(channel *model.Channel) int {
	if !IsCodexChannel(channel) {
		return 0
	}
	otherSettings := channel.GetOtherSettings()
	if otherSettings.CodexMaxInflight < 0 {
		return 0
	}
	return otherSettings.CodexMaxInflight
}

func CodexChannelSoftInflight(channel *model.Channel) int {
	if !IsCodexChannel(channel) {
		return 0
	}
	otherSettings := channel.GetOtherSettings()
	if otherSettings.CodexSoftInflight < 0 {
		return 0
	}
	return otherSettings.CodexSoftInflight
}

func codexPoolRedisOn() bool {
	return common.RedisEnabled && common.RDB != nil
}

func codexCooldownKey(channelID int) string {
	return fmt.Sprintf("%s:cooldown:%d", codexPoolKeyPrefix, channelID)
}

func codexInflightKey(channelID int) string {
	return fmt.Sprintf("%s:inflight:%d", codexPoolKeyPrefix, channelID)
}

func codexContextScheduleStateKey(channelID int) string {
	return fmt.Sprintf("codex_schedule_state_%d", channelID)
}

func GetCodexAccountInflight(channelID int) int64 {
	if channelID <= 0 {
		return 0
	}
	if codexPoolRedisOn() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		value, err := common.RDB.Get(ctx, codexInflightKey(channelID)).Int64()
		if err == nil {
			if value < 0 {
				return 0
			}
			return value
		}
		return 0
	}
	raw, ok := codexInflightFallback.Load(channelID)
	if !ok {
		return 0
	}
	counter, ok := raw.(*codexInflightCounter)
	if !ok || counter == nil {
		return 0
	}
	counter.mu.Lock()
	defer counter.mu.Unlock()
	if counter.count < 0 {
		return 0
	}
	return int64(counter.count)
}

func AcquireCodexInflight(channel *model.Channel) (*CodexInflightHandle, bool, string) {
	maxInflight := CodexChannelMaxInflight(channel)
	if maxInflight <= 0 {
		return &CodexInflightHandle{ChannelID: channel.Id, Acquired: true}, true, ""
	}

	channelID := channel.Id
	if codexPoolRedisOn() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		key := codexInflightKey(channelID)
		next, err := common.RDB.Incr(ctx, key).Result()
		if err != nil {
			return acquireCodexInflightMemory(channelID, maxInflight)
		}
		_ = common.RDB.Expire(ctx, key, codexPoolInflightTTL).Err()
		if next > int64(maxInflight) {
			_ = common.RDB.Decr(ctx, key).Err()
			return nil, false, fmt.Sprintf("codex channel inflight limit reached: %d/%d", next-1, maxInflight)
		}
		return &CodexInflightHandle{
			ChannelID: channelID,
			Acquired:  true,
			release: func() {
				ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
				defer cancel()
				value, err := common.RDB.Decr(ctx, key).Result()
				if err == nil && value <= 0 {
					_ = common.RDB.Del(ctx, key).Err()
				}
			},
		}, true, ""
	}
	return acquireCodexInflightMemory(channelID, maxInflight)
}

func acquireCodexInflightMemory(channelID int, maxInflight int) (*CodexInflightHandle, bool, string) {
	raw, _ := codexInflightFallback.LoadOrStore(channelID, &codexInflightCounter{})
	counter := raw.(*codexInflightCounter)
	counter.mu.Lock()
	defer counter.mu.Unlock()
	if counter.count >= maxInflight {
		return nil, false, fmt.Sprintf("codex channel inflight limit reached: %d/%d", counter.count, maxInflight)
	}
	counter.count++
	return &CodexInflightHandle{
		ChannelID: channelID,
		Acquired:  true,
		release: func() {
			counter.mu.Lock()
			defer counter.mu.Unlock()
			if counter.count > 0 {
				counter.count--
			}
		},
	}, true, ""
}

func SetCodexChannelCooldown(channelID int, until int64) {
	if channelID <= 0 || until <= common.GetTimestamp() {
		return
	}
	ttl := time.Duration(until-common.GetTimestamp()) * time.Second
	if ttl <= 0 {
		return
	}
	if codexPoolRedisOn() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = common.RDB.Set(ctx, codexCooldownKey(channelID), fmt.Sprintf("%d", until), ttl).Err()
	}
	codexCooldownFallback.Store(channelID, until)
}

func ClearCodexChannelCooldown(channelID int) {
	if channelID <= 0 {
		return
	}
	if codexPoolRedisOn() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = common.RDB.Del(ctx, codexCooldownKey(channelID)).Err()
	}
	codexCooldownFallback.Delete(channelID)
}

func ClearCodexChannelInflight(channelID int) {
	if channelID <= 0 {
		return
	}
	if codexPoolRedisOn() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = common.RDB.Del(ctx, codexInflightKey(channelID)).Err()
	}
	codexInflightFallback.Delete(channelID)
}

func ClearCodexChannelPoolState(channelID int) {
	ClearCodexChannelCooldown(channelID)
	ClearCodexChannelInflight(channelID)
}

func GetCodexChannelCooldownUntil(channel *model.Channel) int64 {
	if !IsCodexChannel(channel) {
		return 0
	}
	now := common.GetTimestamp()
	if codexPoolRedisOn() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		value, err := common.RDB.Get(ctx, codexCooldownKey(channel.Id)).Int64()
		if err == nil && value > now {
			return value
		}
		if err != nil && err != redis.Nil {
			common.SysLog(fmt.Sprintf("failed to read codex channel cooldown: channel_id=%d err=%v", channel.Id, err))
		}
	}
	if raw, ok := codexCooldownFallback.Load(channel.Id); ok {
		if until, ok := raw.(int64); ok && until > now {
			return until
		}
		codexCooldownFallback.Delete(channel.Id)
	}
	if summary, ok := ReadCodexAccountStatusFromOtherInfo(channel.OtherInfo); ok && summary.CooldownUntil > now {
		return summary.CooldownUntil
	}
	return 0
}

func GetCodexChannelScheduleState(channel *model.Channel) CodexScheduleState {
	if !IsCodexChannel(channel) {
		return CodexScheduleState{Status: CodexAccountStatusUnknown}
	}
	status := GetCodexAccountStatusValue(channel.OtherInfo)
	state := CodexScheduleState{Status: status}
	if until := GetCodexChannelCooldownUntil(channel); until > common.GetTimestamp() {
		state.CooldownTTL = until - common.GetTimestamp()
	}
	state.Inflight = GetCodexAccountInflight(channel.Id)
	state.MaxInflight = CodexChannelMaxInflight(channel)
	return state
}

func ShouldSkipCodexChannelForScheduling(c *gin.Context, channel *model.Channel) (bool, string) {
	if !IsCodexChannel(channel) {
		return false, ""
	}
	status := GetCodexAccountStatusValue(channel.OtherInfo)
	switch status {
	case CodexAccountStatusCredentialInvalid:
		return true, "codex credential invalid"
	case CodexAccountStatusLimited, CodexAccountStatusTempUnavailable:
		if until := GetCodexChannelCooldownUntil(channel); until > common.GetTimestamp() {
			return true, fmt.Sprintf("codex channel cooling down for %ds", until-common.GetTimestamp())
		}
	}
	maxInflight := CodexChannelMaxInflight(channel)
	if maxInflight > 0 {
		inflight := GetCodexAccountInflight(channel.Id)
		if inflight >= int64(maxInflight) {
			if c != nil {
				c.Set(codexContextScheduleStateKey(channel.Id), CodexScheduleState{
					Status:      status,
					Inflight:    inflight,
					MaxInflight: maxInflight,
					Reason:      "inflight limit reached",
				})
			}
			return true, fmt.Sprintf("codex channel inflight limit reached: %d/%d", inflight, maxInflight)
		}
	}
	if c != nil {
		c.Set(codexContextScheduleStateKey(channel.Id), GetCodexChannelScheduleState(channel))
	}
	return false, ""
}

func CodexChannelWeightMultiplier(channel *model.Channel) float64 {
	if !IsCodexChannel(channel) {
		return 1
	}
	softInflight := CodexChannelSoftInflight(channel)
	if softInflight <= 0 {
		return 1
	}
	inflight := GetCodexAccountInflight(channel.Id)
	if inflight < int64(softInflight) {
		return 1
	}
	over := inflight - int64(softInflight) + 1
	multiplier := 1 / float64(over+1)
	if multiplier < 0.1 {
		return 0.1
	}
	return multiplier
}

func GetCodexFailoverMaxAttempts() int {
	if common.CodexFailoverMaxAttempts > 0 {
		return common.CodexFailoverMaxAttempts
	}
	return 10_000
}

func GetCodexFailoverMaxDuration() time.Duration {
	seconds := common.CodexFailoverMaxDurationSeconds
	if seconds <= 0 {
		seconds = 180
	}
	if seconds > 300 {
		seconds = 300
	}
	return time.Duration(seconds) * time.Second
}

func ClassifyCodexRelayFailure(err *types.NewAPIError) CodexRelayFailureAction {
	if err == nil {
		return CodexRelayFailureAction{}
	}
	message := strings.TrimSpace(err.Error())
	statusCode := err.StatusCode
	if isCodexRequestShapeError(err, message, statusCode) {
		return CodexRelayFailureAction{
			Retryable: false,
			Status:    "",
			Message:   message,
		}
	}
	action := CodexRelayFailureAction{
		Retryable: false,
		Status:    CodexAccountStatusQueryFailed,
		Message:   message,
	}

	credentialInvalid := IsCodexCredentialInvalidError(err)
	if credentialInvalid || statusCode == http.StatusUnauthorized {
		action.Retryable = true
		action.Status = CodexAccountStatusCredentialInvalid
		action.Disable = credentialInvalid
		return action
	}
	if statusCode == http.StatusForbidden {
		action.Retryable = true
		action.Status = CodexAccountStatusQueryFailed
		return action
	}
	if statusCode == http.StatusTooManyRequests || isCodexLimitMessage(message) {
		action.Retryable = true
		action.Status = CodexAccountStatusLimited
		action.CooldownUntil = common.GetTimestamp() + int64((10 * time.Minute).Seconds())
		return action
	}
	if statusCode >= http.StatusInternalServerError && statusCode <= 599 {
		action.Retryable = true
		action.Status = CodexAccountStatusTempUnavailable
		cooldownSeconds := common.CodexTempUnavailableCooldownSeconds
		if cooldownSeconds < 0 {
			cooldownSeconds = 0
		}
		if cooldownSeconds > 0 {
			action.CooldownUntil = common.GetTimestamp() + int64(cooldownSeconds)
		}
		return action
	}
	if types.IsChannelError(err) || err.GetErrorCode() == types.ErrorCodeDoRequestFailed {
		action.Retryable = true
		action.Status = CodexAccountStatusTempUnavailable
		cooldownSeconds := common.CodexTempUnavailableCooldownSeconds
		if cooldownSeconds > 0 {
			action.CooldownUntil = common.GetTimestamp() + int64(cooldownSeconds)
		}
		return action
	}
	return action
}

func isCodexRequestShapeError(err *types.NewAPIError, message string, statusCode int) bool {
	if err == nil {
		return false
	}
	lower := strings.ToLower(strings.TrimSpace(message))
	if lower == "" {
		return false
	}
	switch {
	case strings.Contains(lower, "client_gone"),
		strings.Contains(lower, "context canceled"),
		strings.Contains(lower, "client disconnected"),
		strings.Contains(lower, "client closed"),
		strings.Contains(lower, "broken pipe"),
		strings.Contains(lower, "connection reset by peer"):
		return true
	case strings.Contains(lower, "stream must be set to true"),
		strings.Contains(lower, "stream must be true"),
		strings.Contains(lower, "items are not persisted when `store` is set to false"),
		strings.Contains(lower, "item with id 'rs_"),
		strings.Contains(lower, "previous_response_not_found"),
		strings.Contains(lower, "model is not supported when using codex with a chatgpt account"),
		strings.Contains(lower, "not supported when using codex with a chatgpt account"),
		strings.Contains(lower, "codex channel: /v1/chat/completions endpoint not supported"),
		strings.Contains(lower, "codex channel: endpoint not supported"),
		strings.Contains(lower, "client_version"):
		return true
	}
	return false
}

func isCodexLimitMessage(message string) bool {
	lower := strings.ToLower(message)
	return strings.Contains(lower, "rate limit") ||
		strings.Contains(lower, "limit_reached") ||
		strings.Contains(lower, "quota exceeded") ||
		strings.Contains(lower, "quota_exceeded") ||
		strings.Contains(lower, "quota exhausted") ||
		strings.Contains(lower, "quota_exhausted") ||
		strings.Contains(lower, "insufficient_quota") ||
		strings.Contains(lower, "too many requests")
}

func MarkCodexChannelRelayFailure(channel *model.Channel, err *types.NewAPIError) CodexRelayFailureAction {
	action := ClassifyCodexRelayFailure(err)
	if !IsCodexChannel(channel) || action.Status == "" {
		return action
	}
	summary := CodexAccountStatusSummary{
		Status:         action.Status,
		Message:        action.Message,
		UpstreamStatus: err.StatusCode,
		CheckedAt:      common.GetTimestamp(),
		CooldownUntil:  action.CooldownUntil,
	}
	if existing, ok := ReadCodexAccountStatusFromOtherInfo(channel.OtherInfo); ok {
		summary.PlanType = existing.PlanType
		summary.Email = existing.Email
		summary.AccountID = existing.AccountID
		summary.UserID = existing.UserID
		summary.Windows = existing.Windows
		summary.FiveHourWindow = existing.FiveHourWindow
		summary.WeeklyWindow = existing.WeeklyWindow
	}
	otherInfo := MergeCodexAccountStatusIntoOtherInfo(channel.OtherInfo, summary)
	if otherInfo != channel.OtherInfo {
		if updateErr := model.DB.Model(&model.Channel{}).Where("id = ?", channel.Id).Update("other_info", otherInfo).Error; updateErr != nil {
			common.SysLog(fmt.Sprintf("failed to update codex relay failure status: channel_id=%d err=%v", channel.Id, updateErr))
		} else {
			channel.OtherInfo = otherInfo
			model.CacheUpdateChannel(channel)
		}
	}
	if action.CooldownUntil > common.GetTimestamp() {
		SetCodexChannelCooldown(channel.Id, action.CooldownUntil)
	}
	return action
}

func MarkCodexChannelAvailable(channel *model.Channel) {
	if !IsCodexChannel(channel) {
		return
	}
	ClearCodexChannelCooldown(channel.Id)
	summary := CodexAccountStatusSummary{
		Status:    CodexAccountStatusAvailable,
		CheckedAt: common.GetTimestamp(),
	}
	if existing, ok := ReadCodexAccountStatusFromOtherInfo(channel.OtherInfo); ok {
		summary.PlanType = existing.PlanType
		summary.Email = existing.Email
		summary.AccountID = existing.AccountID
		summary.UserID = existing.UserID
		summary.Windows = existing.Windows
		summary.FiveHourWindow = existing.FiveHourWindow
		summary.WeeklyWindow = existing.WeeklyWindow
	}
	otherInfo := MergeCodexAccountStatusIntoOtherInfo(channel.OtherInfo, summary)
	if otherInfo == channel.OtherInfo {
		return
	}
	if err := model.DB.Model(&model.Channel{}).Where("id = ?", channel.Id).Update("other_info", otherInfo).Error; err != nil {
		common.SysLog(fmt.Sprintf("failed to mark codex channel available: channel_id=%d err=%v", channel.Id, err))
		return
	}
	channel.OtherInfo = otherInfo
	model.CacheUpdateChannel(channel)
}

func ShouldBypassAffinitySkipForCodex(c *gin.Context, channel *model.Channel, err *types.NewAPIError) bool {
	if c == nil || !IsCodexChannel(channel) || err == nil {
		return false
	}
	return serviceBoolFromContext(c, "codex_pool_failover_enabled") && ClassifyCodexRelayFailure(err).Retryable
}

func EnableCodexPoolFailoverForRequest(c *gin.Context) {
	if c != nil {
		c.Set("codex_pool_failover_enabled", true)
	}
}

func serviceBoolFromContext(c *gin.Context, key string) bool {
	if c == nil {
		return false
	}
	value, ok := c.Get(key)
	if !ok {
		return false
	}
	boolValue, ok := value.(bool)
	return ok && boolValue
}
