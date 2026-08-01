require("dotenv").config();
const fs = require("fs");
const path = require("path");

const blogs = require("./config/blogs");
const { generateContent, generateTopicIdea } = require("./lib/generateContent");
const { generateThumbnailDataUri } = require("./lib/generateThumbnail");
const { postToBlogger } = require("./lib/postToBlogger");

const USED_TOPICS_PATH = path.join(__dirname, "data", "used-topics.json");

function loadUsedTopics() {
  if (!fs.existsSync(USED_TOPICS_PATH)) return {};
  return JSON.parse(fs.readFileSync(USED_TOPICS_PATH, "utf-8"));
}

function saveUsedTopics(data) {
  fs.writeFileSync(USED_TOPICS_PATH, JSON.stringify(data, null, 2), "utf-8");
}

async function pickTopic(blog, usedTopics, apiKey) {
  const used = usedTopics[blog.label] || [];
  const available = blog.topicSeeds.filter((t) => !used.includes(t));

  if (available.length > 0) {
    return available[0];
  }

  console.log(`   (준비된 주제를 다 썼어요. Claude에게 새 주제를 요청합니다...)`);
  return generateTopicIdea({ persona: blog.persona, usedTopics: used, apiKey });
}

async function runForBlog(blog, usedTopics, apiKey) {
  console.log(`\n=== [${blog.name}] 처리 시작 ===`);

  const blogId = process.env[blog.blogIdEnv];
  const refreshToken = process.env[blog.refreshTokenEnv];

  if (!blogId || !refreshToken) {
    console.log(`   ⚠️  ${blog.blogIdEnv} 또는 ${blog.refreshTokenEnv} 값이 없어서 이 블로그는 건너뜁니다.`);
    return;
  }

  const topic = await pickTopic(blog, usedTopics, apiKey);
  console.log(`   주제: ${topic}`);

  console.log("   Claude로 글 작성 중...");
  const content = await generateContent({ persona: blog.persona, topic, apiKey });

  console.log("   썸네일 생성 중...");
  const thumbnailDataUri = generateThumbnailDataUri({
    title: content.title,
    category: content.category || "정보",
    gradientFrom: blog.gradientFrom,
    gradientTo: blog.gradientTo,
    badgeColor: blog.badgeColor,
  });

  const fullHtml = `<div style="text-align:center; margin-bottom:24px;">
  <img src="${thumbnailDataUri}" alt="${content.title}" style="max-width:100%; height:auto; border-radius:8px;" />
</div>
${content.html}`;

  console.log("   Blogger에 발행 중...");
  const result = await postToBlogger({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    refreshToken,
    blogId,
    title: content.title,
    html: fullHtml,
    labels: content.labels || [],
  });

  console.log(`   ✅ 발행 완료: ${result.url}`);

  if (!usedTopics[blog.label]) usedTopics[blog.label] = [];
  usedTopics[blog.label].push(topic);
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("❌ ANTHROPIC_API_KEY가 설정되어 있지 않습니다.");
    process.exit(1);
  }

  const usedTopics = loadUsedTopics();

  for (const blog of blogs) {
    try {
      await runForBlog(blog, usedTopics, apiKey);
    } catch (err) {
      console.error(`   ❌ [${blog.name}] 처리 중 오류: ${err.message}`);
      // 한 블로그가 실패해도 다른 블로그는 계속 진행
    }
  }

  saveUsedTopics(usedTopics);
  console.log("\n모든 작업이 끝났습니다.");
}

main();
