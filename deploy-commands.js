// ====================================================
//  RUN THIS FILE IN TERMINAL:  node deploy-commands.js
// ====================================================

const { REST, Routes, SlashCommandBuilder } = require('discord.js');
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
    // 1. IHATEAPI
    new SlashCommandBuilder()
        .setName('ihateapi')
        .setDescription('Shows status of Mojang and Hypixel APIs (Admin Only)'),

    // 2. UPDATEALL
    new SlashCommandBuilder()
        .setName('updateall')
        .setDescription('Syncs roles for the entire discord'),

    // 3. VERIFY
    new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Link your Minecraft account')
        .addStringOption(option => 
            option.setName('ign')
                .setDescription('Your Minecraft Username')
                .setRequired(true)),

    // 4. CHECK
    new SlashCommandBuilder()
        .setName('check')
        .setDescription('Check stats of a verified user')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user to check')
                .setRequired(true)),

    // 5. UNVERIFY
    new SlashCommandBuilder()
        .setName('unverify')
        .setDescription('Unlink a user')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user to unverify')
                .setRequired(true)),

    // 6. FORCEVERIFY
    new SlashCommandBuilder()
        .setName('forceverify')
        .setDescription('Force verify a user (Admin)')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('ign')
                .setDescription('Minecraft Username')
                .setRequired(true)),

    // 7. UPDATE
    new SlashCommandBuilder()
        .setName('update')
        .setDescription('Update a single user')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user to update')
                .setRequired(true))
]
.map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(config.TOKEN);

(async () => {
    try {
        console.log(`🚀 Deploying commands to Server ID: ${config.DISCORD_GUILD_ID}...`);
        
        // Registers commands ONLY to this specific server (Instant updates)
        await rest.put(
            Routes.applicationGuildCommands(config.CLIENT_ID, config.DISCORD_GUILD_ID),
            { body: commands },
        );

        console.log('✅ Successfully loaded commands for this server only.');
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
})();