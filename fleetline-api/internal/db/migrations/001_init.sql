-- Core schema. Each entity keeps the full API object in `doc` (exactly what the console reads)
-- and copies the fields we filter, sort or join on into real columns with indexes.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS sites (
  id   text PRIMARY KEY,
  name text NOT NULL
);

-- Zones are drawn as polygons. Seeded zones are circles (centre + radius) turned into polygons,
-- so point-in-polygon works the same way once real zone shapes are imported.
CREATE TABLE IF NOT EXISTS zones (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  tag          text NOT NULL DEFAULT 'local',
  radius_m     integer NOT NULL DEFAULT 1000,
  centre       geography(Point, 4326) NOT NULL,
  area         geography(Polygon, 4326) NOT NULL,
  surge        boolean NOT NULL DEFAULT false,
  fully_booked boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS zones_area_gix ON zones USING gist (area);

CREATE TABLE IF NOT EXISTS places (
  id       text PRIMARY KEY,
  label    text NOT NULL,
  area     text NOT NULL,
  postcode text NOT NULL,
  zone_id  text REFERENCES zones(id),
  geom     geography(Point, 4326) NOT NULL,
  search   text GENERATED ALWAYS AS (lower(label || ' ' || area || ' ' || postcode)) STORED
);

CREATE TABLE IF NOT EXISTS customers (
  id           text PRIMARY KEY,
  phone_digits text NOT NULL,
  doc          jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS customers_phone_idx ON customers (phone_digits);

CREATE TABLE IF NOT EXISTS drivers (
  id             text PRIMARY KEY,
  callsign       text NOT NULL UNIQUE,
  status         text NOT NULL,
  seats          integer NOT NULL,
  site_id        text NOT NULL,
  active         boolean NOT NULL DEFAULT true,
  simulated      boolean NOT NULL DEFAULT false,
  current_job_id text,
  geom           geography(Point, 4326) NOT NULL,
  doc            jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS drivers_geom_gix ON drivers USING gist (geom);
CREATE INDEX IF NOT EXISTS drivers_status_idx ON drivers (status);

CREATE SEQUENCE IF NOT EXISTS job_number_seq START 69750000;

CREATE TABLE IF NOT EXISTS jobs (
  id          text PRIMARY KEY,
  number      bigint NOT NULL UNIQUE,
  status      text NOT NULL,
  pickup_at   bigint NOT NULL,
  site_id     text NOT NULL,
  source      text NOT NULL,
  driver_id   text,
  created_at  bigint NOT NULL,
  updated_at  bigint NOT NULL,
  pickup_geom geography(Point, 4326) NOT NULL,
  doc         jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status);
CREATE INDEX IF NOT EXISTS jobs_pickup_at_idx ON jobs (pickup_at);
CREATE INDEX IF NOT EXISTS jobs_driver_idx ON jobs (driver_id);
CREATE INDEX IF NOT EXISTS jobs_pickup_gix ON jobs USING gist (pickup_geom);

CREATE TABLE IF NOT EXISTS job_events (
  id     text PRIMARY KEY,
  job_id text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  type   text NOT NULL,
  at     bigint NOT NULL,
  text   text NOT NULL
);
CREATE INDEX IF NOT EXISTS job_events_job_idx ON job_events (job_id, at);
CREATE INDEX IF NOT EXISTS job_events_at_idx ON job_events (at);

-- GPS history for driver playback. Written from the Redis position buffer, not on every ping.
CREATE TABLE IF NOT EXISTS track_points (
  driver_id text NOT NULL,
  at        bigint NOT NULL,
  geom      geography(Point, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS track_points_at_idx ON track_points (at);
CREATE INDEX IF NOT EXISTS track_points_gix ON track_points USING gist (geom);

-- Counter-tab feeds: operators, staff messages, driver chats, call queue, alerts, flights,
-- broadcast messages. Small lists the console loads whole, so a typed table each.
CREATE TABLE IF NOT EXISTS inbox (
  kind text NOT NULL,
  id   text NOT NULL,
  at   bigint NOT NULL,
  doc  jsonb NOT NULL,
  PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS inbox_kind_at_idx ON inbox (kind, at DESC);

-- Everything in the endpoint list that has no dedicated table yet: account fields, custom fields,
-- surge schedules, client tokens, credit cards, items and so on. One shape, one set of handlers.
CREATE TABLE IF NOT EXISTS resources (
  kind       text NOT NULL,
  id         text NOT NULL,
  parent_id  text NOT NULL DEFAULT '',
  data       jsonb NOT NULL,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS resources_parent_idx ON resources (kind, parent_id);
