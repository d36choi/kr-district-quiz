import { describe, expect, it, vi } from 'vitest'
import {
  createGameRecordStorage,
  USER_RECORDS_MIGRATION_KEY,
  userScopedStorageKey,
  type GameUserIdentity,
} from './userRecordStorage'
import {
  createEmptyPersonalRecords,
  PERSONAL_RECORDS_STORAGE_KEY,
  type RecordStorage,
} from './personalRecords'

function memoryStorage(values = new Map<string, string>()): RecordStorage {
  return {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value) },
  }
}

describe('game user record storage', () => {
  it('uses the existing local storage boundary when user identity is unavailable outside Toss', async () => {
    const storage = memoryStorage()
    const identity: GameUserIdentity = {
      isSupported: () => false,
      getUserHash: vi.fn(),
    }

    await expect(createGameRecordStorage(identity, storage)).resolves.toBe(storage)
    expect(identity.getUserHash).not.toHaveBeenCalled()
  })

  it('moves existing records to the first identified user once and isolates later users', async () => {
    const records = { ...createEmptyPersonalRecords(), currentCombo: 4 }
    const values = new Map([[PERSONAL_RECORDS_STORAGE_KEY, JSON.stringify(records)]])
    const storage = memoryStorage(values)
    const firstUser: GameUserIdentity = {
      isSupported: () => true,
      getUserHash: async () => 'user-a',
    }

    const firstUserStorage = await createGameRecordStorage(firstUser, storage)

    expect(await firstUserStorage.getItem(PERSONAL_RECORDS_STORAGE_KEY)).toBe(JSON.stringify(records))
    expect(values.get(USER_RECORDS_MIGRATION_KEY)).toBe('user-a')
    expect(values.get(userScopedStorageKey(PERSONAL_RECORDS_STORAGE_KEY, 'user-a'))).toBe(JSON.stringify(records))

    const secondUserStorage = await createGameRecordStorage({
      isSupported: () => true,
      getUserHash: async () => 'user-b',
    }, storage)
    expect(await secondUserStorage.getItem(PERSONAL_RECORDS_STORAGE_KEY)).toBeNull()
  })

  it('surfaces identity lookup failures so the app can offer a retry', async () => {
    const identity: GameUserIdentity = {
      isSupported: () => true,
      getUserHash: async () => { throw new Error('identity unavailable') },
    }

    await expect(createGameRecordStorage(identity, memoryStorage())).rejects.toThrow('identity unavailable')
  })
})
