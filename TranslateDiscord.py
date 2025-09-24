import argparse
import discord
import logging
import sys
from discord.ext import commands, tasks
from discord import app_commands
from deep_translator import GoogleTranslator
import requests

logging.basicConfig(format='%(asctime)s - %(message)s', level=logging.INFO)
logger = logging.getLogger()

STATUSES = [
    "Free Hosting at njghosting.xyz",
    "Made with ❤️ by NJGHosting"
]

SUPPORTED_LANGS = GoogleTranslator.get_supported_languages(as_dict=True)

class TranslateBot:
    def __init__(self, token):
        self.token = token
        intents = discord.Intents.default()
        self.bot = commands.Bot(command_prefix="!", intents=intents)
        self.status_index = 0

        @self.bot.event
        async def on_ready():
            logger.info(f'Logged in as {self.bot.user}!')
            await self.bot.tree.sync()
            self.rotate_status.start()

        # Translate command
        @self.bot.tree.command(name="translate", description="Translate text to a specified language")
        async def translate(interaction: discord.Interaction, text: str, target_lang: str):
            await interaction.response.defer()
            await self.translate_text(interaction, text, target_lang)

        # Detect language command
        @self.bot.tree.command(name="detect", description="Detect the language of a text")
        async def detect(interaction: discord.Interaction, text: str):
            await interaction.response.defer()
            try:
                detected = GoogleTranslator(source='auto', target='en').detect(text)
                embed = discord.Embed(
                    description=f"**Detected language:** {detected}",
                    color=0x00ff00
                )
                embed.set_footer(text="Made with ❤️ by NJGHosting")
                await interaction.followup.send(embed=embed)
            except Exception as e:
                embed = discord.Embed(
                    description="❌ Error detecting language.",
                    color=0xff0000
                )
                embed.set_footer(text="Made with ❤️ by NJGHosting")
                await interaction.followup.send(embed=embed)
                logger.error(f"Detection error: {e}")

        # List supported languages command
        @self.bot.tree.command(name="languages", description="List all supported languages")
        async def languages(interaction: discord.Interaction):
            await interaction.response.defer()
            langs = ", ".join([f"{k} ({v})" for k, v in SUPPORTED_LANGS.items()])
            embed = discord.Embed(
                title="Supported Languages",
                description=langs,
                color=0x00ff00
            )
            embed.set_footer(text="Made with ❤️ by NJGHosting")
            await interaction.followup.send(embed=embed)

        # Multi translation command
        @self.bot.tree.command(name="multi", description="Translate text into multiple languages at once")
        async def multi(interaction: discord.Interaction, text: str, target_langs: str):
            """
            target_langs: comma-separated language codes (e.g., 'en,fr,es')
            """
            await interaction.response.defer()
            codes = [c.strip() for c in target_langs.split(",")]
            results = []
            for code in codes:
                try:
                    translated = GoogleTranslator(source='auto', target=code).translate(text)
                    results.append(f"**{code}:** {translated}")
                except Exception:
                    results.append(f"**{code}:** ❌ Failed to translate")
            embed = discord.Embed(
                title="Multi Translation",
                description="\n".join(results),
                color=0x00ff00
            )
            embed.set_footer(text="Made with ❤️ by NJGHosting")
            await interaction.followup.send(embed=embed)

    async def translate_text(self, interaction, text, target_lang):
        try:
            translated_text = GoogleTranslator(source='auto', target=target_lang).translate(text)
            embed = discord.Embed(
                description=f"**Translated:** {translated_text}",
                color=0x00ff00
            )
            embed.set_footer(text="Made with ❤️ by NJGHosting")
            await interaction.followup.send(embed=embed)
        except Exception as e:
            embed = discord.Embed(
                description="❌ Error in translation. Make sure the target language code is valid.",
                color=0xff0000
            )
            embed.set_footer(text="Made with ❤️ by NJGHosting")
            await interaction.followup.send(embed=embed)
            logger.error(f"Translation error: {e}")

    @tasks.loop(seconds=40)
    async def rotate_status(self):
        activity_type = discord.ActivityType.playing if self.status_index % 2 == 0 else discord.ActivityType.watching
        await self.bot.change_presence(activity=discord.Activity(type=activity_type, name=STATUSES[self.status_index]))
        self.status_index = (self.status_index + 1) % len(STATUSES)

    def run(self):
        logger.info("Bot is online and running...")
        self.bot.run(self.token, log_level=logging.ERROR)

def parse_args():
    parser = argparse.ArgumentParser(description="Run a translation bot on Discord.")
    parser.add_argument('token', type=str, help='Discord Bot Token')
    return parser.parse_args()

def check_for_updates():
    version = "1.0.1"
    versionsurl = "https://raw.githubusercontent.com/Silly-Development/premadebots/refs/heads/main/versions.txt"
    bottype = "TranslateDiscord.py"
    try:
        response = requests.get(versionsurl)
        if response.status_code == 200:
            versions = response.text.splitlines()
            for line in versions:
                if line.startswith(bottype):
                    latest_version = line.split("==")[1].strip()
                    if latest_version != version:
                        print(f"A new version ({latest_version}) is available. You are using version {version}. Updating now...")
                        updateurl = f"https://raw.githubusercontent.com/Silly-Development/premadebots/refs/heads/main/{bottype}"
                        update_response = requests.get(updateurl)
                        if update_response.status_code == 200:
                            with open(bottype, 'w', encoding='utf-8') as f:
                                f.write(update_response.text)
                            print("✅ Update successful. Restart the bot to apply changes.")
                        else:
                            print(f"❌ Failed to download the update, status code: {update_response.status_code}")
                    else:
                        print(f"✅ You are using the latest version ({version}).")
                    return
            print("⚠️ Bot type not found in versions file.")
        else:
            print(f"❌ Failed to check for updates, status code: {response.status_code}")
    except Exception as e:
        print(f"❌ Error checking for updates: {e}")

if __name__ == '__main__':
    args = parse_args()
    if args.token == "PUTYOURTOKENHERE":
        print("❌ You need to set the token in the startup tab.")
        sys.exit(1)
    check_for_updates()
    translate_bot = TranslateBot(args.token)
    translate_bot.run()