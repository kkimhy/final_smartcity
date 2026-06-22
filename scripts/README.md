# scripts

대시보드 재현에 필요한 전처리, 분석, 문서용 데이터 생성 스크립트를 모아둔 디렉터리다.  
아래 설명은 현재 코드가 실제로 읽는 입력과 생성 산출물을 기준으로 정리했다.

## 스크립트별 역할

- `preprocess_buildings.py`
  - `data/raw/building/` 안의 건축물 원천 파일을 표준 컬럼으로 정리해 `data/processed/buildings_clean.csv` 생성
  - 재현용 보조 전처리이며, 현재 Node.js 분석 파이프라인의 직접 입력은 아님
- `analyze_buildings_in_boundary.js`
  - 건축물 원천 CSV와 연속지적도 shapefile을 PNU로 조인하고 경계 내부 건축물만 추출
- `analyze_land_use_metrics.js`
  - 총 연면적, 용적률, 미개발 필지 비율, 주용도 구성 계산
- `analyze_approximate_zoning_composition.js`
  - 토지이용계획정보 CSV와 필지 shapefile을 결합해 용도지역 구성 추정
- `analyze_sgis_area_weighted.js`
  - OA 교차면적 비율로 인구·사업체·종사자 가중합 계산
- `analyze_sgis_employment_floor_area.js`
  - 건축물 연면적 기반 고용 보조지표 계산
- `analyze_transport_accessibility.js`
  - 판교역/덕정역 기준 30분·60분 등시간권, 도달 가능 인구·종사자, 누적 접근성 곡선 계산
- `build_dashboard_data.js`
  - `docs/data/dashboard-data.js` 생성
- `build_transport_docs_data.js`
  - `docs/data/transport-data.js` 생성
- `build_map_layer_data.js`
  - 필지 폴리곤, 건축물 포인트, 용도/용도지역 속성을 묶어 `docs/data/map-layer-data.js` 생성

## 실제 입력 데이터 메모

- 건축물 실제 분석 입력
  - `data/raw/building/seongnam_bundang_building.csv`
  - `data/raw/building/yangju_building.csv`
- 분석 경계
  - `data/raw/boundary/pangyo_urban_support_only.geojson`
  - `data/raw/boundary/okjeong_urban_support_only.geojson`
- 필지 경계
  - `판교테크노벨리/...202606.*`
  - `양주옥정신도시/...202606.*`
- SGIS
  - 인구: `2024년`, 단위 `명`
  - 사업체: `2023년`, 단위 `개소`
  - 종사자: `2023년`, 단위 `명`
- 철도 네트워크
  - `data/raw/subway/nodes.tsv`
  - `data/raw/subway/links.tsv`

주의:

- 철도 네트워크의 실제 유지 대상 입력은 `data/raw/subway/nodes.tsv`, `data/raw/subway/links.tsv` 두 파일이다.

## 권장 실행 순서

1. `python scripts/preprocess_buildings.py`
2. `node scripts/analyze_buildings_in_boundary.js`
3. `node scripts/analyze_land_use_metrics.js`
4. `node scripts/analyze_approximate_zoning_composition.js`
5. `node scripts/analyze_sgis_area_weighted.js`
6. `node scripts/analyze_sgis_employment_floor_area.js`
7. `node scripts/analyze_transport_accessibility.js`
8. `node scripts/build_dashboard_data.js`
9. `node scripts/build_transport_docs_data.js`
10. `node scripts/build_map_layer_data.js`

## 단위 메모

- 면적: `㎡`
- 용적률/건폐율: `%`
- 인구/종사자: `명`
- 사업체: `개소`
- 철도 통행시간: `분`
