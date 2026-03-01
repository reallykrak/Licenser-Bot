const {
    PermissionsBitField,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    EmbedBuilder
} = require('discord.js');
const fs = require('fs');

module.exports = {
    data: {
        name: 'setup',
        description: 'Sets up the ticket panel in this channel.'
    },
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({
                content: '❌ You need Administrator permission to use this command.',
                ephemeral: true
            });
        }

        const db            = JSON.parse(fs.readFileSync('./db.json', 'utf-8'));
        const guildSettings = db[interaction.guild.id];

        if (!guildSettings || !guildSettings.logChannel || !guildSettings.staffRole) {
            return interaction.reply({
                content: '⚠️ Please configure the bot first using `/ticket-settings` (Log Channel & Staff Role are required).',
                ephemeral: true
            });
        }

        // ── PANEL EMBED ────────────────────────────────────────────────────────
        const embed = new EmbedBuilder()
            .setTitle("🎫  Nuron's Krak  |  Support")
            .setDescription(
                "Need help with our products or services? Open a support ticket using the menu below.\n\n" +
                "**How to open a ticket:**\n" +
                "> **1.** Select a product from the dropdown menu.\n" +
                "> **2.** Click the category button that best describes your issue.\n\n" +
                "⚠️ **Note:** Support requests outside of working hours will be handled at the start of the next shift.\n" +
                "Please **do not** ask for support in chat — it will not speed up the process.\n\n" +
                "📅 **Working Hours**\n" +
                "• Weekdays: **08:00 – 22:00**\n" +
                "• Weekends: **08:00 – 22:00**"
            )
            .setColor('#2b2d31')
            .setFooter({ text: "Nuron's Krak Support System" })
            .setTimestamp();

        if (guildSettings.gifUrl) embed.setImage(guildSettings.gifUrl);

        // ── PRODUCT SELECT MENU ────────────────────────────────────────────────
        const menuRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('ticket_product_select')
                .setPlaceholder('📦  Select the product you need help with...')
                .addOptions([
                    { label: 'OGPS Bot',         value: 'ogps_bot',  emoji: '🤖', description: 'Support for OGPS Bot' },
                    { label: "Nuron's Krak DLL", value: 'nuron_dll', emoji: '⚙️', description: "Support for Nuron's Krak DLL" },
                    { label: 'Growtopia Bot',     value: 'gt_bot',   emoji: '🌱', description: 'Support for Growtopia Bot' }
                ])
        );

        // ── CATEGORY BUTTONS — custom server emojis ────────────────────────────
        const buttonsRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_cat_genel')
                .setLabel('General')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji({ id: '1381662734562627614', name: 'emoji_10' }),

            new ButtonBuilder()
                .setCustomId('ticket_cat_teknik')
                .setLabel('Technical')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji({ id: '1381662800039907408', name: 'emoji_12' }),

            new ButtonBuilder()
                .setCustomId('ticket_cat_reklam')
                .setLabel('Advertisement')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji({ id: '1381662917904039986', name: 'emoji_16' }),

            new ButtonBuilder()
                .setCustomId('ticket_cat_ozel')
                .setLabel('Special')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji({ id: '1381662978549743656', name: 'emoji_18' })
        );

        await interaction.channel.send({ embeds: [embed], components: [menuRow, buttonsRow] });
        await interaction.reply({ content: '✅ Ticket panel has been set up successfully!', ephemeral: true });
    }
};
        
