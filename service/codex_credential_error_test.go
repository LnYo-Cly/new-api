package service

import (
	"errors"
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/types"
	"github.com/stretchr/testify/require"
)

func TestIsCodexCredentialInvalidError(t *testing.T) {
	t.Parallel()

	require.True(t, IsCodexCredentialInvalidError(&CodexOAuthRefreshError{
		StatusCode: http.StatusUnauthorized,
		Message:    "invalid_grant",
	}))
	require.True(t, IsCodexCredentialInvalidError(errors.New("codex channel: access_token is required")))
	require.True(t, IsCodexCredentialInvalidError(errors.New("No access token available")))
	require.False(t, IsCodexCredentialInvalidError(errors.New("upstream request failed")))
}

func TestShouldRefreshCodexCredentialAfterRelayError(t *testing.T) {
	t.Parallel()

	codexChannel := &model.Channel{Type: constant.ChannelTypeCodex}
	require.True(t, ShouldRefreshCodexCredentialAfterRelayError(
		codexChannel,
		types.NewOpenAIError(errors.New("expired"), types.ErrorCodeBadResponseStatusCode, http.StatusUnauthorized),
	))
	require.True(t, ShouldRefreshCodexCredentialAfterRelayError(
		codexChannel,
		types.NewOpenAIError(errors.New("No access token available"), types.ErrorCodeBadResponseStatusCode, http.StatusBadGateway),
	))
	require.False(t, ShouldRefreshCodexCredentialAfterRelayError(
		codexChannel,
		types.NewOpenAIError(errors.New("upstream request failed"), types.ErrorCodeBadResponseStatusCode, http.StatusBadGateway),
	))
	require.False(t, ShouldRefreshCodexCredentialAfterRelayError(
		&model.Channel{Type: constant.ChannelTypeOpenAI},
		types.NewOpenAIError(errors.New("No access token available"), types.ErrorCodeBadResponseStatusCode, http.StatusBadGateway),
	))
	require.False(t, ShouldRefreshCodexCredentialAfterRelayError(
		&model.Channel{Type: constant.ChannelTypeCodex, ChannelInfo: model.ChannelInfo{IsMultiKey: true}},
		types.NewOpenAIError(errors.New("expired"), types.ErrorCodeBadResponseStatusCode, http.StatusUnauthorized),
	))
}

func TestClassifyCodexRelayFailure_RequestShapeErrorsDoNotMutateAccountStatus(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name       string
		message    string
		statusCode int
	}{
		{name: "stream_required", message: "Stream must be set to true", statusCode: http.StatusBadRequest},
		{name: "store_false_reference", message: "Item with id 'rs_abc' not found. Items are not persisted when `store` is set to false.", statusCode: http.StatusNotFound},
		{name: "previous_response_missing", message: "previous_response_not_found", statusCode: http.StatusNotFound},
		{name: "codex_model_mismatch", message: "The 'gpt-5.3-codex-spark' model is not supported when using Codex with a ChatGPT account.", statusCode: http.StatusBadRequest},
		{name: "local_endpoint_unsupported", message: "codex channel: /v1/chat/completions endpoint not supported", statusCode: http.StatusInternalServerError},
		{name: "client_gone", message: "codex stream disconnected before response.completed: client_gone", statusCode: http.StatusBadGateway},
		{name: "context_canceled", message: "context canceled", statusCode: http.StatusBadGateway},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			action := ClassifyCodexRelayFailure(types.NewOpenAIError(
				errors.New(tc.message),
				types.ErrorCodeBadResponseStatusCode,
				tc.statusCode,
			))
			require.False(t, action.Retryable)
			require.Empty(t, action.Status)
			require.False(t, action.Disable)
		})
	}
}

func TestClassifyCodexRelayFailure_RetryableAccountPoolErrors(t *testing.T) {
	t.Parallel()

	limited := ClassifyCodexRelayFailure(types.NewOpenAIError(
		errors.New("rate_limit_reached"),
		types.ErrorCodeBadResponseStatusCode,
		http.StatusTooManyRequests,
	))
	require.True(t, limited.Retryable)
	require.Equal(t, CodexAccountStatusLimited, limited.Status)

	tempUnavailable := ClassifyCodexRelayFailure(types.NewOpenAIError(
		errors.New("upstream request failed"),
		types.ErrorCodeBadResponseStatusCode,
		http.StatusBadGateway,
	))
	require.True(t, tempUnavailable.Retryable)
	require.Equal(t, CodexAccountStatusTempUnavailable, tempUnavailable.Status)
}
