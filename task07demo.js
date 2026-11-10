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
var ROAD_W=9;           // ширина дороги, метров
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
    SFX.amb.loop=true; SFX.amb.volume=0.35;
    SFX.hit.volume=0.9; SFX.ok.volume=0.6;
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
  t.anisotropy=4;
  return t;
}

// дорожное полотно: настоящее фото асфальта, осветлённое, с разметкой и трещинами
function roadTexture(photo){
  return canvasTexture(512,function(g,S){
    g.drawImage(photo,0,0,S,S/2);
    g.drawImage(photo,0,S/2,S,S/2);
    // осветляем: на телефоне тёмный вечерний асфальт читается как чёрное пятно
    g.fillStyle='rgba(255,255,255,0.16)'; g.fillRect(0,0,S,S);
    var r=rnd(73117);
    // трещины с бирюзовым свечением — как на фотографии улицы
    function crack(x,y,len,ang){
      g.beginPath(); g.moveTo(x,y);
      for(var k=0;k<len;k++){ x+=Math.cos(ang)*8+r()*11-5.5; y+=Math.sin(ang)*8+r()*11-5.5; ang+=(r()-0.5)*0.8; g.lineTo(x,y); }
      g.strokeStyle='rgba(24,30,33,0.75)'; g.lineWidth=2+r()*2.4; g.stroke();
      g.strokeStyle='rgba(70,240,230,0.75)'; g.lineWidth=1+r(); g.shadowColor='#30e5dc'; g.shadowBlur=6; g.stroke();
      g.shadowBlur=0;
    }
    for(var c=0;c<16;c++) crack(r()*S,r()*S,8+r()*15,r()*6.28);
    // выбоины
    for(var i=0;i<40;i++){
      var v=30+r()*40;
      g.fillStyle='rgba('+Math.round(v)+','+Math.round(v+4)+','+Math.round(v+6)+','+(0.35+r()*0.4)+')';
      g.beginPath(); g.ellipse(r()*S,r()*S,2+r()*7,1.5+r()*5,r()*3.14,0,6.29); g.fill();
    }
    // разметка
    g.fillStyle='rgba(228,238,240,0.5)';
    g.fillRect(S*0.085,0,S*0.012,S);
    g.fillRect(S*0.903,0,S*0.012,S);
    g.fillStyle='rgba(220,232,234,0.36)';
    for(var y=0;y<S;y+=96){ g.fillRect(S*0.494,y,S*0.012,48); }
    var grd=g.createLinearGradient(0,0,S,0);
    grd.addColorStop(0,'rgba(0,0,0,0.14)'); grd.addColorStop(0.14,'rgba(0,0,0,0)');
    grd.addColorStop(0.86,'rgba(0,0,0,0)'); grd.addColorStop(1,'rgba(0,0,0,0.14)');
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
  scene.background=new THREE.Color(0x2c3a42);
  scene.fog=new THREE.Fog(0x3d4b53,32,190);

  camera=new THREE.PerspectiveCamera(72,window.innerWidth/Math.max(1,window.innerHeight),0.1,700);
  scene.add(camera);

  scene.add(new THREE.HemisphereLight(0xc6dbe4,0x39434a,2.15));
  scene.add(new THREE.AmbientLight(0x8fa6ae,0.45));
  var sun=new THREE.DirectionalLight(0xd6ecf2,0.65); sun.position.set(-40,80,-30); scene.add(sun);

  // маршрут: улица с плавным поворотом, а в конце — поворот на другую улицу
  curve=new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,0,10), new THREE.Vector3(0,0,-90), new THREE.Vector3(3,0,-180),
    new THREE.Vector3(14,0,-270), new THREE.Vector3(25,0,-360), new THREE.Vector3(22,0,-450),
    new THREE.Vector3(17,0,-505), new THREE.Vector3(28,0,-540),
    new THREE.Vector3(58,0,-556), new THREE.Vector3(100,0,-562), new THREE.Vector3(150,0,-566)
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
    var v=t*pathLen/12;
    uv.push(0,v, 1,v);
    if(i<SEG){ var a=i*2; idx.push(a,a+1,a+2, a+1,a+3,a+2); }
  }
  var rg=new THREE.BufferGeometry();
  rg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  rg.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  rg.setIndex(idx); rg.computeVertexNormals();

  var loader=new THREE.TextureLoader();
  var roadMat=new THREE.MeshLambertMaterial({color:0xffffff});
  var road=new THREE.Mesh(rg,roadMat);
  scene.add(road);

  // обочины — тот же асфальт, тот же цвет
  var sideMat=new THREE.MeshLambertMaterial({color:0xe8e8e8,side:THREE.DoubleSide});
  [-1,1].forEach(function(side){
    var p2=[],u2=[],i2=[];
    for(var i=0;i<=SEG;i++){
      var t=i/SEG, fr=frame(t);
      var a=fr.p.clone().addScaledVector(fr.right, side*ROAD_W/2);
      var b=fr.p.clone().addScaledVector(fr.right, side*(ROAD_W/2+3.4)).setY(0.05);
      p2.push(a.x,a.y,a.z, b.x,b.y,b.z);
      u2.push(0,t*pathLen/12, 0.4,t*pathLen/12);
      if(i<SEG){ var q=i*2; i2.push(q,q+1,q+2, q+1,q+3,q+2); }
    }
    var g2=new THREE.BufferGeometry();
    g2.setAttribute('position',new THREE.Float32BufferAttribute(p2,3));
    g2.setAttribute('uv',new THREE.Float32BufferAttribute(u2,2));
    g2.setIndex(i2); g2.computeVertexNormals();
    var curb=new THREE.Mesh(g2,sideMat);
    scene.add(curb);
  });

  loader.load(A.road,function(tx){
    tx.anisotropy=8; tx.wrapS=tx.wrapT=THREE.RepeatWrapping;
    var rt=roadTexture(tx.image);
    roadMat.map=rt; roadMat.needsUpdate=true;
    sideMat.map=rt; sideMat.needsUpdate=true;
  });

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
    var w=1.30, h=w/(tx.image.width/tx.image.height);
    capsule=new THREE.Mesh(new THREE.PlaneGeometry(w,h),
      new THREE.MeshBasicMaterial({map:tx,transparent:true,depthTest:false,depthWrite:false}));
    capsule.position.set(0,-0.62,-1.0);
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
    {d:45,  type:'pit',    need:'jump',  text:'Провал! Прыжок'},
    {d:90,  type:'debris', need:'left',  text:'Обломки падают справа!'},
    {d:132, type:'beam',   need:'duck',  text:'Низкая балка!'},
    {d:176, type:'debris', need:'right', text:'Обломки падают слева!'},
    {d:218, type:'pit',    need:'jump',  text:'Провал! Прыжок'},
    {d:258, type:'debris', need:'left',  text:'Обломки падают справа!'},
    {d:300, type:'beam',   need:'duck',  text:'Низкая балка!'},
    {d:342, type:'debris', need:'right', text:'Обломки падают слева!'},
    {d:384, type:'pit',    need:'jump',  text:'Провал! Прыжок'},
    {d:426, type:'debris', need:'left',  text:'Обломки падают справа!'},
    {d:468, type:'beam',   need:'duck',  text:'Низкая балка!'},
    {d:510, type:'debris', need:'right', text:'Обломки падают слева!'},
    {d:552, type:'pit',    need:'jump',  text:'Провал! Прыжок'},
    {d:592, type:'debris', need:'left',  text:'Обломки падают справа!'},
    {d:630, type:'pit',    need:'jump',  text:'Провал! Прыжок'}
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
      var wallMat=new THREE.MeshLambertMaterial({color:0x2b3135,side:THREE.BackSide});
      var wall=new THREE.Mesh(new THREE.CylinderGeometry(3.7,2.1,4.4,28,1,true),wallMat);
      wall.position.y=-2.1; pitGroup.add(wall);
      var bottom=new THREE.Mesh(new THREE.CircleGeometry(2.1,28),
        new THREE.MeshBasicMaterial({color:0x04070a}));
      bottom.rotation.x=-Math.PI/2; bottom.position.y=-4.2; pitGroup.add(bottom);
      var rim=new THREE.Mesh(new THREE.PlaneGeometry(7.4,5.4),
        new THREE.MeshBasicMaterial({map:pitTex,transparent:true,depthWrite:false}));
      rim.rotation.x=-Math.PI/2; rim.position.y=0.07; pitGroup.add(rim);
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
        var sc=1.6+Math.random()*1.1;
        sp.scale.set(sc,sc*0.72,1);
        sp.userData.off=side*(0.6+Math.random()*2.4);
        sp.userData.dl=(Math.random()-0.5)*2.4;
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
    var sc=0.3+Math.random()*0.55;
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

  var wp=camera.position.clone().addScaledVector(tmpF,3); wp.y=0.4;

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
    if(e.type==='pit') dipT=dipMax;               // провалились в дыру
    flash('hit');
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

// ——— кадр ———
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
    elapsed+=dt;
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
  camPos.y+=EYE+jumpY-duckY+bob;
  if(dipT>0) camPos.y-=Math.sin(Math.PI*(1-dipT/dipMax))*1.55;

  if(shake>0){
    camPos.x+=(Math.random()-0.5)*shake*0.5;
    camPos.y+=(Math.random()-0.5)*shake*0.4;
  }

  camera.position.copy(camPos);
  var lookAtT=Math.min(1,t+0.02);
  look.copy(curve.getPointAt(lookAtT)).addScaledVector(tmpR,lane*LANE_SHIFT*1.8);
  look.y+=EYE+jumpY*0.2-duckY*0.15-0.05-jumpK*0.5;   // камера взлетает, взгляд остаётся низко — прыжок виден
  camera.lookAt(look);
  camera.rotateZ(-lane*0.16);                 // заметный крен при манёвре

  if(capsule){
    capsule.position.y=-0.62+bob*0.9+jumpK*0.05;
    capsule.position.x=-lane*0.12;
    capsule.rotation.z=Math.sin(elapsed*5.2)*0.012-lane*0.05;
  }

  // затемнение при провале
  if(el.dark) el.dark.style.opacity=(dipT>0?Math.min(0.8,Math.sin(Math.PI*(1-dipT/dipMax))*0.8):0).toFixed(3);

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
        s.visible=true;
        var kk=Math.max(0,Math.min(1.1,k));
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
