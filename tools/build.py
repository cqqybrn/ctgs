#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 script/chapters/*.md 编译成 SugarCube 网页游戏 index.html，
并生成素材插槽清单 assets/manifest.json 与 assets/README.md。

用法（在仓库根目录）：
    python3 tools/build.py            # 生成 index.html + 素材清单
    python3 tools/build.py --check    # 只做检查，不写文件
"""
import html, json, os, re, sys, uuid, glob, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import asset_meta as M  # noqa: E402

CHAPTER_NAMES = ["序章", "第一章·创氏改名", "第二章·京城站", "第三章·辞典", "第四章·黑岩",
                 "第五章·府民馆", "第六章·解放", "终章·反民特委"]
SKIP_HUA = {8}           # 演出模板，不生成
GALLERY_HUA = 89         # 结局一览，由程序生成
EPILOGUE_RANGE = range(83, 87)

warnings = []
def warn(msg):
    warnings.append(msg)

# ---------------------------------------------------------------- 读入与切分
def load_huas():
    huas = []
    files = sorted(glob.glob(os.path.join(ROOT, "script", "chapters", "0*.md")))
    for ci, f in enumerate(files):
        chap = CHAPTER_NAMES[ci] if ci < len(CHAPTER_NAMES) else os.path.basename(f)
        cur = None
        for raw in open(f, encoding="utf-8"):
            line = raw.rstrip("\n").replace("\t", "    ")
            m = re.match(r"## 第(\d+)话\s*(.*)", line)
            if m:
                n = int(m.group(1))
                cur = {"n": n, "title": m.group(2).strip(), "chap": ci, "lines": []}
                # 第80话以后归入"尾声"
                if n >= 80:
                    cur["chap"] = len(CHAPTER_NAMES)
                huas.append(cur)
                continue
            m = re.match(r"### (?:结局[^：:]*[：:])?\s*(.+)", line)
            if m and cur is not None:
                cur = {"n": cur["n"], "sub": m.group(1).strip(), "title": cur["title"], "chap": cur["chap"], "lines": []}
                huas.append(cur)
                continue
            if cur is not None:
                s = line.strip()
                cur["lines"].append((len(line) - len(line.lstrip(" ")), s))
    return huas

# ---------------------------------------------------------------- 素材插槽
slots = collections.OrderedDict()   # id -> dict
def slot(kind, name, hua, extra=None):
    sid = f"{kind}/{name}"
    s = slots.get(sid)
    if not s:
        s = {"id": sid, "type": kind, "name": name,
             "file": f"{M.STYLE[kind]['dir']}/{name}{M.STYLE[kind]['ext']}",
             "used_in": []}
        if extra:
            s.update(extra)
        slots[sid] = s
    if hua is not None and hua not in s["used_in"]:
        s["used_in"].append(hua)
    return sid

def bg_name(fn):
    name = re.sub(r"\.(jpg|jpeg|png|webp)$", "", fn.strip())
    if name == "1940年大事记":
        name = "大事记_1940"
    return name

def char_name(fn):
    base = re.sub(r"\.(png|jpg)$", "", fn.strip())
    parts = base.split("_", 1)
    who, expr = parts[0], (parts[1] if len(parts) > 1 else "常态")
    who, expr = M.CHAR_ALIAS.get((who, expr), (who, expr))
    return who, expr

def bgm_slot(text):
    t = text.strip()
    base = re.split(r"[（(]", t.strip("《》 "))[0].strip("《》 ")
    if not base:
        return None
    if base in M.BGM_ALIAS:
        return M.BGM_ALIAS[base]
    return base

def sfx_slot(text):
    t = text.strip()
    if t in M.SFX_ALIAS:
        return M.SFX_ALIAS[t]
    base = re.split(r"[（(]", t)[0].strip()
    return M.SFX_ALIAS.get(base, base)

# ---------------------------------------------------------------- 解析为树
CTL = re.compile(r"^（(跳出循环|重新选择|重新推理|返回选择.*|进入下一步|此选项不可再选)）$")

def simple_node(s, hua):
    """把一行非结构文本转换为节点；返回 None 表示忽略。"""
    if s.startswith("★数值"):
        return {"k": "set", "expr": s.split("：", 1)[1] if "：" in s else s[3:]}
    m = re.match(r"⇒\s*跳转[：:]?\s*第(\d+)话\s*(.*)$", s)
    if m:
        return {"k": "jump", "to": int(m.group(1)), "title": m.group(2).strip()}
    if s.startswith("★【剧终】"):
        return {"k": "end", "name": s[len("★【剧终】"):].strip()}
    m = CTL.match(s)
    if m:
        w = m.group(1)
        if w == "跳出循环":
            return {"k": "ctl", "w": "break"}
        if w == "进入下一步":
            return {"k": "ctl", "w": "next"}
        if w == "此选项不可再选" or "不可再选" in w:
            return {"k": "ctl", "w": "disable"}
        return {"k": "ctl", "w": "rechoice"}
    m = re.match(r"🖼\s*(背景|CG)[：:]\s*(.+)", s)
    if m:
        kind = "cg" if m.group(1) == "CG" else "bg"
        name = bg_name(m.group(2))
        if name in ("黑屏", "白屏"):
            return None
        return {"k": "bg", "slot": slot(kind, name, hua), "cap": name.replace("_", " · ")}
    m = re.match(r"🖼\s*立绘[：:]\s*(.+)", s)
    if m:
        who, expr = char_name(m.group(1))
        slot("char", f"{who}_{expr}", hua, {"who": who, "expr": expr})
        return {"k": "char", "who": who, "expr": expr}
    if s.startswith("🖼"):
        return None
    if s.startswith("♪ BGM淡出"):
        return {"k": "bgm", "slot": None}
    m = re.match(r"♪\s*BGM[：:]\s*(.+)", s)
    if m:
        b = bgm_slot(m.group(1))
        return {"k": "bgm", "slot": slot("bgm", b, hua) if b else None}
    m = re.match(r"♪\s*音效[：:]\s*(.+)", s)
    if m:
        n = sfx_slot(m.group(1))
        return {"k": "sfx", "slot": slot("sfx", n, hua), "label": m.group(1).strip()}
    if s.startswith("♪"):
        return None
    m = re.match(r"≫\s*(.+)", s)
    if m:
        w = m.group(1)
        if w.startswith("黑屏渐入"):
            return {"k": "page"}
        if w.startswith("连响四枪"):
            return {"k": "shot", "n": 4, "slot": slot("sfx", "连响四枪", hua)}
        if w.startswith("一声枪响"):
            return {"k": "shot", "n": 1, "slot": slot("sfx", "枪声", hua)}
        if w.startswith("白屏"):
            return {"k": "flash"}
        return None
    if s.startswith(("#", ">", "---", "|", "- ", "**")) or s in ("---",):
        return None
    return {"k": "line", "s": s}

def parse(L, i, stop, hua):
    nodes = []
    n = len(L)
    while i < n:
        ind, s = L[i]
        if not s:
            i += 1
            continue
        if ind <= stop:
            break
        if s.startswith("┐如果"):
            cond = s.split("：", 1)[1] if "：" in s else ""
            body, i = parse(L, i + 1, ind, hua)
            branches, els = [(cond, body)], None
            while i < n:
                while i < n and not L[i][1]:
                    i += 1
                if i >= n or L[i][0] != ind:
                    break
                t = L[i][1]
                if t.startswith("├否则如果"):
                    c2 = t.split("：", 1)[1] if "：" in t else ""
                    b2, i = parse(L, i + 1, ind, hua)
                    branches.append((c2, b2))
                elif t.startswith("├否则"):
                    els, i = parse(L, i + 1, ind, hua)
                elif t.startswith("└") and not t.startswith("└循环"):
                    i += 1
                    break
                else:
                    break
            nodes.append({"k": "if", "br": branches, "els": els})
            continue
        if s.startswith("┐循环"):
            body, i = parse(L, i + 1, ind, hua)
            while i < n and not L[i][1]:
                i += 1
            if i < n and L[i][1].startswith("└循环结束"):
                i += 1
            else:
                warn(f"第{hua}话：循环缺少 └循环结束")
            nodes.append({"k": "loop", "body": body})
            continue
        if s.startswith("▶"):
            j = i + 1
            while j < n and not L[j][1]:
                j += 1
            if j < n and L[j][1].startswith("◆") and L[j][0] >= ind:
                opts, i = parse_opts(L, j, L[j][0], hua)
                nodes.append({"k": "choice", "prompt": s, "opts": opts})
            else:
                nodes.append({"k": "prompt", "prompt": s})
                i += 1
            continue
        if s.startswith("◆"):
            opts, i = parse_opts(L, i, ind, hua)
            nodes.append({"k": "choice", "prompt": None, "opts": opts})
            continue
        if s.startswith("├") or s.startswith("└"):
            warn(f"第{hua}话：多余的结构行 {s[:20]}")
            i += 1
            continue
        nd = simple_node(s, hua)
        if nd:
            nodes.append(nd)
        i += 1
    return merge_prompt_if(nodes, hua), i

def parse_opts(L, i, j, hua):
    opts = []
    n = len(L)
    while i < n:
        while i < n and not L[i][1]:
            i += 1
        if i >= n or L[i][0] != j or not L[i][1].startswith("◆"):
            break
        t = L[i][1]
        m = re.match(r"◆\[(.*)\]\s*$", t)
        label = m.group(1) if m else t[1:].strip("[] ")
        body, i = parse(L, i + 1, j, hua)
        opts.append({"label": label, "body": body, "cond": None})
    return opts, i

def split_prompt(p):
    """'▶ 选择：A ／ B（需 X） ／ C' -> (question, [(label, cond)])"""
    rest = p.split("：", 1)[1] if "：" in p else p[1:]
    segs = [x.strip() for x in re.split(r"\s*／\s*", rest)]
    out = []
    for sg in segs:
        cond = None
        m = re.search(r"（需\s*(.+?)）\s*$", sg)
        if m:
            cond = m.group(1)
            sg = sg[:m.start()].strip()
        out.append((sg, cond))
    return out

def attach_prompt(choice, hua):
    """把 ▶ 行里的"需"条件和问题文字挂到选项上。"""
    if not choice.get("prompt"):
        return
    segs = split_prompt(choice["prompt"])
    q = None
    for o in choice["opts"]:
        for k, (sg, cond) in enumerate(segs):
            if sg == o["label"] or sg.endswith(" " + o["label"]) or (k == 0 and sg.endswith(o["label"])):
                if cond:
                    o["cond"] = cond
                if k == 0 and sg != o["label"]:
                    q = sg[: -len(o["label"])].strip()
                break
    if q:
        choice["ask"] = q

def merge_prompt_if(nodes, hua):
    out = []
    i = 0
    while i < len(nodes):
        nd = nodes[i]
        if (nd["k"] == "if" and i + 1 < len(nodes) and nodes[i + 1]["k"] == "choice"
                and nodes[i + 1]["prompt"] is None
                and all(len(b) == 1 and b[0]["k"] == "prompt" for _, b in nd["br"])
                and (nd["els"] is None or (len(nd["els"]) == 1 and nd["els"][0]["k"] == "prompt"))):
            ch = nodes[i + 1]
            branches = list(nd["br"])
            prev = [c for c, _ in branches]
            if nd["els"]:
                branches.append(("!(" + " || ".join(f"({cond(c)})" for c in prev) + ")", nd["els"]))
            for o in ch["opts"]:
                conds, every = [], True
                for c, b in branches:
                    labels = [sg for sg, _ in split_prompt(b[0]["prompt"])]
                    if o["label"] in labels:
                        conds.append(c if c.startswith("!(") else f"({cond(c)})")
                    else:
                        every = False
                if not every and conds:
                    o["cond_js"] = " || ".join(conds)
            out.append(ch)
            i += 2
            continue
        if nd["k"] == "choice":
            attach_prompt(nd, hua)
        out.append(nd)
        i += 1
    return out

# ---------------------------------------------------------------- 表达式
def var_js(m):
    return f"$v{m.group(1)}"

def cond(c):
    c = c.strip().rstrip("：:")
    c = re.sub(r"\[(\d{3})(?::[^\]]*)?\]", var_js, c)
    c = (c.replace("≥", ">=").replace("≤", "<=").replace("＜", "<").replace("＞", ">")
           .replace("≠", "!==").replace("＝", "=").replace("且", "&&").replace("或", "||"))
    c = re.sub(r"(?<![<>!=])=(?!=)", "===", c)
    if not re.fullmatch(r"[\s$v\d<>=!&|()+\-]+", c):
        warn(f"无法转换的条件：{c}")
        return "false"
    return c

def set_stmt(expr, hua):
    e = re.sub(r"（[^）]*）\s*$", "", expr.strip())
    m = re.match(r"\[(\d{3})(?::[^\]]*)?\]\s*(\+=|-=|=)\s*(.+)$", e)
    if not m:
        warn(f"第{hua}话：无法解析的数值语句 {expr}")
        return ""
    rhs = re.sub(r"\[(\d{3})(?::[^\]]*)?\]", var_js, m.group(3).strip())
    if not re.fullmatch(r"[\s$v\d+\-*]+", rhs):
        warn(f"第{hua}话：无法解析的右值 {rhs}")
        return ""
    op = "to" if m.group(2) == "=" else m.group(2)
    used_vars.add(m.group(1))
    for v in re.findall(r"\$v(\d{3})", rhs):
        used_vars.add(v)
    return f"<<set $v{m.group(1)} {op} {rhs}>>"

used_vars = set()

# ---------------------------------------------------------------- 渲染
def verb(t):
    t = t.replace("\\|", "").replace("\\.", "").replace('"""', "“")
    parts = re.split(r"\*\*(.+?)\*\*", t)
    out = []
    for k, p in enumerate(parts):
        if not p:
            continue
        out.append(f'<b>"""{p}"""</b>' if k % 2 else f'"""{p}"""')
    return "".join(out)

def render_line(s):
    m = re.match(r"【([^】]+)】\s*(.*)$", s)
    if m:
        who, t = m.group(1), m.group(2)
        if not t:
            return ""
        if who == "旁白":
            return f'<p class="n">{verb(t)}</p>'
        if who == "你":
            return f'<p class="say you"><span class="who">你</span><span class="t">{verb(t)}</span></p>'
        face = f'<<face "{who}">>' if who in M.FACE_CAST else ""
        return (f'<p class="say">{face}<span class="who">{html.escape(who)}</span>'
                f'<span class="t">{verb(t)}</span></p>')
    m = re.match(r"（你心想[：:](.*)）$", s)
    if m:
        return f'<p class="think">{verb(m.group(1))}</p>'
    if s.startswith("💡"):
        t = re.sub(r"^💡\s*提示[：:]?\s*", "", s)
        return f'<details class="hint"><summary>提示</summary><p>{verb(t)}</p></details>'
    if s.startswith("（") and s.endswith("）"):
        return f'<p class="stage">{verb(s[1:-1])}</p>'
    return f'<p class="n">{verb(s)}</p>'

def q(s):
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'

def link(label, target, extra=""):
    return f"<<link {q(label)} {q(target)}>>{extra}<</link>>"

def inc(name):
    return f"<<include {q(name)}>>"

# ---------------------------------------------------------------- 编译
passages = collections.OrderedDict()
ptags = {}
endings = []
epi_map = {}          # 结局名 -> 日后谈话号
counter = collections.Counter()

def newp(hua, chap):
    counter[hua] += 1
    name = f"h{hua}.{counter[hua]}"
    passages[name] = None
    ptags[name] = [f"c{chap}"]
    return name

def has_text(nodes):
    for nd in nodes:
        if nd["k"] in ("line", "choice", "if", "loop"):
            return True
    return False

def contains(nodes, kinds):
    for nd in nodes:
        if nd["k"] in kinds:
            return True
        if nd["k"] == "if":
            if any(contains(b, kinds) for _, b in nd["br"]) or (nd["els"] and contains(nd["els"], kinds)):
                return True
        if nd["k"] == "loop" and contains(nd["body"], kinds):
            return True
        if nd["k"] == "choice" and any(contains(o["body"], kinds) for o in nd["opts"]):
            return True
    return False

def rest_ref(rest, ctx):
    if not rest:
        return ctx["cont"]
    if not has_text(rest) and not contains(rest, {"jump", "end", "ctl", "choice", "if", "loop"}):
        # 只有演出指令：直接内联
        return comp(rest, ctx)
    name = newp(ctx["hua"], ctx["chap"])
    passages[name] = comp(rest, ctx)
    return inc(name)

def comp(nodes, ctx):
    out = []
    i = 0
    while i < len(nodes):
        nd = nodes[i]
        k = nd["k"]
        if k == "line":
            out.append(render_line(nd["s"]))
        elif k == "set":
            out.append(set_stmt(nd["expr"], ctx["hua"]))
        elif k == "bg":
            out.append(f'<<bg {q(nd["slot"])} {q(nd["cap"])}>>')
        elif k == "char":
            out.append(f'<<expr {q(nd["who"])} {q(nd["expr"])}>>')
        elif k == "bgm":
            out.append(f'<<bgm {q(nd["slot"])}>>' if nd["slot"] else "<<bgm>>")
        elif k == "sfx":
            out.append(f'<<sfx {q(nd["slot"])}>>')
        elif k == "shot":
            out.append(f'<<sfx {q(nd["slot"])}>><p class="shot">' + ("砰！" * nd["n"]) + "</p>")
        elif k == "flash":
            out.append('<p class="flash"></p>')
        elif k == "prompt":
            pass
        elif k == "page":
            rest = nodes[i + 1:]
            so_far = any(x.startswith(("<p", "<div", "<details")) for x in out)
            if so_far and has_text(rest):
                name = newp(ctx["hua"], ctx["chap"])
                passages[name] = comp(rest, ctx)
                out.append('<hr class="fade">')
                out.append(f'<div class="choices next">{link("继续", name)}</div>')
                return "\n".join(out)
            if so_far:
                out.append('<hr class="fade">')
        elif k == "jump":
            to = nd["to"]
            target = resolve(to, nd.get("title", ""))
            jump_targets.add(target)
            out.append(f'<div class="choices next">{link("继续", target)}</div>')
            return "\n".join(out)
        elif k == "end":
            tail = []
            j = i + 1
            while j < len(nodes) and nodes[j]["k"] in ("line",):
                tail.append(nodes[j]["s"])
                j += 1
            out.append(render_end(nd["name"], tail, ctx))
            return "\n".join(out)
        elif k == "ctl":
            w = nd["w"]
            if w == "next":
                pass
            elif w == "break":
                if ctx.get("brk") is None:
                    warn(f"第{ctx['hua']}话：循环外出现（跳出循环）")
                else:
                    out.append(ctx["brk"])
                    return "\n".join(out)
            elif w in ("rechoice", "disable"):
                if ctx.get("choice") is None:
                    warn(f"第{ctx['hua']}话：选项外出现返回选择标记")
                else:
                    if w == "disable":
                        out.append(f'<<set $used[{q(ctx["opt_id"])}] to true>>')
                    out.append(inc(ctx["choice"]))
                    return "\n".join(out)
        elif k == "choice":
            R = rest_ref(nodes[i + 1:], ctx)
            C = newp(ctx["hua"], ctx["chap"])
            parts = []
            if nd.get("ask"):
                parts.append(f'<p class="ask">{verb(nd["ask"])}</p>')
            parts.append('<div class="choices">')
            for kk, o in enumerate(nd["opts"]):
                O = newp(ctx["hua"], ctx["chap"])
                oid = f"{C}/{kk}"
                octx = dict(ctx, cont=R, choice=C, opt_id=oid)
                label = re.sub(r"（需.+?）", "", o["label"]).strip()
                passages[O] = f'<p class="picked">{verb(label)}</p>\n' + comp(o["body"], octx)
                conds = []
                if o.get("cond_js"):
                    conds.append(o["cond_js"])
                elif o.get("cond"):
                    conds.append(cond(o["cond"]))
                if contains(o["body"], {"ctl"}) and has_disable(o["body"]):
                    conds.append(f'!$used[{q(oid)}]')
                lk = f'<div class="opt">{link(label, O)}</div>'
                if conds:
                    lk = f'<<if {" && ".join("(" + c + ")" for c in conds)}>>{lk}<</if>>'
                parts.append(lk)
            parts.append("</div>")
            passages[C] = "\n".join(parts)
            out.append(inc(C))
            return "\n".join(out)
        elif k == "if":
            R = rest_ref(nodes[i + 1:], ctx)
            seg = []
            for bi, (c, body) in enumerate(nd["br"]):
                seg.append(f"<<{'if' if bi == 0 else 'elseif'} {cond(c)}>>")
                seg.append(comp(body, dict(ctx, cont=R)))
            seg.append("<<else>>")
            seg.append(comp(nd["els"], dict(ctx, cont=R)) if nd["els"] is not None else R)
            seg.append("<</if>>")
            out.append("\n".join(seg))
            return "\n".join(out)
        elif k == "loop":
            if not contains(nd["body"], {"choice"}):
                warn(f"第{ctx['hua']}话：循环体里没有选项，按普通段落处理")
                out.append(comp(nd["body"] + nodes[i + 1:], ctx))
                return "\n".join(out)
            A = rest_ref(nodes[i + 1:], ctx)
            Lp = newp(ctx["hua"], ctx["chap"])
            passages[Lp] = comp(nd["body"], dict(ctx, cont=inc(Lp), brk=A, choice=None))
            out.append(inc(Lp))
            return "\n".join(out)
        i += 1
    out.append(ctx["cont"])
    return "\n".join(out)

def has_disable(nodes):
    for nd in nodes:
        if nd["k"] == "ctl" and nd["w"] == "disable":
            return True
        if nd["k"] == "if":
            if any(has_disable(b) for _, b in nd["br"]) or (nd["els"] and has_disable(nd["els"])):
                return True
    return False

def render_end(name, tail, ctx):
    eid = f"h{ctx['hua']}-{name}"
    he = name.startswith("HE")
    endings.append({"id": eid, "name": name, "hua": ctx["hua"], "chap": ctx["chap"], "he": he})
    parts = [f'<div class="ending{" he" if he else ""}"><span class="mark">{"终" if he else "剧终"}</span>'
             f'<span class="name">{html.escape(name)}</span></div>',
             f"<<run setup.markEnd({q(eid)})>>"]
    hints = [t for t in tail if t.startswith("💡")]
    others = [t for t in tail if not t.startswith("💡")]
    parts += [render_line(t) for t in others]
    parts += [render_line(t) for t in hints]
    links = ['<<link "退回上一步">><<run Engine.backward()>><</link>>',
             '<<link "读取存档">><<run UI.saves()>><</link>>',
             link("结局一览", "结局一览"),
             '<<link "回到标题">><<run setup.toTitle()>><</link>>']
    epi = epi_map.get(name)
    if epi:
        links.insert(0, link("日后谈", f"h{epi}"))
    parts.append('<nav class="after">' + "".join(links) + "</nav>")
    return "\n".join(parts)

jump_targets = set()

subs = collections.defaultdict(list)
def resolve(n, title):
    for sub in subs.get(n, []):
        if title and (title == sub or title.startswith(sub) or sub in title):
            return f"h{n}~{sub}"
    if f"h{n}" in passages or n not in subs:
        return f"h{n}"
    return f"h{n}~{subs[n][0]}"

def build_passages(huas):
    for h in huas:
        if h.get("sub"):
            subs[h["n"]].append(h["sub"])
    for h in huas:
        m = re.search(r"（对应\s*(.+?)）", h["title"])
        if m and h["n"] in EPILOGUE_RANGE:
            for nm in re.split(r"[、，,]", m.group(1)):
                epi_map[nm.strip()] = h["n"]
    for h in huas:
        n = h["n"]
        if n in SKIP_HUA or n == GALLERY_HUA:
            continue
        nodes, _ = parse(h["lines"], 0, -1, n)
        if not h.get("sub") and n in subs and not has_text(nodes):
            continue
        name = f"h{n}~{h['sub']}" if h.get("sub") else f"h{n}"
        passages[name] = None
        ptags[name] = [f"c{h['chap']}", "hua"]
        if n in EPILOGUE_RANGE:
            cont = '<nav class="after">' + link("结局一览", "结局一览") + \
                   '<<link "回到标题">><<run setup.toTitle()>><</link>></nav>'
        else:
            cont = '<p class="stage">（剧本此处没有后续）</p><nav class="after"><<link "回到标题">><<run setup.toTitle()>><</link>></nav>'
        ctx = {"hua": n, "chap": h["chap"], "cont": cont, "brk": None, "choice": None}
        title = re.sub(r"（对应.*?）", "", h["title"])
        head = f'<<hua {q(str(n))} {q(title)}>>\n'
        passages[name] = head + comp(nodes, ctx)

# ---------------------------------------------------------------- 素材清单
def describe(s):
    t = s["type"]
    st = M.STYLE[t]
    if t in ("bg", "cg"):
        parts = s["name"].split("_")
        loc = M.LOC.get(parts[0], parts[0])
        mods = [M.TIME.get(p, p) for p in parts[1:]]
        scene = loc + ("；" + "，".join(mods) if mods else "")
        return f"{st['style']} 场景：{scene}。"
    if t == "char":
        who, expr = s["who"], s["expr"]
        look = M.CHAR.get(who, who)
        return f"{st['style']} 人物：{look} 表情/状态：{M.EXPR.get(expr, expr)}。"
    if t == "bgm":
        return f"{st['style']} {M.BGM.get(s['name'], s['name'])}"
    if t == "sfx":
        return f"{st['style']} 音效：{M.SFX_EXTRA.get(s['name'], s['name'])}"
    return ""

def finish_slots(huas):
    speakers = collections.Counter()
    for h in huas:
        for _, s in h["lines"]:
            m = re.match(r"【([^】]+)】", s)
            if m:
                speakers[m.group(1)] += 1
    for who in M.FACE_CAST:
        if speakers[who] or any(x.get("who") == who for x in slots.values()):
            slot("char", f"{who}_常态", None, {"who": who, "expr": "常态"})
    for e in ("常态", "微笑", "憔悴"):
        slot("char", f"姜仁宇_{e}", None, {"who": "姜仁宇", "expr": e, "note": "主角立绘，目前用于标题与将来的 CG，对话中不显示"})
    slot("bgm", "主题", None, {"note": "标题画面"})
    for s in slots.values():
        s["prompt"] = describe(s)
        s["spec"] = M.STYLE[s["type"]]["spec"]
        s["present"] = os.path.exists(os.path.join(ROOT, s["file"]))

def write_manifest():
    order = {"bg": 0, "cg": 1, "char": 2, "bgm": 3, "sfx": 4}
    items = sorted(slots.values(), key=lambda s: (order[s["type"]], s["id"]))
    data = {
        "说明": "素材插槽清单。按 file 路径放入文件即可生效；present 由 tools/build.py 检查文件是否存在后写入。",
        "style": {k: {"spec": v["spec"], "style": v["style"]} for k, v in M.STYLE.items()},
        "characters": M.CHAR,
        "slots": items,
    }
    with open(os.path.join(ROOT, "assets", "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    return items

def write_assets_readme(items):
    cnt = collections.Counter(s["type"] for s in items)
    have = collections.Counter(s["type"] for s in items if s["present"])
    names = {"bg": "场景背景", "cg": "事件插图", "char": "人物立绘", "bgm": "配乐", "sfx": "音效"}
    L = ["# 素材插槽说明（给美术 / 音频生成用）", "",
         "游戏按固定路径加载素材：文件放到下表的路径就会自动出现，缺失的插槽会被安全跳过。",
         "完整清单（含每个插槽的生成提示词）在 `assets/manifest.json`，本文件由 `python3 tools/build.py` 自动生成，请勿手改。", "",
         "## 总体规范", ""]
    for t in ("bg", "cg", "char", "bgm", "sfx"):
        st = M.STYLE[t]
        L.append(f"- **{names[t]}**（`{st['dir']}/`，{have[t]}/{cnt[t]} 已就位）：{st['spec']} {st['style']}")
    L += ["", "## 生成流程建议", "",
          "1. 先按「人物设定」为每个角色生成 `常态` 立绘，确定长相后，再以它为参考图生成其余表情和服装，保证同一人物前后一致。",
          "2. 背景按地点分批生成，同一地点的不同时间（白天/夜/雪…）用同一构图，只改光线和天气。",
          "3. 配乐需可无缝循环；音效开头不留空白。",
          "4. 放好文件后运行 `python3 tools/build.py`，清单里的 `present` 会更新为 true，然后提交。", "",
          "## 人物设定", ""]
    for who, look in M.CHAR.items():
        L.append(f"- **{who}**：{look}")
    L += [""]
    for t in ("bg", "cg", "char", "bgm", "sfx"):
        L += [f"## {names[t]}", "", "| 文件 | 用到的话 | 描述 |", "|---|---|---|"]
        for s in items:
            if s["type"] != t:
                continue
            desc = s["prompt"].replace(M.STYLE[t]["style"], "").strip()
            used = "、".join(str(x) for x in s["used_in"][:6]) + ("…" if len(s["used_in"]) > 6 else "")
            mark = "✅ " if s["present"] else ""
            L.append(f"| {mark}`{s['file']}` | {used or '—'} | {desc} |")
        L.append("")
    with open(os.path.join(ROOT, "assets", "README.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(L))

# ---------------------------------------------------------------- 输出 HTML
def build_html(huas):
    with open(os.path.join(ROOT, "tools", "story.css"), encoding="utf-8") as f:
        css = f.read()
    with open(os.path.join(ROOT, "tools", "story.js"), encoding="utf-8") as f:
        js = f.read()
    with open(os.path.join(ROOT, "tools", "ui.tw"), encoding="utf-8") as f:
        ui = f.read()
    # 固定界面段落
    for m in re.finditer(r"^:: (\S+)(?: \[([^\]]*)\])?\n(.*?)(?=^:: |\Z)", ui, re.S | re.M):
        passages[m.group(1)] = m.group(3).strip()
        ptags[m.group(1)] = (m.group(2) or "").split()
    init = ["<<set $used to {}>>", "<<set $expr to {}>>", "<<set $bgm to null>>"]
    for v in sorted(used_vars | {f"{x:03d}" for x in range(1, 33)}):
        init.append(f"<<set $v{v} to 0>>")
    passages["StoryInit"] = "\n".join(init)
    chap_names = CHAPTER_NAMES + ["尾声"]
    data_js = ("setup.CHAPTERS = " + json.dumps(chap_names, ensure_ascii=False) + ";\n"
               "setup.ENDINGS = " + json.dumps(endings, ensure_ascii=False) + ";\n"
               "setup.EPILOGUE = " + json.dumps(epi_map, ensure_ascii=False) + ";\n"
               "setup.ASSETS = " + json.dumps({s["id"]: s["file"] for s in slots.values()}, ensure_ascii=False) + ";\n")
    with open(os.path.join(ROOT, "tools", "sugarcube", "format.js"), encoding="utf-8") as f:
        src = f.read()
    src = src[src.index("{"): src.rindex("}") + 1]
    fmt = json.loads(src)
    names = list(passages.keys())
    start_pid = names.index("Start") + 1
    pd = []
    for k, name in enumerate(names, 1):
        body = passages[name] or ""
        tags = " ".join(ptags.get(name, []))
        pd.append(f'<tw-passagedata pid="{k}" name="{html.escape(name, quote=True)}" tags="{html.escape(tags, quote=True)}" '
                  f'position="{100 * (k % 50)},{100 * (k // 50)}" size="100,100">{html.escape(body, quote=True)}</tw-passagedata>')
    ifid = "B7D3C1E2-6A4F-4C1B-9E0D-5A1F2C3B4D5E"
    sd = (f'<tw-storydata name="潜伏之京城" startnode="{start_pid}" creator="tools/build.py" creator-version="1.0" '
          f'ifid="{ifid}" zoom="1" format="SugarCube" format-version="{fmt["version"]}" options="" hidden>'
          f'<style role="stylesheet" id="twine-user-stylesheet" type="text/twine-css">{css}</style>'
          f'<script role="script" id="twine-user-script" type="text/twine-javascript">{data_js}{js}</script>'
          + "".join(pd) + "</tw-storydata>")
    out = fmt["source"].replace("{{STORY_NAME}}", "潜伏之京城").replace("{{STORY_DATA}}", sd)
    head_extra = ('<meta name="claude:viewport-fit-sides" content="cover">\n'
                  '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
                  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&family=Noto+Serif+SC:wght@400;600;900&family=Noto+Serif+KR:wght@400;600&display=swap">\n')
    out = out.replace("</head>", head_extra + "</head>", 1)
    out = out.replace('<meta name="viewport" content="width=device-width,initial-scale=1" />',
                      '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />')
    return out, len(names)

def main():
    check_only = "--check" in sys.argv
    huas = load_huas()
    build_passages(huas)
    finish_slots(huas)
    # 引用检查
    existing = set(passages) | {"Start", "结局一览", "Bar", "StoryInterface", "StoryInit"}
    for t in sorted(jump_targets):
        if t not in passages:
            warn(f"跳转到不存在的段落 {t}")
    for name, body in passages.items():
        for tgt in re.findall(r'<<(?:link "(?:[^"\\]|\\.)*"|include) "((?:[^"\\]|\\.)*)"', body or ""):
            if tgt not in passages and tgt not in existing:
                warn(f"{name} 引用了不存在的段落 {tgt}")
    if not check_only:
        items = write_manifest()
        write_assets_readme(items)
        html_out, n = build_html(huas)
        with open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8") as f:
            f.write(html_out)
        print(f"index.html：{n} 个段落，{len(html_out)//1024} KB")
    cnt = collections.Counter(s["type"] for s in slots.values())
    print(f"结局 {len(endings)} 个；素材插槽 {dict(cnt)}；变量 {len(used_vars)} 个")
    for w in warnings:
        print("警告：", w)

if __name__ == "__main__":
    main()
