/**
 * 블로그 URL로 Blogger의 내부 blogId를 조회합니다.
 * auth-setup.js를 먼저 실행해서 해당 계정의 refresh token을 얻은 뒤 사용하세요.
 *
 * 사용법:
 *   node get-blog-id.js nunumiso https://www.nunumiso.com
 *   node get-blog-id.js perjuni https://perjuniwellness.blogspot.com
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { OAuth2Client } = require("google-auth-library");

const [label, blogUrl] = process.argv.slice(2);
if (!label || !blogUrl) {
  console.error("❌ 사용법: node get-blog-id.js <라벨> <블로그URL>");
  process.exit(1);
}

const tokenPath = path.join(__dirname, "tokens", `${label}.json`);
if (!fs.existsSync(tokenPath)) {
  console.error(`❌ tokens/${label}.json 이 없어요. 먼저 node auth-setup.js ${label} 를 실행해주세요.`);
  process.exit(1);
}

const tokens = JSON.parse(fs.readFileSync(tokenPath, "utf-8"));

const oAuth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);
oAuth2Client.setCredentials(tokens);

async function main() {
  const { token } = await oAuth2Client.getAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/blogger/v3/blogs/byurl?url=${encodeURIComponent(blogUrl)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();

  if (!res.ok) {
    console.error("❌ 조회 실패:", data);
    process.exit(1);
  }

  console.log(`\n✅ 블로그 이름: ${data.name}`);
  console.log(`✅ blogId: ${data.id}\n`);
  console.log(`.env 파일의 BLOG_ID_${label.toUpperCase()} 에 위 blogId 값을 붙여넣으세요.`);
}

main();
