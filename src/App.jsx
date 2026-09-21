import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { AuthDialog, KakaoMap, MyReviewsDialog, PlaceDetailPage, ReviewPanel } from './components/AppFeatures'
import { readApiResponse } from './lib/api'

const categories = [{ label: '음식점', code: 'FD6' }, { label: '카페', code: 'CE7' }]

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

