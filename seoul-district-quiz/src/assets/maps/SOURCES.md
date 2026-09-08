# Gyeonggi boundary geometry source

- **Authoritative publisher:** Ministry of Land, Infrastructure and Transport (National Spatial Data Center), published through the national Public Data Portal and VWorld.
- **Dataset / base date:** `국토교통부_행정구역도(WMS/WFS)` — **2025-01**. The Public Data Portal metadata identifies the temporal coverage as 2025-01 and its last modification as 2025-07-01.
- **Exact service URL:** `https://api.vworld.kr/req/wfs?service=WFS&request=GetFeature&version=2.0.0&typename=LT_C_ADSIGG_INFO&outputFormat=application/json&srsName=EPSG:4326&key={issued-key}`. An issued VWorld key is required; keys are not committed.
- **Catalog URL:** `https://www.data.go.kr/data/15059008/openapi.do`
- **Retrieved:** 2026-09-08 (Asia/Seoul).
- **Licence:** 공공누리 제1유형 (출처표시) / Korean Open Government Licence Type 1. This is the licence recorded by the Public Data Portal for the WMS/WFS dataset.

The two committed SVGs are vector derivatives of that administrative-boundary service. `gyeonggi-municipalities.svg` dissolves the general districts of Suwon, Seongnam, and Yongin into their parent cities; it deliberately contains no child-district paths. `gyeonggi-districts.svg` retains only the ten catalogued general districts.

## Reproducible processing

Download the WFS GeoJSON using a locally issued key, then run:

```sh
node scripts/build-region-maps.mjs --source /absolute/path/to/official-gyeonggi-sigungu.geojson --check
```

The script derives its required IDs and Korean names from `src/data/regions.ts`, dissolves shared child boundaries with `mapshaper` (invoked through `npx --yes mapshaper`), simplifies with weighted 3% simplification while preserving shapes, writes both SVGs in the fixed `0 0 1000 1000` viewBox, and validates unique, known, stable `data-region-id` values. Re-run `node scripts/build-region-maps.mjs --check` without a source file to validate the committed assets and the catalog/adjacency contract.

Source evidence: [Public Data Portal dataset metadata](https://www.data.go.kr/data/15059008/openapi.do) names the provider, WMS/WFS boundary layers (`LT_C_ADSIGG_INFO` for city/county/district), 2025-01 temporal coverage, and Type 1 licence.
