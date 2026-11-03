// Node-регрессия формы Firebase Rules для task03Decks.order.
// Файл проверяет согласованную копию правил из док-проекта, а не публикует их.
const fs=require('fs');
const path=require('path');

const EMOTION_IDS=['fear','joy','anger','sadness','surprise','disgust','pain','anxiety','doubt','relief'];
const ORDER_KEYS=['0','1','2','3','4','5','6','7','8','9'];
const rulesPath=process.env.TASK03_RULES_PATH||path.resolve(__dirname,'../../../../AppData/Local/hermes/projects/КВЕСТ/firebase_rules_task03.json');
const results=[];

function check(name,ok,detail){results.push({name,ok:!!ok,detail:detail===undefined?'':String(detail)});}

let root;
try{
  root=JSON.parse(fs.readFileSync(rulesPath,'utf8'));
}catch(e){
  check('Файл правил читается как JSON',false,e.stack||String(e));
}
if(root){
  check('Файл правил читается как JSON',true,rulesPath);
  const rules=root.rules;
  const deck=rules&&rules.task03Decks&&rules.task03Decks.$code;
  const order=deck&&deck.order;
  check('task03Decks.$code.order существует',!!order,order?'ok':'missing');
  if(order){
    const validate=order['.validate']||'';
    check('order больше не требует string',!/newData\.isString\(\)/.test(validate),validate);
    const m=validate.match(/hasChildren\(\[([^\]]*)\]\)/);
    const required=m?m[1].split(',').map(s=>s.trim().replace(/^['"]|['"]$/g,'')).filter(Boolean):[];
    check('order требует обязательные ключи 0..9',ORDER_KEYS.every(k=>required.indexOf(k)>=0)&&required.length===10,JSON.stringify(required));
    ORDER_KEYS.forEach(k=>{
      const child=order[k];
      const childValidate=child&&child['.validate'];
      const ok=typeof childValidate==='string'
        &&/newData\.isString\(\)/.test(childValidate)
        &&EMOTION_IDS.every(id=>childValidate.indexOf("'"+id+"'")>=0);
      check('order.'+k+' валидирует один из 10 emotionId',ok,childValidate||'missing');
    });
    check('order отклоняет лишние ключи',order.$other&&order.$other['.validate']===false,JSON.stringify(order.$other));
  }
  check('deck читаются и пишутся только фактическим капитаном',!!deck
    &&/root\.child\('rooms\/'\+\$code\+'\/captain'\)\.val\(\) === auth\.uid/.test(deck['.read']||'')
    &&/root\.child\('rooms\/'\+\$code\+'\/captain'\)\.val\(\) === auth\.uid/.test(deck['.write']||''));
  const secrets=rules&&rules.task03Secrets&&rules.task03Secrets.$code&&rules.task03Secrets.$code.$uid;
  const secretWrite=secrets&&secrets['.write']||'';
  check('старые правила task03Secrets сохранены',!!secrets
    &&secrets['.read']==='auth != null && auth.uid === $uid'
    &&/captain/.test(secretWrite)
    &&/actorUid/.test(secretWrite));
  check('secret rule разрешает атомарную ротацию: капитан пишет секрет текущего Судьи во время reaction',!!secrets
    &&/root\.child\('rooms\/'\+\$code\+'\/tasks\/task03\/stage'\)\.val\(\) === 'reaction'/.test(secretWrite)
    &&/root\.child\('rooms\/'\+\$code\+'\/tasks\/task03\/judgeUid'\)\.val\(\) === \$uid/.test(secretWrite)
    &&!/captainTransfer/.test(secretWrite),secretWrite);
  const phase=rules&&rules.rooms&&rules.rooms.$code&&rules.rooms.$code.state&&rules.rooms.$code.state.phase;
  check('старое правило фазы task03 сохранено',!!phase&&/task03/.test(phase['.validate']||''));
  const task03=rules&&rules.rooms&&rules.rooms.$code&&rules.rooms.$code.tasks&&rules.rooms.$code.tasks.task03;
  check('старые правила guess/verdict сохранены',!!task03&&!!task03.guess&&!!task03.verdict
    &&/judgeUid/.test(task03.guess['.write']||'')
    &&/actorUid/.test(task03.verdict['.write']||''));
}

const passed=results.filter(r=>r.ok).length;
const total=results.length;
results.filter(r=>!r.ok).forEach(r=>console.error('FAIL '+r.name+(r.detail?' | '+r.detail:'')));
console.log('task03_rules_regression: '+passed+'/'+total);
process.exit(passed===total?0:1);
