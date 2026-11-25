(()=>{
// Очки: чем крепче тварь, тем больше награда. Паук держит три касания — за него больше всех (решение автора).
const TYPES={spider:{hp:3,points:30,speed:.046},sphere:{hp:1,points:15,speed:.11},octopus:{hp:2,points:20,speed:.067},eye:{hp:1,points:25,speed:.13}};
function waveAt(elapsed,duration){return Math.min(4,Math.max(0,Math.floor(elapsed/(duration/5))));}
function chooseType(wave,r=Math.random()){
const list=wave===0?[['spider',.8],['sphere',1]]:wave===1?[['sphere',.5],['octopus',.8],['eye',1]]:wave===2?[['spider',.6],['octopus',.9],['sphere',1]]:[['spider',.25],['sphere',.5],['octopus',.75],['eye',1]];
return list.find(([,limit])=>r<limit)?.[0]||'eye';
}
function timeLabel(seconds){const n=Math.max(0,Math.ceil(seconds));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
function bossCanHit(elapsed,stunnedUntil){return elapsed>=stunnedUntil&&elapsed%10>=6;}
function applyHit(monster){if(monster.dead)return{points:0,killed:false};monster.hp--;if(monster.hp<=0){monster.dead=true;return{points:TYPES[monster.type].points,killed:true};}return{points:0,killed:false};}
const $=id=>document.getElementById(id),asset=name=>'assets/'+encodeURIComponent(name);
let current='home',player='Игрок',muted=false,game=null,videos={},mediaConfig=null,playing=[];
const files={spider:'mon_spider_move_green.webm',sphere:'boss_sphere_closed_green 1.webm',octopus:'mon_octopus_move_green.webm',eye:'mon_eye_idle_green.webm',mother:'boss_sphere_closed_green.webm'};
const fx={impulse:'sfx_impulse.mp3',spider:'sfx_spider_death.mp3',sphere:'sfx_sphere_death.mp3',octopus:'sfx_octopus_death.mp3',eye:'sfx_eye_death.mp3',mother:'sfx_mother_stun.mp3'};
function store(k,v){try{localStorage.setItem(k,v);}catch{}}
function read(k){try{return localStorage.getItem(k);}catch{return null;}}
$('name').value=read('anomaly-name')||'';
// Код доступа на экране входа. Пока проверяется только формат; настоящая проверка кода
// появится вместе с автоматической выдачей доступа (см. ТЗ, раздел 24) — там же сервер.
const CODE_MIN=6;
function normCode(v){return String(v||'').toUpperCase().replace(/[^0-9A-ZА-ЯЁ-]/g,'');}
$('access-code').value=read('anomaly-code')||'';
window.__accessCode=()=>normCode(($('access-code')&&$('access-code').value)||read('anomaly-code')||'');
function toast(s){$('toast').textContent=s;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>{$('toast').style.display='none';},6000);}
function screen(id){if(current==='cinema')$('movie').pause();document.querySelectorAll('.screen').forEach(el=>el.classList.toggle('active',el.id===id));current=id;document.body.dataset.screen=id;}
// Глушим и те звуки, что уже успели отзвучать: инструкция обороны оставалась в пуле и могла
// снова зазвучать поверх задания 2, пока команда ждала загрузку видео.
function stopAudio(){playing.forEach(a=>a.pause());playing=[];try{Object.values(pools).forEach(p=>p.forEach(a=>{try{a.pause();}catch(e){}}));}catch(e){}music.pause();}
// Задания 2–4 могут попросить остановить музыку боя: иначе она продолжает играть поверх видео.
window.__stopQuestAudio=stopAudio;
// Полноэкранный режим просим ОДИН раз за запуск: каждый повторный запрос Android показывает
// свою подсказку «проведите сверху вниз, чтобы выйти» — автор видит её постоянно.
let fsAsked=false;
function goFullscreen(){if(fsAsked)return;fsAsked=true;try{const el=$('app');if(!document.fullscreenElement&&el&&el.requestFullscreen){el.requestFullscreen().catch(()=>{fsAsked=false;});}}catch(e){}}
window.__goFullscreen=goFullscreen;
// Полный экран включаем уже после экрана с именем — на первом касании в следующем окне.
// Так подсказка браузера про выход из полного экрана не накрывает экран входа.
function armFullscreen(){document.addEventListener('pointerdown',function fs(){goFullscreen();document.removeEventListener('pointerdown',fs);},{capture:true});}
(function injectLobbyCSS(){
const css=`
#role,#lobby{align-items:flex-start;overflow-y:auto;overflow-x:hidden}
#role>.brief-card,#lobby>.lobby-card{flex-shrink:0;max-width:100%;min-width:0;margin:0 auto;width:min(760px,100%)}
#lobby .roomqr{background:#fff;padding:6px;border-radius:10px;line-height:0;flex:0 0 auto}
#lobby .roomqr img,#lobby .roomqr canvas{display:block;width:84px;height:84px}
#lobby .roomcode{display:flex;align-items:center;gap:14px;flex-wrap:nowrap}
#lobby .roomcode-main{display:flex;flex-direction:column;align-items:flex-start;gap:6px;flex:1;min-width:0}
@media(max-height:600px),(pointer:coarse) and (max-width:1100px){
#lobby>.lobby-card{display:grid;grid-template-columns:1.2fr 1fr;gap:12px 20px;padding:12px 14px}
#lobby>.lobby-card>h2{grid-column:1;font-size:20px;margin:0;line-height:1.2}
#lobby>.lobby-card>p.note{grid-column:1;font-size:14px;margin:6px 0}
#lobby>.lobby-card>.player-info{grid-column:2;grid-row:1;font-size:15px;padding:8px 0}
#lobby>.lobby-card>.player-info small{font-size:12px;display:block;margin-top:2px;color:#7ec8c8}
#lobby>.lobby-card>.roomcode{grid-column:1/-1;grid-row:auto;flex-direction:row;flex-wrap:nowrap;align-items:center;justify-content:space-between}
#lobby>.lobby-card>.roomcode-main>span{font-size:12px;display:block;margin-bottom:4px}
#lobby>.lobby-card>.roomcode-main>strong{font-size:20px;display:block;margin-bottom:8px}
#lobby>.lobby-card>.roomcode-main>button{font-size:13px;min-height:36px;padding:6px 10px}
#lobby>.lobby-card>.roomqr{width:64px;padding:4px}
#lobby>.lobby-card>.roomqr img,#lobby>.lobby-card>.roomqr canvas{width:56px;height:56px}
#lobby>.lobby-card>.lobby-buttons{grid-column:1/-1;grid-row:auto;margin-top:8px;gap:8px;flex-wrap:wrap;align-items:flex-start}
#lobby>.lobby-card button{font-size:14px;min-height:44px;padding:9px 12px;border-radius:8px}
#role>.brief-card{padding:12px 14px}
#role>.brief-card h2{font-size:18px;margin:6px 0}
#role>.brief-card p,#role>.brief-card .note{font-size:13px;margin:6px 0}
#role>.brief-card label{font-size:13px;margin-bottom:4px}
#role>.brief-card input{height:40px;font-size:16px;margin-bottom:8px;padding:0 10px}
#role>.brief-card button{font-size:14px;min-height:44px;padding:9px 12px;border-radius:8px}
#role>.brief-card .lobby-buttons{gap:8px;flex-wrap:wrap;margin-top:10px}
#role>.brief-card.join-mode #role-buttons,#role>.brief-card.join-mode #role-hint,#role>.brief-card.create-mode #role-buttons,#role>.brief-card.create-mode #role-hint{display:none}
}
`;
const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
})();
const diagnostics={version:'08-final',userAgent:navigator.userAgent,events:[],counts:{spawns:{},sounds:{},bossBursts:0}};
function report(kind,file,error){const record={at:new Date().toISOString(),kind,file,error:error?.name?error.name+': '+error.message:String(error)};diagnostics.events.push(record);if(diagnostics.events.length>250)diagnostics.events.shift();console.warn(record);}
window.anomalyDiagnostics=diagnostics;
function showDiagnostics(){const summary={...diagnostics,video:Object.fromEntries(Object.entries(videos).map(([k,v])=>[k,{file:files[k],time:v.currentTime,ready:v.readyState,paused:v.paused,error:v.error?.code,quality:v.getVideoPlaybackQuality?.()}]))};let panel=$('diagnostic-panel');if(!panel){panel=document.createElement('div');panel.id='diagnostic-panel';panel.style.cssText='position:fixed;inset:8%;z-index:999;background:#14282c;padding:20px;overflow:auto';panel.innerHTML='<button id="close-diag">Закрыть</button><p>Скопируйте текст отчёта и отправьте в чат.</p><textarea style="width:100%;height:65%;font:14px monospace"></textarea>';document.body.append(panel);$('close-diag').onclick=()=>panel.remove();}panel.querySelector('textarea').value=JSON.stringify(summary,null,2);}
document.addEventListener('keydown',e=>{if(e.key==='F8'){e.preventDefault();if(game)pause();showDiagnostics();}});
const pools={},music=new Audio(asset('music_defense_loop.mp3'));let musicEnabled=true,musicMissing=false;music.loop=true;music.volume=.16;music.preload='none';music.onerror=()=>{musicMissing=true;report('optional-music','music_defense_loop.mp3','Not available; game continues');};
function startMusic(){if(muted||!musicEnabled||musicMissing)return;music.play().catch(e=>report('music-play','music_defense_loop.mp3',e));}
const musicButton=document.createElement('button');musicButton.className='secondary';musicButton.textContent='Музыка: вкл';musicButton.onclick=()=>{musicEnabled=!musicEnabled;musicButton.textContent=musicEnabled?'Музыка: вкл':'Музыка: выкл';if(!musicEnabled)music.pause();else if(game&&!game.paused)startMusic();};$('pause-modal').querySelector('.glass')?.append(musicButton);
window.__setMuted=function(v){muted=!!v;try{music.muted=muted;}catch(e){}playing.forEach(a=>{a.muted=muted;});const mv=$('movie');if(mv)mv.muted=muted;};
function getPool(file){if(!pools[file]){pools[file]=Array.from({length:file==='v01_hits_rules.mp3'?1:4},()=>{const v=new Audio(asset(file));v.preload='auto';v.onerror=()=>report('audio-load',file,'MediaError '+v.error?.code);v.addEventListener('playing',()=>{diagnostics.counts.audioPlaying??={};diagnostics.counts.audioPlaying[file]=(diagnostics.counts.audioPlaying[file]||0)+1;});v.load();return v;});}return pools[file];}
Object.values(fx).forEach(getPool);
function sound(file,volume=.4){const pool=getPool(file);let a=pool.find(v=>v.paused||v.ended);if(!a){/* все копии уже звучат: удар не обрываем и не перезапускаем — иначе частые касания «заедают» */if(file===fx.impulse)return null;a=pool[0];}a.pause();a.currentTime=0;a.volume=volume;a.muted=muted;diagnostics.counts.sounds[file]=(diagnostics.counts.sounds[file]||0)+1;if(playing.length>40)playing=playing.filter(v=>!v.paused&&!v.ended);if(!playing.includes(a))playing.push(a);a.play().catch(e=>{report('audio-play',file,e);if(file==='v01_hits_rules.mp3')toast('Нажмите «Повторить инструкцию», чтобы включить звук.');});return a;}
function identify(){player=$('name').value.trim()||'Игрок';store('anomaly-name',player);const c=normCode($('access-code').value);$('access-code').value=c;store('anomaly-code',c);return c;}
$('entry').onsubmit=e=>{e.preventDefault();const code=identify();if(code&&code.length<CODE_MIN){toast('Код доступа короче, чем нужно — проверьте его');$('access-code').focus();return;}armFullscreen();$('role-name').textContent='Игрок: '+player;const fromQr=roomFromUrl();if(fromQr){screen('role');joinFromLink(fromQr);return;}screen('role');};
// Игрок пришёл по QR/ссылке капитана: один экран — только имя, дальше сразу в его комнату.
// Капитан (тот, кто открыл игру без ссылки и купил её) создаёт комнату один раз.
function roomFromUrl(){try{const m=location.search.match(/[?&]room=([a-zA-Z0-9]{4,8})/);return m?m[1].toLowerCase():'';}catch(e){return '';}}
async function joinFromLink(code){
const card=$('role-card');if(!card)return;
card.classList.add('join-mode');           // у гостя нет кнопок «я капитан» и «я игрок»
const ib=$('join-box');if(ib)ib.classList.add('hidden');
if(!window.NET){$('role-status').textContent='Нет связи с Firebase.';if(ib)ib.classList.remove('hidden');$('room-input').value=code;return;}
$('role-status').textContent='Входим в команду '+code+'…';
try{await NET.joinRoom(code.toUpperCase(),player);toast('Вы в команде: '+code);screen('lobby');}
catch(e){
$('role-status').textContent='';
if(ib)ib.classList.remove('hidden');
$('room-input').value=code;
$('join-error').textContent=e&&e.message?e.message:'Не удалось войти в комнату.';
}
}
const homeBtn=$('home-button');if(homeBtn)homeBtn.onclick=()=>screen('home');
const preloaded={};
function preloadVideo(name){if(preloaded[name])return preloaded[name];const v=document.createElement('video');v.src=asset(name);v.muted=true;v.preload='auto';v.playsInline=true;v.load();preloaded[name]=v;return v;}
function connectedPlayers(){const r=window.NET&&NET.room;if(!r)return[];return Object.entries(r.players||{}).filter(([uid,p])=>p.connected!==false);}
function doneCount(phase){return connectedPlayers().filter(([uid,p])=>p.seg===phase).length;}
function allDone(phase){const ps=connectedPlayers();return ps.length>0&&ps.every(([uid,p])=>p.seg===phase);}
function refreshMovieGate(){if(!(window.NET&&NET.inRoom()&&NET.isCaptain())||!movie.gate)return;const ps=connectedPlayers();if(allDone(movie.gate)){$('movie-next').classList.remove('hidden');$('movie-title').textContent='Команда готова — продолжайте';}else{$('movie-next').classList.add('hidden');$('movie-title').textContent='Ждём игроков… '+doneCount(movie.gate)+'/'+ps.length;}}
function refreshBattleGate(){if(!(window.NET&&NET.inRoom()&&NET.isCaptain()))return;const ps=connectedPlayers();if(allDone('rules')){$('battle-start').disabled=false;$('loading-note').textContent='';}else{$('battle-start').disabled=true;$('loading-note').textContent='Ждём, когда все дослушают… '+doneCount('rules')+'/'+ps.length;}}
async function movie(file,title,next,offset){stopAudio();screen('cinema');const v=$('movie');v.src=asset(file);v.muted=muted||!(window.NET&&NET.inRoom()&&NET.isCaptain());v.loop=false;clearTimeout(movie.waitT);clearTimeout(movie.stallT);clearTimeout(movie.forceT);if(offset&&offset>0.5){const seek=()=>{try{const d=v.duration||0;v.currentTime=d>0?Math.min(offset,Math.max(0,d-0.5)):offset;}catch(e){}};v.addEventListener('loadedmetadata',seek,{once:true});}
v.onended=()=>{clearTimeout(movie.stallT);const segId=(next===cinemaNext)?'cinema':'intro';if(window.NET&&NET.inRoom()){NET.setSeg(segId);if(NET.isCaptain()){movie.gate=segId;refreshMovieGate();movie.forceT=setTimeout(()=>{if(current==='cinema'&&NET.isCaptain()&&$('movie-next').classList.contains('hidden')){$('movie-next').classList.remove('hidden');$('movie-title').textContent='Продолжаем без отстающих';}},12000);}else{$('movie-next').classList.add('hidden');$('movie-title').textContent='Ожидание капитана…';}}else{$('movie-next').classList.remove('hidden');}};v.onwaiting=()=>{clearTimeout(movie.stallT);movie.stallT=setTimeout(()=>{if(window.NET&&NET.inRoom()&&NET.isCaptain()&&current==='cinema'&&!v.ended){toast('Видео застряло. Нажмите «Продолжить», чтобы вести команду дальше.');$('movie-next').classList.remove('hidden');}},12000);};v.onplaying=()=>{clearTimeout(movie.stallT);};v.onerror=()=>{toast('Не удалось загрузить видео.');$('movie-retry').classList.remove('hidden');};$('movie-title').textContent=title;$('movie-next').classList.add('hidden');$('movie-retry').classList.add('hidden');$('movie-next').onclick=(window.NET&&NET.inRoom()&&NET.isCaptain())?((next===cinemaNext)?cinemaNext:introNext):next;try{await v.play();}catch{setTimeout(()=>{v.play().catch(()=>{$('movie-retry').classList.remove('hidden');});},1200);}}
$('movie-retry').onclick=()=>{$('movie').play().then(()=>$('movie-retry').classList.add('hidden')).catch(()=>toast('Коснитесь кнопки ещё раз, чтобы включить видео.'));};

function showBrief(){screen('brief');const online=window.NET&&NET.inRoom();const cap=online&&NET.isCaptain();$('battle-start').disabled=true;$('loading-note').textContent=online&&!cap?'Ждём, когда капитан начнёт оборону…':'';const enable=()=>{if(window.NET&&NET.inRoom()){NET.setSeg('rules');if(NET.isCaptain()){refreshBattleGate();clearTimeout(showBrief.forceT);showBrief.forceT=setTimeout(()=>{if(current==='brief'&&NET.isCaptain()&&$('battle-start').disabled){$('battle-start').disabled=false;$('loading-note').textContent='';toast('Не все игроки ответили — продолжаем.');}},25000);}else{$('battle-start').disabled=true;$('loading-note').textContent='Ждём, когда капитан начнёт оборону…';}}else{$('battle-start').disabled=false;$('loading-note').textContent='';}};const a=sound('v01_hits_rules.mp3',.9);if(a){a.onended=enable;a.onerror=()=>{toast('Не удалось загрузить инструкцию.');enable();};}else{enable();}if(online)loadAssets().catch(()=>{});}
function intro(){movie('v01_intro.mp4','ВОЛЬТ · ОБОРОНА',showBrief);}
$('start').onclick=()=>{goFullscreen();movie('prologue_volt_city.mp4','ПРОЛОГ · ГОРОД',intro);};
// Кнопок «Инструкция» и «Повторить видео» на экране обороны больше нет — проверяем, что они есть,
// иначе обращение к отсутствующему узлу роняло весь модуль обороны.
const repeatIntroBtn=$('repeat-intro'),rulesAudioBtn=$('rules-audio');
if(repeatIntroBtn)repeatIntroBtn.onclick=intro;
if(rulesAudioBtn)rulesAudioBtn.onclick=showBrief;
async function loadAssets(){
if(mediaConfig)return;
// Кадры клипов тварей подрезаны на 10 пикселей внутрь: по периметру кадра у вырезания
// осталась полупрозрачная кромка, и на телефоне она видна тонкими полосками по краю
// нарисованного прямоугольника. Обрезка симметричная — тварь остаётся ровно по центру.
const config={"motherOpenStart":1.5,"motherOpenEnd":2.8,"crops":{"spider":[276,10,1230,1060],"sphere":[16,16,1888,1048],"octopus":[16,16,1888,1048],"eye":[560,48,779,983],"mother":[527,10,864,1044]}};
const loaded={};
try{await Promise.all(Object.entries(files).map(async([key,name])=>{
const v=document.createElement('video');v.src=asset(name);v.muted=true;v.loop=true;v.playsInline=true;v.preload='auto';
let rack=$('video-source-rack');if(!rack){rack=document.createElement('div');rack.id='video-source-rack';rack.style.cssText='position:fixed;left:0;bottom:0;z-index:1;display:flex;pointer-events:none;opacity:0.01';document.body.append(rack);}
v.style.cssText='width:4px;height:4px;object-fit:contain';rack.append(v);
diagnostics.frames??={};diagnostics.frames[key]={callbacks:0,mediaTime:0,presentedFrames:0};
if(v.requestVideoFrameCallback){const onFrame=(now,meta)=>{diagnostics.frames[key]={callbacks:diagnostics.frames[key].callbacks+1,mediaTime:meta.mediaTime,presentedFrames:meta.presentedFrames};v.requestVideoFrameCallback(onFrame);};v.requestVideoFrameCallback(onFrame);}
await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error(name)),25000);v.onloadeddata=()=>{clearTimeout(timeout);resolve();};v.onerror=()=>{clearTimeout(timeout);reject(Error(name));};});
v.onerror=()=>report('video-error',name,'MediaError '+v.error?.code);v.addEventListener('waiting',()=>report('video-waiting',name,'currentTime '+v.currentTime));loaded[key]=v;
}));}catch(error){Object.values(loaded).forEach(v=>{v.removeAttribute('src');v.load();});throw error;}
videos=loaded;mediaConfig=config;
}
$('battle-start').onclick=async()=>{const btn=$('battle-start');btn.disabled=true;$('loading-note').textContent='Подготовка обороны…';try{await loadAssets();if(window.NET&&NET.inRoom()){if(!NET.isCaptain()){toast('Старт обороны даёт капитан.');$('loading-note').textContent='Ждём, когда капитан начнёт оборону…';}else{NET.setPhase('battle',Date.now()+6000,300000);$('loading-note').textContent='Ожидаем общий старт…';}}else{await playSources();begin(300);}}catch(e){toast('Не удалось загрузить: '+e.message);}finally{btn.disabled=false;if(!(window.NET&&NET.inRoom()))$('loading-note').textContent='';}};
function stopMonsters(){Object.values(videos).forEach(v=>v.pause());$('monsters').replaceChildren();}
async function playSources(){await Promise.all(Object.entries(videos).map(async([key,v])=>{try{await v.play();}catch(e){report('video-play',files[key],e);throw Error(files[key]+' — '+e.name);}}));}
function monsterNode(key){return{video:videos[key]};}
const animationRates={spider:1,octopus:1,eye:1,sphere:1,mother:1};
function positionMonster(node,key,x,y,size){const v=videos[key];if(v.readyState<2)return;const crop=mediaConfig.crops[key],scale=size/Math.max(crop[2],crop[3]);/* рисуем только по целым пикселям: дробный край давал сглаженную полосу на телефоне */const dw=Math.round(crop[2]*scale),dh=Math.round(crop[3]*scale),dx=Math.round(x-dw/2),dy=Math.round(y-dh/2);ctx.drawImage(v,crop[0],crop[1],crop[2],crop[3],dx,dy,dw,dh);}
function motherCanHit(){if(!game||!game.boss||game.elapsed<game.stunnedUntil)return false;const t=game.boss.video.currentTime;return t>=mediaConfig.motherOpenStart&&t<=mediaConfig.motherOpenEnd&&!game.boss.hitThisCycle;}
const canvas=$('field'),ctx=canvas.getContext('2d');let width=0,height=0;
function resize(){const r=canvas.getBoundingClientRect();width=r.width||innerWidth;height=r.height||innerHeight;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
window.addEventListener('resize',()=>{if(game){resize();if(innerHeight>innerWidth)pause();}});
function begin(duration){if(game)return;/* второй запуск боя на том же устройстве запрещён: отсюда «бой пошёл заново» */stopAudio();Object.values(videos).forEach(v=>{v.currentTime=.12;v.playbackRate=animationRates[Object.keys(videos).find(k=>videos[k]===v)]||1;v.play().catch(e=>report('video-play',v.src,e));});startMusic();screen('battle');resize();game={duration,elapsed:0,score:0,kills:0,stuns:0,stunnedUntil:0,monsters:[],sparks:[],spawn:0,last:performance.now(),paused:false,mother:false,boss:null,netClock:0,netWarn:false};$('pause-modal').classList.add('hidden');$('boss-tip').classList.add('hidden');$('street').currentTime=0;$('street').play().catch(()=>{});$('score').textContent='0';$('team-score').textContent='0';$('clock').textContent=timeLabel(duration);if(window.NET&&NET.inRoom()){NET.checkNode().then(ok=>{if(!ok&&game&&!game.nodeWarn){game.nodeWarn=true;toast('Устройство не зарегистрировано в комнате — счёт не попадёт в общий.');}});}requestAnimationFrame(tick);}
function spawn(type,origin=null){diagnostics.counts.spawns[type]=(diagnostics.counts.spawns[type]||0)+1;const child=!!origin;const ground=type==='spider';const lane=.76+Math.random()*.13;game.monsters.push({type,hp:TYPES[type].hp,maxHp:TYPES[type].hp,x:origin?.x??(.43+Math.random()*.14),y:origin?.y??(ground?lane:.43+Math.random()*.15),angle:ground?(Math.random()<.5?0:Math.PI):(.25+Math.random()*.5)*Math.PI,age:0,phase:Math.random()*6,dead:false,flash:0,node:monsterNode(type),child,scale:child?.42:1,lane,vx:(Math.random()-.5)*.3,vy:child?.20:0});}
function animateMonster(m,dt){m.age+=dt;const speed=TYPES[m.type].speed;
if(m.child&&m.age<.65){m.vy+=.65*dt;m.x+=m.vx*dt;m.y+=m.vy*dt;return;}
if(m.type==='spider'){const direction=Math.cos(m.angle)>=0?1:-1;m.x+=direction*speed*2.3*dt;m.y+=(m.lane-m.y)*Math.min(1,dt*9);}
else{m.x+=Math.cos(m.angle)*speed*1.5*dt;m.y+=Math.sin(m.angle)*speed*1.5*dt;if(m.type==='eye')m.angle+=Math.sin(m.age*3+m.phase)*1.7*dt;if(m.type==='octopus')m.x+=Math.sin(m.age*4+m.phase)*.055*dt;}
}
function drawMonster(m,size){/* целые координаты: дробное смещение давало сглаженную полосу по краю кадра на телефоне */const x=Math.round(m.x*width),y=Math.round(m.y*height);const actual=size*m.scale;ctx.save();ctx.translate(x,y);let bob=m.type==='spider'?Math.sin(m.age*17+m.phase)*actual*.012:Math.sin(m.age*7+m.phase)*actual*.025;let tilt=m.type==='spider'?Math.sin(m.age*13+m.phase)*.025:Math.sin(m.age*5+m.phase)*.06;ctx.rotate(tilt);if(m.type==='spider'){ctx.save();ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(0,actual*.32,actual*.36,actual*.06,0,0,Math.PI*2);ctx.fill();ctx.restore();}positionMonster(m.node,m.type,0,bob,actual);ctx.restore();}
function tick(now){if(!game)return;if(game.paused){game.last=now;requestAnimationFrame(tick);return;}const dt=Math.min((now-game.last)/1000,.1);game.last=now;game.elapsed+=dt;if(game.elapsed>=game.duration){finish();return;}const wave=waveAt(game.elapsed,game.duration),size=Math.max(90,width*.14);
game.spawn+=dt;const interval=[1.3,.85,.95,.7,.85][wave];if(wave<4&&game.spawn>=interval&&game.monsters.length<16&&game.elapsed>=game.stunnedUntil){game.spawn=0;const count=wave===1?3:wave===3?2:1;for(let i=0;i<count;i++)spawn(chooseType(wave));}
game.mother=wave===4;if(window.NET&&NET.inRoom()){game.netClock+=dt;if(game.netClock>=2){game.netClock=0;NET.reportResult({score:game.score,kills:game.kills,stuns:game.stuns}).catch(()=>{if(game&&!game.netWarn){game.netWarn=true;toast('Не удалось отправить счёт — проверьте связь.');}});}}$('clock').textContent=timeLabel(game.duration-game.elapsed);$('score').textContent=game.score;$('team-score').textContent=window.NET&&NET.inRoom()?teamScore+game.score:game.score;
ctx.clearRect(0,0,width,height);
if(game.mother){if(!game.boss){game.boss={...monsterNode('mother'),lastTime:0,hitThisCycle:false,burstThisCycle:false,spawnClock:0};videos.mother.currentTime=.12;}positionMonster(game.boss,'mother',width*.5,height*.43,Math.min(height*.65,width*.28));}
for(const m of game.monsters){animateMonster(m,dt);drawMonster(m,size);
const x=m.x*width,y=m.y*height,actual=size*m.scale;
if(m.maxHp>1){for(let i=0;i<m.maxHp;i++){ctx.beginPath();ctx.arc(x+(i-(m.maxHp-1)/2)*10,y-actual*.32,3,0,Math.PI*2);ctx.fillStyle=i<m.hp?'#43f1de':'#405c60';ctx.fill();}}
if(m.flash>0){m.flash-=dt;ctx.strokeStyle='#dffffb';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,actual*.3,0,Math.PI*2);ctx.stroke();}
if(m.x<-.12||m.x>1.12||m.y<-.15||m.y>1.15)m.dead=true;
}
game.monsters=game.monsters.filter(m=>!m.dead);
if(game.mother){const boss=game.boss,t=boss.video.currentTime;if(t<boss.lastTime){boss.hitThisCycle=false;boss.burstThisCycle=false;}boss.lastTime=t;
if(motherCanHit()&&game.elapsed>=game.stunnedUntil){boss.spawnClock+=dt;if(boss.spawnClock>=.13&&game.monsters.length<36){boss.spawnClock=0;diagnostics.counts.bossBursts++;const types=['spider','sphere','octopus','eye'];const type=types[Math.floor(Math.random()*types.length)];const s=Math.min(height*.65,width*.28);spawn(type,{x:.5+(Math.random()-.5)*.04,y:.43+s*.23/height});}}else boss.spawnClock=0;
$('boss-tip').classList.toggle('hidden',!motherCanHit());
}
for(const s of game.sparks){s.life-=dt;ctx.globalAlpha=Math.max(0,s.life/.6);ctx.strokeStyle='#45eee2';ctx.lineWidth=2;ctx.beginPath();ctx.arc(s.x,s.y,(.6-s.life)*70+8,0,Math.PI*2);ctx.stroke();if(s.text){ctx.fillStyle='#30e5dc';ctx.font='700 28px QuestSans';ctx.textAlign='center';ctx.fillText(s.text,s.x,s.y-20-(.6-s.life)*35);}ctx.globalAlpha=1;}
game.sparks=game.sparks.filter(s=>s.life>0);requestAnimationFrame(tick);
}
canvas.addEventListener('pointerdown',e=>{if(!game||game.paused||e.button>0)return;e.preventDefault();const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;let points=0;const size=Math.max(90,width*.14);
let hitMonster=false;
for(let i=game.monsters.length-1;i>=0;i--){const m=game.monsters[i];if(!m.dead&&Math.hypot(x-m.x*width,y-m.y*height)<size*m.scale*.38){hitMonster=true;const hit=applyHit(m);m.flash=.15;points=hit.points;if(hit.killed){game.kills++;sound(fx[m.type]);}break;}}
if(!hitMonster&&game.mother&&Math.hypot(x-width*.5,y-height*.43)<Math.min(height*.65,width*.28)*.35&&motherCanHit()){game.boss.hitThisCycle=true;points=100;game.stuns++;game.stunnedUntil=game.elapsed+5;sound(fx.mother);}
game.score+=points;$('score').textContent=game.score;$('team-score').textContent=window.NET&&NET.inRoom()?teamScore+game.score:game.score;game.sparks.push({x,y,life:.6,text:points?'+'+points:''});sound(fx.impulse,.25);
});
function pause(){if(!game||game.paused)return;game.paused=true;Object.values(videos).forEach(v=>v.pause());$('street').pause();stopAudio();$('pause-modal').classList.remove('hidden');}
$('battle-pause').onclick=pause;window.__testSkipBattle=function(){if(game){game.elapsed=game.duration;}};$('resume').onclick=()=>{if(!game)return;game.paused=false;Object.entries(videos).forEach(([k,v])=>v.play().catch(e=>report('video-resume',files[k],e)));startMusic();game.last=performance.now();$('pause-modal').classList.add('hidden');$('street').play().catch(()=>{});};
$('quit').onclick=()=>{game=null;stopMonsters();$('street').pause();$('pause-modal').classList.add('hidden');screen('brief');};
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(game)pause();if(current==='cinema'){$('movie').pause();}}});
function finish(){const g=game;$('clock').textContent='00:00';game=null;stopMonsters();$('street').pause();stopAudio();$('result-score').textContent=g.score;$('result-name').textContent=player;$('result-kills').textContent=(g.kills+g.stuns);$('result-stuns').textContent=g.stuns;store('anomaly-last-result',JSON.stringify({player,score:g.score,kills:g.kills,stuns:g.stuns}));if(window.NET&&NET.inRoom()){lastOwnFinal=g.score;NET.reportResult({score:g.score,kills:g.kills,stuns:g.stuns}).then(()=>new Promise(res=>setTimeout(res,1200))).then(()=>NET.readTeam()).then(players=>{let total=g.score;Object.entries(players||{}).forEach(([uid,p])=>{if(uid!==NET.uid)total+=(p.score||0);});$('result-team').textContent=total;}).catch(()=>{$('result-team').textContent=(teamScore+g.score);});}else{$('result-team').textContent=g.score;}screen('result');if(window.NET&&NET.inRoom()&&NET.isCaptain()){/* комнату выводим из состояния «бой»: иначе перезагрузка или переподключение устройства запускали бой заново вместо итога */NET.setPhase('result',Date.now()).catch(()=>{});}}

// ===== КОМАНДНАЯ ИГРА ЧЕРЕЗ FIREBASE (финальная версия) =====
let teamScore=0;let lastOwnFinal=0;let warnedNoNode=false;let selectedSize=2;
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
if(!$('result-team')){const rt=document.createElement('p');rt.className='note';rt.id='result-team';$('result').querySelector('.result-stats').after(rt);}
(function probeStreet(){const v=$('street');if(v.getAttribute('src'))return;const cand=['defense_street.mp4','street_loop.webm','street.webm','street_loop.mp4','street.mp4'];let i=0;const tryNext=()=>{if(i>=cand.length)return;v.src=asset(cand[i++]);v.onerror=tryNext;v.onloadeddata=()=>{v.onerror=null;};v.load();};tryNext();})();
const roleSec=document.createElement('section');roleSec.className='screen';roleSec.id='role';
roleSec.innerHTML='<div class="glass brief-card" id="role-card"><p class="note" id="role-name"></p><p class="note" id="role-hint"></p><div class="lobby-buttons" id="role-buttons"><button class="primary" id="role-captain" type="button">Я капитан — создать комнату</button><button class="secondary" id="role-join" type="button" style="display:none">Я игрок — ввести код</button></div><div id="create-box" class="hidden"><label>Сколько игроков в команде (включая вас)? Нажмите цифру:</label><div id="size-grid" style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:8px 0">'+[1,2,3,4,5,6,7,8,9,10].map(n=>'<button type="button" class="secondary size-pick" data-n="'+n+'">'+n+'</button>').join('')+'</div><div class="lobby-buttons"><button class="primary" id="create-go" type="button">Создать комнату →</button></div><p class="note" id="create-error"></p></div><div id="join-box" class="hidden"><label for="room-input">Код команды</label><input id="room-input" placeholder="например a1b2c3" autocomplete="off" enterkeyhint="go"><div class="lobby-buttons"><button class="primary" id="join-go" type="button">Войти в команду →</button></div><p class="note" id="join-error"></p></div><p class="note" id="role-status"></p><div class="lobby-buttons"><button class="secondary hidden" id="role-solo" type="button">Продолжить одному</button></div></div>';
$('app').append(roleSec);
function pickSize(n){selectedSize=n;roleSec.querySelectorAll('.size-pick').forEach(b=>{const on=+b.dataset.n===n;b.classList.toggle('primary',on);b.classList.toggle('secondary',!on);});}
roleSec.addEventListener('click',e=>{const b=e.target.closest?e.target.closest('.size-pick'):null;if(b)pickSize(+b.dataset.n);});
function exitRoleModes(){const card=$('role-card');card.classList.remove('join-mode');card.classList.remove('create-mode');$('role-buttons').style.display='';$('role-hint').style.display='';$('join-box').classList.add('hidden');$('create-box').classList.add('hidden');$('join-error').textContent='';$('create-error').textContent='';$('role-status').textContent='';}
function markRoleChoice(which){['role-captain','role-join'].forEach(function(id){const b=$(id);if(!b)return;const on=(id==='role-'+which);b.classList.toggle('primary',on);b.classList.toggle('secondary',!on);});const rn=$('role-name');if(rn)rn.textContent=(which==='captain'?'Капитан: ':'Игрок: ')+player;}
$('role-join').onclick=()=>{exitRoleModes();markRoleChoice('join');$('role-card').classList.add('join-mode');$('join-box').classList.remove('hidden');$('room-input').value='';setTimeout(()=>{$('room-input').focus();},50);};
$('role-captain').onclick=()=>{markRoleChoice('captain');if(!window.NET){$('role-status').textContent='Нет связи с Firebase — доступен одиночный режим.';$('role-solo').classList.remove('hidden');return;}exitRoleModes();$('role-card').classList.add('create-mode');$('role-buttons').style.display='none';$('role-hint').style.display='none';$('create-box').classList.remove('hidden');pickSize(parseInt(read('anomaly-teamsize'),10)||2);};
$('create-go').onclick=async()=>{if(!window.NET){$('role-status').textContent='Нет связи с Firebase.';$('role-solo').classList.remove('hidden');return;}const n=selectedSize;store('anomaly-teamsize',String(n));goFullscreen();$('role-status').textContent='Создаём комнату…';try{const code=await NET.createRoom(player,n);toast('Сохраните код команды: '+code.toLowerCase());screen('lobby');}catch(e){$('role-status').textContent=e.message||'Не удалось создать комнату.';}};
$('room-input').addEventListener('focus',()=>{setTimeout(()=>{$('room-input').scrollIntoView({block:'center',behavior:'smooth'});},350);});
$('room-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('join-go').click();}});
$('role-solo').onclick=()=>screen('lobby');
$('join-go').onclick=async()=>{if(!window.NET){$('role-status').textContent='Нет связи с Firebase.';$('role-solo').classList.remove('hidden');return;}goFullscreen();const code=($('room-input').value||'').trim().toUpperCase();if(code.length<4){$('join-error').textContent='Введите код команды.';return;}$('join-error').textContent='';$('role-status').textContent='Подключаемся…';try{await NET.joinRoom(code,player);toast('Вы в команде. Сохраните код: '+code.toLowerCase());screen('lobby');}catch(e){$('role-status').textContent='';$('join-error').textContent=e.message||'Комната не найдена';}};
function renderLobby(room){preloadVideo('prologue_volt_city.mp4');preloadVideo('v01_intro.mp4');const host=$('lobby').querySelector('.lobby-card')||$('lobby').firstElementChild;if(!host)return;const isCap=!!(room&&room.captain===NET.uid);const list=room?Object.entries(room.players||{}):[];const online=list.filter(([uid,p])=>p.connected!==false).length;const size=(room&&room.state&&room.state.teamSize)||2;const full=online>=size;const ph=room.state&&room.state.phase;
const sig=[isCap?1:0,online,size,ph,room?room.code:'',list.map(([u,p])=>u+(p.connected!==false?1:0)+(p.name||'')).join(',')].join('|');
if(host.dataset.sig===sig)return;host.dataset.sig=sig;
host.innerHTML='<h2>Команда на связи</h2>'
+'<p class="note">'+(room?(ph==='result'?'Оборона завершена. Ждите, пока капитан запустит повтор.':(isCap?(full?'Все в сборе — можно начинать квест.':'Ожидание игроков: подключилось '+online+' из '+size+'.'):'Подключилось '+online+' из '+size+'. Ждём старта капитана…')):'Подключаемся…')+'</p>'
+'<div class="player-info"><strong>'+(isCap?'Капитан: ':'Игрок: ')+esc(player)+'</strong>'+(room&&!NET.captainOnline()?'<small>⚠ капитан не на связи — выбираем нового</small>':'')+'</div>'
+'<div class="roomcode"><div class="roomcode-main"><span>Код команды</span><strong id="room-code">'+(room?room.code.toLowerCase():'…')+'</strong><button class="secondary" id="room-copy" type="button">Копировать</button></div><div class="roomqr" id="room-qr"></div>'+(isCap?'<button class="primary lobby-start'+(ph==='lobby'?'':' hidden')+'" id="start-quest" type="button"'+(!full?' disabled':'')+'>Начать квест →</button>':'')+'</div>';
const qrEl=host.querySelector('#room-qr');
if(qrEl&&room&&window.QRCode){const code=room.code.toLowerCase();if(qrEl.dataset.code!==code){qrEl.dataset.code=code;qrEl.innerHTML='';try{new QRCode(qrEl,{text:location.origin+location.pathname+'?room='+code,width:104,height:104,correctLevel:QRCode.CorrectLevel.M});}catch(e){}}}
}
$('lobby').addEventListener('click',e=>{
const id=e.target&&e.target.id;const r=window.NET&&NET.room;const curSize=(r&&r.state&&r.state.teamSize)||2;
if(id==='room-copy'){const el=$('room-code');const c=el?el.textContent:'';if(c&&navigator.clipboard)navigator.clipboard.writeText(c).then(()=>toast('Код скопирован: '+c));}
else if(id==='start-quest'){if(!window.NET||!r||!NET.isCaptain())return;const online=Object.entries(r.players||{}).filter(([uid,p])=>p.connected!==false).length;if(online<curSize){toast('Подключилось '+online+' из '+curSize+'. Дождитесь игроков.');return;}NET.setPhase('cinema',Date.now()+2500);}
else if(id==='leave-room'){if(window.NET)NET.leaveRoom();screen('home');}});
function cinemaNext(){if(window.NET&&NET.inRoom()){if(NET.isCaptain())NET.setPhase('intro',Date.now()+800);}else intro();}
function introNext(){if(window.NET&&NET.inRoom()){if(NET.isCaptain())NET.setPhase('brief',0);}else showBrief();}
let syncCinemaAt=0,syncIntroAt=0,syncBattleAt=0;
if(window.NET){NET.onProgress(t=>{if(current==='role')$('role-status').textContent=t;});
NET.onRoom(room=>{if(current==='lobby')renderLobby(room);if(!room||!room.state)return;const st=room.state;const now=Date.now();
teamScore=Object.entries(room.players||{}).reduce((s,[uid,p])=>uid===NET.uid?s:s+(p.score||0),0);
if(game)$('team-score').textContent=teamScore+game.score;
if(current==='result'){const ownReported=(room.players&&room.players[NET.uid])?room.players[NET.uid].score||0:0;$('result-team').textContent=(teamScore+Math.max(lastOwnFinal,ownReported));}
if(current==='battle'&&room.players&&!room.players[NET.uid]&&!warnedNoNode){warnedNoNode=true;toast('Устройство не зарегистрировано в комнате. Перезайдите по коду.');}
if(window.NET&&NET.isCaptain()){if(current==='cinema')refreshMovieGate();if(current==='brief')refreshBattleGate();}
if(st.phase==='cinema'&&syncCinemaAt!==st.startsAt){syncCinemaAt=st.startsAt||0;syncIntroAt=0;syncBattleAt=0;const d=Math.max(0,(st.startsAt||0)-now);const off=Math.max(0,(now-(st.startsAt||0))/1000);preloadVideo('v01_intro.mp4');setTimeout(()=>{const r=NET.room;if(r&&r.state&&r.state.phase==='cinema')movie('prologue_volt_city.mp4','ПРОЛОГ · ГОРОД',cinemaNext,off);},d);}
if(st.phase==='intro'&&syncIntroAt!==st.startsAt){syncIntroAt=st.startsAt||0;const d=Math.max(0,(st.startsAt||0)-now);const off=Math.max(0,(now-(st.startsAt||0))/1000);setTimeout(()=>{const r=NET.room;if(r&&r.state&&r.state.phase==='intro')movie('v01_intro.mp4','ВОЛЬТ · ОБОРОНА',introNext,off);},d);}
if(st.phase==='brief'&&current!=='brief'&&current!=='battle'){showBrief();}
if(st.phase==='result'&&(current==='battle'||current==='brief')){
// Капитан уже завершил оборону: у всех встаёт итог, а не продолжение боя.
if(game){const g=game;game=null;stopMonsters();$('street').pause();stopAudio();lastOwnFinal=g.score;$('result-score').textContent=g.score;$('result-name').textContent=player;$('result-kills').textContent=(g.kills+g.stuns);$('result-stuns').textContent=g.stuns;$('pause-modal').classList.add('hidden');}
screen('result');
}
if(st.phase==='battle'&&syncBattleAt!==st.startsAt){syncBattleAt=st.startsAt||0;const dur=(st.durationMs||300000)/1000;const startAt=st.startsAt||0;const remain=(startAt+dur*1000-now)/1000;if(remain>1&&!game&&current!=='result'){const d=Math.max(0,startAt-now);if(current!=='brief'&&current!=='battle')showBrief();$('loading-note').textContent=d>0?'Общий старт через '+Math.ceil(d/1000)+'…':'Подключение к идущей обороне…';loadAssets().then(()=>{setTimeout(()=>{const r=NET.room;if(!game&&r&&r.state&&r.state.phase==='battle'){const left=(startAt+dur*1000-Date.now())/1000;if(left>1)playSources().then(()=>begin(left)).catch(()=>begin(left));}},d);}).catch(e=>{syncBattleAt=0;window.__battleRetryN=(window.__battleRetryN||0)+1;if(window.__battleRetryN<=2)toast('Не удалось загрузить видео обороны. Повторяем…');if($('loading-note'))$('loading-note').textContent='Повторяем подключение к обороне…';});}}
});}
screen('home');
})();

// ============================================================
// Подсказка «чей ход», служебные плашки, защита экрана от сна
// ============================================================
(function(){
var CAP_STAGES={code:1,answer:1,quiz:1,protocol:1,play:1,clip:1,reveal:1,result:1,done:1,
countdown:1,city:1,run:1,ask:1,reaction:1,guess:1,verdict:1,word:1,order:1};
var prevCap=null,capHintEl=null,sysEl=null,sysTimer=null,offline=false;

function ensure(id,cls){
var e=document.getElementById(id);
if(!e){e=document.createElement('div');e.id=id;if(cls)e.className=cls;document.body.appendChild(e);}
return e;
}
function room(){return (window.NET&&NET.room)||null;}
function isCap(){return !!(window.NET&&NET.isCaptain&&NET.isCaptain());}
function taskNode(scr){
var r=room();if(!r||!r.tasks)return null;
return r.tasks[scr==='brief'?'task01':scr]||null;
}
function showSys(text,warn,ms){
sysEl=ensure('sys-plaque');
sysEl.textContent=text;
sysEl.className='show'+(warn?' warn':'');
clearTimeout(sysTimer);
if(ms)sysTimer=setTimeout(function(){if(sysEl)sysEl.className='';},ms);
}
function hideSys(){if(sysEl)sysEl.className='';}

// «Следующий шаг у капитана» / «Капитан запускает видео» — только для игроков и только
// в самих заданиях: на инструкции показываем про видео, в игре — про ход капитана.
function paintCapHint(){
try{
var scr=String(document.body.dataset.screen||'');
var isTask=/^task\d+$/.test(scr)||scr==='brief';
var el=ensure('cap-hint');
if(!isTask||isCap()){el.className='';el.textContent='';return;}
var n=taskNode(scr),st=n?(n.stage||''):'';
var txt='';
if(st==='wait')txt='Капитан запускает инструкцию — смотрите вместе';
else if(st&&st!=='intro'&&CAP_STAGES[st])txt='Следующий шаг у капитана';
if(!txt){el.className='';el.textContent='';return;}
if(el.textContent!==txt)el.textContent=txt;
el.className='show';
}catch(e){}
}

function onRoom(room){
try{
paintCapHint();
if(!room)return;
var capUid=room.captain||'';
if(prevCap&&capUid&&capUid!==prevCap&&capUid!==((window.NET&&NET.uid)||'')){
var p=(room.players||{})[capUid];
showSys('Капитан сменился: теперь ведёт '+(p&&p.name?p.name:'другой игрок'),false,7000);
}
prevCap=capUid||prevCap;
}catch(e){}
}
ensure('cap-hint');ensure('sys-plaque');
if(window.NET&&NET.onRoom)NET.onRoom(onRoom);
setInterval(paintCapHint,1000);

// Нет связи: показываем «Нет связи, ждём…» и сами ждём восстановления —
// Firebase переподключается сам, повторных нажатий не нужно.
try{
firebase.database().ref('.info/connected').on('value',function(s){
var on=!!s.val();
if(on===offline)return;
offline=!on;
if(!on)showSys('Нет связи, ждём…',true,0);
else {showSys('Связь восстановлена',false,2500);}
});
}catch(e){}

// Экран не должен гаснуть на всём квесте.
var wakeRef=null;
function keepAwake(){
try{
if(!navigator.wakeLock||!navigator.wakeLock.request||wakeRef)return;
navigator.wakeLock.request('screen').then(function(s){
wakeRef=s;s.addEventListener('release',function(){wakeRef=null;});
}).catch(function(){});
}catch(e){}
}
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')keepAwake();});
document.addEventListener('pointerdown',function(){keepAwake();},{passive:true});
if(document.readyState!=='loading')keepAwake();else document.addEventListener('DOMContentLoaded',keepAwake);

window.__paintCapHint=paintCapHint;
window.__showSys=showSys;
})();
/* ================== ИМПУЛЬС КОМАНДЫ ==================
   Название только «Импульс команды»; слов «баллы», «очки», «резонанс» нет.
   Каждое задание даёт до 100, копится до 1000. Штрафы: подсказка -15,
   «Помощь Вольта» -25, неверная попытка -8, повтор просмотра -5.
   Ниже нуля задание не опускается, штрафы одного задания на другие не переходят.
   Счётчики заданий обнуляются на каждом раунде (Химеры, Голос, Танец), поэтому
   штрафы копятся в комнате: tasks/<задание>/impPen. Пишет только капитан —
   правила базы разрешают запись в задания; остальные видят общую цифру.
   Плашка стоит на экране идущего задания и в бою, а на входе, в лобби,
   на инструкции и на итогах её нет. Итог задания дописывается строкой
   на экран завершения, в карточке города — отдельной строкой. */
(function(){
var ORDER=['task01','task02','task03','task04','task05','task06','task07','task08','task09','task10'];
var TITLES={task01:'Оборона',task02:'Кристальный шифр',task03:'Чувства Лума',task04:'Химеры',
task05:'Голос аномалии',task06:'Танец Лума',task07:'Прорыв к лаборатории',task08:'Код Ядра',
task09:'Стабилизатор',task10:'Город'};
var P_HINT=15,P_ERR=8,P_REPLAY=5,P_VOLT=25;
// экраны завершения заданий: куда дописывается строка «ИМПУЛЬС КОМАНДЫ — N»
var DONE_SEL=['#result .result-card','#t2 .t2-nextwrap','#t3 .t3-done','#t4 .t4-done',
'#t5 .t5-done','#t6 .t6-done','#t8 .t8-done','#t9 .t9-done','#t10 .t10-done'];

function num(v){v=+v||0;return isFinite(v)?v:0;}
function sum(o){var s=0;if(o&&typeof o==='object'){for(var k in o)s+=num(o[k]);}else s=num(o);return s;}
function room(){return (window.NET&&NET.room)||null;}
function imCap(){try{return !!(window.NET&&NET.isCaptain&&NET.isCaptain());}catch(e){return false;}}
function phase(){try{return String((room()&&room().state&&room().state.phase)||'');}catch(e){return '';}}
function node(name){var r=room();return (r&&r.tasks&&r.tasks[name])||null;}

// ——— какие счётчики задания сколько стоят ———
var WATCH={
task02:[{id:'tries',get:function(n){return num(n.attempts);},p:P_ERR,w:'ошибка'}],
task04:[{id:'hint',get:function(n){return sum(n.hintLevel);},p:P_HINT,w:'подсказка'},
        {id:'tries',get:function(n){return sum(n.attempts);},p:P_ERR,w:'ошибка'},
        {id:'reps',get:function(n){return num(n.replays);},p:P_REPLAY,w:'повтор'}],
task05:[{id:'hint',get:function(n){return num(n.hintLevel);},p:function(v){return v>=3?P_VOLT:P_HINT;},w:'подсказка'}],
task06:[{id:'hint',get:function(n){return num(n.hintOrder)+num(n.hintWord);},p:P_HINT,w:'подсказка'},
        {id:'tries',get:function(n){return num(n.attemptsOrder)+num(n.attemptsWord);},p:P_ERR,w:'ошибка'},
        {id:'reps',get:function(n){return num(n.replayClearedAt);},p:P_REPLAY,w:'повтор',stamp:true}],
task07:[{id:'fails',get:function(n){return num((n.result||{}).failed);},p:P_ERR,w:'ошибка'}],
task08:[{id:'hint',get:function(n){return num(n.hintLevel);},p:P_HINT,w:'подсказка'},
        {id:'tries',get:function(n){return num(n.attempts);},p:P_ERR,w:'ошибка'},
        {id:'reps',get:function(n){return num(n.replayClearedAt);},p:P_REPLAY,w:'повтор',stamp:true}]
};

var seen={},pen={},seeded={},lastPenalty=null,lastTotal=null,lastParts=null;

// Штрафы копим по приросту счётчиков: сброс раунда (значение уменьшилось) штрафом не считается.
function ledger(){
  if(!imCap())return;
  var r=room();if(!r||!r.code)return;
  Object.keys(WATCH).forEach(function(name){
    var n=node(name);if(!n)return;
    var list=WATCH[name],first=!seeded[name];
    if(first){seeded[name]=true;pen[name]=Math.max(num(pen[name]),num(n.impPen));
      list.forEach(function(k){seen[name+':'+k.id]=k.get(n);});
      return;
    }
    var pts=0,why='';
    list.forEach(function(k){
      var key=name+':'+k.id,v=k.get(n),prev=seen[key];
      if(prev===undefined){seen[key]=v;return;}
      // Счётчик уменьшился — значит начался новый раунд/участок и задание обнулило поле.
      // Считаем накопленное в нём заново, иначе ошибки нового раунда терялись.
      if(v<prev)prev=0;
      if(v>prev){
        // «Помощь Вольта» дороже обычной подсказки, поэтому каждая прибавленная ступень
        // оценивается отдельно: prev+1, prev+2, ...
        var add=0;
        if(typeof k.p==='function'){for(var i=prev+1;i<=v;i++)add+=k.p(i);}
        else if(k.stamp)add=k.p;
        else add=(v-prev)*k.p;
        pts+=add;why=k.w;
      }
      seen[key]=v;
    });
    if(pts>0){
      pen[name]=num(pen[name])+pts;
      lastPenalty={pts:pts,why:why||'штраф',name:name,at:Date.now()};
      try{firebase.database().ref('rooms/'+r.code+'/tasks/'+name+'/impPen').set(Math.round(pen[name]));}catch(e){}
    }
  });
}

function doneTask(name){
  var ph=phase();
  if(name==='task01')return ph==='result'||/^task\d\d$/.test(ph);
  var n=node(name);if(!n)return false;
  if(name==='task07')return num(n.round)>=9||(ph==='task08'||ph==='task09'||ph==='task10');
  return n.stage==='done'||n.completed===true||num(n.completedAt)>0;
}
// Штрафы: у остальных заданий они уже накоплены в комнате, у задания 10 — только по счётчикам.
function penaltyOf(name){
  var n=node(name),p=num(pen[name]);
  if(n){
    // по заданию 10 в комнату новые поля писать нельзя (правила базы), поэтому считаем
    // по накопленным счётчикам кода и протокола
    if(name==='task10')p=Math.max(p,num(n.codeHintLevel)*P_HINT+num(n.protocolHintLevel)*P_HINT+
      num(n.codeAttempts)*P_ERR+num(n.protocolAttempts)*P_ERR);
  }
  return p;
}
function scoreOf(name){
  if(!node(name)&&name!=='task01')return 0;
  return Math.max(0,Math.min(100,100-Math.round(penaltyOf(name))));
}
function totals(){
  var out={total:0,max:ORDER.length*100,parts:[]};
  ORDER.forEach(function(name){
    var done=doneTask(name),sc=0;
    if(done)sc=scoreOf(name);
    else if(name!=='task01'&&node(name))sc=scoreOf(name);   // идущее задание видно уже со штрафами
    out.parts.push({name:name,title:TITLES[name]||name,score:sc,done:done});
    out.total+=sc;
  });
  return out;
}
try{window.__impulseTotal=function(){try{return totals().total;}catch(e){return 0;}};
window.__impulseTotals=function(){try{return totals();}catch(e){return null;}};}catch(e){}

// ——— плашка ———
function plaque(){
  var e=document.getElementById('impulse-plaque');
  if(!e){
    e=document.createElement('div');e.id='impulse-plaque';
    e.innerHTML='<span class="imp-label">Импульс</span><b class="imp-value">0</b><i class="imp-delta"></i>';
    document.body.appendChild(e);
  }
  return e;
}
function showScreen(ph){
  if(ph==='battle')return true;
  if(!/^task\d\d$/.test(ph)||ph==='task01')return false;
  var n=node(ph),st=n?String(n.stage||''):'';
  // инструкция и ожидание — плашку не показываем: она закрывала текст и QR
  if(/intro|wait|change/.test(st))return false;
  if(ph==='task07')return st==='run'||st==='done';
  return true;
}
function placeIn(e,ph){
  var host=null;
  if(ph==='battle')host=document.querySelector('.battle-hud');
  else if(ph==='task07')host=document.getElementById('t7-hud');
  if(host){
    if(e.parentElement!==host)host.appendChild(e);
    e.classList.add('in-row');
    return true;
  }
  if(e.parentElement!==document.body)document.body.appendChild(e);
  e.classList.remove('in-row');
  return false;
}
function paint(){
  var e=plaque(),ph=phase(),t=totals(),val=e.querySelector('.imp-value'),dl=e.querySelector('.imp-delta');
  val.textContent=t.total;
  var show=showScreen(ph);
  if(show)placeIn(e,ph);
  e.style.display=show?'inline-flex':'none';
  // строку итога дописываем и когда плашка скрыта: экран завершения задания — не задание
  if(!show){lastTotal=t.total;lastParts=t.parts;injectResults(t);return;}
  if(lastTotal!==null&&t.total!==lastTotal){
    var d=t.total-lastTotal;
    if(d<0){
      var why=(lastPenalty&&Date.now()-lastPenalty.at<4000)?(' '+lastPenalty.why):'';
      dl.textContent='−'+Math.abs(d)+why;
      dl.className='imp-delta show';
      clearTimeout(paint._t);
      paint._t=setTimeout(function(){dl.className='imp-delta';},1600);
    }
  }
  lastTotal=t.total;lastParts=t.parts;
  injectResults(t);
}

// ——— строка итога на экране завершения задания ———
function visible(el){
  if(!el)return false;
  var cs=getComputedStyle(el);
  if(cs.display==='none'||cs.visibility==='hidden')return false;
  if(el.hidden)return false;
  var r=el.getBoundingClientRect();
  return r.width>60&&r.height>20;
}
function injectResults(t){
  var host=null;
  for(var i=0;i<DONE_SEL.length;i++){
    var el=document.querySelector(DONE_SEL[i]);
    if(el&&visible(el)){host=el;break;}
  }
  if(!host)return;
  var line=host.querySelector('.imp-result-line');
  if(!line){line=document.createElement('p');line.className='imp-result-line';host.appendChild(line);}
  var txt='ИМПУЛЬС КОМАНДЫ — '+((t&&t.total)||0);
  if(line.textContent!==txt)line.textContent=txt;
}

function tick(){
  try{ledger();}catch(e){}
  try{paint();}catch(e){}
}
if(window.NET&&NET.onRoom)NET.onRoom(function(){try{ledger();}catch(e){}try{paint();}catch(e){}});
document.addEventListener('pointerdown',function(){setTimeout(tick,60);},{passive:true});
setInterval(tick,1200);
if(document.readyState!=='loading')setTimeout(tick,300);else document.addEventListener('DOMContentLoaded',function(){setTimeout(tick,300);});
})();
