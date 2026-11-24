// Package cache is the Redis read-through cache for the redirect hot path.
package cache

import (
	"context"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"
)

// negative marks a code known not to exist, so bad codes never reach Postgres.
const negative = "\x00"

const negativeTTL = 60 * time.Second

type Cache struct {
	rdb *redis.Client
	ttl time.Duration
}

func New(addr string, ttl time.Duration) *Cache {
	return &Cache{
		rdb: redis.NewClient(&redis.Options{
			Addr: addr, PoolSize: 50, MinIdleConns: 10,
			DialTimeout: 500 * time.Millisecond, ReadTimeout: 100 * time.Millisecond, WriteTimeout: 100 * time.Millisecond,
		}),
		ttl: ttl,
	}
}

func (c *Cache) Ping(ctx context.Context) error { return c.rdb.Ping(ctx).Err() }
func (c *Cache) Close() error                   { return c.rdb.Close() }

func key(code string) string { return "u:" + code }

// Get returns (url, hit, notFound). hit=false means "ask Postgres".
// notFound=true means a cached negative entry.
func (c *Cache) Get(ctx context.Context, code string) (url string, hit, notFound bool) {
	v, err := c.rdb.Get(ctx, key(code)).Result()
	if err != nil {
		if !errors.Is(err, redis.Nil) {
			return "", false, false // Redis trouble: degrade to Postgres
		}
		return "", false, false
	}
	if v == negative {
		return "", true, true
	}
	return v, true, false
}

// Set caches a URL. If the link expires sooner than the default TTL the entry
// expires with it.
func (c *Cache) Set(ctx context.Context, code, url string, expires *time.Time) {
	ttl := c.ttl
	if expires != nil {
		if d := time.Until(*expires); d < ttl {
			ttl = d
		}
	}
	if ttl <= 0 {
		return
	}
	c.rdb.Set(ctx, key(code), url, ttl)
}

func (c *Cache) SetNegative(ctx context.Context, code string) {
	c.rdb.Set(ctx, key(code), negative, negativeTTL)
}

func (c *Cache) Delete(ctx context.Context, code string) { c.rdb.Del(ctx, key(code)) }
