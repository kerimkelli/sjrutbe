# -*- coding: utf-8 -*-
import os
from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
import models

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "slotjack_secret_key_123_456")

# Initialize DB on startup
models.init_db()

@app.route("/")
def index():
    if "logged_in" in session:
        return redirect(url_for("dashboard"))
    return redirect(url_for("login"))

@app.route("/login", methods=["GET", "POST"])
def login():
    if "logged_in" in session:
        return redirect(url_for("dashboard"))
        
    if request.method == "POST":
        password = request.form.get("password")
        settings = models.get_settings()
        
        if password == settings["admin_password"]:
            session["logged_in"] = True
            flash("Başarıyla giriş yapıldı!", "success")
            return redirect(url_for("dashboard"))
        else:
            flash("Hatalı yönetici şifresi!", "danger")
            
    return render_template("login.html")

@app.route("/logout")
def logout():
    session.pop("logged_in", None)
    flash("Oturum kapatıldı.", "info")
    return redirect(url_for("login"))

@app.route("/dashboard")
def dashboard():
    if "logged_in" not in session:
        return redirect(url_for("login"))
        
    settings = models.get_settings()
    ranks = models.get_ranks()
    users = models.get_all_users()
    
    return render_template("dashboard.html", settings=settings, ranks=ranks, users=users)

@app.route("/update-settings", methods=["POST"])
def update_settings():
    if "logged_in" not in session:
        return jsonify({"success": False, "message": "Yetkisiz işlem!"}), 403
        
    try:
        xp_per_message = int(request.form.get("xp_per_message", 10))
        cooldown_seconds = int(request.form.get("cooldown_seconds", 15))
        new_password = request.form.get("admin_password")
        
        if xp_per_message < 1 or cooldown_seconds < 0:
            flash("Geçersiz ayar değerleri!", "danger")
            return redirect(url_for("dashboard"))
            
        models.update_settings(xp_per_message, cooldown_seconds, new_password if new_password else None)
        flash("Genel ayarlar başarıyla güncellendi!", "success")
    except Exception as e:
        flash(f"Ayar güncelleme hatası: {str(e)}", "danger")
        
    return redirect(url_for("dashboard"))

@app.route("/update-ranks", methods=["POST"])
def update_ranks():
    if "logged_in" not in session:
        return redirect(url_for("login"))
        
    try:
        ranks = models.get_ranks()
        updated_ranks = []
        
        for rank in ranks:
            r_id = rank["id"]
            min_lvl = int(request.form.get(f"min_level_{r_id}", rank["min_level"]))
            max_lvl = int(request.form.get(f"max_level_{r_id}", rank["max_level"]))
            
            # Emojiless tag constraint: letters, numbers and basic symbols, max 16 chars
            tg_tag = request.form.get(f"telegram_tag_{r_id}", rank["telegram_tag"])
            # Trim and clean TG tag for Telegram 9.5+ safety (emojiless and max 16 chars)
            tg_tag = "".join(c for c in tg_tag if c.isalnum() or c in " _-")[:16]
            
            # Bot message tag (with emojis, etc.)
            b_tag = request.form.get(f"bot_tag_{r_id}", rank["bot_tag"])
            
            updated_ranks.append({
                "id": r_id,
                "min_level": min_lvl,
                "max_level": max_lvl,
                "telegram_tag": tg_tag if tg_tag else f"Rank_{r_id}",
                "bot_tag": b_tag
            })
            
        models.update_ranks(updated_ranks)
        flash("Rütbe ve etiket ayarları başarıyla güncellendi!", "success")
    except Exception as e:
        flash(f"Rütbe güncelleme hatası: {str(e)}", "danger")
        
    return redirect(url_for("dashboard"))

@app.route("/update-user-xp", methods=["POST"])
def update_user_xp():
    if "logged_in" not in session:
        return redirect(url_for("login"))
        
    try:
        user_id = int(request.form.get("user_id"))
        xp_value = int(request.form.get("xp"))
        
        if xp_value < 0:
            flash("XP değeri negatif olamaz!", "danger")
            return redirect(url_for("dashboard"))
            
        models.update_user_xp_manually(user_id, xp_value)
        flash(f"Kullanıcı XP değeri {xp_value} olarak güncellendi ve Seviyesi yeniden hesaplandı!", "success")
    except Exception as e:
        flash(f"XP güncelleme hatası: {str(e)}", "danger")
        
    return redirect(url_for("dashboard"))

@app.route("/delete-user/<int:user_id>", methods=["POST"])
def delete_user(user_id):
    if "logged_in" not in session:
        return redirect(url_for("login"))
        
    try:
        models.delete_user(user_id)
        flash("Kullanıcı başarıyla silindi!", "success")
    except Exception as e:
        flash(f"Kullanıcı silme hatası: {str(e)}", "danger")
        
    return redirect(url_for("dashboard"))

if __name__ == "__main__":
    # Flask app inside python runs locally on port 5000 or custom port
    app.run(host="0.0.0.0", port=5000, debug=True)
