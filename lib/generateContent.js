// Claude가 JSON 문자열 값 안에 실제 줄바꿈(개행) 문자를 그대로 넣어서 보내는 경우가 있어요.
// 표준 JSON에서는 문자열 안의 줄바꿈은 반드시 \n 으로 이스케이프되어야 하는데, 가끔 그걸 빼먹고 옵니다.
// 이 함수는 큰따옴표로 둘러싸인 "문자열 값 내부"에서만 실제 줄바꿈/탭 등을 \n, \t 로 안전하게 바꿔줍니다.
function sanitizeJsonControlChars(raw) {
  let result = "";
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (escapeNext) {
      result += ch;
      escapeNext = false;
      continue;
    }

    if (ch === "\\") {
      result += ch;
      escapeNext = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }

    if (inString) {
      if (ch === "\n") {
        result += "\\n";
        continue;
      }
      if (ch === "\r") {
        result += "\\r";
        continue;
      }
      if (ch === "\t") {
        result += "\\t";
        continue;
      }
    }

    result += ch;
  }

  return result;
}

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
  } catch (firstErr) {
    // 줄바꿈 등 제어문자 문제일 가능성이 높으니, 정리한 뒤 한 번 더 시도
    try {
      parsed = JSON.parse(sanitizeJsonControlChars(raw));
    } catch (secondErr) {
      throw new Error(
        `Claude 응답을 JSON으로 파싱하지 못했습니다: ${secondErr.message}\n원본: ${raw.slice(0, 500)}`
      );
    }
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

