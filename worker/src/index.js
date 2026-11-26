/**
 * Cloudflare Worker — привратник для страницы «Фото с химерой».
 * Ключ fal живёт только здесь (secret FAL_KEY), в браузер и репозиторий не попадает.
 *
 * POST /photo  (multipart/form-data)
 *   scene     — id сцены (scene_01 …)
 *   sceneFile — сам кадр-образец (необязательно)
 *   photo     — фото человека
 * Ответ: { url: "https://.../result.png" }
 *
 * Защита:
 *   • Origin: пускаем только свои адреса (ALLOWED_ORIGINS);
 *   • лимит на адрес: 3 кадра в сутки;
 *   • общий дневной потолок: 300 кадров, чтобы утечка ссылки не сожгла баланс.
 */

const FAL_ENDPOINT = 'https://fal.run/bytedance/seedream/v5.5/edit';

// Сцены-образцы по публичному адресу (если страница не прислала файл).
const SCENE_BASE = 'https://photo-chimera.pages.dev/scenes';
// Единый костюм квеста: третий референс для модели.
const SUIT_URL = 'https://photo-chimera.pages.dev/refs/suit.jpg';

// Свои адреса страницы. Локальные — для проверки.
const ALLOWED_ORIGINS = [
  'https://photo-chimera.pages.dev',
  'https://fadb1a01.photo-chimera.pages.dev',
  'https://lg603108-ux.github.io',
  'http://127.0.0.1:8080',
  'http://localhost:8080'
];

const PER_IP_PER_DAY = 3;
const TOTAL_PER_DAY = 300;

// Пока идёт тестирование — лимиты выключены. Вернуть true перед показом людям.
const LIMITS_ENABLED = false;

const PROMPT = [
  'Фигура 1 — человек: это человек, которого нужно поместить в сцену. Сохрани его лицо, возраст, причёску, телосложение и пропорции тела.',
  'Фигура 2 — сцена: сохрани композицию, позу, ракурс, фон, свет и химеру без изменений.',
  'Фигура 3 — костюм: одень человека в этот костюм, сохрани все детали — цвет, капюшон, перчатки, тёмные вставки, нашивки, ботинки.',
  'Капюшон НЕ надет на голову: голова открыта, волосы видны, человек без головного убора, капюшон лежит на плечах и спине.',
  'Замени человека в сцене на человека с Фигуры 1 целиком: другая фигура и другое телосложение, но точно та же поза и то же место в кадре. Одежда — костюм с Фигуры 3.',
  'Фигура пропорциональна лицу: голова и тело в естественных человеческих пропорциях.'
].join(' ');

const ALLOWED_SCENES = new Set(
  Array.from({ length: 30 }, (_, i) => `scene_${String(i + 1).padStart(2, '0')}`)
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405);
    }
    if (url.pathname !== '/' && url.pathname !== '/photo') {
      return json({ error: 'not_found' }, 404);
    }

    // --- откуда пришёл запрос ---
    const origin = request.headers.get('Origin');
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return json({ error: 'origin_not_allowed' }, 403);
    }

    if (!env.FAL_KEY) {
      return json({ error: 'no_key' }, 500);
    }

    // --- лимиты ---
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const day = new Date().toISOString().slice(0, 10);
    const ipKey = `ip:${ip}:${day}`;
    const totalKey = `total:${day}`;

    const [ipCount, totalCount] = await Promise.all([
      env.RATE.get(ipKey),
      env.RATE.get(totalKey)
    ]);

    if (LIMITS_ENABLED && Number(ipCount || 0) >= PER_IP_PER_DAY) {
      return json({ error: 'day_limit' }, 429);
    }
    if (LIMITS_ENABLED && Number(totalCount || 0) >= TOTAL_PER_DAY) {
      return json({ error: 'service_limit' }, 503);
    }

    // --- входные данные ---
    let form;
    try {
      form = await request.formData();
    } catch {
      return json({ error: 'bad_form' }, 400);
    }

    const scene = String(form.get('scene') || '');
    const sceneFile = form.get('sceneFile');
    const photo = form.get('photo');

    if (!ALLOWED_SCENES.has(scene)) return json({ error: 'bad_scene' }, 400);
    if (!photo || typeof photo === 'string') return json({ error: 'no_photo' }, 400);
    if (photo.size > 10 * 1024 * 1024) return json({ error: 'too_big' }, 413);

    const buf = new Uint8Array(await photo.arrayBuffer());
    const mime = photo.type && photo.type.startsWith('image/') ? photo.type : 'image/jpeg';
    const photoUri = `data:${mime};base64,${base64(buf)}`;

    let sceneUri = `${SCENE_BASE}/${scene}.jpg`;
    if (sceneFile && typeof sceneFile !== 'string') {
      if (sceneFile.size > 8 * 1024 * 1024) return json({ error: 'scene_too_big' }, 413);
      const sbuf = new Uint8Array(await sceneFile.arrayBuffer());
      const smime = sceneFile.type && sceneFile.type.startsWith('image/') ? sceneFile.type : 'image/jpeg';
      sceneUri = `data:${smime};base64,${base64(sbuf)}`;
    }

    // --- модель ---
    let falRes;
    try {
      falRes = await fetch(FAL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${env.FAL_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: PROMPT,
          image_urls: [photoUri, sceneUri, SUIT_URL],
          image_size: '1.5K',
          num_images: 1
        })
      });
    } catch {
      return json({ error: 'service_unreachable' }, 502);
    }

    if (!falRes.ok) {
      const text = await falRes.text().catch(() => '');
      return json({ error: 'model_error', status: falRes.status, detail: text.slice(0, 300) }, 502);
    }

    const data = await falRes.json().catch(() => null);
    const out = data && data.images && data.images[0] && data.images[0].url;
    if (!out) return json({ error: 'no_result' }, 502);

    // считаем только успешные кадры
    if (LIMITS_ENABLED) {
      await Promise.all([
        env.RATE.put(ipKey, String(Number(ipCount || 0) + 1), { expirationTtl: 86400 }),
        env.RATE.put(totalKey, String(Number(totalCount || 0) + 1), { expirationTtl: 86400 })
      ]);
    }

    return json({ url: out });
  }
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function base64(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}
