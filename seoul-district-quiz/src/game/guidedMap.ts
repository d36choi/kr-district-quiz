import { getRegion, REGIONS_BY_ID } from '../data/regions'

export function guidedCandidates(regionId: string, random = Math.random): string[] {
  const region = getRegion(regionId)
  if (!region) return []
  const siblings = Object.values(REGIONS_BY_ID).filter((item) => item.parentId === region.parentId && item.id !== region.id)
  const nearby = [...siblings].sort((a, b) => Number(region.neighborIds.includes(b.id)) - Number(region.neighborIds.includes(a.id)))
  const result = [region.id, ...nearby.slice(0, 2).map((item) => item.id)]
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
}
