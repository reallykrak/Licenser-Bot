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

// User Data Handling
const userData = new Map();
function getUserProfile(userId) {
  if (!userData.has(userId)) userData.set(userId, { lang: null, inGameName: null, balance: 0 });
  return userData.get(userId);
}
function getLangData(lang) { return lang === 'tr' ? trLang : enLang; }

// Load Commands
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  if (command.data) {
    client.commands.set(command.data.name, command);
    commandsData.push(command.data);
  }
}

// Load Events
const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
  const event = require(`./events/${file}`);
  if (event.once) client.once(event.name, (...args) => event.execute(...args, client));
  else client.on(event.name, (...args) => event.execute(...args, client));
}

client.once('ready', async () => {
  console.log(`Bot is online: ${client.user.tag}`);
  
  const rest = new REST({ version: '10' }).setToken(config.token);
  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(Routes.applicationCommands(client.user.id), { body: commandsData });
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('--- SLASH COMMAND LOAD ERROR ---');
    if (error.code === 'ENOTFOUND') {
      console.error('DNS/Internet Error: Could not reach discord.com. Please check your internet connection.');
    } else {
      console.error(error);
    }
  }
});

// Message Commands (Prefix Based)
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

  if (command === 'link') {
    const linkEmbed = new EmbedBuilder()
        .setTitle('<:nuronskrak:1381655242927767562> Download Link')
        .setColor('#000000')
        .setDescription(`➤ [**Download Nuron's Krak**](https://discord.gg/Nwj3VXypJf)`);
    await message.reply({ embeds: [linkEmbed] });
  }
});

client.login(config.token).catch(err => {
    if (err.code === 'ENOTFOUND') {
        console.error('Fatal Error: Connection to discord.com failed. Check your network.');
    } else {
        console.error('Login Error:', err);
    }
});
  
