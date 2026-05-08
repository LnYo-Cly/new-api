package service

import (
	"strings"
	"testing"
	"time"
)

func TestCompareSystemVersions(t *testing.T) {
	tests := []struct {
		name    string
		current string
		latest  string
		want    int
	}{
		{name: "same with v prefix", current: "v0.1.0", latest: "0.1.0", want: 0},
		{name: "latest patch newer", current: "v0.1.0", latest: "v0.1.1", want: -1},
		{name: "current minor newer", current: "v0.2.0", latest: "v0.1.9", want: 1},
		{name: "ignore prerelease suffix for numeric comparison", current: "v1.0.0-alpha", latest: "v1.0.0", want: 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := compareSystemVersions(tt.current, tt.latest)
			if (got < 0 && tt.want >= 0) || (got > 0 && tt.want <= 0) || (got == 0 && tt.want != 0) {
				t.Fatalf("compareSystemVersions(%q, %q) = %d, want sign %d", tt.current, tt.latest, got, tt.want)
			}
		})
	}
}

func TestLimitSystemCommandOutput(t *testing.T) {
	input := strings.Repeat("a", systemCommandOutputLimit+20)
	got := limitSystemCommandOutput(input)
	if len(got) != systemCommandOutputLimit {
		t.Fatalf("len(limitSystemCommandOutput) = %d, want %d", len(got), systemCommandOutputLimit)
	}
}

func TestSystemUpdateOperationStoreReturnsCachedResult(t *testing.T) {
	resetSystemUpdateOperationStoreForTest(t)

	cached, op, err := beginSystemUpdateOperation("update", "same")
	if err != nil {
		t.Fatalf("beginSystemUpdateOperation() error = %v", err)
	}
	if cached != nil {
		t.Fatalf("beginSystemUpdateOperation() returned cached result before completion")
	}

	result := &SystemUpdateCommandResult{
		Message:     "done",
		OperationID: op.operationID,
		Output:      "updated",
		NeedRestart: true,
	}
	finishSystemUpdateOperation(op, result, nil)

	cached, op, err = beginSystemUpdateOperation("update", "same")
	if err != nil {
		t.Fatalf("beginSystemUpdateOperation() cached error = %v", err)
	}
	if op != nil {
		t.Fatalf("beginSystemUpdateOperation() returned a new operation for cached id")
	}
	if cached == nil {
		t.Fatalf("beginSystemUpdateOperation() cached result is nil")
	}
	if cached.Message != result.Message || cached.Output != result.Output || !cached.NeedRestart {
		t.Fatalf("cached result = %+v, want %+v", cached, result)
	}
	if cached == result {
		t.Fatalf("cached result should be a defensive copy")
	}
}

func TestSystemUpdateOperationStoreRejectsConcurrentOperation(t *testing.T) {
	resetSystemUpdateOperationStoreForTest(t)

	_, op, err := beginSystemUpdateOperation("update", "running")
	if err != nil {
		t.Fatalf("beginSystemUpdateOperation() error = %v", err)
	}
	if op == nil {
		t.Fatalf("beginSystemUpdateOperation() operation is nil")
	}

	_, _, err = beginSystemUpdateOperation("restart", "other")
	if err == nil {
		t.Fatalf("beginSystemUpdateOperation() expected concurrent operation error")
	}
	if !strings.Contains(err.Error(), "already running") {
		t.Fatalf("beginSystemUpdateOperation() error = %q, want already running", err.Error())
	}
}

func TestGetSystemUpdateOperationStatus(t *testing.T) {
	resetSystemUpdateOperationStoreForTest(t)

	status := GetSystemUpdateOperationStatus()
	if status.Running {
		t.Fatalf("GetSystemUpdateOperationStatus().Running = true, want false")
	}

	_, op, err := beginSystemUpdateOperation("restart", "status")
	if err != nil {
		t.Fatalf("beginSystemUpdateOperation() error = %v", err)
	}
	status = GetSystemUpdateOperationStatus()
	if !status.Running {
		t.Fatalf("GetSystemUpdateOperationStatus().Running = false, want true")
	}
	if status.Action != "restart" || status.OperationID != "status" {
		t.Fatalf("GetSystemUpdateOperationStatus() = %+v, want restart/status", status)
	}
	if status.StartedAt == 0 {
		t.Fatalf("GetSystemUpdateOperationStatus().StartedAt = 0, want unix timestamp")
	}

	finishSystemUpdateOperation(op, &SystemUpdateCommandResult{Message: "done"}, nil)
	status = GetSystemUpdateOperationStatus()
	if status.Running {
		t.Fatalf("GetSystemUpdateOperationStatus().Running = true after finish, want false")
	}
}

func resetSystemUpdateOperationStoreForTest(t *testing.T) {
	t.Helper()

	previous := systemOperationStore
	systemOperationStore = newSystemUpdateOperationStore()
	t.Cleanup(func() {
		systemOperationStore = previous
	})
}

func TestSystemUpdateOperationStoreExpiresCompletedEntries(t *testing.T) {
	resetSystemUpdateOperationStoreForTest(t)

	systemOperationStore.completed["update:old"] = systemUpdateOperationCacheEntry{
		result:    &SystemUpdateCommandResult{Message: "old"},
		expiresAt: time.Now().Add(-time.Second),
	}
	_, op, err := beginSystemUpdateOperation("update", "new")
	if err != nil {
		t.Fatalf("beginSystemUpdateOperation() error = %v", err)
	}
	if op == nil {
		t.Fatalf("beginSystemUpdateOperation() operation is nil")
	}
	if _, ok := systemOperationStore.completed["update:old"]; ok {
		t.Fatalf("expired completed operation was not removed")
	}
}
