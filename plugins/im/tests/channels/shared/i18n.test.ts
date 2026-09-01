// @ts-nocheck
import { afterEach, onTestFinished, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  getImHostLanguage,
  setImHostLanguage,
  t,
} from '../../../src/channels/shared/i18n.ts';
import { EN } from '../../../src/channels/shared/i18n-en.ts';
import { runWorkspaceCommand } from '../../../src/channels/shared/workspace-command.ts';

const here = dirname(fileURLToPath(import.meta.url));
const srcChannelsDir = join(here, '..', '..', '..', 'src', 'channels');

afterEach(() => {
  setImHostLanguage('zh');
});

test('host language defaults to Chinese and t() is the identity function', () => {
  setImHostLanguage(undefined);
  assert.equal(getImHostLanguage(), 'zh');
  assert.equal(t('连接成功'), '连接成功');
  assert.equal(t('共 {count} 个机器人', { count: 3 }), '共 3 个机器人');
});

test('setImHostLanguage accepts English spellings and falls back to Chinese', () => {
  for (const value of ['en', 'EN', 'en-US', ' english ']) {
    setImHostLanguage(value);
    assert.equal(getImHostLanguage(), 'en', `expected ${value} to select English`);
  }
  for (const value of [undefined, null, '', 'zh', 'zh-CN', 'fr', 'enabled', 42]) {
    setImHostLanguage(value);
    assert.equal(getImHostLanguage(), 'zh', `expected ${value} to select Chinese`);
  }
});

test('t() translates known keys and fills placeholders in English mode', () => {
  setImHostLanguage('en');
  const [key] = Object.keys(EN);
  if (key) {
    assert.equal(t(key), EN[key]);
  }
  assert.equal(t('未收录的中文'), '未收录的中文');
  assert.equal(t('{value} 测试', { value: 'x' }), EN['{value} 测试'] ?? 'x 测试');
  assert.equal(t(42), 42);
});

test('every English dictionary entry is a non-empty translation of a Chinese key', () => {
  for (const [key, value] of Object.entries(EN)) {
    assert.ok(/[一-鿿（）]/.test(key), `dictionary key is not a Chinese source string: ${key}`);
    assert.ok(typeof value === 'string' && value.trim().length > 0, `empty translation for: ${key}`);
    const placeholders = (text) => [...new Set(
      [...text.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map((match) => match[1]),
    )].sort();
    assert.deepEqual(
      placeholders(value),
      placeholders(key),
      `placeholder mismatch for: ${key}`,
    );
  }
});

test('English dictionary source files do not define duplicate keys', async () => {
  const dictionaryDir = join(srcChannelsDir, 'shared', 'i18n-en');
  const seen = new Map();
  const duplicates = [];
  const files = readdirSync(dictionaryDir)
    .filter((file) => file.endsWith('.mjs'))
    .sort();
  for (const file of files) {
    const { default: entries } = await import(pathToFileURL(join(dictionaryDir, file)).href);
    for (const key of Object.keys(entries)) {
      if (seen.has(key)) duplicates.push(`${key}: ${seen.get(key)}, ${file}`);
      else seen.set(key, file);
    }
  }
  assert.deepEqual(duplicates, []);
});

test('every literal t() key in src/channels has an English dictionary entry', () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (entry !== 'i18n-en') walk(path);
      } else if (entry.endsWith('.mjs') && entry !== 'i18n.mjs' && entry !== 'i18n-en.mjs') {
        files.push(path);
      }
    }
  };
  walk(srcChannelsDir);

  const keyPattern = /\bt\(\s*(['`])((?:[^\\`'"$]|\$(?!\{)|\\.)*)\1/g;
  // Decode the escapes a real string literal would apply, so keys written as
  // `...\n...` in source compare against the runtime dictionary key (newline).
  const decodeLiteral = (raw) => {
    let out = '';
    for (let i = 0; i < raw.length; i += 1) {
      if (raw[i] !== '\\' || i + 1 >= raw.length) {
        out += raw[i];
        continue;
      }
      const next = raw[i + 1];
      if (next === 'n') out += '\n';
      else if (next === 't') out += '\t';
      else if (next === 'r') out += '\r';
      else out += next; // \', \", \\, \` and anything else keep the char
      i += 1;
    }
    return out;
  };
  const missing = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(keyPattern)) {
      const key = decodeLiteral(match[2]);
      if (!/[一-鿿]/.test(key)) continue;
      if (!Object.hasOwn(EN, key)) {
        missing.push(`${file}: ${match[2]}`);
      }
    }
  }
  assert.deepEqual(missing, [], 't() keys missing from the English dictionary');
});

test('every literal workspace command key has an English dictionary entry', () => {
  const source = readFileSync(join(srcChannelsDir, 'shared', 'workspace-command.ts'), 'utf8');
  const keyPattern = /\bt\(\s*(['`])((?:[^\\`'"$]|\$(?!\{)|\\.)*)\1/g;
  const missing = [...source.matchAll(keyPattern)]
    .map((match) => match[2].replaceAll('\\n', '\n'))
    .filter((key) => /[一-鿿]/u.test(key) && !Object.hasOwn(EN, key));
  assert.deepEqual([...new Set(missing)], []);
});

test('project text commands render in English mode', async () => {
  setImHostLanguage('en');
  const project = { workspaceId: 'project-office', title: 'Office Assistant', path: '/tmp/office' };
  const harness = {
    currentProject: () => project,
    listProjects: async () => [project],
    switchProject: async () => project,
    listProjectSessions: async () => ({ project, sessions: [] }),
  };
  const messages = await Promise.all([
    runWorkspaceCommand('/workspacelist', harness),
    runWorkspaceCommand('/workspace', harness),
    runWorkspaceCommand('/workspace Office Assistant', harness),
    runWorkspaceCommand('/workspace Missing', harness),
    runWorkspaceCommand('/sessionlist', harness),
    runWorkspaceCommand('/sessionlist named-project', harness),
    runWorkspaceCommand('/session', harness, 'direct:one'),
  ]);
  const text = messages.map((result) => result.message).join('\n');
  assert.doesNotMatch(text, /[一-鿿]/u);
  assert.match(text, /Projects created in Web/);
  assert.match(text, /Switched to project “Office Assistant”\./);
  assert.match(text, /Project: Office Assistant/);
});
