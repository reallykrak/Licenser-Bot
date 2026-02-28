require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require('discord.js');

// Dil dosyalarını içeri aktarıyoruz
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
    userData.set(userId, { lang: null, inGameName: null });
  }
  return userData.get(userId);
}

// Kullanıcının seçtiği dile göre doğru JSON objesini döndüren yardımcı fonksiyon
function getLangData(lang) {
  return lang === 'tr' ? trLang : enLang;
}

client.once('ready', () => {
  console.log(`Bot hazır: ${client.user.tag}`);
});

// --- BUTON ETKİLEŞİMLERİ (Dil Seçimi) ---
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
  if (!message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  
  const validCommands = ['help', 'setuser', 'checkuser', 'buy', 'buyperma', 'world', 'link', 'balance'];
  if (!validCommands.includes(command)) return;

  const profile = getUserProfile(message.author.id);

  // Dil seçimi yapılmamışsa butonları gönder
  if (!profile.lang) {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('lang_tr')
          .setLabel('Türkçe')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🇹🇷'),
        new ButtonBuilder()
          .setCustomId('lang_en')
          .setLabel('English')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🇬🇧')
      );

    return message.reply({ 
      content: 'Lütfen dil seçiminizi yapın. / Please select your language.', 
      components: [row] 
    });
  }

  // Kullanıcının dil verilerini çek
  const langData = getLangData(profile.lang);

  // --- KOMUTLAR ---

  // !help Komutu
  if (command === 'help') {
    const embed = new EmbedBuilder()
      .setTitle(langData.helpTitle)
      .setDescription(langData.helpDesc)
      .setColor('#000000') // Siyah renk
      .setFooter({ text: langData.helpFooter });

    await message.reply({ embeds: [embed] });
  }

  // !setuser <İsim> Komutu
  if (command === 'setuser') {
    const name = args.join(' ');
    
    if (!name) {
      return message.reply(langData.setUserNoArgs);
    }

    profile.inGameName = name; 
    
    // JSON içindeki {name} kısmını gerçek isimle değiştiriyoruz
    const successMsg = langData.setUserSuccess.replace('{name}', name);
    await message.reply(successMsg);
  }

  // !checkuser Komutu
  if (command === 'checkuser') {
    if (!profile.inGameName) {
      return message.reply(langData.checkUserNoName);
    }

    // JSON içindeki {name} kısmını gerçek isimle değiştiriyoruz
    const currentNameMsg = langData.checkUserSuccess.replace('{name}', profile.inGameName);
    await message.reply(currentNameMsg);
  }
});

client.login(process.env.DISCORD_TOKEN);
      
