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
    
    # Ensure default ranks exist
    cursor.execute("SELECT COUNT(*) FROM ranks")
    if cursor.fetchone()[0] == 0:
        default_ranks = [
            (1, 4, "Izleyici", "[🎰 İzleyici]"),
            (5, 9, "Kucuk Kasa", "[🎲 Küçük Kasa]"),
            (10, 14, "Mudavim", "[🔥 Müdavim]"),
            (15, 19, "Masa Sahibi", "[👑 Masanın Sahibi]"),
            (20, 9999, "BALINA", "[🐳 BALİNA]")
        ]
        cursor.executemany("INSERT INTO ranks (min_level, max_level, telegram_tag, bot_tag) VALUES (?, ?, ?, ?)", default_ranks)
        
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

def calculate_level(xp):
    if xp < 0:
        return 1
    # level = floor(sqrt(xp / 100)) + 1
    return int(math.floor(math.sqrt(xp / 100.0))) + 1

def xp_for_level(level):
    if level <= 1:
        return 0
    return 100 * ((level - 1) ** 2)

def xp_needed_for_next_level(level):
    return 100 * (level ** 2)

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
    rows = conn.execute("SELECT * FROM ranks ORDER BY min_level ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_rank_for_level(level, ranks_list=None):
    if not ranks_list:
        ranks_list = get_ranks()
    for rank in ranks_list:
        if rank["min_level"] <= level <= rank["max_level"]:
            return rank
    # Fallback to last rank or basic
    if ranks_list:
        return ranks_list[-1]
    return {"telegram_tag": "Uye", "bot_tag": "[👤 Üye]"}

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
        new_level = calculate_level(new_xp)
        level_up = new_level > old_level
        
        conn.execute(
            "UPDATE users SET username = ?, xp = ?, level = ?, last_message_time = ? WHERE user_id = ?",
            (username, new_xp, new_level, current_time, user_id)
        )
    else:
        # New user
        new_xp = xp_to_add
        new_level = calculate_level(new_xp)
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
    return level_up, old_level, new_level, new_xp, rank["bot_tag"] if rank else "[👤 Üye]"

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

def update_ranks(ranks_data):
    """
    ranks_data: list of dicts with keys: id, min_level, max_level, telegram_tag, bot_tag
    """
    conn = get_db_connection()
    for rank in ranks_data:
        conn.execute(
            "UPDATE ranks SET min_level = ?, max_level = ?, telegram_tag = ?, bot_tag = ? WHERE id = ?",
            (rank["min_level"], rank["max_level"], rank["telegram_tag"], rank["bot_tag"], rank["id"])
        )
    conn.commit()
    conn.close()
