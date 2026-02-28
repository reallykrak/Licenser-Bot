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
    // balance: 0 değişkeni eklendi
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
      new ButtonBuilder().setCustomId('lang_tr').setLabel('Türkçe').setStyle(ButtonStyle.Danger).setEmoji('🇹🇷'),
      new ButtonBuilder().setCustomId('lang_en').setLabel('English').setStyle(ButtonStyle.Primary).setEmoji('🇬🇧')
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

  // !link (Sadece İngilizce ve Özel Emoji)
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

  // !setuser
  if (command === 'setuser') {
    const name = args.join(' ');
    if (!name) return message.reply(langData.setUserNoArgs);
    profile.inGameName = name;
    await message.reply(langData.setUserSuccess.replace('{name}', name));
  }

  // !checkuser
  if (command === 'checkuser') {
    if (!profile.inGameName) return message.reply(langData.checkUserNoName);
    await message.reply(langData.checkUserSuccess.replace('{name}', profile.inGameName));
  }

  // !world
  if (command === 'world') {
    // 0 ile 100 arasında rastgele sayı üretir
    const randomNum = Math.floor(Math.random() * 101);
    await message.reply(langData.worldMsg.replace('{num}', randomNum));
  }

  // !balance
  if (command === 'balance') {
    // setuser kontrolü
    if (!profile.inGameName) return message.reply(langData.checkUserNoName);
    
    // Değerleri dil dosyasından alıp isim ve bakiyeyi yerleştiriyoruz
    const balanceText = langData.balanceMsg
      .replace('{name}', profile.inGameName)
      .replace('{balance}', profile.balance);
      
    await message.reply(balanceText);
  }
});

client.login(config.token);
      
