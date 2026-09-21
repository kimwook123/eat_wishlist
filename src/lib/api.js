async function readApiResponse(response) {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error('리뷰 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.')
  }

  const data = await response.json()
  if (!response.ok) throw new Error(data.message || '리뷰 처리 중 오류가 발생했습니다.')
  return data
}

export { readApiResponse }
