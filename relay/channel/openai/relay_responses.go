package openai

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

func OaiResponsesHandler(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
	defer service.CloseResponseBodyGracefully(resp)

	// read response body
	var responsesResponse dto.OpenAIResponsesResponse
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeReadResponseBodyFailed, http.StatusInternalServerError)
	}
	err = common.Unmarshal(responseBody, &responsesResponse)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}
	if oaiError := responsesResponse.GetOpenAIError(); oaiError != nil && oaiError.Type != "" {
		return nil, types.WithOpenAIError(*oaiError, resp.StatusCode)
	}

	if responsesResponse.HasImageGenerationCall() {
		c.Set("image_generation_call", true)
		c.Set("image_generation_call_quality", responsesResponse.GetQuality())
		c.Set("image_generation_call_size", responsesResponse.GetSize())
	}

	// 写入新的 response body
	service.IOCopyBytesGracefully(c, resp, responseBody)

	// compute usage
	usage := dto.Usage{}
	if responsesResponse.Usage != nil {
		usage.PromptTokens = responsesResponse.Usage.InputTokens
		usage.CompletionTokens = responsesResponse.Usage.OutputTokens
		usage.TotalTokens = responsesResponse.Usage.TotalTokens
		if responsesResponse.Usage.InputTokensDetails != nil {
			usage.PromptTokensDetails.CachedTokens = responsesResponse.Usage.InputTokensDetails.CachedTokens
		}
	}
	if info == nil || info.ResponsesUsageInfo == nil || info.ResponsesUsageInfo.BuiltInTools == nil {
		return &usage, nil
	}
	// 解析 Tools 用量
	for _, tool := range responsesResponse.Tools {
		buildToolinfo, ok := info.ResponsesUsageInfo.BuiltInTools[common.Interface2String(tool["type"])]
		if !ok || buildToolinfo == nil {
			logger.LogError(c, fmt.Sprintf("BuiltInTools not found for tool type: %v", tool["type"]))
			continue
		}
		buildToolinfo.CallCount++
	}
	return &usage, nil
}

func OaiResponsesStreamToResponsesHandler(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
	if resp == nil || resp.Body == nil {
		return nil, types.NewOpenAIError(fmt.Errorf("invalid response"), types.ErrorCodeBadResponse, http.StatusInternalServerError)
	}

	defer service.CloseResponseBodyGracefully(resp)

	var (
		completedResp *dto.OpenAIResponsesResponse
		completed     bool
		responseText  strings.Builder
		streamErr     *types.NewAPIError
	)

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, helper.InitialScannerBufferSize), helper.DefaultMaxScannerBufferSize)

	dataLines := make([]string, 0, 1)
	processData := func(data string) bool {
		data = strings.TrimSpace(data)
		if data == "" {
			return true
		}
		if strings.HasPrefix(data, "[DONE]") {
			return false
		}

		var streamResponse dto.ResponsesStreamResponse
		if err := common.UnmarshalJsonStr(data, &streamResponse); err != nil {
			streamErr = types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusBadGateway)
			return false
		}
		if oaiErr := extractResponsesStreamOpenAIError(streamResponse); oaiErr != nil {
			streamErr = types.WithOpenAIError(*oaiErr, http.StatusBadGateway)
			return false
		}

		switch streamResponse.Type {
		case "response.output_text.delta":
			responseText.WriteString(streamResponse.Delta)
		case "response.completed":
			completed = true
			if streamResponse.Response != nil {
				cp := *streamResponse.Response
				completedResp = &cp
			}
		case "response.error", "response.failed":
			if streamResponse.Response != nil {
				if oaiErr := streamResponse.Response.GetOpenAIError(); oaiErr != nil && oaiErr.Type != "" {
					streamErr = types.WithOpenAIError(*oaiErr, http.StatusBadGateway)
					return false
				}
			}
			streamErr = types.NewOpenAIError(fmt.Errorf("responses stream error: %s", streamResponse.Type), types.ErrorCodeBadResponse, http.StatusBadGateway)
			return false
		}
		return true
	}
	flushEvent := func() bool {
		if len(dataLines) == 0 {
			return true
		}
		data := strings.Join(dataLines, "\n")
		dataLines = dataLines[:0]
		return processData(data)
	}

	for scanner.Scan() {
		select {
		case <-c.Request.Context().Done():
			return nil, types.NewOpenAIError(c.Request.Context().Err(), types.ErrorCodeBadResponse, http.StatusBadGateway)
		default:
		}

		line := scanner.Text()
		if line == "" {
			if !flushEvent() {
				break
			}
			continue
		}
		if strings.HasPrefix(line, "data:") {
			dataLines = append(dataLines, strings.TrimSpace(strings.TrimPrefix(line, "data:")))
			continue
		}
		if strings.HasPrefix(line, "[DONE]") {
			break
		}
	}
	if streamErr == nil && len(dataLines) > 0 {
		flushEvent()
	}
	if streamErr != nil {
		return nil, streamErr
	}
	if err := scanner.Err(); err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponse, http.StatusBadGateway)
	}
	if !completed || completedResp == nil {
		return nil, types.NewOpenAIError(fmt.Errorf("responses stream disconnected before response.completed"), types.ErrorCodeBadResponse, http.StatusBadGateway)
	}

	if completedResp.HasImageGenerationCall() {
		c.Set("image_generation_call", true)
		c.Set("image_generation_call_quality", completedResp.GetQuality())
		c.Set("image_generation_call_size", completedResp.GetSize())
	}

	responseBody, err := common.Marshal(completedResp)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeJsonMarshalFailed, http.StatusInternalServerError)
	}
	c.Writer.Header().Set("Content-Type", "application/json")
	service.IOCopyBytesGracefully(c, nil, responseBody)

	usage := &dto.Usage{}
	if completedResp.Usage != nil {
		usage.PromptTokens = completedResp.Usage.InputTokens
		usage.CompletionTokens = completedResp.Usage.OutputTokens
		usage.TotalTokens = completedResp.Usage.TotalTokens
		if completedResp.Usage.InputTokensDetails != nil {
			usage.PromptTokensDetails.CachedTokens = completedResp.Usage.InputTokensDetails.CachedTokens
		}
	}
	if usage.TotalTokens == 0 && responseText.Len() > 0 {
		usage = service.ResponseText2Usage(c, responseText.String(), info.UpstreamModelName, info.GetEstimatePromptTokens())
	}
	if info == nil || info.ResponsesUsageInfo == nil || info.ResponsesUsageInfo.BuiltInTools == nil {
		return usage, nil
	}
	for _, tool := range completedResp.Tools {
		buildToolinfo, ok := info.ResponsesUsageInfo.BuiltInTools[common.Interface2String(tool["type"])]
		if !ok || buildToolinfo == nil {
			logger.LogError(c, fmt.Sprintf("BuiltInTools not found for tool type: %v", tool["type"]))
			continue
		}
		buildToolinfo.CallCount++
	}
	return usage, nil
}

func OaiResponsesStreamHandler(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
	if resp == nil || resp.Body == nil {
		logger.LogError(c, "invalid response or response body")
		return nil, types.NewError(fmt.Errorf("invalid response"), types.ErrorCodeBadResponse)
	}

	defer service.CloseResponseBodyGracefully(resp)

	var usage = &dto.Usage{}
	var responseTextBuilder strings.Builder
	bufferBeforeOutput := info != nil && info.ChannelMeta != nil && info.ChannelType == constant.ChannelTypeCodex
	bufferedData := make([]responsesStreamBufferedEvent, 0, 4)
	clientOutputStarted := false
	completed := false
	var streamHandlerErr error

	helper.StreamScannerHandler(c, resp, info, func(data string, sr *helper.StreamResult) {

		// 检查当前数据是否包含 completed 状态和 usage 信息
		var streamResponse dto.ResponsesStreamResponse
		if err := common.UnmarshalJsonStr(data, &streamResponse); err != nil {
			logger.LogError(c, "failed to unmarshal stream response: "+err.Error())
			sr.Error(err)
			return
		}
		if oaiErr := extractResponsesStreamOpenAIError(streamResponse); oaiErr != nil {
			streamHandlerErr = errors.New(oaiErr.Message)
			if !clientOutputStarted {
				sr.Stop(streamHandlerErr)
				return
			}
			sendResponsesStreamData(c, streamResponse, data)
			return
		}
		isOutputEvent := isResponsesStreamOutputEvent(streamResponse)
		if bufferBeforeOutput && !clientOutputStarted {
			if !isOutputEvent {
				bufferedData = append(bufferedData, responsesStreamBufferedEvent{response: streamResponse, data: data})
			} else {
				for _, item := range bufferedData {
					sendResponsesStreamData(c, item.response, item.data)
				}
				bufferedData = nil
				sendResponsesStreamData(c, streamResponse, data)
				clientOutputStarted = true
			}
		} else {
			sendResponsesStreamData(c, streamResponse, data)
			if isOutputEvent {
				clientOutputStarted = true
			}
		}
		switch streamResponse.Type {
		case "response.completed":
			completed = true
			if streamResponse.Response != nil {
				if streamResponse.Response.Usage != nil {
					if streamResponse.Response.Usage.InputTokens != 0 {
						usage.PromptTokens = streamResponse.Response.Usage.InputTokens
					}
					if streamResponse.Response.Usage.OutputTokens != 0 {
						usage.CompletionTokens = streamResponse.Response.Usage.OutputTokens
					}
					if streamResponse.Response.Usage.TotalTokens != 0 {
						usage.TotalTokens = streamResponse.Response.Usage.TotalTokens
					}
					if streamResponse.Response.Usage.InputTokensDetails != nil {
						usage.PromptTokensDetails.CachedTokens = streamResponse.Response.Usage.InputTokensDetails.CachedTokens
					}
				}
				if streamResponse.Response.HasImageGenerationCall() {
					c.Set("image_generation_call", true)
					c.Set("image_generation_call_quality", streamResponse.Response.GetQuality())
					c.Set("image_generation_call_size", streamResponse.Response.GetSize())
				}
			}
		case "response.output_text.delta":
			// 处理输出文本
			responseTextBuilder.WriteString(streamResponse.Delta)
		case dto.ResponsesOutputTypeItemDone:
			// 函数调用处理
			if streamResponse.Item != nil {
				switch streamResponse.Item.Type {
				case dto.BuildInCallWebSearchCall:
					if info != nil && info.ResponsesUsageInfo != nil && info.ResponsesUsageInfo.BuiltInTools != nil {
						if webSearchTool, exists := info.ResponsesUsageInfo.BuiltInTools[dto.BuildInToolWebSearchPreview]; exists && webSearchTool != nil {
							webSearchTool.CallCount++
						}
					}
				}
			}
		}
	})

	if streamHandlerErr != nil && !clientOutputStarted {
		return nil, types.NewOpenAIError(streamHandlerErr, types.ErrorCodeBadResponse, http.StatusBadGateway)
	}
	if bufferBeforeOutput && !completed && !clientOutputStarted {
		reason := "codex stream disconnected before response.completed"
		if info != nil && info.StreamStatus != nil && info.StreamStatus.EndReason != "" {
			reason = fmt.Sprintf("%s: %s", reason, info.StreamStatus.EndReason)
		}
		return nil, types.NewOpenAIError(errors.New(reason), types.ErrorCodeBadResponse, http.StatusBadGateway)
	}

	if usage.CompletionTokens == 0 {
		// 计算输出文本的 token 数量
		tempStr := responseTextBuilder.String()
		if len(tempStr) > 0 {
			// 非正常结束，使用输出文本的 token 数量
			completionTokens := service.CountTextToken(tempStr, info.UpstreamModelName)
			usage.CompletionTokens = completionTokens
		}
	}

	if usage.PromptTokens == 0 && usage.CompletionTokens != 0 {
		usage.PromptTokens = info.GetEstimatePromptTokens()
	}

	usage.TotalTokens = usage.PromptTokens + usage.CompletionTokens

	return usage, nil
}

type responsesStreamBufferedEvent struct {
	response dto.ResponsesStreamResponse
	data     string
}

func isResponsesStreamOutputEvent(streamResponse dto.ResponsesStreamResponse) bool {
	switch streamResponse.Type {
	case "response.output_text.delta",
		"response.function_call_arguments.delta",
		"response.audio.delta",
		"response.audio_transcript.delta",
		dto.ResponsesOutputTypeItemAdded,
		dto.ResponsesOutputTypeItemDone:
		return true
	default:
		return false
	}
}

func extractResponsesStreamOpenAIError(streamResponse dto.ResponsesStreamResponse) *types.OpenAIError {
	if streamResponse.Response == nil {
		return nil
	}
	oaiErr := streamResponse.Response.GetOpenAIError()
	if oaiErr == nil || strings.TrimSpace(oaiErr.Message) == "" {
		return nil
	}
	return oaiErr
}
