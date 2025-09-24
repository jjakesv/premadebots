// moderation-bot.js
// @note Works with Pterodactyl auto-update via persistent version.txt

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

// Files + URLs
const BOT_TYPE = "moderation-bot.js";
const LOCAL_FILE = path.basename(__filename);
const VERSION_FILE = "/mnt/server/version.txt"; // persistent file
const VERSIONS_URL =
  "https://raw.githubusercontent.com/jjakesv/premadebots/refs/heads/main/versions.txt";
const UPDATE_URL = `https://raw.githubusercontent.com/jjakesv/premadebots/refs/heads/main/${BOT_TYPE}`;

// Read local version from persistent file
let localVer = "0.0.0";
if (fs.existsSync(VERSION_FILE)) {
  localVer = fs.readFileSync(VERSION_FILE, "utf8").trim();
}

// Fetch latest version from GitHub
function getLatestVersion() {
  return new Promise((resolve) => {
    https
      .get(VERSIONS_URL, (res) => {
        if (res.statusCode !== 200) {
          console.log(`⚠️ Failed to fetch versions.txt (${res.statusCode})`);
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
          resolve(null);
        });
      })
      .on("error", (err) => {
        console.log("❌ Error fetching versions.txt:", err);
        resolve(null);
      });
  });
}

// Download fresh bot.js
function downloadUpdate(newVer) {
  return new Promise((resolve) => {
    https
      .get(UPDATE_URL, (res) => {
        if (res.statusCode !== 200) {
          console.log(`❌ Failed to download bot.js (${res.statusCode})`);
          return resolve();
        }
        let code = "";
        res.on("data", (chunk) => (code += chunk));
        res.on("end", () => {
          fs.writeFileSync(LOCAL_FILE, code, "utf8");
          fs.writeFileSync(VERSION_FILE, newVer, "utf8");
          console.log(
            `⬆️ Updated bot.js to version ${newVer}. Restarting required.`
          );
          process.exit(0);
        });
      })
      .on("error", (err) => {
        console.log("❌ Error downloading bot.js:", err);
        resolve();
      });
  });
}

// Check for updates
(async () => {
  const latestVer = await getLatestVersion();
  if (latestVer && latestVer !== localVer) {
    console.log(`⬆️ Update found: ${localVer} → ${latestVer}`);
    await downloadUpdate(latestVer);
    return; // exit now, new file will run on next boot
  } else {
    console.log(`✅ Running latest version (${localVer})`);
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
        option
          .setName("target")
          .setDescription("User to kick")
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("ban")
      .setDescription("Ban a member")
      .addUserOption((option) =>
        option.setName("target").setDescription("User to ban").setRequired(true)
      ),
  ].map((cmd) => cmd.toJSON());

  client.once("ready", async () => {
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
        !interaction.member.permissions.has(
          PermissionsBitField.Flags.KickMembers
        )
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
        !interaction.member.permissions.has(
          PermissionsBitField.Flags.BanMembers
        )
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

  client.login(token);
})();
