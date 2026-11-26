/* ============================================================
   ФОТО С ХИМЕРОЙ — логика экрана
   Демо-режим, пока window.PHOTO_API пуст: генерации нет,
   показывается выбранный образец с явной пометкой.
   ============================================================ */
(() => {
  'use strict';

  const LS_FREE = 'anomaly_chimera_free_used_v1';

  // Пока идёт тестирование — один бесплатный кадр не ограничиваем.
  // Вернуть true перед показом людям.
  const FREE_LIMIT_ENABLED = false;

  const $ = (id) => document.getElementById(id);
  const screens = ['s-offer', 's-preview', 's-wait', 's-result', 's-used', 's-closed'];
  const show = (id) => screens.forEach(s => $(s).classList.toggle('is-active', s === id));

  const state = { scene: null, file: null, previewUrl: null, resultUrl: null };

  /* ---------- галерея сцен ---------- */
  const gallery = $('gallery');
  const sceneName = $('scene-name');

  (window.PHOTO_SCENES || []).forEach((scene, i) => {
    const btn = document.createElement('button');
    btn.className = 'scene';
    btn.type = 'button';
    btn.dataset.id = scene.id;
    btn.setAttribute('aria-label', scene.name || `Сцена ${i + 1}`);
    btn.innerHTML = `<img src="${scene.src}" alt="" loading="lazy">
      <span class="tick">✓</span>`;
    btn.addEventListener('click', () => {
      // повторное нажатие по выбранной сцене — посмотреть её крупно
      if (state.scene && state.scene.id === scene.id) openLightbox(scene.src);
      else pickScene(scene, btn);
    });
    gallery.appendChild(btn);
  });

  function pickScene(scene, btn) {
    state.scene = scene;
    [...gallery.children].forEach(el => el.classList.toggle('is-picked', el === btn));
    sceneName.textContent = scene.name || '';
  }

  /* ---------- просмотр сцены крупно ---------- */
  const lightbox = $('lightbox');
  const lightboxImg = $('lightbox-img');

  function openLightbox(src) {
    if (!lightbox) return;
    lightboxImg.src = src;
    lightbox.hidden = false;
  }
  function closeLightbox() {
    if (!lightbox) return;
    lightbox.hidden = true;
    lightboxImg.src = '';
  }
  if (lightbox) {
    lightbox.addEventListener('click', closeLightbox);
    $('lightbox-close').addEventListener('click', closeLightbox);
    lightboxImg.addEventListener('click', (e) => {
      e.stopPropagation();
      lightboxImg.classList.toggle('is-zoomed');
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });
  }

  // первая сцена выбрана сразу
  if (gallery.firstElementChild) gallery.firstElementChild.click();

  /* ---------- точки и стрелки галереи ---------- */
  const dotsBox = $('dots');
  const arrowPrev = $('gal-prev');
  const arrowNext = $('gal-next');
  let dotEls = [];
  let scrollTimer = null;

  function buildDots() {
    dotsBox.innerHTML = '';
    dotEls = [...gallery.children].map((el, i) => {
      const d = document.createElement('button');
      d.type = 'button';
      d.className = 'dot';
      d.setAttribute('aria-label', `Сцена ${i + 1}`);
      d.addEventListener('click', () => scrollToScene(i));
      dotsBox.appendChild(d);
      return d;
    });
  }

  function scrollToScene(i) {
    const el = gallery.children[i];
    if (!el) return;
    gallery.scrollTo({
      left: el.offsetLeft - (gallery.clientWidth - el.clientWidth) / 2,
      behavior: 'smooth'
    });
  }

  function nearestIndex() {
    const center = gallery.scrollLeft + gallery.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    [...gallery.children].forEach((el, i) => {
      const c = el.offsetLeft + el.clientWidth / 2;
      const d = Math.abs(c - center);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
  }

  function syncGallery(select) {
    const i = nearestIndex();
    dotEls.forEach((d, k) => d.classList.toggle('on', k === i));
    if (select) {
      const el = gallery.children[i];
      const sc = (window.PHOTO_SCENES || [])[i];
      if (el && sc && (!state.scene || state.scene.id !== sc.id)) el.click();
    }
  }

  gallery.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => syncGallery(true), 120);
  });

  arrowPrev.addEventListener('click', () => {
    scrollToScene(Math.max(0, nearestIndex() - 1));
  });
  arrowNext.addEventListener('click', () => {
    scrollToScene(Math.min(gallery.children.length - 1, nearestIndex() + 1));
  });

  buildDots();
  syncGallery(false);

  /* ---------- выбор источника фото ---------- */
  $('btn-selfie').addEventListener('click', () => $('file-camera').click());
  $('btn-pick').addEventListener('click', () => $('file-gallery').click());
  $('btn-retake').addEventListener('click', () => $('file-camera').click());

  ['file-camera', 'file-gallery'].forEach(id => {
    $(id).addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      await acceptFile(file);
    });
  });

  /* ---------- проверка фото до отправки ---------- */
  async function acceptFile(file) {
    clearError();
    $('consent').checked = false;
    $('btn-generate').disabled = true;

    if (!/^image\/(jpeg|png|heic|heif|webp)$/i.test(file.type)) {
      return fail('Это не похоже на фотографию. Выберите JPEG или PNG.');
    }
    if (file.size > 10 * 1024 * 1024) {
      return fail('Фото слишком тяжёлое (больше 10 МБ). Снимите ещё раз.');
    }

    const url = URL.createObjectURL(file);
    const img = await loadImage(url).catch(() => null);
    if (!img) return fail('Не получилось открыть этот файл. Попробуйте другое фото.');

    const minSide = Math.min(img.naturalWidth, img.naturalHeight);
    if (minSide < 500) return fail('Фото слишком маленькое. Нужен снимок до груди или по пояс, не обрезанный.');

    // средняя яркость
    const bright = await averageBrightness(img);
    if (bright < 42) return fail('На фото слишком темно — лица не видно. Выберите кадр при свете.');

    // лицо: нативный детектор есть не везде (Safari), тогда не блокируем
    const faces = await countFaces(img);
    if (faces === 0) return fail('Не видно лица. Снимите анфас, чтобы лицо было целиком в кадре.');
    if (faces > 1) return fail('В кадре несколько человек. На фото должен быть только один.');

    state.file = file;
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = url;
    $('preview-img').src = url;
    $('preview-img').hidden = false;
    $('preview-empty').hidden = true;
    show('s-preview');
  }

  function fail(message) {
    show('s-preview');
    $('preview-error').textContent = message;
    $('preview-error').classList.add('is-shown');
    $('preview-img').hidden = true;
    $('preview-empty').hidden = false;
  }
  function clearError() {
    $('preview-error').classList.remove('is-shown');
    $('preview-error').textContent = '';
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function averageBrightness(img) {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, size, size);
    const d = ctx.getImageData(0, 0, size, size).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return sum / (size * size);
  }

  async function countFaces(img) {
    if (!('FaceDetector' in window)) return 1; // проверить нечем — не мешаем человеку
    try {
      const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
      const faces = await detector.detect(img);
      return faces.length;
    } catch {
      return 1;
    }
  }

  /* ---------- согласие ---------- */
  $('consent').addEventListener('change', (e) => {
    $('btn-generate').disabled = !(e.target.checked && state.file && state.scene);
  });

  /* ---------- генерация ---------- */
  $('btn-generate').addEventListener('click', async () => {
    if (isFreeUsed()) return show('s-used');
    if (!state.file || !state.scene) return;

    show('s-wait');
    startProgress();

    try {
      const result = window.PHOTO_API
        ? await requestPhoto(state.scene, state.file)
        : await demoResult(state.scene);

      finishProgress();
      state.resultUrl = result.url;
      $('result-img').src = result.url;
      $('demo-stamp').hidden = !result.demo;
      markFreeUsed();
      setTimeout(() => show('s-result'), 350);
    } catch (err) {
      stopProgress();
      show('s-preview');
      $('preview-error').textContent = friendlyError(err);
      $('preview-error').classList.add('is-shown');
    }
  });

  async function requestPhoto(scene, file) {
    const body = new FormData();
    body.append('scene', scene.id);
    try {
      const r = await fetch(scene.src);
      if (r.ok) body.append('sceneFile', await r.blob(), 'scene.jpg');
    } catch { /* воркер возьмёт сцену по своему адресу */ }
    body.append('photo', file, 'photo.jpg');
    const res = await fetch(window.PHOTO_API, { method: 'POST', body });
    if (!res.ok) throw new Error('server_' + res.status);
    const data = await res.json();
    if (!data.url) throw new Error('no_url');
    return { url: data.url, demo: false };
  }

  // демо: показываем сам образец, без выдачи за настоящий кадр
  async function demoResult(scene) {
    await new Promise(r => setTimeout(r, 1600));
    return { url: scene.src, demo: true };
  }

  function friendlyError(err) {
    if (String(err.message).startsWith('server_')) {
      return 'Сервис не ответил. Бесплатный кадр не потрачен — попробуйте ещё раз через минуту.';
    }
    return 'Не получилось собрать кадр. Бесплатный кадр не потрачен — попробуйте ещё раз.';
  }

  /* ---------- прогресс ---------- */
  let progressTimer = null;
  let progressValue = 8;

  function startProgress() {
    progressValue = 8;
    $('bar').style.width = '8%';
    $('wait-text').textContent = 'Обычно это занимает 20–30 секунд.';
    const messages = [
      [6000, 'Переносим лицо…'],
      [14000, 'Собираем сцену…'],
      [22000, 'Ещё немного…'],
      [32000, 'Сервис чуть задумался, ждём ответ.']
    ];
    const startedAt = Date.now();
    progressTimer = setInterval(() => {
      progressValue = Math.min(progressValue + Math.random() * 3, 92);
      $('bar').style.width = progressValue + '%';
      const elapsed = Date.now() - startedAt;
      const msg = messages.filter(([t]) => elapsed >= t).pop();
      if (msg) $('wait-text').textContent = msg[1];
    }, 700);
  }
  function finishProgress() {
    clearInterval(progressTimer);
    progressTimer = null;
    $('bar').style.width = '100%';
  }
  function stopProgress() {
    clearInterval(progressTimer);
    progressTimer = null;
    progressValue = 8;
  }

  /* ---------- лимит одного бесплатного кадра ---------- */
  function isFreeUsed() {
    if (!FREE_LIMIT_ENABLED) return false;
    try { return !!localStorage.getItem(LS_FREE); } catch { return false; }
  }
  function markFreeUsed() {
    if (!FREE_LIMIT_ENABLED) return;
    try { localStorage.setItem(LS_FREE, new Date().toISOString()); } catch {}
  }

  /* ---------- скачивание ---------- */
  $('btn-download').addEventListener('click', async () => {
    if (!state.resultUrl) return;
    const name = 'anomaliya_chimera.jpg';
    try {
      const res = await fetch(state.resultUrl, { mode: 'cors' });
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch {
      window.open(state.resultUrl, '_blank'); // iPhone: «Сохранить в Фото»
    }
  });

  /* ---------- выходы ---------- */
  // внутри квеста страница открыта поверх него: закрываемся сообщением,
  // чтобы не потерять состояние комнаты; отдельно — просто показываем «Готово»
  function closeScreen() {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'photo-close' }, '*');
      return;
    }
    show('s-closed');
  }

  $('btn-done').addEventListener('click', closeScreen);
  $('btn-used-done').addEventListener('click', closeScreen);
  $('btn-decline').addEventListener('click', closeScreen);
  $('btn-back').addEventListener('click', closeScreen);

  /* ---------- стартовое состояние ---------- */
  if (isFreeUsed()) show('s-used');
})();
