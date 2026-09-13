import { Storage, User } from '@apps-in-toss/web-framework'
import {
  LEGACY_PERSONAL_RECORDS_STORAGE_KEY,
  PERSONAL_RECORDS_STORAGE_KEY,
  type RecordStorage,
} from './personalRecords'

export type GameUserIdentity = {
  isSupported: () => boolean
  getUserHash: () => Promise<string>
}

export const USER_RECORDS_MIGRATION_KEY = 'seoul-district-quiz:user-records-migrated-to'

export function userScopedStorageKey(key: string, userHash: string) {
  return `${key}:user:${userHash}`
}

export async function createGameRecordStorage(
  identity: GameUserIdentity,
  storage: RecordStorage,
): Promise<RecordStorage> {
  if (!identity.isSupported()) return storage

  const userHash = await identity.getUserHash()
  if (userHash.length === 0) throw new Error('Game user identity is empty')

  const scopedStorage: RecordStorage = {
    getItem: (key) => storage.getItem(userScopedStorageKey(key, userHash)),
    setItem: (key, value) => storage.setItem(userScopedStorageKey(key, userHash), value),
  }
  const migratedOwner = await storage.getItem(USER_RECORDS_MIGRATION_KEY)
  if (migratedOwner === null) {
    for (const key of [PERSONAL_RECORDS_STORAGE_KEY, LEGACY_PERSONAL_RECORDS_STORAGE_KEY]) {
      const legacyValue = await storage.getItem(key)
      if (legacyValue !== null) await scopedStorage.setItem(key, legacyValue)
    }
    await storage.setItem(USER_RECORDS_MIGRATION_KEY, userHash)
  }

  return scopedStorage
}

const appsInTossGameIdentity: GameUserIdentity = {
  isSupported: () => User.getAnonymousKey.isSupported(),
  getUserHash: async () => (await User.getAnonymousKey()).hash,
}

export function createAppsInTossGameRecordStorage() {
  return createGameRecordStorage(appsInTossGameIdentity, Storage)
}
