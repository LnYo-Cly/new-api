package codex

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/stretchr/testify/require"
)

func TestConvertOpenAIResponsesRequest_ForcesCodexStreamAndStoreFalse(t *testing.T) {
	t.Parallel()

	adaptor := &Adaptor{}
	req := dto.OpenAIResponsesRequest{
		Model:              "gpt-5.3-codex",
		Stream:             common.GetPointer(false),
		Store:              []byte("true"),
		StreamOptions:      &dto.StreamOptions{IncludeUsage: true},
		PreviousResponseID: "rs_123",
		MaxOutputTokens:    common.GetPointer(uint(100)),
		Temperature:        common.GetPointer(0.2),
	}

	info := &relaycommon.RelayInfo{
		RelayMode:   relayconstant.RelayModeResponses,
		ChannelMeta: &relaycommon.ChannelMeta{},
	}
	converted, err := adaptor.ConvertOpenAIResponsesRequest(nil, info, req)
	require.NoError(t, err)
	require.True(t, info.IsStream)

	out, ok := converted.(dto.OpenAIResponsesRequest)
	require.True(t, ok)
	require.NotNil(t, out.Stream)
	require.True(t, *out.Stream)
	require.JSONEq(t, "false", string(out.Store))
	require.Nil(t, out.StreamOptions)
	require.Empty(t, out.PreviousResponseID)
	require.Nil(t, out.MaxOutputTokens)
	require.Nil(t, out.Temperature)
	require.JSONEq(t, `""`, string(out.Instructions))
}

func TestConvertOpenAIResponsesRequest_CompactDoesNotForceStream(t *testing.T) {
	t.Parallel()

	adaptor := &Adaptor{}
	req := dto.OpenAIResponsesRequest{
		Model:              "gpt-5.3-codex",
		Stream:             common.GetPointer(false),
		Store:              []byte("true"),
		PreviousResponseID: "rs_123",
	}

	info := &relaycommon.RelayInfo{
		RelayMode:   relayconstant.RelayModeResponsesCompact,
		ChannelMeta: &relaycommon.ChannelMeta{},
	}
	converted, err := adaptor.ConvertOpenAIResponsesRequest(nil, info, req)
	require.NoError(t, err)
	require.False(t, info.IsStream)

	out, ok := converted.(dto.OpenAIResponsesRequest)
	require.True(t, ok)
	require.NotNil(t, out.Stream)
	require.False(t, *out.Stream)
	require.JSONEq(t, "true", string(out.Store))
	require.Equal(t, "rs_123", out.PreviousResponseID)
}
