# Gyeonggi boundary geometry source

The committed SVGs are generated only from the official credential-free SGIS archive below. They are not derived from the previously rejected third-party `admdongkor` file.

## Official source

- Publisher: 국가데이터처, 공간정보서비스과.
- Portal record: [국가데이터처_SGIS 행정구역 통계 및 경계_20250630](https://www.data.go.kr/data/15129688/fileData.do)
- Direct attachment: `https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000003681593&fileDetailSn=1&dataNm=SGIS-boundaries-2025`
- Attachment: `FILE_000000003681593`, `fileDetailSn=1`, `국가데이터처_SGIS 행정구역 통계 및 경계.zip`
- Retrieved: 2026-09-08 (Asia/Seoul)
- Boundary base date: 2025-06-30 (archive directory: `2025년 2분기 기준 시군구 경계`; source field: `BASE_DATE=20250630`)
- Archive SHA-256: `f1cf0f9de453ac7eaacb273f39cee52851183372b9ddfda428a967c3a670b2c6`
- Archive size: `269032521` bytes
- Source layer: `국가데이터처_SGIS 행정구역 통계 및 경계/2. 경계/2. 2025년 2분기 기준 시군구 경계/bnd_sigungu_00_2025_2Q.shp`
- CRS: EPSG:5179, Korea 2000 / Unified CS. Schema: `BASE_DATE`, `SIGUNGU_CD`, `SIGUNGU_NM`.
- Licence: the portal records `이용허락범위 제한 없음` (no restriction on the permission scope).

The official portal describes this as 2024 administrative statistics with 2025 boundary files, includes SHP support files, and records a 2026-07-23 update. The archive component hashes and generated-asset hashes are machine-readable in [`source-manifest.json`](./source-manifest.json).

## Deterministic regeneration and validation

`mapshaper@0.7.59`, `tsx@4.21.0`, and `@xmldom/xmldom@0.9.12` are pinned dev dependencies. The source archive is not committed because it is 269 MB; the stable credential-free attachment URL, byte length, and SHA-256 above make retrieval verifiable.

```sh
curl --fail --location --silent --show-error \
  'https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000003681593&fileDetailSn=1&dataNm=SGIS-boundaries-2025' \
  -o /tmp/sgis-boundaries-2025.zip
shasum -a 256 /tmp/sgis-boundaries-2025.zip
node scripts/build-region-maps.mjs --archive /tmp/sgis-boundaries-2025.zip
node scripts/build-region-maps.mjs --check
```

The builder extracts only the documented SHP components into a temporary directory, reprojects to WGS84, derives requirements from the actual TypeScript catalog through `scripts/region-contract.mts`, dissolves the 44 Gyeonggi 시군구 records into exactly 31 municipality paths, keeps exactly the ten catalogued Suwon/Seongnam/Yongin general districts, and writes a shared fixed `0 0 1000 1000` viewBox. `--check` redownloads the official archive when no `--archive` is supplied, checks its hash, regenerates in a temporary directory, and byte-compares the committed SVGs with the deterministic outputs.
