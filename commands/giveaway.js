// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║         🏆  WORLD-CLASS GIVEAWAY SYSTEM v2.0  —  commands/giveaway.js      ║
// ║   Live Timers · DM Winners · Log Channel · Role Ping · GIF Support · Pro   ║
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

/** Parse duration strings → milliseconds (e.g. "1d 2h 30m") */
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

/** Human-readable time from ms */
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
    if (!d && s) parts.push(`${s}s`);   // only show seconds if < 1 day
    return parts.join(' ') || '< 1s';
}

/**
 * Live progress bar — recalculated every call so it's always accurate.
 * Shows Unicode blocks + exact time remaining.
 */
function buildProgressBar(startTime, endTime, barLength = 16) {
    const now = Date.now();
    const total = endTime - startTime;
    const elapsed = Math.max(0, now - startTime);
    const pct = Math.min(1, elapsed / total);
    const filled = Math.round(pct * barLength);
    const empty = barLength - filled;
    const bar = '▰'.repeat(filled) + '▱'.repeat(empty);
    const pctLabel = `${Math.round(pct * 100)}%`;
    return { bar, pctLabel };
}

/** Weighted random winner selection */
function pickWinners(entrants, count) {
    const pool = [...entrants];
    const winners = [];
    while (winners.length < count && pool.length > 0) {
        const idx = Math.floor(Math.random() * pool.length);
        winners.push(pool.splice(idx, 1)[0]);
    }
    return winners;
}

/** Format winners list into numbered lines */
function formatWinnersList(winnerIds) {
    if (winnerIds.length === 0) return '> *No winners — nobody entered.*';
    return winnerIds.map((id, i) => `> 🥇 **#${i + 1}** — <@${id}>`).join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
//  EMBED BUILDERS  (exported so index.js & interactionCreate.js can use them)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🟢 ACTIVE GIVEAWAY EMBED
 * Called every ~60s by the loop to keep the progress bar live.
 * Discord's <t:X:R> handles the live countdown natively in the client.
 */
function buildActiveEmbed(gw, uniqueEntrantCount) {
    const endTs = Math.floor(gw.endTime / 1000);
    const startTs = Math.floor(gw.startTime / 1000);
    const remaining = Math.max(0, gw.endTime - Date.now());
    const { bar, pctLabel } = buildProgressBar(gw.startTime, gw.endTime);

    const lines = [
        // ── Prize banner ──
        '```',
        `🎁  PRIZE: ${gw.prize}`,
        '```',

        // ── Description ──
        gw.description ? `*${gw.description}*\n` : '',

        // ── Details ──
        `**⏰  Ends:**   <t:${endTs}:R>  *(${formatDuration(remaining)} left)*`,
        `**📅  Started:** <t:${startTs}:f>`,
        `**🏆  Winners:** \`${gw.winnersCount}\``,
        `**👑  Host:**   <@${gw.hostId}>`,

        // ── Optional fields ──
        gw.sponsor      ? `**🤝  Sponsor:**  ${gw.sponsor}` : null,
        gw.requiredRole ? `**🔒  Required Role:** <@&${gw.requiredRole}>` : null,
        gw.bonusEntries > 1 && gw.requiredRole
            ? `**🎟️  Bonus Entries:** Role holders get **×${gw.bonusEntries}** tickets!` : null,
        gw.minAccountAge ? `**🆕  Min Account Age:** ${gw.minAccountAge} days` : null,
        gw.pingRole     ? `**📣  Ping:** <@&${gw.pingRole}>` : null,

        // ── Progress bar (updates every 60s via loop) ──
        '',
        `**⏳  Progress**`,
        `\`${bar}\` **${pctLabel}** elapsed`,
        `\`${formatDuration(remaining)}\` remaining`,
    ];

    const embed = new EmbedBuilder()
        .setTitle(`🎉  GIVEAWAY`)
        .setColor(0x2ECC71)
        .setDescription(lines.filter(l => l !== null).join('\n'))
        .setFooter({ text: `🎟️ ${uniqueEntrantCount} unique ${uniqueEntrantCount === 1 ? 'entrant' : 'entrants'}  ·  React to enter  ·  ID: ${gw.messageId || '—'}` })
        .setTimestamp(gw.endTime);

    // GIF/image shown large at bottom of embed
    if (gw.mediaUrl) embed.setImage(gw.mediaUrl);

    return embed;
}

/**
 * 🔴 ENDED GIVEAWAY EMBED
 * Replaces the active embed when giveaway finishes.
 */
function buildEndedEmbed(gw, winnerIds) {
    const endTs = Math.floor(gw.endTime / 1000);
    const hasWinners = winnerIds.length > 0;
    const winnersBlock = formatWinnersList(winnerIds);

    const lines = [
        '```',
        `🎁  PRIZE: ${gw.prize}`,
        '```',
        '',
        hasWinners
            ? `🏆 **Winner${winnerIds.length > 1 ? 's' : ''}:**`
            : `😔 **No Winners**`,
        winnersBlock,
        '',
        `**👑  Hosted by:** <@${gw.hostId}>`,
        gw.sponsor ? `**🤝  Sponsored by:** ${gw.sponsor}` : null,
        '',
        `*Ended <t:${endTs}:f>  ·  ${gw.entrants.length} total entries  ·  ${[...new Set(gw.entrants)].length} unique entrants*`,
        '',
        hasWinners
            ? `✅ *Winners have been notified via DM!*`
            : `*Use \`/giveaway reroll\` to re-pick if someone is ineligible.*`
    ];

    const embed = new EmbedBuilder()
        .setTitle(`🔴  GIVEAWAY ENDED`)
        .setColor(0xE74C3C)
        .setDescription(lines.filter(l => l !== null).join('\n'))
        .setFooter({ text: `Total Entries: ${gw.entrants.length}  ·  Unique: ${[...new Set(gw.entrants)].length}  ·  Prize: ${gw.prize}` })
        .setTimestamp();

    if (gw.mediaUrl) embed.setImage(gw.mediaUrl);

    return embed;
}

/**
 * 🟡 REROLL EMBED
 */
function buildRerollEmbed(gw, winnerIds) {
    const winnersBlock = formatWinnersList(winnerIds);
    return new EmbedBuilder()
        .setTitle(`🔁  REROLL  ·  New Winners Selected!`)
        .setColor(0xF39C12)
        .setDescription([
            '```',
            `🎁  PRIZE: ${gw.prize}`,
            '```',
            '',
            `**🏆 New Winner${winnerIds.length > 1 ? 's' : ''}:**`,
            winnersBlock,
            '',
            `**👑  Hosted by:** <@${gw.hostId}>`,
        ].join('\n'))
        .setFooter({ text: `Rerolled from ${gw.entrants.length} entries` })
        .setTimestamp();
}

/**
 * 🎊 WINNER ANNOUNCEMENT (separate channel message after ended embed)
 * This is the message that tags winners and links back.
 */
function buildWinnerAnnouncementEmbed(gw, winnerIds, guildId, msgId) {
    const link = `https://discord.com/channels/${guildId}/${gw.channelId}/${msgId}`;
    const winnersBlock = formatWinnersList(winnerIds);

    return new EmbedBuilder()
        .setTitle(`🎊  CONGRATULATIONS!`)
        .setColor(0x2ECC71)
        .setDescription([
            winnersBlock,
            '',
            '```',
            `🎁  PRIZE: ${gw.prize}`,
            '```',
            `📬  Please **contact <@${gw.hostId}>** to claim your reward!`,
            '',
            `[**→ Jump to Giveaway**](${link})`,
        ].join('\n'))
        .setFooter({ text: `🎟️ ${gw.entrants.length} entries  ·  ${[...new Set(gw.entrants)].length} unique entrants` })
        .setTimestamp();
}

/**
 * 📬 DM embed sent to each winner
 */
function buildWinnerDMEmbed(gw, guildId, msgId) {
    const link = `https://discord.com/channels/${guildId}/${gw.channelId}/${msgId}`;
    return new EmbedBuilder()
        .setTitle(`🎉  You Won a Giveaway!`)
        .setColor(0x2ECC71)
        .setDescription([
            `**Congratulations!** You won the giveaway in **${gw.guildName || 'a server'}**!`,
            '',
            '```',
            `🎁  PRIZE: ${gw.prize}`,
            '```',
            `📬  Please **contact <@${gw.hostId}>** to claim your prize.`,
            '',
            `[**→ Jump to Giveaway**](${link})`,
        ].join('\n'))
        .setFooter({ text: 'Claim your prize before it expires!' })
        .setTimestamp();
}

/**
 * 📋 Giveaway log embed (sent to log channel)
 */
function buildLogEmbed(action, gw, extra = '') {
    const colors = { start: 0x3498DB, end: 0xE74C3C, reroll: 0xF39C12, cancel: 0x95A5A6, pause: 0xE67E22, resume: 0x2ECC71 };
    const icons  = { start: '🚀', end: '🏁', reroll: '🔁', cancel: '🚫', pause: '⏸️', resume: '▶️' };
    return new EmbedBuilder()
        .setTitle(`${icons[action] || '📋'}  Giveaway ${action.charAt(0).toUpperCase() + action.slice(1)}`)
        .setColor(colors[action] || 0x7289DA)
        .addFields(
            { name: '🎁 Prize',    value: gw.prize,                       inline: true },
            { name: '🏆 Winners', value: `${gw.winnersCount}`,            inline: true },
            { name: '🎟️ Entries',  value: `${gw.entrants?.length || 0}`,  inline: true },
            { name: '👑 Host',     value: `<@${gw.hostId}>`,              inline: true },
            { name: '🆔 Message', value: `\`${gw.messageId || '—'}\``,   inline: true },
        )
        .setDescription(extra || null)
        .setTimestamp();
}

// ─────────────────────────────────────────────────────────────────────────────
//  GIVEAWAY BUTTON ROW (active)
// ─────────────────────────────────────────────────────────────────────────────
function buildActiveRow(entrantCount) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('giveaway_enter')
            .setLabel(`Enter Giveaway  (${entrantCount})`)
            .setEmoji('🎉')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('giveaway_leave')
            .setLabel('Leave')
            .setEmoji('🚪')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('giveaway_myentries')
            .setLabel('My Entries')
            .setEmoji('🎟️')
            .setStyle(ButtonStyle.Secondary)
    );
}

function buildEndedRow(totalEntries) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('giveaway_ended_info')
            .setLabel(`${totalEntries} Entr${totalEntries === 1 ? 'y' : 'ies'}  ·  Ended`)
            .setEmoji('🏁')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId('giveaway_ended_closed')
            .setLabel('Closed')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true)
    );
}

// ─────────────────────────────────────────────────────────────────────────────
//  COMMAND DEFINITION
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('🏆 Professional giveaway system')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageEvents)

        // ── START ────────────────────────────────────────────────────────────
        .addSubcommand(sub => sub
            .setName('start')
            .setDescription('🚀 Start a new giveaway')
            .addStringOption(o => o.setName('prize').setDescription('🎁 The prize being given away').setRequired(true))
            .addStringOption(o => o.setName('duration').setDescription('⏰ Duration (e.g. 10m, 2h, 1d)').setRequired(true))
            .addIntegerOption(o => o.setName('winners').setDescription('🏆 Number of winners').setRequired(true).setMinValue(1).setMaxValue(20))
            .addStringOption(o => o.setName('description').setDescription('📝 Extra description for the giveaway').setRequired(false))
            .addStringOption(o => o.setName('media').setDescription('🎬 GIF or image URL (shown large in embed)').setRequired(false))
            .addStringOption(o => o.setName('sponsor').setDescription('🤝 Sponsor name/text').setRequired(false))
            .addRoleOption(o => o.setName('required_role').setDescription('🔒 Role required to enter').setRequired(false))
            .addRoleOption(o => o.setName('ping_role').setDescription('📣 Role to ping when giveaway starts').setRequired(false))
            .addIntegerOption(o => o.setName('bonus_entries').setDescription('🎟️ Bonus ticket multiplier for required_role holders (2–10)').setRequired(false).setMinValue(2).setMaxValue(10))
            .addIntegerOption(o => o.setName('min_account_age').setDescription('📅 Minimum account age in days required to enter').setRequired(false).setMinValue(1))
            .addStringOption(o => o.setName('log_channel').setDescription('📋 Channel ID for giveaway logs').setRequired(false))
        )

        // ── END ──────────────────────────────────────────────────────────────
        .addSubcommand(sub => sub
            .setName('end')
            .setDescription('🛑 Force-end an active giveaway immediately')
            .addStringOption(o => o.setName('message_id').setDescription('📌 Message ID of the giveaway').setRequired(true))
        )

        // ── CANCEL ───────────────────────────────────────────────────────────
        .addSubcommand(sub => sub
            .setName('cancel')
            .setDescription('🚫 Cancel a giveaway without picking winners')
            .addStringOption(o => o.setName('message_id').setDescription('📌 Message ID of the giveaway').setRequired(true))
            .addStringOption(o => o.setName('reason').setDescription('📝 Reason for cancellation').setRequired(false))
        )

        // ── PAUSE ────────────────────────────────────────────────────────────
        .addSubcommand(sub => sub
            .setName('pause')
            .setDescription('⏸️ Pause a giveaway (no entries accepted while paused)')
            .addStringOption(o => o.setName('message_id').setDescription('📌 Message ID of the giveaway').setRequired(true))
        )

        // ── RESUME ───────────────────────────────────────────────────────────
        .addSubcommand(sub => sub
            .setName('resume')
            .setDescription('▶️ Resume a paused giveaway')
            .addStringOption(o => o.setName('message_id').setDescription('📌 Message ID of the giveaway').setRequired(true))
        )

        // ── REROLL ───────────────────────────────────────────────────────────
        .addSubcommand(sub => sub
            .setName('reroll')
            .setDescription('🔁 Re-pick winners for an ended giveaway')
            .addStringOption(o => o.setName('message_id').setDescription('📌 Message ID of the giveaway').setRequired(true))
            .addIntegerOption(o => o.setName('winners').setDescription('🏆 Override number of winners').setRequired(false).setMinValue(1).setMaxValue(20))
        )

        // ── LIST ─────────────────────────────────────────────────────────────
        .addSubcommand(sub => sub
            .setName('list')
            .setDescription('📋 List all active giveaways on this server')
        )

        // ── INFO ─────────────────────────────────────────────────────────────
        .addSubcommand(sub => sub
            .setName('info')
            .setDescription('🔍 View details and stats of a giveaway')
            .addStringOption(o => o.setName('message_id').setDescription('📌 Message ID of the giveaway').setRequired(true))
        )

        // ── STATS ────────────────────────────────────────────────────────────
        .addSubcommand(sub => sub
            .setName('stats')
            .setDescription('📊 View giveaway statistics for this server')
        ),

    // ─────────────────────────────────────────────────────────────────────────
    //  EXECUTE
    // ─────────────────────────────────────────────────────────────────────────
    async execute(interaction, client) {
        const sub = interaction.options.getSubcommand();
        const db = loadDb();
        const guildId = interaction.guild.id;

        if (!db[guildId])            db[guildId] = {};
        if (!db[guildId].giveaways)  db[guildId].giveaways = {};
        if (!db[guildId].gwStats)    db[guildId].gwStats = { total: 0, totalEntries: 0, totalWinners: 0 };

        // ══════════════════════════════════════════════════════════════════════
        //  START
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'start') {
            const prize        = interaction.options.getString('prize');
            const durationStr  = interaction.options.getString('duration');
            const winnersCount = interaction.options.getInteger('winners');
            const description  = interaction.options.getString('description');
            const mediaUrl     = interaction.options.getString('media');
            const sponsor      = interaction.options.getString('sponsor');
            const requiredRole = interaction.options.getRole('required_role')?.id || null;
            const pingRole     = interaction.options.getRole('ping_role')?.id || null;
            const bonusEntries = interaction.options.getInteger('bonus_entries') || 1;
            const minAccountAge= interaction.options.getInteger('min_account_age') || null;
            const logChannelId = interaction.options.getString('log_channel') || null;

            const durationMs = parseTime(durationStr);
            if (durationMs < 5000) {
                return interaction.reply({ embeds: [errEmbed('❌  Invalid Duration', 'Minimum duration is 5 seconds. Use format: `10m`, `2h`, `1d`')], ephemeral: true });
            }

            const startTime = Date.now();
            const endTime   = startTime + durationMs;

            const gw = {
                prize, description, mediaUrl, sponsor,
                winnersCount, startTime, endTime,
                hostId:       interaction.user.id,
                channelId:    interaction.channel.id,
                guildId,
                guildName:    interaction.guild.name,
                requiredRole, pingRole, bonusEntries, minAccountAge,
                logChannelId,
                entrants:     [],
                ended:        false,
                cancelled:    false,
                paused:       false,
                messageId:    null,
                lastEmbedUpdate: 0,     // ← tracks last time the embed was refreshed
                winners:      [],
            };

            await interaction.deferReply();

            const realMsg = await interaction.fetchReply();
            gw.messageId = realMsg.id;

            const embed = buildActiveEmbed(gw, 0);
            const row   = buildActiveRow(0);

            await interaction.editReply({ content: pingRole ? `<@&${pingRole}>` : null, embeds: [embed], components: [row] });

            db[guildId].giveaways[realMsg.id] = gw;
            db[guildId].gwStats.total++;
            saveDb(db);

            // Log
            await sendLog(client, gw, 'start', guildId, `Giveaway started by <@${interaction.user.id}>`);

            return;
        }

        // ══════════════════════════════════════════════════════════════════════
        //  END
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'end') {
            const msgId = interaction.options.getString('message_id');
            const gw    = db[guildId]?.giveaways?.[msgId];
            if (!gw)        return interaction.reply({ embeds: [errEmbed('❌  Not Found', 'No giveaway found with that message ID.')], ephemeral: true });
            if (gw.ended)   return interaction.reply({ embeds: [errEmbed('⚠️  Already Ended', 'This giveaway has already ended.')], ephemeral: true });
            if (gw.cancelled) return interaction.reply({ embeds: [errEmbed('🚫  Cancelled', 'This giveaway was cancelled.')], ephemeral: true });

            gw.endTime = Date.now() - 1;
            saveDb(db);

            return interaction.reply({ embeds: [okEmbed('✅  Ending Giveaway', 'The giveaway will end within a few seconds...')], ephemeral: true });
        }

        // ══════════════════════════════════════════════════════════════════════
        //  CANCEL
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'cancel') {
            const msgId  = interaction.options.getString('message_id');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const gw     = db[guildId]?.giveaways?.[msgId];
            if (!gw)       return interaction.reply({ embeds: [errEmbed('❌  Not Found', 'No giveaway found with that message ID.')], ephemeral: true });
            if (gw.ended)  return interaction.reply({ embeds: [errEmbed('⚠️  Already Ended', 'This giveaway has already ended.')], ephemeral: true });

            gw.ended = true;
            gw.cancelled = true;
            saveDb(db);

            try {
                const channel = interaction.guild.channels.cache.get(gw.channelId);
                const message = await channel?.messages.fetch(msgId).catch(() => null);
                if (message) {
                    const cancelEmbed = new EmbedBuilder()
                        .setTitle('🚫  GIVEAWAY CANCELLED')
                        .setColor(0x95A5A6)
                        .setDescription([
                            '```',
                            `🎁  PRIZE: ${gw.prize}`,
                            '```',
                            `**Reason:** ${reason}`,
                            `**Cancelled by:** <@${interaction.user.id}>`,
                            '',
                            `*This giveaway has been cancelled.*`
                        ].join('\n'))
                        .setFooter({ text: `Entries: ${gw.entrants.length}` })
                        .setTimestamp();
                    if (gw.mediaUrl) cancelEmbed.setImage(gw.mediaUrl);
                    await message.edit({ embeds: [cancelEmbed], components: [buildEndedRow(gw.entrants.length)] });
                }
            } catch (_) {}

            await sendLog(client, gw, 'cancel', guildId, `Cancelled by <@${interaction.user.id}>. Reason: ${reason}`);
            return interaction.reply({ embeds: [okEmbed('✅  Giveaway Cancelled', `**${gw.prize}** has been cancelled.\nReason: ${reason}`)], ephemeral: true });
        }

        // ══════════════════════════════════════════════════════════════════════
        //  PAUSE
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'pause') {
            const msgId = interaction.options.getString('message_id');
            const gw    = db[guildId]?.giveaways?.[msgId];
            if (!gw)       return interaction.reply({ embeds: [errEmbed('❌  Not Found', 'No giveaway found with that message ID.')], ephemeral: true });
            if (gw.ended)  return interaction.reply({ embeds: [errEmbed('⚠️  Ended', 'This giveaway has already ended.')], ephemeral: true });
            if (gw.paused) return interaction.reply({ embeds: [errEmbed('⏸️  Already Paused', 'This giveaway is already paused. Use `/giveaway resume`.')], ephemeral: true });

            gw.paused = true;
            gw.pausedAt = Date.now();
            // Extend end time by the amount we're paused
            saveDb(db);

            try {
                const channel = interaction.guild.channels.cache.get(gw.channelId);
                const message = await channel?.messages.fetch(msgId).catch(() => null);
                if (message) {
                    const pausedRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('giveaway_paused').setLabel('⏸️  Giveaway Paused  —  Not accepting entries').setStyle(ButtonStyle.Secondary).setDisabled(true)
                    );
                    const pausedEmbed = buildActiveEmbed(gw, [...new Set(gw.entrants)].length);
                    pausedEmbed.setTitle('⏸️  GIVEAWAY PAUSED');
                    pausedEmbed.setColor(0xE67E22);
                    await message.edit({ embeds: [pausedEmbed], components: [pausedRow] });
                }
            } catch (_) {}

            await sendLog(client, gw, 'pause', guildId, `Paused by <@${interaction.user.id}>`);
            return interaction.reply({ embeds: [okEmbed('⏸️  Giveaway Paused', `**${gw.prize}** is now paused. Use \`/giveaway resume\` to continue.`)], ephemeral: true });
        }

        // ══════════════════════════════════════════════════════════════════════
        //  RESUME
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'resume') {
            const msgId = interaction.options.getString('message_id');
            const gw    = db[guildId]?.giveaways?.[msgId];
            if (!gw)        return interaction.reply({ embeds: [errEmbed('❌  Not Found', 'No giveaway found with that message ID.')], ephemeral: true });
            if (gw.ended)   return interaction.reply({ embeds: [errEmbed('⚠️  Ended', 'This giveaway has already ended.')], ephemeral: true });
            if (!gw.paused) return interaction.reply({ embeds: [errEmbed('▶️  Not Paused', 'This giveaway is not paused.')], ephemeral: true });

            // Add the paused duration back onto the end time
            if (gw.pausedAt) {
                const pausedDuration = Date.now() - gw.pausedAt;
                gw.endTime  += pausedDuration;
                gw.pausedAt  = null;
            }
            gw.paused = false;
            saveDb(db);

            try {
                const channel = interaction.guild.channels.cache.get(gw.channelId);
                const message = await channel?.messages.fetch(msgId).catch(() => null);
                if (message) {
                    const unique = [...new Set(gw.entrants)].length;
                    await message.edit({ embeds: [buildActiveEmbed(gw, unique)], components: [buildActiveRow(unique)] });
                }
            } catch (_) {}

            await sendLog(client, gw, 'resume', guildId, `Resumed by <@${interaction.user.id}>`);
            return interaction.reply({ embeds: [okEmbed('▶️  Giveaway Resumed', `**${gw.prize}** is now running again!`)], ephemeral: true });
        }

        // ══════════════════════════════════════════════════════════════════════
        //  REROLL
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'reroll') {
            const msgId          = interaction.options.getString('message_id');
            const overrideCount  = interaction.options.getInteger('winners');
            const gw             = db[guildId]?.giveaways?.[msgId];
            if (!gw)       return interaction.reply({ embeds: [errEmbed('❌  Not Found', 'No giveaway found with that message ID.')], ephemeral: true });
            if (!gw.ended) return interaction.reply({ embeds: [errEmbed('⚠️  Still Active', 'This giveaway is still running. End it first.')], ephemeral: true });

            const unique = [...new Set(gw.entrants)];
            if (unique.length === 0) return interaction.reply({ embeds: [errEmbed('❌  No Entries', 'Nobody entered this giveaway.')], ephemeral: true });

            const count   = Math.min(overrideCount || gw.winnersCount, unique.length);
            const winners = pickWinners(gw.entrants, count);
            const mentions = winners.map(id => `<@${id}>`).join('  ');

            const channel = interaction.guild.channels.cache.get(gw.channelId);
            if (channel) {
                await channel.send({
                    content: `🔁  **REROLL** — ${mentions}`,
                    embeds: [buildRerollEmbed(gw, winners)]
                });
            }

            // DM new winners
            for (const winnerId of winners) {
                try {
                    const user = await client.users.fetch(winnerId);
                    await user.send({ embeds: [buildWinnerDMEmbed(gw, guildId, msgId)] });
                } catch (_) {}
            }

            await sendLog(client, gw, 'reroll', guildId, `Rerolled by <@${interaction.user.id}>. New winners: ${mentions}`);
            return interaction.reply({ embeds: [okEmbed('✅  Rerolled!', `New winner${winners.length > 1 ? 's' : ''} announced in <#${gw.channelId}> and notified via DM.`)], ephemeral: true });
        }

        // ══════════════════════════════════════════════════════════════════════
        //  LIST
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'list') {
            const giveaways = db[guildId]?.giveaways || {};
            const active = Object.entries(giveaways).filter(([, g]) => !g.ended && !g.cancelled);

            if (active.length === 0) {
                return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xF39C12).setTitle('📋  Active Giveaways').setDescription('There are no active giveaways right now.')], ephemeral: true });
            }

            const lines = active.map(([id, g]) => {
                const endTs  = Math.floor(g.endTime / 1000);
                const unique = [...new Set(g.entrants)].length;
                const status = g.paused ? '⏸️ Paused' : '🟢 Active';
                return `**${g.prize}**\n${status} · ${unique} entrants · ends <t:${endTs}:R>\n> \`${id}\``;
            });

            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle(`📋  Active Giveaways  ·  ${active.length} running`)
                    .setColor(0x2ECC71)
                    .setDescription(lines.join('\n\n'))
                    .setFooter({ text: 'Use /giveaway info <message_id> for full details' })
                ],
                ephemeral: true
            });
        }

        // ══════════════════════════════════════════════════════════════════════
        //  INFO
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'info') {
            const msgId = interaction.options.getString('message_id');
            const gw    = db[guildId]?.giveaways?.[msgId];
            if (!gw) return interaction.reply({ embeds: [errEmbed('❌  Not Found', 'No giveaway found with that message ID.')], ephemeral: true });

            const unique = [...new Set(gw.entrants)];
            const endTs  = Math.floor(gw.endTime / 1000);
            const startTs = Math.floor(gw.startTime / 1000);
            const status  = gw.cancelled ? '🚫 Cancelled' : gw.ended ? '🔴 Ended' : gw.paused ? '⏸️ Paused' : '🟢 Active';

            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle(`🔍  Giveaway Info`)
                    .setColor(gw.ended ? 0xE74C3C : gw.paused ? 0xE67E22 : 0x2ECC71)
                    .setDescription(`\`\`\`\n🎁  PRIZE: ${gw.prize}\n\`\`\``)
                    .addFields(
                        { name: '📊 Status',         value: status,                              inline: true  },
                        { name: '🏆 Winners',         value: `${gw.winnersCount}`,               inline: true  },
                        { name: '🎟️ Total Entries',   value: `${gw.entrants.length}`,            inline: true  },
                        { name: '👥 Unique Entrants', value: `${unique.length}`,                 inline: true  },
                        { name: '⏰ End Time',        value: `<t:${endTs}:f>`,                   inline: true  },
                        { name: '🕐 Start Time',      value: `<t:${startTs}:f>`,                 inline: true  },
                        { name: '👑 Host',            value: `<@${gw.hostId}>`,                  inline: true  },
                        { name: '🆔 Message ID',      value: `\`${msgId}\``,                     inline: true  },
                        gw.requiredRole ? { name: '🔒 Required Role', value: `<@&${gw.requiredRole}>`, inline: true } : { name: '🔒 Required Role', value: 'None', inline: true },
                        gw.sponsor      ? { name: '🤝 Sponsor',       value: gw.sponsor,              inline: true } : null,
                        gw.winners?.length > 0 ? { name: '🏅 Winners', value: gw.winners.map(id => `<@${id}>`).join(', '), inline: false } : null,
                    ).filter(Boolean)
                    .setFooter({ text: `Giveaway ID: ${msgId}` })
                ],
                ephemeral: true
            });
        }

        // ══════════════════════════════════════════════════════════════════════
        //  STATS
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'stats') {
            const giveaways = db[guildId]?.giveaways || {};
            const stats     = db[guildId]?.gwStats || { total: 0 };
            const all       = Object.values(giveaways);
            const active    = all.filter(g => !g.ended && !g.cancelled).length;
            const ended     = all.filter(g => g.ended && !g.cancelled).length;
            const cancelled = all.filter(g => g.cancelled).length;
            const totalEntries = all.reduce((s, g) => s + g.entrants.length, 0);
            const totalUnique  = all.reduce((s, g) => s + [...new Set(g.entrants)].length, 0);

            // Most popular giveaway
            const popular = all.sort((a, b) => b.entrants.length - a.entrants.length)[0];

            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle(`📊  Giveaway Statistics  ·  ${interaction.guild.name}`)
                    .setColor(0x3498DB)
                    .addFields(
                        { name: '📋 Total Giveaways', value: `${all.length}`, inline: true },
                        { name: '🟢 Active',          value: `${active}`,    inline: true },
                        { name: '🔴 Ended',           value: `${ended}`,     inline: true },
                        { name: '🚫 Cancelled',       value: `${cancelled}`, inline: true },
                        { name: '🎟️ Total Entries',   value: `${totalEntries}`, inline: true },
                        { name: '👥 Unique Entrants', value: `${totalUnique}`,  inline: true },
                        popular ? { name: '🔥 Most Popular', value: `**${popular.prize}**\n${popular.entrants.length} entries`, inline: false } : null,
                    ).filter(Boolean)
                    .setFooter({ text: `Server: ${interaction.guild.name}  ·  Members: ${interaction.guild.memberCount.toLocaleString()}` })
                    .setTimestamp()
                ],
                ephemeral: true
            });
        }
    },

    // ─── Export helpers ────────────────────────────────────────────────────────
    buildActiveEmbed,
    buildEndedEmbed,
    buildRerollEmbed,
    buildWinnerAnnouncementEmbed,
    buildWinnerDMEmbed,
    buildLogEmbed,
    buildActiveRow,
    buildEndedRow,
    pickWinners,
    formatWinnersList,
    parseTime,
    formatDuration,
    buildProgressBar,
};

// ─────────────────────────────────────────────────────────────────────────────
//  MINI HELPER EMBEDS
// ─────────────────────────────────────────────────────────────────────────────
function errEmbed(title, desc) {
    return new EmbedBuilder().setColor(0xE74C3C).setTitle(title).setDescription(desc);
}
function okEmbed(title, desc) {
    return new EmbedBuilder().setColor(0x2ECC71).setTitle(title).setDescription(desc);
}

/** Send to log channel if configured */
async function sendLog(client, gw, action, guildId, extra) {
    try {
        if (!gw.logChannelId) return;
        const guild   = client.guilds.cache.get(guildId);
        const channel = guild?.channels.cache.get(gw.logChannelId);
        if (!channel) return;
        const { buildLogEmbed } = module.exports;
        await channel.send({ embeds: [buildLogEmbed(action, gw, extra)] });
    } catch (_) {}
}
