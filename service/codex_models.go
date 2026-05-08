package service

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

type CodexModel struct {
	ID          string `json:"id,omitempty"`
	Name        string `json:"name,omitempty"`
	Model       string `json:"model,omitempty"`
	Slug        string `json:"slug,omitempty"`
	DisplayName string `json:"display_name,omitempty"`
}

func FetchCodexModels(
	ctx context.Context,
	client *http.Client,
	baseURL string,
	accessToken string,
	accountID string,
) (statusCode int, body []byte, err error) {
	if client == nil {
		return 0, nil, fmt.Errorf("nil http client")
	}
	bu := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if bu == "" {
		return 0, nil, fmt.Errorf("empty baseURL")
	}
	at := strings.TrimSpace(accessToken)
	aid := strings.TrimSpace(accountID)
	if at == "" {
		return 0, nil, fmt.Errorf("empty accessToken")
	}
	if aid == "" {
		return 0, nil, fmt.Errorf("empty accountID")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, bu+"/backend-api/codex/models", nil)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Authorization", "Bearer "+at)
	req.Header.Set("chatgpt-account-id", aid)
	req.Header.Set("Accept", "application/json")
	if req.Header.Get("OpenAI-Beta") == "" {
		req.Header.Set("OpenAI-Beta", "responses=experimental")
	}
	if req.Header.Get("originator") == "" {
		req.Header.Set("originator", "codex_cli_rs")
	}

	resp, err := client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()

	body, err = io.ReadAll(resp.Body)
	if err != nil {
		return resp.StatusCode, nil, err
	}
	return resp.StatusCode, body, nil
}

func ParseCodexModelIDs(body []byte) ([]string, error) {
	var root any
	if err := common.Unmarshal(body, &root); err != nil {
		return nil, err
	}

	models := make([]string, 0)
	collectCodexModelIDs(root, &models)
	return normalizeCodexModelIDs(models), nil
}

func collectCodexModelIDs(value any, models *[]string) {
	switch typed := value.(type) {
	case map[string]any:
		for _, key := range []string{"id", "model", "name", "slug"} {
			if raw, ok := typed[key]; ok {
				if modelID, ok := raw.(string); ok && strings.TrimSpace(modelID) != "" {
					*models = append(*models, strings.TrimSpace(modelID))
					return
				}
			}
		}
		knownContainerKeyFound := false
		for _, key := range []string{"models", "data", "items"} {
			if raw, ok := typed[key]; ok {
				knownContainerKeyFound = true
				collectCodexModelIDs(raw, models)
			}
		}
		if knownContainerKeyFound {
			return
		}
		for key, raw := range typed {
			if strings.TrimSpace(key) != "" {
				*models = append(*models, strings.TrimSpace(key))
			}
			collectCodexModelIDs(raw, models)
		}
	case []any:
		for _, item := range typed {
			collectCodexModelIDs(item, models)
		}
	case []string:
		for _, item := range typed {
			if strings.TrimSpace(item) != "" {
				*models = append(*models, strings.TrimSpace(item))
			}
		}
	case string:
		if strings.TrimSpace(typed) != "" {
			*models = append(*models, strings.TrimSpace(typed))
		}
	}
}

func normalizeCodexModelIDs(models []string) []string {
	seen := make(map[string]struct{}, len(models))
	normalized := make([]string, 0, len(models))
	for _, model := range models {
		model = strings.TrimSpace(model)
		if model == "" {
			continue
		}
		if _, ok := seen[model]; ok {
			continue
		}
		seen[model] = struct{}{}
		normalized = append(normalized, model)
	}
	return normalized
}
