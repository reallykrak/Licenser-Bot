// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                  🤖  BOT ENTRY POINT  —  index.js                          ║
// ║           World-class Giveaway System integrated & upgraded                ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const {
    Client, GatewayIntentBits, Partials, Collection,
    REST, Routes,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder
} = require('discord.js');
const fs = require('fs');
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

// ─── GIVEAWAY HELPERS (lazy-loaded to avoid circular dep issues) ──────────────
let _gwHelpers;
function gwHelpers() {
    if (!_gwHelpers) _gwHelpers = require('./commands/giveaway');
    return _gwHelpers;
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║              🏆  WORLD-CLASS GIVEAWAY AUTO-END LOOP                        ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

setInterval(async () => {
    try {
        const db = loadDb();
        let changed = false;

        for (const guildId in db) {
            const guildData = db[guildId];
            if (!guildData.giveaways) continue;

            for (const msgId in guildData.giveaways) {
                const gw = guildData.giveaways[msgId];

                // Skip already ended or not yet due
                if (gw.ended || Date.now() <= gw.endTime) continue;

                gw.ended = true;
                changed = true;

                // ── Resolve Discord objects ───────────────────────────────────
                const guild   = client.guilds.cache.get(guildId);
                if (!guild) continue;
                const channel = guild.channels.cache.get(gw.channelId);
                if (!channel) continue;
                const message = await channel.messages.fetch(msgId).catch(() => null);
                if (!message) continue;

                try {
                    const { buildEndedEmbed, buildWinnerAnnouncement, pickWinners } = gwHelpers();

                    // ── Pick Winners ──────────────────────────────────────────
                    const uniqueEntrants = [...new Set(gw.entrants)];
                    const hasEntrants    = uniqueEntrants.length > 0;
                    let   winners        = [];
                    let   winnersText    = '> 😔  *Nobody entered this giveaway.*';

                    if (hasEntrants) {
                        winners      = pickWinners(gw.entrants, Math.min(gw.winnersCount, uniqueEntrants.length));
                        winnersText  = winners.map((id, i) => `> **${i + 1}.** <@${id}>`).join('\n');
                    }

                    // ── Edit original message → ENDED embed (🔴 Red) ─────────
                    const endedEmbed = buildEndedEmbed(gw, winnersText);

                    const disabledRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('giveaway_ended_enter')
                            .setLabel(`${gw.entrants.length} Entr${gw.entrants.length === 1 ? 'y' : 'ies'}  ·  Ended`)
                            .setEmoji('🎉')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('giveaway_ended_leave')
                            .setLabel('Closed')
                            .setEmoji('🔒')
                            .setStyle(ButtonStyle.Danger)
                            .setDisabled(true)
                    );

                    await message.edit({ embeds: [endedEmbed], components: [disabledRow] });

                    // ── Send winner announcement (🟢 Green) ───────────────────
                    if (hasEntrants) {
                        const winnerMentions    = winners.map(id => `<@${id}>`).join('  ');
                        const announcementEmbed = buildWinnerAnnouncement(gw, winnersText, guildId, msgId);

                        await channel.send({
                            content: [
                                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                                `🎊  **GIVEAWAY ENDED — WINNERS SELECTED!**`,
                                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                                '',
                                `🏆  **Congratulations to:** ${winnerMentions}`,
                                `🎁  **Prize:** ${gw.prize}`,
                                `📬  Please contact <@${gw.hostId}> to claim your reward!`,
                            ].join('\n'),
                            embeds: [announcementEmbed]
                        });

                    } else {
                        // No entries
                        await channel.send({
                            embeds: [new EmbedBuilder()
                                .setTitle('😔  Giveaway Ended — No Winners')
                                .setColor(0xED4245)
                                .setDescription([
                                    `The **${gw.prize}** giveaway ended with no entries.`,
                                    '',
                                    `<@${gw.hostId}> may restart it with \`/giveaway start\`.`
                                ].join('\n'))
                                .setTimestamp()
                            ]
                        });
                    }

                } catch (innerErr) {
                    console.error(`[Giveaway] Error ending ${msgId}:`, innerErr.message);
                }
            }
        }

        if (changed) saveDb(db);

    } catch (err) {
        console.error('[Giveaway Loop]', err.message);
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

// ─── MESSAGE COMMANDS ────────────────────────────────────────────────────────
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
