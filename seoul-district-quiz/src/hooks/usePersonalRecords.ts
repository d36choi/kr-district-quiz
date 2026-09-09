import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createEmptyPersonalRecords,
  loadPersonalRecords,
  PersonalRecordsMigrationError,
  savePersonalRecords,
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

  const performLoad = useCallback(() => {
    const loadPromise = loadPersonalRecords()
      .then((nextRecords) => {
        recordsRef.current = nextRecords
        setRecords(nextRecords)
        setLoadStatus('ready')
        return nextRecords
      })
      .catch((error: unknown) => {
        if (error instanceof PersonalRecordsMigrationError) {
          recordsRef.current = error.migratedRecords
          setRecords(error.migratedRecords)
          setLoadStatus('ready')
          setSaveFailed(true)
          return error.migratedRecords
        }

        const emptyRecords = createEmptyPersonalRecords()
        recordsRef.current = emptyRecords
        setRecords(emptyRecords)
        setLoadStatus('error')
        return emptyRecords
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
    writeQueueRef.current = writeQueueRef.current.then(async () => {
      await (loadPromiseRef.current ?? Promise.resolve(recordsRef.current))
      const currentRecords = recordsRef.current
      const nextRecords = updater(currentRecords)
      if (nextRecords === currentRecords) return

      recordsRef.current = nextRecords
      setRecords(nextRecords)

      try {
        await savePersonalRecords(nextRecords)
        setSaveFailed(false)
      } catch {
        setSaveFailed(true)
      }
    })
  }, [])

  return {
    records,
    loadStatus,
    saveFailed,
    retryLoad,
    updateRecords,
  }
}
