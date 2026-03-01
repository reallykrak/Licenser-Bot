const { 
    PermissionsBitField, 
    EmbedBuilder, 
    ApplicationCommandOptionType 
} = require('discord.js');

module.exports = {
    data: {
        name: 'mod',
        description: 'Sunucu moderasyon komutları (Ban, Kick, Mute, Unmute, Delete).',
        options: [
            {
                name: 'delete',
                description: 'Belirtilen miktarda mesajı siler (Maksimum 200).',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    {
                        name: 'miktar',
                        description: 'Silinecek mesaj sayısı (1-200 arası)',
                        type: ApplicationCommandOptionType.Integer,
                        required: true,
                        min_value: 1,
                        max_value: 200
                    }
                ]
            },
            {
                name: 'ban',
                description: 'Bir kullanıcıyı sunucudan yasaklar.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    {
                        name: 'kullanici',
                        description: 'Yasaklanacak kullanıcı',
                        type: ApplicationCommandOptionType.User,
                        required: true
                    },
                    {
                        name: 'sebep',
                        description: 'Yasaklama sebebi',
                        type: ApplicationCommandOptionType.String,
                        required: false
                    }
                ]
            },
            {
                name: 'kick',
                description: 'Bir kullanıcıyı sunucudan atar.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    {
                        name: 'kullanici',
                        description: 'Atılacak kullanıcı',
                        type: ApplicationCommandOptionType.User,
                        required: true
                    },
                    {
                        name: 'sebep',
                        description: 'Atılma sebebi',
                        type: ApplicationCommandOptionType.String,
                        required: false
                    }
                ]
            },
            {
                name: 'mute',
                description: 'Bir kullanıcıya zaman aşımı (timeout) uygular.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    {
                        name: 'kullanici',
                        description: 'Susturulacak kullanıcı',
                        type: ApplicationCommandOptionType.User,
                        required: true
                    },
                    {
                        name: 'sure',
                        description: 'Susturma süresi (Dakika cinsinden)',
                        type: ApplicationCommandOptionType.Integer,
                        required: true,
                        min_value: 1
                    },
                    {
                        name: 'sebep',
                        description: 'Susturma sebebi',
                        type: ApplicationCommandOptionType.String,
                        required: false
                    }
                ]
            },
            {
                name: 'unmute',
                description: 'Bir kullanıcının zaman aşımını (timeout) kaldırır.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    {
                        name: 'kullanici',
                        description: 'Susturması kaldırılacak kullanıcı',
                        type: ApplicationCommandOptionType.User,
                        required: true
                    },
                    {
                        name: 'sebep',
                        description: 'Susturma kaldırma sebebi',
                        type: ApplicationCommandOptionType.String,
                        required: false
                    }
                ]
            }
        ]
    },
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        // ── DELETE KOMUTU ───────────────────────────────────────────────────────────
        if (subcommand === 'delete') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return interaction.reply({ content: '❌ Bu komutu kullanmak için `Mesajları Yönet` iznine sahip olmalısın.', ephemeral: true });
            }

            let amount = interaction.options.getInteger('miktar');
            await interaction.deferReply({ ephemeral: true });

            try {
                let deletedCount = 0;
                let fetchAmount = amount;

                // Discord API tek seferde maks 100 mesaj silmeye izin verir.
                // 200 istendiyse bunu döngü ile 100'er 100'er yapıyoruz.
                while (fetchAmount > 0) {
                    const limit = fetchAmount > 100 ? 100 : fetchAmount;
                    const deletedMessages = await interaction.channel.bulkDelete(limit, true);
                    
                    deletedCount += deletedMessages.size;
                    fetchAmount -= deletedMessages.size;

                    // Eğer silinecek mesaj bulunamadıysa (örn. 14 günden eski mesajlar) döngüyü kır.
                    if (deletedMessages.size < limit) break; 
                }

                return interaction.editReply({ content: `✅ Başarıyla **${deletedCount}** mesaj silindi. *(Not: 14 günden eski mesajlar Discord tarafından silinemez)*` });
            } catch (error) {
                console.error(error);
                return interaction.editReply({ content: '❌ Mesajları silerken bir hata oluştu.' });
            }
        }

        // ── BAN KOMUTU ──────────────────────────────────────────────────────────────
        if (subcommand === 'ban') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
                return interaction.reply({ content: '❌ Bu komutu kullanmak için `Üyeleri Yasakla` iznine sahip olmalısın.', ephemeral: true });
            }

            const targetUser = interaction.options.getUser('kullanici');
            const reason = interaction.options.getString('sebep') || 'Sebep belirtilmedi.';
            const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (!targetMember) return interaction.reply({ content: '❌ Kullanıcı sunucuda bulunamadı.', ephemeral: true });
            if (!targetMember.bannable) return interaction.reply({ content: '❌ Bu kullanıcıyı yasaklayamam. Yetkim ondan düşük olabilir.', ephemeral: true });

            await targetMember.ban({ reason: `${interaction.user.tag} tarafından: ${reason}` });
            
            const embed = new EmbedBuilder()
                .setColor('#ED4245')
                .setDescription(`🔨 **${targetUser.tag}** sunucudan yasaklandı.\n**Sebep:** ${reason}`);
                
            return interaction.reply({ embeds: [embed] });
        }

        // ── KICK KOMUTU ─────────────────────────────────────────────────────────────
        if (subcommand === 'kick') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
                return interaction.reply({ content: '❌ Bu komutu kullanmak için `Üyeleri At` iznine sahip olmalısın.', ephemeral: true });
            }

            const targetUser = interaction.options.getUser('kullanici');
            const reason = interaction.options.getString('sebep') || 'Sebep belirtilmedi.';
            const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (!targetMember) return interaction.reply({ content: '❌ Kullanıcı sunucuda bulunamadı.', ephemeral: true });
            if (!targetMember.kickable) return interaction.reply({ content: '❌ Bu kullanıcıyı sunucudan atamam. Yetkim ondan düşük olabilir.', ephemeral: true });

            await targetMember.kick(`${interaction.user.tag} tarafından: ${reason}`);
            
            const embed = new EmbedBuilder()
                .setColor('#FEE75C')
                .setDescription(`👢 **${targetUser.tag}** sunucudan atıldı.\n**Sebep:** ${reason}`);
                
            return interaction.reply({ embeds: [embed] });
        }

        // ── MUTE KOMUTU (TIMEOUT) ───────────────────────────────────────────────────
        if (subcommand === 'mute') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                return interaction.reply({ content: '❌ Bu komutu kullanmak için `Üyelere Zaman Aşımı Uygula` iznine sahip olmalısın.', ephemeral: true });
            }

            const targetUser = interaction.options.getUser('kullanici');
            const minutes = interaction.options.getInteger('sure');
            const reason = interaction.options.getString('sebep') || 'Sebep belirtilmedi.';
            const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (!targetMember) return interaction.reply({ content: '❌ Kullanıcı sunucuda bulunamadı.', ephemeral: true });
            if (!targetMember.moderatable) return interaction.reply({ content: '❌ Bu kullanıcıyı susturamam. Yetkilerimi kontrol et.', ephemeral: true });

            const durationMs = minutes * 60 * 1000;
            await targetMember.timeout(durationMs, `${interaction.user.tag} tarafından: ${reason}`);
            
            const embed = new EmbedBuilder()
                .setColor('#E67E22')
                .setDescription(`🔇 **${targetUser.tag}** adlı kullanıcıya **${minutes} dakika** zaman aşımı uygulandı.\n**Sebep:** ${reason}`);
                
            return interaction.reply({ embeds: [embed] });
        }

        // ── UNMUTE KOMUTU ───────────────────────────────────────────────────────────
        if (subcommand === 'unmute') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                return interaction.reply({ content: '❌ Bu komutu kullanmak için `Üyelere Zaman Aşımı Uygula` iznine sahip olmalısın.', ephemeral: true });
            }

            const targetUser = interaction.options.getUser('kullanici');
            const reason = interaction.options.getString('sebep') || 'Sebep belirtilmedi.';
            const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (!targetMember) return interaction.reply({ content: '❌ Kullanıcı sunucuda bulunamadı.', ephemeral: true });
            if (!targetMember.isCommunicationDisabled()) return interaction.reply({ content: '⚠️ Bu kullanıcının zaten aktif bir susturması bulunmuyor.', ephemeral: true });

            await targetMember.timeout(null, `${interaction.user.tag} tarafından susturması kaldırıldı: ${reason}`);
            
            const embed = new EmbedBuilder()
                .setColor('#57F287')
                .setDescription(`🔊 **${targetUser.tag}** adlı kullanıcının susturması kaldırıldı.\n**Sebep:** ${reason}`);
                
            return interaction.reply({ embeds: [embed] });
        }
    }
};
