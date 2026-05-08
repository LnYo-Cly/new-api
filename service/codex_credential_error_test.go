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
