const { createCanvas, registerFont } = require("canvas");
const fs = require("fs");
const path = require("path");

const WIDTH = 1200;
const HEIGHT = 630;

// 윈도우에 기본 설치된 맑은 고딕을 찾아서 등록 시도 (없으면 시스템 기본 폰트로 대체됨)
function tryRegisterWindowsFont() {
  const candidates = [
    "C:\\Windows\\Fonts\\malgunbd.ttf", // 맑은 고딕 Bold
    "C:\\Windows\\Fonts\\malgun.ttf",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      registerFont(p, { family: "KRFont", weight: "bold" });
      return "KRFont";
    }
  }
  // GitHub Actions(Ubuntu)에서는 apt로 설치한 Noto Sans CJK를 사용
  return "Noto Sans CJK KR, sans-serif";
}

const FONT_FAMILY = tryRegisterWindowsFont();

function wrapTitle(ctx, title, maxWidth) {
  const words = title.split(" ");
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}

function generateThumbnailBuffer({ title, category, gradientFrom, gradientTo, badgeColor }) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  // 배경 그라디언트
  const grad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  grad.addColorStop(0, gradientFrom);
  grad.addColorStop(1, gradientTo);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 살짝 어둡게 오버레이
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 카테고리 배지
  ctx.font = `bold 26px ${FONT_FAMILY}`;
  const badgeTextWidth = ctx.measureText(category).width;
  const badgeWidth = Math.max(120, badgeTextWidth + 60);
  ctx.fillStyle = badgeColor;
  roundRect(ctx, 60, 60, badgeWidth, 52, 6);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(category, 60 + badgeWidth / 2, 60 + 26);

  // 제목 (자동 줄바꿈)
  ctx.font = `900 58px ${FONT_FAMILY}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const lines = wrapTitle(ctx, title, WIDTH - 120);
  const lineHeight = 72;
  const startY = HEIGHT / 2 - ((lines.length - 1) * lineHeight) / 2 + 20;

  lines.forEach((line, i) => {
    const y = startY + i * lineHeight;
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText(line, 60, y);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(line, 60, y);
  });

  return canvas.toBuffer("image/png");
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 제목에서 SEO에 도움이 되는 파일명을 만듦 (예: "무릎 건강 지키는..." → "무릎-건강-지키는-스트레칭")
function slugifyTitle(title) {
  const cleaned = title
    .replace(/[,.!?"'()[\]{}]/g, "") // 구두점 제거
    .trim()
    .replace(/\s+/g, "-"); // 공백을 하이픈으로
  return cleaned.slice(0, 40); // 너무 길지 않게 자르기
}

// PNG 파일로 저장하고, 저장된 상대 경로를 반환
function saveThumbnail({ title, category, gradientFrom, gradientTo, badgeColor, blogLabel, outDir }) {
  const buffer = generateThumbnailBuffer({ title, category, gradientFrom, gradientTo, badgeColor });

  const dir = path.join(outDir, blogLabel);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const slug = slugifyTitle(title);
  const filename = `${slug}-${Date.now().toString().slice(-6)}.png`; // 뒤에 6자리 숫자를 붙여 중복 방지
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buffer);

  return `images/${blogLabel}/${filename}`; // 저장소 루트 기준 상대 경로
}

module.exports = { saveThumbnail };
