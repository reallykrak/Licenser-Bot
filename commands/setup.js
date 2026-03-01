const { PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');

module.exports = {
  data: {
    name: 'setup',
    description: 'Ticket oluşturma panelini bu kanala kurar.'
  },
  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: 'Yetkiniz yok!', ephemeral: true });
    }

    const db = JSON.parse(fs.readFileSync('./db.json', 'utf-8'));
    const guildSettings = db[interaction.guild.id];

    if (!guildSettings || !guildSettings.logChannel || !guildSettings.staffRole) {
      return interaction.reply({ content: '⚠️ Lütfen önce `/ticket-settings` komutunu kullanarak Log kanalı ve Yetkili rolünü ayarlayın!', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle("Nuron's Krak | Destek")
      .setDescription("Ürünlerimiz, hizmetlerimiz ve servislerimiz hakkında bilgi edinmek, destek talep etmek vb. işlemler için aşağıdaki menüden seçtiğiniz uygun kategori ile destek talebi oluşturabilirsiniz.\n\n«Not: Belirlenen saatler dışında destek talebine bakılmamaktadır.\nSohbetten **Destek talebine bakar mısınız?** gibi taleplerde bulunmanız süreci hızlandırmaz.»\n\n📅 **Çalışma Saatleri**\n• Hafta İçi: 08.00 – 22.00\n• Hafta Sonu: 08.00 – 22.00")
      .setColor('#2b2d31');

    if (guildSettings.gifUrl) embed.setImage(guildSettings.gifUrl);

    // Ürün Seçimi Menüsü
    const menuRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticket_product_select')
        .setPlaceholder('Lütfen destek almak istediğiniz ürünü seçin')
        .addOptions([
          { label: 'OGPS Bot', value: 'ogps_bot', emoji: '🤖' },
          { label: "Nuron's Krak dll", value: 'nuron_dll', emoji: '⚙️' },
          { label: 'Growtopia Bot', value: 'gt_bot', emoji: '🌱' }
        ])
    );

    // Kategori Butonları
    const buttonsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_cat_genel').setLabel('Genel').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticket_cat_teknik').setLabel('Teknik').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticket_cat_reklam').setLabel('Reklam').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticket_cat_ozel').setLabel('Özel').setStyle(ButtonStyle.Secondary)
    );

    await interaction.channel.send({ embeds: [embed], components: [menuRow, buttonsRow] });
    await interaction.reply({ content: '✅ Ticket paneli başarıyla kuruldu!', ephemeral: true });
  }
};
                      
