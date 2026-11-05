import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TTS_TAG_LIBRARIES, stripTtsTags, ttsTagRules } from '../src/voice/tts-tags.js'
import { parseReply } from '../src/chat/reply.js'
import { createHub } from '../src/chat/hub.js'
import { normalize } from '../src/core/config.js'
import voiceModule from '../src/modules/voice/index.js'

const dir = mkdtempSync(join(tmpdir(), 'aurabot-tts-tags-'))
process.env.AURABOT_DATA_DIR = dir
const audio = join(dir, 'speech.wav')
writeFileSync(audio, 'RIFF')
const log = { info() {}, warn() {}, debug() {}, error() {} }

test('只清除文档中的精确发声标签，保留其他方括号内容', () => {
  assert.equal(stripTtsTags(Object.values(TTS_TAG_LIBRARIES.breezeblue).join('') + '你好[周五见][捂脸]'), '你好[周五见][捂脸]')
  assert.equal(stripTtsTags('[轻笑]你好[叹气]'), '你好')
  assert.equal(stripTtsTags('普通文本'), '普通文本')
  assert.equal(stripTtsTags('[轻笑]你好', { keepForEngine: 'breezeblue' }), '[轻笑]你好')
  assert.equal(stripTtsTags('[轻笑]你好', { keepForEngine: 'windows' }), '你好')
  assert.deepEqual(ttsTagRules('unsupported'), [])
})

test('回复解析：语音内保留标签，普通文字移除标签，标签本身不生成空气泡', () => {
  assert.deepEqual(parseReply('[轻笑]你好|||<voice>[耳语]晚安。[停顿]</voice>').items, [
    { kind: 'text', value: '你好' },
    { kind: 'voice', value: '[耳语]晚安。[停顿]' },
  ])
  assert.equal(parseReply('[叹气]').silent, true)
})

test('语音模块：规则随开关和引擎切换，其他引擎及本地 TTS 不接收标签', async (t) => {
  let cfg = normalize({ voice: { enabled: true, engine: 'breezeblue' } })
  let rule
  let localText
  const voice = voiceModule.setup({
    config: () => cfg,
    core: {
      hub: {}, onebot: {}, http: {},
      local: { active: () => true, call: async (kind, body) => { localText = body.text; return { file: audio } } },
    },
    rule: (fn) => { rule = fn },
    route() {},
    use: () => null,
    onDispose: (fn) => t.after(fn),
    log,
  })
  const rules = rule('private', cfg).join('\n')
  for (const tag of Object.values(TTS_TAG_LIBRARIES.breezeblue)) assert.ok(rules.includes(tag))
  assert.match(rules, /<voice>/)
  assert.doesNotMatch(rules, /BreezeBlue/)
  cfg.voice.enabled = false
  assert.deepEqual(rule('private', cfg), [])
  cfg.voice.enabled = true
  cfg.voice.engine = 'windows'
  assert.deepEqual(rule('private', cfg), [])
  assert.equal((await voice.speak('[轻笑]你好')).engine, 'local')
  assert.equal(localText, '你好')
})

test('发送：Breeze 语音收到标签，失败或关闭时发纯文字，随机转语音不补标签', async () => {
  const cfg = normalize({
    enabled: true, dryRun: false, botQQ: '20000002', ownerQQ: '10000001',
    voice: { enabled: true, engine: 'breezeblue', autoChance: 0 },
    stickers: { enabled: false, faces: false, autoChance: 0 },
  })
  const messages = []
  const spoken = []
  let fail = true
  const hub = createHub({
    dsh: {}, getConfig: () => cfg, log, stickers: {},
    onebot: { call: async (action, params) => { messages.push(params.message); return { message_id: 1 } } },
    tts: { speak: async (text) => {
      spoken.push(text)
      if (fail) throw new Error('模拟合成失败')
      return { file: audio, engine: 'breezeblue' }
    } },
  })
  const chat = 'private:10000001'
  await hub.deliver(chat, '<voice>[轻笑]你好</voice>')
  assert.deepEqual(spoken, ['[轻笑]你好'])
  assert.equal(messages.at(-1)[0].data.text, '你好')
  cfg.voice.enabled = false
  await hub.deliver(chat, '<voice>[耳语]晚安</voice>')
  assert.equal(messages.at(-1)[0].data.text, '晚安')
  assert.equal(spoken.length, 1)
  await hub.sendText(chat, '[叹气]明天见[周五]')
  assert.equal(messages.at(-1)[0].data.text, '明天见[周五]')

  cfg.voice.enabled = true
  fail = false
  await hub.deliver(chat, '<voice>[轻笑]早上好</voice>')
  assert.equal(spoken.at(-1), '[轻笑]早上好')
  assert.equal(messages.at(-1)[0].type, 'record')
  cfg.voice.autoChance = 1
  await hub.deliver(chat, '今天过得怎么样')
  assert.equal(spoken.at(-1), '今天过得怎么样')
  assert.equal(messages.at(-1)[0].type, 'record')
})
