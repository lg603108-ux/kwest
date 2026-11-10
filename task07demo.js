/* task07demo.js — задание 7, пробный 3D-участок (30 секунд).
   Изолированная демонстрация: без сети, без Firebase, без общего потока квеста.
   Проверяем только вид и управление: дорога с поворотом, здания, капсула в руках,
   провал, падающие сверху обломки, низкая балка. */
(function(){
'use strict';

var note=document.getElementById('t7-loadnote');
if(!window.THREE){ if(note)note.textContent='Не загрузилась 3D-библиотека (vendor/three.min.js)'; return; }

// ——— параметры участка ———
var DURATION=30;        // длительность пробного участка, секунд
var ROAD_W=9;           // ширина дороги, метров
var EYE=1.62;           // высота камеры (в руках капсула)
var LANE_SHIFT=2.4;     // боковое смещение при манёвре, метров
var WARN_AHEAD=20;      // за сколько метров до препятствия показать предупреждение
var HIT_DAMAGE=15;      // урон корпусу за ошибку

var A={bg:'assets/task07/street_bg.jpg',capsule:'assets/task07/capsule.png',
       concrete:'assets/task07/concrete.png',pit:'assets/task07/pit.png'};

// ——— сцена ———
var canvas=document.getElementById('t7-canvas');
var renderer,scene,camera,clock;
var curve,pathLen;
var capsule,lastAct='',lastActAt=-9;
var lane=0,laneTarget=0,holdT=0,jumpT=0,duckT=0,shake=0,shakeT=0,dipT=0;
var progress=0,elapsed=0,running=false,finished=false;
var integrity=100,energy=100,passed=0,failed=0;
var topView=false,topMix=0;
var events=[],debris=[],pending=0,acc=0,fpsSamples=[],lowQuality=false;
var pitTex=null,conTex=null;

var el={prog:document.getElementById('t7-progress'),time:document.getElementById('t7-time'),
        energy:document.getElementById('t7-energy'),integrity:document.getElementById('t7-integrity'),
        alert:document.getElementById('t7-alert'),flash:document.getElementById('t7-flash'),
        start:document.getElementById('t7-start'),end:document.getElementById('t7-end'),
        endTitle:document.getElementById('t7-end-title'),endText:document.getElementById('t7-end-text')};

// ——— вспомогательное ———
function rnd(seed){ var s=seed%2147483647; if(s<=0)s+=2147483646;
  return function(){ s=s*16807%2147483647; return (s-1)/2147483646; }; }

function canvasTex(size,draw){
  var c=document.createElement('canvas'); c.width=size; c.height=size;
  draw(c.getContext('2d'),size);
  var t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.anisotropy=4;
  return t;
}

// асфальт: серый бетон, две белые линии по краям, бирюзовые трещины
function makeAsphalt(){
  return canvasTex(512,function(g,S){
    var r=rnd(99117);
    g.fillStyle='#3b4448'; g.fillRect(0,0,S,S);
    for(var i=0;i<5200;i++){
      var v=42+r()*34;
      g.fillStyle='rgba('+Math.round(v)+','+Math.round(v+5)+','+Math.round(v+7)+','+(0.12+r()*0.3)+')';
      g.fillRect(r()*S,r()*S,1+r()*3,1+r()*3);
    }
    // швы плит
    g.strokeStyle='rgba(24,29,32,.55)'; g.lineWidth=2;
    for(var y=0;y<S;y+=64){ g.beginPath(); g.moveTo(0,y); g.lineTo(S,y); g.stroke(); }
    // белые линии по краям дороги
    g.fillStyle='rgba(226,236,238,.72)';
    g.fillRect(S*0.085,0,S*0.012,S); g.fillRect(S*0.903,0,S*0.012,S);
    // прерывистая осевая
    g.fillStyle='rgba(220,232,234,.5)';
    for(var yy=0;yy<S;yy+=96){ g.fillRect(S*0.494,yy,S*0.012,48); }
    // бирюзовые трещины
    function crack(x,y,len,ang){
      g.beginPath(); g.moveTo(x,y);
      for(var k=0;k<len;k++){ x+=Math.cos(ang)*7+r()*9-4.5; y+=Math.sin(ang)*7+r()*9-4.5; ang+=(r()-0.5)*0.7; g.lineTo(x,y); }
      g.strokeStyle='rgba(48,229,220,.85)'; g.lineWidth=1.4+(r()*2); g.shadowColor='#30e5dc'; g.shadowBlur=7; g.stroke();
      g.shadowBlur=0;
    }
    for(var c=0;c<9;c++) crack(r()*S,r()*S,10+r()*16,r()*6.28);
  });
}

// фасад панельного дома: панели, окна, часть светится бирюзой
function makeFacade(seed,rows){
  rows=rows||6;
  var emissiveCanvas=document.createElement('canvas');
  emissiveCanvas.width=emissiveCanvas.height=512;
  var eg=emissiveCanvas.getContext('2d');
  eg.fillStyle='#000'; eg.fillRect(0,0,512,512);

  var map=canvasTex(512,function(g,S){
    var r=rnd(seed);
    g.fillStyle='#4e5a5e'; g.fillRect(0,0,S,S);
    for(var i=0;i<3000;i++){
      var v=64+r()*26;
      g.fillStyle='rgba('+Math.round(v)+','+Math.round(v+6)+','+Math.round(v+8)+','+(0.1+r()*0.25)+')';
      g.fillRect(r()*S,r()*S,2+r()*5,2+r()*5);
    }
    // горизонтальные швы панелей
    g.strokeStyle='rgba(30,36,39,.55)'; g.lineWidth=3;
    for(var y=0;y<=S;y+=86){ g.beginPath(); g.moveTo(0,y); g.lineTo(S,y); g.stroke(); }
    // окна
    var cols=5,cw=S/cols,ch=S/rows;
    for(var cx=0;cx<cols;cx++){
      for(var ry=0;ry<rows;ry++){
        var x=cx*cw+cw*0.2,y=ry*ch+ch*0.26,w=cw*0.6,h=ch*0.4;
        var on=r()<0.34;
        g.fillStyle=on?'#5ff2e6':'#20292c'; g.fillRect(x,y,w,h);
        g.strokeStyle='rgba(16,22,25,.8)'; g.lineWidth=2; g.strokeRect(x,y,w,h);
        if(on){ eg.fillStyle='#5ff2e6'; eg.fillRect(x,y,w,h); }
      }
    }
    // потёки и разрушение
    for(var d=0;d<10;d++){
      g.fillStyle='rgba(20,26,28,'+(0.1+r()*0.22)+')';
      g.fillRect(r()*S,r()*S,3+r()*10,20+r()*90);
    }
  });
  var emit=new THREE.CanvasTexture(emissiveCanvas);
  emit.wrapS=emit.wrapT=THREE.RepeatWrapping; emit.anisotropy=4;
  return {map:map,emit:emit,rows:rows};
}

// ——— построение мира ———
function build(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x2c3a42);
  scene.fog=new THREE.Fog(0x39474f,26,150);

  camera=new THREE.PerspectiveCamera(72,window.innerWidth/Math.max(1,window.innerHeight),0.1,600);
  scene.add(camera);

  scene.add(new THREE.HemisphereLight(0x9ec4d0,0x151b1e,1.25));
  var sun=new THREE.DirectionalLight(0xd6ecf2,0.62); sun.position.set(-40,70,-30); scene.add(sun);

  // маршрут: прямая, затем плавный поворот вправо и второй отрезок
  curve=new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,0,10), new THREE.Vector3(0,0,-40), new THREE.Vector3(2,0,-92),
    new THREE.Vector3(11,0,-140), new THREE.Vector3(18,0,-186), new THREE.Vector3(18,0,-240)
  ],false,'catmullrom',0.4);
  pathLen=curve.getLength();

  var up=new THREE.Vector3(0,1,0);
  function frame(t){
    var p=curve.getPointAt(t), f=curve.getTangentAt(t);
    var right=new THREE.Vector3().crossVectors(f,up).normalize();
    return {p:p,f:f,right:right};
  }

  // дорога — лента по кривой
  var SEG=200,pos=[],uv=[],idx=[];
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
  var asphalt=makeAsphalt();
  var road=new THREE.Mesh(rg,new THREE.MeshLambertMaterial({map:asphalt}));
  scene.add(road);

  // тротуары по краям
  [-1,1].forEach(function(side){
    var p2=[],u2=[],i2=[];
    for(var i=0;i<=SEG;i++){
      var t=i/SEG, fr=frame(t);
      var a=fr.p.clone().addScaledVector(fr.right, side*ROAD_W/2);
      var b=fr.p.clone().addScaledVector(fr.right, side*(ROAD_W/2+3.2)).setY(0.14);
      p2.push(a.x,a.y,a.z, b.x,b.y,b.z);
      u2.push(0,t*pathLen/10, 1,t*pathLen/10);
      if(i<SEG){ var q=i*2; i2.push(q,q+1,q+2, q+1,q+3,q+2); }
    }
    var g2=new THREE.BufferGeometry();
    g2.setAttribute('position',new THREE.Float32BufferAttribute(p2,3));
    g2.setAttribute('uv',new THREE.Float32BufferAttribute(u2,2));
    g2.setIndex(i2); g2.computeVertexNormals();
    var curb=new THREE.Mesh(g2,new THREE.MeshLambertMaterial({color:0x6a7377,side:THREE.DoubleSide}));
    scene.add(curb);
  });

  // здания по сторонам: пять готовых фасадов разной этажности, без копий текстур
  var fach=[makeFacade(1337,4),makeFacade(4242,6),makeFacade(8123,8),makeFacade(9091,10),makeFacade(3311,12)];
  var r=rnd(555);
  for(var d=18; d<pathLen-14; d+=21){
    var t=d/pathLen, fr2=frame(t);
    var ang=Math.atan2(fr2.f.x,fr2.f.z);
    [-1,1].forEach(function(side){
      var h=11+r()*22, w=10+r()*7, dep=10+r()*6;
      var floors=Math.max(4,Math.min(12,Math.round(h/2.6)));
      var best=fach[0], bd=99;
      fach.forEach(function(f){ var dd=Math.abs(f.rows-floors); if(dd<bd){ bd=dd; best=f; } });
      var geo=new THREE.BoxGeometry(dep,h,w);
      var mTop=new THREE.MeshLambertMaterial({color:0x2c3437});
      var mSide=new THREE.MeshLambertMaterial({map:best.map,emissiveMap:best.emit,
        emissive:new THREE.Color(0xffffff),emissiveIntensity:0.85});
      var b=new THREE.Mesh(geo,[mSide,mSide,mTop,mTop,mSide,mSide]);
      var off=(ROAD_W/2+3.4+dep/2);
      b.position.copy(fr2.p).addScaledVector(fr2.right, side*off);
      b.position.y=h/2;
      b.rotation.y=ang;
      scene.add(b);
    });
  }

  // парящее здание в глубине — как на изображении
  var frMid=frame(0.62);
  var hover=new THREE.Mesh(new THREE.BoxGeometry(15,26,14),
    new THREE.MeshLambertMaterial({color:0x59666b,emissive:new THREE.Color(0x1d4a4d),emissiveIntensity:0.35}));
  hover.position.copy(frMid.p).addScaledVector(frMid.right,-16);
  hover.position.y=38; hover.rotation.y=Math.PI/6; hover.rotation.z=0.05;
  scene.add(hover);

  // дальний план — фотография улицы, впритык к концу дороги
  var loader=new THREE.TextureLoader();
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

  // капсула в руках
  loader.load(A.capsule,function(tx){
    capsule=new THREE.Mesh(new THREE.PlaneGeometry(0.92,0.52),
      new THREE.MeshBasicMaterial({map:tx,transparent:true,depthTest:false,depthWrite:false}));
    capsule.position.set(0.44,-0.40,-1.0);
    capsule.rotation.z=-0.22;
    capsule.renderOrder=999;
    camera.add(capsule);
  });

  // препятствия: строим после загрузки обеих картинок
  var need=2;
  function readyLoad(){ if(--need===0) buildEvents(); }
  loader.load(A.pit,function(tx){ pitTex=tx; readyLoad(); },undefined,readyLoad);
  loader.load(A.concrete,function(tx){ conTex=tx; readyLoad(); },undefined,readyLoad);

  note.textContent='Загрузка улицы…';
}

// ——— препятствия и порядок событий ———
function buildEvents(){
  if(events.length)return;
  var defs=[
    {d:26, type:'pit',    need:'jump',  text:'Провал! Прыжок'},
    {d:62, type:'debris', need:'left',  text:'Обломки падают справа!'},
    {d:100,type:'debris', need:'right', text:'Обломки падают слева!'},
    {d:138,type:'beam',   need:'duck',  text:'Низкая балка!'},
    {d:176,type:'pit',    need:'jump',  text:'Провал! Прыжок'},
    {d:210,type:'debris', need:'left',  text:'Обломки падают справа!'}
  ];
  var up=new THREE.Vector3(0,1,0);

  defs.forEach(function(e,i){
    var t=e.d/pathLen;
    if(t>0.99)t=0.99;
    var p=curve.getPointAt(t), f=curve.getTangentAt(t);
    var right=new THREE.Vector3().crossVectors(f,up).normalize();
    var ang=Math.atan2(f.x,f.z);

    if(e.type==='pit'){
      var m=new THREE.Mesh(new THREE.PlaneGeometry(6.4,3.4),
        new THREE.MeshBasicMaterial({map:pitTex,transparent:true,depthWrite:false,opacity:0.97}));
      m.rotation.x=-Math.PI/2; m.rotation.z=-ang;
      m.position.copy(p).setY(0.05);
      scene.add(m);
      e.mesh=m;
    }

    if(e.type==='beam'){
      var b=new THREE.Mesh(new THREE.BoxGeometry(ROAD_W+1,0.8,1.0),
        new THREE.MeshLambertMaterial({color:0x585044}));
      b.position.copy(p).setY(1.75); b.rotation.y=ang;
      scene.add(b);

      var legMat=new THREE.MeshLambertMaterial({color:0x40403a});
      [-1,1].forEach(function(s){
        var leg=new THREE.Mesh(new THREE.BoxGeometry(0.5,1.75,0.6),legMat);
        leg.position.copy(p).addScaledVector(right,s*(ROAD_W/2+0.3)).setY(0.88);
        leg.rotation.y=ang; scene.add(leg);
      });
    }

    if(e.type==='debris'){
      e.origin=p.clone();
      e.fwd=f.clone();
      e.right=right.clone();
      e.pieces=[];
      var side=(e.need==='left')?1:-1;         // обломки падают с той стороны, откуда надо уйти
      for(var k=0;k<5;k++){
        var mat=conTex?new THREE.SpriteMaterial({map:conTex,transparent:true,depthWrite:false})
                      :new THREE.SpriteMaterial({color:0x8a8f8c});
        var sp=new THREE.Sprite(mat);
        var sc=1.5+Math.random()*1.1;
        sp.scale.set(sc,sc*0.72,1);
        sp.userData.off=side*(0.6+Math.random()*2.4);
        sp.userData.dl=(Math.random()-0.5)*2.4;
        sp.userData.jitter=Math.random()*6.28;
        sp.visible=false;
        scene.add(sp); e.pieces.push(sp);
      }
    }
    events.push(e);
  });
}

// ——— управление ———
function doAction(a){
  if(!running||finished)return;
  lastAct=a; lastActAt=elapsed;
  if(a==='left'){ laneTarget=-1; holdT=1.7; }
  if(a==='right'){ laneTarget=1; holdT=1.7; }
  if(a==='jump'){ if(jumpT<=0) jumpT=0.7; }
  if(a==='duck'){ if(duckT<=0) duckT=0.62; }
  var btn=document.querySelector('[data-act="'+a+'"]');
  if(btn){ btn.classList.add('on'); setTimeout(function(){btn.classList.remove('on');},120); }
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
    if(Math.abs(dx)<28&&Math.abs(dy)<28)return;
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
  if(e.need==='jump') ok=(jumpT>0)||(lastAct==='jump'&&elapsed-lastActAt<0.75);
  else if(e.need==='duck') ok=(duckT>0)||(lastAct==='duck'&&elapsed-lastActAt<0.75);
  else if(e.need==='left') ok=(lane<-0.42)||(lastAct==='left'&&elapsed-lastActAt<0.8);
  else if(e.need==='right') ok=(lane>0.42)||(lastAct==='right'&&elapsed-lastActAt<0.8);

  if(ok){
    passed++;
    flash('ok');
    if(e.type==='debris'&&e.pieces) e.pieces.forEach(function(s){ s.userData.missed=true; });
  }else{
    failed++;
    integrity=Math.max(0,integrity-HIT_DAMAGE);
    shake=0.55; shakeT=0.5;
    if(e.type==='pit') dipT=0.9;          // провалились в дыру и выбрались обратно
    flash('hit');
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
  alertTimer=setTimeout(function(){ el.alert.classList.remove('show'); },1900);
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

  // адаптивное качество
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

  // плавное движение
  holdT=Math.max(0,holdT-dt);
  if(holdT<=0) laneTarget=0;
  lane+=(laneTarget-lane)*Math.min(1,dt*7);
  jumpT=Math.max(0,jumpT-dt);
  duckT=Math.max(0,duckT-dt);
  dipT=Math.max(0,dipT-dt);
  shake=Math.max(0,shake-dt*1.4);

  var t=Math.min(0.999,progress);
  var p=curve.getPointAt(t), f=curve.getTangentAt(t);
  tmpF.copy(f); tmpR.crossVectors(tmpF,up).normalize();

  var jumpY=jumpT>0?Math.sin(Math.PI*(1-jumpT/0.7))*1.05:0;
  var duckY=duckT>0?Math.min(1,duckT/0.3)*0.72:0;
  var bob=Math.sin(elapsed*9)*0.022;

  camPos.copy(p).addScaledVector(tmpR,lane*LANE_SHIFT);
  camPos.y+=EYE+jumpY-duckY+bob;
  if(dipT>0) camPos.y-=Math.sin(Math.PI*(1-dipT/0.9))*0.95;

  // тряска при ударе
  if(shake>0){
    camPos.x+=(Math.random()-0.5)*shake*0.42;
    camPos.y+=(Math.random()-0.5)*shake*0.32;
  }

  camera.position.copy(camPos);
  var lookAtT=Math.min(1,t+0.02);
  look.copy(curve.getPointAt(lookAtT)).addScaledVector(tmpR,lane*LANE_SHIFT*0.8);
  look.y+=EYE+jumpY-duckY-0.05;
  camera.lookAt(look);
  camera.rotateZ(-lane*0.045);

  // капсула в руках покачивается
  if(capsule){
    capsule.position.y=-0.40+bob*0.7;
    capsule.position.x=0.44-lane*0.05;
    capsule.rotation.z=-0.22+Math.sin(elapsed*5.2)*0.02-lane*0.04;
  }

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
      var rem=e.d-dist, K=18;
      e.pieces.forEach(function(s){
        var k=(K-rem)/K;                       // 0 — высоко впереди, 1 — удар о дорогу
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
        s.position.y=0.65+15*Math.pow(fall,1.9);
        s.material.rotation+=dt*1.1;
      });
    }
  });

  updateHud();
  renderer.render(scene,camera);
}

// ——— запуск и остановка ———
function reset(){
  elapsed=0;progress=0;lane=0;laneTarget=0;holdT=0;jumpT=0;duckT=0;shake=0;
  integrity=100;energy=100;passed=0;failed=0;finished=false;
  lastAct='';lastActAt=-9;
  events.forEach(function(e){
    e.done=false;e.warned=false;
    if(e.pieces) e.pieces.forEach(function(s){ s.visible=false; s.userData.missed=false; });
  });
  updateHud(); showAlert('');
}

function start(){
  reset(); running=true;
  el.start.classList.add('hidden'); el.end.classList.add('hidden');
}

function finish(){
  finished=true; running=false;
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

document.addEventListener('visibilitychange',function(){
  if(document.hidden && running) { /* не копим время: clock.getDelta ограничен */ }
});
})();
