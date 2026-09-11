import { useCallback } from 'react'
import {
  getDailyStreak,
  recordCourseCompleted,
  recordRegionAnswer,
  type RegionAnswerResult,
  type PersonalRecordsV2,
} from '../game/personalRecords'
import type { ReviewDate } from '../game/progress'
import { usePersonalRecords } from './usePersonalRecords'

export function useLearningProgress(initialRecords?: PersonalRecordsV2) {
  const personalRecords = usePersonalRecords(initialRecords)
  const { updateRecords } = personalRecords

  const recordAnswer = useCallback((result: RegionAnswerResult) => {
    updateRecords((records) => recordRegionAnswer(records, result))
  }, [updateRecords])

  const completeCourse = useCallback((completedAt: ReviewDate = new Date()) => {
    updateRecords((records) => recordCourseCompleted(records, completedAt))
  }, [updateRecords])

  return {
    ...personalRecords,
    records: personalRecords.recordsV2,
    progressByRegion: personalRecords.recordsV2.progressByRegion,
    dailyStreak: getDailyStreak(personalRecords.recordsV2),
    recordRegionAnswer: recordAnswer,
    recordCourseCompleted: completeCourse,
  }
}
