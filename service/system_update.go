package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

const (
	systemUpdateRepoEnv           = "SELF_UPDATE_REPOSITORY"
	systemUpdateEnabledEnv        = "SELF_UPDATE_ENABLED"
	systemUpdateCommandEnv        = "SELF_UPDATE_COMMAND"
	systemRestartCommandEnv       = "SELF_RESTART_COMMAND"
	systemUpdateTimeoutEnv        = "SELF_UPDATE_TIMEOUT_SECONDS"
	systemRestartTimeoutEnv       = "SELF_RESTART_TIMEOUT_SECONDS"
	systemUpdateDefaultRepository = "Calcium-Ion/new-api"
	systemUpdateDefaultTimeout    = 300
	systemRestartDefaultTimeout   = 30
	systemCommandOutputLimit      = 4000
)

var (
	systemUpdateHTTPClient = &http.Client{Timeout: 15 * time.Second}
	systemUpdateMu         sync.Mutex
)

type SystemUpdateInfo struct {
	CurrentVersion           string                   `json:"current_version"`
	LatestVersion            string                   `json:"latest_version"`
	HasUpdate                bool                     `json:"has_update"`
	ReleaseInfo              *SystemUpdateReleaseInfo `json:"release_info,omitempty"`
	Repository               string                   `json:"repository"`
	SelfUpdateEnabled        bool                     `json:"self_update_enabled"`
	UpdateCommandConfigured  bool                     `json:"update_command_configured"`
	RestartCommandConfigured bool                     `json:"restart_command_configured"`
}

type SystemUpdateReleaseInfo struct {
	TagName     string `json:"tag_name"`
	Name        string `json:"name"`
	Body        string `json:"body"`
	HTMLURL     string `json:"html_url"`
	PublishedAt string `json:"published_at"`
}

type systemUpdateGitHubRelease struct {
	TagName     string `json:"tag_name"`
	Name        string `json:"name"`
	Body        string `json:"body"`
	HTMLURL     string `json:"html_url"`
	PublishedAt string `json:"published_at"`
}

type SystemUpdateCommandResult struct {
	Message     string `json:"message"`
	Output      string `json:"output,omitempty"`
	NeedRestart bool   `json:"need_restart,omitempty"`
}

func CheckSystemUpdate(ctx context.Context) (*SystemUpdateInfo, error) {
	repository := getSystemUpdateRepository()
	info := newSystemUpdateInfo(repository)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/repos/"+repository+"/releases/latest", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "new-api-dashboard")

	resp, err := systemUpdateHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		message := strings.TrimSpace(string(body))
		if message == "" {
			message = resp.Status
		}
		return nil, fmt.Errorf("GitHub releases API returned %s: %s", resp.Status, message)
	}

	var release systemUpdateGitHubRelease
	if err := common.DecodeJson(resp.Body, &release); err != nil {
		return nil, err
	}
	if strings.TrimSpace(release.TagName) == "" {
		return nil, errors.New("GitHub release payload does not contain tag_name")
	}

	info.LatestVersion = release.TagName
	info.HasUpdate = compareSystemVersions(info.CurrentVersion, release.TagName) < 0
	info.ReleaseInfo = &SystemUpdateReleaseInfo{
		TagName:     release.TagName,
		Name:        release.Name,
		Body:        release.Body,
		HTMLURL:     release.HTMLURL,
		PublishedAt: release.PublishedAt,
	}
	return info, nil
}

func ApplySystemUpdate(ctx context.Context) (*SystemUpdateCommandResult, error) {
	if !isSystemSelfUpdateEnabled() {
		return nil, errors.New("self update is not enabled")
	}
	cmd := strings.TrimSpace(os.Getenv(systemUpdateCommandEnv))
	if cmd == "" {
		return nil, errors.New("SELF_UPDATE_COMMAND is not configured")
	}
	output, err := runSystemCommand(ctx, cmd, common.GetEnvOrDefault(systemUpdateTimeoutEnv, systemUpdateDefaultTimeout))
	if err != nil {
		return nil, err
	}
	return &SystemUpdateCommandResult{
		Message:     "System update command completed",
		Output:      output,
		NeedRestart: strings.TrimSpace(os.Getenv(systemRestartCommandEnv)) != "",
	}, nil
}

func RestartSystem(ctx context.Context) (*SystemUpdateCommandResult, error) {
	if !isSystemSelfUpdateEnabled() {
		return nil, errors.New("self update is not enabled")
	}
	cmd := strings.TrimSpace(os.Getenv(systemRestartCommandEnv))
	if cmd == "" {
		return nil, errors.New("SELF_RESTART_COMMAND is not configured")
	}
	timeoutSeconds := common.GetEnvOrDefault(systemRestartTimeoutEnv, systemRestartDefaultTimeout)
	go runSystemRestartCommand(cmd, timeoutSeconds)
	return &SystemUpdateCommandResult{
		Message: "System restart command submitted",
	}, nil
}

func runSystemRestartCommand(command string, timeoutSeconds int) {
	time.Sleep(500 * time.Millisecond)
	output, err := runSystemCommand(context.Background(), command, timeoutSeconds)
	if err != nil {
		common.SysError(fmt.Sprintf("system restart command failed: %s, output: %s", err.Error(), output))
		return
	}
	common.SysLog("system restart command completed")
}

func newSystemUpdateInfo(repository string) *SystemUpdateInfo {
	return &SystemUpdateInfo{
		CurrentVersion:           common.Version,
		LatestVersion:            common.Version,
		Repository:               repository,
		SelfUpdateEnabled:        isSystemSelfUpdateEnabled(),
		UpdateCommandConfigured:  strings.TrimSpace(os.Getenv(systemUpdateCommandEnv)) != "",
		RestartCommandConfigured: strings.TrimSpace(os.Getenv(systemRestartCommandEnv)) != "",
	}
}

func getSystemUpdateRepository() string {
	repository := strings.TrimSpace(os.Getenv(systemUpdateRepoEnv))
	if repository == "" {
		return systemUpdateDefaultRepository
	}
	return strings.Trim(repository, "/")
}

func isSystemSelfUpdateEnabled() bool {
	return common.GetEnvOrDefaultBool(systemUpdateEnabledEnv, false)
}

func runSystemCommand(ctx context.Context, command string, timeoutSeconds int) (string, error) {
	if timeoutSeconds <= 0 {
		timeoutSeconds = systemUpdateDefaultTimeout
	}

	systemUpdateMu.Lock()
	defer systemUpdateMu.Unlock()

	cmdCtx, cancel := context.WithTimeout(ctx, time.Duration(timeoutSeconds)*time.Second)
	defer cancel()

	cmd := shellCommand(cmdCtx, command)
	var output bytes.Buffer
	cmd.Stdout = &output
	cmd.Stderr = &output

	if err := cmd.Run(); err != nil {
		if errors.Is(cmdCtx.Err(), context.DeadlineExceeded) {
			return limitSystemCommandOutput(output.String()), fmt.Errorf("command timed out after %d seconds", timeoutSeconds)
		}
		return limitSystemCommandOutput(output.String()), fmt.Errorf("command failed: %w", err)
	}
	return limitSystemCommandOutput(output.String()), nil
}

func shellCommand(ctx context.Context, command string) *exec.Cmd {
	if runtime.GOOS == "windows" {
		return exec.CommandContext(ctx, "cmd", "/C", command)
	}
	return exec.CommandContext(ctx, "sh", "-c", command)
}

func limitSystemCommandOutput(output string) string {
	output = strings.TrimSpace(output)
	if len(output) <= systemCommandOutputLimit {
		return output
	}
	return output[len(output)-systemCommandOutputLimit:]
}

func compareSystemVersions(current string, latest string) int {
	currentParts := parseSystemVersion(current)
	latestParts := parseSystemVersion(latest)
	for i := 0; i < len(currentParts); i++ {
		if currentParts[i] < latestParts[i] {
			return -1
		}
		if currentParts[i] > latestParts[i] {
			return 1
		}
	}
	return 0
}

func parseSystemVersion(version string) [3]int {
	version = strings.TrimPrefix(strings.TrimSpace(version), "v")
	version = strings.Split(version, "-")[0]
	parts := strings.Split(version, ".")
	result := [3]int{}
	for i := 0; i < len(parts) && i < len(result); i++ {
		num, err := strconv.Atoi(parts[i])
		if err == nil {
			result[i] = num
		}
	}
	return result
}
