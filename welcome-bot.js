const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const https = require("https");

const token = process.argv[2];
if (!token || token === "PUTYOURTOKENHERE") {
  console.error("❌ Set token in startup tab");
  process.exit(1);
}

const BOT_TYPE = "welcome-bot.js";
const LOCAL_FILE = path.basename(__filename);
const SETTINGS_FILE = path.join(__dirname, "settings.json");
const VERSIONS_URL =
  "https://raw.githubusercontent.com/jjakesv/premadebots/refs/heads/main/versions.txt";
const UPDATE_URL = `https://raw.githubusercontent.com/jjakesv/premadebots/refs/heads/main/${BOT_TYPE}`;
const CURRENT_VER = "1.0.5";

// Auto-update
function checkForUpdates() {
  https
    .get(VERSIONS_URL, (res) => {
      if (res.statusCode !== 200)
        return console.log("⚠️ Failed to check updates");
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
                    console.log("✅ Update complete. Restart bot to apply.");
                    process.exit(0);
                  });
                })
                .on("error", console.error);
            } else console.log(`✅ Running latest version (${CURRENT_VER})`);
            return;
          }
        }
        console.log("⚠️ Bot type not found in versions file.");
      });
    })
    .on("error", console.error);
}
checkForUpdates();

// Load or create settings JSON
let settings;
if (!fs.existsSync(SETTINGS_FILE)) {
  settings = {
    welcomeChannelId: "",
    goodbyeChannelId: "",
    welcomeMessage:
      "Yo {user}, welcome to {server}! You are member #{count}! 🔥",
    goodbyeMessage: "Sad to see you go, {user}! 😢",
  };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
} else {
  settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
}

// Embed helper with timestamp
function makeEmbed(description, color = 0x00ff00, iconURL = null) {
  const embed = new EmbedBuilder()
    .setDescription(description)
    .setColor(color)
    .setFooter({ text: "Made with ❤️ by NJGHosting" })
    .setTimestamp(); // <-- adds current timestamp to embed
  if (iconURL) embed.setThumbnail(iconURL);
  return embed;
}

// Client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// Slash commands
const commands = [
  new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Update welcome/goodbye settings")
    .addStringOption((o) =>
      o
        .setName("option")
        .setDescription("Option to update")
        .setRequired(true)
        .addChoices(
          { name: "welcome-channel", value: "welcomeChannelId" },
          { name: "goodbye-channel", value: "goodbyeChannelId" },
          { name: "welcome-message", value: "welcomeMessage" },
          { name: "goodbye-message", value: "goodbyeMessage" }
        )
    )
    .addStringOption((o) =>
      o.setName("value").setDescription("New value").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Shows how to format welcome/goodbye messages"),
].map((c) => c.toJSON());

// Register commands
async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(client.user.id), {
    body: commands,
  });
  console.log("✅  Slash commands registered.");
}

// Welcome event with member count
client.on("guildMemberAdd", (member) => {
  const channel = member.guild.channels.cache.get(settings.welcomeChannelId);
  if (!channel) return;
  const icon = member.guild.iconURL();
  const memberCount = member.guild.memberCount; // Current total members
  channel.send({
    embeds: [
      makeEmbed(
        settings.welcomeMessage
          .replace("{user}", `<@${member.id}>`)
          .replace("{server}", member.guild.name)
          .replace("{count}", memberCount), // <-- new replacement
        0x00ff00,
        icon
      ),
    ],
  });
});

// Goodbye event
client.on("guildMemberRemove", (member) => {
  const channel = member.guild.channels.cache.get(settings.goodbyeChannelId);
  if (!channel) return;
  const icon = member.guild.iconURL();
  channel.send({
    embeds: [
      makeEmbed(
        settings.goodbyeMessage
          .replace("{user}", member.user.tag)
          .replace("{server}", member.guild.name),
        0xff0000,
        icon
      ),
    ],
  });
});

// Interaction handler
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "settings") {
    if (
      !interaction.member.permissions.has(
        PermissionsBitField.Flags.Administrator
      )
    )
      return interaction.reply({
        embeds: [makeEmbed("❌ You need admin perms.", 0xff0000)],
        ephemeral: true,
      });

    const option = interaction.options.getString("option");
    const value = interaction.options.getString("value");

    if (option.includes("Channel")) {
      const ch = interaction.guild.channels.cache.get(
        value.replace("<#", "").replace(">", "")
      );
      if (!ch)
        return interaction.reply({
          embeds: [makeEmbed("❌ Invalid channel.", 0xff0000)],
          ephemeral: true,
        });
      settings[option] = ch.id;
    } else settings[option] = value;

    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));

    // NEW: Notify user and console about restart requirement
    console.log(
      `⚠️ Settings updated: ${option}. Please restart the bot/server to apply changes.`
    );
    return interaction.reply({
      embeds: [
        makeEmbed(
          `✅ Updated ${option}!\n⚠️ Please restart the bot/server for changes to take effect.`,
          0x00ff00
        ),
      ],
    });
  }

  if (interaction.commandName === "help") {
    const guild = interaction.guild;
    const fakeUser = interaction.user; // example user
    const icon = guild.iconURL();

    const exampleWelcome = settings.welcomeMessage
      .replace("{user}", `<@${fakeUser.id}>`)
      .replace("{server}", guild.name)
      .replace("{count}", guild.memberCount);

    const exampleGoodbye = settings.goodbyeMessage
      .replace("{user}", fakeUser.tag)
      .replace("{server}", guild.name)
      .replace("{count}", guild.memberCount);

    return interaction.reply({
      embeds: [
        makeEmbed(
          "📘 **Welcome / Goodbye Message Formatting**\n\n" +
            "You can use these placeholders in your messages:\n" +
            "• {user} → mentions the user (or username for goodbye)\n" +
            "• {server} → server name\n" +
            "• {count} → current member count\n\n" +
            "**Example Welcome Message:**\n" +
            exampleWelcome +
            "\n\n" +
            "**Example Goodbye Message:**\n" +
            exampleGoodbye,
          0x0099ff,
          icon
        ),
      ],
    });
  }
});

// Ready + rotating status
client.once("clientReady", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await registerCommands();

  const statuses = [
    "Free Hosting at njghosting.xyz",
    "Made with ❤️ by NJGHosting",
  ];
  let i = 0;
  setInterval(() => {
    client.user.setActivity(statuses[i], { type: 0 });
    i = (i + 1) % statuses.length;
  }, 40000);
});

client.login(token);
