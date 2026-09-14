import { randomUUID } from 'node:crypto'
import { database } from './database.js'

const fields = 'reviews.id,reviews.place_id AS placeId,reviews.place_name AS placeName,reviews.user_id AS userId,users.display_name AS author,reviews.rating,reviews.content,reviews.image_data AS imageData,reviews.created_at AS createdAt'
export function getReviews(placeId) { return database.prepare(`SELECT ${fields} FROM reviews JOIN users ON users.id=reviews.user_id WHERE reviews.place_id=? ORDER BY reviews.created_at DESC`).all(placeId) }
export function getReviewsByUser(userId) { return database.prepare(`SELECT ${fields} FROM reviews JOIN users ON users.id=reviews.user_id WHERE reviews.user_id=? ORDER BY reviews.created_at DESC`).all(userId) }
export function addReview(placeId, userId, review) {
  const id = randomUUID(), createdAt = new Date().toISOString()
  database.prepare('INSERT INTO reviews(id,place_id,place_name,user_id,rating,content,image_data,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id, placeId, review.placeName, userId, review.rating, review.content, review.imageData || null, createdAt)
  return database.prepare(`SELECT ${fields} FROM reviews JOIN users ON users.id=reviews.user_id WHERE reviews.id=?`).get(id)
}
export function getReview(reviewId) { return database.prepare('SELECT id,user_id AS userId FROM reviews WHERE id=?').get(reviewId) }
export function deleteReview(reviewId) { return database.prepare('DELETE FROM reviews WHERE id=?').run(reviewId).changes > 0 }
