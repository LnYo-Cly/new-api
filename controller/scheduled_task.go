package controller

import (
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

func GetScheduledTasks(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	category := c.Query("category")
	keyword := c.Query("keyword")

	items, total, err := model.ListScheduledTasks(pageInfo.GetStartIdx(), pageInfo.GetPageSize(), category, keyword)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

func GetScheduledTaskRuns(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	taskKey := strings.TrimSpace(c.Param("key"))
	if taskKey == "" {
		common.ApiErrorMsg(c, "task key is required")
		return
	}

	items, total, err := model.ListScheduledTaskRuns(taskKey, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

func RunScheduledTaskNow(c *gin.Context) {
	taskKey := strings.TrimSpace(c.Param("key"))
	if taskKey == "" {
		common.ApiErrorMsg(c, "task key is required")
		return
	}
	if err := model.TriggerScheduledTaskNow(c.Request.Context(), taskKey); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "task trigger accepted",
	})
}
