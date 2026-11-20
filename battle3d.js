/* ОБОРОНА — проверка: локация ровно картинкой, объёмные только разлом и монстр. */
(function () {
  'use strict';
  var BUILD = 'b3d06';
  var doc = document;
  var canvas = doc.getElementById('c');
  var msgEl = doc.getElementById('msg');
  var stEl = doc.getElementById('st');
  doc.getElementById('build').textContent = 'Сборка ' + BUILD;

  function st(t) { if (stEl) stEl.textContent = t; }
  function fail(t) { msgEl.style.display = 'flex'; msgEl.textContent = t; st('ошибка: ' + t); }
  window.onerror = function (m) { fail('Сбой в странице: ' + m); };

  var IMG_ASPECT = 2048 / 1143;
  var RIFT_X = 0.47, RIFT_Y = 0.80;
  var MON_H = 0.26;

  var renderer, scene, camera, clock;
  var monWrap = null, glowSprite = null, embers = null, emberV = [];
  var startAt = performance.now();
  var S = 1, SY = 1, AS = 1, loaded = false, uTime = { value: 0 };

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function layout() {
    var w = window.innerWidth, h = window.innerHeight;
    AS = w / h;
    S = Math.max(IMG_ASPECT, AS);
    SY = S / IMG_ASPECT;
    if (renderer) {
      renderer.setSize(w, h);
      camera.left = -AS / 2; camera.right = AS / 2;
      camera.top = 0.5; camera.bottom = -0.5;
      camera.updateProjectionMatrix();
    }
  }
  function imgToWorld(ix, iy) { return { x: (ix - 0.5) * S, y: (0.5 - iy) * SY }; }

  function radialTexture() {
    var s = 256, cv = doc.createElement('canvas'); cv.width = cv.height = s;
    var g = cv.getContext('2d');
    var gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(120,240,232,0.75)');
    gr.addColorStop(0.30, 'rgba(40,205,196,0.32)');
    gr.addColorStop(0.65, 'rgba(14,100,110,0.10)');
    gr.addColorStop(1, 'rgba(8,60,70,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(cv);
  }

  function init() {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    try { renderer.outputEncoding = THREE.sRGBEncoding; } catch (e) {}
    try { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0; } catch (e) {}
    st('3D запущено, грузим монстра…');

    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.01, 20);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    clock = new THREE.Clock();

    // пасмурный день: мягкий верхний свет и холодный контровой снизу
    scene.add(new THREE.HemisphereLight(0xc9d2d4, 0x1c2224, 0.85));
    var key = new THREE.DirectionalLight(0xe9eff0, 1.05);
    key.position.set(-0.7, 1.1, 1.4); scene.add(key);
    var rim = new THREE.DirectionalLight(0x2ecfc7, 0.75);
    rim.position.set(0.8, -0.5, 0.7); scene.add(rim);

    var glowMat = new THREE.SpriteMaterial({
      map: radialTexture(), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: 0.6
    });
    glowSprite = new THREE.Sprite(glowMat);
    var gp = imgToWorld(RIFT_X, RIFT_Y + 0.04);
    glowSprite.position.set(gp.x, gp.y, -0.4);
    glowSprite.scale.set(SY * 0.42, SY * 0.34, 1);
    scene.add(glowSprite);

    var n = 60, pos = [], vel = [];
    for (var i = 0; i < n; i++) {
      var w = imgToWorld(rnd(RIFT_X - 0.15, RIFT_X + 0.15), rnd(RIFT_Y - 0.10, RIFT_Y + 0.22));
      pos.push(w.x, w.y, rnd(-0.3, 0.1));
      vel.push(rnd(0.010, 0.040));
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    emberV = vel;
    embers = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x6fe4dc, size: 1.5, transparent: true, opacity: 0.40,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false
    }));
    scene.add(embers);

    layout();
    loadMonster();
    doc.getElementById('again').addEventListener('click', function () { startAt = performance.now(); });
    window.addEventListener('resize', layout);
    animate();
    window.__dbg = function () { return { build: BUILD, loaded: loaded }; };
  }

  function loadMonster() {
    if (!THREE.GLTFLoader) { fail('Загрузчик моделей не подключился.'); return; }
    var gl = new THREE.GLTFLoader();
    gl.load('assets/mon_spider3d.glb?v=' + BUILD, function (g) {
      try { buildMonster(g); loaded = true; st('монстр загружен'); }
      catch (e) { fail('Модель пришла, но не собралась: ' + e.message); }
    }, function (p) {
      if (p && p.total) st('монстр: ' + Math.round(p.loaded / p.total * 100) + '%');
    }, function (e) {
      fail('Модель не загрузилась: ' + ((e && (e.message || e.type)) || 'нет ответа'));
    });
  }

  function buildMonster(g) {
    var root = g.scene, paint = false;
    root.traverse(function (o) {
      if (o.isMesh && !paint) {
        if (Array.isArray(o.material)) return;
        var m = o.material;
        m.metalness = 0; if ('metalnessMap' in m) m.metalnessMap = null;
        m.roughness = 1;
        m.color = new THREE.Color(0x9aa5a7);
        m.emissive = new THREE.Color(0x0a2328);
        m.emissiveIntensity = 0.22;
        if (m.map) { try { m.map.encoding = THREE.sRGBEncoding; } catch (e) {} }
        m.onBeforeCompile = function (sh) {
          sh.uniforms.uTime = uTime;
          sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader;
          sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>',
            '#include <begin_vertex>\n' +
            'float lowW = smoothstep(0.06, -0.50, transformed.y);\n' +
            'float wob = sin(transformed.x * 11.0 + transformed.z * 8.0 + uTime * 12.0);\n' +
            'transformed.x += wob * 0.055 * lowW;\n' +
            'transformed.z += cos(transformed.x * 8.0 + uTime * 9.0) * 0.045 * lowW;\n' +
            'transformed.y += sin(uTime * 6.0 + transformed.x * 4.0) * 0.012 * lowW;');
        };
        m.needsUpdate = true;
        paint = true;
      }
      if (o.isMesh) o.frustumCulled = false;
    });
    var box = new THREE.Box3(); root.updateMatrixWorld(true); box.setFromObject(root);
    var size = new THREE.Vector3(); box.getSize(size);
    var k = (MON_H * SY) / (size.y || 1);
    root.scale.setScalar(k);
    root.position.set(-(box.min.x + box.max.x) / 2 * k, -(box.min.y) * k, -(box.min.z + box.max.z) / 2 * k);
    monWrap = new THREE.Group();
    monWrap.add(root);
    var p0 = imgToWorld(RIFT_X, RIFT_Y + 0.30);
    monWrap.position.set(p0.x, p0.y, 0);
    scene.add(monWrap);
    startAt = performance.now();
  }

  function easeOut(k) { return 1 - Math.pow(1 - k, 3); }

  function animate() {
    requestAnimationFrame(animate);
    var dt = Math.min(0.05, clock.getDelta());
    var t = (performance.now() - startAt) / 1000;

    if (monWrap) {
      var emerge = imgToWorld(RIFT_X, RIFT_Y - 0.04);
      var start = imgToWorld(RIFT_X - 0.02, RIFT_Y + 0.34);
      var y, x, sc = 1, rot = Math.PI / 2;   // боком
      if (t < 0.15) {
        x = start.x; y = start.y - SY * 0.34; sc = 1;
      } else if (t < 2.5) {
        var k1 = (t - 0.15) / 2.35, e = easeOut(k1);
        x = start.x; y = (start.y - SY * 0.34) + (emerge.y - (start.y - SY * 0.34)) * e;
        sc = 1 + 0.06 * e;
      } else {
        // идёт боком вправо, потом обратно — без остановок
        var walk = t - 2.5;
        var span = 0.115;                       // сколько экрана проходит в одну сторону
        var period = 7.5;
        var ph = (walk % (period * 2)) / period; // 0..2
        var dir = ph < 1 ? 1 : -1;
        var frac = ph < 1 ? ph : 2 - ph;
        var ix = RIFT_X + (frac - 0.5) * span;
        var w = imgToWorld(ix, RIFT_Y - 0.04);
        x = w.x; y = w.y + Math.sin(walk * 9.0) * SY * 0.012;
        sc = 1.06 + 0.03 * frac;
        rot = Math.PI / 2 * dir;                // повёрнут по ходу движения
      }
      monWrap.position.x = x;
      monWrap.position.y = y;
      monWrap.scale.setScalar(sc);
      monWrap.rotation.y = rot;
      uTime.value = t;
    }

    if (embers) {
      var a = embers.geometry.attributes.position;
      var top = imgToWorld(RIFT_X, RIFT_Y - 0.22).y;
      for (var i = 0; i < a.count; i++) {
        var yy = a.getY(i) + emberV[i] * dt;
        if (yy > top) {
          var nb = imgToWorld(rnd(RIFT_X - 0.15, RIFT_X + 0.15), rnd(RIFT_Y + 0.10, RIFT_Y + 0.26));
          a.setX(i, nb.x); yy = nb.y;
        }
        a.setY(i, yy);
      }
      a.needsUpdate = true;
    }

    if (glowSprite) {
      var p = 1 + Math.sin(t * 2.1) * 0.06;
      glowSprite.scale.set(SY * 0.42 * p, SY * 0.34 * p, 1);
      glowSprite.material.opacity = 0.55 + Math.sin(t * 3.3) * 0.10;
    }

    renderer.render(scene, camera);
  }

  try {
    if (!window.THREE) { fail('Библиотека 3D не загрузилась.'); }
    else { init(); }
  } catch (e) {
    fail('Не удалось запустить 3D: ' + (e && e.message ? e.message : e));
  }
})();
