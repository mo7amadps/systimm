const assert = require('node:assert/strict');
const test = require('node:test');
const { ButtonStyle } = require('discord.js');
const { createCommunityGames } = require('../src/community-games');

test('automatic replies remove the robot emoji even when it is stored in the response', async () => {
  let sentPayload;
  const games = createCommunityGames({}, {
    getAutoReplies: {
      all: () => [{ normalized_keyword: 'مرحبا', response: '🤖 أهلًا بك!' }]
    }
  });

  await games.handleMessage({
    guild: { id: 'guild-auto-reply' },
    channel: { send: async (payload) => { sentPayload = payload; } },
    author: { bot: false },
    content: 'مرحبا'
  });

  assert.deepEqual(sentPayload, {
    content: 'أهلًا بك!',
    allowedMentions: { parse: [] }
  });
});

test('winning the green-button game ends the round and awards the winner', async () => {
  const awards = [];
  const walletStatements = {
    getWalletBalance: { get: () => null },
    createWalletBalance: { run: (...values) => awards.push(values) },
    setWalletBalance: { run: () => assert.fail('A new wallet should be created for the winner.') }
  };
  const gameMessage = {
    components: [],
    edit: async function (payload) {
      this.components = payload.components;
    }
  };
  const channel = {
    id: 'channel-1',
    permissionsFor: () => ({ has: () => true }),
    isTextBased: () => true,
    messages: { fetch: async () => gameMessage },
    send: async (payload) => {
      if (payload.components) gameMessage.components = payload.components;
      else channel.announcements.push(payload);
      return { id: 'game-message' };
    },
    announcements: []
  };
  const client = { channels: { fetch: async () => channel } };
  const games = createCommunityGames(client, walletStatements);
  const interaction = {
    commandName: 'زر-أخضر',
    guildId: 'guild-1',
    channelId: channel.id,
    guild: { members: { me: {} } },
    member: {},
    user: { id: 'winner-1' },
    options: { getChannel: () => channel },
    deferReply: async () => {},
    editReply: async () => {}
  };

  await games.handleCommand(interaction);
  const winningButton = gameMessage.components
    .flatMap((row) => row.components)
    .find((button) => button.data.style === ButtonStyle.Success);
  assert.ok(winningButton, 'the game should contain one green winning button');

  let deferred = false;
  await games.handleButton({
    customId: winningButton.data.custom_id,
    guildId: interaction.guildId,
    channelId: channel.id,
    user: interaction.user,
    deferUpdate: async () => { deferred = true; },
    reply: async (payload) => assert.fail(`Unexpected rejection: ${payload.content}`)
  });

  assert.equal(deferred, true, 'the winning button interaction should be acknowledged');
  assert.deepEqual(awards, [['guild-1', 'winner-1', 20]]);
  assert.equal(channel.announcements.length, 1);
  assert.match(channel.announcements[0].content, /فزت بالجولة/);
  assert.ok(gameMessage.components.flatMap((row) => row.components).every((button) => button.data.disabled));
});

test('a correct country guess ends the round and awards the winner', async () => {
  const awards = [];
  const statements = {
    getWalletBalance: { get: () => null },
    createWalletBalance: { run: (...values) => awards.push(values) },
    setWalletBalance: { run: () => assert.fail('A new wallet should be created for the winner.') },
    getAutoReplies: { all: () => [] }
  };
  const channel = {
    id: 'channel-2',
    permissionsFor: () => ({ has: () => true }),
    isTextBased: () => true,
    messages: { fetch: async () => null },
    announcements: [],
    send: async (payload) => {
      if (payload.content) channel.announcements.push(payload);
      return { id: 'game-message' };
    }
  };
  const games = createCommunityGames({ channels: { fetch: async () => channel } }, statements);

  await games.handleCommand({
    commandName: 'تخمين-البلد',
    guildId: 'guild-2',
    channelId: channel.id,
    guild: { members: { me: {} } },
    member: {},
    options: { getChannel: () => channel },
    deferReply: async () => {},
    editReply: async () => {}
  });

  for (const answer of [
    'مصر', 'السعودية', 'اليابان', 'فرنسا', 'البرازيل', 'المغرب', 'أستراليا', 'إيطاليا',
    'كندا', 'تركيا', 'الهند', 'الأرجنتين', 'الصين', 'إسبانيا', 'الأردن'
  ]) {
    await games.handleMessage({
      guild: { id: 'guild-2' },
      channel,
      author: { id: 'winner-2', bot: false },
      content: answer
    });
  }

  assert.deepEqual(awards, [['guild-2', 'winner-2', 10]]);
  assert.equal(channel.announcements.length, 1);
  assert.match(channel.announcements[0].content, /الإجابة الصحيحة/);
});

test('finishing a giveaway updates its message with zero entries safely', async () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  let finishTimer;
  global.setTimeout = (callback) => {
    finishTimer = callback;
    return {};
  };
  global.clearTimeout = () => {};

  const giveaway = {
    id: 1,
    guild_id: 'guild-giveaway',
    channel_id: 'giveaway-channel',
    prize: 'AY',
    winner_count: 1,
    ends_at: null,
    status: 'active',
    message_id: null
  };
  const sentMessages = [];
  const giveawayMessage = {
    components: [],
    edit: async function (payload) {
      this.editedPayload = payload;
      this.components = payload.components;
    }
  };
  const channel = {
    id: giveaway.channel_id,
    permissionsFor: () => ({ has: () => true }),
    isTextBased: () => true,
    messages: { fetch: async () => giveawayMessage },
    send: async (payload) => {
      sentMessages.push(payload);
      return { id: 'giveaway-message' };
    }
  };
  const statements = {
    createGiveaway: { run: () => ({ lastInsertRowid: giveaway.id }) },
    getGiveawayById: { get: () => giveaway },
    setGiveawayMessage: { run: (messageId) => { giveaway.message_id = messageId; } },
    getGiveawayEntries: { all: () => [] },
    finishGiveaway: {
      run: (winners, id) => {
        assert.equal(id, giveaway.id);
        giveaway.status = 'ended';
        giveaway.winners_json = winners;
        return { changes: 1 };
      }
    },
    countGiveawayEntries: { get: () => undefined }
  };
  const games = createCommunityGames({ channels: { fetch: async () => channel } }, statements);
  const interaction = {
    commandName: 'سحب',
    guildId: giveaway.guild_id,
    memberPermissions: { has: () => true },
    guild: { members: { me: {} } },
    member: {},
    options: {
      getChannel: () => channel,
      getString: (name) => name === 'المدة' ? '10s' : 'AY',
      getInteger: () => 1
    },
    user: { id: 'admin-1' },
    deferReply: async () => {},
    editReply: async () => {}
  };

  try {
    await games.handleCommand(interaction);
    assert.equal(sentMessages.length, 1, 'the giveaway panel should be posted');
    assert.ok(finishTimer, 'a giveaway finish timer should be scheduled');

    await finishTimer();

    assert.equal(giveaway.status, 'ended');
    assert.match(giveawayMessage.editedPayload.embeds[0].data.description, /المشاركون:\*\* 0/);
    assert.deepEqual(giveawayMessage.editedPayload.components, []);
    assert.equal(sentMessages.length, 2, 'the no-winner announcement should be posted');
    assert.match(sentMessages[1].content, /دون مشاركين/);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

test('a guessing-game timeout ends the round without a winner', async () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  let timeoutCallback;
  global.setTimeout = (callback) => {
    timeoutCallback = callback;
    return {};
  };
  global.clearTimeout = () => {};

  const announcements = [];
  const channel = {
    id: 'guess-timeout-channel',
    permissionsFor: () => ({ has: () => true }),
    isTextBased: () => true,
    send: async (payload) => {
      announcements.push(payload);
      return { id: 'guess-message' };
    }
  };
  const statements = {
    getAutoReplies: { all: () => [] }
  };
  const games = createCommunityGames({ channels: { fetch: async () => channel } }, statements);

  try {
    await games.handleCommand({
      commandName: 'تخمين-البلد',
      guildId: 'guild-timeout',
      channelId: channel.id,
      guild: { members: { me: {} } },
      member: {},
      options: { getChannel: () => channel },
      deferReply: async () => {},
      editReply: async () => {}
    });
    assert.equal(typeof timeoutCallback, 'function');

    await timeoutCallback();

    assert.equal(announcements.length, 2, 'the game should announce the answer when time expires');
    assert.match(announcements[1].content, /انتهت الجولة دون إجابة صحيحة/);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

test('auto-reply listing reports the command as handled', async () => {
  const games = createCommunityGames({}, {
    getAutoReplies: { all: () => [{ keyword: 'مرحبا', response: 'أهلًا' }] }
  });
  let replied = false;
  const handled = await games.handleAutoReplyCommand({
    commandName: 'الردود-التلقائية',
    guildId: 'guild-auto-replies',
    memberPermissions: { has: () => true },
    reply: async () => { replied = true; },
    followUp: async () => {}
  });

  assert.equal(replied, true);
  assert.ok(handled);
});

test('auto-reply deletion command shows a selectable list', async () => {
  let response;
  const games = createCommunityGames({}, {
    getAutoReplies: {
      all: () => [
        { keyword: 'أهلاً', normalized_keyword: 'اهلا', response: 'مرحبًا' },
        { keyword: 'مرحبا', normalized_keyword: 'مرحبا', response: 'أهلًا' }
      ]
    }
  });
  const handled = await games.handleAutoReplyCommand({
    commandName: 'مسح-رد-تلقائي',
    guildId: 'guild-delete-reply',
    memberPermissions: { has: () => true },
    reply: async (payload) => { response = payload; }
  });

  assert.ok(handled);
  assert.equal(response.ephemeral, true);
  const select = response.components[0].components[0].toJSON();
  assert.equal(select.options.length, 2);
  assert.equal(select.options[0].value, 'اهلا');
});

test('selecting an auto-reply deletes its normalized keyword in this guild', async () => {
  let deletedArguments;
  let response;
  const games = createCommunityGames({}, {
    getAutoReplies: {
      all: () => [{ keyword: 'أهلاً', normalized_keyword: 'اهلا', response: 'مرحبًا' }]
    },
    deleteAutoReply: {
      run: (...args) => {
        deletedArguments = args;
        return { changes: 1 };
      }
    }
  });
  const handled = await games.handleAutoReplySelectMenu({
    customId: 'auto-reply-delete',
    guildId: 'guild-delete-reply',
    memberPermissions: { has: () => true },
    values: ['اهلا'],
    update: async (payload) => {
      response = payload;
      return {};
    }
  });

  assert.ok(handled);
  assert.deepEqual(deletedArguments, ['guild-delete-reply', 'اهلا']);
  assert.match(response.content, /تم حذف الرد التلقائي/);
  assert.deepEqual(response.components, []);
});

test('auto-reply menu uses pagination when more than 25 replies exist', async () => {
  let response;
  const replies = Array.from({ length: 26 }, (_, index) => ({
    keyword: `كلمة${index}`,
    normalized_keyword: `كلمة${index}`,
    response: `رد${index}`
  }));
  const games = createCommunityGames({}, {
    getAutoReplies: { all: () => replies }
  });
  await games.handleAutoReplyCommand({
    commandName: 'مسح-رد-تلقائي',
    guildId: 'guild-delete-reply',
    memberPermissions: { has: () => true },
    reply: async (payload) => {
      response = payload;
      return {};
    }
  });

  assert.equal(response.components[0].components[0].toJSON().options.length, 25);
  assert.equal(response.components[1].components[1].toJSON().custom_id, 'auto-reply-delete-page:1');

  await games.handleAutoReplyDeletePage({
    customId: 'auto-reply-delete-page:1',
    guildId: 'guild-delete-reply',
    memberPermissions: { has: () => true },
    update: async (payload) => { response = payload; }
  });
  assert.equal(response.components[0].components[0].toJSON().options.length, 1);
});

test('stale auto-reply selections refresh the list or remove its components when empty', async () => {
  let response;
  const games = createCommunityGames({}, {
    getAutoReplies: { all: () => [] }
  });

  const handled = await games.handleAutoReplySelectMenu({
    customId: 'auto-reply-delete',
    guildId: 'guild-clear-reply',
    memberPermissions: { has: () => true },
    values: ['هلا'],
    update: async (payload) => { response = payload; }
  });

  assert.ok(handled);
  assert.match(response.content, /لا توجد ردود تلقائية/);
  assert.deepEqual(response.components, []);
});
