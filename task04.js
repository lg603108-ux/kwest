// task04.js — задание 4 «Химеры». Общие переходы выполняет только капитан.
window.Task04=(function(){
const ROUNDS=[
{file:'chimera_01_aist_volk.mp4',a:{name:'аист',words:['аист'],h1:'Длинноногая птица с длинным прямым клювом, часто селится рядом с человеком.',h2:'Белая птица с чёрными маховыми перьями и красным клювом; строит большие гнёзда на крышах и столбах.'},b:{name:'волк',words:['волк'],h1:'Серый хищник, живёт стаей и воет.',h2:'Дикий родственник собаки с густой шерстью и острыми зубами.'}},
{file:'chimera_02_kaban_dyatel.mp4',a:{name:'кабан',words:['кабан'],h1:'Дикий родственник домашней свиньи с клыками и жёсткой щетиной.',h2:'Секач с мощным телом; роет землю пятачком в поисках пищи.'},b:{name:'дятел',words:['дятел'],h1:'Лесная птица, которую называют лесным доктором.',h2:'Долбит ствол крепким клювом и достаёт насекомых из-под коры.'}},
{file:'chimera_03_komar_ezh.mp4',a:{name:'комар',words:['комар'],h1:'Маленькое летающее насекомое; самки многих видов питаются кровью.',h2:'Зудящий укус, тонкий хоботок и назойливое жужжание над ухом.'},b:{name:'ёж',words:['ёж','еж'],h1:'Небольшой зверёк, который защищается колючками.',h2:'При опасности сворачивается в шар; на спине иглы, мордочка вытянутая.'}},
{file:'chimera_04_lisa_gluhar.mp4',a:{name:'лиса',words:['лиса'],h1:'Рыжий хищник, известный в сказках хитростью.',h2:'Пушистый рыжий хвост с белым кончиком и острая мордочка.'},b:{name:'глухарь',words:['глухарь'],h1:'Крупная лесная птица, весной издаёт характерные щёлкающие звуки.',h2:'Во время части токовой песни хуже слышит; с этим связано её название.'}},
{file:'chimera_05_los_mahaon.mp4',a:{name:'лось',words:['лось'],h1:'Самый крупный современный представитель семейства оленевых.',h2:'Длинные ноги, крупная вытянутая морда; у самцов широкие лопатообразные рога.'},b:{name:'махаон',words:['махаон','бабочка'],h1:'Крупная дневная бабочка с узорчатыми крыльями.',h2:'Жёлто-чёрные крылья с синими участками и хвостиками; можно ответить «бабочка».'}},
{file:'chimera_06_medved_shchuka.mp4',a:{name:'медведь',words:['медведь'],h1:'Крупный лесной зверь, хозяин тайги; зимой спит в берлоге.',h2:'Косолапый зверь с бурой шерстью, мощными лапами и когтями.'},b:{name:'щука',words:['щука'],h1:'Пресноводная хищная рыба с длинным телом.',h2:'Зубастая речная охотница, атакующая добычу из засады.'}},
{file:'chimera_07_rys_zhuk_olen.mp4',a:{name:'рысь',words:['рысь'],h1:'Дикая кошка с кисточками на ушах.',h2:'Пятнистая лесная кошка с коротким хвостом и широкими лапами.'},b:{name:'жук-олень',words:['жук олень'],h1:'Крупный жук, самцы которого выглядят рогатыми.',h2:'Его большие челюсти похожи на оленьи рога; нужен вид жука, а не слово «жук».'}},
{file:'chimera_08_strekoza_zubr.mp4',a:{name:'стрекоза',words:['стрекоза'],h1:'Хищное насекомое, умеет зависать и быстро менять направление.',h2:'Четыре прозрачных крыла с сеткой жилок, длинное брюшко; часто летает над водой.'},b:{name:'зубр',words:['зубр'],h1:'Очень крупное дикое копытное европейских лесов.',h2:'Массивный лесной бык с высокой холкой, короткими рогами и густой шерстью спереди.'}},
{file:'chimera_09_svetlyachok_vydra.mp4',a:{name:'светлячок',words:['светлячок'],h1:'Маленькое насекомое, светящееся летними ночами.',h2:'Это жук со светящимся брюшком; свет помогает находить партнёра.'},b:{name:'выдра',words:['выдра'],h1:'Ловкий водный хищник, живёт у рек и озёр.',h2:'Длинное гибкое тело, короткие лапы с перепонками и сильный хвост; ловит рыбу.'}},
{file:'chimera_10_utka_zayats.mp4',a:{name:'утка',words:['утка'],h1:'Водоплавающая птица рек и озёр.',h2:'Широкий уплощённый клюв и лапы с перепонками; характерно крякает.'},b:{name:'заяц',words:['заяц'],h1:'Травоядный зверёк, очень быстро бегает.',h2:'Длинные уши, короткие передние и сильные длинные задние лапы для прыжков.'}}
];
let active=false,root=null,video=null,els={},roomState=null,task=null,roomOff=null;
let startTimer=null,watchdogTimer=null,tickTimer=null,mediaKey='',mediaRetries=0,starting=false;
let t4Music=null,resSfxKey='',finalSfxDone=false;
let resultKey='',advanceKey='',sfxCfKey='',sfxAtKey='',stageKey='';
function cap(){const room=roomState||(window.NET&&NET.room);return !!(window.NET&&NET.uid&&room&&room.captain===NET.uid);}
function db(){return firebase.database();}
function publicRef(){return db().ref('rooms/'+NET.room.code+'/tasks/task04');}
function error(e){status('Ошибка связи: '+(e&&e.message||e));}
function write(obj){return publicRef().update(obj).catch(function(e){error(e);throw e;});}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function norm(s){return String(s||'').toLowerCase().replace(/ё/g,'е').replace(/[-–—]+/g,' ').replace(/\s+/g,' ').trim();}
function matches(v,sp){return sp.words.some(function(w){return norm(w)===v;});}
function round(){return ROUNDS[Math.min(9,Math.max(0,task&&typeof task.round==='number'?task.round:0))];}
function playSfx(file,volume){try{var a=new Audio('assets/'+file);a.volume=volume;a.play().catch(function(){});}catch(e){}}
function startMusic(){if(t4Music)return;try{t4Music=new Audio('assets/music_defense_loop.mp3');t4Music.loop=true;t4Music.volume=.06;t4Music.play().catch(function(){});}catch(e){t4Music=null;}}
function stopMusic(){if(t4Music){try{t4Music.pause();}catch(e){}t4Music=null;}}
function mount(container){
if(root)unmount();
active=true;mediaKey='';mediaRetries=0;starting=false;resultKey='';advanceKey='';sfxCfKey='';sfxAtKey='';stageKey='';resSfxKey='';finalSfxDone=false;stopMusic();
root=document.createElement('div');root.id='t4';root.innerHTML=
'<video class="t4-video" playsinline preload="auto"></video>'+
'<div class="t4-hud" id="t4-hud" hidden><div><small id="t4-hud-round">ХИМЕРА 1 ИЗ 10</small><strong id="t4-hud-energy">⚡ 0</strong></div></div>'+
'<section class="t4-screen t4-wait"><p class="t4-eyebrow">ЗАДАНИЕ 4</p><h1>Химеры</h1><p class="t4-note">В секторе появились химеры — существа из двух разных видов. Посмотрите короткое видео, обсудите и определите обоих животных. Капитан введёт названия в два поля. Если ответ не подойдёт, система поможет разобраться. Чем быстрее распознаете химеру, тем больше энергии получит капсула.</p><button id="t4-start" class="t4-primary" type="button">▶ Запустить инструкцию для всех</button><p class="t4-note" id="t4-waitnote">Ждём, когда капитан запустит инструкцию…</p></section>'+
'<form class="t4-panel" id="t4-panel" hidden autocomplete="off">'+
'<div class="t4-field"><label for="t4-fa">Животное 1</label><div class="t4-wrap"><input id="t4-fa" autocomplete="off" autocapitalize="off" enterkeyhint="go"><span class="t4-ok" id="t4-oka" hidden>✓</span></div></div>'+
'<div class="t4-field"><label for="t4-fb">Животное 2</label><div class="t4-wrap"><input id="t4-fb" autocomplete="off" autocapitalize="off" enterkeyhint="go"><span class="t4-ok" id="t4-okb" hidden>✓</span></div></div>'+
'<button class="t4-primary" type="submit" id="t4-check">Проверить</button>'+
'<button class="t4-secondary" type="button" id="t4-replay">↻ Посмотреть ещё раз</button>'+
'<button class="t4-secondary" type="button" id="t4-kb">Скрыть клавиатуру</button>'+
'<span class="t4-time" id="t4-time"></span>'+
'<p class="t4-hintline" id="t4-hinta" hidden></p>'+
'<p class="t4-hintline" id="t4-hintb" hidden></p>'+
'<p class="t4-reqnote" id="t4-req" hidden></p>'+
'</form>'+
'<div class="t4-watch" id="t4-watch" hidden><p class="t4-caption">Назовите капитану оба животных</p><button class="t4-secondary" type="button" id="t4-reqbtn">Попросить повтор</button></div>'+
'<section class="t4-screen t4-result" id="t4-result" hidden><p class="t4-eyebrow" id="t4-res-round">ХИМЕРА УГАДАНА</p><div class="t4-capsule"><img src="assets/capsule_healthy1.jpg" alt=""><div class="t4-capsule-fill" id="t4-res-fill"><img src="assets/capsule_healthy.jpg" alt=""></div></div><p class="t4-names" id="t4-res-names"></p><p class="t4-gain" id="t4-res-gain"></p><p class="t4-note" id="t4-res-note"></p></section>'+
'<section class="t4-screen t4-done" hidden><p class="t4-eyebrow">ЗАДАНИЕ 4 ЗАВЕРШЕНО</p><h1>Капсула подготовлена. Продолжаем</h1><div class="t4-capsule"><img src="assets/capsule_healthy1.jpg" alt=""><div class="t4-capsule-fill" id="t4-done-fill"><img src="assets/capsule_healthy.jpg" alt=""></div></div><p class="t4-note">Сектор зачищен: все десять химер распознаны. Следующее задание появится в следующем обновлении.</p></section>'+
'<div class="t4-status" id="t4-status" role="status" hidden></div>'+
'<button class="t4-primary t4-mediabtn" id="t4-media" type="button" hidden></button>'+
'<p class="t4-build">Сборка 0311j</p>';
container.appendChild(root);video=root.querySelector('.t4-video');
els={wait:root.querySelector('.t4-wait'),hud:root.querySelector('#t4-hud'),hudRound:root.querySelector('#t4-hud-round'),hudEnergy:root.querySelector('#t4-hud-energy'),start:root.querySelector('#t4-start'),waitnote:root.querySelector('#t4-waitnote'),panel:root.querySelector('#t4-panel'),fa:root.querySelector('#t4-fa'),fb:root.querySelector('#t4-fb'),oka:root.querySelector('#t4-oka'),okb:root.querySelector('#t4-okb'),check:root.querySelector('#t4-check'),replay:root.querySelector('#t4-replay'),kb:root.querySelector('#t4-kb'),time:root.querySelector('#t4-time'),hintA:root.querySelector('#t4-hinta'),hintB:root.querySelector('#t4-hintb'),req:root.querySelector('#t4-req'),watch:root.querySelector('#t4-watch'),reqbtn:root.querySelector('#t4-reqbtn'),result:root.querySelector('#t4-result'),resRound:root.querySelector('#t4-res-round'),resNames:root.querySelector('#t4-res-names'),resGain:root.querySelector('#t4-res-gain'),resNote:root.querySelector('#t4-res-note'),done:root.querySelector('.t4-done'),doneEnergy:root.querySelector('#t4-done-energy'),status:root.querySelector('#t4-status'),media:root.querySelector('#t4-media')};
els.start.addEventListener('click',startIntro);
els.panel.addEventListener('submit',function(e){e.preventDefault();submitAnswers();});
els.replay.addEventListener('click',requestReplayByCaptain);
els.kb.addEventListener('click',function(){if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();});
els.reqbtn.addEventListener('click',requestReplayByPlayer);
roomOff=NET.onRoom(onRoom);
tickTimer=setInterval(tick,500);
}
function unmount(){
active=false;clearTimeout(startTimer);clearWatchdog();stopMusic();if(tickTimer){clearInterval(tickTimer);tickTimer=null;}
startTimer=null;
if(typeof roomOff==='function')roomOff();roomOff=null;
if(video){video.onended=null;video.onclick=null;video.onloadedmetadata=null;video.onerror=null;video.pause();video.removeAttribute('src');video.load();}
if(root&&root.parentNode)root.parentNode.removeChild(root);
root=null;video=null;els={};roomState=null;task=null;mediaKey='';mediaRetries=0;resultKey='';advanceKey='';sfxCfKey='';sfxAtKey='';stageKey='';
}
function status(text){if(!els.status)return;els.status.textContent=text||'';els.status.hidden=!text;}
function hideMediaBtn(){if(els.media){els.media.hidden=true;els.media.onclick=null;}}
function showMediaBtn(text,fn){if(!els.media)return;els.media.hidden=false;els.media.textContent=text;els.media.onclick=function(ev){if(ev&&ev.stopPropagation)ev.stopPropagation();hideMediaBtn();if(!active)return;fn();};}
function onRoom(room){if(!active||!room)return;roomState=room;task=room.tasks&&room.tasks.task04||{stage:'wait',round:0};render();coordinate();}
// --- инструкция и раунды ---
function startIntro(){
if(!cap()||!task||task.stage!=='wait'||starting)return;
starting=true;els.start.disabled=true;resSfxKey='';finalSfxDone=false;
write({stage:'intro',startsAt:Date.now(),round:0,energy:0,replays:0,clipViewed:false,completed:false})
.catch(error).finally(function(){starting=false;if(els.start)els.start.disabled=false;});
}
function beginRound(n){
if(!cap()||!task)return;
write({stage:'clip',startsAt:Date.now()+600,round:n,clipViewed:false,replays:0,confirmed:{a:false,b:false},attempts:{a:0,b:0},hintLevel:{a:0,b:0},fields:{a:'',b:''}}).catch(function(){});
}
function captainClipEnded(force){
if(!cap()||!task||task.stage!=='clip')return;
if(!task.clipViewed){write({clipViewed:true,stage:'answer',startedAt:Date.now()}).catch(function(){});}
else{write({stage:'answer'}).catch(function(){});}
}
function requestReplayByCaptain(){
if(!cap()||!task||task.stage!=='answer')return;
if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();
write({stage:'clip',startsAt:Date.now()+400,replays:(task.replays||0)+1}).catch(function(){});
}
function requestReplayByPlayer(){
if(!window.NET||!NET.inRoom()||!task||task.stage!=='answer')return;
db().ref('rooms/'+NET.room.code+'/tasks/task04/requests/'+NET.uid).set({round:task.round||0,at:Date.now()})
.then(function(){status('Капитан видит вашу просьбу показать клип ещё раз.');})
.catch(function(e){status('Не удалось отправить просьбу: '+(e&&e.message||e));});
}
// --- проверка ответов (капитан) ---
function submitAnswers(){
if(!cap()||!task||task.stage!=='answer')return;
const R=round(),cf=task.confirmed||{},at=task.attempts||{},hl=task.hintLevel||{};
const va=norm(els.fa.value),vb=norm(els.fb.value);
const upd={'fields/a':els.fa.value,'fields/b':els.fb.value};
let anyInput=false,wrong=false;
if(!cf.a&&va){anyInput=true;if(matches(va,R.a))upd['confirmed/a']=true;else{upd['attempts/a']=(at.a||0)+1;if((hl.a||0)<2)upd['hintLevel/a']=(hl.a||0)+1;wrong=true;}}
if(!cf.b&&vb){anyInput=true;if(matches(vb,R.b))upd['confirmed/b']=true;else{upd['attempts/b']=(at.b||0)+1;if((hl.b||0)<2)upd['hintLevel/b']=(hl.b||0)+1;wrong=true;}}
if(!anyInput){status('Введите хотя бы одно название.');return;}
const both=!!(upd['confirmed/a']||(cf.a))&&!!(upd['confirmed/b']||(cf.b));
if(both){
const elapsed=Date.now()-(task.startedAt||Date.now());
const gain=elapsed<30000?10:elapsed<45000?7:elapsed<60000?3:0;
upd.stage='result';upd.resultAt=Date.now();upd.gained=gain;upd.energy=(task.energy||0)+gain;
}
write(upd).catch(function(){});
if(wrong)status('Не подходит. Смотрите подсказку под полем.');
else status('');
}
// --- координация: авто-переход после короткого результата (~5 с), только капитан ---
function coordinate(){
if(!cap()||!task||task.stage!=='result')return;
const at=task.resultAt||0;if(!at)return;
const key=(task.round||0)+':'+at;if(advanceKey===key)return;
if(Date.now()<at+3500)return;
advanceKey=key;
if((task.round||0)>=9){
const upd={};upd['rooms/'+NET.room.code+'/tasks/task04']={stage:'done',startsAt:Date.now(),completed:true};
db().ref().update(upd).catch(function(e){advanceKey='';error(e);});
}else{
const n=(task.round||0)+1;
const upd={};
upd['rooms/'+NET.room.code+'/tasks/task04']={stage:'clip',startsAt:Date.now()+600,round:n,clipViewed:false,replays:0,confirmed:{a:false,b:false},attempts:{a:0,b:0},hintLevel:{a:0,b:0},fields:{a:'',b:''}};
upd['rooms/'+NET.room.code+'/tasks/task04/requests']=null;
db().ref().update(upd).catch(function(e){advanceKey='';error(e);});
}
}
function tick(){if(!active||!task)return;if(task.stage==='answer')renderTime();coordinate();
if(cap()){const st=task.stage||'',t0=task.startsAt||0,now=Date.now();
if(st==='clip'&&t0&&now>t0+25000)captainClipEnded(true);
else if(st==='intro'&&t0&&now>t0+90000)beginRound(0);}}
function renderTime(){
if(!els.time)return;
const t0=task.startedAt||Date.now();let s=Math.max(0,Math.floor((Date.now()-t0)/1000));
const m=Math.floor(s/60);s=s%60;
els.time.textContent=(m<10?'0':'')+m+':'+(s<10?'0':'')+s;
}
// --- отрисовка ---
function render(){
if(!root||!task)return;
const stage=task.stage||'wait';
els.wait.hidden=stage!=='wait';
els.result.hidden=stage!=='result';
els.done.hidden=stage!=='done';
els.start.hidden=!cap();els.waitnote.hidden=cap();
const inRound=(stage==='clip'||stage==='answer'||stage==='result');
els.hud.hidden=!inRound;
if(inRound){els.hudRound.textContent='ХИМЕРА '+((task.round||0)+1)+' ИЗ 10';els.hudEnergy.textContent='⚡ '+(task.energy||0);}
els.panel.hidden=!(stage==='answer'&&cap());
els.watch.hidden=!(stage==='answer'&&!cap());
if(stage==='answer'){renderAnswer();renderTime();}
if(stage==='result')renderResult();
if(stage==='done'){const df=document.getElementById('t4-done-fill');if(df)df.style.height='100%';if(!finalSfxDone){finalSfxDone=true;playSfx('sfx_crystal_ready.mp3',.6);}}
// Звуки вердикта слышат все: верно — при фиксации вида, неверно — при росте попыток.
const cf=task.confirmed||{},at=task.attempts||{};
const cfCount=(cf.a?1:0)+(cf.b?1:0),atCount=(at.a||0)+(at.b||0);
const cfKey=(task.round||0)+':'+cfCount,atKey=(task.round||0)+':'+atCount;
if(stage==='answer'){
if(sfxCfKey!==''&&cfKey!==sfxCfKey&&cfCount>(parseInt(sfxCfKey.split(':')[1],10)||0))playSfx('sfx_ui_confirm.mp3',.5);
if(sfxAtKey!==''&&atKey!==sfxAtKey&&atCount>(parseInt(sfxAtKey.split(':')[1],10)||0))playSfx('sfx_ui_error.mp3',.45);
}
sfxCfKey=cfKey;sfxAtKey=atKey;
// Медиа по смене стадии/раунда/повтора.
const key=stage+':'+(task.round||0)+':'+(task.startsAt||0)+':'+(task.replays||0)+':'+(task.clipViewed?1:0);
if(key!==stageKey){
stageKey=key;mediaKey='';
if(stage==='intro')scheduleMedia('assets/v04_intro.mp4',task.startsAt||0,key,{intro:true});
else if(stage==='clip')scheduleMedia('assets/'+round().file,task.startsAt||0,key,{intro:false});
else stopMedia();
}
if(stage==='clip'||stage==='answer'||stage==='result')startMusic();else stopMusic();
}
function renderAnswer(){
const R=round(),cf=task.confirmed||{},hl=task.hintLevel||{},fl=task.fields||{};
if(document.activeElement!==els.fa&&els.fa.value!==(fl.a||''))els.fa.value=fl.a||'';
if(document.activeElement!==els.fb&&els.fb.value!==(fl.b||''))els.fb.value=fl.b||'';
els.fa.disabled=!!cf.a;els.fb.disabled=!!cf.b;
els.oka.hidden=!cf.a;els.okb.hidden=!cf.b;
renderHint(els.hintA,R.a,'Животное 1',hl.a||0);
renderHint(els.hintB,R.b,'Животное 2',hl.b||0);
// Просьбы о повторе — видит капитан.
const reqs=task.requests||{};const names=[];
Object.keys(reqs).forEach(function(uid){
if(reqs[uid]&&reqs[uid].round===(task.round||0)){const p=roomState&&roomState.players&&roomState.players[uid];names.push(p&&p.name?p.name:'Игрок');}
});
if(names.length){els.req.hidden=false;els.req.textContent='Просят повтор: '+names.join(', ')+' — кнопка «Посмотреть ещё раз» покажет клип всем.';}
else els.req.hidden=true;
}
function renderHint(el,sp,label,level){
if(!level){el.hidden=true;return;}
el.hidden=false;
el.innerHTML='<b>'+label+' ('+sp.name+'):</b> '+(level>=2?sp.h2:sp.h1);
}
function renderResult(){
const R=round();
els.resRound.textContent='ХИМЕРА '+((task.round||0)+1)+' ИЗ 10 УГАДАНА';
const charge=Math.max(0,Math.min(100,task.energy||0));
const fill=document.getElementById('t4-res-fill');if(fill)fill.style.height=charge+'%';
els.resNames.textContent=R.a.name+' + '+R.b.name;
els.resGain.textContent='Заряд капсулы растёт…';
els.resNote.textContent=(task.round||0)>=9?'Это была последняя химера.':'Следующая химера…';
const rk=(task.round||0)+':'+(task.resultAt||0);if(rk!==resSfxKey){resSfxKey=rk;playSfx('sfx_capsule_charge.mp3',.6);}
}
// --- медиа ---
function stopMedia(){clearWatchdog();if(!video)return;clearTimeout(startTimer);mediaKey='';video.onended=null;video.onclick=null;video.onloadedmetadata=null;video.onerror=null;video.pause();hideMediaBtn();}
function clearWatchdog(){if(watchdogTimer){clearTimeout(watchdogTimer);watchdogTimer=null;}}
function scheduleWatchdog(at,key){
clearWatchdog();
if(!video)return;
const dur=(isFinite(video.duration)&&video.duration>0)?video.duration:0;if(!dur)return;
// Клипы короткие и повторяющиеся: сторож есть. Инструкцию (intro) таймером не обрываем.
const wait=Math.max(1500,(dur*1000)-(Date.now()-at)+3000);
watchdogTimer=setTimeout(function(){
watchdogTimer=null;
if(!active||mediaKey!==key||!cap()||!task)return;
if((task.stage||'')==='clip')captainClipEnded(true);
},wait);
}
function scheduleMedia(src,at,key,opts){
stopMedia();mediaKey=key;mediaRetries=0;video.src=src;
video.muted=!!(opts&&opts.intro)&&!cap();
video.onloadedmetadata=function(){const offset=Math.max(0,(Date.now()-at)/1000);if(offset>0.5&&video.duration)try{video.currentTime=Math.min(offset,Math.max(0,video.duration-0.1));}catch(e){}if(!(opts&&opts.intro))scheduleWatchdog(at,key);};
video.onerror=function(){
if(!active||mediaKey!==key||!video)return;
if(mediaRetries<2){mediaRetries++;status('Повторная загрузка видео…');setTimeout(function(){if(!active||mediaKey!==key||!video)return;try{video.src=src;video.load();}catch(e){}beginPlay();},1500);return;}
status('Не удалось загрузить видео. Проверьте соединение.');
if(cap()){
if(opts&&opts.intro){showMediaBtn('Продолжить без видео →',function(){if(task&&task.stage==='intro')beginRound(0);});}
else{clearWatchdog();watchdogTimer=setTimeout(function(){watchdogTimer=null;if(!active||mediaKey!==key||!cap()||!task)return;if((task.stage||'')==='clip')captainClipEnded(true);},5000);}
}
};
video.onended=function(){if(!active||mediaKey!==key||!cap()||!task)return;const st=task.stage||'';if(opts&&opts.intro){if(st==='intro')beginRound(0);}else if(st==='clip')captainClipEnded(false);};
const beginPlay=function(){
if(!active||mediaKey!==key||!video)return;
const p=video.play();
if(!p||!p.then){status('');hideMediaBtn();return;}
p.then(function(){if(!active||mediaKey!==key)return;status('');hideMediaBtn();},function(){
if(!active||mediaKey!==key)return;
video.muted=true;video.play().catch(function(){});
status('');
showMediaBtn('🔊 Нажмите, чтобы включить звук',function(){video.muted=false;});
});
};
video.onclick=function(){beginPlay();};
const begin=function(){beginPlay();};
const delay=at-Date.now();
if(delay>100){status('Видео начнётся одновременно у всех…');startTimer=setTimeout(begin,delay);}else begin();
}
return{mount:mount,unmount:unmount};
})();
