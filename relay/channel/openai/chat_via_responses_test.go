package openai

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestOaiResponsesStreamToChatHandler_BuffersSSEToNonStreamChat(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	c.Set(common.RequestIdKey, "test-request")

	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
		Body: io.NopCloser(strings.NewReader(strings.Join([]string{
			`data: {"type":"response.created","response":{"id":"resp_1","created_at":123,"model":"gpt-5.3-codex"}}`,
			``,
			`data: {"type":"response.output_text.delta","delta":"hello"}`,
			``,
			`data: {"type":"response.output_text.delta","delta":" world"}`,
			``,
			`data: {"type":"response.completed","response":{"id":"resp_1","created_at":123,"model":"gpt-5.3-codex","usage":{"input_tokens":3,"output_tokens":2,"total_tokens":5}}}`,
			``,
			`data: [DONE]`,
			``,
		}, "\n"))),
	}

	usage, apiErr := OaiResponsesStreamToChatHandler(c, &relaycommon.RelayInfo{
		RelayFormat: types.RelayFormatOpenAI,
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: "gpt-5.3-codex",
		},
	}, resp)
	require.Nil(t, apiErr)
	require.NotNil(t, usage)
	require.Equal(t, 5, usage.TotalTokens)
	require.Equal(t, http.StatusOK, rec.Code)

	var out dto.OpenAITextResponse
	require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &out))
	require.Equal(t, "chat.completion", out.Object)
	require.Equal(t, "gpt-5.3-codex", out.Model)
	require.Len(t, out.Choices, 1)
	require.Equal(t, "hello world", out.Choices[0].Message.Content)
	require.Equal(t, "stop", out.Choices[0].FinishReason)
	require.Equal(t, 5, out.Usage.TotalTokens)
}

func TestOaiResponsesStreamToChatHandler_RequiresCompletedEvent(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)

	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
		Body: io.NopCloser(strings.NewReader(strings.Join([]string{
			`data: {"type":"response.output_text.delta","delta":"partial"}`,
			``,
		}, "\n"))),
	}

	usage, apiErr := OaiResponsesStreamToChatHandler(c, &relaycommon.RelayInfo{
		RelayFormat: types.RelayFormatOpenAI,
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: "gpt-5.3-codex",
		},
	}, resp)
	require.Nil(t, usage)
	require.NotNil(t, apiErr)
	require.Contains(t, apiErr.Error(), "response.completed")
}

func TestOaiResponsesStreamToResponsesHandler_BuffersSSEToNonStreamResponses(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)

	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
		Body: io.NopCloser(strings.NewReader(strings.Join([]string{
			`data: {"type":"response.created","response":{"id":"resp_2","created_at":456,"model":"gpt-5.3-codex"}}`,
			``,
			`data: {"type":"response.output_text.delta","delta":"native"}`,
			``,
			`data: {"type":"response.completed","response":{"id":"resp_2","object":"response","created_at":456,"model":"gpt-5.3-codex","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"native"}]}],"usage":{"input_tokens":4,"output_tokens":1,"total_tokens":5}}}`,
			``,
			`data: [DONE]`,
			``,
		}, "\n"))),
	}

	usage, apiErr := OaiResponsesStreamToResponsesHandler(c, &relaycommon.RelayInfo{
		RelayFormat: types.RelayFormatOpenAIResponses,
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: "gpt-5.3-codex",
		},
	}, resp)
	require.Nil(t, apiErr)
	require.NotNil(t, usage)
	require.Equal(t, 5, usage.TotalTokens)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "application/json", rec.Header().Get("Content-Type"))

	var out dto.OpenAIResponsesResponse
	require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &out))
	require.Equal(t, "resp_2", out.ID)
	require.Equal(t, "response", out.Object)
	require.Equal(t, "gpt-5.3-codex", out.Model)
	require.Len(t, out.Output, 1)
	require.Equal(t, "native", out.Output[0].Content[0].Text)
	require.NotNil(t, out.Usage)
	require.Equal(t, 5, out.Usage.TotalTokens)
}
