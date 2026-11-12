/* task07demo.js — задание 7, 3D-участок «Прорыв» (версия 0316a).
   Изолированная демонстрация: без сети, без Firebase.
   По отзыву автора 12.11.2026:
   — дорога серая с трещинами по всей длине, асфальт рвётся на провалах;
   — провал — настоящая дыра: дно, арматура, обломки; не перепрыгнул — падаешь;
   — внизу бежим по тоннелю, выпрыгиваем ТОЛЬКО по кнопке «Прыгнуть»;
   — прыжок и присед видны всегда, кнопки работают в любом месте;
   — крупные обломки падают сверху и рассыпаются на мелкие при столкновении;
   — кристаллы восстанавливают капсулу, при ударе она бьётся;
   — участки разные: улица, подземный тоннель, мост над улицей, поворот. */
(function(){
'use strict';

var note=document.getElementById('t7-loadnote');
if(!window.THREE){ if(note)note.textContent='Не загрузилась 3D-библиотека (vendor/three.min.js)'; return; }

var DURATION=60;
var ROAD_W=13;
var EYE=1.62;
var LANE_SHIFT=4.4;
var WARN_AHEAD=40;
var HIT_DAMAGE=15;
var REACT_WINDOW=1.5;
var PIT_R=4.6;
var PIT_DEPTH=5.2;
var TUN_Y=-7.0;
var TUN_END=130;
var BRIDGE_H=7.0;
var TUN_TIME=6.0;

var A={capsule:'assets/task07/capsule.png',
       capsuleHands:'assets/task07/capsule_hands.png',
       concrete:'assets/task07/concrete.png',
       facades:['assets/task07/facade1.jpg','assets/task07/facade2.jpg',
                'assets/task07/facade3.jpg','assets/task07/facade4.jpg']};

var DEFS=[
  {d:42,  type:'pit',     need:'jump',  text:'Провал впереди! Прыжок'},
  {d:82,  type:'debris',  need:'left',  text:'Обломки падают справа!'},
  {d:118, type:'beam',    need:'duck',  text:'Низкая балка!'},
  {d:152, type:'crystal', need:'right', text:'Кристалл справа'},
  {d:190, type:'debris',  need:'right', text:'Обломки падают слева!'},
  {d:228, type:'beam',    need:'duck',  text:'Низкая балка!'},
  {d:266, type:'crystal', need:'left',  text:'Кристалл слева'},
  {d:300, type:'debris',  need:'left',  text:'Обломки падают справа!'},
  {d:340, type:'pit',     need:'jump',  text:'Провал впереди! Прыжок'},
  {d:400, type:'debris',  need:'right', text:'Обломки падают слева!'},
  {d:455, type:'beam',    need:'duck',  text:'Низкая балка!'},
  {d:505, type:'crystal', need:'right', text:'Кристалл справа'},
  {d:560, type:'pit',     need:'jump',  text:'Провал впереди! Прыжок'},
  {d:605, type:'debris',  need:'left',  text:'Обломки падают справа!'},
  {d:645, type:'beam',    need:'duck',  text:'Низкая балка!'},
  {d:680, type:'crystal', need:'left',  text:'Кристалл слева'}
];

var SFX={};
function loadSounds(){
  try{
    SFX.hit=new Audio('assets/task07/hit.mp3');
    SFX.ok=new Audio('assets/task07/ok.mp3');
    SFX.amb=new Audio('assets/task07/ambience.mp3');
    SFX.amb.loop=true; SFX.amb.volume=0.7;
    SFX.hit.volume=1.0; SFX.ok.volume=1.0;
  }catch(e){ SFX={}; }
}
function playSfx(k){
  var s=SFX[k]; if(!s)return;
  try{ s.currentTime=0; var p=s.play(); if(p&&p.catch)p.catch(function(){}); }catch(e){}
}

var canvas=document.getElementById('t7-canvas');
var renderer,scene,camera,clock;
var curve,pathLen;
var capsule=null;
var lane=0,laneTarget=0,holdT=0,jumpT=0,duckT=0,shake=0;
var under=false,underT=0,needExit=false,fallK=0,riseK=0,climbing=false;
var progress=0,elapsed=0,running=false,finished=false;
var integrity=100,energy=100,passed=0,failed=0;
var lastAct='',lastActAt=-9;
var topView=false,topMix=0;
var events=[],fpsSamples=[],lowQuality=false;
var conTex=null;
var facadeTex=[],shards=[];
var hitGlow=0;
var wasUnder=false;

var el={prog:document.getElementById('t7-progress'),time:document.getElementById('t7-time'),
        energy:document.getElementById('t7-energy'),integrity:document.getElementById('t7-integrity'),
        alert:document.getElementById('t7-alert'),flash:document.getElementById('t7-flash'),
        judge:document.getElementById('t7-judge'),dark:document.getElementById('t7-dark'),
        start:document.getElementById('t7-start'),end:document.getElementById('t7-end'),
        endTitle:document.getElementById('t7-end-title'),endText:document.getElementById('t7-end-text')};

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

function roadTexture(){
  return canvasTexture(1024,function(g,S){
    var r=rnd(73117);
    g.fillStyle='#5f686e'; g.fillRect(0,0,S,S);
    for(var i=0;i<14000;i++){
      var v=70+r()*54;
      g.fillStyle='rgba('+Math.round(v)+','+Math.round(v+4)+','+Math.round(v+6)+','+(0.12+r()*0.4)+')';
      g.fillRect(r()*S,r()*S,2+r()*5,2+r()*5);
    }
    function crack(x,y,len,ang,w){
      g.beginPath(); g.moveTo(x,y);
      for(var k=0;k<len;k++){ x+=Math.cos(ang)*14+r()*20-10; y+=Math.sin(ang)*14+r()*20-10; ang+=(r()-0.5)*0.7; g.lineTo(x,y); }
      g.strokeStyle='rgba(28,34,38,0.9)'; g.lineWidth=w+4; g.stroke();
      g.strokeStyle='rgba(120,236,230,0.85)'; g.lineWidth=w; g.shadowColor='#59e7dd'; g.shadowBlur=10; g.stroke();
      g.shadowBlur=0;
    }
    for(var c=0;c<26;c++) crack(r()*S,r()*S,10+r()*18,r()*6.28,2.5+r()*3);
    for(var h=0;h<70;h++){
      var vv=52+r()*44;
      g.fillStyle='rgba('+Math.round(vv)+','+Math.round(vv+4)+','+Math.round(vv+6)+','+(0.35+r()*0.45)+')';
      g.beginPath(); g.ellipse(r()*S,r()*S,3+r()*13,2+r()*8,r()*3.14,0,6.29); g.fill();
    }
    g.fillStyle='rgba(235,244,246,0.6)';
    g.fillRect(S*0.075,0,S*0.016,S);
    g.fillRect(S*0.909,0,S*0.016,S);
    g.fillStyle='rgba(228,238,240,0.45)';
    for(var y=0;y<S;y+=140){ g.fillRect(S*0.492,y,S*0.016,70); }
  });
}

function concreteTexture(){
  return canvasTexture(512,function(g,S){
    var r=rnd(9127);
    g.fillStyle='#8a8f8f'; g.fillRect(0,0,S,S);
    for(var i=0;i<7000;i++){
      var v=100+r()*70;
      g.fillStyle='rgba('+Math.round(v)+','+Math.round(v)+','+Math.round(v-4)+','+(0.12+r()*0.4)+')';
      g.fillRect(r()*S,r()*S,2+r()*6,2+r()*6);
    }
    for(var k=0;k<20;k++){
      g.beginPath();
      var x=r()*S,y=r()*S,a=r()*6.28;
      g.moveTo(x,y);
      for(var n=0;n<12;n++){ x+=Math.cos(a)*12+r()*12-6; y+=Math.sin(a)*12+r()*12-6; a+=(r()-0.5)*0.6; g.lineTo(x,y); }
      g.strokeStyle='rgba(45,50,50,0.55)'; g.lineWidth=2+r()*2; g.stroke();
    }
  });
}

function yOf(t){
  if(t<0.40) return 0;
  if(t<0.52) return BRIDGE_H*((t-0.40)/0.12);
  if(t<0.66) return BRIDGE_H;
  if(t<0.78) return BRIDGE_H*(1-(t-0.66)/0.12);
  return 0;
}

var upVec=new THREE.Vector3(0,1,0);
function frameAt(t){
  var p=curve.getPointAt(t), f=curve.getTangentAt(t);
  var right=new THREE.Vector3().crossVectors(f,upVec).normalize();
  p.y=yOf(t);
  return {p:p,f:f,right:right};
}

function build(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x51636d);
  scene.fog=new THREE.Fog(0x51636d,22,130);

  camera=new THREE.PerspectiveCamera(72,window.innerWidth/Math.max(1,window.innerHeight),0.1,700);
  scene.add(camera);

  scene.add(new THREE.HemisphereLight(0xcfe0e6,0x30393d,0.85));
  scene.add(new THREE.AmbientLight(0x9fb4bc,0.12));
  var sun=new THREE.DirectionalLight(0xe6f4f8,0.5); sun.position.set(-40,90,-30); scene.add(sun);

  curve=new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,0,10), new THREE.Vector3(0,0,-90), new THREE.Vector3(3,0,-180),
    new THREE.Vector3(10,0,-255), new THREE.Vector3(18,0,-315), new THREE.Vector3(24,0,-360),
    new THREE.Vector3(50,0,-398), new THREE.Vector3(95,0,-420), new THREE.Vector3(150,0,-428),
    new THREE.Vector3(205,0,-430), new THREE.Vector3(265,0,-432), new THREE.Vector3(325,0,-434)
  ],false,'catmullrom',0.4);
  pathLen=curve.getLength();

  var pits=DEFS.filter(function(d){return d.type==='pit';}).map(function(d){return d.d;});
  function inPit(d){ for(var i=0;i<pits.length;i++){ if(Math.abs(d-pits[i])<PIT_R) return true; } return false; }

  var SEG=460,pos=[],uv=[],idx=[];
  for(var i=0;i<=SEG;i++){
    var t=i/SEG, fr=frameAt(t), d=t*pathLen;
    var l=fr.p.clone().addScaledVector(fr.right, ROAD_W/2);
    var r=fr.p.clone().addScaledVector(fr.right,-ROAD_W/2);
    pos.push(l.x,l.y,l.z, r.x,r.y,r.z);
    uv.push(0,d/8, 1,d/8);
    if(i<SEG && !inPit(d) && !inPit((i+1)/SEG*pathLen)){
      var a=i*2; idx.push(a,a+1,a+2, a+1,a+3,a+2);
    }
  }
  var rg=new THREE.BufferGeometry();
  rg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  rg.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  rg.setIndex(idx); rg.computeVertexNormals();
  scene.add(new THREE.Mesh(rg,new THREE.MeshLambertMaterial({color:0xffffff,map:roadTexture()})));

  var loader=new THREE.TextureLoader();
  var conTexture=concreteTexture();

  (function tunnel(){
    var T=conTexture.clone(); T.needsUpdate=true; T.repeat.set(6,3);
    var floorMat=new THREE.MeshLambertMaterial({color:0xa8adad,map:T});
    var segs=44, t0=12, t1=TUN_END;
    var fP=[],fU=[],fI=[];
    for(var i=0;i<=segs;i++){
      var d=t0+(t1-t0)*i/segs, fr=frameAt(d/pathLen);
      var l=fr.p.clone().addScaledVector(fr.right,4.2), r=fr.p.clone().addScaledVector(fr.right,-4.2);
      fP.push(l.x,TUN_Y,l.z, r.x,TUN_Y,r.z);
      fU.push(0,d/6, 1,d/6);
      if(i<segs){ var a=i*2; fI.push(a,a+1,a+2, a+1,a+3,a+2); }
    }
    var fg=new THREE.BufferGeometry();
    fg.setAttribute('position',new THREE.Float32BufferAttribute(fP,3));
    fg.setAttribute('uv',new THREE.Float32BufferAttribute(fU,2));
    fg.setIndex(fI); fg.computeVertexNormals();
    scene.add(new THREE.Mesh(fg,floorMat));

    for(var s=-1;s<=1;s+=2){
      var wP=[],wU=[],wI=[];
      for(var j=0;j<=segs;j++){
        var dd=t0+(t1-t0)*j/segs, fr2=frameAt(dd/pathLen);
        var q=fr2.p.clone().addScaledVector(fr2.right,s*4.2);
        wP.push(q.x,TUN_Y,q.z, q.x,TUN_Y+3.8,q.z);
        wU.push(dd/6,0, dd/6,1);
        if(j<segs){ var aa=j*2; wI.push(aa,aa+1,aa+2, aa+1,aa+3,aa+2); }
      }
      var wg=new THREE.BufferGeometry();
      wg.setAttribute('position',new THREE.Float32BufferAttribute(wP,3));
      wg.setAttribute('uv',new THREE.Float32BufferAttribute(wU,2));
      wg.setIndex(wI); wg.computeVertexNormals();
      scene.add(new THREE.Mesh(wg,new THREE.MeshLambertMaterial({color:0x9aa0a0,map:T,side:THREE.DoubleSide})));
    }

    var cP=[],cU=[],cI=[];
    for(var k=0;k<=segs;k++){
      var ddd=t0+(t1-t0)*k/segs, fr3=frameAt(ddd/pathLen);
      var ll=fr3.p.clone().addScaledVector(fr3.right,5.5), rr=fr3.p.clone().addScaledVector(fr3.right,-5.5);
      cP.push(ll.x,TUN_Y+3.8,ll.z, rr.x,TUN_Y+3.8,rr.z);
      cU.push(0,ddd/6, 1,ddd/6);
      if(k<segs){ var ai=k*2; cI.push(ai,ai+1,ai+2, ai+1,ai+3,ai+2); }
    }
    var cg=new THREE.BufferGeometry();
    cg.setAttribute('position',new THREE.Float32BufferAttribute(cP,3));
    cg.setAttribute('uv',new THREE.Float32BufferAttribute(cU,2));
    cg.setIndex(cI); cg.computeVertexNormals();
    scene.add(new THREE.Mesh(cg,new THREE.MeshLambertMaterial({color:0x8d9494,map:T,side:THREE.DoubleSide})));

    for(var L=0;L<9;L++){
      var dl=t0+(t1-t0)*(L+0.5)/9, fl=frameAt(dl/pathLen);
      var lamp=new THREE.PointLight(0xbfe9ff,1.1,24);
      lamp.position.copy(fl.p).setY(TUN_Y+3.2);
      scene.add(lamp);
      var bulb=new THREE.Mesh(new THREE.SphereGeometry(0.16,8,6),new THREE.MeshBasicMaterial({color:0xd8f6ff}));
      bulb.position.copy(lamp.position); scene.add(bulb);
    }
  })();

  var needF=A.facades.length, buildingsDone=false;
  function buildBuildings(){
    if(buildingsDone)return;
    buildingsDone=true;
    var r=rnd(555);
    var fallback=new THREE.MeshLambertMaterial({color:0x55605f});
    function addBuilding(fr2,ang,side,off,h,w,dep){
      var geo=new THREE.BoxGeometry(dep,h,w);
      var repX=Math.max(1,Math.round(dep/11)), repY=Math.max(2,Math.round(h/9));
      var uvs=geo.attributes.uv;
      for(var ui=0;ui<uvs.count;ui++){ uvs.setXY(ui,uvs.getX(ui)*repX,uvs.getY(ui)*repY); }
      uvs.needsUpdate=true;
      var mTop=new THREE.MeshLambertMaterial({color:0x39434a});
      var tex=facadeTex.length?facadeTex[Math.floor(r()*facadeTex.length)]:null;
      var mSide=tex?new THREE.MeshLambertMaterial({map:tex}):fallback;
      var b=new THREE.Mesh(geo,[mSide,mSide,mTop,mTop,mSide,mSide]);
      b.position.copy(fr2.p).addScaledVector(fr2.right, side*off);
      b.position.y=h/2;
      b.rotation.y=ang;
      scene.add(b);
    }
    for(var d=6; d<pathLen-6; d+=16){
      var t2=d/pathLen, fr2=frameAt(t2);
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

  (function bridge(){
    var railMat=new THREE.MeshLambertMaterial({color:0xe2eef2,emissive:new THREE.Color(0x3a7d84),emissiveIntensity:0.8});
    var kerbMat=new THREE.MeshLambertMaterial({color:0xb9c6ca});
    for(var d=Math.round(pathLen*0.40); d<pathLen*0.78; d+=6){
      var fr=frameAt(d/pathLen);
      var ang=Math.atan2(fr.f.x,fr.f.z);
      [-1,1].forEach(function(s){
        var post=new THREE.Mesh(new THREE.BoxGeometry(0.2,1.5,0.2),railMat);
        post.position.copy(fr.p).addScaledVector(fr.right,s*(ROAD_W/2-0.35));
        post.position.y=fr.p.y+0.75; scene.add(post);
        // сплошной бортик по краю — сразу видно, что мы на мосту
        var kerb=new THREE.Mesh(new THREE.BoxGeometry(0.55,0.6,6.2),kerbMat);
        kerb.position.copy(fr.p).addScaledVector(fr.right,s*(ROAD_W/2-0.2));
        kerb.position.y=fr.p.y+0.3;
        kerb.rotation.y=ang; scene.add(kerb);
      });
      [-1,1].forEach(function(s){
        var rail=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.16,6.2),railMat);
        rail.position.copy(fr.p).addScaledVector(fr.right,s*(ROAD_W/2-0.35));
        rail.position.y=fr.p.y+1.45;
        rail.rotation.y=ang; scene.add(rail);
      });
    }
    for(var dd=Math.round(pathLen*0.44); dd<pathLen*0.78; dd+=22){
      var f2=frameAt(dd/pathLen);
      var col=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.4,BRIDGE_H,14),
        new THREE.MeshLambertMaterial({color:0x767f83}));
      col.position.copy(f2.p).setY(BRIDGE_H/2-0.2);
      scene.add(col);
    }
  })();

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

  loader.load(A.concrete,function(tx){
    conTex=tx; conTex.wrapS=conTex.wrapT=THREE.RepeatWrapping;
    buildEvents();
  },undefined,function(){ buildEvents(); });

  note.textContent='Загрузка улицы…';
}

function buildEvents(){
  if(events.length)return;
  var conMat=conTex?new THREE.MeshLambertMaterial({map:conTex}):new THREE.MeshLambertMaterial({color:0x8f9494});
  var conMap=conTex?conTex.clone():null;
  if(conMap){ conMap.needsUpdate=true; conMap.wrapS=conMap.wrapT=THREE.RepeatWrapping; }

  DEFS.forEach(function(def){
    var t=Math.min(0.99,def.d/pathLen);
    var fr=frameAt(t), p=fr.p.clone(), f=fr.f.clone(), right=fr.right.clone();
    var ang=Math.atan2(f.x,f.z);
    var e={d:def.d,type:def.type,need:def.need,text:def.text};

    if(def.type==='pit'){
      var g=new THREE.Group();
      var wallMap=conMap?conMap.clone():null;
      if(wallMap){ wallMap.needsUpdate=true; wallMap.repeat.set(5,2); }
      var wall=new THREE.Mesh(new THREE.CylinderGeometry(PIT_R+0.15,PIT_R*0.62,PIT_DEPTH,26,1,true),
        new THREE.MeshLambertMaterial({color:0x5f6767,map:wallMap,side:THREE.BackSide}));
      wall.position.y=-PIT_DEPTH/2; g.add(wall);

      var botMap=conMap?conMap.clone():null;
      if(botMap){ botMap.needsUpdate=true; botMap.repeat.set(3,3); }
      var bottom=new THREE.Mesh(new THREE.CircleGeometry(PIT_R*0.62,26),
        new THREE.MeshLambertMaterial({color:0x4e5656,map:botMap}));
      bottom.rotation.x=-Math.PI/2; bottom.position.y=-PIT_DEPTH; g.add(bottom);

      var barMat=new THREE.MeshLambertMaterial({color:0x8a7154});
      for(var b=0;b<16;b++){
        var a2=b/16*Math.PI*2;
        var bar=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,1.6+Math.random()*0.8,6),barMat);
        bar.position.set(Math.cos(a2)*(PIT_R*0.85),-0.35-Math.random()*1.7,Math.sin(a2)*(PIT_R*0.85));
        bar.rotation.set(Math.PI/2.3+Math.random()*0.5,a2,Math.random()*0.5);
        g.add(bar);
      }
      for(var c=0;c<12;c++){
        var ch=new THREE.Mesh(new THREE.BoxGeometry(0.6+Math.random()*0.9,0.4+Math.random()*0.5,0.6+Math.random()*0.9),conMat);
        var ca=Math.random()*6.28, cr=Math.random()*PIT_R*0.5;
        ch.position.set(Math.cos(ca)*cr,-PIT_DEPTH+0.28,Math.sin(ca)*cr);
        ch.rotation.set(Math.random(),Math.random()*3,Math.random());
        g.add(ch);
      }
      var pl=new THREE.PointLight(0xbfe4ff,0.9,14);
      pl.position.set(0,-1.0,0); g.add(pl);

      g.position.copy(p);
      scene.add(g);
      e.group=g;
    }

    if(def.type==='beam'){
      var beam=new THREE.Mesh(new THREE.BoxGeometry(ROAD_W+1.6,0.85,1.2),conMat);
      beam.position.copy(p).setY(p.y+1.42);
      beam.rotation.y=ang; beam.rotation.z=0.04;
      scene.add(beam);
      [-1,1].forEach(function(s){
        var leg=new THREE.Mesh(new THREE.BoxGeometry(1.0,1.4,1.1),conMat);
        leg.position.copy(p).addScaledVector(right,s*(ROAD_W/2+0.35));
        leg.position.y=p.y+0.7; leg.rotation.y=ang+s*0.2;
        scene.add(leg);
      });
      e.mesh=beam;
    }

    if(def.type==='debris'){
      var side=(def.need==='left')?1:-1;
      e.origin=p.clone(); e.fwd=f.clone(); e.right=right.clone(); e.rocks=[];
      for(var k=0;k<4;k++){
        var rock=new THREE.Mesh(new THREE.BoxGeometry(1.5+Math.random()*1.1,1.2+Math.random()*0.9,1.4+Math.random()*1.0),conMat);
        rock.userData.off=side*(1.6+Math.random()*3.2);
        rock.userData.dl=(Math.random()-0.5)*4;
        rock.userData.spin=(Math.random()-0.5)*2.2;
        rock.visible=false;
        scene.add(rock); e.rocks.push(rock);
      }
    }

    if(def.type==='crystal'){
      var side2=(def.need==='right')?1:-1;
      var cr2=new THREE.Mesh(new THREE.OctahedronGeometry(0.62,0),
        new THREE.MeshLambertMaterial({color:0x3ff0e4,emissive:new THREE.Color(0x1ec8c0),emissiveIntensity:1.4}));
      cr2.position.copy(p).addScaledVector(right,side2*2.4);
      cr2.position.y=p.y+1.35;
      scene.add(cr2);
      var halo=new THREE.PointLight(0x5ff5ea,1.1,12);
      halo.position.copy(cr2.position);
      scene.add(halo);
      e.crystal=cr2; e.halo=halo;
    }

    events.push(e);
  });
}

function burst(worldPos,n){
  n=n||12;
  var mat=conTex?new THREE.MeshLambertMaterial({map:conTex}):new THREE.MeshLambertMaterial({color:0x9a9f9f});
  for(var i=0;i<n;i++){
    var s=new THREE.Mesh(new THREE.BoxGeometry(0.16+Math.random()*0.26,0.14+Math.random()*0.22,0.16+Math.random()*0.26),mat);
    s.position.copy(worldPos).add(new THREE.Vector3((Math.random()-0.5)*1.6,0.3+Math.random(),(Math.random()-0.5)*1.6));
    s.userData.v=new THREE.Vector3((Math.random()-0.5)*8,2.5+Math.random()*4.5,(Math.random()-0.5)*8);
    s.userData.spin=(Math.random()-0.5)*9;
    s.userData.life=1.3+Math.random()*0.6;
    scene.add(s); shards.push(s);
  }
}

function doAction(a){
  if(!running||finished)return;

  if(under&&!climbing){
    if(a==='jump'&&needExit){ needExit=false; climbing=true; riseK=0; playSfx('ok'); flash('ok'); showAlert('Наверх!'); }
    return;
  }
  if(climbing) return;

  lastAct=a; lastActAt=elapsed;
  if(a==='left'){ laneTarget=-1; holdT=2.6; }
  if(a==='right'){ laneTarget=1; holdT=2.6; }
  if(a==='jump'){ if(jumpT<=0) jumpT=0.95; }
  if(a==='duck'){ if(duckT<=0) duckT=0.85; }

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

function judge(e){
  var ok=false;
  if(e.need==='jump') ok=(jumpT>0)||(lastAct==='jump'&&elapsed-lastActAt<REACT_WINDOW);
  else if(e.need==='duck') ok=(duckT>0)||(lastAct==='duck'&&elapsed-lastActAt<REACT_WINDOW);
  else if(e.need==='left') ok=(lane<-0.35)||(lastAct==='left'&&elapsed-lastActAt<REACT_WINDOW);
  else if(e.need==='right') ok=(lane>0.35)||(lastAct==='right'&&elapsed-lastActAt<REACT_WINDOW);

  var wp=camera.position.clone().addScaledVector(tmpF,8); wp.y=0.6;

  if(e.type==='crystal'){
    if(e.crystal){ e.crystal.visible=false; if(e.halo)e.halo.visible=false; }
    if(ok){
      energy=Math.min(100,energy+5);
      integrity=Math.min(100,integrity+10);
      passed++; playSfx('ok'); flash('ok'); hitGlow=1;
      showAlert('Энергия восстановлена');
      burst(wp,8);
    }
    updateHud(); return;
  }

  if(ok){
    passed++; playSfx('ok'); flash('ok');
    if(e.type==='debris'&&e.rocks) e.rocks.forEach(function(r){ r.visible=false; });
    if(e.type==='pit') burst(wp,10);
  }else{
    failed++;
    integrity=Math.max(0,integrity-HIT_DAMAGE);
    shake=1.8; playSfx('hit'); flash('hit'); hitGlow=1;
    if(e.type==='pit'){
      under=true; underT=0; needExit=false; fallK=0;
    }else{
      burst(wp,14);
    }
    if(integrity<=0){
      integrity=30;
      showAlert('Аварийная стабилизация! Корпус восстановлен');
    }
  }
  updateHud();
}

function flash(kind){ el.flash.className=kind; setTimeout(function(){ el.flash.className=''; },260); }

var alertTimer=null;
function showAlert(text){
  if(!text){ el.alert.classList.remove('show'); return; }
  el.alert.textContent=text;
  el.alert.classList.add('show');
  if(alertTimer)clearTimeout(alertTimer);
  alertTimer=setTimeout(function(){ el.alert.classList.remove('show'); },2600);
}

function updateHud(){
  el.prog.textContent=Math.round(progress*100)+'%';
  el.time.textContent=Math.max(0,Math.ceil(DURATION-elapsed));
  el.energy.textContent=Math.round(energy)+'%';
  el.integrity.textContent=Math.round(integrity)+'%';
  el.integrity.className=integrity<=30?'bad':(integrity<=60?'warn':'');
}

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
  lane+=(laneTarget-lane)*Math.min(1,dt*14);
  jumpT=Math.max(0,jumpT-dt);
  duckT=Math.max(0,duckT-dt);
  shake=Math.max(0,shake-dt*1.1);
  hitGlow=Math.max(0,hitGlow-dt*2.2);

  var t=Math.min(0.999,progress);
  var fr=frameAt(t), p=fr.p, f=fr.f;
  tmpF.copy(f); tmpR.crossVectors(tmpF,upVec).normalize();
  var groundY=p.y;

  var jumpK=jumpT>0?Math.sin(Math.PI*(1-jumpT/0.95)):0;
  var jumpY=jumpK*2.2;
  var duckK=duckT>0?Math.min(1,(0.85-duckT)/0.22):0;
  var duckY=duckK*0.95;
  var bob=Math.sin(elapsed*9)*0.026;

  var baseY;
  if(under||climbing){
    if(climbing){
      riseK=Math.min(1,riseK+dt*1.25);
      if(riseK>=1){ climbing=false; under=false; underT=0; }
    }else{
      fallK=Math.min(1,fallK+dt*1.4);
      underT+=dt;
      if(underT>TUN_TIME && !needExit){ needExit=true; showAlert('Прыгнуть — выбраться наверх'); }
    }
    var fromY=TUN_Y+EYE, toY=groundY+EYE;
    var k=climbing?riseK:fallK;
    baseY=fromY+(toY-fromY)*k;
  }else{
    baseY=groundY+EYE;
  }

  camPos.copy(p).addScaledVector(tmpR,lane*LANE_SHIFT);
  camPos.y=baseY+jumpY-duckY+bob;

  if(shake>0){
    camPos.x+=(Math.random()-0.5)*shake*0.55;
    camPos.y+=(Math.random()-0.5)*shake*0.45;
  }

  camera.position.copy(camPos);
  var lookAtT=Math.min(1,t+0.02);
  look.copy(curve.getPointAt(lookAtT)).addScaledVector(tmpR,lane*LANE_SHIFT*1.9);
  look.y=(under||climbing)?(TUN_Y+EYE+0.55+jumpK*0.3):(yOf(lookAtT)+EYE);
  look.y-=jumpK*0.85+duckY*0.6;
  camera.lookAt(look);
  camera.rotateZ(-lane*0.18);

  if(capsule){
    capsule.position.y=-0.62+bob*0.9+jumpK*0.07;
    capsule.position.x=-lane*0.12;
    capsule.rotation.z=Math.sin(elapsed*5.2)*0.012-lane*0.05+(hitGlow>0?(Math.random()-0.5)*0.09*hitGlow:0);
    if(capsule.material){
      capsule.material.opacity=1-0.18*hitGlow;
      if(capsule.material.color) capsule.material.color.setRGB(1-0.1*hitGlow,1,1);
    }
  }

  if(el.dark) el.dark.style.opacity=(under?0.34:(fallK>0&&fallK<1?0.25:0)).toFixed(3);

  // под землёй мир становится тесным и тёмным: плотная дымка скрывает город
  if(under!==wasUnder){
    wasUnder=under;
    if(under){
      scene.fog=new THREE.Fog(0x0c1114,1,44);
      scene.background.set(0x0c1114);
    }else{
      scene.fog=new THREE.Fog(0x51636d,22,130);
      scene.background.set(0x51636d);
    }
  }

  topMix+=((topView?1:0)-topMix)*Math.min(1,dt*4);
  if(capsule) capsule.visible=topMix<0.45;
  if(topMix>0.002){
    var high=camPos.clone().addScaledVector(tmpF,-10); high.y+=18;
    camera.position.lerp(high,topMix);
    var downTarget=camPos.clone().addScaledVector(tmpF,8); downTarget.y=groundY;
    camera.lookAt(look.clone().lerp(downTarget,topMix));
  }

  var dist=progress*pathLen;
  events.forEach(function(e){
    if(!e.warned && dist>e.d-WARN_AHEAD){ e.warned=true; if(!under) showAlert(e.text); }
    if(!e.done && dist>=e.d){ e.done=true; judge(e); }

    if(e.type==='debris'&&e.rocks){
      var rem=e.d-dist, K=26;
      e.rocks.forEach(function(rock){
        var kk0=(K-rem)/K;
        if(kk0<-0.15||kk0>1.15){ rock.visible=false; return; }
        var kk=Math.max(0,Math.min(1,kk0));
        var ahead=(1-kk)*K + rock.userData.dl;
        if(ahead<4){ rock.visible=false; return; }
        rock.visible=true;
        rock.position.copy(e.origin)
          .addScaledVector(e.right, rock.userData.off)
          .addScaledVector(e.fwd, ahead);
        rock.position.y=e.origin.y+0.9+15*Math.pow(1-kk,1.7);
        rock.rotation.x+=dt*rock.userData.spin;
        rock.rotation.y+=dt*rock.userData.spin*0.8;
      });
    }

    if(e.type==='crystal'&&e.crystal&&e.crystal.visible){
      e.crystal.rotation.y+=dt*1.6;
      e.crystal.position.y+=Math.sin(elapsed*2.2+e.d)*0.008;
      if(e.halo) e.halo.intensity=0.9+Math.sin(elapsed*4)*0.3;
    }
  });

  for(var i=shards.length-1;i>=0;i--){
    var s=shards[i];
    s.userData.life-=dt;
    if(s.userData.life<=0){ scene.remove(s); shards.splice(i,1); continue; }
    s.userData.v.y-=dt*18;
    s.position.addScaledVector(s.userData.v,dt);
    if(s.position.y<0.1){ s.position.y=0.1; s.userData.v.y*=-0.35; s.userData.v.x*=0.7; s.userData.v.z*=0.7; }
    s.rotation.x+=s.userData.spin*dt; s.rotation.y+=s.userData.spin*dt*0.7;
  }

  updateHud();
  renderer.render(scene,camera);
}

function reset(){
  elapsed=0;progress=0;lane=0;laneTarget=0;holdT=0;jumpT=0;duckT=0;shake=0;
  under=false;underT=0;needExit=false;fallK=0;riseK=0;climbing=false;hitGlow=0;wasUnder=false;
  integrity=100;energy=100;passed=0;failed=0;finished=false;
  lastAct='';lastActAt=-9;
  events.forEach(function(e){
    e.done=false;e.warned=false;
    if(e.rocks) e.rocks.forEach(function(r){ r.visible=false; });
    if(e.crystal){ e.crystal.visible=true; if(e.halo)e.halo.visible=true; }
  });
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

window.__t7goto=function(pp){
  elapsed=DURATION*Math.max(0,Math.min(1,pp)); progress=elapsed/DURATION;
  // отладочный переход: пройденные события не судим, из тоннеля поднимаем
  var d=progress*pathLen;
  events.forEach(function(e){ if(e.d<=d){ e.done=true; e.warned=true; } });
  under=false; climbing=false; fallK=0; riseK=0; underT=0; needExit=false;
};
window.__t7under=function(){ under=true; underT=0; fallK=1; };
window.__t7dbg=function(){ return {camY:+camera.position.y.toFixed(2),ground:+yOf(Math.min(0.999,progress)).toFixed(2),prog:+progress.toFixed(3),under:under,top:+topMix.toFixed(2)}; };

try{
  renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,powerPreference:'high-performance'});
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
