// 按引擎维护「发声事件 → 精确输入标签」。接入其他 TTS 时在这里添加它的标签库。
export const TTS_TAG_LIBRARIES = {
  breezeblue: {
    laugh: '[笑]', chuckle: '[轻笑]', giggle: '[咯咯笑]',
    cry: '[哭声]', sob: '[抽泣]', whimper: '[呜咽]', groan: '[呻吟]', moan: '[哀号]',
    sigh: '[叹气]', gasp: '[惊呼]', inhale: '[吸气]', exhale: '[呼气]', breatheHeavily: '[喘息]',
    whisper: '[耳语]', shout: '[喊叫]', scream: '[惨叫]', sing: '[唱歌]', hum: '[哼歌]', stutter: '[结巴]', pause: '[停顿]',
    clearThroat: '[清嗓]', cough: '[咳嗽]', sniffle: '[吸鼻子]', lipSmack: '[咂嘴]', clickTongue: '[啧嘴]',
    yawn: '[打哈欠]', sneeze: '[打喷嚏]', hiccup: '[打嗝]', burp: '[打饱嗝]', gulp: '[吞咽]', gag: '[干呕]',
    grunt: '[闷哼]', scoff: '[冷笑]', snort: '[哼鼻子]',
  },
}

const knownTags = [...new Set(Object.values(TTS_TAG_LIBRARIES).flatMap((library) => Object.values(library)))]
const TAG_PATTERN = new RegExp(knownTags.map((tag) => tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g')

/** 给模型的规则只展示当前引擎支持的标签。 */
export function ttsTagRules(engine) {
  if (!Object.hasOwn(TTS_TAG_LIBRARIES, engine)) return []
  const library = TTS_TAG_LIBRARIES[engine]
  const tags = Object.values(library)
  return [
    '语音支持这些发声标签：' + tags.join('、') + '。',
    '只在你选择发语音的 <voice>…</voice> 里面用这些标签，普通文字里不要加。按语境挑合适的，少量用就好，不必每句话都加。例如 <voice>' + (library.chuckle || tags[0]) + '你好。</voice>。',
  ]
}

/** 文字发送时移除所有已知控制标签；合成语音时可保留目标引擎支持的标签。 */
export function stripTtsTags(text, { keepForEngine } = {}) {
  const keep = new Set(Object.values(TTS_TAG_LIBRARIES[keepForEngine] || {}))
  return String(text ?? '').replace(TAG_PATTERN, (tag) => keep.has(tag) ? tag : '').trim()
}
