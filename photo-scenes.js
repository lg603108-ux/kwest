/* Список сцен-образцов. Добавили картинку — добавили строку.
   src: путь от photo.html. name: подпись под кадром (можно пустую). */
window.PHOTO_SCENES = [
  { id: 'scene_01', src: 'assets/photo/scene_01.jpg', name: 'Химера 1' },
  { id: 'scene_02', src: 'assets/photo/scene_02.jpg', name: 'Химера 2' },
  { id: 'scene_03', src: 'assets/photo/scene_03.jpg', name: 'Химера 3' },
  { id: 'scene_04', src: 'assets/photo/scene_04.jpg', name: 'Химера 4' },
  { id: 'scene_05', src: 'assets/photo/scene_05.jpg', name: 'Химера 5' },
  { id: 'scene_06', src: 'assets/photo/scene_06.jpg', name: 'Химера 6' },
  { id: 'scene_07', src: 'assets/photo/scene_07.jpg', name: 'Химера 7' }
];

/* Адрес серверной прослойки (Cloudflare Worker). Пока пусто — демо-режим:
   страница показывает выбранный образец с явной пометкой, генерации нет. */
window.PHOTO_API = 'https://anomaly-photo.anomalyphoto.workers.dev/photo';
