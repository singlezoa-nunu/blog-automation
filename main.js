require("dotenv").config();
const fs = require("fs");
const path = require("path");

const blogs = require("./config/blogs");
const { generateContent, generateTopicIdea } = require("./lib/generateContent");
const { saveThumbnail } = require("./lib/generateThumbnail");
const { postToBlogger, listRecentPosts, listAllPostTitles } = require("./lib/postToBlogger");

const USED_TOPICS_PATH = path.join(__dirname, "data", "used-topics.json");
const IMAGES_DIR = path.join(__dirname, "images");

function loadUsedTopics() {
  if (!fs.existsSync(USED_TOPICS_PATH)) return {};
  return JSON.parse(fs.readFileSync(USED_TOPICS_PATH, "utf-8"));
}

function saveUsedTopics(data) {
  fs.writeFileSync(USED_TOPICS_PATH, JSON.stringify(data, null, 2), "utf-8");
}

async function pickTopic(blog, usedTopics, existingTitles, apiKey) {
  const used = usedTopics[blog.label] || [];
  // 이미 다룬 주제(자동화가 기록한 것) + 자동화 이전부터 있던 기존 글 제목까지 모두 피해야 할 목록
  const avoidList = [...used, ...existingTitles];

  const available = blog.topicSeeds.filter(
    (t) => !avoidList.some((a) => a.includes(t) || t.includes(a))
  );

  if (available.length > 0) {
    return available[0];
  }

  console.log(`   (준비된 주제를 다 썼어요. Claude에게 새 주제를 요청합니다...)`);
  return generateTopicIdea({ persona: blog.persona, usedTopics: avoidList, apiKey });
}

// 썸네일을 실제로 브라우저에서 볼 수 있는 주소로 바꿔줌.
// GITHUB_REPO(예: "wanna/blog-automation")가 .env에 설정되어 있어야
// GitHub에 올라간 이미지 파일의 진짜 주소를 만들 수 있습니다.
// 아직 GitHub 저장소를 안 만드셨다면(로컬 테스트 단계) 이미지 없이 진행됩니다.
function buildImageUrl(relativePath) {
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  if (!repo) return null;
  // 파일명에 한글 등이 포함되어 있어도 안전하게 동작하도록 경로를 인코딩 (슬래시는 유지)
  const encodedPath = relativePath.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${repo}/${branch}/${encodedPath}`;
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

// { hour, minute } (한국시간) 기준으로, "오늘 그 시각"이 아직 안 지났으면 오늘, 이미 지났으면 내일로
// 계산해서 Blogger가 이해하는 ISO 문자열을 만듭니다. (한국시간 = UTC+9)
function computeScheduledPublishDate(schedule) {
  if (!schedule) return null;
  const { hour, minute = 0 } = schedule;

  const now = new Date();
  const kstNowMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kstNow = new Date(kstNowMs);

  const target = new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate(), hour, minute, 0)
  );
  let targetUtcMs = target.getTime() - 9 * 60 * 60 * 1000;

  if (targetUtcMs <= now.getTime()) {
    targetUtcMs += 24 * 60 * 60 * 1000; // 이미 지난 시각이면 내일로
  }

  return new Date(targetUtcMs).toISOString();
}

// 블로그 하나의, 예약 시간 슬롯 하나에 대해 글 하나를 생성/발행
async function runForBlogSlot(blog, schedule, usedTopics, existingTitles, apiKey) {
  const blogId = process.env[blog.blogIdEnv];
  const refreshToken = process.env[blog.refreshTokenEnv];

  if (!blogId || !refreshToken) {
    console.log(`   ⚠️  ${blog.blogIdEnv} 또는 ${blog.refreshTokenEnv} 값이 없어서 이 블로그는 건너뜁니다.`);
    return;
  }

  const topic = await pickTopic(blog, usedTopics, existingTitles, apiKey);
  console.log(`   주제: ${topic}`);

  // 같은 실행(run) 안에서 다음 슬롯이 같은 주제를 다시 고르지 않도록 바로 기록
  if (!usedTopics[blog.label]) usedTopics[blog.label] = [];
  usedTopics[blog.label].push(topic);

  console.log("   Claude로 글 작성 중...");
  const content = await generateContent({ persona: blog.persona, topic, apiKey });
  existingTitles.push(content.title);

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
  // 구매 유도 문구. 이 문장을 Blogger 에디터에서 선택해 실제 상품 링크를 걸어주세요.
  const ctaBlock = blog.ctaText
    ? `<p style="margin-top:24px; font-size:17px; font-weight:bold;">${blog.ctaText}</p>`
    : "";

  const fullHtml = `${imageBlock}
${disclosureBlock}
${content.html}
${ctaBlock}
${relatedHtml}
${disclaimerBlock}`;

  console.log("   Blogger에 발행 중...");
  const scheduledPublishDate = computeScheduledPublishDate(schedule);
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
}

async function runForBlog(blog, usedTopics, apiKey) {
  console.log(`\n=== [${blog.name}] 처리 시작 ===`);

  const blogId = process.env[blog.blogIdEnv];
  const refreshToken = process.env[blog.refreshTokenEnv];

 let existingTitles = [];
  if (blogId && refreshToken) {
    console.log("   기존 글 목록 조회 중... (주제 중복 방지)");
    try {
      existingTitles = await listAllPostTitles({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        refreshToken,
        blogId,
      });
      console.log(`   기존 글 ${existingTitles.length}개 확인함`);
    } catch (err) {
      console.error(`   ❌ 기존 글 목록 조회 실패로 이번 실행에서 [${blog.name}]는 건너뜁니다 (중복 발행 방지): ${err.message}`);
      return;
    }
  }

  const schedules = blog.publishSchedule && blog.publishSchedule.length > 0 ? blog.publishSchedule : [null];

  for (const schedule of schedules) {
    try {
      await runForBlogSlot(blog, schedule, usedTopics, existingTitles, apiKey);
    } catch (err) {
      console.error(`   ❌ [${blog.name}] 슬롯 처리 중 오류: ${err.message}`);
      // 이 슬롯이 실패해도 같은 블로그의 다음 슬롯/다른 블로그는 계속 진행
    }
  }
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("❌ ANTHROPIC_API_KEY가 설정되어 있지 않습니다.");
    process.exit(1);
  }

  const usedTopics = loadUsedTopics();

  for (const blog of blogs) {
    await runForBlog(blog, usedTopics, apiKey);
  }

  saveUsedTopics(usedTopics);
  console.log("\n모든 작업이 끝났습니다.");
}

main();
