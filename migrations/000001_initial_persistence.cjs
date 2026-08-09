/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE devices (
      imei varchar(15) PRIMARY KEY,
      label text NOT NULL CHECK (length(btrim(label)) > 0),
      source text NOT NULL DEFAULT 'simulator' CHECK (length(btrim(source)) > 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      archived_at timestamptz,
      CONSTRAINT devices_imei_format CHECK (imei ~ '^[0-9]{15}$'),
      CONSTRAINT devices_archived_after_creation CHECK (archived_at IS NULL OR archived_at >= created_at)
    );

    CREATE TABLE simulator_configs (
      imei varchar(15) PRIMARY KEY REFERENCES devices(imei) ON DELETE CASCADE,
      config jsonb NOT NULL CHECK (jsonb_typeof(config) = 'object'),
      config_revision integer NOT NULL CHECK (config_revision >= 1)
    );

    CREATE TABLE device_config_revisions (
      imei varchar(15) NOT NULL REFERENCES devices(imei) ON DELETE CASCADE,
      config_revision integer NOT NULL CHECK (config_revision >= 1),
      created_at timestamptz NOT NULL DEFAULT now(),
      changed_fields text[] NOT NULL DEFAULT ARRAY[]::text[],
      config jsonb NOT NULL CHECK (jsonb_typeof(config) = 'object'),
      PRIMARY KEY (imei, config_revision)
    );

    CREATE TABLE runs (
      run_id uuid PRIMARY KEY,
      imei varchar(15) NOT NULL REFERENCES devices(imei) ON DELETE CASCADE,
      status text NOT NULL CHECK (status IN (
        'configured', 'starting', 'running', 'reconnecting', 'stopped',
        'rejected', 'failed', 'completed', 'interrupted'
      )),
      updated_at timestamptz NOT NULL DEFAULT now(),
      started_at timestamptz,
      stopped_at timestamptz,
      last_error text,
      CONSTRAINT runs_stopped_after_start CHECK (
        stopped_at IS NULL OR started_at IS NULL OR stopped_at >= started_at
      )
    );

    CREATE TABLE trips (
      id uuid PRIMARY KEY,
      imei varchar(15) NOT NULL REFERENCES devices(imei) ON DELETE CASCADE,
      status text NOT NULL CHECK (status IN ('active', 'completed', 'interrupted')),
      route_file text,
      accepted_record_count bigint NOT NULL DEFAULT 0 CHECK (accepted_record_count >= 0),
      checkpoint jsonb,
      started_at timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz,
      CONSTRAINT trips_finished_after_start CHECK (
        finished_at IS NULL OR finished_at >= started_at
      ),
      CONSTRAINT trips_terminal_finish CHECK (
        (status = 'active' AND finished_at IS NULL)
        OR (status IN ('completed', 'interrupted') AND finished_at IS NOT NULL)
      )
    );

    CREATE TABLE avl_frames (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      imei varchar(15) NOT NULL REFERENCES devices(imei) ON DELETE CASCADE,
      payload bytea NOT NULL CHECK (octet_length(payload) > 0),
      payload_sha256 bytea GENERATED ALWAYS AS (digest(payload, 'sha256')) STORED,
      decode_status text NOT NULL DEFAULT 'pending'
        CHECK (decode_status IN ('pending', 'decoded', 'failed')),
      decode_error jsonb,
      codec_id smallint CHECK (codec_id BETWEEN 0 AND 255),
      data_length integer CHECK (data_length >= 0),
      record_count smallint CHECK (record_count BETWEEN 1 AND 255),
      crc integer CHECK (crc BETWEEN 0 AND 65535),
      first_seen_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (imei, payload_sha256),
      CONSTRAINT avl_frames_decode_state CHECK (
        (decode_status = 'pending' AND decode_error IS NULL)
        OR (decode_status = 'failed' AND decode_error IS NOT NULL)
        OR (
          decode_status = 'decoded'
          AND decode_error IS NULL
          AND codec_id IS NOT NULL
          AND data_length IS NOT NULL
          AND record_count IS NOT NULL
          AND crc IS NOT NULL
        )
      )
    );

    CREATE TABLE avl_frame_receptions (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      frame_id bigint NOT NULL REFERENCES avl_frames(id) ON DELETE CASCADE,
      imei varchar(15) NOT NULL REFERENCES devices(imei) ON DELETE CASCADE,
      session_id text NOT NULL CHECK (length(btrim(session_id)) > 0),
      run_id uuid REFERENCES runs(run_id) ON DELETE SET NULL,
      trip_id uuid REFERENCES trips(id) ON DELETE SET NULL,
      received_at timestamptz NOT NULL DEFAULT now(),
      acknowledged_record_count smallint
        CHECK (acknowledged_record_count BETWEEN 0 AND 255)
    );

    CREATE TABLE avl_records (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      frame_id bigint NOT NULL REFERENCES avl_frames(id) ON DELETE CASCADE,
      imei varchar(15) NOT NULL REFERENCES devices(imei) ON DELETE CASCADE,
      record_index smallint NOT NULL CHECK (record_index BETWEEN 0 AND 254),
      trip_id uuid REFERENCES trips(id) ON DELETE SET NULL,
      config_revision integer CHECK (config_revision IS NULL OR config_revision >= 1),
      timestamp timestamptz NOT NULL,
      priority smallint NOT NULL CHECK (priority BETWEEN 0 AND 2),
      longitude_e7 integer NOT NULL CHECK (longitude_e7 BETWEEN -1800000000 AND 1800000000),
      latitude_e7 integer NOT NULL CHECK (latitude_e7 BETWEEN -900000000 AND 900000000),
      altitude_meters integer NOT NULL CHECK (altitude_meters BETWEEN -32768 AND 32767),
      heading_degrees integer NOT NULL CHECK (heading_degrees BETWEEN 0 AND 65535),
      satellites integer NOT NULL CHECK (satellites BETWEEN 0 AND 255),
      speed_kph integer NOT NULL CHECK (speed_kph BETWEEN 0 AND 65535),
      event_io_id integer NOT NULL CHECK (event_io_id BETWEEN 0 AND 65535),
      UNIQUE (frame_id, record_index)
    );

    CREATE TABLE avl_io_elements (
      record_id bigint NOT NULL REFERENCES avl_records(id) ON DELETE CASCADE,
      element_index integer NOT NULL CHECK (element_index >= 0),
      io_id integer NOT NULL CHECK (io_id BETWEEN 0 AND 65535),
      io_size_bytes integer NOT NULL CHECK (io_size_bytes >= 0),
      numeric_value numeric(20, 0),
      bytea_value bytea,
      PRIMARY KEY (record_id, element_index),
      CONSTRAINT avl_io_elements_value_kind CHECK (
        (numeric_value IS NOT NULL AND bytea_value IS NULL AND io_size_bytes IN (1, 2, 4, 8))
        OR (
          numeric_value IS NULL
          AND bytea_value IS NOT NULL
          AND octet_length(bytea_value) = io_size_bytes
        )
      ),
      CONSTRAINT avl_io_elements_numeric_range CHECK (
        numeric_value IS NULL
        OR (numeric_value >= 0 AND numeric_value <= 18446744073709551615)
      )
    );

    CREATE TABLE dashboard_logs (
      id uuid PRIMARY KEY,
      imei varchar(15) REFERENCES devices(imei) ON DELETE SET NULL,
      severity text NOT NULL CHECK (severity IN ('debug', 'info', 'warn', 'error')),
      type text NOT NULL CHECK (type IN (
        'deviceCreated', 'deviceUpdated', 'deviceDeleted',
        'simulationStartRequested', 'simulationStopRequested',
        'tcpConnected', 'imeiSent', 'imeiAccepted', 'imeiRejected',
        'avlPacketSent', 'avlFrameReceived', 'avlFrameDecodeFailed',
        'avlAcknowledged', 'reconnectAttempted',
        'runCompleted', 'runStopped', 'runFailed', 'runInterrupted'
      )),
      message text NOT NULL,
      timestamp timestamptz NOT NULL DEFAULT now(),
      context jsonb CHECK (context IS NULL OR jsonb_typeof(context) = 'object'),
      data jsonb,
      frame_id bigint REFERENCES avl_frames(id) ON DELETE SET NULL,
      hidden_at timestamptz
    );

    CREATE INDEX devices_active_updated_idx
      ON devices (updated_at DESC, imei)
      WHERE archived_at IS NULL;
    CREATE INDEX device_config_revisions_history_idx
      ON device_config_revisions (imei, created_at DESC, config_revision DESC);
    CREATE INDEX runs_device_history_idx
      ON runs (imei, updated_at DESC, run_id);
    CREATE UNIQUE INDEX runs_one_active_per_device_idx
      ON runs (imei)
      WHERE status IN ('starting', 'running', 'reconnecting');
    CREATE INDEX trips_device_history_idx
      ON trips (imei, started_at DESC, id);
    CREATE UNIQUE INDEX trips_one_active_per_device_idx
      ON trips (imei)
      WHERE status = 'active';
    CREATE INDEX avl_frames_device_time_idx
      ON avl_frames (imei, first_seen_at DESC, id);
    CREATE INDEX avl_frame_receptions_session_time_idx
      ON avl_frame_receptions (session_id, received_at DESC, id);
    CREATE INDEX avl_frame_receptions_device_time_idx
      ON avl_frame_receptions (imei, received_at DESC, id);
    CREATE INDEX avl_frame_receptions_frame_time_idx
      ON avl_frame_receptions (frame_id, received_at, id);
    CREATE INDEX avl_frame_receptions_run_time_idx
      ON avl_frame_receptions (run_id, received_at, id)
      WHERE run_id IS NOT NULL;
    CREATE INDEX avl_frame_receptions_trip_time_idx
      ON avl_frame_receptions (trip_id, received_at, id)
      WHERE trip_id IS NOT NULL;
    CREATE INDEX avl_records_trip_route_idx
      ON avl_records (trip_id, timestamp, id)
      WHERE trip_id IS NOT NULL;
    CREATE INDEX avl_records_timestamp_idx
      ON avl_records (timestamp DESC, id);
    CREATE INDEX avl_records_device_time_idx
      ON avl_records (imei, timestamp DESC, id DESC)
      INCLUDE (latitude_e7, longitude_e7, altitude_meters, heading_degrees, speed_kph, satellites);
    CREATE INDEX avl_records_device_event_time_idx
      ON avl_records (imei, event_io_id, timestamp DESC)
      WHERE event_io_id <> 0;
    CREATE INDEX avl_io_elements_io_record_idx
      ON avl_io_elements (io_id, record_id);
    CREATE INDEX avl_io_elements_record_io_idx
      ON avl_io_elements (record_id, io_id);
    CREATE INDEX avl_io_elements_numeric_search_idx
      ON avl_io_elements (io_id, numeric_value, record_id)
      WHERE numeric_value IS NOT NULL;
    CREATE INDEX dashboard_logs_visible_time_idx
      ON dashboard_logs (timestamp DESC, id)
      WHERE hidden_at IS NULL;
    CREATE INDEX dashboard_logs_visible_device_time_idx
      ON dashboard_logs (imei, timestamp DESC, id)
      WHERE hidden_at IS NULL AND imei IS NOT NULL;
    CREATE INDEX dashboard_logs_visible_severity_time_idx
      ON dashboard_logs (severity, timestamp DESC, id)
      WHERE hidden_at IS NULL;
    CREATE INDEX dashboard_logs_visible_type_time_idx
      ON dashboard_logs (type, timestamp DESC, id)
      WHERE hidden_at IS NULL;
    CREATE INDEX dashboard_logs_visible_device_type_time_idx
      ON dashboard_logs (imei, type, timestamp DESC, id)
      WHERE hidden_at IS NULL AND imei IS NOT NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS dashboard_logs;
    DROP TABLE IF EXISTS avl_io_elements;
    DROP TABLE IF EXISTS avl_records;
    DROP TABLE IF EXISTS avl_frame_receptions;
    DROP TABLE IF EXISTS avl_frames;
    DROP TABLE IF EXISTS trips;
    DROP TABLE IF EXISTS runs;
    DROP TABLE IF EXISTS device_config_revisions;
    DROP TABLE IF EXISTS simulator_configs;
    DROP TABLE IF EXISTS devices;
  `);
};
