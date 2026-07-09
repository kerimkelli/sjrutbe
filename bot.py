# -*- coding: utf-8 -*-
import os
import sys
import asyncio
import logging
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import Message

# Import our DB models
import models

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Initialize database
models.init_db()

# Read Bot Token from environment variable
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

if not BOT_TOKEN or BOT_TOKEN == "YOUR_TELEGRAM_BOT_TOKEN_HERE":
    # Fallback to the user's active token
    BOT_TOKEN = "8996262600:AAHnGkUjtl-SLjWXmYgWCGwYqFlVd5a0DNo"

# Initialize Bot and Dispatcher
bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

# Helper to distinguish actual administrators/managers from users promoted purely for custom titles
def is_real_admin(member: types.ChatMember) -> bool:
    if member.status == "creator":
        return True
    if member.status == "administrator":
        # A "fake" admin promoted purely for custom titles has all rights set to False.
        # Check if they have any actual privileges.
        admin_privileges = [
            getattr(member, 'can_be_edited', False),
            getattr(member, 'can_manage_chat', False),
            getattr(member, 'can_change_info', False),
            getattr(member, 'can_post_messages', False),
            getattr(member, 'can_edit_messages', False),
            getattr(member, 'can_delete_messages', False),
            getattr(member, 'can_user_handlers', False),
            getattr(member, 'can_restrict_members', False),
            getattr(member, 'can_invite_users', False),
            getattr(member, 'can_pin_messages', False),
            getattr(member, 'can_manage_topics', False),
            getattr(member, 'can_promote_members', False),
            getattr(member, 'can_manage_video_chats', False),
            getattr(member, 'can_post_stories', False),
            getattr(member, 'can_edit_stories', False),
            getattr(member, 'can_delete_stories', False),
        ]
        return any(admin_privileges)
    return False

# Monkeypatch Bot to support set_chat_member_tag safely for all members
async def custom_set_chat_member_tag(chat_id: int, user_id: int, tag: str):
    try:
        member = await bot.get_chat_member(chat_id, user_id)
        if member.status not in ["administrator", "creator"]:
            logger.info(f"Promoting user {user_id} in chat {chat_id} with no rights to set custom tag")
            # Promote them with absolutely all privileges set to False
            await bot.promote_chat_member(
                chat_id=chat_id,
                user_id=user_id,
                can_manage_chat=False,
                can_post_messages=False,
                can_edit_messages=False,
                can_delete_messages=False,
                can_restrict_members=False,
                can_invite_users=False,
                can_change_info=False,
                can_pin_messages=False,
                can_promote_members=False,
                can_manage_video_chats=False,
                is_anonymous=False
            )
        
        logger.info(f"Setting custom title '{tag}' for user {user_id} in chat {chat_id}")
        await bot.set_chat_administrator_custom_title(
            chat_id=chat_id,
            user_id=user_id,
            custom_title=tag
        )
    except Exception as e:
        logger.error(f"Error in custom_set_chat_member_tag for user {user_id}: {e}")

bot.set_chat_member_tag = custom_set_chat_member_tag

async def update_user_tag_if_needed(chat_id: int, user_id: int, member: types.ChatMember, level: int, ranks: list):
    rank_info = models.get_rank_for_level(level, ranks)
    if not rank_info:
        return
    
    telegram_tag = rank_info["telegram_tag"]
    if not telegram_tag:
        return
        
    clean_tag = telegram_tag[:16] # absolute safety limit for custom titles
    
    current_title = getattr(member, 'custom_title', None)
    if current_title == clean_tag:
        return # Already set correctly
        
    await bot.set_chat_member_tag(
        chat_id=chat_id,
        user_id=user_id,
        tag=clean_tag
    )

def generate_progress_bar(xp, level):
    min_xp = models.xp_for_level(level)
    max_xp = models.xp_needed_for_next_level(level)
    
    total_range = max_xp - min_xp
    if total_range <= 0:
        return "██████████"
        
    current_progress = xp - min_xp
    ratio = max(0.0, min(1.0, current_progress / total_range))
    
    solid_count = int(round(ratio * 10))
    empty_count = 10 - solid_count
    
    return "█" * solid_count + "░" * empty_count + f" {int(ratio * 100)}%"

@dp.message(Command("start", "yardim", "help"))
async def cmd_start(message: Message):
    # Check if chat is private or group
    is_group = message.chat.type in ["group", "supergroup"]
    
    response = (
        "<b>🎰 Slotjack Telegram Rütbe Botu'na Hoş Geldiniz!</b>\n\n"
        "Grupta mesaj yazarak aktiflik kazanın, XP toplayın ve rütbe atlayın!\n\n"
        "<b>Komutlar:</b>\n"
        "👤 /rank veya /profil - Seviyenizi ve ilerlemenizi gösterir.\n"
        "🏆 /liderler - Topluluğun en yüksek XP'ye sahip ilk 10 üyesini gösterir.\n\n"
        "<i>Not: Botun grupta 'Etiketleri Yönet' (can_manage_tags) admin yetkisi olmalıdır.</i>"
    )
    await message.reply(response, parse_mode="HTML")

@dp.message(Command("rank", "profil"))
async def cmd_rank(message: Message):
    user_id = message.from_user.id
    username = message.from_user.username or message.from_user.first_name
    
    user = models.get_user(user_id)
    if not user:
        # Create user record dynamically if they haven't messaged yet
        models.add_user_xp(user_id, username, 0)
        user = models.get_user(user_id)
        
    level = user["level"]
    xp = user["xp"]
    
    next_level_xp = models.xp_needed_for_next_level(level)
    progress_bar = generate_progress_bar(xp, level)
    
    # Fetch rank
    ranks = models.get_ranks()
    rank = models.get_rank_for_level(level, ranks)
    bot_tag = rank["bot_tag"] if rank else "[👤 Üye]"
    telegram_tag = rank["telegram_tag"] if rank else "Üye"
    
    response = (
        f"<b>🃏 {message.from_user.full_name} Profil Kartı</b>\n"
        "───────────────────\n"
        f"🏆 <b>Rütbe:</b> {bot_tag}\n"
        f"⭐️ <b>Seviye:</b> {level}\n"
        f"✨ <b>Toplam XP:</b> {xp} / {next_level_xp} XP\n"
        f"🏷 <b>Telegram Etiketi:</b> <code>{telegram_tag}</code>\n"
        "───────────────────\n"
        f"📈 <b>İlerleme:</b>\n<code>{progress_bar}</code>"
    )
    await message.reply(response, parse_mode="HTML")

@dp.message(Command("liderler"))
async def cmd_liderler(message: Message):
    top_users = models.get_top_users(10)
    if not top_users:
        await message.reply("Henüz liderlik tablosu oluşmadı. İlk mesajı siz yazın!")
        return
        
    ranks = models.get_ranks()
    
    response = "<b>🏆 SLOTJACK TOP 10 LİDERLİK TABLOSU</b>\n"
    response += "───────────────────────────\n"
    
    medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"]
    
    for idx, user in enumerate(top_users):
        username_str = f"@{user['username']}" if user['username'] else f"ID:{user['user_id']}"
        rank = models.get_rank_for_level(user['level'], ranks)
        tag_icon = rank['bot_tag'] if rank else "[👤]"
        
        medal = medals[idx] if idx < len(medals) else "🔹"
        response += f"{medal} <b>{username_str}</b> - Seviye {user['level']} ({user['xp']} XP) {tag_icon}\n"
        
    response += "───────────────────────────\n"
    response += "💬 Sohbet ederek liderliğe tırman!"
    
    await message.reply(response, parse_mode="HTML")

@dp.message(F.new_chat_members)
async def on_user_join(message: Message):
    if message.chat.type not in ["group", "supergroup"]:
        return
        
    chat_id = message.chat.id
    ranks = models.get_ranks()
    
    for new_member in message.new_chat_members:
        if new_member.is_bot:
            continue
            
        user_id = new_member.id
        username = new_member.username or new_member.first_name
        
        try:
            # Check if they are a real administrator of the group (should not be touched)
            member = await bot.get_chat_member(chat_id, user_id)
            if is_real_admin(member):
                logger.info(f"New member is an administrator, skipping: {username}")
                continue
                
            # Initialize them in database at Level 1 (with 0 XP added) if they don't exist
            user = models.get_user(user_id)
            if not user:
                models.add_user_xp(user_id, username, 0, ranks)
                user = models.get_user(user_id)
                
            level = user["level"] if user else 1
            await update_user_tag_if_needed(chat_id, user_id, member, level, ranks)
        except Exception as e:
            logger.error(f"Error setting tag for new member {username} ({user_id}): {e}")

@dp.message()
async def handle_message(message: Message):
    # Ignore commands or private chat for rank updating
    if message.text and message.text.startswith("/"):
        return
        
    if message.chat.type not in ["group", "supergroup"]:
        return
        
    user_id = message.from_user.id
    username = message.from_user.username or message.from_user.first_name
    chat_id = message.chat.id
    
    # 1. Check if sender is an actual group administrator/creator. If so, ignore completely (no XP)
    try:
        member = await bot.get_chat_member(chat_id, user_id)
        if is_real_admin(member):
            logger.info(f"Skipping XP and tag for real administrator: {username} (ID: {user_id})")
            return
    except Exception as e:
        logger.error(f"Error checking admin status: {e}")
        member = None

    # Get current settings to fetch XP increment
    settings = models.get_settings()
    xp_to_add = settings["xp_per_message"]
    
    # Add XP
    ranks = models.get_ranks()
    level_up, old_level, new_level, current_xp, bot_tag = models.add_user_xp(
        user_id, username, xp_to_add, ranks
    )
    
    # 2. Update user tag if their custom title is not current
    if member:
        try:
            await update_user_tag_if_needed(chat_id, user_id, member, new_level, ranks)
        except Exception as e:
            logger.error(f"Error in handle_message while checking tag: {e}")
    
    if level_up:
        # Fetch updated rank tags
        rank_info = models.get_rank_for_level(new_level, ranks)
        
        bot_tag = rank_info["bot_tag"] if rank_info else "[👤 Üye]"
        
        # Congratulate user in group using the emojied bot tag
        congrats_text = (
            f"🎉 <b>TEBRİKLER!</b> 🎉\n\n"
            f"👤 <b>Kullanıcı:</b> {message.from_user.mention_html()}\n"
            f"📈 <b>Yeni Seviye:</b> <code>{new_level}</code>\n"
            f"👑 <b>Yeni Rütbe:</b> <b>{bot_tag}</b>\n\n"
            f"<i>Gruptaki aktifliğin için teşekkürler! Sırada Seviye {new_level + 1} var!</i>"
        )
        await message.reply(congrats_text, parse_mode="HTML")

async def main():
    if BOT_TOKEN == "YOUR_TELEGRAM_BOT_TOKEN_HERE":
        logger.error("BOT TOKEN NOT CONFIGURED! Please set TELEGRAM_BOT_TOKEN env variable.")
        sys.exit(1)
        
    logger.info("Starting Slotjack telegram bot...")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
