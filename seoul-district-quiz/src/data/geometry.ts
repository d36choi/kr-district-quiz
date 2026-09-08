import type { RegionLevel, RegionPackId } from './regions'
import { getTopLevelRegions, REGIONS_BY_ID } from './regions'
import gyeonggiDistrictsSvg from '../assets/maps/gyeonggi-districts.svg?raw'
import gyeonggiMunicipalitiesSvg from '../assets/maps/gyeonggi-municipalities.svg?raw'

export type GeometryPath = Readonly<{
  geometryId: string
  regionId: string
  name: string
  level: RegionLevel
  path: string
}>

export type GeometryManifest = Readonly<{
  packId: RegionPackId
  detail: boolean
  viewBox: string
  paths: readonly GeometryPath[]
}>

function attributesFromPathTag(pathTag: string): Record<string, string> {
  return Object.fromEntries(
    [...pathTag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]),
  )
}

function readSvgPaths(svgText: string): GeometryPath[] {
  return [...svgText.matchAll(/<path\b[^>]*>/g)].map(([pathTag]) => {
    const attributes = attributesFromPathTag(pathTag)
    const geometryId = attributes['data-geometry-id']
    const regionId = attributes['data-region-id']
    const name = attributes['data-name']
    const level = attributes['data-level'] as RegionLevel
    const path = attributes.d

    if (!geometryId || !regionId || !name || !level || !path) {
      throw new Error('Geometry SVG path is missing required data attributes')
    }
    if (!REGIONS_BY_ID[regionId]) throw new Error(`Unknown geometry region id: ${regionId}`)
    return { geometryId, regionId, name, level, path }
  })
}

export function parseGeometrySvg(svgText: string): readonly GeometryPath[] {
  if (typeof DOMParser !== 'undefined') {
    const document = new DOMParser().parseFromString(svgText, 'image/svg+xml')
    if (document.querySelector('parsererror')) throw new Error('Geometry SVG could not be parsed')
    if (!document.documentElement.getAttribute('viewBox')?.trim()) throw new Error('Geometry SVG has no non-empty viewBox')
  } else if (!/<svg\b[^>]*\bviewBox="\S(?:[^"]*\S)?"/i.test(svgText)) {
    throw new Error('Geometry SVG has no non-empty viewBox')
  }

  const paths = readSvgPaths(svgText)
  if (paths.length === 0) throw new Error('Geometry SVG has no paths')
  if (new Set(paths.map(({ geometryId }) => geometryId)).size !== paths.length) {
    throw new Error('Geometry SVG has duplicate geometry IDs')
  }
  if (new Set(paths.map(({ regionId }) => regionId)).size !== paths.length) {
    throw new Error('Geometry SVG has duplicate region IDs')
  }
  return paths
}

function viewBoxFrom(svgText: string): string {
  const viewBox = svgText.match(/<svg\b[^>]*\bviewBox="([^"]+)"/i)?.[1]?.trim()
  if (!viewBox) throw new Error('Geometry SVG has no non-empty viewBox')
  return viewBox
}

function expectedRegionIds(packId: RegionPackId, detail: boolean): readonly string[] {
  if (packId !== 'gyeonggi') throw new Error(`No geometry asset is available for pack: ${packId}`)
  if (!detail) return getTopLevelRegions('gyeonggi').map(({ geometryId }) => geometryId)
  return Object.values(REGIONS_BY_ID)
    .filter((region) => region.packId === 'gyeonggi' && region.level === 'district')
    .map(({ geometryId }) => geometryId)
}

function geometryManifest(packId: RegionPackId, detail: boolean, svgText: string): GeometryManifest {
  const paths = parseGeometrySvg(svgText)
  const expectedIds = expectedRegionIds(packId, detail)
  const actualIds = paths.map(({ regionId }) => regionId)
  const missingIds = expectedIds.filter((regionId) => !actualIds.includes(regionId))
  const unknownIds = actualIds.filter((regionId) => !expectedIds.includes(regionId))
  if (missingIds.length > 0) throw new Error(`Geometry SVG is missing regions: ${missingIds.join(', ')}`)
  if (unknownIds.length > 0) throw new Error(`Geometry SVG has unexpected regions: ${unknownIds.join(', ')}`)

  return Object.freeze({
    packId,
    detail,
    viewBox: viewBoxFrom(svgText),
    paths: Object.freeze([...paths]),
  })
}

export async function loadGeometry(packId: RegionPackId, detail: boolean): Promise<GeometryManifest> {
  if (packId !== 'gyeonggi') throw new Error(`No geometry asset is available for pack: ${packId}`)
  return geometryManifest(packId, detail, detail ? gyeonggiDistrictsSvg : gyeonggiMunicipalitiesSvg)
}
