// 聊天里只读空间：不走自动互动，也不触发点赞、评论或记忆提炼。
const qqPattern = /^[1-9]\d{4,11}$/
const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : ''

function pageNumber(value, fallback, max) {
  const n = value ?? fallback
  if (!Number.isInteger(n) || n < (fallback === 0 ? 0 : 1) || n > max) throw new Error('分页参数不正确')
  return n
}

export function qzoneTarget(target, cfg) {
  const raw = String(target || 'owner').trim()
  const qq = ['owner', '主人', '你主人'].includes(raw) ? String(cfg.ownerQQ || '')
    : ['self', '自己', '我自己'].includes(raw) ? String(cfg.botQQ || '') : raw
  if (!qqPattern.test(qq)) throw new Error('请填写 QQ 号，或用 owner 表示主人、self 表示机器人自己')
  return qq
}

function commentOf(row) {
  if (!row || typeof row !== 'object') throw new Error('空间评论条目结构异常')
  return { name: text(row.name, 50), qq: String(row.uin || ''), time: row.time, content: text(row.content, 400) }
}

export async function readQzone(onebot, cfg, args = {}) {
  const target = qzoneTarget(args.target, cfg)
  const pos = pageNumber(args.pos, 0, 10000)
  const num = pageNumber(args.num, 5, 10)
  const tid = typeof args.tid === 'string' ? args.tid.trim() : ''
  if (tid && !/^[a-zA-Z0-9_-]{1,128}$/.test(tid)) throw new Error('说说编号不正确，请使用列表返回的 tid')
  const params = { target_uin: Number(target), pos, num }
  if (tid) {
    const data = await onebot.call('get_qzone_msg_detail', { ...params, tid }, { timeoutMs: 20000 })
    if (!data || data.tid !== tid || !Array.isArray(data.comments)) throw new Error('空间详情响应结构异常，不能确认是否已读取')
    const result = {
      tid, content: text(data.content, 2000), commentCount: data.comment_num,
      comments: data.comments.slice(0, num).map(row => ({
        ...commentOf(row), replies: Array.isArray(row.replies) ? row.replies.slice(0, 3).map(commentOf) : [],
      })),
    }
    return { ok: true, target, pos, ...result, message: '已读取这条说说及一页评论（内联回复可能不完整；时间为 Unix 秒）：\n' + JSON.stringify(result) }
  }
  const data = await onebot.call('get_qzone_msg_list', params, { timeoutMs: 20000 })
  // 空页的兼容属于网关；这里不把异常或权限失败吞成「没有说说」。
  if (!data || !Array.isArray(data.msglist)) throw new Error('空间列表响应结构异常，不能确认有没有说说')
  const items = data.msglist.slice(0, num).map(row => {
    if (!row || typeof row !== 'object' || typeof row.tid !== 'string' || !row.tid) throw new Error('空间列表条目结构异常')
    return {
      tid: row.tid, content: text(row.content, 1200), time: row.time, commentCount: row.comment_num,
      images: Array.isArray(row.images) ? row.images.filter(url => typeof url === 'string' && /^https?:\/\//i.test(url)).slice(0, 4) : [],
    }
  })
  return {
    ok: true, target, pos, total: data.total, items,
    message: items.length
      ? '已读取说说列表，时间为 Unix 秒；需要看评论时用返回的 tid 再查详情，图片链接不代表已看懂画面：\n' + JSON.stringify(items)
      : '本页没有可返回的说说；仅表示当前分页和机器人可见范围，不代表该账号从未发过说说。',
  }
}
