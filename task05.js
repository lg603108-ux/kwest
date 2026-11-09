// task05.js — задание 5 «Голос аномалии». Искажённую запись слышит только капитан,
// остальным устройствам уходит нейтральный статус без текста фразы.
window.Task05=(function(){
// Тексты фраз и помощи — дословно из ТЗ (раздел 7). Нормализованный вариант — для сверки ответа.
const FRAGS=[
{phrase:'Я — это ты',file:'t05_phrase_01_ya_eto_ty.mp3',clean:'t05_phrase_01_clean.aac',h1:'Запись идёт задом наперёд; нужно восстановить направление.',h2:'Я — это …'},
{phrase:'Повтори за мной',file:'t05_phrase_02_povtori_za_mnoy.MP3',clean:'t05_phrase_02_clean.aac',h1:'Голос замедлен и понижен; прислушайтесь к ритму слов.',h2:'… за мной.'},
{phrase:'Не отставай',file:'t05_phrase_03_ne_otstavay.MP3',clean:'t05_phrase_03_clean.aac',h1:'Сквозь шум слышны отдельные звуки. Прислушайтесь к ритму и длине слов.',h2:'Не …'},
{phrase:'Танец откроет путь',file:'t05_phrase_04_tanets_otkroet_put.MP3',clean:'t05_phrase_04_clean.aac',h1:'Проследите одну голосовую линию от начала до конца.',h2:'Танец … путь.'}
];
const FULL='Я — это ты. Повтори за мной. Не отставай. Танец откроет путь.';
let active=false,root=null,video=null,bg=null,els={},roomState=null,task=null,roomOff=null;
let startTimer=null,watchdogTimer=null,tickTimer=null,mediaKey='',mediaRetries=0,starting=false;
let audio=null,audioTimer=null,audioKey='',playingLocal=false;
let resultKey='',advanceKey='',sfxKey='',stageKey='',answerFrag=-1,kbOpen=false;
// Немедленный отклик на ответ: показываем вердикт и подсказку сразу, не дожидаясь базы.
let localHint=0,localResult=-1,localResultAt=0,lastSubmit=0;
function cap(){const room=roomState||(window.NET&&NET.room);return !!(window.NET&&NET.uid&&room&&room.captain===NET.uid);}
function db(){return firebase.database();}
function publicRef(){return db().ref('rooms/'+NET.room.code+'/tasks/task05');}
function write(obj){return publicRef().update(obj).catch(function(e){error(e);throw e;});}
function error(e){status('Ошибка связи: '+(e&&e.message||e));}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
// Нормализация ответа: регистр, ё/е, тире и знаки препинания, лишние пробелы.
function norm(s){return String(s||'').toLowerCase().replace(/ё/g,'е').replace(/[-–—_]+/g,' ').replace(/[.,!?;:«»"'()\[\]]/g,' ').replace(/\s+/g,' ').trim();}
function frag(){const i=Math.min(3,Math.max(0,task&&typeof task.fragment==='number'?task.fragment:0));return FRAGS[i];}
// --- сверка ответа ---
// Опечатки принимаются только явным осторожным правилом: та же фраза слово в слово,
// но не больше одной правки (вставка/замена/удаление одного символа) и не короче 8 символов.
// Никакой «похожести по смыслу»: пропуск «не» и замена ключевых слов не принимаются.
function lev(a,b){
const m=a.length,n=b.length;let prev=[],cur=[],i,j;
for(j=0;j<=n;j++)prev[j]=j;
for(i=1;i<=m;i++){cur=[i];for(j=1;j<=n;j++){cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a.charAt(i-1)===b.charAt(j-1)?0:1));}prev=cur;}
return prev[n];
}
function accepts(answer,phrase){
const a=norm(answer),p=norm(phrase);
if(!a)return false;
if(a===p)return true;
const aw=a.split(' '),pw=p.split(' ');
if(aw.length!==pw.length)return false;
if(p.length<8)return false;
return lev(a,p)<=1;
}
function playSfx(file,volume){try{var x=new Audio('assets/'+file);x.volume=volume;x.play().catch(function(){});}catch(e){}}
// --- монтаж ---
function mount(container){
if(root)unmount();
active=true;mediaKey='';mediaRetries=0;starting=false;resultKey='';advanceKey='';sfxKey='';stageKey='';answerFrag=-1;kbOpen=false;localHint=0;localResult=-1;localResultAt=0;
stopAudio();stopMedia();
// Глушим звуки предыдущих заданий (оборона держит клипы в пулах и не гаснет сама).
try{if(window.__stopQuestAudio)window.__stopQuestAudio();}catch(e){}
root=document.createElement('div');root.id='t5';root.innerHTML=
'<video class="t5-bg" playsinline muted loop preload="auto" src="assets/anomaly_rift.mp4"></video>'+
'<div class="t5-vignette"></div>'+
'<video class="t5-video" playsinline preload="auto"></video>'+
'<section class="t5-screen t5-wait"><p class="t5-eyebrow">ЗАДАНИЕ 5</p><h1>Голос аномалии</h1><p class="t5-note">Аномалия передаёт сообщение по частям, и каждая часть искажена по-своему. Слушайте вместе и повторяйте вслух, что услышали. Капитан введёт фразу — четыре фразы, и сообщение собрано.</p><button id="t5-start" class="t5-primary" type="button">▶ Запустить инструкцию для всех</button><p class="t5-note" id="t5-waitnote">Ждём, когда капитан запустит инструкцию…</p><p class="t5-note">Запись слышит только капитан: остальные устройства показывают номер фрагмента и статус.</p></section>'+
'<div class="t5-top" id="t5-top" hidden><div class="t5-dots"><span class="t5-dot" data-i="0"></span><span class="t5-dot" data-i="1"></span><span class="t5-dot" data-i="2"></span><span class="t5-dot" data-i="3"></span></div><span class="t5-frag" id="t5-frag">Фрагмент 1 из 4</span></div>'+
'<div class="t5-center" id="t5-center" hidden><button class="t5-listen-big" id="t5-play" type="button">▶ СЛУШАТЬ</button><div class="t5-wave" id="t5-wave" hidden><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><p class="t5-pstatus" id="t5-pstatus">Обсудите услышанное</p></div>'+
'<form class="t5-panel" id="t5-panel" hidden autocomplete="off"><label for="t5-answer">Фраза</label><input id="t5-answer" readonly inputmode="none" autocomplete="off" autocapitalize="off" placeholder="Введите услышанную фразу"><button class="t5-primary" type="submit" id="t5-check">Проверить</button></form>'+
'<div class="t5-hint" id="t5-hint" hidden><b id="t5-hint-label">Подсказка</b><span id="t5-hint-text"></span><button class="t5-clean" id="t5-clean" type="button" hidden>Помощь Вольта: чистая запись</button></div>'+
'<div class="t5-kbwin" id="t5-kbwin" hidden><p class="t5-kbwin-label">Введите услышанную фразу</p><div class="t5-kbrow"><input class="t5-kbwin-input" id="t5-kbwin-input" type="text" autocomplete="off" autocapitalize="off" enterkeyhint="go"><button class="t5-primary t5-kbok" type="button" id="t5-kbwin-ok">Проверить</button></div><button class="t5-kblink" type="button" id="t5-kbwin-cancel">Отмена</button></div>'+
'<div class="t5-result" id="t5-result" hidden><p class="t5-res-title">ФРАЗА РАЗГАДАНА</p><p class="t5-res-phrase" id="t5-res-phrase"></p></div>'+
'<section class="t5-screen t5-done" hidden><p class="t5-eyebrow">ЗАДАНИЕ 5 ЗАВЕРШЕНО</p><h1>Сообщение собрано</h1><p class="t5-full" id="t5-full"></p><p class="t5-note">Танец откроет путь. Следующее задание появится в следующем обновлении.</p></section>'+
'<div class="t5-status" id="t5-status" role="status" hidden></div>'+
'<button class="t5-primary t5-mediabtn" id="t5-media" type="button" hidden></button>'+
'<p class="t5-build">Сборка 0311r</p>';
container.appendChild(root);
video=root.querySelector('.t5-video');bg=root.querySelector('.t5-bg');
els={wait:root.querySelector('.t5-wait'),start:root.querySelector('#t5-start'),waitnote:root.querySelector('#t5-waitnote'),top:root.querySelector('#t5-top'),frag:root.querySelector('#t5-frag'),dots:root.querySelectorAll('.t5-dot'),play:root.querySelector('#t5-play'),center:root.querySelector('#t5-center'),wave:root.querySelector('#t5-wave'),pstatus:root.querySelector('#t5-pstatus'),panel:root.querySelector('#t5-panel'),answer:root.querySelector('#t5-answer'),check:root.querySelector('#t5-check'),hint:root.querySelector('#t5-hint'),hintLabel:root.querySelector('#t5-hint-label'),hintText:root.querySelector('#t5-hint-text'),clean:root.querySelector('#t5-clean'),kbwin:root.querySelector('#t5-kbwin'),kbInput:root.querySelector('#t5-kbwin-input'),kbOk:root.querySelector('#t5-kbwin-ok'),kbCancel:root.querySelector('#t5-kbwin-cancel'),result:root.querySelector('#t5-result'),resPhrase:root.querySelector('#t5-res-phrase'),done:root.querySelector('.t5-done'),full:root.querySelector('#t5-full'),status:root.querySelector('#t5-status'),media:root.querySelector('#t5-media')};
els.start.addEventListener('click',startIntro);
els.play.addEventListener('click',function(){playRecord(false);});
els.clean.addEventListener('click',function(){playRecord(true);});
els.panel.addEventListener('submit',function(e){e.preventDefault();submitAnswer();});
els.check.addEventListener('click',function(){submitAnswer();});
els.answer.addEventListener('click',openKb);
els.kbOk.addEventListener('click',function(){kbSubmit();});
els.kbCancel.addEventListener('click',function(){kbSave();closeKb();});
els.kbInput.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();kbSubmit();}});
try{bg.play().catch(function(){});}catch(e){}
if(bg)bg.onerror=function(){if(bg)bg.style.display='none';};
roomOff=NET.onRoom(onRoom);
tickTimer=setInterval(tick,500);
}
function unmount(){
active=false;clearTimeout(startTimer);clearWatchdog();stopAudio();stopMedia();
if(tickTimer){clearInterval(tickTimer);tickTimer=null;}
if(typeof roomOff==='function')roomOff();roomOff=null;
if(bg){try{bg.pause();}catch(e){}bg.removeAttribute('src');try{bg.load();}catch(e){}bg=null;}
if(root&&root.parentNode)root.parentNode.removeChild(root);
root=null;video=null;bg=null;els={};roomState=null;task=null;mediaKey='';mediaRetries=0;resultKey='';advanceKey='';sfxKey='';stageKey='';answerFrag=-1;kbOpen=false;localHint=0;localResult=-1;localResultAt=0;
}
function status(text){if(!els.status)return;els.status.textContent=text||'';els.status.hidden=!text;}
function onRoom(room){if(!active||!room)return;roomState=room;task=(room.tasks&&room.tasks.task05)||{stage:'wait',fragment:0};render();coordinate();}
// --- запуск и переход к игре ---
function startIntro(){
if(!cap()||!task||task.stage!=='wait'||starting)return;
starting=true;els.start.disabled=true;
write({stage:'intro',startsAt:Date.now(),fragment:0,attempts:0,hintLevel:0,listening:false,completed:false,accepted:null})
.catch(function(){}).then(function(){starting=false;if(els.start)els.start.disabled=false;});
}
function introDone(){
if(!cap()||!task||task.stage!=='intro')return;
write({stage:'play',startsAt:Date.now(),fragment:0,attempts:0,hintLevel:0,listening:false}).catch(function(){});
}
// --- запись слышит только капитан ---
function stopAudio(){
if(audioTimer){clearTimeout(audioTimer);audioTimer=null;}
playingLocal=false;audioKey='';
if(audio){try{audio.onended=null;audio.onerror=null;audio.pause();audio.removeAttribute('src');audio.load();}catch(e){}}
}
function playRecord(clean){
if(!cap()||!task||task.stage!=='play')return;
const i=task.fragment||0,F=FRAGS[i];
if(!clean&&(task.listening||playingLocal))return; // повтор во время воспроизведения заблокирован
const src='assets/'+(clean?F.clean:F.file);
if(audioTimer){clearTimeout(audioTimer);audioTimer=null;}
if(!audio)audio=new Audio();
try{audio.pause();}catch(e){}
audio.onended=null;audio.onerror=null;
audio.src=src;audio.volume=clean?0.95:1;
const key=i+':'+(clean?'c':'d')+':'+Date.now();
audioKey=key;playingLocal=true;
if(!clean){write({listening:true,playingAt:Date.now()}).catch(function(){});}
audio.onloadedmetadata=function(){
if(audioKey!==key)return;
const dur=(isFinite(audio.duration)&&audio.duration>0)?audio.duration:8;
if(audioTimer)clearTimeout(audioTimer);
// Сторож на случай, если ended не придёт: снимаем «идёт воспроизведение».
audioTimer=setTimeout(function(){audioTimer=null;if(audioKey!==key)return;finishPlay(clean);},Math.round(dur*1000)+2500);
};
audio.onended=function(){if(audioKey!==key)return;finishPlay(clean);};
audio.onerror=function(){if(audioKey!==key)return;finishPlay(clean);status('Не удалось воспроизвести запись. Нажмите «Слушать» ещё раз.');};
const p=audio.play();
if(p&&p.catch)p.catch(function(){finishPlay(clean);status('Браузер не дал звук. Коснитесь «Слушать» ещё раз.');});
}
function finishPlay(clean){
if(audioTimer){clearTimeout(audioTimer);audioTimer=null;}
playingLocal=false;
if(!clean&&cap()&&task&&task.stage==='play'){try{write({listening:false});}catch(e){}}
render();
}
// --- ответ капитана ---
function openKb(){
if(!cap()||!task||task.stage!=='play')return;
if(task.listening)return;
kbOpen=true;
els.kbInput.value=els.answer.value||'';
els.kbwin.hidden=false;
setTimeout(function(){if(!active||!els.kbInput)return;try{els.kbInput.focus();}catch(e){}},60);
}
function kbSave(){if(els.answer&&els.kbInput)els.answer.value=els.kbInput.value;}
function closeKb(){kbOpen=false;if(els.kbInput&&els.kbInput.blur)els.kbInput.blur();if(els.kbwin)els.kbwin.hidden=true;}
function kbSubmit(){kbSave();closeKb();submitAnswer();}
function submitAnswer(){
if(!active||!task)return;
if(Date.now()-lastSubmit<300)return;lastSubmit=Date.now();
if(task.stage!=='play'){status('Сейчас не этап ввода — дождитесь фрагмента.');return;}
if(!cap()){status('Фразу вводит капитан.');return;}
const i=task.fragment||0,F=FRAGS[i];
const val=String(els.answer.value||'').trim();
if(!val){status('Введите фразу.');return;}
closeKb();
if(accepts(val,F.phrase)){
// Верный ответ показываем сразу, запись в базу идёт следом.
localResult=i;localResultAt=Date.now();localHint=0;status('');
const upd={};upd['accepted/'+i]=true;upd.acceptedAt=Date.now();upd.attempts=0;upd.hintLevel=0;upd.listening=false;
write(upd).catch(function(e){status('Ответ верный, но не сохранился: '+(e&&e.message||e));});
}else{
const lvl=Math.min(3,Math.max(task.hintLevel||0,localHint)+1);
localHint=lvl;
playSfx('sfx_ui_error.mp3',.45);
els.answer.value='';
write({attempts:(task.attempts||0)+1,hintLevel:lvl,listening:false}).catch(function(e){status('Ошибка связи: '+(e&&e.message||e));});
}
}
// --- координация: только капитан переводит дальше ---
function coordinate(){
if(!cap()||!task||task.stage!=='play')return;
const i=task.fragment||0,acc=task.accepted||{};
if(!acc[i]||!task.acceptedAt)return;
if(Date.now()<task.acceptedAt+3000)return;
const key=i+':'+task.acceptedAt;if(advanceKey===key)return;advanceKey=key;
if(i>=3){
write({stage:'done',completed:true,startsAt:Date.now(),listening:false}).catch(function(){advanceKey='';});
}else{
write({fragment:i+1,attempts:0,hintLevel:0,listening:false,acceptedAt:null}).catch(function(){advanceKey='';});
}
}
function tick(){
if(!active||!task)return;
render();coordinate();
if(!cap())return;
const st=task.stage||'',t0=task.startsAt||0,now=Date.now();
if(st==='intro'&&t0&&now>t0+120000)introDone();
// Если капитан слушал и роль/связь пропала — снимаем «идёт воспроизведение», иначе повтор заперт.
if(st==='play'&&task.listening&&task.playingAt&&now>task.playingAt+40000){write({listening:false}).catch(function(){});}
}
// --- отрисовка ---
function render(){
if(!root||!task)return;
const stage=task.stage||'wait',i=Math.min(3,Math.max(0,task.fragment||0)),F=FRAGS[i];
const c=cap();
els.wait.hidden=stage!=='wait';
els.start.hidden=!c;els.waitnote.hidden=c;
els.done.hidden=stage!=='done';
const inPlay=stage==='play';
els.top.hidden=!inPlay;
els.center.hidden=!inPlay;
els.panel.hidden=!(inPlay&&c);
// Кадр вступления не должен оставаться фоном: вне инструкции видео скрыто, виден только разлом.
if(video)video.hidden=(stage!=='intro');
if(stage!=='play'&&kbOpen)closeKb();
if(inPlay){
els.frag.textContent='Фрагмент '+(i+1)+' из 4';
for(let k=0;k<els.dots.length;k++){const d=els.dots[k];d.className='t5-dot'+(task.accepted&&task.accepted[k]?' on':'')+(k===i?' cur':'');}
const listening=!!task.listening||playingLocal;
els.play.hidden=!c;
els.play.disabled=listening;
els.play.textContent=listening?'ИДЁТ ЗАПИСЬ…':'▶ СЛУШАТЬ';
els.wave.hidden=!listening;
els.pstatus.innerHTML=c?(listening?'<b>Слушайте запись</b>':'Нажмите «Слушать», затем обсудите услышанное'):(listening?'<b>Слушайте запись на телефоне капитана</b>':'<b>Обсудите услышанное</b>');
if(c){
if(answerFrag!==i){answerFrag=i;els.answer.value='';}
els.answer.disabled=listening;
}
// Помощь — только после ошибки и только капитану.
const lvl=Math.max(task.hintLevel||0,localHint);
if((task.hintLevel||0)>=localHint)localHint=0;
els.hint.hidden=!(c&&lvl>0);
if(c&&lvl>0){
els.hintLabel.textContent=lvl>=3?'Помощь Вольта':'Подсказка '+Math.min(2,lvl);
els.hintText.innerHTML=escapeHtml(lvl===1?F.h1:(lvl>=2?F.h2:F.h1));
els.clean.hidden=lvl<3;
}
// Короткий результат фрагмента: крупно, бирюзовым по чёрному, у всех устройств.
const acc=task.accepted||{};
const showRes=!!((acc[i]&&task.acceptedAt&&Date.now()<task.acceptedAt+3000)||(localResult===i&&Date.now()<localResultAt+3000));
els.result.hidden=!showRes;
if(showRes){
els.resPhrase.textContent=F.phrase;
const rk=i+':'+(task.acceptedAt||localResultAt);
if(rk!==resultKey){resultKey=rk;playSfx('sfx_ui_confirm.mp3',.55);}
}
}else{
els.wave.hidden=true;
}
if(stage==='done'){
if(els.full)els.full.textContent=FULL;
const dk='done';if(sfxKey!==dk){sfxKey=dk;playSfx('sfx_crystal_ready.mp3',.6);}
}
// Медиа инструкции по смене этапа.
const key=stage+':'+(task.startsAt||0);
if(key!==stageKey){
stageKey=key;
if(stage==='intro')scheduleMedia('assets/v05_intro.mp4',task.startsAt||0,key);
else if(stage!=='intro'){stopMedia();}
}
}
// --- медиа инструкции ---
function stopMedia(){clearWatchdog();clearTimeout(startTimer);if(!video)return;mediaKey='';video.onended=null;video.onloadedmetadata=null;video.onerror=null;video.onclick=null;try{video.pause();}catch(e){}hideMediaBtn();}
function clearWatchdog(){if(watchdogTimer){clearTimeout(watchdogTimer);watchdogTimer=null;}}
function hideMediaBtn(){if(els.media){els.media.hidden=true;els.media.onclick=null;}}
function showMediaBtn(text,fn){if(!els.media)return;els.media.hidden=false;els.media.textContent=text;els.media.onclick=function(ev){if(ev&&ev.stopPropagation)ev.stopPropagation();hideMediaBtn();if(!active)return;fn();};}
function scheduleMedia(src,at,key){
stopMedia();mediaKey=key;mediaRetries=0;
video.muted=!cap();
video.onloadedmetadata=function(){const offset=Math.max(0,(Date.now()-at)/1000);if(offset>0.5&&video.duration)try{video.currentTime=Math.min(offset,Math.max(0,video.duration-0.1));}catch(e){}};
video.onerror=function(){
if(!active||mediaKey!==key||!video)return;
if(mediaRetries<2){mediaRetries++;status('Повторная загрузка видео…');setTimeout(function(){if(!active||mediaKey!==key||!video)return;try{video.src=src;video.load();}catch(e){}beginPlay();},1500);return;}
status('Не удалось загрузить видео. Проверьте соединение.');
if(cap())showMediaBtn('Продолжить →',function(){introDone();});
};
video.onended=function(){if(!active||mediaKey!==key||!cap()||!task)return;if((task.stage||'')==='intro')introDone();};
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
const delay=at-Date.now();
if(delay>100){status('Видео начнётся одновременно у всех…');startTimer=setTimeout(beginPlay,delay);}else beginPlay();
}
return{mount:mount,unmount:unmount};
})();
