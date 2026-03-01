const { Client, GatewayIntentBits, Partials, Collection, REST, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const config = require('./config.json');
const trLang = require('./tr.json');
const enLang = require('./en.json');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel] 
});

client.commands = new Collection();
const commandsData = [];

// Eski Kullanıcı Verileri (Mevcut kodundan taşındı)
const userData = new Map();
function getUserProfile(userId) {
  if (!userData.has(userId)) userData.set(userId, { lang: null, inGameName: null, balance: 0 });
  return userData.get(userId);
}
function getLangData(lang) { return lang === 'tr' ? trLang : enLang; }

// Komutları Yükle
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
  commandsData.push(command.data);
}

// Eventleri Yükle
const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
  const event = require(`./events/${file}`);
  if (event.once) client.once(event.name, (...args) => event.execute(...args, client));
  else client.on(event.name, (...args) => event.execute(...args, client));
}

client.once('ready', async () => {
  console.log(`Bot hazır: ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(config.token);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commandsData });
    console.log('Slash komutları başarıyla yüklendi!');
  } catch (error) {
    console.error('Slash komutları yüklenirken hata oluştu:', error);
  }
});

// Eski Prefix Komutların (!help, !link vb.)
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith(config.prefix)) return;
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
  // (Burada eski komutlarının içeriği var, yer kaplamaması için kısaltıyorum. Eski bot.js'ndeki messageCreate içeriğinin tamamı burada çalışacaktır.)
  if (command === 'link') {
    const linkEmbed = new EmbedBuilder().setTitle('<:nuronskrak:1381655242927767562> Download Link').setColor('#000000').setDescription(`➤ [**Download Nuron's Krak**](https://discord.gg/Nwj3VXypJf)`);
    await message.reply({ embeds: [linkEmbed] });
  }
});

client.login(config.token);
    
