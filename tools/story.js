/* 潜伏之京城 · 运行时脚本（由 tools/build.py 嵌入 index.html） */

/* ---------- 引擎设置 ---------- */
Config.passages.nobr = true;
Config.history.maxStates = 40;
Config.saves.maxSlotSaves = 8;
Config.saves.maxAutoSaves = 1;
Config.saves.version = 1;
Config.saves.descriptions = function () {
  return (setup.ADMIN_MODE ? "管理员试玩 · " : "") + setup.chapLabel() + (State.temporary.huaTitle ? " · " + State.temporary.huaTitle : "");
};
// SugarCube 的 Story 名称与 IFID 在管理版独立；自定义跨局记录也使用独立键。
setup.storageKey = function (name) { return (setup.ADMIN_MODE ? "qf-admin-" : "qf-") + name; };

/* ---------- 中文界面 ---------- */
(function () {
  const zh = {
    textAbort: "中止", textCancel: "取消", textClear: "清除", textClose: "关闭", textDelete: "删除",
    textExport: "导出", textImport: "导入", textLoad: "读取", textOff: "关", textOk: "确定",
    textOn: "开", textSave: "保存", textTurn: "回合",
    errorNonexistentPassage: '段落 "{passage}" 不存在',
    warningNoSaves: "当前浏览器不支持存档。",
    warningNoWebStorage: "浏览器存储不可用，存档功能受限。",
    warningDegraded: "部分功能不可用。",
    savesTitle: "存档", savesHeaderBrowser: "浏览器存档", savesHeaderDisk: "存档文件",
    savesLabelBrowserClear: "清除全部", savesLabelBrowserExport: "导出全部", savesLabelBrowserImport: "导入",
    savesLabelDiskLoad: "从文件读取…", savesLabelDiskSave: "保存为文件…",
    savesTextBrowserAuto: "自动存档", savesTextBrowserSlot: "存档位", savesTextNoDate: "无日期",
    restartTitle: "回到标题", restartMesgPrompt: "当前进度将丢失（存档不受影响）。确定吗？",
    settingsTitle: "设置", settingsTextReset: "恢复默认",
    autoloadTitle: "自动存档", autoloadMesgPrompt: "发现自动存档，要继续上次的进度吗？",
    autoloadTextCancel: "从头开始", autoloadTextOk: "继续",
    macroBackText: "后退", macroReturnText: "返回",
    jumptoTitle: "跳转", saveErrorDisallowed: "这里不能存档。",
  };
  Object.keys(zh).forEach(function (k) { try { l10nStrings[k] = zh[k]; } catch (e) {} });
})();

/* ---------- 创氏名（第一章选择，[018]：2 = 宫本仁） ---------- */
setup.surname = function () { return State.variables.v018 === 2 ? "宫本" : "江原"; };
setup.nm = function (t) { return String(t).replace(/江原(?!道)/g, setup.surname()); };

/* ---------- 章节 ---------- */
setup.chapLabel = function () {
  const t = (tags && tags()) || [];
  for (const x of t) {
    const m = /^c(\d+)$/.exec(x);
    if (m) return setup.CHAPTERS[+m[1]] || "";
  }
  return "";
};

/* 正式版章节回访：保存渲染前的真实状态，不能在跳章时重复执行本话增减值。 */
setup.chapterSelect = (function () {
  const enabled = !setup.ADMIN_MODE;
  const key = setup.storageKey("chapter-visits-v2");
  const copy = value => JSON.parse(JSON.stringify(value));
  let memory = {}, pending = null, backup = null, lastChapter = null, storageError = false;
  function chapterOf(name) {
    if (!Story.has(name) || !/^h\d+(?:~.*)?$/.test(name)) return null;
    const tag = Story.get(name).tags.find(t => /^c\d+$/.test(t));
    return tag ? Number(tag.slice(1)) : null;
  }
  function valid(record, index) {
    return record && record.schema === 1 && chapterOf(record.passage) === Number(index)
      && record.variables && typeof record.variables === "object" && !Array.isArray(record.variables)
      && Object.keys(setup.INITIAL_VARIABLES).every(k =>
        Object.prototype.hasOwnProperty.call(record.variables, k)
        && (typeof setup.INITIAL_VARIABLES[k] !== "number" || Number.isFinite(record.variables[k])));
  }
  function records() {
    let data = {};
    try { data = JSON.parse(localStorage.getItem(key) || "{}"); }
    catch (e) { storageError = true; }
    const result = Object.assign({}, data && typeof data === "object" ? data : {}, memory);
    Object.keys(result).forEach(index => { if (!valid(result[index], index)) delete result[index]; });
    return result;
  }
  function save(index, passage) {
    const all = records();
    if (all[index]) return;
    all[index] = { schema: 1, passage: passage, variables: copy(State.variables), at: Date.now() };
    memory = all;
    try { localStorage.setItem(key, JSON.stringify(all)); }
    catch (e) { storageError = true; }
  }
  $(document).on(":passageinit.qfChapterSelect", function (ev) {
    if (!enabled || !pending || pending.passage !== ev.detail.passage.name) return;
    const variables = State.variables;
    Object.keys(variables).forEach(k => { delete variables[k]; });
    Object.assign(variables, copy(pending.variables));
    pending = null;
  });
  $(document).on(":passagestart.qfChapterSelect", function (ev) {
    if (!enabled) return;
    const passage = ev.detail.passage.name;
    const index = chapterOf(passage);
    // 事件在历史节点建立后、剧情宏渲染前触发；留存原始输入，刷新也不会累加数值。
    if (index !== null && index !== lastChapter) save(index, passage);
    lastChapter = index;
  });
  function jump(index) {
    if (!enabled) throw new Error("管理员版请使用章节试玩菜单。");
    const saved = records()[index];
    if (!valid(saved, index)) throw new Error("该章节尚未到达，请先正常游玩解锁。");
    const previous = Save.base64.save();
    pending = copy(saved);
    setup.audio.reset();
    try { Engine.play(saved.passage); backup = previous; }
    finally { pending = null; }
  }
  async function undo() {
    if (!backup) return;
    const saved = backup;
    setup.audio.reset();
    await Save.base64.load(saved);
    Engine.show();
    backup = null;
  }
  function open() {
    if (!enabled) return;
    Dialog.create("章节选择", "chapter-panel");
    const box = jQuery('<div class="chapter-select"></div>');
    jQuery('<p class="admin-note"></p>').text("回到首次到达该章的位置，并恢复当时的全部剧情数值、选项记录和分支。未到达章节需先正常游玩解锁；手动存档不受影响。").appendTo(box);
    const all = records();
    const status = jQuery('<p class="admin-error" role="alert"></p>');
    setup.CHAPTER_NAV.forEach(chapter => {
      const saved = all[chapter.index];
      const button = jQuery('<button type="button" class="chapter-choice"></button>');
      button.attr("data-chapter", chapter.index).prop("disabled", !saved)
        .text(chapter.name + (saved ? " · 第" + (/^h(\d+)/.exec(saved.passage) || [0, ""])[1] + "话" : " · 尚未到达"));
      button.on("click", function () {
        try { jump(chapter.index); Dialog.close(); }
        catch (e) { status.text("跳转失败：" + e.message); }
      }).appendTo(box);
    });
    if (backup) jQuery('<button type="button" class="chapter-undo">撤销上次跳章</button>')
      .on("click", async function () {
        try { await undo(); Dialog.close(); }
        catch (e) { status.text("恢复失败：" + e.message); }
      }).appendTo(box);
    if (storageError) jQuery('<p class="admin-note"></p>').text("浏览器存储不可用或记录损坏；本次新解锁章节仅在当前页面保留，请及时手动存档。").appendTo(box);
    box.append(status);
    Dialog.append(box[0]).open();
  }
  return Object.freeze({ open: open, jump: jump, undo: undo, records: records });
})();

/* ---------- 素材 ---------- */
setup.assetPath = function (id) {
  if (setup.ASSETS[id]) return setup.ASSETS[id];
  const i = id.indexOf("/");
  const kind = id.slice(0, i), name = id.slice(i + 1);
  const ext = { bg: ".jpg", cg: ".jpg", char: ".png", bgm: ".mp3", sfx: ".mp3" }[kind] || "";
  return "assets/" + kind + "/" + name + ext;
};

Macro.add("bg", {
  handler() {
    const id = this.args[0], cap = this.args[1] || "";
    const fig = jQuery('<figure class="scene noimg"></figure>');
    const img = jQuery('<img alt="" loading="lazy" decoding="async">');
    img.on("load", function () { fig.removeClass("noimg").addClass("ok"); });
    img.on("error", function () { img.remove(); });
    img.attr("src", setup.assetPath(id));
    fig.append(img).append(jQuery("<figcaption></figcaption>").text(cap));
    fig.appendTo(this.output);
  },
});

Macro.add("expr", {
  handler() {
    const v = State.variables;
    if (!v.expr) v.expr = {};
    v.expr[this.args[0]] = this.args[1];
  },
});

Macro.add("face", {
  handler() {
    const who = this.args[0];
    const v = State.variables;
    const e = (v.expr && v.expr[who]) || "常态";
    const img = jQuery('<img class="face" alt="" loading="lazy" decoding="async">');
    let tried = false;
    img.on("error", function () {
      if (!tried && e !== "常态") { tried = true; img.attr("src", setup.assetPath("char/" + who + "_常态")); }
      else img.remove();
    });
    img.on("load", function () { img.addClass("ok"); });
    img.attr("src", setup.assetPath("char/" + who + "_" + e));
    img.appendTo(this.output);
  },
});

Macro.add("hua", {
  handler() {
    State.temporary.huaTitle = this.args[1];
    jQuery('<header class="hua-head"></header>')
      .append(jQuery('<span class="no"></span>').text("第" + this.args[0] + "话"))
      .append(jQuery('<span class="tt"></span>').text(this.args[1]))
      .appendTo(this.output);
  },
});

/* ---------- 音频 ---------- */
setup.audio = (function () {
  let on = true;
  try { on = localStorage.getItem("qf-audio") !== "off"; } catch (e) {}
  let bgmEl = null, bgmId = null, fadeTimer = null, fadingEl = null;
  const sfxEls = new Set();
  function applyClass() { document.documentElement.classList.toggle("muted", !on); }
  function stop(fade) {
    clearInterval(fadeTimer);
    if (fadingEl) { fadingEl.pause(); fadingEl = null; }
    const el = bgmEl;
    bgmEl = null; bgmId = null;
    if (!el) return;
    if (!fade) { el.pause(); return; }
    fadingEl = el;
    fadeTimer = setInterval(function () {
      el.volume = Math.max(0, el.volume - 0.05);
      if (el.volume <= 0.01) { el.pause(); clearInterval(fadeTimer); fadingEl = null; }
    }, 80);
  }
  function play(id) {
    if (id === bgmId && bgmEl) return;
    stop(true);
    bgmId = id;
    if (!id || !on) return;
    const el = new Audio(setup.assetPath(id));
    el.loop = true; el.volume = 0.55;
    el.addEventListener("error", function () { if (bgmEl === el) bgmEl = null; });
    bgmEl = el;
    const p = el.play();
    if (p && p.catch) p.catch(function () {});
  }
  return {
    bgm: function (id) { State.variables.bgm = id || null; play(id || null); },
    sync: function () { const id = State.variables.bgm || null; if (id !== bgmId || (id && !bgmEl && on)) { bgmId = null; play(id); } },
    sfx: function (id) {
      if (!on) return;
      const el = new Audio(setup.assetPath(id));
      sfxEls.add(el);
      el.addEventListener("ended", function () { sfxEls.delete(el); }, { once: true });
      el.addEventListener("error", function () { sfxEls.delete(el); }, { once: true });
      el.volume = 0.8;
      const p = el.play();
      if (p && p.catch) p.catch(function () { sfxEls.delete(el); });
    },
    toggle: function () {
      on = !on;
      try { localStorage.setItem("qf-audio", on ? "on" : "off"); } catch (e) {}
      applyClass();
      if (!on) stop(false); else { bgmId = null; play(State.variables.bgm || null); }
    },
    init: applyClass,
    reset: function () {
      stop(false);
      sfxEls.forEach(function (el) { el.pause(); });
      sfxEls.clear();
    },
  };
})();
setup.audio.init();

/* ---------- 管理员试玩（仅 admin.html 启用） ---------- */
setup.admin = (function () {
  const enabled = setup.ADMIN_MODE === true;
  const presets = {
    fresh: { label: "新局初始值", values: {} },
    favorable: { label: "顺境测试（非真实通关存档）", values: { v001: 12, v010: 10, v011: 8, v012: 6, v013: 9, v014: 1, v017: 1, v018: 1, v019: 6, v022: 1, v023: 1, v036: 1, v037: 1, v038: 1 } },
    adverse: { label: "险境测试（非真实通关存档）", values: { v001: 3, v009: 7, v010: 2, v011: 1, v012: 1, v013: 1, v015: 1, v016: 1, v018: 2, v019: 1, v024: 1, v025: 1, v026: 1, v030: 1, v031: 2, v032: 1 } },
    current: { label: "保留当前剧情变量", values: null },
  };
  let pending = null, backup = null;
  $(document).on("keydown.qfAdmin", function (ev) {
    if (enabled && ev.key === "Escape" && Dialog.isOpen("admin-panel")) {
      ev.preventDefault();
      Dialog.close();
    }
  });
  function entry(name) {
    return setup.ADMIN_CHAPTERS.some(function (c) { return c.entries.some(function (e) { return e.passage === name; }); });
  }
  $(document).on(":passageinit.qfAdmin", function (ev) {
    if (!enabled || !pending || ev.detail.passage.name !== pending.passage) return;
    // 在创建新历史节点前设置输入变量。State.variables 是活动副本，
    // 不改写旧的 pre-play 历史；新节点会把预设一并存档并用于刷新/回放。
    const v = State.variables, selected = presets[pending.preset];
    if (pending.preset !== "current") {
      Object.keys(v).forEach(function (k) { delete v[k]; });
      Object.assign(v, setup.INITIAL_VARIABLES, selected.values);
    }
    v.used = {}; v.expr = {}; v.bgm = null;
    pending = null;
  });
  function jump(name, preset) {
    if (!enabled) throw new Error("请从 admin.html 打开管理员试玩版。");
    if (!entry(name) || !Story.has(name)) throw new Error("章节入口不存在。");
    if (!Object.prototype.hasOwnProperty.call(presets, preset)) throw new Error("测试预设不存在。");
    const previous = Save.base64.save();
    pending = { passage: name, preset: preset };
    setup.audio.reset();
    try { Engine.play(name); }
    finally { pending = null; }
    backup = previous;
  }
  async function undo() {
    if (!enabled || !backup) return;
    const saved = backup;
    setup.audio.reset();
    await Save.base64.load(saved);
    Engine.show();
    backup = null;
  }
  function open() {
    if (!enabled) return;
    Dialog.create("管理员模式 · 章节试玩", "admin-panel");
    const form = jQuery('<form class="admin-form"></form>');
    jQuery('<p class="admin-note"></p>').text("管理版使用独立存档和结局记录，不影响正式版。跳章不会补演前文；测试预设不代表真实通关状态，进入后仍按该话剧情更新变量。").appendTo(form);
    const chapter = jQuery('<select id="admin-chapter" name="chapter"></select>');
    const target = jQuery('<select id="admin-passage" name="passage"></select>');
    const preset = jQuery('<select id="admin-preset" name="preset"></select>');
    function field(label, id, control) {
      jQuery('<div class="admin-field"></div>').append(jQuery('<label></label>').attr("for", id).text(label), control).appendTo(form);
    }
    setup.ADMIN_CHAPTERS.forEach(function (c, i) { chapter.append(jQuery('<option></option>').val(i).text(c.name)); });
    Object.keys(presets).forEach(function (k) { preset.append(jQuery('<option></option>').val(k).text(presets[k].label)); });
    preset.val("favorable");
    function refresh() {
      target.empty();
      setup.ADMIN_CHAPTERS[Number(chapter.val())].entries.forEach(function (e) {
        target.append(jQuery('<option></option>').val(e.passage).text("第" + e.hua + "话 · " + e.title));
      });
    }
    chapter.on("change", refresh);
    const currentChapter = setup.ADMIN_CHAPTERS.findIndex(function (c) { return Story.get(State.passage).tags.includes("c" + c.index); });
    if (currentChapter >= 0) chapter.val(currentChapter);
    refresh();
    field("选择章节", "admin-chapter", chapter);
    field("具体话（默认本章开头）", "admin-passage", target);
    field("跳转时的剧情状态", "admin-preset", preset);
    const status = jQuery('<p class="admin-error" role="alert"></p>');
    const actions = jQuery('<div class="admin-actions"></div>');
    jQuery('<button type="submit">进入所选话</button>').appendTo(actions);
    jQuery('<button type="button">撤销上次跳转</button>').prop("disabled", !backup).on("click", async function () {
      try { await undo(); Dialog.close(); }
      catch (e) { status.text("恢复失败：" + e.message); }
    }).appendTo(actions);
    form.append(actions, status, jQuery('<a class="admin-exit" href="index.html">退出管理，返回正式版</a>'));
    form.on("submit", function (ev) {
      ev.preventDefault();
      try { jump(target.val(), preset.val()); Dialog.close(); }
      catch (e) { status.text("跳转失败：" + e.message); }
    });
    Dialog.append(form[0]).open();
  }
  return Object.freeze({ enabled: enabled, open: open, jump: jump, undo: undo });
})();

/* ---------- 音源署名（构建时嵌入，本地双击也可查看） ---------- */
Macro.add("audioCredits", {
  handler() {
    const out = jQuery('<div class="audio-credits"></div>');
    function link(parent, text, url) {
      if (/^https?:\/\//i.test(url || "")) parent.append(" ", jQuery('<a target="_blank" rel="noopener noreferrer"></a>').attr("href", url).text(text));
    }
    Object.keys(setup.AUDIO_CREDITS).sort().forEach(function (file) {
      const credit = setup.AUDIO_CREDITS[file];
      const details = jQuery('<details class="credit-item"></details>');
      const name = file.split("/").pop().replace(/\.mp3$/, "");
      details.append(jQuery('<summary></summary>').text((file.includes("/bgm/") ? "配乐 · " : "音效 · ") + name));
      const list = jQuery('<ul></ul>');
      (credit.sources || []).forEach(function (source) {
        const item = jQuery('<li></li>');
        item.append(jQuery('<p></p>').text([source.title, source.author || source.publisher, source.performer].filter(Boolean).join(" · ") || "项目自制拟声"));
        const license = jQuery('<p class="fine"></p>').text("许可：" + source.license);
        link(license, "许可详情", source.license_url);
        link(license, "原始来源", source.source_url);
        if (source.source_id) license.append(" · 音源编号 " + source.source_id);
        item.append(license).appendTo(list);
      });
      details.append(list).appendTo(out);
    });
    out.appendTo(this.output);
  },
});

Macro.add("bgm", { handler() { setup.audio.bgm(this.args[0]); } });
Macro.add("sfx", { handler() { if (!State.temporary.replaying) setup.audio.sfx(this.args[0]); } });
$(document).on(":passageend", function () { setup.audio.sync(); });

/* ---------- 结局记录（跨存档，存在本浏览器） ---------- */
setup.endsSeen = function () {
  try { return JSON.parse(localStorage.getItem(setup.storageKey("ends")) || "{}"); } catch (e) { return {}; }
};
setup.markEnd = function (id) {
  const s = setup.endsSeen();
  if (s[id]) return;
  s[id] = Date.now();
  try { localStorage.setItem(setup.storageKey("ends"), JSON.stringify(s)); } catch (e) {}
};
setup.galleryHTML = function () {
  const seen = setup.endsSeen();
  const total = setup.ENDINGS.length;
  const got = setup.ENDINGS.filter(function (e) { return seen[e.id]; }).length;
  let h = '<p class="gal-count">已达成 <b>' + got + "</b> / " + total + "</p>";
  setup.CHAPTERS.forEach(function (name, ci) {
    const list = setup.ENDINGS.filter(function (e) { return e.chap === ci; });
    if (!list.length) return;
    h += '<section class="gal"><h3>' + name + "</h3><ol>";
    list.forEach(function (e) {
      const ok = !!seen[e.id];
      const epi = ok && setup.EPILOGUE[e.name] ? ' <a class="link-internal epi" data-passage="h' + setup.EPILOGUE[e.name] + '">日后谈</a>' : "";
      const dojo = ok && !e.he && SugarCube.Story.has("补课·" + e.id) ? ' <a class="link-internal epi" data-passage="补课·' + e.id + '">补课</a>' : "";
      h += '<li class="' + (ok ? "ok" : "") + (e.he ? " he" : "") + '"><span class="h">第' + e.hua + '话</span><span class="nm">' +
        (ok ? e.name : "？？？") + "</span>" + epi + dojo + "</li>";
    });
    h += "</ol></section>";
  });
  return h;
};

setup.toTitle = function () { Engine.restart(); };
setup.hasSave = function () {
  try { return Save.browser.size > 0 || (Save.browser.auto && Save.browser.auto.size > 0); } catch (e) { return false; }
};
setup.continueGame = function () {
  try {
    const r = Save.browser.continue();
    if (r && r.catch) r.catch(function () { UI.saves(); });
  } catch (e) { UI.saves(); }
};

/* ---------- 检查点（"回到那一刻"）---------- */
setup.cpAll = function () {
  try { return JSON.parse(localStorage.getItem(setup.storageKey("cp")) || "{}"); } catch (e) { return {}; }
};
Macro.add("checkpoint", {
  handler() {
    const id = this.args[0];
    try {
      const all = setup.cpAll();
      all[id] = { s: Save.base64.save(), t: Date.now() };
      localStorage.setItem(setup.storageKey("cp"), JSON.stringify(all));
    } catch (e) { /* 存储不可用或已满：静默跳过 */ }
  },
});
setup.loadCP = function (id) {
  const c = setup.cpAll()[id];
  if (!c) return;
  Promise.resolve(Save.base64.load(c.s)).then(function () { Engine.show(); }).catch(function () {
    UI.alert("这个检查点读取失败，可能是游戏更新后存档已不兼容。请从存档或标题重新开始。");
  });
};
Macro.add("cpButton", {
  handler() {
    const id = this.args[0], title = this.args[1];
    if (setup.cpAll()[id]) {
      jQuery('<a class="link-internal cp-on" tabindex="0"></a>').text("回到：" + title)
        .ariaClick(function () { setup.loadCP(id); }).appendTo(this.output);
    } else {
      jQuery('<span class="cp-off"></span>').text("回到：" + title + "（这一局还没有经过这里）").appendTo(this.output);
    }
  },
});

/* ---------- 补课页 ---------- */
Macro.add("varTable", {
  handler() {
    const v = State.variables;
    const tb = jQuery('<table class="vars"><caption>你死的时候</caption></table>');
    this.args.forEach(function (n) {
      const name = setup.VARNAMES[n] || ("变量 " + n);
      jQuery("<tr></tr>").append(jQuery("<th></th>").text(name)).append(jQuery("<td></td>").text(v["v" + n])).appendTo(tb);
    });
    tb.appendTo(this.output);
  },
});
setup.dojoSeen = function () {
  try { return JSON.parse(localStorage.getItem(setup.storageKey("dojo")) || "{}"); } catch (e) { return {}; }
};
setup.markDojo = function (id) {
  const s = setup.dojoSeen();
  s[id] = 1;
  try { localStorage.setItem(setup.storageKey("dojo"), JSON.stringify(s)); } catch (e) {}
};
Macro.add("dojoIntro", {
  handler() {
    const seen = setup.dojoSeen();
    const first = Object.keys(seen).length === 0;
    const lines = first ? [
      ["n", "地下室的煤油灯亮着。书架比你记得的还要高，桌上摆着两只茶碗。"],
      ["s", "徐明焕", "死了？好。死过一次的学生，才肯认真听课。"],
      ["s", "文基哲", "坐吧，仁宇。茶是热的。在这里，你想死几次都可以。"],
    ] : [["n", "煤油灯还亮着。老师已经把红笔拿在手里了。"]];
    const out = this.output;
    lines.forEach(function (l) {
      if (l[0] === "n") jQuery('<p class="n"></p>').text(l[1]).appendTo(out);
      else jQuery('<p class="say"></p>').append(jQuery('<span class="who"></span>').text(l[1]))
        .append(jQuery('<span class="t"></span>').text(l[2])).appendTo(out);
    });
  },
});
