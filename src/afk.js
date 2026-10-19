function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days) parts.push(`${days} يوم`);
  if (hours) parts.push(`${hours} ساعة`);
  if (minutes) parts.push(`${minutes} دقيقة`);
  if (!parts.length || seconds) parts.push(`${seconds} ثانية`);
  return parts.join(' و');
}

function splitMessages(header, lines, limit = 1800) {
  const chunks = [];
  let current = header;
  for (const line of lines) {
    if (current.length + line.length + 1 > limit) {
      chunks.push(current);
      current = line;
    } else {
      current += `\n${line}`;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function createAfkSystem(statements) {
  async function handleCommand(interaction) {
    if (interaction.commandName !== 'afk') return false;
    const reason = interaction.options.getString('السبب')?.trim() || 'لم يحدد سببًا';
    statements.setAfk.run(interaction.guildId, interaction.user.id, reason, new Date().toISOString());
    await interaction.reply({ content: `💤 تم تفعيل وضع الغياب. السبب: ${reason}`, ephemeral: true });
    return true;
  }

  async function handleMessage(message) {
    if (!message.guild || message.author.bot) return;

    for (const mentionedUser of message.mentions.users.values()) {
      if (mentionedUser.id === message.author.id || mentionedUser.bot) continue;
      const status = statements.getAfk.get(message.guild.id, mentionedUser.id);
      if (!status) continue;
      statements.addAfkMention.run(
        message.guild.id,
        mentionedUser.id,
        message.id,
        message.channel.id,
        message.author.id,
        message.createdAt.toISOString()
      );
      const startedAt = new Date(status.started_at).getTime();
      await message.channel.send({
        content: `💤 <@${mentionedUser.id}> في وضع الغياب منذ <t:${Math.floor(startedAt / 1000)}:R>. السبب: ${status.reason}`,
        allowedMentions: { parse: [] }
      });
    }

    const status = statements.getAfk.get(message.guild.id, message.author.id);
    if (!status) return;

    const mentions = statements.getAfkMentions.all(message.guild.id, message.author.id);
    statements.removeAfk.run(message.guild.id, message.author.id);
    statements.clearAfkMentions.run(message.guild.id, message.author.id);

    const startedAt = new Date(status.started_at).getTime();
    const elapsed = formatDuration(Date.now() - startedAt);
    const lines = mentions.map((mention) => {
      const url = `https://discord.com/channels/${mention.guild_id}/${mention.channel_id}/${mention.message_id}`;
      return `📨 <@${mention.author_id}> في <#${mention.channel_id}> [الانتقال إلى الرسالة](${url})`;
    });
    const header = `👋 مرحبًا بعودتك <@${message.author.id}>! مدة غيابك: **${elapsed}**.\n📝 السبب: ${status.reason}\n📨 منشنك **${mentions.length}** شخص${mentions.length === 1 ? '' : 'ًا'} أثناء غيابك.`;
    const chunks = splitMessages(header, lines);
    for (const content of chunks) {
      await message.channel.send({ content, allowedMentions: { parse: [] } });
    }
  }

  return { handleCommand, handleMessage };
}

module.exports = { createAfkSystem };
