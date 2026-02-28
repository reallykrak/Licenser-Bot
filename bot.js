const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require('discord.js');

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

client.once('ready', () => {
  console.log(`Bot hazır: ${client.user.tag}`);
});

// --- BUTON ETKİLEŞİMLERİ ---
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'lang_tr' || interaction.customId === 'lang_en') {
    const profile = getUserProfile(interaction.user.id);
    profile.lang = interaction.customId === 'lang_tr' ? 'tr' : 'en';
    const langData = getLangData(profile.lang);

    await interaction.update({ content: langData.langSet, components: [] });
  }
});

// --- MESAJ / KOMUT YÖNETİMİ ---
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(config.prefix)) return;

  const args = message.content.slice(config.prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  
  const validCommands = ['help', 'setuser', 'checkuser', 'buy', 'buyperma', 'world', 'link', 'balance'];
  if (!validCommands.includes(command)) return;

  const profile = getUserProfile(message.author.id);

  // Dil seçimi kontrolü
  if (!profile.lang) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('lang_tr').setLabel('Türkçe').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('lang_en').setLabel('English').setStyle(ButtonStyle.Primary)
    );
    return message.reply({ content: 'Lütfen dil seçin / Please select language', components: [row] });
  }

  const langData = getLangData(profile.lang);

  // --- KOMUTLAR ---

  // !help
  if (command === 'help') {
    const embed = new EmbedBuilder()
      .setTitle(langData.helpTitle)
      .setDescription(langData.helpDesc)
      .setColor('#000000')
      .setFooter({ text: langData.helpFooter });
    await message.reply({ embeds: [embed] });
  }

  // !link 
  if (command === 'link') {
    const linkEmbed = new EmbedBuilder()
      .setTitle('<:nuronskrak:1381655242927767562> Download Link')
      .setColor('#000000')
      .setDescription(
        `➤ [**Download Nuron's Krak**](https://example.com/nuron)\n` +
        `➤ [**Download GmailLog Server**](https://example.com/gmaillog)\n` +
        `➤ [**Download SteamLog**](https://example.com/steamlog)`
      );
    await message.reply({ embeds: [linkEmbed] });
  }

  // !setuser (Siyah Embed)
  if (command === 'setuser') {
    const name = args.join(' ');
    if (!name) return message.reply(langData.setUserNoArgs);
    profile.inGameName = name;
    
    const embed = new EmbedBuilder()
      .setTitle('OGPS Information')
      .setColor('#000000') // Siyah
      .setDescription(`➤ Successfully **updated** **your** **ogps name** to **${name}**`);
      
    await message.reply({ embeds: [embed] });
  }

  // !checkuser (Siyah Embed)
  if (command === 'checkuser') {
    if (!profile.inGameName) return message.reply(langData.checkUserNoName);
    
    const embed = new EmbedBuilder()
      .setColor('#000000') // Siyah
      .setDescription(`➤ Your current username is **${profile.inGameName}**!`);
      
    await message.reply({ embeds: [embed] });
  }

  // !world (Siyah Embed)
  if (command === 'world') {
    if (!profile.inGameName) return message.reply(langData.checkUserNoName); // OGPS isminin yazılabilmesi için kayıtlı olması lazım
    
    const randomNum = Math.floor(Math.random() * 101); // 0-100 arası rastgele sayı
    
    const embed = new EmbedBuilder()
      .setTitle('Global Deposit World')
      .setColor('#000000') // Siyah
      .setDescription(`➤ Current Deposit World is **krak${randomNum}**!\n➤ Your OGPS name is **${profile.inGameName}**!`);
      
    await message.reply({ embeds: [embed] });
  }

  // !balance (Kırmızı Embed)
  if (command === 'balance') {
    if (!profile.inGameName) return message.reply(langData.checkUserNoName);
    
    const embed = new EmbedBuilder()
      .setTitle(`${profile.inGameName}'s Balance`)
      .setColor('#FF0000') // Kırmızı
      .setDescription(`➤ You have ${profile.balance} <:emoji_28:1382326426392330251>`);
      
    await message.reply({ embeds: [embed] });
  }
});

client.login(config.token);
  
