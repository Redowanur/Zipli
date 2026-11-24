// Package config loads service configuration from environment variables.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	HTTPAddr     string
	DatabaseURL  string
	RedisAddr    string
	KafkaBrokers []string
	KafkaTopic   string
	ClickHouse   ClickHouse
	JWTSecret    string
	BaseURL      string
	IPSalt       string
	CacheTTLSec  int
	// Google OAuth (optional). Redirect URI to register: BASE_URL + /api/auth/google/callback
	GoogleClientID     string
	GoogleClientSecret string
}

type ClickHouse struct {
	URL      string
	User     string
	Password string
	DB       string
}

func Load() (*Config, error) {
	c := &Config{
		HTTPAddr:     env("HTTP_ADDR", ":8080"),
		DatabaseURL:  os.Getenv("DATABASE_URL"),
		RedisAddr:    env("REDIS_ADDR", "localhost:6379"),
		KafkaBrokers: strings.Split(env("KAFKA_BROKERS", "localhost:9092"), ","),
		KafkaTopic:   env("KAFKA_TOPIC", "clicks"),
		ClickHouse: ClickHouse{
			URL:      env("CLICKHOUSE_URL", "http://localhost:8123"),
			User:     env("CLICKHOUSE_USER", "default"),
			Password: os.Getenv("CLICKHOUSE_PASSWORD"),
			DB:       env("CLICKHOUSE_DB", "shorturl"),
		},
		JWTSecret:   os.Getenv("JWT_SECRET"),
		BaseURL:     strings.TrimRight(env("BASE_URL", "http://localhost:8088"), "/"),
		IPSalt:      env("IP_SALT", "change-me"),
		CacheTTLSec: envInt("CACHE_TTL_SECONDS", 86400),

		GoogleClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
	}
	if c.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if len(c.JWTSecret) < 16 {
		return nil, fmt.Errorf("JWT_SECRET is required (min 16 chars)")
	}
	return c, nil
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envInt(k string, def int) int {
	if v, err := strconv.Atoi(os.Getenv(k)); err == nil && v > 0 {
		return v
	}
	return def
}
