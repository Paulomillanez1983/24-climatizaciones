import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const outDir = new URL('../assets/flow/', import.meta.url);
const W = 720;
const H = 460;

const assets = [
  { file: 'presupuesto-5-min.webp', draw: 'speed' },
  { file: 'ruta-tecnico.webp', draw: 'route' },
  { file: 'fotos-servicio.webp', draw: 'photos' },
  { file: 'whatsapp-solicitud.webp', draw: 'whatsapp' },
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: W, height: H } });

for (const asset of assets) {
  const dataUrl = await page.evaluate(({ W, H, kind }) => {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const cold = '#1677ff';
    const cold2 = '#1cc8ff';
    const warm = '#ff7a1a';
    const ok = '#25d66f';
    const navy = '#071226';
    const ink = '#061126';
    const muted = '#63718a';

    const rr = (x, y, w, h, r) => {
      const radius = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + w, y, x + w, y + h, radius);
      ctx.arcTo(x + w, y + h, x, y + h, radius);
      ctx.arcTo(x, y + h, x, y, radius);
      ctx.arcTo(x, y, x + w, y, radius);
      ctx.closePath();
    };
    const fillRound = (x, y, w, h, r, fill, stroke = '', sw = 1) => {
      rr(x, y, w, h, r);
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = sw;
        ctx.stroke();
      }
    };
    const line = (x1, y1, x2, y2, color, width = 8) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    const text = (value, x, y, size, color, weight = 800, align = 'left') => {
      ctx.font = `${weight} ${size}px Segoe UI, Inter, Arial, sans-serif`;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(value, x, y);
    };
    const circle = (x, y, r, fill, stroke = '', sw = 1) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = sw;
        ctx.stroke();
      }
    };

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#071226');
    bg.addColorStop(.55, '#102a4f');
    bg.addColorStop(1, '#0a1830');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.globalAlpha = .18;
    for (let x = 20; x < W; x += 46) line(x, 0, x, H, '#ffffff', 1);
    for (let y = 20; y < H; y += 46) line(0, y, W, y, '#ffffff', 1);
    ctx.globalAlpha = 1;

    const glow1 = ctx.createRadialGradient(560, 40, 20, 560, 40, 260);
    glow1.addColorStop(0, 'rgba(28,200,255,.42)');
    glow1.addColorStop(1, 'rgba(28,200,255,0)');
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, W, H);
    const glow2 = ctx.createRadialGradient(80, 420, 30, 80, 420, 260);
    glow2.addColorStop(0, 'rgba(255,122,26,.28)');
    glow2.addColorStop(1, 'rgba(255,122,26,0)');
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, W, H);

    const panel = (x, y, w, h) => {
      ctx.shadowColor = 'rgba(0,0,0,.22)';
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = 18;
      fillRound(x, y, w, h, 32, '#ffffff', 'rgba(255,255,255,.55)', 2);
      ctx.shadowColor = 'transparent';
    };

    if (kind === 'speed') {
      panel(70, 68, 270, 292);
      text('Solicitud', 105, 122, 24, ink, 900);
      text('Lista para enviar', 105, 156, 18, muted, 750);
      fillRound(104, 198, 164, 18, 9, '#dce8f6');
      fillRound(104, 230, 200, 18, 9, navy);
      fillRound(104, 262, 144, 18, 9, '#dce8f6');
      fillRound(104, 305, 150, 36, 18, ok);
      text('Continuar', 128, 329, 18, '#052711', 900);

      circle(455, 202, 108, '#ffffff', 'rgba(255,255,255,.7)', 10);
      circle(455, 202, 78, '#f4fbff');
      line(455, 202, 455, 145, cold, 12);
      line(455, 202, 510, 202, warm, 12);
      circle(455, 202, 11, navy);
      fillRound(502, 282, 122, 62, 27, navy);
      text('5', 532, 324, 40, '#fff', 950);
      text('min', 574, 324, 20, '#b8c9ed', 900);
      circle(455, 202, 138, 'rgba(28,200,255,.08)');
    }

    if (kind === 'route') {
      panel(58, 48, 604, 340);
      const map = ctx.createLinearGradient(58, 48, 662, 388);
      map.addColorStop(0, '#eef9ff');
      map.addColorStop(.52, '#ffffff');
      map.addColorStop(1, '#fff2e3');
      fillRound(78, 68, 564, 300, 28, map);
      for (let x = 120; x < 620; x += 96) line(x, 90, x, 350, '#d9e8f8', 14);
      for (let y = 118; y < 340; y += 78) line(92, y, 628, y, '#d9e8f8', 14);
      ctx.strokeStyle = cold;
      ctx.lineWidth = 16;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(125, 306);
      ctx.bezierCurveTo(190, 245, 230, 278, 284, 214);
      ctx.bezierCurveTo(340, 147, 420, 155, 500, 100);
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 5;
      ctx.stroke();
      circle(125, 306, 27, ok, '#fff', 9);
      ctx.beginPath();
      ctx.moveTo(522, 76);
      ctx.bezierCurveTo(522, 30, 595, 30, 595, 76);
      ctx.bezierCurveTo(595, 118, 558, 152, 558, 152);
      ctx.bezierCurveTo(558, 152, 522, 118, 522, 76);
      ctx.closePath();
      ctx.fillStyle = warm;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 8;
      ctx.stroke();
      circle(558, 76, 16, '#fff');
      fillRound(110, 82, 176, 62, 24, '#fff', '#dce8f6');
      text('Técnico', 138, 119, 22, ink, 900);
      text('en ruta', 226, 119, 18, ok, 900);
      fillRound(330, 276, 226, 54, 25, '#fff', '#dce8f6');
      text('Google Maps', 365, 311, 22, '#0b62de', 950);
    }

    if (kind === 'photos') {
      panel(56, 38, 250, 374);
      fillRound(86, 70, 190, 292, 34, navy);
      fillRound(104, 104, 154, 190, 22, '#eaf7ff');
      fillRound(122, 126, 118, 76, 16, '#fff');
      ctx.fillStyle = cold;
      ctx.beginPath();
      ctx.moveTo(136, 188);
      ctx.lineTo(168, 150);
      ctx.lineTo(195, 177);
      ctx.lineTo(216, 154);
      ctx.lineTo(238, 188);
      ctx.closePath();
      ctx.fill();
      circle(152, 146, 10, '#ffbd59');
      line(126, 232, 214, 232, '#0b62de', 11);
      line(126, 264, 182, 264, '#0b62de', 11);
      circle(181, 330, 7, '#8fa3ca');

      fillRound(370, 60, 218, 142, 24, '#fff', '#dce8f6');
      fillRound(392, 88, 174, 70, 16, '#eef8ff');
      ctx.fillStyle = warm;
      ctx.beginPath();
      ctx.moveTo(406, 148);
      ctx.lineTo(443, 110);
      ctx.lineTo(474, 134);
      ctx.lineTo(499, 108);
      ctx.lineTo(550, 148);
      ctx.closePath();
      ctx.fill();
      circle(425, 106, 10, cold2);
      fillRound(372, 238, 224, 76, 34, ok);
      text('Adjuntar fotos', 412, 287, 24, '#052711', 950);
      line(286, 170, 384, 128, ok, 10);
      line(288, 245, 390, 274, ok, 10);
    }

    if (kind === 'whatsapp') {
      fillRound(70, 52, 580, 328, 34, '#061126', 'rgba(255,255,255,.13)', 2);
      fillRound(112, 88, 496, 212, 28, '#eaf7ff');
      fillRound(145, 122, 250, 48, 24, '#fff');
      line(175, 146, 330, 146, ink, 10);
      fillRound(215, 195, 302, 62, 31, ok);
      line(252, 226, 460, 226, '#052711', 10);
      circle(552, 102, 48, ok, '#fff', 9);
      ctx.strokeStyle = '#052711';
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(552, 102, 20, 2.5, 5.6);
      ctx.stroke();
      line(536, 125, 546, 112, '#052711', 8);
      fillRound(134, 318, 210, 42, 21, '#fff');
      line(166, 340, 296, 340, cold, 9);
      fillRound(382, 318, 170, 42, 21, 'rgba(255,255,255,.12)');
      text('presupuesto', 409, 346, 18, '#fff', 950);
    }

    return canvas.toDataURL('image/webp', .86);
  }, { W, H, kind: asset.draw });

  const data = dataUrl.split(',')[1];
  await writeFile(new URL(asset.file, outDir), Buffer.from(data, 'base64'));
  console.log(`wrote assets/flow/${asset.file}`);
}

await browser.close();
