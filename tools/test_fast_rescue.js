const {chromium}=require('playwright');const assert=require('node:assert/strict');const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const b=await chromium.launch();const errors=[];let count=0;
 const passed=t=>{count++;console.log('通过：'+t);};
 try{
  async function open(file='index.html',touch=false){const c=await b.newContext({viewport:{width:390,height:844},hasTouch:touch});await c.route('https://**/*',r=>r.abort());await c.route('**/assets/**',r=>r.abort());const p=await c.newPage();p.ctx=c;p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>localStorage.setItem('qf-type','on'));await p.goto(pathToFileURL(path.resolve(__dirname,'..',file)).href);await p.waitForSelector('.title-screen');return p;}
  async function start(p,h='h93',extra={}){await p.evaluate(({h,extra})=>{const S=SugarCube;S.setup.vn.reset();Object.assign(S.State.variables,S.setup.INITIAL_VARIABLES,{v018:1,v022:1,v019:6,v038:0,v012:5,used:{},expr:{},bgm:null,stage:S.setup.freshStage(),qfTestJump:true},extra);delete S.State.variables.qfStep;delete S.State.variables.qfSeen;S.Engine.play(h);},{h,extra});await p.waitForFunction(()=>SugarCube.setup.vn.debug().ready);}
  const debug=p=>p.evaluate(()=>SugarCube.setup.vn.debug());
  const fast=p=>p.locator('[data-qf="fast"]');
  async function assertStopped(p){const a=await p.evaluate(()=>({p:SugarCube.State.passage,k:SugarCube.setup.vn.debug().k,fast:SugarCube.setup.vn.debug().fast}));assert.equal(a.fast,false);await p.waitForTimeout(300);assert.deepEqual(await p.evaluate(()=>({p:SugarCube.State.passage,k:SugarCube.setup.vn.debug().k,fast:SugarCube.setup.vn.debug().fast})),a);}
  for(const file of ['index.html','admin.html']){
   const p=await open(file);const nav=await p.evaluate(()=>SugarCube.setup.CHAPTER_NAV.find(c=>c.index===8));assert.equal(nav.entries[0].passage,'h93');
   await p.evaluate(admin=>admin?SugarCube.setup.admin.open():SugarCube.setup.chapterSelect.open(),file==='admin.html');
   assert.equal(await p.locator('.route-card').count(),4);assert.equal(await p.locator('[data-branch="suyue-rescue"]').count(),1);
   await p.locator('[data-branch="suyue-rescue"] button').click();await p.waitForFunction(()=>SugarCube.State.passage==='h91');
   assert.deepEqual(await p.evaluate(()=>({v022:SugarCube.State.variables.v022,v039:SugarCube.State.variables.v039,v038:SugarCube.State.variables.v038,v012:SugarCube.State.variables.v012})),{v022:1,v039:0,v038:0,v012:5});
   await p.locator('#ui-overlay').waitFor({state:'hidden'});
   await p.evaluate(admin=>admin?SugarCube.setup.admin.open():SugarCube.setup.chapterSelect.open(),file==='admin.html');
   if(file==='admin.html'){await p.locator('#admin-chapter').selectOption('8');assert.equal(await p.locator('#admin-passage').inputValue(),'h93');await p.getByRole('button',{name:'进入所选话',exact:true}).click();}
   else await p.locator('[data-chapter="8"]').click();
   await p.waitForFunction(()=>SugarCube.State.passage==='h93');passed(file+' 救援默认第93话，单独分叉入口第91话，四个HE保持同级');await p.ctx.close();
  }
  {
   const p=await open();await p.evaluate(()=>{const S=SugarCube,v={...S.setup.INITIAL_VARIABLES,v022:1,v018:1};localStorage.setItem(S.setup.storageKey('chapter-visits-v2'),JSON.stringify({8:{schema:1,passage:'h92',variables:v,at:1}}));});
   await p.evaluate(()=>SugarCube.setup.chapterSelect.open());await p.locator('[data-chapter="8"]').click();await p.waitForFunction(()=>SugarCube.State.passage==='h93');assert.equal(await p.evaluate(()=>SugarCube.setup.chapterSelect.records()[8].passage),'h92');
   passed('旧第92话失败记录不劫持救援按钮，原记录未被改写');await p.ctx.close();
  }
  const p=await open();
  await start(p);await fast(p).click();await p.waitForFunction(()=>{const d=SugarCube.setup.vn.debug();return d.steps[d.k]==='choice'&&!d.fast;});
  assert.equal(await p.locator('.qf-pick.qf-on .opt a').count(),2);assert.equal(await p.evaluate(()=>SugarCube.State.variables.v058),0);await assertStopped(p);passed('点击快进跨对白后停在选项，不代选、不提前救人');
  await p.getByText('承担后果，送她离开',{exact:true}).click();await fast(p).click();await p.waitForFunction(()=>/^h70(?:$|\D)/.test(SugarCube.State.passage));await p.evaluate(()=>SugarCube.setup.vn.setFast('off'));
  assert.deepEqual(await p.evaluate(()=>({alive:SugarCube.State.variables.v022,identity:SugarCube.State.variables.v039,rescue:SugarCube.State.variables.v058,north:SugarCube.State.variables.v024,evidence:SugarCube.State.variables.v012,trust:SugarCube.State.variables.v019})),{alive:1,identity:0,rescue:1,north:0,evidence:6,trust:4});
  passed('快进可跨话，救援回第70话；数值只结算一次');
  await start(p);await fast(p).click();await p.waitForTimeout(180);await fast(p).click();await assertStopped(p);passed('再次点击停止，不残留推进计时器');
  await start(p);const r=await fast(p).boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.waitForTimeout(650);assert.equal((await debug(p)).fastMode,'hold');await p.mouse.up();await assertStopped(p);await p.waitForTimeout(100);assert.equal((await debug(p)).fast,false);passed('长按临时快进，松手停止且不被释放点击重新开启');
  await start(p);await fast(p).click();await p.locator('[data-qf="menu"]').click();await p.waitForSelector('.qf-menubox');await assertStopped(p);await p.locator('#ui-dialog-close').click();await p.locator('#ui-overlay').waitFor({state:'hidden'});await assertStopped(p);passed('菜单打开即暂停，关闭后不自行继续');
  await start(p);const saved=await p.evaluate(()=>SugarCube.Save.base64.save());await fast(p).click();await p.evaluate(async saved=>{await SugarCube.Save.base64.load(saved);SugarCube.Engine.show();},saved);await p.waitForFunction(()=>SugarCube.setup.vn.debug().ready);await assertStopped(p);passed('读取存档停止快进，恢复后不自动运行');
  await start(p);await fast(p).click();await p.evaluate(()=>window.dispatchEvent(new Event('blur')));await assertStopped(p);passed('窗口失焦立即停止');
  await start(p,'h92');await fast(p).click();await p.waitForFunction(()=>{const d=SugarCube.setup.vn.debug();return !d.fast&&['ending','card'].includes(d.steps[d.k]);},null,{timeout:30000});await assertStopped(p);passed('到结局自动停下，不穿过结局提示');
  await start(p);for(const width of [320,390,430,1280]){await p.setViewportSize({width,height:844});const buttons=await p.locator('#qf-tools button').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{width:r.width,height:r.height,right:r.right};}));assert(buttons.every(r=>r.width>=44&&r.height>=44&&r.right<=width+1),JSON.stringify(buttons));}passed('320/390/430/1280 宽工具栏均无溢出，按钮至少44px');
  await p.ctx.close();
  const t=await open('index.html',true);await start(t);await fast(t).tap();assert.equal((await debug(t)).fast,true);await fast(t).tap();await assertStopped(t);passed('触屏点击快进开关正常');await t.ctx.close();
  assert.deepEqual(errors,[]);console.log('快进与救援入口：'+count+'项通过；页面异常0');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
