// ====================================================
//  RUN THIS FILE IN TERMINAL:  node deploy-commands.js
// ====================================================

const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

// --- LOAD CONFIG ---
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Safety checks
if (!config.TOKEN || !config.CLIENT_ID || !config.DISCORD_GUILD_ID) {
    console.error("❌ Error: Missing TOKEN, CLIENT_ID, or DISCORD_GUILD_ID in config.json");
    process.exit(1);
}

const commands = [
    // ==========================================
    // 🟢 PUBLIC COMMANDS
    // ==========================================

    new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Link your Minecraft account')
        .addStringOption(option => 
            option.setName('ign')
                .setDescription('Your Minecraft Username')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('check')
        .setDescription('Check stats of a verified user')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user to check')
                .setRequired(true)),

    // ==========================================
    // 🔒 ADMIN COMMANDS
    // ==========================================

    new SlashCommandBuilder()
        .setName('ihateapi')
        .setDescription('ADMIN | Shows status of Mojang and Hypixel APIs')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('updateall')
        .setDescription('ADMIN | Syncs roles for the entire discord')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('unverify')
        .setDescription('ADMIN | Unlink a user')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user to unverify')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('forceverify')
        .setDescription('ADMIN | Force verify a user')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('ign')
                .setDescription('Minecraft Username')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('update')
        .setDescription('ADMIN | Update a single user')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user to update')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
]
.map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(config.TOKEN);

(async () => {
    try {
        console.log(`🚀 Deploying commands to Server ID: ${config.DISCORD_GUILD_ID}...`);
        
        await rest.put(
            Routes.applicationGuildCommands(config.CLIENT_ID, config.DISCORD_GUILD_ID),
            { body: commands },
        );

        console.log('✅ Successfully loaded commands! Admin commands are hidden from normal users.');
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
})();