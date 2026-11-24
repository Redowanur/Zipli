package events

import "strings"

// ParseUA does lightweight device/browser/OS classification. It runs on the
// producer worker goroutine, never on the redirect path.
func ParseUA(ua string) (device, browser, os string) {
	l := strings.ToLower(ua)
	has := func(subs ...string) bool {
		for _, s := range subs {
			if strings.Contains(l, s) {
				return true
			}
		}
		return false
	}
	switch {
	case l == "" || has("bot", "crawl", "spider", "slurp", "curl", "wget", "facebookexternalhit", "headless", "python-requests", "go-http-client"):
		device = "bot"
	case has("ipad", "tablet"):
		device = "tablet"
	case has("mobi", "android", "iphone"):
		device = "mobile"
	default:
		device = "desktop"
	}
	switch {
	case has("edg/", "edge/"):
		browser = "Edge"
	case has("opr/", "opera"):
		browser = "Opera"
	case has("firefox", "fxios"):
		browser = "Firefox"
	case has("chrome", "crios"):
		browser = "Chrome"
	case has("safari"):
		browser = "Safari"
	case has("msie", "trident"):
		browser = "IE"
	case has("curl"):
		browser = "curl"
	default:
		browser = "Other"
	}
	switch {
	case has("windows"):
		os = "Windows"
	case has("android"):
		os = "Android"
	case has("iphone", "ipad", "ios"):
		os = "iOS"
	case has("mac os", "macintosh"):
		os = "macOS"
	case has("linux", "x11"):
		os = "Linux"
	default:
		os = "Other"
	}
	return
}
