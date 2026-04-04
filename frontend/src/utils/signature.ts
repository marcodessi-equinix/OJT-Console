const canvasWidth = 960;
const canvasHeight = 280;
const horizontalPadding = 72;
const baselineY = 176;
const underlineY = 224;
const minimumFontSize = 54;

function getSignatureFont(size: number): string {
  return `italic 400 ${size}px "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive`;
}

export function createAutoSignatureDataUrl(fullName: string): string {
  const normalizedName = fullName.trim();
  if (!normalizedName || typeof document === "undefined") {
    return "";
  }

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    return "";
  }

  context.clearRect(0, 0, canvasWidth, canvasHeight);
  context.lineCap = "round";

  context.strokeStyle = "rgba(100, 116, 139, 0.55)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(horizontalPadding, underlineY);
  context.lineTo(canvasWidth - horizontalPadding, underlineY);
  context.stroke();

  let fontSize = 96;
  const maxTextWidth = canvasWidth - horizontalPadding * 2;
  while (fontSize > minimumFontSize) {
    context.font = getSignatureFont(fontSize);
    if (context.measureText(normalizedName).width <= maxTextWidth) {
      break;
    }

    fontSize -= 4;
  }

  const inkGradient = context.createLinearGradient(0, baselineY - fontSize, 0, baselineY + 20);
  inkGradient.addColorStop(0, "rgba(15, 23, 42, 0.96)");
  inkGradient.addColorStop(1, "rgba(30, 64, 175, 0.88)");

  context.save();
  context.translate(horizontalPadding, baselineY);
  context.rotate(-0.045);
  context.font = getSignatureFont(fontSize);
  context.fillStyle = inkGradient;
  context.textBaseline = "alphabetic";
  context.shadowColor = "rgba(15, 23, 42, 0.18)";
  context.shadowBlur = 10;
  context.shadowOffsetY = 3;
  context.fillText(normalizedName, 0, 0);
  context.restore();

  context.font = '600 24px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  context.fillStyle = "rgba(71, 85, 105, 0.92)";
  context.fillText(normalizedName, horizontalPadding, underlineY + 30);

  return canvas.toDataURL("image/png");
}