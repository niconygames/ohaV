/* ==========================================
   おはVメーカー - maker.js (ES Module)
   AI背景除去: @imgly/background-removal (AGPL-3.0)
   ========================================== */

// ==========================================
// State
// ==========================================
const state = {
  bgImg:       null,   // HTMLImageElement (背景)
  charImg:     null,   // HTMLImageElement (処理済みキャラ・透過)
  charType:    null,   // 'transparent' | 'chroma' | 'ai'
  chromaColor: null,   // { r, g, b }
  posX:        0.5,    // キャラ位置 (正規化 0-1)
  posY:        0.6,
  scale:       0.5,    // キャラ高さ = canvas高さ × scale
  rotate:      0,      // 度数
};

let rawCharImg = null;      // 元のキャラ画像 (処理前)
let renderScheduled = false;

// ==========================================
// DOM
// ==========================================
const dom = {};

document.addEventListener('DOMContentLoaded', () => {
  dom.bgUploadZone      = document.getElementById('bg-upload-zone');
  dom.bgFileInput       = document.getElementById('bg-file-input');
  dom.bgPreview         = document.getElementById('bg-preview');
  dom.charaUploadZone   = document.getElementById('chara-upload-zone');
  dom.charaFileInput    = document.getElementById('chara-file-input');
  dom.charaPreview      = document.getElementById('chara-preview');
  dom.detectionBadge    = document.getElementById('detection-badge');
  dom.detectionIcon     = document.getElementById('detection-icon');
  dom.detectionText     = document.getElementById('detection-text');
  dom.aiProgressWrap    = document.getElementById('ai-progress-wrap');
  dom.aiProgressBar     = document.getElementById('ai-progress-bar');
  dom.aiProgressStatus  = document.getElementById('ai-progress-status');
  dom.aiProgressTime    = document.getElementById('ai-progress-time');
  dom.chromaControls    = document.getElementById('chroma-controls');
  dom.chromaThreshold   = document.getElementById('chroma-threshold');
  dom.chromaThresholdVal= document.getElementById('chroma-threshold-val');
  dom.chromaFeather     = document.getElementById('chroma-feather');
  dom.chromaFeatherVal  = document.getElementById('chroma-feather-val');
  dom.canvas            = document.getElementById('maker-canvas');
  dom.canvasWrap        = document.getElementById('canvas-wrap');
  dom.canvasPlaceholder = document.getElementById('canvas-placeholder');
  dom.scaleSlider       = document.getElementById('scale-slider');
  dom.scaleVal          = document.getElementById('scale-val');
  dom.rotateSlider      = document.getElementById('rotate-slider');
  dom.rotateVal         = document.getElementById('rotate-val');
  dom.resetBtn          = document.getElementById('reset-btn');
  dom.exportBtn         = document.getElementById('export-btn');
  dom.exportNote        = document.getElementById('export-note');
  dom.exportSnsJpg      = document.getElementById('export-sns-jpg');
  dom.exportSnsPng      = document.getElementById('export-sns-png');
  dom.exportPrintPng    = document.getElementById('export-print-png');

  setupUploadZone(dom.bgUploadZone,    dom.bgFileInput,    onBgSelected);
  setupUploadZone(dom.charaUploadZone, dom.charaFileInput, onCharaSelected);
  setupSliders();
  setupCanvasInteraction();
  setupExport();
});

// ==========================================
// Upload Zone
// ==========================================
function setupUploadZone(zone, input, handler) {
  input.addEventListener('change', (e) => {
    if (e.target.files[0]) handler(e.target.files[0]);
  });
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handler(file);
  });
}

// ==========================================
// Background Image
// ==========================================
async function onBgSelected(file) {
  const url = URL.createObjectURL(file);
  const img = await loadImage(url);
  state.bgImg = img;

  dom.bgPreview.src = url;
  dom.bgUploadZone.classList.add('has-image');
  dom.canvasPlaceholder.style.display = 'none';

  // プレビューcanvasサイズ: 長辺1920px以内
  const maxSide = 1920;
  let w = img.naturalWidth, h = img.naturalHeight;
  if (Math.max(w, h) > maxSide) {
    const r = maxSide / Math.max(w, h);
    w = Math.round(w * r);
    h = Math.round(h * r);
  }
  dom.canvas.width  = w;
  dom.canvas.height = h;

  scheduleRender();
  updateExportBtn();
}

// ==========================================
// Character Image
// ==========================================
async function onCharaSelected(file) {
  // プレビュー表示
  const rawUrl = URL.createObjectURL(file);
  dom.charaPreview.src = rawUrl;
  dom.charaUploadZone.classList.add('has-image');

  // UI リセット
  hideBadge();
  hideAiProgress();
  dom.chromaControls.classList.remove('visible');
  state.charImg = null;
  state.charType = null;
  rawCharImg = null;
  updateExportBtn();

  const img = await loadImage(rawUrl);
  rawCharImg = img;

  // 判定
  const detection = await detectCharType(img);
  state.charType   = detection.type;
  state.chromaColor = detection.color || null;

  if (detection.type === 'transparent') {
    showBadge('type-transparent', '✅', '透過PNG — そのまま使用します');
    state.charImg = img;
    scheduleRender();
    updateExportBtn();

  } else if (detection.type === 'chroma') {
    const hex = rgbToHex(detection.color.r, detection.color.g, detection.color.b);
    showBadge('type-chroma', '🎨', `クロマキー検出 (${hex}) — 色を除去します`);
    dom.chromaControls.classList.add('visible');
    await applyChromaKey();
    updateExportBtn();

  } else {
    showBadge('type-ai', '🤖', 'AI背景除去を実行します...');
    await applyAiRemoval(file);
    updateExportBtn();
  }
}

// ==========================================
// 自動判定: 透過PNG / クロマキー / 背景あり
// ==========================================
async function detectCharType(img) {
  // 縮小してピクセル解析
  const maxAnalyze = 400;
  const scale = Math.min(1, maxAnalyze / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  // 透過チェック
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 200) return { type: 'transparent' };
  }

  // 4隅サンプリングでクロマキー検出
  const cSz = Math.max(5, Math.floor(Math.min(w, h) * 0.08));
  let sumR = 0, sumG = 0, sumB = 0, cnt = 0;

  for (let cy = 0; cy < cSz; cy++) {
    for (let cx = 0; cx < cSz; cx++) {
      const offsets = [
        (cy * w + cx) * 4,
        (cy * w + (w - 1 - cx)) * 4,
        ((h - 1 - cy) * w + cx) * 4,
        ((h - 1 - cy) * w + (w - 1 - cx)) * 4,
      ];
      for (const o of offsets) {
        sumR += data[o]; sumG += data[o + 1]; sumB += data[o + 2];
        cnt++;
      }
    }
  }

  const avgR = sumR / cnt, avgG = sumG / cnt, avgB = sumB / cnt;
  const [hNorm, sat] = rgbToHsl(avgR, avgG, avgB);
  const hue = hNorm * 360;

  // 緑(80-170°) または 青系(190-270°) かつ彩度 > 0.30 → クロマキー
  if (sat > 0.30 && ((hue >= 80 && hue <= 170) || (hue >= 190 && hue <= 270))) {
    return { type: 'chroma', color: { r: Math.round(avgR), g: Math.round(avgG), b: Math.round(avgB) } };
  }

  return { type: 'ai' };
}

// ==========================================
// クロマキー除去
// ==========================================
async function applyChromaKey() {
  if (!rawCharImg || !state.chromaColor) return;

  const threshold   = parseInt(dom.chromaThreshold.value);
  const feather     = parseInt(dom.chromaFeather.value);
  const featherRange = feather * 12;
  const { r: kr, g: kg, b: kb } = state.chromaColor;

  const canvas = document.createElement('canvas');
  canvas.width  = rawCharImg.naturalWidth;
  canvas.height = rawCharImg.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(rawCharImg, 0, 0);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  for (let i = 0; i < data.length; i += 4) {
    const dist = colorDist(data[i], data[i + 1], data[i + 2], kr, kg, kb);
    if (dist < threshold) {
      data[i + 3] = 0;
    } else if (featherRange > 0 && dist < threshold + featherRange) {
      const alpha = (dist - threshold) / featherRange;
      data[i + 3] = Math.round(alpha * data[i + 3]);
    }
  }

  ctx.putImageData(imgData, 0, 0);
  state.charImg = await canvasToImage(canvas);
  scheduleRender();
}

// ==========================================
// AI背景除去 (@imgly/background-removal)
// ==========================================
const IMGLY_CDN = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.4.5/dist/';
let _removeBackground = null;

async function loadRemoveBackground() {
  if (_removeBackground) return _removeBackground;
  const mod = await import(`${IMGLY_CDN}background-removal.js`);
  _removeBackground = mod.removeBackground;
  return _removeBackground;
}

async function applyAiRemoval(file) {
  showAiProgress();
  const startTime = Date.now();
  let inferenceStarted = false;
  let inferenceStartTime = null;

  try {
    const removeBackground = await loadRemoveBackground();

    const resultBlob = await removeBackground(file, {
      publicPath: IMGLY_CDN,
      progress: (key, current, total) => {
        if (!total) return;
        const pct = Math.min(99, Math.round((current / total) * 100));
        dom.aiProgressBar.style.width = pct + '%';

        if (key.startsWith('fetch:')) {
          dom.aiProgressStatus.textContent = 'AIモデル読み込み中...';
          dom.aiProgressTime.textContent = `${pct}%`;

        } else if (key === 'compute:inference') {
          if (!inferenceStarted) {
            inferenceStarted = true;
            inferenceStartTime = Date.now();
          }
          dom.aiProgressStatus.textContent = 'AI背景除去中...';

          if (pct > 5 && inferenceStartTime) {
            const elapsed = (Date.now() - inferenceStartTime) / 1000;
            const estimated = elapsed / (pct / 100);
            const remaining = Math.max(0, Math.round(estimated - elapsed));
            dom.aiProgressTime.textContent = remaining > 0
              ? `残り約 ${remaining}秒`
              : 'もうすぐ完了...';
          } else {
            dom.aiProgressTime.textContent = '計算中...';
          }
        }
      },
    });

    const url = URL.createObjectURL(resultBlob);
    state.charImg = await loadImage(url);

    dom.aiProgressBar.style.width = '100%';
    hideAiProgress();
    showBadge('type-ai', '✅', 'AI背景除去 完了！キャラを配置してください');
    scheduleRender();

  } catch (err) {
    hideAiProgress();
    showBadge('type-error', '❌', `エラー: ${err.message || 'AI除去に失敗しました'}`);
    console.error('[おはVメーカー] AI除去エラー:', err);
  }
}

// ==========================================
// Canvas 描画
// ==========================================
function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    render();
  });
}

function render() {
  const canvas = dom.canvas;
  if (!state.bgImg || canvas.width === 0) return;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 背景
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(state.bgImg, 0, 0, canvas.width, canvas.height);

  if (!state.charImg) return;

  // キャラサイズ: state.scale = キャラ高さ / canvas高さ
  const charNatW = state.charImg.naturalWidth;
  const charNatH = state.charImg.naturalHeight;
  const charH = canvas.height * state.scale;
  const charW = charH * (charNatW / charNatH);

  const cx = state.posX * canvas.width;
  const cy = state.posY * canvas.height;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(state.rotate * Math.PI / 180);
  ctx.drawImage(state.charImg, -charW / 2, -charH / 2, charW, charH);
  ctx.restore();
}

// ==========================================
// スライダー操作
// ==========================================
function setupSliders() {
  dom.scaleSlider.addEventListener('input', () => {
    state.scale = parseInt(dom.scaleSlider.value) / 100;
    dom.scaleVal.textContent = dom.scaleSlider.value + '%';
    scheduleRender();
  });

  dom.rotateSlider.addEventListener('input', () => {
    state.rotate = parseInt(dom.rotateSlider.value);
    dom.rotateVal.textContent = state.rotate + '°';
    scheduleRender();
  });

  dom.resetBtn.addEventListener('click', () => {
    state.posX   = 0.5;
    state.posY   = 0.6;
    state.scale  = 0.5;
    state.rotate = 0;
    syncSlidersToState();
    scheduleRender();
  });

  // クロマキー調整
  dom.chromaThreshold.addEventListener('input', () => {
    dom.chromaThresholdVal.textContent = dom.chromaThreshold.value;
    applyChromaKey();
  });
  dom.chromaFeather.addEventListener('input', () => {
    dom.chromaFeatherVal.textContent = dom.chromaFeather.value;
    applyChromaKey();
  });
}

function syncSlidersToState() {
  dom.scaleSlider.value  = Math.round(state.scale * 100);
  dom.scaleVal.textContent = dom.scaleSlider.value + '%';
  dom.rotateSlider.value = state.rotate;
  dom.rotateVal.textContent = state.rotate + '°';
}

// ==========================================
// キャンバス操作 (ドラッグ・ピンチ・回転)
// ==========================================
function setupCanvasInteraction() {
  const wrap = dom.canvasWrap;

  // --- マウス ドラッグ ---
  let dragging = false;
  let dragStartX, dragStartY, dragStartPosX, dragStartPosY;

  wrap.addEventListener('mousedown', (e) => {
    if (!state.charImg) return;
    dragging = true;
    dragStartX    = e.clientX;
    dragStartY    = e.clientY;
    dragStartPosX = state.posX;
    dragStartPosY = state.posY;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = dom.canvas.getBoundingClientRect();
    state.posX = clamp01(dragStartPosX + (e.clientX - dragStartX) / rect.width);
    state.posY = clamp01(dragStartPosY + (e.clientY - dragStartY) / rect.height);
    scheduleRender();
  });

  window.addEventListener('mouseup', () => { dragging = false; });

  // --- マウスホイール: 拡大縮小 ---
  wrap.addEventListener('wheel', (e) => {
    if (!state.charImg) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.03 : 0.03;
    state.scale = Math.max(0.05, Math.min(3.0, state.scale + delta));
    syncSlidersToState();
    scheduleRender();
  }, { passive: false });

  // --- タッチ ---
  let singleStart     = null;
  let touchStartPosX  = 0, touchStartPosY = 0;
  let pinchStartDist  = null, pinchStartAngle = null;
  let pinchStartScale = null, pinchStartRotate = null;

  wrap.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      singleStart    = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      touchStartPosX = state.posX;
      touchStartPosY = state.posY;
      pinchStartDist = null;
    } else if (e.touches.length === 2) {
      singleStart     = null;
      pinchStartDist  = touchDist(e.touches[0], e.touches[1]);
      pinchStartAngle = touchAngle(e.touches[0], e.touches[1]);
      pinchStartScale = state.scale;
      pinchStartRotate = state.rotate;
    }
  }, { passive: false });

  wrap.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!state.charImg) return;

    if (e.touches.length === 1 && singleStart) {
      const rect = dom.canvas.getBoundingClientRect();
      state.posX = clamp01(touchStartPosX + (e.touches[0].clientX - singleStart.x) / rect.width);
      state.posY = clamp01(touchStartPosY + (e.touches[0].clientY - singleStart.y) / rect.height);
      scheduleRender();

    } else if (e.touches.length === 2 && pinchStartDist !== null) {
      const dist  = touchDist(e.touches[0], e.touches[1]);
      const angle = touchAngle(e.touches[0], e.touches[1]);
      state.scale  = Math.max(0.05, Math.min(3.0, pinchStartScale * (dist / pinchStartDist)));
      state.rotate = pinchStartRotate + (angle - pinchStartAngle) * (180 / Math.PI);
      syncSlidersToState();
      scheduleRender();
    }
  }, { passive: false });

  wrap.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      pinchStartDist = null;
    }
    if (e.touches.length === 0) {
      singleStart = null;
    }
  });
}

function touchDist(t1, t2) {
  const dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function touchAngle(t1, t2) {
  return Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX);
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

// ==========================================
// エクスポート
// ==========================================
function setupExport() {
  dom.exportBtn.addEventListener('click', doExport);
}

function updateExportBtn() {
  const ready = !!(state.bgImg && state.charImg);
  dom.exportBtn.disabled = !ready;
  dom.exportNote.textContent = ready
    ? '形式を選んで保存しましょう'
    : '背景とキャラをアップロードすると保存できます';
}

async function doExport() {
  const snsJpg   = dom.exportSnsJpg.checked;
  const snsPng   = dom.exportSnsPng.checked;
  const printPng = dom.exportPrintPng.checked;

  if (!snsJpg && !snsPng && !printPng) {
    showToast('出力形式を1つ以上選んでください', true);
    return;
  }

  dom.exportBtn.disabled = true;
  dom.exportBtn.innerHTML = '<span class="spinner"></span> 保存中...';

  const ts = getTimestamp();
  let count = 0;

  try {
    // SNS用: 長辺1920px以内
    if (snsJpg || snsPng) {
      const canvas = buildExportCanvas(1920);
      if (snsJpg) { await dlCanvas(canvas, `ohav_maker_${ts}.jpg`,       'image/jpeg', 0.92); count++; }
      if (snsPng) { await dlCanvas(canvas, `ohav_maker_${ts}.png`,       'image/png');         count++; }
    }

    // 印刷・高画質: 背景原寸フル解像度
    if (printPng) {
      const canvas = buildExportCanvas(Infinity);
      await dlCanvas(canvas, `ohav_maker_${ts}_print.png`, 'image/png');
      count++;
    }

    showToast(`${count}ファイルを保存しました！`);
  } catch (err) {
    showToast('保存に失敗しました', true);
    console.error(err);
  } finally {
    dom.exportBtn.disabled = false;
    dom.exportBtn.innerHTML = '<span>🎨 合成して保存！</span>';
    updateExportBtn();
  }
}

function buildExportCanvas(maxSide) {
  let w = state.bgImg.naturalWidth;
  let h = state.bgImg.naturalHeight;
  if (Math.max(w, h) > maxSide) {
    const r = maxSide / Math.max(w, h);
    w = Math.round(w * r);
    h = Math.round(h * r);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 背景
  ctx.drawImage(state.bgImg, 0, 0, w, h);

  // キャラ
  if (state.charImg) {
    const charH = h * state.scale;
    const charW = charH * (state.charImg.naturalWidth / state.charImg.naturalHeight);
    const cx = state.posX * w;
    const cy = state.posY * h;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(state.rotate * Math.PI / 180);
    ctx.drawImage(state.charImg, -charW / 2, -charH / 2, charW, charH);
    ctx.restore();
  }

  return canvas;
}

function dlCanvas(canvas, filename, mimeType, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    }, mimeType, quality);
  });
}

// ==========================================
// UI ヘルパー
// ==========================================
function showBadge(typeClass, icon, text) {
  dom.detectionBadge.className = `detection-badge visible ${typeClass}`;
  dom.detectionIcon.textContent = icon;
  dom.detectionText.textContent = text;
}

function hideBadge() {
  dom.detectionBadge.className = 'detection-badge';
}

function showAiProgress() {
  dom.aiProgressWrap.classList.add('visible');
  dom.aiProgressBar.style.width = '0%';
  dom.aiProgressStatus.textContent = 'AI準備中...';
  dom.aiProgressTime.textContent = '計算中...';
}

function hideAiProgress() {
  dom.aiProgressWrap.classList.remove('visible');
}

// ==========================================
// Toast
// ==========================================
let toastTimer = null;

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.className = isError ? 'toast error' : 'toast';
  toast.textContent = message;
  void toast.offsetWidth;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ==========================================
// ユーティリティ
// ==========================================
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function canvasToImage(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = url;
    }, 'image/png');
  });
}

function colorDist(r1, g1, b1, r2, g2, b2) {
  // 知覚的重み付きユークリッド距離
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h, s, l];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function getTimestamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
