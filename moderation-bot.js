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

// Token comes from startup args
const token = process.argv[2];
if (!token) {
  console.error("❌ No token provided. Pass it in startup");
  process.exit(1);
}

// File + URLs
const BOT_TYPE = "moderation-bot.js";
const LOCAL_FILE = path.basename(__filename);
const VERSIONS_URL =
  "https://raw.githubusercontent.com/jjakesv/premadebots/refs/heads/main/versions.txt";
const UPDATE_URL = `https://raw.githubusercontent.com/jjakesv/premadebots/refs/heads/main/${BOT_TYPE}`;

// Pull current version from versions.txt by matching our own filename
function getCurrentVersion() {
  return new Promise((resolve) => {
    https
      .get(VERSIONS_URL, (res) => {
        if (res.statusCode !== 200) {
          console.log(
            `⚠️ Failed to fetch versions.txt. Status: ${res.statusCode}`
          );
          return resolve(null);
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          const lines = data.split("\n");
          for (const line of lines) {
            if (line.startsWith(BOT_TYPE)) {
              return resolve(line.split("==")[1].trim());
            }
          }
          console.log("⚠️ Bot type not found in versions.txt.");
          resolve(null);
        });
      })
      .on("error", (err) => {
        console.log("❌ Error fetching versions.txt:", err);
        resolve(null);
      });
  });
}

// Check + apply update
async function checkForUpdates() {
  const latest = await getCurrentVersion();
  if (!latest) return;

  // If local file missing, force download
  if (!fs.existsSync(LOCAL_FILE)) {
    console.log("⚠️ Local file missing, downloading fresh copy...");
    return downloadUpdate(latest);
  }

  // Read first line of local file to check version marker
  const localCode = fs.readFileSync(LOCAL_FILE, "utf8");
  const match = localCode.match(/@version\s+([0-9.]+)/);
  const localVer = match ? match[1] : "0.0.0";

  if (localVer !== latest) {
    console.log(`⬆️ Update found: ${localVer} → ${latest}`);
    return downloadUpdate(latest);
  } else {
    console.log(`✅ Running latest version (${localVer}).`);
  }
}

function downloadUpdate(newVer) {
  return new Promise((resolve) => {
    https
      .get(UPDATE_URL, (res) => {
        if (res.statusCode !== 200) {
          console.log(
            `❌ Failed to download update. Status: ${res.statusCode}`
          );
          return resolve();
        }
        let newCode = "";
        res.on("data", (chunk) => (newCode += chunk));
        res.on("end", () => {
          // Inject @version marker so we can read next boot
          if (!newCode.includes("@version")) {
            newCode = `// @version ${newVer}\n` + newCode;
          }
          fs.writeFileSync(LOCAL_FILE, newCode, "utf8");
          console.log("✅ Update successful. Restart required.");
          process.exit(0);
        });
      })
      .on("error", (err) => {
        console.log("❌ Error downloading update:", err);
        resolve();
      });
  });
}

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
    .addUserOption((option) =>
      option.setName("target").setDescription("User to kick").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member")
    .addUserOption((option) =>
      option.setName("target").setDescription("User to ban").setRequired(true)
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

  if (interaction.commandName === "ping") {
    await interaction.reply("🏓 Pong!");
  }

  if (interaction.commandName === "kick") {
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)
    ) {
      return interaction.reply({
        content: "❌ You don’t got perms for that.",
        flags: MessageFlags.Ephemeral,
      });
    }
    const target = interaction.options.getMember("target");
    if (!target) return interaction.reply("❌ Couldn’t find that member.");
    await target.kick();
    await interaction.reply(`👢 Kicked ${target.user.tag}`);
  }

  if (interaction.commandName === "ban") {
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)
    ) {
      return interaction.reply({
        content: "❌ You don’t got perms for that.",
        flags: MessageFlags.Ephemeral,
      });
    }
    const target = interaction.options.getMember("target");
    if (!target) return interaction.reply("❌ Couldn’t find that member.");
    await target.ban();
    await interaction.reply(`🔨 Banned ${target.user.tag}`);
  }
});

// Boot sequence
(async () => {
  await checkForUpdates();
  client.login(token);
})();
