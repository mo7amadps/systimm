const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder
} = require('discord.js');

const MESSAGE_COOLDOWN_MS = 60_000;
const VOICE_XP_INTERVAL_MS = 60_000;
const XP_BAR_SIZE = 12;

function xpForNextLevel(level) {
  return 100 + level * 50;
}

function progressBar(xp, required) {
  const filled = Math.min(XP_BAR_SIZE, Math.floor((xp / required) * XP_BAR_SIZE));
  return `${'🟩'.repeat(filled)}${'⬜'.repeat(XP_BAR_SIZE - filled)}`;
}

async function replyHandled(interaction, payload) {
  await interaction.reply(payload);
  return true;
}

const LEVEL_BOARD_PAGE_SIZE = 5;
const LEVEL_BOARD_CATEGORIES = new Set(['all', 'global', 'messages', 'voice']);

function createLevelSystem(client, statements) {
  const pendingRewardRuns = new Map();

  async function announceLevelUp(guildId, userId, oldLevel, newLevel, source) {
    const voiceSettings = source === 'voice' ? statements.getVoiceLevelSettings.get(guildId) : null;
    const settings = voiceSettings || statements.getLevelSettings.get(guildId);
    if (!settings) return;
    const channel = await client.channels.fetch(settings.announce_channel_id).catch(() => null);
    if (!channel?.isTextBased()) return;
    await channel.send({
      content: `🌟 تهانينا <@${userId}> انتقلت من مستوى ${oldLevel} إلى مستوى ${newLevel}`,
      allowedMentions: { users: [userId] }
    }).catch((error) => console.error('تعذر إرسال تهنئة المستوى:', error.message));
  }

  async function grantRewardClaim(guild, userId, claim) {
    const key = `${guild.id}:${userId}:${claim.level}:${claim.role_id}`;
    const existingRun = pendingRewardRuns.get(key);
    if (existingRun) return existingRun;

    const run = Promise.resolve().then(async () => {
      try {
        const role = await guild.roles.fetch(claim.role_id);
        if (!role) {
          console.error(`تعذر منح جائزة المستوى ${claim.level}: الرتبة ${claim.role_id} غير موجودة في السيرفر ${guild.id}.`);
          return;
        }

        const member = await guild.members.fetch(userId);
        const botMember = guild.members.me || await guild.members.fetch(client.user.id);
        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)
          || role.managed
          || role.id === guild.id
          || role.comparePositionTo(botMember.roles.highest) >= 0) {
          console.error(`تعذر منح الرتبة ${role.id} كجائزة للمستوى ${claim.level}: تحقق من صلاحية إدارة الرتب وترتيب رتب البوت.`);
          return;
        }

        if (!member.roles.cache.has(role.id)) {
          await member.roles.add(role, `جائزة الوصول إلى المستوى ${claim.level}`);
        }
        statements.markLevelRewardClaimAwarded.run(
          new Date().toISOString(), guild.id, userId, claim.level, role.id
        );
      } catch (error) {
        console.error(`تعذر منح جائزة المستوى ${claim.level} للعضو ${userId} في السيرفر ${guild.id}:`, error);
      } finally {
        if (pendingRewardRuns.get(key) === run) pendingRewardRuns.delete(key);
      }
    });
    pendingRewardRuns.set(key, run);
    return run;
  }

  async function processLevelRewards(guild, userId, oldLevel, newLevel) {
    if (newLevel > oldLevel) {
      for (const reward of statements.getLevelRewards.all(guild.id)) {
        if (reward.level > oldLevel && reward.level <= newLevel) {
          statements.queueLevelRewardClaim.run(guild.id, userId, reward.level, reward.role_id);
        }
      }
    }

    const pendingClaims = statements.getPendingLevelRewardClaims.all(guild.id, userId);
    for (const claim of pendingClaims) {
      await grantRewardClaim(guild, userId, claim);
    }
  }

  async function addXp(guild, userId, amount, lastMessageXpAt, source) {
    const current = statements.getMemberLevel.get(guild.id, userId);
    let level = current?.level || 1;
    let xp = current?.xp || 0;
    const oldLevel = level;
    xp += amount;
    while (xp >= xpForNextLevel(level)) {
      xp -= xpForNextLevel(level);
      level += 1;
    }
    statements.saveMemberLevel.run(guild.id, userId, level, xp, lastMessageXpAt);
    if (source === 'voice') statements.addVoiceLevelXp.run(guild.id, userId, amount);
    else statements.addMessageLevelXp.run(guild.id, userId, amount);
    await processLevelRewards(guild, userId, current ? oldLevel : 0, level);
    if (level > oldLevel) await announceLevelUp(guild.id, userId, oldLevel, level, source);
  }

  async function handleMessage(message) {
    if (!message.guild || message.author.bot || message.content.trim().length < 2) return;
    const now = Date.now();
    const current = statements.getMemberLevel.get(message.guild.id, message.author.id);
    const lastAward = current?.last_message_xp_at || 0;
    if (now - lastAward < MESSAGE_COOLDOWN_MS) return;
    await addXp(message.guild, message.author.id, 15 + Math.floor(Math.random() * 11), now, 'messages');
  }

  async function awardVoiceXp() {
    for (const guild of client.guilds.cache.values()) {
      const activeMembers = new Set();
      for (const channel of guild.channels.cache.values()) {
        if (!channel.isVoiceBased() || channel.id === guild.afkChannelId) continue;
        const humans = [...channel.members.values()].filter((member) =>
          !member.user.bot && !member.voice.selfDeaf && !member.voice.serverDeaf
        );
        if (humans.length < 2) continue;
        for (const member of humans) activeMembers.add(member.id);
      }
      for (const userId of activeMembers) {
        const current = statements.getMemberLevel.get(guild.id, userId);
        await addXp(guild, userId, 10, current?.last_message_xp_at || 0, 'voice');
      }
    }
  }

  function startVoiceXp() {
    setInterval(() => {
      awardVoiceXp().catch((error) => console.error('خطأ في خبرة الصوت:', error));
    }, VOICE_XP_INTERVAL_MS);
  }

  async function createLevelBoardPayload(guildId, category = 'all', page = 0) {
    const counts = statements.getLevelXpSourceCounts.get(guildId);
    const globalCount = statements.getGlobalLevelXpCount.get(guildId).count;
    const globalPages = Math.ceil(globalCount / LEVEL_BOARD_PAGE_SIZE);
    const messagePages = Math.ceil(counts.message_count / LEVEL_BOARD_PAGE_SIZE);
    const voicePages = Math.ceil(counts.voice_count / LEVEL_BOARD_PAGE_SIZE);
    const pageCount = Math.max(
      ['all', 'global'].includes(category) ? globalPages : 0,
      ['all', 'messages'].includes(category) ? messagePages : 0,
      ['all', 'voice'].includes(category) ? voicePages : 0,
      1
    );
    const currentPage = Math.min(Math.max(page, 0), pageCount - 1);
    const offset = currentPage * LEVEL_BOARD_PAGE_SIZE;
    const embed = new EmbedBuilder()
      .setColor(0x2588c9)
      .setTitle('📋 تصنيفات XP')
      .setDescription('XP الإجمالي محسوب من مستوى العضو وخبرته المحفوظين. تصنيفا الرسائل والصوت المنفصلان يُحتسبان منذ تفعيل التتبع.');

    if (['all', 'global'].includes(category)) {
      const rows = statements.getGlobalLevelXpRanking.all(guildId, LEVEL_BOARD_PAGE_SIZE, offset);
      embed.addFields({
        name: '🏆 أعلى الأعضاء في XP الإجمالي',
        value: rows.length
          ? rows.map((row, index) => `**#${offset + index + 1}** · <@${row.user_id}>: **${row.xp.toLocaleString('en-US')} XP**`).join('\n')
          : 'لا توجد مستويات مسجلة بعد.'
      });
    }
    if (['all', 'messages'].includes(category)) {
      const rows = statements.getMessageLevelXpRanking.all(guildId, LEVEL_BOARD_PAGE_SIZE, offset);
      embed.addFields({
        name: '💬 XP الرسائل منذ تفعيل التتبع',
        value: rows.length
          ? rows.map((row, index) => `**#${offset + index + 1}** · <@${row.user_id}>: **${row.xp.toLocaleString('en-US')} XP**`).join('\n')
          : 'لا توجد نقاط رسائل مسجلة بعد.'
      });
    }
    if (['all', 'voice'].includes(category)) {
      const rows = statements.getVoiceLevelXpRanking.all(guildId, LEVEL_BOARD_PAGE_SIZE, offset);
      embed.addFields({
        name: '🎙️ أعلى الأعضاء في الصوت',
        value: rows.length
          ? rows.map((row, index) => `**#${offset + index + 1}** · <@${row.user_id}>: **${row.xp.toLocaleString('en-US')} XP**`).join('\n')
          : 'لا توجد نقاط صوت مسجلة بعد.'
      });
    }
    embed.setFooter({ text: `الصفحة ${currentPage + 1} من ${pageCount}` });

    const categoryMenu = new StringSelectMenuBuilder()
      .setCustomId(`level-board:category:${category}:${currentPage}`)
      .setPlaceholder('اختر تصنيف الخبرة')
      .addOptions(
        { label: 'الكل', value: 'all', default: category === 'all', emoji: '🏆' },
        { label: 'XP الإجمالي', value: 'global', default: category === 'global', emoji: '🌍' },
        { label: 'XP الرسائل الجديد', value: 'messages', default: category === 'messages', emoji: '💬' },
        { label: 'XP الصوت', value: 'voice', default: category === 'voice', emoji: '🎙️' }
      );
    const selectRow = new ActionRowBuilder().addComponents(categoryMenu);
    const pageRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`level-board:page:${category}:${currentPage - 1}`)
        .setLabel('◀')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0),
      new ButtonBuilder()
        .setCustomId(`level-board:page:${category}:${currentPage + 1}`)
        .setLabel('▶')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage >= pageCount - 1)
    );
    return { embeds: [embed], components: [selectRow, pageRow], allowedMentions: { parse: [] } };
  }

  async function handleComponent(interaction) {
    if (!interaction.customId.startsWith('level-board:')) return false;
    const [, action, currentCategory, rawPage] = interaction.customId.split(':');
    const page = Number(rawPage);
    const category = action === 'category' ? interaction.values[0] : currentCategory;
    if (!['category', 'page'].includes(action) || !LEVEL_BOARD_CATEGORIES.has(category) || !Number.isInteger(page)) {
      return interaction.reply({ content: 'تعذر تحديث لوحة التصنيفات. شغّل الأمر مرة أخرى.', ephemeral: true });
    }
    return interaction.update(await createLevelBoardPayload(interaction.guildId, category, page));
  }

  async function handleCommand(interaction) {
    if (interaction.commandName === 'اعطاء-لفل') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
        && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return replyHandled(interaction, { content: '⛔ إعطاء المستويات متاح للمسؤولين فقط.', ephemeral: true });
      }
      const user = interaction.options.getUser('العضو');
      if (user.bot) {
        return replyHandled(interaction, { content: '⛔ لا يمكن إعطاء مستويات لحساب بوت.', ephemeral: true });
      }
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) {
        return replyHandled(interaction, { content: '⛔ العضو المحدد غير موجود في هذا السيرفر.', ephemeral: true });
      }

      const levels = interaction.options.getInteger('العدد');
      const source = interaction.options.getString('التصنيف');
      const current = statements.getMemberLevel.get(interaction.guildId, user.id);
      let nextLevel = current?.level || 1;
      let xpToAdd = 0;
      for (let index = 0; index < levels; index += 1) {
        xpToAdd += xpForNextLevel(nextLevel);
        nextLevel += 1;
      }
      xpToAdd -= current?.xp || 0;

      await interaction.deferReply({ ephemeral: true });
      await addXp(interaction.guild, user.id, xpToAdd, current?.last_message_xp_at || 0, source);
      const categoryName = source === 'voice' ? 'فويس' : 'كتابة';
      await interaction.editReply({
        content: `✅ تم إعطاء ${user} **${levels}** مستوى بتصنيف **${categoryName}**. المستوى الجديد: **${nextLevel}**.`
      });
      return true;
    }
    if (interaction.commandName === 'تصنيفات') {
      return replyHandled(interaction, await createLevelBoardPayload(interaction.guildId));
    }
    if (interaction.commandName === 'لفل-إعداد') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
        && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return replyHandled(interaction, { content: '⛔ إعداد روم المستويات متاح للمسؤولين فقط.', ephemeral: true });
      }
      const channel = interaction.options.getChannel('الروم');
      const botPermissions = channel.permissionsFor(interaction.guild.members.me);
      if (!botPermissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
        return replyHandled(interaction, { content: '⛔ أحتاج صلاحية عرض الروم وإرسال الرسائل فيه.', ephemeral: true });
      }
      statements.setLevelChannel.run(interaction.guildId, channel.id);
      return replyHandled(interaction, { content: `✅ تم تحديد ${channel} لإعلانات ارتقاء المستوى.`, ephemeral: true });
    }
    if (interaction.commandName === 'لفل-فويس') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
        && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return replyHandled(interaction, { content: '⛔ إعداد روم إعلانات مستويات الصوت متاح للمسؤولين فقط.', ephemeral: true });
      }
      const channel = interaction.options.getChannel('الروم');
      const botMember = interaction.guild.members.me || await interaction.guild.members.fetch(client.user.id);
      if (!channel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
        return replyHandled(interaction, { content: '⛔ أحتاج صلاحية عرض الروم وإرسال الرسائل فيه.', ephemeral: true });
      }
      statements.setVoiceLevelChannel.run(interaction.guildId, channel.id);
      return replyHandled(interaction, { content: `✅ تم تحديد ${channel} لإعلانات ارتقاء المستوى المكتسب من الصوت.`, ephemeral: true });
    }
    if (interaction.commandName === 'إعداد_جوائز_المستويات') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
        && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return replyHandled(interaction, { content: '⛔ إعداد جوائز المستويات متاح للمسؤولين فقط.', ephemeral: true });
      }
      const selectedRole = interaction.options.getRole('الرتبة');
      const role = await interaction.guild.roles.fetch(selectedRole.id);
      if (!role) {
        return replyHandled(interaction, { content: '⛔ الرتبة المحددة غير موجودة في هذا السيرفر.', ephemeral: true });
      }
      const botMember = interaction.guild.members.me || await interaction.guild.members.fetch(client.user.id);
      if (role.guild.id !== interaction.guildId || role.managed || role.id === interaction.guildId
        || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)
        || role.comparePositionTo(botMember.roles.highest) >= 0) {
        return replyHandled(interaction, {
          content: '⛔ لا يمكنني منح هذه الرتبة. تأكد من وجود صلاحية «إدارة الرتب» للبوت وأن رتبة البوت أعلى من الرتبة المطلوبة.',
          ephemeral: true
        });
      }
      const level = interaction.options.getInteger('المستوى');
      statements.setLevelReward.run(interaction.guildId, level, role.id);
      return replyHandled(interaction, {
        content: `✅ تم حفظ جائزة المستوى **${level}**: سيحصل العضو على ${role} عند وصوله إلى هذا المستوى.`,
        ephemeral: true
      });
    }
    if (interaction.commandName === 'عرض_جوائز_المستويات') {
      const rewards = statements.getLevelRewards.all(interaction.guildId);
      if (rewards.length === 0) {
        return replyHandled(interaction, { content: '📋 لا توجد جوائز مستويات محفوظة في هذا السيرفر.', ephemeral: true });
      }
      const pageSize = 25;
      const pageCount = Math.ceil(rewards.length / pageSize);
      const page = interaction.options.getInteger('الصفحة') || 1;
      if (page > pageCount) {
        return replyHandled(interaction, { content: `⚠️ لا توجد هذه الصفحة. عدد الصفحات: **${pageCount}**.`, ephemeral: true });
      }
      const pageRewards = rewards.slice((page - 1) * pageSize, page * pageSize);
      const description = pageRewards.map((reward) => {
        const role = interaction.guild.roles.cache.get(reward.role_id);
        return `**المستوى ${reward.level}:** ${role || `رتبة محذوفة (\`${reward.role_id}\`)`}`;
      }).join('\n');
      const embed = new EmbedBuilder()
        .setColor(0x34a36a)
        .setTitle('🏆 جوائز المستويات')
        .setDescription(description)
        .setFooter({ text: `الصفحة ${page} من ${pageCount}` });
      return replyHandled(interaction, { embeds: [embed], ephemeral: true });
    }
    if (interaction.commandName === 'حذف_جائزة_مستوى') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
        && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return replyHandled(interaction, { content: '⛔ حذف جوائز المستويات متاح للمسؤولين فقط.', ephemeral: true });
      }
      const level = interaction.options.getInteger('المستوى');
      const result = statements.deleteLevelReward.run(interaction.guildId, level);
      if (result.changes === 0) {
        return replyHandled(interaction, { content: `⚠️ لا توجد جائزة محفوظة للمستوى **${level}**.`, ephemeral: true });
      }
      return replyHandled(interaction, { content: `✅ تم حذف جائزة المستوى **${level}**.`, ephemeral: true });
    }
    if (interaction.commandName !== 'لفل') return false;

    const user = interaction.options.getUser('العضو') || interaction.user;
    const record = statements.getMemberLevel.get(interaction.guildId, user.id);
    const level = record?.level || 1;
    const xp = record?.xp || 0;
    const required = xpForNextLevel(level);
    const embed = new EmbedBuilder()
      .setColor(0x34a36a)
      .setTitle('📈 مستوى العضو')
      .setDescription(`👤 **العضو:** <@${user.id}>\n🏅 **المستوى:** ${level}\n${progressBar(xp, required)}\n✨ **الخبرة:** ${xp} / ${required} XP\n🎯 **المتبقي للمستوى التالي:** ${required - xp} XP`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .setTimestamp();
    return replyHandled(interaction, { embeds: [embed] });
  }

  return { awardVoiceXp, handleCommand, handleComponent, handleMessage, startVoiceXp };
}

module.exports = { createLevelSystem, xpForNextLevel };
