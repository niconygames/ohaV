/* ==========================================
   おはVサーチ！- app.js
   ========================================== */

document.addEventListener('DOMContentLoaded', async () => {
  await loadAnniversary();
  setupCopyButton();
  setupSearchButtons();
  setupBoothButtons();
  setupTagPreview();
});

/* ------------------------------------------
   日付・記念日の読み込み
   ------------------------------------------ */
async function loadAnniversary() {
  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const key = `${month}/${day}`;

  // 日付表示
  const dateEl = document.getElementById('today-date');
  if (dateEl) {
    dateEl.textContent = formatDate(today);
  }

  // anniversaries.json 取得
  try {
    const res = await fetch('./anniversaries.json');
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();

    const entry = data[key];
    const nameEl = document.getElementById('anniversary-name');
    const tagsEl = document.getElementById('anniversary-tags');

    if (entry) {
      if (nameEl) nameEl.textContent = entry.name;
      if (tagsEl) renderAnniversaryTags(tagsEl, entry.tags);
    } else {
      if (nameEl) nameEl.textContent = '特別な日';
      if (tagsEl) {
        const note = document.createElement('p');
        note.style.cssText = 'font-size:0.8rem;color:var(--color-text-muted);';
        note.textContent = '今日の記念日データはありません';
        tagsEl.appendChild(note);
      }
    }
  } catch (e) {
    const nameEl = document.getElementById('anniversary-name');
    if (nameEl) nameEl.textContent = '今日も元気におはV！';
  }

  // 初期プレビュー更新
  updateCopyPreview();
}

function formatDate(date) {
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const dn = dayNames[date.getDay()];
  return `${y}年${m}月${d}日（${dn}）`;
}

function renderAnniversaryTags(container, tags) {
  container.innerHTML = '';
  tags.forEach(tag => {
    const label = document.createElement('label');
    label.className = 'tag-checkbox';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = tag;
    cb.checked = true;
    cb.addEventListener('change', updateCopyPreview);

    const span = document.createElement('span');
    span.textContent = tag;

    label.appendChild(cb);
    label.appendChild(span);
    container.appendChild(label);
  });
}

/* ------------------------------------------
   タグ プレビュー & コピー
   ------------------------------------------ */
function setupTagPreview() {
  // 既存の定番タグのチェックボックスにもイベントを付ける
  document.querySelectorAll('#default-tags input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', updateCopyPreview);
  });
}

function updateCopyPreview() {
  const tags = getSelectedTags();
  const preview = document.getElementById('copy-preview');
  if (!preview) return;

  if (tags.length === 0) {
    preview.textContent = 'タグを選択してください';
    preview.style.color = 'var(--color-text-subtle)';
  } else {
    preview.textContent = tags.join(' ');
    preview.style.color = 'var(--color-text)';
  }
}

function getSelectedTags() {
  return Array.from(
    document.querySelectorAll('.tag-checkbox input[type="checkbox"]:checked')
  ).map(cb => cb.value);
}

function setupCopyButton() {
  const btn = document.getElementById('copy-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const tags = getSelectedTags();
    if (tags.length === 0) {
      showToast('タグを選択してください');
      return;
    }
    const text = tags.join(' ');
    const copied = await copyToClipboard(text);
    showToast(copied ? 'コピーしました！' : 'コピーできませんでした');
  });
}

async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {}
  }
  // フォールバック
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (_) {
    return false;
  }
}

/* ------------------------------------------
   X 検索ボタン
   ------------------------------------------ */

// since:YYYY-MM-DD 用の日付文字列を返す（daysAgo=1 で昨日）
function getSinceDate(daysAgo = 1) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function setupSearchButtons() {
  // ゆるめ版: 30いいね以上＋昨日以降
  const btnLow = document.getElementById('search-low-faves');
  if (btnLow) {
    btnLow.addEventListener('click', () => {
      const since = getSinceDate(1);
      const q = `#おはようVtuber素材 min_faves:30 since:${since}`;
      openXSearch(q);
    });
  }

  // 人気寄り: 複合タグ 40いいね以上＋昨日以降
  const btnHigh = document.getElementById('search-high-faves');
  if (btnHigh) {
    btnHigh.addEventListener('click', () => {
      const since = getSinceDate(1);
      const q = `(#おはようVtuber素材 OR #おはV素材 OR #おはようVライバー素材) min_faves:40 since:${since}`;
      openXSearch(q);
    });
  }

  // 画像絞り込み最新版
  const btnImages = document.getElementById('search-images');
  if (btnImages) {
    btnImages.addEventListener('click', () => {
      const since = getSinceDate(1);
      const q = `(#おはようVtuber素材 OR #Vtuber素材 OR #おはV素材) filter:images since:${since} -filter:replies`;
      openXSearch(q);
    });
  }

  // おやVサーチ
  const btnOyav = document.getElementById('search-oyav');
  if (btnOyav) {
    btnOyav.addEventListener('click', () => {
      const q = `(おやすみ OR おやV) #VTuber`;
      openXSearch(q);
    });
  }
}

function openXSearch(query) {
  const url = `https://x.com/search?q=${encodeURIComponent(query)}&f=live&src=typed_query`;
  window.open(url, '_blank', 'noopener');
}

/* ------------------------------------------
   BOOTH 検索ボタン
   ------------------------------------------ */
function setupBoothButtons() {
  const btnFree = document.getElementById('booth-free');
  if (btnFree) {
    btnFree.addEventListener('click', () => {
      const keyword = encodeURIComponent('おはV');
      window.open(
        `https://booth.pm/ja/search/${keyword}?sort=new_arrivals&max_price=0`,
        '_blank', 'noopener'
      );
    });
  }

  const btnPaid = document.getElementById('booth-paid');
  if (btnPaid) {
    btnPaid.addEventListener('click', () => {
      const keyword = encodeURIComponent('おはV');
      window.open(
        `https://booth.pm/ja/search/${keyword}?sort=new_arrivals&min_price=100`,
        '_blank', 'noopener'
      );
    });
  }
}

/* ------------------------------------------
   Toast 通知
   ------------------------------------------ */
let toastTimer = null;

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  if (toastTimer) {
    clearTimeout(toastTimer);
    toast.classList.remove('show');
    // 少し待ってから再表示（アニメーションリセット）
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.textContent = message;
        toast.classList.add('show');
        toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
      });
    });
  } else {
    toast.textContent = message;
    toast.classList.add('show');
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      toastTimer = null;
    }, 2200);
  }
}
