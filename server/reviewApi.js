import { addReview, deleteReview, getReview, getReviews, getReviewsByUser } from './reviewStore.js'
import { currentUser } from './auth.js'

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

async function readJson(request) {
  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (body.length > 1_300_000) throw new Error('PAYLOAD_TOO_LARGE')
  }
  return JSON.parse(body || '{}')
}

export async function handleReviewApi(request, response) {
  const url = new URL(request.url, 'http://localhost')
  if (url.pathname === '/api/my/reviews' && request.method === 'GET') {
    const user = currentUser(request)
    if (!user) { sendJson(response, 401, { message: '로그인이 필요합니다.' }); return true }
    sendJson(response, 200, { reviews: getReviewsByUser(user.id).map(({ userId: _userId, ...review }) => ({ ...review, canDelete: true })) })
    return true
  }
  const deleteMatch = url.pathname.match(/^\/api\/reviews\/([^/]+)$/)
  if (deleteMatch && request.method === 'DELETE') {
    const user = currentUser(request)
    if (!user) { sendJson(response, 401, { message: '로그인이 필요합니다.' }); return true }
    const review = getReview(decodeURIComponent(deleteMatch[1]))
    if (!review) { sendJson(response, 404, { message: '리뷰를 찾을 수 없습니다.' }); return true }
    if (review.userId !== user.id && user.role !== 'admin') { sendJson(response, 403, { message: '이 리뷰를 삭제할 권한이 없습니다.' }); return true }
    deleteReview(review.id)
    sendJson(response, 200, { ok: true })
    return true
  }
  const match = url.pathname.match(/^\/api\/places\/([^/]+)\/reviews$/)
  if (!match) return false
  const placeId = decodeURIComponent(match[1])

  try {
    if (request.method === 'GET') {
      const user = currentUser(request)
      sendJson(response, 200, { reviews: getReviews(placeId).map(({ userId, ...review }) => ({ ...review, canDelete: Boolean(user && (user.id === userId || user.role === 'admin')) })) })
      return true
    }
    if (request.method === 'POST') {
      const user = currentUser(request)
      if (!user) { sendJson(response, 401, { message: '로그인이 필요합니다.' }); return true }
      const body = await readJson(request)
      const content = String(body.content || '').trim()
      const placeName = String(body.placeName || '').trim()
      const rating = Number(body.rating)
      const imageData = body.imageData ? String(body.imageData) : null
      const validImage = !imageData || (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(imageData) && imageData.length <= 1_200_000)
      if (!content || content.length > 500 || !placeName || !Number.isInteger(rating) || rating < 1 || rating > 5 || !validImage) {
        sendJson(response, 400, { message: '리뷰 입력값을 확인해 주세요.' })
        return true
      }
      const savedReview = addReview(placeId, user.id, { content, placeName, rating, imageData })
      sendJson(response, 201, { review: { ...savedReview, canDelete: true } })
      return true
    }
    sendJson(response, 405, { message: '지원하지 않는 요청입니다.' })
  } catch (error) {
    if (error.message === 'PAYLOAD_TOO_LARGE') sendJson(response, 413, { message: '첨부 이미지가 너무 큽니다. 더 작은 이미지를 선택해 주세요.' })
    else sendJson(response, 500, { message: '리뷰 처리 중 오류가 발생했습니다.' })
  }
  return true
}
