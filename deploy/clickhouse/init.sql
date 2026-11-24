-- Kafka -> ClickHouse click pipeline.
-- clicks_queue consumes the topic; clicks_mv moves rows into the durable table.
CREATE TABLE IF NOT EXISTS shorturl.clicks
(
    ts       DateTime,
    code     String,
    visitor  String,
    country  LowCardinality(String),
    referrer String,
    device   LowCardinality(String),
    browser  LowCardinality(String),
    os       LowCardinality(String)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (code, ts)
TTL ts + INTERVAL 365 DAY;   -- longest plan retention (Business/Enterprise)

CREATE TABLE IF NOT EXISTS shorturl.clicks_queue
(
    ts       UInt32,
    code     String,
    visitor  String,
    country  String,
    referrer String,
    device   String,
    browser  String,
    os       String
)
ENGINE = Kafka
SETTINGS kafka_broker_list = 'kafka:9092',
         kafka_topic_list = 'clicks',
         kafka_group_name = 'clickhouse-clicks',
         kafka_format = 'JSONEachRow',
         kafka_num_consumers = 1,
         kafka_skip_broken_messages = 1000;

CREATE MATERIALIZED VIEW IF NOT EXISTS shorturl.clicks_mv TO shorturl.clicks AS
SELECT toDateTime(ts) AS ts, code, visitor, country, referrer, device, browser, os
FROM shorturl.clicks_queue;
