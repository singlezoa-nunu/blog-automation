require("dotenv").config();
const fs = require("fs");
const path = require("path");

const blogs = require("./config/blogs");
const { generateContent, generateTopicIdea } = require("./lib/generateContent");
const { saveThumbnail } = require("./lib/generateThumbnail");
const { postToBlogger, listRecentPosts } = require("./lib/postToBlogger");

const USED_TOPICS_PATH = path.join(__dirname, "data", "used-topics.json");
const IMAGES_DIR = path.join(__dirname, "images");

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

// 썸네일을 실제로 브라우저에서 볼 수 있는 주소로 바꿔줌.
// GITHUB_REPO(예: "wanna/blog-automation")가 .env에 설정되어 있어야
// GitHub에 올라간 이미지 파일의 진짜 주소를 만들 수 있습니다.
// 아직 GitHub 저장소를 안 만드셨다면(로컬 테스트 단계) 이미지 없이 진행됩니다.
function buildImageUrl(relativePath) {
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  if (!repo) return null;
  return `https://raw.githubusercontent.com/${repo}/${branch}/${relativePath}`;
}

function buildRelatedPostsHtml(posts) {
  if (!posts || posts.length === 0) return "";
  const items = posts
    .slice(0, 3)
    .map((p) => `<li><a href="${p.url}">${p.title}</a></li>`)
    .join("\n");
  return `
<div style="margin-top:32px; padding:16px; background:#f7f7f7; border-radius:8px;">
  <strong>📚 함께 읽으면 좋은 글</strong>
  <ul>
    ${items}
  </ul>
</div>`;
}

// publishHourKST(예: 9)를 기준으로, "오늘 그 시각"이 아직 안 지났으면 오늘, 이미 지났으면 내일로
// 계산해서 Blogger가 이해하는 ISO 문자열을 만듭니다. (한국시간 = UTC+9)
function computeScheduledPublishDate(publishHourKST) {
  if (publishHourKST === null || publishHourKST === undefined) return null;

  const now = new Date();
  const kstNowMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kstNow = new Date(kstNowMs);

  const target = new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate(), publishHourKST, 0, 0)
  );
  // target은 지금 "KST 기준 시각"을 UTC 필드에 그대로 넣은 것이므로, 실제 UTC로 바꾸려면 9시간을 빼야 함
  let targetUtcMs = target.getTime() - 9 * 60 * 60 * 1000;

  if (targetUtcMs <= now.getTime()) {
    targetUtcMs += 24 * 60 * 60 * 1000; // 이미 지난 시각이면 내일로
  }

  return new Date(targetUtcMs).toISOString();
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

  console.log("   썸네일 이미지 생성 중...");
  const relativeImagePath = saveThumbnail({
    title: content.title,
    category: content.category || "정보",
    gradientFrom: blog.gradientFrom,
    gradientTo: blog.gradientTo,
    badgeColor: blog.badgeColor,
    blogLabel: blog.label,
    outDir: IMAGES_DIR,
  });
  const imageUrl = buildImageUrl(relativeImagePath);
  if (!imageUrl) {
    console.log("   (GITHUB_REPO가 아직 설정되지 않아 이 글에는 이미지가 안 붙습니다. GitHub 연동 후 자동으로 붙습니다.)");
  }

  console.log("   관련 글 조회 중...");
  const recentPosts = await listRecentPosts({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    refreshToken,
    blogId,
    maxResults: 5,
  });
  const relatedHtml = buildRelatedPostsHtml(recentPosts);

  const imageBlock = imageUrl
    ? `<div style="text-align:center; margin-bottom:24px;">
  <img src="${imageUrl}" alt="${content.title}" style="max-width:100%; height:auto; border-radius:8px;" />
</div>`
    : "";

  const disclosureBlock = blog.disclosureText
    ? `<p style="color:#888; font-size:14px;">${blog.disclosureText}</p>`
    : "";
  const disclaimerBlock = blog.disclaimerText
    ? `<p style="color:#888; font-size:13px; margin-top:24px;">${blog.disclaimerText}</p>`
    : "";

  const fullHtml = `${imageBlock}
${disclosureBlock}
${content.html}
${relatedHtml}
${disclaimerBlock}`;

  console.log("   Blogger에 발행 중...");
  const scheduledPublishDate = computeScheduledPublishDate(blog.publishHourKST);
  if (scheduledPublishDate) {
    console.log(`   (예약 발행 시각: ${scheduledPublishDate})`);
  }

  const customMetaData = content.searchDescription
    ? JSON.stringify({ BlogSearchDescription: content.searchDescription })
    : undefined;

  const result = await postToBlogger({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    refreshToken,
    blogId,
    title: content.title,
    html: fullHtml,
    labels: content.labels || [],
    customMetaData,
    publishDate: scheduledPublishDate,
  });

  console.log(`   ✅ ${scheduledPublishDate ? "예약 완료" : "발행 완료"}: ${result.url}`);

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
