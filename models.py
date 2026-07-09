# -*- coding: utf-8 -*-
import sqlite3
import math
import time

DATABASE_PATH = "database.db"

def get_db_connection():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Settings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY,
        xp_per_message INTEGER DEFAULT 10,
        cooldown_seconds INTEGER DEFAULT 15,
        admin_password TEXT DEFAULT 'admin123'
    )
    """)
    
    # Ensure default settings exist
    cursor.execute("SELECT COUNT(*) FROM settings")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO settings (id, xp_per_message, cooldown_seconds, admin_password) VALUES (1, 10, 15, 'admin123')")
    
    # Ranks table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ranks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        min_level INTEGER,
        max_level INTEGER,
        telegram_tag TEXT,
        bot_tag TEXT
    )
    """)
    
    # Ensure ranks has max_rank_level and xp_per_level columns
    try:
        cursor.execute("ALTER TABLE ranks ADD COLUMN max_rank_level INTEGER DEFAULT 5")
    except sqlite3.OperationalError:
        pass # already exists
        
    try:
        cursor.execute("ALTER TABLE ranks ADD COLUMN xp_per_level INTEGER DEFAULT 100")
    except sqlite3.OperationalError:
        pass # already exists
    
    # Ensure default ranks exist
    cursor.execute("SELECT COUNT(*) FROM ranks")
    if cursor.fetchone()[0] == 0:
        default_ranks = [
            (1, 5, "Izleyici", "[🎰 İzleyici]", 5, 100),
            (6, 10, "Kucuk Kasa", "[🎲 Küçük Kasa]", 5, 200),
            (11, 15, "Mudavim", "[🔥 Müdavim]", 5, 500),
            (16, 20, "Masa Sahibi", "[👑 Masanın Sahibi]", 5, 1000),
            (21, 30, "BALINA", "[🐳 BALİNA]", 10, 2000)
        ]
        cursor.executemany("INSERT INTO ranks (min_level, max_level, telegram_tag, bot_tag, max_rank_level, xp_per_level) VALUES (?, ?, ?, ?, ?, ?)", default_ranks)
        
    # Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        username TEXT,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        last_message_time REAL DEFAULT NULL
    )
    """)
    
    # XP gains sliding window tracker table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS xp_gains (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        timestamp REAL
    )
    """)
    
    # Insert some initial dummy users if table is empty for a richer visual experience
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        dummy_users = [
            (11111, "SlotcuAhmet", 1850, 5, None),
            (22222, "KasaKatlayan", 4500, 7, None),
            (33333, "RuletKrali", 9500, 10, None),
            (44444, "JackpotSami", 25000, 16, None),
            (55555, "BalinaKemal", 42000, 21, None),
        ]
        cursor.executemany("INSERT INTO users (user_id, username, xp, level, last_message_time) VALUES (?, ?, ?, ?, ?)", dummy_users)

    conn.commit()
    conn.close()

def get_milestones(ranks_list=None):
    if not ranks_list:
        ranks_list = get_ranks()
    sorted_ranks = sorted(ranks_list, key=lambda x: x["id"])
    
    accumulated_xp = 0
    milestones = []
    
    for rank in sorted_ranks:
        max_lvl = rank.get("max_rank_level")
        if max_lvl is None:
            max_lvl = 5
        xp_per_lvl = rank.get("xp_per_level")
        if xp_per_lvl is None:
            xp_per_lvl = 100
            
        for s in range(1, max_lvl + 1):
            milestones.append({
                "global_level": len(milestones) + 1,
                "sub_level": s,
                "rank": rank,
                "xp_needed": accumulated_xp,
                "xp_per_level": xp_per_lvl
            })
            accumulated_xp += xp_per_lvl
    return milestones

def calculate_level(xp, ranks_list=None):
    if xp < 0:
        return 1
    milestones = get_milestones(ranks_list)
    if not milestones:
        return 1
    level = 1
    for m in milestones:
        if xp >= m["xp_needed"]:
            level = m["global_level"]
        else:
            break
    return level

def xp_for_level(level, ranks_list=None):
    if level <= 1:
        return 0
    milestones = get_milestones(ranks_list)
    if not milestones:
        return 0
    idx = level - 1
    if 0 <= idx < len(milestones):
        return milestones[idx]["xp_needed"]
    if milestones:
        last = milestones[-1]
        diff = level - last["global_level"]
        return last["xp_needed"] + diff * last["xp_per_level"]
    return 0

def xp_needed_for_next_level(level, ranks_list=None):
    return xp_for_level(level + 1, ranks_list)

def get_settings():
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM settings WHERE id = 1").fetchone()
    conn.close()
    if row:
        return dict(row)
    return {"xp_per_message": 10, "cooldown_seconds": 15, "admin_password": "admin123"}

def update_settings(xp_per_message, cooldown_seconds, admin_password=None):
    conn = get_db_connection()
    if admin_password:
        conn.execute("UPDATE settings SET xp_per_message = ?, cooldown_seconds = ?, admin_password = ? WHERE id = 1",
                     (xp_per_message, cooldown_seconds, admin_password))
    else:
        conn.execute("UPDATE settings SET xp_per_message = ?, cooldown_seconds = ? WHERE id = 1",
                     (xp_per_message, cooldown_seconds))
    conn.commit()
    conn.close()

def get_ranks():
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM ranks ORDER BY id ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_rank_for_level(level, ranks_list=None):
    if not ranks_list:
        ranks_list = get_ranks()
    milestones = get_milestones(ranks_list)
    idx = level - 1
    if 0 <= idx < len(milestones):
        m = milestones[idx]
        rank = dict(m["rank"])
        rank["sub_level"] = m["sub_level"]
        return rank
    if ranks_list:
        r = dict(ranks_list[-1])
        r["sub_level"] = level - len(milestones) + 1 if milestones else level
        return r
    return {"id": 1, "telegram_tag": "Uye", "bot_tag": "[👤 Üye]", "sub_level": 1, "max_rank_level": 5, "xp_per_level": 100}

def add_user_xp(user_id, username, xp_to_add, ranks_list=None):
    """
    Adds XP to user considering sliding window of 6 messages per 1 minute.
    Returns (level_up, old_level, new_level, current_xp, bot_tag)
    """
    conn = get_db_connection()
    current_time = time.time()
    one_minute_ago = current_time - 60.0
    
    # 1. Clean up old gains
    conn.execute("DELETE FROM xp_gains WHERE timestamp < ?", (one_minute_ago,))
    
    # 2. Count gains in the last 60 seconds
    cursor = conn.execute("SELECT COUNT(*) FROM xp_gains WHERE user_id = ? AND timestamp >= ?", (user_id, one_minute_ago))
    gains_count = cursor.fetchone()[0]
    
    user = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
    
    if gains_count >= 6:
        conn.close()
        if user:
            return False, user["level"], user["level"], user["xp"], None
        else:
            return False, 1, 1, 0, None
            
    # Record new gain
    conn.execute("INSERT INTO xp_gains (user_id, timestamp) VALUES (?, ?)", (user_id, current_time))
    
    if user:
        new_xp = user["xp"] + xp_to_add
        old_level = user["level"]
        new_level = calculate_level(new_xp, ranks_list)
        level_up = new_level > old_level
        
        conn.execute(
            "UPDATE users SET username = ?, xp = ?, level = ?, last_message_time = ? WHERE user_id = ?",
            (username, new_xp, new_level, current_time, user_id)
        )
    else:
        # New user
        new_xp = xp_to_add
        new_level = calculate_level(new_xp, ranks_list)
        level_up = new_level > 1
        old_level = 1
        
        conn.execute(
            "INSERT INTO users (user_id, username, xp, level, last_message_time) VALUES (?, ?, ?, ?, ?)",
            (user_id, username, new_xp, new_level, current_time)
        )
        
    conn.commit()
    conn.close()
    
    # Fetch rank
    rank = get_rank_for_level(new_level, ranks_list)
    bot_tag = rank["bot_tag"] if rank else "[👤 Üye]"
    sub_level = rank.get("sub_level", 1) if rank else 1
    formatted_bot_tag = f"{bot_tag} LEVEL {sub_level}"
    return level_up, old_level, new_level, new_xp, formatted_bot_tag

def get_user(user_id):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
    conn.close()
    if row:
        return dict(row)
    return None

def get_all_users():
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM users ORDER BY xp DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_top_users(limit=10):
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM users ORDER BY xp DESC LIMIT ?", (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def update_user_xp_manually(user_id, absolute_xp):
    conn = get_db_connection()
    new_level = calculate_level(absolute_xp)
    conn.execute("UPDATE users SET xp = ?, level = ? WHERE user_id = ?", (absolute_xp, new_level, user_id))
    conn.commit()
    conn.close()
    return new_level

def delete_user(user_id):
    conn = get_db_connection()
    conn.execute("DELETE FROM users WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()

def recalculate_rank_bounds():
    conn = get_db_connection()
    cursor = conn.cursor()
    rows = cursor.execute("SELECT id, max_rank_level FROM ranks ORDER BY id ASC").fetchall()
    
    accumulated_levels = 0
    for r in rows:
        r_id = r["id"]
        max_lvl = r["max_rank_level"] if r["max_rank_level"] is not None else 5
        
        min_g = accumulated_levels + 1
        max_g = accumulated_levels + max_lvl
        
        cursor.execute("UPDATE ranks SET min_level = ?, max_level = ? WHERE id = ?", (min_g, max_g, r_id))
        accumulated_levels = max_g
        
    conn.commit()
    conn.close()

def update_ranks(ranks_data):
    """
    ranks_data: list of dicts with keys: id, telegram_tag, bot_tag, max_rank_level, xp_per_level
    """
    conn = get_db_connection()
    for rank in ranks_data:
        conn.execute(
            "UPDATE ranks SET telegram_tag = ?, bot_tag = ?, max_rank_level = ?, xp_per_level = ? WHERE id = ?",
            (rank["telegram_tag"], rank["bot_tag"], rank.get("max_rank_level", 5), rank.get("xp_per_level", 100), rank["id"])
        )
    conn.commit()
    conn.close()
    recalculate_rank_bounds()

def add_rank(telegram_tag, bot_tag, max_rank_level=5, xp_per_level=100):
    conn = get_db_connection()
    conn.execute(
        "INSERT INTO ranks (telegram_tag, bot_tag, max_rank_level, xp_per_level, min_level, max_level) VALUES (?, ?, ?, ?, 1, 1)",
        (telegram_tag, bot_tag, max_rank_level, xp_per_level)
    )
    conn.commit()
    conn.close()
    recalculate_rank_bounds()

def delete_rank(rank_id):
    conn = get_db_connection()
    conn.execute("DELETE FROM ranks WHERE id = ?", (rank_id,))
    conn.commit()
    conn.close()
    recalculate_rank_bounds()
