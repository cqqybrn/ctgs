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
    await context.addInitScript(() => localStorage.setItem('qf-type', 'off'));
    const p = await context.newPage();
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/assets/**', r => r.abort());
    await p.goto(URL); await p.waitForSelector('.title-screen');
    await p.getByRole('button', { name: '选择章节', exact: true }).click();
    const count = await p.evaluate(() => SugarCube.setup.CHAPTER_NAV.length);
    assert(count > 0);
    assert.equal(await p.locator('.chapter-choice').count(), count);
    assert.equal(await p.locator('.chapter-choice:disabled').count(), 0);
    assert.equal(await p.locator('#jump-chapter option').count(), count);
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
    console.log('通过：标题入口、全部章节解锁、正常开局自动记录真实状态');
    // 先实际点击推进，验证读者交互正常，再建立可重复的跨章夹具。
    assert.equal(await p.locator('html').getAttribute('data-mode'), 'stage');
    for (let i = 0; i < 160 && await p.evaluate(() => SugarCube.State.passage === 'h1'); i++) {
      await p.mouse.click(195, 240);
      await p.waitForTimeout(15);
    }
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
    assert.deepEqual(await p.evaluate(() => Object.fromEntries(Object.entries(SugarCube.State.variables).filter(([k]) => /^v\d{3}$/.test(k) || k === 'used'))), Object.fromEntries(Object.entries(fixture.after).filter(([k]) => /^v\d{3}$/.test(k) || k === 'used')));
    console.log('通过：章节按钮恢复全部数值、分支与选项记录；本话效果不重复累加');
    await p.reload(); await p.waitForSelector('#passages .passage');
    assert.deepEqual(await p.evaluate(() => Object.fromEntries(Object.entries(SugarCube.State.variables).filter(([k]) => /^v\d{3}$/.test(k) || k === 'used'))), Object.fromEntries(Object.entries(fixture.after).filter(([k]) => /^v\d{3}$/.test(k) || k === 'used')));
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
      const s = SugarCube;
      try { s.setup.chapterSelect.jump(-999); return false; } catch (e) { return true; }
    });
    assert(locked);
    console.log('通过：撤销恢复原进度，非法章节目标被拦截');
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
    const test = await context.newPage();
    await test.route('**/assets/**', r => r.abort());
    test.on('pageerror', e => errors.push(e.message));
    await test.goto(URL); await test.waitForSelector('.title-screen');
    const bulk = await test.evaluate(() => {
      const S = SugarCube, problems = [];
      S.setup.vnAutoFollow = false;
      const beforeRecords = JSON.stringify(S.setup.chapterSelect.records());
      let captured = null, checked = 0;
      jQuery(document).on(':passagestart.chapterUnlockTest', ev => { captured = { passage: ev.detail.passage.name, values: JSON.parse(JSON.stringify(S.State.variables)) }; });
      for (const c of S.setup.CHAPTER_NAV) for (const e of c.entries) for (const preset of ['fresh', 'favorable', 'adverse', 'current']) {
        const previous = JSON.parse(JSON.stringify(S.State.variables));
        captured = null;
        S.setup.chapterSelect.testJump(e.passage, preset);
        checked++;
        const input = preset === 'current' ? previous : Object.assign({}, S.setup.INITIAL_VARIABLES, S.setup.admin.presets[preset].values);
        if (!captured || captured.passage !== e.passage) problems.push(e.passage + ': incorrect destination');
        else {
          for (const key of Object.keys(S.setup.INITIAL_VARIABLES)) if (captured.values[key] !== input[key]) problems.push(e.passage + ':' + preset + ':' + key);
          if (!captured.values.qfTestJump || captured.values.stage.bg !== null || captured.values.bgm !== null || Object.keys(captured.values.used).length) problems.push(e.passage + ': dirty stage');
        }
        if (document.querySelector('#passages .error, #passages .error-view')) problems.push(e.passage + ': macro error');
      }
      jQuery(document).off('.chapterUnlockTest');
      if (JSON.stringify(S.setup.chapterSelect.records()) !== beforeRecords) problems.push('test fixtures polluted authentic records');
      return { checked, problems };
    });
    assert.deepEqual(bulk.problems, []);
    console.log('通过：' + bulk.checked + ' 次具体话×预设跳转，入口数值精确匹配、演出重置、真实回访记录不被覆盖');
    await test.getByRole('button', { name: '章节', exact: true }).click();
    const target = await test.evaluate(() => SugarCube.setup.CHAPTER_NAV.find(c => c.entries.some(e => e.passage === 'h120')));
    await test.locator('#jump-chapter').selectOption(String(target.index));
    await test.locator('#jump-passage').selectOption('h120');
    await test.locator('#jump-preset').selectOption('favorable');
    await test.getByRole('button', { name: '跳到所选话', exact: true }).click();
    await test.waitForFunction(() => SugarCube.State.passage === 'h120');
    assert.equal(await test.locator('html').getAttribute('data-mode'), 'stage');
    assert.deepEqual(errors, []);
    console.log('通过：正式版通过下拉框真实点击直达第120话，仍是竖屏游戏舞台；页面异常 0');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
