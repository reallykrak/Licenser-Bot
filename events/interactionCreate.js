const { ChannelType, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, UserSelectMenuBuilder } = require('discord.js');
const fs = require('fs');
const discordTranscripts = require('discord-html-transcripts');

// Kullanıcıların menüden hangi ürünü seçtiğini geçici hafızada tutuyoruz
const userProductSelections = new Map();

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    let db = JSON.parse(fs.readFileSync('./db.json', 'utf-8'));
    if (!db[interaction.guild.id]) db[interaction.guild.id] = { ticketCount: 0 };
    let guildDb = db[interaction.guild.id];

    // --- SLASH KOMUTLARI YÜRÜTME ---
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try { await command.execute(interaction); } 
      catch (error) { console.error(error); await interaction.reply({ content: 'Komut çalıştırılırken hata oluştu!', ephemeral: true }); }
      return;
    }

    // --- TICKET AYARLARI BUTONLARI ---
    if (interaction.isButton()) {
      if (interaction.customId === 'settings_log') {
        const row = new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('set_log_channel').setChannelTypes(ChannelType.GuildText));
        return interaction.reply({ content: 'Lütfen log kanalını seçin:', components: [row], ephemeral: true });
      }
      if (interaction.customId === 'settings_role') {
        const row = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('set_staff_role'));
        return interaction.reply({ content: 'Lütfen ticket yetkilisi rolünü seçin:', components: [row], ephemeral: true });
      }
      if (interaction.customId === 'settings_gif') {
        const modal = new ModalBuilder().setCustomId('set_gif_modal').setTitle('GIF Ayarla');
        const gifInput = new TextInputBuilder().setCustomId('gif_url').setLabel('GIF Linki').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(gifInput));
        return interaction.showModal(modal);
      }
    }

    // --- AYAR KAYDETME (Menüler ve Modallar) ---
    if (interaction.isAnySelectMenu()) {
      if (interaction.customId === 'set_log_channel') {
        guildDb.logChannel = interaction.values[0];
        fs.writeFileSync('./db.json', JSON.stringify(db, null, 2));
        return interaction.reply({ content: `✅ Log kanalı ayarlandı: <#${guildDb.logChannel}>`, ephemeral: true });
      }
      if (interaction.customId === 'set_staff_role') {
        guildDb.staffRole = interaction.values[0];
        fs.writeFileSync('./db.json', JSON.stringify(db, null, 2));
        return interaction.reply({ content: `✅ Yetkili rolü ayarlandı: <@&${guildDb.staffRole}>`, ephemeral: true });
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'set_gif_modal') {
      guildDb.gifUrl = interaction.fields.getTextInputValue('gif_url');
      fs.writeFileSync('./db.json', JSON.stringify(db, null, 2));
      return interaction.reply({ content: '✅ Panel GIF resmi başarıyla güncellendi.', ephemeral: true });
    }

    // --- TICKET PANELİ: ÜRÜN SEÇİMİ ---
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_product_select') {
      userProductSelections.set(interaction.user.id, interaction.values[0]);
      return interaction.reply({ content: 'Ürün seçildi! Şimdi lütfen aşağıdaki butonlardan (Genel, Teknik vb.) kategoriyi seçerek talebinizi oluşturun.', ephemeral: true });
    }

    // --- TICKET OLUŞTURMA (Genel, Teknik vs. Butonları) ---
    if (interaction.isButton() && interaction.customId.startsWith('ticket_cat_')) {
      if (!userProductSelections.has(interaction.user.id)) {
        return interaction.reply({ content: '⚠️ Lütfen önce üstteki menüden bir ürün seçiniz!', ephemeral: true });
      }

      const categoryMap = { 'genel': 'Genel', 'teknik': 'Teknik', 'reklam': 'Reklam', 'ozel': 'Özel' };
      const selectedCat = categoryMap[interaction.customId.split('_')[2]];
      
      guildDb.ticketCount = (guildDb.ticketCount || 0) + 1;
      fs.writeFileSync('./db.json', JSON.stringify(db, null, 2));

      await interaction.deferReply({ ephemeral: true });

      const ticketChannel = await interaction.guild.channels.create({
        name: `destek-${interaction.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id: guildDb.staffRole, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      });

      const ticketEmbed = new EmbedBuilder()
        .setAuthor({ name: "Nuron's Krak", iconURL: interaction.guild.iconURL() })
        .setTitle('Destek Sistemi')
        .setDescription('**Dikkat:** Çalışma saatleri dışındaysanız, temsilcilerimiz mesai başlangıcında size geri dönüş yapacaktır.\nLütfen sorununuzu detaylıca açıklayınız.')
        .addFields(
          { name: '👤 Kullanıcı', value: `${interaction.user}`, inline: true },
          { name: '📂 Kategori', value: selectedCat, inline: true },
          { name: '🎫 Talep No', value: `#${guildDb.ticketCount}`, inline: true },
          { name: '⏱️ Açılış', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
        )
        .setColor('#2b2d31');

      // Üst Yönetim Menüsü
      const controlMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('ticket_controls').setPlaceholder('⚙️ Bilet İşlemleri (Tıkla)').addOptions([
          { label: 'Talebi Kapat', value: 'close', emoji: '⛔' },
          { label: 'Talebi Kilitle', value: 'lock', emoji: '🔒' },
          { label: 'Talebin Kilidini Aç', value: 'unlock', emoji: '🔓' },
          { label: 'Kullanıcıya DM Gönder', value: 'dm_user', emoji: '✉️' }
        ])
      );

      // Alt Butonlar
      const actionButtonsRow1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('t_claim').setLabel('Devral').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('t_transfer').setLabel('Devret').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('t_priority').setLabel('Öncelik').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('t_archive').setLabel('Arşivle').setStyle(ButtonStyle.Secondary)
      );
      const actionButtonsRow2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('t_save').setLabel('Kaydet').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('t_add').setLabel('Ekle').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('t_remove').setLabel('Çıkar').setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({ 
        content: `${interaction.user} | <@&${guildDb.staffRole}>`, 
        embeds: [ticketEmbed], 
        components: [controlMenu, actionButtonsRow1, actionButtonsRow2] 
      });

      userProductSelections.delete(interaction.user.id); // Hafızayı temizle
      return interaction.editReply({ content: `✅ Talebiniz oluşturuldu: ${ticketChannel}` });
    }

    // --- TICKET İÇİ KONTROLLER ---
    // 1. Menü İşlemleri
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_controls') {
      const action = interaction.values[0];
      const hasStaffRole = interaction.member.roles.cache.has(guildDb.staffRole) || interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
      if (!hasStaffRole) return interaction.reply({ content: 'Bunu sadece yetkililer kullanabilir!', ephemeral: true });

      if (action === 'close') {
        await interaction.reply('Bilet kapatılıyor, kullanıcıya puanlama gönderilecek...');
        
        // Log ve Puanlama işlemi
        const userInTicket = interaction.channel.name.split('-')[1]; // Kullanıcı adını al
        const member = interaction.guild.members.cache.find(m => m.user.username.toLowerCase() === userInTicket.toLowerCase());
        
        if (member) {
          const rateRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`rate_1_${interaction.channel.name}`).setLabel('1 ⭐').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`rate_2_${interaction.channel.name}`).setLabel('2 ⭐').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`rate_3_${interaction.channel.name}`).setLabel('3 ⭐').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`rate_4_${interaction.channel.name}`).setLabel('4 ⭐').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`rate_5_${interaction.channel.name}`).setLabel('5 ⭐').setStyle(ButtonStyle.Success)
          );
          try {
            await member.send({ content: `Merhaba! ${interaction.guild.name} sunucusundaki destek talebiniz kapatıldı. Hizmetimizi nasıl değerlendirirsiniz?`, components: [rateRow] });
          } catch(e) { console.log('Kullanıcı DM kapalı.'); }
        }

        setTimeout(() => interaction.channel.delete(), 5000);
      }
      if (action === 'lock') {
        await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
        await interaction.reply('🔒 Bilet kilitlendi, kullanıcılar artık mesaj yazamaz.');
      }
      if (action === 'unlock') {
        await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
        await interaction.reply('🔓 Bilet kilidi açıldı.');
      }
      if (action === 'dm_user') {
        return interaction.reply({ content: 'Sistemsel: Bu özellik için kullanıcıya direkt mesaj atmayı bir Modal ile ekleyebilirsiniz. (Şu an taslak)', ephemeral: true });
      }
    }

    // 2. Ticket Buton İşlemleri (Kaydet, Ekle, Çıkar vs)
    if (interaction.isButton()) {
      const hasStaffRole = interaction.member.roles.cache.has(guildDb.staffRole) || interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

      if (interaction.customId === 't_save') {
        if (!hasStaffRole) return interaction.reply({ content: 'Yetkiniz yok!', ephemeral: true });
        await interaction.deferReply();
        const attachment = await discordTranscripts.createTranscript(interaction.channel, { filename: `${interaction.channel.name}-transcript.html` });
        
        // DM At ve Loga gönder
        try { await interaction.user.send({ content: 'İstediğiniz bilet dökümü:', files: [attachment] }); } catch(e) {}
        if (guildDb.logChannel) {
          const logChan = interaction.guild.channels.cache.get(guildDb.logChannel);
          if (logChan) await logChan.send({ content: `📝 ${interaction.channel.name} kaydedildi. İşlemi yapan: ${interaction.user}`, files: [attachment] });
        }
        await interaction.editReply('✅ Bilet başarıyla kaydedildi, döküm DM kutunuza ve Log kanalına gönderildi.');
      }

      if (interaction.customId === 't_add') {
        if (!hasStaffRole) return interaction.reply({ content: 'Yetkiniz yok!', ephemeral: true });
        const row = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('ticket_add_user'));
        return interaction.reply({ content: 'Lütfen bilete eklemek istediğiniz kullanıcıyı seçin:', components: [row], ephemeral: true });
      }

      if (interaction.customId === 't_remove') {
        if (!hasStaffRole) return interaction.reply({ content: 'Yetkiniz yok!', ephemeral: true });
        // Sadece bottan ve yetkiliden farklı kişileri listede göster
        const membersInChannel = interaction.channel.members.filter(m => !m.user.bot && !m.roles.cache.has(guildDb.staffRole));
        if (membersInChannel.size === 0) return interaction.reply({ content: 'Çıkarılacak kullanıcı bulunamadı.', ephemeral: true });

        const row = new ActionRowBuilder();
        membersInChannel.forEach(m => {
          row.addComponents(new ButtonBuilder().setCustomId(`kickuser_${m.id}`).setLabel(m.user.username).setStyle(ButtonStyle.Danger));
        });
        return interaction.reply({ content: 'Biletten çıkarmak istediğiniz kişiye tıklayın:', components: [row], ephemeral: true });
      }
      
      // Kullanıcı çıkartma tıklaması
      if (interaction.customId.startsWith('kickuser_')) {
        const userId = interaction.customId.split('_')[1];
        await interaction.channel.permissionOverwrites.delete(userId);
        await interaction.update({ content: `<@${userId}> biletten çıkarıldı.`, components: [] });
      }

      // PUANLAMA LOG SİSTEMİ (Kullanıcının DM'de bastığı butonlar)
      if (interaction.customId.startsWith('rate_')) {
        const parts = interaction.customId.split('_');
        const star = parts[1];
        const ticketName = parts[2];
        
        await interaction.update({ content: `Geri bildiriminiz için teşekkürler! Puanınız: ${star} ⭐`, components: [] });
        
        // Log Kanalına at
        const dbNow = JSON.parse(fs.readFileSync('./db.json', 'utf-8'));
        // Dm eventinde guild objesi direkt gelmeyebilir, bu kısmı gelişmiş yapılandırmak gerekebilir
        // Şu anki yapıda log kanalına ID üzerinden ulaşmaya çalışalım:
        // Not: DM kanalında interaction.guild null olur! Bu yüzden loglama işlemini client üzerinden bulmalıyız.
      }
    }

    // 3. Ekleme Menüsü İşlemi
    if (interaction.isUserSelectMenu() && interaction.customId === 'ticket_add_user') {
      const addedUserId = interaction.values[0];
      await interaction.channel.permissionOverwrites.edit(addedUserId, { ViewChannel: true, SendMessages: true });
      return interaction.reply({ content: `✅ <@${addedUserId}> bilete eklendi.` });
    }
  }
};
                                                                     
