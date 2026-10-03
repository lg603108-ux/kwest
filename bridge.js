// bridge.js v2 — связка «результат задания 1 → задание 2». app.js не изменяет.
(function(){
if(!window.NET)return;
var mounted=false;
function cap(){return NET.inRoom&&NET.inRoom()&&NET.isCaptain&&NET.isCaptain();}
function toastMsg(s){var t=document.getElementById('toast');if(!t)return;t.textContent=s;t.style.display='block';clearTimeout(toastMsg.timer);toastMsg.timer=setTimeout(function(){t.style.display='none';},6000);}
function tryMount(){
var r=NET.room;if(!r||!r.state)return;
if(r.state.phase==='task02'&&!mounted){
if(!window.Task02){toastMsg('Модуль задания 2 не загружен (task02.js)');return;}
mounted=true;Task02.mount(document.body);
}
if(r.state.phase!=='task02'&&mounted){mounted=false;if(window.Task02)Task02.unmount();}
}
function addContinueButton(){
if(document.body.dataset.screen!=='result')return;
if(!cap())return;
if(document.getElementById('bridge-continue'))return;
var again=document.getElementById('again');if(!again||!again.parentNode)return;
var b=document.createElement('button');b.id='bridge-continue';b.className='primary';b.type='button';b.textContent='Продолжить квест →';b.style.marginLeft='8px';
again.parentNode.insertBefore(b,again.nextSibling);
b.onclick=function(){
b.disabled=true;toastMsg('Переводим команду в задание 2…');
NET.setPhase('task02',Date.now()+1500).then(function(){
setTimeout(function(){tryMount();if(!mounted){toastMsg('Сервер не ответил — повторяю…');setTimeout(tryMount,3000);}},1200);
}).catch(function(e){b.disabled=false;toastMsg('Ошибка перехода: '+(e&&e.message||e)+' (проверьте правила Firebase: фаза task02)');});
};
}
addContinueButton();
if(window.MutationObserver){new MutationObserver(function(){addContinueButton();}).observe(document.body,{attributes:true,attributeFilter:['data-screen']});}
NET.onRoom(function(){tryMount();});
})();