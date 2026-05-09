package model

import (
	"testing"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm/clause"
)

func TestPerfMetricUpsertConflictQualifiesIncrementColumns(t *testing.T) {
	metric := &PerfMetric{
		ModelName:      "gpt-test",
		Group:          "default",
		BucketTs:       1700000000,
		RequestCount:   1,
		SuccessCount:   1,
		TotalLatencyMs: 100,
		OutputTokens:   20,
		GenerationMs:   50,
	}
	conflict := perfMetricUpsertConflict(metric)

	assignmentsByColumn := map[string]clause.Assignment{}
	for _, assignment := range conflict.DoUpdates {
		assignmentsByColumn[assignment.Column.Name] = assignment
	}

	for _, column := range []string{
		"request_count",
		"success_count",
		"total_latency_ms",
		"ttft_sum_ms",
		"ttft_count",
		"output_tokens",
		"generation_ms",
	} {
		assignment, ok := assignmentsByColumn[column]
		require.True(t, ok, "missing assignment for %s", column)

		expr, ok := assignment.Value.(clause.Expr)
		require.True(t, ok, "assignment for %s should be a clause.Expr", column)
		require.Equal(t, "? + ?", expr.SQL)
		require.Len(t, expr.Vars, 2)
		require.Equal(t, clause.Column{Table: "perf_metrics", Name: column}, expr.Vars[0])
	}
}

func TestUpsertPerfMetricAccumulatesCounters(t *testing.T) {
	truncateTables(t)

	first := &PerfMetric{
		ModelName:      "gpt-test",
		Group:          "default",
		BucketTs:       1700000000,
		RequestCount:   1,
		SuccessCount:   1,
		TotalLatencyMs: 100,
		TtftSumMs:      20,
		TtftCount:      1,
		OutputTokens:   30,
		GenerationMs:   50,
	}
	second := &PerfMetric{
		ModelName:      first.ModelName,
		Group:          first.Group,
		BucketTs:       first.BucketTs,
		RequestCount:   2,
		SuccessCount:   1,
		TotalLatencyMs: 200,
		TtftSumMs:      40,
		TtftCount:      2,
		OutputTokens:   70,
		GenerationMs:   150,
	}

	require.NoError(t, UpsertPerfMetric(first))
	require.NoError(t, UpsertPerfMetric(second))

	var got PerfMetric
	require.NoError(t, DB.Where("model_name = ? AND `group` = ? AND bucket_ts = ?", first.ModelName, first.Group, first.BucketTs).First(&got).Error)
	require.EqualValues(t, 3, got.RequestCount)
	require.EqualValues(t, 2, got.SuccessCount)
	require.EqualValues(t, 300, got.TotalLatencyMs)
	require.EqualValues(t, 60, got.TtftSumMs)
	require.EqualValues(t, 3, got.TtftCount)
	require.EqualValues(t, 100, got.OutputTokens)
	require.EqualValues(t, 200, got.GenerationMs)
}
