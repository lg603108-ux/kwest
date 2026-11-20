/* ОБОРОНА — проверка: локация ровно картинкой, объёмные только разлом и монстр.
   Отдельная страница, с квестом не связана. */
(function () {
  'use strict';
  var BUILD = 'b3d03';
  var doc = document;
  var canvas = doc.getElementById('c');
  var msgEl = doc.getElementById('msg');
  doc.getElementById('build').textContent = 'Сборка ' + BUILD;

  function fail(t) { msgEl.style.display = 'flex'; msgEl.textContent = t; }

  var IMG_W = 2048, IMG_H = 1143;
  var IMG_ASPECT = IMG_W / IMG_H;

  // положение разлома в долях картинки (0..1 слева / сверху)
  var RIFT_X = 0.47, RIFT_Y = 0.80;
  var MON_H = 0.25;          // высота монстра в долях высоты картинки

  var renderer, scene, camera, clock;
  var monWrap = null, glowSprite = null, embers = null, emberV = [];
  var startAt = performance.now();
  var S = 1, SY = 1, AS = 1;

  function rnd(a, b) { return a + Math.random() * (b - a); }

  // картинка в кадре: повторяет поведение CSS "cover"
  function layout() {
    var w = window.innerWidth, h = window.innerHeight;
    AS = w / h;
    S = Math.max(IMG_ASPECT, AS);      // сколько world-единиц на всю ширину картинки
    SY = S / IMG_ASPECT;               // сколько на всю высоту картинки
    if (renderer) {
      renderer.setSize(w, h);
      camera.left = -AS / 2; camera.right = AS / 2;
      camera.top = 0.5; camera.bottom = -0.5;
      camera.updateProjectionMatrix();
    }
  }

  function imgToWorld(ix, iy) {
    return { x: (ix - 0.5) * S, y: (0.5 - iy) * SY };
  }

  function radialTexture() {
    var s = 256, cv = doc.createElement('canvas'); cv.width = cv.height = s;
    var g = cv.getContext('2d');
    var gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(150,255,248,0.95)');
    gr.addColorStop(0.30, 'rgba(45,225,214,0.45)');
    gr.addColorStop(0.65, 'rgba(16,120,130,0.12)');
    gr.addColorStop(1, 'rgba(8,60,70,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(cv);
  }

  function init() {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    try { renderer.outputEncoding = THREE.sRGBEncoding; } catch (e) {}
    try { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1; } catch (e) {}

    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.01, 20);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    clock = new THREE.Clock();

    // свет под пасмурный день картинки
    scene.add(new THREE.HemisphereLight(0xdbe4e6, 0x2b3336, 1.15));
    var key = new THREE.DirectionalLight(0xf0f6f7, 1.05);
    key.position.set(-0.6, 1.2, 1.5); scene.add(key);
    var rim = new THREE.DirectionalLight(0x39e2da, 1.7);
    rim.position.set(0.9, -0.4, 0.6); scene.add(rim);

    // свечение из разлома
    var glowMat = new THREE.SpriteMaterial({
      map: radialTexture(), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: 0.85
    });
    glowSprite = new THREE.Sprite(glowMat);
    var gp = imgToWorld(RIFT_X, RIFT_Y + 0.02);
    glowSprite.position.set(gp.x, gp.y, -0.4);
    glowSprite.scale.set(SY * 0.55, SY * 0.45, 1);
    scene.add(glowSprite);

    // искры, поднимающиеся из разлома
    var n = 140, pos = [], vel = [];
    for (var i = 0; i < n; i++) {
      var ix = rnd(RIFT_X - 0.16, RIFT_X + 0.16), iy = rnd(RIFT_Y - 0.12, RIFT_Y + 0.22);
      var w = imgToWorld(ix, iy);
      pos.push(w.x, w.y, rnd(-0.3, 0.1));
      vel.push(rnd(0.012, 0.05));
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    emberV = vel;
    embers = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x8ff8ef, size: 0.006, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false
    }));
    scene.add(embers);

    layout();
    loadMonster();

    doc.getElementById('again').addEventListener('click', function () { startAt = performance.now(); });
    window.addEventListener('resize', layout);
    animate();
    window.__dbg = function () {
      return { build: BUILD, loaded: !!monster, t: ((performance.now() - startAt) / 1000).toFixed(2) };
    };
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
            m.color = new THREE.Color(0xe2ecee);      // под свет картинки
            m.emissive = new THREE.Color(0x0b2e33);
            m.emissiveIntensity = 1.0;
            if (m.map) { try { m.map.encoding = THREE.sRGBEncoding; } catch (e) {} }
            m.needsUpdate = true;
          }
        }
      });
      var h = MON_H * SY;                            // высота в world-единицах
      monster.scale.setScalar(h);                    // модель ровно 1 единица в высоту
      monster.position.y = h * 0.5;                  // ставим на землю
      monWrap = new THREE.Group();
      monWrap.add(monster);
      var p0 = imgToWorld(RIFT_X, RIFT_Y + 0.30);
      monWrap.position.set(p0.x, p0.y, 0);
      scene.add(monWrap);
      startAt = performance.now();
    }, undefined, function () {
      fail('Модель монстра не загрузилась. Проверьте связь и обновите страницу.');
    });
  }

  function easeOut(k) { return 1 - Math.pow(1 - k, 3); }

  function animate() {
    requestAnimationFrame(animate);
    var dt = Math.min(0.05, clock.getDelta());
    var t = (performance.now() - startAt) / 1000;

    if (monWrap) {
      var base = imgToWorld(RIFT_X, RIFT_Y + 0.30);
      var emerge = imgToWorld(RIFT_X, RIFT_Y - 0.06);
      var x = base.x, y = base.y, sc = 1, rot = 0;
      if (t < 0.7) {
        y = base.y - SY * 0.30; rot = 0.35;
      } else if (t < 3.9) {
        var k = (t - 0.7) / 3.2, e = easeOut(k);
        y = base.y - SY * 0.30 + (emerge.y - (base.y - SY * 0.30)) * e;
        sc = 1 + 0.10 * e;
        rot = 0.35 - 0.35 * e + Math.sin(k * 16) * 0.03;
      } else if (t < 7.4) {
        var k2 = (t - 3.9) / 3.5;
        y = emerge.y + SY * 0.045 * k2;
        sc = 1.10 + 0.12 * k2;
        rot = Math.sin(k2 * 5.0) * 0.06;
      } else {
        y = emerge.y + SY * 0.045 + Math.sin(t * 1.2) * SY * 0.004;
        sc = 1.22;
        rot = Math.sin(t * 0.7) * 0.05;
      }
      monWrap.position.x = x;
      monWrap.position.y = y;
      monWrap.scale.setScalar(sc);
      monWrap.rotation.y = rot;
    }

    if (embers) {
      var a = embers.geometry.attributes.position;
      var top = imgToWorld(RIFT_X, RIFT_Y - 0.22).y;
      for (var i = 0; i < a.count; i++) {
        var yy = a.getY(i) + emberV[i] * dt;
        if (yy > top) {
          var nb = imgToWorld(rnd(RIFT_X - 0.16, RIFT_X + 0.16), rnd(RIFT_Y + 0.10, RIFT_Y + 0.26));
          a.setX(i, nb.x); yy = nb.y;
        }
        a.setY(i, yy);
      }
      a.needsUpdate = true;
    }

    if (glowSprite) {
      var p = 1 + Math.sin(t * 2.1) * 0.06;
      glowSprite.scale.set(SY * 0.55 * p, SY * 0.45 * p, 1);
      glowSprite.material.opacity = 0.75 + Math.sin(t * 3.3) * 0.12;
    }

    renderer.render(scene, camera);
  }

  try {
    if (!window.THREE) { fail('Библиотека 3D не загрузилась.'); }
    else if (!canvas.getContext('webgl') && !canvas.getContext('experimental-webgl')) { fail('Этот браузер не поддерживает 3D.'); }
    else { init(); }
  } catch (e) {
    fail('Не удалось запустить 3D: ' + (e && e.message ? e.message : e));
  }
})();
