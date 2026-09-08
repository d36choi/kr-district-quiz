#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DOMParser } from '@xmldom/xmldom'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectDirectory = resolve(scriptDirectory, '..')
const mapsDirectory = join(projectDirectory, 'src/assets/maps')
const mapshaper = join(projectDirectory, 'node_modules/.bin/mapshaper')
const tsx = join(projectDirectory, 'node_modules/.bin/tsx')
const contractScript = join(scriptDirectory, 'region-contract.mts')
const overviewFile = 'gyeonggi-municipalities.svg'
const detailFile = 'gyeonggi-districts.svg'
const provenanceFile = 'source-manifest.json'
const viewBox = '0 0 1000 1000'
const source = Object.freeze({
  id: 'sgis-2025-q2-sigungu',
  portalUrl: 'https://www.data.go.kr/data/15129688/fileData.do',
  attachmentUrl: 'https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000003681593&fileDetailSn=1&dataNm=SGIS-boundaries-2025',
  attachmentId: 'FILE_000000003681593',
  fileDetailSn: '1',
  retrievalDate: '2026-09-08',
  baseDate: '2025-06-30',
  archiveSha256: 'f1cf0f9de453ac7eaacb273f39cee52851183372b9ddfda428a967c3a670b2c6',
  archiveBytes: 269032521,
  internalShapefilePath: '국가데이터처_SGIS 행정구역 통계 및 경계/2. 경계/2. 2025년 2분기 기준 시군구 경계/bnd_sigungu_00_2025_2Q.shp',
  crs: 'EPSG:5179 (Korea 2000 / Unified CS)',
  schema: Object.freeze(['BASE_DATE', 'SIGUNGU_CD', 'SIGUNGU_NM']),
  licence: '공공데이터포털 이용허락범위 제한 없음',
  mapshaperVersion: '0.7.59',
})
const componentHashes = Object.freeze({
  cpg: '3ad3031f5503a4404af825262ee8232cc04d4ea6683d42c5dd0a2f2a27ac9824',
  dbf: '18f7d3a5f0fd8cf12e4a5deca3faf52133db4f7221dfbeccedf94ec06b58ece6',
  prj: 'e21b26451491c617318aab7d28abf4d07f5facc2aed1564e082ec8d4268cfa3b',
  shp: '85523b10411652aa6b5c286a82eff7e77c7e563d5f644eb62a221a121f7e3968',
  shx: '9fbaeb394ffde8be2fce4e47f2420ac63942fbbdf6c15cf2c71ac69136b9428c',
})

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function parseArguments(argumentsList) {
  const archiveIndex = argumentsList.indexOf('--archive')
  const archive = archiveIndex === -1 ? null : argumentsList[archiveIndex + 1]
  if (archiveIndex !== -1 && !archive) throw new Error('--archive requires an archive path')
  return { archive, check: argumentsList.includes('--check') }
}

function readCatalogContract() {
  return JSON.parse(execFileSync(tsx, [contractScript], { cwd: projectDirectory, encoding: 'utf8' }))
}

function fetchOfficialArchive(targetPath) {
  execFileSync('curl', ['--fail', '--location', '--silent', '--show-error', source.attachmentUrl, '-o', targetPath], {
    stdio: 'inherit',
  })
}

function validateArchive(archivePath) {
  if (statSync(archivePath).size !== source.archiveBytes) throw new Error('Official SGIS archive byte length does not match provenance manifest')
  if (sha256(readFileSync(archivePath)) !== source.archiveSha256) throw new Error('Official SGIS archive SHA-256 does not match provenance manifest')
}

function extractSigunguShapefile(archivePath, temporaryDirectory) {
  execFileSync('unzip', ['-qq', archivePath, '*/bnd_sigungu_00_2025_2Q.*', '-d', temporaryDirectory], { stdio: 'inherit' })
  const findFile = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        const nested = findFile(path)
        if (nested) return nested
      } else if (entry.name === 'bnd_sigungu_00_2025_2Q.shp') return path
    }
    return null
  }
  const shapefile = findFile(temporaryDirectory)
  if (!shapefile) throw new Error(`Archive does not contain ${source.internalShapefilePath}`)
  for (const [extension, expectedHash] of Object.entries(componentHashes)) {
    const component = shapefile.replace(/\.shp$/, `.${extension}`)
    if (sha256(readFileSync(component)) !== expectedHash) {
      throw new Error(`Official SGIS ${extension} component SHA-256 does not match provenance manifest`)
    }
  }
  return shapefile
}

function mapshaperCommand(argumentsList) {
  execFileSync(mapshaper, argumentsList, { cwd: projectDirectory, stdio: 'inherit' })
}

function normalizeName(value) {
  return value.replaceAll(/\s/g, '')
}

function escapedAttribute(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}

function coordinatePath(geometry, transform) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  return polygons.flatMap((polygon) => polygon.map((ring) => ring.map(([longitude, latitude], index) => {
    const x = Number(((longitude - transform.minLongitude) * transform.scale + transform.xOffset).toFixed(3))
    const y = Number((transform.maxLatitude - latitude).toFixed(12))
    const adjustedY = Number((y * transform.scale + transform.yOffset).toFixed(3))
    return `${index === 0 ? 'M' : 'L'}${x} ${adjustedY}`
  }).join('') + 'Z')).join('')
}

function createTransform(features) {
  const points = []
  const visit = (coordinates) => {
    if (typeof coordinates[0] === 'number') points.push(coordinates)
    else coordinates.forEach(visit)
  }
  features.forEach(({ geometry }) => visit(geometry.coordinates))
  const bounds = points.reduce((current, [longitude, latitude]) => ({
    minLongitude: Math.min(current.minLongitude, longitude),
    maxLongitude: Math.max(current.maxLongitude, longitude),
    minLatitude: Math.min(current.minLatitude, latitude),
    maxLatitude: Math.max(current.maxLatitude, latitude),
  }), {
    minLongitude: Number.POSITIVE_INFINITY,
    maxLongitude: Number.NEGATIVE_INFINITY,
    minLatitude: Number.POSITIVE_INFINITY,
    maxLatitude: Number.NEGATIVE_INFINITY,
  })
  const { minLongitude, maxLongitude, minLatitude, maxLatitude } = bounds
  const scale = 920 / Math.max(maxLongitude - minLongitude, maxLatitude - minLatitude)
  return {
    minLongitude,
    maxLatitude,
    scale,
    xOffset: (1000 - (maxLongitude - minLongitude) * scale) / 2,
    yOffset: (1000 - (maxLatitude - minLatitude) * scale) / 2,
  }
}

function createInputGeoJson(shapefile, catalog, temporaryDirectory) {
  const rawGeoJson = join(temporaryDirectory, 'sigungu-wgs84.geojson')
  mapshaperCommand([shapefile, '-proj', 'wgs84', '-o', 'format=geojson', rawGeoJson])
  const raw = JSON.parse(readFileSync(rawGeoJson, 'utf8'))
  const gyeonggiFeatures = raw.features.filter((feature) => String(feature.properties.SIGUNGU_CD).startsWith('31'))
  if (gyeonggiFeatures.length !== 44 || !gyeonggiFeatures.every((feature) =>
    source.schema.every((field) => typeof feature.properties[field] === 'string') &&
    feature.properties.BASE_DATE === '20250630',
  )) {
    throw new Error('Official SIGUNGU source does not match the expected 2025 Q2 Gyeonggi schema/base-date contract')
  }

  const municipalityByName = new Map(catalog.municipalities.map((region) => [normalizeName(region.name), region]))
  const districtByName = new Map(catalog.districts.map((region) => [normalizeName(`${region.parentName}${region.name}`), region]))
  const overview = []
  const detail = []
  for (const feature of gyeonggiFeatures) {
    const sourceName = normalizeName(feature.properties.SIGUNGU_NM)
    const municipality = [...municipalityByName].find(([name]) => sourceName.startsWith(name))?.[1]
    if (!municipality) throw new Error(`No catalog municipality matches official SIGUNGU_NM: ${feature.properties.SIGUNGU_NM}`)
    overview.push({ type: 'Feature', properties: municipality, geometry: feature.geometry })
    const district = districtByName.get(sourceName)
    if (district) detail.push({ type: 'Feature', properties: district, geometry: feature.geometry })
  }
  if (detail.length !== catalog.districts.length) throw new Error('Official source is missing a catalogued Suwon, Seongnam, or Yongin district')

  const write = (name, features) => {
    const path = join(temporaryDirectory, name)
    writeFileSync(path, JSON.stringify({ type: 'FeatureCollection', features }))
    return path
  }
  return { allFeatures: gyeonggiFeatures, overview: write('overview-input.geojson', overview), detail: write('detail-input.geojson', detail) }
}

function dissolve(inputPath, outputPath) {
  mapshaperCommand([inputPath, '-dissolve', 'regionId', 'copy-fields=geometryId,regionId,name,level', '-simplify', 'weighted', '3%', 'keep-shapes', '-o', 'format=geojson', outputPath])
}

function writeSvg(geoJsonPath, targetPath, transform) {
  const { features } = JSON.parse(readFileSync(geoJsonPath, 'utf8'))
  const paths = features.toSorted((left, right) => left.properties.regionId.localeCompare(right.properties.regionId))
    .map(({ geometry, properties }) => `  <path data-geometry-id="${escapedAttribute(properties.geometryId)}" data-region-id="${escapedAttribute(properties.regionId)}" data-name="${escapedAttribute(properties.name)}" data-level="${escapedAttribute(properties.level)}" d="${coordinatePath(geometry, transform)}" />`)
  writeFileSync(targetPath, [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill-rule="evenodd" data-source-id="${source.id}" data-base-date="${source.baseDate}" data-source-sha256="${source.archiveSha256}">`,
    ...paths,
    '</svg>',
    '',
  ].join('\n'))
}

function xmlDocument(svgText) {
  const errors = []
  const document = new DOMParser({ onError: (level, message) => errors.push(`${level}: ${message}`) }).parseFromString(svgText, 'image/svg+xml')
  if (errors.length > 0 || document.documentElement.nodeName !== 'svg') throw new Error('Geometry SVG could not be parsed')
  return document
}

function parsePaths(svgText) {
  const document = xmlDocument(svgText)
  const root = document.documentElement
  if (!root.getAttribute('viewBox')?.trim()) throw new Error('Geometry SVG has no non-empty viewBox')
  for (const [attribute, expected] of Object.entries({
    'data-source-id': source.id,
    'data-base-date': source.baseDate,
    'data-source-sha256': source.archiveSha256,
  })) {
    if (root.getAttribute(attribute) !== expected) throw new Error(`Geometry SVG has invalid source metadata: ${attribute}`)
  }
  return [...document.getElementsByTagName('path')].map((path) => ({
    geometryId: path.getAttribute('data-geometry-id'),
    regionId: path.getAttribute('data-region-id'),
    name: path.getAttribute('data-name'),
    level: path.getAttribute('data-level'),
    path: path.getAttribute('d'),
  }))
}

function validateSvg(path, expectedRegions) {
  const parsed = parsePaths(readFileSync(path, 'utf8'))
  if (parsed.length !== expectedRegions.length) throw new Error(`${path} path count does not match catalog`)
  const expectedById = new Map(expectedRegions.map((region) => [region.regionId, region]))
  const ids = new Set()
  const geometryIds = new Set()
  for (const entry of parsed) {
    if (!entry.regionId || !expectedById.has(entry.regionId)) throw new Error(`${path} contains an unknown region ID`)
    const expected = expectedById.get(entry.regionId)
    if (!entry.geometryId || entry.geometryId !== expected.geometryId || !entry.name || entry.name !== expected.name || !entry.level || entry.level !== expected.level || !entry.path?.trim()) {
      throw new Error(`${path} contains malformed metadata for ${entry.regionId}`)
    }
    if (ids.has(entry.regionId) || geometryIds.has(entry.geometryId)) throw new Error(`${path} contains duplicate geometry metadata`)
    ids.add(entry.regionId)
    geometryIds.add(entry.geometryId)
  }
  if (ids.size !== expectedById.size) throw new Error(`${path} is missing catalog geometry`)
}

function provenanceManifest(overviewSvg, detailSvg) {
  return {
    schemaVersion: 1,
    source: {
      ...source,
      shapefileComponents: Object.fromEntries(Object.entries(componentHashes).map(([extension, hash]) => [`${extension}Sha256`, hash])),
    },
    processing: {
      command: 'mapshaper -proj wgs84 -dissolve regionId -simplify weighted 3% keep-shapes',
      mapshaperVersion: source.mapshaperVersion,
      viewBox,
    },
    assets: {
      [overviewFile]: { sha256: sha256(overviewSvg), pathCount: 31 },
      [detailFile]: { sha256: sha256(detailSvg), pathCount: 10 },
    },
  }
}

function build(archivePath, catalog, temporaryDirectory) {
  validateArchive(archivePath)
  const shapefile = extractSigunguShapefile(archivePath, temporaryDirectory)
  const inputs = createInputGeoJson(shapefile, catalog, temporaryDirectory)
  const overviewGeoJson = join(temporaryDirectory, 'overview.geojson')
  const detailGeoJson = join(temporaryDirectory, 'detail.geojson')
  dissolve(inputs.overview, overviewGeoJson)
  dissolve(inputs.detail, detailGeoJson)
  const transform = createTransform(inputs.allFeatures)
  const outputDirectory = join(temporaryDirectory, 'maps')
  mkdirSync(outputDirectory)
  const overviewPath = join(outputDirectory, overviewFile)
  const detailPath = join(outputDirectory, detailFile)
  writeSvg(overviewGeoJson, overviewPath, transform)
  writeSvg(detailGeoJson, detailPath, transform)
  validateSvg(overviewPath, catalog.municipalities)
  validateSvg(detailPath, catalog.districts)
  const manifest = provenanceManifest(readFileSync(overviewPath), readFileSync(detailPath))
  writeFileSync(join(outputDirectory, provenanceFile), `${JSON.stringify(manifest, null, 2)}\n`)
  return outputDirectory
}

function validateProvenanceManifest(path) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  const sourceFields = ['id', 'portalUrl', 'attachmentUrl', 'attachmentId', 'fileDetailSn', 'retrievalDate', 'baseDate', 'archiveSha256', 'archiveBytes', 'internalShapefilePath', 'crs', 'licence', 'mapshaperVersion']
  if (manifest.schemaVersion !== 1 || sourceFields.some((field) => manifest.source[field] !== source[field]) || JSON.stringify(manifest.source.schema) !== JSON.stringify(source.schema) || manifest.processing.mapshaperVersion !== source.mapshaperVersion || manifest.processing.viewBox !== viewBox) {
    throw new Error('Source provenance manifest does not match the official source contract')
  }
  for (const [extension, hash] of Object.entries(componentHashes)) {
    if (manifest.source.shapefileComponents[`${extension}Sha256`] !== hash) throw new Error(`Source provenance manifest has an invalid ${extension} hash`)
  }
  return manifest
}

function copyGeneratedAssets(generatedDirectory) {
  mkdirSync(mapsDirectory, { recursive: true })
  for (const file of [overviewFile, detailFile, provenanceFile]) {
    writeFileSync(join(mapsDirectory, file), readFileSync(join(generatedDirectory, file)))
  }
}

function compareGeneratedAssets(generatedDirectory) {
  const manifest = validateProvenanceManifest(join(mapsDirectory, provenanceFile))
  for (const file of [overviewFile, detailFile]) {
    const committed = readFileSync(join(mapsDirectory, file))
    const generated = readFileSync(join(generatedDirectory, file))
    if (!committed.equals(generated)) throw new Error(`Committed ${file} differs from a deterministic official-source regeneration`)
    if (sha256(committed) !== manifest.assets[file].sha256) throw new Error(`Committed ${file} does not match its source manifest hash`)
  }
}

function main() {
  const { archive, check } = parseArguments(process.argv.slice(2))
  if (!archive && !check) throw new Error('Usage: node scripts/build-region-maps.mjs --archive /path/to/official.zip [--check]')
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'sgis-region-map-'))
  try {
    const archivePath = archive ? resolve(archive) : join(temporaryDirectory, 'official-sgis-boundaries.zip')
    if (!archive) fetchOfficialArchive(archivePath)
    const catalog = readCatalogContract()
    if (!catalog.adjacency.symmetric) throw new Error('Catalog adjacency is not symmetric')
    const generatedDirectory = build(archivePath, catalog, temporaryDirectory)
    if (check) {
      validateSvg(join(mapsDirectory, overviewFile), catalog.municipalities)
      validateSvg(join(mapsDirectory, detailFile), catalog.districts)
      compareGeneratedAssets(generatedDirectory)
      console.log(`geometry: ${catalog.municipalities.length} municipalities, ${catalog.districts.length} detailed districts`)
      console.log(`adjacency: symmetric, ${catalog.adjacency.crossPackEdges} cross-pack edges`)
      console.log(`source: ${source.id} ${source.baseDate} ${source.archiveSha256}`)
    } else {
      copyGeneratedAssets(generatedDirectory)
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}

main()
