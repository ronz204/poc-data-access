GRANT USAGE ON SCHEMA platform, catalog, sales, wallet, messaging TO runner;
GRANT USAGE ON SCHEMA reporting TO reader;
GRANT USAGE ON SCHEMA messaging TO relayer;

-- runner never gets DELETE by default: nothing is physically deleted except where a
-- migration grants it explicitly (catalog categories).
ALTER DEFAULT PRIVILEGES FOR ROLE sampler
  IN SCHEMA platform, catalog, sales, messaging
  GRANT SELECT, INSERT, UPDATE ON TABLES TO runner;

ALTER DEFAULT PRIVILEGES FOR ROLE sampler
  IN SCHEMA wallet
  GRANT SELECT, INSERT ON TABLES TO runner;

-- The read side only sees reporting views; the relayer gets column-level grants on
-- messaging.events from the migration that creates it, not a schema-wide default.
ALTER DEFAULT PRIVILEGES FOR ROLE sampler
  IN SCHEMA reporting
  GRANT SELECT ON TABLES TO reader;
