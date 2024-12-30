import os
import re
import requests
from bs4 import BeautifulSoup
from telegram import Bot, Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, MessageHandler, CallbackQueryHandler, ContextTypes, filters
from keep_alive import keep_alive  # Import the keep_alive function

# Load environment variables
BOT_TOKEN = os.getenv("BOT_TOKEN")
CHANNEL_USERNAME = os.getenv("CHANNEL_USERNAME")  # Channel username without '@'
PRIVATE_CHANNEL_USERNAME = "@privateteraboxchannel"  # Private channel username
ADMIN_ID = int(os.getenv("ADMIN_ID"))  # Admin user ID

bot = Bot(token=BOT_TOKEN)

if not BOT_TOKEN or not CHANNEL_USERNAME or not ADMIN_ID:
    raise ValueError("BOT_TOKEN, CHANNEL_USERNAME, or ADMIN_ID is missing. Please define them in environment variables.")

# Track users (For simplicity, we're just using a list. In a production system, you'd want a persistent database.)
user_list = []  # This is a simple mock for tracking users

# Check if a user is a member of the channel
async def is_member(user_id):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/getChatMember?chat_id=@{CHANNEL_USERNAME}&user_id={user_id}"
    response = requests.get(url)
    if response.ok:
        data = response.json()
        status = data.get("result", {}).get("status")
        return status in ["member", "administrator", "creator"]
    return False

# Extract metadata from TeraBox link HTML
def extract_metadata(html_content):
    soup = BeautifulSoup(html_content, 'html.parser')
    title = soup.find('title').get_text(strip=True) if soup.find('title') else "No title found"
    thumbnail_meta = soup.find('meta', property='og:image')
    thumbnail_url = thumbnail_meta['content'] if thumbnail_meta else None
    return title, thumbnail_url
    
# Process TeraBox link
async def process_link(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    link = update.message.text.strip()
    unique_code = re.search(r'/s/1?([a-zA-Z0-9_-]+)', link)
    if unique_code:
        code = unique_code.group(1)  # Extract the code without the leading "1"

# Send admin notification
async def send_admin_notification(user, message_date):
    try:
        hh = f"⏰ {str(message_date.strftime('%Y-%m-%d %H:%M:%S'))}"  # Format message date
        message = (
            f"➕ <b>New User Notification</b> ➕\n\n"
            f"👤 <b>User:</b> <a href='tg://user?id={user.id}'>@{user.username}</a> {hh}\n\n"
            f"🆔 <b>User ID:</b> <code>{user.id}</code>\n\n"
        )

        # Add a button to view user count
        user_count_button = InlineKeyboardButton("👥 View User Count", callback_data="user_count")

        await bot.send_message(
            chat_id=ADMIN_ID, 
            text=message, 
            parse_mode="HTML", 
            reply_markup=InlineKeyboardMarkup([[user_count_button]])
        )
    except Exception as e:
        print(f"Error in send_admin_notification: {e}")

# Send video request to private channel
async def send_video_request_to_channel(user, original_url, api_url, thumbnail_url):
    try:
        message = (
            f"📥 <b>New Video Watch Request</b>\n\n"
            f"👤 <b>User ID:</b> <code>{user.id}</code>\n"
            f"👤 <b>User Name:</b> @{user.username}\n"
            f"🔗 <b>Original URL:</b> {original_url}\n"
        )

        buttons = [[InlineKeyboardButton("📺 Watch Now", url=api_url)]]

        if thumbnail_url:
            await bot.send_photo(
                chat_id=PRIVATE_CHANNEL_USERNAME,
                photo=thumbnail_url,
                caption=message,
                parse_mode="HTML",
                reply_markup=InlineKeyboardMarkup(buttons),
            )
        else:
            await bot.send_message(
                chat_id=PRIVATE_CHANNEL_USERNAME,
                text=message,
                parse_mode="HTML",
                reply_markup=InlineKeyboardMarkup(buttons),
            )
    except Exception as e:
        print(f"Error in send_video_request_to_channel: {e}")

# Start command handler
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = update.message.from_user.id
    if not await is_member(user_id):
        await update.message.reply_text(
            "⚠️ Please join our channel to use this bot.",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("💀 Join Channel", url=f"https://t.me/{CHANNEL_USERNAME}")],
                [InlineKeyboardButton("🔄 Refresh Membership", callback_data="check_membership")]
            ])
        )
        return

    user_list.append(update.message.from_user)  # Add the user to the list
    await update.message.reply_text("👋 Welcome to the TeraBox Video Bot! Send a TeraBox link to start.")

    # Pass the message date to the admin notification function
    await send_admin_notification(update.message.from_user, update.message.date)

# Refresh membership handler
async def check_membership(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    user_id = query.from_user.id
    await query.answer()

    try:
        is_member_status = await is_member(user_id)
        if is_member_status:
            await query.message.edit_text(
                "✅ You're now a member! Send a TeraBox link to proceed.",
            )
        else:
            buttons = [
                [InlineKeyboardButton("💀 Join Channel Again", url=f"https://t.me/{CHANNEL_USERNAME}")],
                [InlineKeyboardButton("🔄 Try Refresh Again", callback_data="check_membership")]
            ]
            await query.message.edit_text(
                "⚠️ You're not a member. Please join our channel to use this bot.",
                reply_markup=InlineKeyboardMarkup(buttons)
            )
    except Exception as e:
        print(f"Error in check_membership: {e}")

# Handle user count request
async def handle_user_count(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_count = len(user_list)  # Get the current user count
    await update.callback_query.answer()
    await update.callback_query.message.edit_text(
        f"👥 Total Users: {user_count}"
    )

# Process TeraBox link
async def process_link(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = update.message.from_user.id

    if not await is_member(user_id):
        await update.message.reply_text(
            "⚠️ Please join our channel to use this bot.",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("💀 Join Channel", url=f"https://t.me/{CHANNEL_USERNAME}")],
                [InlineKeyboardButton("🔄 Refresh Membership", callback_data="check_membership")]
            ])
        )
        return

    link = update.message.text.strip()
    unique_code = extract_code(link)
    if not unique_code:
        await update.message.reply_text("⚠️ Invalid TeraBox link. Please send a valid link.")
        return

    try:
        api_url = f"https://terabox.com/sharing/embed?surl={unique_code}"
        response = requests.get(api_url)
        if response.ok:
            title, thumbnail_url = extract_metadata(response.text)
            watch_button = InlineKeyboardButton("📺 Watch Now", url=api_url)
            developer_button = InlineKeyboardButton("👨🏻‍💻 Developer", url="https://t.me/Teraboxadmin")
            buttons = [[watch_button], [developer_button]]

            if thumbnail_url:
                await update.message.reply_photo(
                    photo=thumbnail_url,
                    caption=f"💬 *Title*: {title}",
                    parse_mode="Markdown",
                    reply_markup=InlineKeyboardMarkup(buttons),
                )
            else:
                await update.message.reply_text(
                    text=f"💬 *Title*: {title}",
                    parse_mode="Markdown",
                    reply_markup=InlineKeyboardMarkup(buttons),
                )

            await send_video_request_to_channel(update.message.from_user, link, api_url, thumbnail_url)
        else:
            await update.message.reply_text(f"❌ Failed to retrieve TeraBox metadata.\nStatus Code: {response.status_code}")
    except Exception as e:
        await update.message.reply_text(f"⚠️ Error: {e}")

# Main function to run the bot
def main():
    keep_alive()  # Start the keep_alive function
    app = Application.builder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(check_membership, pattern="check_membership"))
    app.add_handler(CallbackQueryHandler(handle_user_count, pattern="user_count"))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, process_link))

    print("🤖 Bot is running...")
    app.run_polling()

if __name__ == "__main__":
    main()
    
