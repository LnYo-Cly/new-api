package openaicompat

import (
	"testing"

	"github.com/QuantumNous/new-api/dto"
	"github.com/stretchr/testify/require"
)

func TestChatCompletionsRequestToResponsesRequest_OmitsTopPForCodexModels(t *testing.T) {
	topP := 1.0
	stream := true

	req := &dto.GeneralOpenAIRequest{
		Model:  "gpt-5.3-codex",
		Stream: &stream,
		TopP:   &topP,
		Messages: []dto.Message{
			{
				Role:    "user",
				Content: "hi",
			},
		},
	}

	out, err := ChatCompletionsRequestToResponsesRequest(req)
	require.NoError(t, err)
	require.Nil(t, out.TopP)
}

func TestChatCompletionsRequestToResponsesRequest_PreservesTopPForNonCodexModels(t *testing.T) {
	topP := 0.9
	stream := true

	req := &dto.GeneralOpenAIRequest{
		Model:  "gpt-4.1",
		Stream: &stream,
		TopP:   &topP,
		Messages: []dto.Message{
			{
				Role:    "user",
				Content: "hi",
			},
		},
	}

	out, err := ChatCompletionsRequestToResponsesRequest(req)
	require.NoError(t, err)
	require.NotNil(t, out.TopP)
	require.Equal(t, topP, *out.TopP)
}

func TestModelRejectsResponsesTopP(t *testing.T) {
	require.True(t, modelRejectsResponsesTopP("gpt-5.3-codex"))
	require.True(t, modelRejectsResponsesTopP(" GPT-5.1-CODEX "))
	require.False(t, modelRejectsResponsesTopP("gpt-4.1"))
}
