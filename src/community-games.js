const { randomInt, randomUUID } = require('node:crypto');
const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder
} = require('discord.js');

const GIVEAWAY_MAX_DELAY = 2_147_000_000;
const GAME_DURATION_MS = 2 * 60 * 1000;
const AUTO_REPLY_PAGE_SIZE = 25;
const activeGames = new Map();
const giveawayTimers = new Map();

const countries = [
  { answer: 'مصر', aliases: ['مصر', 'جمهورية مصر العربية'], hint: 'بلد عربي يمر فيه نهر النيل، وتوجد فيه أهرامات الجيزة.' },
  { answer: 'السعودية', aliases: ['السعودية', 'المملكة العربية السعودية'], hint: 'تقع فيها مكة المكرمة والمدينة المنورة، وعاصمتها الرياض.' },
  { answer: 'اليابان', aliases: ['اليابان'], hint: 'دولة جزرية في شرق آسيا، وعاصمتها طوكيو.' },
  { answer: 'فرنسا', aliases: ['فرنسا'], hint: 'تقع فيها باريس وبرج إيفل، ويجري فيها نهر السين.' },
  { answer: 'البرازيل', aliases: ['البرازيل'], hint: 'أكبر دول أمريكا الجنوبية مساحة، ويجري فيها جزء كبير من نهر الأمازون.' },
  { answer: 'المغرب', aliases: ['المغرب', 'المملكة المغربية'], hint: 'بلد في شمال غرب أفريقيا، تطل سواحله على المحيط الأطلسي والبحر المتوسط.' },
  { answer: 'أستراليا', aliases: ['أستراليا'], hint: 'دولة وقارة في نصف الكرة الجنوبي، وعاصمتها كانبيرا.' },
  { answer: 'إيطاليا', aliases: ['إيطاليا'], hint: 'دولة أوروبية تشتهر بشكل شبه الجزيرة الشبيه بالحذاء، وعاصمتها روما.' },
  { answer: 'كندا', aliases: ['كندا'], hint: 'ثاني أكبر دول العالم مساحة، وعاصمتها أوتاوا.' },
  { answer: 'تركيا', aliases: ['تركيا', 'الجمهورية التركية'], hint: 'يمتد هذا البلد بين قارتي آسيا وأوروبا، وعاصمته أنقرة.' },
  { answer: 'الهند', aliases: ['الهند'], hint: 'دولة في جنوب آسيا، وعاصمتها نيودلهي.' },
  { answer: 'الأرجنتين', aliases: ['الأرجنتين'], hint: 'دولة في أمريكا الجنوبية، عاصمتها بوينس آيرس.' },
  { answer: 'الصين', aliases: ['الصين'], hint: 'دولة في شرق آسيا، وعاصمتها بكين.' },
  { answer: 'إسبانيا', aliases: ['إسبانيا'], hint: 'دولة في شبه الجزيرة الأيبيرية، وعاصمتها مدريد.' },
  { answer: 'الأردن', aliases: ['الأردن', 'المملكة الأردنية الهاشمية'], hint: 'تقع فيه مدينة البتراء الأثرية، وعاصمته عمّان.' }
];

const characters = [
  { answer: 'محمد صلاح', aliases: ['محمد صلاح', 'صلاح', 'mohamed salah'], hint: 'لاعب كرة قدم مصري، لعب لنادي ليفربول الإنجليزي.' },
  { answer: 'ليونيل ميسي', aliases: ['ليونيل ميسي', 'ميسي', 'lionel messi', 'messi'], hint: 'لاعب كرة قدم أرجنتيني، فاز بكأس العالم 2022.' },
  { answer: 'كريستيانو رونالدو', aliases: ['كريستيانو رونالدو', 'رونالدو', 'cristiano ronaldo', 'ronaldo'], hint: 'لاعب كرة قدم برتغالي، لعب لمانشستر يونايتد وريال مدريد.' },
  { answer: 'ألبرت أينشتاين', aliases: ['ألبرت أينشتاين', 'البرت اينشتاين', 'اينشتاين', 'einstein', 'albert einstein'], hint: 'عالم فيزياء ألماني المولد، ارتبط اسمه بالنظرية النسبية.' },
  { answer: 'نجيب محفوظ', aliases: ['نجيب محفوظ', 'nagib mahfouz', 'naguib mahfouz'], hint: 'روائي مصري، نال جائزة نوبل في الأدب عام 1988.' },
  { answer: 'أم كلثوم', aliases: ['أم كلثوم', 'ام كلثوم', 'كوكب الشرق', 'umm kulthum', 'om kalthoum'], hint: 'مطربة مصرية لُقبت بكوكب الشرق.' },
  { answer: 'ماري كوري', aliases: ['ماري كوري', 'ماري كوري', 'marie curie'], hint: 'عالمة فيزياء وكيمياء، فازت بجائزتي نوبل في مجالين علميين.' },
  { answer: 'ابن بطوطة', aliases: ['ابن بطوطة', 'ibn battuta'], hint: 'رحالة مغربي من القرن الرابع عشر، دوّن رحلاته في كتاب «الرحلة».' },
  { answer: 'ويليام شكسبير', aliases: ['ويليام شكسبير', 'شكسبير', 'william shakespeare', 'shakespeare'], hint: 'كاتب مسرحي إنجليزي، من أشهر أعماله هاملت وروميو وجولييت.' },
  { answer: 'نيلسون مانديلا', aliases: ['نيلسون مانديلا', 'مانديلا', 'nelson mandela'], hint: 'مناضل من جنوب أفريقيا، وأصبح رئيسًا لها بعد انتهاء نظام الفصل العنصري.' },
  { answer: 'عباس بن فرناس', aliases: ['عباس بن فرناس', 'ابن فرناس'], hint: 'عالم أندلسي من القرن التاسع، اشتهر بمحاولة الطيران.' },
  { answer: 'ستيف جوبز', aliases: ['ستيف جوبز', 'ستيفن جوبز', 'steve jobs'], hint: 'شارك في تأسيس شركة آبل.' }
];

const imageSubjects = [
  {
    answer: 'قطة', aliases: ['قطة', 'قط', 'هر', 'cat'],
    image: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=1000&q=85'
  },
  {
    answer: 'كلب', aliases: ['كلب', 'جرو', 'dog'],
    image: 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=1000&q=85'
  },
  {
    answer: 'برج إيفل', aliases: ['برج ايفل', 'برج إيفل', 'ايفل', 'eiffel tower'],
    image: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1000&q=85'
  },
  {
    answer: 'أهرامات الجيزة', aliases: ['اهرامات الجيزة', 'الأهرامات', 'هرم', 'pyramids', 'pyramid'],
    image: 'https://images.unsplash.com/photo-1539650116574-75c0c6d73f6e?auto=format&fit=crop&w=1000&q=85'
  }
];

const memes = [
  { template: 'drake', lines: ['أنام بدري اليوم', 'فيديو واحد بعدين أنام'] },
  { template: 'fine', lines: ['أنا: كل شيء تحت السيطرة', 'الاختبارات بعد يومين'] },
  { template: 'success', lines: ['ما ذاكرت السؤال', 'الإجابة موجودة في السؤال اللي بعده'] },
  { template: 'home', lines: ['نطلب أكل؟', 'عندنا أكل في البيت', 'الأكل في البيت:'] },
  { template: 'gru', lines: ['أقول: دقيقة وأجي', 'أفتح الجوال', 'تمر ثلاث ساعات', 'أقول: كنت أقصد دقيقة ثانية'] },
  { template: 'woman-cat', lines: ['أمي: خلصت مذاكرة؟', 'أنا: إيه، وأنا ما فتحت الكتاب'] },
  { template: 'spiderman', lines: ['أنا ألوم الإنترنت', 'الإنترنت يلومني', 'كلنا نعرف السبب'] },
  { template: 'success', lines: ['المنبه يرن', 'أصحى قبل ما يرن بدقيقة'] }
];

async function downloadImage(url, filename) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !contentType.startsWith('image/')) throw new Error('رابط الصورة غير متاح.');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > 8 * 1024 * 1024) throw new Error('حجم الصورة غير مناسب.');
  return new AttachmentBuilder(buffer, { name: filename });
}

function memeImageUrl(meme) {
  const lines = meme.lines.map((line) => encodeURIComponent(line.replaceAll(' ', '_'))).join('/');
  return `https://api.memegen.link/images/${meme.template}/${lines}.jpg`;
}

function adminAllowed(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

function normalizeAnswer(value) {
  return value.toLocaleLowerCase('ar')
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function makeEmbed(title, description, color = 0x2588c9) {
  return new EmbedBuilder().setColor(color)
    .setTitle(`✨ ${title}`)
    .setDescription(`🎮 ${description}`)
    .setTimestamp();
}
 
function awardWalletCoins(statements, guildId, userId, amount) {
  if (!userId || !amount) return 0;
  const existing = statements.getWalletBalance.get(guildId, userId);
  if (!existing) {
    statements.createWalletBalance.run(guildId, userId, amount);
    return amount;
  }
  const next = existing.coins + amount;
  statements.setWalletBalance.run(next, guildId, userId);
  return next;
}

function gameKey(guildId, channelId, type) {
  return `${guildId}:${channelId}:${type}`;
}

function activeGameFor(interaction, type) {
  return activeGames.get(gameKey(interaction.guildId, interaction.channelId, type));
}

function durationToMs(value) {
  const match = value.match(/^([1-9]\d*)\s*(s|m|h|d|ث|د|س|ي)$/i);
  if (!match) return null;
  const units = { s: 1000, ث: 1000, m: 60000, د: 60000, h: 3600000, س: 3600000, d: 86400000, ي: 86400000 };
  const duration = Number(match[1]) * units[match[2].toLowerCase()];
  return Number.isSafeInteger(duration) && duration <= 30 * 86400000 ? duration : null;
}

function giveawayEmbed(giveaway, entryCount, ended = false, winnerIds = []) {
  const description = [
    `**🎁 الجائزة:** ${giveaway.prize}`,
    `**🏆 عدد الفائزين:** ${giveaway.winner_count}`,
    ended ? '**📌 الحالة:** انتهى السحب' : `**⏰ ينتهي:** <t:${Math.floor(new Date(giveaway.ends_at).getTime() / 1000)}:R>`,
    `**👥 المشاركون:** ${entryCount}`,
    ended && winnerIds.length ? `**🎉 الفائزون:** ${winnerIds.map((id) => `<@${id}>`).join('، ')}` : ''
  ].filter(Boolean).join('\n');
  return makeEmbed(ended ? 'انتهى السحب' : 'سحب جديد', description, ended ? 0x168a55 : 0x2588c9);
}

async function updateGiveawayMessage(client, statements, giveaway, ended = false, winnerIds = []) {
  if (!giveaway.message_id) return;
  const channel = await client.channels.fetch(giveaway.channel_id).catch(() => null);
  if (!channel?.isTextBased()) return;
  const message = await channel.messages.fetch(giveaway.message_id).catch(() => null);
  if (!message) return;
  const entryCount = statements.countGiveawayEntries.get(giveaway.id)?.count ?? 0;
  await message.edit({
    embeds: [giveawayEmbed(giveaway, entryCount, ended, winnerIds)],
    components: ended ? [] : message.components
  }).catch(() => null);
}

function scheduleGiveaway(client, statements, giveaway) {
  const existingTimer = giveawayTimers.get(giveaway.id);
  if (existingTimer) clearTimeout(existingTimer);
  const remaining = new Date(giveaway.ends_at).getTime() - Date.now();
  if (remaining <= 0) {
    const timer = setTimeout(() => finishGiveaway(client, statements, giveaway.id), 0);
    giveawayTimers.set(giveaway.id, timer);
    return;
  }
  const timer = setTimeout(() => {
    const fresh = statements.getActiveGiveaway.get(giveaway.id, giveaway.guild_id);
    if (fresh) scheduleGiveaway(client, statements, fresh);
  }, Math.min(remaining, GIVEAWAY_MAX_DELAY));
  if (remaining <= GIVEAWAY_MAX_DELAY) {
    clearTimeout(timer);
    const finalTimer = setTimeout(() => finishGiveaway(client, statements, giveaway.id), remaining);
    giveawayTimers.set(giveaway.id, finalTimer);
  } else {
    giveawayTimers.set(giveaway.id, timer);
  }
}

async function finishGiveaway(client, statements, giveawayId) {
  giveawayTimers.delete(giveawayId);
  const giveaway = statements.getGiveawayById.get(giveawayId);
  if (!giveaway || giveaway.status !== 'active') return;
  const participants = statements.getGiveawayEntries.all(giveawayId).map((entry) => entry.user_id);
  const winners = [];
  const pool = [...participants];
  while (pool.length && winners.length < giveaway.winner_count) {
    winners.push(pool.splice(randomInt(pool.length), 1)[0]);
  }
  const result = statements.finishGiveaway.run(JSON.stringify(winners), giveawayId);
  if (!result.changes) return;
  for (const winnerId of winners) {
    const balance = awardWalletCoins(statements, giveaway.guild_id, winnerId, 25);
    console.log(`مكافأة سحب: ${winnerId} حصل على 25 AY، الرصيد الحالي: ${balance}`);
  }
  await updateGiveawayMessage(client, statements, giveaway, true, winners);
  const channel = await client.channels.fetch(giveaway.channel_id).catch(() => null);
  if (!channel?.isTextBased()) return;
  const announcement = winners.length
    ? `🎉 انتهى السحب على **${giveaway.prize}**! الفائزون: ${winners.map((id) => `<@${id}>`).join('، ')}\n🎁 كل فائز حصل على **25 AY 🪙**.`
    : `ℹ️ انتهى السحب على **${giveaway.prize}** دون مشاركين؛ لم يتم اختيار فائز.`;
  await channel.send({ content: announcement, allowedMentions: { users: winners } }).catch((error) => {
    console.error('تعذر إعلان نتيجة السحب:', error.message);
  });
}

function ensureSendPermission(interaction, channel) {
  const botPermissions = channel.permissionsFor(interaction.guild.members.me);
  const userPermissions = channel.permissionsFor(interaction.member);
  return botPermissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])
    && userPermissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]);
}

async function startRoulette(interaction) {
  if (!adminAllowed(interaction)) return interaction.reply({ content: '⛔ بدء الروليت متاح للمسؤولين فقط.', ephemeral: true });
  const channel = interaction.options.getChannel('روم');
  if (!ensureSendPermission(interaction, channel)) return interaction.reply({ content: '❌ تحقق من صلاحياتك وصلاحيات البوت في الروم المحدد.', ephemeral: true });
  const key = gameKey(interaction.guildId, channel.id, 'roulette');
  if (activeGames.has(key)) return interaction.reply({ content: '⚠️ توجد جولة روليت قائمة في هذا الروم بالفعل.', ephemeral: true });
  await interaction.deferReply({ ephemeral: true });
  const game = { id: randomUUID(), type: 'roulette', guildId: interaction.guildId, channelId: channel.id, participants: new Set(), messageId: null };
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`roulette-join:${game.id}`).setLabel('🎟️ دخول الروليت').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`roulette-spin:${game.id}`).setLabel('🎲 إجراء السحب').setStyle(ButtonStyle.Danger)
  );
  const embed = makeEmbed('الروليت', 'للانضمام اضغط **دخول الروليت**. بعد اكتمال المشاركات، يضغط مسؤول **إجراء السحب** لاختيار مشارك عشوائيًا. لا توجد مراهنات أو أموال.\n\n**المشاركون:** 0');
  const message = await channel.send({ embeds: [embed], components: [row] });
  game.messageId = message.id;
  activeGames.set(key, game);
  return interaction.editReply({ content: `🎲 بدأت لعبة الروليت في ${channel}.` });
}

async function startGreenGame(client, statements, interaction) {
  const channel = interaction.options.getChannel('روم');
  if (!ensureSendPermission(interaction, channel)) return interaction.reply({ content: '❌ تحقق من صلاحياتك وصلاحيات البوت في الروم المحدد.', ephemeral: true });
  const key = gameKey(interaction.guildId, channel.id, 'green');
  if (activeGames.has(key)) return interaction.reply({ content: '⚠️ توجد جولة زر أخضر قائمة في هذا الروم بالفعل.', ephemeral: true });
  await interaction.deferReply({ ephemeral: true });
  const game = {
    id: randomUUID(), type: 'green', guildId: interaction.guildId, channelId: channel.id,
    target: randomInt(25), attemptedUsers: new Set(), messageId: null, timer: null
  };
  const rows = [];
  for (let rowIndex = 0; rowIndex < 5; rowIndex += 1) {
    const row = new ActionRowBuilder();
    for (let columnIndex = 0; columnIndex < 5; columnIndex += 1) {
      const index = rowIndex * 5 + columnIndex;
      row.addComponents(new ButtonBuilder()
        .setCustomId(`green:${game.id}:${index}`)
        .setLabel(`🔘 ${String(index + 1).padStart(2, '0')}`)
        .setStyle(index === game.target ? ButtonStyle.Success : ButtonStyle.Secondary));
    }
    rows.push(row);
  }
  const embed = makeEmbed('لعبة الزر الأخضر', '🟩 اختر مربعًا واحدًا فقط. لكل عضو محاولة واحدة، وأول من يجد الزر الصحيح يفوز.');
  const message = await channel.send({ embeds: [embed], components: rows });
  game.messageId = message.id;
  game.timer = setTimeout(() => endGreenGame(client, statements, game, null), GAME_DURATION_MS);
  activeGames.set(key, game);
  return interaction.editReply({ content: `🟩 بدأت جولة الزر الأخضر في ${channel}.` });
}

async function startGuessGame(client, statements, interaction, type) {
  const channel = interaction.options.getChannel('روم');
  if (!ensureSendPermission(interaction, channel)) return interaction.reply({ content: '❌ تحقق من صلاحياتك وصلاحيات البوت في الروم المحدد.', ephemeral: true });
  const key = gameKey(interaction.guildId, channel.id, type);
  if (activeGames.has(key)) return interaction.reply({ content: '⚠️ توجد جولة من هذه اللعبة قائمة في هذا الروم بالفعل.', ephemeral: true });
  await interaction.deferReply({ ephemeral: true });
  const list = type === 'country' ? countries : characters;
  const answer = list[randomInt(list.length)];
  const title = type === 'country' ? 'تخمين البلد' : 'تخمين الشخصية';
  const game = { id: randomUUID(), type, guildId: interaction.guildId, channelId: channel.id, answer, timer: null };
  const embed = makeEmbed(title, `💡 **التلميح:** ${answer.hint}\n\n✍️ اكتب تخمينك في الدردشة. أول إجابة صحيحة تفوز. تنتهي الجولة بعد دقيقتين.`);
  await channel.send({ embeds: [embed] });
  game.timer = setTimeout(() => endGuessGame(client, statements, game, null), GAME_DURATION_MS);
  activeGames.set(key, game);
  return interaction.editReply({ content: `🎮 بدأت جولة ${title} في ${channel}.` });
}

async function startImageGame(client, statements, interaction) {
  const channel = interaction.options.getChannel('روم');
  if (!ensureSendPermission(interaction, channel)) return interaction.reply({ content: '❌ تحقق من صلاحياتك وصلاحيات البوت في الروم المحدد.', ephemeral: true });
  if (!channel.permissionsFor(interaction.guild.members.me)?.has(PermissionFlagsBits.AttachFiles)) {
    return interaction.reply({ content: '⛔ أحتاج إلى صلاحية إرفاق الملفات في الروم لعرض صورة اللعبة.', ephemeral: true });
  }
  const key = gameKey(interaction.guildId, channel.id, 'image');
  if (activeGames.has(key)) return interaction.reply({ content: '⚠️ توجد جولة تخمين صورة قائمة في هذا الروم بالفعل.', ephemeral: true });
  await interaction.deferReply({ ephemeral: true });
  const startIndex = randomInt(imageSubjects.length);
  let answer;
  let attachment;
  for (let offset = 0; offset < imageSubjects.length; offset += 1) {
    const candidate = imageSubjects[(startIndex + offset) % imageSubjects.length];
    try {
      attachment = await downloadImage(candidate.image, 'guess-image.jpg');
      answer = candidate;
      break;
    } catch {
      continue;
    }
  }
  if (!answer) return interaction.editReply({ content: '❌ تعذر تحميل صورة اللعبة الآن. حاول مرة أخرى لاحقًا.' });
  const game = { id: randomUUID(), type: 'image', guildId: interaction.guildId, channelId: channel.id, answer, timer: null };
  const embed = makeEmbed('خمن الصورة', '🖼️ ما الذي تظهره الصورة؟ اكتب إجابتك في الدردشة. أول إجابة صحيحة تفوز، وتنتهي الجولة بعد دقيقتين.')
    .setImage('attachment://guess-image.jpg');
  await channel.send({ embeds: [embed], files: [attachment] });
  game.timer = setTimeout(() => endGuessGame(client, statements, game, null), GAME_DURATION_MS);
  activeGames.set(key, game);
  return interaction.editReply({ content: `🖼️ بدأت جولة تخمين الصورة في ${channel}.` });
}

async function showMeme(interaction) {
  const meme = memes[randomInt(memes.length)];
  await interaction.deferReply();
  let attachment;
  try {
    attachment = await downloadImage(memeImageUrl(meme), 'arabic-meme.jpg');
  } catch {
    return interaction.editReply({ content: '❌ تعذر تحميل الميم الآن. حاول مرة أخرى لاحقًا.' });
  }
  const embed = makeEmbed('ميم عربي', 'ميم عشوائي من AY Community', 0xf0b429)
    .setImage('attachment://arabic-meme.jpg');
  return interaction.editReply({ embeds: [embed], files: [attachment] });
}

function clearGame(game) {
  clearTimeout(game.timer);
  activeGames.delete(gameKey(game.guildId, game.channelId, game.type));
}

async function endGuessGame(client, statements, game, winnerId) {
  if (!activeGames.has(gameKey(game.guildId, game.channelId, game.type))) return;
  clearGame(game);
  const channel = await client.channels.fetch(game.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  if (winnerId) {
    const amount = 10;
    const balance = awardWalletCoins(statements, game.guildId, winnerId, amount);
    const result = `🎉 أحسنت <@${winnerId}>! الإجابة الصحيحة: **${game.answer.answer}**.\n🎁 فزت بـ **${amount} AY 🪙** — رصيدك الآن: **${balance}**`;
    await channel.send({ content: result, allowedMentions: { users: [winnerId] } });
    return;
  }
  const result = `⏰ انتهت الجولة دون إجابة صحيحة. الإجابة كانت: **${game.answer.answer}**.`;
  await channel.send({ content: result, allowedMentions: { parse: [] } });
}

async function endGreenGame(client, statements, game, winnerId, selectedIndex) {
  const key = gameKey(game.guildId, game.channelId, game.type);
  if (!activeGames.has(key)) return;
  clearGame(game);
  const channel = await client.channels.fetch(game.channelId).catch(() => null);
  if (channel?.isTextBased() && game.messageId) {
    const message = await channel.messages.fetch(game.messageId).catch(() => null);
    if (message) {
      const rows = message.components.map((oldRow, rowIndex) => {
        const row = new ActionRowBuilder();
        oldRow.components.forEach((oldButton, columnIndex) => {
          const index = rowIndex * 5 + columnIndex;
          const button = ButtonBuilder.from(oldButton).setDisabled(true);
          if (index === game.target) button.setStyle(ButtonStyle.Success);
          else if (index === selectedIndex && winnerId) button.setStyle(ButtonStyle.Danger);
          row.addComponents(button);
        });
        return row;
      });
      await message.edit({ components: rows }).catch(() => null);
    }
    if (winnerId) {
      const amount = 20;
      const balance = awardWalletCoins(statements, game.guildId, winnerId, amount);
      const result = `🎉 مبروك <@${winnerId}>! وجدت المربع الصحيح وفزت بالجولة.\n🎁 حصلت على **${amount} AY 🪙** — رصيدك الآن: **${balance}**`;
      await channel.send({ content: result, allowedMentions: { users: [winnerId] } });
      return;
    }
    const result = '⏰ انتهى وقت الجولة دون فائز.';
    await channel.send({ content: result, allowedMentions: { parse: [] } });
  }
}

function createCommunityGames(client, statements) {
  async function createGiveaway(interaction) {
    if (!adminAllowed(interaction)) return interaction.reply({ content: '⛔ إنشاء السحوبات متاح للمسؤولين فقط.', ephemeral: true });
    const channel = interaction.options.getChannel('روم');
    if (!ensureSendPermission(interaction, channel)) return interaction.reply({ content: '❌ تحقق من صلاحياتك وصلاحيات البوت في الروم المحدد.', ephemeral: true });
    const duration = durationToMs(interaction.options.getString('المدة'));
    if (!duration || duration < 10_000) return interaction.reply({ content: '❌ المدة غير صالحة. استخدم مثل 30m أو 2h أو 3d، والحد الأقصى 30 يومًا والحد الأدنى 10 ثوانٍ.', ephemeral: true });
    const prize = interaction.options.getString('الجائزة').trim();
    const winnerCount = interaction.options.getInteger('عدد-الفائزين');
    await interaction.deferReply({ ephemeral: true });
    const endsAt = new Date(Date.now() + duration).toISOString();
    const created = statements.createGiveaway.run(interaction.guildId, channel.id, prize, winnerCount, endsAt, interaction.user.id);
    const giveaway = statements.getGiveawayById.get(Number(created.lastInsertRowid));
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`giveaway-enter:${giveaway.id}`).setLabel('🎉 مشاركة').setStyle(ButtonStyle.Success)
    );
    let message;
    try {
      message = await channel.send({
        embeds: [giveawayEmbed(giveaway, 0)], components: [row], allowedMentions: { parse: [] }
      });
    } catch (error) {
      statements.cancelGiveaway.run(giveaway.id);
      throw error;
    }
    statements.setGiveawayMessage.run(message.id, giveaway.id);
    giveaway.message_id = message.id;
    scheduleGiveaway(client, statements, giveaway);
    return interaction.editReply({ content: `✅ تم إنشاء السحب ونشره في ${channel}.` });
  }

  async function handleAutoReplyCommand(interaction) {
    if (!['رد-تلقائي', 'مسح-رد-تلقائي', 'الردود-التلقائية'].includes(interaction.commandName)) return false;
    if (!adminAllowed(interaction)) {
      return interaction.reply({ content: '⛔ إعداد الردود التلقائية متاح للمسؤولين فقط.', ephemeral: true });
    }

    if (interaction.commandName === 'رد-تلقائي') {
      const keyword = interaction.options.getString('الكلمة').trim();
      const response = interaction.options.getString('الرد').trim();
      const normalizedKeyword = normalizeAnswer(keyword);
      if (!normalizedKeyword || !response) {
        return interaction.reply({ content: '⚠️ اكتب كلمة أو عبارة وردًا غير فارغ.', ephemeral: true });
      }
      statements.setAutoReply.run(interaction.guildId, normalizedKeyword, keyword, response);
      return interaction.reply({ content: `✅ تم حفظ الرد التلقائي للكلمة **${keyword}**. إذا كانت محفوظة من قبل فسيتم تحديث ردها.`, ephemeral: true });
    }

    const replies = statements.getAutoReplies.all(interaction.guildId);
    if (!replies.length) {
      const content = interaction.commandName === 'مسح-رد-تلقائي'
        ? 'ℹ️ لا توجد ردود تلقائية لحذفها. استخدم `/رد-تلقائي` لإضافة أول رد.'
        : 'ℹ️ لا توجد ردود تلقائية محفوظة. استخدم `/رد-تلقائي` لإضافة أول رد.';
      return interaction.reply({ content, ephemeral: true });
    }

    if (interaction.commandName === 'مسح-رد-تلقائي') {
      await interaction.reply({
        content: '🗑️ اختر الرد التلقائي الذي تريد حذفه:',
        components: autoReplyDeleteComponents(replies, 0),
        ephemeral: true,
        allowedMentions: { parse: [] }
      });
      return true;
    }

    const lines = replies.map(({ keyword, response }) => `**${keyword}** ← ${response}`);
    const chunks = [];
    let chunk = '🤖 **الردود التلقائية المحفوظة:**\n';
    for (const line of lines) {
      const next = `${line}\n`;
      if (chunk.length + next.length > 1900) {
        chunks.push(chunk);
        chunk = '🤖 **تكملة الردود التلقائية:**\n';
      }
      chunk += next;
    }
    if (chunk) chunks.push(chunk);

    await interaction.reply({ content: chunks[0], ephemeral: true, allowedMentions: { parse: [] } });
    for (const content of chunks.slice(1)) {
      await interaction.followUp({ content, ephemeral: true, allowedMentions: { parse: [] } });
    }
    return true;
  }

  function autoReplyDeleteComponents(replies, page) {
    if (!replies.length) return [];
    const pageCount = Math.ceil(replies.length / AUTO_REPLY_PAGE_SIZE);
    const currentPage = Math.max(0, Math.min(page, pageCount - 1));
    const pageReplies = replies.slice(
      currentPage * AUTO_REPLY_PAGE_SIZE,
      (currentPage + 1) * AUTO_REPLY_PAGE_SIZE
    );
    const select = new StringSelectMenuBuilder()
      .setCustomId('auto-reply-delete')
      .setPlaceholder('اختر الرد الذي تريد حذفه')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(pageReplies.map(({ keyword, normalized_keyword, response }) => ({
        label: keyword.slice(0, 100),
        description: response.replace(/\s+/g, ' ').slice(0, 100),
        value: normalized_keyword
      })));
    const components = [new ActionRowBuilder().addComponents(select)];
    if (pageCount > 1) {
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`auto-reply-delete-page:${currentPage - 1}`)
          .setLabel('السابق')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentPage === 0),
        new ButtonBuilder()
          .setCustomId(`auto-reply-delete-page:${currentPage + 1}`)
          .setLabel('التالي')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentPage === pageCount - 1)
      ));
    }
    return components;
  }

  async function handleAutoReplySelectMenu(interaction) {
    if (interaction.customId !== 'auto-reply-delete') return false;
    if (!adminAllowed(interaction)) {
      await interaction.reply({ content: '⛔ حذف الردود التلقائية متاح للمسؤولين فقط.', ephemeral: true });
      return true;
    }
    const normalizedKeyword = interaction.values[0];
    const replies = statements.getAutoReplies.all(interaction.guildId);
    const reply = replies.find((entry) => entry.normalized_keyword === normalizedKeyword);
    if (!reply) {
      await interaction.update({
        content: replies.length
          ? 'ℹ️ لم يعد هذا الرد موجودًا. تم تحديث القائمة، اختر ردًا آخر:'
          : 'ℹ️ لا توجد ردود تلقائية لحذفها.',
        components: autoReplyDeleteComponents(replies, 0)
      });
      return true;
    }
    const result = statements.deleteAutoReply.run(interaction.guildId, normalizedKeyword);
    if (!result.changes) {
      const latestReplies = statements.getAutoReplies.all(interaction.guildId);
      await interaction.update({
        content: latestReplies.length
          ? 'ℹ️ لم يعد هذا الرد موجودًا. تم تحديث القائمة، اختر ردًا آخر:'
          : 'ℹ️ لا توجد ردود تلقائية لحذفها.',
        components: autoReplyDeleteComponents(latestReplies, 0)
      });
      return true;
    }
    await interaction.update({
      content: `✅ تم حذف الرد التلقائي للكلمة **${reply.keyword}**.`,
      components: [],
      allowedMentions: { parse: [] }
    });
    return true;
  }

  async function handleAutoReplyDeletePage(interaction) {
    if (!interaction.customId.startsWith('auto-reply-delete-page:')) return false;
    if (!adminAllowed(interaction)) {
      await interaction.reply({ content: '⛔ حذف الردود التلقائية متاح للمسؤولين فقط.', ephemeral: true });
      return true;
    }
    const page = Number(interaction.customId.split(':')[1]);
    const replies = statements.getAutoReplies.all(interaction.guildId);
    if (!replies.length) {
      await interaction.update({ content: 'ℹ️ لا توجد ردود تلقائية لحذفها.', components: [] });
      return true;
    }
    if (!Number.isInteger(page)) {
      await interaction.update({
        content: '🗑️ اختر الرد التلقائي الذي تريد حذفه:',
        components: autoReplyDeleteComponents(replies, 0)
      });
      return true;
    }
    await interaction.update({
      content: '🗑️ اختر الرد التلقائي الذي تريد حذفه:',
      components: autoReplyDeleteComponents(replies, page)
    });
    return true;
  }

  async function handleCommand(interaction) {
    switch (interaction.commandName) {
      case 'سحب': return createGiveaway(interaction);
      case 'روليت': return startRoulette(interaction);
      case 'زر-أخضر': return startGreenGame(client, statements, interaction);
      case 'تخمين-البلد': return startGuessGame(client, statements, interaction, 'country');
      case 'تخمين-الشخصية': return startGuessGame(client, statements, interaction, 'character');
      case 'خمن-الصورة': return startImageGame(client, statements, interaction);
      case 'ميم': return showMeme(interaction);
      default: return false;
    }
  }

  async function handleButton(interaction) {
    const [action, id, rawIndex] = interaction.customId.split(':');
    if (action === 'giveaway-enter') {
      const giveaway = statements.getActiveGiveaway.get(Number(id), interaction.guildId);
      if (!giveaway) {
        await interaction.reply({ content: '⚠️ انتهى هذا السحب أو لم يعد متاحًا.', ephemeral: true });
        return true;
      }
      if (Date.now() >= new Date(giveaway.ends_at).getTime()) {
        await finishGiveaway(client, statements, giveaway.id);
        await interaction.reply({ content: '⏰ انتهى وقت المشاركة في هذا السحب.', ephemeral: true });
        return true;
      }
      const result = statements.enterGiveaway.run(giveaway.id, interaction.user.id, new Date().toISOString());
      if (!result.changes) {
        await interaction.reply({ content: 'ℹ️ أنت مشارك بالفعل في هذا السحب.', ephemeral: true });
        return true;
      }
      const entryCount = statements.countGiveawayEntries.get(giveaway.id)?.count ?? 0;
      await interaction.message.edit({ embeds: [giveawayEmbed(giveaway, entryCount)] }).catch(() => null);
      await interaction.reply({ content: '✅ تم تسجيل مشاركتك في السحب.', ephemeral: true });
      return true;
    }

    if (action === 'roulette-join' || action === 'roulette-spin') {
      const game = activeGameFor(interaction, 'roulette');
      if (!game || game.id !== id) {
        await interaction.reply({ content: '⚠️ انتهت هذه الجولة أو لم تعد متاحة.', ephemeral: true });
        return true;
      }
      if (action === 'roulette-join') {
        const added = !game.participants.has(interaction.user.id);
        game.participants.add(interaction.user.id);
        const embed = makeEmbed('الروليت', `للانضمام اضغط **دخول الروليت**. بعد اكتمال المشاركات، يضغط مسؤول **إجراء السحب** لاختيار مشارك عشوائيًا. لا توجد مراهنات أو أموال.\n\n**المشاركون:** ${game.participants.size}`);
        await interaction.message.edit({ embeds: [embed] });
        await interaction.reply({ content: added ? '✅ تمت إضافتك إلى المشاركين.' : 'ℹ️ أنت مشارك بالفعل.', ephemeral: true });
        return true;
      }
      if (!adminAllowed(interaction)) {
        await interaction.reply({ content: '⛔ إجراء سحب الروليت متاح للمسؤولين فقط.', ephemeral: true });
        return true;
      }
      if (!game.participants.size) {
        await interaction.reply({ content: 'ℹ️ لا يوجد مشاركون في الروليت بعد.', ephemeral: true });
        return true;
      }
      const winnerId = [...game.participants][randomInt(game.participants.size)];
      clearGame(game);
      const amount = 15;
      const balance = awardWalletCoins(statements, game.guildId, winnerId, amount);
      const embed = makeEmbed('نتيجة الروليت', `الفائز بالاختيار العشوائي هو <@${winnerId}>!\n🎁 حصل على **${amount} AY 🪙** — رصيدك الآن: **${balance}**`, 0x168a55);
      await interaction.update({ embeds: [embed], components: [] });
      return true;
    }

    if (action === 'green') {
      const game = activeGameFor(interaction, 'green');
      const index = Number(rawIndex);
      if (!game || game.id !== id || !Number.isInteger(index) || index < 0 || index > 24) {
        await interaction.reply({ content: '⚠️ انتهت هذه الجولة أو لم يعد هذا المربع متاحًا.', ephemeral: true });
        return true;
      }
      if (game.finished) {
        await interaction.reply({ content: '✅ تم حسم هذه الجولة بالفعل.', ephemeral: true });
        return true;
      }
      if (game.attemptedUsers.has(interaction.user.id)) {
        await interaction.reply({ content: '⚠️ لديك محاولة واحدة فقط في هذه الجولة.', ephemeral: true });
        return true;
      }
      game.attemptedUsers.add(interaction.user.id);
      if (index === game.target) {
        game.finished = true;
        await interaction.deferUpdate();
        await endGreenGame(client, statements, game, interaction.user.id, index);
      } else {
        await interaction.reply({ content: '❌ هذا ليس المربع الصحيح، وقد استُخدمت محاولتك.', ephemeral: true });
      }
      return true;
    }
    return false;
  }

  async function handleMessage(message) {
    if (!message.guild || message.author.bot) return;
    for (const type of ['country', 'character', 'image']) {
      const game = activeGames.get(gameKey(message.guild.id, message.channel.id, type));
      if (!game) continue;
      const normalized = normalizeAnswer(message.content);
      const accepted = game.answer.aliases.some((alias) => normalizeAnswer(alias) === normalized);
      if (accepted) {
        await endGuessGame(client, statements, game, message.author.id);
        return;
      }
    }

    const normalizedContent = ` ${normalizeAnswer(message.content)} `;
    if (normalizedContent.trim()) {
      const reply = statements.getAutoReplies.all(message.guild.id)
        .find(({ normalized_keyword }) => normalizedContent.includes(` ${normalized_keyword} `));
      if (reply) {
        const response = reply.response.replace(/^(?:🤖\uFE0F?\s*)+/u, '');
        await message.channel.send({ content: response, allowedMentions: { parse: [] } });
      }
    }
  }

  async function restoreGiveaways() {
    for (const giveaway of statements.getActiveGiveaways.all()) {
      scheduleGiveaway(client, statements, giveaway);
    }
  }

  return {
    handleCommand,
    handleAutoReplySelectMenu,
    handleAutoReplyDeletePage,
    handleAutoReplyCommand,
    handleButton,
    handleMessage,
    restoreGiveaways
  };
}

module.exports = { createCommunityGames };
