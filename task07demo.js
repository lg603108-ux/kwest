/* task07demo.js — задание 7, 3D-участок «Прорыв». Версия 0318i.
   Новая архитектура (после отказа от 0317a): НЕ одна лента дороги, а отдельные участки.
   Каждый участок строит свою геометрию в своём месте; маршрут бегуна — прямая внутри участка.
     1) улица 1 (z 6..-120) — дома из фотографий, мокрый асфальт, деревья, фонари, обломки;
     2) провал (z -128) — дыра в асфальте: рваные плиты, арматура, стенки вниз, свечение и дым;
     3) тоннель (y -9.4) — отдельная комната: серый кирпич, трубы, лампы, лужи, лестница и люк;
     4) улица 2 (z -140/-212..-300) — продолжение улицы после провала или после люка.
   Провал: перепрыгнул — бегу дальше; не перепрыгнул — падаю вниз, бегу по тоннелю,
   выхожу наверх ТОЛЬКО по кнопке «Прыгнуть».
   Кнопки и свайпы работают в любой момент, оценка — по нажатию, а не по положению камеры. */
(function(){
'use strict';

var VER='0318i';
var note=document.getElementById('t7-loadnote');
if(!window.THREE){ if(note)note.textContent='Не загрузилась 3D-библиотека (vendor/three.min.js)'; return; }

// ——— параметры мира, метры ———
var DURATION=60;                 // длительность пробного хода
var EYE=1.72;                    // высота глаз бегуна
var ROAD_W=13;                   // ширина дороги
var WALK=4.0;                    // ширина тротуара
var LANE_X=2.6;                  // насколько уходим в сторону при манёвре (кристалл стоит на 2.35)
var RUN_SPEED=6.6;               // скорость бега по улице, м/с
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
  facades:['assets/task07/facade1.jpg','assets/task07/facade2.jpg',
           'assets/task07/facade3.jpg','assets/task07/facade4.jpg']
};
var TEX={};

// ——— звук ———
// Правило: один звук = одно событие. Никакие два события не играют один и тот же файл.
//   hit    — удар обломка / повреждение капсулы / падение в провал — ЗВОН;
//   dodge  — успешный уход от обломка или прыжок через провал — короткий свист воздуха;
//   charge — сбор кристалла (капсула восстанавливается) — нарастающая зарядка;
//   crit   — критическое повреждение, один раз за проход;
//   amb    — фон улицы, music — музыка этапа.
var SFX={};
function loadSounds(){
  try{
    SFX.hit=new Audio('assets/task07/sfx_capsule_damage.mp3');
    SFX.hit.volume=0.85;
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
  }catch(e){ SFX={}; }
}
function playSfx(k){
  var s=SFX[k]; if(!s)return;
  try{ s.currentTime=0; var p=s.play(); if(p&&p.catch)p.catch(function(){}); }catch(e){}
}

// ——— сцена ———
var canvas=document.getElementById('t7-canvas');
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
var el={prog:document.getElementById('t7-progress'),time:document.getElementById('t7-time'),
  energy:document.getElementById('t7-energy'),integrity:document.getElementById('t7-integrity'),
  zone:document.getElementById('t7-zone'),alert:document.getElementById('t7-alert'),
  flash:document.getElementById('t7-flash'),dark:document.getElementById('t7-dark'),
  start:document.getElementById('t7-start'),end:document.getElementById('t7-end'),
  endTitle:document.getElementById('t7-end-title'),endText:document.getElementById('t7-end-text')};

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

  buildStreet();
  buildPit();
  placeCapsule();
}

var up=new THREE.Vector3(0,1,0);

// ——— улица: дорога, тротуары, дома, деревья, фонари, дальний план ———
function buildStreet(){
  var asphalt=asphaltTexture();
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
  // дорога с разрывом на провал и на люк
  roadPiece(Z_START,Z_PIT_EDGE,asphalt);
  roadPiece(Z_PIT_FAR,-210.1,asphalt);
  roadPiece(-213.9,Z_END-4,asphalt);

  // тротуары и бордюр — сплошные, провал только в дороге
  [-1,1].forEach(function(s){
    var wm=walk.clone(); wm.needsUpdate=true; wm.wrapS=wm.wrapT=THREE.RepeatWrapping;
    wm.repeat.set(3,Math.abs(Z_START-Z_END)/6);
    var wmat=new THREE.MeshPhongMaterial({map:wm,shininess:20,specular:0x6c8186});
    var wk=new THREE.Mesh(new THREE.BoxGeometry(WALK,0.22,Math.abs(Z_START-Z_END)),
      [wmat,wmat,wmat,wmat,wmat,wmat]);
    wk.position.set(s*(ROAD_W/2+WALK/2),0.11,(Z_START+Z_END)/2);
    scene.add(wk);
    var curb=new THREE.Mesh(new THREE.BoxGeometry(0.35,0.3,Math.abs(Z_START-Z_END)),
      new THREE.MeshLambertMaterial({color:0x76848a}));
    curb.position.set(s*(ROAD_W/2+0.17),0.15,(Z_START+Z_END)/2);
    scene.add(curb);
  });

  // дома: два ряда по обеим сторонам, сплошной застройкой
  var r=rnd(5551);
  var facades=[];
  for(var fi=0;fi<A.facades.length;fi++) if(TEX['facade'+fi]) facades.push(TEX['facade'+fi]);
  var fallback=new THREE.MeshLambertMaterial({color:0x424c51});

  var faceCache={};
  function faceMat(tex,key,rx,ry){
    var k=key+'_'+rx.toFixed(1)+'_'+ry.toFixed(1);
    if(faceCache[k]) return faceCache[k];
    var t=tex.clone(); t.needsUpdate=true;
    t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(rx,ry); t.anisotropy=8;
    var m=new THREE.MeshLambertMaterial({map:t,color:0xa8b1b4});
    faceCache[k]=m;
    return m;
  }

  function addBuilding(x,z,h,dep,w,tex,key){
    var geo=new THREE.BoxGeometry(dep,h,w);
    var mTop=new THREE.MeshLambertMaterial({color:0x3a444a});
    var mX,mZ;
    if(tex&&key){
      // грани вдоль улицы считаются по своей длине, иначе окна вытягиваются в полосы
      mX=faceMat(tex,key+'_x',Math.max(1,w/11),Math.max(2,h/9));
      mZ=faceMat(tex,key+'_z',Math.max(1,dep/11),Math.max(2,h/9));
    }else{ mX=fallback; mZ=fallback; }
    var b=new THREE.Mesh(geo,[mX,mX,mTop,mTop,mZ,mZ]);
    b.position.set(x,h/2,z);
    scene.add(b);
    return b;
  }
  for(var z=-4; z>Z_END+8; z-=21){
    [-1,1].forEach(function(side){
      var dep=15+r()*6, h=18+r()*26, w=14+r()*5;
      var f1=Math.floor(r()*facades.length);
      addBuilding(side*(ROAD_W/2+WALK+3.4+dep/2), z, h, dep, w, facades[f1], 'f'+f1);
      var dep2=14+r()*6, h2=26+r()*22, w2=14+r()*5;
      var f2=Math.floor(r()*facades.length);
      addBuilding(side*(ROAD_W/2+WALK+3.4+dep+2.5+dep2/2), z-10, h2, dep2, w2, facades[f2], 'f'+f2);
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

  // рваный край дороги
  for(var i=0;i<26;i++){
    var a=i/26*Math.PI*2;
    var w=2.4+r()*1.7;
    var slab=new THREE.Mesh(new THREE.BoxGeometry(w,0.3,1.6+r()*0.9),rimMat);
    slab.position.set(Math.cos(a)*PIT.rx*(0.93+r()*0.05),-0.06,Math.sin(a)*PIT.rz*(0.93+r()*0.05));
    slab.rotation.set((r()-0.5)*0.18,a+(r()-0.5)*0.2,(r()-0.5)*0.14);
    g.add(slab);
  }
  // светящиеся трещины от края
  for(var c=0;c<16;c++){
    var ca=r()*Math.PI*2;
    var cr=new THREE.Mesh(new THREE.PlaneGeometry(0.2+r()*0.14,2.2+r()*3.4),
      new THREE.MeshBasicMaterial({color:0x5ff2e6,transparent:true,opacity:0.5,
        blending:THREE.AdditiveBlending,depthWrite:false}));
    cr.rotation.x=-Math.PI/2; cr.rotation.z=ca;
    cr.position.set(Math.cos(ca)*(PIT.rx+1.4+r()*2.6),0.03,Math.sin(ca)*(PIT.rz+1.4+r()*2.6));
    g.add(cr);
  }

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
  capGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW,color:0x8ffcf2,
    transparent:true,opacity:0,depthWrite:false,depthTest:false,
    blending:THREE.AdditiveBlending}));
  capGlow.scale.set(1.3,1.3,1);
  capGlow.position.set(0,-0.58,-1.06);
  capGlow.renderOrder=1000;
  camera.add(capGlow);
}

// капсула трескается по мере урона
function capsuleTextureName(){
  if(integrity>60) return 'capsule';
  if(integrity>30) return 'capsuleDamaged';
  return 'capsuleCritical';
}

// ——— тоннель: строится, когда падаем (чтобы не грузить зря) ———

function buildTunnel(){
  if(tunnelBuilt)return;
  tunnelBuilt=true;
  var g=new THREE.Group(); g.position.set(0,TUN.y,0); scene.add(g);
  tunnelGroup=g;
  var len=Math.abs(TUN.z0-TUN.z1), cz=(TUN.z0+TUN.z1)/2;
  var r=rnd(9191);

  var floorMap=TEX.concrete?TEX.concrete.clone():null;
  if(floorMap){ floorMap.needsUpdate=true; floorMap.wrapS=floorMap.wrapT=THREE.RepeatWrapping; floorMap.repeat.set(2,len/4); }
  var floor=new THREE.Mesh(new THREE.BoxGeometry(TUN.w,0.3,len),
    new THREE.MeshPhongMaterial({map:floorMap,color:0x3f484c,shininess:90,specular:0x5b8589}));
  floor.position.set(0,-0.15,cz); g.add(floor);

  for(var p=0;p<12;p++){
    var pw=1.2+r()*1.6, pd=1.0+r()*1.8;
    var pud=new THREE.Mesh(new THREE.PlaneGeometry(pw,pd),
      new THREE.MeshBasicMaterial({color:0x8fe6e2,transparent:true,opacity:0.045,
        blending:THREE.AdditiveBlending,depthWrite:false}));
    pud.rotation.x=-Math.PI/2;
    pud.position.set((r()-0.5)*TUN.w*0.7,0.015,cz+(r()-0.5)*len*0.95);
    g.add(pud);
  }

  var wallMap=TEX.wall?TEX.wall.clone():null;
  if(wallMap){ wallMap.needsUpdate=true; wallMap.wrapS=wallMap.wrapT=THREE.RepeatWrapping; wallMap.repeat.set(len/5,1); }
  var wallMat=new THREE.MeshLambertMaterial({map:wallMap,color:0x5d686d});
  [-1,1].forEach(function(s){
    var w=new THREE.Mesh(new THREE.BoxGeometry(0.4,TUN.h,len),wallMat);
    w.position.set(s*(TUN.w/2+0.2),TUN.h/2,cz); g.add(w);
  });
  var ceil=new THREE.Mesh(new THREE.BoxGeometry(TUN.w+0.8,0.3,len-2.9),
    new THREE.MeshLambertMaterial({color:0x3a4348}));
  ceil.position.set(0,TUN.h+0.15,cz+1.45); g.add(ceil);

  for(var pz=TUN.z0; pz>TUN.z1; pz-=9){
    [-1,1].forEach(function(s){
      var pil=new THREE.Mesh(new THREE.BoxGeometry(0.22,TUN.h,0.45),
        new THREE.MeshLambertMaterial({color:0x3d464b}));
      pil.position.set(s*(TUN.w/2-0.11),TUN.h/2,pz); g.add(pil);
    });
  }

  var pipeMat=new THREE.MeshLambertMaterial({color:0x2f373b});
  var pipeMat2=new THREE.MeshLambertMaterial({color:0x262d31});
  function pipeAlong(x,y,rad,mat){
    var pm=new THREE.Mesh(new THREE.CylinderGeometry(rad,rad,len,10),mat);
    pm.rotation.x=Math.PI/2; pm.position.set(x,y,cz); g.add(pm);
  }
  [-1,1].forEach(function(s){
    pipeAlong(s*(TUN.w/2-0.26),0.52,0.17,pipeMat);
    pipeAlong(s*(TUN.w/2-0.16),2.40,0.09,pipeMat2);
    pipeAlong(s*(TUN.w/2-0.12),2.68,0.06,pipeMat2);
  });
  pipeAlong(-0.7,TUN.h-0.22,0.10,pipeMat2);
  pipeAlong(0.7,TUN.h-0.18,0.08,pipeMat2);

  var lowZ=TUN.z0-16;
  var lowPipe=new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.17,TUN.w+0.4,12),pipeMat);
  lowPipe.rotation.z=Math.PI/2; lowPipe.position.set(0,1.30,lowZ); g.add(lowPipe);

  for(var lz2=TUN.z0-5; lz2>TUN.z1; lz2-=7){
    var lampBox=new THREE.Mesh(new THREE.BoxGeometry(0.75,0.1,0.24),
      new THREE.MeshBasicMaterial({color:0xcffbf5}));
    lampBox.position.set(0,TUN.h-0.12,lz2); g.add(lampBox);
    var gl=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW,color:0x8ff2ea,
      transparent:true,opacity:0.5,depthWrite:false,blending:THREE.AdditiveBlending}));
    gl.scale.set(4.2,4.2,1); gl.position.set(0,TUN.h-0.2,lz2); g.add(gl);
    tunnelLamps.push(lz2);
  }
  var pl3=new THREE.PointLight(0x9ff4ec,0.55,9);
  g.add(pl3); tunnelLightPool.push(pl3);

  for(var d=0;d<18;d++){
    var bs=0.25+r()*0.5;
    var ch=new THREE.Mesh(new THREE.BoxGeometry(bs,bs*0.7,bs),
      new THREE.MeshLambertMaterial({color:0x6a757a}));
    ch.position.set((r()<0.5?-1:1)*(TUN.w/2-0.7-r()*0.3),bs*0.4,cz+(r()-0.5)*len*0.95);
    ch.rotation.set(r(),r()*3,r());
    g.add(ch);
  }
  for(var mi=0;mi<10;mi++){
    var sp=new THREE.Sprite(new THREE.SpriteMaterial({map:MIST,color:0xbde8ea,
      transparent:true,opacity:0.17,depthWrite:false}));
    sp.position.set((r()-0.5)*TUN.w*0.8,0.6+r()*2.4,cz+(r()-0.5)*len*0.9);
    sp.scale.set(3+r()*3,3+r()*3,1);
    sp.userData.base=sp.position.y; sp.userData.sp=0.2+r()*0.3; sp.userData.ph=r()*6.28;
    g.add(sp); mists.push(sp);
  }

  // —— вертикальный коридор выхода со стенами, трубами и лестницей ——
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

function crystalObject(){
  var grp=new THREE.Group();
  var shellGeo=new THREE.OctahedronGeometry(0.5,0);
  var shellMat=new THREE.MeshPhongMaterial({color:0x7ff2e8,emissive:0x1d8f87,
    shininess:95,specular:0xd6fffb,flatShading:true,transparent:true,opacity:0.92});
  var shell=new THREE.Mesh(shellGeo,shellMat);
  shell.scale.set(0.62,1.28,0.62);          // вытянутый вверх кристалл
  grp.add(shell);
  var coreGeo=new THREE.OctahedronGeometry(0.5,0);
  var coreMat=new THREE.MeshBasicMaterial({color:0xeafffd,transparent:true,opacity:0.92});
  var core=new THREE.Mesh(coreGeo,coreMat);
  core.scale.set(0.30,0.62,0.30);           // светящееся ядро внутри
  grp.add(core);
  var gl=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW,color:0x74f4e8,
    transparent:true,opacity:0.40,depthWrite:false,blending:THREE.AdditiveBlending}));
  gl.scale.set(2.4,2.4,1); grp.add(gl);
  return {grp:grp,shell:shellMat,core:coreMat,glow:gl};
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
  // улица 1
  addCrystal(-20,'center',true,0);                       // высоко — только прыжком
  addBeam(-30);
  events.push({z:-30,type:'beam',need:'duck',text:'Низкая балка!',done:false,warned:false});
  addCrystal(-44,'left',false,0);                        // слева — манёвр влево
  addDebris(-58,0,9,'left','Обломки сверху — уходите влево!');
  addCrystal(-78,'right',false,0);                       // справа — манёвр вправо
  addDebris(-92,0,9,'right','Обломки сверху — уходите вправо!');
  events.push({z:Z_PIT_EDGE+1,type:'pit',need:'jump',text:'Провал! Прыжок',done:false,warned:false});
  // улица 2
  addDebris(-232,0,9,'left','Обломки сверху — уходите влево!');
  addCrystal(-246,'left',false,0);
  addCrystal(-256,'center',true,0);                      // высоко — только прыжком
  addBeam(-262);
  events.push({z:-262,type:'beam',need:'duck',text:'Низкая балка!',done:false,warned:false});
  addDebris(-282,0,9,'right','Обломки сверху — уходите вправо!');
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
  events.push({z:TUN.z0-16,type:'pipe',need:'duck',text:'Труба над головой!',done:false,warned:false});
  addDebris(TUN.z0-36,TUN.y,2.7,'left','Обломки сверху — уходите влево!',1.2,0.45);
  addCrystal(TUN.z0-52,'right',false,TUN.y);
  addDebris(TUN.z0-68,TUN.y,2.7,'right','Обломки сверху — уходите вправо!',1.2,-0.45);
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
  addCrystal(-226,'right',false,0);
  addCrystal(-244,'left',false,0);
  addCrystal(-258,'center',true,0);      // высоко — только прыжком
  addCrystal(-276,'right',false,0);
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

Array.prototype.forEach.call(document.querySelectorAll('[data-act]'),function(b){
  b.addEventListener('pointerdown',function(ev){ ev.preventDefault(); doAction(b.dataset.act); });
});

(function swipes(){
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
})();

var topBtn=document.getElementById('t7-topview');
if(topBtn) topBtn.addEventListener('click',function(){
  topView=!topView; this.classList.toggle('on',topView);
  this.textContent=topView?'Вид бегуна':'Вид сверху';
});

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
  if(phase==='street1')return 'Улица';
  if(phase==='trip'||phase==='fall')return 'Провал';
  if(phase==='tunnel'||phase==='ladder')return 'Тоннель';
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
  return (phase==='tunnel'||phase==='ladder')?1.45:LANE_X;
}

function updateCamera(dt){
  var x=lane*laneLimit(), y=EYE, z=sZ, focusDy=0, roll=-lane*0.16;
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

  tmpF.set(x*1.25,y+focusDy,z-9);
  lookAt.copy(tmpF);
  camera.lookAt(lookAt);
  camera.rotateZ(roll);

  if(capPlane){
    var duckK=duckT>0?Math.min(1,duckT/DUCK_D*1.7):0;
    capPlane.visible=topMix<0.5&&phase!=='fall'&&duckK<0.45;
    capPlane.position.set(-lane*0.10+(shake>0?(Math.random()-0.5)*shake*0.06:0),
                          -0.60+bob*0.6+jumpK*0.05-duckK*0.75+(shake>0?(Math.random()-0.5)*shake*0.05:0),
                          -1.0);
    capPlane.rotation.z=Math.sin(tRun*5.2)*0.014-lane*0.05;
    capPlane.material.opacity=1;
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
  var want=(phase==='tunnel'||phase==='ladder')?82:74;
  fovTarget+= (want-fovTarget)*Math.min(1,dt*3);
  if(Math.abs(camera.fov-fovTarget)>0.05){
    camera.fov=fovTarget; camera.updateProjectionMatrix();
  }
  // дымка: на улице мягче, в тоннеле плотнее
  var dens=(phase==='tunnel'||phase==='ladder')?0.055:0.017;
  var fogCol=(phase==='tunnel'||phase==='ladder')?0x27343a:0x3b4a52;
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
    if(!pitWarned&&travelled>104){ pitWarned=true; }
    if(travelled>=126){ pitWarned=false; resolvePit(); }
  } else if(phase==='trip'){
    var k=Math.min(1,phaseT/TRIP_D);
    sZ=lerp(Z_PIT_EDGE+1,Z_STREET2_JUMP,k);
    if(k>=1){ phase='street2'; phaseT=0; endgameHeal(); showAlert('Дальше по улице'); }
  } else if(phase==='fall'){
    if(phaseT>=FALL_D){ phase='tunnel'; phaseT=0; sZ=TUN.z0; travelled=126+1;
      buildTunnel(); buildTunnelEvents(); showAlert('Под землёй. Бежим к свету'); }
  } else if(phase==='tunnel'){
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
    if(sZ<=Z_END+8) finish();
  }

  if(tRun>=DURATION&&!finished) finish();

  // события по расстоянию
  events.forEach(function(e){
    if(e.type==='pit')return;
    var dist=Math.abs(sZ-e.z);
    if(!e.warned&&sZ-e.z<22&&sZ-e.z>-1){ e.warned=true; }
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
  var capX=lane*laneLimit();
  crystals.forEach(function(c){
    if(c.taken)return;
    c.grp.rotation.y+=dt*1.35;
    c.bob+=dt*2;
    c.grp.position.y=c.yBase+Math.sin(c.bob)*0.13;
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
    c.shell.opacity=0.92*(1-k);
    c.core.opacity=0.95*(1-k);
    c.glow.material.opacity=0.40*(1-k)+0.55*Math.sin(Math.PI*k);
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
}

// ——— главный цикл ———
function tick(){
  requestAnimationFrame(tick);
  var dt=Math.min(0.05,clock.getDelta());
  step(dt);
  updateCamera(dt);
  renderer.render(scene,camera);
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
  phase='street1'; phaseT=0; sZ=Z_START; tRun=0; travelled=0;
  pathTotal=(Z_START-Z_STREET2_JUMP)+(Z_STREET2_JUMP-Z_END);
  lane=0; laneTarget=0; holdT=0; jumpT=0; duckT=0; shake=0;
  lastAct=''; lastActAt=-9; integrity=100; energy=100; passed=0; failed=0;
  finished=false; exitHint=false; pitWarned=false; topView=false; topMix=0;
  if(topBtn){ topBtn.classList.remove('on'); topBtn.textContent='Вид сверху'; }
  events.forEach(function(e){
    e.done=false; e.warned=false;
    if(e.pieces) e.pieces.forEach(function(p){ p.visible=false; });
  });
  crystals.forEach(function(c){ c.taken=false; c.pop=0; c.grp.visible=true;
    c.grp.scale.setScalar(1); c.grp.position.set(c.x,c.yBase,c.z);
    c.shell.opacity=0.92; c.core.opacity=0.95; c.glow.material.opacity=0.40; });
  capFlash=0; window.__t7pick=0;
  if(capGlow){ capGlow.material.opacity=0; capGlow.visible=true; }
  shards.forEach(function(s){ scene.remove(s); }); shards.length=0;
  frags.forEach(function(f2){ scene.remove(f2); }); frags.length=0;
  if(!dmgBox) dmgBox=document.getElementById('t7-damage');
  if(dmgBox){ dmgBox.className=''; dmgBox.style.display='none'; }
  dmgUntil=0; critPlayed=false;
  if(el.dark) el.dark.style.opacity=0;
  if(capPlane){ capPlane.userData.tex='capsule';
    if(TEX.capsule){ capPlane.material.map=TEX.capsule; capPlane.material.needsUpdate=true; } }
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
}

var playBtn=document.getElementById('t7-play');
var againBtn=document.getElementById('t7-again');
if(playBtn) playBtn.addEventListener('click',start);
if(againBtn) againBtn.addEventListener('click',start);

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
  picks:(window.__t7pick||0)}; };

// ——— инициализация ———
try{
  renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:false,powerPreference:'high-performance'});
}catch(err){
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
buildEvents();
updateHud();
if(note)note.textContent='';
if(playBtn) playBtn.disabled=false;
tick();
});

window.addEventListener('orientationchange',function(){ setTimeout(updateOrient,220); });
window.addEventListener('resize',function(){ updateOrient();
  camera.aspect=window.innerWidth/Math.max(1,window.innerHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth,window.innerHeight,false);
});
})();
