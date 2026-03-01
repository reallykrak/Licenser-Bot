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

// DB Kayıt Fonksiyonu
function saveToDB(guildId, key, value) {
    let db = {};
    if (fs.existsSync(dbPath)) db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    if (!db[guildId]) db[guildId] = {};
    db[guildId][key] = value;
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 4));
}

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        try {
            if (interaction.isButton()) {
                // Kanal Seçme Butonu
                if (interaction.customId === 'welcome_channel_btn') {
                    const channelMenu = new ActionRowBuilder().addComponents(
                        new ChannelSelectMenuBuilder()
                            .setCustomId('welcome_channel_select')
                            .setPlaceholder('Select the welcome channel...')
                            .addChannelTypes(ChannelType.GuildText)
                    );
                    return await interaction.reply({ content: '📢 **Select a channel:**', components: [channelMenu], ephemeral: true });
                }

                // Rol Seçme Butonu (ARAMA ÇUBUĞU EKLENDİ)
                if (interaction.customId === 'welcome_role_btn') {
                    const roleMenu = new ActionRowBuilder().addComponents(
                        new RoleSelectMenuBuilder()
                            .setCustomId('welcome_role_select')
                            .setPlaceholder('🔎 Search and select the member role...')
                    );
                    return await interaction.reply({ content: '👤 **Select the member role:**', components: [roleMenu], ephemeral: true });
                }

                // GIF/Görsel Ayarlama Butonu
                if (interaction.customId === 'welcome_gif_btn') {
                    const modal = new ModalBuilder().setCustomId('welcome_gif_modal').setTitle('Welcome GIF Settings');
                    const gifInput = new TextInputBuilder()
                        .setCustomId('gif_url_input')
                        .setLabel("Paste the GIF URL (Discord, Imgur vb.)")
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('https://cdn.discordapp.com/attachments/...')
                        .setRequired(true);
                        
                    modal.addComponents(new ActionRowBuilder().addComponents(gifInput));
                    return await interaction.showModal(modal);
                }
            }

            // Menü Seçimleri Kaydetme
            if (interaction.isAnySelectMenu()) {
                const guildId = interaction.guild.id;
                
                if (interaction.customId === 'welcome_channel_select') {
                    saveToDB(guildId, 'welcomeChannel', interaction.values[0]);
                    return await interaction.update({ content: `✅ Welcome channel saved successfully!`, components: [] });
                }
                
                if (interaction.customId === 'welcome_role_select') {
                    // RoleSelectMenu direkt olarak rolün ID'sini döndürür
                    saveToDB(guildId, 'autoRole', interaction.values[0]);
                    return await interaction.update({ content: `✅ Auto-role saved successfully!`, components: [] });
                }
            }

            // Modal (GIF) Kaydetme
            if (interaction.isModalSubmit() && interaction.customId === 'welcome_gif_modal') {
                const gifUrl = interaction.fields.getTextInputValue('gif_url_input');
                saveToDB(interaction.guild.id, 'welcomeGif', gifUrl);
                return await interaction.reply({ content: `✅ Welcome GIF updated!`, ephemeral: true });
            }
            
        } catch (error) {
            console.error('[Welcome Interactions Error]', error);
            // Çökmeleri önlemek ve 10062 hatasını yakalamak için
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ İşlem sırasında bir hata oluştu.', ephemeral: true }).catch(() => {});
            }
        }
    }
};
