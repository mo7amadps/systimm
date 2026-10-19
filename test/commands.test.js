const assert = require('node:assert/strict');
const test = require('node:test');
const { PermissionFlagsBits } = require('discord.js');
const commands = require('../src/commands');

test('slash commands have unique names and serialize successfully', () => {
  const serialized = commands.map((command) => command.toJSON());
  const names = serialized.map((command) => command.name);
  assert.equal(new Set(names).size, names.length);
});

test('slash command descriptions start with an emoji', () => {
  for (const command of commands) {
    assert.match(command.toJSON().description, /^\p{Extended_Pictographic}/u, command.name);
  }
});

test('auto-reply deletion is a manager-only picker and the old command is removed', () => {
  const clearCommand = commands.find((entry) => entry.name === 'مسح-رد-تلقائي').toJSON();
  assert.equal(clearCommand.default_member_permissions, PermissionFlagsBits.ManageGuild.toString());
  assert.deepEqual(clearCommand.options, []);
  assert.equal(commands.some((entry) => entry.name === 'حذف-رد-تلقائي'), false);
});

test('moderation commands are visible to members with the matching permissions', () => {
  const serializedByName = new Map(commands.map((command) => {
    const serialized = command.toJSON();
    return [serialized.name, serialized];
  }));

  assert.equal(
    serializedByName.get('رتبة').default_member_permissions,
    PermissionFlagsBits.ManageRoles.toString()
  );
  for (const name of ['تايم', 'تكلم']) {
    assert.equal(
      serializedByName.get(name).default_member_permissions,
      PermissionFlagsBits.ModerateMembers.toString()
    );
  }
});

test('manual level grants are admin-only and require a count and XP category', () => {
  const command = commands.find((entry) => entry.name === 'اعطاء-لفل').toJSON();
  assert.equal(command.default_member_permissions, PermissionFlagsBits.ManageGuild.toString());
  assert.deepEqual(command.options.map((option) => option.name), ['العضو', 'العدد', 'التصنيف']);
  assert.deepEqual(command.options[1].min_value, 1);
  assert.deepEqual(command.options[1].max_value, 100);
  assert.deepEqual(command.options[2].choices.map((choice) => choice.value), ['messages', 'voice']);
});
