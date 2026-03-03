// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║              🏆  WORLD-CLASS GIVEAWAY SYSTEM  —  giveaway.js               ║
// ║         Built with love | Full English | Beautiful Embeds | Pro Features    ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField
} = require('discord.js');
const fs = require('fs');

const DB_PATH = './db.json';
function loadDb() {
    if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, '{}');
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}
function saveDb(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

// ─────────────────────────────────────────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/** Parse duration strings like "10m", "2h", "1d 30m" into milliseconds */
function parseTime(str) {
    const regex = /(\d+)\s*([smhd])/gi;
    let ms = 0, match;
    while ((match = regex.exec(str)) !== null) {
        const n = parseInt(match[1]);
        switch (match[2].toLowerCase()) {
            case 's': ms += n * 1000; break;
            case 'm': ms += n * 60000; break;
            case 'h': ms += n * 3600000; break;
            case 'd': ms += n * 86400000; break;
        }
    }
    return ms;
}

/** Format remaining time into a human-readable string */
function formatDuration(ms) {
    if (ms <= 0) return 'Ended';
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const parts = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    if (s) parts.push(`${s}s`);
    return parts.join(' ') || '< 1s';
}

/** Build a visual progress bar */
function buildProgressBar(startTime, endTime, length = 14) {
    const now = Date.now();
    const total = endTime - startTime;
    const elapsed = now - startTime;
    const pct = Math.min(1, Math.max(0, elapsed / total));
    const filled = Math.round(pct * length);
    const empty = length - filled;
    return `${'█'.repeat(filled)}${'░'.repeat(empty)} ${Math.round(pct * 100)}%`;
}

/** Pick random winners from entrants array */
function pickWinners(entrants, count) {
    const pool = [...entrants];
    const winners = [];
    while (winners.length < count && pool.length > 0) {
        const idx = Math.floor(Math.random() * pool.length);
        winners.push(pool.splice(idx, 1)[0]);
    }
    return winners;
}

// ─────────────────────────────────────────────────────────────────────────────
//  EMBED BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

/** 🟢 Active Giveaway Embed */
function buildActiveEmbed(gw, entrantCount) {
    const endTs = Math.floor(gw.endTime / 1000);
    const remaining = gw.endTime - Date.now();
    const bar = buildProgressBar(gw.startTime, gw.endTime);

    return new EmbedBuilder()
        .setTitle(`🎉  ${gw.prize}`)
        .setColor(0x57F287)   // Discord green
        .setDescription([
            `> **${gw.description || 'Click the button below to enter this giveaway!'}**`,
            '',
            `**⏰  Ends:**  <t:${endTs}:R>  ·  <t:${endTs}:f>`,
            `**🏆  Winners:**  \`${gw.winnersCount}\``,
            `**👑  Hosted by:**  <@${gw.hostId}>`,
            gw.sponsor ? `**🤝  Sponsored by:**  ${gw.sponsor}` : null,
            gw.requiredRole ? `**🔒  Role Required:**  <@&${gw.requiredRole}>` : null,
            gw.minAccountAge ? `**📅  Min Account Age:**  ${gw.minAccountAge} days` : null,
            '',
            `**⏳  Time Remaining:**`,
            `\`${bar}\``,
            `\`${formatDuration(remaining)}\` left`,
        ].filter(Boolean).join('\n'))
        .setThumbnail(gw.imageUrl || null)
        .setFooter({ text: `🎟️  ${entrantCount} ${entrantCount === 1 ? 'entry' : 'entries'}  ·  Giveaway ID: ${gw.messageId || '—'}` })
        .setTimestamp(gw.endTime);
}

/** 🔴 Ended Giveaway Embed */
function buildEndedEmbed(gw, winnersText) {
    return new EmbedBuilder()
        .setTitle(`🔴  GIVEAWAY ENDED  ·  ${gw.prize}`)
        .setColor(0xED4245)   // Discord red
        .setDescription([
            `**🏆  Winner${gw.winnersCount > 1 ? 's' : ''}:**`,
            winnersText,
            '',
            `**👑  Hosted by:**  <@${gw.hostId}>`,
            gw.sponsor ? `**🤝  Sponsored by:**  ${gw.sponsor}` : null,
            '',
            `*This giveaway has ended. Thank you to everyone who participated!*`
        ].filter(Boolean).join('\n'))
        .setThumbnail(gw.imageUrl || null)
        .setFooter({ text: `Total entries: ${gw.entrants.length}  ·  Ended` })
        .setTimestamp();
}

/** 🏅 Reroll Embed */
function buildRerollEmbed(gw, winnersText) {
    return new EmbedBuilder()
        .setTitle(`🔁  REROLL  ·  ${gw.prize}`)
        .setColor(0xFEE75C)   // Discord yellow/gold
        .setDescription([
            `New winner${gw.winnersCount > 1 ? 's have' : ' has'} been selected!`,
            '',
            `**🏆  New Winner${gw.winnersCount > 1 ? 's' : ''}:**`,
            winnersText,
            '',
            `**👑  Hosted by:**  <@${gw.hostId}>`
        ].join('\n'))
        .setFooter({ text: `Rerolled from ${gw.entrants.length} entries` })
        .setTimestamp();
}

/** 🎊 Winner Announcement (channel message) */
function buildWinnerAnnouncement(gw, winnersText, guildId, msgId) {
    const link = `https://discord.com/channels/${guildId}/${gw.channelId}/${msgId}`;
    return new EmbedBuilder()
        .setTitle(`🎊  Congratulations!`)
        .setColor(0x57F287)
        .setDescription([
            `${winnersText}`,
            '',
            `You won the **${gw.prize}** giveaway! 🎉`,
            `Please contact <@${gw.hostId}> to claim your prize.`,
            '',
            `[**→ Jump to Giveaway**](${link})`
        ].join('\n'))
        .setFooter({ text: `Hosted by: ${gw.hostId}  ·  🎟️ ${gw.entrants.length} entries` })
        .setTimestamp();
}

// ─────────────────────────────────────────────────────────────────────────────
//  COMMAND DEFINITION
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('🏆 The world-class giveaway system')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageEvents)

        // ── /giveaway start ──────────────────────────────────────────────────
        .addSubcommand(sub => sub
            .setName('start')
            .setDescription('🚀 Start a new giveaway')
            .addStringOption(o => o.setName('prize').setDescription('🎁 What are you giving away?').setRequired(true))
            .addStringOption(o => o.setName('duration').setDescription('⏰ Duration (e.g. 10m, 2h, 1d)').setRequired(true))
            .addIntegerOption(o => o.setName('winners').setDescription('🏆 Number of winners').setRequired(true).setMinValue(1).setMaxValue(20))
            .addStringOption(o => o.setName('description').setDescription('📝 Custom description for the giveaway').setRequired(false))
            .addStringOption(o => o.setName('image').setDescription('🖼️ Thumbnail image URL for the embed').setRequired(false))
            .addStringOption(o => o.setName('sponsor').setDescription('🤝 Sponsor name/text').setRequired(false))
            .addRoleOption(o => o.setName('required_role').setDescription('🔒 Role required to enter').setRequired(false))
            .addIntegerOption(o => o.setName('min_account_age').setDescription('📅 Minimum account age in days to enter').setRequired(false).setMinValue(1))
            .addIntegerOption(o => o.setName('bonus_entries').setDescription('🎟️ Extra entries for role holders (requires required_role)').setRequired(false).setMinValue(2).setMaxValue(10))
        )

        // ── /giveaway end ────────────────────────────────────────────────────
        .addSubcommand(sub => sub
            .setName('end')
            .setDescription('🛑 Force-end an active giveaway')
            .addStringOption(o => o.setName('message_id').setDescription('📌 Message ID of the giveaway').setRequired(true))
        )

        // ── /giveaway reroll ─────────────────────────────────────────────────
        .addSubcommand(sub => sub
            .setName('reroll')
            .setDescription('🔁 Re-pick winners for an ended giveaway')
            .addStringOption(o => o.setName('message_id').setDescription('📌 Message ID of the giveaway').setRequired(true))
            .addIntegerOption(o => o.setName('winners').setDescription('🏆 Override number of winners to pick').setRequired(false).setMinValue(1).setMaxValue(20))
        )

        // ── /giveaway list ───────────────────────────────────────────────────
        .addSubcommand(sub => sub
            .setName('list')
            .setDescription('📋 List all active giveaways on this server')
        )

        // ── /giveaway info ───────────────────────────────────────────────────
        .addSubcommand(sub => sub
            .setName('info')
            .setDescription('🔍 View details of a giveaway')
            .addStringOption(o => o.setName('message_id').setDescription('📌 Message ID of the giveaway').setRequired(true))
        ),

    // ─────────────────────────────────────────────────────────────────────────
    //  EXECUTE
    // ─────────────────────────────────────────────────────────────────────────
    async execute(interaction, client) {
        const sub = interaction.options.getSubcommand();
        const db = loadDb();
        const guildId = interaction.guild.id;

        if (!db[guildId]) db[guildId] = {};
        if (!db[guildId].giveaways) db[guildId].giveaways = {};

        // ══════════════════════════════════════════════════════════════════════
        //  START
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'start') {
            const prize = interaction.options.getString('prize');
            const durationStr = interaction.options.getString('duration');
            const winnersCount = interaction.options.getInteger('winners');
            const description = interaction.options.getString('description');
            const imageUrl = interaction.options.getString('image');
            const sponsor = interaction.options.getString('sponsor');
            const requiredRole = interaction.options.getRole('required_role')?.id || null;
            const minAccountAge = interaction.options.getInteger('min_account_age');
            const bonusEntries = interaction.options.getInteger('bonus_entries');

            const durationMs = parseTime(durationStr);
            if (durationMs === 0) {
                return interaction.reply({
                    embeds: [new EmbedBuilder()
                        .setColor(0xED4245)
                        .setTitle('❌  Invalid Duration')
                        .setDescription('Please use a valid format like `10m`, `2h`, `1d`, or `1d 12h`.')
                    ],
                    ephemeral: true
                });
            }

            const startTime = Date.now();
            const endTime = startTime + durationMs;

            const gw = {
                prize, description, imageUrl, sponsor,
                winnersCount, startTime, endTime,
                hostId: interaction.user.id,
                channelId: interaction.channel.id,
                requiredRole, minAccountAge,
                bonusEntries: bonusEntries || 1,
                entrants: [],   // weighted: userId appears N times for bonus
                ended: false
            };

            const embed = buildActiveEmbed(gw, 0);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('giveaway_enter')
                    .setLabel('Enter Giveaway')
                    .setEmoji('🎉')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('giveaway_leave')
                    .setLabel('Leave')
                    .setEmoji('🚪')
                    .setStyle(ButtonStyle.Danger)
            );

            await interaction.deferReply();
            const msg = await interaction.fetchReply();

            // We need the real message — editReply and fetch
            await interaction.editReply({ embeds: [embed], components: [row] });
            const realMsg = await interaction.fetchReply();

            gw.messageId = realMsg.id;
            db[guildId].giveaways[realMsg.id] = gw;
            saveDb(db);

            return; // done
        }

        // ══════════════════════════════════════════════════════════════════════
        //  END
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'end') {
            const msgId = interaction.options.getString('message_id');
            const gw = db[guildId]?.giveaways?.[msgId];

            if (!gw) return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('❌  Not Found').setDescription('No giveaway found with that message ID.')],
                ephemeral: true
            });
            if (gw.ended) return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle('⚠️  Already Ended').setDescription('This giveaway has already ended.')],
                ephemeral: true
            });

            gw.endTime = Date.now() - 1;
            saveDb(db);

            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅  Ending Giveaway').setDescription('The giveaway will end within a few seconds...')],
                ephemeral: true
            });
        }

        // ══════════════════════════════════════════════════════════════════════
        //  REROLL
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'reroll') {
            const msgId = interaction.options.getString('message_id');
            const overrideWinners = interaction.options.getInteger('winners');
            const gw = db[guildId]?.giveaways?.[msgId];

            if (!gw) return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('❌  Not Found').setDescription('No giveaway found with that message ID.')],
                ephemeral: true
            });
            if (!gw.ended) return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle('⚠️  Still Active').setDescription('This giveaway is still running. End it first.')],
                ephemeral: true
            });

            const uniqueEntrants = [...new Set(gw.entrants)];
            if (uniqueEntrants.length === 0) return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('❌  No Entries').setDescription('Nobody entered this giveaway.')],
                ephemeral: true
            });

            const winCount = overrideWinners || gw.winnersCount;
            const newWinners = pickWinners(gw.entrants, Math.min(winCount, uniqueEntrants.length));
            const winnerMentions = newWinners.map(id => `<@${id}>`).join(' ');
            const winnersText = newWinners.map((id, i) => `**${i + 1}.** <@${id}>`).join('\n');

            const channel = interaction.guild.channels.cache.get(gw.channelId);
            if (channel) {
                await channel.send({
                    content: `🔁  **REROLL** — ${winnerMentions}`,
                    embeds: [buildRerollEmbed(gw, winnersText)]
                });
            }

            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅  Rerolled!').setDescription(`New winner${newWinners.length > 1 ? 's' : ''} announced in <#${gw.channelId}>.`)],
                ephemeral: true
            });
        }

        // ══════════════════════════════════════════════════════════════════════
        //  LIST
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'list') {
            const giveaways = db[guildId]?.giveaways || {};
            const active = Object.entries(giveaways).filter(([, g]) => !g.ended);

            if (active.length === 0) {
                return interaction.reply({
                    embeds: [new EmbedBuilder()
                        .setColor(0xFEE75C)
                        .setTitle('📋  Active Giveaways')
                        .setDescription('There are no active giveaways right now.')
                    ],
                    ephemeral: true
                });
            }

            const lines = active.map(([id, g]) => {
                const endTs = Math.floor(g.endTime / 1000);
                const unique = [...new Set(g.entrants)].length;
                return `**${g.prize}** — ${unique} entries — ends <t:${endTs}:R>\n> ID: \`${id}\``;
            });

            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(0x57F287)
                    .setTitle(`📋  Active Giveaways  ·  ${active.length}`)
                    .setDescription(lines.join('\n\n'))
                    .setFooter({ text: `Use /giveaway info <message_id> for details` })
                ],
                ephemeral: true
            });
        }

        // ══════════════════════════════════════════════════════════════════════
        //  INFO
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'info') {
            const msgId = interaction.options.getString('message_id');
            const gw = db[guildId]?.giveaways?.[msgId];

            if (!gw) return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('❌  Not Found').setDescription('No giveaway found with that message ID.')],
                ephemeral: true
            });

            const unique = [...new Set(gw.entrants)];
            const endTs = Math.floor(gw.endTime / 1000);

            const embed = new EmbedBuilder()
                .setTitle(`🔍  Giveaway Info  ·  ${gw.prize}`)
                .setColor(gw.ended ? 0xED4245 : 0x57F287)
                .addFields(
                    { name: '🎁  Prize', value: gw.prize, inline: true },
                    { name: '🏆  Winners', value: `${gw.winnersCount}`, inline: true },
                    { name: '📊  Status', value: gw.ended ? '🔴 Ended' : '🟢 Active', inline: true },
                    { name: '🎟️  Total Entries', value: `${gw.entrants.length}`, inline: true },
                    { name: '👥  Unique Entrants', value: `${unique.length}`, inline: true },
                    { name: '⏰  End Time', value: `<t:${endTs}:f>`, inline: true },
                    { name: '👑  Host', value: `<@${gw.hostId}>`, inline: true },
                    gw.requiredRole ? { name: '🔒  Required Role', value: `<@&${gw.requiredRole}>`, inline: true } : null,
                    gw.sponsor ? { name: '🤝  Sponsor', value: gw.sponsor, inline: true } : null,
                ).setFooter({ text: `Message ID: ${msgId}` })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },

    // Export helper builders so index.js can use them
    buildActiveEmbed,
    buildEndedEmbed,
    buildWinnerAnnouncement,
    parseTime,
    pickWinners,
    buildProgressBar,
    formatDuration
};
