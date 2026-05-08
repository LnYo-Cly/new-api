package service

import (
	"errors"
	"net/http"
	"testing"

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
