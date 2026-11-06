// Regression: .save vs .savesbundle, mistaken entry, mode isolation, and preservation of slots.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const output = process.env.CTGS_TEST_OUTPUT || path.resolve(root, '../.ctgs-runtime/save-import-tests');
fs.mkdirSync(output, { recursive: true });
let fixture = process.env.CTGS_SAVE_FIXTURE || path.resolve(root, '../宫本仁-第60话.save');
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  async function open(file = 'index.html') {
    const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 } });
    await ctx.route('https://**/*', r => r.abort());
    await ctx.route('**/assets/**', r => r.abort());
    await ctx.addInitScript(() => localStorage.setItem('qf-type', 'off'));
    const p = await ctx.newPage(); p.ctx = ctx;
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(pathToFileURL(path.join(root, file)).href);
    await p.waitForSelector('.title-screen');
    return p;
  }
  async function menu(p) { await p.evaluate(() => SugarCube.UI.saves()); await p.waitForSelector('#ui-dialog-body.saves'); }
  async function checkLoaded(p) {
    await p.waitForFunction(() => SugarCube.State.passage === 'h60' && SugarCube.setup.vn.debug().ready);
    assert.deepEqual(await p.evaluate(() => [SugarCube.State.variables.v018, SugarCube.State.variables.v050, SugarCube.State.variables.v051, document.documentElement.getAttribute('data-mode')]), [2, 0, 1, 'stage']);
  }
  try {
    if (process.env.CTGS_SAVE_FIXTURE) assert(fs.existsSync(fixture), 'CTGS_SAVE_FIXTURE must exist');
    if (!fs.existsSync(fixture) || process.argv.includes('--generate-fixture')) {
      const p = await open();
      await p.evaluate(() => {
        Object.assign(SugarCube.State.variables, { v018: 2, v050: 0, v051: 1, v001: 12 });
        SugarCube.setup.chapterSelect.testJump('h60', 'current');
      });
      const wait = p.waitForEvent('download');
      await p.evaluate(() => SugarCube.Save.disk.save('import-single-fixture'));
      fixture = path.join(output, 'generated-single.save');
      await (await wait).saveAs(fixture); await p.ctx.close();
      console.log('已用引擎生成独立回归存档，无需仓库外测试文件');
    }
    for (const input of ['saves-disk-load-handler', 'saves-import-handler']) {
      const p = await open();
      await p.evaluate(async () => {
        const s = SugarCube;
        s.State.variables.v001 = 47; s.Engine.play('h2');
        await s.Save.browser.slot.save(0, 'original-slot-sentinel');
      });
      await menu(p);
      assert.equal(await p.getByRole('button', { name: '读取单个存档文件…', exact: true }).count(), 1);
      assert.equal(await p.getByRole('button', { name: '导入全部存档包…', exact: true }).count(), 1);
      await p.locator('#' + input).setInputFiles(fixture);
      await checkLoaded(p);
      assert(await p.evaluate(() => SugarCube.Save.browser.slot.has(0)), 'manual slot must remain');
      await p.evaluate(async () => { await SugarCube.Save.browser.slot.load(0); SugarCube.Engine.show(); });
      assert.equal(await p.evaluate(() => SugarCube.State.variables.v001), 47);
      console.log('通过：' + input + ' 读取同一单个存档成功，宫本仁/未打电话/已救千鹤正确，原存档位未覆盖');
      await p.ctx.close();
    }
    const admin = await open('admin.html'); await menu(admin);
    await admin.locator('#saves-import-handler').setInputFiles(fixture);
    await admin.waitForSelector('.qf-save-error [role=alert]');
    assert((await admin.locator('.qf-save-error').innerText()).includes('正式版 index.html'));
    assert.notEqual(await admin.evaluate(() => SugarCube.State.passage), 'h60');
    console.log('通过：正式版/管理员版不匹配有明确中文提示，隔离未被绕过');
    await admin.ctx.close();
    const bad = path.join(output, 'corrupt.save'); fs.writeFileSync(bad, 'invalid-save-data');
    const broken = await open(); await menu(broken);
    await broken.locator('#saves-import-handler').setInputFiles(bad);
    await broken.waitForSelector('.qf-save-error [role=alert]');
    assert.notEqual(await broken.evaluate(() => SugarCube.State.passage), 'h60');
    console.log('通过：损坏文件被拦截，显示中文错误，不伪装导入成功');
    await broken.ctx.close();
    const source = await open();
    await source.evaluate(async () => {
      const s = SugarCube; s.State.variables.v001 = 53; s.Engine.play('h2');
      await s.Save.browser.slot.save(2, 'bundle-sentinel');
    });
    const downloadPromise = source.waitForEvent('download');
    await source.evaluate(() => SugarCube.Save.disk.export('ctgs-import-regression'));
    const download = await downloadPromise, bundle = path.join(output, 'roundtrip.savesbundle');
    await download.saveAs(bundle); await source.ctx.close();
    const target = await open(); await menu(target);
    await target.locator('#saves-import-handler').setInputFiles(bundle);
    await target.waitForFunction(() => SugarCube.Save.browser.slot.has(2));
    await target.evaluate(async () => { await SugarCube.Save.browser.slot.load(2); SugarCube.Engine.show(); });
    assert.equal(await target.evaluate(() => SugarCube.State.variables.v001), 53);
    console.log('通过：全部存档包仍可正常导入，原批量功能未受影响');
    await menu(target); await target.waitForTimeout(350);
    await target.screenshot({ path: path.join(output, 'save-menu.jpg'), type: 'jpeg', quality: 78 });
    await target.ctx.close();
    assert.deepEqual(errors, []);
    console.log('存档导入回归全部通过；页面异常 0');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
