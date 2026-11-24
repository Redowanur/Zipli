// Package shortcode turns sequence IDs into short, non-sequential Base62 codes
// and validates user-supplied aliases.
package shortcode

import "regexp"

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

const (
	mask40 = (1 << 40) - 1
	// Odd multiplier => bijection on the 40-bit domain, so codes never collide.
	mult = 0x5DEECE66D
	xor  = 0x2F3A9C5B71
)

// Encode maps a sequence id (< 2^40) to a scrambled Base62 code.
func Encode(id int64) string {
	x := ((uint64(id) * mult) & mask40) ^ xor
	if x == 0 {
		return "0"
	}
	var buf [8]byte
	i := len(buf)
	for x > 0 {
		i--
		buf[i] = alphabet[x%62]
		x /= 62
	}
	return string(buf[i:])
}

var aliasRe = regexp.MustCompile(`^[0-9A-Za-z_-]{3,32}$`)

// Paths owned by the web UI / API; they can never be used as short codes.
var reserved = map[string]bool{
	"api": true, "login": true, "register": true, "dashboard": true,
	"pricing": true, "healthz": true, "static": true, "admin": true,
	"favicon.ico": true, "robots.txt": true,
}

func ValidAlias(s string) bool {
	return aliasRe.MatchString(s) && !reserved[s]
}
