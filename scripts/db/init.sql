-- Runs once, on the first start of the compose postgres volume.
-- `tenantdesk` is created by POSTGRES_DB; this adds the database the test suites own.
CREATE DATABASE tenantdesk_test;
