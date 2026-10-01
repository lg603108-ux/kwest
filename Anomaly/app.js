(()=>{
const TYPES={spider:{hp:3,points:10,speed:.046},sphere:{hp:1,points:15,speed:.11},octopus:{hp:2,points:20,speed:.067},eye:{hp:1,points:25,speed:.13}};
const WAVES=['РАЗВЕДКА','РОЙ','БРОНЯ','ХАОС','ПРОРЫВ'];
function waveAt(elapsed,duration){return Math.min(4,Math.max(0,Math.floor(elapsed/(duration/5))));}
function chooseType(wave,r=Math.random()){
 const list=wave===0?[['spider',.8],['sphere',1]]:wave===1?[['sphere',.5],['octopus',.8],['eye',1]]:wave===2?[['spider',.6],['octopus',.9],['sphere',1]]:[['spider',.25],['sphere',.5],['octopus',.75],['eye',1]];
 return list.find(([,limit])=>r<limit)?.[0]||'eye';
}
function timeLabel(seconds){const n=Math.max(0,Math.ceil(seconds));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
function bossCanHit(elapsed,stunnedUntil){return elapsed>=stunnedUntil&&elapsed%10>=6;}
function applyHit(monster){if(monster.dead)return {points:0,killed:false};monster.hp--;if(monster.hp<=0){monster.dead=true;return {points:TYPES[monster.type].points,killed:true};}return {points:0,killed:false};}

const $=id=>document.getElementById(id),asset=name=>'assets/'+encodeURIComponent(name);
let current='home',player='Игрок',muted=false,game=null,videos={},mediaConfig=null,playing=[];
const files={spider:'mon_spider_move_green.webm',sphere:'boss_sphere_closed_green 1.webm',octopus:'mon_octopus_move_green.webm',eye:'mon_eye_idle_green.webm',mother:'boss_sphere_closed_green.webm'};
const fx={impulse:'sfx_impulse.mp3',spider:'sfx_spider_death.mp3',sphere:'sfx_sphere_death.mp3',octopus:'sfx_octopus_death.mp3',eye:'sfx_eye_death.mp3',mother:'sfx_mother_stun.mp3'};
function store(k,v){try{localStorage.setItem(k,v);}catch{}}
function read(k){try{return localStorage.getItem(k);}catch{return null;}}
$('name').value=read('anomaly-name')||'';
function toast(s){$('toast').textContent=s;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',4500);}
function screen(id){if(current==='cinema')$('movie').pause();document.querySelectorAll('.screen').forEach(el=>el.classList.toggle('active',el.id===id));current=id;document.body.dataset.screen=id;}
function stopAudio(){playing.forEach(a=>a.pause());playing=[];music.pause();}
const diagnostics={version:'08',userAgent:navigator.userAgent,events:[],counts:{spawns:{},sounds:{},bossBursts:0}};
function report(kind,file,error){const record={at:new Date().toISOString(),kind,file,error:error?.name?error.name+': '+error.message:String(error)};diagnostics.events.push(record);if(diagnostics.events.length>250)diagnostics.events.shift();console.warn(record);}
window.anomalyDiagnostics=diagnostics;
function showDiagnostics(){const summary={...diagnostics,video:Object.fromEntries(Object.entries(videos).map(([k,v])=>[k,{file:files[k],time:v.currentTime,ready:v.readyState,paused:v.paused,error:v.error?.code,quality:v.getVideoPlaybackQuality?.()}]))};let panel=$('diagnostic-panel');if(!panel){panel=document.createElement('div');panel.id='diagnostic-panel';panel.style.cssText='position:fixed;inset:8%;z-index:999;background:#14282c;padding:20px;overflow:auto';panel.innerHTML='<button id="close-diag">Закрыть</button><p>Скопируйте текст отчёта и отправьте в чат.</p><textarea style="width:100%;height:65%;font:14px monospace"></textarea>';document.body.append(panel);$('close-diag').onclick=()=>panel.remove();}panel.querySelector('textarea').value=JSON.stringify(summary,null,2);}
document.addEventListener('keydown',e=>{if(e.key==='F8'){e.preventDefault();if(game)pause();showDiagnostics();}});
const pools={},music=new Audio(asset('music_defense_loop.mp3'));let musicEnabled=true,musicMissing=false;music.loop=true;music.volume=.16;music.preload='none';music.onerror=()=>{musicMissing=true;report('optional-music', 'music_defense_loop.mp3','Not available; game continues');};
function startMusic(){if(muted||!musicEnabled||musicMissing)return;music.play().catch(e=>report('music-play','music_defense_loop.mp3',e));}
const musicButton=document.createElement('button');musicButton.className='secondary';musicButton.textContent='Музыка: вкл';musicButton.onclick=()=>{musicEnabled=!musicEnabled;musicButton.textContent=musicEnabled?'Музыка: вкл':'Музыка: выкл';if(!musicEnabled)music.pause();else if(game&&!game.paused)startMusic();};$('pause-modal').querySelector('.glass')?.append(musicButton);
function getPool(file){if(!pools[file]){pools[file]=Array.from({length:file==='v01_hits_rules.mp3'?1:4},()=>{const v=new Audio(asset(file));v.preload='auto';v.onerror=()=>report('audio-load',file,'MediaError '+v.error?.code);v.addEventListener('playing',()=>{diagnostics.counts.audioPlaying??={};diagnostics.counts.audioPlaying[file]=(diagnostics.counts.audioPlaying[file]||0)+1;});v.load();return v;});}return pools[file];}
Object.values(fx).forEach(getPool);
function sound(file,volume=.4){const pool=getPool(file);const a=pool.find(v=>v.paused||v.ended)||pool[0];a.pause();a.currentTime=0;a.volume=volume;a.muted=muted;diagnostics.counts.sounds[file]=(diagnostics.counts.sounds[file]||0)+1;if(!playing.includes(a))playing.push(a);a.play().catch(e=>{report('audio-play',file,e);if(file==='v01_hits_rules.mp3')toast('Нажмите «Повторить инструкцию», чтобы включить звук.');});return a;}
$('sound').onclick=()=>{muted=!muted;$('sound').textContent=muted?'×':'♪';$('sound').ariaLabel=muted?'Включить звук':'Выключить звук';$('movie').muted=muted;playing.forEach(a=>a.muted=muted);music.muted=muted;if(muted)music.pause();else if(game&&!game.paused)startMusic();};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('app').requestFullscreen();}catch{toast('Полноэкранный режим недоступен. Используйте горизонтальное положение телефона.');}};
function identify(){player=$('name').value.trim()||'Игрок';store('anomaly-name',player);$('player-name').textContent=player;}
$('entry').onsubmit=e=>{e.preventDefault();identify();screen('lobby');};
// No debug shortcut is exposed in the game interface.
$('back').onclick=()=>screen('home');$('home-button').onclick=()=>screen('home');
document.querySelector('.brand').onclick=e=>{e.preventDefault();if(game){pause();return;}screen('home');};
async function movie(file,title,next){stopAudio();screen('cinema');const v=$('movie');v.src=asset(file);v.muted=muted;v.loop=false;v.onended=()=>{$('movie-next').classList.remove('hidden');};v.onerror=()=>{toast('Не удалось загрузить видео. Проверьте файл в папке assets.');$('movie-retry').classList.remove('hidden');};$('movie-title').textContent=title;$('movie-next').classList.add('hidden');$('movie-retry').classList.add('hidden');$('movie-pause').textContent='Пауза';$('movie-next').onclick=next;try{await v.play();}catch{$('movie-retry').classList.remove('hidden');}}
$('movie-retry').onclick=()=>{$('movie').play().then(()=>$('movie-retry').classList.add('hidden')).catch(()=>toast('Коснитесь кнопки ещё раз, чтобы включить видео.'));};
$('movie-pause').onclick=()=>{const v=$('movie');if(v.paused){v.play().catch(()=>{});$('movie-pause').textContent='Пауза';}else{v.pause();$('movie-pause').textContent='Продолжить';}};
function showBrief(){screen('brief');$('battle-start').disabled=true;const a=sound('v01_hits_rules.mp3',.9);if(a){a.onended=()=>{$('battle-start').disabled=false;};a.onerror=()=>toast('Не удалось загрузить инструкцию. Проверьте v01_hits_rules.mp3.');}else{$('battle-start').disabled=false;}}
function intro(){movie('v01_intro.mp4','ВОЛЬТ · ОБОРОНА',showBrief);}
$('start').onclick=()=>movie('prologue_volt_city.mp4','ПРОЛОГ · ГОРОД',intro);
$('repeat-intro').onclick=intro;
$('rules-audio').onclick=showBrief;
async function loadAssets(){
 if(mediaConfig)return;
 const config={
  "motherOpenStart": 1.5,
  "motherOpenEnd": 2.8,
  "crops": {
    "spider": [
      266,
      0,
      1250,
      1080
    ],
    "sphere": [
      6,
      6,
      1908,
      1068
    ],
    "octopus": [
      6,
      6,
      1908,
      1068
    ],
    "eye": [
      550,
      38,
      799,
      1003
    ],
    "mother": [
      517,
      0,
      884,
      1064
    ]
  }
};
 const loaded={};
 try{await Promise.all(Object.entries(files).map(async([key,name])=>{
  const v=document.createElement('video');v.src=asset(name);v.muted=true;v.loop=true;v.playsInline=true;v.preload='auto';
  // Keep source elements attached, not display:none or detached.
  let rack=$('video-source-rack');if(!rack){rack=document.createElement('div');rack.id='video-source-rack';rack.style.cssText='position:fixed;left:0;bottom:0;z-index:1;display:flex;pointer-events:none;opacity:0.01';document.body.append(rack);}
  v.style.cssText='width:4px;height:4px;object-fit:contain';rack.append(v);
  diagnostics.frames??={};diagnostics.frames[key]={callbacks:0,mediaTime:0,presentedFrames:0};
  if(v.requestVideoFrameCallback){const onFrame=(now,meta)=>{diagnostics.frames[key]={callbacks:diagnostics.frames[key].callbacks+1,mediaTime:meta.mediaTime,presentedFrames:meta.presentedFrames};v.requestVideoFrameCallback(onFrame);};v.requestVideoFrameCallback(onFrame);}

  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error(name)),25000);v.onloadeddata=()=>{clearTimeout(timeout);resolve();};v.onerror=()=>{clearTimeout(timeout);reject(Error(name));};});
  v.onerror=()=>report('video-error',name,'MediaError '+v.error?.code);v.addEventListener('waiting',()=>report('video-waiting',name,'currentTime '+v.currentTime));loaded[key]=v;
 }));}catch(error){Object.values(loaded).forEach(v=>{v.removeAttribute('src');v.load();});throw error;}
 videos=loaded;mediaConfig=config;
}
$('battle-start').onclick=async()=>{const btn=$('battle-start');btn.disabled=true;$('loading-note').textContent='Подготовка обороны…';try{await loadAssets();await playSources();begin(300);}catch(e){toast('Не удалось загрузить: '+e.message+'. Проверьте папку assets и поддержку WebM.');}finally{btn.disabled=false;$('loading-note').textContent='';}};
function stopMonsters(){Object.values(videos).forEach(v=>v.pause());$('monsters').replaceChildren();}
async function playSources(){await Promise.all(Object.entries(videos).map(async([key,v])=>{try{await v.play();}catch(e){report('video-play',files[key],e);throw Error(files[key]+' — '+e.name);}}));}
function monsterNode(key){return {video:videos[key]};}
const animationRates={spider:1,octopus:1,eye:1,sphere:1,mother:1};
function positionMonster(node,key,x,y,size){const v=videos[key];if(v.readyState<2)return;const crop=mediaConfig.crops[key],scale=size/Math.max(crop[2],crop[3]);ctx.drawImage(v,crop[0],crop[1],crop[2],crop[3],x-crop[2]*scale/2,y-crop[3]*scale/2,crop[2]*scale,crop[3]*scale);}
function motherCanHit(){if(!game||!game.boss||game.elapsed<game.stunnedUntil)return false;const t=game.boss.video.currentTime;return t>=mediaConfig.motherOpenStart&&t<=mediaConfig.motherOpenEnd&&!game.boss.hitThisCycle;}
const canvas=$('field'),ctx=canvas.getContext('2d');let width=0,height=0;
function resize(){const r=canvas.getBoundingClientRect();width=r.width||innerWidth;height=r.height||innerHeight;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
window.addEventListener('resize',()=>{if(game){resize();if(innerHeight>innerWidth)pause();}});
function begin(duration){stopAudio();Object.values(videos).forEach(v=>{v.currentTime=.12;v.playbackRate=animationRates[Object.keys(videos).find(k=>videos[k]===v)]||1;v.play().catch(e=>report('video-play',v.src,e));});startMusic();screen('battle');resize();game={duration,elapsed:0,score:0,kills:0,stuns:0,stunnedUntil:0,monsters:[],sparks:[],spawn:0,last:performance.now(),paused:false,mother:false,boss:null};$('pause-modal').classList.add('hidden');$('boss-tip').classList.add('hidden');$('street').currentTime=0;$('street').play().catch(()=>{});$('score').textContent='0';$('team-score').textContent='0';$('clock').textContent='05:00';requestAnimationFrame(tick);}
function spawn(type,origin=null){diagnostics.counts.spawns[type]=(diagnostics.counts.spawns[type]||0)+1;const child=!!origin;const ground=type==='spider';const lane=.76+Math.random()*.13;game.monsters.push({type,hp:TYPES[type].hp,maxHp:TYPES[type].hp,x:origin?.x??(.43+Math.random()*.14),y:origin?.y??(ground?lane:.43+Math.random()*.15),angle:ground?(Math.random()<.5?0:Math.PI):(.25+Math.random()*.5)*Math.PI,age:0,phase:Math.random()*6,dead:false,flash:0,node:monsterNode(type),child,scale:child?.42:1,lane,vx:(Math.random()-.5)*.3,vy:child?.20:0});}
function animateMonster(m,dt){m.age+=dt;const speed=TYPES[m.type].speed;
 if(m.child&&m.age<.65){m.vy+=.65*dt;m.x+=m.vx*dt;m.y+=m.vy*dt;return;}
 if(m.type==='spider'){const direction=Math.cos(m.angle)>=0?1:-1;m.x+=direction*speed*2.3*dt;m.y+=(m.lane-m.y)*Math.min(1,dt*9);}
 else{m.x+=Math.cos(m.angle)*speed*1.5*dt;m.y+=Math.sin(m.angle)*speed*1.5*dt;if(m.type==='eye')m.angle+=Math.sin(m.age*3+m.phase)*1.7*dt;if(m.type==='octopus')m.x+=Math.sin(m.age*4+m.phase)*.055*dt;}
}
function drawMonster(m,size){const x=m.x*width,y=m.y*height;const actual=size*m.scale;ctx.save();ctx.translate(x,y);let bob=m.type==='spider'?Math.sin(m.age*17+m.phase)*actual*.012:Math.sin(m.age*7+m.phase)*actual*.025;let tilt=m.type==='spider'?Math.sin(m.age*13+m.phase)*.025:Math.sin(m.age*5+m.phase)*.06;ctx.rotate(tilt);if(m.type==='spider'){ctx.save();ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(0,actual*.32,actual*.36,actual*.06,0,0,Math.PI*2);ctx.fill();ctx.restore();}positionMonster(m.node,m.type,0,bob,actual);ctx.restore();}

function tick(now){if(!game)return;if(game.paused){game.last=now;requestAnimationFrame(tick);return;}const dt=Math.min((now-game.last)/1000,.1);game.last=now;game.elapsed+=dt;if(game.elapsed>=game.duration){finish();return;}const wave=waveAt(game.elapsed,game.duration),size=Math.max(90,width*.14);
 game.spawn+=dt;const interval=[1.3,.85,.95,.7,.85][wave];if(wave<4&&game.spawn>=interval&&game.monsters.length<16&&game.elapsed>=game.stunnedUntil){game.spawn=0;const count=wave===1?3:wave===3?2:1;for(let i=0;i<count;i++)spawn(chooseType(wave));}
 game.mother=wave===4;$('clock').textContent=timeLabel(game.duration-game.elapsed);$('score').textContent=game.score;$('team-score').textContent=game.score;
 ctx.clearRect(0,0,width,height);
 // Draw the mother first: children are foreground objects, not hidden behind it.
 if(game.mother){if(!game.boss){game.boss={...monsterNode('mother'),lastTime:0,hitThisCycle:false,burstThisCycle:false,spawnClock:0};videos.mother.currentTime=.12;}positionMonster(game.boss,'mother',width*.5,height*.43,Math.min(height*.65,width*.28));}
 for(const m of game.monsters){animateMonster(m,dt);drawMonster(m,size);
  const x=m.x*width,y=m.y*height,actual=size*m.scale;
  if(m.maxHp>1){for(let i=0;i<m.maxHp;i++){ctx.beginPath();ctx.arc(x+(i-(m.maxHp-1)/2)*10,y-actual*.32,3,0,Math.PI*2);ctx.fillStyle=i<m.hp?'#43f1de':'#405c60';ctx.fill();}}
  if(m.flash>0){m.flash-=dt;ctx.strokeStyle='#dffffb';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,actual*.3,0,Math.PI*2);ctx.stroke();}
  if(m.x<-.12||m.x>1.12||m.y<-.15||m.y>1.15)m.dead=true;
 }
 game.monsters=game.monsters.filter(m=>{if(m.dead){return false;}return true;});
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
 game.score+=points;$('score').textContent=game.score;$('team-score').textContent=game.score;game.sparks.push({x,y,life:.6,text:points?'+'+points:''});sound(fx.impulse,.25);
});
function pause(){if(!game||game.paused)return;game.paused=true;Object.values(videos).forEach(v=>v.pause());$('street').pause();stopAudio();$('pause-modal').classList.remove('hidden');}
$('battle-pause').onclick=pause;$('resume').onclick=()=>{if(!game)return;game.paused=false;Object.entries(videos).forEach(([k,v])=>v.play().catch(e=>report('video-resume',files[k],e)));startMusic();game.last=performance.now();$('pause-modal').classList.add('hidden');$('street').play().catch(()=>{});};
$('quit').onclick=()=>{game=null;stopMonsters();$('street').pause();$('pause-modal').classList.add('hidden');screen('brief');};
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(game)pause();if(current==='cinema'){$('movie').pause();$('movie-pause').textContent='Продолжить';}}});
function finish(){const g=game;$('clock').textContent='00:00';game=null;stopMonsters();$('street').pause();stopAudio();$('result-score').textContent=g.score;$('result-name').textContent=player;$('result-kills').textContent=g.kills;$('result-stuns').textContent=g.stuns;store('anomaly-last-result',JSON.stringify({player,score:g.score,kills:g.kills,stuns:g.stuns}));screen('result');}
$('again').onclick=()=>screen('brief');
screen('home');

})();