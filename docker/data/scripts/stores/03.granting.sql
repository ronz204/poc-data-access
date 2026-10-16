GRANT USAGE ON SCHEMA platform, catalog, sales, wallet, messaging TO runner;
GRANT USAGE ON SCHEMA reporting TO reader;
GRANT USAGE ON SCHEMA messaging TO relayer;

ALTER DEFAULT PRIVILEGES FOR ROLE sampler
  IN SCHEMA platform, catalog, sales, messaging
  GRANT SELECT, INSERT, UPDATE ON TABLES TO runner;

ALTER DEFAULT PRIVILEGES FOR ROLE sampler
  IN SCHEMA wallet
  GRANT SELECT, INSERT ON TABLES TO runner;

ALTER DEFAULT PRIVILEGES FOR ROLE sampler
  IN SCHEMA reporting
  GRANT SELECT ON TABLES TO reader;
