// task03.js — задание 3 «Чувства Лума». Общие переходы выполняет только капитан.
window.Task03=(function(){
const EMOTIONS=[
{id:'fear',name:'Страх',sign:'Испуганное лицо',hint:'Отшатнитесь назад, закройтесь руками, сожмитесь. Глаза широко.'},
{id:'joy',name:'Радость',sign:'Улыбка',hint:'Улыбка во всё лицо, подпрыгните, вскиньте руки вверх.'},
{id:'anger',name:'Гнев',sign:'Нахмуренное лицо',hint:'Сожмите кулаки, нахмурьтесь, топните ногой. Плечи напряжены.'},
{id:'sadness',name:'Грусть',sign:'Печальное лицо',hint:'Опустите голову и плечи, медленно осядьте. Смотрите вниз.'},
{id:'surprise',name:'Удивление',sign:'Раскрытые глаза и рот',hint:'Широко раскройте глаза и рот, замрите на месте.'},
{id:'disgust',name:'Отвращение',sign:'Сморщенное лицо',hint:'Отпряньтесь, отвернитесь, помашите рукой у носа, сморщитесь.'},
{id:'pain',name:'Боль',sign:'Зажмуренное лицо',hint:'Схватитесь за место, зажмурьтесь, скривитесь.'},
{id:'anxiety',name:'Тревога',sign:'Обеспокоенное лицо',hint:'Озирайтесь по сторонам, трите руки, переступайте с ноги на ногу.'},
{id:'doubt',name:'Сомнение',sign:'Задумчивое лицо',hint:'Наморщите лоб, склоните голову набок, качните рукой — «может быть».'},
{id:'relief',name:'Облегчение',sign:'Спокойный выдох',hint:'Глубокий выдох, плечи вниз, вытрите лоб — «пронесло».'}
];
let active=false,root=null,video=null,els={},roomState=null,task=null;
let roomOff=null,deckSub=null,secretSub=null,deckOrder=null,secret=null;
let startTimer=null,wrongTimer=null,stageKey='',mediaKey='',roleKey='',deckPromise=null;
let starting=false,reactionKey='',verdictKey='',mediaActionKey='',wrongKey='';
function cap(){const room=roomState||(window.NET&&NET.room);return !!(window.NET&&NET.uid&&room&&room.captain===NET.uid);}
function db(){return firebase.database();}
function publicRef(){return db().ref('rooms/'+NET.room.code+'/tasks/task03');}
function deckRef(){return db().ref('task03Decks/'+NET.room.code);}
function secretRef(uid){return db().ref('task03Secrets/'+NET.room.code+'/'+uid);}
function error(e){status('Ошибка связи: '+(e&&e.message||e));}
function write(obj){return publicRef().update(obj).catch(function(e){error(e);throw e;});}
function validDeck(value){const a=value&&value.order;return Array.isArray(a)&&a.length===10&&a.every(function(id,i){return EMOTIONS.some(function(e){return e.id===id;})&&a.indexOf(id)===i;})?a.slice():null;}
function shuffled(){const a=EMOTIONS.map(function(e){return e.id;});for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));const x=a[i];a[i]=a[j];a[j]=x;}return a;}
function ensureDeck(){
if(deckOrder)return Promise.resolve(deckOrder);
if(deckPromise)return deckPromise;
deckPromise=deckRef().once('value').then(function(s){
const existing=validDeck(s.val());
if(existing){deckOrder=existing;return existing;}
const order=shuffled();
return deckRef().set({order:order}).then(function(){deckOrder=order;return order;});
}).then(function(order){deckPromise=null;return order;},function(e){deckPromise=null;throw e;});
return deckPromise;
}
function players(room){return Object.keys((room&&room.players)||{}).map(function(uid){return{uid:uid,name:room.players[uid].name||'Игрок',joinedAt:room.players[uid].joinedAt||0};}).sort(function(a,b){return a.joinedAt-b.joinedAt||a.uid.localeCompare(b.uid);});}
function emotion(id){return EMOTIONS.find(function(e){return e.id===id;});}
function mount(container){
if(root)unmount();
active=true;deckOrder=null;deckPromise=null;secret=null;stageKey='';mediaKey='';roleKey='';starting=false;reactionKey='';verdictKey='';mediaActionKey='';wrongKey='';
root=document.createElement('div');root.id='t3';root.innerHTML=
'<video class="t3-video" playsinline preload="auto" hidden></video>'+
'<section class="t3-screen t3-wait"><p class="t3-eyebrow">ЗАДАНИЕ 3</p><h1>Чувства Лума</h1><p>Верните Луму десять чувств через пантомиму. Актёр показывает чувство без слов, Судья выбирает его на экране.</p><button id="t3-start" class="t3-primary" type="button">▶ Запустить инструкцию для всех</button><p id="t3-waitnote">Ждём, когда капитан запустит инструкцию…</p></section>'+
'<section class="t3-screen t3-play" hidden><div id="t3-actor"></div><div id="t3-judge"></div><div id="t3-viewer"></div></section>'+
'<section class="t3-screen t3-done" hidden><p class="t3-eyebrow">ЗАДАНИЕ 3 ЗАВЕРШЕНО</p><h1>Лум снова жив</h1><p>Все десять чувств возвращены.</p></section>'+
'<div id="t3-status" role="status" hidden></div>'+
'<button id="t3-media" class="t3-primary t3-mediabtn" type="button" hidden></button>';
container.appendChild(root);video=root.querySelector('.t3-video');
els={wait:root.querySelector('.t3-wait'),play:root.querySelector('.t3-play'),done:root.querySelector('.t3-done'),start:root.querySelector('#t3-start'),waitnote:root.querySelector('#t3-waitnote'),actor:root.querySelector('#t3-actor'),judge:root.querySelector('#t3-judge'),viewer:root.querySelector('#t3-viewer'),status:root.querySelector('#t3-status'),media:root.querySelector('#t3-media')};
els.start.addEventListener('click',startIntro);
roomOff=NET.onRoom(onRoom);
}
function unmount(){
active=false;clearTimeout(startTimer);clearTimeout(wrongTimer);startTimer=null;wrongTimer=null;
if(typeof roomOff==='function')roomOff();roomOff=null;dropDeck();dropSecret();
if(video){video.onended=null;video.onclick=null;video.onloadedmetadata=null;video.onerror=null;video.pause();video.removeAttribute('src');video.load();}
if(root&&root.parentNode)root.parentNode.removeChild(root);
root=null;video=null;els={};roomState=null;task=null;deckOrder=null;deckPromise=null;secret=null;stageKey='';mediaKey='';roleKey='';mediaActionKey='';wrongKey='';
}
function status(text){if(!els.status)return;els.status.textContent=text||'';els.status.hidden=!text;}
function hideMediaBtn(){if(els.media){els.media.hidden=true;els.media.onclick=null;}}
function showMediaBtn(text,fn){if(!els.media)return;els.media.hidden=false;els.media.textContent=text;els.media.onclick=function(ev){if(ev&&ev.stopPropagation)ev.stopPropagation();hideMediaBtn();if(!active||!video)return;if(video.paused)video.play().catch(function(){});fn();};}
function dropDeck(){if(deckSub){deckSub.ref.off('value',deckSub.cb);deckSub=null;}deckOrder=null;}
function dropSecret(){if(secretSub){secretSub.ref.off('value',secretSub.cb);secretSub=null;}secret=null;}
function syncPrivate(){
if(!active||!roomState)return;
if(cap()&&!deckSub){const ref=deckRef();const cb=function(s){if(!active||!cap())return;deckOrder=validDeck(s.val());finishMedia();};deckSub={ref:ref,cb:cb};ref.on('value',cb,function(e){if(deckSub&&deckSub.ref===ref&&deckSub.cb===cb){ref.off('value',cb);deckSub=null;}deckOrder=null;error(e);});}
else if(!cap()&&deckSub)dropDeck();
const should=task&&task.stage==='play'&&task.actorUid===NET.uid;
if(should&&!secretSub){const ref=secretRef(NET.uid);const cb=function(s){if(!active||!task||task.actorUid!==NET.uid)return;const v=s.val();secret=v&&v.round===task.round?v:null;renderActorSecret();maybeVerdict();};secretSub={ref:ref,cb:cb};ref.on('value',cb,function(e){if(secretSub&&secretSub.ref===ref&&secretSub.cb===cb){ref.off('value',cb);secretSub=null;secret=null;renderActorSecret();}error(e);});}
else if(!should&&secretSub)dropSecret();
}
function onRoom(room){
if(!active||!room)return;
roomState=room;task=room.tasks&&room.tasks.task03||{stage:'wait',round:0};
syncPrivate();render();finishMedia();coordinate();maybeVerdict();
}
function startIntro(){
if(!cap()||!task||task.stage!=='wait'||starting)return;
const ps=players(roomState);if(ps.length<2){status('Для задания нужны хотя бы два игрока.');return;}
starting=true;els.start.disabled=true;
write({stage:'intro',startsAt:Date.now(),round:0,actorUid:ps[0].uid,judgeUid:ps[1].uid,accepted:false,reactionId:null})
.then(function(){return ensureDeck().catch(function(e){if(active&&cap())error(e);});})
.catch(error)
.finally(function(){starting=false;if(els.start)els.start.disabled=false;});
}
function render(){
if(!root||!task)return;
const stage=task.stage||'wait';
els.wait.hidden=stage!=='wait';els.play.hidden=stage!=='play';els.done.hidden=stage!=='done';
els.start.hidden=!cap();els.waitnote.hidden=cap();
if(stage==='play')renderRoles();
const key=stage+':'+(task.round||0)+':'+(task.reactionId||'')+':'+(task.startsAt||0);
if(key!==stageKey){stageKey=key;mediaActionKey='';clearTimeout(startTimer);if(stage==='intro')scheduleMedia('assets/v03_intro.mp4',task.startsAt||0,key);else if(stage==='reaction'&&emotion(task.reactionId))scheduleMedia('assets/lum_'+task.reactionId+'.mp4',task.startsAt||0,key);else stopMedia();}
if(stage==='intro'||stage==='reaction'){video.hidden=false;}
renderWrong();
}
function renderRoles(){
const ps=players(roomState),byUid={};ps.forEach(function(p){byUid[p.uid]=p;});
const actor=byUid[task.actorUid],judge=byUid[task.judgeUid];if(!actor||!judge){status('Ждём двух участников для разных ролей.');return;}
const key=task.round+':'+task.actorUid+':'+task.judgeUid+':'+NET.uid;
if(key===roleKey)return;roleKey=key;wrongKey='';clearTimeout(wrongTimer);
els.actor.innerHTML='';els.judge.innerHTML='';els.viewer.innerHTML='';
const number=task.round+1;
if(NET.uid===task.actorUid){
els.actor.innerHTML='<p class="t3-eyebrow">ВАША РОЛЬ — АКТЁР · ЧУВСТВО '+number+' ИЗ 10</p><div class="t3-secret" hidden><div class="t3-emotion-name"></div><p class="t3-instruction"></p></div><p class="t3-note">Покажите чувство без слов. Название видите только вы.</p>';
renderActorSecret();
}else if(NET.uid===task.judgeUid){
els.judge.innerHTML='<p class="t3-eyebrow">ВАША РОЛЬ — СУДЬЯ · ЧУВСТВО '+number+' ИЗ 10</p><h2>Смотрите на '+escapeHtml(actor.name)+'</h2><p class="t3-note">Какое чувство показывает Актёр?</p><div class="t3-emotions"></div>';
const grid=els.judge.querySelector('.t3-emotions');EMOTIONS.forEach(function(e){const b=document.createElement('button');b.type='button';b.className='t3-emotion';b.dataset.emotion=e.id;b.innerHTML='<span>'+e.name+'</span><small>'+e.sign+'</small>';b.addEventListener('click',function(){guess(e.id);});grid.appendChild(b);});
}else{
els.viewer.innerHTML='<p class="t3-eyebrow">ЧУВСТВО '+number+' ИЗ 10</p><h2>Смотрите на '+escapeHtml(actor.name)+'</h2><p>Актёр: '+escapeHtml(actor.name)+'<br>Судья: '+escapeHtml(judge.name)+'</p><p class="t3-note">Наблюдайте за пантомимой. Название чувства скрыто.</p>';
}
}
function renderActorSecret(){const box=els.actor&&els.actor.querySelector('.t3-secret');if(!box)return;const e=secret&&emotion(secret.emotionId);box.hidden=!e;if(!e)return;box.querySelector('.t3-emotion-name').textContent=e.name;box.querySelector('.t3-instruction').textContent=e.hint;}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function guess(emotionId){
if(!active||!task||task.stage!=='play'||task.accepted||NET.uid!==task.judgeUid)return;
const id=NET.uid+'_'+Date.now()+'_'+Math.random().toString(36).slice(2);
write({guess:{id:id,emotionId:emotionId,by:NET.uid,round:task.round}}).catch(function(){});
}
function maybeVerdict(){
if(!active||!task||task.stage!=='play'||NET.uid!==task.actorUid||!secret||secret.round!==task.round)return;
const g=task.guess;if(!g||g.round!==task.round||g.by!==task.judgeUid||!g.id)return;
if(task.verdict&&task.verdict.guessId===g.id)return;
const key=task.round+':'+g.id;if(verdictKey===key)return;verdictKey=key;
write({verdict:{guessId:g.id,correct:g.emotionId===secret.emotionId,round:task.round}}).catch(function(){verdictKey='';});
}
function coordinate(){
if(!cap()||!task||task.stage!=='play'||task.accepted)return;
const g=task.guess,v=task.verdict;if(!g||!v||!v.correct||v.round!==task.round||g.round!==task.round||v.guessId!==g.id||g.by!==task.judgeUid)return;
const key=task.round+':'+g.id;if(reactionKey===key)return;reactionKey=key;
write({stage:'reaction',startsAt:Date.now(),accepted:true,reactionId:g.emotionId}).catch(function(){reactionKey='';});
}
function renderWrong(){
if(!els.judge)return;
const g=task.guess,v=task.verdict;
const activeWrong=task.stage==='play'&&!!g&&!!v&&!v.correct&&v.round===task.round&&v.guessId===g.id;
const key=activeWrong?task.round+':'+g.id+':'+v.guessId:'';
if(!activeWrong){
if(wrongKey){clearTimeout(wrongTimer);wrongTimer=null;els.judge.querySelectorAll('.t3-emotion.t3-wrong').forEach(function(b){b.classList.remove('t3-wrong');});wrongKey='';}
return;
}
if(wrongKey===key)return;
const b=els.judge.querySelector('.t3-emotion[data-emotion="'+g.emotionId+'"]');if(!b)return;
clearTimeout(wrongTimer);
els.judge.querySelectorAll('.t3-emotion.t3-wrong').forEach(function(x){x.classList.remove('t3-wrong');});
wrongKey=key;b.classList.add('t3-wrong');
wrongTimer=setTimeout(function(){if(b)b.classList.remove('t3-wrong');wrongTimer=null;},700);
}
function stopMedia(){if(!video)return;clearTimeout(startTimer);mediaKey='';video.hidden=true;video.onclick=null;video.onended=null;video.pause();hideMediaBtn();}
function scheduleMedia(src,at,key){
stopMedia();mediaKey=key;video.hidden=false;video.src=src;video.muted=task.stage==='intro'?!cap():false;
video.onloadedmetadata=function(){const offset=Math.max(0,(Date.now()-at)/1000);if(offset>0.5&&video.duration)try{video.currentTime=Math.min(offset,Math.max(0,video.duration-0.1));}catch(e){}};
video.onerror=function(){status('Не удалось загрузить видео. Проверьте соединение.');};
video.onended=function(){if(!active||mediaKey!==key)return;finishMedia();};
const beginPlay=function(){
  if(!active||mediaKey!==key||!video)return;
  const p=video.play();
  if(!p||!p.then){status('');hideMediaBtn();return;}
  p.then(function(){if(!active||mediaKey!==key)return;status('');hideMediaBtn();},function(){
    if(!active||mediaKey!==key)return;
    video.muted=true;
    const p2=video.play();
    if(!p2||!p2.then){status('');showMediaBtn('🔊 Включить звук',function(){video.muted=false;});return;}
    p2.then(function(){if(!active||mediaKey!==key)return;status('');showMediaBtn('🔊 Включить звук',function(){video.muted=false;});},function(){
      video.muted=false;status('');
      showMediaBtn('▶ Продолжить показ',function(){beginPlay();});
    });
  });
};
video.onclick=function(){beginPlay();};
const begin=function(){beginPlay();};
const delay=at-Date.now();if(delay>100){status('Видео начнётся одновременно у всех…');startTimer=setTimeout(begin,delay);}else begin();
}
function finishMedia(){
if(!active||!video||!video.ended||!cap()||!task)return;
const stage=task.stage||'';
if(stage!=='intro'&&stage!=='reaction')return;
if(!stageKey||mediaActionKey===stageKey)return;
if(stage==='intro')startPlay();else advance();
}
function startPlay(){
if(!cap()||!task||task.stage!=='intro')return;
if(mediaActionKey===stageKey)return;
const key=stageKey;mediaActionKey=key;
ensureDeck().then(function(order){
if(!active||!cap()||!task||task.stage!=='intro'||mediaActionKey!==key)return;
const id=order[task.round];
if(!id){mediaActionKey='';return;}
return secretRef(task.actorUid).set({round:task.round,emotionId:id}).then(function(){
return publicRef().update({stage:'play',startsAt:Date.now(),accepted:false,reactionId:null});
});
}).catch(function(e){if(mediaActionKey===key)mediaActionKey='';error(e);});
}
function advance(){
if(!cap()||!task||task.stage!=='reaction')return;
if(mediaActionKey===stageKey)return;
const key=stageKey;mediaActionKey=key;
if(task.round>=9){publicRef().update({stage:'done',startsAt:Date.now(),accepted:true}).catch(function(e){if(mediaActionKey===key)mediaActionKey='';error(e);});return;}
ensureDeck().then(function(order){
if(!active||!cap()||!task||task.stage!=='reaction'||mediaActionKey!==key)return;
const ps=players(roomState),oldJudge=ps.findIndex(function(p){return p.uid===task.judgeUid;});
if(oldJudge<0||ps.length<2){status('Ждём участников для следующего раунда.');mediaActionKey='';return;}
const round=task.round+1,actorUid=task.judgeUid,judgeUid=ps[(oldJudge+1)%ps.length].uid,id=order[round];
if(!id){mediaActionKey='';return;}
const updates={};
updates['rooms/'+NET.room.code+'/tasks/task03']={stage:'play',startsAt:Date.now(),round:round,actorUid:actorUid,judgeUid:judgeUid,accepted:false,reactionId:null};
updates['task03Secrets/'+NET.room.code+'/'+actorUid]={round:round,emotionId:id};
return db().ref().update(updates);
}).catch(function(e){if(mediaActionKey===key)mediaActionKey='';error(e);});
}
return{mount:mount,unmount:unmount};
})();
