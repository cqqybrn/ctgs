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
    textAbort: "中止", textAborting: "已取消", textCancel: "取消", textClear: "清除", textClose: "关闭", textDelete: "删除",
    textExport: "导出", textImport: "导入", textLoad: "读取", textOff: "关", textOk: "确定",
    textOn: "开", textSave: "保存", textTurn: "回合",
    errorNonexistentPassage: '段落 "{passage}" 不存在',
    warningNoSaves: "当前浏览器不支持存档。",
    warningNoWebStorage: "浏览器存储不可用，存档功能受限。",
    warningDegraded: "部分功能不可用。",
    savesTitle: "存档", savesHeaderBrowser: "浏览器存档位", savesHeaderDisk: "单个存档文件（.save）",
    savesLabelBrowserClear: "清除全部", savesLabelBrowserExport: "导出全部存档包…", savesLabelBrowserImport: "导入全部存档包…",
    savesLabelDiskLoad: "读取单个存档文件…", savesLabelDiskSave: "保存为单个存档…",
    savesTextBrowserAuto: "自动存档", savesTextBrowserSlot: "存档位", savesTextNoDate: "无日期",
    restartTitle: "回到标题", restartMesgPrompt: "当前进度将丢失（存档不受影响）。确定吗？",
    settingsTitle: "设置", settingsTextReset: "恢复默认",
    autoloadTitle: "自动存档", autoloadMesgPrompt: "发现自动存档，要继续上次的进度吗？",
    autoloadTextCancel: "从头开始", autoloadTextOk: "继续",
    macroBackText: "后退", macroReturnText: "返回",
    jumptoTitle: "跳转", saveErrorDisallowed: "这里不能存档。",
    saveErrorInvalidData: "文件缺少必要数据或格式不匹配。单个存档是 .save，全部存档包是 .savesbundle",
    saveErrorDecodeFail: "无法解码存档，请检查文件是否完整或重新下载",
    saveErrorDiskLoadFail: "读取存档文件失败",
    saveErrorIdMismatch: "存档不属于当前游戏入口。正式版 index.html 与管理员版 admin.html 的存档不通用",
  };
  Object.keys(zh).forEach(function (k) { try { l10nStrings[k] = zh[k]; } catch (e) {} });
})();

/* 单个存档误选“导入全部”时，转到引擎原有的磁盘读取，不改写浏览器存档位。 */
(function () {
  $(document).on(":dialogopened.qfSaveHelp", function () {
    const body = document.getElementById("ui-dialog-body");
    if (!body || !body.classList.contains("saves") || body.querySelector(".qf-save-help")) return;
    jQuery('<p class="qf-save-help admin-note" role="note"></p>')
      .text("单个 .save 文件会读取并继续游戏，不覆盖手动存档位；全部 .savesbundle 存档包会替换浏览器存档位。两个入口误选单个 .save 时也可正常读取。" + (setup.ADMIN_MODE ? " 当前是管理员版，不能读取正式版存档。" : " 当前是正式版。"))
      .prependTo(body);
    // 引擎的长标签默认只用作 tooltip；同步修改可见文字，避免再次混淆。
    [["saves-import", "导入存档包", "导入全部存档包…"],
     ["saves-export", "导出存档包", "导出全部存档包…"],
     ["saves-disk-load", "读取单个存档", "读取单个存档文件…"],
     ["saves-disk-save", "保存单个存档", "保存为单个存档…"]].forEach(function (item) {
      jQuery(body).find('[id="' + item[0] + '"]').text(item[1]).attr("aria-label", item[2]);
    });
  });
  document.addEventListener("change", function (ev) {
    const input = ev.target;
    if (!input || input.id !== "saves-import-handler" || !input.files || !input.files[0]) return;
    const file = input.files[0];
    if (!/\.save$/i.test(file.name)) return; // .savesbundle 仍交给原来的批量导入器。
    ev.preventDefault(); ev.stopImmediatePropagation();
    const loadEvent = { target: { files: [file] } };
    const load = function () {
      Save.disk.load(loadEvent).then(function () { Engine.show(); }).catch(function (error) {
        Dialog.create("读取存档失败", "qf-save-error");
        Dialog.append(jQuery('<p role="alert"></p>').text(error.message || "读取失败，请核对文件和游戏入口。")[0]).open();
      });
    };
    if (Dialog.isOpen()) { jQuery(document).one(":dialogclosed.qfSingleSave", load); Dialog.close(); }
    else load();
  }, true);
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

/* 新剧情标记只补缺失字段：旧存档不会凭空获得通信、申诉或已核验状态。 */
setup.northDefaults = { v058: 0, v059: 0, v060: 0, v061: 0, v062: 0, v063: 0, v064: 0, v065: 0 };
$(document).on(":passageinit.qfNorthDefaults", function () {
  Object.keys(setup.northDefaults).forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(State.variables, key)) State.variables[key] = 0;
  });
});

/* 正式版章节回访：保存渲染前的真实状态，不能在跳章时重复执行本话增减值。 */
setup.chapterSelect = (function () {
  const enabled = true; // 正式版与管理版均可使用同级路线传送门；记录键仍按模式隔离。
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
    Object.keys(result).forEach(index => {
      const record = result[index];
      // 只迁移新增标记，不把残缺/损坏的旧记录补成一份伪造的完整状态。
      if (record && record.variables && typeof record.variables === "object" && !Array.isArray(record.variables)) record.variables = Object.assign({}, setup.northDefaults, record.variables);
    });
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
    if (index !== null && index !== lastChapter && !State.variables.qfTestJump) save(index, passage);
    lastChapter = index;
  });
  function jump(index) {
    if (!enabled) throw new Error("管理员版请使用章节试玩菜单。");
    const saved = records()[index];
    if (!valid(saved, index)) {
      const chapter = setup.CHAPTER_NAV.find(c => c.index === Number(index));
      if (!chapter) throw new Error("章节不存在。");
      return testJump(chapter.entries[0].passage, "favorable");
    }
    const previous = Save.base64.save();
    pending = copy(saved);
    setup.audio.reset();
    if (setup.vn) setup.vn.reset();
    try { Engine.play(saved.passage); backup = previous; }
    finally { pending = null; }
  }
  function testJump(passage, preset, overrides) {
    if (!enabled) throw new Error("管理员版请使用章节试玩菜单。");
    if (!(setup.CHAPTER_NAV.some(c => c.entries.some(e => e.passage === passage)) || setup.ROUTES.some(r => r.ending === passage)) || !Story.has(passage)) throw new Error("话入口不存在。");
    const selected = setup.admin.presets[preset];
    if (!selected) throw new Error("测试预设不存在。");
    const variables = preset === "current" ? copy(State.variables) : Object.assign({}, setup.INITIAL_VARIABLES, copy(selected.values));
    Object.assign(variables, copy(overrides || {}));
    variables.used = {}; variables.expr = {}; variables.bgm = null;
    variables.stage = setup.freshStage(); variables.qfTestJump = true;
    delete variables.qfStep; delete variables.qfSeen;
    const previous = Save.base64.save();
    pending = { passage: passage, variables: variables };
    setup.audio.reset(); setup.vn.reset();
    try { Engine.play(passage); backup = previous; }
    finally { pending = null; }
  }
  async function undo() {
    if (!backup) return;
    const saved = backup;
    setup.audio.reset();
    if (setup.vn) setup.vn.reset();
    await Save.base64.load(saved);
    Engine.show();
    backup = null;
  }
  function appendRoutes(parent, status, onJump) {
    jQuery('<h3>结局路线（同级）</h3>').appendTo(parent);
    jQuery('<p class="admin-note"></p>').text("以下四条路线没有主次之分。入口测试使用各路线明确的测试状态，不代表已自然通关；直接看结局会跳过前置剧情。仍须选择相应选项，错误选择仍会失败。").appendTo(parent);
    setup.ROUTES.forEach(function (route) {
      const card = jQuery('<section class="route-card"></section>').attr("data-route", route.id);
      jQuery('<h4></h4>').text(route.name).appendTo(card);
      jQuery('<p></p>').text(route.entryLabel).appendTo(card);
      [["从路线入口测试", route.entry, "entry"], ["直接看结局", route.ending, "ending"]].forEach(function (item) {
        jQuery('<button type="button"></button>').attr("data-route-action", item[2]).text(item[0]).on("click", function () {
          try { (onJump || testJump)(item[1], "favorable", route.values); Dialog.close(); }
          catch (e) { status.text("跳转失败：" + e.message); }
        }).appendTo(card);
      });
      card.appendTo(parent);
    });
  }
  function open() {
    if (!enabled) return;
    Dialog.create("剧情与路线传送", "chapter-panel");
    const box = jQuery('<div class="chapter-select"></div>');
    jQuery('<p class="admin-note"></p>').text("全部章节及具体话已解锁，可直接测试。自动模式优先恢复真实回访记录；没有记录时使用顺境测试预设。测试预设不是前文真实通关数值，不保证满足所有分支；不会覆盖真实回访记录或手动存档。").appendTo(box);
    const all = records();
    const status = jQuery('<p class="admin-error" role="alert"></p>');
    appendRoutes(box, status);
    jQuery('<h3>章节与具体话</h3>').appendTo(box);
    const form = jQuery('<form class="admin-form"></form>');
    const chapterInput = jQuery('<select id="jump-chapter" aria-label="测试章节"></select>');
    const passageInput = jQuery('<select id="jump-passage" aria-label="具体话"></select>');
    const presetInput = jQuery('<select id="jump-preset" aria-label="跳转数值"></select>');
    presetInput.append(jQuery('<option value="auto">自动：真实记录优先，否则顺境测试</option>'));
    Object.keys(setup.admin.presets).forEach(k => presetInput.append(jQuery('<option></option>').val(k).text(setup.admin.presets[k].label)));
    setup.CHAPTER_NAV.forEach(c => chapterInput.append(jQuery('<option></option>').val(c.index).text(c.name)));
    function refresh() {
      passageInput.empty();
      setup.CHAPTER_NAV.find(c => c.index === Number(chapterInput.val())).entries.forEach(e => passageInput.append(jQuery('<option></option>').val(e.passage).text("第" + e.hua + "话 · " + e.title)));
    }
    chapterInput.on("change", refresh); refresh();
    [["测试章节", chapterInput], ["具体话", passageInput], ["跳转数值", presetInput]].forEach(([label, control]) => {
      jQuery('<div class="admin-field"></div>').append(jQuery('<label></label>').attr("for", control.attr("id")).text(label), control).appendTo(form);
    });
    jQuery('<button type="submit">跳到所选话</button>').appendTo(form);
    form.on("submit", function (ev) {
      ev.preventDefault();
      try {
        const index = Number(chapterInput.val()), saved = all[index], passage = passageInput.val();
        if (presetInput.val() === "auto" && saved && saved.passage === passage) jump(index);
        else testJump(passage, presetInput.val() === "auto" ? "favorable" : presetInput.val());
        Dialog.close();
      } catch (e) { status.text("跳转失败：" + e.message); }
    });
    box.append(form);
    setup.CHAPTER_NAV.forEach(chapter => {
      const saved = all[chapter.index];
      const button = jQuery('<button type="button" class="chapter-choice"></button>');
      button.attr("data-chapter", chapter.index)
        .text(chapter.name + (saved ? " · 真实记录：第" + (/^h(\d+)/.exec(saved.passage) || [0, ""])[1] + "话" : " · 已解锁测试"));
      button.on("click", function () {
        try {
          if (presetInput.val() === "auto") jump(chapter.index);
          else testJump(chapter.entries[0].passage, presetInput.val());
          Dialog.close();
        }
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
  return Object.freeze({ open: open, jump: jump, testJump: testJump, undo: undo, records: records, appendRoutes: appendRoutes });
})();

/* ---------- 素材 ---------- */
setup.assetPath = function (id) {
  if (setup.ASSETS[id]) return setup.ASSETS[id];
  const i = id.indexOf("/");
  const kind = id.slice(0, i), name = id.slice(i + 1);
  const ext = { bg: ".jpg", cg: ".jpg", char: ".png", bgm: ".mp3", sfx: ".mp3" }[kind] || "";
  return "assets/" + kind + "/" + name + ext;
};

/* ---------- 舞台模式 ----------
   带章节标签 c0…c7 的段落（剧情话、选项、过渡段）用“固定一屏、逐句推进”的竖屏舞台演出；
   标题、结局一览、音源署名、青丘书房补课仍是可滚动页面。 */
setup.isStage = function (name) {
  try {
    const t = Story.get(name || State.passage).tags;
    return t.some(function (x) { return /^c\d+$/.test(x); }) && !t.includes("dojo");
  } catch (e) { return false; }
};

/* 舞台模式下，演出宏不再在渲染时立刻执行，而是在正文里留下一个“事件标记”；
   由 setup.vn（见文末）按剧情顺序、随点按逐步执行，避免背景/人物/声音抢跑到后文。 */
function qfEvent(out, data) {
  jQuery('<span class="qf-ev"></span>').attr("data-ev", JSON.stringify(data)).appendTo(out);
}

Macro.add("bg", {
  handler() {
    const id = this.args[0], cap = this.args[1] || "";
    if (setup.isStage()) { qfEvent(this.output, { k: "bg", id: id, cap: cap }); return; }
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
    if (setup.isStage()) { qfEvent(this.output, { k: "expr", who: this.args[0], e: this.args[1] }); return; }
    const v = State.variables;
    if (!v.expr) v.expr = {};
    v.expr[this.args[0]] = this.args[1];
  },
});

/* 舞台模式下，说话人的立绘由舞台层显示，不再用小头像替代主立绘；只有可滚动页面（补课）保留头像。 */
Macro.add("face", {
  handler() {
    if (setup.isStage()) return;
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
    if (setup.isStage()) { qfEvent(this.output, { k: "hua", no: this.args[0], title: this.args[1] }); return; }
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
    return setup.ADMIN_CHAPTERS.some(function (c) { return c.entries.some(function (e) { return e.passage === name; }); })
      || setup.ROUTES.some(function (route) { return route.ending === name; });
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
    // 跳章要同时重置演出状态：否则进入新章会残留上一章的背景、人物与音乐。
    v.used = {}; v.expr = {}; v.bgm = null; v.stage = setup.freshStage();
    delete v.qfStep; delete v.qfSeen;
    pending = null;
  });
  function jump(name, preset) {
    if (!enabled) throw new Error("请从 admin.html 打开管理员试玩版。");
    if (!entry(name) || !Story.has(name)) throw new Error("章节入口不存在。");
    if (!Object.prototype.hasOwnProperty.call(presets, preset)) throw new Error("测试预设不存在。");
    const previous = Save.base64.save();
    pending = { passage: name, preset: preset };
    setup.audio.reset();
    setup.vn.reset();
    try { Engine.play(name); }
    finally { pending = null; }
    backup = previous;
  }
  async function undo() {
    if (!enabled || !backup) return;
    const saved = backup;
    setup.audio.reset();
    setup.vn.reset();
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
    setup.chapterSelect.appendRoutes(form, status, function (name, preset, values) {
      const previous = Save.base64.save();
      setup.chapterSelect.testJump(name, preset, values);
      backup = previous;
    });
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
  return Object.freeze({ enabled: enabled, open: open, jump: jump, undo: undo, presets: presets });
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

Macro.add("bgm", {
  handler() {
    if (setup.isStage()) qfEvent(this.output, { k: "bgm", id: this.args[0] || null });
    else setup.audio.bgm(this.args[0]);
  },
});
Macro.add("sfx", {
  handler() {
    if (setup.isStage()) qfEvent(this.output, { k: "sfx", id: this.args[0] });
    else setup.audio.sfx(this.args[0]);
  },
});
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
  const endingGroups = [{ name: "结局路线（同级）", list: setup.ENDINGS.filter(e => e.he) }]
    .concat(setup.CHAPTERS.map((name, ci) => ({ name: name, list: setup.ENDINGS.filter(e => !e.he && e.chap === ci) })));
  endingGroups.forEach(function (group) {
    const name = group.name, list = group.list;
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
    // 舞台模式：等演出推进到该选项画面时再存，检查点里带着“停在选项处”的游标。
    if (setup.isStage()) { qfEvent(this.output, { k: "cp", id: id }); return; }
    setup.cpSave(id);
  },
});
setup.cpSave = function (id) {
  try {
    const all = setup.cpAll();
    all[id] = { s: Save.base64.save(), t: Date.now() };
    localStorage.setItem(setup.storageKey("cp"), JSON.stringify(all));
  } catch (e) { /* 存储不可用或已满：静默跳过 */ }
};
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
