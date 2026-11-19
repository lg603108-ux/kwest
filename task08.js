// task08.js — задание 8 «Место искажения».
// Устройство начала и порядок запуска видео скопированы у работающих заданий 3–5
// (scheduleMedia: src → muted=!cap() → ждём первый кадр → play(), при отказе браузера один
// повтор без звука, сторож не перекачивает файл). Никаких новых кнопок поверх видео нет.
// Стадии: intro (инструкция Вольта) → view (запись камер) → code (ввод кода) → done.
window.Task08=(function(){
const CODE='3971';
const HINT=['','Ищите цифры в порядке: пробирка, бейдж, часы, сектор.','На часах нужна именно цифра часа — сколько часов показывают стрелки.','Код — 3971. Запомните его для финала.'];
const BUILD='0343a';
const SRC_INTRO='assets/v08_intro.mp4?v=0343a';   // 16 МБ (сжатый файл автора, 19.11)
const SRC_VIEW='assets/lab_cctv.mp4?v=0343a';     // 6,9 МБ (сжатый файл автора, 19.11)
let active=false,root=null,video=null,els={},roomState=null,task=null,roomOff=null;
let tickTimer=null,startTimer=null,watchdogTimer=null,mediaKey='',mediaRetries=0,pbKey='',resKey='',stageKey='';
let tOff=0,offRef=null,endedLocal=false;
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
active=true;mediaKey='';mediaRetries=0;pbKey='';resKey='';stageKey='';endedLocal=false;
draft='';padOpen=true;errShown=false;lastSubmit=0;
stopMedia();stopMusic();
try{if(window.__stopQuestAudio)window.__stopQuestAudio();}catch(e){}
// Тишина при смене задания наводится на каждом устройстве (правило проекта):
// ролики пролога и улицы гасим сами, а не надеемся на мост.
['movie','street'].forEach(function(id){var v=document.getElementById(id);if(!v)return;try{v.pause();v.muted=true;}catch(e){}});
root=document.createElement('div');root.id='t8';root.innerHTML=
'<video class="t8-video" playsinline preload="auto" hidden></video>'+
'<section class="t8-screen t8-wait"><p class="t8-eyebrow">ЗАДАНИЕ 8</p><h1>Место искажения</h1>'+
'<button id="t8-start" class="t8-primary" type="button">▶ Включить инструкцию</button>'+
'<p class="t8-note" id="t8-waitnote">Ждём, когда капитан запустит инструкцию…</p></section>'+
'<section class="t8-screen t8-ready" id="t8-ready" hidden><p class="t8-eyebrow">ИНСТРУКЦИЯ ПРОСМОТРЕНА</p><h1>Мы у места первого прорыва</h1>'+
'<p class="t8-note">Здесь осталась запись камер. Смотрите её вместе: в записи четыре цифры кода и плакат на стене с протоколом запуска — его нужно запомнить для финала.</p>'+
'<button id="t8-show" class="t8-primary" type="button">▶ Показать запись команде</button>'+
'<p class="t8-note" id="t8-readynote">Ждём капитана: он включит запись.</p></section>'+
'<div class="t8-controls" id="t8-controls" hidden><button id="t8-toggle" type="button">⏸ Пауза</button><button id="t8-restart" type="button">↺ В начало</button></div>'+
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
video=root.querySelector('.t8-video');
els={wait:root.querySelector('.t8-wait'),start:root.querySelector('#t8-start'),waitnote:root.querySelector('#t8-waitnote'),
ready:root.querySelector('#t8-ready'),show:root.querySelector('#t8-show'),readynote:root.querySelector('#t8-readynote'),
controls:root.querySelector('#t8-controls'),toggle:root.querySelector('#t8-toggle'),restart:root.querySelector('#t8-restart'),
request:root.querySelector('#t8-request'),ask:root.querySelector('#t8-ask'),
code:root.querySelector('#t8-code'),cells:root.querySelector('#t8-cells'),pad:root.querySelector('#t8-pad'),
del:root.querySelector('#t8-del'),check:root.querySelector('#t8-check'),again:root.querySelector('#t8-again'),
fix:root.querySelector('#t8-fix'),err:root.querySelector('#t8-err'),hint:root.querySelector('#t8-hint'),
hintLabel:root.querySelector('#t8-hint-label'),hintText:root.querySelector('#t8-hint-text'),
done:root.querySelector('#t8-done'),status:root.querySelector('#t8-status'),media:root.querySelector('#t8-media')};
els.start.addEventListener('click',startIntro);
els.show.addEventListener('click',startView);
els.toggle.addEventListener('click',togglePlay);
els.restart.addEventListener('click',restartView);
els.request.addEventListener('click',requestReplay);
els.del.addEventListener('click',removeDigit);
els.check.addEventListener('click',submitCode);
els.again.addEventListener('click',watchAgain);
els.fix.addEventListener('click',function(){padOpen=true;errShown=false;render();});
els.pad.addEventListener('click',onPadClick);
try{offRef=db().ref('.info/serverTimeOffset');offRef.on('value',function(s){tOff=+s.val()||0;});}catch(e){offRef=null;}
roomOff=NET.onRoom(onRoom);
tickTimer=setInterval(tick,500);
}
function unmount(){
active=false;stopMedia();stopMusic();
if(startTimer){clearTimeout(startTimer);startTimer=null;}
if(offRef){try{offRef.off();}catch(e){}offRef=null;}
if(tickTimer){clearInterval(tickTimer);tickTimer=null;}
if(typeof roomOff==='function')roomOff();roomOff=null;
if(video){try{video.pause();video.removeAttribute('src');video.load();}catch(e){}}
if(root&&root.parentNode)root.parentNode.removeChild(root);
root=null;video=null;els={};roomState=null;task=null;mediaKey='';pbKey='';resKey='';stageKey='';draft='';padOpen=true;errShown=false;endedLocal=false;
}
function status(text){
if(!els.status)return '';
if(text===undefined)return els.status.textContent||'';
els.status.textContent=text||'';els.status.hidden=!text;return '';
}
function onRoom(room){if(!active||!room)return;roomState=room;task=(room.tasks&&room.tasks.task08)||{stage:'wait'};coordinate();render();}
// ——— стадии ———
function startIntro(){
if(!cap()||!task||(task.stage||'wait')!=='wait')return;
if(els.start)els.start.disabled=true;
write({stage:'intro',startsAt:now()+1200,playbackId:1,playing:true,pausedAt:0,fullViewed:false,codeDraft:'',attempts:0,hintLevel:0,codeAccepted:false,completedAt:0})
.catch(function(){if(els.start)els.start.disabled=false;});
}
function startView(){
if(!cap()||!task||task.stage!=='intro')return;
if(els.show)els.show.disabled=true;
write({stage:'view',startsAt:now()+1200,playbackId:(+task.playbackId||0)+1,playing:true,pausedAt:0,replayClearedAt:Date.now()})
.catch(function(){if(els.show)els.show.disabled=false;});
}
function viewDone(){
if(!cap()||!task||task.stage!=='view')return;
draft='';padOpen=true;errShown=false;
write({stage:'code',fullViewed:true,playing:false,pausedAt:0,codeDraft:'',attempts:0,hintLevel:0}).catch(function(){});
}
function togglePlay(){
if(!cap()||!task||task.stage!=='view'||!video)return;
if(video.paused){video.play().catch(function(){});write({playing:true,startsAt:now(),pausedAt:video.currentTime||0}).catch(function(){});}
else{video.pause();write({playing:false,pausedAt:video.currentTime||0}).catch(function(){});}
}
function restartView(){
if(!cap()||!task||task.stage!=='view'||!video)return;
try{video.currentTime=0;video.play().catch(function(){});}catch(e){}
write({playing:true,startsAt:now()+600,pausedAt:0,playbackId:(+task.playbackId||0)+1,replayClearedAt:Date.now()}).catch(function(){});
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
write({stage:'view',startsAt:now()+1200,playbackId:(+task.playbackId||0)+1,playing:true,pausedAt:0,replayClearedAt:Date.now()}).catch(function(){});
}
// ——— отрисовка ———
function render(){
if(!root||!task)return;
const stage=task.stage||'wait',c=cap();
root.className=c?'iscap':'';
const inIntro=stage==='intro',inView=stage==='view',inCode=stage==='code',inDone=stage==='done';
const introDone=inIntro&&endedLocal;
els.wait.hidden=stage!=='wait';
els.start.hidden=!c;els.waitnote.hidden=c;
els.ready.hidden=!introDone;
els.show.hidden=!(c&&introDone);els.readynote.hidden=c||!introDone;
if(video){
video.hidden=!((inIntro&&!endedLocal)||inView);
if(!(inIntro&&!endedLocal)&&!inView){try{if(!video.paused)video.pause();}catch(e){}}
}
els.controls.hidden=!(c&&inView);
els.request.hidden=!(inView&&!c);
els.ask.hidden=!(inCode&&!c);
const showCode=inCode&&c&&!!task.fullViewed;
els.code.hidden=!showCode;
els.done.hidden=!inDone;
if(showCode)renderCode();
els.toggle.textContent=(video&&video.paused)?'▶ Играть':'⏸ Пауза';
if(c&&inView){
const req=task.requests||{},cleared=+task.replayClearedAt||0;let asked=0;
for(const k in req){if(req[k]&&+req[k].at>cleared)asked=Math.max(asked,+req[k].at||0);}
if(asked&&!task.playing){status('Команда просит вернуть запись в начало.');els.restart.classList.add('t8-on');}
else{els.restart.classList.remove('t8-on');if(status()==='Команда просит вернуть запись в начало.')status('');}
}
if(inDone){const rk='done';if(rk!==resKey){resKey=rk;playSfx('sfx_crystal_ready.mp3',.4);}}
// Музыка только на этапах без видео (правило проекта), на роликах — тишина.
stopMusic();
if(inCode||inDone)startMusic();
}
function renderCode(){
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
// ——— видео: порядок запуска как в заданиях 3–5 ———
function clearWatchdog(){if(watchdogTimer){clearTimeout(watchdogTimer);watchdogTimer=null;}}
function stopMedia(){
clearWatchdog();
if(startTimer){clearTimeout(startTimer);startTimer=null;}
if(!video)return;
mediaKey='';
video.onloadedmetadata=null;video.onloadeddata=null;video.onended=null;video.onerror=null;video.onclick=null;
try{video.pause();}catch(e){}
hideMediaBtn();
}
function hideMediaBtn(){if(els.media){els.media.hidden=true;els.media.onclick=null;}}
function showMediaBtn(text,fn){if(!els.media)return;els.media.hidden=false;els.media.textContent=text;els.media.onclick=function(ev){if(ev&&ev.stopPropagation)ev.stopPropagation();hideMediaBtn();if(!active)return;fn();};}
function scheduleMedia(src,at,key){
stopMedia();mediaKey=key;mediaRetries=0;video.hidden=false;video.src=src;video.muted=!cap();
const beginPlay=function(){
if(!active||mediaKey!==key||!video)return;
const go=function(){
if(!active||mediaKey!==key||!video)return;
const p=video.play();
if(!p||!p.then){hideMediaBtn();return;}
p.then(function(){if(!active||mediaKey!==key)return;status('');hideMediaBtn();},function(){
if(!active||mediaKey!==key)return;
// Звук у капитана обязателен; если браузер не пустил со звуком — играем без него,
// но ролик обязательно показывается. Кнопок поверх видео не выводим.
video.muted=true;
video.play().catch(function(){});
status('');
});
};
// Ждём первый кадр: иначе на телефоне остаётся чёрный экран, пока файл догружается.
if(video.readyState>=2){go();return;}
let fired=false;
const once=function(){if(fired)return;fired=true;video.removeEventListener('loadeddata',once);go();};
video.addEventListener('loadeddata',once);
setTimeout(function(){if(fired)return;fired=true;video.removeEventListener('loadeddata',once);go();},4000);
};
video.onloadedmetadata=function(){
const offset=Math.max(0,(Date.now()-at)/1000);
if(offset>0.5&&video.duration)try{video.currentTime=Math.min(offset,Math.max(0,video.duration-0.1));}catch(e){}
scheduleWatchdog(at,key);
};
video.onerror=function(){
if(!active||mediaKey!==key||!video)return;
if(mediaRetries<2){mediaRetries++;status('Повторная загрузка видео…');setTimeout(function(){if(!active||mediaKey!==key||!video)return;try{video.src=src;video.load();}catch(e){}beginPlay();},1500);return;}
status('Видео не загрузилось. Проверьте соединение.');
if(cap())showMediaBtn('Продолжить без видео →',function(){if(task&&task.stage==='intro')startView();else if(task&&task.stage==='view')viewDone();});
};
video.onended=function(){if(!active||mediaKey!==key)return;mediaFinished();};
video.onclick=function(){beginPlay();};
const delay=at-now();
if(delay>100){status('Видео начнётся одновременно у всех…');startTimer=setTimeout(function(){startTimer=null;if(!active)return;beginPlay();},delay);}
else beginPlay();
}
function scheduleWatchdog(at,key){
clearWatchdog();
// Инструкция не обрывается таймером: капитан сам нажимает «Показать запись команде».
// Сторож следит только за записью: если первого кадра нет ~20 с, сообщаем и даём кнопку.
if(!cap())return;
if(task&&task.stage!=='view')return;
watchdogTimer=setTimeout(function(){
watchdogTimer=null;
if(!active||mediaKey!==key||!cap()||!task)return;
if(task.stage!=='view')return;
if(video&&video.readyState>=2)return;
status('Запись грузится. Подождите…');
showMediaBtn('Продолжить без видео →',function(){if(task&&task.stage==='view')viewDone();});
},20000);
}
function mediaFinished(){
if(!cap()||!task)return;
if(task.stage==='intro'){endedLocal=true;render();return;}
if(task.stage==='view'){viewDone();}
}
function coordinate(){
if(!task||!video)return;
const stage=task.stage||'wait';
if(stage==='intro'){
if(mediaKey!=='intro'){endedLocal=false;pbKey='';scheduleMedia(SRC_INTRO,+task.startsAt||0,'intro');}
}
else if(stage==='view'){
if(mediaKey!=='view'){endedLocal=false;pbKey=String(+task.playbackId||0);scheduleMedia(SRC_VIEW,+task.startsAt||0,'view');}
else{
const pb=String(+task.playbackId||0);
if(pb!==pbKey){
pbKey=pb;
// Повтор — из уже загруженного файла: только с начала, без перекачки (правило проекта).
try{video.currentTime=(+task.pausedAt||0);}catch(e){}
if(task.playing)video.play().catch(function(){});
}
const c=cap();
if(!c){
if(task.playing){if(video.paused&&video.readyState>=2)video.play().catch(function(){});}
else{if(!video.paused)try{video.pause();}catch(e){}}
}else{
els.toggle.textContent=video.paused?'▶ Играть':'⏸ Пауза';
if(video.ended)viewDone();
}
}
}
if(video&&!cap()&&!video.muted)video.muted=true;
}
function tick(){
if(!active||!task)return;
coordinate();render();
}
return{mount:mount,unmount:unmount,BUILD:BUILD};
})();
