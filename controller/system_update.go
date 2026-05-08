package controller

import (
	"context"
	"errors"
	"io"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

type systemUpdateOperationRequest struct {
	OperationID string `json:"operation_id"`
}

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

func GetSystemUpdateOperationStatus(c *gin.Context) {
	common.ApiSuccess(c, service.GetSystemUpdateOperationStatus())
}

func ApplySystemUpdate(c *gin.Context) {
	operationID, err := getSystemUpdateOperationID(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	result, err := service.ApplySystemUpdate(c.Request.Context(), operationID)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func RestartSystem(c *gin.Context) {
	operationID, err := getSystemUpdateOperationID(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	result, err := service.RestartSystem(c.Request.Context(), operationID)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func getSystemUpdateOperationID(c *gin.Context) (string, error) {
	if c.Request.Body == nil || c.Request.ContentLength == 0 {
		return "", nil
	}

	var req systemUpdateOperationRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		if errors.Is(err, io.EOF) {
			return "", nil
		}
		return "", err
	}
	return req.OperationID, nil
}
