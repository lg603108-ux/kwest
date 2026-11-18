/* task07.js — задание 7 «Прорыв к лаборатории», экран Бегуна (модуль общего квеста).
   Версия 0319c. Подключается как window.Task07: mount(container) / unmount().
   Отдельная страница task07demo.html монтирует этот же модуль для быстрой проверки.

   Новая архитектура (после отказа от 0317a): НЕ одна лента дороги, а отдельные участки.
   Каждый участок строит свою геометрию в своём месте; маршрут бегуна — прямая внутри участка.
     1) улица 1 (z 6..-120) — дома из фотографий, мокрый асфальт, деревья, фонари, обломки;
     2) провал (z -128) — дыра в асфальте: рваные плиты, арматура, стенки вниз, свечение и дым;
     3) тоннель (y -9.4) — отдельная комната: серый кирпич, трубы, лампы, лужи, лестница и люк;
     4) улица 2 (z -140/-212..-300) — продолжение улицы после провала или после люка.
   Провал: перепрыгнул — бегу дальше; не перепрыгнул — падаю вниз, бегу по тоннелю,
   выхожу наверх ТОЛЬКО по кнопке «Прыгнуть».
   Кнопки и свайпы работают в любой момент, оценка — по нажатию, а не по положению камеры. */
window.Task07=(function(){
'use strict';

var VER='0326j';
var ROOT=null, booted=false, alive=false, rafId=0, listenersBound=false;
var note=null, canvas=null, el={}, playBtn=null, againBtn=null, topBtn=null;
var onFinishCb=null;            // сообщает общему модулю итог маршрута
// режим работы модуля: 'runner' — экран Бегуна, 'observer' — экран наблюдателя (вид сверху и подсказки)
var MODE='runner', STAGE='intro', OBSERVE=false, ROLE='runner', PROG=0, PROG_T=0, ISCAP=false;
var ONHINT=null, ONPROG=null, ONSTART=null, obsT=0, lastProgAt=-9;
var introV=null, introDone=false;
var STARTED=false;              // бегун нажал «Начать бег» после инструкции
// вид наблюдателя: бегун и препятствия, обозначенные в объёме
var OBS_RUNNER_GRP=null, OBS_PULSE=[], OBS_MARKS=[], OBS_ICON_TEX={};
// сцена: рождение провала, падающие обломки, фигура Бегуна для наблюдателя
var ASPHALT_TEX=null, PIT_COVER=null, PIT_EDGE=null, PIT_BORN=false, pitFx=null, pitPlates=[];
var RAIN=[], RAIN_DUST=[], RAIN_ON=true, FOCUS_Z=Z_START;
var OBS_HUMAN=null;
var OBS_Z_TARGET=null, OBS_ZS=null, OBS_Z_AT=-99, OBS_PHASE='';   // живая точка Бегуна, приходит от него самого

// «под землёй или наверху» решается по ЭТАПУ, который прислал Бегун, а не по одной координате:
// улица проходит над тоннелем, поэтому после прыжка через провал его координата попадает
// в тоннельный промежуток, хотя он остаётся наверху (было: наблюдатель вёл его в тоннеле).
function obsUnder(z){
  var ph=String(OBS_PHASE||'').toLowerCase();
  if(OBS_Z_TARGET!==null && ph) return (ph==='tunnel'||ph==='ladder');
  return (z<TUN.z0-1 && z>TUN.z1+1);          // этап ещё не приходил — по координате
}
// 3D-модели, сделанные по картинкам автора (fal.ai / Meshy): бегун для наблюдателя и капсула в руках
var MODELS={runner:null,capsule:null}, MODELS_LOADED=false, RUNNER_MIXER=null;
var CAPSULE3D=null, CAPSULE_MATS=null, CAPSULE_DMG=-1, CAP_OK=false, RUNNER_HIPS=null, RUNNER_HIPS_BASE=null;
// капсула в руках рисуется отдельной сценой с узким объективом (30°): широкий объектив улицы
// раздувает предмет вблизи и делает его форму «не той», как на превью
var CAPSCENE=null, CAPCAM=null, CAPDIST=3.2, CAPEMIS=null, CAPBASEY=0, CAPSIZE=null;
// руки бегуна остаются в позе «держит капсулу» — анимация бега их не машет
var RUNNER_ARMS=[];
// отрезок Б: поворот с боковой улицы, мост по референсу, спуск к тоннелю
var SEG='A', ROUND=0, CHANGED=false, VOICE=null;
var RB={curve:null,len:0,built:false};
var B_SPEED=7.2, bT=0, bLane=0, bLaneT=0, bJump=0, bDuck=0;
var bEvents=[], bCrystals=[], bHuman=null;

// Разметка экрана Бегуна — модуль вставляет её сам, чтобы работать внутри общей страницы.
var T7_HTML='<div id="t7-stage">'+
'<canvas id="t7-canvas"></canvas>'+
'<div id="t7-hud">'+
'<div class="t7-pill"><small>Путь</small><b id="t7-progress">0%</b></div>'+
'<div class="t7-pill"><small>Время</small><b id="t7-time">30</b></div>'+
'<div class="t7-pill"><small>Энергия</small><b id="t7-energy">100%</b></div>'+
'<div class="t7-pill"><small>Корпус</small><b id="t7-integrity">100%</b></div>'+
'<div class="t7-pill t7-zone"><small>Участок</small><b id="t7-zone">Улица</b></div>'+
'</div>'+
'<div id="t7-alert" class="t7-alert"></div>'+
'<div id="t7-damage"><div class="t7-dmg-title">Капсула повреждена</div><div class="t7-dmg-val">15%</div></div>'+
'<button id="t7-topview" type="button">Вид сверху</button>'+
'<div id="t7-controls">'+
'<div class="t7-pad">'+
'<button type="button" class="t7-btn" data-act="left"><span class="t7-ico">◀</span>Влево</button>'+
'<button type="button" class="t7-btn" data-act="jump"><span class="t7-ico">▲</span>Прыгнуть</button>'+
'</div>'+
'<div class="t7-pad">'+
'<button type="button" class="t7-btn" data-act="right"><span class="t7-ico">▶</span>Вправо</button>'+
'<button type="button" class="t7-btn" data-act="duck"><span class="t7-ico">▼</span>Пригнуться</button>'+
'</div>'+
'</div>'+
'<div id="t7-rotate"><div>Поверните телефон горизонтально</div></div>'+
'<div id="t7-dark"></div>'+
'<div id="t7-flash"></div>'+
'<div id="t7-start" class="t7-screen">'+
'<div class="t7-card">'+
'<h1 id="t7-start-title">Ты Бегун</h1>'+
'<p id="t7-start-text">В руках капсула. Беги вперёд: перепрыгни провал, пригнись под балкой, уйди в сторону от обломков и собирай кристаллы. Наблюдатели подскажут, что впереди.</p>'+
'<p class="t7-hint">Управление: кнопки внизу или свайпы по экрану. Свайп вверх — прыжок, вниз — пригнуться, влево или вправо — уйти в сторону.</p>'+
'<button type="button" id="t7-play" class="t7-primary">Начать бег</button>'+
'<button type="button" id="t7-full" class="t7-second">Во весь экран</button>'+
'<p class="t7-note" id="t7-loadnote">Загрузка улицы…</p>'+
'</div>'+
'</div>'+
'<div id="t7-intro" class="hidden">'+
'<video id="t7-intro-video" playsinline preload="auto" controlslist="nodownload" disablepictureinpicture src="assets/v07_intro.mp4"></video>'+
'<button type="button" id="t7-intro-next" class="t7-primary hidden">Продолжить →</button>'+
'</div>'+
'<div id="t7-obs" class="hidden">'+
'<div class="t7-obs-top">'+
'<span class="t7-obs-role">НАБЛЮДАТЕЛЬ</span>'+
'<span id="t7-obs-runner">Бегун: —</span>'+
'<span class="t7-obs-remind">Подсказывайте голосом: что впереди и что делать</span>'+
'</div>'+
'<div id="t7-obs-hint" class="hidden"></div>'+
'<div class="t7-obs-bottom"><span id="t7-obs-progress">Путь: 0%</span></div>'+
'</div>'+
'<div id="t7-change" class="t7-screen hidden">'+
'<div class="t7-card">'+
'<h1 class="t7-change-title">СМЕНА БЕГУНА</h1>'+
'<p id="t7-change-name"></p>'+
'<p class="t7-hint" id="t7-change-note">Готовься: сейчас побежишь ты.</p>'+
'<button type="button" id="t7-change-go" class="t7-primary">Ты — бегун</button>'+
'</div>'+
'</div>'+
'<div id="t7-end" class="t7-screen hidden">'+
'<div class="t7-card">'+
'<h1 id="t7-end-title">Участок пройден</h1>'+
'<p id="t7-end-text"></p>'+
'<button type="button" id="t7-again" class="t7-primary">Пройти ещё раз</button>'+
'</div>'+
'</div>'+
'</div>';

if(typeof window==='undefined'||!window.document){ /* вне браузера модуль не нужен */ }

// ——— параметры мира, метры ———
var DURATION=60;                 // длительность пробного хода
var EYE=1.72;                    // высота глаз бегуна
var ROAD_W=13;                   // ширина дороги
var WALK=4.0;                    // ширина тротуара
var LANE_X=2.6;                  // насколько уходим в сторону при манёвре (кристалл стоит на 2.35)
var RUN_SPEED=6.6;               // скорость бега по улице, м/с
var RUN_SPEED_B=9.4;             // на отрезке Б быстрее: поворот, мост и тоннель укладываются в те же 60 секунд
var TUN_SPEED=7.4;               // скорость в тоннеле
var JUMP_D=0.85, DUCK_D=0.7;
var TRIP_D=1.35, FALL_D=1.7, LADDER_D=2.2;
var Z_START=6, Z_END=-300;
var PIT={z:-128, rx:6.6, rz:7.8, depth:8.6};
var Z_PIT_EDGE=PIT.z+PIT.rz;     // -120.2 — ближний край дыры
var Z_PIT_FAR=PIT.z-PIT.rz;      // -135.8 — дальний край
var TUN={y:-8.5, z0:-130, z1:-212, w:4.4, h:3.2};
var MANHOLE_Z=TUN.z1+1.3;            // люк на улице над концом тоннеля
var Z_STREET2_JUMP=Z_PIT_FAR-4;  // где оказываемся после прыжка через провал

// ——— ассеты ———
var A={
  street:'assets/task07/ref_street.jpg', aerial:'assets/task07/ref_aerial.jpg',
  wall:'assets/task07/tex_wall.jpg', pit:'assets/task07/tex_pit.jpg',
  concrete:'assets/task07/concrete.png', capsule:'assets/task07/capsule_hands.png',
  capsuleDamaged:'assets/task07/capsule_hands_damaged.png',
  capsuleCritical:'assets/task07/capsule_hands_critical.png',
  capsuleAlt:'assets/task07/capsule.png', crystal:'assets/task07/crystal.png',
  // для стен годятся только близкие фото фасадов: широкие снимки города
  // при повторении давали «плиты» с целыми домами и небом (замечание автора 16.11.2026)
  facades:['assets/task07/facade1.jpg','assets/task07/facade2.jpg',
           'assets/task07/facade3.jpg']
};
var TEX={};

// ——— звук ———
// Правило: один звук = одно событие. Никакие два события не играют один и тот же файл.
//   hit    — удар обломка / повреждение капсулы / падение в провал — звук удара камня о стекло;
//   dodge  — успешный уход от обломка или прыжок через провал — короткий свист воздуха;
//   charge — сбор кристалла (капсула восстанавливается) — нарастающая зарядка;
//   crit   — критическое повреждение, один раз за проход;
//   amb    — фон улицы, music — музыка этапа.
var SFX={};
function loadSounds(){
  try{
    SFX.hit=new Audio('assets/task07/hit.mp3');      // удар камня о стекло (прежний звук квеста)
    SFX.hit.volume=0.90;
    SFX.dodge=new Audio('assets/task07/sfx_swoosh.mp3');
    SFX.dodge.volume=0.50;
    SFX.charge=new Audio('assets/sfx_capsule_charge.mp3');
    SFX.charge.volume=0.75;
    SFX.crit=new Audio('assets/task07/sfx_capsule_critical.mp3');
    SFX.crit.volume=1.0;
    SFX.amb=new Audio('assets/task07/ambience.mp3');
    SFX.amb.loop=true; SFX.amb.volume=0.55;
    SFX.music=new Audio('assets/music_defense_loop.mp3');
    SFX.music.loop=true; SFX.music.volume=0.30;
    SFX.change=new Audio('assets/v07_runner_change.mp3');   // голос «смена бегуна»
    SFX.change.volume=1.0;
  }catch(e){ SFX={}; }
}
function playSfx(k){
  var s=SFX[k]; if(!s)return;
  try{ s.currentTime=0; var p=s.play(); if(p&&p.catch)p.catch(function(){}); }catch(e){}
}

// ——— сцена ———
var renderer,scene,camera,clock;
var capsGroup=null, capPlane=null, torch=null, capGlow=null, capFlash=0;
var CAP_FLASH=0.55;              // длительность бирюзовой вспышки капсулы при сборе кристалла

// ——— состояние бегуна ———
var phase='street1';   // street1 | trip | fall | tunnel | ladder | street2 | done
var phaseT=0, sZ=Z_START, tRun=0, travelled=0;
var pathTotal=(Z_START-Z_STREET2_JUMP)+(Z_STREET2_JUMP-Z_END);
var lane=0, laneTarget=0, holdT=0, jumpT=0, duckT=0, shake=0;
var lastAct='', lastActAt=-9;
var running=false, finished=false, topView=false, topMix=0;
var integrity=100, energy=100, passed=0, failed=0;
var events=[], crystals=[], shards=[], frags=[], mists=[];
var tunnelBuilt=false, tunnelEventsDone=false, tunnelGroup=null, tunnelLamps=[], tunnelLightPool=[];
var exitHint=false, pitWarned=false;
var fovTarget=74;

// ——— hud ———
function fillDom(){
  note=document.getElementById('t7-loadnote');
  canvas=document.getElementById('t7-canvas');
  el={prog:document.getElementById('t7-progress'),time:document.getElementById('t7-time'),
    energy:document.getElementById('t7-energy'),integrity:document.getElementById('t7-integrity'),
    zone:document.getElementById('t7-zone'),alert:document.getElementById('t7-alert'),
    flash:document.getElementById('t7-flash'),dark:document.getElementById('t7-dark'),
    start:document.getElementById('t7-start'),end:document.getElementById('t7-end'),
    endTitle:document.getElementById('t7-end-title'),endText:document.getElementById('t7-end-text')};
}

// ——— мелкие помощники ———
function rnd(seed){ var s=seed%2147483647; if(s<=0)s+=2147483646;
  return function(){ s=s*16807%2147483647; return (s-1)/2147483646; }; }
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function lerp(a,b,k){ return a+(b-a)*k; }
function easeOut(k){ return 1-Math.pow(1-k,2.2); }

function canvasTexture(size,draw){
  var c=document.createElement('canvas'); c.width=size; c.height=size;
  draw(c.getContext('2d'),size);
  var t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.anisotropy=8;
  return t;
}
function glowTexture(){
  var c=document.createElement('canvas'); c.width=c.height=128;
  var g=c.getContext('2d');
  var gr=g.createRadialGradient(64,64,2,64,64,62);
  gr.addColorStop(0,'rgba(180,255,250,0.95)');
  gr.addColorStop(0.4,'rgba(80,235,225,0.42)');
  gr.addColorStop(1,'rgba(40,200,195,0)');
  g.fillStyle=gr; g.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(c);
}
function mistTexture(){
  var c=document.createElement('canvas'); c.width=c.height=128;
  var g=c.getContext('2d');
  var gr=g.createRadialGradient(64,64,4,64,64,60);
  gr.addColorStop(0,'rgba(190,225,228,0.30)');
  gr.addColorStop(0.55,'rgba(160,200,205,0.13)');
  gr.addColorStop(1,'rgba(150,190,195,0)');
  g.fillStyle=gr; g.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(c);
}
var GLOW=null, MIST=null;

// мокрый асфальт: серо-синий с трещинами, часть трещин светится бирюзой
function asphaltTexture(){
  return canvasTexture(512,function(g,S){
    var r=rnd(90211);
    g.fillStyle='#4b565d'; g.fillRect(0,0,S,S);
    for(var i=0;i<11000;i++){
      var v=44+r()*52;
      g.fillStyle='rgba('+Math.round(v)+','+Math.round(v+6)+','+Math.round(v+9)+','+(0.1+r()*0.32)+')';
      g.fillRect(r()*S,r()*S,1+r()*3,1+r()*3);
    }
    function crack(x,y,len,ang,glow){
      g.beginPath(); g.moveTo(x,y);
      for(var k=0;k<len;k++){ x+=Math.cos(ang)*7+r()*9-4.5; y+=Math.sin(ang)*7+r()*9-4.5; ang+=(r()-0.5)*0.9; g.lineTo(x,y); }
      g.strokeStyle='rgba(18,24,28,0.8)'; g.lineWidth=6+r()*6; g.stroke();
      if(glow){ g.strokeStyle='rgba(88,245,235,0.34)'; g.lineWidth=1.6+r()*1.4; g.shadowColor='#38e8de'; g.shadowBlur=6; g.stroke(); g.shadowBlur=0; }
    }
    for(var c=0;c<7;c++) crack(r()*S,r()*S,6+r()*9,r()*6.28,r()<0.35);
    for(var h=0;h<44;h++){
      var vv=32+r()*50;
      g.fillStyle='rgba('+Math.round(vv)+','+Math.round(vv+4)+','+Math.round(vv+7)+','+(0.28+r()*0.36)+')';
      g.beginPath(); g.ellipse(r()*S,r()*S,2+r()*7,1.5+r()*4,r()*3.14,0,6.29); g.fill();
    }
    // мокрые блики
    for(var w=0;w<18;w++){
      g.fillStyle='rgba(150,200,205,'+(0.03+r()*0.05)+')';
      g.fillRect(r()*S,r()*S,10+r()*40,2+r()*4);
    }
    g.fillStyle='rgba(226,236,238,0.5)';
    g.fillRect(S*0.085,0,S*0.013,S);
    g.fillRect(S*0.902,0,S*0.013,S);
    g.fillStyle='rgba(214,226,228,0.34)';
    for(var y=0;y<S;y+=96){ g.fillRect(S*0.493,y,S*0.013,46); }
    var grd=g.createLinearGradient(0,0,S,0);
    grd.addColorStop(0,'rgba(0,0,0,0.24)'); grd.addColorStop(0.15,'rgba(0,0,0,0)');
    grd.addColorStop(0.85,'rgba(0,0,0,0)'); grd.addColorStop(1,'rgba(0,0,0,0.24)');
    g.fillStyle=grd; g.fillRect(0,0,S,S);
  });
}
// фасад дома: тёмная бетонная плита, сетка небольших окон, редкие светящиеся

function facadeTexture(seed,litChance){
  return canvasTexture(512,function(g,S){
    var r=rnd(seed);
    g.fillStyle='#707a7f'; g.fillRect(0,0,S,S);
    for(var i=0;i<6000;i++){ var v=88+r()*46;
      g.fillStyle='rgba('+Math.round(v)+','+Math.round(v+5)+','+Math.round(v+8)+','+(0.10+r()*0.22)+')';
      g.fillRect(r()*S,r()*S,2+r()*4,2+r()*4); }
    // вертикальные простенки
    var cols=5, rows=7;
    var cw=S/cols, ch=S/rows;
    for(var c=0;c<cols;c++){
      g.fillStyle='rgba(76,86,92,'+(0.35+r()*0.2)+')';
      g.fillRect(c*cw,0,3,S);
    }
    // окна: ровная сетка, рама светлее, стекло тёмное
    for(var cx=0;cx<cols;cx++){
      for(var cy=0;cy<rows;cy++){
        var ww=cw*0.46, wh=ch*0.52;
        var wx=cx*cw+(cw-ww)/2, wy=cy*ch+ch*0.22;
        // подоконник
        g.fillStyle='rgba(186,198,203,0.75)';
        g.fillRect(wx-4,wy+wh+2,ww+8,4);
        var lit=r()<litChance;
        g.fillStyle=lit?'rgba(146,246,238,0.92)':'rgba(22,29,34,0.96)';
        g.fillRect(wx,wy,ww,wh);
        if(lit){ g.shadowColor='#59e8de'; g.shadowBlur=12; g.fillRect(wx,wy,ww,wh); g.shadowBlur=0; }
        // рама
        g.strokeStyle=lit?'rgba(210,255,252,0.85)':'rgba(178,192,198,0.85)';
        g.lineWidth=3.2; g.strokeRect(wx,wy,ww,wh);
        // переплёт
        g.lineWidth=1.6; g.strokeStyle=lit?'rgba(150,230,225,0.35)':'rgba(70,80,86,0.55)';
        g.beginPath(); g.moveTo(wx+ww/2,wy); g.lineTo(wx+ww/2,wy+wh); g.stroke();
      }
      // межэтажная полоса
    }
    for(var fy=1;fy<rows;fy++){
      g.fillStyle='rgba(96,106,112,0.55)'; g.fillRect(0,fy*ch-3,S,5);
    }
    // грязь внизу фасада
    var grd=g.createLinearGradient(0,S*0.6,0,S);
    grd.addColorStop(0,'rgba(14,20,23,0)'); grd.addColorStop(1,'rgba(14,20,23,0.55)');
    g.fillStyle=grd; g.fillRect(0,S*0.6,S,S*0.4);
  });
}

// тротуар: серые плиты
function walkTexture(){
  return canvasTexture(256,function(g,S){
    var r=rnd(4421);
    g.fillStyle='#525c60'; g.fillRect(0,0,S,S);
    for(var i=0;i<2600;i++){ var v=60+r()*40;
      g.fillStyle='rgba('+Math.round(v)+','+Math.round(v+4)+','+Math.round(v+6)+','+(0.15+r()*0.3)+')';
      g.fillRect(r()*S,r()*S,2,2); }
    g.strokeStyle='rgba(28,34,38,0.6)'; g.lineWidth=2;
    for(var y=0;y<=S;y+=64){ g.beginPath(); g.moveTo(0,y); g.lineTo(S,y); g.stroke(); }
    for(var x=0;x<=S;x+=64){ g.beginPath(); g.moveTo(x,0); g.lineTo(x,S); g.stroke(); }
  });
}

// ——— загрузка картинок ———
function loadAll(cb){
  var loader=new THREE.TextureLoader(), left=0;
  function add(key,url){
    left++;
    loader.load(url,function(t){ t.anisotropy=8; TEX[key]=t; if(--left===0) cb(); },
                undefined,function(){ if(--left===0) cb(); });
  }
  add('wall',A.wall); add('pit',A.pit);
  add('concrete',A.concrete); add('capsule',A.capsule); add('crystal',A.crystal);
  add('capsuleDamaged',A.capsuleDamaged); add('capsuleCritical',A.capsuleCritical);
  for(var i=0;i<A.facades.length;i++) add('facade'+i,A.facades[i]);
  if(left===0) cb();
}

// ——— построение мира ———
function build(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x46545c);
  scene.fog=new THREE.FogExp2(0x3b4a52,0.017);
  ROUTE_BUILT=false;   // сцена новая — отрезок Б строится заново

  camera=new THREE.PerspectiveCamera(74,window.innerWidth/Math.max(1,window.innerHeight),0.08,600);
  scene.add(camera);
  // фонарик бегуна: подсвечивает стенки, пока падаем в провал
  torch=new THREE.PointLight(0xcfeef6,0,14);
  torch.position.set(0,0,-1.2);
  camera.add(torch);

  scene.add(new THREE.HemisphereLight(0x8fa8b4,0x121a1e,0.62));
  scene.add(new THREE.AmbientLight(0x33454e,0.30));
  var dir=new THREE.DirectionalLight(0xa8c6d2,0.30); dir.position.set(-40,90,-40); scene.add(dir);

  GLOW=glowTexture(); MIST=mistTexture();

  // сцена создаётся заново — всё, что строилось в прежней сцене, должно быть построено снова.
  // Иначе после смены роли или очереди тоннель и препятствия остаются в старой (удалённой) сцене:
  // наблюдатель видел тоннель, а бегун падал в пустоту.
  tunnelBuilt=false; tunnelEventsDone=false; tunnelGroup=null; tunnelLamps=[]; tunnelLightPool=[];
  events.length=0; crystals.length=0; bEvents.length=0; bCrystals.length=0;
  pitFx=null; pitPlates.length=0; shards.length=0; frags.length=0;
    PIT_BORN=false; PIT_COVER=null; PIT_EDGE=null;
    ROUTE_BUILT=false;

    buildStreet();
    buildPit();
    buildRouteB();
    placeCapsule();
  loadModels();
}

// ——— загрузка 3D-моделей (бегун и капсула), сделанных по картинкам автора ———
function loadModels(){
  if(MODELS_LOADED) { applyModels(); return; }
  if(!THREE.GLTFLoader){
    if(typeof console!=='undefined') console.warn('GLTFLoader не подключён — остаются прежние фигуры');
    return;
  }
  var loader=new THREE.GLTFLoader(), left=2;
  function done(){ if(--left===0){ MODELS_LOADED=true; applyModels(); } }
  loader.load('assets/task07/runner_running.glb', function(gltf){
    MODELS.runner=gltf; done();
  }, undefined, function(){ done(); });
  loader.load('assets/task07/capsule_hands.glb', function(gltf){
    MODELS.capsule=gltf; done();
  }, undefined, function(){ done(); });
}

function applyModels(){
  if(!scene) return;
  if(MODELS.runner && OBS_HUMAN) rebuildObserverHuman();
  if(MODELS.capsule && capPlane && !capPlane.userData.model3d) buildCapsuleModel();
}

// ——— режимы: инструкция, экран наблюдателя, подсказки ———
function shadow(id){ return document.getElementById(id); }
// Инструкция: только видео во весь экран, без надписей.
// У Бегуна в конце видео появляется «Продолжить →», дальше — экран «Ты Бегун» и кнопка «Начать бег».
function showIntro(){
  var box=shadow('t7-intro'); if(!box) return;
  box.classList.remove('hidden');
  if(el.start) el.start.classList.add('hidden');
  var next=shadow('t7-intro-next');
  if(!introV) introV=box.querySelector('#t7-intro-video');
  if(next){
    next.classList.add('hidden');        // «Продолжить» появляется в конце видео и только у Бегуна
    next.disabled=false;
    next.onclick=function(){
      if(MODE!=='runner') return;
      next.disabled=true; next.classList.add('hidden');
      stopIntroVideo(); hideIntro();
      STARTED=false;
      if(el.start) el.start.classList.remove('hidden');   // короткий экран «Ты Бегун» с кнопкой «Начать бег»
    };
  }
  if(introV){
    introV.muted=!ISCAP;                 // звук инструкции только у капитана
    try{ introV.currentTime=0; }catch(e){}
    introV.onended=function(){
      if(MODE==='runner'&&next){ next.classList.remove('hidden'); }
    };
    var p=introV.play();
    if(p&&p['catch']) p['catch'](function(){
      introV.muted=true;                 // без разрешения звука показываем инструкцию молча, без надписей
      var p2=introV.play(); if(p2&&p2['catch'])p2['catch'](function(){});
    });
  }
}
function stopIntroVideo(){
  if(introV){ try{ introV.pause(); }catch(e){} }
}
function hideIntro(){
  stopIntroVideo();
  var box=shadow('t7-intro'); if(box) box.classList.add('hidden');
}
function applyStage(){
  if(STAGE==='intro'){ showIntro(); return; }
  hideIntro();
  var ch=document.getElementById('t7-change');
  if(STAGE==='change'){ if(ch) ch.classList.remove('hidden'); showChange(); return; }
  if(ch) ch.classList.add('hidden');
  CHANGED=false;
  if(OBSERVE){ showObserver(); return; }
  if(!STARTED){ if(el.start) el.start.classList.remove('hidden'); return; }
  if(el.start) el.start.classList.add('hidden');
}
// Смена бегуна: крупная надпись, голос из папки автора, кнопка «Ты — бегун» у нового бегуна
function showChange(){
  var box=document.getElementById('t7-change'); if(!box) return;
  box.classList.remove('hidden');
  if(el.start) el.start.classList.add('hidden');
  if(el.end) el.end.classList.add('hidden');
  var nm=document.getElementById('t7-change-name');
  if(nm) nm.textContent=OBS_RUNNER_NAME?('Новый бегун: '+OBS_RUNNER_NAME):'';
  var go=document.getElementById('t7-change-go');
  var note=document.getElementById('t7-change-note');
  if(go){
    go.onclick=null;
    if(MODE==='runner'){
      go.classList.remove('hidden'); go.disabled=false;
      if(note) note.textContent='Нажми, когда будешь готов бежать.';
      go.onclick=function(){
        if(go.disabled) return;
        go.disabled=true;
        if(ONSTART){ try{ ONSTART(); }catch(e){} }
        STAGE='run'; CHANGED=false; STARTED=true;
        applyStage();
        start();
      };
    }else{
      go.classList.add('hidden');
      if(note) note.textContent='Ждём, когда '+(OBS_RUNNER_NAME||'новый бегун')+' нажмёт «Ты — бегун».';
    }
  }
  playChangeVoice();
}
function playChangeVoice(){
  if(CHANGED) return;
  CHANGED=true;
  try{
    if(!SFX.change) loadSounds();
    if(!SFX.change) return;
    SFX.change.currentTime=0;
    var p=SFX.change.play(); if(p&&p['catch']) p['catch'](function(){});
  }catch(e){}
}
function showObserver(){
  var ov=shadow('t7-obs'); if(!ov) return;
  ov.classList.remove('hidden');
  var rn=shadow('t7-obs-runner'), pr=shadow('t7-obs-progress');
  if(rn) rn.textContent='Бегун: '+(OBS_RUNNER_NAME||'—');
  if(pr) pr.textContent='Путь: '+Math.round(PROG)+'%';
}
var OBS_RUNNER_NAME='';
function hideRunnerUI(){
  ['t7-hud','t7-controls','t7-topview','t7-start','t7-end'].forEach(function(id){
    var n=document.getElementById(id); if(n) n.classList.add('hidden');
  });
  if(capPlane) capPlane.visible=false;
}
// Внешние вызовы от общего модуля
function setStage(s){
  if(!s||s===STAGE) return;
  STAGE=s; applyStage();
}
function setHint(h){
  if(!h||!h.text) return;
  var t=String(h.text);
  // Точка Бегуна: «POS|участок|координата». Раньше отправляли вид 'pos',
  // но правила базы разрешают у подсказки только 'hazard' и 'crystal' — запись отклонялась,
  // и наблюдатель точки не получал вовсе (отсюда «бежит по улице» / «бежит в тоннеле»).
  if(h.kind==='pos' || /^pos\|/i.test(t)){
    var parts=t.split('|');
    if(/^pos$/i.test(String(parts[0]||'').trim())) parts.shift();
    var v=parseFloat(parts[parts.length-1]);
    if(isFinite(v)){ OBS_Z_TARGET=v; OBS_Z_AT=obsT; }
    if(parts.length>1) OBS_PHASE=String(parts[0]||'').toLowerCase();
    return;
  }
  // плашку сверху убрали по просьбе автора: она закрывала препятствия,
  // всё нужное теперь написано рядом с самими препятствиями
  return;
}
function setProgress(p){
  PROG_T=Math.max(0,Math.min(100,p||0));
  var pr=shadow('t7-obs-progress');
  if(pr) pr.textContent='Путь: '+Math.round(PROG_T)+'%';
  if(OBSERVE&&PROG_T>=99){
    var box=shadow('t7-obs-hint');
    if(box){ box.textContent='МАРШРУТ ПРОЙДЕН'; box.classList.remove('hidden'); }
  }
}
function setRunnerName(n){ OBS_RUNNER_NAME=n||''; var rn=shadow('t7-obs-runner'); if(rn) rn.textContent='Бегун: '+(OBS_RUNNER_NAME||'—');
  // на экране смены имя обновляем следом: очередь двигается через полсекунды после итога
  if(STAGE==='change'){ var nm=document.getElementById('t7-change-name');
    if(nm) nm.textContent=OBS_RUNNER_NAME?('Новый бегун: '+OBS_RUNNER_NAME):''; } }

// Бегун сообщает общему модулю подсказку и процент пути (координаты не передаются)
function emitHint(text,kind){
  if(OBSERVE||!ONHINT) return;
  try{ ONHINT({text:String(text||'').toUpperCase(),kind:kind||'hazard'}); }catch(e){}
}

// ——— улица: дорога, тротуары, дома, деревья, фонари, дальний план ———
// ——— переиспользуемые строители улицы (фасады и дома) ———
// Вынесены из buildStreet, чтобы новый отрезок (поворот → мост → тоннель)
// строил ТЕ ЖЕ дома и фасады вызовом, а не вторым набором своих генераторов.
var STREET_FACE_CACHE={}, STREET_TILE_W=5.6;
var STREET_FALLBACK=new THREE.MeshLambertMaterial({color:0x424c51});
function streetFaceMat(tex,key,wLen,hLen){
  var k=key+'_'+wLen.toFixed(1)+'_'+hLen.toFixed(1);
  if(STREET_FACE_CACHE[k]) return STREET_FACE_CACHE[k];
  var t=tex.clone(); t.needsUpdate=true;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  var img=t.image||{width:1,height:1};
  var tileH=STREET_TILE_W*(img.height/Math.max(1,img.width));
  t.repeat.set(Math.max(1,wLen/STREET_TILE_W),Math.max(1,hLen/tileH));
  t.anisotropy=8;
  var m=new THREE.MeshLambertMaterial({map:t,color:0xa8b1b4});
  STREET_FACE_CACHE[k]=m;
  return m;
}
function streetAddBuilding(x,z,h,dep,w,tex,key,baseY,yaw){
  var geo=new THREE.BoxGeometry(dep,h,w);
  var mTop=new THREE.MeshLambertMaterial({color:0x3a444a});
  var mX=STREET_FALLBACK, mZ=STREET_FALLBACK;
  if(tex&&key){
    mX=streetFaceMat(tex,key+'_x',w,h);
    mZ=streetFaceMat(tex,key+'_z',dep,h);
  }
  var b=new THREE.Mesh(geo,[mX,mX,mTop,mTop,mZ,mZ]);
  b.position.set(x,(baseY||0)+h/2,z);
  if(yaw) b.rotation.y=yaw;
  scene.add(b);
  return b;
}

function buildStreet(){
  var asphalt=asphaltTexture(); ASPHALT_TEX=asphalt;
  var walk=walkTexture();
  var concreteMap=TEX.concrete;

  function roadPiece(z0,z1,tex){
    var len=Math.abs(z0-z1), cz=(z0+z1)/2;
    var map=tex.clone(); map.needsUpdate=true;
    map.wrapS=map.wrapT=THREE.RepeatWrapping; map.repeat.set(2.2,len/9);
    var mat=new THREE.MeshPhongMaterial({map:map,color:0x77838a,shininess:55,specular:0x5f7c82});
    var m=new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W,len),mat);
    m.rotation.x=-Math.PI/2; m.position.set(0,0,cz);
    scene.add(m); return m;
  }
  // дорога с разрывом на провал и на люк; за стартом оставлены лишние 26 м —
  // они нужны только камере наблюдателя, чтобы за спиной Бегуна не было пустоты
  roadPiece(Z_START+26,Z_PIT_EDGE,asphalt);
  roadPiece(Z_PIT_FAR,-210.1,asphalt);
  roadPiece(-213.9,Z_END-4,asphalt);

  // тротуары и бордюр — сплошные, провал только в дороге
  var stEnd=Z_START+26;
  [-1,1].forEach(function(s){
    var wm=walk.clone(); wm.needsUpdate=true; wm.wrapS=wm.wrapT=THREE.RepeatWrapping;
    wm.repeat.set(3,Math.abs(stEnd-Z_END)/6);
    var wmat=new THREE.MeshPhongMaterial({map:wm,shininess:20,specular:0x6c8186});
    var wk=new THREE.Mesh(new THREE.BoxGeometry(WALK,0.22,Math.abs(stEnd-Z_END)),
      [wmat,wmat,wmat,wmat,wmat,wmat]);
    wk.position.set(s*(ROAD_W/2+WALK/2),0.11,(stEnd+Z_END)/2);
    scene.add(wk);
    var curb=new THREE.Mesh(new THREE.BoxGeometry(0.35,0.3,Math.abs(stEnd-Z_END)),
      new THREE.MeshLambertMaterial({color:0x76848a}));
    curb.position.set(s*(ROAD_W/2+0.17),0.15,(stEnd+Z_END)/2);
    scene.add(curb);
  });

  // дома: два ряда по обеим сторонам, сплошной застройкой
  var r=rnd(5551);
  var facades=[];
  for(var fi=0;fi<A.facades.length;fi++) if(TEX['facade'+fi]) facades.push(TEX['facade'+fi]);

  for(var z=-4; z>Z_END+8; z-=21){
    [-1,1].forEach(function(side){
      var dep=15+r()*6, h=18+r()*26, w=14+r()*5;
      var f1=Math.floor(r()*facades.length);
      streetAddBuilding(side*(ROAD_W/2+WALK+3.4+dep/2), z, h, dep, w, facades[f1], 'f'+f1);
      var dep2=14+r()*6, h2=26+r()*22, w2=14+r()*5;
      var f2=Math.floor(r()*facades.length);
      streetAddBuilding(side*(ROAD_W/2+WALK+3.4+dep+2.5+dep2/2), z-10, h2, dep2, w2, facades[f2], 'f'+f2);
    });
  }

  // мёртвые деревья вдоль тротуара
  function deadTree(x,z){
    var g=new THREE.Group();
    var bark=new THREE.MeshLambertMaterial({color:0x262c30});
    var trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.2,5.2,7),bark);
    trunk.position.y=2.6; g.add(trunk);
    var rb=rnd(Math.floor(Math.abs(z)*13)+7);
    for(var i=0;i<6;i++){
      var len=1.4+rb()*1.7;
      var br=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.07,len,5),bark);
      var a=rb()*6.28, tilt=0.5+rb()*0.7;
      br.position.set(Math.cos(a)*len*0.34,3.4+rb()*1.6,Math.sin(a)*len*0.34);
      br.rotation.z=Math.cos(a)*tilt; br.rotation.x=Math.sin(a)*tilt;
      g.add(br);
    }
    g.position.set(x,0.22,z);
    scene.add(g);
  }
  for(var tz=-8; tz>Z_END; tz-=19){
    deadTree(-(ROAD_W/2+WALK*0.55),tz);
    deadTree((ROAD_W/2+WALK*0.55),tz-9);
  }

  // фонари: тёмная стойка и холодная лампа со свечением
  for(var lz=-14; lz>Z_END; lz-=26){
    var side=lz%52===0?1:-1;
    var lg=new THREE.Group();
    var pole=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.11,6.2,7),
      new THREE.MeshLambertMaterial({color:0x3d464b}));
    pole.position.y=3.1; lg.add(pole);
    var arm=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.1,0.1),
      new THREE.MeshLambertMaterial({color:0x3d464b}));
    arm.position.set(-side*0.75,6.1,0); lg.add(arm);
    var lampBox=new THREE.Mesh(new THREE.BoxGeometry(0.62,0.14,0.28),
      new THREE.MeshBasicMaterial({color:0xd8fbf6}));
    lampBox.position.set(-side*1.45,6.0,0); lg.add(lampBox);
    var gl=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW,color:0xbdf6f0,
      transparent:true,opacity:0.55,depthWrite:false,blending:THREE.AdditiveBlending}));
    gl.scale.set(3.4,3.4,1); gl.position.copy(lampBox.position); lg.add(gl);
    lg.position.set(side*(ROAD_W/2+WALK*0.8),0,lz);
    scene.add(lg);
  }

  // обломки по краям дороги
  var rb2=rnd(7788);
  for(var k=0;k<26;k++){
    var size=0.4+rb2()*1.1;
    var mat=concreteMap?new THREE.MeshLambertMaterial({map:concreteMap,color:0x9fa8ab})
                       :new THREE.MeshLambertMaterial({color:0x6d7679});
    var ch=new THREE.Mesh(new THREE.BoxGeometry(size,size*0.6,size*0.85),mat);
    ch.position.set((rb2()-0.5)*ROAD_W*0.96,size*0.2,-10-rb2()*280);
    ch.rotation.set(rb2()*0.5,rb2()*3,rb2()*0.4);
    scene.add(ch);
  }

  // финишные ворота: светящаяся арка, чтобы маршрут не обрывался в пустоту
  var gateZ=Z_END+8;
  var gateMat=new THREE.MeshLambertMaterial({color:0x2c3c40});
  [-1,1].forEach(function(s){
    var pil=new THREE.Mesh(new THREE.BoxGeometry(1.3,7.5,1.3),gateMat);
    pil.position.set(s*(ROAD_W/2-1.4),3.75,gateZ); scene.add(pil);
  });
  var lintel=new THREE.Mesh(new THREE.BoxGeometry(ROAD_W-1.6,1.2,1.3),gateMat);
  lintel.position.set(0,7.6,gateZ); scene.add(lintel);
  for(var gi=0;gi<4;gi++){
    var gg=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW,color:0x7ff6ea,
      transparent:true,opacity:0.55,depthWrite:false,blending:THREE.AdditiveBlending}));
    gg.scale.set(7,7,1);
    gg.position.set(-ROAD_W/2+1.6+gi*(ROAD_W-3.2)/3,4.2,gateZ); scene.add(gg);
  }

  // дальний план: плотная дымка и силуэт домов вместо фотографии
}

// ——— провал ———

function buildPit(){
  var g=new THREE.Group(); g.position.set(0,0,PIT.z); scene.add(g);
  var r=rnd(3131);
  var rimMat=TEX.concrete?new THREE.MeshLambertMaterial({map:TEX.concrete,color:0x33393c})
                        :new THREE.MeshLambertMaterial({color:0x2a3033});
  var deepMap=TEX.concrete?TEX.concrete.clone():null;
  if(deepMap){ deepMap.needsUpdate=true; deepMap.wrapS=deepMap.wrapT=THREE.RepeatWrapping; deepMap.repeat.set(7,3); }
  var deepMat=new THREE.MeshLambertMaterial({map:deepMap,color:0x2f373b,side:THREE.BackSide});

  // рваный край дороги и трещины появляются только когда провал родится
  var edge=new THREE.Group(); g.add(edge); edge.visible=false; PIT_EDGE=edge;

  for(var i=0;i<26;i++){
    var a=i/26*Math.PI*2;
    var w=2.4+r()*1.7;
    var slab=new THREE.Mesh(new THREE.BoxGeometry(w,0.3,1.6+r()*0.9),rimMat);
    slab.position.set(Math.cos(a)*PIT.rx*(0.93+r()*0.05),-0.06,Math.sin(a)*PIT.rz*(0.93+r()*0.05));
    slab.rotation.set((r()-0.5)*0.18,a+(r()-0.5)*0.2,(r()-0.5)*0.14);
    edge.add(slab);
  }
  // светящиеся трещины от края
  for(var c=0;c<16;c++){
    var ca=r()*Math.PI*2;
    var cr=new THREE.Mesh(new THREE.PlaneGeometry(0.2+r()*0.14,2.2+r()*3.4),
      new THREE.MeshBasicMaterial({color:0x5ff2e6,transparent:true,opacity:0.5,
        blending:THREE.AdditiveBlending,depthWrite:false}));
    cr.rotation.x=-Math.PI/2; cr.rotation.z=ca;
    cr.position.set(Math.cos(ca)*(PIT.rx+1.4+r()*2.6),0.03,Math.sin(ca)*(PIT.rz+1.4+r()*2.6));
    edge.add(cr);
  }

  // «крышка»: пока провал не родился, дорога над ним целая
  if(ASPHALT_TEX){
    var cmap=ASPHALT_TEX.clone(); cmap.needsUpdate=true;
    cmap.wrapS=cmap.wrapT=THREE.RepeatWrapping; cmap.repeat.set(1.6,2.0);
    var coverMat=new THREE.MeshPhongMaterial({map:cmap,color:0x77838a,shininess:55,specular:0x5f7c82});
    PIT_COVER=new THREE.Mesh(new THREE.CircleGeometry(1,44),coverMat);
    PIT_COVER.rotation.x=-Math.PI/2;
    PIT_COVER.position.y=0.06;
    PIT_COVER.scale.set(PIT.rx*1.03,PIT.rz*1.03,1);
    g.add(PIT_COVER);
  }

  // свечение изнутри видно только после рождения провала

  // воронка: одна гладкая стенка сверху вниз, без ступеней-колец
  var funnel=new THREE.Mesh(new THREE.CylinderGeometry(PIT.rx*0.99, PIT.rx*0.46, PIT.depth, 34,1,true), deepMat);
  funnel.scale.x=PIT.rx/PIT.rz;
  funnel.position.y=-PIT.depth/2;
  g.add(funnel);

  // отдельные плиты и выступы, разбросанные по стенке
  var ledgeMat=TEX.concrete?new THREE.MeshLambertMaterial({map:TEX.concrete,color:0x353c40})
                           :new THREE.MeshLambertMaterial({color:0x2b3134});
  for(var k2=0;k2<26;k2++){
    var ka=r()*Math.PI*2;
    var ky=-1.0-r()*(PIT.depth-1.6);
    var t=(0-ky)/PIT.depth;
    var kr=(PIT.rx*0.99+(PIT.rx*0.46-PIT.rx*0.99)*t);
    var ls=0.7+r()*1.7;
    var ledge=new THREE.Mesh(new THREE.BoxGeometry(ls,0.16,0.5+r()*0.9),ledgeMat);
    ledge.position.set(Math.cos(ka)*kr*(PIT.rx/PIT.rz)*0.97,ky,Math.sin(ka)*kr*0.97);
    ledge.rotation.set((r()-0.5)*0.7,ka+(r()-0.5)*0.9,(r()-0.5)*0.6);
    g.add(ledge);
  }

  // дно
  var botMat=TEX.pit?new THREE.MeshLambertMaterial({map:TEX.pit,color:0x4a5357})
                    :new THREE.MeshLambertMaterial({color:0x2b3236});
  var bottom=new THREE.Mesh(new THREE.CircleGeometry(PIT.rx*0.5,26),botMat);
  bottom.rotation.x=-Math.PI/2; bottom.position.y=-PIT.depth+0.02;
  bottom.scale.x=PIT.rx/PIT.rz;
  g.add(bottom);

  // крупные обломки на дне по краям, середина свободна
  var bigMat=TEX.concrete?new THREE.MeshLambertMaterial({map:TEX.concrete,color:0x31373a})
                        :new THREE.MeshLambertMaterial({color:0x272d30});
  for(var b=0;b<14;b++){
    var ba=r()*6.28, br=PIT.rx*(0.2+r()*0.22);
    var bs=0.7+r()*1.4;
    var geo=new THREE.BoxGeometry(bs,bs*0.7,bs*0.9,2,2,2);
    var pos=geo.attributes.position;
    for(var v=0;v<pos.count;v++){
      pos.setXYZ(v,pos.getX(v)+(r()-0.5)*bs*0.3,pos.getY(v)+(r()-0.5)*bs*0.3,pos.getZ(v)+(r()-0.5)*bs*0.3);
    }
    geo.computeVertexNormals();
    var ch=new THREE.Mesh(geo,bigMat);
    ch.position.set(Math.cos(ba)*br*(PIT.rx/PIT.rz),-PIT.depth+bs*0.35,Math.sin(ba)*br);
    ch.rotation.set(r()*0.6,r()*3,r()*0.5);
    g.add(ch);
  }

  // проём в тоннель в дальней стенке дна
  var arch=new THREE.Group();
  arch.position.set(0,-PIT.depth,-2.4);
  var hole=new THREE.Mesh(new THREE.PlaneGeometry(3.4,2.9),
    new THREE.MeshBasicMaterial({color:0x0b1416}));
  hole.position.y=1.45; arch.add(hole);
  var frameMat=rimMat;
  [-1,1].forEach(function(s){
    var jamb=new THREE.Mesh(new THREE.BoxGeometry(0.44,3.1,1.2),frameMat);
    jamb.position.set(s*1.9,1.55,0.2); jamb.rotation.y=s*0.06; arch.add(jamb);
  });
  var lintel=new THREE.Mesh(new THREE.BoxGeometry(4.3,0.5,1.2),frameMat);
  lintel.position.set(0,3.0,0.2); arch.add(lintel);
  var archGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW,color:0x76efe6,
    transparent:true,opacity:0.55,depthWrite:false,blending:THREE.AdditiveBlending}));
  archGlow.scale.set(4.6,4.6,1); archGlow.position.set(0,1.5,-0.4); arch.add(archGlow);
  g.add(arch);

  // арматура, торчащая из уступов
  var rust=new THREE.MeshLambertMaterial({color:0x33302c});
  for(var rb=0;rb<14;rb++){
    var ra=r()*6.28, rl=1.0+r()*1.8, ry=-0.4-r()*6;
    var rod=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,rl,5),rust);
    var rr3=PIT.rx*0.9;
    rod.position.set(Math.cos(ra)*rr3*(PIT.rx/PIT.rz),ry,Math.sin(ra)*rr3);
    rod.rotation.set((r()-0.5)*1.4,ra,(r()-0.5)*1.4);
    g.add(rod);
  }

  // свет: только со дна и из проёма
  var gl2=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW,color:0x66f0e4,
    transparent:true,opacity:0.55,depthWrite:false,blending:THREE.AdditiveBlending}));
  gl2.scale.set(11,11,1); gl2.position.y=-PIT.depth+1.6; g.add(gl2);
  var pl2=new THREE.PointLight(0x6fe8e0,1.7,6); pl2.position.set(0,-PIT.depth+1.8,0); g.add(pl2);
  var pl3=new THREE.PointLight(0x7df0e6,0.3,14); pl3.position.set(0,-4.2,0); g.add(pl3);

  for(var m=0;m<10;m++){
    var sp=new THREE.Sprite(new THREE.SpriteMaterial({map:MIST,color:0xc8eeee,
      transparent:true,opacity:0.22,depthWrite:false}));
    var ma=r()*6.28, mr=r()*PIT.rz*0.6;
    sp.position.set(Math.cos(ma)*mr,-2-r()*5,Math.sin(ma)*mr);
    sp.scale.set(4+r()*3,4+r()*3,1);
    sp.userData.base=sp.position.y; sp.userData.sp=0.35+r()*0.5; sp.userData.ph=r()*6.28;
    g.add(sp); mists.push(sp);
  }
}

// ——— капсула в руках ———
function placeCapsule(){
  var tx=TEX.capsule||TEX.capsuleAlt;
  var w=0.55, h=tx?w/(tx.image.width/tx.image.height):0.34;
  capPlane=new THREE.Mesh(new THREE.PlaneGeometry(w,h),
    new THREE.MeshBasicMaterial({map:tx||null,color:0xffffff,transparent:true,
      alphaTest:0.45,depthTest:false,depthWrite:false,opacity:1}));
  capPlane.position.set(0,-0.60,-1.0);
  capPlane.renderOrder=999;
  camera.add(capPlane);
  capPlane.userData.tex='capsule';
  // бирюзовое свечение вокруг капсулы — включается на время восстановления
  // свечение вокруг капсулы отдельным ореолом не нужно: светится только кристалл в модели
  capGlow=null;
  if(MODELS.capsule) buildCapsuleModel();
}

// ——— капсула в руках: настоящая 3D-модель по картинке автора ———
// Рисуется отдельной сценой с узким объективом (30°), чтобы форма была ровно как на превью:
// камера улицы снимает широко и вблизи, от этого корпус выгибается «бочкой».
function buildCapsuleModel(){
  if(!MODELS.capsule||!MODELS.capsule.scene||CAPSULE3D) return;
  // Берём КОПИЮ модели, а не саму: исходная копия одна на всю игру, её положение и наклон
  // уже менялись при прошлых входах — из-за этого капсула каждый раз вставала по-новому
  // и на втором-третьем входе уезжала из кадра. Копия каждый раз чистая.
  var m=MODELS.capsule.scene.clone(true);
  m.position.set(0,0,0); m.rotation.set(0,0,0); m.scale.set(1,1,1);
  m.updateMatrixWorld(true);
  var box=new THREE.Box3().setFromObject(m), size=new THREE.Vector3(), cen=new THREE.Vector3();
  box.getSize(size); box.getCenter(cen);
  m.position.set(-cen.x,-cen.y,-cen.z);    // модель по центру своей сцены
  m.rotation.set(0,0,0);                   // лицом к камере, как на превью
  CAPSIZE=size.clone();
  CAPSULE3D=new THREE.Group();
  CAPSULE3D.renderOrder=999;
  CAPSULE3D.add(m);
  CAP_OK=false;

  CAPSCENE=new THREE.Scene();
  CAPCAM=new THREE.PerspectiveCamera(30,1,0.05,50);
  // ровный свет как на превью: общий, небо/земля, мягкий ключевой и подсветка ядра
  CAPSCENE.add(new THREE.AmbientLight(0xffffff,0.55));
  CAPSCENE.add(new THREE.HemisphereLight(0xdfeef4,0x2a3236,0.85));
  var key=new THREE.DirectionalLight(0xffffff,0.95); key.position.set(0.6,1.0,1.6); CAPSCENE.add(key);
  var rim=new THREE.DirectionalLight(0x9ffcf2,0.28); rim.position.set(-1.2,0.25,-0.9); CAPSCENE.add(rim);
  var core=new THREE.PointLight(0x7df0e6,0.55,Math.max(0.8,size.x*0.5)); core.position.set(0,0,size.z*0.5); CAPSCENE.add(core);
  CAPSCENE.add(CAPSULE3D);

  CAPSULE_MATS=[];
  var needEmis=[];
  m.traverse(function(o){
    if(o.isMesh&&o.material){
      var mats=Array.isArray(o.material)?o.material:[o.material];
      for(var i=0;i<mats.length;i++){
        var mt=mats[i];
        if(!mt) continue;
        // без окружения металл в модели даёт чёрные пятна — убираем
        if(mt.metalness!==undefined){ mt.metalness=0; mt.metalnessMap=null; }
        if(mt.emissive){ mt.emissive.setRGB(0,0,0); }
        if(mt.color){ mt.userData.baseColor=mt.color.clone(); CAPSULE_MATS.push(mt); needEmis.push(mt); }
      }
      o.frustumCulled=false;
    }
  });
  // Свечение даём точечным бирюзовым светом у самого окна: раскраска модели остаётся как на превью,
  // а не «мажется» свечением по рукам (маска по цвету задевала кисти рук).
  frameCapsule();
  // Страховка «пусто не бывает»: проверяем, что модель действительно встала в свою область кадра.
  // Если нет — оставляем видимой прежнюю плоскую картинку капсулы, она точно работала.
  try{
    CAPSULE3D.updateMatrixWorld(true);
    var chk=new THREE.Vector3();
    new THREE.Box3().setFromObject(m).getCenter(chk);
    var dx=Math.abs(chk.x-CAPSULE3D.position.x), dy=Math.abs(chk.y-CAPSULE3D.position.y);
    CAP_OK=(dx<0.35 && dy<0.35);
  }catch(e){ CAP_OK=false; }
  CAPSULE_DMG=-1;
  // прежняя картинка остаётся невидимой «логикой» только при уверенно поставленной модели
  if(capPlane && CAP_OK){ capPlane.material.opacity=0; capPlane.userData.model3d=true; }
}

// капсула целиком в кадре, нижняя часть у нижнего края: сверху и по бокам видно улицу
function frameCapsule(){
  if(!CAPSCENE||!CAPCAM||!CAPSIZE) return;
  var sz=CAPSIZE;
  var aspect=Math.max(0.4,window.innerWidth/Math.max(1,window.innerHeight));
  CAPCAM.aspect=aspect;
  var tv=Math.tan(CAPCAM.fov*Math.PI/360);
  // размер и место — как у прежней плоской картинки: капсула у нижнего края, руки в кадре
  var fill=0.36;                                  // высота модели — треть кадра
  var dH=(sz.y*0.5)/(tv*fill);
  var dW=(sz.x*0.5)/(tv*aspect*0.34);
  CAPDIST=(aspect>=1.2)?dH:Math.max(dH,dW);
  CAPCAM.near=Math.max(0.05,CAPDIST-sz.z*1.2);
  CAPCAM.far=CAPDIST+sz.z*2+2;
  CAPCAM.position.set(0,0,CAPDIST);
  CAPCAM.lookAt(0,0,0);
  CAPCAM.updateProjectionMatrix();
  // верх модели на 43% ниже середины экрана, как было у картинки; низ уходит за край
  CAPBASEY=-(0.43+fill)*CAPDIST*tv;
  CAPSULE3D.position.set(0,CAPBASEY,0);
}


// повреждение капсулы показываем цветом: целая — как на картинке, дальше темнее и с красным оттенком
function tintCapsuleModel(lvl){
  if(!CAPSULE_MATS) return;
  for(var i=0;i<CAPSULE_MATS.length;i++){
    var mt=CAPSULE_MATS[i], base=mt.userData.baseColor||new THREE.Color(1,1,1);
    var k=lvl===0?1:(lvl===1?0.78:0.58);
    mt.color.setRGB(base.r*k+(lvl===2?0.16:0), base.g*k, base.b*k);
    if(mt.needsUpdate!==undefined) mt.needsUpdate=true;
  }
}

// бирюзовая вспышка при восстановлении от кристалла
function setCapsuleEmissive(cf){
  if(!CAPSULE_MATS) return;
  for(var i=0;i<CAPSULE_MATS.length;i++){
    var mt=CAPSULE_MATS[i];
    if(!mt.emissive) continue;
    if(cf>0) mt.emissive.setRGB(cf*1.1,cf*1.7,cf*1.7);
    else mt.emissive.setRGB(0,0,0);
  }
}

// капсула трескается по мере урона
function capsuleTextureName(){
  if(integrity>60) return 'capsule';
  if(integrity>30) return 'capsuleDamaged';
  return 'capsuleCritical';
}

// ——— тоннель: строится, когда падаем (чтобы не грузить зря) ———

function buildTunnel(cfg){
  cfg=cfg||TUN;                       // тот же коридор для любого тоннеля: передай {y,z0,z1,w,h}
  if(cfg===TUN){ if(tunnelBuilt)return; tunnelBuilt=true; }
  var g=new THREE.Group(); g.position.set(cfg.x||0,cfg.y,0); scene.add(g);
    if(cfg===TUN) tunnelGroup=g;
  var len=Math.abs(cfg.z0-cfg.z1), cz=(cfg.z0+cfg.z1)/2;
  var r=rnd(9191);

  var floorMap=TEX.concrete?TEX.concrete.clone():null;
  if(floorMap){ floorMap.needsUpdate=true; floorMap.wrapS=floorMap.wrapT=THREE.RepeatWrapping; floorMap.repeat.set(2,len/4); }
  var floor=new THREE.Mesh(new THREE.BoxGeometry(cfg.w,0.3,len),
    new THREE.MeshPhongMaterial({map:floorMap,color:0x3f484c,shininess:90,specular:0x5b8589}));
  floor.position.set(0,-0.15,cz); g.add(floor);

  for(var p=0;p<12;p++){
    var pw=1.2+r()*1.6, pd=1.0+r()*1.8;
    var pud=new THREE.Mesh(new THREE.PlaneGeometry(pw,pd),
      new THREE.MeshBasicMaterial({color:0x8fe6e2,transparent:true,opacity:0.045,
        blending:THREE.AdditiveBlending,depthWrite:false}));
    pud.rotation.x=-Math.PI/2;
    pud.position.set((r()-0.5)*cfg.w*0.7,0.015,cz+(r()-0.5)*len*0.95);
    g.add(pud);
  }

  var wallMap=TEX.wall?TEX.wall.clone():null;
  if(wallMap){ wallMap.needsUpdate=true; wallMap.wrapS=wallMap.wrapT=THREE.RepeatWrapping; wallMap.repeat.set(len/5,1); }
  var wallMat=new THREE.MeshLambertMaterial({map:wallMap,color:0x5d686d});
  [-1,1].forEach(function(s){
    var w=new THREE.Mesh(new THREE.BoxGeometry(0.4,cfg.h,len),wallMat);
    w.position.set(s*(cfg.w/2+0.2),cfg.h/2,cz); g.add(w);
  });
  var ceil=new THREE.Mesh(new THREE.BoxGeometry(cfg.w+0.8,0.3,len-2.9),
    new THREE.MeshLambertMaterial({color:0x3a4348}));
  ceil.position.set(0,cfg.h+0.15,cz+1.45); g.add(ceil);

  for(var pz=cfg.z0; pz>cfg.z1; pz-=9){
    [-1,1].forEach(function(s){
      var pil=new THREE.Mesh(new THREE.BoxGeometry(0.22,cfg.h,0.45),
        new THREE.MeshLambertMaterial({color:0x3d464b}));
      pil.position.set(s*(cfg.w/2-0.11),cfg.h/2,pz); g.add(pil);
    });
  }

  var pipeMat=new THREE.MeshLambertMaterial({color:0x2f373b});
  var pipeMat2=new THREE.MeshLambertMaterial({color:0x262d31});
  function pipeAlong(x,y,rad,mat){
    var pm=new THREE.Mesh(new THREE.CylinderGeometry(rad,rad,len,10),mat);
    pm.rotation.x=Math.PI/2; pm.position.set(x,y,cz); g.add(pm);
  }
  [-1,1].forEach(function(s){
    pipeAlong(s*(cfg.w/2-0.26),0.52,0.17,pipeMat);
    pipeAlong(s*(cfg.w/2-0.16),2.40,0.09,pipeMat2);
    pipeAlong(s*(cfg.w/2-0.12),2.68,0.06,pipeMat2);
  });
  pipeAlong(-0.7,cfg.h-0.22,0.10,pipeMat2);
  pipeAlong(0.7,cfg.h-0.18,0.08,pipeMat2);

  var lowZ=cfg.z0-16;
  var lowPipe=new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.17,cfg.w+0.4,12),pipeMat);
  lowPipe.rotation.z=Math.PI/2; lowPipe.position.set(0,1.30,lowZ); g.add(lowPipe);

  for(var lz2=cfg.z0-5; lz2>cfg.z1; lz2-=7){
    var lampBox=new THREE.Mesh(new THREE.BoxGeometry(0.75,0.1,0.24),
      new THREE.MeshBasicMaterial({color:0xcffbf5}));
    lampBox.position.set(0,cfg.h-0.12,lz2); g.add(lampBox);
    var gl=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW,color:0x8ff2ea,
      transparent:true,opacity:0.5,depthWrite:false,blending:THREE.AdditiveBlending}));
    gl.scale.set(4.2,4.2,1); gl.position.set(0,cfg.h-0.2,lz2); g.add(gl);
    if(cfg===TUN) tunnelLamps.push(lz2);
  }
  if(cfg===TUN){
      var pl3=new THREE.PointLight(0x9ff4ec,0.55,9);
      g.add(pl3); tunnelLightPool.push(pl3);
    } else {
      // второй тоннель: приглушённые статичные лампы (пул привязан к тоннелю под провалом)
      for(var bz=cfg.z0-4; bz>cfg.z1; bz-=20){
        var bl=new THREE.PointLight(0x9ff4ec,0.28,9);
        bl.position.set(0,cfg.h-0.4,bz); g.add(bl);
      }
    }

  for(var d=0;d<18;d++){
    var bs=0.25+r()*0.5;
    var ch=new THREE.Mesh(new THREE.BoxGeometry(bs,bs*0.7,bs),
      new THREE.MeshLambertMaterial({color:0x6a757a}));
    ch.position.set((r()<0.5?-1:1)*(cfg.w/2-0.7-r()*0.3),bs*0.4,cz+(r()-0.5)*len*0.95);
    ch.rotation.set(r(),r()*3,r());
    g.add(ch);
  }
  for(var mi=0;mi<10;mi++){
    var sp=new THREE.Sprite(new THREE.SpriteMaterial({map:MIST,color:0xbde8ea,
      transparent:true,opacity:0.17,depthWrite:false}));
    sp.position.set((r()-0.5)*cfg.w*0.8,0.6+r()*2.4,cz+(r()-0.5)*len*0.9);
    sp.scale.set(3+r()*3,3+r()*3,1);
    sp.userData.base=sp.position.y; sp.userData.sp=0.2+r()*0.3; sp.userData.ph=r()*6.28;
    g.add(sp); mists.push(sp);
  }

  // —— вертикальный коридор выхода со стенами, трубами и лестницей ——
  // только у тоннеля под провалом (у второго — финишные ворота в конце)
  if(cfg===TUN){
  var shZ=TUN.z1+1.3, shW=2.5, topH=EYE+2.6-TUN.y;
  var shMap=TEX.wall?TEX.wall.clone():null;
  if(shMap){ shMap.needsUpdate=true; shMap.wrapS=shMap.wrapT=THREE.RepeatWrapping; shMap.repeat.set(2,4); }
  var shMat=new THREE.MeshLambertMaterial({map:shMap,color:0x5b666b});
  [-1,1].forEach(function(s){
    var w1=new THREE.Mesh(new THREE.BoxGeometry(0.3,topH,shW),shMat);
    w1.position.set(s*(shW/2+0.15),topH/2,shZ); g.add(w1);
  });
  // задняя стенка коридора (со стороны, куда бежим) и проём со стороны тоннеля
  var backWall=new THREE.Mesh(new THREE.BoxGeometry(shW+0.6,topH,0.3),shMat);
  backWall.position.set(0,topH/2,shZ-1.45); g.add(backWall);
  // трубы вдоль коридора
  var shPipe=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,topH,8),pipeMat);
  shPipe.position.set(shW/2-0.12,topH/2,shZ-0.9); g.add(shPipe);
  // лампа в коридоре
  var shLamp=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.12,0.2),
    new THREE.MeshBasicMaterial({color:0xcffbf5}));
  shLamp.position.set(-shW/2+0.18,topH*0.55,shZ); g.add(shLamp);
  var shGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW,color:0x9ff4ec,
    transparent:true,opacity:0.6,depthWrite:false,blending:THREE.AdditiveBlending}));
  shGlow.scale.set(3.4,3.4,1); shGlow.position.copy(shLamp.position); g.add(shGlow);
  var shLight=new THREE.PointLight(0xbdf9f2,1.1,10);
  shLight.position.set(0,topH*0.55,shZ); g.add(shLight);
  // лестница
  var ladderMat=new THREE.MeshLambertMaterial({color:0x8b969b});
  [-0.32,0.32].forEach(function(lx){
    var rail=new THREE.Mesh(new THREE.BoxGeometry(0.06,topH-0.6,0.06),ladderMat);
    rail.position.set(lx,(topH-0.6)/2+0.2,shZ-1.05); g.add(rail);
  });
  for(var ry=0.3; ry<topH-0.4; ry+=0.4){
    var rung=new THREE.Mesh(new THREE.BoxGeometry(0.72,0.05,0.05),ladderMat);
    rung.position.set(0,ry,shZ-1.05); g.add(rung);
  }
  // рамка люка на улице
  var manhole=new THREE.Group(); manhole.position.set(0,-TUN.y,shZ);
  scene.add(manhole);
  var rimMat=new THREE.MeshLambertMaterial({color:0x6d777b});
  for(var hh=0; hh<14; hh++){
    var ha=hh/14*Math.PI*2;
    var seg=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.12,0.5),rimMat);
    seg.position.set(Math.cos(ha)*1.7,0.06,Math.sin(ha)*1.7);
    seg.rotation.y=ha; manhole.add(seg);
      }
      }
    }

// ——— препятствия и кристаллы ———

function concreteMat(){
  return TEX.concrete
    ? new THREE.MeshLambertMaterial({map:TEX.concrete,color:0x9aa3a6,emissive:new THREE.Color(0x1a2024)})
    : new THREE.MeshLambertMaterial({color:0x77807f});
}

function addBeam(z){
  var mat=concreteMat();
  var m=new THREE.Mesh(new THREE.BoxGeometry(ROAD_W+1.2,0.75,1.2),mat);
  m.position.set(0,2.02,z);
  scene.add(m);
  [-1,1].forEach(function(s){
    var leg=new THREE.Mesh(new THREE.BoxGeometry(0.9,1.3,0.9),mat);
    leg.position.set(s*(ROAD_W/2+0.3),0.65,z);
    leg.rotation.y=0.3*s; scene.add(leg);
  });
  return m;
}

// крупный неровный обломок бетона
function chunkMesh(size,tone){
  var base=TEX.concrete?new THREE.MeshLambertMaterial({map:TEX.concrete,color:tone||0x3c4448,
      emissive:new THREE.Color(0x090d0f)}):concreteMat();
  var geo=new THREE.BoxGeometry(size,size*0.85,size*0.95,2,2,2);
  var pos=geo.attributes.position;
  var jr=rnd(Math.floor(size*997)+11);
  for(var i=0;i<pos.count;i++){
    pos.setXYZ(i,pos.getX(i)+(jr()-0.5)*size*0.22,
                 pos.getY(i)+(jr()-0.5)*size*0.22,
                 pos.getZ(i)+(jr()-0.5)*size*0.22);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo,base);
}

// обломки падают сверху прямо на бегуна: не ушёл в сторону — удар
function addDebris(z,baseY,fallH,need,text,size,off){
  var e={z:z,baseY:baseY,fallH:fallH,type:'debris',need:need,text:text,done:false,warned:false,pieces:[]};
  var r=rnd(Math.floor(Math.abs(z)*17)+3);
  var sz=size||(1.9+r()*0.35);
  var m=chunkMesh(sz,0x50585c);
  var ox=(off===undefined)?((r()-0.5)*0.6):off;
  m.userData={off:ox, dl:(r()-0.5)*1.2, size:sz};
  m.visible=false;
  scene.add(m);
  e.pieces.push(m);
  events.push(e);
  return e;
}

// ——— кристалл: объёмный восьмигранник со светящимся ядром ———
// Кристалл стоит сбоку (или высоко) и берётся ДЕЙСТВИЕМ: подъехать в сторону или прыгнуть.
// Сам к капсуле не летит. Сторона и высота совпадают с дальностью манёвра, чтобы
// нажатие в сторону приводило к кристаллу, а не уносило мимо него.
var CRYSTAL_SIDE=2.35, CRYSTAL_SIDE_TUN=1.25;
var CRYSTAL_HIGH=2.75;           // высота «верхнего» кристалла: достаётся только прыжком

// энергия внутри кристалла: бирюзовые завихрения и яркое ядро (по референсу автора)
function energyTexture(){
  return canvasTexture(256,function(g,S){
    var r=rnd(4242);
    g.fillStyle='#08282a'; g.fillRect(0,0,S,S);
    for(var i=0;i<80;i++){
      var x=r()*S, y=r()*S, len=24+r()*110, ang=r()*6.283;
      var bright=120+r()*135|0;
      g.strokeStyle='rgba('+bright+','+Math.min(255,235+(r()*20|0))+',255,'+(0.10+r()*0.45).toFixed(2)+')';
      g.lineWidth=1+r()*5;
      g.beginPath(); g.moveTo(x,y);
      for(var k=0;k<6;k++){ ang+=(r()-0.5)*1.2; x+=Math.cos(ang)*len/6; y+=Math.sin(ang)*len/6; g.lineTo(x,y); }
      g.stroke();
    }
    var gr=g.createRadialGradient(S*0.5,S*0.5,S*0.04,S*0.5,S*0.5,S*0.55);
    gr.addColorStop(0,'rgba(240,255,253,0.95)');
    gr.addColorStop(0.45,'rgba(90,240,235,0.35)');
    gr.addColorStop(1,'rgba(20,120,120,0)');
    g.fillStyle=gr; g.fillRect(0,0,S,S);
  });
}

// объёмный обломок льда: кольца-грани по длине, неровные, сужается к концам
function shardGeometry(seed,len){
  len=len||1.25;
  var segs=6;
  var prof=[[0.02,0.20],[0.13,0.50],[0.30,0.68],[0.48,0.72],
            [0.66,0.66],[0.84,0.48],[0.97,0.26],[1.00,0.16]];
  var r=rnd(seed||4242);
  var jit=[], i, j;
  for(i=0;i<prof.length;i++){ jit.push([]); for(j=0;j<segs;j++) jit[i].push(0.72+r()*0.55); }
  var verts=[], uvs=[], ind=[];
  for(i=0;i<prof.length;i++){
    var y=(prof[i][0]-0.5)*len;
    var rad=prof[i][1]*len*0.31;
    for(j=0;j<segs;j++){
      var a=j/segs*Math.PI*2;
      verts.push(Math.cos(a)*rad*jit[i][j],
                 y+(r()-0.5)*len*0.035,
                 Math.sin(a)*rad*jit[i][j]);
      uvs.push(j/segs, prof[i][0]);
    }
  }
  var rings=prof.length;
  for(i=0;i<rings-1;i++){
    for(j=0;j<segs;j++){
      var a0=i*segs+j, b0=i*segs+(j+1)%segs,
          a1=(i+1)*segs+j, b1=(i+1)*segs+(j+1)%segs;
      ind.push(a0,a1,b1, a0,b1,b0);
    }
  }
  // замыкаем концы острыми вершинами
  var tipBot=verts.length/3; verts.push(0,-len*0.52,0); uvs.push(0.5,0);
  var tipTop=verts.length/3; verts.push(0, len*0.52,0); uvs.push(0.5,1);
  for(j=0;j<segs;j++){
    ind.push(tipBot, (j+1)%segs, j);
    ind.push(tipTop, (rings-1)*segs+j, (rings-1)*segs+(j+1)%segs);
  }
  var geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geo.setIndex(ind);
  geo.computeVertexNormals();
  return geo;
}

var CRYSTAL_GEO=null, CRYSTAL_ENERGY=null;

function crystalObject(){
  if(!CRYSTAL_GEO){ CRYSTAL_GEO=shardGeometry(4242,1.22); CRYSTAL_ENERGY=energyTexture(); }
  var grp=new THREE.Group();
  // ледяная оболочка: насыщенный бирюзовый, грани, блики
  var shellMat=new THREE.MeshPhongMaterial({color:0x3ce3d8,emissive:0x0d5f5c,
    shininess:125,specular:0xe4fffe,flatShading:true,transparent:true,opacity:0.82});
  var shell=new THREE.Mesh(CRYSTAL_GEO,shellMat);
  shell.renderOrder=2; grp.add(shell);
  // светящаяся энергия внутри — видна через оболочку
  var coreMat=new THREE.MeshBasicMaterial({map:CRYSTAL_ENERGY,color:0x8ffcf6,
    transparent:true,opacity:0.92,blending:THREE.AdditiveBlending,depthWrite:false,
    side:THREE.DoubleSide});
  var core=new THREE.Mesh(CRYSTAL_GEO,coreMat);
  core.scale.set(0.62,0.92,0.62);
  core.renderOrder=1; grp.add(core);
  // мелкие ледяные крошки рядом, как на референсе
  var chips=[];
  var cr=[[0.34,0.40,0.20],[ -0.38,-0.28,0.24],[0.18,-0.50,-0.28],[-0.28,0.36,-0.22]];
  for(var i=0;i<cr.length;i++){
    var cm=new THREE.MeshPhongMaterial({color:0x54dad6,emissive:0x08322f,
      shininess:90,flatShading:true});
    var ch=new THREE.Mesh(CRYSTAL_GEO,cm);
    ch.scale.setScalar(0.12+Math.random()*0.09);
    ch.position.set(cr[i][0],cr[i][1],cr[i][2]);
    ch.rotation.set(Math.random()*3,Math.random()*3,Math.random()*3);
    grp.add(ch); chips.push(ch);
  }
  var gl=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW,color:0x3fe8dc,
    transparent:true,opacity:0.30,depthWrite:false,blending:THREE.AdditiveBlending}));
  gl.scale.set(2.0,2.0,1); grp.add(gl);
  return {grp:grp,shell:shellMat,core:coreMat,glow:gl,chips:chips};
}

function addCrystal(z,side,high,baseY){
  baseY=baseY||0;
  var dist=(baseY<0)?CRYSTAL_SIDE_TUN:CRYSTAL_SIDE;
  var x=(side==='left')?-dist:((side==='right')?dist:0);
  var y=high?baseY+CRYSTAL_HIGH:baseY+1.15;
  var obj=crystalObject();
  obj.grp.position.set(x,y,z);
  scene.add(obj.grp);
  crystals.push({z:z,side:side,high:!!high,grp:obj.grp,shell:obj.shell,core:obj.core,
    glow:obj.glow,x:x,yBase:y,taken:false,bob:Math.random()*6.28,pop:0});
}

function buildEvents(){
  if(events.length)return;
  // Препятствия расставлены РАВНОМЕРНО, примерно через 26–28 м. Раньше они шли кучками
  // (кристалл, балка и обломки почти в одной точке), а потом была долгая тишина.
  // улица 1 — от старта до провала
  addCrystal(-26,'center',true,0);                       // высоко — только прыжком
  addBeam(-52);
  events.push({z:-52,type:'beam',need:'duck',text:'Впереди низкая балка — пригнуться',done:false,warned:false});
  addCrystal(-78,'left',false,0);                        // слева — манёвр влево
  addDebris(-100,0,9,'left','Обломки сверху — уходите влево');
  events.push({z:Z_PIT_EDGE+1,type:'pit',need:'jump',text:'Впереди провал — перепрыгнуть',done:false,warned:false});
  // улица 2 — от провала до финиша
  addDebris(-170,0,9,'right','Обломки сверху — уходите вправо');
  addCrystal(-198,'right',false,0);                      // справа — манёвр вправо
  addBeam(-226);
  events.push({z:-226,type:'beam',need:'duck',text:'Впереди низкая балка — пригнуться',done:false,warned:false});
  addCrystal(-252,'center',true,0);                      // высоко — только прыжком
  addDebris(-272,0,9,'left','Обломки сверху — уходите влево');
}

// при повреждении на пути появляется кристалл
function crystalAhead(){
  for(var i=0;i<crystals.length;i++){
    var c=crystals[i];
    if(!c.taken&&c.z<sZ&&c.z>sZ-50) return true;
  }
  return false;
}
function ensureHealCrystal(){
  if(integrity>=60) return;
  if(crystalAhead()) return;
  var baseY=(phase==='tunnel'||phase==='ladder')?TUN.y:0;
  var z=sZ-16;
  var side=(Math.random()<0.5)?'left':'right';
  addCrystal(z,side,false,baseY);
}

function buildTunnelEvents(){
  if(tunnelEventsDone)return;
  tunnelEventsDone=true;
  // в тоннеле тот же ровный шаг ~26 м между препятствиями
  events.push({z:TUN.z0-20,type:'pipe',need:'duck',text:'Впереди труба — пригнуться',done:false,warned:false});
  addDebris(TUN.z0-48,TUN.y,2.7,'left','Обломки сверху — уходите влево',1.2,0.45);
  addCrystal(TUN.z0-66,'right',false,TUN.y);
}

// ——— вид наблюдателя: значение препятствий видно и без текста ———
// Значки рисуются на холсте: «!» опасность, галочка «пригнуться», стрелка «уходить в сторону», ромб кристалл.
function obsIcon(kind){
  if(OBS_ICON_TEX[kind]) return OBS_ICON_TEX[kind];
  var c=document.createElement('canvas'); c.width=c.height=256;
  var g=c.getContext('2d');
  var amber='#ffb347', turq='#35e8dc';
  g.lineJoin='round'; g.lineCap='round';
  if(kind==='warn'){
    g.beginPath(); g.moveTo(128,26); g.lineTo(234,212); g.lineTo(22,212); g.closePath();
    g.fillStyle='rgba(0,0,0,.62)'; g.fill();
    g.lineWidth=14; g.strokeStyle=amber; g.stroke();
    g.fillStyle=amber; g.font='bold 122px Arial, sans-serif';
    g.textAlign='center'; g.textBaseline='middle'; g.fillText('!',128,160);
  }else if(kind==='duck'){
    g.fillStyle=amber;
    g.beginPath(); g.moveTo(128,36); g.lineTo(214,132); g.lineTo(42,132); g.closePath(); g.fill();
    g.lineWidth=20; g.strokeStyle=amber;
    g.beginPath(); g.moveTo(32,198); g.lineTo(224,198); g.stroke();
  }else if(kind==='left'||kind==='right'){
    g.save(); g.translate(128,128); if(kind==='left') g.scale(-1,1);
    g.fillStyle=amber;
    g.beginPath();
    g.moveTo(-104,-62); g.lineTo(-24,-62); g.lineTo(-24,-110); g.lineTo(104,0);
    g.lineTo(-24,110); g.lineTo(-24,62); g.lineTo(-104,62); g.closePath(); g.fill();
    g.restore();
  }else{
    g.fillStyle=turq;
    g.beginPath(); g.moveTo(128,20); g.lineTo(216,128); g.lineTo(128,236); g.lineTo(40,128); g.closePath(); g.fill();
    g.lineWidth=12; g.strokeStyle='#eaffff'; g.stroke();
  }
  var t=new THREE.CanvasTexture(c);
  t.encoding=THREE.sRGBEncoding; t.needsUpdate=true;
  OBS_ICON_TEX[kind]=t; return t;
}
function obsMark(obj,z,base){ OBS_MARKS.push({o:obj,z:z,base:base}); return obj; }
function obsIconSprite(kind,scale,z,x,y,base){
  var m=new THREE.SpriteMaterial({map:obsIcon(kind),transparent:true,depthTest:true,depthWrite:false,opacity:0.95});
  var s=new THREE.Sprite(m); s.scale.set(scale,scale,1);
  s.position.set(x||0,y||0,z||0);
  scene.add(s);
  if(base!==undefined) obsMark(s,z,base);
  return s;
}
// пульсирующее кольцо: зона опасности или место кристалла
function obsRing(z,y,x,radius,color,op){
  var m=new THREE.Mesh(new THREE.RingGeometry(0.76,1,40),
    new THREE.MeshBasicMaterial({color:color,transparent:true,opacity:op||0.8,
      side:THREE.DoubleSide,depthWrite:false,depthTest:false}));
  m.rotation.x=-Math.PI/2;
  m.position.set(x||0,(y||0)+0.16,z);
  m.scale.set(radius,radius,1);
  scene.add(m);
  return obsMark(m,z,op||0.8);
}
// цветная полоса на дороге: «здесь опасно»
function obsZone(z,y,width,depth,color,op){
  var m=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),
    new THREE.MeshBasicMaterial({color:color,transparent:true,opacity:op||0.22,
      side:THREE.DoubleSide,depthWrite:false}));
  m.rotation.x=-Math.PI/2; m.position.set(0,(y||0)+0.12,z);
  scene.add(m); obsMark(m,z,null); return m;
}

// Метки для вида наблюдателя: своих значков не рисуем — препятствия на дороге те же,
// что у Бегуна (обломки, балки, кристаллы). Остаётся одна маленькая красная стрелка:
// она показывает, куда уходить от того, что впереди, и ничего не перекрывает.
var OBS_ARROW=null, OBS_TAGS=[];
function buildObserverMarkers(){
  if(!scene) return;
  OBS_PULSE.length=0; OBS_MARKS.length=0;
  OBS_HUMAN=buildHuman();
  OBS_ARROW=null;                 // стрелка не нужна: остаются только надписи у препятствий
  OBS_TAGS.length=0;
  syncObsTags();
}

// Надписи для наблюдателя: одновременно одна — у ближайшего препятствия, и с действием,
// которое надо сказать Бегуну («ПРОВАЛ — ПРЫЖОК», «ОБЛОМКИ — ВЛЕВО»).
function syncObsTags(){
  if(!OBSERVE||!scene) return;
  events.forEach(function(e){
    if(e.tag) return;
    var word={pit:'ПРОВАЛ — ПРЫЖОК',beam:'БАЛКА — ПРИГНУТЬСЯ',
      debris:(e.need==='left'?'ОБЛОМКИ — ВЛЕВО':(e.need==='right'?'ОБЛОМКИ — ВПРАВО':'ОБЛОМКИ')),
      pipe:'ТРУБА — ПРИГНУТЬСЯ'}[e.type]||'ОПАСНО';
    var y=(e.baseY||0)+(e.type==='debris'?4.6:(e.type==='beam'?3.1:1.6));
    e.tag=obsTag(word,e.z,0,y,'#ff3b30',e);
  });
  crystals.forEach(function(c){
    if(c.tag) return;
    var word=c.high?'КРИСТАЛЛ — ПРЫЖОК':(c.side==='left'?'КРИСТАЛЛ — ВЛЕВО':
      (c.side==='right'?'КРИСТАЛЛ — ВПРАВО':'КРИСТАЛЛ'));
    c.tag=obsTag(word,c.z,c.x,(c.yBase||1.2)+1.7,'#38efe4',null,c);
  });
}

// подпись с треугольником-стрелкой, которая смотрит на само препятствие
function obsTagTexture(word,color){
  var W=640, H=96;
  var c=document.createElement('canvas'); c.width=W; c.height=H;
  var g=c.getContext('2d'), fs=52;
  g.font='bold '+fs+'px Arial, Helvetica, sans-serif';
  var w=g.measureText(word).width;
  if(w>W-40){ fs=Math.max(26,Math.floor(fs*(W-40)/w)); g.font='bold '+fs+'px Arial, Helvetica, sans-serif'; }
  g.textAlign='center'; g.textBaseline='middle';
  g.lineWidth=8; g.strokeStyle='rgba(6,12,14,0.9)'; g.strokeText(word,W/2,H/2+2);
  g.fillStyle=color||'#ff3b30'; g.fillText(word,W/2,H/2+2);
  var t=new THREE.CanvasTexture(c); t.needsUpdate=true; return t;
}
function obsTag(word,z,x,y,color,e,c){
  var sp=new THREE.Sprite(new THREE.SpriteMaterial({map:obsTagTexture(word,color),transparent:true,
    depthWrite:false,depthTest:false,opacity:0.97}));
  sp.scale.set(10,1.5,1);
  sp.position.set(x||0,y||0,z||0);
  sp.visible=false;
  scene.add(sp);
  OBS_TAGS.push({s:sp,z:z,e:e||null,c:c||null});
  return sp;
}

// Показываем ОДНУ надпись — у ближайшего ещё не пройденного препятствия.
// Так наблюдатель не читает список: он видит только то, о чём говорить сейчас.
function updateObsTags(z){
  var best=null, bd=1e9;
  for(var i=0;i<OBS_TAGS.length;i++){
    var t=OBS_TAGS[i];
    t.s.visible=false;
    var alive=t.e?(!t.e.done):(!t.c||!t.c.taken);
    if(!alive) continue;
    var d=z-t.z;                       // >0 — препятствие ещё впереди
    if(d<=-3) continue;                // пройдено
    if(d<bd){ bd=d; best=t; }
  }
  if(!best) return;
  var sp=best.s;
  sp.visible=true;
  // размер на экране постоянный и крупный: одинаково читается и вблизи, и за 30–40 м
  var dc=camera.position.distanceTo(sp.position);
  var hh=Math.max(2.0,dc*0.115);
  sp.scale.set(hh*6.67,hh,1);
  sp.material.opacity=0.97;
}

// красная стрелка: куда уходить от препятствия, которое впереди
function updateObsArrow(z){
  if(!OBS_ARROW) return;
  var next=null;
  for(var i=0;i<events.length;i++){
    var e=events[i];
    if(!e.done && e.z<z-1 && (z-e.z)<42){ next=e; break; }
  }
  if(!next){ OBS_ARROW.visible=false; return; }
  OBS_ARROW.visible=true;
  var side=(next.need==='left')?-1:(next.need==='right'?1:0);
  // стрелка стоит рядом с самим препятствием: обломки и балка — в воздухе, провал — у земли
  var ax=(side?side*2.4:1.3);
  var ay=(next.baseY||0)+({debris:3.6,beam:2.4,pit:0.9,pipe:1.6}[next.type]||1.2);
  OBS_ARROW.position.set(ax,ay,next.z+1.2);
  OBS_ARROW.rotation.y=side?(side*Math.PI*0.42):0;
  OBS_ARROW.rotation.x=-Math.PI/2;                 // остриё смотрит вниз, на препятствие
  OBS_ARROW.scale.setScalar(1.05+0.10*Math.sin(obsT*5));
}

// Метки живут: кольца пульсируют, подсветка бегуна едет по маршруту,
// пройденные препятствия скрываются — впереди остаётся только то, что ещё предстоит.
function updateObserverMarkers(dt,z,zTag){
  zTag=(zTag===undefined||zTag===null)?z:zTag;
  if(OBS_HUMAN){
    var H=OBS_HUMAN, ph=obsT*9.5;
    if(RUNNER_MIXER){
      RUNNER_MIXER.update(dt||0.016);
      // руки не машут: возвращаем их в позу «держит капсулу», ноги бегут как в клипе
      for(var ai=0;ai<RUNNER_ARMS.length;ai++){ RUNNER_ARMS[ai].b.quaternion.copy(RUNNER_ARMS[ai].q); }
      // анимация бега тянет персонажа вперёд — возвращаем его на место (движение задаёт игра)
      if(RUNNER_HIPS){
        if(!RUNNER_HIPS_BASE) RUNNER_HIPS_BASE=RUNNER_HIPS.position.clone();
        RUNNER_HIPS.position.x=RUNNER_HIPS_BASE.x;
        RUNNER_HIPS.position.z=RUNNER_HIPS_BASE.z;
      }
      H.g.position.set(routeX(z),(obsUnder(z)?TUN.y:routeY(z))+0.02,z);
    } else {
      if(H.legL&&H.legR&&H.armL&&H.armR){
        H.legL.rotation.x=Math.sin(ph)*0.92;
        H.legR.rotation.x=-Math.sin(ph)*0.92;
        H.armL.rotation.x=-Math.sin(ph)*0.82;
        H.armR.rotation.x=Math.sin(ph)*0.82;
      }
      H.g.position.set(routeX(z),routeY(z)+0.04+Math.abs(Math.sin(ph))*0.07,z);
    }
  }
  if(OBS_ARROW) updateObsArrow(zTag);
  if(OBS_TAGS.length) updateObsTags(zTag);
}

// ——— отрезок Б: поворот на боковую улицу, мост по референсу, спуск в тоннель ———
// Дома, асфальт и стены тоннеля — те же материалы, что на первом участке.
// Новое здесь только мост: опоры, перила с бирюзовой полосой, фонари.
var Z_TURN=-318, Z_BRIDGE_A=-352, Z_BRIDGE_B=-432, Z_VAULT=-452, Z_TUNB_A=-472,
    Z_TUNB_B=-556, Z_FINISH=-554;
var ROUTE_X=22, BRIDGE_Y=10, TUNB_Y=-9, ROUTE_BUILT=false;

function smooth(t){ return t<=0?0:(t>=1?1:t*t*(3-2*t)); }
function routeX(z){
  if(z>=Z_TURN) return 0;
  return ROUTE_X*smooth((Z_TURN-z)/34);
}
function routeY(z){
  if(z>Z_BRIDGE_A) return 0;
  if(z>Z_BRIDGE_A-26) return BRIDGE_Y*smooth((Z_BRIDGE_A-z)/26);
  if(z>Z_BRIDGE_B) return BRIDGE_Y;
  if(z>Z_BRIDGE_B-22) return BRIDGE_Y*(1-smooth((Z_BRIDGE_B-z)/22));
  if(z>Z_VAULT) return 0;
  if(z>Z_TUNB_A) return TUNB_Y*smooth((Z_VAULT-z)/(Z_VAULT-Z_TUNB_A));
  return TUNB_Y;
}
function onBridge(z){ return z<Z_BRIDGE_A-2 && z>Z_BRIDGE_B+2; }
function inTunnelB(z){ return z<Z_TUNB_A && z>Z_TUNB_B; }

// лента дороги по кривой: поворот, подъём на мост, спуск в тоннель
function routeRibbon(zFrom,zTo,step,width,yOff,mat,uvScale){
  var pos=[],uvs=[],idx=[],n=0;
  for(var z=zFrom; z>=zTo-0.001; z-=step){
    var x=routeX(z), y=routeY(z)+yOff;
    var dx=routeX(z-1)-routeX(z+1), dz=-2;
    var len=Math.hypot(dx,dz)||1, nx=-dz/len, nz=dx/len;
    pos.push(x+nx*width/2,y,z+nz*width/2); uvs.push(0,(zFrom-z)/(uvScale||9));
    pos.push(x-nx*width/2,y,z-nz*width/2); uvs.push(1,(zFrom-z)/(uvScale||9));
    if(n>0){ var b=(n-1)*2; idx.push(b,b+1,b+2,b+1,b+3,b+2); }
    n++;
  }
  var g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  g.setIndex(idx); g.computeVertexNormals();
  var m=new THREE.Mesh(g,mat); scene.add(m); return m;
}

function buildRouteB(){
  if(ROUTE_BUILT) return; ROUTE_BUILT=true;
  var asphalt=TEX.wall||TEX.concrete, r=rnd(7771);
  var roadMat=(function(){
    var t=(ASPHALT_TEX||TEX.concrete).clone(); t.needsUpdate=true;
    t.wrapS=t.wrapT=THREE.RepeatWrapping;
    return new THREE.MeshPhongMaterial({map:t,color:0x77838a,shininess:55,specular:0x5f7c82,side:THREE.DoubleSide});
  })();
  var walkMat=(function(){
    var t=(TEX.wall||TEX.concrete).clone(); t.needsUpdate=true;
    t.wrapS=t.wrapT=THREE.RepeatWrapping;
    return new THREE.MeshPhongMaterial({map:t,shininess:20,specular:0x6c8186,side:THREE.DoubleSide});
  })();

  // ——— дорога: от конца второй улицы через поворот, мост и спуск до конца тоннеля
  routeRibbon(Z_TURN+10,Z_FINISH-6,3,ROAD_W,0.02,roadMat,9);
  // тротуары с двух сторон
  [-1,1].forEach(function(s){
    var pos=[],uvs=[],idx=[],n=0;
    for(var z=Z_TURN+8; z>=Z_FINISH-4; z-=3){
      var x=routeX(z), y=routeY(z), dx=routeX(z-1)-routeX(z+1), dz=-2;
      var len=Math.hypot(dx,dz)||1, nx=-dz/len, nz=dx/len;
      var cx=x+nx*s*(ROAD_W/2+WALK/2), cz=z+nz*s*(ROAD_W/2+WALK/2);
      pos.push(cx+s*nx*WALK/2, y+0.20, cz+s*nz*WALK/2); uvs.push(0,(Z_TURN-z)/6);
      pos.push(cx-s*nx*WALK/2, y+0.20, cz-s*nz*WALK/2); uvs.push(1,(Z_TURN-z)/6);
      if(n>0){ var b=(n-1)*2; idx.push(b,b+1,b+2,b+1,b+3,b+2); }
      n++;
    }
    var g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    g.setIndex(idx); g.computeVertexNormals();
    scene.add(new THREE.Mesh(g,walkMat));
  });

  // ——— дома вдоль нового отрезка: те же фасады и размеры, что на первом участке
  var facades=[];
  for(var fi=0;fi<A.facades.length;fi++) if(TEX['facade'+fi]) facades.push(TEX['facade'+fi]);
  // застройка по обе стороны, шаг 21 м — как на прежней улице, без наложений
  var zi=0;
  for(var z=Z_TURN+10; z>Z_TUNB_B+10; z-=21){
    if(inTunnelB(z)){ zi++; continue; }   // домов нет только внутри тоннеля; вокруг моста город продолжается
    var xi=routeX(z);
    var yaw=Math.atan2(routeX(z-2)-routeX(z+2),-4);   // дома разворачиваются вдоль поворота
    (function(zz,xx,ya,idx){
      [-1,1].forEach(function(s){
        var dep=14+r()*5, w=14+r()*5, h=16+r()*14;
        var tex=facades.length?facades[Math.floor(r()*facades.length)%facades.length]:null;
        var off=(ROAD_W/2+WALK+dep/2)*s;
        streetAddBuilding(xx+Math.cos(ya)*off, zz-Math.sin(ya)*off, h, dep, w, tex, 'b'+(idx*2)+(s>0?'r':'l'), 0, ya);
      });
    })(z,xi,yaw,zi);
    zi++;
  }

  // ——— мост: бетонные балки под настилом, опоры, перила с бирюзовой полосой, фонари
  var conc=concreteMat(); if(conc) conc.side=THREE.DoubleSide;
  var railMat=new THREE.MeshLambertMaterial({color:0x5d6b70});
  var glowMat=new THREE.MeshBasicMaterial({color:0x30e5dc});
  var bridgeLen=Z_BRIDGE_A-Z_BRIDGE_B;
  routeRibbon(Z_BRIDGE_A,Z_BRIDGE_B,3,ROAD_W+0.6,-0.35,conc,8);         // настил снизу
  // боковые балки
  [-1,1].forEach(function(s){
    for(var z=Z_BRIDGE_A; z>Z_BRIDGE_B; z-=6){
      var x=routeX(z), y=routeY(z);
      var beam=new THREE.Mesh(new THREE.BoxGeometry(0.5,1.1,6.2),conc);
      beam.position.set(x+s*(ROAD_W/2+0.25), y-0.55, z-3); scene.add(beam);
      // перила и светящаяся полоса
      var rail=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.16,6.2),railMat);
      rail.position.set(x+s*(ROAD_W/2+0.25), y+1.05, z-3); scene.add(rail);
      var gl=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.09,6.2),glowMat);
      gl.position.set(x+s*(ROAD_W/2+0.25), y+0.62, z-3); scene.add(gl);
      for(var k2=0;k2<3;k2++){
        var post=new THREE.Mesh(new THREE.BoxGeometry(0.12,1.1,0.12),railMat);
        post.position.set(x+s*(ROAD_W/2+0.25), y+0.55, z-k2*2.1); scene.add(post);
      }
    }
  });
  // опоры
  for(var pz=Z_BRIDGE_A-8; pz>Z_BRIDGE_B+6; pz-=26){
    var px=routeX(pz), py=routeY(pz);
    var col=new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.9,py+0.6,10),conc);
    col.position.set(px, (py-0.6)/2, pz); scene.add(col);
  }
  // фонари на мосту
  for(var fz=Z_BRIDGE_A-6; fz>Z_BRIDGE_B+4; fz-=22){
    var fx=routeX(fz), fy=routeY(fz);
    var pole=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.11,5.2,8),railMat);
    pole.position.set(fx+ROAD_W/2-0.6, fy+2.6, fz); scene.add(pole);
    var lamp=new THREE.Mesh(new THREE.SphereGeometry(0.26,10,8),new THREE.MeshBasicMaterial({color:0xbdf6f0}));
    lamp.position.set(fx+ROAD_W/2-0.6, fy+5.2, fz); scene.add(lamp);
    var li=new THREE.PointLight(0x9fe8ec,0.75,26); li.position.set(fx+ROAD_W/2-0.6, fy+5.1, fz);
    scene.add(li);
  }

  // ——— тоннель: тот же коридор, что под провалом (переиспользование buildTunnel) ———
    buildTunnel({ y:TUNB_Y, x:ROUTE_X, z0:Z_TUNB_A, z1:Z_TUNB_B, w:TUN.w, h:TUN.h });

  // ——— финишные ворота в конце тоннеля (по ширине и высоте коридора)
    var gx=routeX(Z_FINISH), gy=routeY(Z_FINISH);
    [-1,1].forEach(function(s){
      var post=new THREE.Mesh(new THREE.BoxGeometry(0.3,2.6,0.3),railMat);
      post.position.set(gx+s*(TUN.w/2-0.2), gy+1.3, Z_FINISH); scene.add(post);
    });
    var cross=new THREE.Mesh(new THREE.BoxGeometry(TUN.w-0.2,0.3,0.3),railMat);
    cross.position.set(gx, gy+2.6, Z_FINISH); scene.add(cross);
    var gateLight=new THREE.PointLight(0x8ffcf2,1.1,30);
    gateLight.position.set(gx,gy+1.8,Z_FINISH); scene.add(gateLight);
}

// ——— фигура Бегуна для экрана наблюдателя: человек с капсулой в руках ———
// Если загрузилась настоящая модель человека (бег с циклом), показываем её;
// иначе остаётся прежняя фигура из простых форм как запасной вариант.
function buildHuman(){
  var g=new THREE.Group();
  var armL=null, armR=null, legL=null, legR=null;

  if(MODELS.runner && MODELS.runner.scene){
    var model=MODELS.runner.scene;
    var box=new THREE.Box3().setFromObject(model), size=new THREE.Vector3();
    box.getSize(size);
    var k=1.85/Math.max(0.001,size.y);
    // размер задаёт сам скелет (в файле перевод из сантиметров), внешний масштаб только мешает
    model.scale.setScalar(1); model.updateMatrixWorld(true);
    model.position.set(0,0,0);
    model.rotation.y=Math.PI; model.traverse(function(o){
      if(o.isMesh){
        o.frustumCulled=false;
        // без окружения металл даёт чёрные пятна — бегун должен быть виден, а не силуэтом
        var ms=Array.isArray(o.material)?o.material:[o.material];
        for(var mi=0;mi<ms.length;mi++){ var mm=ms[mi]; if(mm&&mm.metalness!==undefined){ mm.metalness=0; mm.metalnessMap=null;
          // одежда остаётся чёрной, как на превью: без подсветки материала
          if(mm.emissive){ mm.emissive.setRGB(0,0,0); }
          mm.needsUpdate=true; } }
      }
    });
    g.add(model);
    // руки держат капсулу: запоминаем позу покоя (в ней модель и сделана — с капсулой в руках)
    RUNNER_ARMS=[];
    ['LeftShoulder','LeftArm','LeftForeArm','LeftHand','RightShoulder','RightArm','RightForeArm','RightHand'].forEach(function(nm){
      var bn=model.getObjectByName(nm);
      if(bn) RUNNER_ARMS.push({b:bn,q:bn.quaternion.clone()});
    });
    if(MODELS.runner.animations && MODELS.runner.animations.length){
      RUNNER_MIXER=new THREE.AnimationMixer(model);
      RUNNER_HIPS=model.getObjectByName('Hips')||null; RUNNER_HIPS_BASE=null;
      var clip=RUNNER_MIXER.clipAction(MODELS.runner.animations[0]);
      clip.setLoop(THREE.LoopRepeat,Infinity); clip.play();
    }
  } else {
    var hoodie=new THREE.MeshLambertMaterial({color:0x2b3339});
    var pants=new THREE.MeshLambertMaterial({color:0x1f2629});
    var skin=new THREE.MeshLambertMaterial({color:0xc0ae9e});
    var shoe=new THREE.MeshLambertMaterial({color:0x161c1f});

    var torso=new THREE.Mesh(new THREE.BoxGeometry(0.62,0.86,0.36),hoodie);
    torso.position.y=1.15; g.add(torso);
    var hip=new THREE.Mesh(new THREE.BoxGeometry(0.52,0.28,0.32),pants);
    hip.position.y=0.72; g.add(hip);
    var head=new THREE.Mesh(new THREE.SphereGeometry(0.17,12,10),skin);
    head.position.set(0,1.72,0.02); g.add(head);
    var hood=new THREE.Mesh(new THREE.SphereGeometry(0.23,12,10,0,Math.PI*2,0,Math.PI*0.6),hoodie);
    hood.position.set(0,1.73,-0.02); hood.rotation.x=-0.25; g.add(hood);

    var limb=function(len,rad,mat,x,y,extraMat){
      var pivot=new THREE.Group(); pivot.position.set(x,y,0);
      var m=new THREE.Mesh(new THREE.CylinderGeometry(rad,rad*0.82,len,8),mat);
      m.position.y=-len/2; pivot.add(m);
      if(extraMat){
        var f=new THREE.Mesh(new THREE.BoxGeometry(rad*2.6,rad*1.5,len*0.26),extraMat);
        f.position.set(0,-len+len*0.12,rad*0.6); pivot.add(f);
      }
      return pivot;
    };
    armL=limb(0.60,0.075,hoodie,-0.37,1.46);
    armR=limb(0.60,0.075,hoodie,0.37,1.46);
    legL=limb(0.74,0.095,pants,-0.16,0.72,shoe);
    legR=limb(0.74,0.095,pants,0.16,0.72,shoe);
    g.add(armL); g.add(armR); g.add(legL); g.add(legR);

    // капсула в руках: светится, видно издалека
    var capMat=new THREE.MeshPhongMaterial({color:0xeafffd,emissive:0x46cfc7,shininess:110});
    var cap=new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.14,0.44,10),capMat);
    cap.position.set(0,1.06,-0.30); g.add(cap);
  }

  // Никакого ореола и кольца вокруг бегуна: он должен выглядеть как живой человек на улице.
  g.scale.setScalar((MODELS.runner&&MODELS.runner.scene)?1.0:1.3);
  scene.add(g);
  return {g:g,armL:armL,armR:armR,legL:legL,legR:legR,ring:null};
}

// модель бегуна подгрузилась позже — пересобираем фигуру наблюдателя
function rebuildObserverHuman(){
  if(!OBS_HUMAN) return;
  var z=OBS_HUMAN.g.position.z;
  scene.remove(OBS_HUMAN.g);
  if(RUNNER_MIXER){ RUNNER_MIXER.stopAllAction(); RUNNER_MIXER=null; }
  OBS_HUMAN=buildHuman();
  OBS_HUMAN.g.position.z=z;
}

// ——— рождение провала: молния бьёт в дорогу, асфальт обваливается внутрь ———
function birthPit(){
  if(PIT_BORN) return;
  PIT_BORN=true;
  if(PIT_COVER) PIT_COVER.visible=false;
  if(PIT_EDGE) PIT_EDGE.visible=true;

  var bolt=new THREE.Group();
  var boltMat=new THREE.MeshBasicMaterial({color:0xd8fffb,transparent:true,opacity:1,
    blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
  for(var i=0;i<4;i++){
    var hh=56;
    var seg=new THREE.Mesh(new THREE.CylinderGeometry(0.10+i*0.05,0.22+i*0.06,hh,6,1,true),boltMat);
    seg.position.set((i-1.5)*1.5,hh/2,(i%2?1.4:-1.2));
    seg.rotation.z=(i-1.5)*0.04;
    bolt.add(seg);
  }
  var impact=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW,color:0xa8fff7,transparent:true,
    opacity:1,depthWrite:false,blending:THREE.AdditiveBlending}));
  impact.scale.set(30,30,1); impact.position.set(0,2.5,0);
  bolt.add(impact);
  bolt.position.z=PIT.z;
  scene.add(bolt);
  pitFx={t:0,bolt:bolt,mat:boltMat};

  // плиты асфальта обваливаются внутрь провала
  for(var p=0;p<16;p++){
    var sz=1.4+Math.random()*2.4;
    var pm=new THREE.MeshLambertMaterial({map:TEX.concrete||null,color:0x6f797d});
    var pl=new THREE.Mesh(new THREE.BoxGeometry(sz,0.4,sz*0.8),pm);
    var ang=Math.random()*6.28, rad=Math.random()*PIT.rx*0.85;
    pl.position.set(Math.cos(ang)*rad,0.25,PIT.z+Math.sin(ang)*rad);
    pl.rotation.set((Math.random()-0.5)*0.4,Math.random()*3,(Math.random()-0.5)*0.4);
    pl.userData.v=new THREE.Vector3((Math.random()-0.5)*3,-2-Math.random()*3,(Math.random()-0.5)*3);
    pl.userData.spin=(Math.random()-0.5)*5;
    scene.add(pl); pitPlates.push(pl);
  }
  for(var d=0;d<16;d++){
    var a2=Math.random()*6.28;
    var dpos=new THREE.Vector3(Math.cos(a2)*PIT.rx,1.2+Math.random()*2.6,PIT.z+Math.sin(a2)*PIT.rz);
    RAIN_DUST.push(makeDust(dpos,4+Math.random()*4,1.7+Math.random()*0.8));
  }
  flash('ok');
}

// ——— обломки, падающие с неба, как в видео-инструкции ———
function makeDust(pos,sc,life){
  var sp=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW,color:0x9aa6a9,transparent:true,
    opacity:0.45,depthWrite:false}));
  sp.scale.set(sc,sc,1);
  sp.position.copy(pos); sp.position.y=Math.max(0.3,pos.y);
  sp.userData.life=life; sp.userData.life0=life; sp.userData.sc=sc;
  scene.add(sp); return sp;
}
function spawnRain(){
  var sz=0.5+Math.random()*1.7;
  var mat=new THREE.MeshLambertMaterial({map:TEX.concrete||null,color:0x39403f});
  var m=new THREE.Mesh(new THREE.BoxGeometry(sz,sz*0.85,sz*0.9),mat);
  m.position.set((Math.random()-0.5)*ROAD_W*0.92,26+Math.random()*14,FOCUS_Z+16-Math.random()*80);
  m.rotation.set(Math.random()*3,Math.random()*3,Math.random()*3);
  m.userData.v=new THREE.Vector3((Math.random()-0.5)*1.5,-8-Math.random()*7,0);
  m.userData.spin=(Math.random()-0.5)*6;
  scene.add(m); RAIN.push(m);
}
// общий шаг эффектов: молния, обвал, обломки с неба, пыль
function updateWorldFx(dt){
  if(pitFx){
    pitFx.t+=dt;
    var k=pitFx.t;
    pitFx.mat.opacity=(k<0.16)?1:Math.max(0,0.95-(k-0.16)*1.9);
    if(k>0.85){ scene.remove(pitFx.bolt); pitFx=null; }
  }
  for(var i=pitPlates.length-1;i>=0;i--){
    var pl=pitPlates[i];
    pl.userData.v.y-=dt*16;
    pl.position.addScaledVector(pl.userData.v,dt);
    pl.rotation.x+=pl.userData.spin*dt; pl.rotation.z+=pl.userData.spin*0.6*dt;
    if(pl.position.y<-PIT.depth-4){ scene.remove(pl); pitPlates.splice(i,1); }
  }
  if(RAIN_ON){
    if(RAIN.length<10) spawnRain();
    for(var j=RAIN.length-1;j>=0;j--){
      var m=RAIN[j];
      m.userData.v.y-=dt*10;
      m.position.addScaledVector(m.userData.v,dt);
      m.rotation.x+=m.userData.spin*dt; m.rotation.z+=m.userData.spin*0.5*dt;
      if(m.position.y<0.25){
        RAIN_DUST.push(makeDust(m.position,1.6+Math.random()*1.6,0.7));
        scene.remove(m); RAIN.splice(j,1);
      }
    }
  }else if(RAIN.length){
    for(var q=RAIN.length-1;q>=0;q--) scene.remove(RAIN[q]);
    RAIN.length=0;
  }
  for(var d=RAIN_DUST.length-1;d>=0;d--){
    var sp=RAIN_DUST[d];
    sp.userData.life-=dt;
    if(sp.userData.life<=0){ scene.remove(sp); RAIN_DUST.splice(d,1); continue; }
    var kk=sp.userData.life/sp.userData.life0;
    sp.material.opacity=0.45*kk;
    var sc2=sp.userData.sc*(1.7-kk);
    sp.scale.set(sc2,sc2,1);
    sp.position.y+=dt*0.9;
  }
}

// ——— разлёт мелких обломков ———
function burst(pos,count){
  count=count||12;
  for(var i=0;i<count;i++){
    var m=new THREE.SpriteMaterial({map:TEX.concrete||null,color:0x667074,
      transparent:true,depthWrite:false});
    var sp=new THREE.Sprite(m);
    var sc=0.22+Math.random()*0.34;
    sp.scale.set(sc,sc*0.9,1);
    sp.position.copy(pos).add(new THREE.Vector3((Math.random()-0.5)*1.8,0.3+Math.random()*1.2,(Math.random()-0.5)*1.8));
    sp.userData.v=new THREE.Vector3((Math.random()-0.5)*9,2+Math.random()*5,(Math.random()-0.5)*9);
    sp.userData.spin=(Math.random()-0.5)*10;
    sp.userData.life=1.1+Math.random()*0.7;
    scene.add(sp); shards.push(sp);
  }
}

// бирюзовые искры на месте собранного кристалла
function spark(pos,count){
  count=count||10;
  var floorY=(phase==='tunnel'||phase==='ladder')?TUN.y+0.1:0.12;
  for(var i=0;i<count;i++){
    var sp=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW,color:0x8ffcf2,
      transparent:true,opacity:0.9,depthWrite:false,blending:THREE.AdditiveBlending}));
    var sc=0.26+Math.random()*0.3;
    sp.scale.set(sc,sc,1);
    sp.position.copy(pos);
    sp.userData.v=new THREE.Vector3((Math.random()-0.5)*4.2,1.6+Math.random()*3.2,(Math.random()-0.5)*4.2);
    sp.userData.spin=(Math.random()-0.5)*6;
    sp.userData.life=0.55+Math.random()*0.35;
    sp.userData.floorY=floorY;
    scene.add(sp); shards.push(sp);
  }
}

// последний участок: если просели энергия или корпус — добавляем кристаллы
function endgameHeal(){
  if(integrity>=99&&energy>=99) return;
  // ставим между препятствиями второй улицы, чтобы не удваивать их в одной точке
  addCrystal(-184,'right',false,0);
  addCrystal(-210,'left',false,0);
  addCrystal(-238,'center',true,0);      // высоко — только прыжком
  addCrystal(-266,'right',false,0);
}

// обломок разлетается на мелкие куски
function shatter(pos,count){
  count=count||12;
  var floorY=(phase==='tunnel'||phase==='ladder')?TUN.y:0;
  for(var i=0;i<count;i++){
    var sz=0.16+Math.random()*0.26;
    var m=chunkMesh(sz,0x4a5256);
    m.position.copy(pos);
    m.userData.v=new THREE.Vector3((Math.random()-0.5)*7.5,1.6+Math.random()*4.6,(Math.random()-0.5)*7.5);
    m.userData.spin=new THREE.Vector3((Math.random()-0.5)*9,(Math.random()-0.5)*9,(Math.random()-0.5)*9);
    m.userData.life=1.5+Math.random()*0.8;
    m.userData.floorY=floorY+0.08;
    scene.add(m); frags.push(m);
  }
}

// ——— управление ———
function doAction(a){
  if(!running||finished)return;
  lastAct=a; lastActAt=tRun;
  if(a==='left'){ laneTarget=-1; holdT=4.0; }
  if(a==='right'){ laneTarget=1; holdT=4.0; }
  if(a==='jump'){ if(jumpT<=0) jumpT=JUMP_D; }
  if(a==='duck'){ if(duckT<=0) duckT=DUCK_D; }
  var btn=document.querySelector('[data-act="'+a+'"]');
  if(btn){ btn.classList.add('on'); setTimeout(function(){ btn.classList.remove('on'); },130); }
  // выход из тоннеля — только по кнопке
  if(a==='jump'&&phase==='tunnel'&&sZ<=TUN.z1+9){ phase='ladder'; phaseT=0; showAlert('Выходим наверх!'); }
}

function bindControls(){
  // только кнопки самого задания 7: в общей странице data-act есть и у служебных кнопок
  var scope=ROOT||document;
  Array.prototype.forEach.call(scope.querySelectorAll('[data-act]'),function(b){
    b.addEventListener('pointerdown',function(ev){ ev.preventDefault(); doAction(b.dataset.act); });
  });
  bindSwipes();
  topBtn=document.getElementById('t7-topview');
  if(topBtn) topBtn.addEventListener('click',function(){
    topView=!topView; this.classList.toggle('on',topView);
    this.textContent=topView?'Вид бегуна':'Вид сверху';
  });
  var fullBtn=document.getElementById('t7-full');
  if(fullBtn) fullBtn.addEventListener('click',requestFull);
}

function bindSwipes(){
  var sx=0,sy=0,st=0,on=false;
  canvas.addEventListener('pointerdown',function(e){ on=true; sx=e.clientX; sy=e.clientY; st=performance.now(); });
  canvas.addEventListener('pointerup',function(e){
    if(!on)return; on=false;
    var dx=e.clientX-sx, dy=e.clientY-sy;
    if(performance.now()-st>900)return;
    if(Math.abs(dx)<26&&Math.abs(dy)<26)return;
    if(Math.abs(dx)>Math.abs(dy)) doAction(dx<0?'left':'right');
    else doAction(dy<0?'jump':'duck');
  });
  canvas.addEventListener('pointercancel',function(){ on=false; });
}

// ——— оценка событий ———
function actOk(need){
  if(need==='jump'&&jumpT>0) return true;
  if(need==='duck'&&duckT>0) return true;
  if(need==='left'&&lane<-0.3) return true;
  if(need==='right'&&lane>0.3) return true;
  var win=(need==='left'||need==='right')?2.5:1.8;
  return lastAct===need && (tRun-lastActAt)<win;
}

function resolvePit(){
  if(actOk('jump')){
    passed++; flash('ok'); playSfx('dodge');
    phase='trip'; phaseT=0; travelled=145.6;
    showAlert('');
  }else{
    failed++; integrity=Math.max(0,integrity-15); shake=1.7;
    flash('hit'); playSfx('hit');
    phase='fall'; phaseT=0;
    showAlert('Провал! Падаем вниз');
    pathTotal=126+94+(MANHOLE_Z-Z_END);
    if(integrity<=0){ integrity=30; setTimeout(function(){ showAlert('Аварийная стабилизация! Корпус восстановлен'); },900); }
  }
  updateHud();
}

window.__t7hits=[];
function judge(e){
  var ok=actOk(e.need);
  window.__t7hits.push({z:e.z,type:e.type,need:e.need,ok:ok,
    lane:+lane.toFixed(2),last:lastAct,age:+(tRun-lastActAt).toFixed(2),sZ:Math.round(sZ),phase:phase});
  var wp=camera.position.clone(); wp.y=Math.max(0.4,camera.position.y-0.4);
  if(ok){
    passed++; flash('ok'); playSfx('dodge');
    var pPos=camera.position.clone();
    pPos.z-=3;
    shatter(pPos,6);
  }else{
    failed++; integrity=Math.max(0,integrity-15);
    energy=Math.max(0,energy-10); shake=2.4;
    flash('hit'); playSfx('hit');
    var hitPos=camera.position.clone();
    hitPos.y-=0.35; hitPos.z-=2.0;
    shatter(hitPos,16);
    showDamage(integrity);
    ensureHealCrystal();
    if(integrity<=0){ integrity=30; showDamage(30); }
  }
  updateHud();
}

// ——— сбор кристалла: капсула восстанавливается и вспыхивает бирюзовым ———
function collectCrystal(c){
  c.taken=true; c.pop=0.0001;
  energy=Math.min(100,energy+5);
  integrity=Math.min(100,integrity+10);
  capFlash=CAP_FLASH;
  flash('ok');
  playSfx('charge');
  spark(c.grp.position,10);
  window.__t7pick=(window.__t7pick||0)+1;
  updateHud();
}

var flashTimer=null;
function flash(kind){
  if(!el.flash)return;
  el.flash.className=kind;
  if(flashTimer)clearTimeout(flashTimer);
  flashTimer=setTimeout(function(){ el.flash.className=''; },260);
}
var alertTimer=null;
function showAlert(text){
  if(!el.alert)return;
  if(!text){ el.alert.classList.remove('show'); return; }
  el.alert.textContent=text;
  el.alert.classList.add('show');
  if(alertTimer)clearTimeout(alertTimer);
  alertTimer=setTimeout(function(){ el.alert.classList.remove('show'); },2200);
}

var dmgUntil=0, dmgBox=null, critPlayed=false;
function showDamage(val){
  if(!dmgBox) dmgBox=document.getElementById('t7-damage');
  var box=dmgBox;
  if(!box)return;
  var crit=val<=30;
  var dmg=Math.max(0,Math.min(100,Math.round(100-val)));
  box.className='show'+(crit?' crit':'');
  box.style.display='block';
  var t=box.querySelector('.t7-dmg-title'), v=box.querySelector('.t7-dmg-val');
  if(t) t.textContent=crit?'Капсула критически повреждена':'Капсула повреждена';
  if(v) v.textContent=dmg+'%';
  if(crit&&!critPlayed){ critPlayed=true; playSfx('crit'); }
  dmgUntil=tRun+(crit?3.6:2.2);
}

function hideDamageIfDue(){
  if(!dmgBox||!dmgUntil) return;
  if(tRun>dmgUntil){
    dmgBox.className='';
    dmgBox.style.display='none';
    dmgUntil=0;
  }
}

function zoneName(){
  if(phase==='bridge')return 'Мост';
  if(phase==='street1')return 'Улица';
  if(phase==='trip'||phase==='fall')return 'Провал';
  if(phase==='tunnel'||phase==='ladder')return 'Тоннель';
  if(phase==='route'){ var zz=sZ; if(zz<Z_TUNB_A) return 'Тоннель'; if(zz<Z_BRIDGE_B+4) return 'Мост'; if(zz<Z_BRIDGE_A) return 'Мост'; return 'Поворот'; }
  return 'Улица';
}

function updateHud(){
  if(el.prog) el.prog.textContent=Math.round(Math.min(1,Math.max(0,travelled/pathTotal))*100)+'%';
  if(el.time) el.time.textContent=Math.max(0,Math.ceil(DURATION-tRun));
  if(el.energy) el.energy.textContent=Math.round(energy)+'%';
  if(el.integrity){
    el.integrity.textContent=Math.round(integrity)+'%';
    el.integrity.className=integrity<=30?'bad':(integrity<=60?'warn':'');
  }
  if(el.zone) el.zone.textContent=zoneName();
}

// ——— камера ———
var camPos=new THREE.Vector3(), lookAt=new THREE.Vector3(), tmpF=new THREE.Vector3();

function laneLimit(){
  // в шахте выхода и у лестницы коридор узкий (2,5 м) — иначе влево/вправо уносит за стены, в пустоту
  if(phase==='ladder') return 0.55;
  if(phase==='tunnel') return (sZ<TUN.z1+5)?0.55:1.45;
  return LANE_X;
}
var laneLimitNow=LANE_X;
function updateLaneLimit(dt){
  var want=laneLimit();
  laneLimitNow+=(want-laneLimitNow)*Math.min(1,dt*5);
}

function updateCamera(dt){
  updateLaneLimit(dt);
  var x=lane*laneLimitNow, y=EYE, z=sZ, focusDy=0, roll=-lane*0.16;
  var jumpK=jumpT>0?Math.sin(Math.PI*(1-jumpT/JUMP_D)):0;
  var duckY=duckT>0?Math.min(1,duckT/DUCK_D*1.6)*1.06:0;
  var bob=Math.sin(tRun*8.2)*0.022;

  if(phase==='street1'||phase==='street2'){
    y=EYE+bob+jumpK*2.25-duckY;
    focusDy=jumpK>0.03?-1.0*jumpK:-0.02;
  } else if(phase==='trip'){
    var k=Math.min(1,phaseT/TRIP_D);
    y=EYE+Math.sin(Math.PI*k)*2.95;
    focusDy=-2.6;
  } else if(phase==='fall'){
    var k2=Math.min(1,phaseT/FALL_D);
    y=EYE+(TUN.y+1.7-EYE)*(k2*k2);
    z=PIT.z+(1-Math.min(1,phaseT*3))*(sZ-PIT.z);
    focusDy=-3.6; roll=0.05;
  } else if(phase==='tunnel'){
    y=TUN.y+1.7+bob+jumpK*0.6-duckY;
    focusDy=0.05-duckY*0.35;
  } else if(phase==='ladder'){
    var k3=Math.min(1,phaseT/LADDER_D);
    y=TUN.y+1.7+(EYE-TUN.y-1.7)*easeOut(k3);
    focusDy=2.6*(1-k3);
    z=TUN.z1+1.3;
  } else if(phase==='route'){
    y=routeY(z)+EYE+bob+jumpK*2.25-duckY;
    focusDy=jumpK>0.03?-1.0*jumpK:-0.02;
    x=routeX(z)+lane*laneLimitNow;
  } else if(phase==='done'){
    y=EYE+bob;
  }

  if(shake>0){
    x+=(Math.random()-0.5)*shake*0.5;
    y+=(Math.random()-0.5)*shake*0.4;
    shake=Math.max(0,shake-dt*1.4);
  }

  camPos.set(x,y,z);
  camera.position.copy(camPos);

  if(phase==='route') tmpF.set(routeX(z-9)+lane*laneLimitNow*1.25, y+focusDy, z-9);
  else tmpF.set(x*1.25,y+focusDy,z-9);
  lookAt.copy(tmpF);
  camera.lookAt(lookAt);
  camera.rotateZ(roll);

  if(capPlane){
    var duckK=duckT>0?Math.min(1,duckT/DUCK_D*1.7):0;
    capPlane.visible=!OBSERVE&&topMix<0.5&&phase!=='fall'&&duckK<0.45;
    capPlane.position.set(-lane*0.10+(shake>0?(Math.random()-0.5)*shake*0.06:0),
                          -0.60+bob*0.6+jumpK*0.05-duckK*0.75+(shake>0?(Math.random()-0.5)*shake*0.05:0),
                          -1.0);
    capPlane.rotation.z=Math.sin(tRun*5.2)*0.014-lane*0.05;
    capPlane.material.opacity=(CAPSULE3D&&CAP_OK)?0:1;
    // вспышка бирюзовым при восстановлении от кристалла
    var cf=capFlash>0?(capFlash/CAP_FLASH):0;
    if(cf>0){
      capFlash=Math.max(0,capFlash-dt);
      capPlane.material.color.setRGB(0.82+cf*3.4,0.82+cf*5.6,0.82+cf*5.4);
    }else{
      capPlane.material.color.setRGB(0.82,0.82,0.82);
    }
    if(capGlow){
      capGlow.visible=capPlane.visible;
      capGlow.material.opacity=cf>0?Math.min(0.95,cf*1.15):0;
      var gs=1.25+cf*1.9;
      capGlow.scale.set(gs,gs,1);
    }
    var wantTex=capsuleTextureName();
    if(capPlane.userData.tex!==wantTex&&TEX[wantTex]){
      capPlane.material.map=TEX[wantTex];
      capPlane.material.needsUpdate=true;
      capPlane.userData.tex=wantTex;
    }
    // если загрузилась настоящая 3D-капсула с руками — покачивание берём от плоскости
    if(CAPSULE3D){
      // если модель не встала в кадр (CAP_OK=false) — показываем плоскую картинку, а не пустое место
      CAPSULE3D.visible=capPlane.visible&&CAP_OK;
      var dy=(capPlane.position.y+0.60)*0.22;
      CAPSULE3D.position.set(capPlane.position.x*0.22,CAPBASEY+dy,0);
      CAPSULE3D.rotation.z=capPlane.rotation.z;
      var dmgLvl=integrity>60?0:(integrity>30?1:2);
      if(dmgLvl!==CAPSULE_DMG){ CAPSULE_DMG=dmgLvl; tintCapsuleModel(dmgLvl); }
      setCapsuleEmissive(cf);
    }
  }

  if(torch) torch.intensity=(phase==='fall'||phase==='ladder')?1.1:0;

  // затемнение в падении
  if(el.dark){
    el.dark.style.opacity=(phase==='fall'
      ?Math.min(0.45,Math.sin(Math.PI*Math.min(1,phaseT/FALL_D))*0.45):0).toFixed(3);
  }

  // вид наблюдателя сверху
  topMix+=((topView?1:0)-topMix)*Math.min(1,dt*4);
  if(topMix>0.002){
    var high=camPos.clone(); high.y+=26; high.z+=6;
    camera.position.lerp(high,topMix);
    var downTarget=new THREE.Vector3(camPos.x,0,camPos.z-12);
    camera.lookAt(lookAt.clone().lerp(downTarget,topMix));
  }

  // поле зрения: в тоннеле шире
  var inTun=(phase==='tunnel'||phase==='ladder')||(phase==='route'&&inTunnelB(sZ));
  var want=inTun?82:74;
  fovTarget+= (want-fovTarget)*Math.min(1,dt*3);
  if(Math.abs(camera.fov-fovTarget)>0.05){
    camera.fov=fovTarget; camera.updateProjectionMatrix();
  }
  // дымка: на улице мягче, в тоннеле плотнее
  var dens=inTun?0.055:0.017;
  var fogCol=inTun?0x27343a:0x3b4a52;
  scene.fog.density+= (dens-scene.fog.density)*Math.min(1,dt*2.5);
  scene.fog.color.lerp(new THREE.Color(fogCol),Math.min(1,dt*2.5));
}

// ——— шаг игры ———
function step(dt){
  if(!running||finished){ phaseT+=dt; return; }
  tRun+=dt; phaseT+=dt;

  holdT=Math.max(0,holdT-dt);
  if(holdT<=0) laneTarget=0;
  lane+=(laneTarget-lane)*Math.min(1,dt*14);
  jumpT=Math.max(0,jumpT-dt);
  duckT=Math.max(0,duckT-dt);

  if(phase==='street1'){
    var dz=RUN_SPEED*dt; sZ-=dz; travelled+=dz;
    FOCUS_Z=sZ; RAIN_ON=true;
    if(travelled>66) birthPit();          // провал рождается на глазах
    if(!pitWarned&&travelled>88){ pitWarned=true; emitHint('Впереди провал — перепрыгнуть','hazard'); }
    if(travelled>=126){ pitWarned=false; resolvePit(); }
  } else if(phase==='trip'){
    var k=Math.min(1,phaseT/TRIP_D);
    sZ=lerp(Z_PIT_EDGE+1,Z_STREET2_JUMP,k); FOCUS_Z=sZ; RAIN_ON=true;
    if(k>=1){ phase='street2'; phaseT=0; endgameHeal(); showAlert('Дальше по улице'); }
  } else if(phase==='fall'){
    if(phaseT>=FALL_D){ phase='tunnel'; phaseT=0; sZ=TUN.z0; travelled=126+1;
      buildTunnel(); buildTunnelEvents(); showAlert('Под землёй. Бежим к свету'); }
  } else if(phase==='tunnel'){
    FOCUS_Z=sZ; RAIN_ON=false;
    if(sZ>TUN.z1+2){ var dz2=TUN_SPEED*dt; sZ-=dz2; travelled+=dz2; }
    else if(!exitHint){
      exitHint=true;
    }
    if(sZ<TUN.z1){ sZ=TUN.z1; }
  } else if(phase==='ladder'){
    if(phaseT>=LADDER_D){
      phase='street2'; phaseT=0; sZ=MANHOLE_Z; travelled=126+94;
      endgameHeal();
      showAlert('Снова на улице!');
    }
  } else if(phase==='street2'){
    var dz3=RUN_SPEED*dt; sZ-=dz3; travelled+=dz3;
    FOCUS_Z=sZ; RAIN_ON=true;
    if(sZ<=Z_END+8) finish();
      } else if(phase==='route'){
    var dz4=RUN_SPEED_B*dt; sZ-=dz4; travelled+=dz4;
    FOCUS_Z=sZ; RAIN_ON=!inTunnelB(sZ);
    if(sZ<=Z_FINISH) finish();
  }

  if(tRun>=DURATION&&!finished) finish();

  // события по расстоянию
  events.forEach(function(e){
    if(e.type==='pit')return;
    var dist=Math.abs(sZ-e.z);
    if(!e.warned&&sZ-e.z<34&&sZ-e.z>-1){ e.warned=true;
      emitHint(e.text||'Опасность впереди','hazard'); }
    if(!e.done&&sZ<=e.z){ e.done=true; judge(e); }
    // падающие обломки
    if(e.pieces&&e.pieces.length){
      var ahead=sZ-e.z;                     // >0 — ещё впереди
      e.pieces.forEach(function(pc){
        if(ahead>18||ahead<-3){ pc.visible=false; return; }
        var k2=clamp((18-ahead)/18,0,1);
        pc.visible=!e.done;
        pc.position.set(pc.userData.off*(1-k2*0.6),
                        e.baseY+e.fallH*Math.pow(1-k2,2.2)+0.55,
                        e.z+pc.userData.dl);
        pc.rotation.set(k2*2.6,k2*1.9,k2*1.2);
      });
    }
  });

  // кристаллы: берутся ДЕЙСТВИЕМ — подъехать в сторону или прыгнуть вверх
  var capX=lane*laneLimitNow;
  crystals.forEach(function(c){
    if(c.taken)return;
    c.grp.rotation.y+=dt*1.35;
    c.bob+=dt*2;
    c.grp.position.y=c.yBase+Math.sin(c.bob)*0.13;
    // подсказка наблюдателям заранее, за 26–58 м до кристалла
    if(!c.hinted&&(sZ-c.z)>26&&(sZ-c.z)<58){
      c.hinted=true;
      emitHint('Кристалл '+(c.side==='left'?'слева':(c.side==='right'?'справа':'сверху'))+
        (c.high?' — прыжок':''),'crystal');
    }
    if(phase!=='street1'&&phase!=='street2'&&phase!=='tunnel')return;
    if(Math.abs(sZ-c.z)>1.7)return;
    var dx=Math.abs(capX-c.x);
    if(c.high){
      if(jumpT<=0)return;              // верхний кристалл достаётся только прыжком
      if(dx>1.35)return;
    }else if(dx>1.15)return;           // к боковому надо подъехать в его сторону
    collectCrystal(c);
  });

  // собранный кристалл вспыхивает на своём месте и гаснет — к капсуле не летит
  crystals.forEach(function(c){
    if(!c.pop)return;
    c.pop=Math.min(1,c.pop+dt*2.8);
    var k=c.pop;
    c.grp.scale.setScalar(Math.max(0.06,1-k*0.94));
    c.grp.position.y=c.yBase+Math.sin(c.bob)*0.13+k*0.5;
    c.shell.opacity=0.82*(1-k);
    c.core.opacity=0.92*(1-k);
    c.glow.material.opacity=0.30*(1-k)+0.55*Math.sin(Math.PI*k);
    if(k>=1){ c.grp.visible=false; c.pop=0; }
  });

  // дым/туман дышит
  mists.forEach(function(m){
    m.position.y=m.userData.base+Math.sin(tRun*m.userData.sp+m.userData.ph)*0.7;
    m.material.opacity=0.16+0.10*(0.5+0.5*Math.sin(tRun*0.6+m.userData.ph));
  });

  // свет в тоннеле — три ближайшие лампы
  if(tunnelLightPool.length&&tunnelLamps.length){
    var sorted=tunnelLamps.slice().sort(function(a,b){ return Math.abs(a-sZ)-Math.abs(b-sZ); });
    for(var i=0;i<tunnelLightPool.length;i++){
      var lz=sorted[i]!==undefined?sorted[i]:TUN.z1;
      tunnelLightPool[i].position.set(0,TUN.y+TUN.h-0.4,lz);
    }
  }

  // мелкие куски обломков
  for(var fi=frags.length-1; fi>=0; fi--){
    var fr=frags[fi];
    fr.userData.life-=dt;
    if(fr.userData.life<=0){ scene.remove(fr); frags.splice(fi,1); continue; }
    fr.userData.v.y-=dt*17;
    fr.position.addScaledVector(fr.userData.v,dt);
    if(fr.position.y<fr.userData.floorY){
      fr.position.y=fr.userData.floorY;
      fr.userData.v.y*=-0.34; fr.userData.v.x*=0.68; fr.userData.v.z*=0.68;
    }
    fr.rotation.x+=fr.userData.spin.x*dt;
    fr.rotation.y+=fr.userData.spin.y*dt;
    fr.rotation.z+=fr.userData.spin.z*dt;
  }

  // осколки
  for(var si=shards.length-1; si>=0; si--){
    var s=shards[si];
    s.userData.life-=dt;
    if(s.userData.life<=0){ scene.remove(s); shards.splice(si,1); continue; }
    s.userData.v.y-=dt*18;
    s.position.addScaledVector(s.userData.v,dt);
    var sfy=(s.userData.floorY!==undefined)?s.userData.floorY:0.12;
    if(s.position.y<sfy){ s.position.y=sfy; s.userData.v.y*=-0.35; s.userData.v.x*=0.7; s.userData.v.z*=0.7; }
    s.material.rotation+=s.userData.spin*dt;
    s.material.opacity=Math.min(1,s.userData.life);
  }

  hideDamageIfDue();
  updateHud();
  // процент пути для наблюдателей — раз в секунду, чтобы их вид двигался плавно, без рывков
  if(ONPROG&&(tRun-lastProgAt)>1){
    lastProgAt=tRun;
    try{ ONPROG(Math.min(100,Math.round(travelled/pathTotal*100))); }catch(e){}
    // где именно находится Бегун: по одним процентам провал и тоннель у наблюдателя не видны.
    // Вид подсказки база разрешает только 'hazard' и 'crystal', поэтому точку кладём
    // в текст с меткой POS| — с видом 'pos' запись отклонялась и наблюдатель её не получал.
    try{ if(ONHINT) ONHINT({text:'POS|'+phase+'|'+sZ.toFixed(1),kind:'crystal'}); }catch(e){}
  }
}

// ——— главный цикл ———
function tick(){
  if(!alive){ rafId=0; return; }
  rafId=requestAnimationFrame(tick);
  var dt=Math.min(0.05,clock.getDelta());
  if(OBSERVE){ observeStep(dt); updateWorldFx(dt); renderer.render(scene,camera); return; }
  step(dt);
  updateCamera(dt);
  updateWorldFx(dt);
  renderer.render(scene,camera);
  // капсула в руках — поверх сцены, своей сценой с узким объективом
  if(CAPSCENE&&CAPCAM&&CAPSULE3D&&CAPSULE3D.visible){
    renderer.autoClear=false;
    renderer.clearDepth();
    renderer.render(CAPSCENE,CAPCAM);
    renderer.autoClear=true;
  }
}

// Экран наблюдателя: камера чуть позади и выше Бегуна, под углом вперёд —
// видно улицу в объёме, самого Бегуна и препятствия впереди него.
function observeStep(dt){
  obsT+=dt;
  PROG+=(PROG_T-PROG)*Math.min(1,dt*3.0);
  var z=Z_START-(Z_START-Z_END)*(PROG/100);
  // Бегун присылает свою настоящую точку: провал и тоннель у наблюдателя встают на место
  if(OBS_Z_TARGET!==null && (obsT-OBS_Z_AT)<10){
    if(OBS_ZS===null || Math.abs(OBS_ZS-OBS_Z_TARGET)>25) OBS_ZS=OBS_Z_TARGET;
    else OBS_ZS+=(OBS_Z_TARGET-OBS_ZS)*Math.min(1,dt*5);
    z=OBS_ZS;
  } else if(OBS_Z_TARGET!==null){
    // точка на секунду пропала — держим последнюю, а не прыгаем по процентам
    z=OBS_Z_TARGET;
  }
  // под землёй — только если Бегун сам на этапе тоннеля или лестницы,
  // по одной координате нельзя: улица идёт над тоннелем
  var inPitTun=obsUnder(z);
  if(inPitTun){                        // тоннель и его препятствия нужны и наблюдателю
    buildTunnel(); buildTunnelEvents(); syncObsTags();
  }
  FOCUS_Z=z; RAIN_ON=(PROG<39||PROG>72);
  if(PROG>24) birthPit();
  // камера позади Бегуна и выше него, но смотрит дальше вперёд (на 46 м, было 20):
  // в кадр попадает больше дороги, препятствия видны раньше, сам Бегун остаётся внизу кадра
  var camZ=z+5.5;
  if(camZ>Z_START+20) camZ=Z_START+20;
  if(camZ<Z_END+14) camZ=Z_END+14;
  // в тоннеле камера опускается под потолок, иначе смотрит на его крышу
  var inT = inTunnelB(camZ)||inTunnelB(z);
  if(inT && camZ>z+3) camZ=z+3;
  if(inPitTun) camZ=z+3.0;                       // в тоннеле камера ближе: под потолком не развернуться
  var baseCam=inPitTun?TUN.y:routeY(camZ), baseRun=inPitTun?TUN.y:routeY(z-40);
  camera.position.set(routeX(camZ),baseCam+(inPitTun?1.7:(inT?2.4:3.5)),camZ);
  camera.lookAt(routeX(z-46),baseRun+(inPitTun?1.1:(inT?1.0:1.6)),z-46);
  if(scene.fog) scene.fog.density=0.0028;
  // надписи считаем по свежей точке Бегуна (сглаженная отстаёт и задерживала подсказки)
  var zTag=(OBS_Z_TARGET!==null && (obsT-OBS_Z_AT)<10)?OBS_Z_TARGET:z;
  updateObserverMarkers(dt,z,zTag);
  // капсула в руках — только у Бегуна, наблюдателю она не нужна
  if(capPlane) capPlane.visible=false;
  if(CAPSULE3D) CAPSULE3D.visible=false;
}

// ——— полноэкранный режим и горизонтальная ориентация ———
function lockLandscape(){
  try{
    if(screen.orientation&&screen.orientation.lock){
      var p=screen.orientation.lock('landscape');
      if(p&&p['catch'])p['catch'](function(){});
    }
  }catch(e){}
}
function requestFull(){
  var st=document.getElementById('t7-stage');
  var fn=st.requestFullscreen||st.webkitRequestFullscreen||st.mozRequestFullScreen||st.msRequestFullscreen;
  if(fn){
    try{
      var p=fn.call(st);
      if(p&&p.then) p.then(lockLandscape)['catch'](function(){});
      else lockLandscape();
    }catch(e){ lockLandscape(); }
  }else lockLandscape();
}
function updateOrient(){
  var el2=document.getElementById('t7-rotate');
  if(!el2)return;
  el2.classList.toggle('show',window.innerHeight>window.innerWidth+8);
}

// ——— запуск ———
function reset(){
  if(SEG==='B'){
    phase='route'; phaseT=0; sZ=Z_TURN+10; tRun=0; travelled=0;
    pathTotal=Math.abs(Z_TURN+10-Z_FINISH);
  } else {
    phase='street1'; phaseT=0; sZ=Z_START; tRun=0; travelled=0;
    pathTotal=(Z_START-Z_STREET2_JUMP)+(Z_STREET2_JUMP-Z_END);
  }
    lane=0; laneTarget=0; holdT=0; jumpT=0; duckT=0; shake=0;
  lastAct=''; lastActAt=-9; integrity=100; energy=100; passed=0; failed=0;
  finished=false; exitHint=false; pitWarned=false; topView=false; topMix=0;
  if(topBtn){ topBtn.classList.remove('on'); topBtn.textContent='Вид сверху'; }
  // провал снова закрыт: он рождается заново на каждом проходе
  PIT_BORN=false;
  if(PIT_COVER) PIT_COVER.visible=true;
  if(PIT_EDGE) PIT_EDGE.visible=false;
  if(pitFx){ scene.remove(pitFx.bolt); pitFx=null; }
  pitPlates.forEach(function(p){ scene.remove(p); }); pitPlates.length=0;
  events.forEach(function(e){
    e.done=false; e.warned=false;
    if(e.pieces) e.pieces.forEach(function(p){ p.visible=false; });
  });
  crystals.forEach(function(c){ c.taken=false; c.pop=0; c.grp.visible=true;
    c.grp.scale.setScalar(1); c.grp.position.set(c.x,c.yBase,c.z); c.grp.rotation.set(0,0,0);
    c.shell.opacity=0.82; c.core.opacity=0.92; c.glow.material.opacity=0.30; });
  capFlash=0; window.__t7pick=0; laneLimitNow=LANE_X;
  if(capGlow){ capGlow.material.opacity=0; capGlow.visible=true; }
  shards.forEach(function(s){ scene.remove(s); }); shards.length=0;
  frags.forEach(function(f2){ scene.remove(f2); }); frags.length=0;
  if(!dmgBox) dmgBox=document.getElementById('t7-damage');
  if(dmgBox){ dmgBox.className=''; dmgBox.style.display='none'; }
  dmgUntil=0; critPlayed=false;
  if(el.dark) el.dark.style.opacity=0;
  if(capPlane){ capPlane.userData.tex='capsule';
    if(TEX.capsule){ capPlane.material.map=TEX.capsule; capPlane.material.needsUpdate=true; } }
  CAPSULE_DMG=-1; tintCapsuleModel(0);
    updateHud(); showAlert('');
}

function start(){
  if(!scene) return;
  requestFull(); updateOrient();
  reset(); running=true;
  if(!SFX.amb) loadSounds();
  try{ SFX.amb.currentTime=0; var p=SFX.amb.play(); if(p&&p.catch)p.catch(function(){}); }catch(e){}
  try{ SFX.music.currentTime=0; var pm=SFX.music.play(); if(pm&&pm.catch)pm.catch(function(){}); }catch(e){}
  if(el.start) el.start.classList.add('hidden');
  if(el.end) el.end.classList.add('hidden');
}

function finish(){
  if(finished)return;
  finished=true; running=false; phase='done';
  // капсула и энергия растут только от собранных кристаллов
  try{ SFX.amb.pause(); }catch(e){}
  try{ SFX.music.pause(); }catch(e){}
  if(el.endTitle) el.endTitle.textContent=failed===0?'Маршрут пройден без ошибок':'Маршрут пройден';
  if(el.endText) el.endText.textContent='Корпус капсулы: '+Math.round(integrity)+'%. Энергия: '+
    Math.round(energy)+'%. Успешных действий: '+passed+', ошибок: '+failed+'.';
  if(el.end) el.end.classList.remove('hidden');
  if(onFinishCb){
    try{ onFinishCb({energy:Math.round(energy),integrity:Math.round(integrity),
      passed:passed,failed:failed}); }catch(e){}
  }
}

function bindButtons(){
  playBtn=document.getElementById('t7-play');
  againBtn=document.getElementById('t7-again');
  if(playBtn) playBtn.addEventListener('click',beginRun);
  if(againBtn) againBtn.addEventListener('click',start);
}

// Бегун нажал «Начать бег» на экране «Ты Бегун»: сообщаем команде стадию бега и стартуем.
function beginRun(){
  if(STARTED) return;
  STARTED=true; STAGE='run';
  if(ONSTART){ try{ ONSTART(); }catch(e){} }
  applyStage();
  start();
}

// отладочная перестановка (для просмотра вида, в игре не используется)
window.__t7=function(mode){
  running=true; reset(); running=true;
  if(mode==='pit'){ travelled=118; sZ=Z_PIT_EDGE+4; }
  else if(mode==='pitfall'){ travelled=126; resolvePit(); }
  else if(mode==='inpit'){ travelled=126; phase='fall'; phaseT=FALL_D*0.55; }
  else if(mode==='tunnel'){ travelled=126; buildTunnel(); buildTunnelEvents();
    phase='tunnel'; phaseT=0; sZ=TUN.z0-30; }
  else if(mode==='street2'){ travelled=200; phase='street2'; phaseT=0; sZ=-240; }
  else if(mode==='crystal'){ travelled=36; phase='street1'; phaseT=0; sZ=-34; }
  else if(mode==='hurt'){ integrity=25; showDamage(25); updateHud(); }
  else if(mode==='debris'){ travelled=52; phase='street1'; phaseT=0; sZ=-46; }
  else if(mode==='tundebris'){ travelled=126; buildTunnel(); buildTunnelEvents();
    phase='tunnel'; phaseT=0; sZ=TUN.z0-26; }
  else if(mode==='tunelexit'){ travelled=126; buildTunnel(); buildTunnelEvents();
      phase='tunnel'; phaseT=0; sZ=TUN.z1+4; }
    else if(mode==='turn'){ phase='route'; phaseT=0; sZ=-322; buildRouteB(); }
    else if(mode==='bridge'){ phase='route'; phaseT=0; sZ=-390; buildRouteB(); }
    else if(mode==='tunb'){ phase='route'; phaseT=0; sZ=-510; buildRouteB(); }
  // при переходе в отладке считаем пройденные события уже сработавшими
  events.forEach(function(e){ if(e.z>sZ) e.done=true; e.warned=false; });
  updateHud();
};

window.__t7dbg=function(){ return {tex:capPlane?capPlane.userData.tex:null,
  integ:integrity, energy:energy, running:running, finished:finished, phase:phase,
  sZ:Math.round(sZ), tRun:+tRun.toFixed(2),
  ev:events.map(function(e){return e.z+':'+e.type+':'+e.need+(e.done?'+':'-');}),
  cr:crystals.map(function(c){return Math.round(c.z)+'/'+c.side+(c.high?'H':'L')+'/'+(c.taken?'T':'F')+
    '/'+(c.grp.visible?'V':'H')+'/'+c.grp.scale.x.toFixed(2)+'/'+c.grp.position.x.toFixed(1)+'/'+c.grp.position.y.toFixed(1);}),
  picks:(window.__t7pick||0),
  arrow:OBS_ARROW?[OBS_ARROW.visible,+OBS_ARROW.position.x.toFixed(1),+OBS_ARROW.position.y.toFixed(2),+OBS_ARROW.position.z.toFixed(1),
    (function(){var v=OBS_ARROW.position.clone().project(camera);return [+(v.x*0.5+0.5).toFixed(2),+(0.5-v.y*0.5).toFixed(2),+v.z.toFixed(2)];})()]:null,
  evN:events.length, obsZ:OBS_Z_TARGET, obsZS:(OBS_ZS===null?null:+OBS_ZS.toFixed(1))}; };

// ——— запуск сцены ———
function bootScene(){
  if(booted) return;
  if(!window.THREE){ if(note)note.textContent='Не загрузилась 3D-библиотека (vendor/three.min.js)'; return; }
  booted=true;
  try{
    renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:false,powerPreference:'high-performance'});
  }catch(err){
    booted=false;
    if(note)note.textContent='Этот телефон не поддерживает объёмную графику. Нужен запасной простой режим.';
    return;
  }
  renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
  renderer.setSize(window.innerWidth,window.innerHeight,false);
  renderer.outputEncoding=THREE.sRGBEncoding;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=0.92;

  clock=new THREE.Clock();
  if(note)note.textContent='Загрузка улицы…';
  if(playBtn) playBtn.disabled=true;
  loadAll(function(){
    build();
        if(SEG==='A') buildEvents();
        if(OBSERVE) hideRunnerUI();
        if(OBSERVE&&SEG==='A') buildObserverMarkers();
    updateHud();
    if(note)note.textContent='';
    if(playBtn) playBtn.disabled=false;
    tick();
  });

  if(!listenersBound){
    listenersBound=true;
    window.addEventListener('orientationchange',function(){ setTimeout(updateOrient,220); });
    window.addEventListener('resize',function(){
      updateOrient();
      if(!camera||!renderer) return;
      camera.aspect=window.innerWidth/Math.max(1,window.innerHeight);
      camera.updateProjectionMatrix();
      if(CAPSCENE) frameCapsule();
      renderer.setSize(window.innerWidth,window.innerHeight,false);
    });
  }
}

// ——— подключение к общему квесту: mount(container, {mode, stage, role, isCaptain, runnerName, onHint, onProgress, onStartRun, onFinish}) ———
function mount(container,opts){
  if(ROOT) unmount();
  opts=opts||{};
  onFinishCb=opts.onFinish||null;
  ONHINT=opts.onHint||null;
  ONPROG=opts.onProgress||null;
  ONSTART=opts.onStartRun||null;
  MODE=(opts.mode==='observer')?'observer':'runner';
  OBSERVE=(MODE==='observer');
  ROLE=opts.role||MODE;
  ISCAP=!!opts.isCaptain;
  STAGE=opts.stage||'intro';
  PROG=opts.progress||0;
  OBS_RUNNER_NAME=opts.runnerName||'';
  obsT=0; lastProgAt=-9; introDone=false; introV=null; STARTED=false;
  ROUND=opts.round||0;
  { var m=String(location.search||'').match(/[?&]round=(\d+)/); if(m) ROUND=parseInt(m[1],10); }
  SEG=(ROUND%2===0)?'A':'B';
  ROOT=document.createElement('div');
  ROOT.className='t7-root'+(OBSERVE?' t7-observer':'');
  ROOT.innerHTML=T7_HTML;
  (container||document.body).appendChild(ROOT);
  // долгое нажатие не должно выделять текст и открывать меню «Найти в Яндексе / Спросить у Алисы»
  ['contextmenu','selectstart','dragstart'].forEach(function(ev){
    ROOT.addEventListener(ev,function(e){ e.preventDefault(); },{passive:false});
  });
  alive=true;
  fillDom();
  if(opts.title){ var h=document.getElementById('t7-start-title'); if(h)h.textContent=opts.title; }
  if(opts.text){ var p=document.getElementById('t7-start-text'); if(p)p.textContent=opts.text; }
  bindButtons();
  if(!OBSERVE) bindControls();
  bootScene();
  applyStage();
  return ROOT;
}

function unmount(){
  alive=false;
  if(rafId){ cancelAnimationFrame(rafId); rafId=0; }
  try{ if(SFX.amb) SFX.amb.pause(); }catch(e){}
  try{ if(SFX.music) SFX.music.pause(); }catch(e){}
  running=false; finished=false;
  if(renderer){ try{ renderer.dispose(); }catch(e){} renderer=null; }
  scene=null; camera=null; clock=null; booted=false;
  if(ROOT&&ROOT.parentNode) ROOT.parentNode.removeChild(ROOT);
  ROOT=null; canvas=null; note=null; el={}; playBtn=null; againBtn=null; topBtn=null;
  onFinishCb=null; ONHINT=null; ONPROG=null; ONSTART=null; introV=null; introDone=false;
  MODE='runner'; OBSERVE=false; STAGE='intro'; PROG=0; ISCAP=false; obsT=0; lastProgAt=-9;
  STARTED=false; OBS_RUNNER_GRP=null; OBS_PULSE.length=0; OBS_MARKS.length=0; OBS_ICON_TEX={};
  OBS_HUMAN=null; CAPSULE3D=null; CAPSULE_MATS=null; CAPSULE_DMG=-1; CAP_OK=false;
  CAPSCENE=null; CAPCAM=null; CAPSIZE=null; CAPBASEY=0; RUNNER_ARMS=[];
  tunnelBuilt=false; tunnelEventsDone=false; tunnelGroup=null; tunnelLamps=[]; tunnelLightPool=[];
  events.length=0; crystals.length=0; bEvents.length=0; bCrystals.length=0;
  OBS_TAGS.length=0; OBS_ARROW=null; OBS_Z_TARGET=null; OBS_ZS=null; OBS_Z_AT=-99;
  if(RUNNER_MIXER){ try{ RUNNER_MIXER.stopAllAction(); }catch(e){} RUNNER_MIXER=null; }
}

return {mount:mount, unmount:unmount, version:VER,
  setStage:setStage, setHint:setHint, setProgress:setProgress, setRunnerName:setRunnerName,
  mode:function(){ return MODE; }, stage:function(){ return STAGE; } };
})();
