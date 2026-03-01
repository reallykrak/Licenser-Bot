const {
    ChannelType, PermissionsBitField, EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder,
    TextInputStyle, StringSelectMenuBuilder, ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder, UserSelectMenuBuilder
} = require('discord.js');
const fs = require('fs');

// ─── DB YARDIMCILARI ───────────────────────────────────────────────────────────
function loadDb() {
    return JSON.parse(fs.readFileSync('./db.json', 'utf-8'));
}
function saveDb(db) {
    fs.writeFileSync('./db.json', JSON.stringify(db, null, 2));
}

// ─── TICKET KAYDINI GETIR / OLUŞTUR ───────────────────────────────────────────
function getTicketData(db, guildId, channelId) {
    if (!db[guildId]) db[guildId] = { ticketCount: 0 };
    if (!db[guildId].tickets) db[guildId].tickets = {};
    if (!db[guildId].tickets[channelId]) db[guildId].tickets[channelId] = {};
    return db[guildId].tickets[channelId];
}

// ─── TRANSKRIPT TXT ────────────────────────────────────────────────────────────
async function buildTranscript(channel) {
    const fetched = await channel.messages.fetch({ limit: 100 });
    const lines = [...fetched.values()]
        .reverse()
        .filter(m => !m.author.bot)
        .map(m => {
            const t = m.createdAt.toLocaleString('tr-TR');
            const content = m.content || (m.attachments.size ? '[dosya eki]' : '[embed]');
            return `[${t}] ${m.author.username}: ${content}`;
        });
    return lines.join('\n') || 'Kullanıcı mesajı bulunamadı.';
}

// ─── BOT'UN TICKET EMBED MESAJINI BUL ─────────────────────────────────────────
async function findTicketMessage(channel, botId) {
    const msgs = await channel.messages.fetch({ limit: 15 });
    return msgs.find(m => m.author.id === botId && m.embeds.length > 0) ?? null;
}

// ──────────────────────────────────────────────────────────────────────────────
module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        try {
            await handleInteraction(interaction, client);
        } catch (err) {
            console.error('InteractionCreate hatası:', err);
            const errMsg = { content: '❌ Bir hata oluştu. Lütfen tekrar deneyin.', ephemeral: true };
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply(errMsg);
                } else {
                    await interaction.followUp(errMsg);
                }
            } catch (_) {}
        }
    }
};

async function handleInteraction(interaction, client) {

    let db     = loadDb();
    if (!db[interaction.guild.id]) db[interaction.guild.id] = { ticketCount: 0 };
    let guildDb = db[interaction.guild.id];

    const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
    const isStaff = guildDb.staffRole
        ? interaction.member.roles.cache.has(guildDb.staffRole)
        : false;
    const hasAuth = isAdmin || isStaff;

    // ═══════════════════════════════════════════════════════════
    //  SLASH KOMUTLARI
    // ═══════════════════════════════════════════════════════════
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction, client);
        return;
    }

    // ═══════════════════════════════════════════════════════════
    //  /ticket-settings BUTONLARI
    // ═══════════════════════════════════════════════════════════
    if (interaction.isButton()) {
        if (interaction.customId === 'settings_log') {
            const row = new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId('set_log_chan')
                    .setChannelTypes(ChannelType.GuildText)
            );
            return interaction.reply({ content: '📁 Log kanalını seçin:', components: [row], ephemeral: true });
        }
        if (interaction.customId === 'settings_role') {
            const row = new ActionRowBuilder().addComponents(
                new RoleSelectMenuBuilder().setCustomId('set_staff_role')
            );
            return interaction.reply({ content: '👮 Yetkili rolünü seçin:', components: [row], ephemeral: true });
        }
        if (interaction.customId === 'settings_category') {
            const row = new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId('set_parent_cat')
                    .setChannelTypes(ChannelType.GuildCategory)
            );
            return interaction.reply({ content: '📂 Bilet kategorisini seçin:', components: [row], ephemeral: true });
        }
        if (interaction.customId === 'settings_gif') {
            const modal = new ModalBuilder().setCustomId('gif_modal').setTitle('GIF / Resim URL');
            const input = new TextInputBuilder()
                .setCustomId('gif_input')
                .setLabel('URL girin (discord/imgur vb.)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  AYAR KAYDETME (SelectMenu + Modal)
    // ═══════════════════════════════════════════════════════════
    if (interaction.isAnySelectMenu()) {
        if (interaction.customId === 'set_log_chan') {
            db[interaction.guild.id].logChannel = interaction.values[0];
            saveDb(db);
            return interaction.reply({ content: '✅ Log kanalı ayarlandı.', ephemeral: true });
        }
        if (interaction.customId === 'set_staff_role') {
            db[interaction.guild.id].staffRole = interaction.values[0];
            saveDb(db);
            return interaction.reply({ content: '✅ Yetkili rolü ayarlandı.', ephemeral: true });
        }
        if (interaction.customId === 'set_parent_cat') {
            db[interaction.guild.id].parentId = interaction.values[0];
            saveDb(db);
            return interaction.reply({ content: '✅ Kategori ayarlandı.', ephemeral: true });
        }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'gif_modal') {
        db[interaction.guild.id].gifUrl = interaction.fields.getTextInputValue('gif_input');
        saveDb(db);
        return interaction.reply({ content: '✅ GIF/Resim ayarlandı.', ephemeral: true });
    }

    // ═══════════════════════════════════════════════════════════
    //  TİCKET OLUŞTURMA — Ürün Seçimi
    // ═══════════════════════════════════════════════════════════
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_product_select') {
        guildDb[`last_sel_${interaction.user.id}`] = interaction.values[0];
        saveDb(db);
        return interaction.reply({ content: '✅ Ürün seçildi! Şimdi aşağıdan kategori seçin.', ephemeral: true });
    }

    // ═══════════════════════════════════════════════════════════
    //  TİCKET OLUŞTURMA — Kategori Butonu
    // ═══════════════════════════════════════════════════════════
    if (interaction.isButton() && interaction.customId.startsWith('ticket_cat_')) {
        const product = guildDb[`last_sel_${interaction.user.id}`];
        if (!product) {
            return interaction.reply({ content: '⚠️ Önce listeden bir ürün seçin!', ephemeral: true });
        }

        const catKey    = interaction.customId.replace('ticket_cat_', '');
        const catLabels = { genel: 'Genel', teknik: 'Teknik', reklam: 'Reklam', ozel: 'Özel' };
        const catLabel  = catLabels[catKey] ?? catKey.toUpperCase();

        guildDb.ticketCount = (guildDb.ticketCount || 0) + 1;
        const ticketNum = guildDb.ticketCount;

        const permOverwrites = [
            { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            {
                id: interaction.user.id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory
                ]
            }
        ];
        if (guildDb.staffRole) {
            permOverwrites.push({
                id: guildDb.staffRole,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory
                ]
            });
        }

        const ticketChannel = await interaction.guild.channels.create({
            name: `ticket-${ticketNum}`,
            type: ChannelType.GuildText,
            parent: guildDb.parentId ?? null,
            permissionOverwrites: permOverwrites
        });

        // Ticket verisini DB'ye kaydet — artık guild.members.fetch() çekmeyeceğiz
        if (!guildDb.tickets) guildDb.tickets = {};
        guildDb.tickets[ticketChannel.id] = {
            ownerId: interaction.user.id,
            num: ticketNum,
            extras: []
        };
        saveDb(db);

        // ── EMBED ─────────────────────────────────────────────────────
        // Discord inline'da satır başı her 3 alanda olur:
        // Satır 1: Kullanıcı | Durum   | (boş)
        // Satır 2: Kategori  | TalepNo | Açılış
        // Satır 3: Sorumlu   | (boş)   | (boş)
        const ticketEmbed = new EmbedBuilder()
            .setTitle("🎫 Nuron's Krak | Destek Sistemi")
            .setDescription(
                "**Dikkat:** Çalışma saatleri dışındaysanız temsilcilerimiz mesai " +
                "başlangıcında size geri dönüş yapacaktır."
            )
            .setColor('#5865F2')
            .addFields(
                { name: '👤 Kullanıcı', value: `${interaction.user}`,               inline: true },
                { name: '🔒 Durum',     value: '🟢 Açık',                           inline: true },
                { name: '\u200b',        value: '\u200b',                             inline: true },
                { name: '📂 Kategori',  value: `${catLabel} • ${product}`,           inline: true },
                { name: '🎫 Talep No',  value: `#${ticketNum}`,                      inline: true },
                { name: '⏱️ Açılış',    value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true },
                { name: '🙋 Sorumlu',   value: 'Henüz yok',                          inline: true },
                { name: '\u200b',        value: '\u200b',                             inline: true },
                { name: '\u200b',        value: '\u200b',                             inline: true }
            )
            .setFooter({ text: `Nuron's Krak Destek • Bilet #${ticketNum}` })
            .setTimestamp();

        const rowMenu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('t_controls')
                .setPlaceholder('⚙️ Bilet İşlemleri')
                .addOptions([
                    { label: 'Kapat',     value: 'close',  emoji: '⛔', description: 'Bileti kapat ve sil' },
                    { label: 'Kilitle',   value: 'lock',   emoji: '🔒', description: 'Kullanıcının yazmasını engelle' },
                    { label: 'Kilidi Aç', value: 'unlock', emoji: '🔓', description: 'Kullanıcının tekrar yazmasına izin ver' }
                ])
        );

        const rowBtns1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_claim').setLabel('Devral').setStyle(ButtonStyle.Success).setEmoji('🙋'),
            new ButtonBuilder().setCustomId('btn_transfer').setLabel('Devret').setStyle(ButtonStyle.Primary).setEmoji('🔀'),
            new ButtonBuilder().setCustomId('btn_archive').setLabel('Arşivle').setStyle(ButtonStyle.Secondary).setEmoji('📁')
        );
        const rowBtns2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_save').setLabel('Kaydet').setStyle(ButtonStyle.Primary).setEmoji('💾'),
            new ButtonBuilder().setCustomId('btn_add').setLabel('Ekle').setStyle(ButtonStyle.Success).setEmoji('➕'),
            new ButtonBuilder().setCustomId('btn_remove').setLabel('Çıkar').setStyle(ButtonStyle.Danger).setEmoji('➖')
        );

        const staffMention = guildDb.staffRole ? ` <@&${guildDb.staffRole}>` : '';
        await ticketChannel.send({
            content: `${interaction.user}${staffMention}`,
            embeds: [ticketEmbed],
            components: [rowMenu, rowBtns1, rowBtns2]
        });

        return interaction.reply({ content: `✅ Biletiniz açıldı: ${ticketChannel}`, ephemeral: true });
    }

    // ═══════════════════════════════════════════════════════════
    //  BİLET İÇİ BUTONLAR
    // ═══════════════════════════════════════════════════════════
    if (interaction.isButton()) {
        const ticketData = getTicketData(db, interaction.guild.id, interaction.channel.id);

        // ── DEVRAL ────────────────────────────────────────────────────
        if (interaction.customId === 'btn_claim') {
            if (!hasAuth) {
                return interaction.reply({ content: '❌ Bu işlem için yetkili rolünüz olması gerekiyor.', ephemeral: true });
            }
            const ticketMsg = await findTicketMessage(interaction.channel, client.user.id);
            if (!ticketMsg) {
                return interaction.reply({ content: '❌ Bilet mesajı bulunamadı.', ephemeral: true });
            }
            const embed = EmbedBuilder.from(ticketMsg.embeds[0]);
            // index 6 = Sorumlu (0=Kullanıcı 1=Durum 2=boş 3=Kategori 4=TalepNo 5=Açılış 6=Sorumlu)
            embed.spliceFields(6, 1, { name: '🙋 Sorumlu', value: `${interaction.user}`, inline: true });
            await ticketMsg.edit({ embeds: [embed] });
            return interaction.reply({ content: `✅ Bilet artık **${interaction.user.tag}** sorumluluğunda.` });
        }

        // ── DEVRET ────────────────────────────────────────────────────
        if (interaction.customId === 'btn_transfer') {
            if (!hasAuth) {
                return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });
            }
            const row = new ActionRowBuilder().addComponents(
                new UserSelectMenuBuilder()
                    .setCustomId('transfer_user_select')
                    .setPlaceholder('Devredilecek yetkiliyi seçin')
                    .setMinValues(1)
                    .setMaxValues(1)
            );
            return interaction.reply({
                content: '🔀 Bileti devretmek istediğiniz **yetkiliyi** seçin:',
                components: [row],
                ephemeral: true
            });
        }

        // ── ARŞİVLE ───────────────────────────────────────────────────
        if (interaction.customId === 'btn_archive') {
            if (!hasAuth) {
                return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });
            }
            const num = ticketData.num
                ?? interaction.channel.name.replace(/\D/g, '')
                ?? '0';

            await interaction.channel.setName(`arsived-ticket-${num}`);

            await interaction.channel.permissionOverwrites.edit(interaction.guild.id, {
                ViewChannel: false,
                SendMessages: false
            });

            if (ticketData.ownerId) {
                await interaction.channel.permissionOverwrites.edit(ticketData.ownerId, {
                    ViewChannel: true,
                    SendMessages: false,
                    ReadMessageHistory: true
                }).catch(() => {});
            }

            return interaction.reply({
                content: `📁 Bilet **arsived-ticket-${num}** olarak arşivlendi ve sessize alındı.`
            });
        }

        // ── KAYDET ────────────────────────────────────────────────────
        if (interaction.customId === 'btn_save') {
            if (!hasAuth) {
                return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });
            }
            await interaction.deferReply({ ephemeral: true });

            const txt      = await buildTranscript(interaction.channel);
            const fileName = `transkript-${interaction.channel.name}.txt`;
            fs.writeFileSync(fileName, txt, 'utf-8');

            const payload = {
                content: `📄 **${interaction.channel.name}** bilet transkriti`,
                files: [{ attachment: fileName, name: fileName }]
            };

            if (guildDb.logChannel) {
                const logChan = interaction.guild.channels.cache.get(guildDb.logChannel);
                if (logChan) await logChan.send(payload).catch(() => {});
            }

            if (ticketData.ownerId) {
                const owner = await client.users.fetch(ticketData.ownerId).catch(() => null);
                if (owner) {
                    await owner.send({
                        content: `📄 **${interaction.guild.name}** — Bilet transkritin:`,
                        files: [{ attachment: fileName, name: fileName }]
                    }).catch(() => {});
                }
            }

            fs.unlinkSync(fileName);
            return interaction.editReply({ content: '✅ Transkript log kanalına ve kullanıcının DM\'ine gönderildi.' });
        }

        // ── EKLE ──────────────────────────────────────────────────────
        if (interaction.customId === 'btn_add') {
            if (!hasAuth) {
                return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });
            }
            const row = new ActionRowBuilder().addComponents(
                new UserSelectMenuBuilder()
                    .setCustomId('add_user_ticket')
                    .setPlaceholder('Eklemek istediğiniz kişileri seçin')
                    .setMinValues(1)
                    .setMaxValues(10)
            );
            return interaction.reply({
                content: '➕ Tickete eklemek istediğiniz kişileri seçin:',
                components: [row],
                ephemeral: true
            });
        }

        // ── ÇIKAR ─────────────────────────────────────────────────────
        if (interaction.customId === 'btn_remove') {
            if (!hasAuth) {
                return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });
            }

            const extras = ticketData.extras ?? [];
            if (!extras.length) {
                return interaction.reply({ content: '⚠️ Tickette çıkarılabilecek ekstra kişi yok.', ephemeral: true });
            }

            const buttons = extras.map(uid => {
                const displayName = interaction.guild.members.cache.get(uid)?.displayName ?? uid;
                return new ButtonBuilder()
                    .setCustomId(`kick_member_${uid}`)
                    .setLabel(displayName)
                    .setStyle(ButtonStyle.Danger);
            });

            const rows = [];
            for (let i = 0; i < buttons.length; i += 5) {
                rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
            }

            return interaction.reply({
                content: '➖ Ticketten çıkarmak istediğiniz kişiye tıklayın:',
                components: rows.slice(0, 5),
                ephemeral: true
            });
        }

        // ── ÇIKAR — kişiye tıklandı ───────────────────────────────────
        if (interaction.customId.startsWith('kick_member_')) {
            if (!hasAuth) {
                return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });
            }
            const memberId = interaction.customId.replace('kick_member_', '');

            await interaction.channel.permissionOverwrites.delete(memberId).catch(() => {});

            const td = getTicketData(db, interaction.guild.id, interaction.channel.id);
            td.extras = (td.extras ?? []).filter(id => id !== memberId);
            saveDb(db);

            const displayName = interaction.guild.members.cache.get(memberId)?.displayName ?? memberId;
            return interaction.update({
                content: `✅ **${displayName}** ticketten çıkarıldı.`,
                components: []
            });
        }

        // ── PUANLAMA (DM'den gelen) ────────────────────────────────────
        if (interaction.customId.startsWith('puan_')) {
            const parts   = interaction.customId.split('_');
            const puan    = parts[1];
            const guildId = parts[2];
            await interaction.update({
                content: `⭐ **${puan}/5** puanınız kaydedildi. Teşekkürler!`,
                components: []
            });
            const logId = db[guildId]?.logChannel;
            if (logId) {
                const logChan = client.channels.cache.get(logId);
                if (logChan) {
                    await logChan.send({
                        content: `⭐ **Yeni Değerlendirme**\nKullanıcı: ${interaction.user.tag}\nPuan: **${puan}/5 ⭐**`
                    }).catch(() => {});
                }
            }
            return;
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  KONTROL MENÜSÜ (Kapat / Kilitle / Kilidi Aç)
    // ═══════════════════════════════════════════════════════════
    if (interaction.isStringSelectMenu() && interaction.customId === 't_controls') {
        if (!hasAuth) {
            return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });
        }

        const val        = interaction.values[0];
        const ticketData = getTicketData(db, interaction.guild.id, interaction.channel.id);
        const ticketMsg  = await findTicketMessage(interaction.channel, client.user.id);

        // ── KAPAT ──────────────────────────────────────────────────────
        if (val === 'close') {
            await interaction.reply({ content: '⏳ Bilet **5 saniye** içinde kapatılıyor...' });

            if (ticketData.ownerId) {
                const owner = await client.users.fetch(ticketData.ownerId).catch(() => null);
                if (owner) {
                    const row = new ActionRowBuilder().addComponents(
                        [1, 2, 3, 4, 5].map(i =>
                            new ButtonBuilder()
                                .setCustomId(`puan_${i}_${interaction.guild.id}`)
                                .setLabel(`${i} ⭐`)
                                .setStyle(ButtonStyle.Primary)
                        )
                    );
                    await owner.send({
                        content: `**${interaction.guild.name}** sunucusundaki destek deneyiminizi puanlar mısınız? (1 = Kötü | 5 = Mükemmel)`,
                        components: [row]
                    }).catch(() => {});
                }
            }

            setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
            return;
        }

        // ── KİLİTLE ────────────────────────────────────────────────────
        if (val === 'lock') {
            if (!ticketData.ownerId) {
                return interaction.reply({ content: '❌ Ticket sahibi DB\'de bulunamadı.', ephemeral: true });
            }

            await interaction.channel.permissionOverwrites.edit(ticketData.ownerId, {
                SendMessages: false
            }).catch(() => {});

            if (ticketMsg) {
                const embed = EmbedBuilder.from(ticketMsg.embeds[0]);
                embed.spliceFields(1, 1, { name: '🔒 Durum', value: '🔴 Kilitli', inline: true });
                await ticketMsg.edit({ embeds: [embed] });
            }

            return interaction.reply({ content: '🔒 Bilet kilitlendi. Kullanıcı artık mesaj gönderemiyor.' });
        }

        // ── KİLİDİ AÇ ──────────────────────────────────────────────────
        if (val === 'unlock') {
            if (!ticketData.ownerId) {
                return interaction.reply({ content: '❌ Ticket sahibi DB\'de bulunamadı.', ephemeral: true });
            }

            await interaction.channel.permissionOverwrites.edit(ticketData.ownerId, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            }).catch(() => {});

            if (ticketMsg) {
                const embed = EmbedBuilder.from(ticketMsg.embeds[0]);
                embed.spliceFields(1, 1, { name: '🔒 Durum', value: '🟢 Açık', inline: true });
                await ticketMsg.edit({ embeds: [embed] });
            }

            return interaction.reply({ content: '🔓 Bilet kilidi açıldı. Kullanıcı tekrar mesaj gönderebilir.' });
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  DEVRET — Kullanıcı Seçildi
    // ═══════════════════════════════════════════════════════════
    if (interaction.isUserSelectMenu() && interaction.customId === 'transfer_user_select') {
        if (!hasAuth) {
            return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });
        }

        const targetId = interaction.values[0];

        // Tek kişi fetch — GuildMembersTimeout yok
        const targetMember = interaction.guild.members.cache.get(targetId)
            ?? await interaction.guild.members.fetch(targetId).catch(() => null);

        if (!targetMember) {
            return interaction.update({ content: '❌ Üye bulunamadı.', components: [] });
        }

        // Yetkili rolü kontrolü
        if (guildDb.staffRole) {
            const targetIsStaff = targetMember.roles.cache.has(guildDb.staffRole)
                || targetMember.permissions.has(PermissionsBitField.Flags.Administrator);
            if (!targetIsStaff) {
                return interaction.update({
                    content: `❌ **${targetMember.displayName}** yetkili rolüne sahip değil. Sadece yetkililere devredebilirsiniz.`,
                    components: []
                });
            }
        }

        const ticketMsg = await findTicketMessage(interaction.channel, client.user.id);
        if (ticketMsg) {
            const embed = EmbedBuilder.from(ticketMsg.embeds[0]);
            embed.spliceFields(6, 1, { name: '🙋 Sorumlu', value: `${targetMember}`, inline: true });
            await ticketMsg.edit({ embeds: [embed] });
        }

        await interaction.channel.send({
            content: `🔀 Bilet **${targetMember.displayName}** adlı yetkililiye devredildi.`
        });
        return interaction.update({
            content: `✅ Bilet **${targetMember.displayName}** adlı yetkililiye devredildi.`,
            components: []
        });
    }

    // ═══════════════════════════════════════════════════════════
    //  EKLE — Kullanıcı Seçildi
    // ═══════════════════════════════════════════════════════════
    if (interaction.isUserSelectMenu() && interaction.customId === 'add_user_ticket') {
        if (!hasAuth) {
            return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });
        }

        const ticketData = getTicketData(db, interaction.guild.id, interaction.channel.id);
        if (!ticketData.extras) ticketData.extras = [];

        const added = [];
        for (const userId of interaction.values) {
            if (interaction.channel.permissionOverwrites.cache.has(userId)) continue;

            await interaction.channel.permissionOverwrites.edit(userId, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            }).catch(() => {});

            if (!ticketData.extras.includes(userId)) {
                ticketData.extras.push(userId);
            }

            const m = interaction.guild.members.cache.get(userId);
            added.push(m?.displayName ?? `<@${userId}>`);
        }

        saveDb(db);

        if (!added.length) {
            return interaction.update({ content: '⚠️ Seçilen kişiler zaten tickette mevcut.', components: [] });
        }

        return interaction.update({
            content: `✅ **${added.join(', ')}** tickete eklendi.`,
            components: []
        });
    }
}
