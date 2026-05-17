package service

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
)

const (
	CodexAccountStatusKey               = "codex_account"
	CodexAccountStatusAvailable         = "available"
	CodexAccountStatusQuotaExhausted    = "quota_exhausted"
	CodexAccountStatusLimited           = "limited"
	CodexAccountStatusCredentialInvalid = "credential_invalid"
	CodexAccountStatusTempUnavailable   = "temp_unavailable"
	CodexAccountStatusQueryFailed       = "query_failed"
	CodexAccountStatusUnknown           = "unknown"
	CodexAccountStatusNotChecked        = "not_checked"

	CodexRateLimitWindowFiveHour = "five_hour"
	CodexRateLimitWindowWeekly   = "weekly"
	CodexRateLimitWindowUnknown  = "unknown"
)

type CodexRateLimitWindowSummary struct {
	UsedPercent       int    `json:"used_percent"`
	ResetAt           int64  `json:"reset_at,omitempty"`
	ResetAfterSeconds int64  `json:"reset_after_seconds,omitempty"`
	WindowSeconds     int64  `json:"window_seconds,omitempty"`
	Label             string `json:"label,omitempty"`
}

type CodexAccountStatusSummary struct {
	Status         string                        `json:"status"`
	Message        string                        `json:"message,omitempty"`
	UpstreamStatus int                           `json:"upstream_status,omitempty"`
	CheckedAt      int64                         `json:"checked_at,omitempty"`
	CooldownUntil  int64                         `json:"cooldown_until,omitempty"`
	PlanType       string                        `json:"plan_type,omitempty"`
	Email          string                        `json:"email,omitempty"`
	AccountID      string                        `json:"account_id,omitempty"`
	UserID         string                        `json:"user_id,omitempty"`
	Windows        []CodexRateLimitWindowSummary `json:"windows,omitempty"`
	FiveHourWindow *CodexRateLimitWindowSummary  `json:"five_hour_window,omitempty"`
	WeeklyWindow   *CodexRateLimitWindowSummary  `json:"weekly_window,omitempty"`
	Raw            map[string]interface{}        `json:"-"`
}

func NormalizeCodexAccountStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case CodexAccountStatusQuotaExhausted:
		return CodexAccountStatusLimited
	case CodexAccountStatusAvailable,
		CodexAccountStatusLimited,
		CodexAccountStatusCredentialInvalid,
		CodexAccountStatusTempUnavailable,
		CodexAccountStatusQueryFailed,
		CodexAccountStatusNotChecked,
		CodexAccountStatusUnknown:
		return strings.ToLower(strings.TrimSpace(status))
	default:
		return CodexAccountStatusUnknown
	}
}

func NewCodexAccountQueryFailedSummary(statusCode int, message string) CodexAccountStatusSummary {
	status := CodexAccountStatusQueryFailed
	messageHasCredentialSignal := IsCodexCredentialInvalidError(fmt.Errorf("%s", message))
	if statusCode == http.StatusBadRequest || statusCode == http.StatusUnauthorized ||
		(statusCode == http.StatusForbidden && messageHasCredentialSignal) ||
		messageHasCredentialSignal {
		status = CodexAccountStatusCredentialInvalid
	} else if statusCode == http.StatusTooManyRequests {
		status = CodexAccountStatusLimited
	} else if statusCode >= http.StatusInternalServerError && statusCode <= 599 {
		status = CodexAccountStatusTempUnavailable
	}
	return CodexAccountStatusSummary{
		Status:         status,
		Message:        strings.TrimSpace(message),
		UpstreamStatus: statusCode,
		CheckedAt:      common.GetTimestamp(),
	}
}

func NewCodexAccountTempUnavailableSummary(statusCode int, message string, cooldownUntil int64) CodexAccountStatusSummary {
	return CodexAccountStatusSummary{
		Status:         CodexAccountStatusTempUnavailable,
		Message:        strings.TrimSpace(message),
		UpstreamStatus: statusCode,
		CheckedAt:      common.GetTimestamp(),
		CooldownUntil:  cooldownUntil,
	}
}

func NewCodexAccountNotCheckedSummary(message string) CodexAccountStatusSummary {
	return CodexAccountStatusSummary{
		Status:    CodexAccountStatusNotChecked,
		Message:   strings.TrimSpace(message),
		CheckedAt: common.GetTimestamp(),
	}
}

func BuildCodexAccountStatusSummary(statusCode int, payload any, fallbackMessage string) CodexAccountStatusSummary {
	summary := CodexAccountStatusSummary{
		Status:         CodexAccountStatusQueryFailed,
		Message:        strings.TrimSpace(fallbackMessage),
		UpstreamStatus: statusCode,
		CheckedAt:      common.GetTimestamp(),
	}

	raw, _ := payload.(map[string]interface{})
	if raw == nil {
		summary.Message = firstNonEmpty(summary.Message, "codex usage response is not an object")
		return summary
	}
	summary.Raw = raw
	summary.PlanType = getStringFromMap(raw, "plan_type")
	summary.Email = getStringFromMap(raw, "email")
	summary.AccountID = getStringFromMap(raw, "account_id")
	summary.UserID = getStringFromMap(raw, "user_id")

	if statusCode == http.StatusUnauthorized ||
		(statusCode == http.StatusForbidden && codexStatusPayloadHasCredentialInvalidSignal(payload, summary.Message)) {
		summary.Status = CodexAccountStatusCredentialInvalid
		summary.Message = firstNonEmpty(summary.Message, fmt.Sprintf("upstream status: %d", statusCode))
		return summary
	}
	if statusCode < http.StatusOK || statusCode >= http.StatusMultipleChoices {
		if statusCode == http.StatusTooManyRequests {
			summary.Status = CodexAccountStatusLimited
		} else if statusCode >= http.StatusInternalServerError && statusCode <= 599 {
			summary.Status = CodexAccountStatusTempUnavailable
		} else {
			summary.Status = CodexAccountStatusQueryFailed
		}
		summary.Message = firstNonEmpty(summary.Message, fmt.Sprintf("upstream status: %d", statusCode))
		return summary
	}

	rateLimit, hasRateLimit := getMapFromMapWithOK(raw, "rate_limit")
	if summary.PlanType == "" {
		summary.PlanType = getStringFromMap(rateLimit, "plan_type")
	}
	summary.Windows, summary.FiveHourWindow, summary.WeeklyWindow = summarizeCodexRateLimitWindows(rateLimit)

	allowed, hasAllowed := getBoolFromMapWithOK(rateLimit, "allowed")
	limitReached, hasLimitReached := getBoolFromMapWithOK(rateLimit, "limit_reached")
	maxPercent := maxCodexWindowPercent(summary.Windows)
	if hasRateLimit && ((hasAllowed && !allowed) || (hasLimitReached && limitReached) || maxPercent >= 100) {
		summary.Status = CodexAccountStatusLimited
		if summary.Message == "" {
			summary.Message = "codex account limited"
		}
		summary.CooldownUntil = codexCooldownUntilFromWindows(summary.Windows)
		return summary
	}

	if !hasRateLimit {
		summary.Status = CodexAccountStatusQueryFailed
		summary.Message = firstNonEmpty(summary.Message, "codex rate_limit not found")
		return summary
	}

	summary.Status = CodexAccountStatusAvailable
	summary.Message = ""
	return summary
}

func codexStatusPayloadHasCredentialInvalidSignal(payload any, fallbackMessage string) bool {
	return containsCodexCredentialInvalidSignal(strings.TrimSpace(fallbackMessage + " " + common.GetJsonString(payload)))
}

func ReadCodexAccountStatusFromOtherInfo(otherInfo string) (CodexAccountStatusSummary, bool) {
	root := make(map[string]interface{})
	if strings.TrimSpace(otherInfo) == "" {
		return CodexAccountStatusSummary{}, false
	}
	if err := common.Unmarshal([]byte(otherInfo), &root); err != nil {
		return CodexAccountStatusSummary{}, false
	}
	raw := getMapFromMap(root, CodexAccountStatusKey)
	if raw == nil {
		return CodexAccountStatusSummary{}, false
	}
	summary := CodexAccountStatusSummary{
		Status:         NormalizeCodexAccountStatus(firstNonEmpty(getStringFromMap(raw, "status"), CodexAccountStatusUnknown)),
		Message:        getStringFromMap(raw, "message"),
		UpstreamStatus: int(getFloatFromMap(raw, "upstream_status")),
		CheckedAt:      int64(getFloatFromMap(raw, "checked_at")),
		CooldownUntil:  int64(getFloatFromMap(raw, "cooldown_until")),
		PlanType:       getStringFromMap(raw, "plan_type"),
		Email:          getStringFromMap(raw, "email"),
		AccountID:      getStringFromMap(raw, "account_id"),
		UserID:         getStringFromMap(raw, "user_id"),
	}
	if window := codexWindowFromMap(getMapFromMap(raw, "five_hour_window")); window != nil {
		summary.FiveHourWindow = window
	}
	if window := codexWindowFromMap(getMapFromMap(raw, "weekly_window")); window != nil {
		summary.WeeklyWindow = window
	}
	return summary, true
}

func GetCodexAccountStatusValue(otherInfo string) string {
	summary, ok := ReadCodexAccountStatusFromOtherInfo(otherInfo)
	if !ok || strings.TrimSpace(summary.Status) == "" {
		return CodexAccountStatusNotChecked
	}
	return NormalizeCodexAccountStatus(summary.Status)
}

func MergeCodexAccountStatusIntoOtherInfo(otherInfo string, summary CodexAccountStatusSummary) string {
	root := make(map[string]interface{})
	if strings.TrimSpace(otherInfo) != "" {
		_ = common.Unmarshal([]byte(otherInfo), &root)
	}
	root[CodexAccountStatusKey] = summary
	encoded, err := common.Marshal(root)
	if err != nil {
		return otherInfo
	}
	return string(encoded)
}

func summarizeCodexRateLimitWindows(rateLimit map[string]interface{}) ([]CodexRateLimitWindowSummary, *CodexRateLimitWindowSummary, *CodexRateLimitWindowSummary) {
	windows := make([]CodexRateLimitWindowSummary, 0, 2)
	for _, key := range []string{"primary_window", "secondary_window"} {
		if window := codexWindowFromMap(getMapFromMap(rateLimit, key)); window != nil {
			windows = append(windows, *window)
		}
	}

	var fiveHour *CodexRateLimitWindowSummary
	var weekly *CodexRateLimitWindowSummary
	for i := range windows {
		window := &windows[i]
		window.Label = classifyCodexRateLimitWindow(window.WindowSeconds)
		switch window.Label {
		case CodexRateLimitWindowWeekly:
			if weekly == nil {
				copyWindow := *window
				weekly = &copyWindow
			}
		case CodexRateLimitWindowFiveHour:
			if fiveHour == nil {
				copyWindow := *window
				fiveHour = &copyWindow
			}
		}
	}
	return windows, fiveHour, weekly
}

func classifyCodexRateLimitWindow(windowSeconds int64) string {
	switch {
	case windowSeconds >= 17_400 && windowSeconds <= 18_600:
		return CodexRateLimitWindowFiveHour
	case windowSeconds >= 604_200 && windowSeconds <= 605_400:
		return CodexRateLimitWindowWeekly
	default:
		return CodexRateLimitWindowUnknown
	}
}

func codexWindowFromMap(raw map[string]interface{}) *CodexRateLimitWindowSummary {
	if len(raw) == 0 {
		return nil
	}
	windowSeconds := int64(getFloatFromMap(raw, "limit_window_seconds"))
	if windowSeconds == 0 {
		windowSeconds = int64(getFloatFromMap(raw, "window_seconds"))
	}
	return &CodexRateLimitWindowSummary{
		UsedPercent:       clampCodexPercent(getFloatFromMap(raw, "used_percent")),
		ResetAt:           int64(getFloatFromMap(raw, "reset_at")),
		ResetAfterSeconds: int64(getFloatFromMap(raw, "reset_after_seconds")),
		WindowSeconds:     windowSeconds,
		Label:             getStringFromMap(raw, "label"),
	}
}

func maxCodexWindowPercent(windows []CodexRateLimitWindowSummary) int {
	maxPercent := 0
	for _, window := range windows {
		if window.UsedPercent > maxPercent {
			maxPercent = window.UsedPercent
		}
	}
	return maxPercent
}

func codexCooldownUntilFromWindows(windows []CodexRateLimitWindowSummary) int64 {
	now := common.GetTimestamp()
	var cooldownUntil int64
	for _, window := range windows {
		candidate := window.ResetAt
		if candidate <= 0 && window.ResetAfterSeconds > 0 {
			candidate = now + window.ResetAfterSeconds
		}
		if candidate > cooldownUntil {
			cooldownUntil = candidate
		}
	}
	if cooldownUntil <= now {
		return now + int64((10 * time.Minute).Seconds())
	}
	return cooldownUntil
}

func clampCodexPercent(value float64) int {
	if value < 0 {
		return 0
	}
	if value > 100 {
		return 100
	}
	return int(value + 0.5)
}

func getMapFromMap(root map[string]interface{}, key string) map[string]interface{} {
	raw, _ := getMapFromMapWithOK(root, key)
	return raw
}

func getMapFromMapWithOK(root map[string]interface{}, key string) (map[string]interface{}, bool) {
	if root == nil {
		return nil, false
	}
	raw, ok := root[key]
	if !ok || raw == nil {
		return nil, false
	}
	if typed, ok := raw.(map[string]interface{}); ok {
		return typed, true
	}
	return nil, false
}

func getStringFromMap(root map[string]interface{}, key string) string {
	if root == nil {
		return ""
	}
	raw, ok := root[key]
	if !ok || raw == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprintf("%v", raw))
}

func getBoolFromMap(root map[string]interface{}, key string) bool {
	value, _ := getBoolFromMapWithOK(root, key)
	return value
}

func getBoolFromMapWithOK(root map[string]interface{}, key string) (bool, bool) {
	if root == nil {
		return false, false
	}
	raw, ok := root[key]
	if !ok || raw == nil {
		return false, false
	}
	switch typed := raw.(type) {
	case bool:
		return typed, true
	case string:
		return strings.EqualFold(strings.TrimSpace(typed), "true"), true
	default:
		return fmt.Sprintf("%v", raw) == "true", true
	}
}

func getFloatFromMap(root map[string]interface{}, key string) float64 {
	if root == nil {
		return 0
	}
	raw, ok := root[key]
	if !ok || raw == nil {
		return 0
	}
	switch typed := raw.(type) {
	case float64:
		return typed
	case float32:
		return float64(typed)
	case int:
		return float64(typed)
	case int64:
		return float64(typed)
	case int32:
		return float64(typed)
	case uint:
		return float64(typed)
	case uint64:
		return float64(typed)
	case uint32:
		return float64(typed)
	default:
		return 0
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
