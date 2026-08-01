/**
 * 최초 1회, 블로그 계정마다 한 번씩 실행하는 인증 스크립트입니다.
 *
 * 사용법:
 *   node auth-setup.js nunumiso
 *   node auth-setup.js perjuni
 *
 * 실행하면 브라우저 접속용 링크가 출력됩니다.
 * 그 링크를 브라우저에 붙여넣고, 해당 계정으로 로그인 + 권한 허용을 하면
 * 자동으로 refresh token이 발급되어 화면에 출력되고 tokens/ 폴더에도 저장됩니다.
 * 그 refresh token 값을 .env 파일과 GitHub Secrets에 넣어주세요.
 */

require("dotenv").config();
const http = require("http");
const url = require("url");
const fs = require("fs");
const path = require("path");
const { OAuth2Client } = require("google-auth-library");

const label = process.argv[2];
if (!label) {
  console.error("❌ 계정 라벨을 입력해주세요. 예: node auth-setup.js nunumiso");
  process.exit(1);
}

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const PORT = 8080;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("❌ .env 파일에 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 값을 먼저 채워주세요.");
  process.exit(1);
}

const oAuth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // 매번 refresh_token을 새로 받기 위해 강제로 동의 화면을 띄움
  scope: ["https://www.googleapis.com/auth/blogger"],
});

console.log("\n👉 아래 링크를 복사해서 브라우저에 붙여넣고,");
console.log(`   "${label}" 블로그를 관리하는 구글 계정으로 로그인 + 허용을 눌러주세요.\n`);
console.log(authUrl);
console.log("\n(로그인 완료를 기다리는 중...)\n");

const server = http.createServer(async (req, res) => {
  try {
    const qs = new url.URL(req.url, REDIRECT_URI).searchParams;
    const code = qs.get("code");

    if (!code) {
      res.end("code가 없습니다. 다시 시도해주세요.");
      return;
    }

    const { tokens } = await oAuth2Client.getToken(code);
    res.end("✅ 인증 완료! 이 창은 닫으셔도 됩니다. 터미널로 돌아가주세요.");
    server.close();

    if (!tokens.refresh_token) {
      console.log("\n⚠️  refresh_token이 발급되지 않았어요.");
      console.log("   이미 예전에 한 번 허용한 적이 있는 계정이면 이런 경우가 생길 수 있어요.");
      console.log("   https://myaccount.google.com/permissions 에서 '블로그 자동화' 앱 접근 권한을 제거한 뒤 다시 실행해주세요.\n");
      process.exit(1);
    }

    const tokensDir = path.join(__dirname, "tokens");
    if (!fs.existsSync(tokensDir)) fs.mkdirSync(tokensDir);
    fs.writeFileSync(
      path.join(tokensDir, `${label}.json`),
      JSON.stringify(tokens, null, 2),
      "utf-8"
    );

    console.log("🎉 성공! refresh_token을 발급받았습니다:\n");
    console.log(tokens.refresh_token);
    console.log(`\n이 값을 .env 파일의 GOOGLE_REFRESH_TOKEN_${label.toUpperCase()} 에 붙여넣고,`);
    console.log("나중에 GitHub Secrets에도 같은 이름으로 등록해주세요.\n");

    process.exit(0);
  } catch (err) {
    console.error("❌ 오류:", err.message);
    res.end("오류가 발생했습니다. 터미널을 확인해주세요.");
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  // 서버가 조용히 대기
});
