const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

const adminOnly = (command) => command.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
const memberOption = (command, name = 'عضو') => command.addUserOption((option) =>
  option.setName(name).setDescription('العضو المطلوب').setRequired(true));

const commands = [
  new SlashCommandBuilder().setName('مساعدة').setDescription('📖 عرض تصنيفات وأوامر البوت'),
  new SlashCommandBuilder().setName('afk').setDescription('💤 تفعيل وضع الغياب مع سبب اختياري')
    .addStringOption((option) => option.setName('السبب').setDescription('سبب الغياب').setMaxLength(300)),
  adminOnly(new SlashCommandBuilder().setName('ارسال').setDescription('📨 إرسال رسالة باسم البوت')
    .addChannelOption((option) => option.setName('روم').setDescription('الروم الذي ستُرسل فيه الرسالة')
      .addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption((option) => option.setName('الرسالة').setDescription('محتوى الرسالة').setMaxLength(2000).setRequired(true))),
  adminOnly(new SlashCommandBuilder().setName('رسالة_خاصة').setDescription('✉️ إرسال رسالة خاصة إلى جميع أعضاء السيرفر')),
  adminOnly(new SlashCommandBuilder().setName('اعطاء-عملة').setDescription('🪙 إعطاء عملة AY لعضو')
    .addUserOption((option) => option.setName('العضو').setDescription('العضو المستلم').setRequired(true))
    .addIntegerOption((option) => option.setName('الكمية').setDescription('عدد العملات').setMinValue(1).setRequired(true))
    .addStringOption((option) => option.setName('السبب').setDescription('سبب الإعطاء').setMaxLength(200))),
  new SlashCommandBuilder().setName('إرسال-عملة').setDescription('💸 إرسال عملة AY إلى عضو آخر')
    .addUserOption((option) => option.setName('العضو').setDescription('العضو المستقبل').setRequired(true))
    .addIntegerOption((option) => option.setName('الكمية').setDescription('عدد العملات المراد إرسالها').setMinValue(1).setRequired(true)),
  new SlashCommandBuilder().setName('محفظة').setDescription('💰 عرض رصيدك أو رصيد عضو في عملة AY')
    .addUserOption((option) => option.setName('العضو').setDescription('اتركه فارغًا لعرض رصيدك')),
  memberOption(new SlashCommandBuilder().setName('رتبة').setDescription('🎭 إعطاء رتبة لعضو')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addRoleOption((option) => option.setName('الرتبة').setDescription('الرتبة المطلوبة').setRequired(true))),
  memberOption(new SlashCommandBuilder().setName('تايم').setDescription('⏳ إعطاء عضو مهلة زمنية')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addStringOption((option) => option.setName('مدة').setDescription('مثال: 30m أو 2h أو 3d، والحد 28d').setRequired(true))),
  memberOption(new SlashCommandBuilder().setName('تكلم').setDescription('🔊 إزالة المهلة الزمنية عن عضو')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)),
  new SlashCommandBuilder().setName('معلومات').setDescription('ℹ️ عرض معلومات السيرفر أو عضو')
    .addUserOption((option) => option.setName('العضو').setDescription('اتركه فارغًا لعرض معلومات السيرفر')),
  new SlashCommandBuilder().setName('لفل').setDescription('📈 عرض مستوى وخبرة عضو')
    .addUserOption((option) => option.setName('العضو').setDescription('اتركه فارغًا لعرض مستواك')),
  adminOnly(new SlashCommandBuilder().setName('اعطاء-لفل').setDescription('🎁 إعطاء مستويات لعضو حسب تصنيف الخبرة')
    .addUserOption((option) => option.setName('العضو').setDescription('العضو المستلم').setRequired(true))
    .addIntegerOption((option) => option.setName('العدد').setDescription('عدد المستويات المراد إعطاؤها، من 1 إلى 100')
      .setMinValue(1).setMaxValue(100).setRequired(true))
    .addStringOption((option) => option.setName('التصنيف').setDescription('تصنيف الخبرة التي ستُضاف')
      .addChoices({ name: 'كتابة', value: 'messages' }, { name: 'فويس', value: 'voice' }).setRequired(true))),
  adminOnly(new SlashCommandBuilder().setName('لفل-إعداد').setDescription('📢 تحديد روم إعلانات ارتقاء المستوى')
    .addChannelOption((option) => option.setName('الروم').setDescription('الروم الذي ستُنشر فيه تهاني المستويات')
      .addChannelTypes(ChannelType.GuildText).setRequired(true))),
  adminOnly(new SlashCommandBuilder().setName('لفل-فويس').setDescription('🎙️ تحديد روم إعلانات ارتقاء المستوى عبر الصوت')
    .addChannelOption((option) => option.setName('الروم').setDescription('الروم الذي ستُنشر فيه تهاني مستويات الصوت')
      .addChannelTypes(ChannelType.GuildText).setRequired(true))),
  new SlashCommandBuilder().setName('تصنيفات').setDescription('🏆 عرض تصنيفات خبرة الرسائل والصوت'),
  adminOnly(new SlashCommandBuilder().setName('إعداد_جوائز_المستويات').setDescription('🏆 ربط مستوى برتبة تُمنح تلقائيًا')
    .addIntegerOption((option) => option.setName('المستوى').setDescription('المستوى المطلوب للوصول إلى الجائزة')
      .setMinValue(1).setRequired(true))
    .addRoleOption((option) => option.setName('الرتبة').setDescription('الرتبة التي سيحصل عليها العضو')
      .setRequired(true))),
  new SlashCommandBuilder().setName('عرض_جوائز_المستويات').setDescription('📋 عرض جوائز المستويات المحفوظة')
    .addIntegerOption((option) => option.setName('الصفحة').setDescription('رقم الصفحة')
      .setMinValue(1)),
  adminOnly(new SlashCommandBuilder().setName('حذف_جائزة_مستوى').setDescription('🗑️ حذف جائزة مستوى محفوظة')
    .addIntegerOption((option) => option.setName('المستوى').setDescription('المستوى المطلوب حذف جائزته')
      .setMinValue(1).setRequired(true))),
  adminOnly(memberOption(new SlashCommandBuilder().setName('تحذير').setDescription('⚠️ تسجيل تحذير على عضو')
    .addStringOption((option) => option.setName('السبب').setDescription('سبب التحذير').setMaxLength(1000).setRequired(true)))),
  adminOnly(memberOption(new SlashCommandBuilder().setName('عرض-تحذيرات').setDescription('📋 عرض تحذيرات عضو'))),
  adminOnly(memberOption(new SlashCommandBuilder().setName('إزالة-تحذيرات').setDescription('🗑️ طلب حذف تحذيرات عضو بعد التأكيد'))),
  adminOnly(new SlashCommandBuilder().setName('أخبار').setDescription('📢 إرسال خبر مع منشن الجميع')
    .addChannelOption((option) => option.setName('روم').setDescription('روم إرسال الخبر')
      .addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption((option) => option.setName('الرسالة').setDescription('محتوى الخبر').setMaxLength(1900).setRequired(true))),
  new SlashCommandBuilder().setName('مسح').setDescription('🧹 حذف عدد محدد من رسائل الروم الحالي')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((option) => option.setName('العدد').setDescription('عدد الرسائل المراد حذفها، من 1 إلى 100')
      .setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName('قفل-روم').setDescription('🔒 منع الأعضاء من الكتابة في روم')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((option) => option.setName('الروم').setDescription('اتركه فارغًا لقفل الروم الحالي')
      .addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder().setName('فتح-روم').setDescription('🔓 إعادة إعدادات الكتابة السابقة للروم')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((option) => option.setName('الروم').setDescription('اتركه فارغًا لفتح الروم الحالي')
      .addChannelTypes(ChannelType.GuildText)),
  memberOption(new SlashCommandBuilder().setName('طرد').setDescription('👢 طرد عضو من السيرفر')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers))
    .addStringOption((option) => option.setName('السبب').setDescription('سبب الطرد').setMaxLength(400)),
  memberOption(new SlashCommandBuilder().setName('بان').setDescription('🔨 حظر عضو من السيرفر')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers))
    .addStringOption((option) => option.setName('السبب').setDescription('سبب الحظر').setMaxLength(400)),
  new SlashCommandBuilder().setName('رفع-بان').setDescription('✅ رفع الحظر عن عضو باستخدام الآيدي')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((option) => option.setName('الآيدي').setDescription('آيدي العضو المحظور').setMinLength(17).setMaxLength(20).setRequired(true))
    .addStringOption((option) => option.setName('السبب').setDescription('سبب رفع الحظر').setMaxLength(400)),
  new SlashCommandBuilder().setName('بينغ').setDescription('📡 عرض زمن استجابة البوت'),
  adminOnly(new SlashCommandBuilder().setName('تذاكر-إعداد').setDescription('🎫 إعداد لوحة الدعم الفني')
    .addChannelOption((option) => option.setName('روم').setDescription('روم لوحة الدعم الفني')
      .addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addRoleOption((option) => option.setName('رتبة-الدعم').setDescription('رتبة فريق الدعم الفني').setRequired(true))),
  adminOnly(new SlashCommandBuilder().setName('تقديم-إعداد').setDescription('📝 إعداد لوحة التقديم واستقبال الطلبات')
    .addChannelOption((option) => option.setName('روم-اللوحة').setDescription('روم لوحة التقديم')
      .addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addChannelOption((option) => option.setName('روم-الطلبات').setDescription('روم استقبال الطلبات')
      .addChannelTypes(ChannelType.GuildText).setRequired(true))),
  adminOnly(new SlashCommandBuilder().setName('رد-تلقائي').setDescription('🤖 إضافة أو تحديث رد تلقائي لكلمة أو عبارة')
    .addStringOption((option) => option.setName('الكلمة').setDescription('الكلمة أو العبارة التي تشغّل الرد').setMaxLength(100).setRequired(true))
    .addStringOption((option) => option.setName('الرد').setDescription('الرد الذي سيرسله البوت').setMaxLength(1500).setRequired(true))),
  adminOnly(new SlashCommandBuilder().setName('مسح-رد-تلقائي').setDescription('🧹 اختيار رد تلقائي من القائمة لحذفه')),
  adminOnly(new SlashCommandBuilder().setName('الردود-التلقائية').setDescription('🤖 عرض الكلمات والردود التلقائية المحفوظة')),
  adminOnly(new SlashCommandBuilder().setName('سحب').setDescription('🎉 إنشاء سحب جديد')
    .addChannelOption((option) => option.setName('روم').setDescription('روم نشر السحب')
      .addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption((option) => option.setName('الجائزة').setDescription('الجائزة المقدمة').setMaxLength(200).setRequired(true))
    .addStringOption((option) => option.setName('المدة').setDescription('مثل 30m أو 2h أو 3d').setMaxLength(20).setRequired(true))
    .addIntegerOption((option) => option.setName('عدد-الفائزين').setDescription('عدد الفائزين، من 1 إلى 20')
      .setMinValue(1).setMaxValue(20).setRequired(true))),
  adminOnly(new SlashCommandBuilder().setName('روليت').setDescription('🎲 بدء روليت اختيار المشاركين')
    .addChannelOption((option) => option.setName('روم').setDescription('روم اللعبة')
      .addChannelTypes(ChannelType.GuildText).setRequired(true))),
  new SlashCommandBuilder().setName('زر-أخضر').setDescription('🟩 بدء جولة الزر الأخضر')
    .addChannelOption((option) => option.setName('روم').setDescription('روم اللعبة')
      .addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder().setName('تخمين-البلد').setDescription('🌍 بدء جولة تخمين بلد')
    .addChannelOption((option) => option.setName('روم').setDescription('روم اللعبة')
      .addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder().setName('تخمين-الشخصية').setDescription('👤 بدء جولة تخمين شخصية')
    .addChannelOption((option) => option.setName('روم').setDescription('روم اللعبة')
      .addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder().setName('خمن-الصورة').setDescription('🖼️ بدء جولة تخمين صورة')
    .addChannelOption((option) => option.setName('روم').setDescription('روم اللعبة')
      .addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder().setName('ميم').setDescription('😂 عرض ميم عربي عشوائي')
];

module.exports = commands;