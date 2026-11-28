// task08.js — задание 8 «Место искажения».
// Запуск ролика сделан дословно по заданию 5 (оно работает на телефонах): muted только у
// не-капитана, play() сразу после src, при отказе браузера — один повтор без звука и кнопка
// «Нажмите, чтобы включить звук» (только у капитана и только когда картинка уже идёт).
// Стадии: intro (инструкция Вольта) → view (запись камер) → code (ввод кода) → done.
window.Task08=(function(){
const CODE='3971';
const HINT=['','Ищите цифры в порядке: пробирка, бейдж, часы, сектор.','На часах нужна именно цифра часа — сколько часов показывают стрелки.','Код — 3971. Запомните его для финала.'];
const BUILD='0352a';
const SRC_INTRO='assets/v08_intro.mp4?v=0344a';   // 16 МБ
const SRC_VIEW='assets/lab_cctv.mp4?v=0344a';     // 6,9 МБ
let active=false,root=null,video=null,els={},roomState=null,task=null,roomOff=null;
let tickTimer=null,startTimer=null,mediaKey='',mediaRetries=0,pbKey='',resKey='',stageKey='';
let tOff=0,offRef=null,endedLocal=false;
// Слоты кода: можно менять любую цифру в любой момент, пока открыт экран ввода.
let slots=['','','',''],pos=0,errShown=false,localHint=0,lastSubmit=0;
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
function filled(){return slots[0]&&slots[1]&&slots[2]&&slots[3];}
function draftStr(){return slots.join('');}
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
slots=['','','',''];pos=0;errShown=false;localHint=0;lastSubmit=0;
stopMedia();stopMusic();
try{if(window.__stopQuestAudio)window.__stopQuestAudio();}catch(e){}
['movie','street'].forEach(function(id){var v=document.getElementById(id);if(!v)return;try{v.pause();v.muted=true;}catch(e){}});
root=document.createElement('div');root.id='t8';root.innerHTML=
'<video class="t8-video" playsinline preload="auto"></video>'+
'<section class="t8-screen t8-wait"><h1>Место искажения</h1>'+
'<button id="t8-start" class="t8-primary" type="button">▶ Включить инструкцию</button>'+
'<p class="t8-note" id="t8-waitnote">Ждём, когда капитан запустит инструкцию…</p></section>'+
'<section class="t8-screen t8-ready" id="t8-ready" hidden>'+
'<button id="t8-show" class="t8-primary" type="button">▶ Показать запись команде</button>'+
'<p class="t8-note" id="t8-readynote" hidden>Ждём капитана: он включит запись.</p></section>'+
'<div class="t8-controls" id="t8-controls" hidden><button id="t8-toggle" type="button">⏸ Пауза</button><button id="t8-restart" type="button">↺ В начало</button></div>'+
'<button class="t8-replay" id="t8-request" type="button" hidden>↺ Попросить повтор</button>'+
'<section class="t8-screen t8-ask" id="t8-ask" hidden><p class="t8-eyebrow">ЗАПИСЬ ПРОСМОТРЕНА</p><h1>Капитан вводит код</h1><p class="t8-note" id="t8-asknote">Обсуждайте цифры вместе: четыре ячейки, порядок — пробирка, бейдж, часы, сектор. Не забудьте плакат на стене — он понадобится в финале.</p><p class="t8-note t8-caps" id="t8-askplayer" hidden>ПОДСКАЗЫВАЙТЕ КАПИТАНУ</p><p class="t8-draft" id="t8-draft" hidden></p></section>'+
'<section class="t8-code" id="t8-code" hidden>'+
'<p class="t8-code-title">Код Ядра</p>'+
'<div class="t8-cells" id="t8-cells"></div>'+
'<div class="t8-pad" id="t8-pad"></div>'+
'<div class="t8-actions"><button class="t8-secondary" id="t8-del" type="button">Удалить</button><button class="t8-primary" id="t8-check" type="button">Проверить</button><button class="t8-secondary" id="t8-again" type="button">↺ Посмотреть ещё раз</button></div>'+
'<p class="t8-err" id="t8-err" hidden>Код не принят. Пересмотрите запись.</p>'+
'<div class="t8-hint" id="t8-hint" hidden><b id="t8-hint-label">Подсказка</b><span id="t8-hint-text"></span></div>'+
'</section>'+
'<section class="t8-screen t8-done" id="t8-done" hidden><p class="t8-eyebrow">КОД ПРИНЯТ</p><h1>3971 — запомните его</h1>'+
'<div id="t8-quiz"><p class="t8-note">Верно ли Лум нажал кнопки протокола запуска?</p>'+
'<div class="t8-actions"><button class="t8-primary" id="t8-quiz-yes" type="button">Да</button><button class="t8-secondary" id="t8-quiz-no" type="button">Нет</button></div>'+
'<p class="t8-note t8-caps" id="t8-quizcap" hidden>ОТВЕЧАЕТ КАПИТАН</p></div>'+
'<div id="t8-protocol" hidden><p class="t8-note t8-caps">ВЕРНЫЙ ПРОТОКОЛ НА ПЛАКАТЕ!</p>'+
'<button id="t8-watchagain" class="t8-secondary" type="button">↺ Пересмотреть видео</button>'+
'<p class="t8-note t8-caps">ЗАПОМНИТЕ ВЕРНЫЙ ПРОТОКОЛ!</p>'+
'<button id="t8-continue" class="t8-primary" type="button">Продолжить квест →</button></div></section>'+
'<div class="t8-replaywrap" id="t8-replaywrap" hidden><video class="t8-replayvid" id="t8-replayvid" playsinline preload="auto"></video><button class="t8-secondary t8-replayclose" id="t8-replayclose" type="button">✕ Закрыть</button></div>'+
'<div class="t8-status" id="t8-status" role="status" hidden></div>'+
'<button class="t8-primary t8-mediabtn" id="t8-media" type="button" hidden></button>'+
'';
container.appendChild(root);
video=root.querySelector('.t8-video');
els={wait:root.querySelector('.t8-wait'),start:root.querySelector('#t8-start'),waitnote:root.querySelector('#t8-waitnote'),
ready:root.querySelector('#t8-ready'),show:root.querySelector('#t8-show'),readynote:root.querySelector('#t8-readynote'),
controls:root.querySelector('#t8-controls'),toggle:root.querySelector('#t8-toggle'),restart:root.querySelector('#t8-restart'),
request:root.querySelector('#t8-request'),ask:root.querySelector('#t8-ask'),draft:root.querySelector('#t8-draft'),
code:root.querySelector('#t8-code'),cells:root.querySelector('#t8-cells'),pad:root.querySelector('#t8-pad'),
del:root.querySelector('#t8-del'),check:root.querySelector('#t8-check'),again:root.querySelector('#t8-again'),
err:root.querySelector('#t8-err'),hint:root.querySelector('#t8-hint'),
hintLabel:root.querySelector('#t8-hint-label'),hintText:root.querySelector('#t8-hint-text'),
asknote:root.querySelector('#t8-asknote'),askplayer:root.querySelector('#t8-askplayer'),done:root.querySelector('#t8-done'),status:root.querySelector('#t8-status'),media:root.querySelector('#t8-media'),quiz:root.querySelector('#t8-quiz'),protocol:root.querySelector('#t8-protocol'),quizYes:root.querySelector('#t8-quiz-yes'),quizNo:root.querySelector('#t8-quiz-no'),quizcap:root.querySelector('#t8-quizcap'),
watchagain:root.querySelector('#t8-watchagain'),donenote:root.querySelector('#t8-donenote'),cont:root.querySelector('#t8-continue'),
replaywrap:root.querySelector('#t8-replaywrap'),replayvid:root.querySelector('#t8-replayvid'),replayclose:root.querySelector('#t8-replayclose')};
els.start.addEventListener('click',startIntro);
els.watchagain.addEventListener('click',openReplay);
els.replayclose.addEventListener('click',closeReplay);
els.cont.addEventListener('click',continueTo9);
// На вопрос о том, верно ли Лум нажал кнопки, отвечает только капитан.
// «Да» — неверный ответ: даём сигнал ошибки и оставляем вопрос, чтобы поправить.
// «Нет» — верно, открываем протокол.
function answerProtocol(ok){
if(!cap())return;
if(!ok){
  playSfx('sfx_ui_error.mp3',.5);
  if(els.quizYes)els.quizYes.classList.add('t8-wrong');
  var note=root.querySelector('#t8-quiznote');
  if(!note&&els.quiz){note=document.createElement('p');note.id='t8-quiznote';note.className='t8-note t8-quiznote';els.quiz.appendChild(note);}
  if(note)note.textContent='Неверно. Посмотрите протокол на плакате и ответьте «Нет».';
    // сразу после неверного ответа даём возможность пересмотреть запись
    var rb=root.querySelector('#t8-quiz-replay');
    if(!rb&&els.quiz){rb=document.createElement('button');rb.id='t8-quiz-replay';rb.type='button';
      rb.className='t8-secondary t8-quizreplay';rb.textContent='↺ Пересмотреть видео';
      rb.addEventListener('click',openReplay);els.quiz.appendChild(rb);}
    if(rb)rb.hidden=false;
    return;
}
if(els.quizYes)els.quizYes.classList.remove('t8-wrong');
var old=root.querySelector('#t8-quiznote');if(old)old.textContent='';
playSfx('sfx_ui_click.mp3',.4);
if(els.quiz)els.quiz.hidden=true;if(els.protocol)els.protocol.hidden=false;
}
if(els.quizYes)els.quizYes.addEventListener('click',function(){answerProtocol(false);});
if(els.quizNo)els.quizNo.addEventListener('click',function(){answerProtocol(true);});
els.show.addEventListener('click',startView);
els.toggle.addEventListener('click',togglePlay);
els.restart.addEventListener('click',restartView);
els.request.addEventListener('click',requestReplay);
els.del.addEventListener('click',removeDigit);
els.check.addEventListener('click',submitCode);
els.again.addEventListener('click',watchAgain);
els.pad.addEventListener('click',onPadClick);
els.cells.addEventListener('click',onCellClick);
try{offRef=db().ref('.info/serverTimeOffset');offRef.on('value',function(s){tOff=+s.val()||0;});}catch(e){offRef=null;}
roomOff=NET.onRoom(onRoom);
tickTimer=setInterval(tick,500);
}
function unmount(){
active=false;stopMedia();stopMusic();closeReplay();
if(startTimer){clearTimeout(startTimer);startTimer=null;}
if(offRef){try{offRef.off();}catch(e){}offRef=null;}
if(tickTimer){clearInterval(tickTimer);tickTimer=null;}
if(typeof roomOff==='function')roomOff();roomOff=null;
if(video){try{video.pause();video.removeAttribute('src');video.load();}catch(e){}}
if(root&&root.parentNode)root.parentNode.removeChild(root);
root=null;video=null;els={};roomState=null;task=null;mediaKey='';pbKey='';resKey='';stageKey='';slots=['','','',''];pos=0;errShown=false;localHint=0;endedLocal=false;
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
slots=['','','',''];pos=0;errShown=false;localHint=0;
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
function onCellClick(e){
if(!cap()||!task||task.stage!=='code')return;
const b=e.target&&e.target.closest?e.target.closest('.t8-cell'):null;
if(!b)return;
const i=parseInt(b.getAttribute('data-i'),10);
if(isNaN(i))return;
pos=i;errShown=errShown;
render();
}
function onPadClick(e){
if(!cap()||!task||task.stage!=='code')return;
const b=e.target&&e.target.closest?e.target.closest('.t8-key'):null;
if(!b)return;
const d=b.getAttribute('data-d');if(!d)return;
const i=(pos>=0&&pos<4)?pos:0;
slots[i]=d;
pos=(i+1)%4;
errShown=false;
playSfx('sfx_ui_click.mp3',.4);
write({codeDraft:draftStr()}).catch(function(){});
render();
}
function removeDigit(){
if(!cap()||!task||task.stage!=='code')return;
let i=(pos>=0&&pos<4)?pos:3;
// если выбранная ячейка уже пуста — чистим предыдущую заполненную
if(!slots[i]){let k=-1;for(let j=3;j>=0;j--){if(slots[j]){k=j;break;}}if(k<0)return;i=k;}
slots[i]='';
pos=i;
errShown=false;
write({codeDraft:draftStr()}).catch(function(){});
render();
}
function submitCode(){
if(!cap()||!task||task.stage!=='code')return;
if(Date.now()-lastSubmit<700)return;
if(!filled())return;
lastSubmit=Date.now();
if(draftStr()===CODE){
write({codeAccepted:true,stage:'done',completedAt:Date.now(),hintLevel:0,codeDraft:draftStr()}).catch(function(){});
playSfx('sfx_crystal_ready.mp3',.6);
}else{
const at=(+task.attempts||0)+1;
const lvl=at>=6?3:(at>=4?2:(at>=2?1:0));
errShown=true;
localHint=Math.max(localHint,lvl);
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
// ——— финальный экран: пересмотр записи и переход к заданию 9 ———
function openReplay(){
if(!els.replaywrap||!els.replayvid)return;
els.replaywrap.hidden=false;
try{
els.replayvid.muted=!cap();
els.replayvid.src=SRC_VIEW;
els.replayvid.currentTime=0;
els.replayvid.onended=closeReplay;
els.replayvid.play().catch(function(){els.replayvid.muted=true;els.replayvid.play().catch(function(){});});
}catch(e){}
}
function closeReplay(){
if(!els.replaywrap||!els.replayvid)return;
els.replaywrap.hidden=true;
try{els.replayvid.pause();els.replayvid.removeAttribute('src');els.replayvid.load();}catch(e){}
}
function continueTo9(){
if(!cap()||!task||task.stage!=='done')return;
if(els.cont)els.cont.disabled=true;
const t9=db().ref('rooms/'+NET.room.code+'/tasks/task09');
t9.update({stage:'intro',startsAt:Date.now()+1200,charge:0,target:800,trackId:'v09',completedAt:0,completionRevision:0})
.then(function(){return NET.setPhase('task09',Date.now()+1500);})
.then(function(){setTimeout(function(){if(window.__tryMount09)window.__tryMount09();},600);})
.catch(function(e){
if(els.cont)els.cont.disabled=false;
status('Не удалось перейти к заданию 9: '+(e&&e.message||e));
});
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
if(els.asknote)els.asknote.hidden=!c;if(els.askplayer)els.askplayer.hidden=c;
els.ready.hidden=!introDone;
els.show.hidden=!(c&&introDone);els.readynote.hidden=c||!introDone;
if(video){
video.hidden=!((inIntro&&!endedLocal)||inView);
if(!(inIntro&&!endedLocal)&&!inView){try{if(!video.paused)video.pause();}catch(e){}}
}
els.controls.hidden=!(c&&inView);
els.request.hidden=!(inView&&!c);
els.ask.hidden=!(inCode&&!c);
// Вопрос про протокол Лума: кнопки «Да»/«Нет» только у капитана.
if(els.quiz){els.quizYes.hidden=!c;els.quizNo.hidden=!c;if(els.quizcap)els.quizcap.hidden=c;}
const showCode=inCode&&c&&!!task.fullViewed;
els.code.hidden=!showCode;
els.done.hidden=!inDone;
// Игроки видят, что вводит капитан: черновик кода пишется в комнату на каждую цифру.
if(els.draft){
const d=(inCode&&!c)?String(task.codeDraft||''):'';
els.draft.hidden=!d;
els.draft.textContent=d?('Капитан ввёл: '+d.split('').join(' ')):'';
}
// На вопрос о протоколе отвечает капитан; игроки сразу видят протокол и могут пересмотреть запись.
if(inDone&&!c){if(els.quiz)els.quiz.hidden=true;if(els.protocol)els.protocol.hidden=false;}
if(els.cont)els.cont.hidden=!c;
if(els.donenote)els.donenote.hidden=c;
if(!inDone)closeReplay();
if(showCode)renderCode();
els.toggle.textContent=(video&&video.paused)?'▶ Играть':'⏸ Пауза';
if(c&&inView){
const req=task.requests||{},cleared=+task.replayClearedAt||0;let asked=0;
for(const k in req){if(req[k]&&+req[k].at>cleared)asked=Math.max(asked,+req[k].at||0);}
if(asked&&!task.playing){status('Команда просит вернуть запись в начало.');els.restart.classList.add('t8-on');}
else{els.restart.classList.remove('t8-on');if(status()==='Команда просит вернуть запись в начало.')status('');}
}
if(inDone){const rk='done';if(rk!==resKey){resKey=rk;playSfx('sfx_crystal_ready.mp3',.4);}}
stopMusic();
if(inCode||inDone)startMusic();
}
function renderCode(){
// один раз подхватываем черновик из базы (после перезагрузки страницы)
if(!slots[0]&&!slots[1]&&!slots[2]&&!slots[3]){
const saved=String(task.codeDraft||'');
for(let i=0;i<4&&i<saved.length;i++)slots[i]=saved.charAt(i);
}
let h='';
for(let i=0;i<4;i++){
const d=slots[i];
h+='<button class="t8-cell'+(d?' filled':'')+(pos===i?' sel':'')+'" type="button" data-i="'+i+'">'+(d?esc(d):'')+'</button>';
}
if(els.cells.innerHTML!==h)els.cells.innerHTML=h;
if(els.pad.childElementCount!==9){
let p='';
for(let i=1;i<=9;i++)p+='<button class="t8-key" type="button" data-d="'+i+'">'+i+'</button>';
els.pad.innerHTML=p;
}
// сетка цифр видна ВСЕГДА, пока открыт экран кода
els.pad.hidden=false;
els.check.disabled=!filled();
els.check.textContent=(+task.attempts>0)?'Проверить снова':'Проверить';
els.err.hidden=!errShown;
const lvl=Math.max(localHint,+task.hintLevel||0);
els.hint.hidden=!(lvl>0);
if(lvl>0){els.hintLabel.textContent='Подсказка '+Math.min(3,lvl);els.hintText.textContent=HINT[Math.min(3,lvl)];}
}
// ——— видео: порядок запуска как в задании 5 ———
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
if(cap())showMediaBtn('Продолжить →',function(){if(task&&task.stage==='intro'){endedLocal=true;render();}else if(task&&task.stage==='view')viewDone();});
};
video.onended=function(){
if(!active||mediaKey!==key||!cap()||!task)return;
if(task.stage==='intro'){endedLocal=true;render();return;}
if(task.stage==='view')viewDone();
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
