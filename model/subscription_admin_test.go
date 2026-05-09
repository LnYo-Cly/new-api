package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func insertUserForSubscriptionAdminTest(t *testing.T, id int, group string) {
	t.Helper()
	user := &User{
		Id:       id,
		Username: "subscription_admin_user",
		Status:   common.UserStatusEnabled,
		Group:    group,
	}
	require.NoError(t, DB.Create(user).Error)
}

func insertPlanForSubscriptionAdminTest(t *testing.T, id int, upgradeGroup string) *SubscriptionPlan {
	t.Helper()
	plan := &SubscriptionPlan{
		Id:               id,
		Title:            "Admin Adjustable Plan",
		PriceAmount:      9.99,
		Currency:         "USD",
		DurationUnit:     SubscriptionDurationMonth,
		DurationValue:    1,
		Enabled:          true,
		TotalAmount:      1000,
		QuotaResetPeriod: SubscriptionResetDaily,
		UpgradeGroup:     upgradeGroup,
	}
	require.NoError(t, DB.Create(plan).Error)
	return plan
}

func getUserSubscriptionForAdminTest(t *testing.T, id int) UserSubscription {
	t.Helper()
	var sub UserSubscription
	require.NoError(t, DB.Where("id = ?", id).First(&sub).Error)
	return sub
}

func getUserGroupForSubscriptionAdminTest(t *testing.T, userId int) string {
	t.Helper()
	var user User
	require.NoError(t, DB.Select(commonGroupCol).Where("id = ?", userId).First(&user).Error)
	return user.Group
}

func TestAdminAdjustUserSubscriptionTime_RestoresExpiredSubscription(t *testing.T) {
	truncateTables(t)

	insertUserForSubscriptionAdminTest(t, 601, "default")
	plan := insertPlanForSubscriptionAdminTest(t, 701, "vip")
	now := GetDBTimestamp()
	sub := &UserSubscription{
		UserId:        601,
		PlanId:        plan.Id,
		AmountTotal:   plan.TotalAmount,
		StartTime:     now - 20*24*3600,
		EndTime:       now - 24*3600,
		Status:        "expired",
		Source:        "admin",
		LastResetTime: now - 20*24*3600,
		NextResetTime: 0,
		UpgradeGroup:  "vip",
		PrevUserGroup: "default",
	}
	require.NoError(t, DB.Create(sub).Error)

	deltaDays := 10
	result, msg, err := AdminAdjustUserSubscriptionTime(sub.Id, &deltaDays, nil)
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Contains(t, msg, "用户分组将升级到 vip")
	assert.Equal(t, sub.EndTime+10*24*3600, result.NewEndTime)

	updated := getUserSubscriptionForAdminTest(t, sub.Id)
	assert.Equal(t, "active", updated.Status)
	assert.Equal(t, "vip", getUserGroupForSubscriptionAdminTest(t, 601))
	assert.Greater(t, updated.NextResetTime, int64(0))
	assert.LessOrEqual(t, updated.NextResetTime, updated.EndTime)
}

func TestAdminAdjustUserSubscriptionTime_ExpiresShortenedSubscription(t *testing.T) {
	truncateTables(t)

	insertUserForSubscriptionAdminTest(t, 602, "vip")
	plan := insertPlanForSubscriptionAdminTest(t, 702, "vip")
	now := GetDBTimestamp()
	sub := &UserSubscription{
		UserId:        602,
		PlanId:        plan.Id,
		AmountTotal:   plan.TotalAmount,
		StartTime:     now - 10*24*3600,
		EndTime:       now + 10*24*3600,
		Status:        "active",
		Source:        "admin",
		LastResetTime: now - 10*24*3600,
		NextResetTime: time.Unix(now, 0).Add(24 * time.Hour).Unix(),
		UpgradeGroup:  "vip",
		PrevUserGroup: "default",
	}
	require.NoError(t, DB.Create(sub).Error)

	endTime := now - 3600
	result, msg, err := AdminAdjustUserSubscriptionTime(sub.Id, nil, &endTime)
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Contains(t, msg, "用户分组将回退到 default")
	assert.Equal(t, endTime, result.NewEndTime)

	updated := getUserSubscriptionForAdminTest(t, sub.Id)
	assert.Equal(t, "expired", updated.Status)
	assert.Equal(t, int64(0), updated.NextResetTime)
	assert.Equal(t, "default", getUserGroupForSubscriptionAdminTest(t, 602))
}

func TestListAdminUserSubscriptions_WithUsageAggregation(t *testing.T) {
	truncateTables(t)

	insertUserForSubscriptionAdminTest(t, 603, "default")
	plan := insertPlanForSubscriptionAdminTest(t, 703, "")
	now := GetDBTimestamp()
	sub := &UserSubscription{
		UserId:        603,
		PlanId:        plan.Id,
		AmountTotal:   5000,
		AmountUsed:    1200,
		StartTime:     now - 5*24*3600,
		EndTime:       now + 10*24*3600,
		Status:        "active",
		Source:        "admin",
		LastResetTime: now - 5*24*3600,
	}
	require.NoError(t, DB.Create(sub).Error)
	otherSub := &UserSubscription{
		UserId:        603,
		PlanId:        plan.Id,
		AmountTotal:   5000,
		AmountUsed:    100,
		StartTime:     now - 5*24*3600,
		EndTime:       now + 9*24*3600,
		Status:        "active",
		Source:        "admin",
		LastResetTime: now - 5*24*3600,
	}
	require.NoError(t, DB.Create(otherSub).Error)

	todayOther := common.MapToJsonStr(map[string]interface{}{
		"billing_source":        "subscription",
		"subscription_id":       sub.Id,
		"subscription_consumed": 321,
	})
	previousOther := common.MapToJsonStr(map[string]interface{}{
		"billing_source":        "subscription",
		"subscription_id":       sub.Id,
		"subscription_consumed": 179,
	})
	require.NoError(t, LOG_DB.Create(&Log{
		UserId:    603,
		CreatedAt: now,
		Type:      LogTypeConsume,
		Quota:     999,
		Other:     todayOther,
	}).Error)
	require.NoError(t, LOG_DB.Create(&Log{
		UserId:    603,
		CreatedAt: now - 2*24*3600,
		Type:      LogTypeConsume,
		Quota:     179,
		Other:     previousOther,
	}).Error)
	otherSubOther := common.MapToJsonStr(map[string]interface{}{
		"billing_source":        "subscription",
		"subscription_id":       otherSub.Id,
		"subscription_consumed": 250,
	})
	require.NoError(t, LOG_DB.Create(&Log{
		UserId:    603,
		CreatedAt: now,
		Type:      LogTypeConsume,
		Quota:     250,
		Other:     otherSubOther,
	}).Error)

	result, err := ListAdminUserSubscriptions(AdminUserSubscriptionFilters{
		Keyword: "subscription_admin_user",
		Status:  "active",
	}, &common.PageInfo{Page: 1, PageSize: 1})
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Len(t, result.Items, 1)

	item := result.Items[0]
	require.NotNil(t, item.Subscription)
	require.NotNil(t, item.Plan)
	require.NotNil(t, item.User)
	assert.Equal(t, sub.Id, item.Subscription.Id)
	assert.Equal(t, plan.Id, item.Plan.Id)
	assert.Equal(t, 603, item.User.Id)
	assert.Equal(t, int64(3800), item.RemainingQuota)
	assert.Equal(t, int64(321), item.TodayUsed)
	assert.Equal(t, int64(500), item.Last7dUsed)
	assert.Equal(t, int64(2), result.Stats.Active)
	assert.Equal(t, int64(571), result.Stats.TodayUsed)
	assert.Equal(t, int64(750), result.Stats.Last7dUsed)
}
