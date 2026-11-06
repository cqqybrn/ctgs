// 分段求解（用法：node tools/solve_stage.js 路线文件 话名 目标结局）：先按已知路线回放到 STOP 话，再从那里最佳优先搜索目标结局
const { chromium } = require('playwright'); const fs = require('fs');
const [routeFile, STOP, GOAL] = process.argv.slice(2);
const route = fs.readFileSync(routeFile, 'utf8').split('\n').filter(l => /^\d+\. /.test(l)).map(l => l.replace(/^\d+\. /, ''));
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.route('**/assets/**', r => r.abort());
  await p.goto('file://' + require('path').resolve(__dirname, '..', 'index.html')); await p.waitForSelector('.title-screen');
  await p.evaluate(() => { SugarCube.setup.vnAutoFollow = false; });
  const res = await p.evaluate(async ({ route, STOP, GOAL }) => {
    const tick = () => new Promise(r => setTimeout(r, 0));
    const links = () => [...document.querySelectorAll('#passages a.link-internal')].filter(a => !a.closest('nav.after'));
    document.querySelector('#passages .title-menu a').click(); await tick();
    let i = 0, steps = 0;
    while (steps++ < 5000) {
      if (SugarCube.State.passage.split(/[.~]/)[0] === STOP) break;
      const L = links(); const a = L.find(x => x.textContent === route[i]);
      if (a) { a.click(); i++; } else { const c = L.find(x => x.textContent === '继续') || (L.length === 1 ? L[0] : null); if (!c) return { mismatch: SugarCube.State.passage, want: route[i] }; c.click(); }
      await tick();
    }
    const V = () => SugarCube.State.variables;
    const at = { P: SugarCube.State.passage, v010: V().v010, v019: V().v019, v022: V().v022, v034: V().v034, v011: V().v011 };
    const huaNum = P => +(/^h(\d+)/.exec(P) || [0, 0])[1];
    const sig = () => { const v = V(); return Object.keys(v).filter(k => /^v\d{3}$/.test(k)).sort().map(k => k + v[k]).join(','); };
    const heap = [{ save: SugarCube.Save.base64.save(), path: [], pri: 0 }]; const seen = new Set(); const ends = {}; let n = 0;
    while (heap.length && n < 20000) {
      heap.sort((a, b) => a.pri - b.pri); const cur = heap.pop();
      await SugarCube.Save.base64.load(cur.save); SugarCube.Engine.show(); await tick();
      const texts = links().map(a => a.textContent);
      for (let k = 0; k < texts.length; k++) {
        n++;
        if (k > 0) { await SugarCube.Save.base64.load(cur.save); SugarCube.Engine.show(); await tick(); }
        const a = links().find(x => x.textContent === texts[k]); if (!a) continue;
        a.click(); await tick();
        const P = SugarCube.State.passage; const end = document.querySelector('#passages .ending .name');
        const path = cur.path.concat([texts[k]]);
        if (end) { ends[end.textContent] = (ends[end.textContent] || 0) + 1; if (end.textContent === GOAL) { const v = V(); return { ok: true, at, n, path, vars: { v010: v.v010, v019: v.v019, v011: v.v011, v039: v.v039, v040: v.v040, v041: v.v041 }, ends }; } continue; }
        const key = P + '#' + sig(); if (seen.has(key)) continue; seen.add(key);
        // 支线话号按剧情顺序排：91<93..97<70..74<98<88
        const h = huaNum(P); const order = h >= 90 && h <= 97 ? h - 90 : (h >= 70 && h <= 79 ? 10 + h - 70 : (h === 98 ? 30 : (h === 88 ? 40 : 0)));
        const v = V();
        heap.push({ save: SugarCube.Save.base64.save(), path, pri: order * 1000 - path.length + (v.v019 || 0) * 5 + (v.v010 || 0) * 3 + (v.v011 || 0) * 3 });
      }
    }
    return { ok: false, at, n, ends };
  }, { route, STOP, GOAL });
  console.log(JSON.stringify(res, null, 0)); await b.close();
})();
