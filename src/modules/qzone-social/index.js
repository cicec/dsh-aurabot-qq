// 内置模块：空间互动。逛好友动态点赞评论，回复自己说说下的新评论。

import { createQzoneSocial } from '../../features/qzone-social.js'
import { readQzone } from '../../features/qzone-read.js'
import { defineTool, str, int } from '../../tools/tools.js'

export default {
  id: 'qzone-social',
  name: '空间互动',
  version: '1.0.0',
  description: '聊天里只读说说与评论；定时逛好友空间互动、回复自己说说下的评论',
  tab: 'diary',
  files: ['features/qzone-social.js', 'features/qzone-read.js'],
  setup(api) {
    const { hub, onebot } = api.core
    const social = createQzoneSocial({ getConfig: api.config, onebot, hub, memory: api.lazy('memory'), log: api.log })
    // 自动互动开关只控制定时任务；聊天里查空间不需要开启自动点赞评论。
    api.tool(({ chat }) => {
      const visible = () => api.config().enabled && chat.kind !== 'system'
      if (!visible()) return []
      return defineTool({
        name: 'qq_read_qzone',
        description: '看看 QQ 空间的说说和评论。有人问「能看到我的说说吗」「去我空间看看」时用，先实际读取再回答。看对方的空间时 target 填对方 QQ；不填看主人，self 看自己，也可填指定的 QQ 号。tid 不填读列表，填列表返回的 tid 读正文和评论。只读，不会点赞或评论，能看什么由机器人账号的空间访问权限决定。',
        properties: {
          target: str('owner（默认，看主人）、self（机器人自己）或 QQ 号'),
          tid: str('可选，列表返回的说说编号；填写后读取该条详情和评论'),
          pos: int('可选，起始偏移，默认 0；查详情时是评论偏移'),
          num: int('可选，本页最多条数，1～10，默认 5'),
        },
        execute: async args => {
          if (!visible()) return { ok: false, message: '当前未启用聊天空间浏览' }
          try { return await readQzone(onebot, api.config(), args) }
          catch (error) { return { ok: false, message: '这次空间读取失败：' + String(error.message || error).slice(0, 500) } }
        },
      })
    })
    api.every(60_000, () => social.tick(), '空间互动')
    api.route('/qzone/social/run', async () => social.run({ force: true }))
    api.route('/qzone/social/state', async () => ({ ok: true, ...social.state() }))
    return social
  },
}
