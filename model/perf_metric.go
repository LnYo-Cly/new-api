package model

import (
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// PerfMetric stores aggregated relay performance metrics for the model square.
type PerfMetric struct {
	Id             int    `json:"id" gorm:"primaryKey"`
	ModelName      string `json:"model_name" gorm:"size:128;uniqueIndex:idx_perf_model_group_bucket,priority:1"`
	Group          string `json:"group" gorm:"column:group;size:64;uniqueIndex:idx_perf_model_group_bucket,priority:2"`
	BucketTs       int64  `json:"bucket_ts" gorm:"uniqueIndex:idx_perf_model_group_bucket,priority:3;index:idx_perf_bucket_ts"`
	RequestCount   int64  `json:"-" gorm:"default:0"`
	SuccessCount   int64  `json:"-" gorm:"default:0"`
	TotalLatencyMs int64  `json:"-" gorm:"default:0"`
	TtftSumMs      int64  `json:"-" gorm:"default:0"`
	TtftCount      int64  `json:"-" gorm:"default:0"`
	OutputTokens   int64  `json:"-" gorm:"default:0"`
	GenerationMs   int64  `json:"-" gorm:"default:0"`
}

func (PerfMetric) TableName() string {
	return "perf_metrics"
}

func UpsertPerfMetric(metric *PerfMetric) error {
	if metric == nil || metric.RequestCount == 0 {
		return nil
	}
	return DB.Clauses(perfMetricUpsertConflict(metric)).Create(metric).Error
}

func perfMetricUpsertConflict(metric *PerfMetric) clause.OnConflict {
	table := PerfMetric{}.TableName()
	increment := func(column string, value int64) clause.Expr {
		return gorm.Expr("? + ?", clause.Column{Table: table, Name: column}, value)
	}

	return clause.OnConflict{
		Columns: []clause.Column{
			{Name: "model_name"},
			{Name: "group"},
			{Name: "bucket_ts"},
		},
		DoUpdates: clause.Assignments(map[string]interface{}{
			"request_count":    increment("request_count", metric.RequestCount),
			"success_count":    increment("success_count", metric.SuccessCount),
			"total_latency_ms": increment("total_latency_ms", metric.TotalLatencyMs),
			"ttft_sum_ms":      increment("ttft_sum_ms", metric.TtftSumMs),
			"ttft_count":       increment("ttft_count", metric.TtftCount),
			"output_tokens":    increment("output_tokens", metric.OutputTokens),
			"generation_ms":    increment("generation_ms", metric.GenerationMs),
		}),
	}
}

func GetPerfMetrics(modelName string, group string, startTs int64, endTs int64) ([]PerfMetric, error) {
	var metrics []PerfMetric
	query := DB.Model(&PerfMetric{}).
		Where("model_name = ? AND bucket_ts >= ? AND bucket_ts <= ?", modelName, startTs, endTs)
	if group != "" {
		query = query.Where(commonGroupCol+" = ?", group)
	}
	err := query.Order("bucket_ts ASC").Find(&metrics).Error
	return metrics, err
}

type PerfMetricSummary struct {
	ModelName      string `json:"model_name"`
	RequestCount   int64  `json:"request_count"`
	SuccessCount   int64  `json:"success_count"`
	TotalLatencyMs int64  `json:"total_latency_ms"`
	OutputTokens   int64  `json:"output_tokens"`
	GenerationMs   int64  `json:"generation_ms"`
}

func GetPerfMetricsSummaryAll(startTs int64, endTs int64) ([]PerfMetricSummary, error) {
	var summaries []PerfMetricSummary
	table := PerfMetric{}.TableName()
	sumCol := func(column string) string {
		return fmt.Sprintf("SUM(%s) as %s", quoteTableColumn(table, column), column)
	}
	err := DB.Model(&PerfMetric{}).
		Select(strings.Join([]string{
			"model_name",
			sumCol("request_count"),
			sumCol("success_count"),
			sumCol("total_latency_ms"),
			sumCol("output_tokens"),
			sumCol("generation_ms"),
		}, ", ")).
		Where("bucket_ts >= ? AND bucket_ts <= ?", startTs, endTs).
		Group("model_name").
		Having("SUM(request_count) > 0").
		Find(&summaries).Error
	return summaries, err
}

func quoteTableColumn(table string, column string) string {
	if common.UsingPostgreSQL {
		return fmt.Sprintf(`"%s"."%s"`, table, column)
	}
	return fmt.Sprintf("`%s`.`%s`", table, column)
}

func DeletePerfMetricsBefore(cutoffTs int64) error {
	if cutoffTs <= 0 {
		return nil
	}
	return DB.Where("bucket_ts < ?", cutoffTs).Delete(&PerfMetric{}).Error
}

func PerfMetricStartTime(hours int) int64 {
	if hours <= 0 {
		hours = 24
	}
	return time.Now().Add(-time.Duration(hours) * time.Hour).Unix()
}
