package controller

import (
	"context"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

func CheckSystemUpdate(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()

	info, err := service.CheckSystemUpdate(ctx)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, info)
}

func ApplySystemUpdate(c *gin.Context) {
	result, err := service.ApplySystemUpdate(c.Request.Context())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func RestartSystem(c *gin.Context) {
	result, err := service.RestartSystem(c.Request.Context())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}
