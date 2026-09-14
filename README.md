# 한입 — 카카오맵 맛집 검색

카카오맵에 실제 등록된 음식점과 카페를 찾고, 한입 사용자끼리 별점과 리뷰를 공유하며 관심 장소를 저장하는 React 서비스입니다.

검색은 `전국 검색`과 `현재 지도` 모드를 지원합니다. 전국 검색에서는 `강남역 파스타`처럼 위치와 메뉴를 함께 입력하면 지도 범위와 관계없이 장소를 찾고 결과 위치로 지도를 이동합니다. 현재 지도 모드에서는 보이는 지도 영역 안에서 검색하고 지도 이동 시 자동 재검색합니다.
장소 검색 결과는 카카오 Places 페이지네이션을 끝까지 조회해 첫 페이지 15개뿐 아니라 API가 제공하는 후속 결과도 지도와 목록에 함께 표시합니다.

## 실행

1. Kakao Developers에서 앱을 만들고 JavaScript 키를 발급합니다.
2. 플랫폼 > Web에 `http://localhost:5173`과 실제 배포 도메인을 등록합니다.
3. `.env`에 `VITE_KAKAO_MAP_KEY=발급받은_JavaScript_키`를 설정합니다.
4. `npm run dev`로 웹과 리뷰 API를 함께 실행합니다.

## 리뷰 데이터

회원, 로그인 세션, 리뷰, 사용자별 저장 맛집은 `server/data/hanip.sqlite` SQLite 데이터베이스에 저장됩니다. 리뷰와 저장 맛집은 회원 및 카카오 장소 ID에 연결됩니다. 비밀번호는 무작위 salt를 적용한 scrypt 해시로 저장되며 로그인 상태는 HttpOnly 세션 쿠키로 관리합니다. 운영 배포에서는 HTTPS를 사용하고 쿠키에 `Secure` 옵션을 추가하세요.

- 개발: `npm run dev`
- 운영: `npm run build` 후 `npm start`

리뷰 작성자 본인과 관리자만 리뷰를 삭제할 수 있습니다. 기존 회원을 관리자로 지정하려면 서버를 잠시 종료한 뒤 `npm run make-admin -- 사용자아이디`를 실행하세요.

로그인 사용자는 상단 `내 리뷰`에서 자신이 작성한 리뷰만 모아볼 수 있습니다. 리뷰에는 JPG, PNG, WebP 사진을 선택적으로 첨부할 수 있으며 브라우저에서 최대 1200px JPEG로 축소한 뒤 DB에 저장합니다. 운영 규모가 커지면 이미지 데이터는 객체 스토리지로 이전하는 것을 권장합니다.

Places API가 제공하지 않는 별점, 리뷰, 대표 이미지는 임의로 표시하지 않습니다.

## 기본 Vite 안내

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
