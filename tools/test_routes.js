const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
(async () => {
  const b = await chromium.launch(); const errors = [];
  async function open(file = 'index.html') {
    const c = await b.newContext({ viewport: { width: 390, height: 844 } });
    await c.route('https://**/*', r => r.abort()); await c.route('**/assets/**', r => r.abort());
    await c.addInitScript(() => localStorage.setItem('qf-type', 'off'));
    const p = await c.newPage(); p.ctx = c; p.on('pageerror', e => errors.push(e.message));
    await p.goto(pathToFileURL(path.join(root, file)).href); await p.waitForSelector('.title-screen'); return p;
  }
  try {
    for (const file of ['index.html', 'admin.html']) {
      const p = await open(file);
      const data = await p.evaluate(() => ({
        routes: SugarCube.setup.ROUTES, he: SugarCube.setup.ENDINGS.filter(e => e.he).map(e => e.name),
        retired: ['h88','h94','h95','h96','h97','h98','h99'].filter(n => SugarCube.Story.has(n)),
        rawHE: SugarCube.setup.CHAPTER_NAV.concat(SugarCube.setup.ADMIN_CHAPTERS).flatMap(c => c.entries).filter(e => /HE·|终章|支线/.test(e.title)),
      }));
      assert.deepEqual(data.he.sort(), ['HE·白鹭','HE·樱花','HE·宫本仁','HE·白鹭同志'].sort());
      assert.equal(data.routes.length, 4); assert.deepEqual(data.retired, []); assert.deepEqual(data.rawHE, []);
      const migration = await p.evaluate(() => {
        const s = SugarCube, key = s.setup.storageKey('chapter-visits-v2');
        const values = Object.assign({}, s.setup.INITIAL_VARIABLES, { v001: 7 }); delete values.v058;
        localStorage.setItem(key, JSON.stringify({0: {schema:1,passage:'h1',variables:values,at:1}}));
        const migrated = s.setup.chapterSelect.records()[0];
        delete values.v001;
        localStorage.setItem(key, JSON.stringify({0: {schema:1,passage:'h1',variables:values,at:1}}));
        const rejectsBroken = !s.setup.chapterSelect.records()[0]; localStorage.removeItem(key);
        return { oldValue:migrated.variables.v001,newValue:migrated.variables.v058,rejectsBroken };
      });
      assert.deepEqual(migration,{oldValue:7,newValue:0,rejectsBroken:true});
      for (const route of data.routes) for (const action of ['entry', 'ending']) {
        const before = await p.evaluate(() => SugarCube.State.passage);
        if (file === 'admin.html') await p.evaluate(() => SugarCube.setup.admin.open());
        else await p.evaluate(() => SugarCube.setup.chapterSelect.open());
        assert.equal(await p.locator('.route-card').count(), 4);
        await p.evaluate(() => {
          window.routeInput = null;
          jQuery(document).one(':passagestart.portalTest', ev => { window.routeInput = { passage: ev.detail.passage.name, variables: JSON.parse(JSON.stringify(SugarCube.State.variables)) }; });
        });
        await p.locator('[data-route="'+route.id+'"] [data-route-action="'+action+'"]').click();
        const got = await p.evaluate(() => window.routeInput);
        assert.equal(got.passage, route[action]);
        for (const [k,v] of Object.entries(route.values)) assert.equal(got.variables[k], v, route.id+':'+k);
        assert.equal(await p.locator('#passages .error-view, #passages .error').count(), 0);
        await p.locator('#ui-overlay').waitFor({ state: 'hidden' });
        await p.evaluate(admin => admin ? SugarCube.setup.admin.undo() : SugarCube.setup.chapterSelect.undo(), file === 'admin.html');
        assert.equal(await p.evaluate(() => SugarCube.State.passage),before);
      }
      await p.evaluate(() => { SugarCube.setup.ENDINGS.filter(e => e.he).forEach(e => SugarCube.setup.markEnd(e.id)); SugarCube.Engine.play('结局一览'); });
      const group = p.locator('.gal').first();
      assert.equal(await group.locator('h3').innerText(), '结局路线（同级）'); assert.equal(await group.locator('li.he').count(), 4);
      await p.ctx.close(); console.log('通过：'+file+' 四条路线同级，8个传送按钮位置及输入数值正确，结局一览同级分组');
    }
    for (const hasStatement of [0, 1]) {
      const p = await open();
      const result = await p.evaluate(async hasStatement => {
        const S = SugarCube;
        Object.assign(S.State.variables, S.setup.INITIAL_VARIABLES, { v018: 1, v022: 1, v010: 2, v012: 6, v019: 6, v038: hasStatement, used: {}, expr: {}, bgm: null, stage: S.setup.freshStage() });
        S.setup.vn.reset(); S.Engine.play('h91'); const choices = [];
        for (let i=0;i<2000;i++) {
          await new Promise(r=>setTimeout(r,0));
          if (S.State.passage==='h70') return { choices, v: JSON.parse(JSON.stringify(S.State.variables)) };
          const d=S.setup.vn.debug();if(!d.ready)continue;
          if (d.steps[d.k]==='choice') {
            const links=[...document.querySelectorAll('.qf-pick.qf-on .opt a')];
            const a=links.find(a=>/先拖着，去找具泰山|承担后果，送她离开/.test(a.textContent));
            if(!a)return { error:'unexpected choice', choices:links.map(a=>a.textContent) };
            choices.push(a.textContent);a.click();
          } else if(d.steps[d.k]==='card')return {error:'unexpected death'};
          else S.setup.vn.advance(true);
        }
        return {error:'step limit'};
      },hasStatement);
      assert.equal(result.error, undefined, JSON.stringify(result));
      assert.equal(result.v.v022,1);assert.equal(result.v.v039,0);assert.equal(result.v.v058,1);assert.equal(result.v.v024,0);
      assert.equal(result.v.v038,1);assert.equal(result.v.v012,hasStatement?6:7);assert.equal(result.v.v019,4);
      await p.ctx.close();console.log('通过：救素月短分流，证言初始='+hasStatement+'，低好感仍能选择救人，承担代价留南，无身份转赠');
    }
    assert.deepEqual(errors,[]);
    assert(fs.readFileSync(path.join(root,'docs/archive/withdrawn-gift-route-20261107/09-支线-赠名.md'),'utf8').includes('HE·赠名'));
    console.log('路线重排与救援回归全部通过；页面异常 0；原稿归档仍在');
  } finally {await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
