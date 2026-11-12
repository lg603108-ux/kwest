/* task07demo.js — задание 7, 3D-участок «Прорыв». Версия 0318a.
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

var VER='0318a';
var note=document.getElementById('t7-loadnote');
if(!window.THREE){ if(note)note.textContent='Не загрузилась 3D-библиотека (vendor/three.min.js)'; return; }

// ——— параметры мира, метры ———
var DURATION=60;                 // длительность пробного хода
var EYE=1.72;                    // высота глаз бегуна
var ROAD_W=13;                   // ширина дороги
var WALK=4.0;                    // ширина тротуара
var LANE_X=3.4;                  // насколько уходим в сторону при манёвре
var RUN_SPEED=6.6;               // скорость бега по улице, м/с
var TUN_SPEED=7.4;               // скорость в тоннеле
var JUMP_D=0.85, DUCK_D=0.7;
var TRIP_D=1.35, FALL_D=1.7, LADDER_D=2.2;
var Z_START=6, Z_END=-300;
var PIT={z:-128, rx:6.6, rz:7.8, depth:8.6};
var Z_PIT_EDGE=PIT.z+PIT.rz;     // -120.2 — ближний край дыры
var Z_PIT_FAR=PIT.z-PIT.rz;      // -135.8 — дальний край
var TUN={y:-9.4, z0:-118, z1:-212, w:4.4, h:3.1};
var MANHOLE_Z=TUN.z1;            // люк на улице над концом тоннеля
var Z_STREET2_JUMP=Z_PIT_FAR-4;  // где оказываемся после прыжка через провал

// ——— ассеты ———
var A={
  street:'assets/task07/ref_street.jpg', aerial:'assets/task07/ref_aerial.jpg',
  wall:'assets/task07/tex_wall.jpg', pit:'assets/task07/tex_pit.jpg',
  concrete:'assets/task07/concrete.png', capsule:'assets/task07/capsule_hands.png',
  capsuleAlt:'assets/task07/capsule.png', crystal:'assets/task07/crystal.png',
  facades:['assets/task07/facade1.jpg','assets/task07/facade2.jpg',
           'assets/task07/facade3.jpg','assets/task07/facade4.jpg']
};
var TEX={};

// ——— звук ———
var SFX={};
function loadSounds(){
  try{
    SFX.hit=new Audio('assets/task07/hit.mp3');
    SFX.ok=new Audio('assets/task07/ok.mp3');
    SFX.amb=new Audio('assets/task07/ambience.mp3');
    SFX.amb.loop=true; SFX.amb.volume=0.55;
    SFX.hit.volume=1.0; SFX.ok.volume=0.9;
  }catch(e){ SFX={}; }
}
function playSfx(k){
  var s=SFX[k]; if(!s)return;
  try{ s.currentTime=0; var p=s.play(); if(p&&p.catch)p.catch(function(){}); }catch(e){}
}

// ——— сцена ———
var canvas=document.getElementById('t7-canvas');
var renderer,scene,camera,clock;
var capsGroup=null, capPlane=null;

// ——— состояние бегуна ———
var phase='street1';   // street1 | trip | fall | tunnel | ladder | street2 | done
var phaseT=0, sZ=Z_START, tRun=0, travelled=0;
var pathTotal=(Z_START-Z_STREET2_JUMP)+(Z_STREET2_JUMP-Z_END);
var lane=0, laneTarget=0, holdT=0, jumpT=0, duckT=0, shake=0;
var lastAct='', lastActAt=-9;
var running=false, finished=false, topView=false, topMix=0;
var integrity=100, energy=100, passed=0, failed=0;
var events=[], crystals=[], shards=[], mists=[];
var tunnelBuilt=false, tunnelGroup=null, tunnelLamps=[], tunnelLightPool=[];
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
      if(glow){ g.strokeStyle='rgba(88,245,235,0.75)'; g.lineWidth=2.6+r()*2; g.shadowColor='#38e8de'; g.shadowBlur=8; g.stroke(); g.shadowBlur=0; }
    }
    for(var c=0;c<11;c++) crack(r()*S,r()*S,7+r()*13,r()*6.28,r()<0.4);
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
    g.fillStyle='#4c565b'; g.fillRect(0,0,S,S);
    for(var i=0;i<5200;i++){ var v=54+r()*34;
      g.fillStyle='rgba('+Math.round(v)+','+Math.round(v+5)+','+Math.round(v+8)+','+(0.1+r()*0.25)+')';
      g.fillRect(r()*S,r()*S,2+r()*4,2+r()*4); }
    // подтёки и грязь
    for(var s2=0;s2<26;s2++){
      g.fillStyle='rgba(28,34,38,'+(0.05+r()*0.12)+')';
      g.fillRect(r()*S,r()*S*0.6,3+r()*14,60+r()*200);
    }
    var cols=6, rows=8, mx=26, my=22;
    var cw=(S-mx*2)/cols, ch=(S-my*2)/rows;
    for(var cx=0;cx<cols;cx++){
      for(var cy=0;cy<rows;cy++){
        var wx=mx+cx*cw+cw*0.22, wy=my+cy*ch+ch*0.2;
        var ww=cw*0.56, wh=ch*0.52;
        var lit=r()<litChance;
        g.fillStyle=lit?'rgba(140,242,234,'+(0.30+r()*0.25)+')':'rgba(12,17,20,'+(0.85+r()*0.15)+')';
        g.fillRect(wx,wy,ww,wh);
        if(lit){ g.shadowColor='#5ce6dc'; g.shadowBlur=8; g.fillRect(wx,wy,ww,wh); g.shadowBlur=0; }
        g.strokeStyle='rgba(96,108,114,0.22)'; g.lineWidth=2; g.strokeRect(wx,wy,ww,wh);
      }
    }
    // межэтажные полосы
    for(var fy=0;fy<rows;fy++){
      g.fillStyle='rgba(30,37,42,0.35)';
      g.fillRect(0,my+fy*ch,S,3);
    }
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
  add('street',A.street); add('wall',A.wall); add('pit',A.pit);
  add('concrete',A.concrete); add('capsule',A.capsule); add('crystal',A.crystal);
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
  var facades=[facadeTexture(881,0.05),facadeTexture(1777,0.09),
               facadeTexture(2911,0.03),facadeTexture(4117,0.06)];
  var fallback=new THREE.MeshLambertMaterial({color:0x424c51});

  function addBuilding(x,z,h,dep,w,tex){
    var geo=new THREE.BoxGeometry(dep,h,w);
    var uv=geo.attributes.uv;
    var repX=Math.max(1,Math.round(dep/11)), repY=Math.max(2,Math.round(h/9));
    for(var ui=0;ui<uv.count;ui++) uv.setXY(ui,uv.getX(ui)*repX,uv.getY(ui)*repY);
    uv.needsUpdate=true;
    var mTop=new THREE.MeshLambertMaterial({color:0x3a444a});
    var mSide=tex?new THREE.MeshLambertMaterial({map:tex,color:0x8b9599}):fallback;
    var b=new THREE.Mesh(geo,[mSide,mSide,mTop,mTop,mSide,mSide]);
    b.position.set(x,h/2,z);
    if(r()<0.5) b.rotation.y=Math.PI;   // чтобы фасад смотрел на улицу
    scene.add(b);
    return b;
  }
  for(var z=-4; z>Z_END+8; z-=17){
    [-1,1].forEach(function(side){
      var dep=15+r()*6, h=18+r()*26, w=19+r()*9;
      addBuilding(side*(ROAD_W/2+WALK+1.2+dep/2), z, h, dep, w,
                  facades[Math.floor(r()*facades.length)]);
      var dep2=14+r()*6, h2=26+r()*22, w2=18+r()*9;
      addBuilding(side*(ROAD_W/2+WALK+1.2+dep+1.5+dep2/2), z-9, h2, dep2, w2,
                  facades[Math.floor(r()*facades.length)]);
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
  var concreteMat=TEX.concrete
    ? new THREE.MeshLambertMaterial({map:TEX.concrete,color:0x5f686c})
    : new THREE.MeshLambertMaterial({color:0x424a4e});

  // рваные плиты по краю
  var N=24;
  for(var i=0;i<N;i++){
    var a=i/N*Math.PI*2;
    var w=2.6+r()*1.6;
    var slab=new THREE.Mesh(new THREE.BoxGeometry(w,0.3,1.7+r()*0.8),concreteMat);
    slab.position.set(Math.cos(a)*PIT.rx*(0.93+r()*0.06),-0.06,Math.sin(a)*PIT.rz*(0.93+r()*0.06));
    slab.rotation.set((r()-0.5)*0.16,a+(r()-0.5)*0.22,(r()-0.5)*0.12);
    g.add(slab);
  }

  // светящиеся трещины, расходящиеся от дыры
  for(var c=0;c<16;c++){
    var ca=r()*Math.PI*2;
    var cr=new THREE.Mesh(new THREE.PlaneGeometry(0.22+r()*0.16,2.2+r()*3.4),
      new THREE.MeshBasicMaterial({color:0x5ff2e6,transparent:true,opacity:0.55,
        blending:THREE.AdditiveBlending,depthWrite:false}));
    cr.rotation.x=-Math.PI/2; cr.rotation.z=ca;
    cr.position.set(Math.cos(ca)*(PIT.rx+1.4+r()*2.6),0.03,Math.sin(ca)*(PIT.rz+1.4+r()*2.6));
    g.add(cr);
  }

  // стенки вниз
  var wallMap=TEX.concrete?TEX.concrete.clone():null;
  if(wallMap){ wallMap.needsUpdate=true; wallMap.wrapS=wallMap.wrapT=THREE.RepeatWrapping; wallMap.repeat.set(9,4); }
  var wallMat=new THREE.MeshLambertMaterial({map:wallMap,color:0x353d41,side:THREE.BackSide});
  var cone=new THREE.Mesh(new THREE.CylinderGeometry(PIT.rz*0.94,PIT.rz*0.52,PIT.depth,26,2,true),wallMat);
  cone.position.y=-PIT.depth/2;
  cone.scale.x=PIT.rx/PIT.rz;
  g.add(cone);

  // уступы и обломки на стенках
  var ledgeMat=TEX.pit?new THREE.MeshLambertMaterial({map:TEX.pit,color:0x424b4f})
                           :new THREE.MeshLambertMaterial({color:0x323a3e});
  for(var l=0;l<4;l++){
    var la=r()*Math.PI*2, lh=-2.2-r()*4.2;
    var led=new THREE.Mesh(new THREE.BoxGeometry(1.2+r()*0.9,0.35,0.9+r()*0.5),ledgeMat);
    var rr2=PIT.rz*(0.86-l*0.06);
    led.position.set(Math.cos(la)*rr2*(PIT.rx/PIT.rz)+Math.cos(la)*0.4,lh,Math.sin(la)*rr2+Math.sin(la)*0.4);
    led.rotation.set((r()-0.5)*0.25,la,(r()-0.5)*0.2);
    g.add(led);
  }

  // дно
  var botMat=TEX.concrete
    ? new THREE.MeshLambertMaterial({map:TEX.concrete,color:0x394245})
    : new THREE.MeshLambertMaterial({color:0x272e31});
  var bottom=new THREE.Mesh(new THREE.CircleGeometry(PIT.rz*0.56,26),botMat);
  bottom.rotation.x=-Math.PI/2; bottom.position.y=-PIT.depth+0.04;
  bottom.scale.x=PIT.rx/PIT.rz;
  g.add(bottom);

  // обломки на дне
  for(var b=0;b<14;b++){
    var bs=0.6+r()*1.5;
    var ch=new THREE.Mesh(new THREE.BoxGeometry(bs,bs*0.6,bs*0.9),concreteMat);
    var ba=r()*6.28, br=PIT.rz*0.15+r()*PIT.rz*0.35;
    ch.position.set(Math.cos(ba)*br,-PIT.depth+bs*0.3,Math.sin(ba)*br);
    ch.rotation.set(r()*0.6,r()*3,r()*0.5);
    g.add(ch);
  }

  // арматура, торчащая из краёв
  var rust=new THREE.MeshLambertMaterial({color:0x2b2a27});
  for(var rb=0;rb<12;rb++){
    var ra=r()*6.28, rl=1.0+r()*1.8;
    var rod=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,rl,5),rust);
    var px=Math.cos(ra)*PIT.rx*0.93, pz=Math.sin(ra)*PIT.rz*0.93;
    rod.position.set(px,0.2+r()*0.4,pz);
    rod.rotation.set((r()-0.5)*1.2,ra,(r()-0.5)*1.2);
    g.add(rod);
  }

  // свет и дым из провала
  var gl1=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW,color:0x66f0e4,
    transparent:true,opacity:0.75,depthWrite:false,blending:THREE.AdditiveBlending}));
  gl1.scale.set(13,13,1); gl1.position.y=-3.4; g.add(gl1);
  var gl2=gl1.clone(); gl2.material=gl1.material.clone();  gl2.material.opacity=0.7;
  gl2.scale.set(12,12,1); gl2.position.y=-PIT.depth+1.2; g.add(gl2);

  var pl=new THREE.PointLight(0x7df0e6,0.9,18); pl.position.set(0,-4.4,0); g.add(pl);
  var pl2=new THREE.PointLight(0x6fe8e0,1.15,12); pl2.position.set(0,-PIT.depth+1.4,0); g.add(pl2);

  for(var m=0;m<12;m++){
    var sp=new THREE.Sprite(new THREE.SpriteMaterial({map:MIST,color:0xc8eeee,
      transparent:true,opacity:0.26,depthWrite:false}));
    var ma=r()*6.28, mr=r()*PIT.rz*0.7;
    sp.position.set(Math.cos(ma)*mr,-1-r()*6,Math.sin(ma)*mr);
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
      depthTest:false,depthWrite:false,opacity:1}));
  capPlane.position.set(0,-0.60,-1.0);
  capPlane.renderOrder=999;
  camera.add(capPlane);
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

  // лужи
  for(var p=0;p<12;p++){
    var pw=1.2+r()*1.6, pd=1.0+r()*1.8;
    var pud=new THREE.Mesh(new THREE.PlaneGeometry(pw,pd),
      new THREE.MeshBasicMaterial({color:0x8fe6e2,transparent:true,opacity:0.045,
        blending:THREE.AdditiveBlending,depthWrite:false}));
    pud.rotation.x=-Math.PI/2;
    pud.position.set((r()-0.5)*TUN.w*0.7,0.015,cz+(r()-0.5)*len*0.95);
    g.add(pud);
  }

  // стены
  var wallMap=TEX.wall?TEX.wall.clone():null;
  if(wallMap){ wallMap.needsUpdate=true; wallMap.wrapS=wallMap.wrapT=THREE.RepeatWrapping; wallMap.repeat.set(len/5,1); }
  var wallMat=new THREE.MeshLambertMaterial({map:wallMap,color:0x5d686d});
  [-1,1].forEach(function(s){
    var w=new THREE.Mesh(new THREE.BoxGeometry(0.4,TUN.h,len),wallMat);
    w.position.set(s*(TUN.w/2+0.2),TUN.h/2,cz); g.add(w);
  });
  // потолок
  var ceil=new THREE.Mesh(new THREE.BoxGeometry(TUN.w+0.8,0.3,len),
    new THREE.MeshLambertMaterial({color:0x3a4348}));
  ceil.position.set(0,TUN.h+0.15,cz); g.add(ceil);

  // пилястры
  for(var pz=TUN.z0; pz>TUN.z1; pz-=9){
    [-1,1].forEach(function(s){
      var pil=new THREE.Mesh(new THREE.BoxGeometry(0.22,TUN.h,0.45),
        new THREE.MeshLambertMaterial({color:0x3d464b}));
      pil.position.set(s*(TUN.w/2-0.11),TUN.h/2,pz); g.add(pil);
    });
  }

  // трубы вдоль стен
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

  // труба над головой — надо пригнуться
  var lowZ=TUN.z0-16;
  var lowPipe=new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.17,TUN.w+0.4,12),pipeMat);
  lowPipe.rotation.z=Math.PI/2; lowPipe.position.set(0,1.30,lowZ); g.add(lowPipe);

  // лампы и их свет
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

  // мусор у стен
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

  // выход: шахта, лестница, люк
  var shaftMat=new THREE.MeshLambertMaterial({color:0x6f7b80,side:THREE.BackSide});
  var shaft=new THREE.Mesh(new THREE.CylinderGeometry(1.35,1.35,Math.abs(TUN.y)+2.6,16,1,true),shaftMat);
  shaft.position.set(0,(Math.abs(TUN.y)+2.6)/2-1.4,TUN.z1+0.6);
  g.add(shaft);
  var ladderMat=new THREE.MeshPhongMaterial({color:0x8b969b,shininess:60});
  [-0.35,0.35].forEach(function(lx){
    var rail=new THREE.Mesh(new THREE.BoxGeometry(0.07,Math.abs(TUN.y)+0.6,0.07),ladderMat);
    rail.position.set(lx,(Math.abs(TUN.y))/2-0.2,TUN.z1+1.1); g.add(rail);
  });
  for(var ry=-1.5; ry<Math.abs(TUN.y); ry+=0.42){
    var rung=new THREE.Mesh(new THREE.BoxGeometry(0.78,0.055,0.055),ladderMat);
    rung.position.set(0,ry,TUN.z1+1.1); g.add(rung);
  }
  // свет сверху и столб света в шахте
  var shaftLight=new THREE.PointLight(0xbdf9f2,2.2,16);
  shaftLight.position.set(0,Math.abs(TUN.y)-0.6,TUN.z1+0.6); g.add(shaftLight);
  var beamMat=new THREE.MeshBasicMaterial({color:0x9ef4ec,transparent:true,opacity:0.10,
    depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
  var shaftBeam=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.6,Math.abs(TUN.y),12,1,true),beamMat);
  shaftBeam.position.set(0,Math.abs(TUN.y)/2-0.4,TUN.z1+0.6); g.add(shaftBeam);

  // люк на улице над шахтой: рамка и рваный край
  var manhole=new THREE.Group(); manhole.position.set(0,TUN.y+Math.abs(TUN.y),TUN.z1);
  scene.add(manhole);
  var rimMat=new THREE.MeshLambertMaterial({color:0x8f9a9e});
  for(var hh=0; hh<14; hh++){
    var ha=hh/14*Math.PI*2;
    var seg=new THREE.Mesh(new THREE.BoxGeometry(0.8,0.12,0.5),rimMat);
    seg.position.set(Math.cos(ha)*1.6,0.06,Math.sin(ha)*1.6);
    seg.rotation.y=ha; manhole.add(seg);
  }
  var mGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW,color:0x9df4ec,
    transparent:true,opacity:0.5,depthWrite:false,blending:THREE.AdditiveBlending}));
  mGlow.scale.set(6,6,1); mGlow.position.y=0.2; manhole.add(mGlow);
}

// ——— препятствия и кристаллы ———
function concreteMat(){
  return TEX.concrete
    ? new THREE.MeshLambertMaterial({map:TEX.concrete,color:0x5b6468})
    : new THREE.MeshLambertMaterial({color:0x40484c});
}

function addBeam(z,pipe){
  var mat=pipe?new THREE.MeshPhongMaterial({color:0x77838a,shininess:60}):concreteMat();
  var geo=pipe?new THREE.CylinderGeometry(0.3,0.3,ROAD_W+1.2,12)
                :new THREE.BoxGeometry(ROAD_W+1.2,0.75,1.2);
  var m=new THREE.Mesh(geo,mat);
  if(pipe) m.rotation.z=Math.PI/2;
  m.position.set(0,pipe?1.42:2.02,z);
  scene.add(m);
  // опоры по краям, чтобы читался как настоящий
  if(!pipe){
    [-1,1].forEach(function(s){
      var leg=new THREE.Mesh(new THREE.BoxGeometry(0.9,1.3,0.9),mat);
      leg.position.set(s*(ROAD_W/2+0.3),0.65,z);
      leg.rotation.y=0.3*s; scene.add(leg);
    });
  }
  return m;
}

function addDebris(z,fromSide){
  var e={z:z,type:'debris',need:fromSide==='left'?'right':'left',
         text:fromSide==='left'?'Обломки падают слева!':'Обломки падают справа!',
         done:false,warned:false,pieces:[]};
  var r=rnd(Math.floor(Math.abs(z)*17)+3);
  for(var i=0;i<4;i++){
    var sz=1.6+r()*1.2;
    var m=new THREE.Mesh(new THREE.BoxGeometry(sz,sz*0.8,sz*1.1),concreteMat());
    var sideOff=(fromSide==='left'?-1:1)*(1.2+r()*2.6);
    m.userData={off:sideOff,dl:(r()-0.5)*4,fall:r()*1.2,sz:sz};
    m.visible=false;
    scene.add(m);
    e.pieces.push(m);
  }
  events.push(e);
  return e;
}

function addCrystal(z,side){
  var grp=new THREE.Group();
  var sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:TEX.crystal||null,color:0xbdfbf4,
    transparent:true,depthWrite:false}));
  sprite.scale.set(1.5,0.95,1);
  grp.add(sprite);
  var gl=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW,color:0x7cf2e8,
    transparent:true,opacity:0.6,depthWrite:false,blending:THREE.AdditiveBlending}));
  gl.scale.set(2.6,2.6,1); grp.add(gl);
  grp.position.set(side*(ROAD_W/2-1.8),1.35,z);
  scene.add(grp);
  crystals.push({z:z,side:side,grp:grp,taken:false,bob:Math.random()*6.28});
}

function buildEvents(){
  if(events.length)return;
  // улица 1
  events.push({z:-30,type:'beam',need:'duck',text:'Низкая балка!',done:false,warned:false});
  addBeam(-30,false);
  addCrystal(-44,'left');
  addDebris(-58,'left');
  addCrystal(-78,'right');
  addDebris(-92,'right');
  events.push({z:Z_PIT_EDGE+1,type:'pit',need:'jump',text:'Провал! Прыжок',done:false,warned:false});
  // улица 2
  addDebris(-232,'left');
  addCrystal(-246,'left');
  addBeam(-262,false);
  events.push({z:-262,type:'beam',need:'duck',text:'Низкая балка!',done:false,warned:false});
  addDebris(-282,'right');
}

function buildTunnelEvents(){
  // тоннель: труба над головой уже построена вместе с тоннелем
  events.push({z:TUN.z0-16,type:'pipe',need:'duck',text:'Труба над головой!',done:false,warned:false});
  addDebris(TUN.z0-38,'left');
  addCrystal(TUN.z0-52,'right');
  addDebris(TUN.z0-70,'right');
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

// ——— управление ———
function doAction(a){
  if(!running||finished)return;
  lastAct=a; lastActAt=tRun;
  if(a==='left'){ laneTarget=-1; holdT=2.6; }
  if(a==='right'){ laneTarget=1; holdT=2.6; }
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
  if(need==='left'&&lane<-0.35) return true;
  if(need==='right'&&lane>0.35) return true;
  return lastAct===need && (tRun-lastActAt)<1.5;
}

function resolvePit(){
  if(actOk('jump')){
    passed++; flash('ok'); playSfx('ok');
    phase='trip'; phaseT=0; travelled=145.6;
    showAlert('Прыжок через провал!');
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

function judge(e){
  var ok=actOk(e.need);
  var wp=camera.position.clone(); wp.y=Math.max(0.4,camera.position.y-0.4);
  if(ok){
    passed++; flash('ok'); playSfx('ok'); burst(wp,8);
  }else{
    failed++; integrity=Math.max(0,integrity-15); shake=1.6;
    flash('hit'); playSfx('hit'); burst(wp,14);
    if(integrity<=0){ integrity=30; showAlert('Аварийная стабилизация! Корпус восстановлен'); }
  }
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

function updateCamera(dt){
  var x=lane*LANE_X, y=EYE, z=sZ, focusDy=0, roll=-lane*0.16;
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
    z=TUN.z1+0.6;
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

  tmpF.set(x*1.2,y+focusDy,z-9);
  lookAt.copy(tmpF);
  camera.lookAt(lookAt);
  camera.rotateZ(roll);

  if(capPlane){
    var vis=topMix<0.5&&phase!=='fall';
    capPlane.visible=vis;
    var dmg=integrity<60?(1-integrity/100)*0.35:0;
    capPlane.position.set(-lane*0.10,-0.60+bob*0.7+jumpK*0.04+duckY*0.3,-1.0);
    capPlane.rotation.z=Math.sin(tRun*5.2)*0.014-lane*0.05;
    capPlane.material.opacity=1;
    var br=0.78-dmg;
    capPlane.material.color.setRGB(br,br,br);
  }

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
    if(!pitWarned&&travelled>104){ pitWarned=true; showAlert('Провал! Прыжок'); }
    if(travelled>=126){ pitWarned=false; resolvePit(); }
  } else if(phase==='trip'){
    var k=Math.min(1,phaseT/TRIP_D);
    sZ=lerp(Z_PIT_EDGE+1,Z_STREET2_JUMP,k);
    if(k>=1){ phase='street2'; phaseT=0; showAlert('Дальше по улице'); }
  } else if(phase==='fall'){
    if(phaseT>=FALL_D){ phase='tunnel'; phaseT=0; sZ=TUN.z0; travelled=126+1;
      buildTunnel(); buildTunnelEvents(); showAlert('Под землёй. Бежим к свету'); }
  } else if(phase==='tunnel'){
    if(sZ>TUN.z1+2){ var dz2=TUN_SPEED*dt; sZ-=dz2; travelled+=dz2; }
    else if(!exitHint){
      exitHint=true; showAlert('Прыгнуть — выбраться наверх');
    }
    if(sZ<TUN.z1){ sZ=TUN.z1; }
  } else if(phase==='ladder'){
    if(phaseT>=LADDER_D){
      phase='street2'; phaseT=0; sZ=MANHOLE_Z; travelled=126+94;
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
    if(!e.warned&&sZ-e.z<22&&sZ-e.z>-1){ e.warned=true; showAlert(e.text); }
    if(!e.done&&sZ<=e.z){ e.done=true; judge(e); }
    // падающие обломки
    if(e.pieces&&e.pieces.length){
      var ahead=sZ-e.z;                     // >0 — ещё впереди
      e.pieces.forEach(function(pc){
        var kk=(ahead-24)/(-24);            // 0 впереди за 24 м, 1 в точке события
        if(ahead>26||ahead<-2){ pc.visible=false; return; }
        var k2=clamp((26-ahead)/26,0,1);
        pc.visible=true;
        pc.position.set(pc.userData.off,Math.max(0.2,14*Math.pow(1-k2,2.1))+0.5,
                        e.z+pc.userData.dl);
        pc.rotation.set(k2*2.2,k2*1.4,k2*0.9);
      });
    }
  });

  // кристаллы
  crystals.forEach(function(c){
    if(c.taken)return;
    c.grp.rotation.y+=dt*1.2;
    c.bob+=dt*2;
    c.grp.position.y=1.35+Math.sin(c.bob)*0.12;
    var near=Math.abs(sZ-c.z)<3.2&&(phase==='street1'||phase==='street2'||phase==='tunnel');
    if(near){
      var need=c.side==='left'?'left':'right';
      if(actOk(need)){
        c.taken=true; c.grp.visible=false;
        energy=Math.min(100,energy+5); integrity=Math.min(100,integrity+10);
        flash('ok'); playSfx('ok');
        burst(c.grp.position.clone(),8);
        showAlert('Кристалл собран: +5 энергии, +10 корпуса');
        updateHud();
      }
    }
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

  // осколки
  for(var si=shards.length-1; si>=0; si--){
    var s=shards[si];
    s.userData.life-=dt;
    if(s.userData.life<=0){ scene.remove(s); shards.splice(si,1); continue; }
    s.userData.v.y-=dt*18;
    s.position.addScaledVector(s.userData.v,dt);
    if(s.position.y<0.12){ s.position.y=0.12; s.userData.v.y*=-0.35; s.userData.v.x*=0.7; s.userData.v.z*=0.7; }
    s.material.rotation+=s.userData.spin*dt;
    s.material.opacity=Math.min(1,s.userData.life);
  }

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
  crystals.forEach(function(c){ c.taken=false; c.grp.visible=true; });
  shards.forEach(function(s){ scene.remove(s); }); shards.length=0;
  if(el.dark) el.dark.style.opacity=0;
  updateHud(); showAlert('');
}

function start(){
  if(!scene) return;
  reset(); running=true;
  if(!SFX.amb) loadSounds();
  try{ SFX.amb.currentTime=0; var p=SFX.amb.play(); if(p&&p.catch)p.catch(function(){}); }catch(e){}
  if(el.start) el.start.classList.add('hidden');
  if(el.end) el.end.classList.add('hidden');
}

function finish(){
  if(finished)return;
  finished=true; running=false; phase='done';
  try{ SFX.amb.pause(); }catch(e){}
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
  updateHud();
};

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

window.addEventListener('resize',function(){
  camera.aspect=window.innerWidth/Math.max(1,window.innerHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth,window.innerHeight,false);
});
})();
