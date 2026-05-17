package service

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
)

type CodexOAuthRefreshError struct {
	StatusCode int
	Message    string
	Body       string
}

func (e *CodexOAuthRefreshError) Error() string {
	if e == nil {
		return ""
	}
	if e.Message != "" {
		return e.Message
	}
	if e.StatusCode > 0 {
		return fmt.Sprintf("codex oauth refresh failed: status=%d", e.StatusCode)
	}
	return "codex oauth refresh failed"
}

func NewCodexOAuthRefreshError(statusCode int, body []byte) error {
	message := extractCodexCredentialErrorMessage(body)
	if message == "" {
		message = fmt.Sprintf("codex oauth refresh failed: status=%d", statusCode)
	}
	return &CodexOAuthRefreshError{
		StatusCode: statusCode,
		Message:    message,
		Body:       strings.TrimSpace(string(body)),
	}
}

func IsCodexCredentialInvalidError(err error) bool {
	if err == nil {
		return false
	}

	var refreshErr *CodexOAuthRefreshError
	if errors.As(err, &refreshErr) {
		if containsCodexCredentialInvalidSignal(refreshErr.Message + " " + refreshErr.Body) {
			return true
		}
		switch refreshErr.StatusCode {
		case http.StatusBadRequest, http.StatusUnauthorized:
			return true
		case http.StatusForbidden:
			return false
		}
		return false
	}

	return containsCodexCredentialInvalidSignal(err.Error())
}

func extractCodexCredentialErrorMessage(body []byte) string {
	text := strings.TrimSpace(string(body))
	if text == "" {
		return ""
	}
	lower := strings.ToLower(text)
	if strings.Contains(lower, "invalid_grant") ||
		strings.Contains(lower, "no access token available") ||
		strings.Contains(lower, "access token unavailable") {
		return text
	}
	return text
}

func containsCodexCredentialInvalidSignal(text string) bool {
	lower := strings.ToLower(strings.TrimSpace(text))
	if lower == "" {
		return false
	}
	switch {
	case strings.Contains(lower, "access_token is required"),
		strings.Contains(lower, "account_id is required"),
		strings.Contains(lower, "refresh_token is required"),
		strings.Contains(lower, "refresh_token_reused"),
		strings.Contains(lower, "no access token available"),
		strings.Contains(lower, "access token unavailable"),
		strings.Contains(lower, "invalid_grant"),
		strings.Contains(lower, "invalid_token"),
		strings.Contains(lower, "token revoked"),
		strings.Contains(lower, "token invalid"):
		return true
	default:
		return false
	}
}
