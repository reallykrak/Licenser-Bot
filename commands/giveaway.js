const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const fs = require('fs');

const DB_PATH = './db.json';
function loadDb() { return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); }
function saveDb(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

// Süre çevirici (örnek: 1d, 2h, 30m -> milisaniye)
function parseTime(timeStr) {
    const regex = /(\d+)\s*([smhd])/g;
    let match;
    let ms = 0;
    while ((match = regex.exec(timeStr)) !== null) {
        const val = parseInt(match[1]);
        const unit = match[2];
        if (unit === 's') ms += val * 1000;
        if (unit === 'm') ms += val * 60000;
        if (unit === 'h') ms += val * 3600000;
        if (unit === 'd') ms += val * 86400000;
    }
    return ms;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Profesyonel çekiliş sistemi / Professional giveaway system')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageEvents)
        .addSubcommand(sub => sub
            .setName('start')
            .setDescription('Yeni bir çekiliş başlatır.')
            .addStringOption(opt => opt.setName('prize').setDescription('Çekiliş ödülü').setRequired(true))
            .addStringOption(opt => opt.setName('duration').setDescription('Süre (ör: 10m, 1h, 2d)').setRequired(true))
            .addIntegerOption(opt => opt.setName('winners').setDescription('Kazanan sayısı').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('end')
            .setDescription('Aktif bir çekilişi hemen bitirir.')
            .addStringOption(opt => opt.setName('message_id').setDescription('Çekiliş mesajının ID\'si').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('reroll')
            .setDescription('Biten bir çekilişin kazananlarını yeniden belirler.')
            .addStringOption(opt => opt.setName('message_id').setDescription('Çekiliş mesajının ID\'si').setRequired(true))
        ),

    async execute(interaction, client) {
        const subCommand = interaction.options.getSubcommand();
        const db = loadDb();
        const guildId = interaction.guild.id;

        if (!db[guildId]) db[guildId] = {};
        if (!db[guildId].giveaways) db[guildId].giveaways = {};

        // --- START COMMAND ---
        if (subCommand === 'start') {
            const prize = interaction.options.getString('prize');
            const durationStr = interaction.options.getString('duration');
            const winnersCount = interaction.options.getInteger('winners');

            const durationMs = parseTime(durationStr);
            if (durationMs === 0) {
                return interaction.reply({ content: '❌ Geçersiz süre formatı. Lütfen `10m`, `2h`, `1d` gibi değerler kullanın.', ephemeral: true });
            }

            const endTime = Date.now() + durationMs;
            const endTimestamp = Math.floor(endTime / 1000);

            const embed = new EmbedBuilder()
                .setTitle(`🎉 ÇEKİLİŞ: ${prize}`)
                .setDescription(`Aşağıdaki butona tıklayarak katıl!\n\n**Bitiş:** <t:${endTimestamp}:R> (<t:${endTimestamp}:f>)\n**Ev Sahibi:** ${interaction.user}\n**Kazanan Sayısı:** ${winnersCount}`)
                .setColor('#5865F2')
                .setTimestamp(endTime)
                .setFooter({ text: 'Katılımcı Sayısı: 0' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('giveaway_enter')
                    .setLabel('Katıl (0)')
                    .setEmoji('🎉')
                    .setStyle(ButtonStyle.Success)
            );

            const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

            db[guildId].giveaways[msg.id] = {
                channelId: interaction.channel.id,
                prize: prize,
                winnersCount: winnersCount,
                endTime: endTime,
                hostId: interaction.user.id,
                entrants: [],
                ended: false
            };
            saveDb(db);
        }

        // --- END COMMAND ---
        if (subCommand === 'end') {
            const msgId = interaction.options.getString('message_id');
            const gw = db[guildId].giveaways[msgId];

            if (!gw) return interaction.reply({ content: '❌ Bu ID ile kayıtlı bir çekiliş bulunamadı.', ephemeral: true });
            if (gw.ended) return interaction.reply({ content: '❌ Bu çekiliş zaten bitmiş.', ephemeral: true });

            gw.endTime = Date.now(); // Süreyi şimdiki zamana çekiyoruz, index.js döngüsü bunu hemen yakalayıp bitirecek.
            saveDb(db);
            return interaction.reply({ content: '✅ Çekiliş bitiriliyor...', ephemeral: true });
        }

        // --- REROLL COMMAND ---
        if (subCommand === 'reroll') {
            const msgId = interaction.options.getString('message_id');
            const gw = db[guildId].giveaways[msgId];

            if (!gw) return interaction.reply({ content: '❌ Bu ID ile kayıtlı bir çekiliş bulunamadı.', ephemeral: true });
            if (!gw.ended) return interaction.reply({ content: '❌ Bu çekiliş henüz bitmemiş.', ephemeral: true });
            if (gw.entrants.length === 0) return interaction.reply({ content: '❌ Bu çekilişe kimse katılmamış.', ephemeral: true });

            const shuffled = gw.entrants.sort(() => 0.5 - Math.random());
            const newWinners = shuffled.slice(0, gw.winnersCount).map(id => `<@${id}>`);

            const channel = interaction.guild.channels.cache.get(gw.channelId);
            if (channel) {
                await channel.send({ content: `🎉 **REROLL!** [${gw.prize}] çekilişinin yeni kazanan(lar)ı: ${newWinners.join(', ')} \nMesaj Linki: https://discord.com/channels/${guildId}/${gw.channelId}/${msgId}` });
            }

            return interaction.reply({ content: '✅ Reroll işlemi başarılı.', ephemeral: true });
        }
    }
};
            
