# 판교 제1·2테크노밸리 도시첨단산업단지 vs 양주 옥정 도시지원시설용지 비교 대시보드

정적 대시보드 `docs/index.html`은 두 입지의 경계, 필지·건축물 단위 속성, 등시간권, 토지이용/고용 통계를 한 화면에서 비교한다.  
원천 데이터는 `data/raw/` 및 저장소 루트 보조 폴더에, 중간 산출물은 `data/processed/`, 브라우저 최종 입력은 `docs/data/`에 둔다.

## 현재 반영 기능

- 입지 및 경계 비교 지도 2개: `나란히 보기 / 단일 보기`, `판교 / 옥정` 전환
- 필지 경계 + 필지/건축물 단위 주용도 또는 추정 용도지역 컬러맵
- 필지/건축물 클릭 시 속성 팝업
  - 주용도
  - 연면적(`㎡`)
  - 대지면적(`㎡`)
  - 용적률(`%`)
  - 건폐율(`%`, 있는 경우)
- 판교역/덕정역 중심 30분·60분 등시간권 폴리곤
- 등시간권별 도달 가능 인구·종사자 수치
- 누적 접근성 곡선, 파이/막대형 비교 차트, 비교 통계 카드
- 기존 분석 파트 유지 + 지도 기반 시각화 보강

## 실제 사용 데이터 점검 결과

이번 점검 기준으로 README는 “코드에서 실제 읽는 입력” 기준으로 정리했다.

- `scripts/preprocess_buildings.py`는 포함되어 있고 `data/processed/buildings_clean.csv`를 생성한다.
- 다만 현재 대시보드 생성용 Node.js 분석 파이프라인은 `buildings_clean.csv`를 직접 읽지 않는다.
- 현재 분석 스크립트들은 건축물 원천 CSV
  - `data/raw/building/seongnam_bundang_building.csv`
  - `data/raw/building/yangju_building.csv`
  를 직접 읽는다.
- 등시간권 계산은 `data/raw/subway/nodes.tsv`, `data/raw/subway/links.tsv`를 사용한다.
- 철도 네트워크 유지 대상 입력은 `data/raw/subway/nodes.tsv`, `data/raw/subway/links.tsv` 두 파일이다.

즉, 보고서에는 `buildings_clean.csv`를 “재현용 표준화 산출물”, 건축물 원천 CSV를 “실제 분석 입력”으로 구분해 쓰는 것이 맞다.

## 실제 분석 입력 데이터

| 구분 | 실제 사용 경로 | 출처/성격 | 기준시점 | 단위 | 실제 사용 스크립트 |
| --- | --- | --- | --- | --- | --- |
| 분석 경계 | `data/raw/boundary/pangyo_urban_support_only.geojson` | 판교 분석 경계 GeoJSON | 분석 작성본 | 좌표, 면적 계산용 공간경계 | `analyze_buildings_in_boundary.js`, `analyze_land_use_metrics.js`, `analyze_approximate_zoning_composition.js`, `analyze_sgis_area_weighted.js`, `analyze_sgis_employment_floor_area.js`, `analyze_transport_accessibility.js`, `build_dashboard_data.js` |
| 분석 경계 | `data/raw/boundary/okjeong_urban_support_only.geojson` | 옥정 분석 경계 GeoJSON | 분석 작성본 | 좌표, 면적 계산용 공간경계 | 동일 |
| 건축물 원천 | `data/raw/building/seongnam_bundang_building.csv` | 성남시 분당구 건축물대장 계열 CSV | 파일 기준 | 연면적 `㎡`, 대지면적 `㎡`, 용적률 `%`, 주용도 | `analyze_buildings_in_boundary.js`, `analyze_land_use_metrics.js`, `analyze_sgis_employment_floor_area.js` |
| 건축물 원천 | `data/raw/building/yangju_building.csv` | 양주시 건축물대장 계열 CSV | 파일 기준 | 연면적 `㎡`, 대지면적 `㎡`, 용적률 `%`, 주용도 | 동일 |
| 필지 경계 | `판교테크노벨리/LSMD_CONT_LDREG_5174_경기_성남시_분당구/LSMD_CONT_LDREG_5174_41135_202606.*` | 연속지적도 shapefile | `2026-06` | 필지 폴리곤, PNU | `analyze_buildings_in_boundary.js`, `analyze_land_use_metrics.js`, `analyze_approximate_zoning_composition.js`, `build_map_layer_data.js` |
| 필지 경계 | `양주옥정신도시/LSMD_CONT_LDREG_경기_양주시/LSMD_CONT_LDREG_41630_202606.*` | 연속지적도 shapefile | `2026-06` | 필지 폴리곤, PNU | 동일 |
| 토지이용계획 | `경기도_토지이용계획정보_AL_D155_41_20260609/AL_D155_41_20260609.csv` | 경기도 토지이용계획정보 CSV | `2026-06-09` | 용도지역 텍스트, PNU 단위 매핑 | `analyze_approximate_zoning_composition.js` |
| SGIS 집계구 경계 | `data/raw/sgis/census_boundary/bundang_2025_2Q/bnd_oa_31023_2025_2Q.*` | 분당구 OA 경계 | `2025년 2분기` | 집계구 폴리곤 | `analyze_sgis_area_weighted.js`, `analyze_sgis_employment_floor_area.js` |
| SGIS 집계구 경계 | `data/raw/sgis/census_boundary/yangju_2025_2Q/bnd_oa_31260_2025_2Q.*` | 양주시 OA 경계 | `2025년 2분기` | 집계구 폴리곤 | 동일 |
| SGIS 인구 | `data/raw/sgis/population/bundang_population.csv` | 분당구 OA 인구 | `2024년` | 명 | `analyze_sgis_area_weighted.js` |
| SGIS 인구 | `data/raw/sgis/population/yangju_population.csv` | 양주시 OA 인구 | `2024년` | 명 | 동일 |
| SGIS 사업체 | `data/raw/sgis/business/bundang_business.csv` | 분당구 OA 사업체수 | `2023년` | 개소 | `analyze_sgis_area_weighted.js` |
| SGIS 사업체 | `data/raw/sgis/business/yangju_business.csv` | 양주시 OA 사업체수 | `2023년` | 개소 | 동일 |
| SGIS 종사자 | `data/raw/sgis/workers/bundang_workers.csv` | 분당구 OA 종사자수 | `2023년` | 명 | `analyze_sgis_area_weighted.js`, `analyze_sgis_employment_floor_area.js` |
| SGIS 종사자 | `data/raw/sgis/workers/yangju_workers.csv` | 양주시 OA 종사자수 | `2023년` | 명 | 동일 |
| 수도권 OA 경계 | `bnd_oa_11_2025_2Q/*`, `bnd_oa_23_2025_2Q/*`, `bnd_oa_31_2025_2Q/*` | 서울·인천·경기 집계구 경계 | `2025년 2분기` | 집계구 폴리곤 | `analyze_transport_accessibility.js`, `build_transport_docs_data.js` |
| 수도권 OA 인구 | `_census_reqdoc_1782066603658/11_2024년_인구총괄(총인구).csv`, `_census_reqdoc_1782066604601/23_2024년_인구총괄(총인구).csv`, `_census_reqdoc_1782066604053/31_2024년_인구총괄(총인구).csv` | 서울·인천·경기 OA 인구 | `2024년` | 명 | `analyze_transport_accessibility.js` |
| 수도권 OA 종사자 | `_census_reqdoc_1782066603658/11_2023년_산업분류별(10차_대분류)_종사자수.csv`, `_census_reqdoc_1782066604601/23_2023년_산업분류별(10차_대분류)_종사자수.csv`, `_census_reqdoc_1782066604053/31_2023년_산업분류별(10차_대분류)_종사자수.csv` | 서울·인천·경기 OA 종사자 | `2023년` | 명 | `analyze_transport_accessibility.js` |
| 철도 네트워크 노드 | `data/raw/subway/nodes.tsv` | 수도권 도시철도 역 노드 | 분석일 기준 유효노선 필터 | 역 좌표, 개통일, 역명 | `analyze_transport_accessibility.js` |
| 철도 네트워크 링크 | `data/raw/subway/links.tsv` | 역간 연결 및 통행시간 | 분석일 기준 유효노선 필터 | 분(`timeFT`, `timeTF`) | `analyze_transport_accessibility.js` |

## 재현용 보조 전처리

### 건축물 표준화 스크립트

- 스크립트: `scripts/preprocess_buildings.py`
- 입력: `data/raw/building/` 내 `csv`, `txt`, `tsv`, `xls`, `xlsx`
- 출력: `data/processed/buildings_clean.csv`
- 목적:
  - 컬럼명 표준화
  - `main_use`
  - `gross_floor_area_sqm`
  - `site_area_sqm`
  - `building_area_sqm`
  - `building_coverage_ratio`
  - `floor_area_ratio`
  - `approval_date`
- 단위 정리:
  - 면적 `㎡`
  - 건폐율/용적률 `%`
  - 승인일 `datetime`

주의:

- 이 파일은 재현성과 원천자료 정리를 위해 유지한다.
- 현재 대시보드용 Node.js 분석 스크립트는 이 파일을 직접 소비하지 않는다.

## 처리 로직 요약

### 1. 경계 내 건축물 추출

- 스크립트: `scripts/analyze_buildings_in_boundary.js`
- 방법:
  - 건축물 원천 CSV에서 PNU를 생성
  - 연속지적도 shapefile의 PNU와 조인
  - 필지 중심점이 분석 경계 내부인지 판정
- 주요 산출물:
  - `data/processed/pangyo_buildings_in_boundary.csv`
  - `data/processed/okjeong_buildings_in_boundary.csv`

### 2. 토지이용/개발실현 지표

- 스크립트: `scripts/analyze_land_use_metrics.js`
- 방법:
  - 건축물 CSV와 필지 shapefile을 PNU 기준 결합
  - 총 연면적, 주용도 구성, 미개발 필지 비율, 사이트 수준 용적률 계산
- 주요 단위:
  - `boundaryAreaSqm`, `parcelAreaSqm`, `grossFloorAreaSqm`: `㎡`
  - `siteLevelFarPercent`, `parcelFarPercent`: `%`

### 3. 용도지역 추정

- 스크립트: `scripts/analyze_approximate_zoning_composition.js`
- 방법:
  - 연속지적도 필지와 토지이용계획정보 CSV를 PNU로 결합
  - 필지별 용도지역명을 부여
  - 경계 내부 필지 면적 기준으로 용도지역 구성비 계산
- 해석 주의:
  - 대시보드의 용도지역 색상은 “법정 면적 산정도”가 아니라 CSV-PNU 기반의 근사 결과다.

### 4. SGIS 면적가중 통계

- 스크립트: `scripts/analyze_sgis_area_weighted.js`
- 방법:
  - 분석 경계와 OA 폴리곤 교차면적 비율 계산
  - 인구·사업체·종사자 수치를 면적 비율로 가중합
- 주요 단위:
  - 인구: `명`
  - 사업체: `개소`
  - 종사자: `명`
  - 밀도: `명/㎢`, `개소/㎢`

### 5. SGIS 연면적가중 고용 보조지표

- 스크립트: `scripts/analyze_sgis_employment_floor_area.js`
- 방법:
  - 건축물 연면적을 이용해 OA 내부 고용량을 보조 배분
  - 면적가중 결과와 비교 지표 생성
- 주요 단위:
  - `businessFloorWeighted`, `workersFloorWeighted`: 추정 개소/명

### 6. 철도 등시간권 접근성

- 스크립트: `scripts/analyze_transport_accessibility.js`
- 핵심 설정:
  - 분석일: `2026-06-22`
  - 등시간권 기준: `30분`, `60분`
  - 역세권 반경: `500m`
  - 보조 버퍼: `500m`, `1000m`
- 방법:
  - `nodes.tsv`, `links.tsv`에서 분석일 이전 개통/유효 구간만 사용
  - 핵심역에서 최단 소요시간 계산
  - 도달 가능한 역의 `500m` 버퍼 union으로 등시간권 작성
  - 수도권 OA centroid가 등시간권 내부에 들어오면 인구/종사자 도달 가능으로 집계
- 해석 주의:
  - centroid 기반이므로 경계부 과대·과소 추정이 있을 수 있다.

## 최종 문서 입력 산출물

브라우저가 직접 읽는 파일은 아래 3개다.

- `docs/data/dashboard-data.js`
- `docs/data/transport-data.js`
- `docs/data/map-layer-data.js`

생성 스크립트는 아래와 같다.

- `node scripts/build_dashboard_data.js`
- `node scripts/build_transport_docs_data.js`
- `node scripts/build_map_layer_data.js`

`build_map_layer_data.js`는 아래 중간 산출물도 직접 사용한다.

- `data/processed/pangyo_buildings_in_boundary.csv`
- `data/processed/okjeong_buildings_in_boundary.csv`
- `data/processed/development_realization_parcels.csv`
- `data/processed/approximate_zoning_composition_parcels.csv`
- 각 입지의 연속지적도 shapefile

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

## 한계

- 등시간권 집계는 OA centroid 기준이므로 세밀한 보행 접근성까지 반영하지 않는다.
- 용도지역 표시는 토지이용계획정보 CSV와 PNU 결합 기반의 추정 결과다.
- 건축물 전처리 산출물 `buildings_clean.csv`는 현재 분석 파이프라인의 직접 입력은 아니다.
- 철도 접근성 계산의 유지 대상 입력은 `data/raw/subway/nodes.tsv`, `data/raw/subway/links.tsv`다.
