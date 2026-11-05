// 引导式求解：沿一条已知路线走，路线对不上时就地深度优先搜索，直到打出目标结局。
// 用法：node tools/guided.js 路线文件 目标结局 [必选选项1|必选选项2|...] [禁选选项1|...]
//   路线文件：每行 "N. 选项原文"（docs/ 下的通关路线即可，可先截取需要的那一段）
//   必选：出现时一定选它（例如 "不碰电话|下山去|请先生赐一个名字。"）
//   禁选：永远不选
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const [routeFile, GOAL, forceArg = '', avoidArg = ''] = process.argv.slice(2);
const route = fs.readFileSync(routeFile, 'utf8').split('\n').filter(l => /^\d+\. /.test(l)).map(l => l.replace(/^\d+\. /, ''));
const FORCE = forceArg ? forceArg.split('|') : [];
const AVOID = avoidArg ? avoidArg.split('|') : [];
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.route('**/assets/**', r => r.abort());
  // 不让配乐和音效占用播放器
  await p.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    HTMLMediaElement.prototype.load = function () {};
  });
  await p.goto(URL); await p.waitForSelector('.title-screen');
  const res = await p.evaluate(async ({ route, GOAL, FORCE, AVOID }) => {
    const tick = () => new Promise(r => setTimeout(r, 0));
    const links = () => [...document.querySelectorAll('#passages a.link-internal')].filter(a => !a.closest('nav.after'));
    const V = () => SugarCube.State.variables;
    const sig = () => { const v = V(); return Object.keys(v).filter(k => /^v\d{3}$/.test(k)).sort().map(k => k + v[k]).join(','); };
    document.querySelector('#passages .title-menu a').click(); await tick();
    const seen = new Set(); const ends = {};
    const stack = [{ save: SugarCube.Save.base64.save(), i: 0, path: [] }];
    let n = 0;
    while (stack.length && n < 30000) {
      const cur = stack.pop(); n++;
      await SugarCube.Save.base64.load(cur.save); SugarCube.Engine.show(); await tick();
      const root = document.querySelector('#passages');
      const end = root.querySelector('.ending .name');
      if (end) {
        ends[end.textContent] = (ends[end.textContent] || 0) + 1;
        if (end.textContent === GOAL) return { ok: true, n, path: cur.path, ends };
        continue;
      }
      const key = SugarCube.State.passage + '#' + sig();
      if (seen.has(key)) continue; seen.add(key);
      const texts = links().map(a => a.textContent).filter(t => !AVOID.includes(t));
      // 排序：必选 > 路线上的下一个（允许跳过最多 60 步重新对齐）> 继续 > 其他
      const cands = [];
      for (const t of texts) if (FORCE.includes(t)) cands.push({ t, i: cur.i });
      let j = -1;
      for (let k = cur.i; k < Math.min(route.length, cur.i + 60); k++) if (texts.includes(route[k])) { j = k; break; }
      if (j >= 0) cands.push({ t: route[j], i: j + 1 });
      if (texts.includes('继续')) cands.push({ t: '继续', i: cur.i });
      for (const t of texts) if (!cands.some(c => c.t === t)) cands.push({ t, i: cur.i });
      // 逆序压栈，第一个候选最先展开
      const kids = [];
      for (const c of cands) {
        await SugarCube.Save.base64.load(cur.save); SugarCube.Engine.show(); await tick();
        const a = links().find(x => x.textContent === c.t); if (!a) continue;
        a.click(); await tick();
        kids.push({ save: SugarCube.Save.base64.save(), i: c.i, path: cur.path.concat([c.t]) });
      }
      for (let k = kids.length - 1; k >= 0; k--) stack.push(kids[k]);
    }
    return { ok: false, n, ends };
  }, { route, GOAL, FORCE, AVOID });
  if (res.ok) {
    console.log(`找到「${GOAL}」：展开 ${res.n} 次，路线共 ${res.path.length} 次点击`);
    console.log('路线中的关键选择（略去"继续"）：');
    console.log(res.path.filter(t => t !== '继续').map((t, k) => `${k + 1}. ${t}`).join('\n'));
  } else console.log('未找到', JSON.stringify(res).slice(0, 1500));
  await b.close();
})();
