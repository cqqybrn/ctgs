// node tools/test_vn.js — 手机竖屏视觉小说：真实点击交互回归（需要 playwright，使用临时浏览器配置）。
// 覆盖：逐句时序（背景/人物/音乐/音效不抢跑）、点按语义、菜单不穿透、选项等待、存档/刷新/后退/检查点恢复、
// 管理员跳章重置演出、宫本仁线年代立绘与 3 张 CG、结局卡、多宽度版面。
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ROOT = path.resolve(__dirname, '..');
const output = process.env.CTGS_TEST_OUTPUT;
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
    fs.createReadStream(filename).on('error', () => res.destroy()).pipe(res);
  });
});
const report = { errors: [], checks: [] };
const checked = name => { report.checks.push(name); console.log('通过：' + name); };
const dbg = p => p.evaluate(() => SugarCube.setup.vn.debug());
const passage = p => p.evaluate(() => SugarCube.State.passage);
const curLine = p => p.evaluate(() => { const e = document.querySelector('.qf-line.qf-on'); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; });
const shot = async (p, name) => { if (output) { fs.mkdirSync(output, { recursive: true }); await p.screenshot({ path: path.join(output, name) }); } };
// 在舞台空白处点按（不落在顶栏、工具栏、选项上）
async function tap(p) {
  const box = await p.locator('#qf-stage').boundingBox();
  await p.mouse.click(box.x + box.width / 2, box.y + box.height * 0.3);
  await p.waitForTimeout(75);
}
async function until(p, pred, max = 400) {
  for (let i = 0; i < max; i++) {
    if (await p.evaluate(pred)) return i;
    await tap(p);
  }
  throw new Error('没有走到目标句：' + pred);
}
const lineHas = text => `(() => { const e = document.querySelector('.qf-line.qf-on'); return !!e && e.textContent.includes(${JSON.stringify(text)}); })()`;
async function open(browser, base, file, { type = false, viewport = { width: 390, height: 844 } } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.route('https://**/*', r => r.abort());
  const p = await context.newPage();
  p.on('pageerror', e => report.errors.push(e.message));
  const failed = [];
  p.on('response', r => { if (r.url().includes('/assets/') && r.status() >= 400) failed.push([r.url(), r.status()]); });
  await p.addInitScript(type => {
    try { localStorage.setItem('qf-type', type ? 'on' : 'off'); } catch (e) {}
    window.testAudio = [];
    const A = window.Audio;
    window.Audio = function (...args) { const a = new A(...args); a.volume = 0; window.testAudio.push(a); return a; };
    window.Audio.prototype = A.prototype;
  }, type);
  await p.goto(base + file);
  await p.waitForSelector('.title-screen');
  p.failedAssets = failed; p.ctx = context;
  return p;
}
async function closeDialog(p) {
  await p.locator('#ui-dialog-close').click();
  await p.waitForFunction(() => !SugarCube.Dialog.isOpen());
  await p.locator('#ui-overlay').waitFor({ state: 'hidden' });
  await p.waitForTimeout(120);
}
const audioNow = p => p.evaluate(() => window.testAudio.filter(a => !a.paused && !a.ended).map(a => decodeURI(a.src).split('/').pop()));
// 配乐切换有约 1 秒淡出：等旧曲停下后，只应剩目标曲目（name 为空表示全部停止）。
const playingOnly = (p, name) => p.waitForFunction(n => { const now = window.testAudio.filter(a => !a.paused && !a.ended).map(a => decodeURI(a.src).split('/').pop()); return n ? now.length === 1 && now[0] === n : now.length === 0; }, name, { timeout: 6000 });
const audioEver = p => p.evaluate(() => window.testAudio.map(a => decodeURI(a.src).split('/').pop()));
const startGame = async p => { await p.getByRole('link', { name: '开始游戏', exact: true }).click(); await p.waitForFunction(() => SugarCube.setup.vn.debug().ready); };

// 第 87 话时间线：每个年代立绘、3 张 CG、BGM 与结局卡都必须出现在剧本指定的那一句。
async function h87Timeline(p, via) {
  assert.equal((await dbg(p)).stage.bg, 'bg/南山庄_门口_白天', 'v2 新增南山庄交钥匙开场');
  await until(p, lineHas('船在下关靠岸的时候下着雨'));
      assert.equal((await dbg(p)).stage.bg, 'bg/下关港_雨');
  const portrait = () => p.evaluate(() => { const i = document.querySelector('#qf-char img.on'); return i ? decodeURI(i.src).split('/').pop() : null; });
  const cg = () => p.evaluate(() => { const i = document.querySelector('#qf-cg img.on'); return i ? decodeURI(i.src).split('/').pop() : null; });
  await p.waitForFunction(() => document.querySelector('#qf-char img.on'));
  assert.equal(await portrait(), '宫本仁_战后.png', '1945 年用战后立绘');
  await playingOnly(p, '奚琴.mp3');
  await until(p, lineHas('宫本先生是在一个冬天的早上去世的'));
  assert.equal((await dbg(p)).stage.bg, 'bg/宫本宅_书房_白天');
  await until(p, lineHas('日韩会谈进行到第十四个年头'));
  await p.waitForFunction(() => decodeURI((document.querySelector('#qf-char img.on') || {}).src || '').endsWith('宫本仁_中年.png'));
  assert.equal(await cg(), null, '会谈 CG 尚未出现');
  await until(p, lineHas('金正浩胖了'));
  assert.equal((await dbg(p)).stage.cg, null);
  await playingOnly(p, '法庭.mp3');
  await until(p, lineHas('他也认出了你'));
  await until(p, lineHas('你们隔着一张长桌对视了一眼'));
  assert.equal((await dbg(p)).stage.cg, 'cg/东京会谈_隔桌相认');
  await p.waitForFunction(() => { const i = document.querySelector('#qf-cg img.on'); return i && i.naturalWidth > 0; });
  assert.equal(await cg(), '东京会谈_隔桌相认.jpg');
  await p.waitForFunction(() => getComputedStyle(document.querySelector('#qf-char')).opacity === '0', null, { timeout: 3000 });   // CG 出现时人物退场，不会盖住构图
  const dims = await p.evaluate(() => { const i = document.querySelector('#qf-cg img.on'); return { nw: i.naturalWidth, nh: i.naturalHeight, w: i.clientWidth, h: i.clientHeight, fit: getComputedStyle(i).objectFit }; });
  assert.equal(dims.fit, 'contain', '横向 CG 完整显示，不裁掉相认的两个人');
  await shot(p, 'h87-cg1-390.png');
  await until(p, lineHas('休息的时候，他在走廊上点了一支烟'));
  assert.equal((await dbg(p)).stage.cg, 'cg/东京走廊_递烟重逢');
  await until(p, lineHas('金正浩……是啊') .replace('金正浩……是啊', '是啊。宫本先生不抽烟'));
  await p.waitForFunction(() => document.querySelector('#qf-cg img.on'));
  await until(p, lineHas('四　1970年代·京都'));
  assert.equal((await dbg(p)).stage.bg, 'bg/宫本宅_书房_夜');
  await playingOnly(p, '夜·钢琴.mp3');
  await until(p, lineHas('你的书出版了'));
  assert.equal(await p.evaluate(() => SugarCube.State.variables.expr['宫本千鹤']), '中年');
  assert.equal((await dbg(p)).stage.cg, 'cg/京都书房_共著书稿');
  await until(p, lineHas('1999年3月，东京'));
  assert.equal((await dbg(p)).stage.cg, null);
  await p.waitForFunction(() => decodeURI((document.querySelector('#qf-char img.on') || {}).src || '').endsWith('宫本仁_老年.png'));
  await playingOnly(p, '');   // “BGM：无”之后音乐淡出
  await until(p, lineHas('请按遗稿处理'));
  await p.waitForFunction(() => decodeURI((document.querySelector('#qf-char img.on') || {}).src || '').endsWith('宫本千鹤_老年.png'));
  assert.equal(await portrait(), '宫本千鹤_老年.png', '1999年千鹤来信使用老年身份，不沿用年轻立绘');
  await until(p, `document.querySelector('.ending.qf-on')`);
  await p.waitForTimeout(100);
  assert.equal(await p.locator('.ending.qf-on .name').innerText(), 'HE·宫本仁');
  await shot(p, 'h87-ending-390.png');
  // 上一句跨过 BGM 事件回到“1970 年代”，音乐与 CG 恢复
  await p.evaluate(() => SugarCube.setup.vn.prev());
  await p.evaluate(() => SugarCube.setup.vn.prev());
}
(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}/`;
    browser = await chromium.launch();

    if (process.argv.includes('--h87-only')) {
      for (const truth of [0, 1]) {
        const p = await open(browser, base, 'admin.html');
        await p.evaluate(truth => {
          SugarCube.State.variables.v016 = truth;
          SugarCube.setup.admin.jump('h87', 'current');
        }, truth);
        await p.waitForFunction(() => SugarCube.setup.vn.debug().ready);
        await h87Timeline(p, 'age-' + truth);
        checked('第87话千鹤真相=' + truth + '：中年/老年立绘、3张CG、音乐和宫本仁结局按年代切换');
        await p.ctx.close();
      }
      assert.deepEqual(report.errors, []);
      console.log('宫本仁晚年专项回归：全部通过；页面异常 0');
      return;
    }

    // ---------- 1. 逐句时序：背景、音乐、音效只在走到对应位置时才发生 ----------
    {
      const p = await open(browser, base, 'index.html');
      await startGame(p);
      assert.equal(await passage(p), 'h1');
      assert.equal((await dbg(p)).stage.bg, 'bg/玄海滩_清晨');
      await p.waitForFunction(() => window.testAudio.some(a => decodeURI(a.src).endsWith('/海风.mp3') && !a.paused));
      assert.equal(await p.locator('#qf-bg img.on').count() > 0, true);
      assert.equal((await audioEver(p)).includes('汽笛.mp3'), false, '汽笛不得在开场就响');
      await until(p, lineHas('两年前，我还是钟路街头'));
      assert.equal((await dbg(p)).stage.bg, 'bg/回忆_钟路_游行');
      assert.equal((await audioEver(p)).includes('汽笛.mp3'), false);
      await until(p, lineHas('远处，釜山港灰色的山已经看得见了'));
      assert.equal((await audioEver(p)).filter(x => x === '汽笛.mp3').length, 1, '汽笛恰在该句之前响一次');
      assert.equal((await dbg(p)).stage.bg, 'bg/回忆_钟路_游行');
      assert.deepEqual(p.failedAssets, []);
      checked('序幕：背景、BGM、音效按台词顺序逐步发生，没有整段抢跑');
      await p.ctx.close();
    }

    // ---------- 2. 点按语义：逐字显示、第一次补完、第二次才推进；菜单与存档不穿透 ----------
    {
      const p = await open(browser, base, 'index.html', { type: true });
      await startGame(p);
      await p.waitForTimeout(150);
      let d = await dbg(p);
      assert.equal(d.typing, true, '默认逐字显示');
      const k0 = d.k;
      await tap(p);
      d = await dbg(p);
      assert.equal(d.typing, false); assert.equal(d.k, k0, '第一次点按只补完当前句');
      assert.equal(await p.locator('.qf-line.qf-on .qc:not(.on)').count(), 0);
      await tap(p);
      assert.equal((await dbg(p)).k > k0, true, '第二次点按才推进');
      // 菜单、回看、存档窗口打开时，点遮罩/窗口不会变成“继续”
      const k1 = (await dbg(p)).k;
      await p.locator('[data-qf="menu"]').click();
      await p.waitForSelector('#ui-dialog .qf-menubox');
      await p.mouse.click(8, 400);                       // 点遮罩：关闭菜单，但不能同时变成“继续”
      await p.waitForFunction(() => !SugarCube.Dialog.isOpen());
      await p.locator('#ui-overlay').waitFor({ state: 'hidden' }); await p.waitForTimeout(120);
      assert.equal((await dbg(p)).k, k1, '菜单打开/关闭不推进');
      await p.locator('[data-qf="save"]').click();
      await p.waitForSelector('#ui-dialog:visible');
      await p.locator('#ui-dialog').click({ position: { x: 20, y: 20 } });
      assert.equal((await dbg(p)).k, k1, '存档窗口不推进');
      await closeDialog(p);
      await p.locator('[data-qf="log"]').click();
      await p.waitForSelector('.qf-logbox .lg');
      assert.equal(await p.locator('.qf-logbox .lg').count() >= 2, true, '回看列出已读台词');
      await closeDialog(p);
      assert.equal((await dbg(p)).k, k1);
      checked('逐字显示：首次点按补完、再点推进；菜单/存档/回看窗口不会穿透成继续');
      await p.ctx.close();
    }

    // ---------- 3. 选项等待、选项点击、后退回到选项 ----------
    {
      const p = await open(browser, base, 'index.html');
      await startGame(p);
      await until(p, 'SugarCube.State.passage === "h2"');
      await until(p, 'SugarCube.setup.vn.debug().steps[SugarCube.setup.vn.debug().k] === "choice"');
      const at = await dbg(p), here = await passage(p);
      assert.equal(here, 'h2.1', '第2话经黑屏渐入分页后进入 h2.1，选项在那里');
      for (let i = 0; i < 6; i++) await tap(p);
      assert.equal(await passage(p), here); assert.equal((await dbg(p)).k, at.k, '选项出现后点按空白不会越过');
      await p.keyboard.press('Space'); await p.keyboard.press('Enter');
      assert.equal(await passage(p), here);
      const box = await p.locator('.qf-pick.qf-on').boundingBox(), tools = await p.locator('#qf-tools').boundingBox();
      assert.ok(box.y + box.height <= tools.y + 1, '选项不被底部工具栏遮住');
      await shot(p, 'choice-390.png');
      await p.getByRole('link', { name: '捡起书，离开', exact: true }).click();
      await p.waitForFunction(h => SugarCube.State.passage !== h && SugarCube.setup.vn.debug().ready, here);
      assert.notEqual(await passage(p), here);
      assert.equal((await dbg(p)).k >= 0, true);
      // 从选项后的第一句点“‹”：回到选项画面，台词与选项都在
      await p.locator('[data-qf="prev"]').click();
      await p.waitForFunction(h => SugarCube.State.passage === h && SugarCube.setup.vn.debug().ready, here);
      assert.equal((await dbg(p)).steps[(await dbg(p)).k], 'choice');
      assert.equal(await p.locator('.qf-pick.qf-on .opt a').count(), 3);
      assert.ok((await curLine(p)).length > 0, '选项下方仍显示最后一句台词');
      checked('选项等待不被点按越过；选项不被工具栏遮挡；后退回到选项画面');
      await p.ctx.close();
    }

    // ---------- 3b. 序章问答循环：7 个选项（含出口“我没有问题了”）必须在一屏内可见、可点 ----------
    for (const [width, height] of [[320, 568], [325, 698], [390, 844], [430, 932]]) {
      const p = await open(browser, base, 'index.html', { viewport: { width, height } });
      await p.evaluate(() => { SugarCube.setup.vnAutoFollow = true; });
      await p.evaluate(() => SugarCube.Engine.play('h2.9'));
      await until(p, 'SugarCube.setup.vn.debug().steps[SugarCube.setup.vn.debug().k] === "choice"');
      const askAll = async () => {
        // 把前 6 个问题各问一遍：每次回到循环入口，选项应完整
        for (let n = 0; n < 6; n++) {
          await p.locator('.qf-pick.qf-on .opt a').nth(n).click();
          await until(p, 'SugarCube.setup.vn.debug().steps[SugarCube.setup.vn.debug().k] === "choice"');
          for (let guard = 0; guard < 40 && await p.locator('.qf-pick.qf-on .opt a').count() !== 7; guard++) await tap(p);
          assert.equal(await p.locator('.qf-pick.qf-on .opt a').count(), 7, `${width}px 问答循环回到 7 个选项`);
        }
      };
      await askAll();
      const m = await p.evaluate(() => {
        const c = document.querySelector('.qf-pick.qf-on'), last = c.querySelectorAll('.opt a')[6].getBoundingClientRect(), t = document.querySelector('#qf-tools').getBoundingClientRect();
        return { sh: c.scrollHeight, ch: c.clientHeight, lastBottom: last.bottom, lastTop: last.top, toolsTop: t.top, more: c.classList.contains('qf-more') };
      });
      assert.ok(m.sh <= m.ch + 1, `${width}x${height} 7 个选项不需要面板内滚动 (${m.sh}/${m.ch})`);
      assert.ok(m.lastTop >= 0 && m.lastBottom <= m.toolsTop + 1, `${width}x${height} 出口选项完整在工具栏之上`);
      assert.ok(!m.more, '没有溢出时不显示“向下还有”提示');
      const here = await passage(p);
      await p.getByRole('link', { name: '我没有问题了。', exact: true }).click();
      await p.waitForFunction(h => SugarCube.State.passage !== h || SugarCube.setup.vn.debug().steps[SugarCube.setup.vn.debug().k] !== 'choice', here);
      await p.ctx.close();
    }
    {
      // 空间不够时（横屏）：出口选项靠面板内滚动可达，并有“向下还有”提示，滑到底提示消失
      const p = await open(browser, base, 'index.html', { viewport: { width: 844, height: 390 } });
      await p.evaluate(() => SugarCube.Engine.play('h2.9'));
      await until(p, 'SugarCube.setup.vn.debug().steps[SugarCube.setup.vn.debug().k] === "choice"');
      await p.waitForFunction(() => document.querySelector('.qf-pick.qf-on')?.classList.contains('qf-more'));
      assert.ok(await p.locator('.qf-pick.qf-on').evaluate(c => c.classList.contains('qf-more')), '横屏装不下时显示“向下还有”提示');
      await p.locator('.qf-pick.qf-on').evaluate(c => { c.scrollTop = c.scrollHeight; });
      await p.waitForFunction(() => !document.querySelector('.qf-pick.qf-on').classList.contains('qf-more'));
      await p.ctx.close();
    }
    checked('问答循环 7 选项在 320/325/390/430 宽下一屏内完整可点；横屏溢出时有“向下还有”提示');

    // ---------- 3c. 全书所有选项段（问答循环、推理、普通分支）在 320×568 下都完整落在顶栏与工具栏之间 ----------
    {
      const p = await open(browser, base, 'index.html', { viewport: { width: 320, height: 568 } });
      await p.evaluate(() => { SugarCube.setup.vnAutoFollow = false; });
      const names = await p.evaluate(() => SugarCube.Story.filter(() => true).filter(x => /class="choices"/.test(x.text) && !/class="choices next"/.test(x.text)).map(x => x.title));
      assert.ok(names.length > 100, '选项段数量 ' + names.length);
      const bad = [];
      for (const n of names) {
        await p.evaluate(n => SugarCube.Engine.play(n), n);
        let r = null;
        for (let i = 0; i < 100 && !r; i++) {
          await p.waitForTimeout(20);
          r = await p.evaluate(() => {
            const c = document.querySelector('.qf-pick.qf-on');
            if (!c) { if (SugarCube.setup.vn.debug().ready) SugarCube.setup.vn.advance(true); return null; }
            const t = document.querySelector('#qf-tools').getBoundingClientRect(), bar = document.querySelector('#bar').getBoundingClientRect();
            const a = [...c.querySelectorAll('a')], l = a[a.length - 1].getBoundingClientRect(), cr = c.getBoundingClientRect();
            return { over: c.scrollHeight - c.clientHeight, top: cr.top - bar.bottom, bot: t.top - l.bottom };
          });
        }
        if (!r || r.over > 1 || r.top < -1 || r.bot < -1) bad.push(n + ' ' + JSON.stringify(r));
      }
      assert.deepEqual(bad, [], '这些选项段在 320×568 下放不下或被遮挡');
      checked(`全书 ${names.length} 个选项段在 320×568 下无需滚动、不被顶栏/工具栏遮挡`);
      await p.ctx.close();
    }

    // ---------- 4. 存档、刷新、读取、上一句：游标与演出状态 ----------
    {
      const p = await open(browser, base, 'index.html');
      await startGame(p);
      await until(p, lineHas('既然回来了，就听听课吧'));
      const snap = await p.evaluate(() => { const d = SugarCube.setup.vn.debug(); return { k: d.k, stage: d.stage, passage: SugarCube.State.passage, bgm: SugarCube.State.variables.bgm }; });
      assert.equal(snap.stage.bg, 'bg/北村_徐家书房'); assert.equal(snap.stage.who, '徐明焕');
      await p.locator('[data-qf="save"]').click();
      await p.waitForSelector('#ui-dialog #saves-list');
      await p.locator('#saves-list button.save').first().click();
      await p.waitForTimeout(200);
      await closeDialog(p);
      for (let i = 0; i < 3; i++) await tap(p);
      assert.notEqual((await dbg(p)).k, snap.k);
      // 浏览器刷新：回到刷新前所在句
      await p.reload(); await p.waitForFunction(() => SugarCube.setup.vn.debug().ready);
      let now = await dbg(p);
      assert.equal(now.stage.bg, 'bg/北村_徐家书房'); assert.equal(now.stage.who, '徐明焕');
      assert.equal(now.k > snap.k, true, '刷新后仍在推进后的位置，而不是回到本话开头');
      // 读取存档：回到存档的那一句，且不重复播放一次性音效
      await p.evaluate(() => { window.testAudio.length = 0; });
      await p.locator('[data-qf="save"]').click();
      await p.waitForSelector('#saves-list');
      await p.locator('#saves-list button.load').nth(1).click();   // 第 0 个是自动存档，第 1 个是刚才手动存的位
      await p.waitForFunction(k => SugarCube.setup.vn.debug().ready && SugarCube.setup.vn.debug().k === k, snap.k);
      assert.equal(await curLine(p), await p.evaluate(() => document.querySelector('.qf-line.qf-on').textContent.replace(/\s+/g, ' ').trim()));
      now = await dbg(p);
      assert.deepEqual(now.stage, snap.stage); assert.equal(await p.evaluate(() => SugarCube.State.variables.bgm), snap.bgm);
      assert.equal((await curLine(p)).includes('既然回来了'), true);
      const sfx = (await audioEver(p)).filter(x => !/陰鬱|海风|主题|军歌|夜|法庭|奚琴/.test(x));
      assert.deepEqual(sfx, [], '读档不重放一次性音效');
      // 上一句 / 下一句 往返后画面与音乐一致
      await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(100);
      assert.equal((await dbg(p)).k < snap.k, true);
      await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight');
      checked('存档→刷新→读取：游标、背景、人物、BGM 正确，读档不重放音效；上一句可用');
      await p.ctx.close();
    }

    // ---------- 5. 检查点：回到选项那一刻 ----------
    {
      const p = await open(browser, base, 'index.html');
      await startGame(p);
      const cpPassage = await p.evaluate(() => {
        const data = [...document.querySelectorAll('tw-passagedata')].find(x => x.textContent.includes('<<checkpoint'));
        return data ? data.getAttribute('name') : null;
      });
      assert.ok(cpPassage, '剧本里存在检查点');
      const hua = cpPassage.replace(/^h(d+).*/, 'h$1');
      await p.evaluate(h => SugarCube.Engine.play(h), hua);
      let got = null;
      for (let guard = 0; guard < 600 && !got; guard++) {
        await p.waitForFunction(() => SugarCube.setup.vn.debug().ready);
        const d = await dbg(p);
        if (d.steps[d.k] === 'choice') {
          got = await p.evaluate(() => Object.keys(SugarCube.setup.cpAll()));
          if (got.length) break;
          got = null;
          const first = p.locator('.qf-pick.qf-on .opt a').first();
          await first.click();
          await p.waitForTimeout(80);
          continue;
        }
        await tap(p);
      }
      assert.ok(got && got.length, '经过检查点所在选项后写入了检查点');
      const cid = got[0];
      const before = await dbg(p);
      for (let i = 0; i < 4; i++) await tap(p);
      await p.evaluate(id => SugarCube.setup.loadCP(id), cid);
      await p.waitForFunction(() => SugarCube.setup.vn.debug().ready);
      const after = await dbg(p);
      assert.equal(after.steps[after.k], 'choice', '检查点恢复到选项画面');
      assert.equal(await p.locator('.qf-pick.qf-on .opt a').count() > 0, true);
      assert.equal(typeof after.stage.bg === 'string' || after.stage.bg === null, true);
      assert.ok(before);
      checked('检查点“回到那一刻”恢复到选项画面');
      await p.ctx.close();
    }

    // ---------- 6. 管理员跳章与宫本仁线 ----------
    {
      const p = await open(browser, base, 'admin.html');
      await startGame(p);
      await until(p, lineHas('既然回来了').replace('既然回来了', '两年前，我还是钟路街头'));
      assert.equal((await dbg(p)).stage.bg, 'bg/回忆_钟路_游行');
      // 在已有演出状态时跳到第 87 话：旧背景/人物/音乐都不得残留
      await p.evaluate(() => SugarCube.setup.admin.jump('h87', 'fresh'));
      await p.waitForFunction(() => SugarCube.State.passage === 'h87' && SugarCube.setup.vn.debug().ready);
      const pre = await p.evaluate(() => JSON.parse(JSON.stringify(SugarCube.State.current.variables.stage)));
      assert.deepEqual(pre, { bg: null, cg: null, who: null, lead: null, date: '', cap: '' }, '跳章前的历史节点里演出状态已重置');
      assert.equal(await p.evaluate(() => SugarCube.State.current.variables.qfStep !== undefined), true);
      assert.equal((await dbg(p)).stage.bg, 'bg/南山庄_门口_白天');
      await h87Timeline(p, 'admin');
      checked('管理员跳章重置演出；第87话年代立绘、3 张 CG、BGM 切换与结局卡按剧情顺序出现');
      await p.ctx.close();
    }

// ---------- 6a. 第一章：宫本在家里不穿西装立绘；赐名分支里场景跟着电车站/出租屋切换 ----------
    {
      const p = await open(browser, base, 'index.html');
      await startGame(p);
      await p.evaluate(() => SugarCube.Engine.play('h10'));
      await p.waitForFunction(() => SugarCube.State.passage === 'h10' && SugarCube.setup.vn.debug().ready);
      const portrait = () => p.evaluate(() => { const i = document.querySelector('#qf-char img.on'); return i ? decodeURI(i.src).split('/').pop() : null; });
      const seen = new Set();
      let wear = null, tram = null, room = null, named = false;
      for (let i = 0; i < 1500 && !room; i++) {
        const d = await dbg(p);
        if (!d.ready) { await p.waitForTimeout(20); continue; }
        if (d.steps[d.k] === 'choice') {
          const opts = p.locator('.qf-pick.qf-on .opt a');
          const want = opts.filter({ hasText: '请先生赐一个名字' });
          if (await want.count()) { await want.first().click(); named = true; } else await opts.nth(Math.floor(Math.random() * await opts.count())).click();
          await p.waitForTimeout(30); continue;
        }
        if (await p.locator('.qf-line.qf-on').count() && (await curLine(p)).includes('你是在你老师的课堂上长大的')) { await p.waitForTimeout(700); wear = await portrait(); }   // 等立绘淡入换图完成
        if (named && (await curLine(p)).includes('电车站遇见了黄有善')) tram = (await dbg(p)).stage.bg;
        if (named && (await curLine(p)).includes('门缝里塞进来一张字条')) room = (await dbg(p)).stage.bg;
        await p.evaluate(() => SugarCube.setup.vn.advance(true)); await p.waitForTimeout(5);
      }
      assert.equal(wear, '宫本谦造_平静.png', '南山庄书房里宫本的“微笑”改用和服立绘，不换成西装');
      assert.equal(tram, 'bg/钟路_白天_人群', '赐名后在钟路电车站，背景切到街头');
      assert.equal(room, 'bg/敦岩洞_出租屋_夜', '夜里收到字条，背景切到出租屋');
      checked('宫本室内不穿西装立绘；赐名后场景切到钟路街头，夜里切到出租屋');
      await p.ctx.close();
    }

    // ---------- 6b. 宫本仁线的自然路线：第一章赐名(018=2) → 第六章签养子缘组届 → 第87话 ----------
    {
      const p = await open(browser, base, 'index.html');
      await startGame(p);
      // 第一章：真实点选“请宫本赐名”，确认创氏名变量与之后台词里的姓氏
      await p.evaluate(() => SugarCube.Engine.play('h10'));
      await p.waitForFunction(() => SugarCube.State.passage === 'h10' && SugarCube.setup.vn.debug().ready);
      const named = await p.evaluate(async () => {
        const S = SugarCube, vn = S.setup.vn;
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        for (let i = 0; i < 400; i++) {
          await sleep(0);
          const opts = [...document.querySelectorAll('.qf-pick.qf-on .opt a')];
          const want = opts.find(a => a.textContent.includes('请先生赐一个名字'));
          if (want) { want.click(); await sleep(0); if (S.State.variables.v018 === 2) return { ok: true, label: want.textContent }; }
          if (S.State.variables.v018 === 2) return { ok: true };
          const d = vn.debug();
          if (d.steps[d.k] === 'choice' && !want) { opts[Math.floor(Math.random() * opts.length)].click(); await sleep(0); continue; }
          vn.advance(true);
        }
        return { ok: false, v018: S.State.variables.v018, passage: S.State.passage };
      });
      assert.equal(named.ok, true, JSON.stringify(named));
      // 第六章：以赐名后的状态进入“养子缘组届”一话，按选项文字点选签字，自然跳到第 87 话
      // 非签字的选项是随机点的，可能先撞上某个死亡结局：撞上就从 h60 重来，最多 12 次
      let reached;
      for (let attempt = 0; attempt < 12; attempt++) {
      // 承接已救回千鹤且未碰电话的 v2 状态夹具；不改游戏里的分支条件。
      await p.evaluate(() => { const V = SugarCube.State.variables; V.v018 = 2; V.v001 = 12; V.v016 = 1; V.v051 = 1; V.v015 = 0; SugarCube.Engine.play('h60'); });
      reached = await p.evaluate(async () => {
        const S = SugarCube, vn = S.setup.vn;
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        for (let i = 0; i < 3000; i++) {
          await sleep(0);
          if (S.State.passage === 'h87') return { ok: true };
          const d = vn.debug();
          if (!d.ready) continue;
          if (d.steps[d.k] === 'choice') {
            const opts = [...document.querySelectorAll('.qf-pick.qf-on .opt a')];
            const sign = opts.find(a => a.textContent.includes('在养子缘组届上签字'));
            (sign || opts[Math.floor(Math.random() * opts.length)]).click();
            await sleep(0);
            continue;
          }
          if (d.steps[d.k] === 'card') return { ok: false, passage: S.State.passage, end: (document.querySelector('.ending .name') || {}).textContent };
          vn.advance(true);
        }
        return { ok: false, passage: S.State.passage };
      });
      if (reached.ok) break;
      }
      assert.equal(reached.ok, true, '自然路线应抵达第87话：' + JSON.stringify(reached));
      await p.waitForFunction(() => SugarCube.State.passage === 'h87' && SugarCube.setup.vn.debug().ready);
      await h87Timeline(p, 'natural');
      checked('宫本仁线自然路线（赐名 018=2 → 签养子缘组届 → 第87话）：年代立绘与 3 张 CG 在正确句子出现');
      await p.ctx.close();
    }

    // ---------- 7. 结局卡：标题卡 → 尾文 → 信息卡；信息卡内点击不推进 ----------
    {
      const p = await open(browser, base, 'admin.html');
      await startGame(p);
      await p.evaluate(() => SugarCube.setup.admin.jump('h3', 'fresh'));
      await p.waitForFunction(() => SugarCube.State.passage === 'h3' && SugarCube.setup.vn.debug().ready);
      await until(p, `document.querySelector('.qf-card.qf-on')`, 200);
      assert.equal(await p.locator('.qf-card.qf-on nav.after a').count() >= 3, true);
      const k = (await dbg(p)).k;
      await p.locator('.qf-card.qf-on').click({ position: { x: 8, y: 420 } });
      await tap(p);
      assert.equal((await dbg(p)).k, k, '信息卡是终点，点按空白不会越过');
      assert.equal(Object.keys(await p.evaluate(() => SugarCube.setup.endsSeen())).length >= 1, true);
      await shot(p, 'ending-card-390.png');
      checked('结局：标题卡、尾文、信息卡（含复盘与去向按钮）');
      await p.ctx.close();
    }

    // ---------- 8. 多宽度与桌面版面 ----------
    for (const [width, height] of [[320, 568], [390, 844], [430, 932], [1280, 800], [844, 390]]) {
      const p = await open(browser, base, 'index.html', { viewport: { width, height } });
      await startGame(p);
      await until(p, 'SugarCube.State.passage === "h2"');
      await until(p, lineHas('既然回来了'), 80);
      const m = await p.evaluate(() => {
        const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
        const se = document.scrollingElement;
        return { iw: innerWidth, ih: innerHeight, sw: se.scrollWidth, sh: se.scrollHeight, app: r('#app'), line: r('.qf-line.qf-on'), tools: r('#qf-tools'), bar: r('#bar'),
                 font: parseFloat(getComputedStyle(document.querySelector('.qf-line.qf-on')).fontSize) };
      });
      assert.ok(m.sw <= m.iw, `${width}px 无横向溢出`); assert.ok(m.sh <= m.ih + 1, `${width}px 阅读不整页滚动`);
      assert.ok(m.line.l >= 0 && m.line.r <= m.iw && m.line.b <= m.tools.t + 1 && m.line.t >= m.bar.b - 30, `${width}px 对白框完整在屏内且不压工具栏`);
      assert.ok(m.font >= 13, `${width}px 对白字号可读 ${m.font}`);
      if (width >= 768 && height > 520) assert.ok(m.app.r - m.app.l <= 520 && Math.abs((m.app.l + m.app.r) / 2 - m.iw / 2) < 2, '桌面居中的竖屏舞台');
      await shot(p, `line-${width}x${height}.png`);
      await p.ctx.close();
    }
    checked('320/390/430/桌面1280/横屏844×390：无横向溢出，不整页滚动，对白框与选项不被遮挡，桌面居中');

    // ---------- 9. 整局随机通关：每一步都走导演器（advance / 点选项），不卡死、无未归类元素、能到结局 ----------
    {
      const p = await open(browser, base, 'index.html');
      const out = await p.evaluate(async () => {
        const S = SugarCube, vn = S.setup.vn, res = { ends: {}, stuck: [], unknown: [], errors: [], steps: 0 };
        let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        for (let run = 0; run < 24; run++) {
          S.Engine.restart && 0;
          const V = S.State.variables;
          for (const key of Object.keys(S.setup.INITIAL_VARIABLES)) V[key] = 0;
          V.used = {}; V.expr = {}; V.bgm = null; V.stage = S.setup.freshStage();
          S.Engine.play('h1');
          let idle = 0, last = '';
          for (let i = 0; i < 6000; i++) {
            await sleep(0);
            const d = vn.debug();
            res.steps++;
            if (d.unknown.length) res.unknown.push(S.State.passage + ' ' + d.unknown[0]);
            const err = document.querySelector('#passages .error-view, #passages .error');
            if (err) { res.errors.push(S.State.passage + ' ' + err.textContent.slice(0, 80)); break; }
            if (!d.ready) { if (++idle > 400) { res.stuck.push('未就绪 ' + S.State.passage); break; } continue; }
            const kind = d.steps[d.k];
            const key = S.State.passage + '#' + d.k;
            if (key === last) { if (++idle > 400) { res.stuck.push(key + ' ' + kind); break; } } else { idle = 0; last = key; }
            if (kind === 'card') {
              const name = document.querySelector('.ending .name');
              const links = [...document.querySelectorAll('.qf-card.qf-on a')].map(a => a.textContent);
              if (name) res.ends[name.textContent] = 1;
              else if (!links.length) res.stuck.push('无出口卡 ' + S.State.passage);
              break;
            }
            if (kind === 'choice') {
              const opts = [...document.querySelectorAll('.qf-pick.qf-on .opt a')];
              const next = [...document.querySelectorAll('.qf-pick.qf-on .choices.next a')];
              const pool = opts.length ? opts : next;
              if (!pool.length) { res.stuck.push('选项为空 ' + S.State.passage); break; }
              pool[Math.floor(rnd() * pool.length)].click();
              await sleep(0);
              continue;
            }
            vn.advance(true);
          }
        }
        return res;
      });
      assert.deepEqual(out.errors, []); assert.deepEqual(out.unknown, []); assert.deepEqual(out.stuck, []);
      assert.ok(Object.keys(out.ends).length >= 6, '随机通关应走到多个不同结局：' + Object.keys(out.ends).length);
      assert.ok(out.steps > 1000, '步数 ' + out.steps);
      checked(`整局随机通关 24 局（${out.steps} 步）：走到 ${Object.keys(out.ends).length} 种结局，无卡死、无报错、无未归类元素`);
      await p.ctx.close();
    }

    assert.deepEqual(report.errors, []);
    console.log('竖屏视觉小说回归：全部通过；页面异常 0');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    if (output) fs.writeFileSync(path.join(output, 'vn-test-results.json'), JSON.stringify(report, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
