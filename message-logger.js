// message-logger.js
// Logs message edits & deletions (including images/files) + auto-update + rotating status

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
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
const BOT_TYPE = "message-logger.js";
const LOCAL_FILE = path.basename(__filename);
const VERSIONS_URL =
  "https://raw.githubusercontent.com/jjakesv/premadebots/refs/heads/main/versions.txt";
const UPDATE_URL = `https://raw.githubusercontent.com/jjakesv/premadebots/refs/heads/main/${BOT_TYPE}`;
const CURRENT_VER = "1.0.0";

// --- Auto-updater ---
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
checkForUpdates();

// --- Discord Client ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// --- Slash Command Setup ---
const commands = [
  new SlashCommandBuilder()
    .setName("setlog")
    .setDescription("Set the channel where logs will be sent.")
    .addChannelOption((o) =>
      o.setName("channel").setDescription("Log channel").setRequired(true)
    ),
].map((c) => c.toJSON());

let logChannelId = null;
const CONFIG_FILE = "./logconfig.json";

// Load saved log channel if exists
if (fs.existsSync(CONFIG_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    logChannelId = data.logChannelId;
  } catch {}
}

// Helper function for embeds
function makeEmbed(title, description, color = 0x00ff00) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: "Made with ❤️ by NJGHosting" });
}

// --- Command Registration ---
async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: commands,
    });
    console.log("✅ Slash commands registered (global).");
  } catch (err) {
    console.error("❌ Error registering commands:", err);
  }
}

// --- Bot Ready ---
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await registerCommands();

  // Status rotation
  const statuses = [
    "Logging Messages 📜",
    "Made with ❤️ by NJGHosting",
    "Free Hosting at njghosting.xyz",
  ];
  let i = 0;
  setInterval(() => {
    const activityTypes = [0, 1, 2, 3, 5];
    const type =
      activityTypes[Math.floor(Math.random() * activityTypes.length)];
    client.user.setActivity(statuses[i], { type });
    i = (i + 1) % statuses.length;
  }, 40000);
});

// --- Slash Command Interaction ---
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "setlog") {
    const channel = interaction.options.getChannel("channel");
    if (!channel)
      return interaction.reply({
        embeds: [makeEmbed("❌ Invalid channel", "", 0xff0000)],
        ephemeral: true,
      });

    logChannelId = channel.id;
    fs.writeFileSync(
      CONFIG_FILE,
      JSON.stringify({ logChannelId }, null, 2),
      "utf8"
    );
    return interaction.reply({
      embeds: [makeEmbed("✅ Log channel set!", `Logs will go to ${channel}`)],
    });
  }
});

// --- Message Delete Logger ---
client.on("messageDelete", async (message) => {
  if (!logChannelId || !message.guild) return;
  const logChannel = message.guild.channels.cache.get(logChannelId);
  if (!logChannel) return;

  let desc = `**Author:** ${message.author?.tag || "Unknown"}\n**Channel:** ${
    message.channel
  }\n\n**Content:**\n${message.content || "*No content*"}`;
  const embed = makeEmbed("🗑️ Message Deleted", desc);

  // Attachments (images/files)
  const files = [];
  if (message.attachments.size > 0) {
    message.attachments.forEach((att) => {
      if (att.contentType?.startsWith("image/")) {
        embed.setImage(att.url);
      } else {
        files.push(att.url);
      }
    });
  }

  // Send with optional extra attachments
  if (files.length > 0) {
    embed.addFields({
      name: "📎 Attachments",
      value: files.join("\n").slice(0, 1024),
    });
  }

  logChannel.send({ embeds: [embed] }).catch(() => {});
});

// --- Message Edit Logger ---
client.on("messageUpdate", async (oldMsg, newMsg) => {
  if (!logChannelId || !newMsg.guild) return;
  if (oldMsg.content === newMsg.content) return;
  const logChannel = newMsg.guild.channels.cache.get(logChannelId);
  if (!logChannel) return;

  let desc = `**Author:** ${newMsg.author?.tag || "Unknown"}\n**Channel:** ${
    newMsg.channel
  }\n\n**Before:**\n${oldMsg.content || "*No content*"}\n\n**After:**\n${
    newMsg.content || "*No content*"
  }`;
  const embed = makeEmbed("✏️ Message Edited", desc);

  // Attachments (if new ones exist)
  const files = [];
  if (newMsg.attachments.size > 0) {
    newMsg.attachments.forEach((att) => {
      if (att.contentType?.startsWith("image/")) {
        embed.setImage(att.url);
      } else {
        files.push(att.url);
      }
    });
  }

  if (files.length > 0) {
    embed.addFields({
      name: "📎 Attachments",
      value: files.join("\n").slice(0, 1024),
    });
  }

  logChannel.send({ embeds: [embed] }).catch(() => {});
});

client.login(token);
