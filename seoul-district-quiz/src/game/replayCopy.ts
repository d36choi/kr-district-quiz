import { appendJosa } from '../utils/korean'

export const replayCopy = {
  weakTitle: '틀린 지역 다시 풀기',
  weakDescription: '오답이 있는 지역부터 5문제를 골라요. 부족한 문제는 주변 지역으로 채워요.',
  weakAction: '오답 중심 5문제',
  adjacencyLabel: '맞닿은 지역 찾기',
  adjacencyHeading: (name: string) => `${appendJosa(name, '과', '와')} 맞닿은 지역은 어디일까요?`,
  adjacencyCaption: (name: string) => `표시된 곳은 ${appendJosa(name, '이에요', '예요')}. 보기에서 맞닿은 지역을 골라 주세요.`,
  completeHeading: '5문제를 풀었어요',
  improved: (count: number) => `단계가 오른 지역 ${count}개`,
  replayDescription: '한 세트 더 풀면 방금 기록을 반영해 문제를 다시 골라요.',
} as const
