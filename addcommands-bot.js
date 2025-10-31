// addcommands-bot.js
// Auto-update + dynamic command adding system for premade bots

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
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
const BOT_TYPE = "addcommands-bot.js";
const LOCAL_FILE = path.basename(__filename);
const VERSIONS_URL =
  "https://raw.githubusercontent.com/jjakesv/premadebots/refs/heads/main/versions.txt";
const UPDATE_URL = `https://raw.githubusercontent.com/jjakesv/premadebots/refs/heads/main/${BOT_TYPE}`;
const CURRENT_VER = "1.0.0";

// Update check
function checkForUpdates() {
  https
    .get(VERSIONS_URL, (res) => {
      if (res.statusCode !== 200) return console.log("⚠️ Failed to check updates.");
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
                  if (r.statusCode !== 200) return console.log("❌ Failed to download update.");
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

// Discord bot setup
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages],
});

// Embed helper
function makeEmbed(description, color = 0x00ff00) {
  return new EmbedBuilder()
    .setDescription(description)
    .setColor(color)
    .setFooter({ text: "Made with ❤️ by NJGHosting" });
}

// In-memory storage for user-selected commands
const userCommandsMap = new Map();

// Prebuilt commands list
const prebuiltCommands = [
  { label: "Ping", value: "ping" },
  { label: "Uptime", value: "uptime" },
  { label: "Ban", value: "ban" },
];

// Slash command definitions
const commands = [
  new SlashCommandBuilder()
    .setName("addcommands")
    .setDescription("Add prebuilt commands to your bot"),
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with Pong!"),
  new SlashCommandBuilder()
    .setName("uptime")
    .setDescription("Shows bot uptime"),
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member")
    .addUserOption((o) => o.setName("target").setDescription("User to ban").setRequired(true)),
].map((c) => c.toJSON());

// Auto-sync slash commands
async function registerCommands() {
  try {
    const rest = new REST({ version: "10" }).setToken(token);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Slash commands registered (global).");
  } catch (err) {
    console.error("❌ Error registering slash commands:", err);
  }
}

// Ready + rotating status
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await registerCommands();

  const statuses = ["Using /addcommands", "Made with ❤️ by NJGHosting"];
  const activityTypes = [0, 1, 2, 3, 5];
  let i = 0;
  setInterval(() => {
    const type = activityTypes[Math.floor(Math.random() * activityTypes.length)];
    client.user.setActivity(statuses[i], { type });
    i = (i + 1) % statuses.length;
  }, 40000);
});

// Interaction handler
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand() && !interaction.isStringSelectMenu()) return;

  const userId = interaction.user.id;

  if (interaction.isChatInputCommand()) {
    switch (interaction.commandName) {
      case "addcommands":
        // Show select menu
        const menu = new StringSelectMenuBuilder()
          .setCustomId("selectCommands")
          .setPlaceholder("Select commands to add")
          .setMinValues(1)
          .setMaxValues(prebuiltCommands.length)
          .addOptions(prebuiltCommands);

        await interaction.reply({
          content: "Select the commands you want to add:",
          components: [new ActionRowBuilder().addComponents(menu)],
          ephemeral: true,
        });
        break;

      case "ping":
        if ((userCommandsMap.get(userId) || []).includes("ping")) {
          await interaction.reply({ embeds: [makeEmbed("🏓 Pong!")] });
        } else {
          await interaction.reply({ embeds: [makeEmbed("❌ You haven’t added this command yet.", 0xff0000)], ephemeral: true });
        }
        break;

      case "uptime":
        if ((userCommandsMap.get(userId) || []).includes("uptime")) {
          const minutes = Math.floor(process.uptime() / 60);
          await interaction.reply({ embeds: [makeEmbed(`⏱ Bot uptime: ${minutes} minutes`)] });
        } else {
          await interaction.reply({ embeds: [makeEmbed("❌ You haven’t added this command yet.", 0xff0000)], ephemeral: true });
        }
        break;

      case "ban":
        if (!(userCommandsMap.get(userId) || []).includes("ban")) {
          return interaction.reply({ embeds: [makeEmbed("❌ You haven’t added this command yet.", 0xff0000)], ephemeral: true });
        }
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
          return interaction.reply({ embeds: [makeEmbed("❌ You don’t got perms.", 0xff0000)], ephemeral: true });
        }
        const target = interaction.options.getMember("target");
        if (!target) return interaction.reply({ embeds: [makeEmbed("❌ Couldn’t find that member.", 0xff0000)] });
        await target.ban();
        await interaction.reply({ embeds: [makeEmbed(`🔨 Banned ${target.user.tag}`)] });
        break;
    }
  }

  // Handle menu selections
  if (interaction.isStringSelectMenu() && interaction.customId === "selectCommands") {
    const selected = interaction.values;
    if (!userCommandsMap.has(userId)) userCommandsMap.set(userId, []);
    const userCmds = userCommandsMap.get(userId);

    selected.forEach((cmd) => {
      if (!userCmds.includes(cmd)) userCmds.push(cmd);
    });

    userCommandsMap.set(userId, userCmds);

    await interaction.update({ content: `✅ You added: ${selected.join(", ")}`, components: [] });
  }
});

client.login(token);
