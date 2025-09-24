const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder,
  MessageFlags,
} = require("discord.js");

// Token comes from startup args
const token = process.argv[2];
if (!token) {
  console.error("❌ No token provided. Pass it in startup");
  process.exit(1);
}

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

client.login(token);
