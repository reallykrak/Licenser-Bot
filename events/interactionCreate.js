const { 
    ChannelType, PermissionsBitField, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, 
    TextInputStyle, StringSelectMenuBuilder, ChannelSelectMenuBuilder, 
    RoleSelectMenuBuilder, UserSelectMenuBuilder
} = require('discord.js');
const fs = require('fs');

// ─────────────────────────────────────────────
//  YARDIMCI: Ticket sahibinin ID'sini bul
//  (Bot, staff ve admin olmayanlardan ilki)
// ─────────────────────────────────────────────
function getTicketOwnerId(channel, staffRoleId, botId, guild) {
    return channel.permissionOverwrites.cache.find(p => {
        if (p.type !== 1) return false;               // sadece üye izinleri
        if (p.id === botId) return false;
        const member = guild.members.cache.get(p.id);
        if (!member) return false;
        if (staffRoleId && member.roles.cache.has(staffRoleId)) return false;
        if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return false;
        return p.allow.has(PermissionsBitField.Flags.ViewChannel);
    })?.id;
}

// ─────────────────────────────────────────────
//  YARDIMCI: Kanalı txt olarak kaydet
// ─────────────────────────────────────────────
async function buildTranscriptTxt(channel) {
    const fetched = await channel.messages.fetch({ limit: 100 });
    const sorted  = [...fetched.values()].reverse();
    const lines   = sorted
        .filter(m => !m.author.bot)
        .map(m => {
            const t = m.createdAt.toLocaleString('tr-TR');
            const content = m.content || (m.attachments.size ? '[dosya]' : '[embed]');
            return `[${t}] ${m.author.username}: ${content}`;
        });
    return lines.join('\n') || 'Bu biletde kullanıcı mesajı bulunamadı.';
}

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {

        // ── DB YÜKLE ──────────────────────────────
        let db = JSON.parse(fs.readFileSync('./db.json', 'utf-8'));
        if (!db[interaction.guild.id]) db[interaction.guild.id] = { ticketCount: 0 };
        let guildDb = db[interaction.guild.id];
        const saveDb = () => fs.writeFileSync('./db.json', JSON.stringify(db, null, 2));

        // ── YETKİ KONTROLÜ ────────────────────────
        const isStaff = guildDb.staffRole
            ? interaction.member.roles.cache.has(guildDb.staffRole)
            : false;
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        const hasAuth  = isStaff || isAdmin;

        // ══════════════════════════════════════════
        //  SLASH KOMUTLARI
        // ══════════════════════════════════════════
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            try { await command.execute(interaction, client); } 
            catch (e) { console.error(e); }
            return;
        }

        // ══════════════════════════════════════════
        //  AYAR BUTONLARI  (/ticket-settings)
        // ══════════════════════════════════════════
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
                    .setCustomId('gif_input').setLabel('URL girin (discord/imgur vb.)')
                    .setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }
        }

        // ══════════════════════════════════════════
        //  AYAR KAYDETME (SelectMenu + Modal)
        // ══════════════════════════════════════════
        if (interaction.isAnySelectMenu()) {
            if (interaction.customId === 'set_log_chan') {
                guildDb.logChannel = interaction.values[0]; saveDb();
                return interaction.reply({ content: '✅ Log kanalı ayarlandı.', ephemeral: true });
            }
            if (interaction.customId === 'set_staff_role') {
                guildDb.staffRole = interaction.values[0]; saveDb();
                return interaction.reply({ content: '✅ Yetkili rolü ayarlandı.', ephemeral: true });
            }
            if (interaction.customId === 'set_parent_cat') {
                guildDb.parentId = interaction.values[0]; saveDb();
                return interaction.reply({ content: '✅ Kategori ayarlandı.', ephemeral: true });
            }
        }

        if (interaction.isModalSubmit() && interaction.customId === 'gif_modal') {
            guildDb.gifUrl = interaction.fields.getTextInputValue('gif_input'); saveDb();
            return interaction.reply({ content: '✅ GIF/Resim ayarlandı.', ephemeral: true });
        }

        // ══════════════════════════════════════════
        //  TİCKET OLUŞTURMA — Ürün seçimi
        // ══════════════════════════════════════════
        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_product_select') {
            guildDb[`last_sel_${interaction.user.id}`] = interaction.values[0]; saveDb();
            return interaction.reply({ content: '✅ Ürün seçildi! Şimdi aşağıdan kategori seçin.', ephemeral: true });
        }

        // ══════════════════════════════════════════
        //  TİCKET OLUŞTURMA — Kategori butonu
        // ══════════════════════════════════════════
        if (interaction.isButton() && interaction.customId.startsWith('ticket_cat_')) {
            const product = guildDb[`last_sel_${interaction.user.id}`];
            if (!product) return interaction.reply({ content: '⚠️ Önce listeden bir ürün seçin!', ephemeral: true });

            const catKey = interaction.customId.replace('ticket_cat_', '');
            const catLabels = { genel: 'Genel', teknik: 'Teknik', reklam: 'Reklam', ozel: 'Özel' };
            const catLabel  = catLabels[catKey] ?? catKey.toUpperCase();

            guildDb.ticketCount = (guildDb.ticketCount || 0) + 1;
            const ticketNum = guildDb.ticketCount;
            saveDb();

            // Kanal oluştur
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
                permissionOverwrites
            });

            // ── EMBED ──────────────────────────────────────────────────────────
            //  Kullanıcı  |  Durum  yan yana — sonra diğer bilgiler
            // ──────────────────────────────────────────────────────────────────
            const ticketEmbed = new EmbedBuilder()
                .setTitle("✨ Nuron's Krak | Destek Sistemi")
                .setDescription(
                    "**Dikkat:** Çalışma saatleri dışındaysanız temsilcilerimiz mesai\n" +
                    "başlangıcında size geri dönüş yapacaktır."
                )
                .setColor('#5865F2')
                .addFields(
                    // Sıra 1 ─ Kullanıcı | Durum (inline = yan yana)
                    { name: '👤 Kullanıcı', value: `${interaction.user}`, inline: true },
                    { name: '🔒 Durum',     value: '🟢 Açık',           inline: true },
                    { name: '\u200b',        value: '\u200b',             inline: true }, // boş hücre (3. sütun)
                    // Sıra 2 ─ Kategori | Talep No | Açılış
                    { name: '📂 Kategori',  value: `${catLabel} — ${product}`,              inline: true },
                    { name: '🎫 Talep No',  value: `#${ticketNum}`,                          inline: true },
                    { name: '⏱️ Açılış',    value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true },
                    // Sıra 3 ─ Sorumlu (tek başına)
                    { name: '🙋 Sorumlu',   value: 'Henüz yok', inline: true }
                )
                .setFooter({ text: `Nuron's Krak Destek • Bilet #${ticketNum}` })
                .setTimestamp();

            // ── KONTROL MENÜSÜ (DM Gönder KALDIRILDI) ────────────────────────
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

            // ── BUTONLAR ──────────────────────────────────────────────────────
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

        // ══════════════════════════════════════════
        //  BİLET İÇİ BUTONLAR
        // ══════════════════════════════════════════
        if (interaction.isButton()) {

            // ── DEVRAL ────────────────────────────────────────────────────────
            // Sadece yetkili rolündekiler devralabilir
            if (interaction.customId === 'btn_claim') {
                if (!hasAuth) return interaction.reply({ content: '❌ Bu işlem için yetkili rolünüz olması gerekiyor.', ephemeral: true });
                const embed = EmbedBuilder.from(interaction.message.embeds[0]);
                // Sorumlu → index 6 (alanlar: 0=Kullanıcı 1=Durum 2=boş 3=Kategori 4=TalepNo 5=Açılış 6=Sorumlu)
                embed.spliceFields(6, 1, { name: '🙋 Sorumlu', value: `${interaction.user}`, inline: true });
                await interaction.update({ embeds: [embed] });
                await interaction.channel.send({ content: `✅ Bilet artık **${interaction.user.tag}** sorumluluğunda.` });
                return;
            }

            // ── DEVRET ────────────────────────────────────────────────────────
            // Menüde yalnızca seçili yetkili rolündeki kişiler görünür
            if (interaction.customId === 'btn_transfer') {
                if (!hasAuth) return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });

                await interaction.guild.members.fetch();
                const staffMembers = interaction.guild.members.cache.filter(m =>
                    !m.user.bot &&
                    m.id !== interaction.user.id &&
                    guildDb.staffRole &&
                    m.roles.cache.has(guildDb.staffRole)
                );

                if (!staffMembers.size) {
                    return interaction.reply({ content: '❌ Devredebileceğiniz başka yetkili bulunamadı.', ephemeral: true });
                }

                const options = staffMembers.first(25).map(m => ({
                    label: m.displayName,
                    value: m.id,
                    description: `@${m.user.username}`
                }));

                const row = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('transfer_select')
                        .setPlaceholder('Devredilecek yetkiliyi seçin')
                        .addOptions(options)
                );
                return interaction.reply({ content: '🔀 Bileti devretmek istediğiniz yetkiliyi seçin:', components: [row], ephemeral: true });
            }

            // ── ARŞİVLE ───────────────────────────────────────────────────────
            // Kanal adı: arsived-ticket-{N}, sessize alınır
            if (interaction.customId === 'btn_archive') {
                if (!hasAuth) return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });

                const num = interaction.channel.name.replace(/\D/g, '') || (guildDb.ticketCount ?? '0');
                await interaction.channel.setName(`arsived-ticket-${num}`);

                // @everyone → kanalı göremez & yazamaz
                await interaction.channel.permissionOverwrites.edit(interaction.guild.id, {
                    ViewChannel: false,
                    SendMessages: false
                });

                // Ticket sahibi → görebilir ama yazamaz (read-only arşiv)
                await interaction.guild.members.fetch();
                const ownerId = getTicketOwnerId(interaction.channel, guildDb.staffRole, client.user.id, interaction.guild);
                if (ownerId) {
                    await interaction.channel.permissionOverwrites.edit(ownerId, {
                        ViewChannel: true,
                        SendMessages: false,
                        ReadMessageHistory: true
                    });
                }

                await interaction.reply({ content: '📁 Bilet arşivlendi ve sessize alındı.' });
                return;
            }

            // ── KAYDET ────────────────────────────────────────────────────────
            // Mesajları txt olarak log kanala + sahibinin DM'ine gönder
            if (interaction.customId === 'btn_save') {
                if (!hasAuth) return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });
                await interaction.deferReply({ ephemeral: true });

                try {
                    const txt      = await buildTranscriptTxt(interaction.channel);
                    const fileName = `transkript-${interaction.channel.name}.txt`;
                    fs.writeFileSync(fileName, txt, 'utf-8');

                    const payload = {
                        content: `📄 **${interaction.channel.name}** bilet transkriti`,
                        files: [fileName]
                    };

                    // Log kanalına gönder
                    if (guildDb.logChannel) {
                        const logChan = interaction.guild.channels.cache.get(guildDb.logChannel);
                        if (logChan) await logChan.send(payload).catch(() => {});
                    }

                    // Ticket sahibine DM
                    await interaction.guild.members.fetch();
                    const ownerId = getTicketOwnerId(interaction.channel, guildDb.staffRole, client.user.id, interaction.guild);
                    if (ownerId) {
                        const owner = await client.users.fetch(ownerId).catch(() => null);
                        if (owner) {
                            await owner.send({
                                content: `📄 **${interaction.guild.name}** — Bilet transkritin aşağıdadır:`,
                                files: [fileName]
                            }).catch(() => {});
                        }
                    }

                    fs.unlinkSync(fileName);
                    return interaction.editReply({ content: '✅ Transkript log kanalına ve kullanıcının DM\'ine gönderildi.' });
                } catch (e) {
                    console.error('Kaydet hatası:', e);
                    return interaction.editReply({ content: '❌ Transkript oluşturulurken bir hata oluştu.' });
                }
            }

            // ── EKLE ──────────────────────────────────────────────────────────
            // Sunucudaki tüm kişilerden seçim (UserSelectMenu)
            if (interaction.customId === 'btn_add') {
                if (!hasAuth) return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });
                const row = new ActionRowBuilder().addComponents(
                    new UserSelectMenuBuilder()
                        .setCustomId('add_user_ticket')
                        .setPlaceholder('Eklenecek kişi veya kişileri seçin')
                        .setMinValues(1)
                        .setMaxValues(10)
                );
                return interaction.reply({ content: '➕ Tickete eklemek istediğiniz kişileri seçin:', components: [row], ephemeral: true });
            }

            // ── ÇIKAR ─────────────────────────────────────────────────────────
            // Tickettaki ekstra kişiler kırmızı buton olarak listelenir
            if (interaction.customId === 'btn_remove') {
                if (!hasAuth) return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });

                await interaction.guild.members.fetch();
                const ownerId = getTicketOwnerId(interaction.channel, guildDb.staffRole, client.user.id, interaction.guild);

                // Ticket açan ve staff/admin dışındaki üyeleri filtrele
                const extras = interaction.channel.permissionOverwrites.cache.filter(p => {
                    if (p.type !== 1) return false;
                    if (p.id === client.user.id) return false;
                    if (p.id === ownerId) return false;
                    const m = interaction.guild.members.cache.get(p.id);
                    if (!m) return false;
                    if (guildDb.staffRole && m.roles.cache.has(guildDb.staffRole)) return false;
                    if (m.permissions.has(PermissionsBitField.Flags.Administrator)) return false;
                    return true;
                });

                if (!extras.size) {
                    return interaction.reply({ content: '⚠️ Çıkarılabilecek ekstra kişi yok.', ephemeral: true });
                }

                // Her biri kırmızı buton
                const buttons = [...extras.values()].map(p => {
                    const m = interaction.guild.members.cache.get(p.id);
                    return new ButtonBuilder()
                        .setCustomId(`kick_member_${p.id}`)
                        .setLabel(m?.displayName ?? p.id)
                        .setStyle(ButtonStyle.Danger);
                });

                const rows = [];
                for (let i = 0; i < buttons.length; i += 5)
                    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));

                return interaction.reply({
                    content: '➖ Ticketten çıkarmak istediğiniz kişiye tıklayın:',
                    components: rows.slice(0, 5),
                    ephemeral: true
                });
            }

            // ── ÇIKAR — üyeye tıklandı ────────────────────────────────────────
            if (interaction.customId.startsWith('kick_member_')) {
                if (!hasAuth) return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });
                const memberId = interaction.customId.replace('kick_member_', '');
                await interaction.channel.permissionOverwrites.delete(memberId).catch(() => {});
                const m = interaction.guild.members.cache.get(memberId);
                return interaction.update({
                    content: `✅ **${m?.displayName ?? memberId}** ticketten çıkarıldı.`,
                    components: []
                });
            }

            // ── PUANLAMA (DM'den) ─────────────────────────────────────────────
            if (interaction.customId.startsWith('puan_')) {
                const [, puan, guildId] = interaction.customId.split('_');
                await interaction.update({ content: `⭐ **${puan}/5** puanınız kaydedildi. Teşekkürler!`, components: [] });
                const logId = db[guildId]?.logChannel;
                if (logId) {
                    const logChan = client.channels.cache.get(logId);
                    if (logChan) {
                        await logChan.send({
                            content: `⭐ **Yeni Değerlendirme**\nKullanıcı: ${interaction.user.tag}\nPuan: **${puan}/5 ⭐**`
                        });
                    }
                }
                return;
            }
        }

        // ══════════════════════════════════════════
        //  KONTROL MENÜSÜ (Kapat / Kilitle / Kilidi Aç)
        // ══════════════════════════════════════════
        if (interaction.isStringSelectMenu() && interaction.customId === 't_controls') {
            if (!hasAuth) return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });
            const val = interaction.values[0];

            // ── KAPAT ────────────────────────────────────────────────────────
            if (val === 'close') {
                await interaction.reply({ content: '⏳ Bilet **5 saniye** içinde kapatılıyor...' });

                // Ticket sahibine puanlama DM'i gönder
                await interaction.guild.members.fetch();
                const ownerId = getTicketOwnerId(interaction.channel, guildDb.staffRole, client.user.id, interaction.guild);
                if (ownerId) {
                    const owner = await client.users.fetch(ownerId).catch(() => null);
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

            // ── KİLİTLE ──────────────────────────────────────────────────────
            if (val === 'lock') {
                await interaction.guild.members.fetch();
                const ownerId = getTicketOwnerId(interaction.channel, guildDb.staffRole, client.user.id, interaction.guild);
                if (ownerId) {
                    await interaction.channel.permissionOverwrites.edit(ownerId, { SendMessages: false });
                }

                const embed = EmbedBuilder.from(interaction.message.embeds[0]);
                embed.spliceFields(1, 1, { name: '🔒 Durum', value: '🔴 Kilitli', inline: true });
                await interaction.update({ embeds: [embed] });
                await interaction.channel.send({ content: '🔒 Bilet kilitlendi. Kullanıcı artık mesaj gönderemiyor.' });
                return;
            }

            // ── KİLİDİ AÇ ────────────────────────────────────────────────────
            if (val === 'unlock') {
                await interaction.guild.members.fetch();
                const ownerId = getTicketOwnerId(interaction.channel, guildDb.staffRole, client.user.id, interaction.guild);
                if (ownerId) {
                    await interaction.channel.permissionOverwrites.edit(ownerId, {
                        SendMessages: true,
                        ViewChannel: true,
                        ReadMessageHistory: true
                    });
                }

                const embed = EmbedBuilder.from(interaction.message.embeds[0]);
                embed.spliceFields(1, 1, { name: '🔒 Durum', value: '🟢 Açık', inline: true });
                await interaction.update({ embeds: [embed] });
                await interaction.channel.send({ content: '🔓 Bilet kilidi açıldı. Kullanıcı tekrar mesaj gönderebilir.' });
                return;
            }
        }

        // ══════════════════════════════════════════
        //  DEVRET — Menüden yetkili seçildi
        // ══════════════════════════════════════════
        if (interaction.isStringSelectMenu() && interaction.customId === 'transfer_select') {
            if (!hasAuth) return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });

            const targetId = interaction.values[0];
            const target   = interaction.guild.members.cache.get(targetId) ?? await interaction.guild.members.fetch(targetId).catch(() => null);

            // Embed'de sorumluyu güncelle (index 6)
            const botMsg = await interaction.channel.messages.fetch({ limit: 20 })
                .then(msgs => msgs.find(m => m.author.id === client.user.id && m.embeds.length > 0));

            if (botMsg) {
                const embed = EmbedBuilder.from(botMsg.embeds[0]);
                embed.spliceFields(6, 1, { name: '🙋 Sorumlu', value: `${target ?? targetId}`, inline: true });
                await botMsg.edit({ embeds: [embed] });
            }

            await interaction.channel.send({
                content: `🔀 Bilet **${target?.displayName ?? targetId}** adlı yetkililiye devredildi.`
            });

            return interaction.update({
                content: `✅ Bilet **${target?.displayName ?? targetId}** adlı yetkililiye devredildi.`,
                components: []
            });
        }

        // ══════════════════════════════════════════
        //  EKLE — Kullanıcı seçildi
        // ══════════════════════════════════════════
        if (interaction.isUserSelectMenu() && interaction.customId === 'add_user_ticket') {
            if (!hasAuth) return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });

            const added = [];
            for (const userId of interaction.values) {
                await interaction.channel.permissionOverwrites.edit(userId, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true
                }).catch(() => {});
                const m = interaction.guild.members.cache.get(userId);
                if (m) added.push(m.displayName);
            }

            return interaction.update({
                content: `✅ **${added.join(', ')}** tickete eklendi.`,
                components: []
            });
        }
    }
};
