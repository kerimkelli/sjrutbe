import express from "express";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup Python SQLite Bridge helpers
const runPythonDb = (action: string, query: string, params: any[] = []): Promise<any> => {
  return new Promise((resolve, reject) => {
    const processInput = JSON.stringify({ action, query, params });
    const child = execFile("python3", ["db_bridge.py"], (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Python DB Bridge error: ${error.message}. Stderr: ${stderr}`));
        return;
      }
      try {
        const response = JSON.parse(stdout.trim());
        if (response.success) {
          resolve(response.result);
        } else {
          reject(new Error(response.error || "Unknown DB bridge error"));
        }
      } catch (err) {
        reject(new Error(`Failed to parse Python DB response: ${stdout}. Parser error: ${err}`));
      }
    });

    child.stdin?.write(processInput);
    child.stdin?.end();
  });
};

const dbRun = (query: string, params: any[] = []): Promise<{ id: number; changes: number }> => {
  return runPythonDb("run", query, params);
};

const dbGet = (query: string, params: any[] = []): Promise<any> => {
  return runPythonDb("get", query, params);
};

const dbAll = (query: string, params: any[] = []): Promise<any[]> => {
  return runPythonDb("all", query, params);
};

// Initialize SQLite database
async function initDb() {
  try {
    await dbRun(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY,
        xp_per_message INTEGER DEFAULT 10,
        cooldown_seconds INTEGER DEFAULT 15,
        admin_password TEXT DEFAULT 'admin123'
      )
    `);

    const settingsCount = await dbGet(`SELECT COUNT(*) as count FROM settings`);
    if (settingsCount.count === 0) {
      await dbRun(`INSERT INTO settings (id, xp_per_message, cooldown_seconds, admin_password) VALUES (1, 10, 15, 'admin123')`);
    }

    await dbRun(`
      CREATE TABLE IF NOT EXISTS ranks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        min_level INTEGER,
        max_level INTEGER,
        telegram_tag TEXT,
        bot_tag TEXT
      )
    `);

    const ranksCount = await dbGet(`SELECT COUNT(*) as count FROM ranks`);
    if (ranksCount.count === 0) {
      const defaultRanks = [
        [1, 4, "Izleyici", "[🎰 İzleyici]"],
        [5, 9, "Kucuk Kasa", "[🎲 Küçük Kasa]"],
        [10, 14, "Mudavim", "[🔥 Müdavim]"],
        [15, 19, "Masa Sahibi", "[👑 Masanın Sahibi]"],
        [20, 9999, "BALINA", "[🐳 BALİNA]"]
      ];
      for (const r of defaultRanks) {
        await dbRun(`INSERT INTO ranks (min_level, max_level, telegram_tag, bot_tag) VALUES (?, ?, ?, ?)`, r);
      }
    }

    await dbRun(`
      CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        username TEXT,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        last_message_time REAL DEFAULT NULL
      )
    `);

    await dbRun(`
      CREATE TABLE IF NOT EXISTS xp_gains (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        timestamp REAL
      )
    `);

    const usersCount = await dbGet(`SELECT COUNT(*) as count FROM users`);
    if (usersCount.count === 0) {
      const dummyUsers = [
        [11111, "SlotcuAhmet", 1850, 5, null],
        [22222, "KasaKatlayan", 4500, 7, null],
        [33333, "RuletKrali", 9500, 10, null],
        [44444, "JackpotSami", 25000, 16, null],
        [55555, "BalinaKemal", 42000, 21, null],
      ];
      for (const u of dummyUsers) {
        await dbRun(`INSERT INTO users (user_id, username, xp, level, last_message_time) VALUES (?, ?, ?, ?, ?)`, u);
      }
    }
    console.log("SQLite database initialized successfully.");
  } catch (error) {
    console.error("Error initializing SQLite database:", error);
  }
}

initDb();

// Level formula helpers
async function calculateLevel(xp: number): Promise<number> {
  if (xp < 0) return 1;
  try {
    const ranks = await dbAll("SELECT * FROM ranks ORDER BY id ASC");
    const milestones: { globalLevel: number; subLevel: number; xpNeeded: number }[] = [];
    let accXp = 0;
    for (const rank of ranks) {
      const maxLvl = rank.max_rank_level ?? 5;
      const xpPerLvl = rank.xp_per_level ?? 100;
      for (let s = 1; s <= maxLvl; s++) {
        milestones.push({
          globalLevel: milestones.length + 1,
          subLevel: s,
          xpNeeded: accXp
        });
        accXp += xpPerLvl;
      }
    }
    
    let activeLevel = 1;
    for (const m of milestones) {
      if (xp >= m.xpNeeded) {
        activeLevel = m.globalLevel;
      } else {
        break;
      }
    }
    return activeLevel;
  } catch (err) {
    return Math.floor(Math.sqrt(xp / 100.0)) + 1;
  }
}

async function getRankForLevel(level: number): Promise<{ bot_tag: string; telegram_tag: string; sub_level: number }> {
  try {
    const ranks = await dbAll("SELECT * FROM ranks ORDER BY id ASC");
    const milestones: { globalLevel: number; subLevel: number; rank: any }[] = [];
    let accXp = 0;
    for (const rank of ranks) {
      const maxLvl = rank.max_rank_level ?? 5;
      const xpPerLvl = rank.xp_per_level ?? 100;
      for (let s = 1; s <= maxLvl; s++) {
        milestones.push({
          globalLevel: milestones.length + 1,
          subLevel: s,
          rank
        });
        accXp += xpPerLvl;
      }
    }
    
    const idx = level - 1;
    if (idx >= 0 && idx < milestones.length) {
      const m = milestones[idx];
      return {
        bot_tag: m.rank.bot_tag,
        telegram_tag: m.rank.telegram_tag,
        sub_level: m.subLevel
      };
    }
    if (ranks.length > 0) {
      const last = ranks[ranks.length - 1];
      const subLvl = level - milestones.length + 1;
      return {
        bot_tag: last.bot_tag,
        telegram_tag: last.telegram_tag,
        sub_level: subLvl > 0 ? subLvl : 1
      };
    }
  } catch (err) {
    console.error(err);
  }
  return { bot_tag: "[👤 Üye]", telegram_tag: "Uye", sub_level: 1 };
}

async function recalculateRankBounds() {
  const rows = await dbAll("SELECT id, max_rank_level FROM ranks ORDER BY id ASC");
  let accumulatedLevels = 0;
  for (const r of rows) {
    const maxLvl = r.max_rank_level ?? 5;
    const minG = accumulatedLevels + 1;
    const maxG = accumulatedLevels + maxLvl;
    await dbRun("UPDATE ranks SET min_level = ?, max_level = ? WHERE id = ?", [minG, maxG, r.id]);
    accumulatedLevels = maxG;
  }
}

// APIs
app.get("/api/settings", async (req, res) => {
  try {
    const row = await dbGet("SELECT * FROM settings WHERE id = 1");
    res.json(row || { xp_per_message: 10, cooldown_seconds: 15, admin_password: "admin123" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/settings", async (req, res) => {
  try {
    const { xp_per_message, cooldown_seconds, admin_password } = req.body;
    if (admin_password) {
      await dbRun("UPDATE settings SET xp_per_message = ?, cooldown_seconds = ?, admin_password = ? WHERE id = 1", [
        xp_per_message,
        cooldown_seconds,
        admin_password,
      ]);
    } else {
      await dbRun("UPDATE settings SET xp_per_message = ?, cooldown_seconds = ? WHERE id = 1", [
        xp_per_message,
        cooldown_seconds,
      ]);
    }
    res.json({ success: true, message: "Settings updated successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/ranks", async (req, res) => {
  try {
    const rows = await dbAll("SELECT * FROM ranks ORDER BY id ASC");
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/ranks", async (req, res) => {
  try {
    const ranks = req.body; // list of ranks
    for (const rank of ranks) {
      // Clean and constraint telegram tag for Telegram API (max 16 chars, no emojis)
      let cleanTag = rank.telegram_tag || "";
      cleanTag = cleanTag.replace(/[^\w\s-]/gi, '').slice(0, 16).trim();

      await dbRun("UPDATE ranks SET telegram_tag = ?, bot_tag = ?, max_rank_level = ?, xp_per_level = ? WHERE id = ?", [
        cleanTag,
        rank.bot_tag,
        rank.max_rank_level ?? 5,
        rank.xp_per_level ?? 100,
        rank.id,
      ]);
    }
    await recalculateRankBounds();
    res.json({ success: true, message: "Ranks updated successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/ranks/add", async (req, res) => {
  try {
    const { telegram_tag, bot_tag, max_rank_level, xp_per_level } = req.body;
    let cleanTag = telegram_tag || "";
    cleanTag = cleanTag.replace(/[^\w\s-]/gi, '').slice(0, 16).trim();
    
    await dbRun("INSERT INTO ranks (telegram_tag, bot_tag, max_rank_level, xp_per_level, min_level, max_level) VALUES (?, ?, ?, ?, 1, 1)", [
      cleanTag,
      bot_tag || "[👤 Üye]",
      max_rank_level ?? 5,
      xp_per_level ?? 100
    ]);
    await recalculateRankBounds();
    res.json({ success: true, message: "Rank added successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/ranks/delete", async (req, res) => {
  try {
    const { id } = req.body;
    await dbRun("DELETE FROM ranks WHERE id = ?", [id]);
    await recalculateRankBounds();
    res.json({ success: true, message: "Rank deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/users", async (req, res) => {
  try {
    const rows = await dbAll("SELECT * FROM users ORDER BY xp DESC");
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/users/xp", async (req, res) => {
  try {
    const { user_id, xp } = req.body;
    const level = await calculateLevel(xp);
    await dbRun("UPDATE users SET xp = ?, level = ? WHERE user_id = ?", [xp, level, user_id]);
    res.json({ success: true, message: "User XP and Level updated successfully", level });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/users/delete", async (req, res) => {
  try {
    const { user_id } = req.body;
    await dbRun("DELETE FROM users WHERE user_id = ?", [user_id]);
    res.json({ success: true, message: "User deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Code display API
app.get("/api/code", (req, res) => {
  const file = req.query.file as string;
  const allowedFiles = [
    "bot.py",
    "app.py",
    "models.py",
    "requirements.txt",
    "templates/login.html",
    "templates/dashboard.html",
  ];
  if (!allowedFiles.includes(file)) {
    return res.status(400).json({ error: "Invalid file request" });
  }
  try {
    const filePath = path.join(process.cwd(), file);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }
    const content = fs.readFileSync(filePath, "utf-8");
    res.json({ content });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Telegram message simulation engine
app.post("/api/simulate-message", async (req, res) => {
  try {
    const { username, customUserId } = req.body;
    const user_id = customUserId ? parseInt(customUserId) : Math.floor(10000 + Math.random() * 90000);
    const cleanUsername = username ? username.replace("@", "").trim() : "OyuncuSim";

    // Get current settings
    const settings = await dbGet("SELECT * FROM settings WHERE id = 1");
    const xpPerMessage = settings?.xp_per_message || 10;

    const currentTime = Date.now() / 1000; // in seconds
    const oneMinuteAgo = currentTime - 60.0;

    // Clean up old gains
    await dbRun("DELETE FROM xp_gains WHERE timestamp < ?", [oneMinuteAgo]);

    // Count gains in the last 60 seconds
    const gainsCountResult = await dbGet("SELECT COUNT(*) as count FROM xp_gains WHERE user_id = ? AND timestamp >= ?", [user_id, oneMinuteAgo]);
    const gainsCount = gainsCountResult?.count || 0;

    const user = await dbGet("SELECT * FROM users WHERE user_id = ?", [user_id]);

    if (gainsCount >= 6) {
      // Cooldown active (Dakikada maks 6 mesaj limitine ulaşıldı)
      const oldestGain = await dbGet("SELECT MIN(timestamp) as min_ts FROM xp_gains WHERE user_id = ? AND timestamp >= ?", [user_id, oneMinuteAgo]);
      const oldestTs = oldestGain?.min_ts || oneMinuteAgo;
      const remaining = Math.ceil(60.0 - (currentTime - oldestTs));
      const remainingVal = remaining > 0 ? remaining : 5;

      return res.json({
        success: true,
        cooldownActive: true,
        remainingSeconds: remainingVal,
        xpAdded: 0,
        currentXp: user?.xp || 0,
        currentLevel: user?.level || 1,
        username: user?.username || cleanUsername,
        userId: user_id,
        message: `🚫 Cooldown aktif (Dakikada maks 6 mesaj)! Tekrar XP kazanmak için en fazla ${remainingVal} saniye beklemelisiniz.`
      });
    }

    // Record new gain
    await dbRun("INSERT INTO xp_gains (user_id, timestamp) VALUES (?, ?)", [user_id, currentTime]);

    if (user) {
      const newXp = user.xp + xpPerMessage;
      const oldLevel = user.level;
      const newLevel = await calculateLevel(newXp);
      const levelUp = newLevel > oldLevel;

      await dbRun("UPDATE users SET username = ?, xp = ?, level = ?, last_message_time = ? WHERE user_id = ?", [
        cleanUsername,
        newXp,
        newLevel,
        currentTime,
        user_id,
      ]);

      // Fetch rank for the new level
      const activeRank = await getRankForLevel(newLevel);
      const botTagWithLvl = `${activeRank.bot_tag} LEVEL ${activeRank.sub_level}`;

      res.json({
        success: true,
        cooldownActive: false,
        xpAdded: xpPerMessage,
        oldLevel,
        newLevel,
        levelUp,
        currentXp: newXp,
        username: cleanUsername,
        userId: user_id,
        botTag: botTagWithLvl,
        telegramTag: `${activeRank.telegram_tag} Lvl ${activeRank.sub_level}`,
        message: levelUp 
          ? `🎉 TEBRİKLER! @${cleanUsername} Seviye Atladı! [Seviye ${oldLevel} ➡️ Seviye ${newLevel}]. Yeni Rütbesi: ${botTagWithLvl}` 
          : `💬 @${cleanUsername} mesaj gönderdi ve +${xpPerMessage} XP kazandı! (Yeni XP: ${newXp})`
      });
    } else {
      // New user registration
      const newXp = xpPerMessage;
      const newLevel = await calculateLevel(newXp);
      const levelUp = newLevel > 1;

      await dbRun("INSERT INTO users (user_id, username, xp, level, last_message_time) VALUES (?, ?, ?, ?, ?)", [
        user_id,
        cleanUsername,
        newXp,
        newLevel,
        currentTime,
      ]);

      const activeRank = await getRankForLevel(newLevel);
      const botTagWithLvl = `${activeRank.bot_tag} LEVEL ${activeRank.sub_level}`;

      res.json({
        success: true,
        cooldownActive: false,
        xpAdded: xpPerMessage,
        oldLevel: 1,
        newLevel,
        levelUp,
        currentXp: newXp,
        username: cleanUsername,
        userId: user_id,
        botTag: botTagWithLvl,
        telegramTag: `${activeRank.telegram_tag} Lvl ${activeRank.sub_level}`,
        message: `🆕 @${cleanUsername} ilk defa gruba katıldı ve mesaj atarak +${xpPerMessage} XP kazandı! Seviye: ${newLevel}`
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Vite server connection helper
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
