const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  REST,
  Routes
} = require('discord.js');
const discordTranscripts = require('discord-html-transcripts');

// Config ve Dil dosyalarını içeri aktarıyoruz
const config = require('./config.json');
const trLang = require('./tr.json');
const enLang = require('./en.json');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel] 
});

const userData = new Map();

function getUserProfile(userId) {
  if (!userData.has(userId)) {
    userData.set(userId, { lang: null, inGameName: null, balance: 0 });
  }
  return userData.get(userId);
}

function getLangData(lang) {
  return lang === 'tr' ? trLang : enLang;
}

// --- SLASH KOMUT KAYDEDİCİ ---
const commands = [
  {
    name: 'ticket-ayarla',
    description: 'Gelişmiş ticket sistemini kurar.',
    options: [
      {
        name: 'kanal',
        type: 7, // Kanal tipi
        description: 'Ticket mesajının gönderileceği kanal',
        required: true,
        channel_types: [0] // Sadece metin kanallarını (Text Channels) gösterir
      },
      {
        name: 'kategori',
        type: 7, 
        description: 'Açılan ticketların gideceği kategori',
        required: true,
        channel_types: [4] // Sadece KATEGORİLERİ (Categories) gösterir, hatayı çözen kısım bu!
      },
      {
        name: 'resim_gif',
        type: 3, // String tipi
        description: 'Embed mesajına eklenecek Resim/GIF URL (Opsiyonel)',
        required: false,
      }
    ],
  },
];

client.once('ready', async () => {
  console.log(`Bot hazır: ${client.user.tag}`);
  
  // Slash komutlarını Discord'a yüklüyoruz
  const rest = new REST({ version: '10' }).setToken(config.token);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Slash komutları başarıyla yüklendi!');
  } catch (error) {
    console.error('Slash komutları yüklenirken hata oluştu:', error);
  }
});

// --- ETKİLEŞİM YÖNETİMİ (SLASH KOMUTLAR VE BUTONLAR) ---
client.on('interactionCreate', async (interaction) => {
  // 1. SLASH KOMUTLAR
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'ticket-ayarla') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: 'Bu komutu kullanmak için Yönetici olmalısın.', ephemeral: true });
      }

      const kanal = interaction.options.getChannel('kanal');
      const kategori = interaction.options.getChannel('kategori');
      const resimGif = interaction.options.getString('resim_gif');

      const embed = new EmbedBuilder()
        .setTitle('🎫 Destek Sistemi')
        .setDescription('Destek ekibimizle iletişime geçmek için aşağıdaki butona tıklayarak bir bilet oluşturabilirsiniz.\n\nLütfen gereksiz yere bilet açmayınız.')
        .setColor('#2b2d31');
      
      if (resimGif) embed.setImage(resimGif);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`create_ticket_${kategori.id}`)
          .setLabel('Ticket Aç')
          .setEmoji('📩')
          .setStyle(ButtonStyle.Primary)
      );

      await kanal.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: `Ticket sistemi ${kanal} kanalına başarıyla kuruldu! Artık açılan biletler ${kategori} kategorisine gidecek.`, ephemeral: true });
    }
  }

  // 2. BUTON ETKİLEŞİMLERİ
  if (interaction.isButton()) {
    // Mevcut Dil Seçimi Butonları
    if (interaction.customId === 'lang_tr' || interaction.customId === 'lang_en') {
      const profile = getUserProfile(interaction.user.id);
      profile.lang = interaction.customId === 'lang_tr' ? 'tr' : 'en';
      const langData = getLangData(profile.lang);
      return interaction.update({ content: langData.langSet, components: [] });
    }

    // Ticket Açma Butonu
    if (interaction.customId.startsWith('create_ticket_')) {
      const categoryId = interaction.customId.split('_')[2];
      
      const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: categoryId,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] }
        ]
      });

      await interaction.reply({ content: `Biletiniz oluşturuldu: ${ticketChannel}`, ephemeral: true });

      const panelEmbed = new EmbedBuilder()
        .setTitle('🛠️ Ticket Yönetim Paneli')
        .setDescription(`Hoş geldin ${interaction.user}!\nYetkililerimiz en kısa sürede seninle ilgilenecektir.\nLütfen sorununuzu detaylıca açıklayın.`)
        .setColor('#2b2d31');

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_close').setLabel('Kapat & Sil').setEmoji('⛔').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ticket_lock').setLabel('Kilitle').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_transcript').setLabel('Transkript').setEmoji('📝').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_claim').setLabel('Üstlen').setEmoji('🙋‍♂️').setStyle(ButtonStyle.Success)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ticket_kick_${interaction.user.id}`).setLabel('Kullanıcıyı At (Kick)').setEmoji('👢').setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({ content: `${interaction.user}`, embeds: [panelEmbed], components: [row1, row2] });
    }

    // Ticket Kapatma
    if (interaction.customId === 'ticket_close') {
      await interaction.reply('Bilet 5 saniye içinde silinecek...');
      setTimeout(() => interaction.channel.delete().catch(e => console.error(e)), 5000);
    }

    // Ticket Kilitleme
    if (interaction.customId === 'ticket_lock') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return interaction.reply({ content: 'Yetkin yok!', ephemeral: true });
      
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
      const currentName = interaction.channel.name;
      await interaction.channel.setName(`kilitli-${currentName}`);
      await interaction.reply('🔒 Bu bilet kilitlendi, kullanıcılar artık mesaj yazamaz.');
    }

    // Ticket Transkript Alma
    if (interaction.customId === 'ticket_transcript') {
      await interaction.deferReply();
      const attachment = await discordTranscripts.createTranscript(interaction.channel, {
        limit: -1, 
        returnType: 'attachment',
        filename: `${interaction.channel.name}-transcript.html`,
        saveImages: true
      });
      await interaction.editReply({ content: '📝 Bilet dökümü başarıyla oluşturuldu:', files: [attachment] });
    }

    // Ticket Üstlenme
    if (interaction.customId === 'ticket_claim') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return interaction.reply({ content: 'Bunu sadece yetkililer yapabilir.', ephemeral: true });
      await interaction.reply(`🙋‍♂️ Bu bilet **${interaction.user.tag}** tarafından üstlenildi. Sizinle o ilgilenecek.`);
    }

    // Kullanıcı Kickleme (Ticket içinden sunucudan atma)
    if (interaction.customId.startsWith('ticket_kick_')) {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
        return interaction.reply({ content: 'Kullanıcı atma yetkiniz yok!', ephemeral: true });
      }
      const targetId = interaction.customId.split('_')[2];
      const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
      
      if (targetMember) {
        await targetMember.kick('Ticket panelinden atıldı.');
        await interaction.reply(`👢 ${targetMember.user.tag} sunucudan başarıyla atıldı.`);
      } else {
        await interaction.reply({ content: 'Kullanıcı bulunamadı veya zaten ayrılmış.', ephemeral: true });
      }
    }
  }
});

// --- MEVCUT MESAJ / KOMUT YÖNETİMİ ---
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(config.prefix)) return;

  const args = message.content.slice(config.prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  
  const validCommands = ['help', 'setuser', 'checkuser', 'buy', 'buyperma', 'world', 'link', 'balance'];
  if (!validCommands.includes(command)) return;

  const profile = getUserProfile(message.author.id);

  if (!profile.lang) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('lang_tr').setLabel('Türkçe').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('lang_en').setLabel('English').setStyle(ButtonStyle.Primary)
    );
    return message.reply({ content: 'Lütfen dil seçin / Please select language', components: [row] });
  }

  const langData = getLangData(profile.lang);

  if (command === 'help') {
    const embed = new EmbedBuilder().setTitle(langData.helpTitle).setDescription(langData.helpDesc).setColor('#000000').setFooter({ text: langData.helpFooter });
    await message.reply({ embeds: [embed] });
  }
  if (command === 'link') {
    const linkEmbed = new EmbedBuilder().setTitle('<:nuronskrak:1381655242927767562> Download Link').setColor('#000000').setDescription(`➤ [**Download Nuron's Krak**](https://discord.gg/Nwj3VXypJf)\n➤ [**Download GmailLog Server**](https://mega.nz/file/1mUS2ZjD#2WGo52pAeYRUASWjBGd3OheNQLgF7ypunFLv6JRKagM)\n➤ [**Download SteamLog**](https://mega.nz/file/s7kTHZ4a#mLh-Xp3zjtM6HajrFTmaOUzzn4LvxJ0yUXdGO_pJOlI)`);
    await message.reply({ embeds: [linkEmbed] });
  }
  if (command === 'setuser') {
    const name = args.join(' ');
    if (!name) return message.reply(langData.setUserNoArgs);
    profile.inGameName = name;
    const embed = new EmbedBuilder().setTitle('OGPS Information').setColor('#000000').setDescription(`➤ Successfully **updated** **your** **ogps name** to **${name}**`);
    await message.reply({ embeds: [embed] });
  }
  if (command === 'checkuser') {
    if (!profile.inGameName) return message.reply(langData.checkUserNoName);
    const embed = new EmbedBuilder().setColor('#000000').setDescription(`➤ Your current username is **${profile.inGameName}**!`);
    await message.reply({ embeds: [embed] });
  }
  if (command === 'world') {
    if (!profile.inGameName) return message.reply(langData.checkUserNoName); 
    const randomNum = Math.floor(Math.random() * 101); 
    const embed = new EmbedBuilder().setTitle('Global Deposit World').setColor('#000000').setDescription(`➤ Current Deposit World is **krak${randomNum}**!\n➤ Your OGPS name is **${profile.inGameName}**!`);
    await message.reply({ embeds: [embed] });
  }
  if (command === 'balance') {
    if (!profile.inGameName) return message.reply(langData.checkUserNoName);
    const embed = new EmbedBuilder().setTitle(`${profile.inGameName}'s Balance`).setColor('#FF0000').setDescription(`➤ You have ${profile.balance} <:emoji_28:1382326426392330251>`);
    await message.reply({ embeds: [embed] });
  }
});

client.login(config.token);
        
