// task02.js — Задание 2 «Кристальный шифр» (редакция 4.0).
// Порядок: v02_intro.mp4 (инструкция) -> crystal_sequence.mp4 (фигуры + таблицы + ячейки)
// -> перестановка и проверка -> door_lum_reveal.mp4 (дверь и Лум).
window.Task02=(function(){
const MEDIA={intro:'assets/v02_intro.mp4',sequence:'assets/crystal_sequence.mp4',reveal:'assets/door_lum_reveal.mp4'};
const LEFT=[
{shape:'◆',digit:8},{shape:'■',digit:5},{shape:'✚',digit:9},{shape:'▲',digit:4},{shape:'︓',digit:0}
];
const RIGHT=[
{shape:'⬭',digit:1},{shape:'∞',digit:3},{shape:'⌒',digit:2},{shape:'≈',digit:6},{shape:';',digit:7}
];
const CODE=[1,2,3,5,8,9];
let S=null,root=null,video=null,els={};
function fresh(){return{stage:'intro',digits:[],hl:null,attempts:0,accepted:false,soundOn:true};}
function mount(container){
root=container;S=fresh();
root.innerHTML=
'<video class="t2-video" playsinline></video>'+
'<div class="t2-panel left" id="t2-left" hidden></div>'+
'<div class="t2-panel right" id="t2-right" hidden></div>'+
'<div class="t2-status" id="t2-status"></div>'+
'<button class="t2-sound" id="t2-sound" type="button" title="Звук">♪</button>'+
'<div class="t2-cells-wrap" id="t2-cells-wrap" hidden><div class="t2-cells" id="t2-cells"></div></div>'+
'<div class="t2-controls" id="t2-controls" hidden>'+
'<div class="t2-hint" id="t2-hint"></div>'+
'<div class="t2-buttons">'+
'<button class="t2-btn" id="t2-remove" type="button">Убрать выбранную</button>'+
'<button class="t2-btn" id="t2-repeat" type="button">Повторить видео</button>'+
'<button class="t2-btn primary" id="t2-check" type="button" disabled>Открыть дверь</button>'+
'</div></div>'+
'<button class="t2-btn primary t2-next" id="t2-next" type="button" hidden>Продолжить →</button>';
video=root.querySelector('.t2-video');
els={left:root.querySelector('#t2-left'),right:root.querySelector('#t2-right'),status:root.querySelector('#t2-status'),sound:root.querySelector('#t2-sound'),cellsWrap:root.querySelector('#t2-cells-wrap'),cells:root.querySelector('#t2-cells'),controls:root.querySelector('#t2-controls'),hint:root.querySelector('#t2-hint'),remove:root.querySelector('#t2-remove'),repeat:root.querySelector('#t2-repeat'),check:root.querySelector('#t2-check'),next:root.querySelector('#t2-next')};
LEFT.forEach(it=>els.left.appendChild(makeRow(it)));
RIGHT.forEach(it=>els.right.appendChild(makeRow(it)));
els.cells.addEventListener('click',e=>{const c=e.target.closest('.t2-cell');if(c)onCell(+c.dataset.i);});
els.remove.addEventListener('click',onRemove);
els.repeat.addEventListener('click',()=>startStage('sequence'));
els.check.addEventListener('click',onCheck);
els.sound.addEventListener('click',toggleSound);
renderCells();
startStage('intro');
}
function makeRow(it){const r=document.createElement('div');r.className='t2-row';r.innerHTML='<span class="shape">'+it.shape+'</span><span class="digit">'+it.digit+'</span>';r.addEventListener('click',()=>onRow(it.digit));return r;}
function status(t){els.status.textContent=t||'';els.status.style.display=t?'':'none';}
function hint(t,kind){els.hint.textContent=t||'';els.hint.className='t2-hint'+(kind?' '+kind:'');}
function toggleSound(){S.soundOn=!S.soundOn;video.muted=!S.soundOn;els.sound.textContent=S.soundOn?'♪':'×';if(S.soundOn&&video.paused&&S.stage!=='swap')video.play().catch(()=>{});}
function showNext(target){els.next.hidden=false;els.next.onclick=()=>{els.next.hidden=true;if(target)startStage(target);else finishDone();};}
function play(src,nextStage){
video.src=src;video.muted=!S.soundOn;
let settled=false;
const fail=()=>{if(settled)return;settled=true;status('Нет файла '+src.split('/').pop()+'. Тестовый режим: нажмите «Продолжить».');showNext(nextStage);};
const to=setTimeout(fail,4000);
video.onloadeddata=()=>{settled=true;clearTimeout(to);els.next.hidden=true;};
video.onerror=()=>{clearTimeout(to);fail();};
video.onended=()=>{if(nextStage)startStage(nextStage);else finishDone();};
video.play().catch(()=>{video.muted=true;S.soundOn=false;els.sound.textContent='×';video.play().catch(()=>{status('Нажмите на экран, чтобы включить видео');const once=()=>{root.removeEventListener('pointerdown',once);video.play().catch(()=>{});};root.addEventListener('pointerdown',once);});});
}
function startStage(st){
if(S.accepted&&st!=='reveal'&&st!=='done')return;
S.stage=st;els.next.hidden=true;
if(st==='intro'){els.left.hidden=true;els.right.hidden=true;els.cellsWrap.hidden=true;els.controls.hidden=true;status('Видео-инструкция… слушайте Вольта.');play(MEDIA.intro,'sequence');}
else if(st==='sequence'){els.left.hidden=false;els.right.hidden=false;els.cellsWrap.hidden=false;els.controls.hidden=true;status('Капитан: нажимайте строки таблицы с узнанными фигурами.');play(MEDIA.sequence,'swap');}
else if(st==='swap'){els.left.hidden=false;els.right.hidden=false;els.cellsWrap.hidden=false;els.controls.hidden=false;video.pause();status('');hint('Расположите цифры по возрастанию. Чтобы поменять их местами, нажмите сначала одну ячейку, затем другую.');renderCells();}
else if(st==='reveal'){els.left.hidden=true;els.right.hidden=true;els.cellsWrap.hidden=true;els.controls.hidden=true;status('Дверь открывается…');play(MEDIA.reveal,null);}
}
function finishDone(){S.stage='done';status('Задание 2 пройдено. Переход к заданию 3 — на этапе интеграции.');}
function onRow(d){
if(S.accepted)return;
if(S.stage!=='sequence'&&S.stage!=='swap')return;
if(S.digits.includes(d))return;
if(S.digits.length>=6)return;
S.digits.push(d);renderCells();
}
function onCell(i){
if(S.accepted||S.stage!=='swap')return;
if(S.digits[i]===undefined)return;
if(S.hl===null){S.hl=i;}
else if(S.hl===i){S.hl=null;}
else{const t=S.digits[S.hl];S.digits[S.hl]=S.digits[i];S.digits[i]=t;S.hl=null;}
renderCells();
}
function onRemove(){
if(S.accepted||S.stage!=='swap'||S.hl===null)return;
S.digits.splice(S.hl,1);S.hl=null;renderCells();
}
function renderCells(){
els.cells.innerHTML='';
for(let i=0;i<6;i++){const c=document.createElement('div');c.className='t2-cell'+(S.hl===i?' hl':'');c.dataset.i=i;c.textContent=S.digits[i]!==undefined?S.digits[i]:'';els.cells.appendChild(c);}
els.check.disabled=!(S.stage==='swap'&&S.digits.length===6&&!S.accepted);
els.remove.disabled=(S.hl===null);
}
function onCheck(){
if(S.accepted||S.stage!=='swap'||S.digits.length!==6)return;
const ok=S.digits.every((d,i)=>d===CODE[i]);
if(ok){S.accepted=true;hint('Код принят!','ok');startStage('reveal');}
else{
S.attempts++;S.hl=null;
els.cells.classList.add('shake');setTimeout(()=>els.cells.classList.remove('shake'),500);
hint('Код не принят. Проверьте выбранные фигуры и порядок цифр.','err');
const a=S.attempts;
setTimeout(()=>{if(S.accepted)return;
if(a===1)hint('Подсказка 1: берите только полностью собранные фигуры из таблицы.');
else if(a===2)hint('Подсказка 2: вводите от меньшей к большей.');
else if(a===3)hint('Подсказка 3: нужные формы — ромб, овал, квадрат, бесконечность, крест, дуга.');
else hint('Явная помощь: 1 2 3 5 8 9.');},1600);
renderCells();
}
}
function unmount(){if(video){video.pause();video.removeAttribute('src');video.load();}if(root)root.innerHTML='';S=null;}
return{mount:mount,unmount:unmount};
})();