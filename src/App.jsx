import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

const categories = [{ label: '음식점', code: 'FD6' }, { label: '카페', code: 'CE7' }]

function loadKakao(appKey) {
  return new Promise((resolve, reject) => {
    if (window.kakao?.maps?.services) return window.kakao.maps.load(resolve)
    const oldScript = document.getElementById('kakao-map-sdk')
    if (oldScript) {
      oldScript.addEventListener('load', () => window.kakao.maps.load(resolve), { once: true })
      oldScript.addEventListener('error', reject, { once: true })
      return
    }
    const script = document.createElement('script')
    script.id = 'kakao-map-sdk'
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false&libraries=services`
    script.async = true
    script.onload = () => window.kakao.maps.load(resolve)
    script.onerror = reject
    document.head.appendChild(script)
  })
}

async function readApiResponse(response) {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) throw new Error('리뷰 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.')
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || '리뷰 처리 중 오류가 발생했습니다.')
  return data
}

function resizeReviewImage(file) {
  return new Promise((resolve, reject) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { reject(new Error('JPG, PNG, WebP 이미지만 첨부할 수 있습니다.')); return }
    if (file.size > 8 * 1024 * 1024) { reject(new Error('원본 이미지는 8MB 이하여야 합니다.')); return }
    const image = new Image(), reader = new FileReader()
    reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'))
    reader.onload = () => { image.src = reader.result }
    image.onerror = () => reject(new Error('올바른 이미지 파일이 아닙니다.'))
    image.onload = () => {
      const scale = Math.min(1, 1200 / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale)
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
      const data = canvas.toDataURL('image/jpeg', 0.78)
      if (data.length > 1_200_000) reject(new Error('이미지를 더 작은 크기로 선택해 주세요.'))
      else resolve(data)
    }
    reader.readAsDataURL(file)
  })
}

function MyReviewsDialog({ onClose, onOpenPlace }) {
  const [reviews, setReviews] = useState([])
  const [status, setStatus] = useState('loading')
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/my/reviews', { signal: controller.signal }).then(readApiResponse).then((data) => { setReviews(data.reviews); setStatus('success') }).catch((error) => { if (error.name !== 'AbortError') setStatus('error') })
    return () => controller.abort()
  }, [])
  const remove = async (id) => {
    if (!window.confirm('이 리뷰를 삭제할까요?')) return
    try { await readApiResponse(await fetch(`/api/reviews/${encodeURIComponent(id)}`, { method: 'DELETE' })); setReviews((current) => current.filter((review) => review.id !== id)) } catch { setStatus('error') }
  }
  return <div className="saved-overlay" onClick={onClose}><aside className="saved-drawer my-reviews-drawer" role="dialog" aria-modal="true" aria-labelledby="my-reviews-title" onClick={(event) => event.stopPropagation()}><div className="saved-header"><div><p className="eyebrow">MY DINING JOURNAL</p><h2 id="my-reviews-title">내가 쓴 리뷰</h2><p className="drawer-intro">다시 찾고 싶은 한 끼의 기록을 모았어요.</p></div><button type="button" onClick={onClose} aria-label="닫기">×</button></div>{status === 'loading' ? <div className="saved-empty"><p>리뷰를 불러오는 중…</p></div> : reviews.length ? <div className="my-review-list">{reviews.map((review) => <article className="my-review-item" key={review.id}><button className={`review-cover ${review.imageData ? 'has-image' : ''}`} type="button" onClick={() => onOpenPlace(review)} aria-label={`${review.placeName} 정보 보기`}>{review.imageData ? <img src={review.imageData} alt="" /> : <><span>{review.rating}.0</span><small>MY RATING</small></>}</button><div className="my-review-body"><div className="my-review-heading"><div><button className="my-review-place" type="button" onClick={() => onOpenPlace(review)}>{review.placeName}</button><strong>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</strong></div><button type="button" onClick={() => remove(review.id)}>삭제</button></div><p>{review.content}</p><div className="my-review-meta"><time>{new Date(review.createdAt).toLocaleDateString('ko-KR')}</time><button type="button" onClick={() => onOpenPlace(review)}>장소 정보 보기 →</button></div></div></article>)}</div> : <div className="saved-empty"><span>✎</span><strong>{status === 'error' ? '리뷰를 불러오지 못했습니다.' : '아직 작성한 리뷰가 없어요.'}</strong><p>방문한 맛집에 첫 리뷰를 남겨보세요.</p></div>}</aside></div>
}

function KakaoMap({ categoryCode, keyword, locateRequest, onResults, onSelect, searchScope, searchRequest, targetPlaceId, onLocationStatus }) {
  const elementRef = useRef(null)
  const mapRef = useRef(null)
  const placesRef = useRef(null)
  const globalPlacesRef = useRef(null)
  const markersRef = useRef([])
  const requestRef = useRef(0)
  const locationMarkerRef = useRef(null)
  const accuracyCircleRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const appKey = import.meta.env.VITE_KAKAO_MAP_KEY

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((marker) => marker.setMap(null))
    markersRef.current = []
  }, [])

  const search = useCallback(() => {
    const kakao = window.kakao
    if (!mapRef.current || !placesRef.current || !globalPlacesRef.current || !kakao?.maps?.services) return
    requestRef.current = Math.max(requestRef.current, searchRequest)
    const requestId = ++requestRef.current
    const collectedPlaces = []
    onResults('loading', [])
    const callback = (data, status, pagination) => {
      if (requestId !== requestRef.current) return
      if (status !== kakao.maps.services.Status.OK) {
        clearMarkers()
        onResults(status === kakao.maps.services.Status.ZERO_RESULT ? 'empty' : 'error', [])
        return
      }
      collectedPlaces.push(...data)
      if (pagination?.hasNextPage) {
        pagination.nextPage()
        return
      }
      clearMarkers()
      let results = collectedPlaces.map((place) => ({
        id: place.id,
        name: place.place_name,
        category: place.category_name?.split(' > ').pop() || '음식점',
        address: place.road_address_name || place.address_name,
        phone: place.phone,
        url: place.place_url,
        distance: place.distance,
        lat: Number(place.y),
        lng: Number(place.x),
      }))
      if (targetPlaceId) {
        const targetIndex = results.findIndex((place) => place.id === targetPlaceId)
        if (targetIndex < 0) { onResults('empty', []); return }
        results = [results[targetIndex]]
      }
      markersRef.current = results.map((place) => {
        const marker = new kakao.maps.Marker({ map: mapRef.current, position: new kakao.maps.LatLng(place.lat, place.lng), title: place.name })
        kakao.maps.event.addListener(marker, 'click', () => onSelect(place.id))
        return marker
      })
      if (searchScope === 'all' && keyword && results.length) {
        const bounds = new kakao.maps.LatLngBounds()
        results.forEach((place) => bounds.extend(new kakao.maps.LatLng(place.lat, place.lng)))
        mapRef.current.setBounds(bounds)
      }
      onResults('success', results)
    }
    const mapOptions = { useMapBounds: true }
    if (keyword) (searchScope === 'all' ? globalPlacesRef.current : placesRef.current).keywordSearch(keyword, callback, targetPlaceId ? {} : { ...(searchScope === 'map' ? mapOptions : {}), category_group_code: categoryCode })
    else placesRef.current.categorySearch(categoryCode, callback, mapOptions)
  }, [categoryCode, clearMarkers, keyword, onResults, onSelect, searchRequest, searchScope, targetPlaceId])

  useEffect(() => {
    if (!appKey || !elementRef.current) return undefined
    let disposed = false
    loadKakao(appKey).then(() => {
      if (disposed || !elementRef.current) return
      const kakao = window.kakao
      mapRef.current = new kakao.maps.Map(elementRef.current, { center: new kakao.maps.LatLng(37.5665, 126.978), level: 4 })
      placesRef.current = new kakao.maps.services.Places(mapRef.current)
      globalPlacesRef.current = new kakao.maps.services.Places()
      setReady(true)
    }).catch(() => setError('카카오맵을 불러오지 못했습니다. 앱 키와 등록 도메인을 확인해 주세요.'))
    return () => { disposed = true; clearMarkers() }
  }, [appKey, clearMarkers])

  useEffect(() => {
    if (!ready) return undefined
    const kakao = window.kakao
    const handleIdle = () => search()
    if (searchScope === 'map') kakao.maps.event.addListener(mapRef.current, 'idle', handleIdle)
    search()
    return () => { if (searchScope === 'map') kakao.maps.event.removeListener(mapRef.current, 'idle', handleIdle) }
  }, [ready, search, searchScope])

  useEffect(() => {
    if (!ready || !locateRequest) return
    if (!navigator.geolocation) { onLocationStatus({ type: 'error', message: '이 브라우저는 위치 찾기를 지원하지 않습니다.' }); return }
    onLocationStatus({ type: 'loading', message: '현재 위치를 확인하는 중…' })
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const kakao = window.kakao
      const position = new kakao.maps.LatLng(coords.latitude, coords.longitude)
      locationMarkerRef.current?.setMap(null)
      accuracyCircleRef.current?.setMap(null)
      locationMarkerRef.current = new kakao.maps.Marker({ map: mapRef.current, position, title: '내 위치', zIndex: 10 })
      accuracyCircleRef.current = new kakao.maps.Circle({ map: mapRef.current, center: position, radius: Math.max(coords.accuracy, 10), strokeWeight: 2, strokeColor: '#e85e32', strokeOpacity: 0.8, fillColor: '#e85e32', fillOpacity: 0.12, zIndex: 2 })
      mapRef.current.setCenter(position)
      mapRef.current.setLevel(coords.accuracy > 1000 ? 6 : coords.accuracy > 300 ? 5 : 4)
      const accuracy = Math.round(coords.accuracy)
      onLocationStatus({ type: accuracy > 1000 ? 'warning' : 'success', message: `현재 위치 · 오차 약 ${accuracy.toLocaleString()}m` })
    }, (error) => {
      const messages = { 1: '위치 권한이 거부되었습니다.', 2: '현재 위치를 확인할 수 없습니다.', 3: '위치 확인 시간이 초과되었습니다.' }
      onLocationStatus({ type: 'error', message: messages[error.code] || '현재 위치를 불러오지 못했습니다.' })
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 })
  }, [locateRequest, onLocationStatus, ready])

  if (!appKey) return <div className="map-key-warning"><strong>카카오맵 앱 키가 필요합니다.</strong><br />.env에 VITE_KAKAO_MAP_KEY를 설정해 주세요.</div>
  if (error) return <div className="map-key-warning">{error}</div>
  return <div ref={elementRef} className="kakao-map" aria-label="카카오 지도" />
}

function AuthDialog({ onClose, onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submit = async (event) => {
    event.preventDefault(); setSubmitting(true); setMessage('')
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, displayName, password }) })
      const data = await readApiResponse(response)
      onAuthenticated(data.user)
    } catch (error) { setMessage(error.message) } finally { setSubmitting(false) }
  }
  return <div className="auth-overlay" onClick={onClose}><section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title" onClick={(event) => event.stopPropagation()}><button className="auth-close" type="button" onClick={onClose} aria-label="닫기">×</button><p className="eyebrow">WELCOME TO HANIP</p><h2 id="auth-title">{mode === 'login' ? '로그인' : '회원가입'}</h2><p className="auth-description">계정으로 로그인하고 나만의 맛집 리뷰를 남겨보세요.</p><form onSubmit={submit}><label>아이디<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="영문, 숫자, 밑줄 4~20자" /></label>{mode === 'signup' && <label>닉네임<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="nickname" placeholder="리뷰에 표시할 이름" /></label>}<label>비밀번호<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="8자 이상" /></label>{message && <p className="auth-error">{message}</p>}<button className="auth-submit" type="submit" disabled={submitting}>{submitting ? '처리 중…' : mode === 'login' ? '로그인' : '계정 만들기'}</button></form><button className="auth-switch" type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage('') }}>{mode === 'login' ? '처음이신가요? 회원가입' : '이미 계정이 있나요? 로그인'}</button></section></div>
}

function ReviewPanel({ place, saved, onToggleSaved, searchStatus, user, onRequireLogin, compact = false, onViewAll }) {
  const [reviews, setReviews] = useState([])
  const [reviewStatus, setReviewStatus] = useState('loading')
  const [content, setContent] = useState('')
  const [rating, setRating] = useState(5)
  const [imageData, setImageData] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!place) return undefined
    const controller = new AbortController()
    fetch(`/api/places/${encodeURIComponent(place.id)}/reviews`, { signal: controller.signal })
      .then(readApiResponse)
      .then((data) => { setReviews(data.reviews); setReviewStatus('success') })
      .catch((error) => { if (error.name !== 'AbortError') { setReviewStatus('error'); setMessage(error.message) } })
    return () => controller.abort()
  }, [place])

  const submitReview = async (event) => {
    event.preventDefault()
    if (!user) { onRequireLogin(); return }
    if (!content.trim()) { setMessage('리뷰 내용을 입력해 주세요.'); return }
    setReviewStatus('submitting')
    setMessage('')
    try {
      const response = await fetch(`/api/places/${encodeURIComponent(place.id)}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeName: place.name, content: content.trim(), rating, imageData }),
      })
      const data = await readApiResponse(response)
      setReviews((current) => [data.review, ...current])
      setContent('')
      setImageData(null)
      setRating(5)
      setReviewStatus('success')
      setMessage('리뷰가 등록되었습니다.')
    } catch (error) {
      setReviewStatus('error')
      setMessage(error.message)
    }
  }

  const removeReview = async (reviewId) => {
    if (!window.confirm('이 리뷰를 삭제할까요?')) return
    setMessage('')
    try {
      await readApiResponse(await fetch(`/api/reviews/${encodeURIComponent(reviewId)}`, { method: 'DELETE' }))
      setReviews((current) => current.filter((review) => review.id !== reviewId))
      setMessage('리뷰가 삭제되었습니다.')
    } catch (error) { setReviewStatus('error'); setMessage(error.message) }
  }

  if (!place) return <aside className="map-detail"><p className="eyebrow">SELECTED PLACE</p><p className="detail-description">{searchStatus === 'loading' ? '주변 장소를 찾고 있습니다.' : searchStatus === 'empty' ? '이 지도 영역에는 검색 결과가 없습니다.' : '지도에서 장소를 검색해 보세요.'}</p></aside>

  const average = reviews.length ? (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1) : null
  return <aside className="map-detail review-panel">
    <p className="eyebrow">SELECTED PLACE</p>
    <div className="detail-heading"><div><p className="location">{place.category}</p><h2>{place.name}</h2></div><button className={`detail-save ${saved ? 'saved' : ''}`} type="button" onClick={() => onToggleSaved(place)}>{saved ? '저장됨' : '저장'}</button></div>
    <p className="detail-description">{place.address}</p>
    <div className="review-summary"><strong>{average ? `★ ${average}` : '아직 별점 없음'}</strong><span>한입 리뷰 {reviews.length}개</span></div>
    <div className="site-reviews" aria-live="polite">{reviewStatus === 'loading' ? <p className="review-empty">리뷰를 불러오는 중…</p> : reviews.length ? (compact ? reviews.slice(0, 2) : reviews).map((review) => <article className="site-review" key={review.id}><div><strong>{review.author}</strong><span>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span></div>{review.imageData && <img className="review-image" src={review.imageData} alt={`${review.author}님의 리뷰 사진`} />}<p>{review.content}</p><footer className="review-footer"><time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString('ko-KR')}</time>{review.canDelete && <button type="button" onClick={() => removeReview(review.id)}>삭제</button>}</footer></article>) : <p className="review-empty">아직 작성된 리뷰가 없습니다.<br />이 장소의 첫 리뷰를 남겨보세요.</p>}</div>
    {compact && <button className="view-all-reviews" type="button" onClick={() => onViewAll(place)}>리뷰 전체보기 <span>{reviews.length}</span> →</button>}
    {!compact && (user ? <form className="site-review-form" onSubmit={submitReview}><h3><span className="review-author">{user.displayName}</span>님의 리뷰</h3><div className="rating-picker" aria-label="별점 선택">{[1, 2, 3, 4, 5].map((score) => <button key={score} type="button" className={score <= rating ? 'on' : ''} onClick={() => setRating(score)} aria-label={`${score}점`}>★</button>)}</div><textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength="500" rows="3" placeholder="이 맛집은 어떠셨나요?" aria-label="리뷰 내용" />{imageData ? <div className="image-preview"><img src={imageData} alt="첨부 이미지 미리보기" /><button type="button" onClick={() => setImageData(null)}>사진 삭제</button></div> : <label className="image-upload">＋ 사진 추가 (선택)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { setImageData(await resizeReviewImage(file)); setMessage('') } catch (error) { setMessage(error.message); setReviewStatus('error') } event.target.value = '' }} /></label>}<div className="review-form-bottom"><small>{content.length}/500</small><button type="submit" disabled={reviewStatus === 'submitting'}>{reviewStatus === 'submitting' ? '등록 중…' : '리뷰 등록'}</button></div>{message && <p className={reviewStatus === 'error' ? 'form-message error' : 'form-message'}>{message}</p>}</form> : <div className="review-login-required"><p>로그인하고 이 장소의 리뷰를 남겨보세요.</p><button type="button" onClick={onRequireLogin}>로그인 / 회원가입</button></div>)}
    <a className="kakao-link" href={place.url} target="_blank" rel="noreferrer">장소 정보는 카카오맵에서 보기 →</a>
  </aside>
}

function PlaceDetailPage({ place, user, saved, onToggleSaved, onRequireLogin, onBack }) {
  return <div className="app-shell detail-shell"><header className="topbar detail-topbar"><button className="back-button" type="button" onClick={onBack}>← 검색 결과로 돌아가기</button><a className="brand" href="/" onClick={(event) => { event.preventDefault(); onBack() }}><span>한입</span><small>HANIP</small></a></header><main className="place-page"><div className="place-page-heading"><p className="eyebrow">PLACE & REVIEWS</p><p>한입 사용자들의 솔직한 방문 기록</p></div><ReviewPanel place={place} saved={saved} onToggleSaved={onToggleSaved} searchStatus="success" user={user} onRequireLogin={onRequireLogin} /></main></div>
}

function App() {
  const [input, setInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [categoryCode, setCategoryCode] = useState('FD6')
  const [searchScope, setSearchScope] = useState('map')
  const [searchRequest, setSearchRequest] = useState(0)
  const [targetPlaceId, setTargetPlaceId] = useState(null)
  const [locationStatus, setLocationStatus] = useState({ type: 'idle', message: '' })
  const [places, setPlaces] = useState([])
  const [status, setStatus] = useState('loading')
  const [selectedId, setSelectedId] = useState(null)
  const [locateRequest, setLocateRequest] = useState(0)
  const [showSaved, setShowSaved] = useState(false)
  const [user, setUser] = useState(null)
  const [showAuth, setShowAuth] = useState(false)
  const [showMyReviews, setShowMyReviews] = useState(false)
  const [detailPlace, setDetailPlace] = useState(() => window.history.state?.hanipPlace || null)
  const [saved, setSaved] = useState([])

  const handleResults = useCallback((nextStatus, nextPlaces) => {
    setStatus(nextStatus)
    if (nextStatus === 'loading') return
    setPlaces(nextPlaces)
    setSelectedId((id) => nextPlaces.some((place) => place.id === id) ? id : nextPlaces[0]?.id || null)
  }, [])
  const handleSelect = useCallback((id) => setSelectedId(id), [])
  const handleLocationStatus = useCallback((nextStatus) => setLocationStatus(nextStatus), [])
  const selected = places.find((place) => place.id === selectedId) || places[0]
  const isSaved = (id) => saved.some((place) => place.id === id)

  useEffect(() => {
    fetch('/api/auth/me').then(readApiResponse).then((data) => setUser(data.user)).catch(() => setUser(null))
  }, [])

  useEffect(() => {
    const handlePopState = (event) => setDetailPlace(event.state?.hanipPlace || null)
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!user) return undefined
    const controller = new AbortController()
    fetch('/api/saved-places', { signal: controller.signal }).then(readApiResponse).then((data) => setSaved(data.places)).catch((error) => { if (error.name !== 'AbortError') setSaved([]) })
    return () => controller.abort()
  }, [user])

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    setSaved([])
    setShowSaved(false)
  }

  useEffect(() => {
    if (!showSaved) return undefined
    const closeOnEscape = (event) => { if (event.key === 'Escape') setShowSaved(false) }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [showSaved])

  const toggleSaved = async (place) => {
    if (!user) { setShowAuth(true); return }
    const alreadySaved = isSaved(place.id)
    try {
      const response = await fetch(alreadySaved ? `/api/saved-places?placeId=${encodeURIComponent(place.id)}` : '/api/saved-places', {
        method: alreadySaved ? 'DELETE' : 'POST',
        headers: alreadySaved ? undefined : { 'Content-Type': 'application/json' },
        body: alreadySaved ? undefined : JSON.stringify(place),
      })
      const data = await readApiResponse(response)
      setSaved((current) => alreadySaved ? current.filter((item) => item.id !== place.id) : [data.place, ...current.filter((item) => item.id !== place.id)])
    } catch (error) {
      if (error.message === '로그인이 필요합니다.') { setUser(null); setSaved([]); setShowAuth(true) }
    }
  }

  const openSavedPlace = (place) => {
    const placeName = place.name || place.placeName
    setShowSaved(false)
    setShowMyReviews(false)
    setSearchScope('all')
    setInput(placeName)
    setKeyword(placeName)
    const placeId = place.placeId || place.id
    setTargetPlaceId(placeId)
    setSelectedId(placeId)
    setSearchRequest((value) => value + 1)
    window.setTimeout(() => document.getElementById('map-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  const openPlaceDetail = (place) => {
    window.history.pushState({ hanipPlace: place }, '', `/place/${place.id}`)
    setDetailPlace(place)
    window.scrollTo({ top: 0 })
  }

  const closePlaceDetail = () => {
    if (window.history.state?.hanipPlace) window.history.back()
    else { window.history.replaceState(null, '', '/'); setDetailPlace(null) }
  }

  if (detailPlace) return <><PlaceDetailPage place={detailPlace} user={user} saved={isSaved(detailPlace.id)} onToggleSaved={toggleSaved} onRequireLogin={() => setShowAuth(true)} onBack={closePlaceDetail} />{showAuth && <AuthDialog onClose={() => setShowAuth(false)} onAuthenticated={(nextUser) => { setUser(nextUser); setShowAuth(false) }} />}</>

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#top"><span>한입</span><small>HANIP</small></a><nav><a className="active" href="#discover">맛집 찾기</a><a href="#places">검색 결과</a><a href="#about">서비스 원칙</a></nav><div className="account-actions"><button className="saved-count" type="button" onClick={() => user ? setShowSaved(true) : setShowAuth(true)} aria-label={user ? `저장한 장소 ${saved.length}개 보기` : '로그인하고 맛집 저장하기'}>♡ 저장 {user ? saved.length : ''}</button>{user ? <div className="user-menu"><strong>{user.displayName}</strong><button type="button" onClick={() => setShowMyReviews(true)}>내 리뷰</button><button type="button" onClick={logout}>로그아웃</button></div> : <button className="login-button" type="button" onClick={() => setShowAuth(true)}>로그인</button>}</div></header>
    {showAuth && <AuthDialog onClose={() => setShowAuth(false)} onAuthenticated={(nextUser) => { setUser(nextUser); setShowAuth(false) }} />}
    {showMyReviews && <MyReviewsDialog onClose={() => setShowMyReviews(false)} onOpenPlace={openSavedPlace} />}
    {showSaved && <div className="saved-overlay" role="presentation" onClick={() => setShowSaved(false)}><aside className="saved-drawer" role="dialog" aria-modal="true" aria-labelledby="saved-title" onClick={(event) => event.stopPropagation()}><div className="saved-header"><div><p className="eyebrow">MY WISHLIST</p><h2 id="saved-title">저장한 맛집</h2></div><button type="button" onClick={() => setShowSaved(false)} aria-label="저장 목록 닫기">×</button></div>{saved.length ? <div className="saved-list">{saved.map((place) => <article className="saved-place" key={place.id}><div><p className="location">{place.category}</p><h3><button className="saved-place-link" type="button" onClick={() => openSavedPlace(place)}>{place.name}</button></h3><p>{place.address || '주소 정보 없음'}</p></div><div className="saved-actions"><a href={place.url} target="_blank" rel="noreferrer">카카오맵</a><button type="button" onClick={() => toggleSaved(place)}>저장 해제</button></div></article>)}</div> : <div className="saved-empty"><span>♡</span><strong>아직 저장한 장소가 없어요.</strong><p>지도에서 마음에 드는 장소를 저장해 보세요.</p></div>}</aside></div>}
    <main id="top">
      <section className="hero-section" id="discover"><div className="hero-copy"><p className="eyebrow">카카오맵으로 찾는 오늘의 한입</p><h1>지금 내 주변,<br /><em>진짜 맛집 찾기.</em></h1><p className="hero-description">지도에 실제 등록된 음식점과 카페를 검색하고,<br />마음에 드는 곳은 나만의 목록에 저장하세요.</p><div className="hero-proof"><span className="proof-mark">✓</span><span><strong>실시간 장소 검색</strong><br />카카오맵의 최신 장소 정보를 보여드려요</span></div></div><div className="hero-image-wrap"><img src="https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=85" alt="다양한 음식이 차려진 테이블" /><span className="image-note">오늘의 식탁</span></div></section>
      <section className="search-section"><div className="search-heading"><div><p className="eyebrow">EXPLORE</p><h2>어디서 무엇을 먹을까요?</h2></div><span className="result-count">{status === 'loading' ? '검색 중…' : `${places.length}개의 장소`}</span></div><div className="scope-row"><button className={searchScope === 'all' ? 'active' : ''} type="button" onClick={() => { setSearchScope('all'); setTargetPlaceId(null) }}>전국 검색</button><button className={searchScope === 'map' ? 'active' : ''} type="button" onClick={() => { setSearchScope('map'); setTargetPlaceId(null) }}>현재 지도</button><span>{searchScope === 'all' ? '지역과 메뉴를 함께 입력하면 해당 위치로 이동해요.' : '지도를 움직일 때마다 보이는 영역을 다시 검색해요.'}</span></div><form className="search-box" onSubmit={(event) => { event.preventDefault(); if (searchScope === 'all' && !input.trim()) return; setTargetPlaceId(null); setKeyword(input.trim()); setSearchRequest((value) => value + 1) }}><span aria-hidden="true">⌕</span><input value={input} onChange={(event) => setInput(event.target.value)} placeholder={searchScope === 'all' ? '예: 강남역 파스타, 부산 해운대 횟집' : '현재 지도에서 찾을 메뉴나 식당'} /><button type="submit">검색</button></form><div className="category-row">{categories.map((item) => <button className={categoryCode === item.code ? 'selected' : ''} key={item.code} type="button" onClick={() => { setCategoryCode(item.code); setTargetPlaceId(null) }}>{item.label}</button>)}</div></section>
      <section className="map-section" id="map-results"><div className="map-panel"><div className="map-toolbar"><span className={`map-status ${locationStatus.type}`}><i /> {locationStatus.message || (searchScope === 'all' ? '전국 검색 결과가 있는 위치로 자동 이동해요' : '지도를 움직이면 이 지역을 다시 검색해요')}</span><button type="button" onClick={() => { setTargetPlaceId(null); setSearchScope('map'); setLocateRequest((value) => value + 1) }}>내 위치로 이동</button></div><div className="map-canvas"><KakaoMap categoryCode={categoryCode} keyword={keyword} locateRequest={locateRequest} onResults={handleResults} onSelect={handleSelect} searchScope={searchScope} searchRequest={searchRequest} targetPlaceId={targetPlaceId} onLocationStatus={handleLocationStatus} /></div></div><ReviewPanel key={selected?.id || 'no-place'} place={selected} saved={selected ? isSaved(selected.id) : false} onToggleSaved={toggleSaved} searchStatus={status} user={user} onRequireLogin={() => setShowAuth(true)} compact onViewAll={openPlaceDetail} /></section>
      <section className="restaurant-grid" id="places">{places.map((place) => <article className={`restaurant-card place-card ${selectedId === place.id ? 'active' : ''}`} key={place.id} onClick={() => setSelectedId(place.id)}><div className="card-content"><div className="card-title"><div><p className="location">{place.category}</p><h3>{place.name}</h3></div><button className={`save-button inline ${isSaved(place.id) ? 'saved' : ''}`} type="button" onClick={(event) => { event.stopPropagation(); toggleSaved(place) }}>{isSaved(place.id) ? '♥' : '♡'}</button></div><p className="description">{place.address}</p><div className="place-card-footer"><span>{place.phone || '전화번호 미등록'}</span><a href={place.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>상세보기</a></div></div></article>)}</section>
      {status === 'empty' && <p className="empty-state">검색 결과가 없습니다. 지도를 넓게 보거나 다른 검색어를 입력해 보세요.</p>}
      <section className="principle-section" id="about"><div><p className="eyebrow">HOW IT WORKS</p><h2>지도 위 실제 장소에<br /><em>우리의 리뷰를.</em></h2></div><p>장소 정보는 카카오맵에서 찾고, 리뷰와 별점은 한입 사용자들이 직접 남깁니다. 같은 장소를 검색한 모든 사용자가 함께 리뷰를 확인할 수 있습니다.</p><span className="principle-number">01 / 01</span></section>
    </main><footer><span>한입</span><span>지도에서 발견하는 오늘의 식탁</span><span>© 2026 HANIP</span></footer>
  </div>
}

export default App
