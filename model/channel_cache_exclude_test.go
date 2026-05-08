package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestGetRandomSatisfiedChannelExcludingSkipsExcludedChannel(t *testing.T) {
	truncateTables(t)

	ch1 := &Channel{
		Type:     1,
		Key:      "k1",
		Status:   common.ChannelStatusEnabled,
		Name:     "ch1",
		Models:   "gpt-4o",
		Group:    "default",
		Priority: common.GetPointer[int64](10),
		Weight:   common.GetPointer[uint](1),
		ChannelInfo: ChannelInfo{
			IsMultiKey: false,
		},
	}
	require.NoError(t, ch1.Insert())

	ch2 := &Channel{
		Type:     1,
		Key:      "k2",
		Status:   common.ChannelStatusEnabled,
		Name:     "ch2",
		Models:   "gpt-4o",
		Group:    "default",
		Priority: common.GetPointer[int64](9),
		Weight:   common.GetPointer[uint](1),
		ChannelInfo: ChannelInfo{
			IsMultiKey: false,
		},
	}
	require.NoError(t, ch2.Insert())

	InitChannelCache()

	ch, err := GetRandomSatisfiedChannelExcluding("default", "gpt-4o", 0, map[int]struct{}{ch1.Id: {}})
	require.NoError(t, err)
	require.NotNil(t, ch)
	require.Equal(t, ch2.Id, ch.Id)
}
