import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { database } from './database.js'
const lifetime = 7 * 24 * 60 * 60 * 1000
const cookies = (request) => Object.fromEntries((request.headers.cookie || '').split(';').filter(Boolean).map((part) => { const [key, ...value] = part.trim().split('='); return [key, decodeURIComponent(value.join('='))] }))
export function hashPassword(password) { const salt = randomBytes(16); return `${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}` }
export function verifyPassword(password, stored) { const [salt, hash] = stored.split(':'); if (!salt || !hash) return false; const expected = Buffer.from(hash, 'hex'); const actual = scryptSync(password, Buffer.from(salt, 'hex'), expected.length); return timingSafeEqual(expected, actual) }
export function createSession(userId) { const id = randomBytes(32).toString('hex'); database.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(id, userId, new Date(Date.now() + lifetime).toISOString(), new Date().toISOString()); return { id, maxAge: lifetime / 1000 } }
export function currentUser(request) { const id = cookies(request).hanip_session; return id ? database.prepare('SELECT users.id,users.username,users.display_name AS displayName,users.role FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.id=? AND sessions.expires_at>?').get(id, new Date().toISOString()) || null : null }
export function deleteSession(request) { const id = cookies(request).hanip_session; if (id) database.prepare('DELETE FROM sessions WHERE id=?').run(id) }
export function createUser({ username, displayName, password }) { const id = randomUUID(); database.prepare('INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,?,?)').run(id, username, displayName, hashPassword(password), new Date().toISOString()); return { id, username, displayName, role: 'user' } }
export function findUser(username) { return database.prepare('SELECT id,username,display_name AS displayName,password_hash AS passwordHash,role FROM users WHERE username=?').get(username) }
