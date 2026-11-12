/* task07demo.js — задание 7, пробный 3D-участок (60 секунд). Версия 0312b.
   Изолированная демонстрация: без сети, без Firebase, без общего потока квеста.
   Правки по отзыву автора 10.11.2026:
   — фасады домов из настоящей фотографии улицы, а не рисованные;
   — дорога и обочины одного цвета и одной текстуры;
   — заметная реакция на кнопки и свайпы;
   — минута вместо тридцати секунд, предупреждение заранее, времени на реакцию больше;
   — эффекты: падение в провал с затемнением, пыль, тряска, вспышки;
   — капсула крупнее и ниже; если рядом положить capsule_hands.png, подхватится картинка «капсула в руках». */
(function(){
'use strict';

var note=document.getElementById('t7-loadnote');
if(!window.THREE){ if(note)note.textContent='Не загрузилась 3D-библиотека (vendor/three.min.js)'; return; }

// ——— параметры участка ———
var DURATION=60;        // длительность пробного участка, секунд (решение автора 10.11.2026)
var ROAD_W=13;          // ширина дороги, метров (обочины убраны — они давали чёрные полосы)
var EYE=1.62;           // высота камеры
var LANE_SHIFT=4.4;     // боковое смещение при манёвре, метров — заметнее, чем было
var WARN_AHEAD=40;      // за сколько метров до препятствия показать предупреждение
var HIT_DAMAGE=15;      // урон корпусу за ошибку
var REACT_WINDOW=1.5;   // сколько секунд после нажатия действие считается своевременным

var A={bg:'assets/task07/street_bg.jpg',capsule:'assets/task07/capsule.png',
       capsuleHands:'assets/task07/capsule_hands.png',
       concrete:'assets/task07/concrete.png',pit:'assets/task07/pit.png',
       road:'assets/task07/road.jpg',
       facades:['assets/task07/facade1.jpg','assets/task07/facade2.jpg',
                'assets/task07/facade3.jpg','assets/task07/facade4.jpg']};

// звуки: удар, успешное действие, фон бега
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
var curve,pathLen;
var capsule,lastAct='',lastActAt=-9;
var lane=0,laneTarget=0,holdT=0,jumpT=0,duckT=0,shake=0,dipT=0,dipMax=1.3;
var progress=0,elapsed=0,running=false,finished=false;
var integrity=100,energy=100,passed=0,failed=0;
var topView=false,topMix=0;
var events=[],fpsSamples=[],lowQuality=false;
var pitTex=null,conTex=null,dustTex=null;
var facadeTex=[],dust=[];

var el={prog:document.getElementById('t7-progress'),time:document.getElementById('t7-time'),
        energy:document.getElementById('t7-energy'),integrity:document.getElementById('t7-integrity'),
        alert:document.getElementById('t7-alert'),flash:document.getElementById('t7-flash'),
        judge:document.getElementById('t7-judge'),
        dark:document.getElementById('t7-dark'),
        start:document.getElementById('t7-start'),end:document.getElementById('t7-end'),
        endTitle:document.getElementById('t7-end-title'),endText:document.getElementById('t7-end-text')};

// ——— вспомогательное ———
function rnd(seed){ var s=seed%2147483647; if(s<=0)s+=2147483646;
  return function(){ s=s*16807%2147483647; return (s-1)/2147483646; }; }

function canvasTexture(size,draw){
  var c=document.createElement('canvas'); c.width=size; c.height=size;
  draw(c.getContext('2d'),size);
  var t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.anisotropy=8;
  return t;
}

// дорожное полотно: ровный серый асфальт, трещины с бирюзовым свечением, выбоины, разметка.
// Фотография как основа не годится: у неё есть почти чёрные участки, дорога выглядит обрывками.
function roadTexture(photo){
  return canvasTexture(512,function(g,S){
    var r=rnd(73117);
    g.fillStyle='#5c666d'; g.fillRect(0,0,S,S);
    // зерно асфальта
    for(var i=0;i<9000;i++){
      var v=52+r()*46;
      g.fillStyle='rgba('+Math.round(v)+','+Math.round(v+5)+','+Math.round(v+7)+','+(0.1+r()*0.35)+')';
      g.fillRect(r()*S,r()*S,1+r()*3,1+r()*3);
    }
    // трещины с бирюзовым свечением — как на фотографии улицы
    function crack(x,y,len,ang){
      g.beginPath(); g.moveTo(x,y);
      for(var k=0;k<len;k++){ x+=Math.cos(ang)*8+r()*11-5.5; y+=Math.sin(ang)*8+r()*11-5.5; ang+=(r()-0.5)*0.8; g.lineTo(x,y); }
      g.strokeStyle='rgba(20,26,29,0.85)'; g.lineWidth=7+r()*7; g.stroke();
      g.strokeStyle='rgba(70,240,230,0.8)'; g.lineWidth=3.5+r()*3; g.shadowColor='#30e5dc'; g.shadowBlur=7; g.stroke();
      g.shadowBlur=0;
    }
    for(var c=0;c<18;c++) crack(r()*S,r()*S,8+r()*15,r()*6.28);
    // выбоины
    for(var h=0;h<50;h++){
      var vv=34+r()*54;
      g.fillStyle='rgba('+Math.round(vv)+','+Math.round(vv+4)+','+Math.round(vv+6)+','+(0.3+r()*0.4)+')';
      g.beginPath(); g.ellipse(r()*S,r()*S,2+r()*8,1.5+r()*5,r()*3.14,0,6.29); g.fill();
    }
    // разметка
    g.fillStyle='rgba(228,238,240,0.55)';
    g.fillRect(S*0.085,0,S*0.014,S);
    g.fillRect(S*0.901,0,S*0.014,S);
    g.fillStyle='rgba(220,232,234,0.4)';
    for(var y=0;y<S;y+=96){ g.fillRect(S*0.493,y,S*0.014,48); }
    // тёмные края
    var grd=g.createLinearGradient(0,0,S,0);
    grd.addColorStop(0,'rgba(0,0,0,0.22)'); grd.addColorStop(0.16,'rgba(0,0,0,0)');
    grd.addColorStop(0.84,'rgba(0,0,0,0)'); grd.addColorStop(1,'rgba(0,0,0,0.22)');
    g.fillStyle=grd; g.fillRect(0,0,S,S);
  });
}

// мягкое пятно пыли
function dustTexture(){
  var c=document.createElement('canvas'); c.width=c.height=64;
  var g=c.getContext('2d');
  var grd=g.createRadialGradient(32,32,2,32,32,31);
  grd.addColorStop(0,'rgba(215,225,225,0.85)');
  grd.addColorStop(0.5,'rgba(190,200,200,0.35)');
  grd.addColorStop(1,'rgba(180,190,190,0)');
  g.fillStyle=grd; g.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(c);
}

// ——— построение мира ———
function build(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x475a64);
  scene.fog=new THREE.Fog(0x3d4b53,14,78);

  camera=new THREE.PerspectiveCamera(72,window.innerWidth/Math.max(1,window.innerHeight),0.1,700);
  scene.add(camera);

  scene.add(new THREE.HemisphereLight(0xb9d0da,0x2c3438,1.55));
  scene.add(new THREE.AmbientLight(0x8fa6ae,0.18));
  var sun=new THREE.DirectionalLight(0xd6ecf2,0.6); sun.position.set(-40,80,-30); scene.add(sun);

  // маршрут: улица с плавным поворотом, а в конце — поворот на другую улицу
  curve=new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,0,10), new THREE.Vector3(0,0,-90), new THREE.Vector3(3,0,-180),
    new THREE.Vector3(10,0,-255), new THREE.Vector3(18,0,-315), new THREE.Vector3(24,0,-360),
    new THREE.Vector3(50,0,-398), new THREE.Vector3(95,0,-420), new THREE.Vector3(150,0,-428),
    new THREE.Vector3(205,0,-430), new THREE.Vector3(265,0,-432), new THREE.Vector3(325,0,-434)
  ],false,'catmullrom',0.4);
  pathLen=curve.getLength();

  var up=new THREE.Vector3(0,1,0);
  function frame(t){
    var p=curve.getPointAt(t), f=curve.getTangentAt(t);
    var right=new THREE.Vector3().crossVectors(f,up).normalize();
    return {p:p,f:f,right:right};
  }

  // дорога — лента по кривой
  var SEG=400,pos=[],uv=[],idx=[];
  for(var i=0;i<=SEG;i++){
    var t=i/SEG, fr=frame(t);
    var l=fr.p.clone().addScaledVector(fr.right, ROAD_W/2);
    var r=fr.p.clone().addScaledVector(fr.right,-ROAD_W/2);
    pos.push(l.x,l.y,l.z, r.x,r.y,r.z);
    var v=t*pathLen/45;
    uv.push(0,v, 1,v);
    if(i<SEG){ var a=i*2; idx.push(a,a+1,a+2, a+1,a+3,a+2); }
  }
  var rg=new THREE.BufferGeometry();
  rg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  rg.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  rg.setIndex(idx); rg.computeVertexNormals();

  var loader=new THREE.TextureLoader();
  var roadMat=new THREE.MeshLambertMaterial({color:0xffffff, map:roadTexture(), emissive:new THREE.Color(0x2c3439), emissiveIntensity:1});
  var road=new THREE.Mesh(rg,roadMat);
  scene.add(road);

  // обочины не строим: отдельная полоса по краю читалась как чёрный провал.
  // Дорога шире, один материал на всё полотно.

  // текстура дороги уже натянута при создании материала (не зависит от загрузки файлов)

  // фасады из фотографии улицы. ВАЖНО: здания строим ТОЛЬКО после загрузки картинок,
  // иначе материал берётся пустым и дома остаются серыми параллелепипедами.
  var needF=A.facades.length, buildingsDone=false;
  function buildBuildings(){
    if(buildingsDone)return;
    buildingsDone=true;
    var r=rnd(555);
    var fallback=new THREE.MeshLambertMaterial({color:0x55605f});
    function addBuilding(fr2,ang,side,off,h,w,dep){
      var geo=new THREE.BoxGeometry(dep,h,w);
      // окна нужного размера: повторяем фото по стене, не клонируя текстуру
      var repX=Math.max(1,Math.round(dep/11)), repY=Math.max(2,Math.round(h/9));
      var uv=geo.attributes.uv;
      for(var ui=0;ui<uv.count;ui++){ uv.setXY(ui,uv.getX(ui)*repX,uv.getY(ui)*repY); }
      uv.needsUpdate=true;
      var mTop=new THREE.MeshLambertMaterial({color:0x39434a});
      var tex=facadeTex.length?facadeTex[Math.floor(r()*facadeTex.length)]:null;
      var mSide=tex?new THREE.MeshLambertMaterial({map:tex}):fallback;
      var b=new THREE.Mesh(geo,[mSide,mSide,mTop,mTop,mSide,mSide]);
      b.position.copy(fr2.p).addScaledVector(fr2.right, side*off);
      b.position.y=h/2;
      b.rotation.y=ang;
      scene.add(b);
    }
    // сплошная застройка вдоль улицы: два ряда, чтобы между домами не было чёрных провалов
    for(var d=6; d<pathLen-6; d+=16){
      var t2=d/pathLen, fr2=frame(t2);
      var ang=Math.atan2(fr2.f.x,fr2.f.z);
      [-1,1].forEach(function(side){
        var dep=12+r()*8, h=14+r()*22, w=18+r()*10;
        addBuilding(fr2,ang,side,ROAD_W/2+3.4+dep/2,h,w,dep);
        var dep2=12+r()*8, h2=24+r()*24, w2=16+r()*12;
        addBuilding(fr2,ang,side,ROAD_W/2+3.4+dep+2+dep2/2,h2,w2,dep2);
      });
    }
  }
  A.facades.forEach(function(url){
    loader.load(url,function(tx){
      tx.wrapS=tx.wrapT=THREE.RepeatWrapping; tx.anisotropy=8; facadeTex.push(tx);
      if(--needF===0) buildBuildings();
    },undefined,function(){ if(--needF===0) buildBuildings(); });
  });

  // парящее здание в глубине — как на изображении
  var frMid=frame(0.6);
  var hover=new THREE.Mesh(new THREE.BoxGeometry(16,28,15),
    new THREE.MeshLambertMaterial({color:0x59666b,emissive:new THREE.Color(0x1d4a4d),emissiveIntensity:0.3}));
  hover.position.copy(frMid.p).addScaledVector(frMid.right,-17);
  hover.position.y=40; hover.rotation.y=Math.PI/6; hover.rotation.z=0.05;
  scene.add(hover);

  // дальний план — фотография улицы, впритык к концу дороги
  loader.load(A.bg,function(tx){
    tx.anisotropy=4;
    var endF=frame(1);
    var bg=new THREE.Mesh(new THREE.PlaneGeometry(300,160),
      new THREE.MeshBasicMaterial({map:tx,fog:false,transparent:true,opacity:0.62,depthWrite:false}));
    bg.position.copy(endF.p).addScaledVector(endF.f,22);
    bg.position.y=44;
    bg.rotation.y=Math.atan2(endF.f.x,endF.f.z)+Math.PI;
    scene.add(bg);
    note.textContent='';
  },undefined,function(){ if(note)note.textContent='Фон улицы не загрузился, участок всё равно работает'; });

  // капсула в руках: сначала пробуем картинку «капсула в руках», иначе обычный рендер
  function placeCapsule(tx){
    var w=0.72, h=w/(tx.image.width/tx.image.height);
    capsule=new THREE.Mesh(new THREE.PlaneGeometry(w,h),
      new THREE.MeshBasicMaterial({map:tx,transparent:true,depthTest:false,depthWrite:false}));
    capsule.position.set(0,-0.72,-1.0);
    capsule.renderOrder=999;
    camera.add(capsule);
  }
  loader.load(A.capsuleHands,function(tx){ placeCapsule(tx); },undefined,function(){
    loader.load(A.capsule,function(tx){ placeCapsule(tx); });
  });

  // препятствия: строим после загрузки нужных картинок
  var need=2;
  function readyLoad(){ if(--need===0) buildEvents(); }
  loader.load(A.pit,function(tx){ pitTex=tx; readyLoad(); },undefined,readyLoad);
  loader.load(A.concrete,function(tx){ conTex=tx; readyLoad(); },undefined,readyLoad);
  dustTex=dustTexture();

  note.textContent='Загрузка улицы…';
}

// ——— препятствия и порядок событий ———
function buildEvents(){
  if(events.length)return;
  var defs=[
    {d:40,  type:'pit',    need:'jump',  text:'Провал! Прыжок'},
    {d:80,  type:'debris', need:'left',  text:'Обломки падают справа!'},
    {d:118, type:'beam',   need:'duck',  text:'Низкая балка!'},
    {d:156, type:'debris', need:'right', text:'Обломки падают слева!'},
    {d:194, type:'pit',    need:'jump',  text:'Провал! Прыжок'},
    {d:232, type:'debris', need:'left',  text:'Обломки падают справа!'},
    {d:268, type:'beam',   need:'duck',  text:'Низкая балка!'},
    {d:304, type:'debris', need:'right', text:'Обломки падают слева!'},
    {d:340, type:'pit',    need:'jump',  text:'Провал! Прыжок'},
    {d:376, type:'debris', need:'left',  text:'Обломки падают справа!'},
    {d:412, type:'beam',   need:'duck',  text:'Низкая балка!'},
    {d:448, type:'debris', need:'right', text:'Обломки падают слева!'},
    {d:482, type:'pit',    need:'jump',  text:'Провал! Прыжок'},
    {d:516, type:'debris', need:'left',  text:'Обломки падают справа!'},
    {d:548, type:'beam',   need:'duck',  text:'Низкая балка!'},
    {d:580, type:'pit',    need:'jump',  text:'Провал! Прыжок'}
  ];
  var up=new THREE.Vector3(0,1,0);

  defs.forEach(function(e){
    var t=e.d/pathLen;
    if(t>0.99)t=0.99;
    var p=curve.getPointAt(t), f=curve.getTangentAt(t);
    var right=new THREE.Vector3().crossVectors(f,up).normalize();
    var ang=Math.atan2(f.x,f.z);

    if(e.type==='pit'){
      // настоящая яма: стенки вниз, дно в темноте, рваные края асфальта сверху
      var pitGroup=new THREE.Group();
      // стенки ямы — бетон с трещинами, видно изнутри
      var wallMap=null;
      if(conTex){ wallMap=conTex.clone(); wallMap.needsUpdate=true; wallMap.wrapS=wallMap.wrapT=THREE.RepeatWrapping; wallMap.repeat.set(4,2); }
      var wallMat=new THREE.MeshLambertMaterial({color:0x8f9498,map:wallMap,side:THREE.BackSide,
        emissive:new THREE.Color(0x14181b),emissiveIntensity:1});
      var wall=new THREE.Mesh(new THREE.CylinderGeometry(3.9,2.2,4.6,28,1,true),wallMat);
      wall.position.y=-2.2; pitGroup.add(wall);
      // дно: бетонная плита с обломками
      var botMap=null;
      if(conTex){ botMap=conTex.clone(); botMap.needsUpdate=true; botMap.wrapS=botMap.wrapT=THREE.RepeatWrapping; botMap.repeat.set(2,2); }
      var bottom=new THREE.Mesh(new THREE.CircleGeometry(2.2,28),
        new THREE.MeshLambertMaterial({color:0x9aa0a3,map:botMap,emissive:new THREE.Color(0x101416),emissiveIntensity:1}));
      bottom.rotation.x=-Math.PI/2; bottom.position.y=-4.3; pitGroup.add(bottom);
      // свет внутри ямы, чтобы дно было видно
      var pitLight=new THREE.PointLight(0xbfe6ff,1.4,14);
      pitLight.position.set(0,-1.2,0); pitGroup.add(pitLight);
      // обломки на дне и по краю
      for(var pk=0;pk<12;pk++){
        var ang2=pk/12*Math.PI*2;
        var mat2=conTex?new THREE.SpriteMaterial({map:conTex,transparent:true,depthWrite:false})
                       :new THREE.SpriteMaterial({color:0x6d7173});
        var chunk=new THREE.Sprite(mat2);
        var cs=0.8+Math.random()*1.1;
        chunk.scale.set(cs,cs*0.8,1);
        if(pk<6){ chunk.position.set(Math.cos(ang2)*3.5,0.2,Math.sin(ang2)*3.5); }
        else { chunk.position.set(Math.cos(ang2)*1.5,-4.2,Math.sin(ang2)*1.5); }
        pitGroup.add(chunk);
      }
      pitGroup.position.copy(p);
      pitGroup.rotation.y=ang;
      scene.add(pitGroup);
      e.mesh=pitGroup;
    }

    if(e.type==='beam'){
      // бетонная балка, просевшая над дорогой
      var beamMat=conTex?new THREE.MeshLambertMaterial({map:conTex})
                        :new THREE.MeshLambertMaterial({color:0x6a6b66});
      var b=new THREE.Mesh(new THREE.BoxGeometry(ROAD_W+1.6,0.9,1.3),beamMat);
      b.position.copy(p).setY(1.72); b.rotation.y=ang; b.rotation.z=0.05;
      scene.add(b);
      // обломки-опоры по краям
      var legMat=conTex?new THREE.MeshLambertMaterial({map:conTex})
                       :new THREE.MeshLambertMaterial({color:0x5c5d58});
      [-1,1].forEach(function(s){
        var leg=new THREE.Mesh(new THREE.BoxGeometry(1.1,1.8,1.2),legMat);
        leg.position.copy(p).addScaledVector(right,s*(ROAD_W/2+0.4)).setY(0.9);
        leg.rotation.y=ang+(s*0.2); scene.add(leg);
      });
    }

    if(e.type==='debris'){
      e.origin=p.clone(); e.fwd=f.clone(); e.right=right.clone(); e.pieces=[];
      var side=(e.need==='left')?1:-1;
      for(var k=0;k<5;k++){
        var mat=conTex?new THREE.SpriteMaterial({map:conTex,transparent:true,depthWrite:false})
                      :new THREE.SpriteMaterial({color:0x8a8f8c});
        var sp=new THREE.Sprite(mat);
        var sc=0.4+Math.random()*0.35;
        sp.scale.set(sc,sc*0.72,1);
        sp.userData.off=side*(1.6+Math.random()*3.6);
        sp.userData.dl=(Math.random()-0.5)*3.6;
        sp.visible=false;
        scene.add(sp); e.pieces.push(sp);
      }
    }
    events.push(e);
  });
}

// разлёт мелких обломков в стороны при ударе
var shards=[];
function burst(worldPos){
  if(!conTex)return;
  for(var i=0;i<11;i++){
    var m=new THREE.SpriteMaterial({map:conTex,transparent:true,depthWrite:false});
    var sp=new THREE.Sprite(m);
    var sc=0.22+Math.random()*0.3;
    sp.scale.set(sc,sc*0.9,1);
    sp.position.copy(worldPos).add(new THREE.Vector3((Math.random()-0.5)*1.6,0.4+Math.random()*1.2,(Math.random()-0.5)*1.6));
    sp.userData.v=new THREE.Vector3((Math.random()-0.5)*8,2.5+Math.random()*4.5,(Math.random()-0.5)*8);
    sp.userData.spin=(Math.random()-0.5)*10;
    sp.userData.life=1.2+Math.random()*0.7;
    scene.add(sp); shards.push(sp);
  }
}

// ——— управление ———
function doAction(a){
  if(!running||finished)return;
  lastAct=a; lastActAt=elapsed;
  if(a==='left'){ laneTarget=-1; holdT=2.6; }
  if(a==='right'){ laneTarget=1; holdT=2.6; }
  if(a==='jump'){ if(jumpT<=0) jumpT=0.95; }
  if(a==='duck'){ if(duckT<=0) duckT=0.8; }
  var btn=document.querySelector('[data-act="'+a+'"]');
  if(btn){ btn.classList.add('on'); setTimeout(function(){btn.classList.remove('on');},130); }
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

document.getElementById('t7-topview').addEventListener('click',function(){
  topView=!topView; this.classList.toggle('on',topView);
  this.textContent=topView?'Вид бегуна':'Вид сверху';
});

// ——— логика ———
function judge(e){
  var ok=false;
  if(e.need==='jump') ok=(jumpT>0)||(lastAct==='jump'&&elapsed-lastActAt<REACT_WINDOW);
  else if(e.need==='duck') ok=(duckT>0)||(lastAct==='duck'&&elapsed-lastActAt<REACT_WINDOW);
  else if(e.need==='left') ok=(lane<-0.4)||(lastAct==='left'&&elapsed-lastActAt<REACT_WINDOW);
  else if(e.need==='right') ok=(lane>0.4)||(lastAct==='right'&&elapsed-lastActAt<REACT_WINDOW);

  var wp=camera.position.clone().addScaledVector(tmpF,7); wp.y=0.4;

  if(ok){
    passed++;
    flash('ok');
    playSfx('ok');
    burst(wp);
    if(e.type==='debris'&&e.pieces) e.pieces.forEach(function(s){ s.userData.missed=true; });
  }else{
    failed++;
    integrity=Math.max(0,integrity-HIT_DAMAGE);
    shake=1.5;
    if(e.type==='pit') dipT=DIP_DUR;               // провалились в дыру и выпрыгиваем обратно
    playSfx('hit');
    burst(wp);
    if(integrity<=0){
      integrity=30;
      showAlert('Аварийная стабилизация! Корпус восстановлен');
    }
  }
  updateHud();
}

function flash(kind){
  el.flash.className=kind;
  setTimeout(function(){ el.flash.className=''; },260);
}

var alertTimer=null;
function showAlert(text){
  if(!text){ el.alert.classList.remove('show'); return; }
  el.alert.textContent=text;
  el.alert.classList.add('show');
  if(alertTimer)clearTimeout(alertTimer);
  alertTimer=setTimeout(function(){ el.alert.classList.remove('show'); },2100);
}

function updateHud(){
  el.prog.textContent=Math.round(progress*100)+'%';
  el.time.textContent=Math.max(0,Math.ceil(DURATION-elapsed));
  el.energy.textContent=Math.round(energy)+'%';
  el.integrity.textContent=Math.round(integrity)+'%';
  el.integrity.className=integrity<=30?'bad':(integrity<=60?'warn':'');
}

// падение в яму: вниз на дно, задержка (видно дно и обломки), затем выпрыгиваем обратно
var DIP_DUR=1.7;
function dipOffset(){
  if(dipT<=0) return 0;
  var t=1-dipT/DIP_DUR;
  if(t<0.32) return -4.0*(t/0.32);
  if(t<0.62) return -4.0;
  return -4.0*(1-(t-0.62)/0.38);
}
var up=new THREE.Vector3(0,1,0);
var tmpF=new THREE.Vector3(), tmpR=new THREE.Vector3(), camPos=new THREE.Vector3(), look=new THREE.Vector3();

function tick(){
  requestAnimationFrame(tick);
  var dt=Math.min(0.05,clock.getDelta());

  fpsSamples.push(dt);
  if(fpsSamples.length>90){
    var avg=fpsSamples.reduce(function(a,b){return a+b;},0)/fpsSamples.length;
    fpsSamples.length=0;
    if(!lowQuality && avg>0.033){ lowQuality=true; renderer.setPixelRatio(Math.min(1,window.devicePixelRatio||1)); }
  }

  if(running&&!finished){
    if(dipT<=0) elapsed+=dt;          // пока падаем в яму, вперёд не движемся
    progress=Math.min(1,elapsed/DURATION);
    if(progress>=1) finish();
  }

  holdT=Math.max(0,holdT-dt);
  if(holdT<=0) laneTarget=0;
  lane+=(laneTarget-lane)*Math.min(1,dt*16);
  jumpT=Math.max(0,jumpT-dt);
  duckT=Math.max(0,duckT-dt);
  dipT=Math.max(0,dipT-dt);
  shake=Math.max(0,shake-dt*1.1);

  var t=Math.min(0.999,progress);
  var p=curve.getPointAt(t), f=curve.getTangentAt(t);
  tmpF.copy(f); tmpR.crossVectors(tmpF,up).normalize();

  var jumpK=jumpT>0?Math.sin(Math.PI*(1-jumpT/0.95)):0;
  var jumpY=jumpK*2.1;
  var duckY=duckT>0?Math.min(1,duckT/0.35)*1.15:0;
  var bob=Math.sin(elapsed*9)*0.024;

  camPos.copy(p).addScaledVector(tmpR,lane*LANE_SHIFT);
  var dip=dipOffset();
  camPos.y+=EYE+jumpY-duckY+bob+dip;

  if(shake>0){
    camPos.x+=(Math.random()-0.5)*shake*0.5;
    camPos.y+=(Math.random()-0.5)*shake*0.4;
  }

  camera.position.copy(camPos);
  var lookAtT=Math.min(1,t+0.02);
  look.copy(curve.getPointAt(lookAtT)).addScaledVector(tmpR,lane*LANE_SHIFT*1.8);
  look.y+=EYE+jumpY*0.2-duckY*0.15-0.05-jumpK*0.5+dip*1.25;   // в яме смотрим вниз, на дно
  camera.lookAt(look);
  camera.rotateZ(-lane*0.16);                 // заметный крен при манёвре

  if(capsule){
    capsule.position.y=-0.62+bob*0.9+jumpK*0.05;
    capsule.position.x=-lane*0.12;
    capsule.rotation.z=Math.sin(elapsed*5.2)*0.012-lane*0.05;
  }

  // в яме слегка темнеет, но дно остаётся видно
  if(el.dark) el.dark.style.opacity=(dipT>0?Math.min(0.28,Math.sin(Math.PI*(1-dipT/DIP_DUR))*0.28):0).toFixed(3);

  // вид наблюдателя сверху
  topMix+=((topView?1:0)-topMix)*Math.min(1,dt*4);
  if(capsule) capsule.visible=topMix<0.45;
  if(topMix>0.002){
    var high=camPos.clone().addScaledVector(tmpF,-9); high.y+=17;
    camera.position.lerp(high,topMix);
    var downTarget=camPos.clone().addScaledVector(tmpF,7); downTarget.y=0;
    camera.lookAt(look.clone().lerp(downTarget,topMix));
  }

  // препятствия
  var dist=progress*pathLen;
  events.forEach(function(e){
    if(!e.warned && dist>e.d-WARN_AHEAD){ e.warned=true; showAlert(e.text); }
    if(!e.done && dist>=e.d){ e.done=true; judge(e); }

    if(e.type==='debris'&&e.pieces){
      var rem=e.d-dist, K=20;
      e.pieces.forEach(function(s){
        var k=(K-rem)/K;
        if(s.userData.missed){
          s.position.y-=dt*13;
          if(s.position.y<-2)s.visible=false;
          return;
        }
        if(k<-0.12||k>1.2){ s.visible=false; return; }
        var kk=Math.max(0,Math.min(1.1,k));
        var ahead=(1-kk)*K + s.userData.dl;
        if(ahead<6){ s.visible=false; return; }   // не даём обломку пролететь вплотную к лицу
        s.visible=true;
        s.position.copy(e.origin)
          .addScaledVector(e.right, s.userData.off)
          .addScaledVector(e.fwd, (1-kk)*K + s.userData.dl);
        var fall=Math.max(0,1-kk);
        s.position.y=0.65+16*Math.pow(fall,1.9);
        s.material.rotation+=dt*1.1;
      });
    }
  });

  // обломки: летят в стороны, падают и подпрыгивают
  for(var i=shards.length-1;i>=0;i--){
    var s=shards[i];
    s.userData.life-=dt;
    if(s.userData.life<=0){ scene.remove(s); shards.splice(i,1); continue; }
    s.userData.v.y-=dt*18;
    s.position.addScaledVector(s.userData.v,dt);
    if(s.position.y<0.12){ s.position.y=0.12; s.userData.v.y*=-0.35; s.userData.v.x*=0.7; s.userData.v.z*=0.7; }
    s.material.rotation+=s.userData.spin*dt;
    s.material.opacity=Math.min(1,s.userData.life);
  }

  updateHud();
  renderer.render(scene,camera);
}

// ——— запуск и остановка ———
function reset(){
  elapsed=0;progress=0;lane=0;laneTarget=0;holdT=0;jumpT=0;duckT=0;shake=0;dipT=0;
  integrity=100;energy=100;passed=0;failed=0;finished=false;
  lastAct='';lastActAt=-9;
  events.forEach(function(e){
    e.done=false;e.warned=false;
    if(e.pieces) e.pieces.forEach(function(s){ s.visible=false; s.userData.missed=false; });
  });
  dust.forEach(function(d){ scene.remove(d); }); dust.length=0;
  shards.forEach(function(s){ scene.remove(s); }); shards.length=0;
  if(el.dark) el.dark.style.opacity=0;
  updateHud(); showAlert('');
}

function start(){
  reset(); running=true;
  if(!SFX.amb) loadSounds();
  try{ SFX.amb.currentTime=0; var pa=SFX.amb.play(); if(pa&&pa.catch)pa.catch(function(){}); }catch(e){}
  el.start.classList.add('hidden'); el.end.classList.add('hidden');
}

function finish(){
  finished=true; running=false;
  try{ SFX.amb.pause(); }catch(e){}
  el.endTitle.textContent=failed===0?'Участок пройден без ошибок':'Участок пройден';
  el.endText.textContent='Целостность капсулы: '+Math.round(integrity)+'%. Успешных действий: '+passed+
    ', ошибок: '+failed+'. Энергия: '+Math.round(energy)+'%.';
  el.end.classList.remove('hidden');
}

document.getElementById('t7-play').addEventListener('click',start);
document.getElementById('t7-again').addEventListener('click',start);

// ——— инициализация ———
// отладочный переход по маршруту (только для проверки вида, в игре не используется)
window.__t7goto=function(p){ elapsed=DURATION*Math.max(0,Math.min(1,p)); progress=elapsed/DURATION; };

try{
  renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:false,powerPreference:'high-performance'});
}catch(err){
  if(note)note.textContent='Этот телефон не поддерживает объёмную графику. Нужен запасной простой режим.';
  return;
}
renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
renderer.setSize(window.innerWidth,window.innerHeight,false);
renderer.outputEncoding=THREE.sRGBEncoding;

clock=new THREE.Clock();
build();
updateHud();
tick();

window.addEventListener('resize',function(){
  camera.aspect=window.innerWidth/Math.max(1,window.innerHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth,window.innerHeight,false);
});
})();
