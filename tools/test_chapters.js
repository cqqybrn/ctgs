// NODE_PATH=<playwright module directory> node tools/test_chapters.js
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const URL = pathToFileURL(path.resolve(__dirname, '../index.html')).href;
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route('https://**/*', r => r.abort()); // 外部字体不可用时仍应离线可玩。
    const p = await context.newPage();
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/assets/**', r => r.abort());
    await p.goto(URL); await p.waitForSelector('.title-screen');
    await p.getByRole('button', { name: '选择章节', exact: true }).click();
    const count = await p.evaluate(() => SugarCube.setup.CHAPTER_NAV.length);
    assert(count > 0);
    assert.equal(await p.locator('.chapter-choice:disabled').count(), count);
    await p.locator('#ui-dialog-close').click();
    await p.locator('.title-menu a[data-passage="h1"]').click();
    await p.waitForFunction(() => SugarCube.State.passage === 'h1');
    const first = await p.evaluate(() => ({
      records: SugarCube.setup.chapterSelect.records(),
      values: JSON.parse(JSON.stringify(SugarCube.State.variables)),
      chapter: SugarCube.Story.get('h1').tags.find(t => /^c\d+$/.test(t)).slice(1),
    }));
    assert.equal(first.records[first.chapter].passage, 'h1');
    assert(Object.keys(first.records[first.chapter].variables).length > 0);
    console.log('通过：标题入口、未到达锁定、正常开局自动记录真实状态');
    // 先实际点击推进，验证读者交互正常，再建立可重复的跨章夹具。
    const link = p.locator('#passages a.link-internal').filter({ hasNot: p.locator('nav.after') }).first();
    await link.click();
    assert.notEqual(await p.evaluate(() => SugarCube.State.passage), 'h1');
    assert.equal(await p.locator('#passages .error, #passages .error-view').count(), 0);
    console.log('通过：正常点击推进剧情，无宏错误');
    const fixture = await p.evaluate(() => {
      const s = SugarCube, v = s.State.variables;
      Object.assign(v, s.setup.INITIAL_VARIABLES, { v001: 7, v011: 3, v012: 2, v018: 2, used: { chosen: true }, expr: {}, bgm: null });
      const chapter = s.setup.CHAPTER_NAV.find(c => c.index !== Number(Object.keys(s.setup.chapterSelect.records())[0]));
      const target = chapter.entries[0].passage;
      const before = JSON.parse(JSON.stringify(v));
      s.Engine.play(target);
      return { index: chapter.index, target, before, after: JSON.parse(JSON.stringify(s.State.variables)) };
    });
    const record = await p.evaluate(i => SugarCube.setup.chapterSelect.records()[i], fixture.index);
    assert.deepEqual(record.variables, fixture.before);
    assert.equal(record.passage, fixture.target);
    await p.evaluate(() => { SugarCube.State.variables.v001 = 999; SugarCube.State.variables.used = { wrong: true }; SugarCube.Engine.play('h1'); });
    const undoExpected = await p.evaluate(() => JSON.parse(JSON.stringify(SugarCube.State.variables)));
    await p.getByRole('button', { name: '章节', exact: true }).click();
    await p.locator('[data-chapter="' + fixture.index + '"]').click();
    assert.equal(await p.evaluate(() => SugarCube.State.passage), fixture.target);
    assert.deepEqual(await p.evaluate(() => JSON.parse(JSON.stringify(SugarCube.State.variables))), fixture.after);
    console.log('通过：章节按钮恢复全部数值、分支与选项记录；本话效果不重复累加');
    await p.reload(); await p.waitForSelector('#passages .passage');
    assert.deepEqual(await p.evaluate(() => JSON.parse(JSON.stringify(SugarCube.State.variables))), fixture.after);
    const second = await context.newPage();
    await second.route('**/assets/**', r => r.abort());
    await second.goto(URL); await second.waitForSelector('.title-screen');
    assert.deepEqual(await second.evaluate(i => SugarCube.setup.chapterSelect.records()[i], fixture.index), record);
    await second.close();
    console.log('通过：刷新与重新打开页面保留真实章节状态');
    // 刷新后的撤销备份不跨页面保留，重新创建一次可撤销跳转。
    await p.evaluate(() => { SugarCube.Engine.play('h1'); });
    const beforeUndo = await p.evaluate(() => JSON.parse(JSON.stringify(SugarCube.State.variables)));
    await p.evaluate(i => SugarCube.setup.chapterSelect.jump(i), fixture.index);
    await p.evaluate(() => SugarCube.setup.chapterSelect.undo());
    assert.deepEqual(await p.evaluate(() => JSON.parse(JSON.stringify(SugarCube.State.variables))), beforeUndo);
    const locked = await p.evaluate(() => {
      const s = SugarCube; const c = s.setup.CHAPTER_NAV.find(c => !s.setup.chapterSelect.records()[c.index]);
      try { s.setup.chapterSelect.jump(c.index); return false; } catch (e) { return true; }
    });
    assert(locked);
    console.log('通过：撤销恢复原进度，未解锁目标被拦截');
    for (const width of [320, 390, 768, 1280]) {
      await p.setViewportSize({ width, height: 844 });
      await p.getByRole('button', { name: '章节', exact: true }).click();
      await p.waitForFunction(() => jQuery('#ui-dialog').is(':visible') && !jQuery('#ui-dialog').is(':animated') && document.querySelector('.chapter-choice'));
      assert(await p.evaluate(() => document.getElementById('ui-dialog-body').scrollWidth <= document.getElementById('ui-dialog-body').clientWidth + 1));
      if (process.env.CTGS_TEST_OUTPUT && width === 390) {
        fs.mkdirSync(process.env.CTGS_TEST_OUTPUT, { recursive: true });
        await p.screenshot({ path: path.join(process.env.CTGS_TEST_OUTPUT, 'chapter-menu.jpg'), type: 'jpeg', quality: 80 });
      }
      await p.locator('#ui-dialog-close').click();
      await p.locator('#ui-overlay').waitFor({ state: 'hidden' });
    }
    await p.evaluate(() => localStorage.setItem(SugarCube.setup.storageKey('chapter-visits-v2'), '{broken'));
    await p.reload(); await p.waitForSelector('#passages .passage');
    await p.getByRole('button', { name: '章节', exact: true }).click();
    assert.equal(await p.locator('.chapter-select').count(), 1);
    assert.deepEqual(errors, []);
    console.log('通过：四种屏宽无横向溢出；损坏存储可恢复；页面异常 0');
    const admin = await context.newPage();
    await admin.route('**/assets/**', r => r.abort());
    await admin.goto(URL.replace(/index\.html$/, 'admin.html')); await admin.waitForSelector('.title-screen');
    assert.deepEqual(await admin.evaluate(() => SugarCube.setup.chapterSelect.records()), {});
    console.log('通过：正式版章节记录与管理员版隔离');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
