// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                    🤖  BOT ENTRY POINT  —  index.js                        ║
// ║         World-class Giveaway System v3.0 — Schedule · Live Timer · DM      ║
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
        GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Channel],
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
    else            client.on(event.name,   (...args) => event.execute(...args, client));
}

// ─── GIVEAWAY HELPERS (lazy load) ────────────────────────────────────────────
let _gw;
const gw = () => _gw || (_gw = require('./commands/giveaway'));

// ─────────────────────────────────────────────────────────────────────────────
//  🔴 END A GIVEAWAY  (shared logic — called from the loop)
// ─────────────────────────────────────────────────────────────────────────────
async function endGiveaway(guild, channel, message, gwData, guildId, msgId, db) {
    const helpers    = gw();
    const uniqList   = [...new Set(gwData.entrants)];
    const hasEntrants = uniqList.length > 0;
    let   winners    = [];

    if (hasEntrants) {
        winners = helpers.pickWinners(gwData.entrants, Math.min(gwData.winnersCount, uniqList.length));
    }

    gwData.winners = winners;

    // ── Update the giveaway message → 🔴 ENDED embed ─────────────────────────
    const endedEmbed = helpers.buildEndedEmbed(gwData, winners);
    await message.edit({ embeds: [endedEmbed], components: [helpers.buildEndedRow(gwData.entrants.length)] });

    // ── Send winner announcement in channel ────────────────────────────────────
    if (hasEntrants) {
        const mentions = winners.map(id => `<@${id}>`).join('  ');
        await channel.send({
            content: [
                '╔══════════════════════════════════════════╗',
                `   <:admin:1381648094487380111>  **GIVEAWAY ENDED — WINNER${winners.length > 1 ? 'S' : ''} PICKED!**`,
                '╚══════════════════════════════════════════╝',
                '',
                `<:emoji_16:1381662917904039986>  **Congratulations to:** ${mentions}`,
                `<:Ping:1478693277124395018>  **Prize:** **${gwData.prize}**`,
                `<:user:1382109313732186184>  Contact <@${gwData.hostId}> to claim your reward!`,
            ].join('\n'),
            embeds: [helpers.buildWinnerAnnouncementEmbed(gwData, winners, guildId, msgId)],
        });

        // ── DM each winner ────────────────────────────────────────────────────
        if (gwData.dmWinners !== false) {
            for (const winnerId of winners) {
                try {
                    const user = await client.users.fetch(winnerId);
                    await user.send({ embeds: [helpers.buildWinnerDMEmbed(gwData, guildId, msgId)] });
                } catch (_) { /* DMs off — silently skip */ }
            }
        }
    } else {
        await channel.send({
            embeds: [new EmbedBuilder()
                .setTitle(`<:Pepe_sadge:1478694552499126325>  ${gwData.prize}  —  No Winners`)
                .setColor(0xE74C3C)
                .setDescription([
                    `The giveaway ended with **no entries**.`,
                    `<@${gwData.hostId}> may restart with \`/giveaway start\`.`,
                ].join('\n'))
                .setTimestamp()
            ],
        });
    }

    // ── Log channel ───────────────────────────────────────────────────────────
    if (gwData.logChannelId) {
        try {
            const logCh = guild.channels.cache.get(gwData.logChannelId);
            const wText = winners.length ? winners.map(id => `<@${id}>`).join(', ') : '*No winners*';
            if (logCh) await logCh.send({ embeds: [helpers.buildLogEmbed('end', gwData, `**Winners:** ${wText}`)] });
        } catch (_) {}
    }

    // ── Server stats ──────────────────────────────────────────────────────────
    if (db[guildId]?.gwStats) {
        db[guildId].gwStats.totalEntries += gwData.entrants.length;
        db[guildId].gwStats.totalWinners += winners.length;
    }
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║   🏆  GIVEAWAY MAIN LOOP  —  runs every 10 seconds                         ║
// ║                                                                              ║
// ║   Handles:                                                                   ║
// ║   1. Fire scheduled giveaways when their startAt time arrives               ║
// ║   2. End expired active giveaways (pick winners, DM, announce)              ║
// ║   3. Refresh live embed (progress bar) every 60 seconds                     ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const EMBED_REFRESH_MS = 60_000;

setInterval(async () => {
    try {
        const db      = loadDb();
        let   changed = false;

        for (const guildId in db) {
            const gData = db[guildId];
            const guild = client.guilds.cache.get(guildId);
            if (!guild) continue;

            // ══════════════════════════════════════════════════════════════════
            //  FIRE SCHEDULED GIVEAWAYS
            // ══════════════════════════════════════════════════════════════════
            if (gData.scheduled) {
                for (const schedId in gData.scheduled) {
                    const sched = gData.scheduled[schedId];
                    if (sched.fired || Date.now() < sched.startAt) continue;

                    sched.fired = true;
                    changed     = true;

                    try {
                        const channel = guild.channels.cache.get(sched.channelId);
                        if (!channel) continue;

                        const startTime = Date.now();
                        const endTime   = startTime + sched.durationMs;

                        const gwData = {
                            ...sched,
                            startTime, endTime,
                            entrants: [], winners: [],
                            ended: false, cancelled: false, paused: false,
                            messageId: null, lastEmbedUpdate: 0,
                        };

                        const { buildActiveEmbed, buildActiveRow } = gw();
                        const embed = buildActiveEmbed(gwData, 0);
                        const row   = buildActiveRow(0);

                        const msg = await channel.send({
                            content: sched.pingRole ? `<@&${sched.pingRole}>` : null,
                            embeds:  [embed],
                            components: [row],
                        });

                        gwData.messageId = msg.id;
                        if (!db[guildId].giveaways) db[guildId].giveaways = {};
                        db[guildId].giveaways[msg.id] = gwData;

                    } catch (err) {
                        console.error(`[Giveaway] Failed to fire scheduled ${schedId}:`, err.message);
                    }
                }
            }

            // ══════════════════════════════════════════════════════════════════
            //  PROCESS ACTIVE GIVEAWAYS
            // ══════════════════════════════════════════════════════════════════
            if (!gData.giveaways) continue;

            for (const msgId in gData.giveaways) {
                const gwData = gData.giveaways[msgId];

                // Skip non-active
                if (gwData.ended || gwData.cancelled || gwData.paused) continue;

                const channel = guild.channels.cache.get(gwData.channelId);
                if (!channel) continue;

                const now = Date.now();

                // ────────────────────────────────────────────────────────────
                //  CASE A: Expired → END IT
                // ────────────────────────────────────────────────────────────
                if (now > gwData.endTime) {
                    gwData.ended = true;
                    changed      = true;

                    try {
                        const message = await channel.messages.fetch(msgId).catch(() => null);
                        if (!message) continue;
                        await endGiveaway(guild, channel, message, gwData, guildId, msgId, db);
                    } catch (err) {
                        console.error(`[Giveaway] Error ending ${msgId}:`, err.message);
                    }
                }

                // ────────────────────────────────────────────────────────────
                //  CASE B: Still alive → refresh embed every 60s
                //          This keeps the progress bar and time counter LIVE
                // ────────────────────────────────────────────────────────────
                else if (now - (gwData.lastEmbedUpdate || 0) >= EMBED_REFRESH_MS) {
                    gwData.lastEmbedUpdate = now;
                    changed                = true;

                    try {
                        const message = await channel.messages.fetch(msgId).catch(() => null);
                        if (!message) continue;

                        const uniqueCount = [...new Set(gwData.entrants)].length;
                        const { buildActiveEmbed, buildActiveRow } = gw();

                        await message.edit({
                            embeds:     [buildActiveEmbed(gwData, uniqueCount)],
                            components: [buildActiveRow(uniqueCount)],
                        });
                    } catch (_) { /* Message deleted or no perms — skip silently */ }
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
    console.log(`🟢  Bot online: ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(config.token);
    try {
        console.log('🔄  Refreshing slash commands...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: commandsData });
        console.log('🔥  Slash commands reloaded.');
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
client.login(config.token).catch(err => console.error('❌  Login Error:', err.message));
