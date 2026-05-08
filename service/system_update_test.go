package service

import (
	"strings"
	"testing"
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
