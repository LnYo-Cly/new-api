package controller

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
	"github.com/QuantumNous/new-api/relay/channel/codex"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

type BatchCodexUsageFailure struct {
	ChannelID   int    `json:"channel_id"`
	ChannelName string `json:"channel_name"`
	Message     string `json:"message"`
}

type BatchCodexUsageResult struct {
	UpdatedChannels   int                      `json:"updated_channels"`
	FailedChannels    int                      `json:"failed_channels"`
	InvalidChannels   int                      `json:"invalid_channels"`
	ExhaustedChannels int                      `json:"exhausted_channels"`
	Failures          []BatchCodexUsageFailure `json:"failures,omitempty"`
}

type BatchCodexPoolResetResult struct {
	UpdatedChannels int                      `json:"updated_channels"`
	FailedChannels  int                      `json:"failed_channels"`
	Failures        []BatchCodexUsageFailure `json:"failures,omitempty"`
}

type BatchChannelTestFailure struct {
	ChannelID   int    `json:"channel_id"`
	ChannelName string `json:"channel_name"`
	Message     string `json:"message"`
	ErrorCode   string `json:"error_code,omitempty"`
}

type BatchChannelTestResult struct {
	TestedChannels             int                       `json:"tested_channels"`
	FailedChannels             int                       `json:"failed_channels"`
	CodexStatusUpdatedChannels int                       `json:"codex_status_updated_channels"`
	CodexStatusFailedChannels  int                       `json:"codex_status_failed_channels"`
	CodexStatusInvalidChannels int                       `json:"codex_status_invalid_channels"`
	Failures                   []BatchChannelTestFailure `json:"failures,omitempty"`
}

func BatchRefreshCodexChannelUsage(c *gin.Context) {
	channelBatch := ChannelBatch{}
	if err := c.ShouldBindJSON(&channelBatch); err != nil || len(channelBatch.Ids) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "参数错误",
		})
		return
	}

	channels, err := model.GetChannelsByIds(channelBatch.Ids)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if len(channels) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "未找到渠道",
		})
		return
	}

	result := refreshBatchCodexChannelUsage(c.Request.Context(), channels)
	if result.UpdatedChannels > 0 || result.InvalidChannels > 0 {
		model.InitChannelCache()
		service.ResetProxyClientCache()
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    result,
	})
}

func BatchClearCodexChannelPoolState(c *gin.Context) {
	channelBatch := ChannelBatch{}
	if err := c.ShouldBindJSON(&channelBatch); err != nil || len(channelBatch.Ids) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "参数错误",
		})
		return
	}

	channels, err := model.GetChannelsByIds(channelBatch.Ids)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if len(channels) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "未找到渠道",
		})
		return
	}

	result := BatchCodexPoolResetResult{}
	for _, ch := range channels {
		if ch == nil {
			continue
		}
		if ch.Type != constant.ChannelTypeCodex {
			result.FailedChannels++
			result.Failures = append(result.Failures, BatchCodexUsageFailure{
				ChannelID:   ch.Id,
				ChannelName: ch.Name,
				Message:     "channel type is not Codex",
			})
			continue
		}
		service.ClearCodexChannelPoolState(ch.Id)
		summary, ok := service.ReadCodexAccountStatusFromOtherInfo(ch.OtherInfo)
		if !ok {
			summary = service.NewCodexAccountNotCheckedSummary("codex pool state cleared")
		}
		if summary.Status == service.CodexAccountStatusLimited ||
			summary.Status == service.CodexAccountStatusTempUnavailable ||
			summary.Status == service.CodexAccountStatusQuotaExhausted {
			summary.Status = service.CodexAccountStatusNotChecked
			summary.Message = "codex pool state cleared; usage not checked yet"
		}
		summary.CooldownUntil = 0
		summary.CheckedAt = common.GetTimestamp()
		otherInfo := service.MergeCodexAccountStatusIntoOtherInfo(ch.OtherInfo, summary)
		if otherInfo != ch.OtherInfo {
			if err := model.DB.Model(&model.Channel{}).Where("id = ?", ch.Id).Update("other_info", otherInfo).Error; err != nil {
				result.FailedChannels++
				result.Failures = append(result.Failures, BatchCodexUsageFailure{
					ChannelID:   ch.Id,
					ChannelName: ch.Name,
					Message:     err.Error(),
				})
				continue
			}
			ch.OtherInfo = otherInfo
			model.CacheUpdateChannel(ch)
		}
		result.UpdatedChannels++
	}
	if result.UpdatedChannels > 0 {
		model.InitChannelCache()
		service.ResetProxyClientCache()
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    result,
	})
}

func BatchTestChannels(c *gin.Context) {
	channelBatch := ChannelBatch{}
	if err := c.ShouldBindJSON(&channelBatch); err != nil || len(channelBatch.Ids) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "参数错误",
		})
		return
	}

	channels, err := model.GetChannelsByIds(channelBatch.Ids)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if len(channels) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "未找到渠道",
		})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), time.Duration(len(channels))*30*time.Second)
	defer cancel()
	result := testBatchChannels(ctx, channels)
	if result.hasCodexStatusSideEffects() {
		model.InitChannelCache()
		service.ResetProxyClientCache()
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    result,
	})
}

func refreshBatchCodexChannelUsage(ctx context.Context, channels []*model.Channel) BatchCodexUsageResult {
	const maxConcurrency = 8

	resultCh := make(chan BatchCodexUsageResult, len(channels))
	jobs := make(chan *model.Channel)
	workerCount := min(maxConcurrency, len(channels))
	var wg sync.WaitGroup

	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for ch := range jobs {
				resultCh <- refreshSingleCodexChannelUsage(ctx, ch)
			}
		}()
	}

	for _, ch := range channels {
		if ch != nil {
			jobs <- ch
		}
	}
	close(jobs)
	wg.Wait()
	close(resultCh)

	result := BatchCodexUsageResult{}
	for item := range resultCh {
		result.UpdatedChannels += item.UpdatedChannels
		result.FailedChannels += item.FailedChannels
		result.InvalidChannels += item.InvalidChannels
		result.ExhaustedChannels += item.ExhaustedChannels
		result.Failures = append(result.Failures, item.Failures...)
	}
	return result
}

func refreshSingleCodexChannelUsage(ctx context.Context, ch *model.Channel) BatchCodexUsageResult {
	result := BatchCodexUsageResult{}
	if ch == nil {
		return result
	}
	fail := func(message string) BatchCodexUsageResult {
		result.FailedChannels = 1
		result.Failures = append(result.Failures, BatchCodexUsageFailure{
			ChannelID:   ch.Id,
			ChannelName: ch.Name,
			Message:     message,
		})
		return result
	}
	persistSummary := func(summary service.CodexAccountStatusSummary) {
		otherInfo := service.MergeCodexAccountStatusIntoOtherInfo(ch.OtherInfo, summary)
		if otherInfo != ch.OtherInfo {
			if err := model.DB.Model(&model.Channel{}).Where("id = ?", ch.Id).Update("other_info", otherInfo).Error; err != nil {
				common.SysError(fmt.Sprintf("failed to update codex account status: channel_id=%d err=%v", ch.Id, err))
			}
			ch.OtherInfo = otherInfo
		}
		if summary.CooldownUntil > common.GetTimestamp() {
			service.SetCodexChannelCooldown(ch.Id, summary.CooldownUntil)
		} else if summary.Status == service.CodexAccountStatusAvailable ||
			summary.Status == service.CodexAccountStatusNotChecked {
			service.ClearCodexChannelCooldown(ch.Id)
		}
	}

	if ch.Type != constant.ChannelTypeCodex {
		return fail("channel type is not Codex")
	}
	if ch.ChannelInfo.IsMultiKey {
		return fail("Codex OAuth multi-key channels are not supported")
	}

	oauthKey, err := codex.ParseOAuthKey(strings.TrimSpace(ch.Key))
	if err != nil {
		summary := service.NewCodexAccountQueryFailedSummary(0, err.Error())
		summary.Status = service.CodexAccountStatusCredentialInvalid
		persistSummary(summary)
		result.InvalidChannels = 1
		return fail(err.Error())
	}
	accessToken := strings.TrimSpace(oauthKey.AccessToken)
	accountID := strings.TrimSpace(oauthKey.AccountID)
	if accessToken == "" || accountID == "" {
		message := "codex channel: access_token and account_id are required"
		summary := service.NewCodexAccountQueryFailedSummary(0, message)
		summary.Status = service.CodexAccountStatusCredentialInvalid
		persistSummary(summary)
		result.InvalidChannels = 1
		return fail(message)
	}

	client, err := service.NewProxyHttpClient(ch.GetSetting().Proxy)
	if err != nil {
		return fail(err.Error())
	}

	baseURL := ch.GetBaseURL()
	queryCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	statusCode, body, err := service.FetchCodexWhamUsage(queryCtx, client, baseURL, accessToken, accountID)
	if err != nil {
		summary := service.NewCodexAccountQueryFailedSummary(0, err.Error())
		persistSummary(summary)
		return fail(err.Error())
	}

	if (statusCode == http.StatusUnauthorized || statusCode == http.StatusForbidden) &&
		strings.TrimSpace(oauthKey.RefreshToken) != "" {
		refreshCtx, refreshCancel := context.WithTimeout(ctx, 10*time.Second)
		defer refreshCancel()
		refreshedKey, refreshedChannel, refreshErr := service.RefreshCodexChannelCredential(
			refreshCtx,
			ch.Id,
			service.CodexCredentialRefreshOptions{ResetCaches: false},
		)
		if refreshErr != nil {
			summary := service.NewCodexAccountQueryFailedSummary(statusCode, refreshErr.Error())
			if service.IsCodexCredentialInvalidError(refreshErr) {
				summary.Status = service.CodexAccountStatusCredentialInvalid
				result.InvalidChannels = 1
				if ch.GetAutoBan() {
					service.DisableChannel(*types.NewChannelError(ch.Id, ch.Type, ch.Name, ch.ChannelInfo.IsMultiKey, "", ch.GetAutoBan()), refreshErr.Error())
				}
			}
			persistSummary(summary)
			return fail(refreshErr.Error())
		}
		accessToken = strings.TrimSpace(refreshedKey.AccessToken)
		accountID = strings.TrimSpace(refreshedKey.AccountID)
		if accountID == "" {
			accountID = strings.TrimSpace(oauthKey.AccountID)
		}
		if refreshedChannel != nil {
			*ch = *refreshedChannel
		}
		queryCtx2, cancel2 := context.WithTimeout(ctx, 15*time.Second)
		defer cancel2()
		statusCode, body, err = service.FetchCodexWhamUsage(queryCtx2, client, baseURL, accessToken, accountID)
		if err != nil {
			summary := service.NewCodexAccountQueryFailedSummary(0, err.Error())
			persistSummary(summary)
			return fail(err.Error())
		}
	}

	var payload any
	if common.Unmarshal(body, &payload) != nil {
		payload = string(body)
	}
	message := ""
	if statusCode < http.StatusOK || statusCode >= http.StatusMultipleChoices {
		message = fmt.Sprintf("upstream status: %d", statusCode)
	}
	summary := service.BuildCodexAccountStatusSummary(statusCode, payload, message)
	persistSummary(summary)

	switch summary.Status {
	case service.CodexAccountStatusAvailable:
		result.UpdatedChannels = 1
	case service.CodexAccountStatusQuotaExhausted, service.CodexAccountStatusLimited:
		result.UpdatedChannels = 1
		result.ExhaustedChannels = 1
	case service.CodexAccountStatusCredentialInvalid:
		result.InvalidChannels = 1
		return fail(summary.Message)
	default:
		return fail(summary.Message)
	}
	return result
}

func refreshCodexStatusAfterChannelTest(ctx context.Context, ch *model.Channel) BatchCodexUsageResult {
	if ch == nil || ch.Type != constant.ChannelTypeCodex || ch.ChannelInfo.IsMultiKey {
		return BatchCodexUsageResult{}
	}

	result := refreshSingleCodexChannelUsage(ctx, ch)
	if result.FailedChannels > 0 {
		messages := make([]string, 0, len(result.Failures))
		for _, failure := range result.Failures {
			if strings.TrimSpace(failure.Message) != "" {
				messages = append(messages, failure.Message)
			}
		}
		common.SysError(fmt.Sprintf(
			"failed to refresh codex account status after channel test: channel_id=%d failures=%s",
			ch.Id,
			strings.Join(messages, "; "),
		))
	}
	return result
}

func (result BatchChannelTestResult) hasCodexStatusSideEffects() bool {
	return result.CodexStatusUpdatedChannels > 0 ||
		result.CodexStatusFailedChannels > 0 ||
		result.CodexStatusInvalidChannels > 0
}

func testBatchChannels(ctx context.Context, channels []*model.Channel) BatchChannelTestResult {
	const maxConcurrency = 8

	resultCh := make(chan BatchChannelTestResult, len(channels))
	jobs := make(chan *model.Channel)
	workerCount := min(maxConcurrency, len(channels))
	var wg sync.WaitGroup

	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for ch := range jobs {
				select {
				case <-ctx.Done():
					resultCh <- BatchChannelTestResult{
						FailedChannels: 1,
						Failures: []BatchChannelTestFailure{{
							ChannelID:   ch.Id,
							ChannelName: ch.Name,
							Message:     ctx.Err().Error(),
						}},
					}
				default:
					resultCh <- testSingleBatchChannel(ctx, ch)
				}
			}
		}()
	}

	for _, ch := range channels {
		if ch != nil {
			jobs <- ch
		}
	}
	close(jobs)
	wg.Wait()
	close(resultCh)

	result := BatchChannelTestResult{}
	for item := range resultCh {
		result.TestedChannels += item.TestedChannels
		result.FailedChannels += item.FailedChannels
		result.Failures = append(result.Failures, item.Failures...)
		result.CodexStatusUpdatedChannels += item.CodexStatusUpdatedChannels
		result.CodexStatusFailedChannels += item.CodexStatusFailedChannels
		result.CodexStatusInvalidChannels += item.CodexStatusInvalidChannels
	}
	return result
}

func testSingleBatchChannel(ctx context.Context, ch *model.Channel) BatchChannelTestResult {
	result := BatchChannelTestResult{}
	if ch == nil {
		return result
	}
	tik := time.Now()
	testRes := testChannel(ch, "", "", shouldUseStreamForAutomaticChannelTest(ch))
	milliseconds := time.Since(tik).Milliseconds()
	ch.UpdateResponseTime(milliseconds)
	codexStatusResult := refreshCodexStatusAfterChannelTest(ctx, ch)
	result.CodexStatusUpdatedChannels = codexStatusResult.UpdatedChannels
	result.CodexStatusFailedChannels = codexStatusResult.FailedChannels
	result.CodexStatusInvalidChannels = codexStatusResult.InvalidChannels

	if testRes.localErr != nil {
		failure := BatchChannelTestFailure{
			ChannelID:   ch.Id,
			ChannelName: ch.Name,
			Message:     testRes.localErr.Error(),
		}
		if testRes.newAPIError != nil {
			failure.ErrorCode = string(testRes.newAPIError.GetErrorCode())
		}
		result.FailedChannels = 1
		result.Failures = append(result.Failures, failure)
		return result
	}
	result.TestedChannels = 1
	return result
}
