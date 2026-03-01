const { PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: {
    name: 'ticket-settings',
    description: 'Ticket sistemi ayarlarını yapılandırır.'
  },
  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: 'Bu komutu sadece yöneticiler kullanabilir.', ephemeral: true });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('settings_log').setLabel('Log Kanalı').setStyle(ButtonStyle.Secondary).setEmoji('📁'),
      new ButtonBuilder().setCustomId('settings_role').setLabel('Yetkili Rolü').setStyle(ButtonStyle.Secondary).setEmoji('👮'),
      new ButtonBuilder().setCustomId('settings_category').setLabel('Bilet Kategorisi').setStyle(ButtonStyle.Secondary).setEmoji('📂'),
      new ButtonBuilder().setCustomId('settings_gif').setLabel('GIF/Resim').setStyle(ButtonStyle.Success).setEmoji('🖼️')
    );

    await interaction.reply({ 
      content: '🛠️ **Ticket Sistemi Yapılandırma Paneli**', 
      components: [row], 
      ephemeral: true 
    });
  }
};
        
