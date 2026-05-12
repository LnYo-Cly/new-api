package relay

import (
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestShouldRetryResponsesWithoutTopP(t *testing.T) {
	resp := &http.Response{
		StatusCode: http.StatusBadRequest,
		Body: io.NopCloser(strings.NewReader(
			`{"error":{"message":"Unsupported parameter: top_p","type":"invalid_request_error","param":"top_p","code":"unsupported_parameter"}}`,
		)),
	}

	require.True(t, shouldRetryResponsesWithoutTopP(resp))
}

func TestShouldRetryResponsesWithoutTopP_FalseForOtherErrors(t *testing.T) {
	resp := &http.Response{
		StatusCode: http.StatusBadRequest,
		Body: io.NopCloser(strings.NewReader(
			`{"error":{"message":"Unsupported parameter: temperature","type":"invalid_request_error","param":"temperature","code":"unsupported_parameter"}}`,
		)),
	}

	require.False(t, shouldRetryResponsesWithoutTopP(resp))
}
