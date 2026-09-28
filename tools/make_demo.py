"""
Generates a DEMO league with fictional players and teams.

Used to test the site without calling Sleeper, and powers the
"Try the demo league" button. Nothing here is real data.

    python tools/make_demo.py
"""

import json
import random
from pathlib import Path

random.seed(7)

OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "data" / "nfl"
SEASON, PREV = "2026", "2025"
WEEKS = [1, 2, 3, 4]

# Invented names and three-letter team codes (none match real NFL teams).
FIRST = ["Caio", "Rafael", "Bruno", "Theo", "Diego", "Lucas", "Marcus", "Victor",
         "Andre", "Felix", "Gus", "Renan", "Otto", "Igor", "Davi", "Enzo",
         "Hector", "Milo", "Pietro", "Samuel", "Joaquin", "Leo", "Nico",
         "Paulo", "Ruan", "Tiago", "Wes", "Yuri", "Arthur", "Breno"]
LAST = ["Amaral", "Barreto", "Cardoso", "Damasceno", "Esteves", "Falcon", "Galvan",
        "Honorato", "Ibiapina", "Jardim", "Leitao", "Macedo", "Nogueira", "Orsini",
        "Prado", "Quintela", "Rezende", "Sampaio", "Toledo", "Uchoa", "Valadares",
        "Wanderley", "Xavier", "Zanetti", "Brandao", "Coutinho", "Dorneles", "Fontes"]
TEAMS = ["CPY", "JGR", "TCN", "ARR", "GUA", "SBI", "TTU", "LBO", "ONC", "BTO",
         "CRC", "CRJ", "PRN", "TMD", "ANT", "QTI", "GVI", "BTV", "SCR", "MCO",
         "PCA", "TEI", "URU", "ACI", "BGE", "CNC", "EMU", "IRR", "JBU", "MRC",
         "PRQ", "SRM"]

KEYS = []
KIDX = {}


def pack(stats):
    out = []
    for k, v in sorted(stats.items()):
        if not v:
            continue
        if k not in KIDX:
            KIDX[k] = len(KEYS)
            KEYS.append(k)
        out += [KIDX[k], round(v, 2)]
    return out


def noisy(x, sd=0.35):
    return max(0.0, random.gauss(x, x * sd))


def game_stats(pos, talent):
    """One game's stats for a player with a given talent level (0-1)."""
    s = {}
    if pos == "QB":
        s["pass_yd"] = noisy(170 + 110 * talent)
        s["pass_td"] = round(noisy(1 + 1.4 * talent, 0.6))
        s["pass_int"] = round(noisy(0.9, 0.8))
        s["rush_yd"] = noisy(10 + 25 * talent * random.random())
        s["rush_td"] = 1 if random.random() < 0.08 + 0.12 * talent else 0
    elif pos == "RB":
        s["rush_att"] = round(noisy(6 + 14 * talent))
        s["rush_yd"] = noisy(25 + 70 * talent)
        s["rush_td"] = round(noisy(0.15 + 0.7 * talent, 0.9))
        s["rec"] = round(noisy(1 + 3 * talent))
        s["rec_tgt"] = s["rec"] + round(noisy(1))
        s["rec_yd"] = noisy(8 + 20 * talent)
    elif pos in ("WR", "TE"):
        scale = 0.75 if pos == "TE" else 1.0
        s["rec_tgt"] = round(noisy((3 + 7 * talent) * scale))
        s["rec"] = round(s["rec_tgt"] * random.uniform(0.55, 0.75))
        s["rec_yd"] = noisy((25 + 75 * talent) * scale)
        s["rec_td"] = round(noisy(0.15 + 0.55 * talent, 0.9))
        if pos == "TE":
            s["bonus_rec_te"] = s["rec"]
    elif pos == "K":
        s["fgm_30_39"] = round(noisy(0.8 + talent))
        s["fgm_40_49"] = round(noisy(0.5 + 0.6 * talent, 0.8))
        s["xpm"] = round(noisy(1.5 + 1.5 * talent))
    elif pos == "DEF":
        s["sack"] = round(noisy(1.5 + 2 * talent))
        s["int"] = round(noisy(0.4 + 0.8 * talent, 0.8))
        s["fum_rec"] = round(noisy(0.3 + 0.5 * talent, 0.9))
        s["def_td"] = 1 if random.random() < 0.05 + 0.1 * talent else 0
        allowed = noisy(26 - 12 * talent, 0.3)
        bucket = ("pts_allow_0" if allowed < 1 else "pts_allow_1_6" if allowed < 7
                  else "pts_allow_7_13" if allowed < 14 else "pts_allow_14_20" if allowed < 21
                  else "pts_allow_21_27" if allowed < 28 else "pts_allow_28_34")
        s[bucket] = 1
    return s


def add(total, s):
    for k, v in s.items():
        total[k] = total.get(k, 0) + v


players = {}
pool = []
counts = {"QB": 36, "RB": 70, "WR": 95, "TE": 36, "K": 32, "DEF": 32}
pid = 1000
for pos, n in counts.items():
    for i in range(n):
        pid += 1
        talent = max(0.02, min(1.0, random.betavariate(1.3, 2.6)))
        if pos == "DEF":
            name = f"{TEAMS[i]} Defense"
            key = TEAMS[i]
        else:
            name = f"{random.choice(FIRST)} {random.choice(LAST)}"
            key = str(pid)
        rookie = pos not in ("K", "DEF") and random.random() < 0.12
        p = {"n": name, "p": pos, "fp": [pos], "t": random.choice(TEAMS),
             "a": 22 if rookie else random.randint(23, 33)}
        prev_talent = talent
        now_talent = talent
        # A few "momentum" cases: breakouts and slumps.
        r = random.random()
        if r < 0.10:
            now_talent = min(1.0, talent + random.uniform(0.25, 0.45))
        elif r < 0.18:
            now_talent = max(0.02, talent - random.uniform(0.2, 0.35))
        if not rookie:
            g = random.randint(9, 17)
            tot = {}
            for _ in range(g):
                add(tot, game_stats(pos, prev_talent))
            p["prev"] = {"g": g, "s": pack(tot)}
        weekly = {}
        for w in WEEKS:
            if random.random() < 0.9:
                weekly[str(w)] = pack(game_stats(pos, now_talent))
        if weekly:
            p["w"] = weekly
        if random.random() < 0.06:
            p["i"] = random.choice(["IR", "Out", "Questionable"])
        players[key] = p
        pool.append((key, pos, prev_talent + (0.15 if rookie else 0) + random.uniform(-0.1, 0.1)))

stats = {
    "generated_at": "2026-09-29T12:00:00+00:00",
    "season": SEASON,
    "prev_season": PREV,
    "weeks": WEEKS,
    "keys": KEYS,
    "players": players,
    "demo": True,
}

# --- Fictional league -----------------------------------------------------
roster_positions = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "K", "DEF"] + ["BN"] * 6
num_teams = 12
scoring = {
    "pass_yd": 0.04, "pass_td": 4, "pass_int": -1, "rush_yd": 0.1, "rush_td": 6,
    "rec": 0.5, "rec_yd": 0.1, "rec_td": 6, "bonus_rec_te": 0.5, "fum_lost": -2,
    "fgm_30_39": 3, "fgm_40_49": 4, "xpm": 1,
    "sack": 1, "int": 2, "fum_rec": 2, "def_td": 6,
    "pts_allow_0": 10, "pts_allow_1_6": 7, "pts_allow_7_13": 4, "pts_allow_14_20": 1,
    "pts_allow_21_27": 0, "pts_allow_28_34": -1,
}
team_names = ["Steel Capybaras", "Armadillo FC", "No Bye Weeks", "Swamp Gators",
              "Flex Appeal", "Target Rain", "Mountain Wolves", "Waiver Wire Kings",
              "Flying Toucans", "Couch Crew", "Coastal Sharks", "Redraft Royalty"]

# Snake draft guided by apparent value, with positional needs.
need = {"QB": 2, "RB": 5, "WR": 5, "TE": 2, "K": 1, "DEF": 1}
available = sorted(pool, key=lambda x: -x[2])
rosters = [{"roster_id": i + 1, "owner_id": f"u{i + 1}", "players": [],
            "settings": {"wins": random.randint(0, 4), "losses": 0}} for i in range(num_teams)]
for r in rosters:
    r["settings"]["losses"] = 4 - r["settings"]["wins"]
have = [{k: 0 for k in need} for _ in range(num_teams)]
for rnd in range(16):
    order = range(num_teams) if rnd % 2 == 0 else reversed(range(num_teams))
    for t in order:
        for idx, (key, pos, _) in enumerate(available):
            late = rnd >= 13
            if have[t][pos] < need[pos] or (not late and pos in ("RB", "WR") and have[t][pos] < 6):
                if pos in ("K", "DEF") and rnd < 12:
                    continue
                rosters[t]["players"].append(key)
                have[t][pos] += 1
                available.pop(idx)
                break

users = [{"user_id": f"u{i + 1}", "display_name": f"coach{i + 1}",
          "metadata": {"team_name": team_names[i]}} for i in range(num_teams)]
league = {
    "league_id": "demo",
    "name": "Demo League",
    "season": SEASON,
    "total_rosters": num_teams,
    "roster_positions": roster_positions,
    "scoring_settings": scoring,
    "settings": {"type": 0, "num_teams": num_teams},
}

OUT.mkdir(parents=True, exist_ok=True)
(OUT / "demo_stats.json").write_text(json.dumps(stats, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
(OUT / "demo_league.json").write_text(json.dumps(
    {"league": league, "rosters": rosters, "users": users, "my_roster_id": 11},
    ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"Demo: {len(players)} players, {num_teams} teams -> {OUT}")
