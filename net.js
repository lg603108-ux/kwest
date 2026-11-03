// net.js — финальная версия (патч 2.0: код 4 знака, строчные, регистр при вводе не важен)
window.NET=(function(){
if(typeof firebase==='undefined')return null;
const firebaseConfig = {
apiKey: "AIzaSyCvqkgiWNZf8eQh5-OPhO8pn0f8E8JgJkQ",
authDomain: "anomalia-3746d.firebaseapp.com",
databaseURL: "https://anomalia-3746d-default-rtdb.europe-west1.firebasedatabase.app",
projectId: "anomalia-3746d",
storageBucket: "anomalia-3746d.firebasestorage.app",
messagingSenderId: "248443733303",
appId: "1:248443733303:web:146f9a06309f9c3d1e46b2"
};
firebase.initializeApp(firebaseConfig);
var auth=firebase.auth(),db=firebase.database();
try{if(db.INTERNAL&&typeof db.INTERNAL.forceLongPolling==='function')db.INTERNAL.forceLongPolling();}catch(e){}
var uid=null,roomCode=null,room=null,subs=[],progressCb=null;
// Передача капитана (утверждено автором 28.10.2026): автоматически, любой игрок может стать новым
// капитаном — берём самого раннего по времени входа из находящихся на связи, чтобы все устройства
// выбрали одного и того же. Время — опытный параметр, менять здесь:
var CAPTAIN_TIMEOUT_MS=20000;   // через сколько молчания капитан считается потерянным
var HEARTBEAT_MS=5000;          // как часто каждый игрок отмечается «я на связи»
// Реализация: при молчании капитана самый ранний игрок пишет в captainTransfer, затем
// сам записывает себя в captain (Firebase Rules это разрешают). Если прежний капитан
// вернётся, он видит, что уже не капитан, и продолжает как обычный игрок.
// Двух капитанов не бывает: передача атомарна и видна всем.
var CH='abcdefghijkmnpqrstuvwxyz23456789';
function gen(){var s='';for(var i=0;i<4;i++)s+=CH[Math.floor(Math.random()*CH.length)];return s;}
function emit(){for(var i=0;i<subs.length;i++)subs[i](room);}
// --- «сердцебиение» и автопередача капитана ---
var hbTimer=null,capCheckT=null,promoteInFlight=false;
function startHeartbeat(){stopHeartbeat();var beat=function(){if(roomCode&&uid)db.ref('rooms/'+roomCode+'/players/'+uid).update({segAt:Date.now()}).catch(function(){});};beat();hbTimer=setInterval(beat,HEARTBEAT_MS);}
function stopHeartbeat(){if(hbTimer){clearInterval(hbTimer);hbTimer=null;}}
function isOnline(p){if(!p)return false;if(p.connected===false)return false;var hb=(typeof p.segAt==='number')?p.segAt:((p.joinedAt||0)+HEARTBEAT_MS);return (Date.now()-hb)<CAPTAIN_TIMEOUT_MS;}
function captainAlive(){if(!room||!room.captain)return true;var p=room.players&&room.players[room.captain];return isOnline(p);}
function earliestOnline(){var best=null,bt=Infinity;var ps=(room&&room.players)||{};Object.keys(ps).forEach(function(k){var p=ps[k];if(isOnline(p)){var t=p.joinedAt||Infinity;if(t<bt){bt=t;best=k;}}});return best;}
function checkCaptainTransfer(){
if(!roomCode||!room||!room.captain)return;
if(captainAlive())return;
var cand=earliestOnline();
if(!cand)return;
if(promoteInFlight)return;
promoteInFlight=true;
// Пишем претензию, затем сразу переводим captain на нового игрока.
// Firebase Rules разрешают: captainTransfer.to может записать captain = свой uid.
db.ref('rooms/'+roomCode+'/captainTransfer').set({to:cand,from:room.captain,at:Date.now()}).then(function(){
if(cand===uid){db.ref('rooms/'+roomCode+'/captain').set(uid).catch(function(){});}
promoteInFlight=false;
}).catch(function(){promoteInFlight=false;});
}
function scheduleCaptainCheck(){if(capCheckT)clearTimeout(capCheckT);if(!roomCode||!room||!room.captain)return;if(captainAlive())return;var p=room.players&&room.players[room.captain];var hb=(p&&typeof p.segAt==='number')?p.segAt:((p&&p.joinedAt)||0)+HEARTBEAT_MS;var wait=Math.max(500,(hb+CAPTAIN_TIMEOUT_MS)-Date.now()+100);capCheckT=setTimeout(checkCaptainTransfer,wait);}
function prog(t){if(progressCb)progressCb(t);}
function timeout(p,ms,label){return new Promise(function(res,rej){var t=setTimeout(function(){rej(new Error(label+': тайм-аут '+Math.round(ms/1000)+' с.'));},ms);p.then(function(v){clearTimeout(t);res(v);},function(e){clearTimeout(t);rej(e);});});}
function retry(fn,ms,label){return timeout(fn(),ms,label).catch(function(){return timeout(fn(),ms,label);});}
function attach(code){roomCode=code;db.ref('rooms/'+code).on('value',function(s){room=s.val()?Object.assign({},s.val(),{code:code}):null;emit();checkCaptainTransfer();scheduleCaptainCheck();},function(err){console.warn('room listen error',err);});setTimeout(function(){if(!room)emit();},8000);startHeartbeat();}
function ensure(){return uid?Promise.resolve(uid):timeout(auth.signInAnonymously(),15000,'Вход в Firebase').then(function(c){uid=c.user.uid;return uid;});}
function meNode(code){return db.ref('rooms/'+code+'/players/'+uid);}
db.ref('.info/connected').on('value',function(s){console.log('FB connected:',s.val()===true);});
return {
get uid(){return uid;},
get room(){return room;},
inRoom:function(){return !!roomCode;},
isCaptain:function(){return !!room&&(room.captain===uid||(room.captainTransfer&&room.captainTransfer.to===uid));},
isOnlineUid:function(k){return !!(room&&room.players&&isOnline(room.players[k]));},
captainOnline:function(){return captainAlive();},
onRoom:function(cb){subs.push(cb);if(room)cb(room);},
onProgress:function(cb){progressCb=cb;},
setSeg:function(s){if(!roomCode||!uid)return Promise.resolve();return db.ref('rooms/'+roomCode+'/players/'+uid).update({seg:s,segAt:Date.now()});},
setTeamSize:function(n){if(!roomCode)return Promise.resolve();n=Math.max(1,Math.min(10,Math.round(n)));return db.ref('rooms/'+roomCode+'/state/teamSize').set(n);},
checkNode:function(){if(!roomCode||!uid)return Promise.resolve(false);return db.ref('rooms/'+roomCode+'/players/'+uid).once('value').then(function(s){return s.exists();}).catch(function(){return false;});},
readTeam:function(){if(!roomCode)return Promise.resolve({});return db.ref('rooms/'+roomCode+'/players').once('value').then(function(s){return s.val()||{};}).catch(function(){return {};});},
createRoom:function(name,size){size=Math.max(1,Math.min(10,Math.round(size)||2));prog('Вход…');return ensure().then(function(u){var code=gen();var ref=db.ref('rooms/'+code);prog('Создание комнаты…');return retry(function(){return ref.child('captain').set(u);},15000,'Создание комнаты').then(function(){return ref.child('createdAt').set(Date.now());}).then(function(){return ref.child('state').set({phase:'lobby',startsAt:0,durationMs:300000,taskId:'defense01',teamSize:size});}).then(function(){return retry(function(){return ref.child('players/'+u).set({name:name,joinedAt:Date.now(),ready:true,connected:true,score:0,kills:0,stuns:0});},15000,'Создание комнаты');}).then(function(){meNode(code).child('connected').onDisconnect().set(false);attach(code);prog('');return code;});});},
joinRoom:function(code,name){code=String(code).trim().toLowerCase();prog('Вход…');return ensure().then(function(u){prog('Чтение комнаты…');return retry(function(){return db.ref('rooms/'+code).once('value');},15000,'Чтение комнаты').then(function(s){if(!s.exists())throw new Error('Комната не найдена. Проверьте код.');var val=s.val()||{};var ph=val.state&&val.state.phase;var players=val.players||{};var me=players[u];if(!me){if(ph!=='lobby')throw new Error('Игра уже идёт. Войти может только участник комнаты.');var cnt=Object.keys(players).length;if(cnt>=10)throw new Error('Комната заполнена: максимум 10 игроков.');prog('Запись игрока…');return retry(function(){return db.ref('rooms/'+code+'/players/'+u).set({name:name,joinedAt:Date.now(),ready:true,connected:true,score:0,kills:0,stuns:0});},15000,'Запись игрока');}else{prog('Возврат в комнату…');return db.ref('rooms/'+code+'/players/'+u+'/connected').set(true);}}).then(function(){meNode(code).child('connected').onDisconnect().set(false);meNode(code).child('connected').set(true).catch(function(){});attach(code);prog('');return code;});});},
setPhase:function(phase,startsAt,durationMs){if(!roomCode)return Promise.resolve();if(room&&room.captain&&room.captain!==uid)return Promise.reject(new Error('Сейчас управляет другой капитан.'));var upd={phase:phase,startsAt:startsAt||0};if(durationMs)upd.durationMs=durationMs;return db.ref('rooms/'+roomCode+'/state').update(upd);},
restartRound:function(){if(!roomCode||!uid||!room||room.captain!==uid)return Promise.resolve();var ps=room.players||{};var ups=Object.keys(ps).map(function(k){return db.ref('rooms/'+roomCode+'/players/'+k).update({score:0,kills:0,stuns:0,seg:''});});return Promise.all(ups).then(function(){return db.ref('rooms/'+roomCode+'/state').update({phase:'brief',startsAt:Date.now()+1000,durationMs:300000});});},
reportResult:function(r){if(!roomCode||!uid)return Promise.resolve();var ref=db.ref('rooms/'+roomCode+'/players/'+uid);var data={score:r.score,kills:r.kills,stuns:r.stuns,connected:true,segAt:Date.now()};return ref.update(data).catch(function(){return ref.update(data);});},
leaveRoom:function(){stopHeartbeat();if(capCheckT){clearTimeout(capCheckT);capCheckT=null;}if(roomCode&&uid){db.ref('rooms/'+roomCode+'/players/'+uid+'/connected').set(false);db.ref('rooms/'+roomCode).off();}roomCode=null;room=null;emit();}
};
})();