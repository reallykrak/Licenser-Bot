// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║         🏆  WORLD-CLASS GIVEAWAY SYSTEM v3.0  —  commands/giveaway.js      ║
// ║  Prize as Title · Schedule · Blacklist · Entrants · DM Toggle · Live Timer  ║
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

/** Parse duration strings → ms  e.g. "1d 2h 30m 10s" */
function parseTime(str) {
    const regex = /(\d+)\s*([smhd])/gi;
    let ms = 0, m;
    while ((m = regex.exec(str)) !== null) {
        const n = parseInt(m[1]);
        switch (m[2].toLowerCase()) {
            case 's': ms += n * 1_000;    break;
            case 'm': ms += n * 60_000;   break;
            case 'h': ms += n * 3_600_000; break;
            case 'd': ms += n * 86_400_000; break;
        }
    }
    return ms;
}

/** ms → human string  e.g. 90061000 → "1d 1h 1m" */
function formatDuration(ms) {
    if (ms <= 0) return 'Ended';
    const d = Math.floor(ms / 86_400_000);
    const h = Math.floor((ms % 86_400_000) / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1_000);
    const parts = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    if (!d && !h && s) parts.push(`${s}s`);
    return parts.join(' ') || '< 1s';
}

/** Unicode progress bar — recalculated live every refresh */
function progressBar(startTime, endTime, len = 18) {
    const pct    = Math.min(1, Math.max(0, (Date.now() - startTime) / (endTime - startTime)));
    const filled = Math.round(pct * len);
    return {
        bar:    '█'.repeat(filled) + '░'.repeat(len - filled),
        pct:    Math.round(pct * 100),
        remain: formatDuration(Math.max(0, endTime - Date.now())),
    };
}

/** Weighted random winner pick (respects bonus tickets) */
function pickWinners(entrants, count) {
    const pool = [...entrants];
    const out  = [];
    while (out.length < count && pool.length) {
        const idx = Math.floor(Math.random() * pool.length);
        out.push(pool.splice(idx, 1)[0]);
    }
    return out;
}

/** Numbered winner list */
function winnerLines(ids) {
    if (!ids.length) return '> 😔  *No winners — nobody entered.*';
    const medals = ['🥇', '🥈', '🥉'];
    return ids.map((id, i) => `> ${medals[i] || `**#${i+1}**`}  <@${id}>`).join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
//  EMBED BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🟢 ACTIVE GIVEAWAY EMBED
 * ─ Prize is the embed TITLE (Discord renders it big + bold automatically)
 * ─ Progress bar refreshed every 60s by the loop
 */
function buildActiveEmbed(gw, uniqueCount) {
    const endTs   = Math.floor(gw.endTime   / 1000);
    const startTs = Math.floor(gw.startTime / 1000);
    const { bar, pct, remain } = progressBar(gw.startTime, gw.endTime);

    const desc = [
        // ── Description / flavour text ──
        gw.description ? `*${gw.description}*` : `*Click **Enter Giveaway** below to participate!*`,
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        `⏰  **Ends:**      <t:${endTs}:R>`,
        `🏆  **Winners:**   \`${gw.winnersCount}\``,
        `👑  **Host:**      <@${gw.hostId}>`,
        gw.sponsor      ? `🤝  **Sponsor:**   ${gw.sponsor}` : null,
        gw.requiredRole ? `🔒  **Required:**  <@&${gw.requiredRole}>` : null,
        gw.bonusEntries > 1 && gw.requiredRole
            ? `🎟️  **Bonus:**     ×${gw.bonusEntries} tickets for role holders!` : null,
        gw.minAccountAge ? `🆕  **Min Age:**   ${gw.minAccountAge}d account` : null,
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        `⏳  \`${bar}\` **${pct}%**`,
        `\`${remain} remaining\``,
    ].filter(v => v !== null).join('\n');

    const embed = new EmbedBuilder()
        .setTitle(`🎉  ${gw.prize}`)           // ← PRIZE is the title — big & bold
        .setColor(0x2ECC71)
        .setDescription(desc)
        .setFooter({ text: `🎟️ ${uniqueCount} entrant${uniqueCount !== 1 ? 's' : ''}  ·  Started <t:${startTs}:f>  ·  ID: ${gw.messageId || '—'}` })
        .setTimestamp(gw.endTime);

    if (gw.mediaUrl) embed.setImage(gw.mediaUrl);   // GIF shown large
    return embed;
}

/**
 * 🔴 ENDED GIVEAWAY EMBED
 * ─ Prize stays as title, winner list prominent
 */
function buildEndedEmbed(gw, winnerIds) {
    const endTs   = Math.floor(gw.endTime / 1000);
    const unique  = [...new Set(gw.entrants)].length;

    const desc = [
        winnerIds.length
            ? `🏆  **Winner${winnerIds.length > 1 ? 's' : ''}:**`
            : `😔  **No Winners**`,
        winnerLines(winnerIds),
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        `👑  **Host:**   <@${gw.hostId}>`,
        gw.sponsor ? `🤝  **Sponsor:** ${gw.sponsor}` : null,
        '',
        `*Ended <t:${endTs}:f>  ·  ${gw.entrants.length} entries  ·  ${unique} unique entrants*`,
        winnerIds.length ? `\n✅  *Winners have been notified via DM!*` : `\n*Use \`/giveaway reroll\` to re-pick.*`,
    ].filter(v => v !== null).join('\n');

    const embed = new EmbedBuilder()
        .setTitle(`🔴  ${gw.prize}  —  ENDED`)   // ← Prize + ENDED in title
        .setColor(0xE74C3C)
        .setDescription(desc)
        .setFooter({ text: `Entries: ${gw.entrants.length}  ·  Unique: ${unique}` })
        .setTimestamp();

    if (gw.mediaUrl) embed.setImage(gw.mediaUrl);
    return embed;
}

/** 🟡 REROLL embed */
function buildRerollEmbed(gw, winnerIds) {
    return new EmbedBuilder()
        .setTitle(`🔁  ${gw.prize}  —  REROLL`)   // ← Prize in title
        .setColor(0xF39C12)
        .setDescription([
            `New winner${winnerIds.length > 1 ? 's' : ''} selected!`,
            '',
            `🏆  **New Winner${winnerIds.length > 1 ? 's' : ''}:**`,
            winnerLines(winnerIds),
            '',
            `👑  **Host:** <@${gw.hostId}>`,
        ].join('\n'))
        .setFooter({ text: `Rerolled from ${gw.entrants.length} entries` })
        .setTimestamp();
}

/** 🎊 WINNER ANNOUNCEMENT (channel message with mentions) */
function buildWinnerAnnouncementEmbed(gw, winnerIds, guildId, msgId) {
    const link = `https://discord.com/channels/${guildId}/${gw.channelId}/${msgId}`;
    return new EmbedBuilder()
        .setTitle(`🎊  CONGRATULATIONS!`)
        .setColor(0x2ECC71)
        .setDescription([
            winnerLines(winnerIds),
            '',
            `**Prize:  ${gw.prize}** 🎁`,
            `📬  Contact <@${gw.hostId}> to claim your reward!`,
            '',
            `[**→ Jump to Giveaway**](${link})`,
        ].join('\n'))
        .setFooter({ text: `🎟️ ${gw.entrants.length} entries  ·  ${[...new Set(gw.entrants)].length} unique` })
        .setTimestamp();
}

/** 📬 DM sent to each winner */
function buildWinnerDMEmbed(gw, guildId, msgId) {
    const link = `https://discord.com/channels/${guildId}/${gw.channelId}/${msgId}`;
    return new EmbedBuilder()
        .setTitle(`🎉  You Won!`)
        .setColor(0x2ECC71)
        .setDescription([
            `**Congratulations!** You won a giveaway in **${gw.guildName || 'a server'}**!`,
            '',
            `🎁  **Prize:  ${gw.prize}**`,
            `📬  Contact <@${gw.hostId}> to claim your reward.`,
            '',
            `[**→ Jump to Giveaway**](${link})`,
        ].join('\n'))
        .setFooter({ text: 'Claim your prize before it expires!' })
        .setTimestamp();
}

/** 📋 Log embed */
function buildLogEmbed(action, gw, extra = '') {
    const COLORS = { start: 0x3498DB, end: 0xE74C3C, reroll: 0xF39C12, cancel: 0x95A5A6, pause: 0xE67E22, resume: 0x2ECC71, schedule: 0x9B59B6 };
    const ICONS  = { start: '🚀', end: '🏁', reroll: '🔁', cancel: '🚫', pause: '⏸️', resume: '▶️', schedule: '📅' };
    return new EmbedBuilder()
        .setTitle(`${ICONS[action] || '📋'}  Giveaway ${action[0].toUpperCase() + action.slice(1)}`)
        .setColor(COLORS[action] || 0x7289DA)
        .addFields(
            { name: '🎁 Prize',    value: gw.prize,                     inline: true },
            { name: '🏆 Winners',  value: `${gw.winnersCount}`,          inline: true },
            { name: '🎟️ Entries',  value: `${gw.entrants?.length || 0}`, inline: true },
            { name: '👑 Host',     value: `<@${gw.hostId}>`,            inline: true },
            { name: '🆔 ID',       value: `\`${gw.messageId || '—'}\``, inline: true },
        )
        .setDescription(extra || null)
        .setTimestamp();
}

// ─────────────────────────────────────────────────────────────────────────────
//  BUTTON ROWS
// ─────────────────────────────────────────────────────────────────────────────
function buildActiveRow(uniqueCount) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('giveaway_enter')
            .setLabel(`Enter Giveaway  (${uniqueCount})`)
            .setEmoji('🎉')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('giveaway_leave')
            .setLabel('Leave')
            .setEmoji('🚪')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('giveaway_myentries')
            .setLabel('My Tickets')
            .setEmoji('🎟️')
            .setStyle(ButtonStyle.Secondary),
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
            .setDisabled(true),
    );
}

// ─────────────────────────────────────────────────────────────────────────────
//  TINY EMBED HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const errEmbed = (title, desc) => new EmbedBuilder().setColor(0xE74C3C).setTitle(title).setDescription(desc);
const okEmbed  = (title, desc) => new EmbedBuilder().setColor(0x2ECC71).setTitle(title).setDescription(desc);

// ─────────────────────────────────────────────────────────────────────────────
//  LOG HELPER
// ─────────────────────────────────────────────────────────────────────────────
async function sendLog(client, gw, action, guildId, extra) {
    try {
        if (!gw.logChannelId) return;
        const ch = client.guilds.cache.get(guildId)?.channels.cache.get(gw.logChannelId);
        if (ch) await ch.send({ embeds: [buildLogEmbed(action, gw, extra)] });
    } catch (_) {}
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
        .addSubcommand(s => s.setName('start').setDescription('🚀 Start a new giveaway')
            .addStringOption(o  => o.setName('prize').setDescription('🎁 Prize — this becomes the embed title').setRequired(true))
            .addStringOption(o  => o.setName('duration').setDescription('⏰ Duration  e.g. 10m  2h  1d').setRequired(true))
            .addIntegerOption(o => o.setName('winners').setDescription('🏆 Number of winners').setRequired(true).setMinValue(1).setMaxValue(20))
            .addStringOption(o  => o.setName('description').setDescription('📝 Extra description text').setRequired(false))
            .addStringOption(o  => o.setName('media').setDescription('🎬 GIF or image URL (shown large)').setRequired(false))
            .addStringOption(o  => o.setName('sponsor').setDescription('🤝 Sponsor name').setRequired(false))
            .addRoleOption(o    => o.setName('required_role').setDescription('🔒 Role required to enter').setRequired(false))
            .addRoleOption(o    => o.setName('ping_role').setDescription('📣 Role to ping on start').setRequired(false))
            .addIntegerOption(o => o.setName('bonus_entries').setDescription('🎟️ Bonus tickets for required_role (2–10)').setRequired(false).setMinValue(2).setMaxValue(10))
            .addIntegerOption(o => o.setName('min_account_age').setDescription('📅 Minimum account age in days').setRequired(false).setMinValue(1))
            .addStringOption(o  => o.setName('log_channel').setDescription('📋 Channel ID for logs').setRequired(false))
            .addBooleanOption(o => o.setName('dm_winners').setDescription('📬 DM winners when giveaway ends? (default: true)').setRequired(false))
        )

        // ── SCHEDULE ─────────────────────────────────────────────────────────
        .addSubcommand(s => s.setName('schedule').setDescription('📅 Schedule a giveaway to start later')
            .addStringOption(o  => o.setName('prize').setDescription('🎁 Prize').setRequired(true))
            .addStringOption(o  => o.setName('start_in').setDescription('⏳ Starts in how long?  e.g. 30m  2h  1d').setRequired(true))
            .addStringOption(o  => o.setName('duration').setDescription('⏰ Giveaway duration after it starts').setRequired(true))
            .addIntegerOption(o => o.setName('winners').setDescription('🏆 Number of winners').setRequired(true).setMinValue(1).setMaxValue(20))
            .addStringOption(o  => o.setName('description').setDescription('📝 Extra description').setRequired(false))
            .addStringOption(o  => o.setName('media').setDescription('🎬 GIF or image URL').setRequired(false))
            .addRoleOption(o    => o.setName('required_role').setDescription('🔒 Role required to enter').setRequired(false))
            .addRoleOption(o    => o.setName('ping_role').setDescription('📣 Role to ping on start').setRequired(false))
        )

        // ── END ──────────────────────────────────────────────────────────────
        .addSubcommand(s => s.setName('end').setDescription('🛑 Force-end a giveaway now')
            .addStringOption(o => o.setName('message_id').setDescription('📌 Message ID').setRequired(true))
        )

        // ── CANCEL ───────────────────────────────────────────────────────────
        .addSubcommand(s => s.setName('cancel').setDescription('🚫 Cancel without picking winners')
            .addStringOption(o => o.setName('message_id').setDescription('📌 Message ID').setRequired(true))
            .addStringOption(o => o.setName('reason').setDescription('📝 Reason').setRequired(false))
        )

        // ── PAUSE ────────────────────────────────────────────────────────────
        .addSubcommand(s => s.setName('pause').setDescription('⏸️ Pause a giveaway')
            .addStringOption(o => o.setName('message_id').setDescription('📌 Message ID').setRequired(true))
        )

        // ── RESUME ───────────────────────────────────────────────────────────
        .addSubcommand(s => s.setName('resume').setDescription('▶️ Resume a paused giveaway')
            .addStringOption(o => o.setName('message_id').setDescription('📌 Message ID').setRequired(true))
        )

        // ── REROLL ───────────────────────────────────────────────────────────
        .addSubcommand(s => s.setName('reroll').setDescription('🔁 Re-pick winners')
            .addStringOption(o  => o.setName('message_id').setDescription('📌 Message ID').setRequired(true))
            .addIntegerOption(o => o.setName('winners').setDescription('🏆 Override winner count').setRequired(false).setMinValue(1).setMaxValue(20))
        )

        // ── LIST ─────────────────────────────────────────────────────────────
        .addSubcommand(s => s.setName('list').setDescription('📋 List all active giveaways'))

        // ── INFO ─────────────────────────────────────────────────────────────
        .addSubcommand(s => s.setName('info').setDescription('🔍 View giveaway details')
            .addStringOption(o => o.setName('message_id').setDescription('📌 Message ID').setRequired(true))
        )

        // ── ENTRANTS ─────────────────────────────────────────────────────────
        .addSubcommand(s => s.setName('entrants').setDescription('👥 View who entered a giveaway')
            .addStringOption(o => o.setName('message_id').setDescription('📌 Message ID').setRequired(true))
        )

        // ── BLACKLIST ─────────────────────────────────────────────────────────
        .addSubcommand(s => s.setName('blacklist').setDescription('🚫 Add or remove a user from the giveaway blacklist')
            .addUserOption(o   => o.setName('user').setDescription('👤 User to blacklist/unblacklist').setRequired(true))
            .addStringOption(o => o.setName('action').setDescription('➕ add  /  ➖ remove').setRequired(true)
                .addChoices({ name: '➕ Add to blacklist', value: 'add' }, { name: '➖ Remove from blacklist', value: 'remove' }))
            .addStringOption(o => o.setName('reason').setDescription('📝 Reason').setRequired(false))
        )

        // ── STATS ─────────────────────────────────────────────────────────────
        .addSubcommand(s => s.setName('stats').setDescription('📊 Server-wide giveaway statistics')),

    // ─────────────────────────────────────────────────────────────────────────
    //  EXECUTE
    // ─────────────────────────────────────────────────────────────────────────
    async execute(interaction, client) {
        const sub     = interaction.options.getSubcommand();
        const db      = loadDb();
        const guildId = interaction.guild.id;

        if (!db[guildId])           db[guildId] = {};
        if (!db[guildId].giveaways) db[guildId].giveaways = {};
        if (!db[guildId].gwBlacklist) db[guildId].gwBlacklist = {};
        if (!db[guildId].gwStats)   db[guildId].gwStats = { total: 0, totalEntries: 0, totalWinners: 0 };

        // ══════════════════════════════════════════════════════════════════════
        //  START
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'start') {
            const prize         = interaction.options.getString('prize');
            const durationStr   = interaction.options.getString('duration');
            const winnersCount  = interaction.options.getInteger('winners');
            const description   = interaction.options.getString('description');
            const mediaUrl      = interaction.options.getString('media');
            const sponsor       = interaction.options.getString('sponsor');
            const requiredRole  = interaction.options.getRole('required_role')?.id || null;
            const pingRole      = interaction.options.getRole('ping_role')?.id || null;
            const bonusEntries  = interaction.options.getInteger('bonus_entries') || 1;
            const minAccountAge = interaction.options.getInteger('min_account_age') || null;
            const logChannelId  = interaction.options.getString('log_channel') || null;
            const dmWinners     = interaction.options.getBoolean('dm_winners') ?? true;

            const durationMs = parseTime(durationStr);
            if (durationMs < 5000) return interaction.reply({ embeds: [errEmbed('❌  Invalid Duration', 'Minimum is 5 seconds. Use: `10m`, `2h`, `1d`')], ephemeral: true });

            const startTime = Date.now();
            const endTime   = startTime + durationMs;

            await interaction.deferReply();
            const realMsg = await interaction.fetchReply();

            const gw = {
                prize, description, mediaUrl, sponsor,
                winnersCount, startTime, endTime,
                hostId:        interaction.user.id,
                channelId:     interaction.channel.id,
                guildId, guildName: interaction.guild.name,
                requiredRole, pingRole, bonusEntries, minAccountAge,
                logChannelId, dmWinners,
                entrants: [], winners: [],
                ended: false, cancelled: false, paused: false,
                messageId: realMsg.id, lastEmbedUpdate: 0,
            };

            const embed = buildActiveEmbed(gw, 0);
            const row   = buildActiveRow(0);

            await interaction.editReply({
                content:    pingRole ? `<@&${pingRole}>` : null,
                embeds:     [embed],
                components: [row],
            });

            db[guildId].giveaways[realMsg.id] = gw;
            db[guildId].gwStats.total++;
            saveDb(db);

            await sendLog(client, gw, 'start', guildId, `Started by <@${interaction.user.id}>`);
            return;
        }

        // ══════════════════════════════════════════════════════════════════════
        //  SCHEDULE
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'schedule') {
            const prize        = interaction.options.getString('prize');
            const startInStr   = interaction.options.getString('start_in');
            const durationStr  = interaction.options.getString('duration');
            const winnersCount = interaction.options.getInteger('winners');
            const description  = interaction.options.getString('description');
            const mediaUrl     = interaction.options.getString('media');
            const requiredRole = interaction.options.getRole('required_role')?.id || null;
            const pingRole     = interaction.options.getRole('ping_role')?.id || null;

            const startDelay = parseTime(startInStr);
            const durationMs = parseTime(durationStr);
            if (startDelay < 5000) return interaction.reply({ embeds: [errEmbed('❌  Invalid Start Delay', 'Minimum start delay is 5 seconds.')], ephemeral: true });
            if (durationMs < 5000) return interaction.reply({ embeds: [errEmbed('❌  Invalid Duration', 'Minimum duration is 5 seconds.')], ephemeral: true });

            const scheduledStartTs = Math.floor((Date.now() + startDelay) / 1000);
            const scheduledEndTs   = Math.floor((Date.now() + startDelay + durationMs) / 1000);

            // Save a scheduled giveaway — the loop will pick it up when it's time
            const scheduled = {
                type: 'scheduled',
                prize, description, mediaUrl, winnersCount,
                requiredRole, pingRole,
                hostId:       interaction.user.id,
                channelId:    interaction.channel.id,
                guildId,      guildName: interaction.guild.name,
                startAt:      Date.now() + startDelay,
                durationMs,
                logChannelId: null, dmWinners: true,
                bonusEntries: 1, minAccountAge: null, sponsor: null,
                entrants: [], winners: [],
                fired: false,
            };

            if (!db[guildId].scheduled) db[guildId].scheduled = {};
            const schedId = `sched_${Date.now()}`;
            db[guildId].scheduled[schedId] = scheduled;
            saveDb(db);

            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle(`📅  Giveaway Scheduled`)
                    .setColor(0x9B59B6)
                    .setDescription([
                        `**🎁  Prize:**    ${prize}`,
                        `**🚀  Starts:**   <t:${scheduledStartTs}:R>  ·  <t:${scheduledStartTs}:f>`,
                        `**🏁  Ends:**     <t:${scheduledEndTs}:R>  ·  <t:${scheduledEndTs}:f>`,
                        `**🏆  Winners:** \`${winnersCount}\``,
                        `**👑  Host:**    <@${interaction.user.id}>`,
                        requiredRole ? `**🔒  Required:** <@&${requiredRole}>` : null,
                    ].filter(Boolean).join('\n'))
                    .setFooter({ text: 'The giveaway will be posted automatically when the timer fires.' })
                ],
                ephemeral: true,
            });
        }

        // ══════════════════════════════════════════════════════════════════════
        //  END
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'end') {
            const msgId = interaction.options.getString('message_id');
            const gw    = db[guildId]?.giveaways?.[msgId];
            if (!gw)          return interaction.reply({ embeds: [errEmbed('❌  Not Found',       'No giveaway found with that ID.')],     ephemeral: true });
            if (gw.ended)     return interaction.reply({ embeds: [errEmbed('⚠️  Already Ended',   'This giveaway has already ended.')],    ephemeral: true });
            if (gw.cancelled) return interaction.reply({ embeds: [errEmbed('🚫  Cancelled',        'This giveaway was cancelled.')],        ephemeral: true });

            gw.endTime = Date.now() - 1;
            saveDb(db);
            return interaction.reply({ embeds: [okEmbed('✅  Ending Giveaway', 'Giveaway will end within a few seconds...')], ephemeral: true });
        }

        // ══════════════════════════════════════════════════════════════════════
        //  CANCEL
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'cancel') {
            const msgId  = interaction.options.getString('message_id');
            const reason = interaction.options.getString('reason') || 'No reason provided.';
            const gw     = db[guildId]?.giveaways?.[msgId];
            if (!gw)       return interaction.reply({ embeds: [errEmbed('❌  Not Found', 'No giveaway found with that ID.')], ephemeral: true });
            if (gw.ended)  return interaction.reply({ embeds: [errEmbed('⚠️  Ended',    'This giveaway has already ended.')], ephemeral: true });

            gw.ended = true; gw.cancelled = true;
            saveDb(db);

            try {
                const ch  = interaction.guild.channels.cache.get(gw.channelId);
                const msg = await ch?.messages.fetch(msgId).catch(() => null);
                if (msg) {
                    const e = new EmbedBuilder()
                        .setTitle(`🚫  ${gw.prize}  —  CANCELLED`)
                        .setColor(0x95A5A6)
                        .setDescription([
                            `**Reason:** ${reason}`,
                            `**Cancelled by:** <@${interaction.user.id}>`,
                            '', '*This giveaway has been cancelled and no winners will be selected.*',
                        ].join('\n'))
                        .setFooter({ text: `Entries: ${gw.entrants.length}` })
                        .setTimestamp();
                    if (gw.mediaUrl) e.setImage(gw.mediaUrl);
                    await msg.edit({ embeds: [e], components: [buildEndedRow(gw.entrants.length)] });
                }
            } catch (_) {}

            await sendLog(client, gw, 'cancel', guildId, `Cancelled by <@${interaction.user.id}>. Reason: ${reason}`);
            return interaction.reply({ embeds: [okEmbed('✅  Cancelled', `**${gw.prize}** cancelled.\nReason: ${reason}`)], ephemeral: true });
        }

        // ══════════════════════════════════════════════════════════════════════
        //  PAUSE
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'pause') {
            const msgId = interaction.options.getString('message_id');
            const gw    = db[guildId]?.giveaways?.[msgId];
            if (!gw)       return interaction.reply({ embeds: [errEmbed('❌  Not Found',      'No giveaway found.')], ephemeral: true });
            if (gw.ended)  return interaction.reply({ embeds: [errEmbed('⚠️  Ended',          'Already ended.')],     ephemeral: true });
            if (gw.paused) return interaction.reply({ embeds: [errEmbed('⏸️  Already Paused', 'Already paused. Use `/giveaway resume`.')], ephemeral: true });

            gw.paused = true; gw.pausedAt = Date.now();
            saveDb(db);

            try {
                const ch  = interaction.guild.channels.cache.get(gw.channelId);
                const msg = await ch?.messages.fetch(msgId).catch(() => null);
                if (msg) {
                    const e = buildActiveEmbed(gw, [...new Set(gw.entrants)].length);
                    e.setTitle(`⏸️  ${gw.prize}  —  PAUSED`);
                    e.setColor(0xE67E22);
                    const pausedRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('giveaway_paused').setLabel('⏸️  Paused — Not accepting entries').setStyle(ButtonStyle.Secondary).setDisabled(true)
                    );
                    await msg.edit({ embeds: [e], components: [pausedRow] });
                }
            } catch (_) {}

            await sendLog(client, gw, 'pause', guildId, `Paused by <@${interaction.user.id}>`);
            return interaction.reply({ embeds: [okEmbed('⏸️  Paused', `**${gw.prize}** paused. Use \`/giveaway resume\` to continue.`)], ephemeral: true });
        }

        // ══════════════════════════════════════════════════════════════════════
        //  RESUME
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'resume') {
            const msgId = interaction.options.getString('message_id');
            const gw    = db[guildId]?.giveaways?.[msgId];
            if (!gw)        return interaction.reply({ embeds: [errEmbed('❌  Not Found',  'No giveaway found.')], ephemeral: true });
            if (gw.ended)   return interaction.reply({ embeds: [errEmbed('⚠️  Ended',     'Already ended.')],    ephemeral: true });
            if (!gw.paused) return interaction.reply({ embeds: [errEmbed('▶️  Not Paused', 'Not paused.')],       ephemeral: true });

            if (gw.pausedAt) { gw.endTime += Date.now() - gw.pausedAt; gw.pausedAt = null; }
            gw.paused = false;
            saveDb(db);

            try {
                const ch   = interaction.guild.channels.cache.get(gw.channelId);
                const msg  = await ch?.messages.fetch(msgId).catch(() => null);
                const uniq = [...new Set(gw.entrants)].length;
                if (msg) await msg.edit({ embeds: [buildActiveEmbed(gw, uniq)], components: [buildActiveRow(uniq)] });
            } catch (_) {}

            await sendLog(client, gw, 'resume', guildId, `Resumed by <@${interaction.user.id}>`);
            return interaction.reply({ embeds: [okEmbed('▶️  Resumed', `**${gw.prize}** is running again!`)], ephemeral: true });
        }

        // ══════════════════════════════════════════════════════════════════════
        //  REROLL
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'reroll') {
            const msgId = interaction.options.getString('message_id');
            const count = interaction.options.getInteger('winners');
            const gw    = db[guildId]?.giveaways?.[msgId];
            if (!gw)       return interaction.reply({ embeds: [errEmbed('❌  Not Found',   'No giveaway found.')],   ephemeral: true });
            if (!gw.ended) return interaction.reply({ embeds: [errEmbed('⚠️  Still Active', 'End it first.')],        ephemeral: true });

            const uniq = [...new Set(gw.entrants)];
            if (!uniq.length) return interaction.reply({ embeds: [errEmbed('❌  No Entries', 'Nobody entered.')], ephemeral: true });

            const n = Math.min(count || gw.winnersCount, uniq.length);
            const w = pickWinners(gw.entrants, n);
            const mentions = w.map(id => `<@${id}>`).join('  ');

            const ch = interaction.guild.channels.cache.get(gw.channelId);
            if (ch) await ch.send({ content: `🔁  **REROLL** — ${mentions}`, embeds: [buildRerollEmbed(gw, w)] });

            if (gw.dmWinners !== false) {
                for (const id of w) {
                    try { const u = await client.users.fetch(id); await u.send({ embeds: [buildWinnerDMEmbed(gw, guildId, msgId)] }); } catch (_) {}
                }
            }

            await sendLog(client, gw, 'reroll', guildId, `Rerolled by <@${interaction.user.id}>. New winners: ${mentions}`);
            return interaction.reply({ embeds: [okEmbed('✅  Rerolled!', `New winner${w.length > 1 ? 's' : ''} announced in <#${gw.channelId}>!`)], ephemeral: true });
        }

        // ══════════════════════════════════════════════════════════════════════
        //  LIST
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'list') {
            const active = Object.entries(db[guildId]?.giveaways || {}).filter(([, g]) => !g.ended && !g.cancelled);
            if (!active.length) return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xF39C12).setTitle('📋  Active Giveaways').setDescription('No active giveaways right now.')], ephemeral: true });

            const lines = active.map(([id, g]) => {
                const endTs = Math.floor(g.endTime / 1000);
                const uniq  = [...new Set(g.entrants)].length;
                const icon  = g.paused ? '⏸️' : '🟢';
                return `${icon}  **${g.prize}**\n> ${uniq} entrants  ·  ends <t:${endTs}:R>\n> \`${id}\``;
            });

            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle(`📋  Active Giveaways  ·  ${active.length}`)
                    .setColor(0x2ECC71)
                    .setDescription(lines.join('\n\n'))
                    .setFooter({ text: 'Use /giveaway info <id> for full details' })
                ],
                ephemeral: true,
            });
        }

        // ══════════════════════════════════════════════════════════════════════
        //  INFO
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'info') {
            const msgId = interaction.options.getString('message_id');
            const gw    = db[guildId]?.giveaways?.[msgId];
            if (!gw) return interaction.reply({ embeds: [errEmbed('❌  Not Found', 'No giveaway found.')], ephemeral: true });

            const uniq    = [...new Set(gw.entrants)];
            const endTs   = Math.floor(gw.endTime   / 1000);
            const startTs = Math.floor(gw.startTime / 1000);
            const status  = gw.cancelled ? '🚫 Cancelled' : gw.ended ? '🔴 Ended' : gw.paused ? '⏸️ Paused' : '🟢 Active';

            const top3 = gw.ended && gw.winners?.length
                ? gw.winners.map(id => `<@${id}>`).join(', ')
                : null;

            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle(`🔍  ${gw.prize}`)
                    .setColor(gw.ended ? 0xE74C3C : gw.paused ? 0xE67E22 : 0x2ECC71)
                    .addFields(
                        { name: '📊 Status',         value: status,                    inline: true  },
                        { name: '🏆 Winners',         value: `${gw.winnersCount}`,      inline: true  },
                        { name: '🎟️ Total Entries',   value: `${gw.entrants.length}`,   inline: true  },
                        { name: '👥 Unique Entrants', value: `${uniq.length}`,          inline: true  },
                        { name: '⏰ End Time',        value: `<t:${endTs}:f>`,          inline: true  },
                        { name: '🕐 Start Time',      value: `<t:${startTs}:f>`,        inline: true  },
                        { name: '👑 Host',            value: `<@${gw.hostId}>`,         inline: true  },
                        { name: '🆔 Message ID',      value: `\`${msgId}\``,            inline: true  },
                        { name: '🔒 Required Role',   value: gw.requiredRole ? `<@&${gw.requiredRole}>` : 'None', inline: true },
                        top3 ? { name: '🏅 Winners', value: top3, inline: false } : null,
                    ).filter(Boolean)
                    .setFooter({ text: `DM Winners: ${gw.dmWinners !== false ? 'Yes' : 'No'}` })
                ],
                ephemeral: true,
            });
        }

        // ══════════════════════════════════════════════════════════════════════
        //  ENTRANTS
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'entrants') {
            const msgId = interaction.options.getString('message_id');
            const gw    = db[guildId]?.giveaways?.[msgId];
            if (!gw) return interaction.reply({ embeds: [errEmbed('❌  Not Found', 'No giveaway found.')], ephemeral: true });

            const uniq  = [...new Set(gw.entrants)];
            const total = gw.entrants.length;

            if (!uniq.length) return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xF39C12).setTitle(`👥  Entrants — ${gw.prize}`).setDescription('Nobody has entered yet.')], ephemeral: true });

            // Show top 20, with ticket counts
            const sorted = uniq
                .map(id => ({ id, tickets: gw.entrants.filter(e => e === id).length }))
                .sort((a, b) => b.tickets - a.tickets);

            const shown  = sorted.slice(0, 20);
            const lines  = shown.map((e, i) => `**${i+1}.** <@${e.id}>  ·  \`${e.tickets} ticket${e.tickets > 1 ? 's' : ''}\``);
            const more   = uniq.length > 20 ? `\n*...and ${uniq.length - 20} more*` : '';

            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle(`👥  Entrants  ·  ${gw.prize}`)
                    .setColor(0x3498DB)
                    .setDescription(lines.join('\n') + more)
                    .setFooter({ text: `${uniq.length} unique entrants  ·  ${total} total tickets` })
                ],
                ephemeral: true,
            });
        }

        // ══════════════════════════════════════════════════════════════════════
        //  BLACKLIST
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'blacklist') {
            const target = interaction.options.getUser('user');
            const action = interaction.options.getString('action');
            const reason = interaction.options.getString('reason') || 'No reason.';

            if (!db[guildId].gwBlacklist) db[guildId].gwBlacklist = {};

            if (action === 'add') {
                if (db[guildId].gwBlacklist[target.id]) {
                    return interaction.reply({ embeds: [errEmbed('⚠️  Already Blacklisted', `${target} is already blacklisted.`)], ephemeral: true });
                }
                db[guildId].gwBlacklist[target.id] = { reason, addedBy: interaction.user.id, addedAt: Date.now() };
                saveDb(db);
                return interaction.reply({ embeds: [okEmbed('🚫  Blacklisted', `${target} has been added to the giveaway blacklist.\nReason: ${reason}`)], ephemeral: true });
            } else {
                if (!db[guildId].gwBlacklist[target.id]) {
                    return interaction.reply({ embeds: [errEmbed('⚠️  Not Blacklisted', `${target} is not on the blacklist.`)], ephemeral: true });
                }
                delete db[guildId].gwBlacklist[target.id];
                saveDb(db);
                return interaction.reply({ embeds: [okEmbed('✅  Removed', `${target} has been removed from the giveaway blacklist.`)], ephemeral: true });
            }
        }

        // ══════════════════════════════════════════════════════════════════════
        //  STATS
        // ══════════════════════════════════════════════════════════════════════
        if (sub === 'stats') {
            const all       = Object.values(db[guildId]?.giveaways || {});
            const active    = all.filter(g => !g.ended && !g.cancelled).length;
            const ended     = all.filter(g => g.ended && !g.cancelled).length;
            const cancelled = all.filter(g => g.cancelled).length;
            const scheduled = Object.values(db[guildId]?.scheduled || {}).filter(g => !g.fired).length;
            const totalE    = all.reduce((s, g) => s + g.entrants.length, 0);
            const totalU    = all.reduce((s, g) => s + [...new Set(g.entrants)].length, 0);
            const blacklist = Object.keys(db[guildId]?.gwBlacklist || {}).length;
            const popular   = all.sort((a, b) => b.entrants.length - a.entrants.length)[0];

            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle(`📊  Giveaway Stats  ·  ${interaction.guild.name}`)
                    .setColor(0x3498DB)
                    .setThumbnail(interaction.guild.iconURL())
                    .addFields(
                        { name: '📋 Total',          value: `${all.length}`,     inline: true },
                        { name: '🟢 Active',         value: `${active}`,         inline: true },
                        { name: '🔴 Ended',          value: `${ended}`,          inline: true },
                        { name: '🚫 Cancelled',      value: `${cancelled}`,      inline: true },
                        { name: '📅 Scheduled',      value: `${scheduled}`,      inline: true },
                        { name: '🚷 Blacklisted',    value: `${blacklist}`,      inline: true },
                        { name: '🎟️ Total Entries',  value: `${totalE}`,         inline: true },
                        { name: '👥 Unique Entrants',value: `${totalU}`,         inline: true },
                        popular ? { name: '🔥 Most Popular', value: `**${popular.prize}**  ·  ${popular.entrants.length} entries`, inline: false } : null,
                    ).filter(Boolean)
                    .setFooter({ text: `Server members: ${interaction.guild.memberCount.toLocaleString()}` })
                    .setTimestamp()
                ],
                ephemeral: true,
            });
        }
    },

    // ── Export all builders so index.js + interactionCreate.js can use them ──
    buildActiveEmbed,
    buildEndedEmbed,
    buildRerollEmbed,
    buildWinnerAnnouncementEmbed,
    buildWinnerDMEmbed,
    buildLogEmbed,
    buildActiveRow,
    buildEndedRow,
    pickWinners,
    winnerLines,
    parseTime,
    formatDuration,
    progressBar,
    errEmbed,
    okEmbed,
    sendLog,
};
