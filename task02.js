// task02.js — модуль задания 2 «Кристальный шифр» для командной интеграции.
// У игроков только просмотр таблицы; ввод и запуск видео — у капитана; старт видео общий по startsAt.
window.Task02=(function(){
const MEDIA={intro:['assets/v02_intro.mp4','v02_intro.mp4'],sequence:['assets/crystal_sequence.mp4','crystal_sequence.mp4'],reveal:['assets/door_open_lum.mp4','door_open_lum.mp4']};
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
let root=null,video=null,els={},S=null,active=false,lastKey='',digTimer=null,startTimer=null,curStage='wait';
function cap(){return !!(window.NET&&window.NET.isCaptain());}
function t2state(){const r=window.NET&&window.NET.room;return r&&r.tasks&&r.tasks.task02?r.tasks.task02:null;}
function ref(){return firebase.database().ref('rooms/'+window.NET.room.code+'/tasks/task02');}
function mount(container){
if(root)unmount();
active=true;
S={digits:[],hl:null,attempts:0,accepted:false,soundOn:cap()};
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
'<div class="t2-start" id="t2-start"><h1>Задание 2 · Кристальный шифр</h1><p>Лум за дверью. Вольт покажет инструкцию, затем осколки соберутся в фигуры. Капитан нажимает строки таблицы, после видео располагает цифры и открывает дверь. Остальные смотрят и подсказывают голосом.</p><button id="t2-start-btn" type="button">▶ Запустить видео для всех</button><p class="t2-nextnote" id="t2-waitnote" hidden>Ждём, когда капитан запустит видео…</p></div>';
video=root.querySelector('.t2-video');
els={left:root.querySelector('#t2-left'),right:root.querySelector('#t2-right'),status:root.querySelector('#t2-status'),sound:root.querySelector('#t2-sound'),bottom:root.querySelector('#t2-bottom'),hint:root.querySelector('#t2-hint'),cells:root.querySelector('#t2-cells'),buttons:root.querySelector('#t2-buttons'),remove:root.querySelector('#t2-remove'),repeat:root.querySelector('#t2-repeat'),check:root.querySelector('#t2-check'),nextwrap:root.querySelector('#t2-nextwrap'),continueBtn:root.querySelector('#t2-continue'),playernote:root.querySelector('#t2-playernote'),donenote:root.querySelector('#t2-donenote'),start:root.querySelector('#t2-start'),startBtn:root.querySelector('#t2-start-btn'),waitnote:root.querySelector('#t2-waitnote')};
LEFT.forEach(function(it){els.left.appendChild(makeRow(it));});
RIGHT.forEach(function(it){els.right.appendChild(makeRow(it));});
els.cells.addEventListener('click',function(e){const c=e.target.closest('.t2-cell');if(c)onCell(+c.dataset.i);});
els.remove.addEventListener('click',onRemove);
els.repeat.addEventListener('click',function(){if(cap())ref().update({stage:'sequence',startsAt:Date.now()+1500});});
els.check.addEventListener('click',onCheck);
els.sound.addEventListener('click',toggleSound);
els.startBtn.addEventListener('click',function(){if(!cap())return;S.soundOn=true;video.muted=false;els.sound.textContent='♪';ref().update({stage:'intro',startsAt:Date.now()+3000,rev:1});});
els.continueBtn.addEventListener('click',function(){els.continueBtn.hidden=true;els.donenote.hidden=false;});
renderCells();
render(window.NET.room);
window.NET.onRoom(function(room){if(active)render(room);});
}
function makeRow(it){const r=document.createElement('div');r.className='t2-row';r.innerHTML='<span class="shape">'+SHAPES[it.id]+'</span><span class="digit">'+it.digit+'</span>';r.addEventListener('click',function(){onRow(it.digit);});return r;}
function unmount(){active=false;clearTimeout(startTimer);clearTimeout(digTimer);if(video){video.pause();video.removeAttribute('src');video.load();}if(root&&root.parentNode)root.parentNode.removeChild(root);root=null;video=null;els={};lastKey='';curStage='wait';}
function status(t){if(!els.status)return;els.status.textContent=t||'';els.status.style.display=t?'':'none';}
function hint(t,kind){if(!els.hint)return;els.hint.textContent=t||'';els.hint.className='t2-hint'+(kind?' '+kind:'');}
function toggleSound(){S.soundOn=!S.soundOn;video.muted=!S.soundOn;els.sound.textContent=S.soundOn?'♪':'×';if(S.soundOn&&video.paused&&(curStage==='intro'||curStage==='sequence'||curStage==='reveal'))video.play().catch(function(){});}
function render(room){
const t=room&&room.tasks&&room.tasks.task02;
const stage=t?t.stage:'wait';
const at=(t&&t.startsAt)||0;
const digits=(t&&t.digits)?String(t.digits).split(',').filter(function(x){return x!=='';}).map(Number):[];
const key=stage+':'+at;
if(key!==lastKey){lastKey=key;S.digits=digits.slice();S.hl=null;S.attempts=0;applyStage(stage,at);}
else if(!cap()&&(stage==='swap'||stage==='sequence')){S.digits=digits.slice();renderCells();}
els.startBtn.hidden=!(cap()&&stage==='wait');
els.waitnote.hidden=!(!cap()&&stage==='wait');
els.continueBtn.hidden=!(cap()&&stage==='done');
els.playernote.hidden=!(!cap()&&stage==='done');
}
function applyStage(stage,at){
curStage=stage;clearTimeout(startTimer);
if(stage==='wait'){els.start.hidden=false;els.left.hidden=true;els.right.hidden=true;els.bottom.hidden=true;els.nextwrap.hidden=true;status('');}
else if(stage==='intro'){els.start.hidden=true;els.left.hidden=true;els.right.hidden=true;els.bottom.hidden=true;els.nextwrap.hidden=true;schedulePlay(MEDIA.intro,at,'intro');}
else if(stage==='sequence'){els.start.hidden=true;els.left.hidden=false;els.right.hidden=false;els.bottom.hidden=false;els.bottom.classList.add('compact');els.buttons.hidden=true;els.hint.style.display='none';els.nextwrap.hidden=true;schedulePlay(MEDIA.sequence,at,'sequence');}
else if(stage==='swap'){els.start.hidden=true;els.left.hidden=false;els.right.hidden=false;els.bottom.hidden=false;els.bottom.classList.remove('compact');els.nextwrap.hidden=true;video.pause();status('');
if(cap()){els.buttons.hidden=false;els.hint.style.display='';hint(HINT_SWAP);}else{els.buttons.hidden=true;els.hint.style.display='';hint(HINT_PLAYER);}
renderCells();}
else if(stage==='reveal'){els.start.hidden=true;els.left.hidden=true;els.right.hidden=true;els.bottom.hidden=true;els.nextwrap.hidden=true;schedulePlay(MEDIA.reveal,at,'reveal');}
else if(stage==='done'){els.start.hidden=true;els.left.hidden=true;els.right.hidden=true;els.bottom.hidden=true;els.nextwrap.hidden=false;status('');}
}
function schedulePlay(list,at,stage){
const delay=at-Date.now();
if(delay>250){status('Видео начнётся одновременно у всех…');startTimer=setTimeout(function(){status('');playList(list,0,stage);},delay);}
else{playList(list,Math.max(0,Date.now()-at),stage);}
}
function playList(list,offset,stage){
let i=0;
(function tryOne(){
if(i>=list.length){if(stage==='reveal'){ref().parent?0:0;if(cap())ref().update({stage:'done',startsAt:Date.now()});}else if(cap()){ref().update(stage==='intro'?{stage:'sequence',startsAt:Date.now()+2000}:{stage:'swap',startsAt:Date.now()});}return;}
const src=list[i++]+'?v=9';
video.src=src;video.muted=!S.soundOn;
let settled=false;let seeked=false;
const doSeek=function(){if(seeked||offset<=0.5)return;seeked=true;try{const d=video.duration||0;video.currentTime=d>0?Math.min(offset,Math.max(0,d-0.5)):offset;}catch(e){}};
const to=setTimeout(function(){if(!settled&&video.readyState===0){settled=true;tryOne();}},15000);
video.onloadedmetadata=function(){settled=true;clearTimeout(to);doSeek();};
video.oncanplay=function(){settled=true;clearTimeout(to);doSeek();};
video.onerror=function(){if(!settled){settled=true;clearTimeout(to);tryOne();}};
video.onended=function(){if(cap()){if(stage==='intro')ref().update({stage:'sequence',startsAt:Date.now()+2000});else if(stage==='sequence')ref().update({stage:'swap',startsAt:Date.now()});else if(stage==='reveal')ref().update({stage:'done',startsAt:Date.now()});}};
video.play().catch(function(){video.muted=true;S.soundOn=false;els.sound.textContent='×';video.play().catch(function(){});});
})();
}
function onRow(d){
if(!cap()||S.accepted)return;
if(curStage!=='sequence'&&curStage!=='swap')return;
if(S.digits.includes(d))return;
if(S.digits.length>=6)return;
S.digits.push(d);renderCells();writeDigits();
}
function onCell(i){
if(!cap()||S.accepted||curStage!=='swap')return;
if(S.digits[i]===undefined)return;
if(S.hl===null){S.hl=i;hint('Ячейка выделена. Теперь нажмите ячейку, с которой хотите поменять её местами.');}
else if(S.hl===i){S.hl=null;hint(HINT_SWAP);}
else{const t=S.digits[S.hl];S.digits[S.hl]=S.digits[i];S.digits[i]=t;S.hl=null;hint(HINT_SWAP);}
renderCells();writeDigits();
}
function onRemove(){
if(!cap()||S.accepted||curStage!=='swap'||S.hl===null)return;
S.digits.splice(S.hl,1);S.hl=null;hint(HINT_SWAP);renderCells();writeDigits();
}
function writeDigits(){clearTimeout(digTimer);digTimer=setTimeout(function(){ref().update({digits:S.digits.join(',')});},250);}
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
if(ok){S.accepted=true;hint('Код принят!','ok');writeDigits();ref().update({stage:'reveal',startsAt:Date.now()+1500,accepted:true});}
else{
S.attempts++;S.hl=null;
els.cells.classList.add('shake');setTimeout(function(){els.cells.classList.remove('shake');},500);
hint('Код не принят. Проверьте выбранные фигуры и порядок цифр.','err');
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