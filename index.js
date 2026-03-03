const { Client, GatewayIntentBits, Partials, Collection, REST, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const config = require('./config.json');
const trLang = require('./tr.json');
const enLang = require('./en.json');

const DB_PATH = './db.json';
function loadDb() { return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); }
function saveDb(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

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

// Çekiliş Kontrol Döngüsü (Her 10 saniyede bir kontrol eder)
setInterval(async () => {
    try {
        const db = loadDb();
        let dbUpdated = false;

        for (const guildId in db) {
            const guildData = db[guildId];
            if (!guildData.giveaways) continue;

            for (const msgId in guildData.giveaways) {
                const gw = guildData.giveaways[msgId];
                
                if (!gw.ended && Date.now() > gw.endTime) {
                    gw.ended = true;
                    dbUpdated = true;

                    const guild = client.guilds.cache.get(guildId);
                    if (!guild) continue;
                    const channel = guild.channels.cache.get(gw.channelId);
                    if (!channel) continue;

                    try {
                        const message = await channel.messages.fetch(msgId);
                        
                        let winnersText = "Kazanan yok (Katılım olmadı)";
                        if (gw.entrants.length > 0) {
                            const shuffled = gw.entrants.sort(() => 0.5 - Math.random());
                            const winners = shuffled.slice(0, gw.winnersCount);
                            winnersText = winners.map(id => `<@${id}>`).join(', ');
                        }

                        const oldEmbed = message.embeds[0];
                        const endedEmbed = EmbedBuilder.from(oldEmbed)
                            .setTitle(`🎉 ÇEKİLİŞ BİTTİ: ${gw.prize}`)
                            .setDescription(`**Kazananlar:** ${winnersText}\n**Ev Sahibi:** <@${gw.hostId}>`)
                            .setColor('#2b2d31')
                            .setFooter({ text: `Bitti • Toplam Katılımcı: ${gw.entrants.length}` });

                        const disabledRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('giveaway_ended')
                                .setLabel(`Katılımcılar: ${gw.entrants.length}`)
                                .setEmoji('🎉')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(true)
                        );

                        await message.edit({ embeds: [endedEmbed], components: [disabledRow] });

                        if (gw.entrants.length > 0) {
                            await channel.send({ content: `Tebrikler ${winnersText}! **${gw.prize}** kazandınız!\n🔗 Çekiliş: https://discord.com/channels/${guildId}/${gw.channelId}/${msgId}` });
                        } else {
                            await channel.send({ content: `😔 Yeterli katılım olmadığı için **${gw.prize}** çekilişi iptal edildi.` });
                        }
                    } catch (err) {
                        console.error('Çekiliş mesajı bulunamadı veya işlenemedi:', err);
                    }
                }
            }
        }
        if (dbUpdated) saveDb(db);
    } catch (e) {
        // Hataları sessizce geç
    }
}, 10000);

client.once('ready', async () => {
  console.log(`Bot is online: ${client.user.tag}`);
  
  const rest = new REST({ version: '10' }).setToken(config.token);
  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(Routes.applicationCommands(client.user.id), { body: commandsData });
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('--- SLASH COMMAND LOAD ERROR ---');
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
    console.error('Login Error:', err);
});
                  
