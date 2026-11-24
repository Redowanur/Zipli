package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"shorturl/internal/analytics"
	"shorturl/internal/cache"
	"shorturl/internal/config"
	"shorturl/internal/events"
	"shorturl/internal/server"
	"shorturl/internal/store"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	if err := run(); err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Postgres may still be starting; retry briefly.
	var db *store.Store
	for i := 0; i < 30; i++ {
		if db, err = store.Open(ctx, cfg.DatabaseURL); err == nil {
			break
		}
		slog.Warn("waiting for postgres", "err", err)
		time.Sleep(time.Second)
	}
	if err != nil {
		return err
	}
	defer db.Close()
	if err := db.Migrate(ctx); err != nil {
		return err
	}

	ch := cache.New(cfg.RedisAddr, time.Duration(cfg.CacheTTLSec)*time.Second)
	defer ch.Close()
	ev := events.NewProducer(cfg.KafkaBrokers, cfg.KafkaTopic, cfg.IPSalt)
	defer ev.Close()

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           server.New(cfg, db, ch, ev, analytics.New(cfg.ClickHouse)).Routes(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	go func() {
		<-ctx.Done()
		sctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		srv.Shutdown(sctx)
	}()
	slog.Info("listening", "addr", cfg.HTTPAddr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
