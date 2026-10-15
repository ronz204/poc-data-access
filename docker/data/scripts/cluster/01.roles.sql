SELECT format('CREATE ROLE %I', role)
FROM (VALUES ('sampler'), ('runner'), ('relayer')) AS roles (role)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = roles.role)
\gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION %s PASSWORD %L',
  role, rls, password
)
FROM (VALUES
  ('sampler', 'NOBYPASSRLS', :'sampler_password'),
  ('runner', 'NOBYPASSRLS', :'runner_password'),
  ('relayer', 'BYPASSRLS', :'relayer_password')
) AS roles (role, rls, password)
\gexec
