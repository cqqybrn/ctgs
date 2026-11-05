// node tools/test_admin.js — 管理员模式与发布前回归；仅使用临时浏览器配置。
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '..');
const output = process.env.CTGS_TEST_OUTPUT;
const report = { errors: [], checks: [] };
const mime = { '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp3': 'audio/mpeg', '.json': 'application/json; charset=utf-8' };
const server = http.createServer((req, res) => {
  let filename;
  try { filename = path.resolve(ROOT, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); }
  catch { res.writeHead(400).end(); return; }
  if (filename === ROOT) filename = path.join(ROOT, 'index.html');
  if (!filename.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(filename, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Content-Length': stat.size });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(filename).on('error', () => res.destroy()).pipe(res);
  });
});
function storyPassages(text) {
  text = text.replace(/\r\n/g, '\n');
  return Object.fromEntries([...text.matchAll(/<tw-passagedata\b[^>]*\bname="(h[^"]*)"[^>]*>([\s\S]*?)<\/tw-passagedata>/g)].map(m => [m[1], m[2]]));
}
function sameStory(a, b) {
  const left = storyPassages(a), right = storyPassages(b);
  // 新增美术允许调整背景/立绘提示；仍严格比较台词、数值、选项与跳转。
  const plot = body => body === undefined ? body : body.replace(/&lt;&lt;(?:bg|expr)\s+[\s\S]*?&gt;&gt;\s*/g, '');
  const changed = [...new Set([...Object.keys(left), ...Object.keys(right)])].filter(k => plot(left[k]) !== plot(right[k]));
  assert.deepEqual(changed, [], '剧情正文发生差异的段落');
}
function checked(name) { report.checks.push(name); console.log('通过：' + name); }
(async () => {
  let browser;
  try {
    if (output) fs.mkdirSync(output, { recursive: true });
    const before = execFileSync('git', ['show', 'HEAD:index.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    const normalText = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const adminText = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
    sameStory(normalText, before);
    sameStory(adminText, normalText);
    checked('两版剧情正文、变量与分支逻辑与 HEAD 一致（允许美术提示调整）');
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}/`;
    browser = await chromium.launch();
    const context = await browser.newContext();
    const p = await context.newPage();
    p.on('pageerror', e => report.errors.push(e.message));
    // 批量逻辑测试不加载素材；后面另起页面加载真实图像和音频。
    await p.route('**/assets/**', route => route.abort());
    await p.goto(base); await p.waitForSelector('.title-screen');
    assert.equal(await p.locator('.title-screen').innerText().then(t => t.includes('共 69 个结局')), true);
    assert.equal(await p.getByRole('button', { name: '选择章节', exact: true }).count(), 0);
    const ids = await p.evaluate(() => ({ normal: SugarCube.Story.id, ifid: SugarCube.Story.ifId }));
    await p.getByRole('link', { name: '开始游戏', exact: true }).click();
    const preserved = await p.evaluate(async () => {
      const S = SugarCube, V = S.State.variables;
      V.v001 = 47; V.v011 = 5;
      S.Engine.play('h2');
      await S.Save.browser.slot.save(0, '正式版保留');
      S.setup.markEnd('test-normal-ending');
      S.setup.markDojo('test-normal-dojo');
      localStorage.setItem('qf-cp', JSON.stringify({ sentinel: { s: S.Save.base64.save(), t: 1 } }));
      return ['qf-ends', 'qf-dojo', 'qf-cp'].map(k => [k, localStorage.getItem(k)]);
    });
    await p.goto(base + 'admin.html'); await p.waitForSelector('.title-screen');
    const adminInitial = await p.evaluate(() => ({ enabled: SugarCube.setup.admin.enabled, id: SugarCube.Story.id, ifid: SugarCube.Story.ifId, saves: SugarCube.Save.browser.size, ends: SugarCube.setup.endsSeen(), cp: SugarCube.setup.cpAll(), dojo: SugarCube.setup.dojoSeen() }));
    assert.equal(adminInitial.enabled, true);
    assert.notEqual(adminInitial.id, ids.normal); assert.notEqual(adminInitial.ifid, ids.ifid);
    assert.equal(adminInitial.saves, 0); assert.deepEqual(adminInitial.ends, {}); assert.deepEqual(adminInitial.cp, {}); assert.deepEqual(adminInitial.dojo, {});
    checked('正式版与管理版的故事 ID、IFID、存档、检查点及收集记录隔离');
    await p.getByRole('button', { name: '选择章节', exact: true }).click();
    const chapters = await p.evaluate(() => SugarCube.setup.ADMIN_CHAPTERS);
    assert.equal(chapters.length, 9);
    assert.equal(await p.locator('#admin-chapter option').count(), 9);
    for (let i = 0; i < chapters.length; i++) {
      if (i) await p.getByRole('button', { name: '管理', exact: true }).click();
      await p.locator('#admin-chapter').selectOption(String(i));
      assert.equal(await p.locator('#admin-passage').inputValue(), chapters[i].entries[0].passage);
      await p.locator('#admin-preset').selectOption('fresh');
      await p.getByRole('button', { name: '进入所选话', exact: true }).click();
      assert.equal(await p.evaluate(() => SugarCube.State.passage), chapters[i].entries[0].passage);
      assert.equal(await p.locator('#passages .error-view, #passages .error').count(), 0);
    }
    checked('9 个章节均可通过菜单从章首进入');
    const entryCount = chapters.reduce((n, c) => n + c.entries.length, 0);
    const bulk = await p.evaluate(chapters => {
      const S = SugarCube, bad = [];
      for (const c of chapters) for (const e of c.entries) for (const preset of ['fresh', 'favorable', 'adverse']) {
        S.setup.admin.jump(e.passage, preset);
        const error = document.querySelector('#passages .error-view, #passages .error');
        if (error) bad.push({ passage: e.passage, preset, error: error.textContent });
      }
      S.State.variables.v033 = 91; S.State.variables.v038 = 91; S.State.variables.extra = 'old';
      S.setup.admin.jump('h1', 'fresh');
      const fresh = { v001: S.State.variables.v001, v033: S.State.variables.v033, v038: S.State.variables.v038, extra: S.State.variables.extra };
      S.setup.admin.jump('h1', 'favorable');
      const favorable = { v001: S.State.variables.v001, v036: S.State.variables.v036, v037: S.State.variables.v037, v038: S.State.variables.v038 };
      S.setup.admin.jump('h1', 'adverse');
      const adverse = { v009: S.State.variables.v009, v015: S.State.variables.v015 };
      S.State.variables.v001 = 42; S.State.variables.v038 = 77;
      S.setup.admin.jump('h1', 'current');
      const current = { v001: S.State.variables.v001, v038: S.State.variables.v038 };
      let rejected = false;
      try { S.setup.admin.jump('Start', 'fresh'); } catch { rejected = true; }
      return { bad, fresh, favorable, adverse, current, rejected };
    }, chapters);
    assert.deepEqual(bulk.bad, []);
    assert.deepEqual(bulk.fresh, { v001: 0, v033: 0, v038: 0, extra: undefined });
    assert.deepEqual(bulk.favorable, { v001: 12, v036: 1, v037: 1, v038: 1 });
    // 第 1 话的原剧情主动把 v015 重置为 0；预设不覆盖剧情执行结果。
    assert.deepEqual(bulk.adverse, { v009: 7, v015: 0 });
    assert.deepEqual(bulk.current, { v001: 42, v038: 77 }); assert.equal(bulk.rejected, true);
    checked(`${entryCount} 个具体话入口 × 3 预设渲染无宏错误；四种状态策略及非法目标拦截通过`);
    const undo = await p.evaluate(async () => {
      const S = SugarCube;
      S.setup.admin.jump('h10', 'fresh');
      await S.setup.admin.undo();
      return { passage: S.State.passage, v001: S.State.variables.v001, v038: S.State.variables.v038 };
    });
    assert.deepEqual(undo, { passage: 'h1', v001: 42, v038: 77 });
    await p.evaluate(async () => { SugarCube.setup.admin.jump('h13', 'favorable'); await SugarCube.Save.browser.slot.save(0, '管理员试玩'); });
    await p.reload(); await p.waitForSelector('#passages .passage');
    const reloaded = await p.evaluate(() => ({ passage: SugarCube.State.passage, v001: SugarCube.State.variables.v001, v036: SugarCube.State.variables.v036 }));
    assert.deepEqual(reloaded, { passage: 'h13', v001: 12, v036: 1 });
    checked('跳章预设随历史节点保存，刷新后仍正确');
    await p.goto(base); await p.waitForSelector('.title-screen, #passages .passage');
    const normalAfter = await p.evaluate(async () => {
      const S = SugarCube;
      await S.Save.browser.slot.load(0);
      S.Engine.show();
      return { v001: S.State.variables.v001, v011: S.State.variables.v011, records: ['qf-ends', 'qf-dojo', 'qf-cp'].map(k => [k, localStorage.getItem(k)]), enabled: S.setup.admin.enabled };
    });
    assert.equal(normalAfter.v001, 47); assert.equal(normalAfter.v011, 5); assert.equal(normalAfter.enabled, false); assert.deepEqual(normalAfter.records, preserved);
    const denied = await p.evaluate(() => { try { SugarCube.setup.admin.jump('h1', 'fresh'); return false; } catch { return true; } });
    assert.equal(denied, true);
    checked('撤销跳转恢复变量和剧情；管理版保存后正式版存档及记录仍完整');
    await p.evaluate(() => SugarCube.Engine.play('音源署名'));
    assert.equal(await p.locator('.credit-item').count(), 75);
    checked('75 个音频的署名与许可可在游戏内查看');
    for (const file of ['index.html', 'admin.html']) {
      await p.goto(pathToFileURL(path.join(ROOT, file)).href);
      await p.waitForSelector('.title-screen');
      assert.equal(await p.evaluate(() => SugarCube.setup.admin.enabled), file === 'admin.html');
      if (file === 'admin.html') {
        await p.getByRole('button', { name: '选择章节', exact: true }).click();
        assert.equal(await p.locator('#admin-chapter option').count(), 9);
        await p.keyboard.press('Escape');
      }
    }
    checked('file:// 双击本地两版入口正常');
    for (const width of [320, 390, 768, 1280]) {
      await p.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
      await p.goto(base + 'admin.html'); await p.waitForSelector('.passage');
      await p.evaluate(() => SugarCube.setup.admin.open());
      await p.waitForSelector('#admin-chapter');
      await p.waitForFunction(() => getComputedStyle(document.querySelector('#ui-dialog')).opacity === '1');
      const layout = await p.evaluate(() => {
        const r = document.querySelector('#ui-dialog').getBoundingClientRect();
        const select = document.querySelector('#admin-chapter').getBoundingClientRect();
        return { viewport: innerWidth, document: document.documentElement.scrollWidth, left: r.left, right: r.right, selectRight: select.right };
      });
      assert.ok(layout.document <= width + 1 && layout.left >= -1 && layout.right <= width + 1 && layout.selectRight <= width, JSON.stringify(layout));
      if (output && [390, 1280].includes(width)) await p.screenshot({ path: path.join(output, `admin-${width}.jpg`), type: 'jpeg', quality: 76 });
      await p.keyboard.press('Escape');
      await p.locator('#admin-chapter').waitFor({ state: 'hidden' });
      assert.equal(await p.locator('#admin-chapter:visible').count(), 0);
    }
    checked('320/390/768/1280 宽度管理菜单无横向溢出，Escape 可关闭');
    const media = await context.newPage();
    media.on('pageerror', e => report.errors.push(e.message));
    const failed = [];
    media.on('response', r => { if (r.url().includes('/assets/') && r.status() >= 400) failed.push([r.url(), r.status()]); });
    await media.addInitScript(() => { window.testAudio = []; const A = window.Audio; window.Audio = function (...args) { const a = new A(...args); window.testAudio.push(a); return a; }; window.Audio.prototype = A.prototype; });
    await media.goto(base + 'admin.html'); await media.waitForSelector('.passage');
    await media.evaluate(() => SugarCube.setup.admin.open());
    await media.locator('#admin-chapter').selectOption('0');
    await media.getByRole('button', { name: '进入所选话', exact: true }).click();
    await media.locator('.face').first().scrollIntoViewIfNeeded();
    await media.waitForFunction(() => [...document.querySelectorAll('.face')].some(x => x.naturalWidth > 0));
    await media.waitForFunction(() => window.testAudio.some(a => decodeURI(a.src).endsWith('/海风.mp3') && a.currentTime > .3 && !a.paused));
    await media.evaluate(() => { SugarCube.setup.admin.jump('h10', 'fresh'); SugarCube.setup.admin.jump('h17', 'favorable'); SugarCube.setup.admin.jump('h13', 'favorable'); });
    await media.locator('.scene img').first().scrollIntoViewIfNeeded();
    await media.waitForFunction(() => [...document.querySelectorAll('.scene img')].every(x => x.naturalWidth > 0));
    await media.waitForFunction(() => window.testAudio.some(a => decodeURI(a.src).endsWith('/军歌唱片.mp3') && a.currentTime > .3 && !a.paused));
    const playing = await media.evaluate(() => window.testAudio.filter(a => !a.paused && !a.ended).map(a => decodeURI(a.src)));
    assert.equal(playing.length, 1); assert.ok(playing[0].endsWith('/军歌唱片.mp3')); assert.deepEqual(failed, []);
    checked('管理跳章后真实背景、头像和音乐加载；快速多次跳转不残留旧音乐或音效');
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8'));
    assert.ok(manifest.slots.length >= 321, '基础素材插槽不得减少'); assert.ok(manifest.slots.every(s => s.present));
    let bytes = 0;
    for (const s of manifest.slots) {
      const response = await fetch(base + encodeURI(s.file), { method: 'HEAD' });
      assert.equal(response.status, 200, s.file); bytes += fs.statSync(path.join(ROOT, s.file)).size;
    }
    report.assetBytes = bytes;
    checked(`${manifest.slots.length} 个中文素材路径 HTTP 200；素材合计 ${(bytes / 1048576).toFixed(1)} MiB`);
    assert.deepEqual(report.errors, []);
    report.chapterCount = chapters.length; report.entryCount = entryCount;
    console.log('管理员模式回归：全部通过；页面异常 0');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    if (output) fs.writeFileSync(path.join(output, 'admin-test-results.json'), JSON.stringify(report, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
