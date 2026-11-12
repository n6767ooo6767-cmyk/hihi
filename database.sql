-- OnePlace D1 schema (run once in D1 Console)
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'player' CHECK(role IN ('player','admin','guard')),
 balance INTEGER NOT NULL DEFAULT 1000,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
 expires_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS tickets (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL,
 price INTEGER NOT NULL DEFAULT 0, qr_code TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','used','cancelled')),
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(owner_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS parcels (
 id TEXT PRIMARY KEY, sender_id TEXT NOT NULL, receiver_name TEXT NOT NULL,
 tracking_code TEXT NOT NULL UNIQUE, description TEXT,
 status TEXT NOT NULL DEFAULT 'accepted' CHECK(status IN ('accepted','in_transit','ready','delivered')),
 created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(sender_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS messages (
 id TEXT PRIMARY KEY, sender_id TEXT, receiver_id TEXT NOT NULL,
 message TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(sender_id) REFERENCES users(id), FOREIGN KEY(receiver_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS transactions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, amount INTEGER NOT NULL,
 description TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS activity (
 id TEXT PRIMARY KEY, user_id TEXT, action TEXT NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_tickets_owner ON tickets(owner_id);
CREATE INDEX IF NOT EXISTS idx_parcels_sender ON parcels(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
