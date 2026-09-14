import { randomUUID } from 'node:crypto'
import { currentUser } from './auth.js'
import { database } from './database.js'

const send = (response, status, body) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(body)) }
const fields = 'place_id AS id,place_name AS name,category,address,phone,url,created_at AS createdAt'
async function readBody(request) { let body = ''; for await (const chunk of request) { body += chunk; if (body.length > 20000) throw new Error('TOO_LARGE') } return JSON.parse(body || '{}') }

export async function handleSavedApi(request, response) {
  const path = new URL(request.url, 'http://localhost').pathname
  if (path !== '/api/saved-places') return false
  const user = currentUser(request)
  if (!user) { send(response, 401, { message: '로그인이 필요합니다.' }); return true }
  try {
    if (request.method === 'GET') { send(response, 200, { places: database.prepare(`SELECT ${fields} FROM saved_places WHERE user_id=? ORDER BY created_at DESC`).all(user.id) }); return true }
    if (request.method === 'POST') {
      const place = await readBody(request)
      const id = String(place.id || ''), name = String(place.name || '').trim()
      if (!id || !name) { send(response, 400, { message: '장소 정보가 올바르지 않습니다.' }); return true }
      database.prepare('INSERT INTO saved_places(id,user_id,place_id,place_name,category,address,phone,url,created_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,place_id) DO NOTHING').run(randomUUID(), user.id, id, name, String(place.category || ''), String(place.address || ''), String(place.phone || ''), String(place.url || ''), new Date().toISOString())
      send(response, 201, { place: database.prepare(`SELECT ${fields} FROM saved_places WHERE user_id=? AND place_id=?`).get(user.id, id) }); return true
    }
    if (request.method === 'DELETE') { const placeId = new URL(request.url, 'http://localhost').searchParams.get('placeId'); if (!placeId) { send(response, 400, { message: '장소 ID가 필요합니다.' }); return true } database.prepare('DELETE FROM saved_places WHERE user_id=? AND place_id=?').run(user.id, placeId); send(response, 200, { ok: true }); return true }
    send(response, 405, { message: '지원하지 않는 요청입니다.' })
  } catch { send(response, 500, { message: '저장 목록 처리 중 오류가 발생했습니다.' }) }
  return true
}
