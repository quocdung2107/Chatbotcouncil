#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Hoi dong chatbot — MVP ban tu dong (Manual Clipboard Provider).
Thiet ke day du: ~/workspace/your_files/hoi-dong-chatbot-thiet-ke-vong-session-form.md

Y tuong gon nhat:
- Tri nho nam o code + SQLite (hoi_dong.db), KHONG nam trong cac hop chat.
- Moi vong, moi bot = 1 session MOI tren web. Ban tu mo New chat, dan prompt,
  bam Gui, roi copy dap an ve. Code chi chuan bi prompt + gom dap an.
- Gemini API (Google, mien phi) chi lam dieu phoi: lap ke hoach, chuan hoa
  vong, tong hop cuoi. Khoang 5 lan goi API / 1 chu de.
- KHONG tu dong bam Gui / copy dap an tu web ChatGPT/Claude/Gemini mien phi
  — do la truy cap tu dong, co nguy co khoa tai khoan (xem README).

Chi dung thu vien chuan cua Python (khong can pip install gi them).
Chay tren Windows, macOS, Linux deu duoc.

Cach dung (Windows — mo Terminal: phim Windows, go "Terminal", Enter):
    cd <thu muc chua file nay>
    set GEMINI_API_KEY=key-cua-ban          (lay key mien phi o AI Studio, xem README)
    python hoi_dong.py new "Co nen mo quan ca phe nho o Ha Noi khong?"
    python hoi_dong.py next                 (copy prompt vao clipboard + ghi ra prompt.txt)
    ... mo New chat o bot do, dan (Ctrl+V), Gui, cho tra loi, copy dap an (Ctrl+C) ...
    python hoi_dong.py save                 (luu dap an trong clipboard vao dung o)
    python hoi_dong.py next                 (lap lai cho bot / vong tiep theo)
    python hoi_dong.py status               (xem dang o vong nao, bot nao, thieu gi)
    python hoi_dong.py normalize            (sau khi du 4 dap an 1 vong: Gemini gom thanh the luan diem)
    python hoi_dong.py finalize             (sau vong 3: Gemini tong hop ket luan cuoi)

Neu chua co GEMINI_API_KEY, tool van chay o che do fallback (khong goi API):
plan dung vai mau co san, normalize tach luan diem don gian, finalize ghep
cac the lai. Ket qua kem hon ban API, nhung du de chay thu tron 1 chu de.
"""

import json
import os
import random
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

DB_PATH = Path(__file__).with_name("hoi_dong.db")
PROMPT_FILE = Path(__file__).with_name("prompt.txt")
ANSWER_FILE = Path(__file__).with_name("dap_an.txt")

BOTS = ["ChatGPT", "Claude", "Gemini", "Copilot"]
# Vai Vong 1 (theo thiet ke). Vong 2 xoay thanh phan bien cheo, Vong 3 ve lam tac gia.
ROLES_V1 = {
    "ChatGPT": "Nguoi de xuat phuong an tong the (cau truc, buoc lam)",
    "Claude": "Nguoi phan tich rui ro va phan vi du",
    "Gemini": "Nguoi bo sung goc nhin / tim kiem / da phuong tien",
    "Copilot": "Nguoi kiem chung thuc te, nguon web, tinh kha thi",
}
# Vong 2: ai phan bien bai cua ai (vong tron, khong tu phan bien minh)
CRITIQUE_OF = {"ChatGPT": "Claude", "Claude": "Gemini", "Gemini": "Copilot", "Copilot": "ChatGPT"}

MODEL_LITE = os.environ.get("GEMINI_MODEL_LITE", "gemini-3.5-flash-lite")  # Google da ngung cap 2.5 Flash-Lite cho nguoi dung moi (2026-11-19)
MODEL_FLASH = os.environ.get("GEMINI_MODEL_FLASH", "gemini-3.8-flash")  # ban Flash con dung duoc cho tai khoan moi
API_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")

FORM_V1 = """## Ket luan ngan
(toi da 3 cau)

## Luan diem chinh
1. ... — can cu: ...
2. ... — can cu: ...
(toi da 5 luan diem)

## Rui ro / diem chua chac
- ...

## Do tin cay
Cao / Trung binh / Thap — vi: ...

## Can kiem chung them
- ... (neu khong co, ghi "Khong co")
"""

FORM_V2 = """## Dong y
- [ma luan diem] ...
## Khong dong y
- [ma luan diem] ... — ly do + phan vi du: ...
## Diem bai viet bo sot
- ...
## Cham diem
- Dung dan: x/10 — Kha thi: x/10 — Day du: x/10
"""

HEADINGS_V1 = ["Ket luan ngan", "Luan diem chinh", "Rui ro", "Do tin cay", "Can kiem chung them"]
HEADINGS_V2 = ["Dong y", "Khong dong y", "Diem bai viet bo sot", "Cham diem"]


# ---------------------------------------------------------------- SQLite
def connect():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.executescript(
        """
        CREATE TABLE IF NOT EXISTS topics(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL, goal TEXT, criteria_json TEXT,
            status TEXT DEFAULT 'dang_chay', created_at TEXT DEFAULT (datetime('now')));
        CREATE TABLE IF NOT EXISTS rounds(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            topic_id INTEGER, round_no INTEGER, kind TEXT, status TEXT DEFAULT 'dang_chay');
        CREATE TABLE IF NOT EXISTS sessions(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            topic_id INTEGER, round_id INTEGER, bot TEXT, alias TEXT,
            role TEXT, session_url TEXT, status TEXT DEFAULT 'cho_prompt');
        CREATE TABLE IF NOT EXISTS answers(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER UNIQUE, raw_text TEXT, normalized_json TEXT,
            form_ok INTEGER);
        CREATE TABLE IF NOT EXISTS packets(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            round_id INTEGER, bot TEXT, prompt_text TEXT);
        CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
        """
    )
    return con


def current_topic(con):
    row = con.execute(
        "SELECT * FROM topics WHERE status='dang_chay' ORDER BY id DESC LIMIT 1"
    ).fetchone()
    return row


def current_pointer(con, topic_id):
    """Tra ve (round_no, bot) tiep theo can lam: vong thap nhat, bot som nhat chua co dap an."""
    rows = con.execute(
        """SELECT s.*, r.round_no FROM sessions s JOIN rounds r ON r.id=s.round_id
           WHERE s.topic_id=? ORDER BY r.round_no, s.id""",
        (topic_id,),
    ).fetchall()
    for s in rows:
        has = con.execute(
            "SELECT 1 FROM answers WHERE session_id=?", (s["id"],)
        ).fetchone()
        if not has:
            return s["round_no"], s
    return None, None


# ---------------------------------------------------------------- Clipboard
def copy_to_clipboard(text):
    """Co gang copy vao clipboard; luon ghi them ra prompt.txt de chac chan."""
    PROMPT_FILE.write_text(text, encoding="utf-8")
    try:
        import pyperclip  # neu may da cai san thi dung

        pyperclip.copy(text)
        return "clipboard (pyperclip)"
    except Exception:
        pass
    try:
        import tkinter

        root = tkinter.Tk()
        root.withdraw()
        root.clipboard_clear()
        root.clipboard_append(text)
        root.update()
        root.destroy()
        return "clipboard (tkinter)"
    except Exception:
        return "CHI GHI FILE prompt.txt (khong copy duoc clipboard tu dong — mo file, Ctrl+A, Ctrl+C)"


def read_clipboard():
    try:
        import pyperclip

        text = pyperclip.paste()
        if text and text.strip():
            return text
    except Exception:
        pass
    try:
        import tkinter

        root = tkinter.Tk()
        root.withdraw()
        text = root.clipboard_get()
        root.destroy()
        if text and text.strip():
            return text
    except Exception:
        pass
    return None


# ---------------------------------------------------------------- Form check
def check_form(text, round_no):
    headings = HEADINGS_V2 if round_no == 2 else HEADINGS_V1
    # Tim tieu de o dau dong ("## Ket luan ngan"), khong dung substring
    # vi "Dong y" nam trong "Khong dong y" se gay nhan nham.
    missing = [
        h
        for h in headings
        if not re.search(rf"^#+\s*{re.escape(h)}", text, re.MULTILINE | re.IGNORECASE)
    ]
    too_long = len(text) > 6000
    return {"form_ok": not missing and not too_long, "missing": missing, "too_long": too_long}


# ---------------------------------------------------------------- Gemini API
def gemini_json(model, system_text, user_text, schema, retries=3):
    """1 lan goi Gemini API, ep JSON theo schema. Gap 429 thi doi roi thu lai."""
    if not API_KEY:
        return None
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}"
        f":generateContent?key={API_KEY}"
    )
    body = {
        "systemInstruction": {"parts": [{"text": system_text}]},
        "contents": [{"parts": [{"text": user_text}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": schema,
            "temperature": 0.3,
        },
    }
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read())
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            return json.loads(text)
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="ignore")[:300]
            if e.code == 429 and attempt < retries - 1:
                wait = 20 * (attempt + 1)
                print(f"  ! API bao het quota tam thoi (429). Doi {wait}s roi thu lai...")
                time.sleep(wait)
                continue
            print(f"  ! Loi Gemini API ({e.code}): {detail}")
            print("  -> Tool se dung che do fallback cho buoc nay. Kiem tra key / quota o AI Studio > Rate limits.")
            return None
        except Exception as e:  # noqa: BLE001
            print(f"  ! Khong goi duoc Gemini API: {e}")
            return None
    return None


PLAN_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "goal": {"type": "STRING"},
        "criteria": {"type": "ARRAY", "items": {"type": "STRING"}},
        "roles": {"type": "OBJECT", "properties": {b: {"type": "STRING"} for b in BOTS}},
    },
    "required": ["goal", "criteria", "roles"],
}

NORMALIZE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "cards": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "bot": {"type": "STRING"},
                    "claims": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "id": {"type": "STRING"},
                                "text": {"type": "STRING"},
                                "basis": {"type": "STRING"},
                            },
                        },
                    },
                    "risks": {"type": "ARRAY", "items": {"type": "STRING"}},
                    "confidence": {"type": "STRING"},
                },
            },
        },
        "common_ground": {"type": "ARRAY", "items": {"type": "STRING"}},
        "disagreements": {"type": "ARRAY", "items": {"type": "STRING"}},
        "open_questions": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": ["cards"],
}

FINALIZE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "final_answer": {"type": "STRING"},
        "consensus": {"type": "ARRAY", "items": {"type": "STRING"}},
        "disputes": {"type": "ARRAY", "items": {"type": "STRING"}},
        "minority_opinion": {"type": "STRING"},
    },
    "required": ["final_answer"],
}


# ---------------------------------------------------------------- Prompt build
def build_prompt(con, topic, session, round_no):
    goal = topic["goal"] or topic["title"]
    criteria = json.loads(topic["criteria_json"] or "[]")
    criteria_text = "\n".join(f"- {c}" for c in criteria) or "- (chua co tieu chi rieng)"
    bot = session["bot"]
    role = session["role"]

    if round_no == 1:
        task = (
            f"Vai cua ban vong nay: {role}. Hay de xuat phuong an cua rieng ban, "
            "khong can biet cac bot khac nghi gi."
        )
        form = FORM_V1
        context = ""
    elif round_no == 2:
        target = CRITIQUE_OF[bot]
        cards = cards_for_round(con, topic["id"], 1)
        # An danh: doi ten bot thanh A/B/C/D, xao thu tu theo nguoi nhan
        aliases = anonymize(cards, topic["id"], round_no, bot)
        cards_text = "\n\n".join(
            f"--- Bai cua {aliases[c['bot']]} ---\n" + card_text(c) for c in cards
        )
        target_alias = aliases.get(target, "?")
        task = (
            f"Vai cua ban vong nay: phan bien bai cua {target_alias} "
            f"(bai cua bot {target} o vong 1, da an danh). "
            "Chi phan bien bai do, khong phan bien bai khac. "
            "Neu thay bai khac dung thi noi ro dong y o diem nao."
        )
        form = FORM_V2
        context = f"\n\n=== CAC BAI VONG 1 (da an danh) ===\n{cards_text}\n"
    else:  # vong 3
        mine = my_card(con, topic["id"], bot)
        critiques = critiques_about_me(con, topic["id"], bot)
        task = (
            "Vai cua ban vong nay: tac gia sua lai bai cua chinh minh. "
            "Doc cac phan bien ve bai cua ban, sua nhung cho dung, "
            "giu lai nhung cho ban van bao ve duoc va giai thich vi sao."
        )
        form = FORM_V1
        context = (
            f"\n\n=== BAI GOC CUA BAN (VONG 1) ===\n{mine}\n\n"
            f"=== CAC PHAN BIEN VE BAI CUA BAN (VONG 2) ===\n{critiques}\n"
        )

    prompt = f"""[HOI DONG — Chu de: {topic['title']} — Vong {round_no}/3 — {bot} — {role}]
Muc tieu chung: {goal}
Tieu chi cham:
{criteria_text}
{context}
Nhiem vu vong nay: {task}
Tra loi DUNG form duoi day, duoi 300 chu cho phan chinh (tru phan can cu ngan):
{form}
Quy tac: khong lap lai phan da dung cua nguoi khac, chi tap trung vao nhiem vu vong nay."""
    return prompt


def card_text(card):
    lines = []
    for cl in card.get("claims", []):
        lines.append(f"- {cl.get('id','')}: {cl.get('text','')} (can cu: {cl.get('basis','')})")
    risks = "; ".join(card.get("risks", []))
    return "\n".join(lines) + f"\nRui ro: {risks}\nDo tin cay: {card.get('confidence','')}"


def cards_for_round(con, topic_id, round_no):
    rows = con.execute(
        """SELECT s.bot, a.normalized_json FROM answers a
           JOIN sessions s ON s.id=a.session_id JOIN rounds r ON r.id=s.round_id
           WHERE s.topic_id=? AND r.round_no=?""",
        (topic_id, round_no),
    ).fetchall()
    cards = []
    for r in rows:
        try:
            data = json.loads(r["normalized_json"])
            if isinstance(data, dict) and "claims" in data:
                data.setdefault("bot", r["bot"])
                cards.append(data)
        except Exception:
            continue
    return cards


def anonymize(cards, topic_id, round_no, recipient):
    bots = [c["bot"] for c in cards]
    rng = random.Random(f"{topic_id}-{round_no}-{recipient}")
    shuffled = bots[:]
    rng.shuffle(shuffled)
    letters = ["A", "B", "C", "D", "E", "F"]
    return {bot: letters[i] for i, bot in enumerate(shuffled)}


def my_card(con, topic_id, bot):
    """Bai goc Vong 1 cua dung bot nay (khong phai session Vong 3 hien tai)."""
    row = con.execute(
        """SELECT a.raw_text FROM answers a JOIN sessions s ON s.id=a.session_id
           JOIN rounds r ON r.id=s.round_id
           WHERE s.topic_id=? AND s.bot=? AND r.round_no=1""",
        (topic_id, bot),
    ).fetchone()
    return row["raw_text"] if row else "(chua co bai goc)"


def critiques_about_me(con, topic_id, my_bot):
    rows = con.execute(
        """SELECT s.bot, a.raw_text FROM answers a JOIN sessions s ON s.id=a.session_id
           JOIN rounds r ON r.id=s.round_id
           WHERE s.topic_id=? AND r.round_no=2""",
        (topic_id,),
    ).fetchall()
    # Chi lay phan bien cua bot duoc giao phan bien minh: CRITIQUE_OF[critic] == my_bot
    parts = []
    for r in rows:
        if CRITIQUE_OF.get(r["bot"]) == my_bot:
            parts.append(f"--- Phan bien tu {r['bot']} ---\n{r['raw_text']}")
    return "\n\n".join(parts) or "(chua co phan bien)"


def fallback_cards(con, topic_id, round_no):
    """Khong co API: tach luan diem don gian tu dap an tho."""
    rows = con.execute(
        """SELECT s.bot, a.raw_text FROM answers a JOIN sessions s ON s.id=a.session_id
           JOIN rounds r ON r.id=s.round_id WHERE s.topic_id=? AND r.round_no=?""",
        (topic_id, round_no),
    ).fetchall()
    cards = []
    for i, r in enumerate(rows):
        # Bo dong tieu de ("## Ket luan ngan"), dong trong, chi giu dong noi dung.
        lines = []
        for ln in (r["raw_text"] or "").splitlines():
            ln = ln.strip()
            if not ln or ln.startswith("#"):
                continue
            ln = re.sub(r"^[-•\d.)\s]+", "", ln).strip()
            if ln:
                lines.append(ln)
        claims = [
            {"id": f"{chr(65+i)}{j+1}", "text": ln[:200], "basis": ""}
            for j, ln in enumerate(lines[:5])
        ]
        cards.append(
            {"bot": r["bot"], "claims": claims, "risks": [], "confidence": "Trung binh", "form_ok": True}
        )
    return cards


# ---------------------------------------------------------------- Commands
def cmd_new(topic_title):
    con = connect()
    if current_topic(con):
        print("Da co chu de dang chay. Chay xong (finalize) hoac xoa hoi_dong.db truoc khi tao moi.")
        return
    plan = None
    if API_KEY:
        print("Dang goi Gemini API de lap ke hoach (Vong 0)...")
        plan = gemini_json(
            MODEL_LITE,
            "Ban la dieu phoi vien hoi dong. Tra JSON dung schema.",
            f"Chu de: {topic_title}\nHay chia muc tieu, 3-5 tieu chi cham, va phan vai Vong 1 cho 4 bot: ChatGPT, Claude, Gemini, Copilot.",
            PLAN_SCHEMA,
        )
    if plan:
        goal, criteria, roles = plan["goal"], plan["criteria"], plan.get("roles", ROLES_V1)
        print("Da co ke hoach tu Gemini API.")
    else:
        if API_KEY:
            print("Khong lay duoc ke hoach tu API — dung vai mau co san (che do fallback).")
        else:
            print("Chua co GEMINI_API_KEY — dung vai mau co san (che do fallback). Xem README de lay key mien phi.")
        goal, criteria, roles = topic_title, ["Dung dan", "Kha thi", "Day du"], ROLES_V1
    cur = con.execute(
        "INSERT INTO topics(title, goal, criteria_json) VALUES (?,?,?)",
        (topic_title, goal, json.dumps(criteria, ensure_ascii=False)),
    )
    topic_id = cur.lastrowid
    for round_no, kind in [(1, "de_xuat"), (2, "phan_bien"), (3, "sua_bai")]:
        r = con.execute(
            "INSERT INTO rounds(topic_id, round_no, kind) VALUES (?,?,?)", (topic_id, round_no, kind)
        )
        round_id = r.lastrowid
        for bot in BOTS:
            role = roles.get(bot, ROLES_V1[bot]) if round_no == 1 else (
                f"Phan bien bai cua {CRITIQUE_OF[bot]}" if round_no == 2 else "Tac gia sua bai cua minh"
            )
            con.execute(
                "INSERT INTO sessions(topic_id, round_id, bot, role) VALUES (?,?,?,?)",
                (topic_id, round_id, bot, role),
            )
    con.commit()
    print(f"\nDa tao chu de #{topic_id}: {topic_title}")
    print(f"Muc tieu: {goal}\nTieu chi: {', '.join(criteria)}")
    print("Buoc tiep: python hoi_dong.py next")


def cmd_next():
    con = connect()
    topic = current_topic(con)
    if not topic:
        print('Chua co chu de. Tao bang: python hoi_dong.py new "Chu de cua ban"')
        return
    round_no, session = current_pointer(con, topic["id"])
    if session is None:
        print("Da du 12 dap an (4 bot x 3 vong). Chay: python hoi_dong.py finalize")
        return
    prompt = build_prompt(con, topic, session, round_no)
    con.execute(
        "INSERT INTO packets(round_id, bot, prompt_text) VALUES (?,?,?)",
        (session["round_id"], session["bot"], prompt),
    )
    con.execute("UPDATE sessions SET status='cho_dap_an' WHERE id=?", (session["id"],))
    con.commit()
    where = copy_to_clipboard(prompt)
    print(f"\n[T{topic['id']} - Vong {round_no}/3 - {session['bot']} - {session['role']}]")
    print(f"Prompt da luu: {where}")
    print("Lam theo 3 buoc: 1) Mo New chat o bot nay  2) Dan (Ctrl+V) + Gui  3) Copy dap an, roi chay: python hoi_dong.py save")
    print("-" * 60)
    print(prompt)


def cmd_save():
    con = connect()
    topic = current_topic(con)
    if not topic:
        print("Chua co chu de.")
        return
    round_no, session = current_pointer(con, topic["id"])
    if session is None:
        print("Khong con o nao trong. Chay: python hoi_dong.py finalize")
        return
    text = read_clipboard()
    if not text:
        if ANSWER_FILE.exists() and ANSWER_FILE.read_text(encoding="utf-8").strip():
            text = ANSWER_FILE.read_text(encoding="utf-8")
            print("Khong doc duoc clipboard — da lay dap an tu file dap_an.txt")
        else:
            print("Khong doc duoc clipboard va khong co file dap_an.txt.")
            print("Cach khac: copy dap an, dan vao file dap_an.txt, luu, roi chay lai: python hoi_dong.py save")
            return
    chk = check_form(text, round_no)
    con.execute(
        "INSERT INTO answers(session_id, raw_text, normalized_json, form_ok) VALUES (?,?,?,?)",
        (session["id"], text, None, 1 if chk["form_ok"] else 0),
    )
    con.execute("UPDATE sessions SET status='da_luu' WHERE id=?", (session["id"],))
    con.commit()
    print(f"Da luu dap an Vong {round_no} - {session['bot']} ({len(text)} ky tu).")
    if not chk["form_ok"]:
        print(f"  ! Form chua dung: thieu {chk['missing']}" + ("; qua dai" if chk["too_long"] else ""))
        print("  Van nhan bai — Gemini se chuan hoa khi gom vong. Toi da sua form 1 lan neu ban muon.")
    nxt_round, nxt = current_pointer(con, topic["id"])
    if nxt:
        print(f"Tiep theo: Vong {nxt_round}/3 - {nxt['bot']}. Chay: python hoi_dong.py next")
    else:
        print("Da du dap an. Chay: python hoi_dong.py finalize")


def cmd_normalize():
    con = connect()
    topic = current_topic(con)
    if not topic:
        print("Chua co chu de.")
        return
    # Vong moi nhat da du 4 dap an
    done_round = None
    for rn in (1, 2, 3):
        n = con.execute(
            """SELECT COUNT(*) c FROM answers a JOIN sessions s ON s.id=a.session_id
               JOIN rounds r ON r.id=s.round_id WHERE s.topic_id=? AND r.round_no=?""",
            (topic["id"], rn),
        ).fetchone()["c"]
        if n == 4:
            done_round = rn
    if done_round is None:
        print("Chua co vong nao du 4 dap an. Chay 'status' de xem con thieu bot nao.")
        return
    rows = con.execute(
        """SELECT s.bot, s.id, a.raw_text FROM answers a JOIN sessions s ON s.id=a.session_id
           JOIN rounds r ON r.id=s.round_id WHERE s.topic_id=? AND r.round_no=?""",
        (topic["id"], done_round),
    ).fetchall()
    result = None
    if API_KEY:
        print(f"Dang goi Gemini API ({MODEL_LITE}) de chuan hoa Vong {done_round} — 1 lan goi cho ca 4 bai...")
        joined = "\n\n".join(f"--- {r['bot']} ---\n{r['raw_text']}" for r in rows)
        result = gemini_json(
            MODEL_LITE,
            "Ban la dieu phoi vien. Tach moi bai thanh the luan diem JSON dung schema.",
            f"Vong {done_round}, chu de: {topic['title']}\n{joined}",
            NORMALIZE_SCHEMA,
        )
    if result and result.get("cards"):
        cards = result["cards"]
        print("Da chuan hoa bang Gemini API.")
    else:
        cards = fallback_cards(con, topic["id"], done_round)
        print("Dung the luan diem don gian (fallback, khong co API).")
    by_bot = {c.get("bot"): c for c in cards}
    for r in rows:
        card = by_bot.get(r["bot"])
        if card:
            con.execute(
                "UPDATE answers SET normalized_json=? WHERE session_id=?",
                (json.dumps(card, ensure_ascii=False), r["id"]),
            )
    con.commit()
    for c in cards:
        print(f"\n[{c.get('bot')}] tin cay: {c.get('confidence','?')}")
        for cl in c.get("claims", []):
            print(f"  - {cl.get('id')}: {cl.get('text','')}")
    if result:
        print(f"\nDiem chung: {result.get('common_ground')}")
        print(f"Diem chua dong y: {result.get('disagreements')}")
    print("\nBuoc tiep: python hoi_dong.py next  (sang vong sau)")


def cmd_finalize():
    con = connect()
    topic = current_topic(con)
    if not topic:
        print("Chua co chu de.")
        return
    n = con.execute(
        "SELECT COUNT(*) c FROM answers a JOIN sessions s ON s.id=a.session_id WHERE s.topic_id=?",
        (topic["id"],),
    ).fetchone()["c"]
    if n < 12:
        print(f"Moi co {n}/12 dap an. Hay lam het 3 vong truoc (chay 'status' de xem).")
        return
    cards = []
    for rn in (1, 2, 3):
        cards.extend(cards_for_round(con, topic["id"], rn))
    result = None
    if API_KEY:
        print(f"Dang goi Gemini API ({MODEL_FLASH}) de tong hop cuoi...")
        result = gemini_json(
            MODEL_FLASH,
            "Ban la chu toa hoi dong. Tong hop ket luan cuoi dung schema.",
            f"Chu de: {topic['title']}\nMuc tieu: {topic['goal']}\nCac the luan diem:\n"
            + json.dumps(cards, ensure_ascii=False),
            FINALIZE_SCHEMA,
        )
    out_path = Path(__file__).with_name(f"ket-luan-T{topic['id']:02d}.md")
    if result:
        text = (
            f"# Ket luan hoi dong — {topic['title']}\n\n{result.get('final_answer','')}\n\n"
            f"## Diem dong thuan\n" + "\n".join(f"- {x}" for x in result.get("consensus", [])) +
            f"\n\n## Diem con tranh cai\n" + "\n".join(f"- {x}" for x in result.get("disputes", [])) +
            f"\n\n## Y kien thieu so\n{result.get('minority_opinion','')}\n"
        )
        print("Da tong hop bang Gemini API.")
    else:
        lines = [f"# Ket luan hoi dong (fallback) — {topic['title']}\n"]
        for c in cards:
            lines.append(f"\n## {c.get('bot')}")
            for cl in c.get("claims", []):
                lines.append(f"- {cl.get('id')}: {cl.get('text','')}")
        text = "\n".join(lines)
        print("Tong hop o che do fallback (ghep cac the lai, chua co API).")
    out_path.write_text(text, encoding="utf-8")
    con.execute("UPDATE topics SET status='xong' WHERE id=?", (topic["id"],))
    con.commit()
    print(f"Da ghi ket luan ra: {out_path}")
    print(text)


def cmd_status():
    con = connect()
    topic = current_topic(con)
    if not topic:
        print("Chua co chu de dang chay.")
        return
    print(f"Chu de #{topic['id']}: {topic['title']}  |  Muc tieu: {topic['goal']}")
    for rn in (1, 2, 3):
        rows = con.execute(
            """SELECT s.bot, s.role, CASE WHEN a.id IS NULL THEN '...' ELSE 'da luu' END st
               FROM sessions s LEFT JOIN answers a ON a.session_id=s.id
               JOIN rounds r ON r.id=s.round_id
               WHERE s.topic_id=? AND r.round_no=? ORDER BY s.id""",
            (topic["id"], rn),
        ).fetchall()
        print(f"Vong {rn}: " + " | ".join(f"{r['bot']}: {r['st']}" for r in rows))
    rn, nxt = current_pointer(con, topic["id"])
    if nxt:
        print(f"\nTiep theo: Vong {rn}/3 - {nxt['bot']}. Chay: python hoi_dong.py next")
    else:
        print("\nDa du dap an. Chay: python hoi_dong.py finalize")


def main(argv):
    if len(argv) < 2 or argv[1] in ("-h", "--help", "help"):
        print(__doc__)
        return
    cmd = argv[1]
    if cmd == "new" and len(argv) >= 3:
        cmd_new(" ".join(argv[2:]))
    elif cmd == "next":
        cmd_next()
    elif cmd == "save":
        cmd_save()
    elif cmd == "normalize":
        cmd_normalize()
    elif cmd == "finalize":
        cmd_finalize()
    elif cmd == "status":
        cmd_status()
    else:
        print("Lenh khong dung. Thu: new / next / save / normalize / finalize / status")
        print(__doc__)


if __name__ == "__main__":
    main(sys.argv)
