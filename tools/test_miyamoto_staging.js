// Real stage, real images; temporary browser contexts only.
const{chromium}=require('playwright');const assert=require('node:assert/strict');const path=require('node:path');const{pathToFileURL}=require('node:url');
(async()=>{const b=await chromium.launch();const errors=[];let checks=0;const ok=s=>{checks++;console.log('通过：'+s);};try{
 async function open(start,vars={}){const c=await b.newContext({viewport:{width:390,height:844}});await c.route('https://**/*',r=>r.abort());await c.addInitScript(()=>{localStorage.setItem('qf-type','off');localStorage.setItem('qf-audio','off');});const p=await c.newPage();p.ctx=c;p.on('pageerror',e=>errors.push(e.message));await p.goto(process.env.CTGS_TEST_URL||pathToFileURL(path.resolve(__dirname,'../index.html')).href);await p.waitForSelector('.title-screen');await p.evaluate(({start,vars})=>{const S=SugarCube;S.setup.vn.reset();Object.assign(S.State.variables,S.setup.INITIAL_VARIABLES,{v001:12,v010:8,v018:1,v019:6,v023:1,used:{},expr:{},bgm:null,stage:S.setup.freshStage()},vars);S.Engine.play(start);},{start,vars});return p;}
 async function drive(p,{line,choice,priorities=[]}){const r=await p.evaluate(async({line,choice,priorities})=>{const S=SugarCube,asked=new Set();for(let i=0;i<3500;i++){await new Promise(r=>setTimeout(r,0));const d=S.setup.vn.debug();if(!d.ready)continue;const active=document.querySelector('.qf-line.qf-on');const text=active?.textContent||'';if(line&&text.includes(line))return{text,stage:d.stage,k:d.k,passage:S.State.passage};if(d.steps[d.k]==='choice'){const links=[...document.querySelectorAll('.qf-pick.qf-on .opt a')];if(choice&&links.some(a=>a.textContent.includes(choice)))return{text:links.map(a=>a.textContent).join('|'),stage:d.stage,k:d.k,passage:S.State.passage};const question=links.some(a=>a.textContent.includes("我没有问题了"));const a=priorities.map(s=>links.find(a=>a.textContent.includes(s)&&(!question||!asked.has(a.textContent)))).find(Boolean);if(a&&question)asked.add(a.textContent);if(!a)return{error:'unexpected choice',choices:links.map(a=>a.textContent)};a.click();}else if(d.steps[d.k]==='card')return{error:'unexpected ending'};else S.setup.vn.advance(true);}return{error:'step limit'};},{line,choice,priorities});assert.equal(r.error,undefined,JSON.stringify(r));return r;}
 async function portrait(p,visible){if(visible)await p.waitForFunction(()=>{const box=document.querySelector('#qf-char'),src=box.getAttribute('data-src');return [...box.querySelectorAll('img.on')].some(i=>i.complete&&i.naturalWidth>0&&i.getAttribute('src')===src);});else{await p.waitForTimeout(600);assert.equal(await p.locator('#qf-char img.on').count(),0);assert.equal(await p.locator('#qf-char').getAttribute('data-src'),'');}}
 {
  const p=await open('h10');const r=await drive(p,{line:'心脏的老毛病',priorities:['时势','先生为什么研究朝鲜古代史','什么是','南山庄是什么地方','您对半岛青年有什么期望','我没有问题了','语言会自己选择它的主人']});assert.equal(r.stage.who,'宫本谦造');await portrait(p,true);await drive(p,{line:'左边第二个抽屉',priorities:[]});ok('第10话改名前的公共剧情明确交代心脏旧病、药瓶位置，不依赖好感或姓名分支');await p.ctx.close();
 }
 for(const trust of [3,12]){
  const p=await open('h45',{v001:trust});const priorities=['我劝他去。','收下账本'];
  await drive(p,{line:'他的心脏病，这两年发作得比从前勤',priorities});
  const before=await drive(p,{line:trust>=8?'有电话来，就说我不在':'别太晚',priorities});assert.equal(before.stage.who,'宫本谦造');await portrait(p,true);
  await p.evaluate(()=>window.previousPortrait=[...document.querySelectorAll('#qf-char img.on')].find(i=>i.getAttribute('src')===document.querySelector('#qf-char').getAttribute('data-src')));
  const after=await drive(p,{line:'门关上了。汽车发动',priorities});assert.equal(after.stage.who,null);
  assert.equal(await p.evaluate(()=>{window.previousPortrait.dispatchEvent(new Event('load'));return window.previousPortrait.classList.contains('on');}),false,'迟到的旧图片load事件不得复现头像');
  await portrait(p,false);
  const atChoice=await drive(p,{choice:'拿起听筒',priorities});assert.equal(atChoice.stage.who,null);await portrait(p,false);
  const saved=await p.evaluate(()=>SugarCube.Save.base64.save());await p.evaluate(async saved=>{await SugarCube.Save.base64.load(saved);SugarCube.Engine.show();},saved);await p.waitForFunction(()=>SugarCube.setup.vn.debug().ready);await portrait(p,false);
  await p.evaluate(()=>SugarCube.setup.vn.prev());await portrait(p,false);
  await drive(p,{line:'老毛病了。别告诉千鹤',priorities:['不碰电话']});assert.equal((await p.evaluate(()=>SugarCube.setup.vn.debug().stage)).who,'宫本谦造');await portrait(p,true);
  ok('第45话信任='+trust+'：离场前在场，门关时撤下，电话选择/读档/回退不复现，之后回场正常');await p.ctx.close();
 }
 {
  const p=await open('h125');const before=await drive(p,{line:'我去南山庄。今晚不回来了'});assert.equal(before.stage.who,'宫本谦造');await portrait(p,true);const after=await drive(p,{line:'门关上了。汽车发动'});assert.equal(after.stage.who,null);await portrait(p,false);ok('第125话相同离场演出已同步，不留宫本头像看着主角拿便笺');await p.ctx.close();
 }
 assert.deepEqual(errors,[]);console.log('宫本健康伏笔与退场：'+checks+'项通过，页面异常0');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
