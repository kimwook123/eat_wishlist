import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const dataDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data')
mkdirSync(dataDirectory, { recursive: true })
export const database = new DatabaseSync(path.join(dataDirectory, 'hanip.sqlite'), { timeout: 5000 })
database.exec(`
PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE COLLATE NOCASE,display_name TEXT NOT NULL,password_hash TEXT NOT NULL,created_at TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin'))) STRICT;
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at TEXT NOT NULL,created_at TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,place_id TEXT NOT NULL,place_name TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),content TEXT NOT NULL,image_data TEXT,created_at TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS saved_places(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,place_id TEXT NOT NULL,place_name TEXT NOT NULL,category TEXT NOT NULL,address TEXT NOT NULL,phone TEXT NOT NULL,url TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(user_id,place_id)) STRICT;
CREATE INDEX IF NOT EXISTS reviews_place_created ON reviews(place_id,created_at DESC);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);`)
if (!database.prepare('PRAGMA table_info(users)').all().some((column) => column.name === 'role')) database.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin'))")
if (!database.prepare('PRAGMA table_info(reviews)').all().some((column) => column.name === 'image_data')) database.exec('ALTER TABLE reviews ADD COLUMN image_data TEXT')
