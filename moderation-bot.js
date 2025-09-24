// moderation-bot.js
// Auto-update like Translate bot, simple GitHub fetch

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder,
  MessageFlags,
} = require("discord.js");
const fs = require("fs");
const https = require("https");
const path = require("path");

// Token from startup args
const token = process.argv[2];
if (!token || token === "PUTYOURTOKENHERE") {
  console.error("❌ You need to set the token in the startup tab.");
  process.exit(1);
}

// Bot config
const BOT_TYPE = "moderation-bot.js";
const LOCAL_FILE = path.basename(__filename);
const VERSIONS_URL =
  "https://raw.githubusercontent.com/jjakesv/premadebots/refs/heads/main/versions.txt";
const UPDATE_URL = `https://raw.githubusercontent.com/jjakesv/premadebots/refs/heads/main/${BOT_TYPE}`;
const CURRENT_VER = "1.0.0";

// Simple update check (like Translate bot)
function checkForUpdates() {
  https
    .get(VERSIONS_URL, (res) => {
      if (res.statusCode !== 200)
        return console.log("⚠️ Failed to check updates.");
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const lines = data.split("\n");
        for (const line of lines) {
          if (line.startsWith(BOT_TYPE)) {
            const latestVer = line.split("==")[1].trim();
            if (latestVer !== CURRENT_VER) {
              console.log(
                `⬆️ Update available: ${CURRENT_VER} → ${latestVer}. Downloading...`
              );
              https
                .get(UPDATE_URL, (r) => {
                  if (r.statusCode !== 200)
                    return console.log("❌ Failed to download update.");
                  let newCode = "";
                  r.on("data", (chunk) => (newCode += chunk));
                  r.on("end", () => {
                    fs.writeFileSync(LOCAL_FILE, newCode, "utf8");
                    console.log(
                      "✅ Update complete. Restart the bot to apply changes."
                    );
                    process.exit(0);
                  });
                })
                .on("error", console.error);
            } else {
              console.log(`✅ Running latest version (${CURRENT_VER}).`);
            }
            return;
          }
        }
        console.log("⚠️ Bot type not found in versions file.");
      });
    })
    .on("error", console.error);
}

// Run update check first
checkForUpdates();

// Discord bot setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
});

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with Pong!"),
  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member")
    .addUserOption((o) =>
      o.setName("target").setDescription("User to kick").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member")
    .addUserOption((o) =>
      o.setName("target").setDescription("User to ban").setRequired(true)
    ),
].map((cmd) => cmd.toJSON());

client.once("clientReady", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  try {
    const rest = new REST({ version: "10" }).setToken(token);
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: commands,
    });
    console.log("✅ Slash commands registered (global).");
  } catch (err) {
    console.error("❌ Error registering slash commands:", err);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const target = interaction.options.getMember("target");

  switch (interaction.commandName) {
    case "ping":
      await interaction.reply("🏓 Pong!");
      break;

    case "kick":
      if (
        !interaction.member.permissions.has(
          PermissionsBitField.Flags.KickMembers
        )
      )
        return interaction.reply({
          content: "❌ You don’t got perms.",
          flags: MessageFlags.Ephemeral,
        });
      if (!target) return interaction.reply("❌ Couldn’t find that member.");
      await target.kick();
      await interaction.reply(`👢 Kicked ${target.user.tag}`);
      break;

    case "ban":
      if (
        !interaction.member.permissions.has(
          PermissionsBitField.Flags.BanMembers
        )
      )
        return interaction.reply({
          content: "❌ You don’t got perms.",
          flags: MessageFlags.Ephemeral,
        });
      if (!target) return interaction.reply("❌ Couldn’t find that member.");
      await target.ban();
      await interaction.reply(`🔨 Banned ${target.user.tag}`);
      break;
  }
});

client.login(token);
