/* ОБОРОНА 3D — проверочная сцена: настоящий разлом + объёмный монстр.
   Отдельная страница, с квестом не связана. Ничего из index.html не использует. */
(function () {
  'use strict';
  var BUILD = 'b3d01';
  var doc = document;
  var canvas = doc.getElementById('c');
  var msgEl = doc.getElementById('msg');
  doc.getElementById('build').textContent = 'Сборка ' + BUILD;

  function fail(text) {
    msgEl.style.display = 'flex';
    msgEl.textContent = text;
  }

  var renderer, scene, camera, clock;
  var monster = null, monWrap = null;
  var tStart = 0, startedAt = performance.now();
  var debris = [], sparks = null, monLight = null, rimLight = null;
  var RIFT_NEAR = -4.2, RIFT_FAR = -9.6, RIFT_HALF_X = 30, FLOOR_Y = -9;

  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* ---------- край разлома: рваная линия поперёк улицы ---------- */
  function edgeNear(x) {
    return RIFT_NEAR + Math.sin(x * 0.83) * 0.55 + Math.sin(x * 2.31 + 1.7) * 0.30 + Math.sin(x * 5.2 + 0.4) * 0.14;
  }
  function edgeFar(x) {
    return RIFT_FAR + Math.sin(x * 0.71 + 2.1) * 0.75 + Math.sin(x * 1.93 + 0.3) * 0.34 + Math.sin(x * 4.4 + 1.1) * 0.16;
  }

  /* ---------- текстуры рисуем сами ---------- */
  function asphaltTexture() {
    var s = 512, cv = doc.createElement('canvas'); cv.width = cv.height = s;
    var g = cv.getContext('2d');
    g.fillStyle = '#4d5459'; g.fillRect(0, 0, s, s);
    for (var i = 0; i < 9000; i++) {
      var v = 40 + Math.random() * 70;
      g.fillStyle = 'rgba(' + (v | 0) + ',' + ((v + 4) | 0) + ',' + ((v + 6) | 0) + ',' + (0.10 + Math.random() * 0.25) + ')';
      g.fillRect(Math.random() * s, Math.random() * s, 1.6, 1.6);
    }
    // редкие трещины
    for (var k = 0; k < 7; k++) {
      g.strokeStyle = 'rgba(20,24,26,0.55)'; g.lineWidth = 1 + Math.random() * 1.6;
      g.beginPath();
      var x = Math.random() * s, y = Math.random() * s;
      g.moveTo(x, y);
      for (var n = 0; n < 9; n++) { x += rnd(-26, 26); y += rnd(6, 30); g.lineTo(x, y); }
      g.stroke();
    }
    var t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  function concreteTexture() {
    var s = 256, cv = doc.createElement('canvas'); cv.width = cv.height = s;
    var g = cv.getContext('2d');
    g.fillStyle = '#3a4145'; g.fillRect(0, 0, s, s);
    for (var i = 0; i < 2600; i++) {
      var v = 30 + Math.random() * 60;
      g.fillStyle = 'rgba(' + (v | 0) + ',' + ((v + 3) | 0) + ',' + ((v + 5) | 0) + ',0.5)';
      g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    for (var k = 0; k < 6; k++) {
      g.strokeStyle = 'rgba(15,18,20,0.6)'; g.lineWidth = 1.5;
      g.beginPath(); var x = Math.random() * s, y = 0; g.moveTo(x, y);
      for (var n = 0; n < 6; n++) { x += rnd(-18, 18); y += s / 6; g.lineTo(x, y); }
      g.stroke();
    }
    var t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  // светящаяся трещина: рваная бирюзовая линия с белым ядром
  function glowTexture() {
    var w = 256, h = 64, cv = doc.createElement('canvas'); cv.width = w; cv.height = h;
    var g = cv.getContext('2d');
    g.clearRect(0, 0, w, h);
    function line(width, color, yoff) {
      g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round';
      g.beginPath();
      var y = h / 2 + yoff;
      g.moveTo(0, y);
      for (var x = 0; x <= w; x += 16) { y = h / 2 + yoff + rnd(-9, 9); g.lineTo(x, y); }
      g.stroke();
    }
    line(20, 'rgba(20,190,205,0.30)', 0);
    line(11, 'rgba(45,225,220,0.55)', 0);
    line(5, 'rgba(160,252,246,0.85)', 0);
    line(2, 'rgba(255,255,255,0.95)', 0);
    var t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  /* ---------- геометрия ---------- */
  function groundStrip(side) {
    var pos = [], uv = [], idx = [];
    var step = 0.6, n = 0;
    for (var x = -RIFT_HALF_X; x < RIFT_HALF_X; x += step) {
      var x0 = x, x1 = x + step;
      var zA0, zA1, zB0, zB1;
      if (side === 'near') {
        zA0 = 14; zA1 = 14; zB0 = edgeNear(x0); zB1 = edgeNear(x1);
      } else {
        zA0 = edgeFar(x0); zA1 = edgeFar(x1); zB0 = -48; zB1 = -48;
      }
      pos.push(x0, 0, zA0, x1, 0, zA1, x1, 0, zB1);
      pos.push(x0, 0, zA0, x1, 0, zB1, x0, 0, zB0);
      uv.push(x0 / 6, zA0 / 6, x1 / 6, zA1 / 6, x1 / 6, zB1 / 6);
      uv.push(x0 / 6, zA0 / 6, x1 / 6, zB1 / 6, x0 / 6, zB0 / 6);
      var b = pos.length / 3 - 6;
      idx.push(b, b + 1, b + 2, b + 3, b + 4, b + 5);
      n += 2;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }

  function wallGeometry(side) {
    var pos = [], uv = [], idx = [], n = 0;
    var step = 0.8;
    var depths = [0, -2.2, -4.6, -7.0, FLOOR_Y];
    for (var x = -RIFT_HALF_X; x < RIFT_HALF_X; x += step) {
      var x0 = x, x1 = x + step;
      var e0 = side === 'near' ? edgeNear(x0) : edgeFar(x0);
      var e1 = side === 'near' ? edgeNear(x1) : edgeFar(x1);
      var dir = side === 'near' ? -1 : 1;   // вниз уходим внутрь разлома
      for (var d = 0; d < depths.length - 1; d++) {
        var y0 = depths[d], y1 = depths[d + 1];
        var off0 = (Math.abs(y0) / Math.abs(FLOOR_Y)) * 1.1 * dir;
        var off1 = (Math.abs(y1) / Math.abs(FLOOR_Y)) * 1.1 * dir;
        var za0 = e0 + off0, za1 = e1 + off1;
        var p0 = [x0, y0, za0], p1 = [x1, y0, za1], p2 = [x1, y1, za1 + (off1 - off0)], p3 = [x0, y1, za0 + (off1 - off0)];
        pos.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
        pos.push(p0[0], p0[1], p0[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2]);
        uv.push(x0 / 5, Math.abs(y0) / 5, x1 / 5, Math.abs(y0) / 5, x1 / 5, Math.abs(y1) / 5);
        uv.push(x0 / 5, Math.abs(y0) / 5, x1 / 5, Math.abs(y1) / 5, x0 / 5, Math.abs(y1) / 5);
        var b = pos.length / 3 - 6;
        idx.push(b, b + 1, b + 2, b + 3, b + 4, b + 5);
        n += 2;
      }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }

  function glowRibbon(side) {
    var pos = [], uv = [], idx = [], n = 0, step = 0.6;
    for (var x = -RIFT_HALF_X; x < RIFT_HALF_X; x += step) {
      var x0 = x, x1 = x + step;
      var e0 = side === 'near' ? edgeNear(x0) : edgeFar(x0);
      var e1 = side === 'near' ? edgeNear(x1) : edgeFar(x1);
      var s = side === 'near' ? -1 : 1;
      var w = 0.75;
      pos.push(x0, 0.07, e0, x1, 0.07, e1, x1, 0.07, e1 + s * w);
      pos.push(x0, 0.07, e0, x1, 0.07, e1 + s * w, x0, 0.07, e0 + s * w);
      uv.push(x0 / 3, 0, x1 / 3, 0, x1 / 3, 1, x0 / 3, 0, x1 / 3, 1, x0 / 3, 1);
      var b = pos.length / 3 - 6;
      idx.push(b, b + 1, b + 2, b + 3, b + 4, b + 5);
      n += 2;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    return geo;
  }

  /* ---------- сборка сцены ---------- */
  function init() {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(window.innerWidth, window.innerHeight);
    try { renderer.outputEncoding = THREE.sRGBEncoding; } catch (e) {}
    try { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; } catch (e) {}

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9aa7ab);
    scene.fog = new THREE.Fog(0x9eabb0, 26, 78);

    camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 260);
    camera.position.set(0, 2.35, 10.5);
    camera.lookAt(0, -1.4, -6.5);

    clock = new THREE.Clock();

    // свет: пасмурный день
    scene.add(new THREE.HemisphereLight(0xdae3e5, 0x4e5659, 1.05));
    scene.add(new THREE.AmbientLight(0x9fb0b4, 0.22));
    var sun = new THREE.DirectionalLight(0xe3ebec, 0.55);
    sun.position.set(-9, 16, 8); scene.add(sun);

    // дальний план: небо и город той же картинкой
    var loader = new THREE.TextureLoader();
    loader.load('assets/bg_defense_sky.jpg', function (tex) {
      try { tex.encoding = THREE.sRGBEncoding; } catch (e) {}
      var h = 78 * (tex.image.height / tex.image.width);
      var mat = new THREE.MeshBasicMaterial({ map: tex, fog: false, depthWrite: false });
      var plane = new THREE.Mesh(new THREE.PlaneGeometry(78, h), mat);
      plane.position.set(0, h / 2 - 1.5, -46);
      plane.renderOrder = -10;
      scene.add(plane);
    });

    // земля по обе стороны разлома
    var asp = asphaltTexture(); asp.repeat.set(1, 1);
    var groundMat = new THREE.MeshLambertMaterial({ map: asp, color: 0xb9c2c4 });
    scene.add(new THREE.Mesh(groundStrip('near'), groundMat));
    scene.add(new THREE.Mesh(groundStrip('far'), groundMat));

    // стенки разлома
    var con = concreteTexture();
    var wallMat = new THREE.MeshLambertMaterial({ map: con, color: 0x8e979a, side: THREE.DoubleSide });
    scene.add(new THREE.Mesh(wallGeometry('near'), wallMat));
    scene.add(new THREE.Mesh(wallGeometry('far'), wallMat));

    // дно
    var floor = new THREE.Mesh(
      new THREE.PlaneGeometry(RIFT_HALF_X * 2, 14),
      new THREE.MeshLambertMaterial({ color: 0x10171a })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, FLOOR_Y, -7);
    scene.add(floor);

    // бирюзовые трещины по краям
    var gt = glowTexture();
    var glowMat = new THREE.MeshBasicMaterial({
      map: gt, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, color: 0xffffff
    });
    var g1 = new THREE.Mesh(glowRibbon('near'), glowMat); g1.renderOrder = 3; scene.add(g1);
    var g2 = new THREE.Mesh(glowRibbon('far'), glowMat); g2.renderOrder = 3; scene.add(g2);

    // свет изнутри разлома
    var tube = new THREE.PointLight(0x2fe0d8, 1.35, 14, 2);
    tube.position.set(-2.5, -2.2, -7); scene.add(tube);
    var tube2 = new THREE.PointLight(0x2fe0d8, 1.2, 13, 2);
    tube2.position.set(3.5, -1.6, -6.5); scene.add(tube2);
    var deep = new THREE.PointLight(0x1fb8c8, 0.9, 16, 2);
    deep.position.set(0, -6.5, -7); scene.add(deep);

    // обломанные плиты асфальта по краю
    var slabMat = new THREE.MeshLambertMaterial({ map: asp, color: 0x9aa4a7 });
    for (var i = 0; i < 22; i++) {
      var sx = rnd(-16, 16);
      var isNear = Math.random() < 0.5;
      var z = isNear ? edgeNear(sx) : edgeFar(sx);
      var w = rnd(1.0, 2.8), d = rnd(0.8, 1.9);
      var slab = new THREE.Mesh(new THREE.BoxGeometry(w, rnd(0.18, 0.34), d), slabMat);
      slab.position.set(sx, rnd(-0.15, 0.08), z + (isNear ? rnd(0.1, 0.9) : rnd(-0.9, -0.1)));
      slab.rotation.set(rnd(-0.14, 0.14), rnd(0, 3.14), rnd(-0.12, 0.12));
      scene.add(slab);
    }

    // падающие обломки внутрь разлома
    var debMat = new THREE.MeshLambertMaterial({ map: con, color: 0x6f787b });
    for (var d2 = 0; d2 < 8; d2++) {
      var bx = new THREE.Mesh(new THREE.BoxGeometry(rnd(0.25, 0.7), rnd(0.2, 0.6), rnd(0.25, 0.7)), debMat);
      bx.position.set(rnd(-9, 9), rnd(0.5, -8), rnd(-9, -5));
      bx.userData.spd = rnd(0.5, 1.4);
      bx.userData.rot = rnd(-1, 1);
      scene.add(bx); debris.push(bx);
    }

    // искры-пыль из глубины
    var pts = [], NP = 130;
    for (var p = 0; p < NP; p++) {
      pts.push(rnd(-11, 11), rnd(FLOOR_Y, 1), rnd(-10, -4.4));
    }
    var pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    sparks = new THREE.Points(pg, new THREE.PointsMaterial({
      color: 0x6ff2ea, size: 0.09, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    }));
    scene.add(sparks);

    // свет на монстра: чтобы он читался как на витрине
    var spot = new THREE.SpotLight(0xeaf7f6, 2.1, 30, 0.75, 0.85, 1.4);
    spot.position.set(2.5, 9.5, 1.5);
    spot.target.position.set(0, 0.6, -6.4);
    scene.add(spot); scene.add(spot.target);
    monLight = spot;
    rimLight = new THREE.DirectionalLight(0x2fd6d0, 0.85);
    rimLight.position.set(-3, 5, -16);
    scene.add(rimLight);

    loadMonster();

    doc.getElementById('again').addEventListener('click', function () { startedAt = performance.now(); });

    window.addEventListener('resize', onResize);
    onResize();
    animate();
    window.__dbg = function () {
      return { build: BUILD, monster: !!monster, t: ((performance.now() - startedAt) / 1000).toFixed(2) };
    };
  }

  function onResize() {
    if (!renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function loadMonster() {
    if (!THREE.GLTFLoader) { fail('Загрузчик моделей не подключился.'); return; }
    var gl = new THREE.GLTFLoader();
    gl.load('assets/mon_spider3d.glb?v=' + BUILD, function (g) {
      monster = g.scene;
      monster.traverse(function (o) {
        if (o.isMesh) {
          o.frustumCulled = false;
          var m = o.material;
          if (m) {
            m.metalness = 0; if ('metalnessMap' in m) m.metalnessMap = null;
            m.roughness = 1;
            m.side = THREE.FrontSide;
            if (m.map) { try { m.map.encoding = THREE.sRGBEncoding; } catch (e) {} }
            m.emissive = new THREE.Color(0x0a2a2e);
            m.emissiveIntensity = 0.6;
            m.needsUpdate = true;
          }
        }
      });
      var box = new THREE.Box3();
      monster.updateMatrixWorld(true);
      box.setFromObject(monster);
      var size = new THREE.Vector3(); box.getSize(size);
      var s = 2.7 / (size.y || 1);
      monster.scale.setScalar(s);
      monster.position.set(0, 0, 0);
      monWrap = new THREE.Group();
      monWrap.add(monster);
      monWrap.position.set(0.4, FLOOR_Y, -7.4);
      scene.add(monWrap);
      startedAt = performance.now();
    }, undefined, function () {
      fail('Модель монстра не загрузилась. Проверьте связь и обновите страницу.');
    });
  }

  /* ---------- анимация ---------- */
  function easeOut(k) { return 1 - Math.pow(1 - k, 3); }

  function animate() {
    requestAnimationFrame(animate);
    var dt = Math.min(0.05, clock.getDelta());
    var t = (performance.now() - startedAt) / 1000;

    // монстр: выползает из разлома и идёт на камеру
    if (monWrap) {
      var y, z, rotY, bob = 0, STAND = 1.35;
      if (t < 0.6) {
        y = FLOOR_Y; z = -7.6; rotY = 0.5;
      } else if (t < 3.4) {
        var k = (t - 0.6) / 2.8;
        y = FLOOR_Y + (STAND - FLOOR_Y) * easeOut(k);
        z = -7.6 + 0.5 * easeOut(k);
        rotY = 0.5 - 0.5 * easeOut(k);
        bob = Math.sin(k * 14) * 0.06;
      } else if (t < 6.6) {
        var k2 = (t - 3.4) / 3.2;
        y = STAND + Math.sin(k2 * Math.PI * 3) * 0.05;
        z = -7.1 + 3.9 * k2;
        rotY = Math.sin(k2 * 6.0) * 0.05;
        bob = Math.sin(k2 * Math.PI * 6) * 0.04;
      } else {
        y = STAND + Math.sin(t * 1.3) * 0.045;
        z = -3.2;
        rotY = Math.sin(t * 0.8) * 0.07;
      }
      monWrap.position.set(0.4 + Math.sin(t * 0.9) * 0.05, y + bob, z);
      monWrap.rotation.y = rotY;
      monWrap.rotation.z = Math.sin(t * 1.7) * 0.02;
      if (monLight) {
        monLight.position.set(0.4 + 2.4, 9.2, z + 3.2);
        monLight.target.position.set(0.4, y + 0.9, z);
        monLight.target.updateMatrixWorld();
      }
    }

    // обломки падают вниз и возвращаются наверх
    for (var i = 0; i < debris.length; i++) {
      var b = debris[i];
      b.position.y -= b.userData.spd * dt;
      b.rotation.x += b.userData.rot * dt * 0.8;
      b.rotation.z += b.userData.rot * dt * 0.5;
      if (b.position.y < FLOOR_Y - 0.5) {
        b.position.set(rnd(-9, 9), rnd(10, 16), rnd(-9, -5));
      }
    }

    // искры поднимаются
    if (sparks) {
      var a = sparks.geometry.attributes.position;
      for (var s = 0; s < a.count; s++) {
        var y2 = a.getY(s) + dt * (0.55 + (s % 7) * 0.06);
        if (y2 > 1.2) y2 = FLOOR_Y + rnd(0, 1.5);
        a.setY(s, y2);
      }
      a.needsUpdate = true;
    }

    // лёгкое покачивание камеры
    camera.position.x = Math.sin(t * 0.35) * 0.08;
    camera.position.y = 2.35 + Math.sin(t * 0.5) * 0.03;
    camera.lookAt(0.2, -1.4, -6.5);

    renderer.render(scene, camera);
  }

  try {
    if (!window.THREE) { fail('Библиотека 3D не загрузилась (vendor/three.min.js).'); }
    else if (!canvas.getContext('webgl') && !canvas.getContext('experimental-webgl')) { fail('Этот браузер не поддерживает 3D. Нужна плоская версия обороны.'); }
    else { init(); }
  } catch (e) {
    fail('Не удалось запустить 3D: ' + (e && e.message ? e.message : e));
  }
})();
