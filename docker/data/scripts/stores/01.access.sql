SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database())
\gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO sampler, runner, relayer', current_database())
\gexec

REVOKE ALL ON SCHEMA public FROM PUBLIC;
