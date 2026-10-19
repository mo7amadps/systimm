require('dotenv').config();
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { statements } = require('./database');
const { createCommunityGames } = require('./community-games');
const { createAfkSystem } = require('./afk');
const { createLevelSystem } = require('./levels');

const { DISCORD_TOKEN } = process.env;
if (!DISCORD_TOKEN) {
  console.error('ضع توكن البوت في ملف .env باسم DISCORD_TOKEN.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ]
});
const communityGames = createCommunityGames(client, statements);
const afkSystem = createAfkSystem(statements);
const levelSystem = createLevelSystem(client, statements);
const bulkDmState = new Map();
const messageRewardState = new Map();
const MESSAGE_REWARD_EVERY = 30;
const MESSAGE_REWARD_COOLDOWN_MS = 5000;

const AY_CURRENCY_NAME = 'AY';
const AY_EMOJI = '🪙';

const COLORS = { blue: 0x2588c9, green: 0x168a55, red: 0xd93645, gray: 0x34363c };
const APPLICATION_QUESTIONS = [
  'ما هو اسمك الحقيقي؟',
  'ما هو عمرك الحقيقي؟',
  'ما هو بلدك؟',
  'ماذا ستفيد السيرفر؟',
  'هل سبق لك أن كنت إداريًا في سيرفر؟'
];

function baseEmbed(title, description) {
  return new EmbedBuilder().setColor(COLORS.blue)
    .setTitle(`✨ ${title}`)
    .setDescription(`📌 ${description}`)
    .setTimestamp();
}

function helpEmbed() {
  return baseEmbed('مساعدة AY Community', 'الأوامر مرتبة حسب تصنيفها. الخيارات بين الأقواس المربعة اختيارية.')
    .addFields(
      {
        name: '🛡️ الإدارة',
        value: '`/ارسال روم الرسالة` · `/رسالة_خاصة` · `/اعطاء-عملة عضو الكمية [سبب]` · `/مسح العدد` · `/رتبة عضو الرتبة` · `/تايم عضو مدة` · `/تكلم عضو`\n`/قفل-روم [الروم]` · `/فتح-روم [الروم]` · `/طرد عضو [السبب]`\n`/بان عضو [السبب]` · `/رفع-بان الآيدي [السبب]`\n`/رد-تلقائي الكلمة الرد` لإضافة رد، و`/الردود-التلقائية` لعرضه، و`/مسح-رد-تلقائي` لاختيار رد وحذفه.'
      },
      {
        name: '📋 المعلومات والتحذيرات',
        value: '`/معلومات [العضو]` · `/تحذير عضو السبب` · `/عرض-تحذيرات عضو`\n`/إزالة-تحذيرات عضو` · `/أخبار روم الرسالة` · `/بينغ`'
      },
      {
        name: '📈 المستويات',
        value: '`/لفل [العضو]` لعرض المستوى والتقدم، و`/اعطاء-لفل العضو العدد التصنيف` لمنح مستويات تُسجّل كخبرة كتابة أو فويس، و`/لفل-إعداد الروم` لتحديد روم التهاني، و`/لفل-فويس الروم` لتخصيص روم تهاني ارتقاء الصوت.\n`/تصنيفات` لعرض لوحة ترتيب XP للرسائل والصوت. أوامر الجوائز: `/إعداد_جوائز_المستويات المستوى الرتبة` و`/عرض_جوائز_المستويات [الصفحة]` و`/حذف_جائزة_مستوى المستوى`.'
      },
      {
        name: '🎫 الدعم والتقديم',
        value: '`/تذاكر-إعداد روم رتبة-الدعم`\n`/تقديم-إعداد روم-اللوحة روم-الطلبات`'
      },
      {
        name: '🎮 السحوبات والألعاب',
        value: '`/سحب روم الجائزة المدة عدد-الفائزين` · `/روليت روم`\n`/زر-أخضر روم` · `/تخمين-البلد روم` · `/تخمين-الشخصية روم`\n`/خمن-الصورة روم` · `/ميم`'
      },
      {
        name: '🪙 العملة',
        value: '`/محفظة [العضو]` لعرض الرصيد، و`/إرسال-عملة عضو الكمية` لإرسال AY 🪙 إلى عضو آخر.'
      },
      {
        name: '💤 أوامر الأعضاء',
        value: '`/afk [السبب]` لتفعيل الغياب، و`/مساعدة` لعرض هذه القائمة.'
      }
    )
    .setFooter({ text: 'ℹ️ تختلف صلاحية استخدام بعض الأوامر حسب دورك في السيرفر.' });
}

function adminAllowed(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

function resolveWallet(guildId, userId) {
  const row = statements.getWalletBalance.get(guildId, userId);
  if (row) return row;
  statements.createWalletBalance.run(guildId, userId, 0);
  return { guild_id: guildId, user_id: userId, coins: 0 };
}

function adjustWallet(guildId, userId, delta) {
  const current = resolveWallet(guildId, userId);
  const next = Math.max(0, current.coins + delta);
  statements.setWalletBalance.run(next, guildId, userId);
  return next;
}

async function requireAdmin(interaction) {
  if (adminAllowed(interaction)) return true;
  await interaction.reply({ content: '⛔ ليس لديك صلاحية إدارة السيرفر لاستخدام هذا الإجراء.', ephemeral: true });
  return false;
}

async function replyError(interaction, message) {
  const content = `❌ ${message}`;
  const payload = { content, ephemeral: true };
  if (interaction.deferred && !interaction.replied) await interaction.editReply({ content, embeds: [], components: [] });
  else if (interaction.replied) await interaction.followUp(payload);
  else await interaction.reply(payload);
}

async function fetchMember(guild, userId) {
  try {
    return await guild.members.fetch(userId);
  } catch {
    return null;
  }
}

async function clearMessages(interaction) {
  const memberPermissions = interaction.memberPermissions;
  if (!memberPermissions?.has(PermissionFlagsBits.ManageMessages)
    && !memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '⛔ تحتاج إلى صلاحية إدارة الرسائل لاستخدام هذا الأمر.', ephemeral: true });
  }
  const botPermissions = interaction.channel.permissionsFor(interaction.guild.members.me);
  if (!botPermissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageMessages])) {
    return interaction.reply({ content: '⛔ أحتاج إلى صلاحية عرض الروم وإدارة الرسائل فيه.', ephemeral: true });
  }
  await interaction.deferReply({ ephemeral: true });
  const requested = interaction.options.getInteger('العدد');
  const deleted = await interaction.channel.bulkDelete(requested, true);
  const skipped = requested - deleted.size;
  const note = skipped > 0
    ? ` ⚠️ تعذر حذف ${skipped} رسالة؛ قد تكون أقدم من 14 يومًا أو لا توجد رسائل كافية.`
    : '';
  return interaction.editReply({ content: `✅ تم حذف ${deleted.size} من أصل ${requested} رسالة.${note}` });
}

async function sendBulkDmToGuild(interaction, messageText) {
  const guildMembers = await interaction.guild.members.fetch().catch(() => interaction.guild.members.cache);
  const seen = new Set();
  let sent = 0;
  let failed = 0;
  let blocked = 0;
  let otherFailed = 0;
  const members = Array.from(guildMembers.values()).filter((member) => !member.user.bot);

  for (let index = 0; index < members.length; index += 1) {
    const member = members[index];
    if (seen.has(member.id) || member.user.bot) continue;
    seen.add(member.id);
    try {
      const mention = `<@${member.id}>`;
      const message = messageText.slice(0, 2000 - mention.length - 2).replace(/[\uD800-\uDBFF]$/, '');
      await member.send({
        content: `${message}\n\n${mention}`,
        allowedMentions: { users: [member.id] }
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      if (error.code === 50007) blocked += 1;
      else otherFailed += 1;
    }
    if ((index + 1) % 5 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return { total: members.length, sent, failed, blocked, otherFailed };
}

async function handleCommand(interaction) {
  if (interaction.commandName === 'مساعدة') return interaction.reply({ embeds: [helpEmbed()] });
  if (['رد-تلقائي', 'مسح-رد-تلقائي', 'الردود-التلقائية'].includes(interaction.commandName)) {
    return communityGames.handleAutoReplyCommand(interaction);
  }
  if (await levelSystem.handleCommand(interaction)) return;
  if (await afkSystem.handleCommand(interaction)) return;
  if (await communityGames.handleCommand(interaction)) return;
  if (interaction.replied || interaction.deferred) return;
  if (interaction.commandName === 'مسح') return clearMessages(interaction);
  if (interaction.commandName === 'محفظة') {
    const target = interaction.options.getUser('العضو') || interaction.user;
    const wallet = resolveWallet(interaction.guildId, target.id);
    return interaction.reply({ content: `💰 رصيد ${target} في عملة ${AY_CURRENCY_NAME} ${AY_EMOJI}: **${wallet.coins}**`, ephemeral: true });
  }
  if (interaction.commandName === 'إرسال-عملة') {
    const target = interaction.options.getUser('العضو');
    const amount = interaction.options.getInteger('الكمية');
    if (target.id === interaction.user.id) return interaction.reply({ content: '❌ لا يمكنك إرسال العملات إلى نفسك.', ephemeral: true });
    const senderBalance = resolveWallet(interaction.guildId, interaction.user.id).coins;
    if (senderBalance < amount) return interaction.reply({ content: `⚠️ رصيدك غير كافٍ. لديك ${senderBalance} ${AY_EMOJI}, وتحتاج ${amount}.`, ephemeral: true });
    const senderRemaining = adjustWallet(interaction.guildId, interaction.user.id, -amount);
    const recipientBalance = adjustWallet(interaction.guildId, target.id, amount);
    return interaction.reply({ content: `✅ تم إرسال **${amount}** ${AY_EMOJI} إلى ${target}.\n💰 رصيدك الآن: **${senderRemaining}**\n💰 رصيد ${target}: **${recipientBalance}**`, ephemeral: true });
  }
  if (interaction.commandName === 'اعطاء-عملة') {
    if (!await requireAdmin(interaction)) return;
    const target = interaction.options.getUser('العضو');
    const amount = interaction.options.getInteger('الكمية');
    const reason = interaction.options.getString('السبب') || 'إعطاء يدوي';
    const current = resolveWallet(interaction.guildId, target.id).coins;
    const updated = adjustWallet(interaction.guildId, target.id, amount);
    return interaction.reply({ content: `✅ تم إعطاء **${amount}** ${AY_EMOJI} إلى ${target} (${reason}).\n💰 الرصيد الحالي: **${updated}**\n📊 الرصيد السابق: **${current}**`, ephemeral: true });
  }
  if (interaction.commandName === 'رسالة_خاصة') {
    if (!await requireAdmin(interaction)) return;
    const modal = new ModalBuilder().setCustomId('bulk-dm-submit').setTitle('📨 إرسال رسالة خاصة');
    const messageInput = new TextInputBuilder()
      .setCustomId('bulk-dm-message')
      .setLabel('📝 نص الرسالة')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(2000);
    modal.addComponents(new ActionRowBuilder().addComponents(messageInput));
    return interaction.showModal(modal);
  }
  if (interaction.commandName !== 'بينغ' && !await requireAdmin(interaction)) return;
  await interaction.deferReply({ ephemeral: interaction.commandName !== 'بينغ' });
  const { guild, member } = interaction;

  switch (interaction.commandName) {
    case 'ارسال': {
      const channel = interaction.options.getChannel('روم');
      const content = interaction.options.getString('الرسالة');
      const permissions = channel.permissionsFor(guild.members.me);
      if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
        return replyError(interaction, 'لا أملك صلاحية عرض هذا الروم وإرسال الرسائل فيه.');
      }
      await channel.send({ content, allowedMentions: { parse: [] } });
      return interaction.editReply({ content: `✅ تم إرسال الرسالة في ${channel}.` });
    }
    case 'رتبة': {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)
        && !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return replyError(interaction, 'تحتاج إلى صلاحية إدارة الرتب لاستخدام هذا الأمر.');
      }
      const target = await fetchMember(guild, interaction.options.getUser('عضو').id);
      const role = interaction.options.getRole('الرتبة');
      const botMember = guild.members.me;
      if (!target) return replyError(interaction, 'لم أتمكن من العثور على العضو المحدد في السيرفر.');
      if (target.id === interaction.user.id) return replyError(interaction, 'لا يمكنك إعطاء رتبة لنفسك بهذا الأمر.');
      if (role.managed || role.id === guild.id) return replyError(interaction, 'لا يمكن إعطاء هذه الرتبة يدويًا.');
      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) return replyError(interaction, 'أحتاج إلى صلاحية إدارة الرتب.');
      if (role.position >= botMember.roles.highest.position) return replyError(interaction, 'رتبة البوت يجب أن تكون أعلى من الرتبة المطلوبة.');
      if (target.roles.highest.position >= botMember.roles.highest.position) return replyError(interaction, 'لا أستطيع تعديل رتب هذا العضو بسبب ترتيب الرتب.');
      await target.roles.add(role, `منحها ${interaction.user.tag}`);
      return interaction.editReply({ content: `✅ تم إعطاء ${role} إلى ${target}.` });
    }
    case 'تايم': {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)
        && !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return replyError(interaction, 'تحتاج إلى صلاحية مهلة الأعضاء لاستخدام هذا الأمر.');
      }
      const target = await fetchMember(guild, interaction.options.getUser('عضو').id);
      const durationText = interaction.options.getString('مدة');
      const durationMatch = durationText.match(/^([1-9]\d*)\s*(s|m|h|d|w|ث|د|س|ي|أ)$/i);
      if (!durationMatch) return replyError(interaction, 'صيغة المدة غير صحيحة. استخدم مثلًا 30m أو 2h أو 3d.');
      if (!target) return replyError(interaction, 'لم أتمكن من العثور على العضو المحدد في السيرفر.');
      const units = { s: 1000, ث: 1000, m: 60000, د: 60000, h: 3600000, س: 3600000, d: 86400000, ي: 86400000, w: 604800000, أ: 604800000 };
      const duration = Number(durationMatch[1]) * units[durationMatch[2].toLowerCase()];
      if (!Number.isSafeInteger(duration) || duration > 28 * 86400000) return replyError(interaction, 'الحد الأقصى للمهلة هو 28 يومًا.');
      if (!guild.members.me.permissions.has(PermissionFlagsBits.ModerateMembers)) return replyError(interaction, 'أحتاج إلى صلاحية مهلة الأعضاء.');
      if (!target.moderatable) return replyError(interaction, 'لا أستطيع إعطاء هذه المهلة بسبب صلاحياتي أو ترتيب الرتب.');
      await target.timeout(duration, `بواسطة ${interaction.user.tag}`);
      return interaction.editReply({ content: `✅ تم إعطاء ${target} مهلة لمدة ${durationText}.` });
    }
    case 'تكلم': {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)
        && !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return replyError(interaction, 'تحتاج إلى صلاحية مهلة الأعضاء لاستخدام هذا الأمر.');
      }
      const target = await fetchMember(guild, interaction.options.getUser('عضو').id);
      if (!target) return replyError(interaction, 'لم أتمكن من العثور على العضو المحدد في السيرفر.');
      if (!guild.members.me.permissions.has(PermissionFlagsBits.ModerateMembers) || !target.moderatable) {
        return replyError(interaction, 'لا أستطيع إزالة المهلة عن هذا العضو؛ تحقق من صلاحية البوت وترتيب رتبته.');
      }
      await target.timeout(null, `إزالة المهلة بواسطة ${interaction.user.tag}`);
      return interaction.editReply({ content: `✅ تمت إزالة المهلة عن ${target}.` });
    }
    case 'معلومات':
      return interaction.options.getUser('العضو')
        ? showMemberInfo(interaction, interaction.options.getUser('العضو'))
        : showGuildInfo(interaction);
    case 'تحذير': {
      const target = interaction.options.getUser('عضو');
      const reason = interaction.options.getString('السبب');
      const result = statements.addWarning.run(guild.id, target.id, reason, interaction.user.id, new Date().toISOString());
      const embed = baseEmbed('تم تسجيل التحذير', `العضو: ${target}\nالمسؤول: ${interaction.user}\nالسبب: ${reason}`)
        .setFooter({ text: `رقم التحذير: ${result.lastInsertRowid}` });
      return interaction.editReply({ embeds: [embed] });
    }
    case 'عرض-تحذيرات':
      return showWarnings(interaction, interaction.options.getUser('عضو'));
    case 'إزالة-تحذيرات':
      return beginWarningDeletion(interaction, interaction.options.getUser('عضو'));
    case 'أخبار': {
      const channel = interaction.options.getChannel('روم');
      const permissions = channel.permissionsFor(guild.members.me);
      if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.MentionEveryone])) {
        return replyError(interaction, 'لا أملك صلاحيات إرسال الرسائل ومنشن الجميع في هذا الروم.');
      }
      const senderPermissions = channel.permissionsFor(member);
      if (!senderPermissions?.has(PermissionFlagsBits.MentionEveryone)) {
        return replyError(interaction, 'تحتاج إلى صلاحية منشن الجميع في الروم المحدد لإرسال الخبر.');
      }
      const message = interaction.options.getString('الرسالة');
      await channel.send({ content: `📢 @everyone\n${message}`, allowedMentions: { parse: ['everyone'] } });
      return interaction.editReply({ content: `✅ تم إرسال الخبر في ${channel}.` });
    }
    case 'قفل-روم':
    case 'فتح-روم': {
      const channel = interaction.options.getChannel('الروم') || interaction.channel;
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)
        && !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return replyError(interaction, 'تحتاج إلى صلاحية إدارة القنوات لهذا الأمر.');
      }
      if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return replyError(interaction, 'أحتاج إلى صلاحية إدارة القنوات لتنفيذ هذا الإجراء.');
      }
      if (interaction.commandName === 'قفل-روم') {
        if (statements.getChannelLock.get(channel.id, guild.id)) {
          return replyError(interaction, 'هذا الروم مقفول بالفعل بواسطة البوت.');
        }
        const everyoneOverwrite = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);
        const previousState = everyoneOverwrite?.deny.has(PermissionFlagsBits.SendMessages)
          ? 'deny'
          : everyoneOverwrite?.allow.has(PermissionFlagsBits.SendMessages) ? 'allow' : 'inherit';
        if (previousState === 'deny') return replyError(interaction, 'الروم يمنع الكتابة بالفعل حسب إعداداته الحالية.');
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }, `قفل بواسطة ${interaction.user.tag}`);
        statements.saveChannelLock.run(channel.id, guild.id, previousState, interaction.user.id, new Date().toISOString());
        return interaction.editReply({ content: `🔒 تم قفل الكتابة في ${channel} على الأعضاء.` });
      }
      const lock = statements.getChannelLock.get(channel.id, guild.id);
      if (!lock) return replyError(interaction, 'لا يوجد قفل مسجل لهذا الروم بواسطة البوت.');
      const priorPermission = lock.previous_send_state === 'allow'
        ? true
        : lock.previous_send_state === 'deny' ? false : null;
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: priorPermission }, `فتح بواسطة ${interaction.user.tag}`);
      statements.deleteChannelLock.run(channel.id, guild.id);
      return interaction.editReply({ content: `🔓 تمت إعادة إعداد الكتابة السابق في ${channel}.` });
    }
    case 'طرد':
    case 'بان': {
      const isBan = interaction.commandName === 'بان';
      const permission = isBan ? PermissionFlagsBits.BanMembers : PermissionFlagsBits.KickMembers;
      const action = isBan ? 'الحظر' : 'الطرد';
      if (!interaction.memberPermissions.has(permission)
        && !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return replyError(interaction, `تحتاج إلى صلاحية ${action} الأعضاء لهذا الأمر.`);
      }
      if (!guild.members.me.permissions.has(permission)) {
        return replyError(interaction, `أحتاج إلى صلاحية ${action} الأعضاء.`);
      }
      const target = await fetchMember(guild, interaction.options.getUser('عضو').id);
      if (!target) return replyError(interaction, 'لم أتمكن من العثور على العضو المحدد في السيرفر.');
      if (target.id === interaction.user.id) return replyError(interaction, `لا يمكنك ${action} نفسك.`);
      if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)
        && target.roles.highest.position >= member.roles.highest.position) {
        return replyError(interaction, `لا يمكنك ${action} عضو رتبته مساوية لرتبتك أو أعلى منها.`);
      }
      if (isBan ? !target.bannable : !target.kickable) {
        return replyError(interaction, `لا أستطيع ${action} هذا العضو. تحقق من ترتيب رتبة البوت.`);
      }
      const reason = interaction.options.getString('السبب') || `بواسطة ${interaction.user.tag}`;
      if (isBan) await target.ban({ reason });
      else await target.kick(reason);
      return interaction.editReply({ content: `✅ تم ${action} ${target.user.tag}. السبب: ${reason}` });
    }
    case 'رفع-بان': {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.BanMembers)
        && !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return replyError(interaction, 'تحتاج إلى صلاحية حظر الأعضاء لرفع الحظر.');
      }
      if (!guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) {
        return replyError(interaction, 'أحتاج إلى صلاحية حظر الأعضاء لرفع الحظر.');
      }
      const userId = interaction.options.getString('الآيدي').trim();
      if (!/^\d{17,20}$/.test(userId)) return replyError(interaction, 'آيدي العضو غير صالح.');
      const ban = await guild.bans.fetch(userId).catch(() => null);
      if (!ban) return replyError(interaction, 'هذا العضو غير محظور في السيرفر أو الآيدي غير صحيح.');
      const reason = interaction.options.getString('السبب') || `رفع الحظر بواسطة ${interaction.user.tag}`;
      await guild.bans.remove(userId, reason);
      return interaction.editReply({ content: `✅ تم رفع الحظر عن ${ban.user.tag}. السبب: ${reason}` });
    }
    case 'بينغ': {
      const embed = baseEmbed('زمن الاستجابة', `استجابة البوت: **${client.ws.ping} مللي ثانية**`);
      return interaction.editReply({ embeds: [embed] });
    }
    case 'تذاكر-إعداد':
      return setupTickets(interaction);
    case 'تقديم-إعداد':
      return setupApplications(interaction);
    default:
      console.error(`وصل أمر Slash بلا معالج في نسخة البوت الحالية: ${interaction.commandName}`);
      return replyError(interaction, `الأمر «${interaction.commandName}» مسجل في Discord لكن لا يوجد له معالج في نسخة البوت الحالية. أعد تشغيل البوت من مجلد المشروع المحدّث.`);
  }
}

async function showGuildInfo(interaction) {
  const guild = interaction.guild;
  let members;
  try {
    members = await guild.members.fetch();
  } catch {
    members = guild.members.cache;
  }
  const bots = members.filter((entry) => entry.user.bot).size;
  const embed = baseEmbed('معلومات السيرفر', `**الاسم:** ${guild.name}\n**الأعضاء:** ${guild.memberCount}\n**البوتات:** ${bots}\n**الرومات:** ${guild.channels.cache.size}\n**الرتب:** ${guild.roles.cache.size}\n**تاريخ الإنشاء:** <t:${Math.floor(guild.createdTimestamp / 1000)}:F>`);
  if (guild.iconURL()) embed.setThumbnail(guild.iconURL({ size: 256 }));
  return interaction.editReply({ embeds: [embed] });
}

async function showMemberInfo(interaction, user) {
  const member = await fetchMember(interaction.guild, user.id);
  if (!member) return replyError(interaction, 'لم أتمكن من العثور على العضو المحدد في السيرفر.');
  const roleList = member.roles.cache.filter((role) => role.id !== interaction.guild.id)
    .sort((left, right) => right.position - left.position).map((role) => role.toString()).join('، ') || 'لا توجد رتب';
  const statusNames = { online: 'متصل', idle: 'خامل', dnd: 'عدم الإزعاج', offline: 'غير متصل' };
  const status = interaction.guild.presences.cache.get(user.id)?.status;
  const embed = baseEmbed('معلومات العضو', `**الاسم:** ${user.globalName || user.username}\n**المنشن:** <@${user.id}>\n**الآيدي:** ${user.id}\n**انضم للسيرفر:** ${member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : 'غير متاح'}\n**إنشاء الحساب:** <t:${Math.floor(user.createdTimestamp / 1000)}:F>\n**النوع:** ${user.bot ? 'بوت' : 'عضو'}\n**الحالة:** ${statusNames[status] || 'غير متاحة'}\n**الرتب:** ${roleList}`);
  if (user.displayAvatarURL()) embed.setThumbnail(user.displayAvatarURL({ size: 256 }));
  return interaction.editReply({ embeds: [embed] });
}

async function showWarnings(interaction, user) {
  const warnings = statements.getWarnings.all(interaction.guildId, user.id);
  if (!warnings.length) return interaction.editReply({ content: `ℹ️ لا توجد تحذيرات مسجلة على ${user}.` });
  const pages = [];
  for (let index = 0; index < warnings.length; index += 5) {
    const embed = baseEmbed('سجل التحذيرات', `👤 **العضو:** ${user}\n📊 **إجمالي التحذيرات:** ${warnings.length}`);
    for (const warning of warnings.slice(index, index + 5)) {
      const moderator = await interaction.client.users.fetch(warning.moderator_id).catch(() => null);
      embed.addFields({
        name: `⚠️ تحذير #${warning.id}`,
        value: `📝 **السبب:** ${warning.reason.slice(0, 850)}\n🛡️ **المسؤول:** ${moderator ? moderator.tag : warning.moderator_id}\n🕒 **التاريخ:** <t:${Math.floor(new Date(warning.created_at).getTime() / 1000)}:F>`
      });
    }
    pages.push(embed);
  }
  await interaction.editReply({ embeds: [pages[0]] });
  for (const page of pages.slice(1)) await interaction.followUp({ embeds: [page], ephemeral: true });
}

async function beginWarningDeletion(interaction, user) {
  const warnings = statements.getWarnings.all(interaction.guildId, user.id);
  if (!warnings.length) return interaction.editReply({ content: `ℹ️ لا توجد تحذيرات لحذفها عن ${user}.` });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`warning-delete:${interaction.user.id}:${user.id}`)
    .setLabel('🗑️ تأكيد حذف التحذيرات').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`warning-cancel:${interaction.user.id}`).setLabel('❌ إلغاء').setStyle(ButtonStyle.Secondary)
  );
  return interaction.editReply({
    content: `⚠️ سيتم حذف **${warnings.length}** تحذيرًا عن ${user}. تأكد من العضو قبل المتابعة.`,
    components: [row]
  });
}

function getSettings(guildId) {
  return statements.getSettings.get(guildId);
}

function saveSettings(guildId, updates) {
  const previous = getSettings(guildId) || {};
  statements.saveSettings.run({
    guild_id: guildId,
    ticket_channel_id: updates.ticket_channel_id ?? previous.ticket_channel_id ?? null,
    support_role_id: updates.support_role_id ?? previous.support_role_id ?? null,
    application_panel_channel_id: updates.application_panel_channel_id ?? previous.application_panel_channel_id ?? null,
    application_review_channel_id: updates.application_review_channel_id ?? previous.application_review_channel_id ?? null
  });
}

async function setupTickets(interaction) {
  const channel = interaction.options.getChannel('روم');
  const supportRole = interaction.options.getRole('رتبة-الدعم');
  if (supportRole.id === interaction.guild.id) {
    return replyError(interaction, 'لا يمكن استخدام @everyone كرتبة دعم؛ اختر رتبة خاصة بفريق الدعم.');
  }
  const permissions = channel.permissionsFor(interaction.guild.members.me);
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    return replyError(interaction, 'أحتاج صلاحيات عرض الروم وإرسال الرسائل والروابط المضمنة لنشر اللوحة.');
  }
  saveSettings(interaction.guildId, { ticket_channel_id: channel.id, support_role_id: supportRole.id });
  const embed = baseEmbed('الدعم الفني', 'اضغط الزر أدناه لفتح تذكرة خاصة. اكتب تفاصيل طلبك داخلها، ولن يراها إلا أنت وفريق الدعم.');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket-open').setLabel('🎫 فتح تذكرة').setStyle(ButtonStyle.Primary)
  );
  await channel.send({ embeds: [embed], components: [row] });
  return interaction.editReply({ content: `✅ تم إعداد لوحة الدعم الفني في ${channel} وربطها بالرتبة ${supportRole}.` });
}

async function setupApplications(interaction) {
  const panelChannel = interaction.options.getChannel('روم-اللوحة');
  const reviewChannel = interaction.options.getChannel('روم-الطلبات');
  for (const channel of [panelChannel, reviewChannel]) {
    const permissions = channel.permissionsFor(interaction.guild.members.me);
    if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
      return replyError(interaction, `أحتاج صلاحيات عرض ${channel} وإرسال الرسائل والروابط المضمنة فيه.`);
    }
  }
  saveSettings(interaction.guildId, {
    application_panel_channel_id: panelChannel.id,
    application_review_channel_id: reviewChannel.id
  });
  const embed = baseEmbed('التقديم للإدارة', 'اضغط الزر أدناه واملأ نموذج التقديم للإدارة. أجب عن الأسئلة بدقة.');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('application-open').setLabel('📝 تقديم طلب').setStyle(ButtonStyle.Success)
  );
  await panelChannel.send({ embeds: [embed], components: [row] });
  return interaction.editReply({ content: `✅ تم نشر لوحة التقديم في ${panelChannel} وتحديد روم استقبال الطلبات ${reviewChannel}.` });
}

async function handleButton(interaction) {
  if (await communityGames.handleAutoReplyDeletePage(interaction)) return;
  if (await communityGames.handleButton(interaction)) return;
  const [action, first, second] = interaction.customId.split(':');
  if (action === 'bulk-dm-confirm' || action === 'bulk-dm-cancel') {
    if (interaction.user.id !== first) return replyError(interaction, 'هذا التأكيد مخصص للمسؤول الذي بدأ العملية.');
    if (action === 'bulk-dm-cancel') {
      bulkDmState.delete(first);
      return interaction.update({ content: '✅ تم إلغاء إرسال الرسالة الخاصة.', components: [] });
    }

    await interaction.deferUpdate();
    const state = bulkDmState.get(first);
    if (!state || state.guildId !== interaction.guildId) {
      return interaction.editReply({ content: '⚠️ انتهت صلاحية تأكيد الرسالة أو تم إلغاؤها.', components: [] });
    }

    bulkDmState.delete(first);
    const result = await sendBulkDmToGuild(interaction, state.message);
    const processed = result.sent + result.failed;
    const successRate = processed === 0 ? 0 : Math.round((result.sent / processed) * 100);
    const failureDetails = [
      result.blocked > 0 ? `🔒 تعذّر الوصول لخاص العضو: ${result.blocked}` : null,
      result.otherFailed > 0 ? `⚠️ أخطاء أخرى: ${result.otherFailed}` : null
    ].filter(Boolean);
    return interaction.editReply({
      content: [
        '📨 **تقرير الرسائل الخاصة**',
        `👥 الأعضاء المستهدفون (باستثناء البوتات): ${result.total}`,
        `✅ الرسائل الناجحة: ${result.sent}`,
        `❌ الرسائل الفاشلة: ${result.failed}`,
        `📊 نسبة النجاح: ${successRate}%`,
        `📌 الإجمالي المعالج: ${processed} من ${result.total}`,
        ...failureDetails
      ].join('\n'),
      components: []
    });
  }
  if (action === 'application-open') {
    const modal = new ModalBuilder().setCustomId('application-submit').setTitle('📝 طلب تقديم للإدارة');
    const fields = APPLICATION_QUESTIONS.map((question, index) => new TextInputBuilder()
      .setCustomId(`answer-${index + 1}`).setLabel(`📝 ${question}`)
      .setStyle(index === 3 || index === 4 ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(true).setMaxLength(index === 1 ? 3 : 1000));
    modal.addComponents(...fields.map((field) => new ActionRowBuilder().addComponents(field)));
    return interaction.showModal(modal);
  }
  if (action === 'ticket-open') return openTicket(interaction);
  if (action === 'warning-cancel') {
    if (interaction.user.id !== first) return replyError(interaction, 'هذا التأكيد مخصص للمسؤول الذي بدأه.');
    return interaction.update({ content: '✅ تم إلغاء العملية.', components: [] });
  }
  if (action === 'warning-delete') {
    if (interaction.user.id !== first) return replyError(interaction, 'هذا التأكيد مخصص للمسؤول الذي بدأه.');
    if (!await requireAdmin(interaction)) return;
    const result = statements.deleteWarnings.run(interaction.guildId, second);
    return interaction.update({ content: `✅ تم حذف ${result.changes} تحذيرًا عن <@${second}>.`, components: [] });
  }
  if (action === 'application-decision') return decideApplication(interaction, first, second);
  if (action === 'ticket-close' || action === 'ticket-reopen' || action === 'ticket-delete') {
    return handleTicketAction(interaction, action);
  }
}

async function openTicket(interaction) {
  const settings = getSettings(interaction.guildId);
  if (!settings?.ticket_channel_id || !settings.support_role_id) {
    return replyError(interaction, 'لم يتم إعداد نظام الدعم الفني بعد.');
  }
  await interaction.deferReply({ ephemeral: true });
  const existing = statements.findOpenTicket.get(interaction.guildId, interaction.user.id);
  if (existing) return interaction.editReply({ content: `🎫 لديك تذكرة مفتوحة بالفعل: <#${existing.channel_id}>` });
  const supportRole = await interaction.guild.roles.fetch(settings.support_role_id).catch(() => null);
  if (!supportRole) return replyError(interaction, 'رتبة الدعم المحددة غير موجودة. أعد إعداد لوحة الدعم.');
  if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return replyError(interaction, 'أحتاج إلى صلاحية إدارة القنوات لإنشاء تذكرة خاصة.');
  }
  const panel = await interaction.guild.channels.fetch(settings.ticket_channel_id).catch(() => null);
  const overwrites = [
    { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
    { id: supportRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
  ];
  const ticketChannel = await interaction.guild.channels.create({
    name: `تذكرة-${interaction.user.id.slice(-6)}`,
    type: ChannelType.GuildText,
    parent: panel?.parentId || undefined,
    permissionOverwrites: overwrites,
    reason: `تذكرة دعم من ${interaction.user.tag}`
  });
  try {
    statements.createTicket.run(ticketChannel.id, interaction.guildId, interaction.user.id, new Date().toISOString());
  } catch (error) {
    await ticketChannel.delete('تعذر تسجيل التذكرة').catch(() => null);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      const openTicket = statements.findOpenTicket.get(interaction.guildId, interaction.user.id);
      return interaction.editReply({ content: `🎫 لديك تذكرة مفتوحة بالفعل${openTicket ? `: <#${openTicket.channel_id}>` : '.'}` });
    }
    throw error;
  }
  const controls = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket-close').setLabel('🔒 إغلاق التذكرة').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket-reopen').setLabel('🔓 إعادة فتح التذكرة').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ticket-delete').setLabel('🗑️ حذف التذكرة').setStyle(ButtonStyle.Danger)
  );
  const embed = baseEmbed('تذكرة الدعم', 'اكتب تفاصيل طلبك هنا. لا يرى هذه القناة إلا أنت وفريق الدعم المخول.')
    .setDescription(`👤 **صاحب التذكرة:** <@${interaction.user.id}>\n\n📝 اكتب تفاصيل طلبك هنا. لا يرى هذه القناة إلا أنت وفريق الدعم المخول.`);
  try {
    await ticketChannel.send({ content: `🎫 ${interaction.user} <@&${supportRole.id}>`, embeds: [embed], components: [controls], allowedMentions: { users: [interaction.user.id], roles: [supportRole.id] } });
  } catch (error) {
    statements.deleteTicket.run(ticketChannel.id);
    await ticketChannel.delete('تعذر إرسال رسالة بدء التذكرة').catch(() => null);
    throw error;
  }
  return interaction.editReply({ content: `✅ تم فتح تذكرتك: ${ticketChannel}` });
}

async function handleTicketAction(interaction, action) {
  const ticket = statements.getTicket.get(interaction.channelId, interaction.guildId);
  if (!ticket) return replyError(interaction, 'هذه القناة ليست تذكرة مسجلة.');
  const settings = getSettings(interaction.guildId);
  const isSupport = settings?.support_role_id && interaction.member.roles.cache.has(settings.support_role_id);
  if (!isSupport) return replyError(interaction, 'هذا الإجراء متاح لفريق الدعم فقط.');
  if (action === 'ticket-delete') {
    await interaction.reply({ content: '🗑️ سيتم حذف التذكرة.', ephemeral: true });
    await interaction.channel.delete(`حذف التذكرة بواسطة ${interaction.user.tag}`);
    statements.deleteTicket.run(ticket.channel_id);
    return;
  }
  const nextStatus = action === 'ticket-close' ? 'closed' : 'open';
  if (ticket.status === nextStatus) return replyError(interaction, nextStatus === 'open' ? 'التذكرة مفتوحة بالفعل.' : 'التذكرة مغلقة بالفعل.');
  if (nextStatus === 'open') {
    const existing = statements.findOpenTicket.get(interaction.guildId, ticket.user_id);
    if (existing && existing.channel_id !== ticket.channel_id) {
      return replyError(interaction, `لدى صاحب التذكرة طلب آخر مفتوح بالفعل: <#${existing.channel_id}>.`);
    }
  }
  const ownerPermissions = nextStatus === 'closed'
    ? { ViewChannel: true, SendMessages: false, ReadMessageHistory: true }
    : { ViewChannel: true, SendMessages: true, ReadMessageHistory: true };
  await interaction.channel.permissionOverwrites.edit(ticket.user_id, ownerPermissions);
  statements.setTicketStatus.run(nextStatus, ticket.channel_id);
  return interaction.reply({ content: nextStatus === 'closed' ? '🔒 تم إغلاق التذكرة.' : '🔓 تمت إعادة فتح التذكرة.', ephemeral: true });
}

async function handleModal(interaction) {
  if (interaction.customId === 'bulk-dm-submit') {
    if (!await requireAdmin(interaction)) return;
    const message = interaction.fields.getTextInputValue('bulk-dm-message').trim();
    if (!message) return replyError(interaction, 'يجب كتابة نص الرسالة أولاً.');
    const members = await interaction.guild.members.fetch().catch(() => interaction.guild.members.cache);
    const eligibleMembers = Array.from(members.values()).filter((member) => !member.user.bot).length;
    bulkDmState.set(interaction.user.id, { guildId: interaction.guildId, message });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bulk-dm-confirm:${interaction.user.id}`).setLabel('✅ تأكيد الإرسال').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`bulk-dm-cancel:${interaction.user.id}`).setLabel('❌ إلغاء').setStyle(ButtonStyle.Secondary)
    );
    return interaction.reply({
      content: `📨 سيتم إرسال الرسالة إلى ${eligibleMembers} عضو في السيرفر، بما في ذلك المسؤول الذي بدأ العملية، مع تجاهل البوتات والأعضاء الذين لا يقبلون الرسائل الخاصة. هل تريد المتابعة؟`,
      components: [row],
      ephemeral: true
    });
  }
  if (interaction.customId !== 'application-submit') return;
  const settings = getSettings(interaction.guildId);
  if (!settings?.application_review_channel_id) return replyError(interaction, 'لم يتم إعداد نظام التقديم بعد.');
  const age = interaction.fields.getTextInputValue('answer-2');
  if (!/^[0-9٠-٩]{1,3}$/.test(age)) return replyError(interaction, 'يرجى كتابة العمر بالأرقام فقط.');
  await interaction.deferReply({ ephemeral: true });
  const answers = APPLICATION_QUESTIONS.map((_, index) => interaction.fields.getTextInputValue(`answer-${index + 1}`));
  const result = statements.createApplication.run(interaction.guildId, interaction.user.id, JSON.stringify(answers), new Date().toISOString());
  const reviewChannel = await interaction.guild.channels.fetch(settings.application_review_channel_id).catch(() => null);
  if (!reviewChannel?.isTextBased()) return replyError(interaction, 'روم استقبال الطلبات غير متاح؛ تم حفظ طلبك، يرجى إبلاغ الإدارة.');
  const embed = makeApplicationEmbed(interaction.user, Number(result.lastInsertRowid), answers, 'قيد المراجعة');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`application-decision:${result.lastInsertRowid}:approve`).setLabel('✅ قبول').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`application-decision:${result.lastInsertRowid}:reject`).setLabel('❌ رفض').setStyle(ButtonStyle.Danger)
  );
  const message = await reviewChannel.send({ embeds: [embed], components: [row], allowedMentions: { parse: [] } });
  statements.setReviewMessage.run(message.id, reviewChannel.id, result.lastInsertRowid);
  return interaction.editReply({ content: '✅ تم إرسال طلبك للإدارة بنجاح.' });
}

function makeApplicationEmbed(user, id, answers, status, reviewer, decidedAt) {
  const embed = baseEmbed('طلب تقديم جديد', `**👤 المتقدم:** ${user.globalName || user.username}\n**📣 المنشن:** <@${user.id}>\n**🆔 الآيدي:** ${user.id}\n**🔢 رقم الطلب:** ${id}`);
  APPLICATION_QUESTIONS.forEach((question, index) => {
    embed.addFields({ name: `📝 ${question}`, value: answers[index].slice(0, 1024) });
  });
  embed.addFields({ name: '📌 الحالة', value: status, inline: true });
  if (reviewer) embed.addFields({ name: '🛡️ المسؤول عن القرار', value: `<@${reviewer}>`, inline: true });
  if (decidedAt) embed.addFields({ name: '🕒 تاريخ القرار', value: `<t:${Math.floor(new Date(decidedAt).getTime() / 1000)}:F>`, inline: true });
  return embed;
}

async function decideApplication(interaction, id, decision) {
  if (!await requireAdmin(interaction)) return;
  if (!['approve', 'reject'].includes(decision)) return replyError(interaction, 'نوع القرار غير صحيح.');
  const application = statements.getApplication.get(Number(id), interaction.guildId);
  if (!application) return replyError(interaction, 'لم يتم العثور على الطلب.');
  await interaction.deferReply({ ephemeral: true });
  const status = decision === 'approve' ? 'مقبول' : 'مرفوض';
  const decidedAt = new Date().toISOString();
  const result = statements.decideApplication.run(status, interaction.user.id, decidedAt, Number(id), interaction.guildId);
  if (!result.changes) return replyError(interaction, 'تم اتخاذ قرار على هذا الطلب مسبقًا.');
  const user = await interaction.client.users.fetch(application.user_id).catch(() => null);
  const answers = JSON.parse(application.answers);
  const reviewMessage = await interaction.channel.messages.fetch(application.review_message_id).catch(() => null);
  if (reviewMessage) {
    const updated = makeApplicationEmbed(user || { id: application.user_id, username: application.user_id }, Number(id), answers, status, interaction.user.id, decidedAt);
    await reviewMessage.edit({ embeds: [updated], components: [] }).catch(() => null);
  }
  let dmSent = false;
  if (user) {
    dmSent = await user.send(`📋 تم ${status} طلب تقديمك للإدارة في سيرفر ${interaction.guild.name}.`).then(() => true).catch(() => false);
  }
  return interaction.editReply({ content: `✅ تم تسجيل قرار **${status}** بواسطة ${interaction.user}.${dmSent ? ' 📩 تم إرسال النتيجة إلى المتقدم.' : ' ⚠️ تعذر إرسال رسالة خاصة للمتقدم.'}` });
}

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) await handleCommand(interaction);
    else if (interaction.isButton() && interaction.customId.startsWith('level-board:')) await levelSystem.handleComponent(interaction);
    else if (interaction.isButton()) await handleButton(interaction);
    else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('level-board:')) await levelSystem.handleComponent(interaction);
    else if (interaction.isStringSelectMenu()) await communityGames.handleAutoReplySelectMenu(interaction);
    else if (interaction.isModalSubmit()) await handleModal(interaction);
  } catch (error) {
    const isLevelBoard = (interaction.isChatInputCommand() && interaction.commandName === 'تصنيفات')
      || ((interaction.isButton() || interaction.isStringSelectMenu()) && interaction.customId.startsWith('level-board:'));
    const action = interaction.isChatInputCommand()
      ? `/${interaction.commandName}`
      : interaction.customId || interaction.type;
    console.error(`خطأ أثناء معالجة ${action}:`, error);
    const details = error instanceof Error ? error.message : String(error);
    const errorCode = error && typeof error === 'object' && 'code' in error ? ` [${error.code}]` : '';
    await replyError(
      interaction,
      `تعذر تنفيذ ${isLevelBoard ? 'لوحة التصنيفات' : action}${errorCode}: ${details.slice(0, 300)}`
    );
  }
});

client.on('messageCreate', (message) => {
  if (!message.guild || message.author.bot) return;

  const rewardKey = `${message.guild.id}:${message.author.id}`;
  const rewardState = messageRewardState.get(rewardKey) || { count: 0, lastRewardAt: 0 };
  rewardState.count += 1;

  if (rewardState.count >= MESSAGE_REWARD_EVERY) {
    const now = Date.now();
    if (now - rewardState.lastRewardAt >= MESSAGE_REWARD_COOLDOWN_MS) {
      const newBalance = adjustWallet(message.guild.id, message.author.id, 1);
      rewardState.count = 0;
      rewardState.lastRewardAt = now;
      messageRewardState.set(rewardKey, rewardState);
      if (message.channel.isTextBased()) {
        message.channel.send({
          content: `🪙 ${message.author} حصلت على **1 ${AY_EMOJI} ${AY_CURRENCY_NAME}** من الرسائل! رصيدك الآن: **${newBalance}**`,
          allowedMentions: { users: [message.author.id] }
        }).catch(() => null);
      }
    }
    rewardState.count = 0;
  }

  messageRewardState.set(rewardKey, rewardState);

  communityGames.handleMessage(message).catch((error) => console.error('خطأ في الألعاب أو الردود التلقائية:', error));
  afkSystem.handleMessage(message).catch((error) => console.error('خطأ في نظام الغياب:', error));
  levelSystem.handleMessage(message).catch((error) => console.error('خطأ في خبرة الرسائل:', error));
});

client.once('clientReady', async () => {
  console.log(`تم تشغيل البوت: ${client.user.tag}`);
  await communityGames.restoreGiveaways();
  levelSystem.startVoiceXp();
});

client.on('error', (error) => console.error('خطأ اتصال Discord:', error));
client.login(DISCORD_TOKEN).catch((error) => {
  console.error('تعذر تسجيل الدخول. تحقق من DISCORD_TOKEN:', error.message);
  process.exitCode = 1;
});