// task10.js — задание 10 «Закрытие портала».
// Правила задания: ТЗ, раздел 12. Капитан сам вводит 3971 (подстановки из задания 8 нет),
// затем нажимает три установки в порядке с плаката: Стабилизатор → Купол → Ядро.
// Остальные держат жёлтый щит: отпустил палец, ушёл в фон или потерял касание — давление растёт.
// Давление ничего не блокирует и поражением не заканчивает.
// После третьего верного шага общий отсчёт 3–2–1, финальный город и итоговая карточка.
// Звуки задания звучат только на телефоне капитана (решение автора 19.11.2026).
// Кнопки «Скрыть клавиатуру» нет (решение автора 19.11.2026).
// Стадии: wait → intro → code → protocol → countdown → city → done.
/* ===== разряды аномалии: canvas, рисуются кодом ===== */
/* task10arcs.js — разряды аномалии для задания 10 (canvas, рисуются кодом каждый кадр).
   Подключение: T10Arcs({host: слой-контейнер, button: кнопка щита, state: секция щита}).
   Секция щита с классом t10-on = кнопка зажата; t10-hush = верный протокол (разряды уходят и гаснут). */
(function(){
'use strict';
var TAU=Math.PI*2;
function rnd(a,b){return a+Math.random()*(b-a);}
function clamp(v,a,b){return v<a?a:(v>b?b:v);}
function walk(n,amp){var a=[],v=0,i;for(i=0;i<=n;i++){v=v*0.72+rnd(-1,1)*amp;a.push(v);}return a;}
function mix(a,b,k){var r=[],i;for(i=0;i<a.length;i++)r.push(a[i]*k+b[i]*(1-k));return r;}
function T10Arcs(o){
 var host=o.host,btn=o.button,st=o.state||host;
 var cv=document.createElement('canvas');
 cv.style.cssText='position:absolute;left:0;top:0;width:100%;height:100%;display:block;pointer-events:none';
 host.appendChild(cv);
 var ctx=cv.getContext('2d');
 var W=0,H=0,dpr=1,cx=0,cy=0,btnR=60,unit=1,innerR=80;
 var N=36,BN=12,COUNT=o.count||26;
 var remeasure=0,bolts=[],raf=0,last=0,time=0,hold=false,hush=false,alpha=1,running=false;
 var PASS=[[34,.06,'rgba(10,170,200,'],[20,.11,'rgba(20,200,215,'],[10,.24,'rgba(40,228,224,'],[4.4,.7,'rgba(140,250,244,'],[1.7,1,'rgba(245,255,255,']];
 function build(){
  var i;bolts=bolts.length===COUNT?bolts:[];
  for(i=0;i<COUNT;i++){
   var b=bolts[i]||{reach:rnd(.15,.35),wait:0,bright:1,flash:0};
   b.ang=(i/COUNT)*TAU+rnd(-.14,.14);
   b.phase=rnd(0,TAU);b.period=rnd(5,9);b.rate=rnd(1.1,1.9);
   b.kA=walk(N,1);b.kB=walk(N,1);b.tk=0;b.dur=rnd(.07,.2);
   b.mph=rnd(0,TAU);b.mamp=rnd(.03,.07);b.nextFlash=rnd(1,4);
   b.br=[];var nb=2+(Math.random()<.5?1:0),j;
   for(j=0;j<nb;j++)b.br.push({at:rnd(.12,.8),side:Math.random()<.5?-1:1,ang:rnd(.35,.75),lenF:rnd(.14,.3),
    A:walk(BN,1),B:walk(BN,1),vis:0,on:1});
   bolts[i]=b;
  }
 }
 function resize(){
  var r=host.getBoundingClientRect();
  W=Math.max(1,r.width);H=Math.max(1,r.height);dpr=Math.min(window.devicePixelRatio||1,1.5);
  var nw=Math.round(W*dpr),nh=Math.round(H*dpr);if(cv.width!==nw||cv.height!==nh){cv.width=nw;cv.height=nh;}
  var br=btn&&btn.getBoundingClientRect();
  if(br&&br.width>10){cx=br.left-r.left+br.width/2;cy=br.top-r.top+br.height/2;btnR=br.width/2;}
  else{cx=W/2;cy=H/2;btnR=Math.min(W,H)*.15;}
  unit=clamp(Math.min(W,H)/420,.8,1.6);
  innerR=btnR*1.32+8*unit;
  if(!bolts.length)build();
 }
 function edgeDist(a){
  var dx=Math.cos(a),dy=Math.sin(a),tx=1e9,ty=1e9;
  if(dx>1e-6)tx=(W-cx)/dx;else if(dx<-1e-6)tx=(0-cx)/dx;
  if(dy>1e-6)ty=(H-cy)/dy;else if(dy<-1e-6)ty=(0-cy)/dy;
  return Math.min(tx,ty)+26*unit;
 }
 function strokePath(pts,from,to,w,al,col){
  ctx.beginPath();ctx.moveTo(pts[from][0],pts[from][1]);
  for(var k=from+1;k<=to;k++)ctx.lineTo(pts[k][0],pts[k][1]);
  ctx.lineWidth=w;ctx.strokeStyle=col+al.toFixed(3)+')';ctx.stroke();
 }
 function drawLine(pts,widthK,alK,chunks){
  var n=pts.length-1,c,p,CS=[1,.82,.62,.4],CA=[1,1,.8,.5];
  for(p=0;p<PASS.length;p++){
   for(c=0;c<chunks;c++){
    var f=Math.floor(n*c/chunks),t=Math.floor(n*(c+1)/chunks);
    var sc=chunks>1?CS[c]:1,ca=chunks>1?CA[c]:1;
    strokePath(pts,f,t,PASS[p][0]*unit*widthK*sc,clamp(PASS[p][1]*alK*ca,0,1),PASS[p][2]);
   }
  }
 }
 function step(b,dt){
  b.tk+=dt;
  if(b.tk>=b.dur){
   b.kA=b.kB;b.kB=mix(b.kA,walk(N,1),.4);b.tk=0;b.dur=rnd(.07,.2);
   b.bright=rnd(.6,1);
   for(var j=0;j<b.br.length;j++){var q=b.br[j];q.A=q.B;q.B=mix(q.A,walk(BN,1),.4);q.on=Math.random()<.78?1:0;}
  }
  b.nextFlash-=dt;if(b.nextFlash<=0){b.flash=1;b.nextFlash=rnd(1.5,5);}
  b.flash=Math.max(0,b.flash-dt*3.5);
  var target;
  if(hush||hold)target=0;
  else target=.62+.36*(.5+.5*Math.sin(time/b.period*TAU+b.phase));
  if(b.wait>0){b.wait-=dt;}
  else b.reach+=(target-b.reach)*(1-Math.exp(-dt*b.rate*(hold||hush?1.15:.75)));
 }
 function drawBolt(b){
  var d=[Math.cos(b.ang),Math.sin(b.ang)],E=edgeDist(b.ang);
  var vis=E-26*unit,stub=Math.max(80*unit,(vis-innerR)*.22),tail=E,head=(vis-stub)+(innerR-(vis-stub))*b.reach;
  var len=tail-head;if(len<6)return;
  var inx=-d[0],iny=-d[1],px=-iny,py=inx; // направление к кнопке и перпендикуляр
  var tx=cx+d[0]*tail,ty=cy+d[1]*tail;
  var u=clamp(b.tk/b.dur,0,1);u=u*u*(3-2*u);
  var amp=7*unit,pts=[],k;
  for(k=0;k<=N;k++){
   var t=k/N,off=(b.kA[k]+(b.kB[k]-b.kA[k])*u)*amp*(1-.35*t)+Math.sin(t*Math.PI*1.3+b.mph+time*.6)*len*b.mamp;
   pts.push([tx+inx*len*t+px*off,ty+iny*len*t+py*off]);
  }
  var fl=1+b.flash*.8,al=b.bright*alpha*(.85+.15*b.flash);
  drawLine(pts,fl,al,4);
  // ветви
  for(var j=0;j<b.br.length;j++){
   var q=b.br[j];q.vis+=(q.on-q.vis)*.25;if(q.vis<.04)continue;
   var o0=pts[Math.floor(q.at*N)],ang0=Math.atan2(iny,inx)+q.side*q.ang;
   var bl=len*q.lenF,bx=Math.cos(ang0),by=Math.sin(ang0),bp=[];
   for(k=0;k<=BN;k++){
    var s=k/BN,of2=(q.A[k]+(q.B[k]-q.A[k])*u)*amp*.8;
    bp.push([o0[0]+bx*bl*s-by*of2,o0[1]+by*bl*s+bx*of2]);
   }
   drawLine(bp,.55*fl,al*q.vis*.85,1);
  }
 }
 function frame(ts){
  raf=0;if(!running)return;
  var dt=clamp((ts-(last||ts))/1000,0,.05);last=ts;time+=dt;if((remeasure-=dt)<=0){remeasure=.6;resize();}
  var aT=hush?0:(hold?.85:1);alpha+=(aT-alpha)*(1-Math.exp(-dt*(hush?2.2:3)));
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
  if(hush&&alpha<.01){running=false;return;}
  ctx.globalCompositeOperation='lighter';ctx.lineCap='round';ctx.lineJoin='round';
  for(var i=0;i<bolts.length;i++){step(bolts[i],dt);drawBolt(bolts[i]);}
  ctx.globalCompositeOperation='source-over';
  raf=requestAnimationFrame(frame);
 }
 function start(){if(running||st.hidden)return;running=true;last=0;resize();raf=requestAnimationFrame(frame);}
 function stop(){running=false;if(raf)cancelAnimationFrame(raf);raf=0;}
 function sync(){
  var h=st.classList.contains('t10-on'),u=st.classList.contains('t10-hush');
  if(h!==hold||u!==hush){for(var i=0;i<bolts.length;i++)bolts[i].wait=rnd(0,.4);}
  hold=h;hush=u;
  if(st.hidden){stop();return;}
  if(!running&&!(hush&&alpha<.01))start();
  if(!hush&&!running)start();
 }
 resize();
 var mo=new MutationObserver(sync);mo.observe(st,{attributes:true,attributeFilter:['class','hidden']});
 function onRes(){if(!st.hidden)resize();}
 function onVis(){if(document.hidden)stop();else sync();}
 window.addEventListener('resize',onRes);
 document.addEventListener('visibilitychange',onVis);
 sync();
 function destroy(){stop();mo.disconnect();window.removeEventListener('resize',onRes);document.removeEventListener('visibilitychange',onVis);if(cv.parentNode)cv.parentNode.removeChild(cv);}
 return {resize:resize,start:start,stop:stop,destroy:destroy};
}
window.T10Arcs=T10Arcs;
})();
/* ===== конец разрядов ===== */
window.Task10=(function(){
const BUILD='0364a';
let arcs=null;                                              // живые разряды аномалии (T10Arcs)
const CODE='3971';
const SRC_INTRO='assets/v10_intro.mp4?v=0353a';            // сжатый файл автора
const SRC_CITY='assets/city_restored_final.mp4?v=0353a';    // финальный город
const SFX_CODE='v10_code_accepted.mp3',SFX_RESTART='v10_restart.mp3',SFX_KOD='v10_kod.mp3';
const SFX_ERR='sfx_ui_error.mp3',SFX_WIN='sfx_crystal_ready.mp3';   // как в заданиях 4 и 8
const SRC_MUSIC='music_defense_loop.mp3';
const SFX_HINT_CODE='v10_hint_code.mp3',SFX_HINT_PROTO='v10_hint_protocol.mp3',SFX_HOLD='v10_hold.mp3';
// Визуальный порядок кнопок намеренно НЕ совпадает с правильной последовательностью.
// Значки и круглые кнопки — из пульта в ролике задания 10, порядок намеренно неверный:
// слева направо Купол, Ядро, Стабилизатор. Правильно: Стабилизатор → Купол → Ядро.
const BTN=[{id:'dome',label:'КУПОЛ',img:'assets/t10_sym_dome.jpg?v=0356a',cls:'t10-yellow'},
{id:'core',label:'ЯДРО',img:'assets/t10_sym_core.jpg?v=0356a',cls:'t10-red'},
{id:'stabilizer',label:'СТАБИЛИЗАТОР',img:'assets/t10_sym_stab.jpg?v=0356a',cls:'t10-blue'}];
const LAYOUT='dome-core-stabilizer';
const ORDER=[2,0,1];                                        // Стабилизатор → Купол → Ядро
const HINT_CODE=['','Вспомните порядок объектов: пробирка, бейдж, часы, сектор.','Пробирка 3, бейдж 9, часы 7, сектор 1. Код — 3971.'];
const HINT_PROTO=['','Вспомните плакат из записи камер.','Порядок с плаката: Стабилизатор → Купол → Ядро.'];
const COUNT_MS=3000;        // общий отсчёт 3–2–1
const SHIELD_TTL=6000;      // зависшая запись щита не считается вечным щитом
const PRESS_MS=2500;        // как часто капитан пишет общее давление в базу
let active=false,root=null,video=null,els={},roomState=null,task=null,roomOff=null;
let tickTimer=null,startTimer=null,holdHb=null,tOff=0,offRef=null;
let mediaKey='',mediaRetries=0,endedLocal=false,stageKey='',lastStatusKey='';
let slots=['','','',''],pos=0,lastSubmit=0,localHintCode=0,localHintProto=0,glitchUntil=0;
let holding=false,holdAudio=null,voice=null,music=null,pressCur=0,pressWrote=0,pressWritten=0;
let protoDraft=[];
let countWrote=0,finishWrote=0,cardKey='',localDone=false,autoStarted=false;
function cap(){const room=roomState||(window.NET&&NET.room);return !!(window.NET&&NET.uid&&room&&room.captain===NET.uid);}
function now(){return Date.now()+(+tOff||0);}
function uid(){return (window.NET&&NET.uid)||'';}
function db(){return firebase.database();}
function nodeRef(){return db().ref('rooms/'+NET.room.code+'/tasks/task10');}
function write(obj){return nodeRef().update(obj).catch(function(e){error(e);throw e;});}
function error(e){status('Ошибка связи: '+(e&&e.message||e));}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
// Голос и звуки идут по ОДНОМУ каналу: новая дорожка глушит предыдущую, иначе
// при вводе кода и протокола фразы накладываются друг на друга (замечание автора 20.11.2026).
function playSfx(file,volume){if(!cap())return;try{if(voice){try{voice.pause();voice.currentTime=0;}catch(_){}}voice=new Audio('assets/'+file);voice.volume=volume;voice.play().catch(function(){});}catch(e){}}
// Тихая фоновая музыка на всех устройствах: на этапе ввода и протокола (без видео).
function startMusic(){
if(music)return;
try{music=new Audio('assets/'+SRC_MUSIC);music.loop=true;music.volume=.05;music.preload='auto';
const p=music.play();if(p&&p.catch)p.catch(function(){});}catch(e){music=null;}
}
function stopMusic(){if(!music)return;try{music.pause();music.currentTime=0;}catch(e){}music=null;}
function stopVoice(){if(!voice)return;try{voice.pause();voice.currentTime=0;}catch(e){}voice=null;}
function status(text){
if(!els.status)return '';
if(text===undefined)return els.status.textContent||'';
els.status.textContent=text||'';els.status.hidden=!text;return '';
}
// ——— монтаж ———
function mount(container){
if(root)unmount();
active=true;mediaKey='';mediaRetries=0;endedLocal=false;stageKey='';lastStatusKey='';
slots=['','','',''];pos=0;lastSubmit=0;localHintCode=0;localHintProto=0;glitchUntil=0;
holding=false;pressCur=0;pressWrote=0;pressWritten=0;countWrote=0;finishWrote=0;cardKey='';localDone=false;autoStarted=false;
try{if(window.__stopQuestAudio)window.__stopQuestAudio();}catch(e){}
['movie','street'].forEach(function(id){var v=document.getElementById(id);if(!v)return;try{v.pause();v.muted=true;}catch(e){}});
root=document.createElement('div');root.id='t10';root.innerHTML=
'<video class="t10-video" playsinline preload="auto"></video>'+

'<section class="t10-screen t10-wait" id="t10-wait"><p class="t10-eyebrow">ЗАДАНИЕ 10</p><h1>Закрытие портала</h1>'+
'<p class="t10-note">Мы у Ядра. Сейчас Вольт объяснит, что делать: капитан вводит код, команда держит щиты.</p>'+
'<button id="t10-start" class="t10-primary" type="button">▶ Включить инструкцию</button>'+
'<p class="t10-note" id="t10-waitnote">Ждём, когда капитан запустит инструкцию…</p></section>'+
'<section class="t10-panel" id="t10-panel" hidden>'+
'<div class="t10-codebox" id="t10-codebox" hidden><p class="t10-eyebrow">КОД ЯДРА</p>'+
'<div class="t10-coderow"><div class="t10-codecol">'+
'<div class="t10-cells" id="t10-cells"></div>'+
'<div class="t10-pad" id="t10-pad"></div>'+
'<div class="t10-actions"><button class="t10-secondary" id="t10-del" type="button">Удалить</button>'+
'<button class="t10-primary" id="t10-check" type="button">Подтвердить</button></div>'+
'<p class="t10-hint" id="t10-hint" hidden><b>ПОДСКАЗКА</b><span id="t10-hinttext"></span></p>'+
'</div><p class="t10-err" id="t10-err" hidden>Сигнал искажён. Проверьте код</p></div></div>'+
'<div class="t10-proto" id="t10-proto" hidden><p class="t10-eyebrow">ПРОТОКОЛ ЗАПУСКА</p>'+
'<p class="t10-note">Нажмите три установки в порядке с плаката, затем «Проверить».</p>'+
'<div class="t10-btns" id="t10-btns"></div>'+
'<p class="t10-pcount" id="t10-pcount">Выбрано: 0 из 3</p>'+
'<div class="t10-protrow"><button class="t10-primary t10-pcheck" id="t10-pcheck" type="button" disabled>Проверить</button>'+
'<p class="t10-phint" id="t10-phint" hidden></p></div></div></section>'+
'<section class="t10-shield" id="t10-shield" hidden>'+
'<div class="t10-waves" id="t10-waves"></div>'+
'<p class="t10-plate t10-shieldup" id="t10-shieldup">УДЕРЖИВАЙ ЩИТ</p>'+
'<button class="t10-shieldbtn" id="t10-shieldbtn" type="button"><img src="assets/t10_shield.png?v=0362a" alt=""></button>'+
'<p class="t10-plate t10-press2"><span>ДАВЛЕНИЕ АНОМАЛИИ</span> <b id="t10-pressure2">0%</b></p></section>'+
'<section class="t10-count" id="t10-count" hidden><p class="t10-eyebrow">ПОРТАЛ ЗАКРЫВАЕТСЯ</p>'+
'<p class="t10-countnum" id="t10-countnum">3</p><p class="t10-closed">ПОРТАЛ ЗАКРЫТ: 100%</p>'+
'<p class="t10-note">Держите щиты!</p></section>'+
'<div class="t10-flash" id="t10-flash"></div>'+
'<section class="t10-screen t10-done" id="t10-done" hidden><p class="t10-eyebrow">ПОРТАЛ ЗАКРЫТ</p><h1>ГОРОД СПАСЁН</h1>'+
'<div class="t10-card"><p class="t10-cardlabel">КОМАНДА</p><p class="t10-names" id="t10-names"></p>'+
'<p class="t10-row"><span>ОБЩЕЕ ВРЕМЯ</span><b id="t10-time">—</b></p>'+
'<p class="t10-row"><span>ОБОРОНА</span><b id="t10-def">0</b></p>'+
'<p class="t10-row"><span>ИМПУЛЬС КОМАНДЫ</span><b id="t10-impulse">—</b></p></div>'+
'<button id="t10-finish" class="t10-primary" type="button">Завершить</button>'+
'<p class="t10-note" id="t10-donewait" hidden>ЖДЁМ КАПИТАНА</p></section>'+
'<div class="t10-status" id="t10-status" role="status" hidden></div>'+
'<button class="t10-primary t10-mediabtn" id="t10-media" type="button" hidden></button>'+
'<p class="t10-build">Сборка '+BUILD+'</p>';
container.appendChild(root);
video=root.querySelector('.t10-video');
els={wait:root.querySelector('#t10-wait'),start:root.querySelector('#t10-start'),waitnote:root.querySelector('#t10-waitnote'),
waves:root.querySelector('#t10-waves'),flash:root.querySelector('#t10-flash'),panel:root.querySelector('#t10-panel'),
press:root.querySelector('#t10-pressure'),pressfill:root.querySelector('#t10-pressurefill'),
codebox:root.querySelector('#t10-codebox'),cells:root.querySelector('#t10-cells'),pad:root.querySelector('#t10-pad'),
del:root.querySelector('#t10-del'),check:root.querySelector('#t10-check'),err:root.querySelector('#t10-err'),
proto:root.querySelector('#t10-proto'),btns:root.querySelector('#t10-btns'),
pcount:root.querySelector('#t10-pcount'),pcheck:root.querySelector('#t10-pcheck'),
hint:root.querySelector('#t10-hint'),hintText:root.querySelector('#t10-hinttext'),
phint:root.querySelector('#t10-phint'),shield:root.querySelector('#t10-shield'),
shieldup:root.querySelector('#t10-shieldup'),shieldbtn:root.querySelector('#t10-shieldbtn'),
press2:root.querySelector('#t10-pressure2'),count:root.querySelector('#t10-count'),
countnum:root.querySelector('#t10-countnum'),done:root.querySelector('#t10-done'),
names:root.querySelector('#t10-names'),time:root.querySelector('#t10-time'),def:root.querySelector('#t10-def'),
impulse:root.querySelector('#t10-impulse'),
finish:root.querySelector('#t10-finish'),donewait:root.querySelector('#t10-donewait'),
status:root.querySelector('#t10-status'),media:root.querySelector('#t10-media')};
try{arcs=T10Arcs({host:els.waves,button:els.shieldbtn,state:els.shield});}catch(e){arcs=null;}
els.start.addEventListener('click',startIntro);
els.check.addEventListener('click',submitCode);
els.del.addEventListener('click',removeDigit);
els.pad.addEventListener('click',onPadClick);
els.cells.addEventListener('click',onCellClick);
els.btns.addEventListener('click',onProtoClick);
els.pcheck.addEventListener('click',protoCheck);
els.finish.addEventListener('click',finishLocal);
// щит: держим пальцем, отпускание/фон/потеря касания снимают защиту
els.shieldbtn.addEventListener('pointerdown',shieldDown);
els.shieldbtn.addEventListener('pointerup',shieldUp);
els.shieldbtn.addEventListener('pointercancel',shieldUp);
els.shieldbtn.addEventListener('lostpointercapture',shieldUp);
els.shieldbtn.addEventListener('pointerleave',shieldUp);
els.shieldbtn.addEventListener('contextmenu',function(e){e.preventDefault();});
document.addEventListener('visibilitychange',onVisibility);
window.addEventListener('blur',shieldUp);
protoDraft=[];
try{offRef=db().ref('.info/serverTimeOffset');offRef.on('value',function(s){tOff=+s.val()||0;});}catch(e){offRef=null;}
try{db().ref('rooms/'+NET.room.code+'/tasks/task10/shields/'+uid()).onDisconnect().update({active:false,at:Date.now()});}catch(e){}
roomOff=NET.onRoom(onRoom);
// музыка включается не раньше самого задания: во время инструкции она не играет
root.addEventListener('pointerdown',function(){var t=(roomState&&roomState.tasks&&roomState.tasks.task10)||task;
if(t&&(t.stage==='code'||t.stage==='protocol'))startMusic();},{once:true});
tickTimer=setInterval(tick,400);
}
function unmount(){
if(arcs){try{arcs.destroy();}catch(e){}arcs=null;}
if(active)releaseShield();
stopVoice();stopMusic();
active=false;
if(startTimer){clearTimeout(startTimer);startTimer=null;}
if(holdHb){clearInterval(holdHb);holdHb=null;}
if(offRef){try{offRef.off();}catch(e){}offRef=null;}
if(tickTimer){clearInterval(tickTimer);tickTimer=null;}
document.removeEventListener('visibilitychange',onVisibility);
window.removeEventListener('blur',shieldUp);
if(typeof roomOff==='function')roomOff();roomOff=null;
stopMedia();stopHold();
if(video){try{video.pause();video.removeAttribute('src');video.load();}catch(e){}}
if(root&&root.parentNode)root.parentNode.removeChild(root);
root=null;video=null;els={};roomState=null;task=null;mediaKey='';endedLocal=false;stageKey='';
slots=['','','',''];pos=0;localHintCode=0;localHintProto=0;holding=false;cardKey='';
}
function onRoom(room){
if(!active||!room)return;
roomState=room;task=(room.tasks&&room.tasks.task10)||{stage:'wait'};
// свои подтверждённые шаги берём из базы: обновление страницы не сбрасывает ввод
if(+task.codeAttempts>0)localHintCode=Math.max(localHintCode,+task.codeHintLevel||0);
if(+task.protocolAttempts>0)localHintProto=Math.max(localHintProto,+task.protocolHintLevel||0);
coordinate();render();
}
// ——— стадии ———
function startIntro(){
if(!cap()||!task||(task.stage||'wait')!=='wait')return;
if(els.start)els.start.disabled=true;
write({stage:'intro',startsAt:now()+1200,codeAccepted:false,codeAttempts:0,codeHintLevel:0,
protocolStep:0,protocolAttempts:0,protocolHintLevel:0,buttonLayout:LAYOUT,
pressure:0,countdownStart:0,cityStart:0,completed:false,revision:0,completedAt:0})
.catch(function(){autoStarted=false;if(els.start)els.start.disabled=false;});
}
function introFinished(){
if(!cap()||!task||task.stage!=='intro')return;
write({stage:'code',startsAt:now()+800}).catch(function(){});
}
function onPadClick(e){
if(!cap()||!task||task.stage!=='code')return;
const b=e.target&&e.target.closest?e.target.closest('.t10-key'):null;
if(!b)return;
const d=b.getAttribute('data-d');if(!d)return;
const i=(pos>=0&&pos<4)?pos:0;
slots[i]=d;pos=(i+1)%4;
if(els.err)els.err.hidden=true;
render();
}
function onCellClick(e){
if(!cap()||!task||task.stage!=='code')return;
const b=e.target&&e.target.closest?e.target.closest('.t10-cell'):null;
if(!b)return;
const i=parseInt(b.getAttribute('data-i'),10);
if(isNaN(i))return;
pos=i;render();
}
function removeDigit(){
if(!cap()||!task||task.stage!=='code')return;
let i=(pos>=0&&pos<4)?pos:3;
if(!slots[i]){let k=-1;for(let j=3;j>=0;j--){if(slots[j]){k=j;break;}}if(k<0)return;i=k;}
slots[i]='';pos=i;render();
}
function submitCode(){
if(!cap()||!task||task.stage!=='code')return;
if(Date.now()-lastSubmit<700)return;
if(!(slots[0]&&slots[1]&&slots[2]&&slots[3]))return;
lastSubmit=Date.now();
const draft=slots.join('');
if(draft===CODE){
playSfx(SFX_CODE,.8);
write({stage:'protocol',codeAccepted:true,codeAttempts:+task.codeAttempts||0,protocolStep:0,startsAt:now()+600}).catch(function(){});
}else{
const at=(+task.codeAttempts||0)+1;
playSfx(SFX_ERR,.9);             // звук неправильного ввода (замечание автора 20.11.2026)
const lvl=at>=4?2:(at>=2?1:0);   // первая ошибка без подсказки: подсказка после двух
localHintCode=Math.max(localHintCode,lvl);
if(lvl>(+task.codeHintLevel||0))playSfx(SFX_HINT_CODE,.85);
if(els.err)els.err.hidden=false;
slots=['','','',''];pos=0;
write({codeAttempts:at,codeHintLevel:localHintCode}).catch(function(){});
}
}
function onProtoClick(e){
if(!cap()||!task||task.stage!=='protocol')return;
const b=e.target&&e.target.closest?e.target.closest('.t10-pbtn'):null;
if(!b||b.disabled)return;
const idx=parseInt(b.getAttribute('data-i'),10);
if(isNaN(idx))return;
if(protoDraft.length>=3)return;        // три нажатия, дальше только «Проверить»
if(protoDraft.indexOf(idx)>=0)return;  // одну установку дважды не выбирают
protoDraft.push(idx);
render();
}
// Последовательность собрана тремя нажатиями, проверка отдельной кнопкой:
// до проверки подсказок нет, ошибка не сбрасывает код и не раскрывает порядок.
function protoCheck(){
if(!cap()||!task||task.stage!=='protocol')return;
if(protoDraft.length!==3)return;
const okSeq=protoDraft.every(function(v,i){return v===ORDER[i];});
if(okSeq){
playSfx(SFX_WIN,.95);   // звук успеха протокола
write({protocolStep:3,countdownStart:now()+900}).then(function(){
setTimeout(function(){if(active)write({stage:'countdown'}).catch(function(){});},350);
}).catch(function(){});
}else{
const at=(+task.protocolAttempts||0)+1;
const lvl=at>=4?2:(at>=2?1:0);   // первая ошибка без подсказки: подсказка после двух
localHintProto=Math.max(localHintProto,lvl);
glitchUntil=Date.now()+5000;
protoDraft=[];
playSfx(SFX_ERR,.95);
if(lvl>(+task.protocolHintLevel||0))setTimeout(function(){playSfx(SFX_HINT_PROTO,1);},700);
write({protocolAttempts:at,protocolHintLevel:localHintProto,protocolStep:0}).catch(function(){});
render();
}
}
function startCity(){
if(!cap()||!task||task.stage==='city'||task.stage==='done')return;
if(finishWrote&&now()-finishWrote<2000)return;
finishWrote=now();
write({stage:'city',cityStart:Date.now()}).catch(function(){finishWrote=0;});
}
function finishQuest(){
if(!cap()||!task||task.stage!=='city')return;
if(task.completed)return;
if(now()-finishWrote<1500)return;   // одна запись завершения на комнату
finishWrote=now();
write({stage:'done',completed:true,completedAt:Date.now(),revision:(+task.revision||0)+1}).catch(function(){finishWrote=0;});
}
// ——— щит ———
function shieldDown(e){
if(!active||cap()||!task)return;
const st=task.stage||'wait';
// щит считается только после принятого кода: до этого игроки ждут капитана
if(st!=='protocol'&&st!=='countdown')return;
if(e){try{els.shieldbtn.setPointerCapture(e.pointerId);}catch(_){}}
if(holding)return;
holding=true;
if(els.shield)els.shield.classList.add('t10-on');
sendShield(true);
if(holdHb)clearInterval(holdHb);
holdHb=setInterval(function(){if(holding)sendShield(true);},1500);
}
function shieldUp(){
if(!holding)return;
releaseShield();
}
function releaseShield(){
holding=false;
if(holdHb){clearInterval(holdHb);holdHb=null;}
if(els.shield)els.shield.classList.remove('t10-on');
sendShield(false);
}
function sendShield(on){
if(!active||!uid())return;
const p=db().ref('rooms/'+NET.room.code+'/tasks/task10/shields/'+uid());
p.update({active:!!on,at:Date.now()}).catch(function(){});
if(!on)try{p.onDisconnect().cancel();}catch(e){}
}
function onVisibility(){if(document.hidden)shieldUp();}
// ——— общее давление ———
function shieldShare(){
const room=roomState,sh=(task&&task.shields)||{},ps=(room&&room.players)||{};
let others=0,holdingN=0;
for(const k in ps){
const p=ps[k];if(!p)continue;if(k===room.captain)continue;
if(p.connected===false)continue;
const hb=(typeof p.segAt==='number')?p.segAt:((p.joinedAt||0)+5000);
if(Date.now()-hb>20000)continue;
others++;
const s=sh[k];
if(s&&s.active===true&&(now()-(+s.at||0))<SHIELD_TTL)holdingN++;
}
if(others<1)return 1;
return holdingN/others;
}
function pressureTarget(){return Math.max(0,Math.min(100,Math.round(100*(1-shieldShare()))));}
// ——— такт ———
function tick(){
if(!active||!task)return;
const st=task.stage||'wait';
const target=pressureTarget();
pressCur+=(target-pressCur)*0.22;
if(cap()&&(st==='code'||st==='protocol'||st==='countdown')){
const rounded=Math.round(pressCur);
if(rounded!==pressWritten&&now()-pressWrote>PRESS_MS){pressWrote=now();pressWritten=rounded;write({pressure:rounded}).catch(function(){});}
}
if(st==='countdown'){
const cst=+task.countdownStart||0;
if(cap()&&cst&&now()>=cst+COUNT_MS+400&&!countWrote){countWrote=1;startCity();}
}
render();
}
// ——— звук удержания (только капитан) ———
function ensureHold(){
if(!cap()||!task)return;
const st=task.stage||'';
if(st!=='code'&&st!=='protocol'){stopHold();return;}
if(holdAudio){return;}
try{
holdAudio=new Audio('assets/'+SFX_HOLD);
holdAudio.loop=true;holdAudio.volume=.32;holdAudio.preload='auto';
const p=holdAudio.play();if(p&&p.catch)p.catch(function(){});
}catch(e){holdAudio=null;}
}
function stopHold(){
if(!holdAudio)return;
try{holdAudio.pause();holdAudio.currentTime=0;}catch(e){}
holdAudio=null;
}
// ——— видео: порядок запуска как в заданиях 8 и 9 ———
function stopMedia(){
if(startTimer){clearTimeout(startTimer);startTimer=null;}
if(!video)return;
mediaKey='';
video.onloadedmetadata=null;video.onended=null;video.onerror=null;video.onclick=null;
try{video.pause();}catch(e){}
hideMediaBtn();
}
function hideMediaBtn(){if(els.media){els.media.hidden=true;els.media.onclick=null;}}
// Браузер не пускает видео со звуком без нажатия (так бывает на телефонах): тогда видео
// стартует без звука, и поверх него показывается крупная кнопка — по нажатию звук включается.
function showSoundReq(){
if(!active||!root||!video)return;
var el=document.getElementById('t10-soundreq');
if(!el){
el=document.createElement('button');el.id='t10-soundreq';el.type='button';
el.textContent='🔊 Нажмите, чтобы включить звук';
root.appendChild(el);
}
el.hidden=false;
el.onclick=function(ev){
if(ev&&ev.stopPropagation)ev.stopPropagation();
el.hidden=true;
try{video.muted=false;video.volume=1;video.play().catch(function(){});}catch(e){}
};
}
function hideSoundReq(){var el=document.getElementById('t10-soundreq');if(el)el.hidden=true;}
function showMediaBtn(text,fn){if(!els.media)return;els.media.hidden=false;els.media.textContent=text;
els.media.onclick=function(ev){if(ev&&ev.stopPropagation)ev.stopPropagation();hideMediaBtn();if(!active)return;fn();};}
function scheduleMedia(src,at,key,onEnd){
stopMedia();mediaKey=key;mediaRetries=0;
video.muted=!cap();
video.onloadedmetadata=function(){
const offset=Math.max(0,(now()-at)/1000);
if(offset>0.5&&video.duration)try{video.currentTime=Math.min(offset,Math.max(0,video.duration-0.1));}catch(e){}
};
video.onerror=function(){
if(!active||mediaKey!==key||!video)return;
if(mediaRetries<2){mediaRetries++;status('Повторная загрузка видео…');
setTimeout(function(){if(!active||mediaKey!==key)return;try{video.src=src;video.load();}catch(e){}beginPlay();},1500);return;}
status('Видео не загрузилось. Проверьте соединение.');
if(cap())showMediaBtn('Продолжить →',function(){endedLocal=true;onEnd();});
};
video.onended=function(){
if(!active||mediaKey!==key)return;
endedLocal=true;
hideSoundReq();
if(cap())onEnd();
render();
};
video.src=src;
const beginPlay=function(){
if(!active||mediaKey!==key||!video)return;
const p=video.play();
if(!p||!p.then){status('');hideMediaBtn();return;}
p.then(function(){if(!active||mediaKey!==key)return;status('');hideMediaBtn();hideSoundReq();},function(){
if(!active||mediaKey!==key)return;
// Браузер не пустил звук без нажатия: показываем без звука и включаем его при первом
// же касании экрана — никаких кнопок «включить звук», как и в заданиях 8 и 9.
video.muted=true;video.play().catch(function(){});
status('');
try{video.volume=1;}catch(e){}
if(!video.__soundTap){
video.__soundTap=true;
var onTap=function(){
document.removeEventListener('pointerdown',onTap,true);
document.removeEventListener('touchstart',onTap,true);
if(!video)return;
try{if(video.muted){video.muted=false;video.play().catch(function(){});}}catch(e){}
};
document.addEventListener('pointerdown',onTap,true);
document.addEventListener('touchstart',onTap,true);
}
});
};
video.onclick=beginPlay;
const delay=at-now();
if(delay>100){status('Видео начнётся одновременно у всех…');
startTimer=setTimeout(function(){startTimer=null;if(!active)return;beginPlay();},delay);}
else beginPlay();
}
function coordinate(){
if(!task)return;
const st=task.stage||'wait';
// Инструкция Вольта включается сразу при входе в задание (решение автора 19.11.2026):
// «Продолжить» на финальном экране задания 9 ведёт прямо к ролику, лишнего нажатия нет.
if(st==='wait'){
if(cap()&&!autoStarted&&!(+task.startsAt||0)){autoStarted=true;startIntro();}
if(mediaKey)stopMedia();
stopHold();
return;
}
if(st==='intro'){
if(mediaKey!=='intro'&&video){endedLocal=false;scheduleMedia(SRC_INTRO,+task.startsAt||0,'intro',introFinished);}
if(video&&!cap()&&!video.muted)video.muted=true;
stopHold();
}
else if(st==='city'){
if(mediaKey!=='city'&&video&&!task.completed){endedLocal=false;scheduleMedia(SRC_CITY,+task.cityStart||0,'city',finishQuest);}
stopHold();
}
else{
if(mediaKey)stopMedia();
stopHold();
// фоновая музыка — только на самом задании (код и протокол), не на инструкции и не в финале
if(st==='code'||st==='protocol')startMusic();else stopMusic();
}
}
// ——— отрисовка ———
function fmtTime(ms){
if(!ms||ms<0)return '—';
const s=Math.round(ms/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),r=s%60;
if(h)return h+' ч '+m+' мин';
if(m)return m+' мин '+r+' с';
return r+' с';
}
function cardData(){
const room=roomState||{},ps=room.players||{};
const arr=Object.keys(ps).map(function(k){return {k:k,p:ps[k]||{}};})
.sort(function(a,b){return (a.p.joinedAt||0)-(b.p.joinedAt||0);});
const names=arr.map(function(e){return e.p.name||'Игрок';});
let def=0;arr.forEach(function(e){def+=(+e.p.score||0);});
const start=+room.createdAt||0,end=+((task&&task.completedAt)||0)||now();
return {names:names,defense:def,time:start?end-start:0};
}
function fillCard(){
if(!els.names)return;
// ключ пересборки карточки учитывает импульс: строка появляется, как только он посчитан
const imp=(window.__impulseTotal?window.__impulseTotal():0);
const key=(task&&+task.completedAt||0)+'|'+((roomState&&roomState.createdAt)||0)+'|'+imp;
if(cardKey===key)return;
cardKey=key;
const d=cardData();
els.names.innerHTML=d.names.length?d.names.map(function(n){return '<span>'+esc(n)+'</span>';}).join(''):'<span>—</span>';
if(els.time)els.time.textContent=fmtTime(d.time);
if(els.def)els.def.textContent=String(d.def);
if(els.impulse)els.impulse.textContent=String(imp);
}
function render(){
if(!root||!task)return;
const st=task.stage||'wait',c=cap();
root.className=c?'iscap':'';
const inVideo=(st==='intro'&&!endedLocal)||(st==='city'&&!task.completed);
if(video)video.hidden=!inVideo;
if(els.wait)els.wait.hidden=st!=='wait';
if(els.start)els.start.hidden=!c;
if(els.waitnote)els.waitnote.hidden=c;
const panelOn=c&&(st==='code'||st==='protocol');
if(els.panel)els.panel.hidden=!panelOn;
if(els.codebox)els.codebox.hidden=!(c&&st==='code');
if(els.proto)els.proto.hidden=!(c&&st==='protocol');
const shieldOn=!c&&(st==='code'||st==='protocol'||st==='countdown');
if(els.shield)els.shield.hidden=!shieldOn;
const codePhase=(st==='code');
if(els.shieldbtn)els.shieldbtn.disabled=codePhase;
if(els.shieldup){
els.shieldup.textContent=codePhase?'КАПИТАН ВВОДИТ КОД':'УДЕРЖИВАЙ ЩИТ';
els.shieldup.hidden=(!codePhase&&holding);   // плашка видна в начале и когда щит отпущен
}
if(codePhase&&els.shield)els.shield.classList.remove('t10-on');
if(els.count)els.count.hidden=true;   // экран с крупной цифрой «0» убран по требованию автора
// при верном протоколе волна отступает, затем светлое затухание и финальный город
if(els.shield)els.shield.classList.toggle('t10-hush',st==='countdown'||st==='city');
if(els.flash)els.flash.classList.toggle('on',st==='city');
if(root)root.classList.toggle('t10-glitch',Date.now()<glitchUntil);
if(els.done)els.done.hidden=!(st==='done'&&!localDone);
if(els.finish)els.finish.hidden=!(st==='done'&&!localDone);
if(els.donewait)els.donewait.hidden=!(st==='done'&&!c&&!localDone);
const p=Math.round(st==='countdown'?pressCur:pressCur);
if(els.press)els.press.textContent=p+'%';
if(els.pressfill)els.pressfill.style.width=p+'%';
if(els.press2)els.press2.textContent=p+'%';
// код капитана
if(c&&st==='code'){
if(els.cells&&els.cells.childElementCount!==4){
els.cells.innerHTML=slots.map(function(d,i){
return '<button class="t10-cell'+(d?' filled':'')+(i===pos?' sel':'')+'" data-i="'+i+'" type="button">'+esc(d||'')+'</button>';
}).join('');
}else if(els.cells){
for(let i=0;i<4;i++){
const b=els.cells.children[i];if(!b)continue;
b.textContent=slots[i]||'';
b.className='t10-cell'+(slots[i]?' filled':'')+(i===pos?' sel':'');
}
}
if(els.pad&&els.pad.childElementCount!==9){
let html='';for(let d=1;d<=9;d++)html+='<button class="t10-key" data-d="'+d+'" type="button">'+d+'</button>';
els.pad.innerHTML=html;
}
}
// протокол капитана
if(c&&(st==='protocol'||st==='countdown')){
if(els.btns&&els.btns.childElementCount!==3){
els.btns.innerHTML=BTN.map(function(b,i){
return '<button class="t10-pbtn" data-i="'+i+'" type="button">'+
'<img class="t10-sym" src="'+b.img+'" alt="">'+
'<span class="t10-dot '+b.cls+'"></span>'+
'<span class="t10-plabel">'+b.label+'</span>'+
'<span class="t10-pstep" data-step="'+i+'"></span></button>';
}).join('');
}
for(let i=0;i<3;i++){
const b=els.btns&&els.btns.children[i];if(!b)continue;
const at=protoDraft.indexOf(i);
b.classList.toggle('t10-done',at>=0);
const mark=b.querySelector('.t10-pstep');
if(mark)mark.textContent=at>=0?String(at+1):'';
}
if(els.pcheck){
const ready=protoDraft.length===3;
els.pcheck.disabled=!ready;
els.pcheck.hidden=st!=='protocol';
}
if(els.pcount)els.pcount.textContent='Выбрано: '+protoDraft.length+' из 3';
}
// подсказки
// подсказка кода — под кнопками ввода, подсказка протокола — рядом с «Проверить»
let hint='';
if(st==='code'&&c)hint=HINT_CODE[Math.max(localHintCode,+task.codeHintLevel||0)]||'';
if(els.hint){els.hint.hidden=!hint;if(hint&&els.hintText)els.hintText.textContent=hint;}
let phint='';
if((st==='protocol'||st==='countdown')&&c){
const lvl=Math.max(localHintProto,+task.protocolHintLevel||0);
phint=HINT_PROTO[lvl]||'';
}
if(els.phint){els.phint.hidden=!phint;els.phint.textContent=phint;}
// отсчёт
if(st==='countdown'&&els.countnum){
const left=Math.ceil(((+task.countdownStart||0)-now())/1000);
els.countnum.textContent=left>0?String(Math.min(3,left)):'0';
}
// финальная карточка
if(st==='done')fillCard();
// протокол собирается тремя нажатиями заново; вне этой стадии черновик пуст
if(st!=='protocol')protoDraft=[];
// голос Вольта по стадиям (только капитан): сначала «введите код», после кода — «удерживайте щит»
if(st!==stageKey){
if(c&&st==='code')playSfx(SFX_KOD,1);
if(c&&st==='protocol')playSfx(SFX_HOLD,1);
if(st==='countdown')stopMusic();
stageKey=st;
}
// Постоянные подписи снизу не нужны: всё, что игрок должен делать, написано на самом экране.
// Внизу остаются только сообщения об ошибках связи.
const sk=st+'|'+String(c);
if(sk!==lastStatusKey)lastStatusKey=sk;
}
function finishLocal(){
// закрываем карточку только на этом телефоне; данные комнаты и финал не трогаем
localDone=true;
if(els.done)els.done.hidden=true;
if(els.finish)els.finish.hidden=true;
status('Спасибо, команда! Вы спасли город.');
}
return{mount:mount,unmount:unmount,BUILD:BUILD};
})();
