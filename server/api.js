import { handleAuthApi } from './authApi.js'
import { handleReviewApi } from './reviewApi.js'
import { handleSavedApi } from './savedApi.js'
export async function handleApi(request, response) { return await handleAuthApi(request, response) || await handleSavedApi(request, response) || await handleReviewApi(request, response) }
