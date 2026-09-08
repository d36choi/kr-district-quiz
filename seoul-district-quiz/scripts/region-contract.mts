import { ADJACENCY_BY_REGION_ID } from '../src/data/adjacency'
import { REGIONS_BY_ID, getTopLevelRegions } from '../src/data/regions'

const municipalities = getTopLevelRegions('gyeonggi').map(({ geometryId, id, level, name }) => ({
  geometryId,
  regionId: id,
  level,
  name,
}))
const districts = Object.values(REGIONS_BY_ID)
  .filter((region) => region.packId === 'gyeonggi' && region.level === 'district')
  .map(({ geometryId, id, level, name, parentId }) => ({
    geometryId,
    regionId: id,
    level,
    name,
    parentId,
    parentName: REGIONS_BY_ID[parentId ?? '']?.name,
  }))

const symmetricAdjacency = Object.entries(ADJACENCY_BY_REGION_ID).every(([regionId, neighbors]) =>
  neighbors.every((neighborId) => ADJACENCY_BY_REGION_ID[neighborId]?.includes(regionId)),
)
const crossPackEdges = Object.entries(ADJACENCY_BY_REGION_ID)
  .flatMap(([regionId, neighbors]) => neighbors.map((neighborId) => [regionId, neighborId] as const))
  .filter(([regionId, neighborId]) => regionId < neighborId)
  .filter(([regionId, neighborId]) => regionId.split(':')[0] !== neighborId.split(':')[0]).length

process.stdout.write(`${JSON.stringify({
  municipalities,
  districts,
  adjacency: { symmetric: symmetricAdjacency, crossPackEdges },
})}\n`)
