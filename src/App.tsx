import { useState, useEffect, FormEvent } from "react";
import {
  Coins,
  MessageSquare,
  Clock,
  Shield,
  Users,
  Trophy,
  KeyRound,
  Copy,
  Check,
  Plus,
  Trash2,
  Play,
  Flame,
  ChevronRight,
  Download,
  Settings,
  Terminal,
  Code2,
  Eye,
  Info,
  UserCheck
} from "lucide-react";

interface Setting {
  xp_per_message: number;
  cooldown_seconds: number;
  admin_password?: string;
}

interface Rank {
  id: number;
  min_level: number;
  max_level: number;
  telegram_tag: string;
  bot_tag: string;
}

interface User {
  user_id: number;
  username: string;
  xp: number;
  level: number;
  last_message_time: number | null;
}

interface SimLog {
  id: string;
  timestamp: string;
  type: "success" | "cooldown" | "level_up" | "info";
  message: string;
  sysLog?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "simulator" | "export">("dashboard");
  const [settings, setSettings] = useState<Setting>({ xp_per_message: 10, cooldown_seconds: 15, admin_password: "admin123" });
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [xpPerMsgInput, setXpPerMsgInput] = useState(10);
  const [cooldownInput, setCooldownInput] = useState(15);
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Edit XP Modal state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editXpVal, setEditXpVal] = useState<number>(0);

  // Simulator states
  const [simUsername, setSimUsername] = useState("SlotcuCan");
  const [simUserId, setSimUserId] = useState("77777");
  const [simLogs, setSimLogs] = useState<SimLog[]>([
    {
      id: "init",
      timestamp: new Date().toLocaleTimeString("tr-TR"),
      type: "info",
      message: "🤖 Slotjack Bot simülasyonu başlatıldı. Mesaj yazarak XP kazanmayı test edin!",
      sysLog: "System: bot.set_chat_member_tag API handler is ready."
    }
  ]);

  // Code Export states
  const [selectedFile, setSelectedFile] = useState<string>("bot.py");
  const [fileContent, setFileContent] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Load initial dashboard data
  const loadData = async () => {
    try {
      setLoading(true);
      const [settingsRes, ranksRes, usersRes] = await Promise.all([
        fetch("/api/settings").then((res) => res.json()),
        fetch("/api/ranks").then((res) => res.json()),
        fetch("/api/users").then((res) => res.json()),
      ]);

      setSettings(settingsRes);
      setXpPerMsgInput(settingsRes.xp_per_message);
      setCooldownInput(settingsRes.cooldown_seconds);
      setRanks(ranksRes);
      setUsers(usersRes);
    } catch (err) {
      console.error("Error loading data from server:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Handle settings update
  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          xp_per_message: xpPerMsgInput,
          cooldown_seconds: cooldownInput,
          admin_password: adminPasswordInput || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showStatus("success", "Genel ayarlar başarıyla güncellendi!");
        loadData();
      } else {
        showStatus("error", "Ayarlar güncellenirken hata oluştu.");
      }
    } catch (err) {
      showStatus("error", "Sunucu ile bağlantı kurulamadı.");
    }
  };

  // Handle rank modifications
  const handleUpdateRankField = (id: number, field: keyof Rank, value: any) => {
    setRanks((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          if (field === "telegram_tag") {
            // Constraint: letters, numbers, spaces, max 16 chars, emojiless
            const cleaned = value.replace(/[^\w\s-]/gi, "").slice(0, 16);
            return { ...r, [field]: cleaned };
          }
          return { ...r, [field]: value };
        }
        return r;
      })
    );
  };

  const handleSaveRanks = async () => {
    try {
      const res = await fetch("/api/ranks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ranks),
      });
      const data = await res.json();
      if (data.success) {
        showStatus("success", "Rütbe ve etiket tanımları güncellendi!");
        loadData();
      } else {
        showStatus("error", "Rütbeler güncellenirken hata oluştu.");
      }
    } catch (err) {
      showStatus("error", "Sunucu ile bağlantı kurulamadı.");
    }
  };

  // Handle manual XP modifications
  const handleSaveUserXp = async () => {
    if (!editingUser) return;
    try {
      const res = await fetch("/api/users/xp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: editingUser.user_id, xp: editXpVal }),
      });
      const data = await res.json();
      if (data.success) {
        showStatus("success", `@${editingUser.username} kullanıcısının XP değeri ${editXpVal} olarak güncellendi!`);
        setEditingUser(null);
        loadData();
      }
    } catch (err) {
      showStatus("error", "Kullanıcı XP güncelleme hatası.");
    }
  };

  // Handle user deletion
  const handleDeleteUser = async (userId: number, username: string) => {
    if (!confirm(`@${username} kullanıcısını veritabanından tamamen silmek istediğinize emin misiniz?`)) return;
    try {
      const res = await fetch("/api/users/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      const data = await res.json();
      if (data.success) {
        showStatus("success", "Kullanıcı veritabanından başarıyla silindi.");
        loadData();
      }
    } catch (err) {
      showStatus("error", "Kullanıcı silme hatası.");
    }
  };

  // Simulate Message
  const handleSimulateMessage = async () => {
    if (!simUsername.trim()) return;
    try {
      const res = await fetch("/api/simulate-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: simUsername,
          customUserId: simUserId || undefined
        }),
      });
      const data = await res.json();
      if (data.success) {
        const timeStr = new Date().toLocaleTimeString("tr-TR");
        
        let logType: "success" | "cooldown" | "level_up" = "success";
        let msg = data.message;
        let sys = `System Check: ID ${data.userId} last_message_time updated to ${currentTimeSeconds()}.`;
        
        if (data.cooldownActive) {
          logType = "cooldown";
          sys = `Cooldown Alert: ID ${data.userId} spamming too fast. Blocked. Remaining ${data.remainingSeconds}s.`;
        } else if (data.levelUp) {
          logType = "level_up";
          sys = `CRITICAL API CALL ⚙️: bot.set_chat_member_tag(chat_id=GROUP_ID, user_id=${data.userId}, tag='${data.telegramTag}') was successfully invoked! Tag limit within 16 chars verified. User is NOT made administrator.`;
        } else {
          sys += ` Ranks updated. Calculated Level: ${data.currentLevel}. Current tag: ${data.botTag}`;
        }

        setSimLogs((prev) => [
          {
            id: Math.random().toString(),
            timestamp: timeStr,
            type: logType,
            message: msg,
            sysLog: sys
          },
          ...prev
        ]);
        
        // Refresh member list automatically to see levels/XP updates in real time
        loadData();
      }
    } catch (err) {
      console.error("Simulation failed:", err);
    }
  };

  // Load exported file contents
  const loadCodeFile = async (filename: string) => {
    setSelectedFile(filename);
    try {
      const res = await fetch(`/api/code?file=${filename}`);
      const data = await res.json();
      if (data.content) {
        setFileContent(data.content);
      } else {
        setFileContent(`# Error loading file ${filename}`);
      }
    } catch (err) {
      setFileContent(`# Error connecting to server for file ${filename}`);
    }
  };

  useEffect(() => {
    if (activeTab === "export") {
      loadCodeFile(selectedFile);
    }
  }, [activeTab, selectedFile]);

  // Copy code utility
  const copyCodeToClipboard = () => {
    navigator.clipboard.writeText(fileContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const showStatus = (type: "success" | "error", text: string) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 5000);
  };

  const currentTimeSeconds = () => Math.floor(Date.now() / 1000);

  const getRankBadgeClass = (min_lvl: number) => {
    if (min_lvl >= 20) return "bg-accent/20 text-accent border-accent/40 font-mono";
    if (min_lvl >= 15) return "bg-accent/15 text-accent/90 border-accent/30 font-mono";
    if (min_lvl >= 10) return "bg-accent/10 text-accent/80 border-accent/20 font-mono";
    if (min_lvl >= 5) return "bg-accent/5 text-accent/70 border-accent/10 font-mono";
    return "bg-card text-muted border-border font-mono";
  };

  return (
    <div id="slotjack_app" className="min-h-screen bg-bg text-text flex flex-col font-sans selection:bg-accent/30 selection:text-accent">
      
      {/* Sleek Red Header */}
      <header id="app_header" className="border-b border-border bg-card/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎰</span>
            <div>
              <h1 className="text-2xl font-black text-accent tracking-tight font-mono">SLOTJACK</h1>
              <p className="text-xs text-muted font-medium">Telegram Rütbe Botu & Web Yönetim Paneli</p>
            </div>
          </div>
          
          <div className="flex bg-black/60 p-1 border border-border rounded-lg">
            <button
              id="tab_btn_dashboard"
              onClick={() => setActiveTab("dashboard")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-all cursor-pointer ${
                activeTab === "dashboard"
                  ? "bg-accent text-white shadow-lg shadow-accent/20"
                  : "text-muted hover:text-text hover:bg-card"
              }`}
            >
              <Settings className="w-4 h-4" />
              Canlı Yönetim
            </button>
            <button
              id="tab_btn_simulator"
              onClick={() => setActiveTab("simulator")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-all cursor-pointer ${
                activeTab === "simulator"
                  ? "bg-accent text-white shadow-lg shadow-accent/20"
                  : "text-muted hover:text-text hover:bg-card"
              }`}
            >
              <Terminal className="w-4 h-4" />
              Bot Simülatörü
            </button>
            <button
              id="tab_btn_export"
              onClick={() => setActiveTab("export")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-all cursor-pointer ${
                activeTab === "export"
                  ? "bg-accent text-white shadow-lg shadow-accent/20"
                  : "text-muted hover:text-text hover:bg-card"
              }`}
            >
              <Code2 className="w-4 h-4" />
              Python Kodları
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main id="app_main" className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Status Notification Alerts */}
        {statusMsg && (
          <div
            id="status_alert"
            className={`mb-6 p-4 rounded-lg border flex items-start gap-3 transition-all animate-in fade-in slide-in-from-top-4 duration-300 ${
              statusMsg.type === "success"
                ? "bg-emerald-950/60 border-emerald-500/30 text-emerald-300"
                : "bg-red-950/60 border-red-500/30 text-red-300"
            }`}
          >
            <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">{statusMsg.type === "success" ? "Başarılı" : "Hata!"}</p>
              <p className="text-xs text-neutral-300 mt-0.5">{statusMsg.text}</p>
            </div>
          </div>
        )}

        {/* Kurulum Bilgisi Banner */}
        <div className="mb-8 bg-accent/5 border border-accent/20 rounded-xl p-5 flex flex-col md:flex-row gap-4 items-start md:items-center">
          <div className="p-3 bg-accent/10 text-accent rounded-lg">
            <Shield className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-accent text-sm tracking-wide uppercase">Telegram Bot API 9.5+ Güvenlik Standartları</h3>
            <p className="text-xs text-text/80 mt-1 leading-relaxed">
              Bu bot, grup üyelerini <b>kesinlikle yönetici (admin) yapmadan</b>, en güncel Telegram API metodu olan{" "}
              <code className="text-accent bg-black px-1.5 py-0.5 rounded font-mono font-bold text-[11px]">
                bot.set_chat_member_tag(chat_id, user_id, tag)
              </code>{" "}
              ile sıradan grup üyelerine doğrudan özel rütbe etiketleri atar. Botun grupta <b>'Etiketleri Yönet' (can_manage_tags)</b> yetkisi olması yeterlidir.
            </p>
          </div>
        </div>

        {loading && activeTab !== "export" ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted gap-3">
            <div className="w-10 h-10 border-4 border-accent/20 border-t-accent rounded-full animate-spin"></div>
            <p className="text-xs font-medium">Yükleniyor...</p>
          </div>
        ) : (
          <>
            {/* TAB 1: CANLI YÖNETİM */}
            {activeTab === "dashboard" && (
              <div className="space-y-8 animate-in fade-in duration-300">
                {/* Grid 1: Genel Ayarlar & Rütbe Yönetimi */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  
                  {/* Sol Kolon: Genel Ayarlar */}
                  <div className="lg:col-span-5 space-y-6">
                    <form onSubmit={handleSaveSettings} className="bg-card border border-border rounded-xl p-6 shadow-xl">
                      <div className="flex items-center gap-2 pb-4 mb-6 border-b border-border">
                        <Settings className="w-5 h-5 text-accent" />
                        <h2 className="font-bold text-text text-base">Sistem Genel Ayarları</h2>
                      </div>

                      <div className="space-y-5">
                        <div>
                          <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-2">Mesaj Başına Verilecek XP</label>
                          <div className="relative">
                            <Coins className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                            <input
                              type="number"
                              min="1"
                              value={xpPerMsgInput}
                              onChange={(e) => setXpPerMsgInput(parseInt(e.target.value) || 0)}
                              className="w-full bg-black/40 border border-border hover:border-neutral-700 focus:border-accent/50 rounded-lg py-2.5 pl-10 pr-4 text-sm font-semibold text-text transition-all outline-none"
                            />
                          </div>
                          <span className="text-[10px] text-muted mt-1.5 block">Kullanıcıların grupta atacağı her geçerli mesaj için kazanacağı XP miktarı.</span>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-2">XP Cooldown Süresi (Saniye)</label>
                          <div className="relative">
                            <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                            <input
                              type="number"
                              min="0"
                              value={cooldownInput}
                              onChange={(e) => setCooldownInput(parseInt(e.target.value) || 0)}
                              className="w-full bg-black/40 border border-border hover:border-neutral-700 focus:border-accent/50 rounded-lg py-2.5 pl-10 pr-4 text-sm font-semibold text-text transition-all outline-none"
                            />
                          </div>
                          <span className="text-[10px] text-muted mt-1.5 block">Kullanıcının spam yapıp hızlıca seviye atlamasını engellemek için iki XP kazanımı arasındaki bekleme süresi.</span>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-2">Yönetici Paneli Şifresi</label>
                          <div className="relative">
                            <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                            <input
                              type="password"
                              placeholder="Şifreyi değiştirmek için yazın..."
                              value={adminPasswordInput}
                              onChange={(e) => setAdminPasswordInput(e.target.value)}
                              className="w-full bg-black/40 border border-border hover:border-neutral-700 focus:border-accent/50 rounded-lg py-2.5 pl-10 pr-4 text-sm font-semibold text-text transition-all outline-none"
                            />
                          </div>
                          <span className="text-[10px] text-muted mt-1.5 block">Flask web panelinde oturum açarken istenecek şifre (Varsayılan: admin123).</span>
                        </div>

                        <button
                          type="submit"
                          className="w-full bg-accent hover:bg-accent-hover text-white font-bold py-2.5 rounded-lg text-sm transition-all shadow-lg hover:shadow-accent/10 flex items-center justify-center gap-1.5 mt-2 cursor-pointer"
                        >
                          Genel Ayarları Güncelle
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Sağ Kolon: Rütbe & Etiket Yönetimi */}
                  <div className="lg:col-span-7 space-y-6">
                    <div className="bg-card border border-border rounded-xl p-6 shadow-xl">
                      <div className="flex items-center justify-between pb-4 mb-6 border-b border-border">
                        <div className="flex items-center gap-2">
                          <Trophy className="w-5 h-5 text-accent" />
                          <h2 className="font-bold text-text text-base">Rütbe & Telegram Etiketleri</h2>
                        </div>
                        <button
                          onClick={handleSaveRanks}
                          className="bg-accent/10 hover:bg-accent hover:text-white text-accent font-bold px-3.5 py-1.5 rounded-md text-xs transition-all border border-accent/20 cursor-pointer"
                        >
                          Rütbeleri Kaydet
                        </button>
                      </div>

                      <div className="space-y-4 max-h-[390px] overflow-y-auto pr-1">
                        {ranks.map((r) => (
                          <div key={r.id} className="bg-black/20 p-4 border border-border rounded-lg space-y-3">
                            <div className="flex justify-between items-center">
                              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${getRankBadgeClass(r.min_level)}`}>
                                RÜTBE #{r.id}
                              </span>
                              <div className="flex items-center gap-1.5 text-xs text-muted font-medium font-mono">
                                Seviye Aralığı: 
                                <input
                                  type="number"
                                  value={r.min_level}
                                  onChange={(e) => handleUpdateRankField(r.id, "min_level", parseInt(e.target.value) || 0)}
                                  className="w-12 bg-black/40 border border-border rounded py-0.5 px-1.5 text-center text-accent font-bold"
                                />
                                -
                                <input
                                  type="number"
                                  value={r.max_level}
                                  onChange={(e) => handleUpdateRankField(r.id, "max_level", parseInt(e.target.value) || 0)}
                                  className="w-12 bg-black/40 border border-border rounded py-0.5 px-1.5 text-center text-accent font-bold"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1">
                                  Telegram Etiketi (Kısa, Emojisiz)
                                </label>
                                <input
                                  type="text"
                                  maxLength={16}
                                  value={r.telegram_tag}
                                  onChange={(e) => handleUpdateRankField(r.id, "telegram_tag", e.target.value)}
                                  placeholder="Örn: Izleyici"
                                  className="w-full bg-black/40 border border-border focus:border-accent/50 rounded px-2.5 py-1.5 text-xs font-mono font-bold text-text"
                                />
                                <span className="text-[9px] text-muted mt-0.5 block">Telegram sınırlandırması: Maks 16 Karakter, Emojisiz.</span>
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1">
                                  Bot Mesaj Etiketi (Tam, Emojili)
                                </label>
                                <input
                                  type="text"
                                  value={r.bot_tag}
                                  onChange={(e) => handleUpdateRankField(r.id, "bot_tag", e.target.value)}
                                  placeholder="Örn: [🎰 İzleyici]"
                                  className="w-full bg-black/40 border border-border focus:border-accent/50 rounded px-2.5 py-1.5 text-xs font-mono font-bold text-text"
                                />
                                <span className="text-[9px] text-muted mt-0.5 block">Level-up mesajları ve /rank profil ekranlarında kullanılır.</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                </div>
                                   {/* Bölüm 2: Üye Listesi */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-xl">
                  <div className="flex items-center justify-between pb-4 mb-6 border-b border-border">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-accent" />
                      <h2 className="font-bold text-text text-base">Topluluk Üyeleri & XP Veritabanı</h2>
                    </div>
                    <span className="text-xs bg-black/40 border border-border px-3 py-1 rounded-md text-muted font-medium">
                      Toplam: {users.length} Üye
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border text-muted font-bold uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-4">Telegram ID</th>
                          <th className="py-3 px-4">Kullanıcı Adı</th>
                          <th className="py-3 px-4">Toplam Tecrübe (XP)</th>
                          <th className="py-3 px-4">Mevcut Seviye</th>
                          <th className="py-3 px-4">Rütbe Karşılığı</th>
                          <th className="py-3 px-4 text-right">İşlemler</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {users.map((u) => {
                          const userRank = ranks.find((r) => u.level >= r.min_level && u.level <= r.max_level) || ranks[ranks.length - 1];
                          return (
                            <tr key={u.user_id} className="hover:bg-black/20 transition-colors">
                              <td className="py-3 px-4 font-mono text-muted font-semibold">{u.user_id}</td>
                              <td className="py-3 px-4 font-bold text-accent">@{u.username}</td>
                              <td className="py-3 px-4">
                                <span className="bg-black/40 border border-border px-2.5 py-1 rounded font-mono font-bold text-text/90">
                                  {u.xp} XP
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <span className="bg-accent/10 text-accent border border-accent/20 px-2 py-0.5 rounded font-mono font-bold text-[11px]">
                                  Seviye {u.level}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <span className="text-text/80 font-medium">{userRank?.bot_tag || "[👤 Üye]"}</span>
                              </td>
                              <td className="py-3 px-4 text-right space-x-2">
                                <button
                                  onClick={() => {
                                    setEditingUser(u);
                                    setEditXpVal(u.xp);
                                  }}
                                  className="bg-black hover:bg-neutral-900 text-accent hover:text-accent-hover font-bold px-2.5 py-1.5 rounded text-[10px] transition-all cursor-pointer border border-border"
                                >
                                  XP Düzenle
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(u.user_id, u.username)}
                                  className="bg-accent/10 hover:bg-accent text-accent hover:text-white font-bold px-2.5 py-1.5 rounded text-[10px] transition-all cursor-pointer"
                                >
                                  Sil
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Edit XP Modal Dialog */}
                {editingUser && (
                  <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-card border border-border rounded-xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150">
                      <h3 className="text-base font-bold text-accent mb-2">Manuel XP & Seviye Ayarla</h3>
                      <p className="text-xs text-muted mb-4">
                        Kullanıcı: <b>@{editingUser.username}</b> (ID: {editingUser.user_id})
                      </p>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-2">
                            Yeni Toplam XP Değeri
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={editXpVal}
                            onChange={(e) => setEditXpVal(parseInt(e.target.value) || 0)}
                            className="w-full bg-black/40 border border-border hover:border-neutral-700 focus:border-accent/50 rounded-lg py-2 px-3 text-sm font-semibold text-text outline-none"
                          />
                        </div>

                        <div className="bg-black/40 p-3 rounded-lg border border-border text-[11px] text-muted space-y-1">
                          <p className="font-bold text-text/80">Formüle Göre Hesaplama:</p>
                          <p>Hesaplanan Seviye: <b>{Math.floor(Math.sqrt(editXpVal / 100)) + 1}</b></p>
                          <p>Sonraki Seviye XP: <b>{100 * Math.pow(Math.floor(Math.sqrt(editXpVal / 100)) + 1, 2)} XP</b></p>
                        </div>

                        <div className="flex gap-3 pt-2">
                          <button
                            onClick={() => setEditingUser(null)}
                            className="flex-1 bg-black hover:bg-neutral-900 text-muted hover:text-text border border-border font-bold py-2 rounded-lg text-xs transition-all cursor-pointer"
                          >
                            İptal
                          </button>
                          <button
                            onClick={handleSaveUserXp}
                            className="flex-1 bg-accent hover:bg-accent-hover text-white font-bold py-2 rounded-lg text-xs transition-all cursor-pointer"
                          >
                            Değişiklikleri Kaydet
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: BOT SİMÜLATÖRÜ */}
            {activeTab === "simulator" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-300">
                
                {/* Sol Taraf: Mesaj Gönderim Paneli */}
                <div className="lg:col-span-5 space-y-6">
                  <div className="bg-card border border-border rounded-xl p-6 shadow-xl">
                    <div className="flex items-center gap-2 pb-4 mb-6 border-b border-border">
                      <Play className="w-5 h-5 text-accent animate-pulse" />
                      <h2 className="font-bold text-text text-base">Mesaj Akışı Simüle Et</h2>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-2">Simüle Kullanıcı Adı</label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted font-bold font-mono text-xs">@</span>
                          <input
                            type="text"
                            value={simUsername}
                            onChange={(e) => setSimUsername(e.target.value)}
                            placeholder="SlotcuAhmet"
                            className="w-full bg-black/40 border border-border hover:border-neutral-700 focus:border-accent/50 rounded-lg py-2.5 pl-8 pr-4 text-sm font-semibold text-text transition-all outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-2">Simüle Telegram ID (User ID)</label>
                        <input
                          type="number"
                          value={simUserId}
                          onChange={(e) => setSimUserId(e.target.value)}
                          placeholder="Farklı ID ile yeni üye test etmek için değiştirin"
                          className="w-full bg-black/40 border border-border hover:border-neutral-700 focus:border-accent/50 rounded-lg py-2.5 px-3.5 text-sm font-semibold text-text transition-all outline-none"
                        />
                        <span className="text-[10px] text-muted mt-1 block">Aynı ID kullanıldığında veriler üzerine eklenir. Farklı ID yeni üye oluşturur.</span>
                      </div>

                      <div className="bg-black/30 p-4 border border-border rounded-lg text-xs space-y-2 text-muted">
                        <p className="font-bold text-text/80 flex items-center gap-1.5">
                          <Info className="w-4 h-4 text-accent" />
                          Simülasyon Nasıl Çalışır?
                        </p>
                        <p className="leading-relaxed">
                          "Simüle Mesaj Gönder" butonuna bastığınızda, botun Telegram grubundan mesaj almış gibi işlem yapılır:
                        </p>
                        <ul className="list-disc list-inside space-y-1">
                          <li>Sistem, yukarıdaki Telegram ID'si için XP ekler.</li>
                          <li>Genel ayarlardaki <b>Cooldown ({settings.cooldown_seconds}s)</b> kuralı kontrol edilir.</li>
                          <li>Eğer seviye atlarsa, tebrik mesajı oluşur ve <code>set_chat_member_tag</code> metodunu çağırarak kısa emojisiz rütbeyi grupta etiket olarak basar!</li>
                        </ul>
                      </div>

                      <button
                        onClick={handleSimulateMessage}
                        className="w-full bg-accent hover:bg-accent-hover text-white font-extrabold py-3 rounded-lg text-sm transition-all shadow-lg hover:shadow-accent/20 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <MessageSquare className="w-4 h-4" />
                        Simüle Mesaj Gönder 🎰
                      </button>
                    </div>
                  </div>
                </div>

                {/* Sağ Taraf: Canlı Akış & API Log Terminali */}
                <div className="lg:col-span-7 space-y-6">
                  <div className="bg-card border border-border rounded-xl p-6 shadow-xl flex flex-col h-[520px]">
                    <div className="flex items-center justify-between pb-4 mb-4 border-b border-border">
                      <div className="flex items-center gap-2">
                        <Terminal className="w-5 h-5 text-accent" />
                        <h2 className="font-bold text-text text-base">Canlı Simülasyon Akışı & API Logları</h2>
                      </div>
                      <button
                        onClick={() => setSimLogs([])}
                        className="text-xs text-muted hover:text-text cursor-pointer"
                      >
                        Temizle
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-3 font-mono text-xs pr-1">
                      {simLogs.length === 0 ? (
                        <p className="text-muted/60 text-center py-12">Simülasyon logları boş. Sol panelden mesaj gönderin.</p>
                      ) : (
                        simLogs.map((log) => (
                          <div
                            key={log.id}
                            className={`p-3 rounded-lg border leading-relaxed ${
                              log.type === "level_up"
                                ? "bg-accent/10 border-accent/20 text-accent"
                                : log.type === "cooldown"
                                ? "bg-red-950/20 border-red-500/30 text-red-300"
                                : log.type === "info"
                                ? "bg-black border-border text-text/80"
                                : "bg-black/40 border-border/60 text-text/80"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5 opacity-80 text-[10px]">
                              <span className="font-bold flex items-center gap-1.5">
                                {log.type === "level_up" && <Trophy className="w-3.5 h-3.5 text-accent" />}
                                {log.type === "cooldown" && <Clock className="w-3.5 h-3.5 text-red-400" />}
                                {log.type === "success" && <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />}
                                {log.type.toUpperCase()}
                              </span>
                              <span>{log.timestamp}</span>
                            </div>
                            <p className="font-sans font-medium text-sm">{log.message}</p>
                            
                            {log.sysLog && (
                              <div className="mt-2 pt-2 border-t border-border/80 text-[11px] text-muted font-mono">
                                <span className="text-accent/80 font-bold">&gt;_ </span>
                                {log.sysLog}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* TAB 3: KOD İHRACI & REHBER */}
            {activeTab === "export" && (
              <div className="space-y-8 animate-in fade-in duration-300">
                {/* Bilgi Kutusu */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-xl">
                  <div className="flex gap-4 items-start">
                    <div className="p-3 bg-accent/10 text-accent rounded-lg">
                      <Code2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="font-bold text-text text-base">Python Bot ve Flask Web Panel Kod Yapısı</h2>
                      <p className="text-xs text-muted mt-1.5 leading-relaxed">
                        Projeniz, hem Telegram Botunu (`bot.py`) hem de web yönetim panelini (`app.py`) ortak bir SQLite veritabanına bağlayan, 
                        tam entegre ve modüler bir mimariyle yazılmıştır. Aşağıdaki sekmeleri kullanarak tüm kaynak dosyaları inceleyebilir, 
                        tek tıkla kopyalayarak yerel sunucunuza aktarabilirsiniz.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Dosya Gezgini & Kod Editör Bölümü */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* Dosya Listesi */}
                  <div className="lg:col-span-3 space-y-3">
                    <div className="bg-card border border-border rounded-xl p-4">
                      <p className="text-[10px] font-black text-muted uppercase tracking-wider mb-3 px-1">Python Dosyaları</p>
                      <nav className="space-y-1">
                        {[
                          { name: "bot.py", desc: "aiogram 3.x Telegram Botu" },
                          { name: "app.py", desc: "Flask Web Dashboard" },
                          { name: "models.py", desc: "SQLite Veritabanı Modelleri" },
                          { name: "requirements.txt", desc: "Gerekli Paketler" }
                        ].map((f) => (
                          <button
                            key={f.name}
                            onClick={() => setSelectedFile(f.name)}
                            className={`w-full text-left px-3 py-2.5 rounded-lg text-xs flex flex-col gap-0.5 transition-all cursor-pointer ${
                              selectedFile === f.name
                                ? "bg-accent text-white font-bold"
                                : "text-muted hover:text-text hover:bg-black/30"
                            }`}
                          >
                            <span className="font-mono">{f.name}</span>
                            <span className={`text-[9px] ${selectedFile === f.name ? "text-white/80" : "text-muted/60"}`}>{f.desc}</span>
                          </button>
                        ))}
                      </nav>

                      <p className="text-[10px] font-black text-muted uppercase tracking-wider mt-5 mb-3 px-1">Flask HTML Şablonları</p>
                      <nav className="space-y-1">
                        {[
                          { name: "templates/login.html", desc: "Giriş Ekranı Şablonu" },
                          { name: "templates/dashboard.html", desc: "Yönetici Paneli Şablonu" }
                        ].map((f) => (
                          <button
                            key={f.name}
                            onClick={() => setSelectedFile(f.name)}
                            className={`w-full text-left px-3 py-2.5 rounded-lg text-xs flex flex-col gap-0.5 transition-all cursor-pointer ${
                              selectedFile === f.name
                                ? "bg-accent text-white font-bold"
                                : "text-muted hover:text-text hover:bg-black/30"
                            }`}
                          >
                            <span className="font-mono">{f.name}</span>
                            <span className={`text-[9px] ${selectedFile === f.name ? "text-white/80" : "text-muted/60"}`}>{f.desc}</span>
                          </button>
                        ))}
                      </nav>
                    </div>
                  </div>

                  {/* Kod Gösterici */}
                  <div className="lg:col-span-9 flex flex-col h-[520px] bg-card border border-border rounded-xl overflow-hidden shadow-xl">
                    <div className="bg-black/40 px-5 py-3 border-b border-border flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Code2 className="w-4 h-4 text-accent" />
                        <span className="font-mono text-xs text-text">{selectedFile}</span>
                      </div>
                      <button
                        onClick={copyCodeToClipboard}
                        className="bg-black hover:bg-neutral-900 text-accent font-bold px-3 py-1.5 rounded-md text-xs transition-all border border-border flex items-center gap-1.5 cursor-pointer"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            Kopyalandı!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Kodu Kopyala
                          </>
                        )}
                      </button>
                    </div>

                    <pre className="flex-1 overflow-auto p-5 font-mono text-xs text-muted bg-black/40 leading-relaxed text-left selection:bg-accent/20">
                      <code>{fileContent}</code>
                    </pre>
                  </div>
                </div>

                {/* Yerel Kurulum Rehberi */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-xl">
                  <h3 className="font-bold text-base text-accent mb-4 flex items-center gap-2">
                    <Info className="w-5 h-5" />
                    Yerel Sunucuda Çalıştırma Rehberi
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-text/80">
                    <div className="bg-black/30 p-4 border border-border rounded-lg space-y-2">
                      <p className="font-bold text-accent">1. Gereksinimleri Yükleyin</p>
                      <p className="leading-relaxed text-muted">
                        İlk olarak python paketlerini yerel bilgisayarınıza veya sunucunuza kurun:
                      </p>
                      <pre className="bg-black/60 p-2.5 rounded font-mono text-[11px] text-muted border border-border">
                        pip install -r requirements.txt
                      </pre>
                    </div>

                    <div className="bg-black/30 p-4 border border-border rounded-lg space-y-2">
                      <p className="font-bold text-accent">2. Bot Tokeninizi Ayarlayın</p>
                      <p className="leading-relaxed text-muted">
                        BotFather'dan aldığınız API Tokenini ve Flask oturum anahtarını terminalde env olarak tanımlayın:
                      </p>
                      <pre className="bg-black/60 p-2.5 rounded font-mono text-[11px] text-muted border border-border overflow-x-auto">
                        export TELEGRAM_BOT_TOKEN="token_girin"
                      </pre>
                    </div>

                    <div className="bg-black/30 p-4 border border-border rounded-lg space-y-2">
                      <p className="font-bold text-accent">3. Çalıştırın & Başlatın</p>
                      <p className="leading-relaxed text-muted">
                        Her iki servisi de asenkron veya iki ayrı uçbirim üzerinden çalıştırarak bot ve paneli anında senkronize edebilirsiniz:
                      </p>
                      <pre className="bg-black/60 p-2.5 rounded font-mono text-[11px] text-muted border border-border">
                        python bot.py & python app.py
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-black/60 py-6 text-center text-xs text-muted mt-auto">
        <p>© 2026 Slotjack Community. Tüm hakları saklıdır. Bot API 9.5+ Güvenli Rütbelendirme Standartları ile güçlendirilmiştir.</p>
      </footer>
    </div>
  );
}
