package controller

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel/codex"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

func GetCodexChannelUsage(c *gin.Context) {
	channelId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, fmt.Errorf("invalid channel id: %w", err))
		return
	}

	ch, err := model.GetChannelById(channelId, true)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if ch == nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "channel not found"})
		return
	}
	if ch.Type != constant.ChannelTypeCodex {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "channel type is not Codex"})
		return
	}
	if ch.ChannelInfo.IsMultiKey {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "multi-key channel is not supported"})
		return
	}
	persistSummary := func(summary service.CodexAccountStatusSummary) {
		otherInfo := service.MergeCodexAccountStatusIntoOtherInfo(ch.OtherInfo, summary)
		if otherInfo != ch.OtherInfo {
			if err := model.DB.Model(&model.Channel{}).Where("id = ?", ch.Id).Update("other_info", otherInfo).Error; err != nil {
				common.SysError("failed to update codex account status: " + err.Error())
				return
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

	oauthKey, err := codex.ParseOAuthKey(strings.TrimSpace(ch.Key))
	if err != nil {
		common.SysError("failed to parse oauth key: " + err.Error())
		summary := service.NewCodexAccountQueryFailedSummary(0, err.Error())
		summary.Status = service.CodexAccountStatusCredentialInvalid
		persistSummary(summary)
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "解析凭证失败，请检查渠道配置"})
		return
	}
	accessToken := strings.TrimSpace(oauthKey.AccessToken)
	accountID := strings.TrimSpace(oauthKey.AccountID)
	if accessToken == "" {
		summary := service.NewCodexAccountQueryFailedSummary(0, "codex channel: access_token is required")
		summary.Status = service.CodexAccountStatusCredentialInvalid
		persistSummary(summary)
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "codex channel: access_token is required"})
		return
	}
	if accountID == "" {
		summary := service.NewCodexAccountQueryFailedSummary(0, "codex channel: account_id is required")
		summary.Status = service.CodexAccountStatusCredentialInvalid
		persistSummary(summary)
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "codex channel: account_id is required"})
		return
	}

	client, err := service.NewProxyHttpClient(ch.GetSetting().Proxy)
	if err != nil {
		persistSummary(service.NewCodexAccountQueryFailedSummary(0, err.Error()))
		common.ApiError(c, err)
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	statusCode, body, err := service.FetchCodexWhamUsage(ctx, client, ch.GetBaseURL(), accessToken, accountID)
	if err != nil {
		common.SysError("failed to fetch codex usage: " + err.Error())
		persistSummary(service.NewCodexAccountQueryFailedSummary(0, err.Error()))
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "获取用量信息失败，请稍后重试"})
		return
	}

	if statusCode == http.StatusUnauthorized || statusCode == http.StatusForbidden {
		if strings.TrimSpace(oauthKey.RefreshToken) == "" {
			summary := service.NewCodexAccountQueryFailedSummary(statusCode, "codex channel: refresh_token is required to refresh credential")
			summary.Status = service.CodexAccountStatusCredentialInvalid
			persistSummary(summary)
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "Codex OAuth 凭证缺少 refresh_token，请重新授权", "account_status": summary})
			return
		}

		refreshCtx, refreshCancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer refreshCancel()

		res, refreshErr := service.RefreshCodexOAuthTokenWithProxy(refreshCtx, oauthKey.RefreshToken, ch.GetSetting().Proxy)
		if refreshErr != nil {
			summary := service.NewCodexAccountQueryFailedSummary(statusCode, refreshErr.Error())
			message := "刷新凭证失败，请稍后重试"
			if service.IsCodexCredentialInvalidError(refreshErr) {
				summary.Status = service.CodexAccountStatusCredentialInvalid
				message = "Codex OAuth 凭证已失效，请重新授权"
				if ch.GetAutoBan() {
					service.DisableChannel(*types.NewChannelError(ch.Id, ch.Type, ch.Name, ch.ChannelInfo.IsMultiKey, "", ch.GetAutoBan()), refreshErr.Error())
					model.InitChannelCache()
					service.ResetProxyClientCache()
				}
			}
			persistSummary(summary)
			c.JSON(http.StatusOK, gin.H{"success": false, "message": message, "account_status": summary})
			return
		}

		oauthKey.AccessToken = res.AccessToken
		oauthKey.RefreshToken = res.RefreshToken
		oauthKey.LastRefresh = time.Now().Format(time.RFC3339)
		oauthKey.Expired = res.ExpiresAt.Format(time.RFC3339)
		if strings.TrimSpace(oauthKey.Type) == "" {
			oauthKey.Type = "codex"
		}

		encoded, encErr := common.Marshal(oauthKey)
		if encErr == nil {
			_ = model.DB.Model(&model.Channel{}).Where("id = ?", ch.Id).Update("key", string(encoded)).Error
			model.InitChannelCache()
			service.ResetProxyClientCache()
		}

		ctx2, cancel2 := context.WithTimeout(c.Request.Context(), 15*time.Second)
		defer cancel2()
		statusCode, body, err = service.FetchCodexWhamUsage(ctx2, client, ch.GetBaseURL(), oauthKey.AccessToken, accountID)
		if err != nil {
			common.SysError("failed to fetch codex usage after refresh: " + err.Error())
			persistSummary(service.NewCodexAccountQueryFailedSummary(0, err.Error()))
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "获取用量信息失败，请稍后重试"})
			return
		}
	}

	var payload any
	if common.Unmarshal(body, &payload) != nil {
		payload = string(body)
	}

	ok := statusCode >= 200 && statusCode < 300
	message := ""
	if !ok {
		message = fmt.Sprintf("upstream status: %d", statusCode)
	}
	summary := service.BuildCodexAccountStatusSummary(statusCode, payload, message)
	persistSummary(summary)
	resp := gin.H{
		"success":         ok,
		"message":         message,
		"upstream_status": statusCode,
		"data":            payload,
		"account_status":  summary,
	}
	c.JSON(http.StatusOK, resp)
}
