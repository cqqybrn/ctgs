
/* ======================================================================
   竖屏视觉小说导演器 setup.vn（由 tools/build.py 接在 story.js 之后嵌入）
   - 舞台模式的段落先整体渲染成 DOM（数值、条件、跳转照旧在渲染时执行，剧情逻辑不变），
     再由导演器把其中的“台词 / 选项 / 事件标记 / 结局卡”按原顺序逐步展示。
   - 背景、人物、CG、音乐、音效都是事件，走到才执行；读档、后退、检查点恢复时静默重放到游标位置。
   - 游标写进当前历史节点（State.current.variables.qfStep）。SugarCube 的历史节点保存的是“渲染前”变量，
     活动变量（State.variables）不会入档，所以不能把游标只放在活动变量里。
   ====================================================================== */
setup.freshStage = function () { return { bg: null, cg: null, who: null, lead: null, date: "", cap: "" }; };

setup.vn = (function () {
  const $ = jQuery;
  const D = { root: null, steps: [], k: -1, start: null, typing: null, ready: false, busy: false,
              log: [], logBase: [], lastAt: 0, boot: true, dim: false, unknown: [] };
  const LEAD = ["宫本仁"];
  const DISPLAY ={ line: 1, shot: 1, hint: 1, ending: 1, choice: 1, card: 1 };
  const clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  const V = function () { return State.variables; };
  const $id = function (id) { return document.getElementById(id); };
  const html = document.documentElement;
  function stage() {
    const v = V();
    if (!v.stage || typeof v.stage !== "object") v.stage = setup.freshStage();
    return v.stage;
  }
  function isStageMode() { return html.getAttribute("data-mode") === "stage"; }
  function typingOn() {
    try { if (localStorage.getItem("qf-type") === "off") return false; } catch (e) {}
    return !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  /* ---------- 图层 ---------- */
  function putImage(box, src, opt) {
    if (!box) return;
    opt = opt || {};
    const key = src || "";
    if ((box.getAttribute("data-src") || "") === key) return;
    box.setAttribute("data-src", key);
    const olds = Array.prototype.slice.call(box.children);
    const drop = function () { olds.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); }); };
    if (!src) {
      if (opt.instant) drop();
      else { olds.forEach(function (n) { n.classList.remove("on"); }); setTimeout(drop, 450); }
      return;
    }
    const img = document.createElement("img");
    img.alt = ""; img.decoding = "async";
    if (opt.pos) img.style.objectPosition = opt.pos;
    img.onload = function () { img.classList.add("on"); if (opt.instant) drop(); else setTimeout(drop, 520); };
    img.onerror = function () {
      if (opt.fallback && !img.getAttribute("data-fb")) { img.setAttribute("data-fb", "1"); img.src = opt.fallback; return; }
      if (img.parentNode) img.parentNode.removeChild(img);
      drop();
    };
    img.src = src;
    box.appendChild(img);
  }
  function render(instant) {
    const s = stage(), v = V();
    putImage($id("qf-bg"), s.bg ? setup.assetPath(s.bg) : null, { instant: instant, pos: (setup.BG_FOCUS || {})[s.bg] });
    const cgBox = $id("qf-cg");
    putImage(cgBox, s.cg ? setup.assetPath(s.cg) : null, { instant: instant });
    if (cgBox) cgBox.style.setProperty("--cg", s.cg ? 'url("' + encodeURI(setup.assetPath(s.cg)) + '")' : "none");
    html.classList.toggle("qf-cg-on", !!s.cg);
    const who = s.who || s.lead;
    let e = (who && v.expr && v.expr[who]) || "常态";
    const hw = who && setup.HOME_WEAR && setup.HOME_WEAR[who];   // 室内场景不穿西装立绘
    if (hw && s.bg && hw.map[e] && hw.prefix.some(function (p) { return s.bg.indexOf(p) === 0; })) e = hw.map[e];
    putImage($id("qf-char"), who ? setup.assetPath("char/" + who + "_" + e) : null,
      { instant: instant, fallback: who ? setup.assetPath("char/" + who + "_常态") : null });
    html.classList.toggle("qf-dim", !!D.dim);
    const place = $id("qf-place");
    if (place) place.textContent = s.date || "";
  }
  function fx(name) {
    const f = $id("qf-fx");
    if (!f) return;
    f.className = "";
    void f.offsetWidth;
    f.className = "fx-" + name;
  }
  let bannerTimer = null;
  function banner(no, title) {
    const b = $id("qf-banner");
    if (!b) return;
    b.innerHTML = "";
    $('<span class="no"></span>').text("第" + no + "话").appendTo(b);
    $('<span class="tt"></span>').text(title.replace(/（[^）]*）/g, "").trim()).appendTo(b);
    b.className = "show";
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { b.className = ""; }, 2600);
  }

  /* ---------- 事件 ---------- */
  function nextDisplay(i) {
    for (let j = i + 1; j < D.steps.length; j++) if (DISPLAY[D.steps[j].t]) return j;
    return -1;
  }
  function applyEv(ev, silent, idx) {
    const v = V(), s = stage();
    switch (ev.k) {
      case "bg":
        if (/^cg\//.test(ev.id)) s.cg = ev.id; else { s.bg = ev.id; s.cg = null; }
        s.who = null; s.cap = ev.cap || "";
        render(silent);
        break;
      case "expr":
        if (!v.expr) v.expr = {};
        v.expr[ev.who] = ev.e;
        // 第87话的宫本仁（姜仁宇）没有对话头像：由 🖼 立绘 指令按年代直接立在场上，直到下一次指令或下一话。
        if (LEAD.indexOf(ev.who) >= 0) s.lead = ev.who;
        if ((s.who || s.lead) === ev.who) render(silent);
        break;
      case "bgm":
        if (silent) v.bgm = ev.id || null; else setup.audio.bgm(ev.id);
        break;
      case "sfx":
        if (!silent) setup.audio.sfx(ev.id);
        break;
      case "hua": {
        const m = /（([^）]+)）/.exec(ev.title);
        s.date = m ? m[1].replace(/\s*→.*$/, "") : "";
        s.lead = null; s.who = null;
        render(silent);
        if (!silent) banner(ev.no, ev.title);
        break;
      }
      case "cp":
        if (!silent) { const j = nextDisplay(idx); if (j >= 0) setCursor(j); setup.cpSave(ev.id); }
        break;
      case "flash": if (!silent) fx("flash"); break;
      case "fade": if (!silent) fx("fade"); break;
    }
  }

  /* ---------- 台词、回看 ---------- */
  function logPush(who, text, cls) {
    D.log.push({ who: who, text: text, cls: cls });
    if (D.log.length > 300) D.log.shift();
  }
  function noteLine(step) {
    const e = step.el, s = stage();
    if (step.t !== "line") return;
    if (e.matches("p.say")) {
      const who = $(e).find(".who").first().text(), text = $(e).find(".t").first().text();
      if (e.classList.contains("you")) {
        // 有主角立绘（第87话）时由主角自己说话；否则让上一位人物变暗，表示说话的是画外的“你”。
        if (s.lead) { s.who = null; D.dim = false; } else D.dim = true;
        logPush("你", text, "you");
      }
      else {
        D.dim = false;
        s.who = (setup.FACE_CAST.indexOf(who) >= 0) ? who : null;
        logPush(who, text, "say");
      }
    } else if (e.matches("p.think")) logPush("", e.textContent, "think");
    else if (e.matches("p.stage")) logPush("", e.textContent, "stage");
    else logPush("", e.textContent, "n");
  }

  /* ---------- 逐字显示 ---------- */
  function cancelTyping() {
    if (D.typing) { D.typing.cancel(); D.typing = null; }
  }
  function startTyping(el) {
    cancelTyping();
    const target = $(el).find(".t").first()[0] || el;
    // 每个字包一层 span，先占好版面再逐个显现，避免对白框边打字边抖动。
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const chars = [];
    nodes.forEach(function (n) {
      const frag = document.createDocumentFragment();
      Array.from(n.data).forEach(function (ch) {
        const sp = document.createElement("span");
        sp.className = "qc"; sp.textContent = ch;
        frag.appendChild(sp); chars.push(sp);
      });
      n.parentNode.replaceChild(frag, n);
    });
    el.classList.add("qf-typing");
    let shown = 0;
    const t0 = performance.now(), cps = 42;
    const timer = setInterval(function () {
      const want = Math.min(chars.length, Math.ceil((performance.now() - t0) / 1000 * cps));
      while (shown < want) chars[shown++].classList.add("on");
      if (shown >= chars.length) finish();
    }, 30);
    function finish() {
      clearInterval(timer);
      chars.forEach(function (c) { c.classList.add("on"); });
      el.classList.remove("qf-typing");
      el.classList.add("qf-done");
      D.typing = null;
    }
    D.typing = { finish: finish, cancel: function () { clearInterval(timer); el.classList.remove("qf-typing"); } };
  }

  /* ---------- 步骤构建 ---------- */
  function build(root) {
    const raw = [];
    (function walk(parent) {
      Array.prototype.forEach.call(parent.children, function (n) {
        if (n.classList.contains("qf-ev")) raw.push({ t: "ev", el: n, ev: JSON.parse(n.getAttribute("data-ev")) });
        else if (n.matches("p.n, p.say, p.think, p.stage")) raw.push({ t: "line", el: n });
        else if (n.matches("p.shot")) raw.push({ t: "shot", el: n });
        else if (n.matches("p.flash")) raw.push({ t: "ev", el: n, ev: { k: "flash" } });
        else if (n.matches("hr.fade")) raw.push({ t: "ev", el: n, ev: { k: "fade" } });
        else if (n.matches("p.picked")) raw.push({ t: "picked", el: n });
        else if (n.matches("p.ask")) raw.push({ t: "ask", el: n });
        else if (n.matches("details.hint")) raw.push({ t: "hint", el: n });
        else if (n.matches("div.ending")) raw.push({ t: "ending", el: n });
        else if (n.matches("div.choices")) {
          const link = n.querySelector("a");
          const plainNext = n.classList.contains("next") && link && link.textContent.trim() === "继续";
          raw.push({ t: plainNext ? "next" : "choice", el: n });
        } else if (n.matches("section.review, nav.after, .grade, table.vars")) raw.push({ t: "card", el: n });
        else if (n.children.length) walk(n);
        else if (n.textContent.trim()) { D.unknown.push(n.outerHTML.slice(0, 120)); raw.push({ t: "card", el: n }); }
      });
    })(root);
    const steps = [];
    for (let i = 0; i < raw.length; i++) {
      const r = raw[i], last = steps[steps.length - 1];
      if (r.t === "ask") {
        let j = i + 1;
        while (j < raw.length && raw[j].t === "ev") j++;
        if (j < raw.length && raw[j].t === "choice") { raw[j].ask = r.el; continue; }
        r.t = "line";
      }
      if (r.t === "choice") {
        const wrap = document.createElement("div");
        wrap.className = "qf-pick";
        r.el.parentNode.insertBefore(wrap, r.el);
        if (r.ask) wrap.appendChild(r.ask);
        wrap.appendChild(r.el);
        r.el = wrap;
      }
      if (r.t === "card") {
        if (last && last.t === "card") { last.el.appendChild(r.el); continue; }
        const wrap = document.createElement("div");
        wrap.className = "qf-card";
        r.el.parentNode.insertBefore(wrap, r.el);
        wrap.appendChild(r.el);
        r.el = wrap;
      }
      if (r.t !== "ev") r.el.classList.add("qf-step");
      if (r.t === "line" || r.t === "hint") r.el.classList.add("qf-line");
      steps.push(r);
    }
    return steps;
  }

  /* ---------- 游标 ---------- */
  function setCursor(k) {
    try { State.current.variables.qfStep = k; State.current.variables.qfSeen = 1; } catch (e) {}
    try { sessionStorage.setItem("qf-step", JSON.stringify({ p: State.passage, i: State.activeIndex, k: k })); } catch (e) {}
  }
  function bootCursor() {
    try {
      const r = JSON.parse(sessionStorage.getItem("qf-step") || "null");
      if (r && r.p === State.passage && r.i === State.activeIndex && Number.isInteger(r.k)) return r.k;
    } catch (e) {}
    return null;
  }

  /* 选项多时压紧；仍然溢出就显示“向下还有”提示，滑到底再去掉 */
  function fitChoices(el) {
    el.classList.toggle("qf-many", el.querySelectorAll(".opt").length >= 6);
    function check() {
      el.classList.toggle("qf-more", el.scrollHeight - el.clientHeight > 4 && el.scrollTop + el.clientHeight < el.scrollHeight - 4);
    }
    el.scrollTop = 0;
    if (!el.__qfFit) { el.__qfFit = true; el.addEventListener("scroll", check, { passive: true }); }
    requestAnimationFrame(function () { requestAnimationFrame(check); });
    window.addEventListener("resize", check, { once: true });
  }

  /* ---------- 展示与推进 ---------- */
  function setOn(step, on) {
    if (!step || !step.el) return;
    step.el.classList.toggle("qf-on", on);
    if (!on) step.el.classList.remove("qf-typing", "qf-done");
  }
  function show(i, o) {
    o = o || {};
    cancelTyping();
    setOn(D.steps[D.k], false);
    D.k = i;
    const s = D.steps[i];
    noteLine(s);
    setOn(s, true);
    if (s.t === "choice") {
      // 选项浮在最后一句台词之上，问题的上下文不消失。
      for (let j = i - 1; j >= 0; j--) {
        const p = D.steps[j];
        if (!DISPLAY[p.t]) continue;
        if (p.t === "line") p.el.classList.add("qf-on", "qf-done");
        break;
      }
    }
    html.setAttribute("data-step", s.t);
    if (s.t === "choice") fitChoices(s.el);
    render(!!o.instant);
    setCursor(i);
    if (s.t === "line") {
      if (o.instant || !typingOn()) s.el.classList.add("qf-done"); else startTyping(s.el);
    } else s.el.classList.add("qf-done");
  }
  function follow(step) {
    const a = step.el.querySelector("a");
    if (!a || setup.vnAutoFollow === false) return;   // 自动检查脚本会自己点链接，关掉自动越过
    D.busy = true;
    setTimeout(function () { a.click(); }, 0);
    setTimeout(function () { D.busy = false; }, 1500);
  }
  function goTo(i) {
    while (i < D.steps.length) {
      const s = D.steps[i];
      if (s.t === "ev") { applyEv(s.ev, false, i); i++; continue; }
      if (s.t === "picked") { logPush("", "▸ " + s.el.textContent, "pick"); i++; continue; }
      if (s.t === "next") { follow(s); return; }
      show(i);
      return;
    }
  }
  function replay(k) {
    const v = V();
    cancelTyping();
    D.steps.forEach(function (s) { setOn(s, false); });
    v.stage = clone(D.start.stage); v.expr = clone(D.start.expr); v.bgm = D.start.bgm;
    D.log = D.logBase.slice(); D.dim = false; D.k = -1;
    let i = 0;
    for (; i < D.steps.length; i++) {
      const s = D.steps[i];
      if (DISPLAY[s.t] && i >= k) break;
      if (s.t === "next") break;
      if (s.t === "ev") applyEv(s.ev, true, i);
      else if (s.t === "picked") logPush("", "▸ " + s.el.textContent, "pick");
      else if (DISPLAY[s.t]) noteLine(s);
    }
    if (i >= D.steps.length) return;
    if (D.steps[i].t === "next") { goTo(i); return; }
    show(i, { instant: true });
  }
  function advance(force) {
    if (!D.ready || D.busy || !isStageMode()) return;
    const now = Date.now();
    if (!force && now - D.lastAt < 60) return;   // 防双击；自动化测试可传 force
    D.lastAt = now;
    if (D.typing) { D.typing.finish(); return; }
    const cur = D.steps[D.k];
    if (!cur || cur.t === "choice" || cur.t === "card") return;
    goTo(D.k + 1);
  }
  function prev() {
    if (isStageMode() && D.ready && !D.busy) {
      if (D.typing) D.typing.cancel();
      let j = D.k - 1;
      while (j >= 0 && !DISPLAY[D.steps[j].t]) j--;
      if (j >= 0) { replay(j); setup.audio.sync(); return; }
    }
    try { Engine.backward(); } catch (e) {}
  }

  function init() {
    cancelTyping();
    D.ready = false; D.busy = false; D.k = -1; D.dim = false; D.unknown = [];
    const root = $("#passages > .passage").last()[0];
    if (!root) return;
    D.root = root;
    D.steps = build(root);
    if (D.unknown.length && window.console) console.warn("舞台模式遇到未归类元素：", D.unknown);
    const v = V();
    const seen = !!v.qfSeen;
    let k = Number.isInteger(v.qfStep) ? v.qfStep : null;
    // 游标只留在历史节点里；活动变量里的副本要删掉，否则下一次跳转会被新节点继承。
    delete v.qfStep; delete v.qfSeen;
    try { State.current.variables.qfSeen = 1; } catch (e) {}
    if (k === null && D.boot) k = bootCursor();
    D.boot = false;
    D.start = { stage: clone(stage()), expr: clone(v.expr || {}), bgm: v.bgm || null };
    D.logBase = (seen || k !== null) ? [] : D.log.slice();
    if (seen || k !== null) D.log = [];
    root.classList.add("qf-ready");
    D.ready = true;
    if (k === null) goTo(0); else replay(k);
    setup.audio.sync();
  }

  /* ---------- 面板 ---------- */
  function openLog() {
    if (Dialog.isOpen()) return;
    Dialog.create("回看", "qf-log");
    const box = $('<div class="qf-logbox"></div>');
    if (!D.log.length) box.append($('<p class="qf-empty"></p>').text("这一段还没有可回看的台词。"));
    D.log.forEach(function (it) {
      const row = $('<p class="lg"></p>').addClass(it.cls);
      if (it.who) row.append($('<b class="lw"></b>').text(it.who));
      row.append($('<span class="lt"></span>').text(it.text));
      box.append(row);
    });
    Dialog.append(box[0]).open();
    setTimeout(function () { const b = document.getElementById("ui-dialog-body"); if (b) b.scrollTop = b.scrollHeight; }, 30);
  }
  function openMenu() {
    if (Dialog.isOpen()) return;
    Dialog.create("菜单", "qf-menu");
    const box = $('<div class="qf-menubox"></div>');
    function item(label, fn, keepOpen) {
      return $('<button type="button"></button>').text(label).on("click", function () {
        if (!keepOpen) Dialog.close();
        setTimeout(fn, 0);
      }).appendTo(box);
    }
    if (!setup.admin.enabled) item("章节选择", function () { setup.chapterSelect.open(); });
    item("存档 / 读取", function () { UI.saves(); });
    item("结局一览", function () { Engine.play("结局一览"); });
    item("音源署名", function () { Engine.play("音源署名"); });
    const typeBtn = item("", function () {
      try { localStorage.setItem("qf-type", typingOn() ? "off" : "on"); } catch (e) {}
      typeBtn.text("文字逐字显示：" + (typingOn() ? "开" : "关"));
    }, true);
    typeBtn.text("文字逐字显示：" + (typingOn() ? "开" : "关"));
    if (setup.admin.enabled) item("管理员章节试玩", function () { setup.admin.open(); });
    item("回到标题", function () { UI.restart(); });
    Dialog.append(box[0]).open();
  }

  /* ---------- 事件绑定 ---------- */
  $(document).on(":passagestart.qfVn", function (ev) {
    const name = ev.detail && ev.detail.passage ? ev.detail.passage.name : State.passage;
    html.setAttribute("data-mode", setup.isStage(name) ? "stage" : "page");
    html.removeAttribute("data-step");
  });
  $(document).on(":passagedisplay.qfVn", function () {
    if (isStageMode()) init();
    else { cancelTyping(); D.ready = false; D.boot = false; }   // 刷新恢复只用于刷新后的第一个段落
  });
  $(document).on("click.qfVn", "#qf-stage", function (ev) {
    if (!isStageMode() || Dialog.isOpen()) return;
    if ($(ev.target).closest("a, button, input, select, textarea, summary, details, .qf-pick, .qf-card, #bar, #qf-tools").length) return;
    advance();
  });
  $(document).on("click.qfVn", "[data-qf]", function (ev) {
    ev.preventDefault();
    const what = this.getAttribute("data-qf");
    if (Dialog.isOpen()) return;
    if (what === "prev") prev();
    else if (what === "log") openLog();
    else if (what === "menu") openMenu();
    else if (what === "save") UI.saves();
    else if (what === "music") setup.audio.toggle();
    else if (what === "ends") Engine.play("结局一览");
    else if (what === "chapters") setup.chapterSelect.open();
    else if (what === "admin") setup.admin.open();
  });
  $(document).on("keydown.qfVn", function (ev) {
    if (!isStageMode() || Dialog.isOpen()) return;
    if (/^(INPUT|SELECT|TEXTAREA|BUTTON|A|SUMMARY)$/.test(ev.target.tagName)) return;
    if (ev.key === " " || ev.key === "Enter" || ev.key === "ArrowRight" || ev.key === "PageDown") { ev.preventDefault(); advance(); }
    else if (ev.key === "ArrowLeft" || ev.key === "PageUp") { ev.preventDefault(); prev(); }
  });

  return Object.freeze({
    advance: advance, prev: prev, openLog: openLog, openMenu: openMenu,
    reset: function () { D.log = []; D.logBase = []; D.boot = false; },
    debug: function () {
      return { k: D.k, ready: D.ready, typing: !!D.typing, busy: D.busy, stage: clone(stage()), log: D.log.length,
               steps: D.steps.map(function (s) { return s.t; }), unknown: D.unknown.slice() };
    },
  });
})();
