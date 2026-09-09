import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createEmptyPersonalRecords,
  loadPersonalRecords,
  PersonalRecordsMigrationError,
  savePersonalRecords,
  type PersonalRecordsV1,
  type PersonalRecordsV2,
} from '../game/personalRecords'

type LoadStatus = 'loading' | 'ready' | 'error'

export function usePersonalRecords() {
  const [records, setRecords] = useState(createEmptyPersonalRecords)
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading')
  const [saveFailed, setSaveFailed] = useState(false)
  const recordsRef = useRef(records)
  const loadPromiseRef = useRef<Promise<PersonalRecordsV2> | null>(null)
  const writeQueueRef = useRef(Promise.resolve())
  const revisionRef = useRef(0)
  const loadGenerationRef = useRef(0)
  const lastLoadCommitRevisionRef = useRef(0)

  const performLoad = useCallback(() => {
    const startedAtRevision = revisionRef.current
    const loadGeneration = loadGenerationRef.current + 1
    loadGenerationRef.current = loadGeneration

    const commitLoadedRecords = (nextRecords: PersonalRecordsV2) => {
      if (loadGeneration !== loadGenerationRef.current) return recordsRef.current
      if (
        startedAtRevision === revisionRef.current
        && startedAtRevision === lastLoadCommitRevisionRef.current
      ) {
        recordsRef.current = nextRecords
        setRecords(nextRecords)
        lastLoadCommitRevisionRef.current = revisionRef.current
      }
      return recordsRef.current
    }

    const loadPromise = loadPersonalRecords()
      .then((nextRecords) => {
        const currentRecords = commitLoadedRecords(nextRecords)
        if (loadGeneration === loadGenerationRef.current) setLoadStatus('ready')
        return currentRecords
      })
      .catch((error: unknown) => {
        if (error instanceof PersonalRecordsMigrationError) {
          const currentRecords = commitLoadedRecords(error.migratedRecords)
          if (loadGeneration === loadGenerationRef.current) {
            setLoadStatus('ready')
            setSaveFailed(true)
          }
          return currentRecords
        }

        const emptyRecords = createEmptyPersonalRecords()
        const currentRecords = commitLoadedRecords(emptyRecords)
        if (loadGeneration === loadGenerationRef.current) setLoadStatus('error')
        return currentRecords
      })
    loadPromiseRef.current = loadPromise
    return loadPromise
  }, [])

  useEffect(() => {
    void performLoad()
  }, [performLoad])

  const retryLoad = useCallback(() => {
    setLoadStatus('loading')
    return performLoad()
  }, [performLoad])

  const updateRecords = useCallback((updater: (current: PersonalRecordsV2) => PersonalRecordsV2) => {
    const currentRecords = recordsRef.current
    const nextRecords = updater(currentRecords)
    if (nextRecords === currentRecords) return

    recordsRef.current = nextRecords
    revisionRef.current += 1
    setRecords(nextRecords)

    const pendingLoad = loadPromiseRef.current
    const snapshot = nextRecords
    writeQueueRef.current = writeQueueRef.current.then(async () => {
      await pendingLoad

      try {
        await savePersonalRecords(snapshot)
        setSaveFailed(false)
      } catch {
        setSaveFailed(true)
      }
    })
  }, [])

  const legacyRecords: PersonalRecordsV1 = {
    version: 1,
    fastestPerfectSetMs: records.fastestPerfectSetMs,
    currentCorrectStreak: records.currentCorrectStreak,
    bestCorrectStreak: records.bestCorrectStreak,
    masteredDistricts: records.masteredDistricts,
  }

  return {
    // Temporary V1-shaped projection for the legacy App screens. Regional
    // consumers use recordsV2 until Task 7 removes this compatibility alias.
    records: legacyRecords,
    recordsV2: records,
    loadStatus,
    saveFailed,
    retryLoad,
    updateRecords,
  }
}
