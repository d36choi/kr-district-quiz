const HANGUL_SYLLABLE_START = 0xac00
const HANGUL_SYLLABLE_END = 0xd7a3
const JONGSEONG_COUNT = 28

export function appendJosa(value: string, withBatchim: string, withoutBatchim: string) {
  const trimmed = value.trim()
  const lastCharacter = [...trimmed].at(-1)
  if (!lastCharacter) return value

  const codePoint = lastCharacter.codePointAt(0)
  const hasBatchim = codePoint !== undefined
    && codePoint >= HANGUL_SYLLABLE_START
    && codePoint <= HANGUL_SYLLABLE_END
    && (codePoint - HANGUL_SYLLABLE_START) % JONGSEONG_COUNT !== 0

  return `${value}${hasBatchim ? withBatchim : withoutBatchim}`
}
