import type { RegionPackId } from './regions'

/** Stable, source-verified identifiers safe to send when a map asset cannot load. */
export const REGION_MAP_ASSET_VERSIONS: Readonly<Record<RegionPackId, string>> = Object.freeze({
  seoul: 'kurykh-seoul-district:cc-by-sa-3.0',
  gyeonggi: 'sgis-2025-q2-sigungu:2025-06-30',
})
