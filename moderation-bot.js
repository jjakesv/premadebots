// moderation-bot.js
// Auto-update + moderation commands with embeds + auto-sync commands + rotating status

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
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
const CURRENT_VER = "1.0.1";

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
checkForUpdates();

// Discord bot setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
});

// Embed helper
function makeEmbed(description, color = 0x00ff00) {
  return new EmbedBuilder()
    .setDescription(description)
    .setColor(color)
    .setFooter({ text: "Made with ❤️ by NJGHosting" });
}

// Slash command definitions
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
  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a member by ID")
    .addStringOption((o) =>
      o.setName("userid").setDescription("User ID to unban").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a member")
    .addUserOption((o) =>
      o.setName("target").setDescription("User to timeout").setRequired(true)
    )
    .addIntegerOption((o) =>
      o
        .setName("duration")
        .setDescription("Duration in minutes")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove timeout from a member")
    .addUserOption((o) =>
      o
        .setName("target")
        .setDescription("User to remove timeout")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set channel slowmode")
    .addIntegerOption((o) =>
      o
        .setName("seconds")
        .setDescription("Seconds per message")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("role")
    .setDescription("Add or remove a role from a user")
    .addUserOption((o) =>
      o
        .setName("target")
        .setDescription("User to modify role")
        .setRequired(true)
    )
    .addRoleOption((o) =>
      o.setName("role").setDescription("Role to add/remove").setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("action")
        .setDescription("Add or remove role")
        .setRequired(true)
        .addChoices(
          { name: "add", value: "add" },
          { name: "remove", value: "remove" }
        )
    ),
  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete messages in a channel")
    .addIntegerOption((o) =>
      o
        .setName("amount")
        .setDescription("Number of messages to delete")
        .setRequired(true)
    ),
].map((c) => c.toJSON());

// Auto-sync slash commands
async function registerCommands() {
  try {
    const rest = new REST({ version: "10" }).setToken(token);
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: commands,
    });
    console.log("✅ Slash commands registered (global).");
  } catch (err) {
    console.error("❌ Error registering slash commands:", err);
  }
}

// Bot ready + status rotation
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await registerCommands();

  // Status rotation every 40 seconds with random activity type
  const statuses = [
    "Free Hosting at njghosting.xyz",
    "Made with ❤️ by NJGHosting",
  ];
  const activityTypes = [0, 1, 2, 3, 5]; // PLAYING, STREAMING, LISTENING, WATCHING, COMPETING
  let i = 0;
  setInterval(() => {
    const type =
      activityTypes[Math.floor(Math.random() * activityTypes.length)];
    client.user.setActivity(statuses[i], { type });
    i = (i + 1) % statuses.length;
  }, 40000);
});

// Interaction handler
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const target = interaction.options.getMember("target");

  switch (interaction.commandName) {
    case "ping":
      return interaction.reply({ embeds: [makeEmbed("🏓 Pong!")] });

    case "kick":
      if (
        !interaction.member.permissions.has(
          PermissionsBitField.Flags.KickMembers
        )
      )
        return interaction.reply({
          embeds: [makeEmbed("❌ You don’t got perms.", 0xff0000)],
          ephemeral: true,
        });
      if (!target)
        return interaction.reply({
          embeds: [makeEmbed("❌ Couldn’t find that member.", 0xff0000)],
        });
      await target.kick();
      return interaction.reply({
        embeds: [makeEmbed(`👢 Kicked ${target.user.tag}`)],
      });

    case "ban":
      if (
        !interaction.member.permissions.has(
          PermissionsBitField.Flags.BanMembers
        )
      )
        return interaction.reply({
          embeds: [makeEmbed("❌ You don’t got perms.", 0xff0000)],
          ephemeral: true,
        });
      if (!target)
        return interaction.reply({
          embeds: [makeEmbed("❌ Couldn’t find that member.", 0xff0000)],
        });
      await target.ban();
      return interaction.reply({
        embeds: [makeEmbed(`🔨 Banned ${target.user.tag}`)],
      });

    case "unban":
      if (
        !interaction.member.permissions.has(
          PermissionsBitField.Flags.BanMembers
        )
      )
        return interaction.reply({
          embeds: [makeEmbed("❌ You don’t got perms.", 0xff0000)],
          ephemeral: true,
        });
      const userid = interaction.options.getString("userid");
      try {
        await interaction.guild.members.unban(userid);
        return interaction.reply({
          embeds: [makeEmbed(`✅ Unbanned user ID ${userid}`)],
        });
      } catch {
        return interaction.reply({
          embeds: [makeEmbed("❌ Couldn’t unban that user.", 0xff0000)],
        });
      }

    case "timeout":
      if (
        !interaction.member.permissions.has(
          PermissionsBitField.Flags.ModerateMembers
        )
      )
        return interaction.reply({
          embeds: [makeEmbed("❌ You don’t got perms.", 0xff0000)],
          ephemeral: true,
        });
      if (!target)
        return interaction.reply({
          embeds: [makeEmbed("❌ Couldn’t find that member.", 0xff0000)],
        });
      const duration = interaction.options.getInteger("duration");
      await target.timeout(duration * 60 * 1000);
      return interaction.reply({
        embeds: [
          makeEmbed(`⏱️ Timed out ${target.user.tag} for ${duration} minutes`),
        ],
      });

    case "untimeout":
      if (
        !interaction.member.permissions.has(
          PermissionsBitField.Flags.ModerateMembers
        )
      )
        return interaction.reply({
          embeds: [makeEmbed("❌ You don’t got perms.", 0xff0000)],
          ephemeral: true,
        });
      if (!target)
        return interaction.reply({
          embeds: [makeEmbed("❌ Couldn’t find that member.", 0xff0000)],
        });
      await target.timeout(null);
      return interaction.reply({
        embeds: [makeEmbed(`✅ Removed timeout from ${target.user.tag}`)],
      });

    case "slowmode":
      if (
        !interaction.member.permissions.has(
          PermissionsBitField.Flags.ManageChannels
        )
      )
        return interaction.reply({
          embeds: [makeEmbed("❌ You don’t got perms.", 0xff0000)],
          ephemeral: true,
        });
      const seconds = interaction.options.getInteger("seconds");
      await interaction.channel.setRateLimitPerUser(seconds);
      return interaction.reply({
        embeds: [makeEmbed(`🐢 Slowmode set to ${seconds} seconds`)],
      });

    case "role":
      if (
        !interaction.member.permissions.has(
          PermissionsBitField.Flags.ManageRoles
        )
      )
        return interaction.reply({
          embeds: [makeEmbed("❌ You don’t got perms.", 0xff0000)],
          ephemeral: true,
        });
      if (!target)
        return interaction.reply({
          embeds: [makeEmbed("❌ Couldn’t find that member.", 0xff0000)],
        });
      const role = interaction.options.getRole("role");
      const action = interaction.options.getString("action");
      if (action === "add") await target.roles.add(role);
      else await target.roles.remove(role);
      return interaction.reply({
        embeds: [
          makeEmbed(`✅ Role ${action}ed ${role.name} for ${target.user.tag}`),
        ],
      });

    case "purge":
      if (
        !interaction.member.permissions.has(
          PermissionsBitField.Flags.ManageMessages
        )
      )
        return interaction.reply({
          embeds: [makeEmbed("❌ You don’t got perms.", 0xff0000)],
          ephemeral: true,
        });
      const amount = interaction.options.getInteger("amount");
      const fetched = await interaction.channel.messages.fetch({
        limit: amount,
      });
      await interaction.channel.bulkDelete(fetched, true);
      return interaction.reply({
        embeds: [makeEmbed(`🧹 Deleted ${fetched.size} messages`)],
      });
  }
});

client.login(token);
