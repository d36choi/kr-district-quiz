# 서울·경기 지역 학습

서울 25개 자치구와 경기 31개 시·군의 위치와 인접 관계를 5문제 코스로 익히는 Apps in Toss 미니앱입니다. 경기에서는 수원·성남·용인의 일반구 세부 지도를 함께 제공하고, 지역별 숙련도와 1·3·7·21일 복습 일정을 기기 안에 저장합니다.

## 주요 기능

- 서울 25개 자치구와 경기 31개 시·군을 같은 지역팩 모델로 관리합니다.
- 경기 전체 지도는 시·군 경계만, 수원·성남·용인 상세 지도는 해당 도시의 일반구만 표시합니다.
- 관심 지역 2문제, 인접 지역 2문제, 복습 1문제로 한 코스를 구성합니다.
- 오답은 최대 2개의 채점 없는 확인 문제로 다시 보여 줍니다.
- 기존 서울 기록은 유효한 항목만 V2 지역 진행도로 이전합니다.
- 지역 검색, 지도 키보드 선택, 목록 대체 경로, 모션 감소 설정을 지원합니다.
- 분석에는 안정적인 지역 ID와 학습 상태만 보내며 검색어나 주관식 답변 원문은 보내지 않습니다.

## 개발 명령

프로젝트 디렉터리에서 실행합니다.

```bash
npm run dev
npm test
npm run lint
npm run build
```

- `npm run dev` — Vite 개발 서버를 시작합니다.
- `npm test` — Vitest 전체 테스트를 한 번 실행합니다.
- `npm run lint` — Oxlint 정적 검사를 실행합니다.
- `npm run build` — TypeScript 검사, Vite 번들, Apps in Toss `.ait` 번들을 차례로 생성합니다.

릴리스 전에는 다음 두 명령을 모두 실행합니다.

```bash
npm run lint && npm test && npm run build
node scripts/build-region-maps.mjs --check
```

두 번째 명령은 경기 최상위 도형 31개와 세부 구 도형 10개, 대칭 인접 관계, 서울·경기 교차 인접 관계, 지도 출처 메타데이터를 검증합니다. 공식 원본에서 임시로 지도를 다시 생성한 뒤 커밋된 SVG와 바이트 단위로 비교하므로, 지도 자산이 수동으로 바뀌었거나 생성 결과가 어긋나면 실패해야 합니다.

## 행정경계 데이터

- 제공 기관: 국가데이터처 공간정보서비스과
- 원본: [국가데이터처_SGIS 행정구역 통계 및 경계](https://www.data.go.kr/data/15129688/fileData.do)
- 경계 기준일: 2025-06-30
- 좌표계: EPSG:5179 원본을 WGS84로 변환
- 이용허락범위: 제한 없음

원본 269MB 압축 파일은 저장소에 넣지 않습니다. 대신 직접 내려받을 수 있는 URL, 파일 크기, SHA-256, 내부 SHP 경로와 생성 도구 버전을 [`src/assets/maps/SOURCES.md`](src/assets/maps/SOURCES.md)와 [`src/assets/maps/source-manifest.json`](src/assets/maps/source-manifest.json)에 고정합니다.

행정구역 카탈로그나 경계 기준일을 바꿀 때는 SVG를 직접 편집하지 말고 다음 절차를 지킵니다.

1. 공식 원본의 URL·기준일·라이선스·해시를 갱신합니다.
2. `node scripts/build-region-maps.mjs --archive <공식-압축파일>`로 전체 지도, 상세 지도, manifest를 함께 다시 생성합니다.
3. `node scripts/build-region-maps.mjs --check`가 새 원본과 커밋 자산의 일치 여부를 확인하도록 합니다.
4. 전체 테스트와 Apps in Toss 빌드를 다시 실행합니다.

## 플랫폼 설정

앱 이름, 브랜드색, WebView 유형과 권한은 [`apps-in-toss.config.ts`](apps-in-toss.config.ts)에서 관리합니다. 학습 기록은 Apps in Toss `Storage`에 저장하며, 저장이나 지도 로딩이 실패해도 현재 학습을 계속하거나 다시 시도할 수 있는 경로를 제공합니다.
