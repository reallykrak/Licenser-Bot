const { 
    Events, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ChannelSelectMenuBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ChannelType 
} = require('discord.js');
const fs = require('fs');

const dbPath = './db.json';

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
                // Rolleri al ve "Members" olanı bulup en başa koy
                const allRoles = interaction.guild.roles.cache
                    .filter(r => r.name !== '@everyone' && !r.managed)
                    .map(r => ({ label: r.name, value: r.id }));

                // "Members" içeren rolü bul ve sırala
                const sortedOptions = allRoles.sort((a, b) => {
                    if (a.label.includes('Members')) return -1;
                    if (b.label.includes('Members')) return 1;
                    return 0;
                }).slice(0, 25); // Discord sınırı 25 opsiyon

                const roleMenu = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('welcome_role_select')
                        .setPlaceholder('Select the auto-role (Members is at the top)...')
                        .addOptions(sortedOptions)
                );
                return interaction.reply({ content: '👤 **Select the member role:**', components: [roleMenu], ephemeral: true });
            }

            if (interaction.customId === 'welcome_gif_btn') {
                const modal = new ModalBuilder().setCustomId('welcome_gif_modal').setTitle('Welcome GIF Settings');
                const gifInput = new TextInputBuilder()
                    .setCustomId('gif_url_input')
                    .setLabel("Paste the GIF URL")
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('https://cdn.discordapp.com/...')
                    .setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(gifInput));
                return interaction.showModal(modal);
            }
        }

        if (interaction.isAnySelectMenu()) {
            const guildId = interaction.guild.id;
            if (interaction.customId === 'welcome_channel_select') {
                saveToDB(guildId, 'welcomeChannel', interaction.values[0]);
                return interaction.update({ content: `✅ Welcome channel saved!`, components: [] });
            }
            if (interaction.customId === 'welcome_role_select') {
                saveToDB(guildId, 'autoRole', interaction.values[0]);
                return interaction.update({ content: `✅ Auto-role saved!`, components: [] });
            }
        }

        if (interaction.isModalSubmit() && interaction.customId === 'welcome_gif_modal') {
            const gifUrl = interaction.fields.getTextInputValue('gif_url_input');
            saveToDB(interaction.guild.id, 'welcomeGif', gifUrl);
            return interaction.reply({ content: `✅ Welcome GIF updated!`, ephemeral: true });
        }
    }
};
