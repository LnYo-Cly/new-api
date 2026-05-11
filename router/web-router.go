package router

import (
	"embed"
	"net/http"
	"path"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

// ThemeAssets holds the embedded frontend assets for both themes.
type ThemeAssets struct {
	DefaultBuildFS   embed.FS
	DefaultIndexPage []byte
	ClassicBuildFS   embed.FS
	ClassicIndexPage []byte
}

func SetWebRouter(router *gin.Engine, assets ThemeAssets) {
	defaultFS := common.EmbedFolder(assets.DefaultBuildFS, "web/default/dist")
	classicFS := common.EmbedFolder(assets.ClassicBuildFS, "web/classic/dist")

	router.Use(gzip.Gzip(gzip.DefaultCompression))
	router.Use(middleware.GlobalWebRateLimit())
	router.Use(middleware.Cache())
	router.NoRoute(func(c *gin.Context) {
		c.Set(middleware.RouteTagKey, "web")
		if strings.HasPrefix(c.Request.RequestURI, "/v1") || strings.HasPrefix(c.Request.RequestURI, "/api") {
			controller.RelayNotFound(c)
			return
		}
		serveThemeAwareWeb(c, defaultFS, classicFS, assets)
	})
}

func serveThemeAwareWeb(c *gin.Context, defaultFS, classicFS static.ServeFileSystem, assets ThemeAssets) {
	theme := resolveFrontendTheme(c)
	currentFS := defaultFS
	currentIndex := assets.DefaultIndexPage
	if theme == "classic" {
		currentFS = classicFS
		currentIndex = assets.ClassicIndexPage
	}

	if isFrontendAssetRequest(c.Request.URL.Path) {
		if serveThemeAsset(c, currentFS, c.Request.URL.Path, theme) {
			return
		}
		fallbackTheme, fallbackFS := oppositeFrontendTheme(theme, defaultFS, classicFS)
		if serveThemeAsset(c, fallbackFS, c.Request.URL.Path, fallbackTheme) {
			return
		}
		if strings.HasPrefix(c.Request.URL.Path, "/assets/") {
			controller.RelayNotFound(c)
			return
		}
	}

	c.Writer.Header().Add("Vary", "Cookie")
	c.Header("Cache-Control", "no-store, no-cache, must-revalidate")
	c.Data(http.StatusOK, "text/html; charset=utf-8", currentIndex)
}

func resolveFrontendTheme(c *gin.Context) string {
	if theme := c.Query("frontend_theme"); common.IsValidFrontendTheme(theme) {
		common.SetFrontendThemeCookie(c.Writer, theme)
		return theme
	}

	if theme, err := c.Cookie(common.FrontendThemeCookieName); err == nil {
		normalizedTheme := common.NormalizeFrontendTheme(theme)
		if normalizedTheme == theme {
			return theme
		}
	}

	theme := common.NormalizeFrontendTheme(common.GetTheme())
	common.SetFrontendThemeCookie(c.Writer, theme)
	return theme
}

func isFrontendAssetRequest(requestPath string) bool {
	if strings.HasPrefix(requestPath, "/assets/") {
		return true
	}
	return path.Ext(requestPath) != ""
}

func oppositeFrontendTheme(theme string, defaultFS, classicFS static.ServeFileSystem) (string, static.ServeFileSystem) {
	if theme == "classic" {
		return "default", defaultFS
	}
	return "classic", classicFS
}

func serveThemeAsset(c *gin.Context, fs static.ServeFileSystem, requestPath string, theme string) bool {
	name := strings.TrimPrefix(requestPath, "/")
	file, err := fs.Open(name)
	if err != nil {
		return false
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil || stat.IsDir() {
		return false
	}

	c.Writer.Header().Add("Vary", "Cookie")
	common.SetFrontendThemeCookie(c.Writer, theme)
	if strings.HasPrefix(requestPath, "/assets/") {
		c.Header("Cache-Control", "public, max-age=604800, immutable")
	} else {
		c.Header("Cache-Control", "public, max-age=604800")
	}

	http.ServeContent(c.Writer, c.Request, stat.Name(), stat.ModTime(), file)
	return true
}
