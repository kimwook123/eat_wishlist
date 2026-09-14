import { createSession, createUser, currentUser, deleteSession, findUser, verifyPassword } from './auth.js'
const send = (res, status, body, cookie) => { const headers = { 'Content-Type': 'application/json; charset=utf-8' }; if (cookie) headers['Set-Cookie'] = cookie; res.writeHead(status, headers); res.end(JSON.stringify(body)) }
async function readBody(req) { let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 20000) throw new Error('TOO_LARGE') } return JSON.parse(body || '{}') }
export async function handleAuthApi(req, res) {
  const path = new URL(req.url, 'http://localhost').pathname
  if (!path.startsWith('/api/auth/')) return false
  try {
    if (path === '/api/auth/me' && req.method === 'GET') { send(res, 200, { user: currentUser(req) }); return true }
    if (path === '/api/auth/signup' && req.method === 'POST') { const body = await readBody(req); const username = String(body.username || '').trim().toLowerCase(), displayName = String(body.displayName || '').trim(), password = String(body.password || ''); if (!/^[a-z0-9_]{4,20}$/.test(username) || displayName.length < 2 || displayName.length > 20 || password.length < 8 || password.length > 100) { send(res, 400, { message: '아이디는 영문·숫자·밑줄 4~20자, 닉네임은 2~20자, 비밀번호는 8자 이상이어야 합니다.' }); return true } if (findUser(username)) { send(res, 409, { message: '이미 사용 중인 아이디입니다.' }); return true } const user = createUser({ username, displayName, password }), session = createSession(user.id); send(res, 201, { user }, `hanip_session=${session.id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${session.maxAge}`); return true }
    if (path === '/api/auth/login' && req.method === 'POST') { const body = await readBody(req), user = findUser(String(body.username || '').trim().toLowerCase()); if (!user || !verifyPassword(String(body.password || ''), user.passwordHash)) { send(res, 401, { message: '아이디 또는 비밀번호가 올바르지 않습니다.' }); return true } const session = createSession(user.id); send(res, 200, { user: { id: user.id, username: user.username, displayName: user.displayName } }, `hanip_session=${session.id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${session.maxAge}`); return true }
    if (path === '/api/auth/logout' && req.method === 'POST') { deleteSession(req); send(res, 200, { ok: true }, 'hanip_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); return true }
    send(res, 404, { message: '요청을 찾을 수 없습니다.' })
  } catch (error) { send(res, error.code?.startsWith('SQLITE_CONSTRAINT') ? 409 : 500, { message: '인증 처리 중 오류가 발생했습니다.' }) }
  return true
}
