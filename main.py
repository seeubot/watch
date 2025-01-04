import os
import re
import requests
from bs4 import BeautifulSoup
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup , WebAppInfo
from telegram.ext import Application, CommandHandler, MessageHandler, CallbackQueryHandler, ContextTypes, filters , CallbackContext
from keep_alive import keep_alive  # Import keep_alive function

# Load environment variables
BOT_TOKEN = os.getenv("BOT_TOKEN")
CHANNEL_USERNAME = os.getenv("CHANNEL_USERNAME")  # Channel username without '@'
ADMIN_ID = int(os.getenv("ADMIN_ID"))  # Admin user ID
PRIVATE_CHANNEL_USERNAME = os.getenv("PRIVATE_CHANNEL_USERNAME")  # Private channel username with '@'

# Verify environment variables
if not BOT_TOKEN or not CHANNEL_USERNAME or not ADMIN_ID or not PRIVATE_CHANNEL_USERNAME:
    raise ValueError("Missing required environment variables: BOT_TOKEN, CHANNEL_USERNAME, ADMIN_ID, or PRIVATE_CHANNEL_USERNAME.")

# Track users
user_list = []

# Function to check if a user is a member of the channel
async def is_member(user_id):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/getChatMember?chat_id=@{CHANNEL_USERNAME}&user_id={user_id}"
    response = requests.get(url)
    if response.ok:
        data = response.json()
        status = data.get("result", {}).get("status")
        return status in ["member", "administrator", "creator"]
    return False

# Function to extract the unique code from a TeraBox link
def extract_code(link):
    match = re.search(r'/s/1([a-zA-Z0-9_-]+)', link)
    return match.group(1) if match else None

# Function to extract metadata from the HTML content
def extract_metadata(html_content):
    soup = BeautifulSoup(html_content, 'html.parser')
    title = soup.find('title').get_text(strip=True) if soup.find('title') else 'No title found'
    thumbnail_meta = soup.find('meta', property='og:image')
    thumbnail_url = thumbnail_meta['content'] if thumbnail_meta else None
    return title, thumbnail_url

# Send admin notification
async def send_admin_notification(user, total_users):
    try:
        message = (
            f"👤 <b>User Details</b>\n"
            f"🆔 <b>User ID:</b> <code>{user.id}</code>\n"
            f"👤 <b>Username:</b> @{user.username}\n\n"
            f"👥 <b>Total Users:</b> {total_users}"
        )
        await bot.bot.send_message(
            chat_id=ADMIN_ID,
            text=message,
            parse_mode="HTML"
        )
    except Exception as e:
        print(f"Error sending admin notification: {e}")

# Send video request to private channel
async def send_video_request_to_channel(user, original_url, api_url, thumbnail_url, title):
    try:
        message = (
            f"📥 <b>Video Request Details</b>\n"
            f"🆔 <b>User ID:</b> <code>{user.id}</code>\n"
            f"👤 <b>Username:</b> @{user.username}\n"
            f"🔗 <b>Original URL:</b> {original_url}"
        )
        buttons = [[InlineKeyboardButton("📺 Watch Now", url=api_url)]]
        if thumbnail_url:
            await bot.bot.send_photo(
                chat_id=PRIVATE_CHANNEL_USERNAME,
                photo=thumbnail_url,
                caption=message,
                parse_mode="HTML",
                reply_markup=InlineKeyboardMarkup(buttons)
            )
        else:
            await bot.bot.send_message(
                chat_id=PRIVATE_CHANNEL_USERNAME,
                text=message,
                parse_mode="HTML",
                reply_markup=InlineKeyboardMarkup(buttons)
            )
    except Exception as e:
        print(f"Error sending to private channel: {e}")

# Start command handler
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = update.message.from_user.id
    if not await is_member(user_id):
        await update.message.reply_text(
            "⚠️ You must join our channel to use this bot.",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("💀 Join Channel", url=f"https://t.me/{CHANNEL_USERNAME}")],
                [InlineKeyboardButton("🔄 Refresh Membership", callback_data="check_membership")]
            ])
        )
        return

    user_list.append(update.message.from_user)
    await update.message.reply_text("👋 Welcome! Send me a TeraBox link, and I'll process it for you.")

    await send_admin_notification(update.message.from_user, len(user_list))

# Callback query handler for the "Refresh Membership" button
async def check_membership(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    user_id = query.from_user.id
    await query.answer()

    if await is_member(user_id):
        await query.edit_message_text("✅ You are a member of the channel! Now you can use the bot.")
    else:
        await query.edit_message_text(
            "⚠️ You are not a member of the channel. Please join to use this bot.",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("💀 Join Channel", url=f"https://t.me/{CHANNEL_USERNAME}")],
                [InlineKeyboardButton("🔄 Refresh Membership", callback_data="check_membership")]
            ])
        )

# Process TeraBox link
async def process_link(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = update.message.from_user.id
    if not await is_member(user_id):
        await update.message.reply_text(
            "⚠️ You must join our channel to use this bot.",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("💀 Join Channel", url=f"https://t.me/{CHANNEL_USERNAME}")],
                [InlineKeyboardButton("🔄 Refresh Membership", callback_data="check_membership")]
            ])
        )
        return

    user_message = update.message.text.strip()
    unique_code = extract_code(user_message)

    if unique_code:
        try:
            api_url = f"https://terabox.com/sharing/embed?surl={unique_code}"
            response = requests.get(api_url)

            if response.ok:
                title, thumbnail_url = extract_metadata(response.text)
                buttons = [
                    [InlineKeyboardButton("Open Web App", url=WebAppInfo(url=api_url))],
                    [InlineKeyboardButton("👨🏻‍💻 Developer", url="https://t.me/+qdLjzK5bWoViOWQ1")]
                ]
                if thumbnail_url:
                    await update.message.reply_photo(
                        photo=thumbnail_url,
                        caption=f"💬 <b>Title:</b> {title}",
                        parse_mode="HTML",
                        reply_markup=InlineKeyboardMarkup(buttons)
                    )
                else:
                    await update.message.reply_text(
                        text=f"💬 <b>Title:</b> {title}",
                        parse_mode="HTML",
                        reply_markup=InlineKeyboardMarkup(buttons)
                    )
                await send_video_request_to_channel(update.message.from_user, user_message, api_url, thumbnail_url, title)
            else:
                await update.message.reply_text(f"❌ API Error:\nStatus Code: {response.status_code}")
        except Exception as e:
            await update.message.reply_text(f"⚠️ Error processing the link: {e}")
    else:
        await update.message.reply_text("⚠️ Invalid TeraBox link. Please send a valid link.")

# Main function to start the bot
def main():
    global bot
    bot = Application.builder().token(BOT_TOKEN).build()

    bot.add_handler(CommandHandler("start", start))
    bot.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, process_link))
    bot.add_handler(CallbackQueryHandler(check_membership, pattern="check_membership"))

    print("🤖 Bot is running...")
    bot.run_polling()

if __name__ == "__main__":
    keep_alive()  # Call the keep_alive function to keep the bot alive
    main()
