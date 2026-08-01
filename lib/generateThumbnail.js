const { createCanvas, registerFont } = require("canvas");
const fs = require("fs");
const path = require("path");

// 블로그 목록 화면에서 정사각형으로 잘려서 보이기 때문에, 처음부터 정사각형으로 만듭니다.
const SIZE = 1080;

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
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");

  // 배경 그라디언트 (대각선)
  const grad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  grad.addColorStop(0, gradientFrom);
  grad.addColorStop(1, gradientTo);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // 은은한 장식용 원 (밋밋하지 않게)
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.beginPath();
  ctx.arc(SIZE * 0.85, SIZE * 0.15, 220, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(SIZE * 0.1, SIZE * 0.9, 160, 0, Math.PI * 2);
  ctx.fill();

  // 살짝 어둡게 오버레이
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.fillRect(0, 0, SIZE, SIZE);

  // 카테고리 배지 (위쪽 가운데)
  ctx.font = `bold 30px ${FONT_FAMILY}`;
  const badgeTextWidth = ctx.measureText(category).width;
  const badgeWidth = Math.max(140, badgeTextWidth + 70);
  const badgeX = (SIZE - badgeWidth) / 2;
  const badgeY = 90;
  ctx.fillStyle = badgeColor;
  roundRect(ctx, badgeX, badgeY, badgeWidth, 60, 8);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(category, SIZE / 2, badgeY + 30);

  // 제목 (자동 줄바꿈, 가운데 정렬, 화면 중앙~하단부에 배치)
  ctx.font = `900 62px ${FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = wrapTitle(ctx, title, SIZE - 160);
  const lineHeight = 80;
  const startY = SIZE * 0.62 - ((lines.length - 1) * lineHeight) / 2;

  lines.forEach((line, i) => {
    const y = startY + i * lineHeight;
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText(line, SIZE / 2, y);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(line, SIZE / 2, y);
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
