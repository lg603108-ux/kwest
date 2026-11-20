// task09.js — задание 9 «Зарядка Стабилизатора».
// Правила задания (ТЗ, раздел 11): все касаются в такт, шкала общая, личной серии нет,
// паузы нет, спам не ускоряет заряд, на 100% сразу общий переход без ожидания конца файла.
// Ритм берётся из самого трека, а не из независимого таймера: разметка измерена по файлу
// stabilizer_rhythm_120s.mp3 — 104,79 уд/мин, первый удар на 0,219 с, 210 ударов за 120 с
// (отклонение разметки от акцентов трека около 14 мс).
// Музыка звучит только на телефоне капитана (решение автора 19.11.2026), остальные
// ориентируются по пульсирующему кольцу: иначе десять телефонов дают эхо.
// Стадии: wait → intro (инструкция Вольта) → charge → done.
window.Task09=(function(){
const BUILD='0354a';
const PERIOD=0.57259;      // секунд между ударами (104,79 уд/мин)
const OFFSET=0.2186;       // первый удар от начала трека, секунд
const TRACK_LEN=120.08;    // длина файла, секунд
const TARGET=800;          // цель: очки на участника (решение автора: 800, уточняется на проверке)
const SRC_INTRO='assets/v09_intro.mp4?v=0350a';       // сжатый файл автора, 12,6 МБ
const SRC_TRACK='assets/stabilizer_rhythm_120s.mp3?v=0350a';
const SRC_FINISH='assets/v09_finish.mp3';
const BG='assets/stabilizer.jpg?v=0350a';
let active=false,root=null,video=null,audio=null,els={},roomState=null,task=null,roomOff=null;
let tickTimer=null,startTimer=null,audioTimer=null,raf=0;
let mediaKey='',mediaRetries=0,audioKey='',stageKey='',tOff=0,offRef=null;
let points=0,beats=0,lastBeat=-1,lastSent=0,endedLocal=false,fbTimer=null,finishWrote=0,fadeTimer=null,lastWaitKey='';
function cap(){const room=roomState||(window.NET&&NET.room);return !!(window.NET&&NET.uid&&room&&room.captain===NET.uid);}
function now(){return Date.now()+(+tOff||0);}
function uid(){return (window.NET&&NET.uid)||'';}
function db(){return firebase.database();}
function taskRef(){return db().ref('rooms/'+NET.room.code+'/tasks/task09');}
function write(obj){return taskRef().update(obj).catch(function(e){error(e);throw e;});}
function error(e){status('Ошибка связи: '+(e&&e.message||e));}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function playSfx(file,volume){try{var x=new Audio('assets/'+file);x.volume=volume;x.play().catch(function(){});}catch(e){}}
function status(text){
if(!els.status)return '';
if(text===undefined)return els.status.textContent||'';
els.status.textContent=text||'';els.status.hidden=!text;return '';
}
// ——— монтаж ———
function mount(container){
if(root)unmount();
active=true;
['movie','street'].forEach(function(id){var v=document.getElementById(id);if(!v)return;try{v.pause();v.muted=true;}catch(e){}});
root=document.createElement('div');root.id='t9';root.innerHTML=
'<img class="t9-bg" src="'+BG+'" alt="">'+
'<div class="t9-shade"></div>'+
'<video class="t9-video" playsinline preload="auto"></video>'+
'<section class="t9-screen t9-wait">'+
'<p class="t9-eyebrow">ЗАДАНИЕ 9</p><h1>Зарядка Стабилизатора</h1>'+
'<p class="t9-note">Сейчас Вольт объяснит, как заряжать установку. Касайтесь экрана в такт — все вместе.</p>'+
'<button id="t9-start" class="t9-primary" type="button">▶ Включить инструкцию</button>'+
'<p class="t9-note" id="t9-waitnote">Ждём, когда капитан запустит инструкцию…</p></section>'+
'<div class="t9-hud" id="t9-hud" hidden>'+
'<div class="t9-top"><span class="t9-eyebrow">ЗАДАНИЕ 9 · СТАБИЛИЗАТОР</span>'+
'<span class="t9-statusline">Заряд общий — работайте вместе</span></div>'+
'<div class="t9-left"><p class="t9-label">ЗАРЯД СТАБИЛИЗАТОРА</p>'+
'<p class="t9-pct"><span id="t9-pct">0</span>%</p>'+
'<div class="t9-bar"><i id="t9-fill"></i></div>'+
'<p class="t9-caption" id="t9-leftnote">Точные попадания дают больше энергии</p></div>'+
'<div class="t9-zone" id="t9-zone"><div class="t9-ring" id="t9-ring" style="transform:scale(1)"><span></span></div>'+
'<p class="t9-hint">Касайтесь в такт музыке</p>'+
'<p class="t9-hint2">Кольцо вспыхивает на каждый удар</p></div></div>'+
'<div class="t9-fb" id="t9-fb" hidden></div>'+
'<section class="t9-done" id="t9-done" hidden>'+
'<p class="t9-eyebrow">СТАБИЛИЗАТОР ЗАРЯЖЕН</p><h1>ЗАРЯДКА 100 %</h1><p class="t9-donebig">УСТАНОВКА ГОТОВА</p>'+
'<button id="t9-continue" class="t9-primary" type="button">Продолжить →</button>'+
'<p class="t9-donewait" id="t9-donewait">ЖДЁМ КАПИТАНА</p></section>'+
'<div class="t9-status" id="t9-status" role="status" hidden></div>'+
'<button class="t9-primary t9-mediabtn" id="t9-media" type="button" hidden></button>'+
'<p class="t9-build">Сборка '+BUILD+'</p>';
container.appendChild(root);
video=root.querySelector('.t9-video');
els={wait:root.querySelector('.t9-wait'),start:root.querySelector('#t9-start'),waitnote:root.querySelector('#t9-waitnote'),
hud:root.querySelector('#t9-hud'),pct:root.querySelector('#t9-pct'),fill:root.querySelector('#t9-fill'),
zone:root.querySelector('#t9-zone'),ring:root.querySelector('#t9-ring'),fb:root.querySelector('#t9-fb'),
done:root.querySelector('#t9-done'),status:root.querySelector('#t9-status'),media:root.querySelector('#t9-media'),
cont:root.querySelector('#t9-continue'),donewait:root.querySelector('#t9-donewait'),
leftnote:root.querySelector('#t9-leftnote')};
els.start.addEventListener('click',startIntro);
els.cont.addEventListener('click',continueTo10);
els.zone.addEventListener('pointerdown',onTap);
els.zone.addEventListener('contextmenu',function(e){e.preventDefault();});
try{offRef=db().ref('.info/serverTimeOffset');offRef.on('value',function(s){tOff=+s.val()||0;});}catch(e){offRef=null;}
roomOff=NET.onRoom(onRoom);
tickTimer=setInterval(tick,300);
raf=requestAnimationFrame(loop);
}
function unmount(){
active=false;
if(startTimer){clearTimeout(startTimer);startTimer=null;}
if(audioTimer){clearTimeout(audioTimer);audioTimer=null;}
if(fadeTimer){clearInterval(fadeTimer);fadeTimer=null;}
if(fbTimer){clearTimeout(fbTimer);fbTimer=null;}
if(raf){cancelAnimationFrame(raf);raf=0;}
if(offRef){try{offRef.off();}catch(e){}offRef=null;}
if(tickTimer){clearInterval(tickTimer);tickTimer=null;}
if(typeof roomOff==='function')roomOff();roomOff=null;
stopTrack(true);
if(video){try{video.pause();video.removeAttribute('src');video.load();}catch(e){}}
if(root&&root.parentNode)root.parentNode.removeChild(root);
root=null;video=null;audio=null;els={};roomState=null;task=null;mediaKey='';audioKey='';stageKey='';
points=0;beats=0;lastBeat=-1;lastSent=0;endedLocal=false;finishWrote=0;
}
function onRoom(room){
if(!active||!room)return;
roomState=room;task=(room.tasks&&room.tasks.task09)||{stage:'wait'};
// свои подтверждённые попадания берём из базы: обновление страницы не обнуляет вклад
const mine=(task.hits||{})[uid()];
if(mine){const p=+mine.points||0;if(p>points)points=p;const b=+mine.beats||0;if(b>beats)beats=b;const k=+mine.k;if(isFinite(k)&&k>lastBeat)lastBeat=k;}
coordinate();
render();
}
// ——— стадии ———
function startIntro(){
if(!cap()||!task||(task.stage||'wait')!=='wait')return;
if(els.start)els.start.disabled=true;
points=0;beats=0;lastBeat=-1;finishWrote=0;
write({stage:'intro',startsAt:now()+1200,charge:0,target:TARGET,trackId:'v09',completionRevision:+task.completionRevision||0,completedAt:0})
.catch(function(){if(els.start)els.start.disabled=false;});
}
function introFinished(){
if(!cap()||!task||task.stage!=='intro')return;
// общий старт зарядки: все устройства считают удар от одного серверного времени
write({stage:'charge',startsAt:now()+1800}).catch(function(){});
}
function finish(){
if(!cap()||!task||task.stage==='done')return;
if(finishWrote&&now()-finishWrote<2000)return;
finishWrote=now();
write({stage:'done',charge:100,completedAt:Date.now(),completionRevision:(+task.completionRevision||0)+1})
.catch(function(){finishWrote=0;});
}
// ——— попадания ———
function trackT(){const at=+((task&&task.startsAt)||0);if(!at)return -1;return (now()-at)/1000;}
function onTap(){
if(!active||!task||task.stage!=='charge')return;
const t=trackT();
if(t<-0.2||t>TRACK_LEN+0.6)return;
const k=Math.round((t-OFFSET)/PERIOD);
if(k<0||k<=lastBeat)return;               // один удар — максимум одно засчитанное касание
const dt=Math.abs(t-(OFFSET+k*PERIOD));
let pts=0;
if(dt<=0.10)pts=10;else if(dt<=0.20)pts=5;
if(!pts){feedback('мимо',true);return;}
lastBeat=k;points+=pts;beats+=1;
feedback('+'+pts,false);
flashRing();
sendHit();
}
function sendHit(){
if(Date.now()-lastSent<180)return;
lastSent=Date.now();
db().ref('rooms/'+NET.room.code+'/tasks/task09/hits/'+uid())
.update({points:points,beats:beats,k:lastBeat,at:Date.now()}).catch(function(){});
}
function feedback(text,miss){
if(!els.fb)return;
els.fb.textContent=text;els.fb.hidden=false;
els.fb.className='t9-fb'+(miss?' t9-miss':'');
if(fbTimer)clearTimeout(fbTimer);
fbTimer=setTimeout(function(){if(els.fb)els.fb.hidden=true;},700);
}
function flashRing(){
if(!els.zone)return;
els.zone.classList.add('t9-hit');
setTimeout(function(){if(els.zone)els.zone.classList.remove('t9-hit');},110);
}
// ——— общая шкала ———
function computeCharge(room){
const hits=(task&&task.hits)||{},ps=(room&&room.players)||{};
let sum=0,n=0;
for(const k in ps){const p=ps[k];if(!p)continue;if(p.connected===false)continue;n++;
const h=hits[k];if(h&&+h.points>0)sum+=+h.points;}
if(n<1)n=1;
return Math.min(100,Math.round(100*(sum/n)/TARGET));
}
function tick(){
if(!active||!task)return;
const st=task.stage||'wait';
if(st==='charge'){
const t=trackT();
if(cap()){
const ch=computeCharge(roomState);
const old=+task.charge||0;
if(ch>old)write({charge:ch}).catch(function(){});
if((ch>=100||t>=TRACK_LEN+0.3))finish();
}
}
render();
}
// ——— переход к заданию 10 (модуля ещё нет, экран-заглушка в главной странице) ———
function continueTo10(){
if(!task||task.stage!=='done')return;
if(!cap()){
status('Продолжит капитан.');
setTimeout(function(){if(status()==='Продолжит капитан.')status('');},2500);
return;
}
if(els.cont)els.cont.disabled=true;
// Порядок перехода: сначала состояние задания 10 (стадия инструкции), затем фаза комнаты.
// Обратный порядок монтирует модуль по пустой стадии — выглядит как «ничего не произошло».
var t10ref=db().ref('rooms/'+NET.room.code+'/tasks/task10');
t10ref.update({stage:'intro',startsAt:now()+1200,codeAccepted:false,codeAttempts:0,codeHintLevel:0,
protocolStep:0,protocolAttempts:0,protocolHintLevel:0,buttonLayout:'dome-core-stabilizer',
pressure:0,countdownStart:0,cityStart:0,completed:false,revision:0,completedAt:0})
.then(function(){return NET.setPhase('task10',now()+800);})
.catch(function(e){
if(els.cont)els.cont.disabled=false;
status('Не удалось перейти к заданию 10: '+(e&&e.message||e));
});
}
// ——— музыка (только капитан) ———
function ensureTrack(){
if(!cap()||!task||task.stage!=='charge')return;
const at=+task.startsAt||0;if(!at)return;
if(!audio){audio=new Audio(SRC_TRACK);audio.preload='auto';audio.volume=.85;}
const key=String(at);
if(audioKey===key)return;
audioKey=key;
try{audio.pause();audio.currentTime=0;}catch(e){}
if(audioTimer)clearTimeout(audioTimer);
const delay=at-now();
const begin=function(){
if(!active||audioKey!==key||!audio)return;
// возврат на середину: догоняем трек по общему времени старта, а не начинаем с нуля
const off=(now()-at)/1000;
if(off>0.15)try{audio.currentTime=Math.min(off,Math.max(0,TRACK_LEN-0.5));}catch(e){}
const p=audio.play();
if(!p||!p.then)return;
p.catch(function(){
if(!active||audioKey!==key)return;
if(els.media){els.media.hidden=false;els.media.textContent='🔊 Включить музыку';
els.media.onclick=function(){if(!audio)return;els.media.hidden=true;audio.play().catch(function(){});};}
});
};
if(delay>120)audioTimer=setTimeout(function(){audioTimer=null;begin();},delay);
else begin();
}
function fadeTrack(){
if(!audio||!audio.duration)return null;
const start=audio.volume;
if(fadeTimer)clearInterval(fadeTimer);
fadeTimer=setInterval(function(){
if(!audio){if(fadeTimer)clearInterval(fadeTimer);fadeTimer=null;return;}
const v=Math.max(0,audio.volume-0.1);
audio.volume=v;
if(v<=0.02){clearInterval(fadeTimer);fadeTimer=null;try{audio.pause();}catch(e){}}
},120);
return start;
}
function stopTrack(immediate){
if(fadeTimer){clearInterval(fadeTimer);fadeTimer=null;}
if(audioTimer){clearTimeout(audioTimer);audioTimer=null;}
audioKey='';
if(!audio)return;
if(immediate){try{audio.pause();audio.currentTime=0;}catch(e){}audio=null;return;}
try{audio.pause();}catch(e){}
}
// ——— видео инструкции: порядок запуска как в заданиях 5 и 8 ———
function stopMedia(){
if(startTimer){clearTimeout(startTimer);startTimer=null;}
if(!video)return;
mediaKey='';
video.onloadedmetadata=null;video.onended=null;video.onerror=null;video.onclick=null;
try{video.pause();}catch(e){}
hideMediaBtn();
}
function hideMediaBtn(){if(els.media){els.media.hidden=true;els.media.onclick=null;}}
function showMediaBtn(text,fn){if(!els.media)return;els.media.hidden=false;els.media.textContent=text;els.media.onclick=function(ev){if(ev&&ev.stopPropagation)ev.stopPropagation();hideMediaBtn();if(!active)return;fn();};}
function scheduleMedia(src,at,key){
stopMedia();mediaKey=key;mediaRetries=0;
video.muted=!cap();
video.onloadedmetadata=function(){
const offset=Math.max(0,(Date.now()-at)/1000);
if(offset>0.5&&video.duration)try{video.currentTime=Math.min(offset,Math.max(0,video.duration-0.1));}catch(e){}
};
video.onerror=function(){
if(!active||mediaKey!==key||!video)return;
if(mediaRetries<2){mediaRetries++;status('Повторная загрузка видео…');setTimeout(function(){if(!active||mediaKey!==key||!video)return;try{video.src=src;video.load();}catch(e){}beginPlay();},1500);return;}
status('Не удалось загрузить видео. Проверьте соединение.');
if(cap())showMediaBtn('Продолжить →',function(){endedLocal=true;introFinished();});
};
video.onended=function(){
if(!active||mediaKey!==key||!task)return;
endedLocal=true;
if(cap()&&task.stage==='intro')introFinished();
render();
};
video.src=src;
const beginPlay=function(){
if(!active||mediaKey!==key||!video)return;
const p=video.play();
if(!p||!p.then){status('');hideMediaBtn();return;}
p.then(function(){if(!active||mediaKey!==key)return;status('');hideMediaBtn();},function(){
if(!active||mediaKey!==key)return;
video.muted=true;video.play().catch(function(){});
status('');
if(cap())showMediaBtn('🔊 Нажмите, чтобы включить звук',function(){if(video)video.muted=false;});
});
};
video.onclick=beginPlay;
const delay=at-now();
if(delay>100){status('Видео начнётся одновременно у всех…');startTimer=setTimeout(function(){startTimer=null;if(!active)return;beginPlay();},delay);}
else beginPlay();
}
function coordinate(){
if(!task)return;
const st=task.stage||'wait';
if(st==='intro'){
if(mediaKey!=='intro'&&video){endedLocal=false;scheduleMedia(SRC_INTRO,+task.startsAt||0,'intro');}
if(video&&!cap()&&!video.muted)video.muted=true;
}
else if(st==='charge'){
if(mediaKey){stopMedia();}
ensureTrack();
}
else{
if(mediaKey)stopMedia();
if(st==='done'){if(!fadeTimer)fadeTrack();}else stopTrack(true);
}
}
// ——— отрисовка ———
function render(){
if(!root||!task)return;
const st=task.stage||'wait',c=cap();
root.className=c?'iscap':'';
els.wait.hidden=st!=='wait';
els.start.hidden=!c;els.waitnote.hidden=c;
const inIntro=st==='intro'&&!endedLocal;
if(video)video.hidden=!inIntro;
els.hud.hidden=!(st==='intro'||st==='charge');
els.done.hidden=st!=='done';
if(els.cont)els.cont.hidden=!c;
if(els.donewait)els.donewait.hidden=c;
const ch=st==='done'?100:Math.max(0,Math.min(100,+task.charge||0));
if(els.pct)els.pct.textContent=String(ch);
if(els.fill)els.fill.style.width=ch+'%';
if(st==='done'&&stageKey!=='done'){stageKey='done';playSfx(SRC_FINISH,.8);fadeTrack();}
if(st!=='done'&&stageKey==='done')stageKey='';
const waitKey=st+'|'+String(!!endedLocal)+'|'+String(c);
if(waitKey!==lastWaitKey){
lastWaitKey=waitKey;
if(st==='intro'&&endedLocal&&!c)status('Ждём капитана: он перейдёт к зарядке.');
else if(status()==='Ждём капитана: он перейдёт к зарядке.')status('');
}
if(st==='charge'&&els.leftnote){
els.leftnote.textContent=(ch>=100)?'Установка заряжена':'Точные попадания дают больше энергии';
}
}
function loop(){
if(!active){return;}
raf=requestAnimationFrame(loop);
if(!els.ring||!task)return;
let scale=1.06,op=.5;
if(task.stage==='charge'){
const t=trackT();
if(t>=OFFSET-PERIOD&&t<=TRACK_LEN+0.6){
const ph=((t-OFFSET)/PERIOD)%1;
const p=(ph+1)%1;              // 0 сразу после удара → 1 перед следующим
scale=0.82+1.35*p;
op=0.95-0.5*p;
}
}
els.ring.style.transform='scale('+scale.toFixed(3)+')';
els.ring.style.opacity=op.toFixed(2);
}
return{mount:mount,unmount:unmount,BUILD:BUILD};
})();
