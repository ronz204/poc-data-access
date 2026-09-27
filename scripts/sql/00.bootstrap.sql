SELECT format('CREATE ROLE sampler WITH LOGIN PASSWORD %L NOBYPASSRLS', :'sampler_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sampler') \gexec

SELECT format('CREATE ROLE runner WITH LOGIN PASSWORD %L NOBYPASSRLS', :'runner_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'runner') \gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO sampler, runner', current_database()) \gexec
SELECT format('GRANT CREATE ON DATABASE %I TO sampler', current_database()) \gexec

CREATE SCHEMA IF NOT EXISTS core AUTHORIZATION sampler;
GRANT USAGE ON SCHEMA core TO runner;

ALTER DEFAULT PRIVILEGES FOR ROLE sampler IN SCHEMA core
  GRANT SELECT, INSERT, UPDATE ON TABLES TO runner;
