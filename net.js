// net.js — финальная версия
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
var CH='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function gen(){var s='';for(var i=0;i<6;i++)s+=CH[Math.floor(Math.random()*CH.length)];return s;}
function emit(){for(var i=0;i<subs.length;i++)subs[i](room);}
function prog(t){if(progressCb)progressCb(t);}
function timeout(p,ms,label){return new Promise(function(res,rej){var t=setTimeout(function(){rej(new Error(label+': тайм-аут '+Math.round(ms/1000)+' с.'));},ms);p.then(function(v){clearTimeout(t);res(v);},function(e){clearTimeout(t);rej(e);});});}
function retry(fn,ms,label){return timeout(fn(),ms,label).catch(function(){return timeout(fn(),ms,label);});}
function attach(code){roomCode=code;db.ref('rooms/'+code).on('value',function(s){room=s.val()?Object.assign({},s.val(),{code:code}):null;emit();},function(err){console.warn('room listen error',err);});setTimeout(function(){if(!room)emit();},8000);}
function ensure(){return uid?Promise.resolve(uid):timeout(auth.signInAnonymously(),15000,'Вход в Firebase').then(function(c){uid=c.user.uid;return uid;});}
function meNode(code){return db.ref('rooms/'+code+'/players/'+uid);}
db.ref('.info/connected').on('value',function(s){console.log('FB connected:',s.val()===true);});
return {
get uid(){return uid;},
get room(){return room;},
inRoom:function(){return !!roomCode;},
isCaptain:function(){return !!room&&room.captain===uid;},
onRoom:function(cb){subs.push(cb);if(room)cb(room);},
onProgress:function(cb){progressCb=cb;},
setSeg:function(s){if(!roomCode||!uid)return Promise.resolve();return db.ref('rooms/'+roomCode+'/players/'+uid).update({seg:s,segAt:Date.now()});},
setTeamSize:function(n){if(!roomCode)return Promise.resolve();n=Math.max(1,Math.min(10,Math.round(n)));return db.ref('rooms/'+roomCode+'/state/teamSize').set(n);},
checkNode:function(){if(!roomCode||!uid)return Promise.resolve(false);return db.ref('rooms/'+roomCode+'/players/'+uid).once('value').then(function(s){return s.exists();}).catch(function(){return false;});},
readTeam:function(){if(!roomCode)return Promise.resolve({});return db.ref('rooms/'+roomCode+'/players').once('value').then(function(s){return s.val()||{};}).catch(function(){return {};});},
createRoom:function(name,size){size=Math.max(1,Math.min(10,Math.round(size)||2));prog('Вход…');return ensure().then(function(u){var code=gen();var ref=db.ref('rooms/'+code);prog('Создание комнаты…');return retry(function(){return ref.child('captain').set(u);},15000,'Создание комнаты').then(function(){return ref.child('createdAt').set(Date.now());}).then(function(){return ref.child('state').set({phase:'lobby',startsAt:0,durationMs:300000,taskId:'defense01',teamSize:size});}).then(function(){return retry(function(){return ref.child('players/'+u).set({name:name,joinedAt:Date.now(),ready:true,connected:true,score:0,kills:0,stuns:0});},15000,'Создание комнаты');}).then(function(){meNode(code).child('connected').onDisconnect().set(false);attach(code);prog('');return code;});});},
joinRoom:function(code,name){code=String(code).toUpperCase();prog('Вход…');return ensure().then(function(u){prog('Чтение комнаты…');return retry(function(){return db.ref('rooms/'+code).once('value');},15000,'Чтение комнаты').then(function(s){if(!s.exists())throw new Error('Комната не найдена. Проверьте код.');var val=s.val()||{};var ph=val.state&&val.state.phase;var players=val.players||{};var me=players[u];if(!me){if(ph!=='lobby')throw new Error('Игра уже идёт. Войти может только участник комнаты.');var cnt=Object.keys(players).length;if(cnt>=10)throw new Error('Комната заполнена: максимум 10 игроков.');prog('Запись игрока…');return retry(function(){return db.ref('rooms/'+code+'/players/'+u).set({name:name,joinedAt:Date.now(),ready:true,connected:true,score:0,kills:0,stuns:0});},15000,'Запись игрока');}else{prog('Возврат в комнату…');return db.ref('rooms/'+code+'/players/'+u+'/connected').set(true);}}).then(function(){meNode(code).child('connected').onDisconnect().set(false);meNode(code).child('connected').set(true).catch(function(){});attach(code);prog('');return code;});});},
setPhase:function(phase,startsAt,durationMs){if(!roomCode)return Promise.resolve();var upd={phase:phase,startsAt:startsAt||0};if(durationMs)upd.durationMs=durationMs;return db.ref('rooms/'+roomCode+'/state').update(upd);},
restartRound:function(){if(!roomCode||!uid||!room||room.captain!==uid)return Promise.resolve();var ps=room.players||{};var ups=Object.keys(ps).map(function(k){return db.ref('rooms/'+roomCode+'/players/'+k).update({score:0,kills:0,stuns:0,seg:''});});return Promise.all(ups).then(function(){return db.ref('rooms/'+roomCode+'/state').update({phase:'brief',startsAt:Date.now()+1000,durationMs:300000});});},
reportResult:function(r){if(!roomCode||!uid)return Promise.resolve();var ref=db.ref('rooms/'+roomCode+'/players/'+uid);var data={score:r.score,kills:r.kills,stuns:r.stuns,connected:true};return ref.update(data).catch(function(){return ref.update(data);});},
leaveRoom:function(){if(roomCode&&uid){db.ref('rooms/'+roomCode+'/players/'+uid+'/connected').set(false);db.ref('rooms/'+roomCode).off();}roomCode=null;room=null;emit();}
};
})();