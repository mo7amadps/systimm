const assert = require('node:assert/strict');
const test = require('node:test');
const { createLevelSystem } = require('../src/levels');

test('level rewards are queued at the threshold and awarded only once', async () => {
  let currentLevel = { guild_id: 'guild-1', user_id: 'member-1', level: 1, xp: 149, last_message_xp_at: 0 };
  let awards = 0;
  let messageXpAdded = 0;
  let now = 100_000;
  const claims = new Map();
  const role = {
    id: 'role-2',
    managed: false,
    comparePositionTo: () => -1
  };
  const memberRoles = new Set();
  const member = {
    roles: {
      cache: memberRoles,
      add: async (grantedRole) => {
        awards += 1;
        memberRoles.add(grantedRole.id);
      }
    }
  };
  const statements = {
    getMemberLevel: { get: () => currentLevel },
    saveMemberLevel: {
      run: (guildId, userId, level, xp, lastMessageXpAt) => {
        currentLevel = { guild_id: guildId, user_id: userId, level, xp, last_message_xp_at: lastMessageXpAt };
      }
    },
    addMessageLevelXp: { run: (guildId, userId, amount) => { messageXpAdded += amount; } },
    addVoiceLevelXp: { run: () => assert.fail('Message XP must not count as voice XP.') },
    getLevelSettings: { get: () => null },
    getLevelRewards: { all: () => [{ level: 2, role_id: role.id }] },
    queueLevelRewardClaim: {
      run: (guildId, userId, level, roleId) => {
        const key = `${guildId}:${userId}:${level}:${roleId}`;
        if (!claims.has(key)) claims.set(key, { level, role_id: roleId, status: 'pending' });
      }
    },
    getPendingLevelRewardClaims: {
      all: (guildId, userId) => [...claims.entries()]
        .filter(([key, claim]) => key.startsWith(`${guildId}:${userId}:`) && claim.status === 'pending')
        .map(([, claim]) => claim)
    },
    markLevelRewardClaimAwarded: {
      run: (awardedAt, guildId, userId, level, roleId) => {
        claims.get(`${guildId}:${userId}:${level}:${roleId}`).status = 'awarded';
      }
    }
  };
  const botMember = {
    permissions: { has: () => true },
    roles: { highest: {} }
  };
  const guild = {
    id: 'guild-1',
    roles: { fetch: async () => role },
    members: {
      me: botMember,
      fetch: async () => member
    }
  };
  const system = createLevelSystem({ user: { id: 'bot-1' } }, statements);
  const originalNow = Date.now;
  Date.now = () => now;

  try {
    const message = {
      guild,
      author: { id: 'member-1', bot: false },
      content: 'رسالة اختبار'
    };
    await system.handleMessage(message);
    assert.equal(currentLevel.level, 2);
    assert.ok(messageXpAdded >= 15 && messageXpAdded <= 25);
    assert.equal(awards, 1);
    assert.equal([...claims.values()][0].status, 'awarded');

    currentLevel = { guild_id: 'guild-1', user_id: 'member-1', level: 1, xp: 149, last_message_xp_at: 0 };
    now += 60_001;
    await system.handleMessage(message);
    assert.equal(awards, 1);
  } finally {
    Date.now = originalNow;
  }
});

test('voice XP is tracked separately and level-up announcements use the configured voice channel', async () => {
  const levels = new Map([
    ['member-voice', { guild_id: 'guild-voice', user_id: 'member-voice', level: 1, xp: 149, last_message_xp_at: 0 }],
    ['member-other', { guild_id: 'guild-voice', user_id: 'member-other', level: 1, xp: 0, last_message_xp_at: 0 }]
  ]);
  let voiceXpAdded = 0;
  const sent = [];
  const voiceAnnouncementChannel = {
    isTextBased: () => true,
    send: async (payload) => { sent.push(payload); }
  };
  const guild = {
    id: 'guild-voice',
    afkChannelId: null,
    channels: {
      cache: new Map([['voice-room', {
        id: 'voice-room',
        isVoiceBased: () => true,
        members: new Map([
          ['member-voice', { id: 'member-voice', user: { bot: false }, voice: { selfDeaf: false, serverDeaf: false } }],
          ['member-other', { id: 'member-other', user: { bot: false }, voice: { selfDeaf: false, serverDeaf: false } }]
        ])
      }]])
    }
  };
  const statements = {
    getMemberLevel: { get: (guildId, userId) => levels.get(userId) },
    saveMemberLevel: {
      run: (guildId, userId, level, xp, lastMessageXpAt) => {
        levels.set(userId, { guild_id: guildId, user_id: userId, level, xp, last_message_xp_at: lastMessageXpAt });
      }
    },
    addMessageLevelXp: { run: () => assert.fail('Voice XP must not count as message XP.') },
    addVoiceLevelXp: { run: (guildId, userId, amount) => { voiceXpAdded += amount; } },
    getLevelSettings: { get: () => null },
    getVoiceLevelSettings: { get: () => ({ announce_channel_id: 'voice-announcements' }) },
    getLevelRewards: { all: () => [] },
    getPendingLevelRewardClaims: { all: () => [] }
  };
  const client = {
    guilds: { cache: new Map([[guild.id, guild]]) },
    channels: { fetch: async () => voiceAnnouncementChannel }
  };
  const system = createLevelSystem(client, statements);

  await system.awardVoiceXp();

  assert.equal(levels.get('member-voice').level, 2);
  assert.equal(voiceXpAdded, 20);
  assert.equal(sent.length, 1);
  assert.match(sent[0].content, /من مستوى 1 إلى مستوى 2/);
});

test('the level board includes existing level data and its category selector updates correctly', async () => {
  const statements = {
    getLevelXpSourceCounts: { get: () => ({ message_count: 0, voice_count: 1 }) },
    getGlobalLevelXpCount: { get: () => ({ count: 1 }) },
    getGlobalLevelXpRanking: {
      all: () => [{ user_id: 'existing-member', xp: 3_198 }]
    },
    getMessageLevelXpRanking: { all: () => [] },
    getVoiceLevelXpRanking: { all: () => [{ user_id: 'voice-member', xp: 40 }] }
  };
  const system = createLevelSystem({}, statements);
  let board;

  await system.handleCommand({
    commandName: 'تصنيفات',
    guildId: 'guild-board',
    reply: async (payload) => { board = payload; }
  });

  assert.match(board.embeds[0].data.fields[0].value, /existing-member/);
  assert.match(board.embeds[0].data.fields[0].value, /3,198 XP/);
  assert.match(board.embeds[0].data.fields[2].value, /voice-member/);
  assert.equal(board.components.length, 2);
  for (const row of board.components) row.toJSON();

  let updatedBoard;
  await system.handleComponent({
    customId: 'level-board:category:all:0',
    values: ['global'],
    guildId: 'guild-board',
    update: async (payload) => { updatedBoard = payload; }
  });
  assert.equal(updatedBoard.embeds[0].data.fields.length, 1);
  assert.match(updatedBoard.embeds[0].data.fields[0].name, /XP الإجمالي/);
});

test('handled level commands stop routing even when Discord reply resolves undefined', async () => {
  const statements = {
    getLevelXpSourceCounts: { get: () => ({ message_count: 0, voice_count: 0 }) },
    getGlobalLevelXpCount: { get: () => ({ count: 0 }) },
    getGlobalLevelXpRanking: { all: () => [] },
    getMessageLevelXpRanking: { all: () => [] },
    getVoiceLevelXpRanking: { all: () => [] },
    setVoiceLevelChannel: { run: () => {} }
  };
  const levelSystem = createLevelSystem({}, statements);
  const reply = async () => undefined;

  assert.equal(await levelSystem.handleCommand({
    commandName: 'تصنيفات',
    guildId: 'guild-routing',
    reply
  }), true);

  const voiceChannel = {
    id: 'voice-announcements',
    permissionsFor: () => ({ has: () => true })
  };
  assert.equal(await levelSystem.handleCommand({
    commandName: 'لفل-فويس',
    guildId: 'guild-routing',
    memberPermissions: { has: () => true },
    guild: { members: { me: {} } },
    options: { getChannel: () => voiceChannel },
    reply
  }), true);
});

test('admins can grant exact levels attributed to the selected XP category', async () => {
  let currentLevel = { guild_id: 'guild-grant', user_id: 'member-grant', level: 2, xp: 25, last_message_xp_at: 123 };
  let grantedMessageXp = 0;
  let grantedVoiceXp = 0;
  const statements = {
    getMemberLevel: { get: () => currentLevel },
    saveMemberLevel: {
      run: (guildId, userId, level, xp, lastMessageXpAt) => {
        currentLevel = { guild_id: guildId, user_id: userId, level, xp, last_message_xp_at: lastMessageXpAt };
      }
    },
    addMessageLevelXp: { run: (guildId, userId, amount) => { grantedMessageXp += amount; } },
    addVoiceLevelXp: { run: (guildId, userId, amount) => { grantedVoiceXp += amount; } },
    getLevelRewards: { all: () => [] },
    getPendingLevelRewardClaims: { all: () => [] },
    getLevelSettings: { get: () => null },
    getVoiceLevelSettings: { get: () => null }
  };
  const user = { id: 'member-grant', bot: false };
  const replies = [];
  const interaction = {
    commandName: 'اعطاء-لفل',
    guildId: 'guild-grant',
    guild: { id: 'guild-grant', members: { fetch: async () => ({ id: user.id }) } },
    memberPermissions: { has: () => true },
    options: {
      getUser: () => user,
      getInteger: () => 2,
      getString: () => 'voice'
    },
    deferReply: async (payload) => replies.push(['defer', payload]),
    editReply: async (payload) => replies.push(['edit', payload])
  };
  const system = createLevelSystem({}, statements);

  assert.equal(await system.handleCommand(interaction), true);
  assert.equal(currentLevel.level, 4);
  assert.equal(currentLevel.xp, 0);
  assert.equal(grantedMessageXp, 0);
  assert.equal(grantedVoiceXp, 425);
  assert.match(replies[1][1].content, /\*\*2\*\* مستوى بتصنيف \*\*فويس\*\*/);
});
