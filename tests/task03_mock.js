// Изолированное in-memory хранилище для браузерных проверок задания 3.
// Это mock, а не Firebase Emulator: он воспроизводит только проверяемые тестами
// права, форму данных и ошибки, но не доказывает поведение реального RTDB.
(function(){
const EMOTION_IDS=['fear','joy','anger','sadness','surprise','disgust','pain','anxiety','doubt','relief'];
const CAPTAIN_FIELDS=['stage','startsAt','round','actorUid','judgeUid','accepted','reactionId','guess','verdict'];
const PUBLIC_PATH='rooms/test/tasks/task03';
const DECK_PATH='task03Decks/test';
const listeners={};
const privateSubs=[];
const writes=[];
const writeAttempts=[];
const privateAttempts=[];
const failures={};
let deckEmitPaused=false;
let room=null,deck=null,secrets={};

function clone(v){return v===undefined?undefined:JSON.parse(JSON.stringify(v));}
function snapshot(v){return{val:()=>clone(v),exists:()=>v!==undefined&&v!==null};}
function merge(dst,src){Object.keys(src||{}).forEach(k=>{const v=src[k];if(v===null)delete dst[k];else if(v&&typeof v==='object'&&!Array.isArray(v)){if(!dst[k]||typeof dst[k]!=='object')dst[k]={};merge(dst[k],v);}else dst[k]=clone(v);});}
function reject(reason){return Promise.reject(new Error(reason));}
function failNext(key,n){failures[key]=(failures[key]||0)+(n||1);}
function resetFailures(){Object.keys(failures).forEach(k=>delete failures[k]);}
function consumeFailure(key){if(!failures[key])return false;failures[key]--;if(failures[key]<=0)delete failures[key];return true;}
function actualCaptain(uid){return !!room&&room.captain===uid;}
function task03(){return (room&&room.tasks&&room.tasks.task03)||{};}
function validDeckValue(v){
  return !!v&&typeof v==='object'&&!Array.isArray(v)
    &&Array.isArray(v.order)
    &&v.order.length===10
    &&v.order.every(id=>EMOTION_IDS.indexOf(id)>=0)
    &&new Set(v.order).size===10
    &&Object.keys(v).every(k=>k==='order'||k==='createdAt')
    &&(v.createdAt===undefined||typeof v.createdAt==='number');
}
function validSecretValue(v){
  return !!v&&typeof v==='object'&&!Array.isArray(v)
    &&Object.keys(v).length===2
    &&Number.isInteger(v.round)&&v.round>=0&&v.round<=9
    &&EMOTION_IDS.indexOf(v.emotionId)>=0;
}
function validGuess(g,task,uid){
  return !!g&&typeof g==='object'&&!Array.isArray(g)
    &&Object.keys(g).length===4
    &&typeof g.id==='string'&&g.id.length>0&&g.id.length<=100
    &&EMOTION_IDS.indexOf(g.emotionId)>=0
    &&g.by===uid&&g.by===task.judgeUid
    &&Number.isInteger(g.round)&&g.round>=0&&g.round<=9&&g.round===task.round;
}
function validVerdict(v,task){
  return !!v&&typeof v==='object'&&!Array.isArray(v)
    &&Object.keys(v).length===3
    &&typeof v.guessId==='string'
    &&!!task.guess&&v.guessId===task.guess.id
    &&typeof v.correct==='boolean'
    &&Number.isInteger(v.round)&&v.round===task.round;
}
function canRead(uid,path){
  if(path===DECK_PATH)return actualCaptain(uid);
  const m=path.match(/^task03Secrets\/test\/([^/]+)$/);
  if(m)return m[1]===uid;
  if(path==='rooms/test/tasks/task03'||path==='rooms/test/tasks/task02')return true;
  return false;
}
function value(uid,path){
  if(path==='rooms/test/tasks/task03')return task03();
  if(path==='rooms/test/tasks/task02')return (room&&room.tasks&&room.tasks.task02)||undefined;
  if(path===DECK_PATH)return actualCaptain(uid)?deck:undefined;
  const m=path.match(/^task03Secrets\/test\/([^/]+)$/);
  if(m&&m[1]===uid)return secrets[uid]||null;
  return undefined;
}
function emitPrivate(path){
  if(path===DECK_PATH&&deckEmitPaused)return;
  privateSubs.slice().forEach(s=>{
    if(s.path!==path)return;
    if(!canRead(s.uid,path))return;
    s.cb(snapshot(value(s.uid,path)));
  });
}
function broadcast(){
  Object.keys(listeners).forEach(uid=>{const w=window.frames[uid];if(w&&w.receiveRoom)w.receiveRoom(clone(room));});
  emitPrivate(DECK_PATH);
  Object.keys(secrets).forEach(uid=>emitPrivate('task03Secrets/test/'+uid));
}
function pushWrite(uid,path,obj,accepted,reason){
  const rec={uid:uid,path:path,obj:clone(obj),accepted:!!accepted,reason:reason||''};
  writeAttempts.push(rec);
  if(accepted)writes.push(rec);
  return rec;
}
function updatePublic(uid,path,obj){
  const m=path.match(/^rooms\/test\/tasks\/(task02|task03)$/);
  if(!m)return reject('unknown path');
  const taskName=m[1];
  if(taskName==='task02'){
    if(!actualCaptain(uid)){pushWrite(uid,path,obj,false,'permission_denied');return reject('permission_denied');}
    pushWrite(uid,path,obj,true);
    room.tasks.task02=room.tasks.task02||{};
    merge(room.tasks.task02,obj);
    broadcast();
    return Promise.resolve();
  }
  const task=task03();
  const keys=Object.keys(obj||{});
  if(keys.length===0){pushWrite(uid,path,obj,false,'empty_update');return reject('empty_update');}
  if(actualCaptain(uid)){
    if(!keys.every(k=>CAPTAIN_FIELDS.indexOf(k)>=0)){pushWrite(uid,path,obj,false,'permission_denied');return reject('permission_denied');}
    if('guess' in obj&&obj.guess!==null&&!validGuess(obj.guess,task,uid)){pushWrite(uid,path,obj,false,'invalid_guess');return reject('invalid_guess');}
    if('verdict' in obj&&obj.verdict!==null&&!validVerdict(obj.verdict,task)){pushWrite(uid,path,obj,false,'invalid_verdict');return reject('invalid_verdict');}
  }else if(uid===task.judgeUid&&keys.length===1&&keys[0]==='guess'){
    if(!validGuess(obj.guess,task,uid)){pushWrite(uid,path,obj,false,'invalid_guess');return reject('invalid_guess');}
  }else if(uid===task.actorUid&&keys.length===1&&keys[0]==='verdict'){
    if(!validVerdict(obj.verdict,task)){pushWrite(uid,path,obj,false,'invalid_verdict');return reject('invalid_verdict');}
  }else{
    pushWrite(uid,path,obj,false,'permission_denied');
    return reject('permission_denied');
  }
  if(consumeFailure('update:'+path)){pushWrite(uid,path,obj,false,'permission_denied');return reject('permission_denied');}
  pushWrite(uid,path,obj,true);
  room.tasks.task03=room.tasks.task03||{};
  merge(room.tasks.task03,obj);
  broadcast();
  return Promise.resolve();
}

window.taskBus={
  init(value){
    room=clone(value);deck=null;secrets={};
    writes.length=0;writeAttempts.length=0;privateSubs.length=0;privateAttempts.length=0;
    resetFailures();deckEmitPaused=false;
  },
  get room(){return room;},
  get deck(){return deck;},
  get secrets(){return secrets;},
  get writes(){return writes;},
  get writeAttempts(){return writeAttempts;},
  get privateAttempts(){return privateAttempts;},
  setDeck(value){deck=clone(value);emitPrivate(DECK_PATH);},
  setSecret(uid,value){secrets[uid]=clone(value);emitPrivate('task03Secrets/test/'+uid);},
  setCaptain(uid){room.captain=uid;broadcast();},
  setCaptainTransfer(to){room.captainTransfer={to:to,from:room.captain,at:Date.now()};broadcast();},
  clearCaptainTransfer(){delete room.captainTransfer;broadcast();},
  setDeckEmitPaused(paused){deckEmitPaused=!!paused;},
  emitDeck(){emitPrivate(DECK_PATH);},
  failNext:failNext,
  resetFailures:resetFailures,
  broadcast:broadcast,
  privateCount(uid){return privateSubs.filter(s=>!uid||s.uid===uid).length;},
  deckPrivateCount(uid){return privateSubs.filter(s=>s.path===DECK_PATH&&(!uid||s.uid===uid)).length;},
  roomCount(uid){return listeners[uid]||0;},
  deckAttempts(uid){return privateAttempts.filter(x=>x.path===DECK_PATH&&(!uid||x.uid===uid)).length;},
  writeAttemptsBy(uid,pathPrefix){return writeAttempts.filter(x=>x.uid===uid&&(pathPrefix===undefined||x.path.indexOf(pathPrefix)===0));},
  ref(uid,path){
    path=path||'';
    return{
      on(type,cb,err){
        if(type!=='value')return;
        privateAttempts.push({uid:uid,path:path,type:'on'});
        if(!canRead(uid,path)){if(err)err(new Error('permission_denied'));return;}
        if(consumeFailure('on:'+path)){if(err)err(new Error('permission_denied'));return;}
        privateSubs.push({uid:uid,path:path,cb:cb});
        if(!(path===DECK_PATH&&deckEmitPaused))cb(snapshot(value(uid,path)));
      },
      off(type,cb){for(let i=privateSubs.length-1;i>=0;i--)if(privateSubs[i].uid===uid&&privateSubs[i].path===path&&(!cb||privateSubs[i].cb===cb))privateSubs.splice(i,1);},
      once(){
        privateAttempts.push({uid:uid,path:path,type:'once'});
        if(!canRead(uid,path))return reject('permission_denied');
        if(consumeFailure('once:'+path))return reject('permission_denied');
        const v=value(uid,path);
        return v===undefined?reject('permission_denied'):Promise.resolve(snapshot(v));
      },
      update(obj){
        if(path===''){
          if(!actualCaptain(uid)){pushWrite(uid,'atomic',obj,false,'permission_denied');return reject('permission_denied');}
          const publicPath=PUBLIC_PATH;
          const keys=Object.keys(obj||{});
          const secretPath=keys.find(k=>k.indexOf('task03Secrets/')===0);
          if(keys.length!==2||!obj[publicPath]||!secretPath){pushWrite(uid,'atomic',obj,false,'invalid atomic update');return reject('invalid atomic update');}
          const actor=secretPath.split('/').pop();
          const oldTask=clone(task03());
          if(!Object.keys(obj[publicPath]).every(k=>CAPTAIN_FIELDS.indexOf(k)>=0)){pushWrite(uid,'atomic',obj,false,'permission_denied');return reject('permission_denied');}
          // Реальные Rules видят root ДО multi-path update: секрет можно писать
          // текущему Актёру или, во время reaction, текущему Судье — следующему Актёру.
          const secretAllowed=oldTask.actorUid===actor||(oldTask.stage==='reaction'&&oldTask.judgeUid===actor);
          if(!secretAllowed){pushWrite(uid,'atomic',obj,false,'permission_denied');return reject('permission_denied');}
          if(!validSecretValue(obj[secretPath])){pushWrite(uid,'atomic',obj,false,'invalid_secret');return reject('invalid_secret');}
          if(obj[publicPath].actorUid!==actor||obj[publicPath].round!==obj[secretPath].round){pushWrite(uid,'atomic',obj,false,'actor mismatch');return reject('actor mismatch');}
          if(consumeFailure('atomic')){pushWrite(uid,'atomic',obj,false,'permission_denied');return reject('permission_denied');}
          pushWrite(uid,'atomic',obj,true);
          const newTask=clone(oldTask);
          merge(newTask,obj[publicPath]);
          room.tasks.task03=newTask;
          secrets[actor]=clone(obj[secretPath]);
          broadcast();
          return Promise.resolve();
        }
        return updatePublic(uid,path,obj);
      },
      set(obj){
        if(path===DECK_PATH){
          privateAttempts.push({uid:uid,path:path,type:'set'});
          if(!actualCaptain(uid)){pushWrite(uid,path,obj,false,'permission_denied');return reject('permission_denied');}
          if(!validDeckValue(obj)){pushWrite(uid,path,obj,false,'invalid_deck');return reject('invalid_deck');}
          if(consumeFailure('set:'+path)){pushWrite(uid,path,obj,false,'permission_denied');return reject('permission_denied');}
          pushWrite(uid,path,obj,true);
          deck=clone(obj);
          emitPrivate(path);
          return Promise.resolve();
        }
        const m=path.match(/^task03Secrets\/test\/([^/]+)$/);
        if(m){
          privateAttempts.push({uid:uid,path:path,type:'set'});
          if(!actualCaptain(uid)||task03().actorUid!==m[1]){pushWrite(uid,path,obj,false,'permission_denied');return reject('permission_denied');}
          if(!validSecretValue(obj)){pushWrite(uid,path,obj,false,'invalid_secret');return reject('invalid_secret');}
          if(consumeFailure('set:'+path)){pushWrite(uid,path,obj,false,'permission_denied');return reject('permission_denied');}
          pushWrite(uid,path,obj,true);
          secrets[m[1]]=clone(obj);
          emitPrivate(path);
          return Promise.resolve();
        }
        return reject('unknown path');
      }
    };
  },
  registerRoom(uid){listeners[uid]=(listeners[uid]||0)+1;},
  unregisterRoom(uid){listeners[uid]=Math.max(0,(listeners[uid]||0)-1);},
  setPhase(uid,phase,startsAt){
    const obj={phase:phase,startsAt:startsAt};
    if(!actualCaptain(uid)){pushWrite(uid,'state',obj,false,'not captain');return reject('not captain');}
    pushWrite(uid,'state',obj,true);
    room.state.phase=phase;room.state.startsAt=startsAt;broadcast();return Promise.resolve();
  }
};
})();
