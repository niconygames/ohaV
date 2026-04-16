/* ==========================================
   おはVメーカー - maker.js (ES Module)
   レイヤー構成: 背景 → キャラ → 手前素材
   AI背景除去: @imgly/background-removal (AGPL-3.0)
   ========================================== */

// ==========================================
// State
// ==========================================
const state = {
  // 背景
  bgImg: null,

  // キャラ (レイヤー2)
  charImg:      null,
  charType:     null,
  charChromaColor: null,
  charPosX:     0.5,
  charPosY:     0.6,
  charScale:    0.5,
  charRotate:   0,

  // 手前素材 (レイヤー3)
  fgImg:        null,
  fgType:       null,
  fgChromaColor: null,
  fgPosX:       0.5,
  fgPosY:       0.5,
  fgScale:      0.8,
  fgRotate:     0,

  // 操作中レイヤー
  activeLayer: 'chara', // 'chara' | 'fg'

  // 自動なじませ
  colorSync: {
    enabled:       false,
    strength:      0.30,
    blendMode:     'soft-light',
    preset:        'auto',    // 'auto' | 'morning' | 'noon' | 'evening' | 'night'
    envColor:      null,      // 背景から自動抽出した環境色 { r, g, b }
    overrideColor: null,      // プリセット固定色 (auto以外)
  },
};

// 処理前の生画像
let rawCharImg = null;
let rawFgImg   = null;
let renderScheduled = false;

// ==========================================
// DOM
// ==========================================
const dom = {};

document.addEventListener('DOMContentLoaded', () => {
  // 背景
  dom.bgUploadZone  = document.getElementById('bg-upload-zone');
  dom.bgFileInput   = document.getElementById('bg-file-input');
  dom.bgPreview     = document.getElementById('bg-preview');

  // キャラ
  dom.charaUploadZone     = document.getElementById('chara-upload-zone');
  dom.charaFileInput      = document.getElementById('chara-file-input');
  dom.charaPreview        = document.getElementById('chara-preview');
  dom.charaDetectionBadge = document.getElementById('chara-detection-badge');
  dom.charaDetectionIcon  = document.getElementById('chara-detection-icon');
  dom.charaDetectionText  = document.getElementById('chara-detection-text');
  dom.charaAiProgressWrap = document.getElementById('chara-ai-progress-wrap');
  dom.charaAiProgressBar  = document.getElementById('chara-ai-progress-bar');
  dom.charaAiProgressStatus = document.getElementById('chara-ai-progress-status');
  dom.charaAiProgressTime = document.getElementById('chara-ai-progress-time');
  dom.charaChromaControls = document.getElementById('chara-chroma-controls');
  dom.charaChromaThreshold    = document.getElementById('chara-chroma-threshold');
  dom.charaChromaThresholdVal = document.getElementById('chara-chroma-threshold-val');
  dom.charaChromaFeather      = document.getElementById('chara-chroma-feather');
  dom.charaChromaFeatherVal   = document.getElementById('chara-chroma-feather-val');

  // 手前素材
  dom.fgUploadZone     = document.getElementById('fg-upload-zone');
  dom.fgFileInput      = document.getElementById('fg-file-input');
  dom.fgPreview        = document.getElementById('fg-preview');
  dom.fgDetectionBadge = document.getElementById('fg-detection-badge');
  dom.fgDetectionIcon  = document.getElementById('fg-detection-icon');
  dom.fgDetectionText  = document.getElementById('fg-detection-text');
  dom.fgAiProgressWrap = document.getElementById('fg-ai-progress-wrap');
  dom.fgAiProgressBar  = document.getElementById('fg-ai-progress-bar');
  dom.fgAiProgressStatus = document.getElementById('fg-ai-progress-status');
  dom.fgAiProgressTime = document.getElementById('fg-ai-progress-time');
  dom.fgChromaControls = document.getElementById('fg-chroma-controls');
  dom.fgChromaThreshold    = document.getElementById('fg-chroma-threshold');
  dom.fgChromaThresholdVal = document.getElementById('fg-chroma-threshold-val');
  dom.fgChromaFeather      = document.getElementById('fg-chroma-feather');
  dom.fgChromaFeatherVal   = document.getElementById('fg-chroma-feather-val');

  // キャンバス・操作
  dom.canvas            = document.getElementById('maker-canvas');
  dom.canvasWrap        = document.getElementById('canvas-wrap');
  dom.canvasPlaceholder = document.getElementById('canvas-placeholder');
  dom.layerBtnChara     = document.getElementById('layer-btn-chara');
  dom.layerBtnFg        = document.getElementById('layer-btn-fg');
  dom.scaleSlider       = document.getElementById('scale-slider');
  dom.scaleVal          = document.getElementById('scale-val');
  dom.rotateSlider      = document.getElementById('rotate-slider');
  dom.rotateVal         = document.getElementById('rotate-val');
  dom.resetBtn          = document.getElementById('reset-btn');

  // 自動なじませ
  dom.colorsyncToggle      = document.getElementById('colorsync-toggle');
  dom.colorsyncBody        = document.getElementById('colorsync-body');
  dom.colorsyncStrength    = document.getElementById('colorsync-strength');
  dom.colorsyncStrengthVal = document.getElementById('colorsync-strength-val');

  // エクスポート
  dom.exportBtn      = document.getElementById('export-btn');
  dom.exportNote     = document.getElementById('export-note');
  dom.exportSnsJpg   = document.getElementById('export-sns-jpg');
  dom.exportSnsPng   = document.getElementById('export-sns-png');
  dom.exportPrintPng = document.getElementById('export-print-png');

  setupUploadZone(dom.bgUploadZone,  dom.bgFileInput,  onBgSelected);
  setupUploadZone(dom.charaUploadZone, dom.charaFileInput, onCharaSelected);
  setupUploadZone(dom.fgUploadZone,  dom.fgFileInput,  onFgSelected);
  setupLayerToggle();
  setupSliders();
  setupCanvasInteraction();
  setupColorSync();
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
// 背景
// ==========================================
async function onBgSelected(file) {
  const url = URL.createObjectURL(file);
  const img = await loadImage(url);
  state.bgImg = img;

  dom.bgPreview.src = url;
  dom.bgUploadZone.classList.add('has-image');
  dom.canvasPlaceholder.style.display = 'none';

  const maxSide = 1920;
  let w = img.naturalWidth, h = img.naturalHeight;
  if (Math.max(w, h) > maxSide) {
    const r = maxSide / Math.max(w, h);
    w = Math.round(w * r);
    h = Math.round(h * r);
  }
  dom.canvas.width  = w;
  dom.canvas.height = h;

  // 環境色を抽出（背景が変わるたびに更新）
  state.colorSync.envColor = extractEnvColor(img, 0.5, 0.6);

  scheduleRender();
  updateExportBtn();
}

// ==========================================
// キャラ素材
// ==========================================
async function onCharaSelected(file) {
  const rawUrl = URL.createObjectURL(file);
  dom.charaPreview.src = rawUrl;
  dom.charaUploadZone.classList.add('has-image');

  hideBadge(dom.charaDetectionBadge);
  hideAiProgress(dom.charaAiProgressWrap);
  dom.charaChromaControls.classList.remove('visible');
  state.charImg = null;
  state.charType = null;
  rawCharImg = null;
  updateExportBtn();

  const img = await loadImage(rawUrl);
  rawCharImg = img;

  const detection = await detectCharType(img);
  state.charType       = detection.type;
  state.charChromaColor = detection.color || null;

  if (detection.type === 'transparent') {
    showBadge(dom.charaDetectionBadge, dom.charaDetectionIcon, dom.charaDetectionText,
      'type-transparent', '✅', '透過PNG — そのまま使用します');
    state.charImg = img;
    scheduleRender();
    updateExportBtn();

  } else if (detection.type === 'chroma') {
    const hex = rgbToHex(detection.color.r, detection.color.g, detection.color.b);
    showBadge(dom.charaDetectionBadge, dom.charaDetectionIcon, dom.charaDetectionText,
      'type-chroma', '🎨', `クロマキー検出 (${hex}) — 色を除去します`);
    dom.charaChromaControls.classList.add('visible');
    await applyChromaKey('chara');
    updateExportBtn();

  } else {
    showBadge(dom.charaDetectionBadge, dom.charaDetectionIcon, dom.charaDetectionText,
      'type-ai', '🤖', 'AI背景除去を実行します...');
    await applyAiRemoval(file, 'chara');
    updateExportBtn();
  }
}

// ==========================================
// 手前素材
// ==========================================
async function onFgSelected(file) {
  const rawUrl = URL.createObjectURL(file);
  dom.fgPreview.src = rawUrl;
  dom.fgUploadZone.classList.add('has-image');

  hideBadge(dom.fgDetectionBadge);
  hideAiProgress(dom.fgAiProgressWrap);
  dom.fgChromaControls.classList.remove('visible');
  state.fgImg  = null;
  state.fgType = null;
  rawFgImg = null;

  const img = await loadImage(rawUrl);
  rawFgImg = img;

  const detection = await detectCharType(img);
  state.fgType       = detection.type;
  state.fgChromaColor = detection.color || null;

  if (detection.type === 'transparent') {
    showBadge(dom.fgDetectionBadge, dom.fgDetectionIcon, dom.fgDetectionText,
      'type-transparent', '✅', '透過PNG — そのまま使用します');
    state.fgImg = img;
    dom.layerBtnFg.disabled = false;
    scheduleRender();

  } else if (detection.type === 'chroma') {
    const hex = rgbToHex(detection.color.r, detection.color.g, detection.color.b);
    showBadge(dom.fgDetectionBadge, dom.fgDetectionIcon, dom.fgDetectionText,
      'type-chroma', '🎨', `クロマキー検出 (${hex}) — 色を除去します`);
    dom.fgChromaControls.classList.add('visible');
    await applyChromaKey('fg');
    dom.layerBtnFg.disabled = false;
    scheduleRender();

  } else {
    showBadge(dom.fgDetectionBadge, dom.fgDetectionIcon, dom.fgDetectionText,
      'type-ai', '🤖', 'AI背景除去を実行します...');
    await applyAiRemoval(file, 'fg');
    dom.layerBtnFg.disabled = false;
  }
}

// ==========================================
// 自動判定: 透過PNG / クロマキー / 背景あり
// ==========================================
async function detectCharType(img) {
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
        sumR += data[o]; sumG += data[o + 1]; sumB += data[o + 2]; cnt++;
      }
    }
  }

  const avgR = sumR / cnt, avgG = sumG / cnt, avgB = sumB / cnt;
  const [hNorm, sat] = rgbToHsl(avgR, avgG, avgB);
  const hue = hNorm * 360;

  if (sat > 0.30 && ((hue >= 80 && hue <= 170) || (hue >= 190 && hue <= 270))) {
    return { type: 'chroma', color: { r: Math.round(avgR), g: Math.round(avgG), b: Math.round(avgB) } };
  }
  return { type: 'ai' };
}

// ==========================================
// クロマキー除去 (layer: 'chara' | 'fg')
// ==========================================
async function applyChromaKey(layer) {
  const rawImg     = layer === 'chara' ? rawCharImg   : rawFgImg;
  const chromaColor = layer === 'chara' ? state.charChromaColor : state.fgChromaColor;
  const thresholdEl = layer === 'chara' ? dom.charaChromaThreshold   : dom.fgChromaThreshold;
  const featherEl   = layer === 'chara' ? dom.charaChromaFeather     : dom.fgChromaFeather;

  if (!rawImg || !chromaColor) return;

  const threshold    = parseInt(thresholdEl.value);
  const feather      = parseInt(featherEl.value);
  const featherRange = feather * 12;
  const { r: kr, g: kg, b: kb } = chromaColor;

  const canvas = document.createElement('canvas');
  canvas.width  = rawImg.naturalWidth;
  canvas.height = rawImg.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(rawImg, 0, 0);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  for (let i = 0; i < data.length; i += 4) {
    const dist = colorDist(data[i], data[i + 1], data[i + 2], kr, kg, kb);
    if (dist < threshold) {
      data[i + 3] = 0;
    } else if (featherRange > 0 && dist < threshold + featherRange) {
      data[i + 3] = Math.round(((dist - threshold) / featherRange) * data[i + 3]);
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const result = await canvasToImage(canvas);

  if (layer === 'chara') {
    state.charImg = result;
  } else {
    state.fgImg = result;
  }
  scheduleRender();
}

// ==========================================
// AI背景除去 (layer: 'chara' | 'fg')
// ==========================================
const IMGLY_CDN = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.4.5/dist/';
let _removeBackground = null;

async function loadRemoveBackground() {
  if (_removeBackground) return _removeBackground;
  const mod = await import(`${IMGLY_CDN}background-removal.js`);
  _removeBackground = mod.removeBackground;
  return _removeBackground;
}

async function applyAiRemoval(file, layer) {
  const progressWrap   = layer === 'chara' ? dom.charaAiProgressWrap   : dom.fgAiProgressWrap;
  const progressBar    = layer === 'chara' ? dom.charaAiProgressBar    : dom.fgAiProgressBar;
  const progressStatus = layer === 'chara' ? dom.charaAiProgressStatus : dom.fgAiProgressStatus;
  const progressTime   = layer === 'chara' ? dom.charaAiProgressTime   : dom.fgAiProgressTime;
  const badgeEl        = layer === 'chara' ? dom.charaDetectionBadge   : dom.fgDetectionBadge;
  const badgeIcon      = layer === 'chara' ? dom.charaDetectionIcon    : dom.fgDetectionIcon;
  const badgeText      = layer === 'chara' ? dom.charaDetectionText    : dom.fgDetectionText;

  showAiProgress(progressWrap, progressBar, progressStatus, progressTime);
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
        progressBar.style.width = pct + '%';

        if (key.startsWith('fetch:')) {
          progressStatus.textContent = 'AIモデル読み込み中...';
          progressTime.textContent   = `${pct}%`;
        } else if (key === 'compute:inference') {
          if (!inferenceStarted) {
            inferenceStarted    = true;
            inferenceStartTime  = Date.now();
          }
          progressStatus.textContent = 'AI背景除去中...';
          if (pct > 5 && inferenceStartTime) {
            const elapsed   = (Date.now() - inferenceStartTime) / 1000;
            const estimated = elapsed / (pct / 100);
            const remaining = Math.max(0, Math.round(estimated - elapsed));
            progressTime.textContent = remaining > 0 ? `残り約 ${remaining}秒` : 'もうすぐ完了...';
          } else {
            progressTime.textContent = '計算中...';
          }
        }
      },
    });

    progressBar.style.width = '100%';
    hideAiProgress(progressWrap);

    const url = URL.createObjectURL(resultBlob);
    const result = await loadImage(url);

    if (layer === 'chara') {
      state.charImg = result;
    } else {
      state.fgImg = result;
    }

    showBadge(badgeEl, badgeIcon, badgeText, 'type-ai', '✅', 'AI背景除去 完了！配置してください');
    scheduleRender();
    updateExportBtn();

  } catch (err) {
    hideAiProgress(progressWrap);
    showBadge(badgeEl, badgeIcon, badgeText, 'type-error', '❌', `エラー: ${err.message || 'AI除去に失敗しました'}`);
    console.error('[おはVメーカー] AI除去エラー:', err);
  }
}

// ==========================================
// レイヤー切り替えトグル
// ==========================================
function setupLayerToggle() {
  dom.layerBtnChara.addEventListener('click', () => setActiveLayer('chara'));
  dom.layerBtnFg.addEventListener('click',    () => setActiveLayer('fg'));
}

function setActiveLayer(layer) {
  state.activeLayer = layer;
  dom.layerBtnChara.classList.toggle('active', layer === 'chara');
  dom.layerBtnFg.classList.toggle('active',    layer === 'fg');
  syncSlidersToState();
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
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // レイヤー1: 背景
  ctx.drawImage(state.bgImg, 0, 0, canvas.width, canvas.height);

  // レイヤー2: キャラ
  if (state.charImg) {
    drawLayer(ctx, state.charImg, canvas.width, canvas.height,
      state.charPosX, state.charPosY, state.charScale, state.charRotate);
    // 色同期オーバーレイ
    if (state.colorSync.enabled) {
      applyColorSyncOverlay(ctx, state.charImg, canvas.width, canvas.height,
        state.charPosX, state.charPosY, state.charScale, state.charRotate);
    }
  }

  // レイヤー3: 手前素材
  if (state.fgImg) drawLayer(ctx, state.fgImg, canvas.width, canvas.height,
    state.fgPosX, state.fgPosY, state.fgScale, state.fgRotate);
}

function drawLayer(ctx, img, canvasW, canvasH, posX, posY, scale, rotate) {
  const h = canvasH * scale;
  const w = h * (img.naturalWidth / img.naturalHeight);
  const cx = posX * canvasW;
  const cy = posY * canvasH;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotate * Math.PI / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

// ==========================================
// スライダー (操作対象レイヤーに反映)
// ==========================================
function setupSliders() {
  dom.scaleSlider.addEventListener('input', () => {
    const v = parseInt(dom.scaleSlider.value) / 100;
    if (state.activeLayer === 'chara') state.charScale = v;
    else state.fgScale = v;
    dom.scaleVal.textContent = dom.scaleSlider.value + '%';
    scheduleRender();
  });

  dom.rotateSlider.addEventListener('input', () => {
    const v = parseInt(dom.rotateSlider.value);
    if (state.activeLayer === 'chara') state.charRotate = v;
    else state.fgRotate = v;
    dom.rotateVal.textContent = v + '°';
    scheduleRender();
  });

  dom.resetBtn.addEventListener('click', () => {
    if (state.activeLayer === 'chara') {
      state.charPosX = 0.5; state.charPosY = 0.6;
      state.charScale = 0.5; state.charRotate = 0;
    } else {
      state.fgPosX = 0.5; state.fgPosY = 0.5;
      state.fgScale = 0.8; state.fgRotate = 0;
    }
    syncSlidersToState();
    scheduleRender();
  });

  // クロマキースライダー (キャラ)
  dom.charaChromaThreshold.addEventListener('input', () => {
    dom.charaChromaThresholdVal.textContent = dom.charaChromaThreshold.value;
    applyChromaKey('chara');
  });
  dom.charaChromaFeather.addEventListener('input', () => {
    dom.charaChromaFeatherVal.textContent = dom.charaChromaFeather.value;
    applyChromaKey('chara');
  });

  // クロマキースライダー (手前素材)
  dom.fgChromaThreshold.addEventListener('input', () => {
    dom.fgChromaThresholdVal.textContent = dom.fgChromaThreshold.value;
    applyChromaKey('fg');
  });
  dom.fgChromaFeather.addEventListener('input', () => {
    dom.fgChromaFeatherVal.textContent = dom.fgChromaFeather.value;
    applyChromaKey('fg');
  });
}

function syncSlidersToState() {
  const scale  = state.activeLayer === 'chara' ? state.charScale  : state.fgScale;
  const rotate = state.activeLayer === 'chara' ? state.charRotate : state.fgRotate;
  dom.scaleSlider.value     = Math.round(scale * 100);
  dom.scaleVal.textContent  = dom.scaleSlider.value + '%';
  dom.rotateSlider.value    = rotate;
  dom.rotateVal.textContent = rotate + '°';
}

// ==========================================
// キャンバス操作 (ドラッグ・ピンチ・回転)
// ==========================================
function setupCanvasInteraction() {
  const wrap = dom.canvasWrap;

  // --- マウスドラッグ ---
  let dragging = false;
  let dragStartX, dragStartY, dragStartPosX, dragStartPosY;

  wrap.addEventListener('mousedown', (e) => {
    if (!activeLayerImg()) return;
    dragging = true;
    dragStartX    = e.clientX;
    dragStartY    = e.clientY;
    dragStartPosX = state.activeLayer === 'chara' ? state.charPosX : state.fgPosX;
    dragStartPosY = state.activeLayer === 'chara' ? state.charPosY : state.fgPosY;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = dom.canvas.getBoundingClientRect();
    const nx = clamp01(dragStartPosX + (e.clientX - dragStartX) / rect.width);
    const ny = clamp01(dragStartPosY + (e.clientY - dragStartY) / rect.height);
    setActiveLayerPos(nx, ny);
    scheduleRender();
  });

  window.addEventListener('mouseup', () => {
    if (dragging) refreshEnvColorForPosition();
    dragging = false;
  });

  // --- マウスホイール: 拡大縮小 ---
  wrap.addEventListener('wheel', (e) => {
    if (!activeLayerImg()) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.03 : 0.03;
    const cur = state.activeLayer === 'chara' ? state.charScale : state.fgScale;
    const next = Math.max(0.05, Math.min(3.0, cur + delta));
    if (state.activeLayer === 'chara') state.charScale = next;
    else state.fgScale = next;
    syncSlidersToState();
    scheduleRender();
  }, { passive: false });

  // --- タッチ ---
  let singleStart = null, touchStartPosX = 0, touchStartPosY = 0;
  let pinchStartDist = null, pinchStartAngle = null;
  let pinchStartScale = null, pinchStartRotate = null;

  wrap.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      singleStart    = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      touchStartPosX = state.activeLayer === 'chara' ? state.charPosX : state.fgPosX;
      touchStartPosY = state.activeLayer === 'chara' ? state.charPosY : state.fgPosY;
      pinchStartDist = null;
    } else if (e.touches.length === 2) {
      singleStart     = null;
      pinchStartDist  = touchDist(e.touches[0], e.touches[1]);
      pinchStartAngle = touchAngle(e.touches[0], e.touches[1]);
      pinchStartScale  = state.activeLayer === 'chara' ? state.charScale  : state.fgScale;
      pinchStartRotate = state.activeLayer === 'chara' ? state.charRotate : state.fgRotate;
    }
  }, { passive: false });

  wrap.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!activeLayerImg()) return;

    if (e.touches.length === 1 && singleStart) {
      const rect = dom.canvas.getBoundingClientRect();
      const nx = clamp01(touchStartPosX + (e.touches[0].clientX - singleStart.x) / rect.width);
      const ny = clamp01(touchStartPosY + (e.touches[0].clientY - singleStart.y) / rect.height);
      setActiveLayerPos(nx, ny);
      scheduleRender();

    } else if (e.touches.length === 2 && pinchStartDist !== null) {
      const dist  = touchDist(e.touches[0], e.touches[1]);
      const angle = touchAngle(e.touches[0], e.touches[1]);
      const newScale  = Math.max(0.05, Math.min(3.0, pinchStartScale * (dist / pinchStartDist)));
      const newRotate = pinchStartRotate + (angle - pinchStartAngle) * (180 / Math.PI);
      if (state.activeLayer === 'chara') { state.charScale = newScale; state.charRotate = newRotate; }
      else                               { state.fgScale   = newScale; state.fgRotate   = newRotate; }
      syncSlidersToState();
      scheduleRender();
    }
  }, { passive: false });

  wrap.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) pinchStartDist = null;
    if (e.touches.length === 0) {
      singleStart = null;
      refreshEnvColorForPosition();
    }
  });
}

function activeLayerImg() {
  return state.activeLayer === 'chara' ? state.charImg : state.fgImg;
}

function setActiveLayerPos(x, y) {
  if (state.activeLayer === 'chara') { state.charPosX = x; state.charPosY = y; }
  else                               { state.fgPosX   = x; state.fgPosY   = y; }
}

function touchDist(t1, t2) {
  return Math.sqrt((t1.clientX - t2.clientX) ** 2 + (t1.clientY - t2.clientY) ** 2);
}

function touchAngle(t1, t2) {
  return Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX);
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

// ==========================================
// 自動なじませ
// ==========================================

const PRESETS = {
  auto:    null,                          // 背景から自動抽出
  morning: { r: 190, g: 215, b: 255 },   // 朝: 淡いブルー
  noon:    { r: 255, g: 248, b: 210 },   // 昼: 明るいウォーム
  evening: { r: 255, g: 140, b: 55  },   // 夕: 暖色オレンジ
  night:   { r: 55,  g: 65,  b: 175 },   // 夜: ディープブルー
};

function setupColorSync() {
  // ON/OFF トグル
  dom.colorsyncToggle.addEventListener('change', () => {
    state.colorSync.enabled = dom.colorsyncToggle.checked;
    dom.colorsyncBody.hidden = !state.colorSync.enabled;
    scheduleRender();
  });

  // 強度スライダー
  dom.colorsyncStrength.addEventListener('input', () => {
    state.colorSync.strength = parseInt(dom.colorsyncStrength.value) / 100;
    dom.colorsyncStrengthVal.textContent = dom.colorsyncStrength.value + '%';
    scheduleRender();
  });

  // プリセットボタン
  document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const preset = btn.dataset.preset;
      state.colorSync.preset        = preset;
      state.colorSync.overrideColor = PRESETS[preset];
      scheduleRender();
    });
  });

  // ブレンドモード
  document.querySelectorAll('input[name="blend-mode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      state.colorSync.blendMode = radio.value;
      scheduleRender();
    });
  });
}

// 環境色をキャラ位置に合わせて再抽出
function refreshEnvColorForPosition() {
  if (!state.bgImg) return;
  state.colorSync.envColor = extractEnvColor(
    state.bgImg,
    state.charPosX,
    state.charPosY
  );
  if (state.colorSync.enabled && state.colorSync.preset === 'auto') {
    scheduleRender();
  }
}

// 背景からキャラ位置周辺の環境色を抽出
function extractEnvColor(bgImg, focusX = 0.5, focusY = 0.6) {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bgImg, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  // フォーカス領域: キャラ位置を中心に±30%
  const fx1 = Math.max(0, Math.floor((focusX - 0.3) * size));
  const fy1 = Math.max(0, Math.floor((focusY - 0.3) * size));
  const fx2 = Math.min(size - 1, Math.ceil((focusX + 0.3) * size));
  const fy2 = Math.min(size - 1, Math.ceil((focusY + 0.3) * size));

  let sumR = 0, sumG = 0, sumB = 0, total = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];

      // 極端に明るい(空)・暗い(影)ピクセルは除外
      const brightness = (r + g + b) / 3;
      if (brightness > 235 || brightness < 15) continue;

      // フォーカス領域は3倍重み
      const inFocus = x >= fx1 && x <= fx2 && y >= fy1 && y <= fy2;
      const focusW  = inFocus ? 3 : 1;

      // 彩度が高いピクセルほど重視
      const [, sat] = rgbToHsl(r, g, b);
      const satW = 0.5 + sat;

      const w = focusW * satW;
      sumR += r * w; sumG += g * w; sumB += b * w;
      total += w;
    }
  }

  if (total === 0) {
    // フォールバック: 単純平均
    for (let i = 0; i < data.length; i += 4) {
      sumR += data[i]; sumG += data[i + 1]; sumB += data[i + 2]; total++;
    }
  }

  return {
    r: Math.round(sumR / total),
    g: Math.round(sumG / total),
    b: Math.round(sumB / total),
  };
}

// 色同期オーバーレイをメインcanvasに適用（非破壊）
function applyColorSyncOverlay(ctx, img, canvasW, canvasH, posX, posY, scale, rotate) {
  const envColor = state.colorSync.overrideColor || state.colorSync.envColor;
  if (!envColor) return;

  const h  = canvasH * scale;
  const w  = h * (img.naturalWidth / img.naturalHeight);
  const cx = posX * canvasW;
  const cy = posY * canvasH;

  // オフスクリーンcanvas: キャラ形状に環境色でシルエットを作成
  const off    = new OffscreenCanvas(Math.ceil(w), Math.ceil(h));
  const offCtx = off.getContext('2d');
  offCtx.drawImage(img, 0, 0, w, h);
  offCtx.globalCompositeOperation = 'source-atop'; // キャラのα内のみ塗る
  offCtx.fillStyle = `rgb(${envColor.r}, ${envColor.g}, ${envColor.b})`;
  offCtx.fillRect(0, 0, w, h);

  // メインcanvasにブレンドモードで重ねる
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotate * Math.PI / 180);
  ctx.globalAlpha               = state.colorSync.strength;
  ctx.globalCompositeOperation  = state.colorSync.blendMode;
  ctx.drawImage(off, -w / 2, -h / 2);
  ctx.restore(); // globalAlpha / globalCompositeOperation もリセットされる
}

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
    if (snsJpg || snsPng) {
      const canvas = buildExportCanvas(1920);
      if (snsJpg) { await dlCanvas(canvas, `ohav_maker_${ts}.jpg`,  'image/jpeg', 0.92); count++; }
      if (snsPng) { await dlCanvas(canvas, `ohav_maker_${ts}.png`,  'image/png');         count++; }
    }
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
  let w = state.bgImg.naturalWidth, h = state.bgImg.naturalHeight;
  if (Math.max(w, h) > maxSide) {
    const r = maxSide / Math.max(w, h);
    w = Math.round(w * r); h = Math.round(h * r);
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
    drawLayer(ctx, state.charImg, w, h,
      state.charPosX, state.charPosY, state.charScale, state.charRotate);
    if (state.colorSync.enabled) {
      applyColorSyncOverlay(ctx, state.charImg, w, h,
        state.charPosX, state.charPosY, state.charScale, state.charRotate);
    }
  }
  // 手前素材
  if (state.fgImg) drawLayer(ctx, state.fgImg, w, h,
    state.fgPosX, state.fgPosY, state.fgScale, state.fgRotate);

  return canvas;
}

function dlCanvas(canvas, filename, mimeType, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href = url; a.download = filename;
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
function showBadge(badgeEl, iconEl, textEl, typeClass, icon, text) {
  badgeEl.className = `detection-badge visible ${typeClass}`;
  iconEl.textContent = icon;
  textEl.textContent = text;
}

function hideBadge(badgeEl) {
  badgeEl.className = 'detection-badge';
}

function showAiProgress(wrap, bar, status, time) {
  wrap.classList.add('visible');
  bar.style.width = '0%';
  status.textContent = 'AI準備中...';
  time.textContent   = '計算中...';
}

function hideAiProgress(wrap) {
  wrap.classList.remove('visible');
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
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
