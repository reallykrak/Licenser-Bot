const { 
    Events, 
    ActionRowBuilder, 
    RoleSelectMenuBuilder, 
    ChannelSelectMenuBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ChannelType 
} = require('discord.js');
const fs = require('fs');

const dbPath = './db.json';

// Veritabanına kaydetme fonksiyonu
function saveToDB(guildId, key, value) {
    let db = {};
    if (fs.existsSync(dbPath)) {
        db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    }
    if (!db[guildId]) db[guildId] = {};
    db[guildId][key] = value;
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 4));
}

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // 1. BUTONLARI YAKALAMA
        if (interaction.isButton()) {
            if (interaction.customId === 'welcome_channel_btn') {
                const channelMenu = new ActionRowBuilder().addComponents(
                    new ChannelSelectMenuBuilder()
                        .setCustomId('welcome_channel_select')
                        .setPlaceholder('Select the welcome channel...')
                        .addChannelTypes(ChannelType.GuildText)
                );
                return interaction.reply({ content: '📢 **Select a channel:**', components: [channelMenu], ephemeral: true });
            }

            if (interaction.customId === 'welcome_role_btn') {
                const roleMenu = new ActionRowBuilder().addComponents(
                    new RoleSelectMenuBuilder()
                        .setCustomId('welcome_role_select')
                        .setPlaceholder('Select the auto-role for new members...')
                );
                return interaction.reply({ content: '👤 **Select a role:**', components: [roleMenu], ephemeral: true });
            }

            if (interaction.customId === 'welcome_gif_btn') {
                const modal = new ModalBuilder()
                    .setCustomId('welcome_gif_modal')
                    .setTitle('Welcome GIF Settings');

                const gifInput = new TextInputBuilder()
                    .setCustomId('gif_url_input')
                    .setLabel("Paste the GIF or Image URL")
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('https://example.com/image.gif')
                    .setRequired(true);

                const row = new ActionRowBuilder().addComponents(gifInput);
                modal.addComponents(row);

                return interaction.showModal(modal);
            }
        }

        // 2. SEÇİM MENÜLERİNİ YAKALAMA
        if (interaction.isAnySelectMenu()) {
            if (interaction.customId === 'welcome_channel_select') {
                const channelId = interaction.values[0];
                saveToDB(interaction.guild.id, 'welcomeChannel', channelId);
                return interaction.update({ content: `✅ Welcome channel has been set to <#${channelId}>!`, components: [] });
            }

            if (interaction.customId === 'welcome_role_select') {
                const roleId = interaction.values[0];
                saveToDB(interaction.guild.id, 'autoRole', roleId);
                return interaction.update({ content: `✅ Auto-role has been set to <@&${roleId}>!`, components: [] });
            }
        }

        // 3. MODAL (METİN GİRİŞİ) YAKALAMA
        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'welcome_gif_modal') {
                const gifUrl = interaction.fields.getTextInputValue('gif_url_input');
                saveToDB(interaction.guild.id, 'welcomeGif', gifUrl);
                return interaction.reply({ content: `✅ Welcome GIF has been successfully updated!`, ephemeral: true });
            }
        }
    }
};
