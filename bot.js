const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const { ProfileNetworthCalculator } = require('skyhelper-networth');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- PATHS ---
const configPath = path.join(__dirname, 'config.json');
const reqsPath = path.join(__dirname, 'reqs.json');
const dbPath = path.join(__dirname, 'verified_users.json');

function getLatestConfig() { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
function getLatestReqs() { return JSON.parse(fs.readFileSync(reqsPath, 'utf8')); }

let verifiedUsers = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath)) : {};

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// --- CORE STATS LOGIC ---
async function getStats(uuid) {
    const conf = getLatestConfig();
    try {
        const cleanUuid = uuid.replace(/-/g, "");
        const [profileRes, museumRes] = await Promise.all([
            axios.get(`https://api.hypixel.net/v2/skyblock/profiles?key=${conf.HYPIXEL_KEY}&uuid=${cleanUuid}`),
            axios.get(`https://api.hypixel.net/v2/skyblock/museum?key=${conf.HYPIXEL_KEY}&uuid=${cleanUuid}`).catch(() => ({ data: {} }))
        ]);

        const profiles = profileRes.data.profiles;
        if (!profiles || profiles.length === 0) return { lv: 0, nw: 0 };

        let maxNw = 0, maxLv = 0;
        for (const p of profiles) {
            const memberData = p.members[cleanUuid];
            if (!memberData) continue;
            const museumData = museumRes.data.members?.[cleanUuid] || {};
            const bankBalance = p.banking?.balance || 0;

            const calculator = new ProfileNetworthCalculator(memberData, museumData, bankBalance);
            const result = await calculator.getNetworth();

            if (result.networth > maxNw) maxNw = result.networth;
            const lv = (memberData.leveling?.experience / 100) || 0;
            if (lv > maxLv) maxLv = lv;
        }
        return { lv: maxLv, nw: maxNw };
    } catch (e) { return { lv: 0, nw: 0 }; }
}

// --- SHARED ROLE SYNC FUNCTION ---
async function syncMember(member, uuid) {
    const conf = getLatestConfig();
    const reqs = getLatestReqs();
    
    try {
        const hGuild = await axios.get(`https://api.hypixel.net/v2/guild?key=${conf.HYPIXEL_KEY}&name=${conf.GUILD_NAME}`);
        const membersMap = new Map(hGuild.data.guild.members.map(m => [m.uuid.replace(/-/g, ""), m.rank]));
        const cleanUuid = uuid.replace(/-/g, "");

        if (membersMap.has(cleanUuid)) {
            if (!member.roles.cache.has(conf.ROLES.IN_GUILD)) await member.roles.add(conf.ROLES.IN_GUILD).catch(() => {});
            if (member.roles.cache.has(conf.ROLES.NOT_IN_GUILD)) await member.roles.remove(conf.ROLES.NOT_IN_GUILD).catch(() => {});

            const stats = await getStats(uuid);
            if (stats.lv === 0 && stats.nw === 0) return { success: false, error: "API 0" };

            let eligibleTier = "ENDERMAN";
            if (stats.lv >= reqs.VOIDLING.level && stats.nw >= reqs.VOIDLING.networth) eligibleTier = "VOIDLING";
            else if (stats.lv >= reqs.ZEALOT.level && stats.nw >= reqs.ZEALOT.networth) eligibleTier = "ZEALOT";
            else if (stats.lv >= reqs.WATCHER.level && stats.nw >= reqs.WATCHER.networth) eligibleTier = "WATCHER";

            const inGameRank = (membersMap.get(cleanUuid) || "member").toLowerCase();
            let roleToSet;

            if (eligibleTier === "VOIDLING" && inGameRank === "voidling") roleToSet = conf.ROLES.VOIDLING;
            else if (eligibleTier === "VOIDLING") roleToSet = conf.ROLES.ZEALOT; 
            else roleToSet = conf.ROLES[eligibleTier];

            const tierIds = [conf.ROLES.ENDERMAN, conf.ROLES.WATCHER, conf.ROLES.ZEALOT, conf.ROLES.VOIDLING];
            for (const tid of tierIds) {
                if (tid === roleToSet) {
                    if (!member.roles.cache.has(tid)) await member.roles.add(tid).catch(() => {});
                } else {
                    if (member.roles.cache.has(tid)) await member.roles.remove(tid).catch(() => {});
                }
            }
            return { success: true, tier: eligibleTier, igRank: inGameRank, lv: stats.lv };
        } else {
            if (!member.roles.cache.has(conf.ROLES.NOT_IN_GUILD)) await member.roles.add(conf.ROLES.NOT_IN_GUILD).catch(() => {});
            if (member.roles.cache.has(conf.ROLES.IN_GUILD)) await member.roles.remove(conf.ROLES.IN_GUILD).catch(() => {});
            for (const tid of [conf.ROLES.ENDERMAN, conf.ROLES.WATCHER, conf.ROLES.ZEALOT, conf.ROLES.VOIDLING]) {
                if (member.roles.cache.has(tid)) await member.roles.remove(tid).catch(() => {});
            }
            return { success: true, tier: "Guest" };
        }
    } catch (e) { return { success: false, error: e.message }; }
}

function saveDb() { fs.writeFileSync(dbPath, JSON.stringify(verifiedUsers, null, 2)); }

// --- AUTOMATIC REMOVAL ON LEAVE ---
client.on('guildMemberRemove', async member => {
    const conf = getLatestConfig();
    if (verifiedUsers[member.id]) {
        delete verifiedUsers[member.id];
        saveDb();
        const logChannel = member.guild.channels.cache.get(conf.LOG_CHANNEL_ID);
        if (logChannel) {
            const embed = new EmbedBuilder().setTitle("User Left").setDescription(`**${member.user.tag}** left. Unverified.`).setColor(0xFF0000);
            logChannel.send({ embeds: [embed] }).catch(() => {});
        }
    }
});

// --- COMMANDS ---
client.once('clientReady', async () => { console.log(`✅ SkysEnd Bot V14.1 Online.`); });

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    const { commandName, options, user, member, guild } = interaction;
    const conf = getLatestConfig();

    if (commandName === 'updateall') {
        await interaction.deferReply();
        try {
            const hGuild = await axios.get(`https://api.hypixel.net/v2/guild?key=${conf.HYPIXEL_KEY}&name=${conf.GUILD_NAME}`);
            const membersMap = new Map(hGuild.data.guild.members.map(m => [m.uuid.replace(/-/g, ""), m.rank]));
            
            let success = [], bypassed = [], unverified = [], failed = [], manual = [], voidEligible = [];
            const discordMembers = await guild.members.fetch();

            for (const [id, targetMember] of discordMembers) {
                if (!targetMember || targetMember.user.bot) continue;
                const bypassIds = [conf.ROLES.DRAG, conf.ROLES.RETIRED, conf.ROLES.SUPERVISOR, conf.ROLES.ADMIN];
                if (targetMember.roles.cache.some(r => bypassIds.includes(r.id))) { bypassed.push(targetMember.displayName); continue; }
                if (!verifiedUsers[id]) { unverified.push(targetMember.user.username); continue; }

                const res = await syncMember(targetMember, verifiedUsers[id]);
                if (res.success) {
                    success.push(targetMember.displayName);
                    
                    const actual = (res.igRank || "member").toLowerCase();
                    const deserving = (res.tier || "enderman").toLowerCase();

                    // 1. VOIDLING ELIGIBLE LIST
                    if (deserving === "voidling" && actual !== "voidling") {
                        voidEligible.push(`${targetMember.displayName} (Lv ${res.lv?.toFixed(0) || 0})`);
                    }

                    // 2. MANUAL PROMOTION LOGIC (The Fix)
                    if (res.tier !== "Guest" && res.tier !== "ENDERMAN") {
                        if (actual === "voidling") {
                            // Already voidling - only log if they FAILED requirements (demotion)
                            if (deserving !== "voidling") {
                                manual.push(`**${targetMember.displayName}**: VOIDLING ➜ **${deserving.toUpperCase()}**`);
                            }
                        } else {
                            // Not voidling in-game
                            if (deserving === "voidling") {
                                // Deserves Voidling - Suggest Zealot promotion if they aren't even Zealot yet
                                if (actual !== "zealot") {
                                    manual.push(`**${targetMember.displayName}**: ${actual.toUpperCase()} ➜ **ZEALOT**`);
                                }
                            } else if (actual !== deserving) {
                                manual.push(`**${targetMember.displayName}**: ${actual.toUpperCase()} ➜ **${deserving.toUpperCase()}**`);
                            }
                        }
                    }
                } else failed.push(targetMember.user.username);
                await new Promise(r => setTimeout(r, 1500));
            }

            const limit = (arr) => {
                let s = arr.join(", ");
                return s.length > 1000 ? s.substring(0, 997) + "..." : s || "None";
            };

            const embed = new EmbedBuilder().setTitle("Global Sync Report").setColor(0xAA00FF)
                .addFields(
                    { name: "✅ Successful Sync", value: limit(success) },
                    { name: "✨ Voidling Eligible", value: limit(voidEligible) },
                    { name: "⏭️ Bypassed", value: limit(bypassed) },
                    { name: "❓ Unverified", value: limit(unverified) },
                    { name: "❌ Failed", value: limit(failed) },
                    { name: "⚠️ Manual Promotions Needed", value: manual.join('\n').substring(0, 1024) || "None" }
                );
            interaction.followUp({ embeds: [embed] });
        } catch (e) { interaction.followUp("❌ API Error."); console.error(e); }
    }

    // --- REMAINING COMMANDS ---
    if (commandName === 'verify') {
        if (verifiedUsers[user.id]) return interaction.reply({ content: "❌ Already verified!", flags: [MessageFlags.Ephemeral] });
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        try {
            const mojang = await axios.get(`https://api.mojang.com/users/profiles/minecraft/${options.getString('ign')}`);
            const uuid = mojang.data.id;
            const hypixel = await axios.get(`https://api.hypixel.net/v2/player?key=${conf.HYPIXEL_KEY}&uuid=${uuid}`);
            const link = hypixel.data.player?.socialMedia?.links?.DISCORD;
            if (link !== user.username) return interaction.followUp(`❌ Mismatch. Hypixel: \`${link || "None"}\`.`);
            verifiedUsers[user.id] = uuid;
            saveDb();
            await member.setNickname(options.getString('ign')).catch(() => {});
            await syncMember(member, uuid);
            interaction.followUp(`✅ Verified!`);
        } catch (e) { interaction.followUp(`❌ Error Verifying.`); }
    }

    if (commandName === 'check') {
        const target = options.getMember('user');
        if (!verifiedUsers[target.id]) return interaction.reply({ content: "❌ Not verified.", flags: [MessageFlags.Ephemeral] });
        await interaction.deferReply();
        const stats = await getStats(verifiedUsers[target.id]);
        interaction.followUp({ embeds: [new EmbedBuilder().setTitle(`Stats: ${target.displayName}`).addFields({ name: 'Level', value: stats.lv.toFixed(2), inline: true }, { name: 'NW', value: (stats.nw / 1e9).toFixed(2) + "B", inline: true }).setColor(0x00AAFF)] });
    }

    if (commandName === 'unverify') {
        const target = options.getMember('user');
        delete verifiedUsers[target.id];
        saveDb();
        const roles = [conf.ROLES.IN_GUILD, conf.ROLES.NOT_IN_GUILD, conf.ROLES.ENDERMAN, conf.ROLES.WATCHER, conf.ROLES.ZEALOT, conf.ROLES.VOIDLING];
        for (const r of roles) await target.roles.remove(r).catch(() => {});
        interaction.reply({ content: `✅ Cleared **${target.user.username}**.`, flags: [MessageFlags.Ephemeral] });
    }

    if (commandName === 'forceverify') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const target = options.getMember('user');
        try {
            const mojang = await axios.get(`https://api.mojang.com/users/profiles/minecraft/${options.getString('ign')}`);
            verifiedUsers[target.id] = mojang.data.id;
            saveDb();
            await target.setNickname(options.getString('ign')).catch(() => {});
            await syncMember(target, mojang.data.id);
            interaction.followUp(`✅ Force-verified **${target.user.username}**.`);
        } catch (e) { interaction.followUp("❌ Error."); }
    }

    if (commandName === 'update') {
        const target = options.getMember('user');
        if (!verifiedUsers[target.id]) return interaction.reply({ content: "❌ Not verified.", flags: [MessageFlags.Ephemeral] });
        await interaction.deferReply();
        const res = await syncMember(target, verifiedUsers[target.id]);
        interaction.followUp(res.success ? `✅ Updated **${target.displayName}**.` : "❌ Failed.");
    }
});

client.login(getLatestConfig().TOKEN);