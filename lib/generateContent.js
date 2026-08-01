async function generateContent({ persona, topic, apiKey }) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: persona,
      messages: [
        {
          role: "user",
          content: `이번 글의 주제는 정확히 다음과 같아: "${topic}"\n\n이 주제로 글을 작성해서, 지침에 정해진 JSON 형식으로만 답해줘. JSON 앞뒤로 다른 설명이나 마크다운 코드블록(\`\`\`)은 절대 붙이지 마.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API 오류 (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const textBlock = data.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("Claude 응답에서 텍스트를 찾을 수 없습니다.");

  let raw = textBlock.text.trim();
  // 혹시 코드블록으로 감싸서 왔을 경우 제거
  raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "");

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Claude 응답을 JSON으로 파싱하지 못했습니다: ${err.message}\n원본: ${raw.slice(0, 500)}`);
  }

  if (!parsed.title || !parsed.html) {
    throw new Error("Claude 응답에 title 또는 html이 없습니다.");
  }

  return parsed;
}

async function generateTopicIdea({ persona, usedTopics, apiKey }) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      system: persona,
      messages: [
        {
          role: "user",
          content: `지금까지 이미 다룬 주제 목록이야 (겹치면 안 돼):\n${usedTopics.join(
            "\n"
          )}\n\n이 블로그 스타일에 맞는 새로운 글 주제를 딱 하나만 제안해줘. 다른 설명 없이 주제 문장 하나만 출력해줘.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API 오류 (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const textBlock = data.content.find((b) => b.type === "text");
  return textBlock.text.trim().replace(/^["'\d.\s-]+/, "").replace(/["']$/, "");
}

module.exports = { generateContent, generateTopicIdea };

