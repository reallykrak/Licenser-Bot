const { PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: {
        name: 'welcome-settings',
        description: 'Configure the welcome system and auto-role.'
    },
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ 
                content: '❌ You need Administrator permission to use this command.', 
                ephemeral: true 
            });
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('welcome_channel_btn')
                .setLabel('Welcome Channel')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📢'),
            new ButtonBuilder()
                .setCustomId('welcome_role_btn')
                .setLabel('Member Role')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('👤'),
            new ButtonBuilder()
                .setCustomId('welcome_gif_btn')
                .setLabel('Set GIF')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🖼️')
        );

        await interaction.reply({ 
            content: '⚙️ **Welcome System Configuration Panel**\nPlease use the buttons below to set up your system.', 
            components: [row], 
            ephemeral: true 
        });
    }
};
              
