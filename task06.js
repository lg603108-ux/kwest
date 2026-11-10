// task06.js — задание 6 «Танец Лума». Два обязательных результата:
// 1) команда собирает порядок шести движений из 12 карточек; верный порядок НЕ завершает задание;
// 2) капитан ОТДЕЛЬНО вводит слово ПОРТАЛ. Слово не собирается из карточек автоматически.
window.Task06=(function(){
// Правильные движения в порядке первого появления (ТЗ, раздел 8). Лишние — не участвуют в ответе.
const MOVES=[
{id:'jump',name:'Прыжок'},
{id:'turn',name:'Оборот'},
{id:'hands',name:'Руки вверх'},
{id:'stomp',name:'Топот'},
{id:'clap',name:'Аплодисменты'},
{id:'elbows',name:'Локти'},
{id:'lie',name:'Лежит'},
{id:'wave',name:'Взмах одной рукой'},
{id:'lean',name:'Наклон в сторону'},
{id:'roll',name:'Кувырок в воздухе'},
{id:'sit',name:'Сидит на полу'},
{id:'squat',name:'Приседание'}
];
const ORDER=['jump','turn','hands','stomp','clap','elbows'];
const WORD='портал';
const HINT_ORDER=['','Вспомните, какие движения появлялись в танце первыми.','Пересмотрите танец и обратите внимание на первое появление каждого движения.','Проверьте начало: первым идёт прыжок, вторым — оборот.'];
const HINT_WORD=['','Посмотрите на названия выбранных движений.','Используйте первые буквы названий движений.','Первая буква — П, последняя — Л.'];
let active=false,root=null,video=null,bg=null,els={},roomState=null,task=null,roomOff=null;
let tickTimer=null,mediaTimer=null,wdTimer=null,startTimer=null,mediaStage='',mediaKey='',mediaRetries=0,pbKey='',hintKey='',resKey='',advKey='';
// Поправка часов: время берём по серверу Firebase, иначе у телефонов оно расходится на секунды
// и игроки не могут начать танец одновременно.
let tOff=0,offRef=null,pre=null;
let picked=-1,kbOpen=false,localHintOrder=0,localHintWord=0,localOrderAt=0,localFailWordAt=0,lastSubmit=0,cardKey='',slotKey='',shuffling=false;
// Тихая фоновая музыка (тот же трек, что в заданиях 4 и 5) — на сборке порядка, вводе слова и финале.
// Правило автора (10.11): на этапах, где нет видео со звуком, играет тихая фоновая музыка; на самом
// танце музыки НЕТ — либо звук танца (капитан), либо тишина (остальные).
let music=null,musicOn=false;
function cap(){const room=roomState||(window.NET&&NET.room);return !!(window.NET&&NET.uid&&room&&room.captain===NET.uid);}
function now(){return Date.now()+(+tOff||0);}
function uid(){return (window.NET&&NET.uid)||'';}
function db(){return firebase.database();}
function publicRef(){return db().ref('rooms/'+NET.room.code+'/tasks/task06');}
function write(obj){return publicRef().update(obj).catch(function(e){error(e);throw e;});}
function error(e){status('Ошибка связи: '+(e&&e.message||e));}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
// Нормализация слова: регистр, ё/е, пробелы, дефисы и знаки препинания не мешают.
function norm(s){return String(s||'').toLowerCase().replace(/ё/g,'е').replace(/[\s\-–—_.,!?;:«»"'()\[\]]+/g,'');}
function moveById(id){for(let i=0;i<MOVES.length;i++)if(MOVES[i].id===id)return MOVES[i];return null;}
function pic(id){return 'assets/t6_'+id+'.png?v=0311ae';}
function playSfx(file,volume){try{var x=new Audio('assets/'+file);x.volume=volume;x.play().catch(function(){});}catch(e){}}
function startMusic(){
if(musicOn)return;
try{
if(!music){music=new Audio('assets/music_defense_loop.mp3');music.loop=true;music.volume=.07;music.preload='auto';}
musicOn=true;
var p=music.play();
if(p&&p.catch)p.catch(function(){musicOn=false;});
}catch(e){musicOn=false;}
}
function stopMusic(){if(musicOn||music){musicOn=false;try{music.pause();}catch(e){}}}
// --- монтаж ---
function mount(container){
if(root)unmount();
active=true;mediaStage='';mediaKey='';mediaRetries=0;pbKey='';hintKey='';resKey='';advKey='';picked=-1;kbOpen=false;localHintOrder=0;localHintWord=0;localOrderAt=0;localFailWordAt=0;cardKey='';slotKey='';shuffling=false;
stopMedia();
try{if(window.__stopQuestAudio)window.__stopQuestAudio();}catch(e){}
// Пролог и улица: при переходе в задание 6 их звук оставался у всех, кроме капитана
// (технический переход глушил звук только на его устройстве). Глушим на каждом устройстве.
['movie','street'].forEach(function(id){var v=document.getElementById(id);if(!v)return;try{v.pause();v.muted=true;}catch(e){}});
root=document.createElement('div');root.id='t6';root.innerHTML=
'<video class="t6-bg" playsinline muted loop preload="auto" src="assets/anomaly_rift.mp4"></video>'+
'<video class="t6-video" playsinline preload="auto"></video>'+
'<video class="t6-pre" playsinline muted preload="auto" aria-hidden="true"></video>'+
'<section class="t6-screen t6-wait"><p class="t6-eyebrow">ЗАДАНИЕ 6</p><h1>Танец Лума</h1><p class="t6-note">Танец откроет путь. Лум покажет его вам. Запомните разные движения в порядке их первого появления. После просмотра выберите движения и расставьте их по порядку. В танце спрятано слово — его нужно разгадать отдельно. Капитан введёт ответ.</p><button id="t6-start" class="t6-primary" type="button">▶ Запустить инструкцию для всех</button><p class="t6-note" id="t6-waitnote">Ждём, когда капитан запустит инструкцию…</p><p class="t6-note">Видео показывается на всех устройствах. Звук инструкции слышит только капитан.</p></section>'+
'<div class="t6-controls" id="t6-controls" hidden><button id="t6-toggle" type="button">⏸ Пауза</button><button id="t6-restart" type="button">↺ В начало</button></div>'+
'<button class="t6-replay" id="t6-replay" type="button" hidden>↺ Повторить танец</button>'+
'<div class="t6-order" id="t6-order" hidden>'+
'<div class="t6-order-head"><p class="t6-order-title" id="t6-order-title">Расставьте движения в порядке первого появления</p></div>'+
'<div class="t6-slots" id="t6-slots"></div>'+
'<div class="t6-cards" id="t6-cards"></div>'+
'<div class="t6-actions" id="t6-actions"><button class="t6-primary" id="t6-check-order" type="button">Проверить порядок</button><button class="t6-replay-inline" id="t6-rewatch" type="button">↺ Пересмотреть танец</button></div>'+
'<div class="t6-hint" id="t6-hint-order" hidden><b id="t6-hint-order-label">Подсказка</b><span id="t6-hint-order-text"></span></div>'+
'</div>'+
'<div class="t6-word" id="t6-word" hidden><p class="t6-word-title">Порядок верный. Какое слово зашифровано?</p><div class="t6-word-row"><input id="t6-word-show" readonly inputmode="none" autocomplete="off" placeholder="Слово"><button class="t6-primary" id="t6-word-check" type="button">Проверить слово</button></div><button class="t6-word-hide" id="t6-word-hide" type="button">Скрыть клавиатуру</button><div class="t6-hint" id="t6-hint-word" hidden><b>Подсказка</b><span id="t6-hint-word-text"></span></div></div>'+
'<div class="t6-kbwin" id="t6-kbwin" hidden><p class="t6-kbwin-label">Введите слово</p><div class="t6-kbrow"><input class="t6-kbwin-input" id="t6-kbwin-input" type="text" autocomplete="off" autocapitalize="characters" enterkeyhint="go"><button class="t6-primary t6-kbok" type="button" id="t6-kbwin-ok">Проверить</button></div><button class="t6-kblink" type="button" id="t6-kbwin-cancel">Отмена</button></div>'+
'<div class="t6-result" id="t6-result" hidden><p class="t6-res-title">Слово разгадано</p><p class="t6-res-word">ПОРТАЛ</p></div>'+
'<section class="t6-screen t6-done" hidden><p class="t6-eyebrow">ЗАДАНИЕ 6 ЗАВЕРШЕНО</p><h1>Танец открыл путь</h1><p class="t6-final-word">ПОРТАЛ</p><p class="t6-note">Слово собрано из первых букв движений. Следующее задание появится в следующем обновлении.</p></section>'+
'<div class="t6-status" id="t6-status" role="status" hidden></div>'+
'<button class="t6-primary t6-mediabtn" id="t6-media" type="button" hidden></button>'+
'<p class="t6-build">Сборка 0311af</p>';
container.appendChild(root);
video=root.querySelector('.t6-video');bg=root.querySelector('.t6-bg');pre=root.querySelector('.t6-pre');
if(pre){pre.src='assets/lum_dance.mp4';try{pre.load();}catch(e){}}
els={wait:root.querySelector('.t6-wait'),start:root.querySelector('#t6-start'),waitnote:root.querySelector('#t6-waitnote'),
controls:root.querySelector('#t6-controls'),toggle:root.querySelector('#t6-toggle'),restart:root.querySelector('#t6-restart'),
replay:root.querySelector('#t6-replay'),order:root.querySelector('#t6-order'),orderTitle:root.querySelector('#t6-order-title'),
slots:root.querySelector('#t6-slots'),cards:root.querySelector('#t6-cards'),actions:root.querySelector('#t6-actions'),
checkOrder:root.querySelector('#t6-check-order'),rewatch:root.querySelector('#t6-rewatch'),
hintOrder:root.querySelector('#t6-hint-order'),hintOrderText:root.querySelector('#t6-hint-order-text'),hintOrderLabel:root.querySelector('#t6-hint-order-label'),
word:root.querySelector('#t6-word'),wordShow:root.querySelector('#t6-word-show'),wordCheck:root.querySelector('#t6-word-check'),
wordHide:root.querySelector('#t6-word-hide'),hintWord:root.querySelector('#t6-hint-word'),hintWordText:root.querySelector('#t6-hint-word-text'),
kbwin:root.querySelector('#t6-kbwin'),kbInput:root.querySelector('#t6-kbwin-input'),kbOk:root.querySelector('#t6-kbwin-ok'),kbCancel:root.querySelector('#t6-kbwin-cancel'),
result:root.querySelector('#t6-result'),done:root.querySelector('.t6-done'),status:root.querySelector('#t6-status'),media:root.querySelector('#t6-media')};
els.start.addEventListener('click',startIntro);
els.toggle.addEventListener('click',togglePlay);
els.restart.addEventListener('click',restartDance);
els.replay.addEventListener('click',requestReplay);
els.checkOrder.addEventListener('click',submitOrder);
els.rewatch.addEventListener('click',rewatch);
els.wordShow.addEventListener('click',openKb);
els.wordCheck.addEventListener('click',submitWord);
els.wordHide.addEventListener('click',closeKb);
els.kbOk.addEventListener('click',function(){submitWord();});
els.kbCancel.addEventListener('click',function(){kbSave();closeKb();});
els.kbInput.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();submitWord();}});
els.slots.addEventListener('click',onSlotClick);
els.cards.addEventListener('click',onCardClick);
// Браузер может запретить звук до первого касания — на касании капитана пробуем снова.
root.addEventListener('pointerdown',function(){
if(!active||!task)return;
const st=task.stage||'';
if(st==='order'||st==='word'||st==='done')startMusic();
else if(st==='dance'){
// На танце музыки нет: у капитана звук ролика, у остальных тишина.
if(video&&video.muted&&cap()){video.muted=false;try{video.play().catch(function(){});}catch(e){}}
}
},true);
try{bg.play().catch(function(){});}catch(e){}
if(bg)bg.onerror=function(){if(bg)bg.style.display='none';};
// Общее время команды: сколько наши часы отличаются от часов сервера.
try{offRef=db().ref('.info/serverTimeOffset');offRef.on('value',function(s){tOff=+s.val()||0;});}catch(e){offRef=null;}
roomOff=NET.onRoom(onRoom);
tickTimer=setInterval(tick,500);
}
function unmount(){
active=false;clearMedia();stopMedia();stopMusic();
if(startTimer){clearTimeout(startTimer);startTimer=null;}
if(offRef){try{offRef.off();}catch(e){}offRef=null;}
if(pre){try{pre.pause();pre.removeAttribute('src');pre.load();}catch(e){}pre=null;}
if(tickTimer){clearInterval(tickTimer);tickTimer=null;}
if(typeof roomOff==='function')roomOff();roomOff=null;
if(bg){try{bg.pause();}catch(e){}bg.removeAttribute('src');try{bg.load();}catch(e){}bg=null;}
if(root&&root.parentNode)root.parentNode.removeChild(root);
root=null;video=null;bg=null;els={};roomState=null;task=null;mediaStage='';mediaKey='';pbKey='';hintKey='';resKey='';advKey='';picked=-1;kbOpen=false;cardKey='';slotKey='';
}
function status(text){
if(!els.status)return '';
if(text===undefined)return els.status.textContent||'';
els.status.textContent=text||'';els.status.hidden=!text;return '';
}
function onRoom(room){if(!active||!room)return;roomState=room;task=(room.tasks&&room.tasks.task06)||{stage:'wait'};render();coordinate();}
// --- просмотр: инструкция и танец ---
function startIntro(){
if(!cap()||!task||task.stage!=='wait')return;
els.start.disabled=true;
write({stage:'intro',startsAt:now(),playbackId:1,playing:true,pausedAt:0,watched:false,orderAccepted:false,wordAccepted:false,attemptsOrder:0,attemptsWord:0,hintOrder:0,hintWord:0,selected:['','','','','',''],shuffle:null,completed:false})
.catch(function(){if(els.start)els.start.disabled=false;});
}
function introDone(){
if(!cap()||!task||task.stage!=='intro')return;
write({stage:'dance',startsAt:now()+1200,playbackId:(+task.playbackId||0)+1,playing:true,pausedAt:0,watched:false,replayClearedAt:Date.now()}).catch(function(){});
}
function togglePlay(){
if(!cap()||!task||task.stage!=='dance'||!video)return;
if(video.paused){video.play().catch(function(){});write({playing:true,startsAt:now(),pausedAt:video.currentTime||0}).catch(function(){});}
else{video.pause();write({playing:false,pausedAt:video.currentTime||0}).catch(function(){});}
}
function restartDance(){
if(!cap()||!task||task.stage!=='dance'||!video)return;
try{video.currentTime=0;}catch(e){}
video.play().catch(function(){});
write({playing:true,startsAt:now()+1200,pausedAt:0,playbackId:(+task.playbackId||0)+1,replayClearedAt:Date.now()}).catch(function(){});
}
// Пересмотр доступен сразу, ещё до первой ошибки (решение автора 09.11).
function rewatch(){
if(!cap()||!task)return;
if(task.stage!=='order'&&task.stage!=='word')return;
closeKb();
write({stage:'dance',startsAt:now()+1200,playbackId:(+task.playbackId||0)+1,playing:true,pausedAt:0,replayClearedAt:Date.now()}).catch(function(){});
}
function requestReplay(){
if(!task||cap())return;
const u=uid();if(!u)return;
db().ref('rooms/'+NET.room.code+'/tasks/task06/requests/'+u).set({at:Date.now()}).then(function(){
status('Запрос отправлен капитану: он вернёт танец в начало.');
setTimeout(function(){if(active)status('');},4000);
}).catch(error);
}
function onVideoEnded(){
if(!active||!task||!video)return;
if(cap()&&task.stage==='intro'){introDone();return;}
if(cap()&&task.stage==='dance'){
write({stage:'order',watched:true,playing:false,pausedAt:0}).catch(function(){});
}
}
// --- этап порядка ---
function ensureShuffle(){
if(!cap()||!task||task.stage!=='order'||shuffling)return;
const sh=task.shuffle;
if(Array.isArray(sh)&&sh.length===MOVES.length)return;
shuffling=true;
const ids=MOVES.map(function(m){return m.id;});
for(let i=ids.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));const t=ids[i];ids[i]=ids[j];ids[j]=t;}
write({shuffle:ids}).catch(function(){}).then(function(){shuffling=false;},function(){shuffling=false;});
}
function selected(){const s=task&&task.selected;return Array.isArray(s)?s.slice(0,6):['','','','','',''];}
function onCardClick(e){
const b=e.target&&e.target.closest?e.target.closest('.t6-card'):null;
if(!b||!cap()||!task||task.stage!=='order')return;
const id=b.getAttribute('data-id');if(!id)return;
const sel=selected();
if(sel.indexOf(id)>=0)return; // одна и та же карточка не дублируется
// Если ячейка выбрана — карточка встаёт в неё и заменяет прежнюю; иначе в первую пустую.
let i=(picked>=0&&picked<6)?picked:sel.indexOf('');
if(i<0)return;
if(sel[i]===id)return;
sel[i]=id;
if(picked>=0)picked=-1;
write({selected:sel}).catch(function(){});
}
function onSlotClick(e){
if(!cap()||!task||task.stage!=='order')return;
const slot=e.target&&e.target.closest?e.target.closest('.t6-slot'):null;
if(!slot)return;
const i=parseInt(slot.getAttribute('data-i'),10);if(isNaN(i))return;
const del=e.target&&e.target.classList&&e.target.classList.contains('t6-del');
const sel=selected();
if(del){if(!sel[i])return;sel[i]='';picked=-1;write({selected:sel}).catch(function(){});return;}
// Касание ячейки только выделяет её: следующая карточка встанет сюда (с заменой).
picked=(picked===i)?-1:i;
render();
}
function submitOrder(){
if(!cap()||!task||task.stage!=='order')return;
if(Date.now()-lastSubmit<800)return;
const sel=selected();
if(sel.indexOf('')>=0)return;
lastSubmit=Date.now();
const ok=ORDER.every(function(id,i){return sel[i]===id;});
if(ok){
localHintOrder=0;
write({orderAccepted:true,stage:'word',hintOrder:0}).catch(function(){});
playSfx('sfx_ui_confirm.mp3',.55);
}else{
localHintOrder=1;localOrderAt=Date.now();
setTimeout(function(){if(active)localHintOrder=0;},6000);
write({attemptsOrder:(+task.attemptsOrder||0)+1,hintOrder:Math.min(3,(+task.hintOrder||0)+1)}).catch(function(){});
playSfx('sfx_ui_error.mp3',.5);
}
}
// --- этап слова ---
function openKb(){
if(!cap()||!task||task.stage!=='word'||kbOpen)return;
kbOpen=true;els.kbwin.hidden=false;
els.kbInput.value=els.wordShow.value||'';
try{els.kbInput.focus();}catch(e){}
}
function kbSave(){if(els.wordShow)els.wordShow.value=els.kbInput?els.kbInput.value:'';}
function closeKb(){kbOpen=false;if(els.kbwin)els.kbwin.hidden=true;try{if(els.kbInput)els.kbInput.blur();}catch(e){}}
function submitWord(){
if(!cap()||!task||task.stage!=='word')return;
if(Date.now()-lastSubmit<800)return;
lastSubmit=Date.now();
let w=kbOpen&&els.kbInput?els.kbInput.value:(els.wordShow?els.wordShow.value:'');
w=String(w||'').trim();
if(!w)return;
if(norm(w)===WORD){
closeKb();localHintWord=0;
if(els.wordShow)els.wordShow.value='';
write({wordAccepted:true,stage:'done',completed:true,completedAt:Date.now(),hintWord:0}).catch(function(){});
playSfx('sfx_crystal_ready.mp3',.6);
}else{
closeKb();
if(els.wordShow)els.wordShow.value='';
localHintWord=1;localFailWordAt=Date.now();
setTimeout(function(){if(active)localHintWord=0;},6000);
write({attemptsWord:(+task.attemptsWord||0)+1,hintWord:Math.min(3,(+task.hintWord||0)+1)}).catch(function(){});
playSfx('sfx_ui_error.mp3',.5);
status('Слово не подошло. Порядок остаётся подтверждённым — попробуйте ещё.');
setTimeout(function(){if(active)status('');},5000);
}
}
// --- отрисовка ---
function render(){
if(!root||!task)return;
const stage=task.stage||'wait',c=cap();
root.className=c?'iscap':'';
els.wait.hidden=stage!=='wait';
els.start.hidden=!c;els.waitnote.hidden=c;
const inDance=stage==='dance',inIntro=stage==='intro',inOrder=stage==='order',inWord=stage==='word',inDone=stage==='done';
if(video){
video.hidden=!(inDance||inIntro);
if(!inDance&&!inIntro){try{if(!video.paused)video.pause();}catch(e){}}
}
els.controls.hidden=!(c&&inDance);
els.replay.hidden=!(inDance&&!c);
els.order.hidden=!(inOrder||inWord);
els.word.hidden=!inWord;
els.done.hidden=!inDone;
els.actions.hidden=!(inOrder&&c);
if(inIntro){els.order.hidden=true;els.word.hidden=true;}
if(inOrder){ensureShuffle();renderOrder(c,false);}
if(inWord)renderOrder(c,true);
if(inWord&&c){
const lvl=Math.max(+task.hintWord||0,localHintWord);
els.hintWord.hidden=!(lvl>0);
if(lvl>0)els.hintWordText.textContent=HINT_WORD[Math.min(3,lvl)];
}else els.hintWord.hidden=true;
if(inOrder){
const lvl=Math.min(3,Math.max(+task.hintOrder||0,localHintOrder));
els.hintOrder.hidden=!(c&&lvl>0);
if(lvl>0){
els.hintOrderLabel.textContent='Подсказка '+lvl;
els.hintOrderText.textContent=HINT_ORDER[lvl];
}
}
const sel=selected();
els.checkOrder.disabled=!(c&&sel.indexOf('')<0);
els.checkOrder.textContent=(+task.attemptsOrder>0)?'Проверить порядок ещё раз':'Проверить порядок';
// Капитан видит запрос повтора от команды.
if(c&&inDance){
const req=task.requests||{},cleared=+task.replayClearedAt||0;let asked=0;
for(const k in req){if(req[k]&&+req[k].at>cleared)asked=Math.max(asked,+req[k].at||0);}
if(asked&&!task.playing){status('Команда просит вернуть танец в начало.');els.restart.classList.add('t6-on');}
else{els.restart.classList.remove('t6-on');if(status()==='Команда просит вернуть танец в начало.')status('');}
}
// Результат принятого слова — крупно, у всех устройств, первые 3,5 секунды.
const showRes=inDone&&!!(+task.completedAt)&&Date.now()-(+task.completedAt)<3500;
els.result.hidden=!showRes;
if(showRes){const rk='done';if(rk!==resKey){resKey=rk;playSfx('sfx_crystal_ready.mp3',.5);}}
else if(!inDone)resKey='';
}
function renderOrder(c,wordStage){
const sel=selected();
const key=[sel.join(','),picked,c?1:0,wordStage?1:0].join('|');
if(key!==slotKey){
slotKey=key;
const slots=[];
for(let i=0;i<6;i++){
const m=sel[i]?moveById(sel[i]):null;
slots.push('<div class="t6-slot'+(m?' filled':'')+(picked===i?' picked':'')+'" data-i="'+i+'"><span class="t6-num">'+(i+1)+'</span>'+(m?escapeHtml(m.name):'')+(m&&c?'<button class="t6-del" type="button" data-i="'+i+'" aria-label="Убрать">×</button>':'')+'</div>');
}
els.slots.innerHTML=slots.join('');
}
if(wordStage){
// На этапе слова сетку карточек не показываем: нужны только подтверждённые названия.
els.cards.hidden=true;els.actions.hidden=true;
if(els.orderTitle)els.orderTitle.textContent='Подтверждённый порядок движений';
}else{
els.cards.hidden=false;els.actions.hidden=!c;
if(els.orderTitle){
if(!c)els.orderTitle.textContent='Капитан собирает порядок движений. Обсуждайте вместе.';
else if(picked>=0)els.orderTitle.textContent='Выберите карточку для ячейки '+(picked+1)+' — прежнее движение заменится';
else els.orderTitle.textContent='Расставьте движения в порядке первого появления';
}
renderCards(c);
}
}
function renderCards(c){
const sh=(Array.isArray(task.shuffle)&&task.shuffle.length===MOVES.length)?task.shuffle:MOVES.map(function(m){return m.id;});
const sel=selected();
const key=sh.join(',')+'|'+sel.join(',');
if(els.cards.childElementCount!==MOVES.length||cardKey!==key){
cardKey=key;
let h='';
for(let i=0;i<sh.length;i++){
const m=moveById(sh[i]);if(!m)continue;
const taken=sel.indexOf(m.id)>=0;
h+='<button class="t6-card'+(taken?' taken':'')+'" type="button" data-id="'+m.id+'"'+(taken||!c?' disabled':'')+'><img class="t6-pic" src="'+pic(m.id)+'" alt=""><span class="t6-name">'+escapeHtml(m.name)+'</span></button>';
}
els.cards.innerHTML=h;
}
}
// --- видео: инструкция и танец ---
function clearWd(){if(wdTimer){clearTimeout(wdTimer);wdTimer=null;}}
function stopMedia(){
clearWd();
if(startTimer){clearTimeout(startTimer);startTimer=null;}
if(!video)return;
mediaKey='';
video.onloadeddata=null;video.oncanplay=null;video.onerror=null;video.onended=null;
try{video.pause();}catch(e){}
hideMediaBtn();
}
function clearMedia(){if(mediaTimer){clearTimeout(mediaTimer);mediaTimer=null;}}
function hideMediaBtn(){if(els.media){els.media.hidden=true;els.media.onclick=null;}}
function showMediaBtn(text,fn){if(!els.media)return;els.media.hidden=false;els.media.textContent=text;els.media.onclick=function(ev){if(ev&&ev.stopPropagation)ev.stopPropagation();hideMediaBtn();if(!active)return;fn();};}
function loadMedia(stage){
if(!video)return;
stopMedia();
const src=stage==='intro'?'assets/v06_intro.mp4':'assets/lum_dance.mp4';
mediaStage=stage;mediaKey=stage;pbKey='';
video.muted=!cap();
if(video.muted){video.defaultMuted=true;video.setAttribute('muted','');}
else{video.defaultMuted=false;video.removeAttribute('muted');}
video.src=src;
video.onloadeddata=function(){if(!active||mediaKey!==stage)return;
clearWd();mediaRetries=0;
try{video.currentTime=(+task.pausedAt||0);}catch(e){}
if(stage==='dance')status('Загружаем танец…');
playWhenReady();
};
video.onerror=function(){
if(!active||mediaKey!==stage||!video)return;
clearMedia();
if((+mediaRetries||0)<6){
mediaRetries=(+mediaRetries||0)+1;
status('Видео не загрузилось, пробуем ещё раз… (попытка '+mediaRetries+')');
mediaTimer=setTimeout(function(){mediaTimer=null;if(!active||mediaKey!==stage||!video)return;try{video.src=src;video.load();}catch(e){}},1500);
return;
}
status('');
if(cap())showMediaBtn('▶ Запустить видео',function(){mediaRetries=0;try{video.src=src;video.load();}catch(e){}});
else status('Ждём капитана: он запустит видео.');
};
video.onended=onVideoEnded;
video.load();
// Сторож: если первого кадра нет 20 секунд (медленная связь) — сообщаем и пробуем заново.
clearWd();
wdTimer=setTimeout(function(){
wdTimer=null;
if(!active||mediaKey!==stage||!video)return;
if(video.readyState>=2)return;
if((+mediaRetries||0)<6){
mediaRetries=(+mediaRetries||0)+1;
status('Видео не загрузилось, пробуем ещё раз… (попытка '+mediaRetries+')');
try{video.src=src;video.load();}catch(e){}
}else{
status('');
if(cap())showMediaBtn('▶ Запустить видео',function(){mediaRetries=0;try{video.src=src;video.load();}catch(e){}});
else status('Ждём капитана: он запустит видео.');
}
},20000);
}
// Общий момент старта: все ждут его по серверным часам и включаются одновременно.
function sharedDelay(){
const at=+task.startsAt||0;
if(!at)return 0;
const d=at-now();
return (d>0&&d<15000)?d:0;
}
// Включаем не по первому кадру, а когда впереди набрано несколько секунд:
// иначе на медленной связи видео замирает сразу после старта.
function playWhenReady(){
if(!video||!active)return;
hideMediaBtn();
if(video.readyState<3){
video.oncanplay=function(){video.oncanplay=null;if(active)schedulePlay();};
return;
}
schedulePlay();
}
function schedulePlay(){
if(!video||!active)return;
const d=sharedDelay();
if(d>120){
status('Танец начнётся одновременно у всех…');
if(startTimer)clearTimeout(startTimer);
startTimer=setTimeout(function(){startTimer=null;if(!active)return;status('');playNow();},d);
return;
}
playNow();
}
function playNow(){
if(!video||!active)return;
const p=video.play();
if(!p||!p.then){hideMediaBtn();status('');return;}
p.then(function(){if(!active)return;hideMediaBtn();status('');},function(){
if(!active||!video)return;
video.muted=true;
video.play().catch(function(){});
status('');
});
}
function coordinate(){
if(!task||!video)return;
const stage=task.stage||'wait';
if(stage==='intro'||stage==='dance'){
if(mediaStage!==stage){clearMedia();mediaRetries=0;loadMedia(stage);return;}
}
const c=cap();
if(stage==='dance'){
const pb=String(+task.playbackId||0);
if(pb!==pbKey){
pbKey=pb; // новый показ (общий старт или просьба повторить) — все начинают сначала
try{video.currentTime=(+task.pausedAt||0);}catch(e){}
if(task.playing&&video.readyState>=3)schedulePlay();
}
if(!c){
// Время НЕ подгоняем (решение автора 10.11): подгонка заставляла видео замирать
// и перескакивать, из-за чего движения не разглядеть. Только пауза и продолжение,
// без перемотки — каждый смотрит танец целиком со своего места.
if(task.playing){
if(video.paused&&video.readyState>=2)video.play().catch(function(){});
}else{
if(!video.paused)try{video.pause();}catch(e){}
}
}
if(c){
els.toggle.textContent=video.paused?'▶ Играть':'⏸ Пауза';
}
}
if(stage==='intro'&&c&&+task.startsAt&&(now()-(+task.startsAt))>120000)introDone();
// У всех, кроме капитана, видео задания всегда без звука (жёсткое правило автора).
if(video&&!cap()&&!video.muted)video.muted=true;
// Звук: на танце музыки нет — либо звук танца у капитана, либо тишина у остальных.
// На этапах без видео со звуком (расстановка карточек, слово, финал) играет тихая фоновая музыка.
if(stage==='dance')stopMusic();
else if(stage==='order'||stage==='word'||stage==='done')startMusic();
else stopMusic();
}
function tick(){
if(!active||!task)return;
render();coordinate();
if(!cap())return;
const st=task.stage||'',t0=+task.startsAt||0;
if(st==='wait'&&els.start)els.start.disabled=false;
if(st==='intro'&&t0&&Date.now()>t0+120000)introDone();
if(st==='word'&&pbKey)pbKey='';
}
return{mount:mount,unmount:unmount};
})();
