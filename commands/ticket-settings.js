const { PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: {
    name: 'ticket-settings',
    description: 'Ticket sistemi log, rol ve gif ayarlarını yapılandırır.'
  },
  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: 'Bu komutu sadece yöneticiler kullanabilir.', ephemeral: true });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('settings_log').setLabel('Log Kanalı Seç').setStyle(ButtonStyle.Primary).setEmoji('📁'),
      new ButtonBuilder().setCustomId('settings_role').setLabel('Yetkili Rolü Seç').setStyle(ButtonStyle.Primary).setEmoji('👮'),
      new ButtonBuilder().setCustomId('settings_gif').setLabel('GIF Ekle').setStyle(ButtonStyle.Success).setEmoji('🖼️')
    );

    await interaction.reply({ 
      content: '🛠️ **Ticket Sistemi Ayarları**\nAşağıdaki butonları kullanarak sistemi yapılandırın:', 
      components: [row], 
      ephemeral: true 
    });
  }
};
