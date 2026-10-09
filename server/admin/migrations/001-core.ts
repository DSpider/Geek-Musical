export const coreMigration = {
  id: "core:001",
  sql: `
CREATE TABLE roles (id TEXT PRIMARY KEY);
CREATE TABLE role_permissions (role_id TEXT NOT NULL REFERENCES roles(id), permission TEXT NOT NULL, PRIMARY KEY(role_id, permission));
CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, password_hash TEXT NOT NULL, role_id TEXT NOT NULL REFERENCES roles(id), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, last_seen INTEGER NOT NULL);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE login_attempts (key TEXT PRIMARY KEY, failures INTEGER NOT NULL, first_at INTEGER NOT NULL, blocked_until INTEGER NOT NULL);
CREATE TABLE plugin_state (id TEXT PRIMARY KEY, enabled INTEGER NOT NULL CHECK(enabled IN (0,1)));
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, action TEXT NOT NULL, resource TEXT NOT NULL, resource_id TEXT, created_at TEXT NOT NULL, result TEXT NOT NULL CHECK(result IN ('SUCCESS','FAILURE','PENDING')));
CREATE INDEX audit_date ON audit_log(created_at);
CREATE TABLE content_journal (id INTEGER PRIMARY KEY CHECK(id=1), files TEXT NOT NULL, audit_id INTEGER NOT NULL REFERENCES audit_log(id));
`,
};
