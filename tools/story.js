/* 潜伏之京城 · 运行时脚本（由 tools/build.py 嵌入 index.html） */

/* ---------- 引擎设置 ---------- */
Config.passages.nobr = true;
Config.history.maxStates = 40;
Config.saves.maxSlotSaves = 8;
Config.saves.maxAutoSaves = 1;
Config.saves.version = 1;
Config.saves.descriptions = function () {
  const p = Story.get(passage());
  return setup.chapLabel() + (State.temporary.huaTitle ? " · " + State.temporary.huaTitle : "");
};

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

/* ---------- 章节 ---------- */
setup.chapLabel = function () {
  const t = (tags && tags()) || [];
  for (const x of t) {
    const m = /^c(\d+)$/.exec(x);
    if (m) return setup.CHAPTERS[+m[1]] || "";
  }
  return "";
};

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
  let bgmEl = null, bgmId = null, fadeTimer = null;
  function applyClass() { document.documentElement.classList.toggle("muted", !on); }
  function stop(fade) {
    const el = bgmEl;
    bgmEl = null; bgmId = null;
    if (!el) return;
    if (!fade) { el.pause(); return; }
    clearInterval(fadeTimer);
    fadeTimer = setInterval(function () {
      el.volume = Math.max(0, el.volume - 0.05);
      if (el.volume <= 0.01) { el.pause(); clearInterval(fadeTimer); }
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
      el.volume = 0.8;
      const p = el.play();
      if (p && p.catch) p.catch(function () {});
    },
    toggle: function () {
      on = !on;
      try { localStorage.setItem("qf-audio", on ? "on" : "off"); } catch (e) {}
      applyClass();
      if (!on) stop(false); else { bgmId = null; play(State.variables.bgm || null); }
    },
    init: applyClass,
  };
})();
setup.audio.init();

Macro.add("bgm", { handler() { setup.audio.bgm(this.args[0]); } });
Macro.add("sfx", { handler() { if (!State.temporary.replaying) setup.audio.sfx(this.args[0]); } });
$(document).on(":passageend", function () { setup.audio.sync(); });

/* ---------- 结局记录（跨存档，存在本浏览器） ---------- */
setup.endsSeen = function () {
  try { return JSON.parse(localStorage.getItem("qf-ends") || "{}"); } catch (e) { return {}; }
};
setup.markEnd = function (id) {
  const s = setup.endsSeen();
  if (s[id]) return;
  s[id] = Date.now();
  try { localStorage.setItem("qf-ends", JSON.stringify(s)); } catch (e) {}
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
      h += '<li class="' + (ok ? "ok" : "") + (e.he ? " he" : "") + '"><span class="h">第' + e.hua + '话</span><span class="nm">' +
        (ok ? e.name : "？？？") + "</span>" + epi + "</li>";
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
