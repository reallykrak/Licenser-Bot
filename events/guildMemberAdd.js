const { Events, EmbedBuilder } = require('discord.js');
const fs = require('fs');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        const dbPath = './db.json';
        if (!fs.existsSync(dbPath)) return;
        
        const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        const settings = db[member.guild.id];
        if (!settings) return;

        // OTO-ROL
        if (settings.autoRole) {
            const role = member.guild.roles.cache.get(settings.autoRole);
            if (role) member.roles.add(role).catch(() => console.log("Rol verme yetkim yetersiz."));
        }

        // MESAJ GÖNDERME
        if (settings.welcomeChannel) {
            const channel = member.guild.channels.cache.get(settings.welcomeChannel);
            if (!channel) return;

            const accountCreated = `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`;

            const welcomeText = 
                `**Welcome to ${member.guild.name}, ${member}!** <:emoji_7:1381662606183370843>\n\n` +
                `**User Info:**\n` +
                `<:emoji_19:1381663001098326167> **ID:** ${member.id}\n` +
                `<:emoji_19:1381663020559896739> **Account Created:** ${accountCreated}\n\n` +
                `**Server Info:**\n` +
                `<:emoji_20:1381700870831472801> **Member Count:** ${member.guild.memberCount}\n` +
                `<:emoji_16:1381662917904039986> **Server:** ${member.guild.name}`;

            const options = { content: welcomeText };

            if (settings.welcomeGif) {
                const embed = new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setImage(settings.welcomeGif);
                options.embeds = [embed];
            }

            channel.send(options).catch(console.error);
        }
    }
};
