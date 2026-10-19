require('dotenv').config();
const { REST, Routes } = require('discord.js');
const commands = require('./commands');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('تأكد من تعبئة DISCORD_TOKEN وCLIENT_ID في ملف .env');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
async function deployCommands() {
  await rest.put(Routes.applicationCommands(CLIENT_ID), {
    body: commands.map((command) => command.toJSON())
  });
  console.log('تم تسجيل أوامر AY COMMUNITY لجميع السيرفرات.');

  if (GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
    console.log('تم حذف نسخة أوامر السيرفر القديمة لتجنب تعارضها مع الأوامر العامة.');
  }
}

deployCommands().catch((error) => {
  console.error('تعذر تسجيل الأوامر:', error.message);
  process.exitCode = 1;
});