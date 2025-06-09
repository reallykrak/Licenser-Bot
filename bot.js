require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel] // DM mesajları için gerekli
});

client.once('ready', () => {
  console.log(`Bot hazır: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild && message.content === '!help') {
    const embed = new EmbedBuilder()
      .setTitle('How to buy license?')
      .setColor('#2f3136')
      .setDescription(`You can buy licenses by using command **!buy**.\nIf you don't have **enough balance** to buy **licenses**, follow those steps:`)
      .addFields(
        { name: '1.', value: 'Use command `!setuser` to set your in-game name.' },
        { name: '2.', value: 'Use command `!checkuser` to verify your in-game name.' },
        { name: '3.', value: 'Use command `!world` to view current depo world.\n**(WARNING:** Don\'t forget to check if world has **admin/owner**!)' },
        { name: '4.', value: 'After you are done, **deposit the currency** on the **donation box**.' },
        { name: '5.', value: 'You will automatically receive **your balance**.' },
        { name: '6.', value: 'You can view **current download link** with command `!link`.' },
      )
      .addFields(
        { name: 'Problems?', value: 'Please open ticket from `#support`.' },
        { name: 'Tip', value: 'You can use `!balance` command to view your balance.' }
      )
      .setFooter({ text: 'Licenser UYG' });

    await message.author.send({ embeds: [embed] });
  }
});

client.login(process.env.DISCORD_TOKEN);
