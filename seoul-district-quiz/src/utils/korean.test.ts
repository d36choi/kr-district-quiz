import { describe, expect, it } from 'vitest'
import { appendJosa } from './korean'

describe('appendJosa', () => {
  it.each([
    ['종로구', '종로구는', '은', '는'],
    ['성남시', '성남시는', '은', '는'],
    ['파주시', '파주시를', '을', '를'],
    ['가평군', '가평군을', '을', '를'],
    ['동두천시·가평군', '동두천시·가평군과', '과', '와'],
    ['성남시·하남시', '성남시·하남시와', '과', '와'],
  ])('%s에 알맞은 조사를 붙인다', (value, expected, withBatchim, withoutBatchim) => {
    expect(appendJosa(value, withBatchim, withoutBatchim)).toBe(expected)
  })

  it('빈 문자열은 그대로 반환한다', () => {
    expect(appendJosa('', '은', '는')).toBe('')
  })
})
