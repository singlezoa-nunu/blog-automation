// 외부 이미지 라이브러리 설치 없이(node-canvas 등 필요 없이),
// 순수 SVG로 "사진 대신 그라디언트 배경 + 굵은 제목 텍스트" 스타일 썸네일을 만듭니다.
// 결과물은 data URI 형태라서 Blogger 글 본문에 <img> 태그로 바로 삽입 가능합니다.

const WIDTH = 1200;
const HEIGHT = 630;

// 긴 제목을 여러 줄로 쪼개는 함수 (한글 기준 대략 12~14자마다 줄바꿈)
function wrapTitle(title, maxCharsPerLine = 13) {
  const words = title.split(" ");
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4); // 최대 4줄까지만
}

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function generateThumbnailSvg({ title, category, gradientFrom, gradientTo, badgeColor }) {
  const lines = wrapTitle(title);
  const lineHeight = 72;
  const startY = HEIGHT / 2 - ((lines.length - 1) * lineHeight) / 2 + 20;

  const tspans = lines
    .map((line, i) => {
      const y = startY + i * lineHeight;
      return `<text x="60" y="${y}" font-family="'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif" font-size="58" font-weight="900" fill="#ffffff" stroke="#000000" stroke-width="1.5" paint-order="stroke">${escapeXml(line)}</text>`;
    })
    .join("\n");

  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${gradientFrom}" />
      <stop offset="100%" stop-color="${gradientTo}" />
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />
  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="#000000" opacity="0.15" />

  <!-- 카테고리 배지 -->
  <rect x="60" y="60" width="${Math.max(120, category.length * 32 + 40)}" height="52" rx="6" fill="${badgeColor}" />
  <text x="${60 + Math.max(120, category.length * 32 + 40) / 2}" y="95" font-family="'Malgun Gothic', sans-serif" font-size="26" font-weight="bold" fill="#ffffff" text-anchor="middle">${escapeXml(category)}</text>

  <!-- 제목 -->
  ${tspans}
</svg>`;

  return svg;
}

function svgToDataUri(svg) {
  const base64 = Buffer.from(svg, "utf-8").toString("base64");
  return `data:image/svg+xml;base64,${base64}`;
}

function generateThumbnailDataUri(options) {
  const svg = generateThumbnailSvg(options);
  return svgToDataUri(svg);
}

module.exports = { generateThumbnailDataUri };
