const { 
    ChannelType, PermissionsBitField, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, 
    TextInputStyle, StringSelectMenuBuilder, ChannelSelectMenuBuilder, 
    RoleSelectMenuBuilder, UserSelectMenuBuilder 
} = require('discord.js');
const fs = require('fs');
const discordTranscripts = require('discord-html-transcripts');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        let db = JSON.parse(fs.readFileSync('./db.json', 'utf-8'));
        if (!db[interaction.guild.id]) db[interaction.guild.id] = { ticketCount: 0 };
        let guildDb = db[interaction.guild.id];

        // --- SLASH KOMUTLARI ---
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            try { await command.execute(interaction); } catch (e) { console.error(e); }
            return;
        }

        // --- AYAR BUTONLARI VE MENÜLERİ ---
        if (interaction.isButton()) {
            if (interaction.customId === 'settings_log') {
                const row = new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('set_log_chan').setChannelTypes(ChannelType.GuildText));
                return interaction.reply({ content: 'Log kanalı seçin:', components: [row], ephemeral: true });
            }
            if (interaction.customId === 'settings_role') {
                const row = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('set_staff_role'));
                return interaction.reply({ content: 'Yetkili rolü seçin:', components: [row], ephemeral: true });
            }
            if (interaction.customId === 'settings_category') {
                const row = new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('set_parent_cat').setChannelTypes(ChannelType.GuildCategory));
                return interaction.reply({ content: 'Biletlerin açılacağı kategoriyi seçin:', components: [row], ephemeral: true });
            }
            if (interaction.customId === 'settings_gif') {
                const modal = new ModalBuilder().setCustomId('gif_modal').setTitle('GIF Linki Girin');
                const input = new TextInputBuilder().setCustomId('gif_input').setLabel('URL (discordapp/imgur vb.)').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }
        }

        // --- AYARLARI KAYDETME ---
        if (interaction.isAnySelectMenu()) {
            if (interaction.customId === 'set_log_chan') guildDb.logChannel = interaction.values[0];
            if (interaction.customId === 'set_staff_role') guildDb.staffRole = interaction.values[0];
            if (interaction.customId === 'set_parent_cat') guildDb.parentId = interaction.values[0];
            fs.writeFileSync('./db.json', JSON.stringify(db, null, 2));
            if (['set_log_chan', 'set_staff_role', 'set_parent_cat'].includes(interaction.customId)) {
                return interaction.reply({ content: '✅ Ayar başarıyla kaydedildi.', ephemeral: true });
            }
        }
        if (interaction.isModalSubmit() && interaction.customId === 'gif_modal') {
            guildDb.gifUrl = interaction.fields.getTextInputValue('gif_input');
            fs.writeFileSync('./db.json', JSON.stringify(db, null, 2));
            return interaction.reply({ content: '✅ GIF/Resim başarıyla ayarlandı.', ephemeral: true });
        }

        // --- TICKET OLUŞTURMA SİSTEMİ ---
        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_product_select') {
            // Seçimi geçici olarak db'ye yazalım (veya map kullanabilirsin)
            guildDb[`last_select_${interaction.user.id}`] = interaction.values[0];
            fs.writeFileSync('./db.json', JSON.stringify(db, null, 2));
            return interaction.reply({ content: '✅ Ürün seçildi! Şimdi aşağıdaki butonlardan bir kategori seçin.', ephemeral: true });
        }

        if (interaction.isButton() && interaction.customId.startsWith('ticket_cat_')) {
            const product = guildDb[`last_select_${interaction.user.id}`];
            if (!product) return interaction.reply({ content: '⚠️ Lütfen önce listeden bir ürün seçin!', ephemeral: true });
            
            const catName = interaction.customId.split('_')[2].toUpperCase();
            guildDb.ticketCount++;
            fs.writeFileSync('./db.json', JSON.stringify(db, null, 2));

            const ticketChannel = await interaction.guild.channels.create({
                name: `ticket-${guildDb.ticketCount}`,
                type: ChannelType.GuildText,
                parent: guildDb.parentId || null,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                    { id: guildDb.staffRole, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
                ]
            });

            const ticketEmbed = new EmbedBuilder()
                .setTitle("Nuron's Krak | Destek Sistemi")
                .setDescription("**Dikkat:** Çalışma saatleri dışındaysanız, temsilcilerimiz mesai başlangıcında size geri dönüş yapacaktır.")
                .setColor('#000000') // Siyah Embed
                .addFields(
                    { name: '👤 Kullanıcı', value: `${interaction.user}`, inline: true },
                    { name: '📂 Kategori', value: `${catName} (${product})`, inline: true },
                    { name: '🎫 Talep No', value: `#${guildDb.ticketCount}`, inline: true },
                    { name: '🔒 Durum', value: `Açık`, inline: true },
                    { name: '⏱️ Açılış', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true },
                    { name: '🙋‍♂️ Sorumlu', value: `Henüz yok`, inline: true }
                );

            const rowMenu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId('t_controls').setPlaceholder('Bilet İşlemleri').addOptions([
                    { label: 'Kapat', value: 'close', emoji: '⛔' },
                    { label: 'Kilitle', value: 'lock', emoji: '🔒' },
                    { label: 'Kilidi Aç', value: 'unlock', emoji: '🔓' },
                    { label: 'DM Gönder', value: 'dm' }
                ])
            );

            const rowBtns1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_claim').setLabel('Devral').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('btn_transfer').setLabel('Devret').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('btn_archive').setLabel('Arşivle').setStyle(ButtonStyle.Secondary)
            );
            
            const rowBtns2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_save').setLabel('Kaydet').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('btn_add').setLabel('Ekle').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('btn_remove').setLabel('Çıkar').setStyle(ButtonStyle.Danger)
            );

            await ticketChannel.send({ content: `${interaction.user} Hoş geldin!`, embeds: [ticketEmbed], components: [rowMenu, rowBtns1, rowBtns2] });
            return interaction.reply({ content: `Biletiniz açıldı: ${ticketChannel}`, ephemeral: true });
        }

        // --- BİLET İÇİ BUTON FONKSİYONLARI ---
        const isStaff = interaction.member.roles.cache.has(guildDb.staffRole) || interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

        if (interaction.isButton()) {
            // Devral
            if (interaction.customId === 'btn_claim') {
                if (!isStaff) return interaction.reply({ content: 'Yetkiniz yok!', ephemeral: true });
                const embed = EmbedBuilder.from(interaction.message.embeds[0]);
                embed.spliceFields(5, 1, { name: '🙋‍♂️ Sorumlu', value: `${interaction.user}`, inline: true });
                await interaction.update({ embeds: [embed] });
                return interaction.followUp({ content: `✅ Bu bilet artık **${interaction.user.tag}** sorumluluğunda.` });
            }

            // Devret
            if (interaction.customId === 'btn_transfer') {
                if (!isStaff) return interaction.reply({ content: 'Yetkiniz yok!', ephemeral: true });
                const row = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('transfer_user'));
                return interaction.reply({ content: 'Bileti devretmek istediğiniz yetkiliyi seçin:', components: [row], ephemeral: true });
            }

            // Arşivle (Kanalı gizler ve ismi değiştirir)
            if (interaction.customId === 'btn_archive') {
                if (!isStaff) return interaction.reply({ content: 'Yetkiniz yok!', ephemeral: true });
                await interaction.channel.setName(`arsiv-${interaction.channel.name}`);
                await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
                return interaction.reply('📁 Bilet arşivlendi.');
            }

            // Puanlama Butonları (DM'den gelen)
            if (interaction.customId.startsWith('puan_')) {
                const [_, puan, guildId] = interaction.customId.split('_');
                await interaction.update({ content: `Puanınız (${puan} ⭐) kaydedildi. Teşekkürler!`, components: [] });
                
                const logId = db[guildId]?.logChannel;
                if (logId) {
                    const logChan = client.channels.cache.get(logId);
                    if (logChan) logChan.send({ content: `⭐ **Yeni Puanlama**\nKullanıcı: ${interaction.user.tag}\nPuan: ${puan}/5` });
                }
            }
        }

        // --- MENÜ İŞLEMLERİ (Kapat/Kilitle/DM) ---
        if (interaction.isStringSelectMenu() && interaction.customId === 't_controls') {
            if (!isStaff) return interaction.reply({ content: 'Yetkiniz yok!', ephemeral: true });
            const val = interaction.values[0];

            if (val === 'close') {
                await interaction.reply('Bilet 5 saniye içinde kapatılıyor...');
                // Puanlama Gönder
                const ticketOwnerId = interaction.channel.permissionOverwrites.cache.find(p => p.type === 1 && p.id !== client.user.id && !interaction.guild.members.cache.get(p.id)?.roles.cache.has(guildDb.staffRole))?.id;
                if (ticketOwnerId) {
                    const owner = await client.users.fetch(ticketOwnerId).catch(() => null);
                    if (owner) {
                        const row = new ActionRowBuilder().addComponents(
                            [1, 2, 3, 4, 5].map(i => new ButtonBuilder().setCustomId(`puan_${i}_${interaction.guild.id}`).setLabel(`${i} ⭐`).setStyle(ButtonStyle.Primary))
                        );
                        await owner.send({ content: `**${interaction.guild.name}** sunucusundaki desteğimizi puanlar mısınız?`, components: [row] }).catch(() => {});
                    }
                }
                setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
            }

            if (val === 'lock') {
                await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: false });
                const embed = EmbedBuilder.from(interaction.message.embeds[0]);
                embed.spliceFields(3, 1, { name: '🔒 Durum', value: `Kilitli`, inline: true });
                await interaction.update({ embeds: [embed] });
            }

            if (val === 'dm') {
                const modal = new ModalBuilder().setCustomId('dm_modal').setTitle('Kullanıcıya Mesaj Gönder');
                const msg = new TextInputBuilder().setCustomId('dm_input').setLabel('Mesajınız').setStyle(TextInputStyle.Paragraph).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(msg));
                return interaction.showModal(modal);
            }
        }
    }
};
              
