package common

import (
	"net/http"
)

const FrontendThemeCookieName = "frontend_theme"

func IsValidFrontendTheme(theme string) bool {
	return theme == "default" || theme == "classic"
}

func NormalizeFrontendTheme(theme string) string {
	if theme == "classic" {
		return "classic"
	}
	return "default"
}

func SetFrontendThemeCookie(w http.ResponseWriter, theme string) {
	http.SetCookie(w, &http.Cookie{
		Name:     FrontendThemeCookieName,
		Value:    NormalizeFrontendTheme(theme),
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}
