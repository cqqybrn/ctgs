// 逐话覆盖：从每一话入口进入，用几套变量预设把该话内所有"段落+选项"走一遍。
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const PRESETS = {
  零: {},
  顺: { '001': 12, '010': 10, '011': 8, '012': 6, '013': 9, '014': 1, '016': 0, '017': 1, '018': 1, '019': 6, '022': 1, '023': 1, '024': 0, '025': 0, '026': 0, '036': 1, '037': 1, '038': 1 },
  险: { '001': 3, '009': 7, '010': 2, '011': 1, '012': 1, '013': 1, '014': 0, '015': 1, '016': 1, '017': 0, '018': 2, '019': 1, '022': 0, '023': 0, '024': 1, '025': 1, '026': 1, '030': 1, '031': 2, '032': 1 },
};
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.route('**/assets/**', r => r.abort());
  const pageErrors = [];
  p.on('pageerror', e => pageErrors.push(e.message));
  await p.goto(URL);
  await p.waitForSelector('.title-screen');
  const res = await p.evaluate(async (PRESETS) => {
    const tick = () => new Promise(r => setTimeout(r, 0));
    const all = [...document.querySelectorAll('tw-passagedata')].map(x => x.getAttribute('name'));
    const huas = all.filter(n => /^h\d+(~.*)?$/.test(n));
    const visited = new Set(), included = new Set(), ends = {}, dead = {}, errs = {}, exits = {};
    // include 段落确实执行但不改变 State.passage，必须单独计入渲染覆盖。
    const include = SugarCube.Macro.get('include'), includeHandler = include.handler;
    include.handler = function () {
      const target = typeof this.args[0] === 'object' ? this.args[0].link : this.args[0];
      if (SugarCube.Story.has(target)) included.add(target);
      return includeHandler.apply(this, arguments);
    };
    const epilogues = new Set(Object.values(SugarCube.setup.EPILOGUE).map(n => 'h' + n));
    // 同一话的 ⚑ 锚点不是“离开本话”，否则宴会调查等整段流程会漏测。
    const huaOf = n => (/^h\d+/.exec(n) || [n])[0];
    for (const h of huas) {
      for (const [pn, pre] of Object.entries(PRESETS)) {
        const tried = new Set(), stack = [];
        // 重置状态
        const V = SugarCube.State.variables;
        for (const key of Object.keys(SugarCube.setup.INITIAL_VARIABLES)) V[key] = 0;
        V.used = {}; V.expr = {};
        for (const [k, v] of Object.entries(pre)) V['v' + k] = v;
        SugarCube.Engine.play(h); await tick();
        let steps = 0, sinceNew = 0;
        const back = async () => {
          while (stack.length) {
            const top = stack[stack.length - 1];
            const next = top.remaining.find(t => !tried.has(top.P + '|' + t));
            if (!next) { stack.pop(); continue; }
            await SugarCube.Save.base64.load(top.save); SugarCube.Engine.show(); await tick();
            tried.add(top.P + '|' + next);
            const a = [...document.querySelectorAll('#passages a.link-internal')].filter(x => !x.closest('nav.after')).find(x => x.textContent === next);
            if (!a) continue;
            a.click(); await tick(); return true;
          }
          return false;
        };
        while (steps++ < 4000) {
          const P = SugarCube.State.passage;
          if (!visited.has(P)) { visited.add(P); sinceNew = 0; } else sinceNew++;
          const root = document.querySelector('#passages');
          let stop = false;
          if (huaOf(P) !== huaOf(h)) { exits[h + '→' + huaOf(P)] = 1; stop = true; }
          const e = !stop && root.querySelector('.error-view, .error');
          if (e) { errs[P + '@' + pn] = e.textContent.slice(0, 200); stop = true; }
          const end = !stop && root.querySelector('.ending .name');
          if (end) { ends[end.textContent] = h; stop = true; }
          const links = stop ? [] : [...root.querySelectorAll('a.link-internal')].filter(a => !a.closest('nav.after'));
          if (!stop && !links.length) {
            if (!epilogues.has(P) || !root.querySelector('nav.after a')) dead[P + '@' + pn] = 1;
            stop = true;
          }
          if (!stop && sinceNew > 120) { dead['循环 ' + P + '@' + pn] = 1; stop = true; }
          if (stop) { sinceNew = 0; if (!(await back())) break; continue; }
          const untried = links.filter(a => !tried.has(P + '|' + a.textContent));
          let pick;
          if (untried.length) {
            if (untried.length > 1) stack.push({ P, save: SugarCube.Save.base64.save(), remaining: untried.slice(1).map(a => a.textContent) });
            pick = untried[0];
          } else pick = links[Math.floor(Math.random() * links.length)];
          tried.add(P + '|' + pick.textContent);
          pick.click(); await tick();
        }
      }
    }
    include.handler = includeHandler;
    return { all: all.filter(n => /^h/.test(n)), visited: [...new Set([...visited, ...included])], ends, dead, errs, exits: Object.keys(exits) };
  }, PRESETS);
  const seen = new Set(res.visited);
  const miss = res.all.filter(n => !seen.has(n));
  console.log(`段落覆盖（含实际 include） ${res.all.length - miss.length}/${res.all.length}；结局 ${Object.keys(res.ends).length}/${await p.evaluate(() => SugarCube.setup.ENDINGS.length)}`);
  console.log('未覆盖段落：', miss.join(' '));
  console.log('死路/循环：', JSON.stringify(res.dead, null, 0));
  console.log('运行报错：', JSON.stringify(res.errs, null, 0).slice(0, 2000));
  console.log('页面异常：', [...new Set(pageErrors)].slice(0, 10));
  const endNames = await p.evaluate(() => SugarCube.setup.ENDINGS.map(e => e.name));
  console.log('未到达结局：', endNames.filter(n => !res.ends[n]).join(' '));
  console.log('话的出口：', res.exits.join(' '));
  if (Object.keys(res.errs).length || pageErrors.length || endNames.some(n => !res.ends[n])) process.exitCode = 1;
  await b.close();
})();
