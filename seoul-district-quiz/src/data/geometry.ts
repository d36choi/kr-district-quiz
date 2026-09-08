import type { RegionLevel, RegionPackId } from './regions'
import { getTopLevelRegions, REGIONS_BY_ID } from './regions'
import gyeonggiDistrictsSvg from '../assets/maps/gyeonggi-districts.svg?raw'
import gyeonggiMunicipalitiesSvg from '../assets/maps/gyeonggi-municipalities.svg?raw'

const SOURCE = Object.freeze({
  id: 'sgis-2025-q2-sigungu',
  baseDate: '2025-06-30',
  sha256: 'f1cf0f9de453ac7eaacb273f39cee52851183372b9ddfda428a967c3a670b2c6',
})

export type GeometryPath = Readonly<{
  geometryId: string
  regionId: string
  name: string
  level: RegionLevel
  path: string
}>

export type GeometrySource = Readonly<{
  id: string
  baseDate: string
  sha256: string
}>

export type GeometryManifest = Readonly<{
  packId: RegionPackId
  detail: boolean
  viewBox: string
  source: GeometrySource
  paths: readonly GeometryPath[]
}>

function parseSvgDocument(svgText: string): XMLDocument {
  const document = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  if (document.getElementsByTagName('parsererror').length > 0 || document.documentElement.nodeName !== 'svg') {
    throw new Error('Geometry SVG could not be parsed')
  }
  return document
}

function requiredAttribute(element: Element, attribute: string): string {
  const value = element.getAttribute(attribute)?.trim()
  if (!value) throw new Error('Geometry SVG path is missing required metadata')
  return value
}

export function parseGeometrySvg(svgText: string): readonly GeometryPath[] {
  const document = parseSvgDocument(svgText)
  const root = document.documentElement
  if (!root.getAttribute('viewBox')?.trim()) throw new Error('Geometry SVG has no non-empty viewBox')
  if (root.getAttribute('data-source-id') !== SOURCE.id || root.getAttribute('data-base-date') !== SOURCE.baseDate || root.getAttribute('data-source-sha256') !== SOURCE.sha256) {
    throw new Error('Geometry SVG has invalid source metadata')
  }

  const geometryIds = new Set<string>()
  const regionIds = new Set<string>()
  const paths = Array.from(document.getElementsByTagName('path')).map((element) => {
    const geometryId = requiredAttribute(element, 'data-geometry-id')
    const regionId = requiredAttribute(element, 'data-region-id')
    const name = requiredAttribute(element, 'data-name')
    const level = requiredAttribute(element, 'data-level') as RegionLevel
    const path = requiredAttribute(element, 'd')
    const region = REGIONS_BY_ID[regionId]

    if (!region) throw new Error(`Unknown geometry region id: ${regionId}`)
    if (geometryId !== region.geometryId || name !== region.name || level !== region.level) {
      throw new Error(`Geometry SVG path metadata does not match catalog: ${regionId}`)
    }
    if (geometryIds.has(geometryId)) throw new Error('Geometry SVG has duplicate geometry IDs')
    if (regionIds.has(regionId)) throw new Error('Geometry SVG has duplicate region IDs')
    geometryIds.add(geometryId)
    regionIds.add(regionId)
    return { geometryId, regionId, name, level, path }
  })

  if (paths.length === 0) throw new Error('Geometry SVG has no paths')
  return paths
}

function expectedGeometryIds(packId: RegionPackId, detail: boolean): readonly string[] {
  if (packId !== 'gyeonggi') throw new Error(`No geometry asset is available for pack: ${packId}`)
  if (!detail) return getTopLevelRegions('gyeonggi').map(({ geometryId }) => geometryId)
  return Object.values(REGIONS_BY_ID)
    .filter((region) => region.packId === 'gyeonggi' && region.level === 'district')
    .map(({ geometryId }) => geometryId)
}

export function parseGeometryManifest(packId: RegionPackId, detail: boolean, svgText: string): GeometryManifest {
  const document = parseSvgDocument(svgText)
  const viewBox = document.documentElement.getAttribute('viewBox')?.trim()
  if (!viewBox) throw new Error('Geometry SVG has no non-empty viewBox')
  const paths = parseGeometrySvg(svgText)
  const expectedIds = expectedGeometryIds(packId, detail)
  const actualIds = paths.map(({ geometryId }) => geometryId)
  const missingIds = expectedIds.filter((geometryId) => !actualIds.includes(geometryId))
  const unknownIds = actualIds.filter((geometryId) => !expectedIds.includes(geometryId))
  if (missingIds.length > 0) throw new Error(`Geometry SVG is missing regions: ${missingIds.join(', ')}`)
  if (unknownIds.length > 0) throw new Error(`Geometry SVG has unexpected regions: ${unknownIds.join(', ')}`)

  return Object.freeze({
    packId,
    detail,
    viewBox,
    source: SOURCE,
    paths: Object.freeze([...paths]),
  })
}

export async function loadGeometry(packId: RegionPackId, detail: boolean): Promise<GeometryManifest> {
  if (packId !== 'gyeonggi') throw new Error(`No geometry asset is available for pack: ${packId}`)
  return parseGeometryManifest(packId, detail, detail ? gyeonggiDistrictsSvg : gyeonggiMunicipalitiesSvg)
}
