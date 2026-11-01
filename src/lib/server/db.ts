import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
export const dataDir = resolve(process.env.DATA_DIR || 'data');
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
export const db = new DatabaseSync(resolve(dataDir, 'wishlist.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'EUR', password TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS challenges (id TEXT PRIMARY KEY, challenge TEXT NOT NULL, payload TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS passkeys (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, public_key TEXT NOT NULL, counter INTEGER NOT NULL, transports TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS folders (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(id,user_id));
CREATE TABLE IF NOT EXISTS shares (hash TEXT PRIMARY KEY, folder_id TEXT NOT NULL UNIQUE REFERENCES folders(id) ON DELETE CASCADE, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), mime TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, created_at TEXT NOT NULL, UNIQUE(id,user_id));
CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), folder_id TEXT NOT NULL, title TEXT NOT NULL, source_url TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', style TEXT NOT NULL DEFAULT 'sticker' CHECK(style IN ('stamp','sticker','object')), size TEXT NOT NULL DEFAULT 'medium' CHECK(size IN ('small','medium','large')), asset_id TEXT, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, deleted_at TEXT, FOREIGN KEY(folder_id,user_id) REFERENCES folders(id,user_id), FOREIGN KEY(asset_id,user_id) REFERENCES assets(id,user_id), UNIQUE(id,user_id));
CREATE TABLE IF NOT EXISTS prices (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, item_id TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>=0), currency TEXT NOT NULL, merchant TEXT NOT NULL DEFAULT '', source_url TEXT NOT NULL DEFAULT '', observed_at TEXT NOT NULL, recorded_at TEXT NOT NULL, deal TEXT NOT NULL DEFAULT '', expires_at TEXT, shipping TEXT NOT NULL DEFAULT '', FOREIGN KEY(item_id,user_id) REFERENCES items(id,user_id));
CREATE TABLE IF NOT EXISTS tokens (hash TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, permission TEXT NOT NULL CHECK(permission IN ('read','write')), folder_id TEXT, created_at TEXT NOT NULL, FOREIGN KEY(folder_id,user_id) REFERENCES folders(id,user_id));
CREATE TABLE IF NOT EXISTS mutations (user_id TEXT NOT NULL, key TEXT NOT NULL, fingerprint TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY(user_id,key));
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS items_folder ON items(folder_id,deleted_at);
CREATE INDEX IF NOT EXISTS prices_item ON prices(item_id,observed_at);
PRAGMA user_version=1;`);
export function one<T = Record<string, unknown>>(sql: string, ...args: (string | number | null)[]): T | undefined { return db.prepare(sql).get(...args) as T | undefined; }
export function all<T = Record<string, unknown>>(sql: string, ...args: (string | number | null)[]): T[] { return db.prepare(sql).all(...args) as T[]; }
export function run(sql: string, ...args: (string | number | null)[]) { return db.prepare(sql).run(...args); }
let transactionDepth=0;
export function transaction<T>(fn: () => T): T {
 const level=transactionDepth;const point='wishlist_'+level;
 db.exec(level?'SAVEPOINT '+point:'BEGIN IMMEDIATE');transactionDepth++;
 try {const result=fn();db.exec(level?'RELEASE SAVEPOINT '+point:'COMMIT');return result;}
 catch(e){db.exec(level?'ROLLBACK TO SAVEPOINT '+point:'ROLLBACK');if(level)db.exec('RELEASE SAVEPOINT '+point);throw e;}
 finally{transactionDepth--;}
}
