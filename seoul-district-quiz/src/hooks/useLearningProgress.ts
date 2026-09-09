import { useCallback } from 'react'
import {
  getDailyStreak,
  recordCourseCompleted,
  recordRegionAnswer,
  type RegionAnswerResult,
} from '../game/personalRecords'
import type { ReviewDate } from '../game/progress'
import { usePersonalRecords } from './usePersonalRecords'

export function useLearningProgress() {
  const personalRecords = usePersonalRecords()
  const { updateRecords } = personalRecords

  const recordAnswer = useCallback((result: RegionAnswerResult) => {
    updateRecords((records) => recordRegionAnswer(records, result))
  }, [updateRecords])

  const completeCourse = useCallback((completedAt: ReviewDate = new Date()) => {
    updateRecords((records) => recordCourseCompleted(records, completedAt))
  }, [updateRecords])

  return {
    ...personalRecords,
    progressByRegion: personalRecords.records.progressByRegion,
    dailyStreak: getDailyStreak(personalRecords.records),
    recordRegionAnswer: recordAnswer,
    recordCourseCompleted: completeCourse,
  }
}
