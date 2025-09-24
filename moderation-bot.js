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

// Token comes from startup args
const token = process.argv[2];
if (!token) {
  console.error("❌ No token provided. Pass it in startup");
  process.exit(1);
}

// Versioning info
const VERSION = "1.0.0"; // bump this whenever you change bot code
const BOT_TYPE = "moderation-bot.js";
const VERSIONS_URL =
  "https://raw.githubusercontent.com/jjakesv/premadebots/refs/heads/main/versions.txt";
const UPDATE_URL = `https://raw.githubusercontent.com/jjakesv/premadebots/refs/heads/main/${BOT_TYPE}`;

// Check for updates
function checkForUpdates() {
  return new Promise((resolve) => {
    https
      .get(VERSIONS_URL, (res) => {
        if (res.statusCode !== 200) {
          console.log(`⚠️ Failed to check updates. Status: ${res.statusCode}`);
          return resolve();
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          const lines = data.split("\n");
          for (const line of lines) {
            if (line.startsWith(BOT_TYPE)) {
              const latest = line.split("==")[1].trim();
              if (latest !== VERSION) {
                console.log(`⬆️ Update available! ${VERSION} → ${latest}`);
                console.log("Downloading update...");
                https
                  .get(UPDATE_URL, (updateRes) => {
                    if (updateRes.statusCode !== 200) {
                      console.log(
                        `❌ Failed to download update. Status: ${updateRes.statusCode}`
                      );
                      return resolve();
                    }
                    let newCode = "";
                    updateRes.on("data", (chunk) => (newCode += chunk));
                    updateRes.on("end", () => {
                      fs.writeFileSync(BOT_TYPE, newCode, "utf8");
                      console.log(
                        "✅ Update successful. Please restart the bot to apply changes."
                      );
                      process.exit(0);
                    });
                  })
                  .on("error", (err) => {
                    console.log("❌ Error downloading update:", err);
                  });
              } else {
                console.log(`✅ Running latest version (${VERSION}).`);
              }
              return resolve();
            }
          }
          console.log("⚠️ Bot type not found in versions.txt.");
          resolve();
        });
      })
      .on("error", (err) => {
        console.log("❌ Error checking for updates:", err);
        resolve();
      });
  });
}

// Discord.js setup
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

// Start with update check
(async () => {
  await checkForUpdates();
  client.login(token);
})();
