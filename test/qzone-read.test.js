import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readQzone } from '../src/features/qzone-read.js'
import module from '../src/modules/qzone-social/index.js'

const cfg = { enabled: true, ownerQQ: '123456', botQQ: '987654', qzoneSocial: { enabled: false } }

test('主人列表只读，保留时间、tid 和图片地址，不触发互动', async () => {
  const calls = []
  const onebot = { call: async (action, params) => {
    calls.push({ action, params })
    return { total: 1, msglist: [{ tid: 'abc123', content: '旧说说', time: 100, comment_num: 2, images: ['https://example.com/a.jpg'] }] }
  } }
  const result = await readQzone(onebot, cfg)
  assert.equal(result.items[0].time, 100)
  assert.equal(result.items[0].tid, 'abc123')
  assert.match(result.message, /旧说说/)
  assert.deepEqual(calls, [{ action: 'get_qzone_msg_list', params: { target_uin: 123456, pos: 0, num: 5 } }])
})

test('详情走指定账号和 tid，限制返回评论和内联回复', async () => {
  const comment = { name: '好友', uin: 555555, time: 100, content: '评论', replies: [{ name: '自己', uin: 987654, time: 101, content: '回复' }] }
  const onebot = { call: async (action, params) => {
    assert.equal(action, 'get_qzone_msg_detail')
    assert.deepEqual(params, { target_uin: 987654, pos: 0, num: 1, tid: 'abc123' })
    return { tid: 'abc123', content: '正文', comment_num: 2, comments: [comment, comment] }
  } }
  const result = await readQzone(onebot, cfg, { target: 'self', tid: 'abc123', num: 1 })
  assert.equal(result.comments.length, 1)
  assert.equal(result.comments[0].replies[0].content, '回复')
  assert.match(result.message, /正文/)
})

test('正常空页、结构异常及权限失败不混淆', async () => {
  const result = await readQzone({ call: async () => ({ total: 0, msglist: [] }) }, cfg)
  assert.deepEqual(result.items, [])
  assert.match(result.message, /可见范围/)
  await assert.rejects(readQzone({ call: async () => ({ msglist: null }) }, cfg), /结构异常/)
  await assert.rejects(readQzone({ call: async () => { throw new Error('permission denied') } }, cfg), /permission denied/)
})

test('无效目标和分页参数不请求网关', async () => {
  const onebot = { call: () => assert.fail('不应请求') }
  for (const args of [{ target: '陌生昵称' }, { pos: -1 }, { num: 11 }, { num: 0 }, { tid: 'bad/tid' }]) {
    await assert.rejects(readQzone(onebot, cfg, args))
  }
})

test('私聊和群聊都可只读；不要求主人或完整工具权限，自动互动关闭仍可用', async () => {
  let factory, calls = 0
  const liveCfg = { ...cfg }
  const api = {
    core: { hub: {}, onebot: { call: async () => { calls++; return { total: 0, msglist: [] } } } },
    config: () => liveCfg, lazy: () => ({}), log: {}, tool: f => { factory = f }, every() {}, route() {},
  }
  module.setup(api)
  const privateOwner = { chat: { kind: 'private', userId: '123456' }, level: 'full', sessionId: 'test' }
  for (const info of [privateOwner,
    { ...privateOwner, chat: { kind: 'group', groupId: '111111' }, level: 'social' },
    { ...privateOwner, chat: { kind: 'private', userId: '555555' }, level: 'social' }]) {
    const tool = factory(info)
    assert.equal(tool.name, 'qq_read_qzone')
    assert.equal((await tool.execute({ target: '555555' })).ok, true)
  }
  assert.equal(calls, 3)
  assert.deepEqual(factory({ chat: { kind: 'system' } }), [])
  const tool = factory(privateOwner)
  liveCfg.enabled = false
  assert.deepEqual(factory(privateOwner), [])
  assert.equal((await tool.execute({})).ok, false)
  assert.equal(calls, 3)
})
