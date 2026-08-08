const { OAuth2Client } = require("google-auth-library");

function getClient(clientId, clientSecret, refreshToken) {
  const oAuth2Client = new OAuth2Client(clientId, clientSecret);
  oAuth2Client.setCredentials({ refresh_token: refreshToken });
  return oAuth2Client;
}

/**
 * publishDate가 주어지면: 미래 시각에 예약 발행 (Blogger 화면에 "예약됨"으로 표시됨)
 * publishDate가 없으면: 즉시 발행
 */
async function postToBlogger({
  clientId,
  clientSecret,
  refreshToken,
  blogId,
  title,
  html,
  labels,
  customMetaData, // 검색 설명(메타 디스크립션) 등을 담은 JSON 문자열. 구글이 공식적으로 "안정적이지 않음"이라 표시한 필드라 100% 보장은 안 됨
  publishDate, // ISO 8601 문자열. 있으면 예약 발행
}) {
  const oAuth2Client = getClient(clientId, clientSecret, refreshToken);
  const { token } = await oAuth2Client.getAccessToken();
  if (!token) throw new Error("액세스 토큰 발급 실패. refresh token이 만료/취소되었을 수 있습니다.");

  const isScheduled = Boolean(publishDate);
  const insertUrl = `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts${
    isScheduled ? "?isDraft=true" : ""
  }`;

  const body = { title, content: html, labels };
  if (customMetaData) body.customMetaData = customMetaData;

  const insertResponse = await fetch(insertUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const insertData = await insertResponse.json();
  if (!insertResponse.ok) {
    throw new Error(`Blogger API 오류 (${insertResponse.status}): ${JSON.stringify(insertData)}`);
  }

  if (!isScheduled) {
    return insertData; // 즉시 발행 완료, data.url에 주소
  }

  // 예약 발행: 방금 만든 draft를 지정된 미래 시각에 발행되도록 예약
  const publishUrl = `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/${insertData.id}/publish?publishDate=${encodeURIComponent(
    publishDate
  )}`;
  const publishResponse = await fetch(publishUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const publishData = await publishResponse.json();
  if (!publishResponse.ok) {
    throw new Error(`Blogger 예약 발행 오류 (${publishResponse.status}): ${JSON.stringify(publishData)}`);
  }

  return publishData;
}

async function listRecentPosts({ clientId, clientSecret, refreshToken, blogId, maxResults = 5 }) {
  const oAuth2Client = getClient(clientId, clientSecret, refreshToken);
  const { token } = await oAuth2Client.getAccessToken();
  const response = await fetch(
    `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts?maxResults=${maxResults}&fetchBodies=false`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const data = await response.json();
  if (!response.ok) {
    // 관련글 조회 실패는 전체 발행을 막을 정도로 치명적이지 않으므로 빈 배열 반환
    console.log(`   (관련글 조회 실패, 이번엔 관련글 없이 진행: ${JSON.stringify(data)})`);
    return [];
  }

  return (data.items || []).map((p) => ({ title: p.title, url: p.url }));
}

// 블로그에 있는 "모든" 글 제목을 가져옵니다 (자동화 이전에 수동으로 쓴 글 포함).
// 새 주제를 정할 때, 이미 다룬 주제와 겹치지 않게 하기 위해 사용합니다.
async function listAllPostTitles({ clientId, clientSecret, refreshToken, blogId }) {
  const oAuth2Client = getClient(clientId, clientSecret, refreshToken);
  const { token } = await oAuth2Client.getAccessToken();

  const titles = [];
  let pageToken = "";
  let pageCount = 0;
  const MAX_PAGES = 10; // 페이지당 최대 500개 * 10 = 최대 5000개 글까지 커버

  while (pageCount < MAX_PAGES) {
    const url = `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts?maxResults=500&fetchBodies=false${
      pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""
    }`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(`기존 글 목록 조회 실패: ${JSON.stringify(data)}`);
    }

    (data.items || []).forEach((p) => titles.push(p.title));

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
    pageCount++;
  }

  return titles;
}

module.exports = { postToBlogger, listRecentPosts, listAllPostTitles };
