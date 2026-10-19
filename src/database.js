const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

// يدعم Railway Volume عبر متغير DATA_DIR (مثلاً /data)
const dataDirectory = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDirectory, { recursive: true });

const db = new Database(path.join(dataDirectory, 'bot.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    guild_id TEXT PRIMARY KEY,
    ticket_channel_id TEXT,
    support_role_id TEXT,
    application_panel_channel_id TEXT,
    application_review_channel_id TEXT
  );
  CREATE TABLE IF NOT EXISTS warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS warnings_by_user ON warnings(guild_id, user_id);
  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    answers TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewer_id TEXT,
    decided_at TEXT,
    review_message_id TEXT,
    review_channel_id TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tickets (
    channel_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS tickets_by_owner ON tickets(guild_id, user_id, status);
  CREATE UNIQUE INDEX IF NOT EXISTS one_open_ticket_per_user ON tickets(guild_id, user_id) WHERE status = 'open';
  CREATE TABLE IF NOT EXISTS giveaways (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    prize TEXT NOT NULL,
    winner_count INTEGER NOT NULL,
    ends_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT NOT NULL,
    winners_json TEXT
  );
  CREATE INDEX IF NOT EXISTS active_giveaways ON giveaways(status, ends_at);
  CREATE TABLE IF NOT EXISTS giveaway_entries (
    giveaway_id INTEGER NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    entered_at TEXT NOT NULL,
    PRIMARY KEY (giveaway_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS afk_status (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    started_at TEXT NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS afk_mentions (
    guild_id TEXT NOT NULL,
    afk_user_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (guild_id, afk_user_id, message_id)
  );
  CREATE INDEX IF NOT EXISTS afk_mentions_by_user ON afk_mentions(guild_id, afk_user_id, created_at);
  CREATE TABLE IF NOT EXISTS channel_locks (
    channel_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    previous_send_state TEXT NOT NULL,
    locked_by TEXT NOT NULL,
    locked_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS member_levels (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 0,
    xp INTEGER NOT NULL DEFAULT 0,
    last_message_xp_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS level_settings (
    guild_id TEXT PRIMARY KEY,
    announce_channel_id TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS voice_level_settings (
    guild_id TEXT PRIMARY KEY,
    announce_channel_id TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS member_level_xp_sources (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    message_xp INTEGER NOT NULL DEFAULT 0,
    voice_xp INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS level_rewards (
    guild_id TEXT NOT NULL,
    level INTEGER NOT NULL,
    role_id TEXT NOT NULL,
    PRIMARY KEY (guild_id, level)
  );
  CREATE TABLE IF NOT EXISTS level_reward_claims (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    level INTEGER NOT NULL,
    role_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    awarded_at TEXT,
    PRIMARY KEY (guild_id, user_id, level, role_id)
  );
  CREATE TABLE IF NOT EXISTS wallet_balances (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    coins INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS auto_replies (
    guild_id TEXT NOT NULL,
    normalized_keyword TEXT NOT NULL,
    keyword TEXT NOT NULL,
    response TEXT NOT NULL,
    PRIMARY KEY (guild_id, normalized_keyword)
  );
`);

const statements = {
  getSettings: db.prepare('SELECT * FROM settings WHERE guild_id = ?'),
  saveSettings: db.prepare(`
    INSERT INTO settings (guild_id, ticket_channel_id, support_role_id, application_panel_channel_id, application_review_channel_id)
    VALUES (@guild_id, @ticket_channel_id, @support_role_id, @application_panel_channel_id, @application_review_channel_id)
    ON CONFLICT(guild_id) DO UPDATE SET
      ticket_channel_id = excluded.ticket_channel_id,
      support_role_id = excluded.support_role_id,
      application_panel_channel_id = excluded.application_panel_channel_id,
      application_review_channel_id = excluded.application_review_channel_id
  `),
  addWarning: db.prepare(`INSERT INTO warnings (guild_id, user_id, reason, moderator_id, created_at)
    VALUES (?, ?, ?, ?, ?)`),
  getWarnings: db.prepare('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY id DESC'),
  deleteWarnings: db.prepare('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?'),
  createApplication: db.prepare(`INSERT INTO applications (guild_id, user_id, answers, created_at)
    VALUES (?, ?, ?, ?)`),
  getApplication: db.prepare('SELECT * FROM applications WHERE id = ? AND guild_id = ?'),
  setReviewMessage: db.prepare(`UPDATE applications SET review_message_id = ?, review_channel_id = ? WHERE id = ?`),
  decideApplication: db.prepare(`UPDATE applications SET status = ?, reviewer_id = ?, decided_at = ?
    WHERE id = ? AND guild_id = ? AND status = 'pending'`),
  findOpenTicket: db.prepare(`SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'`),
  createTicket: db.prepare(`INSERT INTO tickets (channel_id, guild_id, user_id, created_at) VALUES (?, ?, ?, ?)`),
  getTicket: db.prepare('SELECT * FROM tickets WHERE channel_id = ? AND guild_id = ?'),
  setTicketStatus: db.prepare('UPDATE tickets SET status = ? WHERE channel_id = ?'),
  deleteTicket: db.prepare('DELETE FROM tickets WHERE channel_id = ?'),
  createGiveaway: db.prepare(`INSERT INTO giveaways (guild_id, channel_id, prize, winner_count, ends_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?)`),
  setGiveawayMessage: db.prepare('UPDATE giveaways SET message_id = ? WHERE id = ?'),
  cancelGiveaway: db.prepare("UPDATE giveaways SET status = 'cancelled' WHERE id = ? AND status = 'active'"),
  getGiveaway: db.prepare('SELECT * FROM giveaways WHERE id = ? AND guild_id = ?'),
  getGiveawayById: db.prepare('SELECT * FROM giveaways WHERE id = ?'),
  getActiveGiveaway: db.prepare("SELECT * FROM giveaways WHERE id = ? AND guild_id = ? AND status = 'active'"),
  getActiveGiveaways: db.prepare("SELECT * FROM giveaways WHERE status = 'active' ORDER BY ends_at"),
  enterGiveaway: db.prepare('INSERT OR IGNORE INTO giveaway_entries (giveaway_id, user_id, entered_at) VALUES (?, ?, ?)'),
  countGiveawayEntries: db.prepare('SELECT COUNT(*) AS count FROM giveaway_entries WHERE giveaway_id = ?'),
  getGiveawayEntries: db.prepare('SELECT user_id FROM giveaway_entries WHERE giveaway_id = ?'),
  finishGiveaway: db.prepare("UPDATE giveaways SET status = 'ended', winners_json = ? WHERE id = ? AND status = 'active'"),
  setAfk: db.prepare(`INSERT INTO afk_status (guild_id, user_id, reason, started_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET reason = excluded.reason, started_at = excluded.started_at`),
  getAfk: db.prepare('SELECT * FROM afk_status WHERE guild_id = ? AND user_id = ?'),
  removeAfk: db.prepare('DELETE FROM afk_status WHERE guild_id = ? AND user_id = ?'),
  addAfkMention: db.prepare(`INSERT OR IGNORE INTO afk_mentions (guild_id, afk_user_id, message_id, channel_id, author_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`),
  getAfkMentions: db.prepare(`SELECT * FROM afk_mentions WHERE guild_id = ? AND afk_user_id = ? ORDER BY created_at ASC`),
  clearAfkMentions: db.prepare('DELETE FROM afk_mentions WHERE guild_id = ? AND afk_user_id = ?'),
  getChannelLock: db.prepare('SELECT * FROM channel_locks WHERE channel_id = ? AND guild_id = ?'),
  saveChannelLock: db.prepare(`INSERT INTO channel_locks (channel_id, guild_id, previous_send_state, locked_by, locked_at)
    VALUES (?, ?, ?, ?, ?)`),
  deleteChannelLock: db.prepare('DELETE FROM channel_locks WHERE channel_id = ? AND guild_id = ?'),
  getMemberLevel: db.prepare('SELECT * FROM member_levels WHERE guild_id = ? AND user_id = ?'),
  saveMemberLevel: db.prepare(`INSERT INTO member_levels (guild_id, user_id, level, xp, last_message_xp_at)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET
      level = excluded.level, xp = excluded.xp, last_message_xp_at = excluded.last_message_xp_at`),
  getLevelSettings: db.prepare('SELECT * FROM level_settings WHERE guild_id = ?'),
  setLevelChannel: db.prepare(`INSERT INTO level_settings (guild_id, announce_channel_id) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET announce_channel_id = excluded.announce_channel_id`),
  getVoiceLevelSettings: db.prepare('SELECT * FROM voice_level_settings WHERE guild_id = ?'),
  setVoiceLevelChannel: db.prepare(`INSERT INTO voice_level_settings (guild_id, announce_channel_id) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET announce_channel_id = excluded.announce_channel_id`),
  addMessageLevelXp: db.prepare(`INSERT INTO member_level_xp_sources (guild_id, user_id, message_xp) VALUES (?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET message_xp = message_xp + excluded.message_xp`),
  addVoiceLevelXp: db.prepare(`INSERT INTO member_level_xp_sources (guild_id, user_id, voice_xp) VALUES (?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET voice_xp = voice_xp + excluded.voice_xp`),
  getLevelXpSourceCounts: db.prepare(`SELECT COUNT(*) FILTER (WHERE message_xp > 0) AS message_count,
    COUNT(*) FILTER (WHERE voice_xp > 0) AS voice_count FROM member_level_xp_sources WHERE guild_id = ?`),
  getGlobalLevelXpCount: db.prepare('SELECT COUNT(*) AS count FROM member_levels WHERE guild_id = ? AND level >= 1'),
  getGlobalLevelXpRanking: db.prepare(`SELECT user_id,
    ((level - 1) * 100 + 25 * level * (level - 1) + xp) AS xp
    FROM member_levels WHERE guild_id = ? AND level >= 1
    ORDER BY xp DESC, user_id LIMIT ? OFFSET ?`),
  getMessageLevelXpRanking: db.prepare(`SELECT user_id, message_xp AS xp FROM member_level_xp_sources
    WHERE guild_id = ? AND message_xp > 0 ORDER BY message_xp DESC, user_id LIMIT ? OFFSET ?`),
  getVoiceLevelXpRanking: db.prepare(`SELECT user_id, voice_xp AS xp FROM member_level_xp_sources
    WHERE guild_id = ? AND voice_xp > 0 ORDER BY voice_xp DESC, user_id LIMIT ? OFFSET ?`),
  getLevelRewards: db.prepare('SELECT level, role_id FROM level_rewards WHERE guild_id = ? ORDER BY level'),
  getLevelReward: db.prepare('SELECT level, role_id FROM level_rewards WHERE guild_id = ? AND level = ?'),
  setLevelReward: db.prepare(`INSERT INTO level_rewards (guild_id, level, role_id) VALUES (?, ?, ?)
    ON CONFLICT(guild_id, level) DO UPDATE SET role_id = excluded.role_id`),
  deleteLevelReward: db.prepare('DELETE FROM level_rewards WHERE guild_id = ? AND level = ?'),
  queueLevelRewardClaim: db.prepare(`INSERT OR IGNORE INTO level_reward_claims (guild_id, user_id, level, role_id)
    VALUES (?, ?, ?, ?)`),
  getPendingLevelRewardClaims: db.prepare(`SELECT level, role_id FROM level_reward_claims
    WHERE guild_id = ? AND user_id = ? AND status = 'pending' ORDER BY level`),
  markLevelRewardClaimAwarded: db.prepare(`UPDATE level_reward_claims
    SET status = 'awarded', awarded_at = ? WHERE guild_id = ? AND user_id = ? AND level = ? AND role_id = ? AND status = 'pending'`),
  getWalletBalance: db.prepare('SELECT * FROM wallet_balances WHERE guild_id = ? AND user_id = ?'),
  createWalletBalance: db.prepare('INSERT INTO wallet_balances (guild_id, user_id, coins) VALUES (?, ?, ?)'),
  setWalletBalance: db.prepare('UPDATE wallet_balances SET coins = ? WHERE guild_id = ? AND user_id = ?'),
  setAutoReply: db.prepare(`INSERT INTO auto_replies (guild_id, normalized_keyword, keyword, response)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, normalized_keyword) DO UPDATE SET
      keyword = excluded.keyword, response = excluded.response`),
  deleteAutoReply: db.prepare('DELETE FROM auto_replies WHERE guild_id = ? AND normalized_keyword = ?'),
  getAutoReplies: db.prepare('SELECT keyword, normalized_keyword, response FROM auto_replies WHERE guild_id = ? ORDER BY rowid')
};

module.exports = { db, statements };