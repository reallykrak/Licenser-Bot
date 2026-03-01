const {
    ChannelType, PermissionsBitField, EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const fs = require('fs');

// ══════════════════════════════════════════════════════════════════════════════
//  DB HELPERS
// ══════════════════════════════════════════════════════════════════════════════
const DB_PATH = './db.json';
function loadDb()   { return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); }
function saveDb(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

function getTicketData(db, guildId, channelId) {
    if (!db[guildId])                    db[guildId]                   = { ticketCount: 0 };
    if (!db[guildId].tickets)            db[guildId].tickets            = {};
    if (!db[guildId].tickets[channelId]) db[guildId].tickets[channelId] = {};
    return db[guildId].tickets[channelId];
}

function logAction(db, guildId, channelId, text) {
    const td = getTicketData(db, guildId, channelId);
    if (!td.history) td.history = [];
    td.history.push({ text, ts: Math.floor(Date.now() / 1000) });
}

// ══════════════════════════════════════════════════════════════════════════════
//  ADVANCED LOG — sends a rich embed to the log channel for every action
// ══════════════════════════════════════════════════════════════════════════════
const LOG_COLORS = {
    open:       '#57F287',   // green
    close:      '#ED4245',   // red
    lock:       '#FEE75C',   // yellow
    unlock:     '#57F287',   // green
    claim:      '#5865F2',   // blurple
    transfer:   '#5865F2',   // blurple
    archive:    '#95A5A6',   // grey
    unarchive:  '#57F287',   // green
    add:        '#57F287',   // green
    remove:     '#ED4245',   // red
    slowmode:   '#FEE75C',   // yellow
    callstaff:  '#ED4245',   // red
    transcript: '#5865F2',   // blurple
    rating:     '#F1C40F',   // gold
};

const LOG_ICONS = {
    open:       '🟢',
    close:      '🔴',
    lock:       '🔒',
    unlock:     '🔓',
    claim:      '🙋',
    transfer:   '🔀',
    archive:    '📁',
    unarchive:  '📂',
    add:        '➕',
    remove:     '➖',
    slowmode:   '🐢',
    callstaff:  '🚨',
    transcript: '📄',
    rating:     '⭐',
};

async function sendLog(guild, guildDb, client, type, fields, td = null) {
    if (!guildDb?.logChannel) return;
    const logChan = guild.channels.cache.get(guildDb.logChannel);
    if (!logChan) return;

    const color  = LOG_COLORS[type] ?? '#2b2d31';
    const icon   = LOG_ICONS[type]  ?? '📋';
    const title  = {
        open:       '🟢  Ticket Opened',
        close:      '🔴  Ticket Closed',
        lock:       '🔒  Ticket Locked',
        unlock:     '🔓  Ticket Unlocked',
        claim:      '🙋  Ticket Claimed',
        transfer:   '🔀  Ticket Transferred',
        archive:    '📁  Ticket Archived',
        unarchive:  '📂  Ticket Unarchived',
        add:        '➕  Member Added',
        remove:     '➖  Member Removed',
        slowmode:   '🐢  Slow Mode Changed',
        callstaff:  '🚨  Staff Called',
        transcript: '📄  Transcript Saved',
        rating:     '⭐  Rating Received',
    }[type] ?? '📋  Ticket Action';

    // Build base embed
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setTimestamp();

    // Add ticket info footer if ticket data is provided
    if (td) {
        embed.setFooter({ text: `Ticket #${td.num ?? '?'}  •  ${td.catLabel ?? '—'}  •  ${td.product ?? '—'}` });
    }

    // Add all fields
    if (fields && fields.length) embed.addFields(fields);

    await logChan.send({ embeds: [embed] }).catch(() => {});
}

// ══════════════════════════════════════════════════════════════════════════════
//  TRANSCRIPT BUILDER   •  username (id): message  (date)
// ══════════════════════════════════════════════════════════════════════════════
async function buildTranscript(channel) {
    const fetched = await channel.messages.fetch({ limit: 100 });
    const lines = [...fetched.values()]
        .reverse()
        .filter(m => !m.author.bot)
        .map(m => {
            const date = m.createdAt.toLocaleString('en-GB', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
            const content = m.content || (m.attachments.size ? '[attachment]' : '[embed]');
            return `• ${m.author.username} (${m.author.id}): ${content}  (${date})`;
        });
    return lines.length ? lines.join('\n') : '— No user messages found in this ticket —';
}

// ══════════════════════════════════════════════════════════════════════════════
//  FIND BOT'S TICKET EMBED MESSAGE IN CHANNEL
// ══════════════════════════════════════════════════════════════════════════════
async function findTicketMessage(channel, botId) {
    const msgs = await channel.messages.fetch({ limit: 15 });
    return msgs.find(m => m.author.id === botId && m.embeds.length > 0) ?? null;
}

// ══════════════════════════════════════════════════════════════════════════════
//  BUILD TICKET EMBED  (description-based for mobile compatibility)
// ══════════════════════════════════════════════════════════════════════════════
function buildTicketEmbed({ user, catLabel, product, ticketNum, status, assignedTo, openedTs }) {
    const ts     = openedTs ?? Math.floor(Date.now() / 1000);
    const stat   = status     ?? '🟢  Open';
    const assign = assignedTo ?? '*Unassigned*';
    const sep    = '`' + '─'.repeat(38) + '`';

    const desc = [
        `> **Nuron's Krak** official support ticket.`,
        `> Please describe your issue and wait for a staff member.`,
        `> Support is available **08:00 – 22:00** daily.`,
        '',
        sep,
        `👤  **User**\n${user}`,
        '',
        `🔒  **Status**\n${stat}`,
        sep,
        `📂  **Category** — ${catLabel ?? '—'}`,
        `📦  **Product**  — \`${product ?? '—'}\``,
        `🎫  **Ticket**   — \`#${ticketNum}\``,
        sep,
        `⏱️  **Opened**   — <t:${ts}:R>`,
        `🙋  **Assigned** — ${assign}`,
        sep
    ].join('\n');

    return new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle(`🎫  Support Ticket  #${ticketNum}`)
        .setDescription(desc)
        .setFooter({ text: `Ticket #${ticketNum}  •  Nuron's Krak Support` })
        .setTimestamp();
}

// Patch specific lines in the embed description
function patchEmbedDesc(oldDesc, patches) {
    let desc = oldDesc;
    if (patches.status !== undefined)
        desc = desc.replace(/🔒  \*\*Status\*\*\n.+/, `🔒  **Status**\n${patches.status}`);
    if (patches.assignedTo !== undefined)
        desc = desc.replace(/🙋  \*\*Assigned\*\* — .+/, `🙋  **Assigned** — ${patches.assignedTo}`);
    return desc;
}

// ══════════════════════════════════════════════════════════════════════════════
//  TICKET CONTROL COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════
function buildTicketComponents(archived = false) {
    const rowMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('t_controls')
            .setPlaceholder('⚙️  Ticket Controls')
            .addOptions([
                { label: 'Close Ticket',  value: 'close',  emoji: '⛔', description: 'Close and delete this ticket' },
                { label: 'Lock Ticket',   value: 'lock',   emoji: '🔒', description: 'Prevent the user from sending messages' },
                { label: 'Unlock Ticket', value: 'unlock', emoji: '🔓', description: 'Allow the user to send messages again' }
            ])
    );

    const archiveBtn = archived
        ? new ButtonBuilder().setCustomId('btn_archive').setLabel('Unarchive').setStyle(ButtonStyle.Secondary).setEmoji('📂')
        : new ButtonBuilder().setCustomId('btn_archive').setLabel('Archive').setStyle(ButtonStyle.Secondary).setEmoji('📁');

    const rowBtns1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_claim').setLabel('Claim').setStyle(ButtonStyle.Success).setEmoji('🙋'),
        new ButtonBuilder().setCustomId('btn_transfer').setLabel('Transfer').setStyle(ButtonStyle.Primary).setEmoji('🔀'),
        archiveBtn,
        new ButtonBuilder().setCustomId('btn_call_staff').setLabel('Call Staff').setStyle(ButtonStyle.Danger).setEmoji('🚨')
    );

    const rowBtns2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_transcript').setLabel('Transcript').setStyle(ButtonStyle.Primary).setEmoji('📄'),
        new ButtonBuilder().setCustomId('btn_add').setLabel('Add').setStyle(ButtonStyle.Success).setEmoji('➕'),
        new ButtonBuilder().setCustomId('btn_remove').setLabel('Remove').setStyle(ButtonStyle.Danger).setEmoji('➖'),
        new ButtonBuilder().setCustomId('btn_slowmode').setLabel('Slow Mode').setStyle(ButtonStyle.Secondary).setEmoji('🐢')
    );

    const rowBtns3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_transactions').setLabel('Transactions Log').setStyle(ButtonStyle.Danger).setEmoji('📋')
    );

    return [rowMenu, rowBtns1, rowBtns2, rowBtns3];
}

// ══════════════════════════════════════════════════════════════════════════════
//  MODULE EXPORT
// ══════════════════════════════════════════════════════════════════════════════
module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        try {
            await handleInteraction(interaction, client);
        } catch (err) {
            console.error('[InteractionCreate Error]', err);
            const msg = { content: '❌ An error occurred. Please try again.', ephemeral: true };
            try {
                if (!interaction.replied && !interaction.deferred) await interaction.reply(msg);
                else await interaction.followUp(msg);
            } catch (_) {}
        }
    }
};

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN HANDLER
// ══════════════════════════════════════════════════════════════════════════════
async function handleInteraction(interaction, client) {

    // ──────────────────────────────────────────────────────────────────────────
    //  DM INTERACTIONS — only rating buttons, no guild context
    // ──────────────────────────────────────────────────────────────────────────
    if (!interaction.guild) {
        if (interaction.isButton() && interaction.customId.startsWith('puan_')) {
            const parts   = interaction.customId.split('_');
            const puan    = parts[1];
            const guildId = parts[2];

            await interaction.update({
                content: `⭐ Your rating (**${puan}/5**) has been recorded. Thank you!`,
                components: []
            });

            const db    = loadDb();
            const logId = db[guildId]?.logChannel;
            if (logId) {
                const logChan = client.channels.cache.get(logId);
                if (logChan) {
                    const ratingEmbed = new EmbedBuilder()
                        .setColor(LOG_COLORS.rating)
                        .setTitle('⭐  Rating Received')
                        .addFields(
                            { name: '👤  User',   value: `\`${interaction.user.tag}\`  (${interaction.user})`, inline: true },
                            { name: '⭐  Rating', value: `**${puan} / 5**  ${'⭐'.repeat(Number(puan))}`,       inline: true }
                        )
                        .setTimestamp();
                    await logChan.send({ embeds: [ratingEmbed] }).catch(() => {});
                }
            }
        }
        // Transcript Messages button from DM
        if (interaction.isButton() && interaction.customId.startsWith('transcript_msgs_')) {
            const channelId = interaction.customId.replace('transcript_msgs_', '');
            const freshDb   = loadDb();
            const gId       = Object.keys(freshDb).find(gid => freshDb[gid]?.tickets?.[channelId]);
            const td        = gId ? freshDb[gId]?.tickets?.[channelId] : null;

            if (!td?.cachedTranscript) {
                return interaction.reply({ content: '❌ Transcript not found. Please regenerate it from the ticket.', ephemeral: true });
            }
            const fileName = `transcript-ticket-${td.num ?? channelId}.txt`;
            fs.writeFileSync(fileName, td.cachedTranscript, 'utf-8');
            await interaction.reply({
                content: `📄 **Transcript — Ticket #${td.num ?? '?'}**`,
                files: [{ attachment: fileName, name: fileName }],
                ephemeral: true
            });
            fs.unlinkSync(fileName);
        }
        return;
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  GUILD SETUP
    // ──────────────────────────────────────────────────────────────────────────
    let db      = loadDb();
    if (!db[interaction.guild.id]) db[interaction.guild.id] = { ticketCount: 0 };
    let guildDb = db[interaction.guild.id];

    const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
    const isStaff = guildDb.staffRole ? interaction.member.roles.cache.has(guildDb.staffRole) : false;
    const hasAuth = isAdmin || isStaff;

    const ticketData = interaction.channel
        ? getTicketData(db, interaction.guild.id, interaction.channel.id)
        : null;
    const isOwner = ticketData?.ownerId === interaction.user.id;
    const canAct  = hasAuth || isOwner;

    // ══════════════════════════════════════════════════════════════════════════
    //  SLASH COMMANDS
    // ══════════════════════════════════════════════════════════════════════════
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction, client);
        return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  /ticket-settings BUTTONS
    // ══════════════════════════════════════════════════════════════════════════
    if (interaction.isButton()) {
        if (interaction.customId === 'settings_log') {
            const row = new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder().setCustomId('set_log_chan').setChannelTypes(ChannelType.GuildText)
            );
            return interaction.reply({ content: '📁 Select the log channel:', components: [row], ephemeral: true });
        }
        if (interaction.customId === 'settings_role') {
            const row = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('set_staff_role'));
            return interaction.reply({ content: '👮 Select the staff role:', components: [row], ephemeral: true });
        }
        if (interaction.customId === 'settings_category') {
            const row = new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder().setCustomId('set_parent_cat').setChannelTypes(ChannelType.GuildCategory)
            );
            return interaction.reply({ content: '📂 Select the ticket category:', components: [row], ephemeral: true });
        }
        if (interaction.customId === 'settings_gif') {
            const modal = new ModalBuilder().setCustomId('gif_modal').setTitle('Set GIF / Image URL');
            const input = new TextInputBuilder()
                .setCustomId('gif_input').setLabel('Paste URL here (Discord, Imgur, etc.)')
                .setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SETTINGS — Save (selects + modal)
    // ══════════════════════════════════════════════════════════════════════════
    if (interaction.isAnySelectMenu()) {
        if (interaction.customId === 'set_log_chan') {
            db[interaction.guild.id].logChannel = interaction.values[0]; saveDb(db);
            return interaction.reply({ content: '✅ Log channel updated.', ephemeral: true });
        }
        if (interaction.customId === 'set_staff_role') {
            db[interaction.guild.id].staffRole = interaction.values[0]; saveDb(db);
            return interaction.reply({ content: '✅ Staff role updated.', ephemeral: true });
        }
        if (interaction.customId === 'set_parent_cat') {
            db[interaction.guild.id].parentId = interaction.values[0]; saveDb(db);
            return interaction.reply({ content: '✅ Ticket category updated.', ephemeral: true });
        }
    }
    if (interaction.isModalSubmit() && interaction.customId === 'gif_modal') {
        db[interaction.guild.id].gifUrl = interaction.fields.getTextInputValue('gif_input'); saveDb(db);
        return interaction.reply({ content: '✅ GIF/Image updated.', ephemeral: true });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  TICKET CREATION — product select
    // ══════════════════════════════════════════════════════════════════════════
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_product_select') {
        guildDb[`last_sel_${interaction.user.id}`] = interaction.values[0]; saveDb(db);
        return interaction.reply({ content: '✅ Product selected! Now choose a category below.', ephemeral: true });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  TICKET CREATION — category button
    // ══════════════════════════════════════════════════════════════════════════
    if (interaction.isButton() && interaction.customId.startsWith('ticket_cat_')) {
        const product = guildDb[`last_sel_${interaction.user.id}`];
        if (!product) return interaction.reply({ content: '⚠️ Please select a product first!', ephemeral: true });

        const catKey    = interaction.customId.replace('ticket_cat_', '');
        const catLabels = { genel: 'General', teknik: 'Technical', reklam: 'Advertisement', ozel: 'Special' };
        const catLabel  = catLabels[catKey] ?? (catKey.charAt(0).toUpperCase() + catKey.slice(1));

        guildDb.ticketCount = (guildDb.ticketCount || 0) + 1;
        const ticketNum  = guildDb.ticketCount;
        const openedTs   = Math.floor(Date.now() / 1000);

        const permOverwrites = [
            { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            {
                id: interaction.user.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
            }
        ];
        if (guildDb.staffRole) {
            permOverwrites.push({
                id: guildDb.staffRole,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
            });
        }

        const ticketChannel = await interaction.guild.channels.create({
            name: `ticket-${ticketNum}`,
            type: ChannelType.GuildText,
            parent: guildDb.parentId ?? null,
            permissionOverwrites: permOverwrites
        });

        if (!guildDb.tickets) guildDb.tickets = {};
        guildDb.tickets[ticketChannel.id] = {
            ownerId:      interaction.user.id,
            ownerTag:     interaction.user.tag,
            num:          ticketNum,
            openedTs,
            catLabel,
            product,
            archived:     false,
            extras:       [],
            lastCallStaff: 0,   // cooldown timestamp
            history: [{ text: `Ticket opened by ${interaction.user.tag}`, ts: openedTs }]
        };
        saveDb(db);

        const embed = buildTicketEmbed({
            user: interaction.user, catLabel, product, ticketNum,
            status: '🟢  Open', assignedTo: '*Unassigned*', openedTs
        });

        const staffMention = guildDb.staffRole ? ` <@&${guildDb.staffRole}>` : '';
        await ticketChannel.send({
            content: `${interaction.user}${staffMention}`,
            embeds: [embed],
            components: buildTicketComponents(false)
        });

        // ── LOG: Ticket Opened ────────────────────────────────────────────────
        await sendLog(interaction.guild, guildDb, client, 'open', [
            { name: '👤  Opened By',  value: `${interaction.user}  \`${interaction.user.tag}\``, inline: true },
            { name: '📌  Channel',    value: `${ticketChannel}`,                                 inline: true },
            { name: '\u200b',          value: '\u200b',                                           inline: true },
            { name: '📂  Category',   value: catLabel,                                           inline: true },
            { name: '📦  Product',    value: `\`${product}\``,                                  inline: true },
            { name: '🎫  Ticket No',  value: `\`#${ticketNum}\``,                               inline: true },
        ], guildDb.tickets[ticketChannel.id]);

        return interaction.reply({ content: `✅ Your ticket has been opened: ${ticketChannel}`, ephemeral: true });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  TICKET CONTROL BUTTONS
    // ══════════════════════════════════════════════════════════════════════════
    if (interaction.isButton()) {
        const td = getTicketData(db, interaction.guild.id, interaction.channel.id);

        // ── CLAIM ─────────────────────────────────────────────────────────────
        if (interaction.customId === 'btn_claim') {
            if (!hasAuth) return interaction.reply({ content: '❌ You need the staff role to claim tickets.', ephemeral: true });

            const ticketMsg = await findTicketMessage(interaction.channel, client.user.id);
            if (!ticketMsg) return interaction.reply({ content: '❌ Ticket message not found.', ephemeral: true });

            const embed   = EmbedBuilder.from(ticketMsg.embeds[0]);
            embed.setDescription(patchEmbedDesc(ticketMsg.embeds[0].description, { assignedTo: `${interaction.user}` }));
            await ticketMsg.edit({ embeds: [embed] });

            logAction(db, interaction.guild.id, interaction.channel.id, `Claimed by ${interaction.user.tag}`);
            saveDb(db);

            await sendLog(interaction.guild, guildDb, client, 'claim', [
                { name: '🙋  Claimed By', value: `${interaction.user}  \`${interaction.user.tag}\``, inline: true },
                { name: '📌  Channel',    value: `${interaction.channel}`,                           inline: true },
            ], td);

            return interaction.reply({ content: '✅ You have claimed this ticket.', ephemeral: true });
        }

        // ── TRANSFER ──────────────────────────────────────────────────────────
        if (interaction.customId === 'btn_transfer') {
            if (!hasAuth) return interaction.reply({ content: '❌ Staff only.', ephemeral: true });
            const row = new ActionRowBuilder().addComponents(
                new UserSelectMenuBuilder()
                    .setCustomId('transfer_user_select')
                    .setPlaceholder('Select a staff member to transfer to')
                    .setMinValues(1).setMaxValues(1)
            );
            return interaction.reply({ content: '🔀 Select a **staff member** to transfer this ticket to:', components: [row], ephemeral: true });
        }

        // ── ARCHIVE / UNARCHIVE ───────────────────────────────────────────────
        if (interaction.customId === 'btn_archive') {
            if (!hasAuth) return interaction.reply({ content: '❌ Staff only.', ephemeral: true });

            const num = td.num ?? interaction.channel.name.replace(/\D/g, '') ?? '0';

            if (!td.archived) {
                await interaction.channel.setName(`arsived-ticket-${num}`);
                await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false, SendMessages: false });
                if (td.ownerId) await interaction.channel.permissionOverwrites.edit(td.ownerId,
                    { ViewChannel: true, SendMessages: false, ReadMessageHistory: true }).catch(() => {});

                td.archived = true;
                logAction(db, interaction.guild.id, interaction.channel.id, `Archived by ${interaction.user.tag}`);
                saveDb(db);

                const ticketMsg = await findTicketMessage(interaction.channel, client.user.id);
                if (ticketMsg) await ticketMsg.edit({ components: buildTicketComponents(true) }).catch(() => {});

                await sendLog(interaction.guild, guildDb, client, 'archive', [
                    { name: '📁  Archived By', value: `${interaction.user}  \`${interaction.user.tag}\``, inline: true },
                    { name: '📌  Channel',     value: `\`arsived-ticket-${num}\``,                        inline: true },
                ], td);

                return interaction.reply({ content: `📁 Ticket archived. Press **Unarchive** to restore.`, ephemeral: true });
            } else {
                await interaction.channel.setName(`ticket-${num}`);
                await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
                if (td.ownerId) await interaction.channel.permissionOverwrites.edit(td.ownerId,
                    { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => {});

                td.archived = false;
                logAction(db, interaction.guild.id, interaction.channel.id, `Unarchived by ${interaction.user.tag}`);
                saveDb(db);

                const ticketMsg = await findTicketMessage(interaction.channel, client.user.id);
                if (ticketMsg) await ticketMsg.edit({ components: buildTicketComponents(false) }).catch(() => {});

                await sendLog(interaction.guild, guildDb, client, 'unarchive', [
                    { name: '📂  Unarchived By', value: `${interaction.user}  \`${interaction.user.tag}\``, inline: true },
                    { name: '📌  Channel',       value: `${interaction.channel}`,                           inline: true },
                ], td);

                return interaction.reply({ content: `📂 Ticket restored.`, ephemeral: true });
            }
        }

        // ── CALL STAFF — 30-minute cooldown ───────────────────────────────────
        if (interaction.customId === 'btn_call_staff') {
            if (!canAct) return interaction.reply({ content: '❌ Only ticket participants can call staff.', ephemeral: true });

            const now      = Math.floor(Date.now() / 1000);
            const lastCall = td.lastCallStaff ?? 0;
            const cooldown = 30 * 60; // 30 minutes in seconds
            const elapsed  = now - lastCall;

            if (elapsed < cooldown) {
                const remaining    = cooldown - elapsed;
                const mins         = Math.floor(remaining / 60);
                const secs         = remaining % 60;
                const timeStr      = mins > 0
                    ? `**${mins} minute(s)${secs > 0 ? ` and ${secs} second(s)` : ''}**`
                    : `**${secs} second(s)**`;

                return interaction.reply({
                    content:
                        `⏳ **Call Staff is on cooldown!**\n` +
                        `You can call staff again in ${timeStr}.\n` +
                        `> Staff has already been notified. Please be patient.`,
                    ephemeral: true
                });
            }

            // Update cooldown
            td.lastCallStaff = now;
            logAction(db, interaction.guild.id, interaction.channel.id, `Staff called by ${interaction.user.tag}`);
            saveDb(db);

            const callEmbed = new EmbedBuilder()
                .setColor('#ED4245')
                .setTitle('🚨  Urgent Support Request')
                .setDescription(
                    `${guildDb.staffRole ? `<@&${guildDb.staffRole}>` : '**@Staff**'}\n\n` +
                    `**${interaction.user.tag}** has requested urgent support for this ticket.\n` +
                    `Please attend as soon as possible!`
                )
                .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
                .addFields(
                    { name: '👤  Requested By', value: `${interaction.user}`, inline: true },
                    { name: '📌  Channel',       value: `${interaction.channel}`, inline: true }
                )
                .setFooter({ text: 'Call Staff • 30-minute cooldown per ticket' })
                .setTimestamp();

            const staffPing = guildDb.staffRole ? `<@&${guildDb.staffRole}>` : '';
            await interaction.channel.send({ content: staffPing, embeds: [callEmbed] });

            await sendLog(interaction.guild, guildDb, client, 'callstaff', [
                { name: '🚨  Called By',   value: `${interaction.user}  \`${interaction.user.tag}\``, inline: true },
                { name: '📌  Channel',     value: `${interaction.channel}`,                           inline: true },
                { name: '🕐  Called At',   value: `<t:${now}:F>`,                                    inline: true },
            ], td);

            return interaction.reply({ content: '✅ Staff has been notified!', ephemeral: true });
        }

        // ── TRANSCRIPT — save and send ONLY to log channel ────────────────────
        if (interaction.customId === 'btn_transcript') {
            if (!hasAuth) return interaction.reply({ content: '❌ Staff only.', ephemeral: true });
            await interaction.deferReply({ ephemeral: true });

            const txtLines = await buildTranscript(interaction.channel);
            td.cachedTranscript = txtLines;
            logAction(db, interaction.guild.id, interaction.channel.id, `Transcript saved by ${interaction.user.tag}`);
            saveDb(db);

            const fileName = `transcript-ticket-${td.num ?? interaction.channel.id}.txt`;
            fs.writeFileSync(fileName, txtLines, 'utf-8');

            // Build transcript info embed
            const transcriptEmbed = new EmbedBuilder()
                .setColor(LOG_COLORS.transcript)
                .setTitle(`📄  Transcript — Ticket #${td.num ?? '?'}`)
                .setDescription(
                    '**Ticket Information**\n' +
                    `> 👤 **Owner:** ${td.ownerId ? `<@${td.ownerId}>` : '—'}  \`${td.ownerTag ?? '—'}\`\n` +
                    `> 📂 **Category:** ${td.catLabel ?? '—'}  •  \`${td.product ?? '—'}\`\n` +
                    `> 🎫 **Ticket #:** \`${td.num ?? '—'}\`\n` +
                    `> 💾 **Saved By:** \`${interaction.user.tag}\`\n` +
                    `> 📅 **Saved At:** <t:${Math.floor(Date.now() / 1000)}:F>\n\n` +
                    `*The full message log is attached below.*`
                )
                .setFooter({ text: 'Nuron\'s Krak Support  •  Transcript' })
                .setTimestamp();

            // Send ONLY to log channel (not DM)
            if (guildDb.logChannel) {
                const logChan = interaction.guild.channels.cache.get(guildDb.logChannel);
                if (logChan) {
                    await logChan.send({
                        embeds: [transcriptEmbed],
                        files: [{ attachment: fileName, name: fileName }]
                    }).catch(() => {});
                }
            }

            fs.unlinkSync(fileName);

            return interaction.editReply({ content: '✅ Transcript has been saved to the log channel.' });
        }

        // ── TRANSCRIPT: Messages button (in-guild, from log channel) ──────────
        if (interaction.customId.startsWith('transcript_msgs_')) {
            const channelId = interaction.customId.replace('transcript_msgs_', '');
            const freshDb   = loadDb();
            const gId       = Object.keys(freshDb).find(gid => freshDb[gid]?.tickets?.[channelId]);
            const td2       = gId ? freshDb[gId]?.tickets?.[channelId] : null;

            if (!td2?.cachedTranscript) {
                return interaction.reply({ content: '❌ Transcript not found. Please regenerate it.', ephemeral: true });
            }
            const fileName = `transcript-ticket-${td2.num ?? channelId}.txt`;
            fs.writeFileSync(fileName, td2.cachedTranscript, 'utf-8');
            await interaction.reply({
                content: `📄 **Transcript — Ticket #${td2.num ?? '?'}**`,
                files: [{ attachment: fileName, name: fileName }],
                ephemeral: true
            });
            fs.unlinkSync(fileName);
            return;
        }

        // ── ADD ───────────────────────────────────────────────────────────────
        if (interaction.customId === 'btn_add') {
            if (!canAct) return interaction.reply({ content: '❌ You do not have permission.', ephemeral: true });
            const row = new ActionRowBuilder().addComponents(
                new UserSelectMenuBuilder()
                    .setCustomId('add_user_ticket')
                    .setPlaceholder('Select members to add')
                    .setMinValues(1).setMaxValues(10)
            );
            return interaction.reply({ content: '➕ Select the members to add to this ticket:', components: [row], ephemeral: true });
        }

        // ── REMOVE ────────────────────────────────────────────────────────────
        if (interaction.customId === 'btn_remove') {
            if (!canAct) return interaction.reply({ content: '❌ You do not have permission.', ephemeral: true });

            const extras = td.extras ?? [];
            if (!extras.length) return interaction.reply({ content: '⚠️ No extra members to remove.', ephemeral: true });

            const buttons = extras.map(uid =>
                new ButtonBuilder()
                    .setCustomId(`kick_member_${uid}`)
                    .setLabel(interaction.guild.members.cache.get(uid)?.displayName ?? uid)
                    .setStyle(ButtonStyle.Danger)
            );
            const rows = [];
            for (let i = 0; i < buttons.length; i += 5)
                rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));

            return interaction.reply({ content: '➖ Click a member to remove them from the ticket:', components: rows.slice(0, 5), ephemeral: true });
        }

        // ── REMOVE — member button clicked ───────────────────────────────────
        if (interaction.customId.startsWith('kick_member_')) {
            if (!canAct) return interaction.reply({ content: '❌ You do not have permission.', ephemeral: true });

            const memberId    = interaction.customId.replace('kick_member_', '');
            const memberTag   = interaction.guild.members.cache.get(memberId)?.user.tag ?? memberId;
            const displayName = interaction.guild.members.cache.get(memberId)?.displayName ?? memberId;

            await interaction.channel.permissionOverwrites.delete(memberId).catch(() => {});
            td.extras = (td.extras ?? []).filter(id => id !== memberId);
            logAction(db, interaction.guild.id, interaction.channel.id, `${memberTag} removed by ${interaction.user.tag}`);
            saveDb(db);

            await sendLog(interaction.guild, guildDb, client, 'remove', [
                { name: '➖  Removed',    value: `\`${memberTag}\``,                               inline: true },
                { name: '👮  By',         value: `${interaction.user}  \`${interaction.user.tag}\``, inline: true },
                { name: '📌  Channel',    value: `${interaction.channel}`,                           inline: true },
            ], td);

            return interaction.update({ content: `✅ **${displayName}** has been removed from the ticket.`, components: [] });
        }

        // ── SLOW MODE ─────────────────────────────────────────────────────────
        if (interaction.customId === 'btn_slowmode') {
            if (!hasAuth) return interaction.reply({ content: '❌ Staff only.', ephemeral: true });

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('slowmode_select')
                    .setPlaceholder('🐢  Select slow mode duration')
                    .addOptions([
                        { label: '10 Seconds',  value: '10',   emoji: '🐢' },
                        { label: '30 Seconds',  value: '30',   emoji: '🐢' },
                        { label: '1 Minute',    value: '60',   emoji: '⏱️' },
                        { label: '5 Minutes',   value: '300',  emoji: '⏱️' },
                        { label: '10 Minutes',  value: '600',  emoji: '⏱️' },
                        { label: '15 Minutes',  value: '900',  emoji: '⏱️' },
                        { label: '30 Minutes',  value: '1800', emoji: '⏱️' },
                        { label: 'Disable',     value: '0',    emoji: '✅' }
                    ])
            );
            return interaction.reply({ content: '🐢 Select a slow mode duration:', components: [row], ephemeral: true });
        }

        // ── TRANSACTIONS LOG ──────────────────────────────────────────────────
        if (interaction.customId === 'btn_transactions') {
            const history = td.history ?? [];
            const logEmbed = new EmbedBuilder()
                .setColor('#ED4245')
                .setTitle(`📋  Transactions Log — Ticket #${td.num ?? '?'}`)
                .setDescription(
                    history.length
                        ? history.map(h => `• ${h.text}  —  <t:${h.ts}:R>`).join('\n')
                        : '*No actions logged yet.*'
                )
                .setFooter({ text: 'Visible only to you' })
                .setTimestamp();

            return interaction.reply({ embeds: [logEmbed], ephemeral: true });
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  TICKET CONTROLS DROPDOWN
    // ══════════════════════════════════════════════════════════════════════════
    if (interaction.isStringSelectMenu() && interaction.customId === 't_controls') {
        if (!canAct) return interaction.reply({ content: '❌ You do not have permission.', ephemeral: true });

        const val       = interaction.values[0];
        const td        = getTicketData(db, interaction.guild.id, interaction.channel.id);
        const ticketMsg = await findTicketMessage(interaction.channel, client.user.id);

        // ── CLOSE ─────────────────────────────────────────────────────────────
        if (val === 'close') {
            await interaction.reply({ content: '⏳ Ticket will be closed in **5 seconds**...' });

            // Log BEFORE deleting the channel
            await sendLog(interaction.guild, guildDb, client, 'close', [
                { name: '🔴  Closed By',  value: `${interaction.user}  \`${interaction.user.tag}\``, inline: true },
                { name: '📌  Channel',    value: `\`${interaction.channel.name}\``,                  inline: true },
                { name: '⏱️  Was Open',   value: td.openedTs ? `<t:${td.openedTs}:R>` : '—',        inline: true },
                { name: '👤  Owner',      value: td.ownerId ? `<@${td.ownerId}>  \`${td.ownerTag}\`` : '—', inline: true },
            ], td);

            logAction(db, interaction.guild.id, interaction.channel.id, `Closed by ${interaction.user.tag}`);
            saveDb(db);

            // Send rating to ticket owner via DM (only interaction — not a "message")
            if (td.ownerId) {
                const owner = await client.users.fetch(td.ownerId).catch(() => null);
                if (owner) {
                    const ratingRow = new ActionRowBuilder().addComponents(
                        [1, 2, 3, 4, 5].map(i =>
                            new ButtonBuilder()
                                .setCustomId(`puan_${i}_${interaction.guild.id}`)
                                .setLabel(`${i} ⭐`)
                                .setStyle(ButtonStyle.Primary)
                        )
                    );
                    await owner.send({
                        content: `**${interaction.guild.name}** — Would you rate your support experience?\n*(1 = Poor  |  5 = Excellent)*`,
                        components: [ratingRow]
                    }).catch(() => {});
                }
            }

            setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
            return;
        }

        // ── LOCK ──────────────────────────────────────────────────────────────
        if (val === 'lock') {
            if (!hasAuth) return interaction.reply({ content: '❌ Staff only.', ephemeral: true });
            if (!td.ownerId) return interaction.reply({ content: '❌ Ticket owner not found in DB.', ephemeral: true });

            await interaction.channel.permissionOverwrites.edit(td.ownerId, { SendMessages: false }).catch(() => {});

            if (ticketMsg) {
                const embed = EmbedBuilder.from(ticketMsg.embeds[0]);
                embed.setDescription(patchEmbedDesc(ticketMsg.embeds[0].description, { status: '🔴  Locked' }));
                await ticketMsg.edit({ embeds: [embed] });
            }

            logAction(db, interaction.guild.id, interaction.channel.id, `Locked by ${interaction.user.tag}`);
            saveDb(db);

            await sendLog(interaction.guild, guildDb, client, 'lock', [
                { name: '🔒  Locked By', value: `${interaction.user}  \`${interaction.user.tag}\``, inline: true },
                { name: '📌  Channel',   value: `${interaction.channel}`,                           inline: true },
            ], td);

            return interaction.reply({ content: '🔒 Ticket locked. The user can no longer send messages.' });
        }

        // ── UNLOCK ────────────────────────────────────────────────────────────
        if (val === 'unlock') {
            if (!hasAuth) return interaction.reply({ content: '❌ Staff only.', ephemeral: true });
            if (!td.ownerId) return interaction.reply({ content: '❌ Ticket owner not found in DB.', ephemeral: true });

            await interaction.channel.permissionOverwrites.edit(td.ownerId, {
                ViewChannel: true, SendMessages: true, ReadMessageHistory: true
            }).catch(() => {});

            if (ticketMsg) {
                const embed = EmbedBuilder.from(ticketMsg.embeds[0]);
                embed.setDescription(patchEmbedDesc(ticketMsg.embeds[0].description, { status: '🟢  Open' }));
                await ticketMsg.edit({ embeds: [embed] });
            }

            logAction(db, interaction.guild.id, interaction.channel.id, `Unlocked by ${interaction.user.tag}`);
            saveDb(db);

            await sendLog(interaction.guild, guildDb, client, 'unlock', [
                { name: '🔓  Unlocked By', value: `${interaction.user}  \`${interaction.user.tag}\``, inline: true },
                { name: '📌  Channel',     value: `${interaction.channel}`,                           inline: true },
            ], td);

            return interaction.reply({ content: '🔓 Ticket unlocked. The user can send messages again.' });
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SLOW MODE — duration selected
    // ══════════════════════════════════════════════════════════════════════════
    if (interaction.isStringSelectMenu() && interaction.customId === 'slowmode_select') {
        if (!hasAuth) return interaction.reply({ content: '❌ Staff only.', ephemeral: true });

        const seconds = parseInt(interaction.values[0]);
        await interaction.channel.setRateLimitPerUser(seconds).catch(() => {});

        const durationStr = seconds === 0
            ? 'Disabled'
            : (seconds < 60 ? `${seconds} second(s)` : `${seconds / 60} minute(s)`);

        const label = seconds === 0
            ? '✅ Slow mode **disabled**.'
            : `🐢 Slow mode set to **${durationStr}**.`;

        const td = getTicketData(db, interaction.guild.id, interaction.channel.id);
        logAction(db, interaction.guild.id, interaction.channel.id,
            `Slow mode set to ${durationStr} by ${interaction.user.tag}`);
        saveDb(db);

        await sendLog(interaction.guild, guildDb, client, 'slowmode', [
            { name: '🐢  Duration',   value: `\`${durationStr}\``,                                inline: true },
            { name: '👮  Set By',     value: `${interaction.user}  \`${interaction.user.tag}\``, inline: true },
            { name: '📌  Channel',    value: `${interaction.channel}`,                           inline: true },
        ], td);

        return interaction.update({ content: label, components: [] });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  TRANSFER — user selected
    // ══════════════════════════════════════════════════════════════════════════
    if (interaction.isUserSelectMenu() && interaction.customId === 'transfer_user_select') {
        if (!hasAuth) return interaction.reply({ content: '❌ Staff only.', ephemeral: true });

        const targetId     = interaction.values[0];
        const targetMember = interaction.guild.members.cache.get(targetId)
            ?? await interaction.guild.members.fetch(targetId).catch(() => null);

        if (!targetMember) return interaction.update({ content: '❌ Member not found.', components: [] });

        const targetIsStaff =
            targetMember.permissions.has(PermissionsBitField.Flags.Administrator) ||
            (guildDb.staffRole && targetMember.roles.cache.has(guildDb.staffRole));

        if (!targetIsStaff) {
            return interaction.update({
                content: `❌ **${targetMember.displayName}** does not have the staff role.`,
                components: []
            });
        }

        const td        = getTicketData(db, interaction.guild.id, interaction.channel.id);
        const ticketMsg = await findTicketMessage(interaction.channel, client.user.id);
        if (ticketMsg) {
            const embed = EmbedBuilder.from(ticketMsg.embeds[0]);
            embed.setDescription(patchEmbedDesc(ticketMsg.embeds[0].description, { assignedTo: `${targetMember}` }));
            await ticketMsg.edit({ embeds: [embed] });
        }

        logAction(db, interaction.guild.id, interaction.channel.id,
            `Transferred to ${targetMember.user.tag} by ${interaction.user.tag}`);
        saveDb(db);

        await sendLog(interaction.guild, guildDb, client, 'transfer', [
            { name: '🔀  Transferred To', value: `${targetMember}  \`${targetMember.user.tag}\``, inline: true },
            { name: '👤  Transferred By', value: `${interaction.user}  \`${interaction.user.tag}\``, inline: true },
            { name: '📌  Channel',        value: `${interaction.channel}`,                           inline: true },
        ], td);

        return interaction.update({
            content: `✅ Ticket transferred to **${targetMember.displayName}**.`,
            components: []
        });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  ADD — users selected
    // ══════════════════════════════════════════════════════════════════════════
    if (interaction.isUserSelectMenu() && interaction.customId === 'add_user_ticket') {
        if (!canAct) return interaction.reply({ content: '❌ You do not have permission.', ephemeral: true });

        const td = getTicketData(db, interaction.guild.id, interaction.channel.id);
        if (!td.extras) td.extras = [];

        const added = [];
        for (const userId of interaction.values) {
            if (interaction.channel.permissionOverwrites.cache.has(userId)) continue;
            await interaction.channel.permissionOverwrites.edit(userId, {
                ViewChannel: true, SendMessages: true, ReadMessageHistory: true
            }).catch(() => {});
            if (!td.extras.includes(userId)) td.extras.push(userId);
            added.push(interaction.guild.members.cache.get(userId)?.displayName ?? `<@${userId}>`);
        }

        if (!added.length) return interaction.update({ content: '⚠️ Selected members are already in this ticket.', components: [] });

        logAction(db, interaction.guild.id, interaction.channel.id,
            `${added.join(', ')} added by ${interaction.user.tag}`);
        saveDb(db);

        await sendLog(interaction.guild, guildDb, client, 'add', [
            { name: '➕  Added',    value: added.map(n => `\`${n}\``).join(', '),                inline: false },
            { name: '👮  By',       value: `${interaction.user}  \`${interaction.user.tag}\``, inline: true },
            { name: '📌  Channel',  value: `${interaction.channel}`,                           inline: true },
        ], td);

        return interaction.update({ content: `✅ **${added.join(', ')}** added to the ticket.`, components: [] });
    }
}
