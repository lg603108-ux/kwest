// task08.js — задание 8 «Место искажения». Две задачи:
// 1) по общей записи камер найти четыре цифры и ввести код (вводит только капитан);
// 2) заметить плакат на стене и запомнить порядок протокола для финала (в интерфейсе он НЕ раскрывается).
// Стадии: wait → intro (инструкция Вольта) → view (запись камер) → code → done.
// Звук: ролики ВСЕГДА стартуют без звука. Иначе телефон без свежего касания не запускает видео,
// и на экране остаётся чёрный кадр («у капитана видео не загружается»). Капитан включает звук
// кнопкой «♪ Включить звук»: касание даёт браузеру разрешение, инструкция при этом начинается заново.
window.Task08=(function(){
const CODE='3971';
const HINT=['','Ищите цифры в порядке: пробирка, бейдж, часы, сектор.','На часах нужна именно цифра часа — сколько часов показывают стрелки.','Код — 3971. Запомните его для финала.'];
const BUILD='0341a';
const SRC_INTRO='assets/v08_intro.mp4';
const SRC_VIEW='assets/lab_cctv.mp4';
let active=false,root=null,video=null,bg=null,els={},roomState=null,task=null,roomOff=null;
let tickTimer=null,startTimer=null,wdTimer=null,mediaTimer=null,mediaKey='',mediaRetries=0,pbKey='',resKey='';
let tOff=0,offRef=null,curSrc='',advancing=false,autoStarted=false;
// Черновик кода: у капитана живёт локально (сразу виден), в базу пишется для восстановления при обрыве.
let draft='',padOpen=true,errShown=false,lastSubmit=0;
let music=null,musicOn=false;
function cap(){const room=roomState||(window.NET&&NET.room);return !!(window.NET&&NET.uid&&room&&room.captain===NET.uid);}
function now(){return Date.now()+(+tOff||0);}
function uid(){return (window.NET&&NET.uid)||'';}
function db(){return firebase.database();}
function publicRef(){return db().ref('rooms/'+NET.room.code+'/tasks/task08');}
function write(obj){return publicRef().update(obj).catch(function(e){error(e);throw e;});}
function error(e){status('Ошибка связи: '+(e&&e.message||e));}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function playSfx(file,volume){try{var x=new Audio('assets/'+file);x.volume=volume;x.play().catch(function(){});}catch(e){}}
function startMusic(){
if(musicOn)return;
try{
if(!music){music=new Audio('assets/music_defense_loop.mp3');music.loop=true;music.volume=.06;music.preload='auto';}
musicOn=true;
var p=music.play();if(p&&p.catch)p.catch(function(){musicOn=false;});
}catch(e){musicOn=false;}
}
function stopMusic(){if(musicOn||music){musicOn=false;try{music.pause();}catch(e){}}}
// ——— монтаж ———
function mount(container){
if(root)unmount();
active=true;mediaKey='';mediaRetries=0;pbKey='';resKey='';advancing=false;draft='';padOpen=true;errShown=false;lastSubmit=0;autoStarted=false;
stopMedia();stopMusic();
try{if(window.__stopQuestAudio)window.__stopQuestAudio();}catch(e){}
['movie','street'].forEach(function(id){var v=document.getElementById(id);if(!v)return;try{v.pause();v.muted=true;}catch(e){}});
root=document.createElement('div');root.id='t8';root.innerHTML=
'<video class="t8-bg" playsinline muted loop preload="auto" src="assets/anomaly_rift.mp4"></video>'+
'<video class="t8-video" playsinline muted preload="auto"></video>'+
'<section class="t8-screen t8-wait"><p class="t8-eyebrow">ЗАДАНИЕ 8</p><h1>Место искажения</h1>'+
'<button id="t8-start" class="t8-primary" type="button">▶ Включить инструкцию</button>'+
'<p class="t8-note" id="t8-waitnote">Ждём, когда капитан запустит инструкцию…</p></section>'+
'<section class="t8-screen t8-ready" id="t8-ready" hidden><p class="t8-eyebrow">ИНСТРУКЦИЯ ПРОСМОТРЕНА</p><h1>Мы у места первого прорыва</h1>'+
'<p class="t8-note">Здесь осталась запись камер. Смотрите её вместе: в записи четыре цифры кода и плакат на стене с протоколом запуска — его нужно запомнить для финала.</p>'+
'<button id="t8-show" class="t8-primary" type="button">▶ Показать запись команде</button>'+
'<p class="t8-note" id="t8-readynote">Ждём капитана: он включит запись.</p></section>'+
'<div class="t8-controls" id="t8-controls" hidden><button id="t8-toggle" type="button">⏸ Пауза</button><button id="t8-restart" type="button">↺ В начало</button></div>'+
'<button class="t8-soundbtn" id="t8-sound" type="button" hidden>♪ Включить звук</button>'+
'<button class="t8-replay" id="t8-request" type="button" hidden>↺ Попросить повтор</button>'+
'<section class="t8-screen t8-ask" id="t8-ask" hidden><p class="t8-eyebrow">ЗАПИСЬ ПРОСМОТРЕНА</p><h1>Капитан вводит код</h1><p class="t8-note">Обсуждайте цифры вместе: четыре ячейки, порядок — пробирка, бейдж, часы, сектор. Не забудьте плакат на стене — он понадобится в финале.</p></section>'+
'<section class="t8-code" id="t8-code" hidden>'+
'<p class="t8-code-title">Код Ядра</p>'+
'<div class="t8-cells" id="t8-cells"></div>'+
'<div class="t8-pad" id="t8-pad"></div>'+
'<div class="t8-actions"><button class="t8-secondary" id="t8-del" type="button">Удалить</button><button class="t8-primary" id="t8-check" type="button">Проверить</button><button class="t8-secondary" id="t8-again" type="button">↺ Посмотреть ещё раз</button></div>'+
'<button class="t8-fix" id="t8-fix" type="button" hidden>Исправить код</button>'+
'<p class="t8-err" id="t8-err" hidden>Код не принят. Пересмотрите запись.</p>'+
'<div class="t8-hint" id="t8-hint" hidden><b id="t8-hint-label">Подсказка</b><span id="t8-hint-text"></span></div>'+
'</section>'+
'<section class="t8-screen t8-done" id="t8-done" hidden><p class="t8-eyebrow">КОД ПРИНЯТ</p><h1>Код верный. Запомните его!</h1><p class="t8-note">Плакат в записи — протокол запуска. Он понадобится в финале. Дальше — зарядка Стабилизатора; это задание появится в следующем обновлении.</p></section>'+
'<div class="t8-status" id="t8-status" role="status" hidden></div>'+
'<button class="t8-primary t8-mediabtn" id="t8-media" type="button" hidden></button>'+
'<p class="t8-build">Сборка '+BUILD+'</p>';
container.appendChild(root);
video=root.querySelector('.t8-video');bg=root.querySelector('.t8-bg');
els={wait:root.querySelector('.t8-wait'),start:root.querySelector('#t8-start'),waitnote:root.querySelector('#t8-waitnote'),
ready:root.querySelector('#t8-ready'),show:root.querySelector('#t8-show'),readynote:root.querySelector('#t8-readynote'),
controls:root.querySelector('#t8-controls'),toggle:root.querySelector('#t8-toggle'),restart:root.querySelector('#t8-restart'),
sound:root.querySelector('#t8-sound'),request:root.querySelector('#t8-request'),ask:root.querySelector('#t8-ask'),
code:root.querySelector('#t8-code'),cells:root.querySelector('#t8-cells'),pad:root.querySelector('#t8-pad'),
del:root.querySelector('#t8-del'),check:root.querySelector('#t8-check'),again:root.querySelector('#t8-again'),
fix:root.querySelector('#t8-fix'),err:root.querySelector('#t8-err'),hint:root.querySelector('#t8-hint'),
hintLabel:root.querySelector('#t8-hint-label'),hintText:root.querySelector('#t8-hint-text'),
done:root.querySelector('#t8-done'),status:root.querySelector('#t8-status'),media:root.querySelector('#t8-media')};
els.start.addEventListener('click',startIntro);
els.show.addEventListener('click',startView);
els.sound.addEventListener('click',toggleSound);
els.toggle.addEventListener('click',togglePlay);
els.restart.addEventListener('click',restartView);
els.request.addEventListener('click',requestReplay);
els.del.addEventListener('click',removeDigit);
els.check.addEventListener('click',submitCode);
els.again.addEventListener('click',watchAgain);
els.fix.addEventListener('click',function(){padOpen=true;errShown=false;render();});
els.pad.addEventListener('click',onPadClick);
root.addEventListener('pointerdown',function(){
if(!active||!task)return;
const st=task.stage||'';
if(st==='code'||st==='done')startMusic();
},true);
try{bg.play().catch(function(){});}catch(e){}
if(bg)bg.onerror=function(){if(bg)bg.style.display='none';};
try{offRef=db().ref('.info/serverTimeOffset');offRef.on('value',function(s){tOff=+s.val()||0;});}catch(e){offRef=null;}
roomOff=NET.onRoom(onRoom);
tickTimer=setInterval(tick,500);
}
function unmount(){
active=false;clearMedia();stopMedia();stopMusic();
if(startTimer){clearTimeout(startTimer);startTimer=null;}
if(offRef){try{offRef.off();}catch(e){}offRef=null;}
if(tickTimer){clearInterval(tickTimer);tickTimer=null;}
if(typeof roomOff==='function')roomOff();roomOff=null;
if(bg){try{bg.pause();}catch(e){}try{bg.removeAttribute('src');bg.load();}catch(e){}bg=null;}
if(root&&root.parentNode)root.parentNode.removeChild(root);
root=null;video=null;bg=null;els={};roomState=null;task=null;mediaKey='';pbKey='';resKey='';draft='';padOpen=true;errShown=false;advancing=false;autoStarted=false;curSrc='';
}
function status(text){
if(!els.status)return '';
if(text===undefined)return els.status.textContent||'';
els.status.textContent=text||'';els.status.hidden=!text;return '';
}
function onRoom(room){if(!active||!room)return;roomState=room;task=(room.tasks&&room.tasks.task08)||{stage:'wait'};render();coordinate();}
// ——— стадии ———
function startIntro(){
if(!cap()||!task||(task.stage||'wait')!=='wait')return;
if(els.start)els.start.disabled=true;
write({stage:'intro',startsAt:now(),playbackId:1,playing:true,pausedAt:0,introDone:false,fullViewed:false,codeDraft:'',attempts:0,hintLevel:0,codeAccepted:false,completedAt:0})
.catch(function(){if(els.start)els.start.disabled=false;});
}
function introDone(){
if(!cap()||!task||task.stage!=='intro'||task.introDone)return;
write({introDone:true,playing:false,pausedAt:0}).catch(function(){});
}
function startView(){
if(!cap()||!task||task.stage!=='intro'||!task.introDone)return;
if(els.show)els.show.disabled=true;
write({stage:'view',startsAt:now()+800,playbackId:(+task.playbackId||0)+1,playing:true,pausedAt:0,replayClearedAt:Date.now()})
.catch(function(){if(els.show)els.show.disabled=false;});
}
function viewDone(){
if(!cap()||!task||task.stage!=='view'||advancing)return;
advancing=true;
draft='';padOpen=true;errShown=false;
write({stage:'code',fullViewed:true,playing:false,pausedAt:0,codeDraft:'',attempts:0,hintLevel:0})
.catch(function(){}).then(function(){advancing=false;},function(){advancing=false;});
}
function toggleSound(){
if(!cap()||!video||!task)return;
const st=task.stage||'';
if(st!=='intro'&&st!=='view')return;
if(video.muted){
video.muted=false;
try{video.play().catch(function(){});}catch(e){}
if(st==='intro'&&!task.introDone){
// инструкция начинается заново: начало не теряется и запись идёт одинаково у всех
try{video.currentTime=0;}catch(e){}
write({playbackId:(+task.playbackId||0)+1,startsAt:now()+400,playing:true,pausedAt:0}).catch(function(){});
}
status('Звук включён.');
setTimeout(function(){if(active&&status()==='Звук включён.')status('');},3000);
}else{
video.muted=true;
status('Звук выключен.');
setTimeout(function(){if(active&&status()==='Звук выключен.')status('');},3000);
}
render();
}
function togglePlay(){
if(!cap()||!task||task.stage!=='view'||!video)return;
if(video.paused){video.play().catch(function(){});write({playing:true,startsAt:now(),pausedAt:video.currentTime||0}).catch(function(){});}
else{video.pause();write({playing:false,pausedAt:video.currentTime||0}).catch(function(){});}
}
function restartView(){
if(!cap()||!task||task.stage!=='view'||!video)return;
try{video.currentTime=0;video.play().catch(function(){});}catch(e){}
write({playing:true,startsAt:now()+400,pausedAt:0,playbackId:(+task.playbackId||0)+1,replayClearedAt:Date.now()}).catch(function(){});
}
function requestReplay(){
if(!task||cap())return;
const u=uid();if(!u)return;
db().ref('rooms/'+NET.room.code+'/tasks/task08/requests/'+u).set({at:Date.now()}).then(function(){
status('Просьба отправлена капитану: он вернёт запись в начало.');
setTimeout(function(){if(active)status('');},4000);
}).catch(error);
}
// ——— код ———
function onPadClick(e){
if(!cap()||!task||task.stage!=='code'||!padOpen)return;
const b=e.target&&e.target.closest?e.target.closest('.t8-key'):null;
if(!b)return;
const d=b.getAttribute('data-d');if(!d)return;
if(draft.length>=4)return;
draft+=d;
errShown=false;
playSfx('sfx_ui_click.mp3',.4);
write({codeDraft:draft}).catch(function(){});
render();
}
function removeDigit(){
if(!cap()||!task||task.stage!=='code')return;
if(!draft.length)return;
draft=draft.slice(0,-1);
errShown=false;
write({codeDraft:draft}).catch(function(){});
render();
}
function submitCode(){
if(!cap()||!task||task.stage!=='code')return;
if(Date.now()-lastSubmit<700)return;
if(draft.length!==4)return;
lastSubmit=Date.now();
if(draft===CODE){
padOpen=false;errShown=false;
write({codeAccepted:true,stage:'done',completedAt:Date.now(),hintLevel:0,codeDraft:draft}).catch(function(){});
playSfx('sfx_crystal_ready.mp3',.6);
}else{
const at=(+task.attempts||0)+1;
const lvl=at>=6?3:(at>=4?2:(at>=2?1:0));
padOpen=false;errShown=true;
write({attempts:at,hintLevel:Math.max(lvl,+task.hintLevel||0)}).catch(function(){});
playSfx('sfx_ui_error.mp3',.5);
render();
}
}
function watchAgain(){
if(!cap()||!task||task.stage!=='code')return;
errShown=false;
write({stage:'view',startsAt:now()+800,playbackId:(+task.playbackId||0)+1,playing:true,pausedAt:0,replayClearedAt:Date.now()}).catch(function(){});
}
// ——— отрисовка ———
function render(){
if(!root||!task)return;
const stage=task.stage||'wait',c=cap();
root.className=c?'iscap':'';
const introVideo=(stage==='intro')&&!task.introDone;
const inReady=(stage==='intro')&&!!task.introDone;
const inView=stage==='view',inCode=stage==='code',inDone=stage==='done';
els.wait.hidden=stage!=='wait';
els.start.hidden=!c;els.waitnote.hidden=c;
els.ready.hidden=!inReady;
els.show.hidden=!c;els.readynote.hidden=c;
if(video){
video.hidden=!(introVideo||inView);
if(!introVideo&&!inView){try{if(!video.paused)video.pause();}catch(e){}}
}
els.controls.hidden=!(c&&inView);
els.sound.hidden=!(c&&(introVideo||inView));
els.sound.textContent=(video&&!video.muted)?'♪ Выключить звук':'♪ Включить звук';
els.request.hidden=!(inView&&!c);
els.ask.hidden=!(inCode&&!c);
const showCode=inCode&&c&&!!task.fullViewed;
els.code.hidden=!showCode;
els.done.hidden=!inDone;
if(showCode)renderCode(c);
els.toggle.textContent=(video&&video.paused)?'▶ Играть':'⏸ Пауза';
// Капитан видит просьбу о повторе.
if(c&&inView){
const req=task.requests||{},cleared=+task.replayClearedAt||0;let asked=0;
for(const k in req){if(req[k]&&+req[k].at>cleared)asked=Math.max(asked,+req[k].at||0);}
if(asked&&!task.playing){status('Команда просит вернуть запись в начало.');els.restart.classList.add('t8-on');}
else{els.restart.classList.remove('t8-on');if(status()==='Команда просит вернуть запись в начало.')status('');}
}
if(inDone){const rk='done';if(rk!==resKey){resKey=rk;playSfx('sfx_crystal_ready.mp3',.4);}}
// Звук остаётся только у капитана и только если он сам включил его кнопкой.
if(video&&!c&&!video.muted)video.muted=true;
stopMusic();
if(stage==='code'||stage==='done')startMusic();
}
function renderCode(c){
const cur=draft||String(task.codeDraft||'');
draft=cur.slice(0,4);
let h='';
for(let i=0;i<4;i++){
const d=draft.charAt(i);
h+='<span class="t8-cell'+(d?' filled':'')+'">'+(d?esc(d):'')+'</span>';
}
if(els.cells.innerHTML!==h)els.cells.innerHTML=h;
if(els.pad.childElementCount!==9){
let p='';
for(let i=1;i<=9;i++)p+='<button class="t8-key" type="button" data-d="'+i+'">'+i+'</button>';
els.pad.innerHTML=p;
}
els.pad.hidden=!padOpen;
els.check.disabled=!(draft.length===4&&padOpen);
els.check.textContent=(+task.attempts>0)?'Проверить снова':'Проверить';
els.fix.hidden=padOpen;
els.err.hidden=!errShown;
const lvl=Math.min(3,+task.hintLevel||0);
els.hint.hidden=!(lvl>0);
if(lvl>0){els.hintLabel.textContent='Подсказка '+lvl;els.hintText.textContent=HINT[lvl];}
}
// ——— видео ———
function clearWd(){if(wdTimer){clearTimeout(wdTimer);wdTimer=null;}}
function clearMedia(){if(mediaTimer){clearTimeout(mediaTimer);mediaTimer=null;}}
function stopMedia(){
clearWd();clearMedia();
if(startTimer){clearTimeout(startTimer);startTimer=null;}
if(!video)return;
mediaKey='';
video.onloadeddata=null;video.oncanplay=null;video.onerror=null;video.onended=null;
try{video.pause();}catch(e){}
hideMediaBtn();
}
function hideMediaBtn(){if(els.media){els.media.hidden=true;els.media.onclick=null;}}
function showMediaBtn(text,fn){if(!els.media)return;els.media.hidden=false;els.media.textContent=text;els.media.onclick=function(ev){if(ev&&ev.stopPropagation)ev.stopPropagation();hideMediaBtn();if(!active)return;fn();};}
function loadMedia(stage){
if(!video)return;
stopMedia();
const src=stage==='intro'?SRC_INTRO:SRC_VIEW;
const reuse=(curSrc===src&&video.readyState>=1&&!video.error);
mediaKey=stage;pbKey='';
// Всегда без звука: только так телефон запускает ролик без касания. Звук включает капитан кнопкой.
video.muted=true;
video.defaultMuted=true;
video.setAttribute('muted','');
if(reuse){
try{video.currentTime=(stage==='view')?(+task.pausedAt||0):0;}catch(e){}
video.onended=onVideoEnded;
playWhenReady();
return;
}
curSrc=src;
video.src=src;
video.load();
video.onloadeddata=function(){
if(!active||mediaKey!==stage)return;
clearWd();mediaRetries=0;
try{video.currentTime=(stage==='view')?(+task.pausedAt||0):0;}catch(e){}
playWhenReady();
};
video.onerror=function(){
if(!active||mediaKey!==stage||!video)return;
clearMedia();
if((+mediaRetries||0)<3){
mediaRetries=(+mediaRetries||0)+1;
status('Ролик не загрузился, пробуем ещё раз… (попытка '+mediaRetries+')');
mediaTimer=setTimeout(function(){mediaTimer=null;if(!active||mediaKey!==stage||!video)return;try{video.src=src;video.load();}catch(e){}},1500);
return;
}
status('Ролик не загрузился. Проверьте связь и нажмите кнопку.');
if(cap())showMediaBtn('▶ Запустить видео',function(){mediaRetries=0;try{video.src=src;video.load();}catch(e){}});
};
video.onended=onVideoEnded;
// Сторож НЕ перезапускает загрузку: большой файл на телефоне грузится долго, а повторное
// назначение src обрывало нормальную загрузку. Только сообщение и кнопка на крайний случай.
clearWd();
wdTimer=setTimeout(function(){
wdTimer=null;
if(!active||mediaKey!==stage||!video)return;
if(video.readyState>=2)return;
status('Ролик грузится. Подождите…');
if(cap())showMediaBtn('▶ Запустить видео',function(){mediaRetries=0;try{video.src=src;video.load();}catch(e){}});
},45000);
}
function onVideoEnded(){
if(!active||!task||!video)return;
if(cap()&&task.stage==='intro'){introDone();return;}
if(cap()&&task.stage==='view'){viewDone();}
}
function sharedDelay(){
const at=+task.startsAt||0;
if(!at)return 0;
const d=at-now();
return (d>0&&d<15000)?d:0;
}
function playWhenReady(){if(!video||!active)return;hideMediaBtn();schedulePlay();}
function schedulePlay(){
if(!video||!active)return;
const d=sharedDelay();
if(d>120){
if(startTimer)clearTimeout(startTimer);
startTimer=setTimeout(function(){startTimer=null;if(!active)return;playNow();},d);
return;
}
playNow();
}
function playNow(){
if(!video||!active)return;
const p=video.play();
if(!p||!p.then){hideMediaBtn();return;}
p.then(function(){if(active)hideMediaBtn();},function(){
if(!active||!video)return;
video.muted=true;
video.play().catch(function(){});
});
}
function coordinate(){
if(!task||!video)return;
const stage=task.stage||'wait';
const needMedia=((stage==='intro')&&!task.introDone)||stage==='view';
if(needMedia&&mediaKey!==stage){mediaRetries=0;loadMedia(stage);return;}
const c=cap();
if(stage==='view'){
const pb=String(+task.playbackId||0);
if(pb!==pbKey){
pbKey=pb;
try{video.currentTime=(+task.pausedAt||0);}catch(e){}
if(task.playing)schedulePlay();
}
if(!c){
// Время по сети не подгоняем (решение автора): только пауза и продолжение, без перемотки.
if(task.playing){if(video.paused&&video.readyState>=2)video.play().catch(function(){});}
else{if(!video.paused)try{video.pause();}catch(e){}}
}else{
els.toggle.textContent=video.paused?'▶ Играть':'⏸ Пауза';
// Полный просмотр: доигрывание до конца, а не одиночная перемотка к последнему кадру.
if(video.ended||(video.duration&&video.currentTime>=video.duration-0.6))viewDone();
}
}
if(stage==='intro'&&c&&!task.introDone){
const t0=+task.startsAt||0;
if(video.duration&&video.currentTime>=video.duration-0.4)introDone();
else if(t0&&now()-t0>180000)introDone();
}
if(video&&!c&&!video.muted)video.muted=true;
}
function tick(){
if(!active||!task)return;
const stage=task.stage||'wait';
// Восьмое задание начинается сразу с инструкции Вольта, без текстового экрана.
if(stage==='wait'&&cap()&&!autoStarted){
autoStarted=true;
setTimeout(function(){if(active&&task&&(task.stage||'wait')==='wait')startIntro();},400);
}
render();coordinate();
if(!cap())return;
if(stage==='wait'&&els.start)els.start.disabled=false;
}
return{mount:mount,unmount:unmount,BUILD:BUILD};
})();
