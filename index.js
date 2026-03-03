// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                    🤖  BOT ENTRY POINT  —  index.js                        ║
// ║          World-class Giveaway System v2.0 — Live Timer · DM · Log          ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const {
    Client, GatewayIntentBits, Partials, Collection,
    REST, Routes,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder
} = require('discord.js');
const fs     = require('fs');
const config = require('./config.json');
const trLang = require('./tr.json');
const enLang = require('./en.json');

// ─── DATABASE ────────────────────────────────────────────────────────────────
const DB_PATH = './db.json';
function loadDb() {
    if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, '{}');
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}
function saveDb(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

// ─── CLIENT ──────────────────────────────────────────────────────────────────
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

client.commands = new Collection();
const commandsData = [];

// ─── USER DATA ───────────────────────────────────────────────────────────────
const userData = new Map();
function getUserProfile(userId) {
    if (!userData.has(userId)) userData.set(userId, { lang: null, inGameName: null, balance: 0 });
    return userData.get(userId);
}
function getLangData(lang) { return lang === 'tr' ? trLang : enLang; }

// ─── LOAD COMMANDS ───────────────────────────────────────────────────────────
const commandFiles = fs.readdirSync('./commands').filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    if (command.data) {
        client.commands.set(command.data.name, command);
        commandsData.push(command.data);
    }
}

// ─── LOAD EVENTS ─────────────────────────────────────────────────────────────
const eventFiles = fs.readdirSync('./events').filter(f => f.endsWith('.js'));
for (const file of eventFiles) {
    const event = require(`./events/${file}`);
    if (event.once) client.once(event.name, (...args) => event.execute(...args, client));
    else client.on(event.name, (...args) => event.execute(...args, client));
}

// ─── GIVEAWAY HELPER (lazy to avoid circular deps) ───────────────────────────
let _gw;
const gw = () => _gw || (_gw = require('./commands/giveaway'));

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║          🏆  GIVEAWAY MAIN LOOP  — runs every 10 seconds                   ║
// ║                                                                              ║
// ║  What this loop does:                                                        ║
// ║  1) Every 10s  → check if any giveaways have expired → end them             ║
// ║  2) Every 60s  → refresh active giveaway embeds (live progress bar!)        ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
const EMBED_REFRESH_INTERVAL = 60_000; // refresh live timer every 60s

setInterval(async () => {
    try {
        const db      = loadDb();
        let   changed = false;

        for (const guildId in db) {
            const guildData = db[guildId];
            if (!guildData.giveaways) continue;

            const guild = client.guilds.cache.get(guildId);
            if (!guild) continue;

            for (const msgId in guildData.giveaways) {
                const gwData = guildData.giveaways[msgId];

                // ── Skip ended / cancelled / paused giveaways ────────────────
                if (gwData.ended || gwData.cancelled || gwData.paused) continue;

                const channel = guild.channels.cache.get(gwData.channelId);
                if (!channel) continue;

                const now = Date.now();

                // ════════════════════════════════════════════════════════════
                //  CASE 1: Giveaway has expired → END IT
                // ════════════════════════════════════════════════════════════
                if (now > gwData.endTime) {
                    gwData.ended   = true;
                    changed        = true;

                    const message = await channel.messages.fetch(msgId).catch(() => null);
                    if (!message) continue;

                    try {
                        const helpers     = gw();
                        const uniqueList  = [...new Set(gwData.entrants)];
                        const hasEntrants = uniqueList.length > 0;
                        let   winners     = [];

                        if (hasEntrants) {
                            winners = helpers.pickWinners(gwData.entrants, Math.min(gwData.winnersCount, uniqueList.length));
                        }

                        gwData.winners = winners;

                        // ── Edit original message → ENDED embed (🔴 Red) ────
                        const endedEmbed = helpers.buildEndedEmbed(gwData, winners);
                        await message.edit({
                            embeds:     [endedEmbed],
                            components: [helpers.buildEndedRow(gwData.entrants.length)]
                        });

                        // ── Winner announcement message (🟢 Green) ──────────
                        if (hasEntrants) {
                            const mentions   = winners.map(id => `<@${id}>`).join('  ');
                            const annEmbed   = helpers.buildWinnerAnnouncementEmbed(gwData, winners, guildId, msgId);

                            await channel.send({
                                content: [
                                    '╔════════════════════════════════════════╗',
                                    `   🎊  **GIVEAWAY ENDED — WINNERS PICKED!**`,
                                    '╚════════════════════════════════════════╝',
                                    '',
                                    `🏆  **Congratulations to:** ${mentions}`,
                                    `🎁  **Prize:** \`${gwData.prize}\``,
                                    `📬  Contact <@${gwData.hostId}> to claim your reward!`,
                                ].join('\n'),
                                embeds: [annEmbed]
                            });

                            // ── DM each winner ───────────────────────────────
                            for (const winnerId of winners) {
                                try {
                                    const user = await client.users.fetch(winnerId);
                                    await user.send({ embeds: [helpers.buildWinnerDMEmbed(gwData, guildId, msgId)] });
                                } catch (_) { /* DMs may be disabled */ }
                            }

                        } else {
                            // No entries
                            await channel.send({
                                embeds: [new EmbedBuilder()
                                    .setTitle('😔  Giveaway Ended — No Winners')
                                    .setColor(0xE74C3C)
                                    .setDescription([
                                        '```',
                                        `🎁  PRIZE: ${gwData.prize}`,
                                        '```',
                                        `The giveaway ended with **no entries**.`,
                                        '',
                                        `<@${gwData.hostId}> may restart it with \`/giveaway start\`.`
                                    ].join('\n'))
                                    .setTimestamp()
                                ]
                            });
                        }

                        // ── Send to log channel ──────────────────────────────
                        if (gwData.logChannelId) {
                            try {
                                const logChannel = guild.channels.cache.get(gwData.logChannelId);
                                const winText = winners.length > 0
                                    ? winners.map(id => `<@${id}>`).join(', ')
                                    : '*No winners*';
                                if (logChannel) {
                                    await logChannel.send({
                                        embeds: [gw().buildLogEmbed('end', gwData, `**Winners:** ${winText}`)]
                                    });
                                }
                            } catch (_) {}
                        }

                        // ── Update server stats ──────────────────────────────
                        if (db[guildId].gwStats) {
                            db[guildId].gwStats.totalEntries += gwData.entrants.length;
                            db[guildId].gwStats.totalWinners += winners.length;
                        }

                    } catch (err) {
                        console.error(`[Giveaway] Error ending ${msgId}:`, err.message);
                    }
                }

                // ════════════════════════════════════════════════════════════
                //  CASE 2: Still active → refresh embed every 60s
                //          This keeps the progress bar and time remaining LIVE.
                // ════════════════════════════════════════════════════════════
                else if (now - (gwData.lastEmbedUpdate || 0) >= EMBED_REFRESH_INTERVAL) {
                    gwData.lastEmbedUpdate = now;
                    changed = true;

                    try {
                        const message = await channel.messages.fetch(msgId).catch(() => null);
                        if (!message) continue;

                        const uniqueCount    = [...new Set(gwData.entrants)].length;
                        const refreshedEmbed = gw().buildActiveEmbed(gwData, uniqueCount);
                        const row            = gw().buildActiveRow(uniqueCount);

                        await message.edit({ embeds: [refreshedEmbed], components: [row] });
                    } catch (_) { /* Message may have been deleted */ }
                }
            }
        }

        if (changed) saveDb(db);

    } catch (err) {
        console.error('[Giveaway Loop] Unexpected error:', err.message);
    }
}, 10_000);

// ─── READY ───────────────────────────────────────────────────────────────────
client.once('ready', async () => {
    console.log(`✅  Bot is online: ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(config.token);
    try {
        console.log('🔄  Refreshing slash commands...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: commandsData });
        console.log('✅  Slash commands reloaded.');
    } catch (err) {
        console.error('❌  Slash command load error:', err.message);
    }
});

// ─── MESSAGE COMMANDS ─────────────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(config.prefix)) return;
    const args    = message.content.slice(config.prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    const validCommands = ['help', 'setuser', 'checkuser', 'buy', 'buyperma', 'world', 'link', 'balance'];
    if (!validCommands.includes(command)) return;

    const profile = getUserProfile(message.author.id);
    if (!profile.lang) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('lang_tr').setLabel('Türkçe').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('lang_en').setLabel('English').setStyle(ButtonStyle.Primary)
        );
        return message.reply({ content: 'Please select a language / Lütfen dil seçin', components: [row] });
    }

    if (command === 'link') {
        const linkEmbed = new EmbedBuilder()
            .setTitle('<:nuronskrak:1381655242927767562> Download Link')
            .setColor('#000000')
            .setDescription(`➤ [**Download Nuron's Krak**](https://discord.gg/Nwj3VXypJf)`);
        await message.reply({ embeds: [linkEmbed] });
    }
});

// ─── LOGIN ───────────────────────────────────────────────────────────────────
client.login(config.token).catch(err => {
    console.error('❌  Login Error:', err.message);
});
