// 예전에는 Claude에게 JSON 형식으로 답을 달라고 했는데, 본문 안에 따옴표나 줄바꿈이
// 들어갈 때마다 JSON이 깨지는 문제가 계속 반복됐습니다. 그래서 JSON을 아예 쓰지 않고,
// "@@구분자@@" 같은 눈에 띄는 표시로 각 항목을 나누는 훨씬 튼튼한 방식으로 바꿨습니다.
// 이 방식은 본문 안에 따옴표/줄바꿈/특수문자가 아무리 많아도 절대 깨지지 않습니다.

const FIELD_MARKERS = ["TITLE", "CATEGORY", "LABELS", "SEARCH_DESCRIPTION", "HTML"];

function parseDelimitedResponse(raw) {
  const regex = /@@(TITLE|CATEGORY|LABELS|SEARCH_DESCRIPTION|HTML)@@/g;
  const positions = [];
  let match;
  while ((match = regex.exec(raw)) !== null) {
    positions.push({ key: match[1], contentStart: match.index + match[0].length });
  }

  if (positions.length === 0) {
    throw new Error("응답에서 @@TITLE@@ 등 구분자를 하나도 찾지 못했습니다.");
  }

  const result = {};
  for (let i = 0; i < positions.length; i++) {
    const cur = positions[i];
    const nextStart = i + 1 < positions.length ? raw.indexOf("@@", cur.contentStart) : raw.length;
    // 다음 마커가 시작되는 지점(없으면 끝까지)까지를 이 필드의 내용으로 취급
    const end = i + 1 < positions.length ? findNextMarkerStart(raw, cur.contentStart) : raw.length;
    let content = raw.slice(cur.contentStart, end).trim();
    content = content.replace(/@@END@@\s*$/, "").trim();
    result[cur.key] = content;
  }
  return result;
}

function findNextMarkerStart(raw, fromIndex) {
  const regex = /@@(TITLE|CATEGORY|LABELS|SEARCH_DESCRIPTION|HTML|END)@@/g;
  regex.lastIndex = fromIndex;
  const m = regex.exec(raw);
  return m ? m.index : raw.length;
}

async function callClaude({ apiKey, system, userMessage, maxTokens }) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API 오류 (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const textBlock = data.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("Claude 응답에서 텍스트를 찾을 수 없습니다.");
  return textBlock.text.trim();
}

async function generateContent({ persona, topic, apiKey }) {
  const userMessage = `이번 글의 주제는 정확히 다음과 같아: "${topic}"

이 주제로 글을 작성해서, 지침에 정해진 @@TITLE@@ / @@CATEGORY@@ / @@LABELS@@ / @@SEARCH_DESCRIPTION@@ / @@HTML@@ / @@END@@ 구분자 형식 그대로 출력해줘.
JSON이나 마크다운 코드블록(\`\`\`)은 절대 쓰지 말고, 본문(HTML) 안에서는 따옴표나 줄바꿈을 자유롭게 그대로 써도 돼 (이스케이프 불필요).`;

  const raw = await callClaude({ apiKey, system: persona, userMessage, maxTokens: 4000 });
  const parsed = parseDelimitedResponse(raw);

  if (!parsed.TITLE || !parsed.HTML) {
    throw new Error(`Claude 응답에 TITLE 또는 HTML이 없습니다.\n원본: ${raw.slice(0, 500)}`);
  }

  return {
    title: parsed.TITLE,
    category: parsed.CATEGORY || "정보",
    labels: parsed.LABELS
      ? parsed.LABELS.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
    searchDescription: parsed.SEARCH_DESCRIPTION || "",
    html: parsed.HTML,
  };
}

async function generateTopicIdea({ persona, usedTopics, apiKey }) {
  const userMessage = `지금까지 이미 다룬 주제 목록이야 (겹치면 안 돼):\n${usedTopics.join(
    "\n"
  )}\n\n이 블로그 스타일에 맞는 새로운 글 주제를 딱 하나만 제안해줘. 다른 설명 없이 주제 문장 하나만 출력해줘.`;

  const raw = await callClaude({ apiKey, system: persona, userMessage, maxTokens: 200 });
  return raw.replace(/^["'\d.\s-]+/, "").replace(/["']$/, "");
}

module.exports = { generateContent, generateTopicIdea };
