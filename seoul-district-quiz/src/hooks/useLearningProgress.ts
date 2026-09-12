import { useCallback } from 'react'
import {
  getDailyStreak,
  recordCourseCompleted,
  recordRegionAnswer,
  type RegionAnswerResult,
  type PersonalRecordsV2,
} from '../game/personalRecords'
import type { ProgressStage, ReviewDate } from '../game/progress'
import { usePersonalRecords } from './usePersonalRecords'

export function useLearningProgress(initialRecords?: PersonalRecordsV2) {
  const personalRecords = usePersonalRecords(initialRecords)
  const { updateRecords } = personalRecords

  const recordAnswer = useCallback((result: RegionAnswerResult) => {
    let transition: { stageBefore: ProgressStage; stageAfter: ProgressStage } | undefined
    updateRecords((records) => {
      const nextRecords = recordRegionAnswer(records, result)
      const progress = nextRecords.progressByRegion[result.regionId]
      if (progress) transition = {
        stageBefore: records.progressByRegion[result.regionId]?.stage ?? 0,
        stageAfter: progress.stage,
      }
      return nextRecords
    })
    // updateRecords applies synchronously to its latest snapshot. Returning the
    // transition keeps analytics based on the actual persisted reducer rules.
    return transition
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
