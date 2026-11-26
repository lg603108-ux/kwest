// task02.js — модуль задания 2 «Кристальный шифр» для командной интеграции (сборка 9).
window.Task02=(function(){
const MEDIA={intro:['assets/v02_intro_light.mp4','assets/v02_intro.mp4','v02_intro.mp4'],sequence:['assets/crystal_sequence.mp4','crystal_sequence.mp4'],reveal:['assets/door_open_lum.mp4','door_open_lum.mp4']};
const W='#ffffff';
const SHAPES={
diamond:'<svg viewBox="0 0 24 24"><path d="M12 2 L22 12 L12 22 L2 12 Z" fill="'+W+'"/></svg>',
square:'<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" fill="'+W+'"/></svg>',
cross:'<svg viewBox="0 0 24 24"><path d="M9 2 h6 v7 h7 v6 h-7 v7 h-6 v-7 H2 v-6 h7 Z" fill="'+W+'"/></svg>',
triangle:'<svg viewBox="0 0 24 24"><path d="M12 3 L22 21 L2 21 Z" fill="'+W+'"/></svg>',
colon:'<svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="3" fill="'+W+'"/><circle cx="12" cy="17" r="3" fill="'+W+'"/></svg>',
oval:'<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="10" ry="6" fill="'+W+'"/></svg>',
infinity:'<svg viewBox="0 0 24 24"><path d="M12 12c-2-2.7-3.6-4-6-4a4 4 0 0 0 0 8c2.4 0 4-1.3 6-4zm0 0c2 2.7 3.6 4 6 4a4 4 0 0 0 0-8c-2.4 0-4 1.3-6 4z" fill="'+W+'"/></svg>',
arc:'<svg viewBox="0 0 24 24"><path d="M4 17 A 10 10 0 0 1 20 17" fill="none" stroke="'+W+'" stroke-width="2.6" stroke-linecap="round"/></svg>',
waves:'<svg viewBox="0 0 24 24"><path d="M3 9.5 q3 -3 6 0 t6 0 t6 0 M3 15 q3 -3 6 0 t6 0 t6 0" fill="none" stroke="'+W+'" stroke-width="2.2" stroke-linecap="round"/></svg>',
semicolon:'<svg viewBox="0 0 24 24"><circle cx="12" cy="6.5" r="2.6" fill="'+W+'"/><path d="M12 12.2c2.6 0 4.2 1.7 4.2 4 0 2.9-2.3 4.8-4.8 6.2 1.3-1.9 1.9-3.1 1.9-4.8 0-1.7-1.3-2.7-1.3-5.4z" fill="'+W+'"/></svg>'
};
const LEFT=[{id:'diamond',digit:8},{id:'square',digit:5},{id:'colon',digit:0},{id:'triangle',digit:4},{id:'cross',digit:9}];
const RIGHT=[{id:'oval',digit:1},{id:'infinity',digit:3},{id:'arc',digit:2},{id:'waves',digit:6},{id:'semicolon',digit:7}];
const CODE=[1,2,3,5,8,9];
const HINT_SWAP='Расположите цифры по возрастанию: меньшая — левее. Нажмите ОДНУ ячейку, затем ДРУГУЮ — они поменяются местами.';
const HINT_PLAYER='Расстановку выполняет капитан. Следите за ячейками и подсказывайте голосом.';
let root=null,video=null,els={},S=null,active=false,lastKey='',digTimer=null,startTimer=null,curStage='wait',lastSrc='',stallTimer=null,phraseDone=false;
function cap(){return !!(window.NET&&window.NET.isCaptain());}
function ref(){return firebase.database().ref('rooms/'+window.NET.room.code+'/tasks/task02');}
function put(obj){ref().update(obj).catch(function(e){status('Ошибка записи: '+(e&&e.message||e));if(els.startBtn)els.startBtn.disabled=false;});}
function playSfx(file,volume){try{var a=new Audio('assets/'+file);a.volume=volume;a.play().catch(function(){});}catch(e){}}
var t2Music=null;
function startMusic(){if(t2Music){if(t2Music.paused)t2Music.play().catch(function(){});return;}try{t2Music=new Audio('assets/music_defense_loop.mp3');t2Music.loop=true;t2Music.volume=.05;t2Music.play().catch(function(){});}catch(e){t2Music=null;}}
function stopMusic(){if(t2Music){try{t2Music.pause();}catch(e){}}}
function goFullscreen(){/* просим общий полноэкранный режим из app.js: он входит один раз за сессию */try{if(window.__goFullscreen)window.__goFullscreen();}catch(e){}}
function mount(container){
if(root)unmount();
active=true;
S={digits:[],hl:null,attempts:0,accepted:false,soundOn:cap(),seqEnded:false,setWarned:false};
root=document.createElement('div');root.id='t2';container.appendChild(root);
root.innerHTML=
'<video class="t2-video" playsinline preload="auto"></video>'+
'<div class="t2-panel left" id="t2-left" hidden></div>'+
'<div class="t2-panel right" id="t2-right" hidden></div>'+
'<button class="t2-sound" id="t2-sound" type="button" title="Включить/выключить звук">'+(S.soundOn?'♪':'×')+'</button>'+
'<div class="t2-status" id="t2-status" style="display:none"></div>'+
'<div class="t2-bottom" id="t2-bottom" hidden>'+
'<div class="t2-hint" id="t2-hint"></div>'+
'<div class="t2-cells" id="t2-cells"></div>'+
'<div class="t2-buttons" id="t2-buttons" hidden>'+
'<button class="t2-btn" id="t2-remove" type="button">Убрать выбранную</button>'+
'<button class="t2-btn" id="t2-repeat" type="button">Повторить видео</button>'+
'<button class="t2-btn primary" id="t2-check" type="button" disabled>Открыть дверь</button>'+
'</div></div>'+
'<div class="t2-nextwrap" id="t2-nextwrap" hidden><button class="t2-btn primary t2-big" id="t2-continue" type="button">Продолжить квест →</button><p class="t2-nextnote" id="t2-playernote" hidden>Ждём капитана…</p><p class="t2-nextnote" id="t2-donenote" hidden>Задание 3 подключим на этапе интеграции.</p></div>'+
'<div class="t2-rotate">Поверните телефон горизонтально</div>'+
'<div class="t2-mediareq" id="t2-mediareq" hidden><button class="t2-btn primary t2-big" id="t2-mediareq-btn" type="button">▶ Нажмите, чтобы начать видео</button><p class="t2-nextnote">Видео продолжится с общего момента — вы не отстанете от команды</p></div>'+
'<div class="t2-start" id="t2-start"><h1>Кристальный шифр</h1><button id="t2-start-btn" type="button">▶ Запустить видео для всех</button><p class="t2-nextnote" id="t2-waitnote" hidden>Ждём, когда капитан запустит видео…</p></div>';
video=root.querySelector('.t2-video');
// Как в исходной версии октября: ролик начинает загружаться и играть сразу при входе в задание,
// без ожидания нажатия. Звук выключен, картинка закрыта экраном описания. К моменту нажатия
// кнопки ролик уже загружен, поэтому запуск мгновенный.
try{if(window.__stopQuestAudio)window.__stopQuestAudio();}catch(e){}
try{video.preload='auto';lastSrc=MEDIA.intro[0]+'?v=9';video.src=lastSrc;video.muted=true;video.play().catch(function(){});}catch(e){}
els={left:root.querySelector('#t2-left'),right:root.querySelector('#t2-right'),status:root.querySelector('#t2-status'),sound:root.querySelector('#t2-sound'),bottom:root.querySelector('#t2-bottom'),hint:root.querySelector('#t2-hint'),cells:root.querySelector('#t2-cells'),buttons:root.querySelector('#t2-buttons'),remove:root.querySelector('#t2-remove'),repeat:root.querySelector('#t2-repeat'),check:root.querySelector('#t2-check'),nextwrap:root.querySelector('#t2-nextwrap'),continueBtn:root.querySelector('#t2-continue'),playernote:root.querySelector('#t2-playernote'),donenote:root.querySelector('#t2-donenote'),start:root.querySelector('#t2-start'),startBtn:root.querySelector('#t2-start-btn'),waitnote:root.querySelector('#t2-waitnote'),mediareq:root.querySelector('#t2-mediareq'),mediareqBtn:root.querySelector('#t2-mediareq-btn')};
LEFT.forEach(function(it){els.left.appendChild(makeRow(it));});
RIGHT.forEach(function(it){els.right.appendChild(makeRow(it));});
els.cells.addEventListener('click',function(e){const c=e.target.closest('.t2-cell');if(c)onCell(+c.dataset.i);});
els.remove.addEventListener('click',onRemove);
els.repeat.addEventListener('click',function(){if(cap()){clearTimeout(digTimer);put({stage:'sequence',startsAt:Date.now()+1500,digits:''});}});
els.check.addEventListener('click',onCheck);
els.sound.addEventListener('click',toggleSound);
els.mediareqBtn.addEventListener('click',function(){
  if(!active||!video)return;
  // Касание = жест пользователя: капитану возвращаем звук, игроки остаются в беззвучном режиме.
  if(cap()&&(curStage==='intro'||curStage==='sequence'||curStage==='reveal')){S.soundOn=true;video.muted=false;els.sound.textContent='♪';}
  video.play().then(function(){els.mediareq.hidden=true;},function(){});
});
els.continueBtn.addEventListener('click',function(){els.continueBtn.hidden=true;els.donenote.hidden=false;});
// Ролик пошёл — убираем аварийную кнопку.
video.addEventListener('playing',function(){clearTimeout(stallTimer);if(els.mediareq)els.mediareq.hidden=true;status('');});
// Игрок не вводит цифры: при нажатии на кнопку задания показываем подсказку.
function notCaptainHint(){var t=document.getElementById('toast');if(!t)return;t.textContent='Код вводит капитан';t.style.display='block';clearTimeout(window.__t2hint);window.__t2hint=setTimeout(function(){t.style.display='none';},2200);}
if(root)root.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('button'):null;if(!b)return;if(b.id==='t2-start-btn'||b.id==='t2-mediareq-btn'||b.id==='t2-sound')return;if(!cap())notCaptainHint();},true);
els.startBtn.addEventListener('click',function(){
if(!cap())return;
S.soundOn=true;video.muted=false;els.sound.textContent='♪';
goFullscreen();els.startBtn.disabled=true;
// Запуск прямо в обработчике нажатия (жест пользователя) — как в версии октября.
// Раньше play() вызывался через 1.2 с по таймеру, и браузер мог отклонить запуск.
els.start.hidden=true;status('');
try{video.currentTime=0;}catch(e){}
video.play().catch(function(){video.muted=true;S.soundOn=false;els.sound.textContent='×';video.play().catch(function(){els.mediareq.hidden=false;});});
put({stage:'intro',startsAt:Date.now(),rev:1});
});
// Полноэкранный режим здесь не запрашиваем: запрос во время нажатия по цифре прерывал
// нажатие и блокировал ввод. Вход в полный экран делает общий обработчик страницы.
renderCells();
render(window.NET.room);
window.NET.onRoom(function(room){if(active)render(room);});
}
function makeRow(it){const r=document.createElement('div');r.className='t2-row';r.innerHTML='<span class="shape">'+SHAPES[it.id]+'</span><span class="digit">'+it.digit+'</span>';r.addEventListener('click',function(){onRow(it.digit);});return r;}
function unmount(){active=false;clearTimeout(startTimer);clearTimeout(digTimer);clearTimeout(stallTimer);if(video){video.pause();video.removeAttribute('src');video.load();}if(root&&root.parentNode)root.parentNode.removeChild(root);root=null;video=null;els={};lastKey='';curStage='wait';lastSrc='';phraseDone=false;}
function status(t){if(!els.status)return;els.status.textContent=t||'';els.status.style.display=t?'':'none';}
function hint(t,kind){if(!els.hint)return;els.hint.textContent=t||'';els.hint.className='t2-hint'+(kind?' '+kind:'');}
function toggleSound(){if((curStage==='intro'||curStage==='wait')&&!cap()){S.soundOn=false;video.muted=true;els.sound.textContent='×';return;}S.soundOn=!S.soundOn;video.muted=!S.soundOn;els.sound.textContent=S.soundOn?'♪':'×';if(S.soundOn&&video.paused&&(curStage==='intro'||curStage==='sequence'||curStage==='reveal'))video.play().catch(function(){});}
function render(room){
if(!root)return;
const t=room&&room.tasks&&room.tasks.task02;
const stage=t?t.stage:'wait';
const at=(t&&t.startsAt)||0;
const digits=(t&&t.digits)?String(t.digits).split(',').filter(function(x){return x!=='';}).map(Number):[];
const key=stage+':'+at;
if(key!==lastKey){lastKey=key;S.digits=digits.slice();S.hl=null;S.attempts=0;applyStage(stage,at);}
// У капитана набранные цифры — свои: обновление комнаты не должно их затирать,
// иначе правка («убрать лишнюю») терялась между нажатием и записью в комнату.
else{if(!cap())S.digits=digits.slice();renderCells();}
els.startBtn.hidden=!(cap()&&stage==='wait');
els.waitnote.hidden=!(!cap()&&stage==='wait');
els.continueBtn.hidden=!(cap()&&stage==='done');
els.playernote.hidden=!(!cap()&&stage==='done');
}
function applyStage(stage,at){
curStage=stage;clearTimeout(startTimer);clearTimeout(stallTimer);
if(stage==='swap')startMusic();else stopMusic();
// Фраза звучит ПОСЛЕ видеоинструкции — когда открывается ввод кода (стадия swap), только у капитана.
if(stage==='swap'&&cap()&&!phraseDone){phraseDone=true;try{const va=new Audio('assets/volt_task2_captain_code.mp3?v=0378a');va.volume=.9;va.play().catch(function(){});window.__t2phrase=va;}catch(e){}}
// При смене этапа убираем аварийную плашку: иначе она оставалась поверх экрана
// и перекрывала нажатия по цифрам.
if(els.mediareq)els.mediareq.hidden=true;
S.soundOn=(stage==='intro'||stage==='wait'||stage==='reveal')?cap():true;
video.muted=!S.soundOn;els.sound.textContent=S.soundOn?'♪':'×';
if(stage==='wait'){els.start.hidden=false;els.left.hidden=true;els.right.hidden=true;els.bottom.hidden=true;els.nextwrap.hidden=true;status('');
// На экране описания ролик идёт без звука у всех, включая капитана: иначе его музыка
// слышна ещё до нажатия кнопки. Звук включается только по нажатию.
S.soundOn=false;video.muted=true;els.sound.textContent='×';
if(video&&video.paused&&!video.error){video.play().catch(function(){});}}
else if(stage==='intro'){els.start.hidden=true;els.left.hidden=true;els.right.hidden=true;els.bottom.hidden=true;els.nextwrap.hidden=true;
// У капитана ролик уже запущен нажатием кнопки — не перезапускаем его и не трогаем src.
if(cap()&&!video.paused&&lastSrc===MEDIA.intro[0]+'?v=9'){
status('');
// Единственная правка перехода: ролик уже играет, и обработчик окончания ему не назначен.
// Без этого инструкция доигрывала и оставалась на экране, а задание не начиналось.
video.onended=function(){if(cap())put({stage:'sequence',startsAt:Date.now()+2000});};
}
else if(cap()&&video.ended){put({stage:'sequence',startsAt:Date.now()+2000});}
else{schedulePlay(MEDIA.intro,at,'intro');}}
else if(stage==='sequence'){els.start.hidden=true;els.left.hidden=false;els.right.hidden=false;els.bottom.hidden=false;els.bottom.classList.add('compact');els.buttons.hidden=true;els.hint.style.display='none';els.nextwrap.hidden=true;schedulePlay(MEDIA.sequence,at,'sequence');}
else if(stage==='swap'){els.start.hidden=true;els.left.hidden=false;els.right.hidden=false;els.bottom.hidden=false;els.bottom.classList.remove('compact');els.nextwrap.hidden=true;video.pause();status('');
if(cap()){els.buttons.hidden=false;els.hint.style.display='';hint(HINT_SWAP);els.cells.style.pointerEvents='auto';els.left.style.pointerEvents='auto';els.right.style.pointerEvents='auto';}
else{els.buttons.hidden=true;els.hint.style.display='';hint(HINT_PLAYER);els.cells.style.pointerEvents='none';els.left.style.pointerEvents='none';els.right.style.pointerEvents='none';}
renderCells();}
else if(stage==='reveal'){els.start.hidden=true;els.left.hidden=true;els.right.hidden=true;els.bottom.hidden=true;els.nextwrap.hidden=true;schedulePlay(MEDIA.reveal,at,'reveal');}
else if(stage==='done'){els.start.hidden=true;els.left.hidden=true;els.right.hidden=true;els.bottom.hidden=true;els.nextwrap.hidden=false;status('');}
}
// Сначала проверяем, ТЕ ЛИ цифры введены, и только потом расставляем порядок.
function digitsSetOk(){
if(S.digits.length!==CODE.length)return false;
const a=S.digits.slice().sort(function(x,y){return x-y;});
const b=CODE.slice().sort(function(x,y){return x-y;});
for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;
return true;
}
function digitsWarn(){
if(els.hint)els.hint.style.display='';
if(els.buttons)els.buttons.hidden=false;      // чтобы можно было убрать лишнюю цифру
if(els.check)els.check.disabled=true;
hint('Эти цифры не подходят: среди них есть лишние или не хватает нужных. Проверьте, какие цифры были в записи, и поправьте.','err');
if(!S.setWarned){
S.setWarned=true;
S.attempts++;
try{put({attempts:S.attempts});}catch(e){}
playSfx('sfx_ui_error.mp3',.55);
}
}
function toSwapIfReady(){
if(S.digits.length<6){
if(els.hint)els.hint.style.display='';
hint('Сначала введите все шесть цифр с карточек — потом расставим порядок.','err');
return false;}
if(!digitsSetOk()){digitsWarn();return false;}
// цифры пишем вместе с переходом: иначе экран расстановки перечитывал из комнаты
// старое значение и ячейки откатывались
put({stage:'swap',startsAt:Date.now(),digits:S.digits.join(',')});
return true;
}
function schedulePlay(list,at,stage){
const delay=at-Date.now();
if(delay>250){status('Видео начнётся одновременно у всех…');startTimer=setTimeout(function(){status('');playList(list,0,stage);},delay);}
else{playList(list,Math.max(0,Date.now()-at),stage);}
}
function playList(list,offset,stage){
let i=0;
(function tryOne(){
if(i>=list.length){if(cap()){if(stage==='intro')put({stage:'sequence',startsAt:Date.now()+2000});else if(stage==='sequence'){S.seqEnded=true;toSwapIfReady();}else if(stage==='reveal')put({stage:'done',startsAt:Date.now()});}return;}
els.mediareq.hidden=true;
const src=list[i++]+'?v=9';
// Ролик уже предзагружен на экране ожидания: повторная установка того же src обрывала
// загрузку и начинала скачивать файл заново — отсюда «кнопка думает минутами».
if(lastSrc===src&&!video.error){try{video.currentTime=0;}catch(e){}}
else{lastSrc=src;video.src=src;}
video.muted=!S.soundOn;
let settled=false;let seeked=false;
const doSeek=function(){if(seeked||offset<=0.5)return;seeked=true;try{const d=video.duration||0;video.currentTime=d>0?Math.min(offset,Math.max(0,d-0.5)):offset;}catch(e){}};
const to=setTimeout(function(){if(!settled&&video.readyState===0){settled=true;tryOne();}},30000);
video.onloadedmetadata=function(){settled=true;clearTimeout(to);doSeek();};
video.oncanplay=function(){settled=true;clearTimeout(to);doSeek();};
video.onerror=function(){if(!settled){settled=true;clearTimeout(to);tryOne();}};
video.onended=function(){if(cap()){if(stage==='intro')put({stage:'sequence',startsAt:Date.now()+2000});else if(stage==='sequence'){S.seqEnded=true;toSwapIfReady();}else if(stage==='reveal')put({stage:'done',startsAt:Date.now()});}};
video.play().catch(function(){video.muted=true;S.soundOn=false;els.sound.textContent='×';video.play().catch(function(){els.mediareq.hidden=false;});});
// Если через 6 секунд картинки нет — один раз перезагружаем файл и пробуем снова.
// Если и это не помогло, показываем кнопку ручного запуска (без пропуска видео).
clearTimeout(stallTimer);
stallTimer=setTimeout(function(){
if(!active||!video)return;
if(curStage!=='intro'&&curStage!=='sequence'&&curStage!=='reveal')return;
if(!video.paused&&video.readyState>=2)return;
status('Видео не начинается — перезагружаем…');
try{video.src=src;video.load();video.play().catch(function(){});}catch(e){}
stallTimer=setTimeout(function(){
if(!active||!video)return;
if(curStage!=='intro'&&curStage!=='sequence'&&curStage!=='reveal')return;
if(!video.paused&&video.readyState>=2)return;
els.mediareq.hidden=false;
status('Видео не начинается. Проверьте связь.');
},8000);
},6000);
})();
}
function onRow(d){
if(!cap()||S.accepted)return;
if(curStage!=='sequence'&&curStage!=='swap')return;
if(S.digits.includes(d))return;
if(S.digits.length>=6)return;
S.digits.push(d);S.setWarned=false;renderCells();writeDigits();
// собраны все шесть — проверяем, те ли цифры; к порядку идём, когда ролик уже кончился
if(curStage==='sequence'&&S.digits.length===6){
if(digitsSetOk()){if(S.seqEnded)toSwapIfReady();}
else digitsWarn();
}
}
function onCell(i){
if(!cap()||S.accepted)return;
// на шаге ввода выделяем цифру, чтобы убрать лишнюю (порядок здесь не важен)
if(curStage==='sequence'){
if(S.digits[i]===undefined)return;
S.hl=(S.hl===i)?null:i;
renderCells();
hint(S.hl===null?'Выберите цифру, чтобы убрать лишнюю.':'Нажмите «Убрать выбранную», чтобы убрать эту цифру.');
return;
}
if(curStage!=='swap')return;
if(S.digits[i]===undefined)return;
if(S.hl===null){S.hl=i;hint('Ячейка выделена. Теперь нажмите ячейку, с которой хотите поменять её местами.');}
else if(S.hl===i){S.hl=null;hint(HINT_SWAP);}
else{const t=S.digits[S.hl];S.digits[S.hl]=S.digits[i];S.digits[i]=t;S.hl=null;hint(HINT_SWAP);}
renderCells();writeDigits();
}
function onRemove(){
if(!cap()||S.accepted||(curStage!=='swap'&&curStage!=='sequence')||S.hl===null)return;
S.digits.splice(S.hl,1);S.setWarned=false;S.hl=null;
hint(curStage==='swap'?HINT_SWAP:'Выберите лишнюю цифру и нажмите «Убрать выбранную».');
renderCells();writeDigits();
}
function writeDigits(){clearTimeout(digTimer);digTimer=setTimeout(function(){put({digits:S.digits.join(',')});},250);}
function renderCells(){
if(!els.cells)return;
els.cells.innerHTML='';
for(let i=0;i<6;i++){const c=document.createElement('div');c.className='t2-cell'+(S.hl===i?' hl':'');c.dataset.i=i;c.textContent=S.digits[i]!==undefined?S.digits[i]:'';els.cells.appendChild(c);}
els.check.disabled=!(cap()&&curStage==='swap'&&S.digits.length===6&&!S.accepted);
els.remove.disabled=(S.hl===null);
}
function onCheck(){
if(!cap()||S.accepted||curStage!=='swap'||S.digits.length!==6)return;
const ok=S.digits.every(function(d,i){return d===CODE[i];});
if(ok){S.accepted=true;playSfx('sfx_crystal_ready.mp3',.6);stopMusic();hint('Код принят!','ok');writeDigits();put({stage:'reveal',startsAt:Date.now()+1500,accepted:true});}
else{
S.attempts++;S.hl=null;clearTimeout(digTimer);
// неверная попытка уходит в комнату: по ней считается импульс команды (-8)
put({attempts:S.attempts});
playSfx('sfx_ui_error.mp3',.55);
els.cells.classList.add('shake');setTimeout(function(){els.cells.classList.remove('shake');},500);
hint('Код не принят. Цифры остались на местах — поменяйте те, что не подходят.','err');
const a=S.attempts;
setTimeout(function(){if(S.accepted)return;
if(a===1)hint('Подсказка 1: берите только полностью собранные фигуры из таблицы.');
else if(a===2)hint('Подсказка 2: вводите от меньшей к большей.');
else if(a===3)hint('Подсказка 3: нужные формы — ромб, овал, квадрат, бесконечность, крест, дуга.');
else hint('Явная помощь: 1 2 3 5 8 9.');},1600);
renderCells();
}
}
return{mount:mount,unmount:unmount};
})();