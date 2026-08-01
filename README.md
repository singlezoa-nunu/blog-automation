# 블로그 자동화 (nunumiso + perjuniwellness)

Claude가 글을 쓰고, 자체 제작한 썸네일 이미지도 붙이고, Blogger API로 실제 발행까지 완전 자동으로 처리합니다.
매일 GitHub Actions가 알아서 실행해주기 때문에, 한 번 설정해두면 컴퓨터를 꺼두셔도 계속 돌아갑니다.

---

## 준비물 체크리스트

- [x] Blogger API 활성화 (완료하셨어요)
- [x] OAuth 클라이언트(client_secret_....json) 발급 (완료하셨어요)
- [x] 테스트 사용자에 구글 계정 2개 등록 (완료하셨어요)
- [ ] Claude API 키
- [ ] 위 client_secret json 안의 client_id / client_secret 값
- [ ] 계정별 refresh token (아래에서 발급)
- [ ] 블로그별 blogId (아래에서 조회)
- [ ] GitHub 계정 (없으면 github.com 에서 무료 가입)

---

## 1단계: 로컬에서 준비하기

1. 이 폴더 전체를 컴퓨터에 압축 해제
2. 터미널에서 이 폴더로 이동 (`cd` 명령어로)
3. 패키지 설치:
   ```
   npm install
   ```
4. `.env.example` 파일을 복사해서 `.env` 라는 이름으로 저장
5. 다운로드했던 `client_secret_....json` 파일을 텍스트 편집기로 열어서
   - `"client_id"` 값을 `.env`의 `GOOGLE_CLIENT_ID=` 뒤에 붙여넣기
   - `"client_secret"` 값을 `.env`의 `GOOGLE_CLIENT_SECRET=` 뒤에 붙여넣기
6. console.anthropic.com에서 발급받은 API 키를 `.env`의 `ANTHROPIC_API_KEY=` 뒤에 붙여넣기

---

## 2단계: 계정별 refresh token 발급 (계정마다 딱 1번씩만)

**nunumiso 계정으로:**
```
node auth-setup.js nunumiso
```
터미널에 링크가 뜨면 복사해서 브라우저에 붙여넣고, **nunumiso.com을 관리하는 구글 계정**으로 로그인 + 허용을 눌러주세요.
성공하면 터미널에 refresh_token 값이 출력됩니다. 그 값을 `.env`의 `GOOGLE_REFRESH_TOKEN_NUNUMISO=` 뒤에 붙여넣으세요.

> ⚠️ "허용" 화면에서 "Google에서 확인하지 않은 앱"이라는 경고가 뜰 수 있어요. 이건 여러분이 만든 개인용 앱이라 정상입니다. "고급" → "(안전하지 않음) blog-automation(으)로 이동" 을 클릭하시면 됩니다.

**perjuni 계정으로도 똑같이:**
```
node auth-setup.js perjuni
```
이번엔 **perjuniwellness를 관리하는 구글 계정**으로 로그인해주세요. 발급된 값을 `.env`의 `GOOGLE_REFRESH_TOKEN_PERJUNI=` 에 붙여넣으세요.

---

## 3단계: blogId 조회

```
node get-blog-id.js nunumiso https://www.nunumiso.com
node get-blog-id.js perjuni https://perjuniwellness.blogspot.com
```

출력되는 blogId 값을 각각 `.env`의 `BLOG_ID_NUNUMISO=`, `BLOG_ID_PERJUNI=` 에 붙여넣으세요.

---

## 4단계: 로컬에서 한 번 테스트 발행해보기

`.env`가 다 채워졌다면:
```
npm run post
```
실행하면 두 블로그 각각에 실제로 글이 하나씩 발행됩니다! 블로그에 가서 확인해보세요.
(문제가 있으면 터미널에 나온 오류 메시지를 그대로 저에게 보여주세요.)

---

## 5단계: GitHub에 올려서 매일 자동으로 돌아가게 만들기

1. github.com 가입/로그인
2. 새 저장소(Repository) 만들기 — 이름은 아무거나 (예: `blog-automation`), **Public**으로 설정
   > ⚠️ 여기선 꼭 Public이어야 해요. 썸네일 이미지를 블로그 독자들이 볼 수 있으려면, 그 이미지 파일 주소가 누구나 접근 가능해야 하거든요. API 키/비밀번호 같은 진짜 민감한 값은 이 저장소 코드 안에 들어가지 않고, 다음 단계의 "Secrets"라는 별도의 암호화된 금고에 저장되기 때문에 Public이어도 안전합니다.
3. 이 폴더 전체를 그 저장소에 업로드 (GitHub Desktop 앱을 쓰면 마우스 클릭만으로 가능해요 — desktop.github.com)
4. 저장소 페이지에서 **Settings → Secrets and variables → Actions** 로 이동
5. **New repository secret** 버튼으로 아래 7개를 하나씩 등록 (이름은 정확히 똑같이, 값은 `.env`에 있는 값 그대로):
   - `ANTHROPIC_API_KEY`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REFRESH_TOKEN_NUNUMISO`
   - `GOOGLE_REFRESH_TOKEN_PERJUNI`
   - `BLOG_ID_NUNUMISO`
   - `BLOG_ID_PERJUNI`
6. **Actions** 탭으로 이동 → "매일 블로그 자동 발행" 워크플로우가 보이면 **Run workflow** 버튼으로 한번 수동 실행해서 정상 작동하는지 확인

이렇게 하면 끝이에요. 이후로는 **매일 한국시간 오전 9시에 두 블로그에 자동으로 글이 하나씩 올라갑니다.** 컴퓨터를 꺼두셔도 상관없어요 — GitHub의 서버에서 대신 돌아갑니다.

---

## 자주 묻는 것들

**Q. 발행 시간이나 빈도를 바꾸고 싶어요.**
`.github/workflows/daily-post.yml` 파일 안의 `cron: "0 0 * * *"` 부분을 수정하면 돼요. (UTC 기준 시간이라 한국시간보다 9시간 느려요)

**Q. 세 번째 블로그를 추가하고 싶어요.**
`config/blogs.js`에 블록 하나를 더 추가하고, 같은 방식으로 auth-setup / get-blog-id / .env / GitHub Secrets를 추가해주시면 됩니다. 말씀해주시면 같이 만들어드릴게요.

**Q. 어떤 날은 다른 주제로 쓰게 하고 싶어요.**
`config/blogs.js`의 `topicSeeds` 배열에 원하는 주제를 추가/수정하면 그 순서대로 사용됩니다. 다 쓰면 Claude가 알아서 새 주제를 만들어냅니다.

**Q. 글이 이상하게 나왔어요. 수정하고 싶어요.**
`config/blogs.js`의 `persona` 부분(톤, 구조, 필수 문구 등)을 수정하면 다음 글부터 반영됩니다.

**Q. 로컬에서 `npm run post` 했는데 이미지가 안 붙어요.**
정상이에요. 썸네일 이미지는 GitHub 저장소에 실제로 올라가 있는 파일 주소를 사용하는 방식이라, 아직 GitHub 저장소를 안 만드신 로컬 테스트 단계에서는 이미지 없이 글만 발행됩니다. 5단계(GitHub 연동)까지 마치고 `.env`에 `GITHUB_REPO=아이디/저장소이름` 을 채운 뒤 다시 실행하면 이미지도 정상적으로 붙습니다. GitHub Actions로 자동 실행될 때는 이 값이 자동으로 채워지니 신경 안 쓰셔도 돼요.

**Q. 검색결과에 나오는 설명(검색 설명)도 자동으로 들어가나요?**
Claude가 매번 짧은 요약문을 만들어서 넣어보려고 시도합니다. 다만 이건 구글이 공식적으로 "이 기능은 불안정하고 지원 중단 예정"이라고 밝힌 부분이라, 100% 항상 반영된다고 보장은 못 해요. 대신 본문 첫 문단을 항상 핵심 요약이 되도록 작성하게 해뒀어요 — 대부분의 블로그 테마는 검색 설명이 없으면 본문 첫 부분을 자동으로 가져다 쓰기 때문에, 실제로는 큰 문제가 없을 가능성이 높습니다.

**Q. 예약 발행도 되나요?**
네! `config/blogs.js`에서 블로그마다 `publishHourKST` 값(예: 9 = 오전 9시)을 설정해두면, 그 시각에 맞춰 Blogger에 "예약됨" 상태로 등록됩니다. 실제 스크립트 실행은 그보다 미리(자정) 이루어지고, 정해진 시각에 자동으로 발행돼요. Blogger 관리 화면에 들어가 보시면 "예약됨"이라고 표시된 걸 확인하실 수 있어요. 시각을 바꾸고 싶으면 그 숫자만 수정하면 됩니다. `null`로 설정하면 스크립트 실행 즉시 발행돼요.

**Q. 갑자기 인증 오류가 나요.**
refresh token은 반영구적이지만, 구글 계정 보안 설정을 바꾸거나 앱 권한을 직접 취소하면 만료될 수 있어요. 그럴 땐 2단계(auth-setup.js)를 그 계정으로 다시 실행해서 새 토큰을 발급받고 GitHub Secret 값도 갱신해주세요.
