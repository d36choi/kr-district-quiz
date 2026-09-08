#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectDirectory = resolve(scriptDirectory, '..')
const mapsDirectory = join(projectDirectory, 'src/assets/maps')
const regionsFile = join(projectDirectory, 'src/data/regions.ts')
const adjacencyFile = join(projectDirectory, 'src/data/adjacency.ts')
const MUNICIPALITIES_FILE = 'gyeonggi-municipalities.svg'
const DISTRICTS_FILE = 'gyeonggi-districts.svg'
const SOURCES_FILE = 'SOURCES.md'
const VIEW_BOX = '0 0 1000 1000'

function readCatalog() {
  const source = readFileSync(regionsFile, 'utf8')
  const municipalities = [...source.matchAll(/createGyeonggiMunicipality\('([^']+)',\s*'([^']+)'(?:,\s*'([^']+)')?/g)]
    .map(([, slug, name, level]) => ({
      geometryId: `gyeonggi:${slug}`,
      regionId: `gyeonggi:${slug}`,
      name,
      level: level ?? 'city',
    }))
  const districts = [...source.matchAll(/createGyeonggiDistrict\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'\)/g)]
    .map(([, citySlug, cityName, districtSlug, name]) => ({
      geometryId: `gyeonggi:${citySlug}:${districtSlug}`,
      regionId: `gyeonggi:${citySlug}:${districtSlug}`,
      name,
      level: 'district',
      cityName,
    }))

  if (municipalities.length !== 31 || districts.length === 0) {
    throw new Error('Could not derive Gyeonggi geometry requirements from src/data/regions.ts')
  }

  return { municipalities, districts }
}

function parseArguments(argumentsList) {
  const sourceIndex = argumentsList.indexOf('--source')
  const source = sourceIndex === -1 ? null : argumentsList[sourceIndex + 1]
  if (sourceIndex !== -1 && !source) throw new Error('--source requires a GeoJSON path')

  return { check: argumentsList.includes('--check'), source }
}

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}

function number(value) {
  return Number(value.toFixed(3)).toString()
}

function coordinatesToPath(geometry, transform) {
  const polygons = geometry.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon'
      ? geometry.coordinates
      : []

  return polygons.flatMap((polygon) => polygon.map((ring) => ring.map(([longitude, latitude], index) => {
    const x = number((longitude - transform.minLongitude) * transform.scale + transform.xOffset)
    const y = number((transform.maxLatitude - latitude) * transform.scale + transform.yOffset)
    return `${index === 0 ? 'M' : 'L'}${x} ${y}`
  }).join('') + 'Z')).join('')
}

function boundsOf(features) {
  const values = []
  const visit = (coordinates) => {
    if (typeof coordinates[0] === 'number') values.push(coordinates)
    else coordinates.forEach(visit)
  }
  features.forEach((feature) => visit(feature.geometry.coordinates))

  const longitudes = values.map(([longitude]) => longitude)
  const latitudes = values.map(([, latitude]) => latitude)
  return {
    minLongitude: Math.min(...longitudes),
    maxLongitude: Math.max(...longitudes),
    minLatitude: Math.min(...latitudes),
    maxLatitude: Math.max(...latitudes),
  }
}

function transformFor(features) {
  const bounds = boundsOf(features)
  const longitudeSpan = bounds.maxLongitude - bounds.minLongitude
  const latitudeSpan = bounds.maxLatitude - bounds.minLatitude
  const scale = 920 / Math.max(longitudeSpan, latitudeSpan)
  return {
    minLongitude: bounds.minLongitude,
    maxLatitude: bounds.maxLatitude,
    scale,
    xOffset: (1000 - longitudeSpan * scale) / 2,
    yOffset: (1000 - latitudeSpan * scale) / 2,
  }
}

function writeSourceGeoJson(sourcePath, catalog, temporaryDirectory) {
  const raw = JSON.parse(readFileSync(sourcePath, 'utf8'))
  const sourceFeatures = raw.features.filter((feature) => {
    const properties = feature.properties ?? {}
    const code = String(properties.sido ?? properties.SIG_CD ?? properties.sig_cd ?? properties.SGG_CD ?? '')
    return code === '41' || code.startsWith('41')
  })
  if (sourceFeatures.length === 0) throw new Error('The source GeoJSON has no Gyeonggi (sido=41) features')

  const municipalityBySourceName = new Map(
    catalog.municipalities.map((region) => [region.name, region]),
  )
  const districtBySourceName = new Map(
    catalog.districts.map((region) => [`${region.cityName}${region.name}`, region]),
  )
  const overviewFeatures = []
  const detailFeatures = []

  for (const feature of sourceFeatures) {
    const sourceName = String(feature.properties.sggnm
      ?? feature.properties.SIG_KOR_NM
      ?? feature.properties.sig_kor_nm
      ?? feature.properties.SGG_NM
      ?? '').replace(/^경기도\s*/, '')
    const municipality = [...municipalityBySourceName].find(([name]) => sourceName.startsWith(name))?.[1]
    if (!municipality) throw new Error(`No catalog municipality matches source district: ${sourceName}`)
    overviewFeatures.push({
      type: 'Feature',
      properties: municipality,
      geometry: feature.geometry,
    })

    const district = districtBySourceName.get(sourceName)
    if (district) {
      detailFeatures.push({ type: 'Feature', properties: district, geometry: feature.geometry })
    }
  }

  const write = (name, features) => {
    const path = join(temporaryDirectory, name)
    writeFileSync(path, JSON.stringify({ type: 'FeatureCollection', features }))
    return path
  }
  return {
    sourceFeatures,
    overview: write('overview-input.geojson', overviewFeatures),
    detail: write('detail-input.geojson', detailFeatures),
  }
}

function dissolve(sourcePath, outputPath) {
  execFileSync('npx', [
    '--yes', 'mapshaper', sourcePath,
    '-dissolve', 'regionId', 'copy-fields=geometryId,regionId,name,level',
    '-simplify', 'weighted', '3%', 'keep-shapes',
    '-o', 'format=geojson', outputPath,
  ], { cwd: projectDirectory, stdio: 'inherit' })
}

function writeSvg(sourcePath, targetPath, transform) {
  const { features } = JSON.parse(readFileSync(sourcePath, 'utf8'))
  const paths = features.toSorted((left, right) => left.properties.regionId.localeCompare(right.properties.regionId))
    .map(({ properties, geometry }) => `  <path data-geometry-id="${escapeXml(properties.geometryId)}" data-region-id="${escapeXml(properties.regionId)}" data-name="${escapeXml(properties.name)}" data-level="${escapeXml(properties.level)}" d="${coordinatesToPath(geometry, transform)}" />`)
  writeFileSync(targetPath, [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_BOX}" fill-rule="evenodd">`,
    ...paths,
    '</svg>',
    '',
  ].join('\n'))
}

function assertSvgContract(path, expectedRegions) {
  const svg = readFileSync(path, 'utf8')
  const viewBox = svg.match(/<svg[^>]*\bviewBox="([^"]+)"/i)?.[1]?.trim()
  if (!viewBox) throw new Error(`${path} has no non-empty viewBox`)
  const matches = [...svg.matchAll(/<path\b([^>]*)>/g)].map(([, attributes]) => ({
    geometryId: attributes.match(/\bdata-geometry-id="([^"]+)"/)?.[1],
    regionId: attributes.match(/\bdata-region-id="([^"]+)"/)?.[1],
  }))
  const expectedIds = new Set(expectedRegions.map(({ regionId }) => regionId))
  const actualIds = matches.map(({ regionId }) => regionId)
  if (matches.length !== expectedRegions.length) throw new Error(`${path} has ${matches.length} paths; expected ${expectedRegions.length}`)
  if (new Set(actualIds).size !== actualIds.length) throw new Error(`${path} has duplicate region IDs`)
  for (const { geometryId, regionId } of matches) {
    if (!regionId || !expectedIds.has(regionId)) throw new Error(`${path} has an unknown region ID: ${regionId}`)
    if (geometryId !== regionId) throw new Error(`${path} has a non-stable geometry ID for ${regionId}`)
  }
}

function assertSourceContract() {
  const sourceNotes = readFileSync(join(mapsDirectory, SOURCES_FILE), 'utf8')
  for (const requiredValue of [
    'https://api.vworld.kr/req/wfs',
    '2025-01',
    '2026-09-08',
    '공공누리 제1유형',
    'node scripts/build-region-maps.mjs --source',
  ]) {
    if (!sourceNotes.includes(requiredValue)) {
      throw new Error(`SOURCES.md is missing required source metadata: ${requiredValue}`)
    }
  }
}

function checkAdjacency() {
  const source = readFileSync(adjacencyFile, 'utf8')
  const edges = [...source.matchAll(/\['([^']+)',\s*'([^']+)'\]/g)].map(([, left, right]) => [left, right])
  const neighbors = new Map()
  for (const [left, right] of edges) {
    neighbors.set(left, new Set([...(neighbors.get(left) ?? []), right]))
    neighbors.set(right, new Set([...(neighbors.get(right) ?? []), left]))
  }
  for (const [regionId, regionNeighbors] of neighbors) {
    for (const neighborId of regionNeighbors) {
      if (!neighbors.get(neighborId)?.has(regionId)) throw new Error(`Asymmetric adjacency: ${regionId} -> ${neighborId}`)
    }
  }
  return {
    edges: edges.length,
    crossPackEdges: edges.filter(([left, right]) => left.startsWith('seoul:') !== right.startsWith('seoul:')).length,
  }
}

function build(source, catalog) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'region-map-'))
  try {
    const prepared = writeSourceGeoJson(resolve(source), catalog, temporaryDirectory)
    const overviewDissolved = join(temporaryDirectory, 'overview.geojson')
    const detailDissolved = join(temporaryDirectory, 'detail.geojson')
    dissolve(prepared.overview, overviewDissolved)
    dissolve(prepared.detail, detailDissolved)
    const transform = transformFor(prepared.sourceFeatures)
    mkdirSync(mapsDirectory, { recursive: true })
    writeSvg(overviewDissolved, join(mapsDirectory, MUNICIPALITIES_FILE), transform)
    writeSvg(detailDissolved, join(mapsDirectory, DISTRICTS_FILE), transform)
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}

function main() {
  const { check, source } = parseArguments(process.argv.slice(2))
  const catalog = readCatalog()
  if (source) build(source, catalog)
  if (!source && !check) throw new Error('Usage: node scripts/build-region-maps.mjs --source /path/to/official.geojson [--check]')

  assertSvgContract(join(mapsDirectory, MUNICIPALITIES_FILE), catalog.municipalities)
  assertSvgContract(join(mapsDirectory, DISTRICTS_FILE), catalog.districts)
  assertSourceContract()
  const adjacency = checkAdjacency()
  console.log(`geometry: ${catalog.municipalities.length} Gyeonggi municipalities, ${catalog.districts.length} detailed districts`)
  console.log(`adjacency: ${adjacency.edges} symmetric edges, ${adjacency.crossPackEdges} cross-pack edges`)
  console.log('source metadata: src/assets/maps/SOURCES.md')
}

main()
