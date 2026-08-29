PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,display_name TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS identities (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,provider TEXT NOT NULL,external_id TEXT NOT NULL,email TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(provider,external_id));
CREATE TABLE IF NOT EXISTS user_state (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,state_version INTEGER NOT NULL DEFAULT 1,state_json TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,feedback_type TEXT NOT NULL,message TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_identities_user_id ON identities(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
