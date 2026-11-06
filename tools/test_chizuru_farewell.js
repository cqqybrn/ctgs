// Reproduce h60 -> h65 -> HE Sakura through the actual stage and choices.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const browser = await chromium.launch();
  const results = [], errors = [];
  try {
    const cases = [1, 2].flatMap(name => [0, 1].map(rescued => ({ name, rescued, start: 60 })));
    cases.push({ name: 1, rescued: 1, start: 65 }, { name: 1, rescued: 1, start: 81 });
    for (const { name, rescued, start } of cases) {
      const context = await browser.newContext();
      await context.route('https://**/*', r => r.abort());
      await context.route('**/assets/**', r => r.abort());
      await context.addInitScript(() => localStorage.setItem('qf-type', 'off'));
      const p = await context.newPage();
      p.on('pageerror', e => errors.push(e.message));
      await p.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
      await p.waitForSelector('.title-screen');
      const result = await p.evaluate(async ({ name, rescued, start }) => {
        const S = SugarCube;
        Object.assign(S.State.variables, S.setup.INITIAL_VARIABLES, {
          v001: 12, v011: 8, v012: 6, v013: 9, v016: 0, v018: name, v019: 6,
          v022: 1, v034: 0, v050: 0, v051: rescued,
          used: {}, expr: {}, bgm: null, stage: S.setup.freshStage(),
        });
        S.setup.vn.reset(); S.Engine.play('h' + start);
        const seen = [], choices = [], keys = new Set();
        const priorities = ['和她一起上船', '压低帽檐，离开', '只留下这一页', '先读一读', '把名字还给先生', '还是叫江原吧', '用朝鲜语喊', '不知道。', '……'];
        let n = 0;
        for (; n < 6000; n++) {
          await new Promise(r => setTimeout(r, 0));
          const d = S.setup.vn.debug();
          if (!d.ready) continue;
          const line = document.querySelector('.qf-line.qf-on');
          const key = S.State.passage + ':' + d.k;
          if (line && !keys.has(key)) { keys.add(key); seen.push(line.textContent.replace(/\s+/g, ' ').trim()); }
          const error = document.querySelector('#passages .error-view, #passages .error');
          if (error) return { name, rescued, error: error.textContent };
          if (d.steps[d.k] === 'card') break;
          if (d.steps[d.k] === 'choice') {
            const links = [...document.querySelectorAll('.qf-pick.qf-on .opt a')];
            if (!links.length) return { name, rescued, error: 'empty choice' };
            const pick = priorities.map(text => links.find(a => a.textContent.includes(text))).find(Boolean) || links[0];
            choices.push(pick.textContent.trim()); pick.click();
          } else S.setup.vn.advance(true);
        }
        return {
          name, rescued, start, steps: n, passage: S.State.passage,
          ending: document.querySelector('.ending .name')?.textContent,
          farewell: seen.some(x => x.includes('宫本只送到门口')),
          lastSight: seen.some(x => x.includes('这是你最后一次见他')),
          heartMedicine: seen.some(x => x.includes('心脏的药')),
          choices, seen,
        };
      }, { name, rescued, start });
      results.push(result);
      assert.equal(result.error, undefined, JSON.stringify(result));
      assert.equal(result.ending, 'HE·樱花', JSON.stringify(result));
      assert.equal(result.farewell, start === 60, 'farewell presence incorrect: ' + JSON.stringify(result));
      assert.equal(result.lastSight, start === 60);
      if (process.env.CTGS_REQUIRE_HEART_CUE === '1') assert.equal(result.heartMedicine, start === 60);
      console.log(`通过：从第${start}话开始，创氏名=${name}、救千鹤=${rescued} → HE·樱花；告别=${result.farewell}；心脏病提示=${result.heartMedicine}`);
      await context.close();
    }
    assert.deepEqual(errors, []);
    console.log('完整路线四条分支均有告别；直接跳第65/81话会跳过告别；页面异常 0');
  } finally {
    if (process.env.CTGS_TEST_OUTPUT) {
      fs.mkdirSync(process.env.CTGS_TEST_OUTPUT, { recursive: true });
      fs.writeFileSync(path.join(process.env.CTGS_TEST_OUTPUT, 'chizuru-farewell.json'), JSON.stringify({ results, errors }, null, 2));
    }
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
