// NODE_PATH=<playwright location> node tools/test_north_be.js
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const fs=require('node:fs');
const cases=[];
function add(name,start,vars,picks,stop,check={}){cases.push({name,start,vars,picks,stop,check});}
const family={v048:1,v023:1,v062:1,v065:1,v063:1,v061:1};
for(const brother of [0,1])for(const picks of [['（照着稿子念）','（让他说完）'],['先听听他自己怎么说。','你没有资格提这些！']])
 add('公审冷场继续/恩哲='+brother,'h110',{v023:brother},picks,'h111',{v061:1,v065:brother});
add('动员成功保留原后果','h110',{v023:1},['他是烈士的儿子。','1956年7月，他到我家里来过。'],'h111',{v061:0,v065:0});
add('八月发言后接受劝阻','h108~座位',{},['（站起来，要求发言）','坐下，将意见另行提交。'],'h109',{v060:1});
add('八月联署延迟后果','h108~座位',{},['（站起来，要求发言）','继续要求中止会议，并当众签署联合声明。'],'BE:八月');
add('未带评语且无自留证物仍可核验','h112',{v046:0,v012:0,v032:0},['申请调取组织接收清单和1953年原卷。'],'HE',{v064:2});
add('保留证物有独立用途','h112',{v046:0,v012:3,v032:0},['提交仍在手上的证物，核对接收记录。'],'HE',{v064:2});
add('低信任仍认可宫本原件','h112',{v046:0,v032:1},['提交宫本评语原件。','（全文照译）'],'HE',{v064:1});
add('漏译可补正','h112',{v046:0,v032:1},['提交宫本评语原件。','（漏掉最后一句）','补译原文，并在更正处签名。'],'HE',{v064:1});
add('改译可补正','h112',{v032:1},['提交宫本评语原件。','（把“余爱之”译成“余恶之”）','承认改译，提交完整译文。'],'HE',{v064:1});
add('明确坚持删改才漏译出局','h112',{v032:1},['提交宫本评语原件。','（漏掉最后一句）','拒绝更正，要求只按删节译文归档。'],'BE:漏译');
add('当前证言是合法核验途径','h112',{v046:0},['请车英洙补签一份当年的证明。','按今日日期作证，并交其他人核对。'],'HE',{v064:3});
add('倒填旧证明才一笔出局','h112',{},['请车英洙补签一份当年的证明。','仿写旧接收单，填上当年的日期提交。'],'BE:一笔');
add('如实承认公开掩护可返回核验','h112',{},['两份都是真的，我不再补充或接受核对。','说明掩护关系，申请调卷。','申请调取组织接收清单和1953年原卷。'],'HE',{v064:2});
add('明确拒绝所有核验才无凭','h112',{},['两份都是真的，我不再补充或接受核对。','拒绝复核，并撤回所有待核查线索。'],'BE:无凭');
add('姐弟申诉后承认责任可继续','h112',family,['承认材料失实，申请将本人责任与姐弟原案分别核查。','申请调取组织接收清单和1953年原卷。'],'HE',{v063:2,v064:2});
add('串供指控仍可撤回','h112',family,['指控姐弟串供，要求按新口径结案。','撤回串供指控，按原卷复核。','申请调取组织接收清单和1953年原卷。'],'HE',{v063:2});
add('再造新指控才延迟公审','h112',family,['指控姐弟串供，要求按新口径结案。','仍签署新指控，要求撤销姐弟申诉。'],'BE:公审');
for(const key of ['v048','v023','v062','v065'])add('申诉缺一条件不触发:'+key,'h111',{...family,[key]:0,v063:0},['两条都删。'],'h112',{v063:0});
add('姐弟条件齐全才触发申诉','h111',{...family,v063:0},['两条都删。'],'h112',{v063:1});
const trial=['认得。南山庄的电话记录簿，宫本秘书的笔迹。','（看向被告席）'];
add('1944真日期不再即死','h106',{v050:1},[...trial,'1944年3月。我在宫本书房里，亲耳听见的。','没有了。'],'h107',{v059:1});
add('补充全部经过不再即死','h106',{v050:1},[...trial,'1945年8月16日。宫本焚档的那天夜里。','名单上还有一家平壤的照相馆……我想把1944年的事从头说一遍。','提交完整经过，接受另案核对。'],'h107',{v059:1});
add('笔迹可申请独立鉴定','h106',{},['不认得。','笔迹只能提供线索，请另行鉴定。','（看向被告席）','今天。','没有了。'],'h107',{v059:1});
add('代号可保留结论','h106',{},[trial[0],'我不知道。','说明联络经过，请法庭核对代号。','今天。','没有了。'],'h107',{v059:1});
add('否认已有签字才同案','h106',{},['不认得。','我没有见过，愿以书面证词确认。'],'BE:同案');
add('否认原稿并拒核才知情者','h106',{},[...trial,'今天。','名单上还有一家平壤的照相馆……我想把1944年的事从头说一遍。','要求立即撤销全部指控，并声明自己从未参与1948年材料。'],'BE:知情者');
const questions=['这页纸，是从哪里来的？','美帝间谍？','为什么是我？','我1948年写的材料呢？','我没有问题了。'];
add('第一次拒绝预设证词可继续','h105',{},[...questions,'我不作证。','只证明亲历的事，其余要求另查。'],'h106',{v059:1});
add('拒绝全部核对才同案','h105',{},[...questions,'我不作证。','拒绝一切询问，要求将声明正式附卷。'],'BE:同案');
add('电话记录说谎仍可更正','h105',{v039:0,v056:1},['那一页，我烧了。','更正口供，交出原件。',...questions,'我作证。'],'h106',{v059:1});
add('放笔可休庭重新选择','h82',{v046:6},['（放下笔）','休庭后重新考虑判决。','（在"死刑"两个字上划一道，写上"劳动改造"）'],'h105',{v048:1,v046:5});
add('拒签后坚持否认底稿才第三栏','h82',{},['（放下笔）','公开否认自己提交的材料，并拒绝一切复核。'],'BE:第三栏');
for(const sibling of [0,1])add('通信入口按恩哲存活:'+sibling,'h107',{v023:sibling,v048:1},['我没见过她。',...(sibling?['告诉他矿山和移送编号，按手续查询。']:[]),'让我想想。'],'h108',{v062:sibling});
add('恩淑死亡无通信入口','h107',{v023:1,v048:0},['我没见过她。','让我想想。'],'h108',{v062:0});
add('拒绝查询不凭空通信','h107',{v023:1,v048:1},['我没见过她。','不再透露她的去向。','让我想想。'],'h108',{v062:0});

(async()=>{
 const b=await chromium.launch();const errors=[];const results=[];
 try{
  const c=await b.newContext();await c.route('https://**/*',r=>r.abort());await c.route('**/assets/**',r=>r.abort());
  const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await p.waitForSelector('.title-screen');
  const stageMode=process.argv.includes('--stage');
  const selected=stageMode?cases.filter(t=>['公审冷场继续/恩哲=1','漏译可补正','姐弟申诉后承认责任可继续','再造新指控才延迟公审'].includes(t.name)):cases;
  if(stageMode)await p.setViewportSize({width:390,height:844});
  for(const test of selected){
   test.stageMode=stageMode;
   const r=await p.evaluate(async t=>{
    const S=SugarCube;S.setup.vnAutoFollow=t.stageMode;S.setup.audio.reset();S.setup.vn.reset();
    Object.keys(S.State.variables).forEach(k=>delete S.State.variables[k]);
    Object.assign(S.State.variables,S.setup.INITIAL_VARIABLES,{used:{},expr:{},bgm:null,stage:S.setup.freshStage(),qfTestJump:true},t.vars);
    if(!S.Story.has(t.start))return{error:'missing start '+t.start};
    S.Engine.play(t.start);const picks=[...t.picks],log=[];
    for(let i=0;i<(t.stageMode?3000:320);i++){
     await new Promise(r=>setTimeout(r,0));
     const root=document.querySelector('#passages'),error=root.querySelector('.error,.error-view');if(error)return{error:error.textContent,log};
     const end=root.querySelector('.ending .name');const hua=/^h\d+/.exec(S.State.passage)?.[0];
     const d=S.setup.vn.debug();
     if((end&&(!t.stageMode||d.ready&&d.steps[d.k]==='card'))||(!t.stop.startsWith('BE:')&&t.stop!=='HE'&&hua===t.stop))return{end:end?.textContent,hua,vars:JSON.parse(JSON.stringify(S.State.variables)),left:picks,log};
     if(t.stageMode){if(!d.ready)continue;if(d.steps[d.k]!=='choice'){S.setup.vn.advance(true);continue;}}
     const links=[...root.querySelectorAll(t.stageMode?'.qf-pick.qf-on .opt a':'a.link-internal')].filter(a=>!a.closest('nav.after'));
     let next=picks.length&&links.find(a=>a.textContent.trim()===picks[0]);
     if(next)picks.shift();else next=links.find(a=>a.textContent.trim()==='继续');
     if(!next)return{error:'unexpected choice',log,left:picks,available:links.map(a=>a.textContent)};
     log.push(next.textContent);next.click();
    }return{error:'step limit',log,left:picks};
   },test);
   assert.equal(r.error,undefined,test.name+': '+JSON.stringify(r));assert.deepEqual(r.left,[],test.name);
   if(test.stop==='HE')assert.equal(r.end,'HE·白鹭同志',test.name);
   else if(test.stop.startsWith('BE:'))assert.equal(r.end,test.stop.slice(3),test.name);
   else assert.equal(r.hua,test.stop,test.name);
   for(const[k,v]of Object.entries(test.check))assert.equal(r.vars[k],v,test.name+':'+k);
   results.push({name:test.name,end:r.end||r.hua});console.log('通过：'+test.name);
  }
  if(!stageMode){
   const legacy=await p.evaluate(()=>{
    const S=SugarCube;S.setup.vnAutoFollow=false;S.setup.vn.reset();
    Object.keys(S.setup.northDefaults).forEach(k=>delete S.State.variables[k]);
    S.State.variables.v046=9;S.Engine.play('h112');
    return {flags:Object.fromEntries(Object.keys(S.setup.northDefaults).map(k=>[k,S.State.variables[k]])),trust:S.State.variables.v046};
   });
   assert.deepEqual(legacy,{flags:{v058:0,v059:0,v060:0,v061:0,v062:0,v063:0,v064:0,v065:0},trust:9});
   console.log('通过：旧状态只补缺失标记，不制造姐弟通信或申诉，不改原信任值');
  }
  assert.deepEqual(errors,[]);console.log('北行后半段：'+selected.length+' 个'+(stageMode?'真实舞台':'定向')+'分支通过；页面异常 0');
  if(process.env.CTGS_TEST_OUTPUT){fs.mkdirSync(process.env.CTGS_TEST_OUTPUT,{recursive:true});fs.writeFileSync(path.join(process.env.CTGS_TEST_OUTPUT,'north-be-results.json'),JSON.stringify({results,errors},null,2));}
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
