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
type PendingMutation = {
  revision: number
  updater: (current: PersonalRecordsV2) => PersonalRecordsV2
}

export function usePersonalRecords() {
  const [records, setRecords] = useState(createEmptyPersonalRecords)
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading')
  const [saveFailed, setSaveFailed] = useState(false)
  const recordsRef = useRef(records)
  const writeQueueRef = useRef(Promise.resolve())
  const revisionRef = useRef(0)
  const persistedRevisionRef = useRef(0)
  const pendingMutationsRef = useRef<PendingMutation[]>([])
  const loadGenerationRef = useRef(0)
  // Includes queued retries so updates cannot save ahead of their base snapshot.
  const pendingLoadsRef = useRef(0)

  const enqueueSnapshot = useCallback((snapshot: PersonalRecordsV2, revision: number) => {
    writeQueueRef.current = writeQueueRef.current.then(async () => {
      try {
        await savePersonalRecords(snapshot)
        persistedRevisionRef.current = Math.max(persistedRevisionRef.current, revision)
        pendingMutationsRef.current = pendingMutationsRef.current
          .filter((mutation) => mutation.revision > persistedRevisionRef.current)
        setSaveFailed(false)
      } catch {
        setSaveFailed(true)
      }
    })
  }, [])

  const performLoad = useCallback(() => {
    const loadGeneration = loadGenerationRef.current + 1
    loadGenerationRef.current = loadGeneration
    pendingLoadsRef.current += 1
    let persistedRevisionAtRead = persistedRevisionRef.current

    const mergeAndCommitLoadedRecords = (
      loadedRecords: PersonalRecordsV2,
      enqueueReconciliation = true,
    ) => {
      if (loadGeneration !== loadGenerationRef.current) return recordsRef.current

      const pendingMutations = pendingMutationsRef.current
        .filter((mutation) => mutation.revision > persistedRevisionAtRead)
      const nextRecords = pendingMutations.reduce(
        (current, mutation) => mutation.updater(current),
        loadedRecords,
      )
      recordsRef.current = nextRecords
      setRecords(nextRecords)

      if (enqueueReconciliation && pendingMutations.length > 0) {
        enqueueSnapshot(nextRecords, revisionRef.current)
      }
      return nextRecords
    }

    const loadPromise = writeQueueRef.current
      .then(() => {
        persistedRevisionAtRead = persistedRevisionRef.current
        return loadPersonalRecords()
      })
      .then((nextRecords) => {
        const currentRecords = mergeAndCommitLoadedRecords(nextRecords)
        if (loadGeneration === loadGenerationRef.current) setLoadStatus('ready')
        return currentRecords
      })
      .catch((error: unknown) => {
        if (error instanceof PersonalRecordsMigrationError) {
          const currentRecords = mergeAndCommitLoadedRecords(error.migratedRecords, false)
          if (loadGeneration === loadGenerationRef.current) {
            setLoadStatus('ready')
            setSaveFailed(true)
            enqueueSnapshot(currentRecords, revisionRef.current)
          }
          return currentRecords
        }

        if (loadGeneration === loadGenerationRef.current) {
          setLoadStatus('error')
          const hasUnsavedProgress = pendingMutationsRef.current
            .some((mutation) => mutation.revision > persistedRevisionAtRead)
          if (hasUnsavedProgress) {
            enqueueSnapshot(recordsRef.current, revisionRef.current)
          }
        }
        return recordsRef.current
      })
    writeQueueRef.current = loadPromise.then(() => undefined, () => undefined)
    return loadPromise.finally(() => {
      pendingLoadsRef.current -= 1
    })
  }, [enqueueSnapshot])

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
    const revision = revisionRef.current
    pendingMutationsRef.current.push({ revision, updater })
    setRecords(nextRecords)
    // The load settlement path persists one reconciled snapshot (or the latest
    // in-memory snapshot after a read failure) and only then prunes revisions.
    if (pendingLoadsRef.current === 0) enqueueSnapshot(nextRecords, revision)
  }, [enqueueSnapshot])

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
