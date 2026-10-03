// task02.js — Задание 2 «Кристальный шифр» (редакция 4.0). Медиа по реестру:
// assets/v02_intro.mp4, assets/crystal_sequence.mp4, assets/door_lum_reveal.mp4
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
function fresh(){return{phase:'intro',digits:[],hl:null,attempts:0,accepted:false};}
function mount(container){
root=container;S=fresh();
root.innerHTML='<video class="t2-video" playsinline></video>'
+'<div class="t2-panel left" id="t2-left"></div>'
+'<div class="t2-panel right" id="t2-right"></div>'
+'<div class="t2-status" id="t2-status"></div>'
+'<div class="t2-controls" id="t2-controls" hidden>'
+'<div class="t2-hint" id="t2-hint"></div>'
+'<div class="t2-cells" id="t2-cells"></div>'
+'<div class="t2-buttons">'
+'<button class="t2-btn" id="t2-remove" type="button">Убрать выбранную</button>'
+'<button class="t2-btn" id="t2-repeat" type="button">Повторить видео</button>'
+'<button class="t2-btn primary" id="t2-check" type="button" disabled>Открыть дверь</button>'
+'</div></div>';
video=root.querySelector('.t2-video');
els={left:root.querySelector('#t2-left'),right:root.querySelector('#t2-right'),status:root.querySelector('#t2-status'),controls:root.querySelector('#t2-controls'),hint:root.querySelector('#t2-hint'),cells:root.querySelector('#t2-cells'),remove:root.querySelector('#t2-remove'),repeat:root.querySelector('#t2-repeat'),check:root.querySelector('#t2-check')};
LEFT.forEach(it=>els.left.appendChild(makeRow(it)));
RIGHT.forEach(it=>els.right.appendChild(makeRow(it)));
els.cells.addEventListener('click',e=>{const c=e.target.closest('.t2-cell');if(c)onCell(+c.dataset.i);});
els.remove.addEventListener('click',onRemove);
els.repeat.addEventListener('click',()=>startIntro());
els.check.addEventListener('click',onCheck);
startIntro();
}
function makeRow(it){const r=document.createElement('div');r.className='t2-row';r.innerHTML='<span class="shape">'+it.shape+'</span><span class="digit">'+it.digit+'</span>';r.addEventListener('click',()=>onRow(it.digit));return r;}
function status(t){els.status.textContent=t||'';}
function hint(t,kind){els.hint.textContent=t||'';els.hint.className='t2-hint'+(kind?' '+kind:'');}
function startIntro(){
if(S.accepted)return;
S.phase='intro';els.controls.hidden=true;
status('Видео с инструкцией… во время видео капитан отмечает цифры.');
video.src=MEDIA.intro;
let settled=false;
const fail=()=>{if(!settled){settled=true;testMode();}};
const to=setTimeout(fail,4000);
video.onloadeddata=()=>{settled=true;clearTimeout(to);};
video.onerror=()=>{clearTimeout(to);fail();};
video.onended=()=>afterVideo();
const tryPlay=()=>video.play().catch(()=>{video.muted=true;video.play().catch(()=>{status('Нажмите на экран, чтобы включить видео');const once=()=>{root.removeEventListener('pointerdown',once);video.play().catch(()=>{});};root.addEventListener('pointerdown',once);});});
tryPlay();
}
function testMode(){
status('Видеофайл не найден — тестовый режим без видео.');
afterVideo();
}
function afterVideo(){
S.phase='swap';
els.controls.hidden=false;
hint('Расположите цифры по возрастанию. Чтобы поменять их местами, нажмите сначала одну ячейку, затем другую.');
renderCells();
}
function onRow(d){
if(S.accepted)return;
if(S.digits.includes(d))return;
if(S.digits.length>=6)return;
S.digits.push(d);
renderCells();
}
function onCell(i){
if(S.accepted||S.phase!=='swap')return;
if(S.digits[i]===undefined)return;
if(S.hl===null){S.hl=i;}
else if(S.hl===i){S.hl=null;}
else{const t=S.digits[S.hl];S.digits[S.hl]=S.digits[i];S.digits[i]=t;S.hl=null;}
renderCells();
}
function onRemove(){
if(S.accepted||S.hl===null)return;
S.digits.splice(S.hl,1);S.hl=null;
renderCells();
}
function renderCells(){
els.cells.innerHTML='';
for(let i=0;i<6;i++){const c=document.createElement('div');c.className='t2-cell'+(S.hl===i?' hl':'');c.dataset.i=i;c.textContent=S.digits[i]!==undefined?S.digits[i]:'';els.cells.appendChild(c);}
els.check.disabled=!(S.phase==='swap'&&S.digits.length===6&&!S.accepted);
els.remove.disabled=(S.hl===null);
if(S.hl!==null&&S.phase==='swap')hint('Теперь нажмите ячейку, с которой хотите поменять её местами.');
}
function onCheck(){
if(S.accepted||S.digits.length!==6)return;
const ok=S.digits.every((d,i)=>d===CODE[i]);
if(ok){
S.accepted=true;S.phase='done';
els.check.disabled=true;els.remove.disabled=true;
hint('Код принят! Дверь открывается…','ok');
status('');
video.src=MEDIA.reveal;
video.onended=null;video.onerror=null;
video.play().catch(()=>{});
setTimeout(()=>{hint('Задание 2 пройдено. Переход к заданию 3 будет подключён на этапе интеграции.','ok');},2500);
}else{
S.attempts++;S.hl=null;
els.cells.classList.add('shake');
setTimeout(()=>els.cells.classList.remove('shake'),500);
hint('Код не принят. Проверьте выбранные фигуры и порядок цифр.','err');
const a=S.attempts;
setTimeout(()=>{
if(S.accepted)return;
if(a===1)hint('Подсказка 1: берите только полностью собранные фигуры из таблицы.');
else if(a===2)hint('Подсказка 2: вводите цифры от меньшей к большей.');
else if(a===3)hint('Подсказка 3: нужные формы — ромб, овал, квадрат, бесконечность, крест, дуга.');
else hint('Явная помощь: 1 2 3 5 8 9.');
},1600);
renderCells();
}
}
function unmount(){
if(video){video.pause();video.removeAttribute('src');video.load();}
if(root)root.innerHTML='';
S=null;
}
return{mount:mount,unmount:unmount};
})();