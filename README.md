# 송파구 입지분석 · 토지이용 대시보드

주요 파일:
- `index.html`: 브라우저에서 바로 열 수 있는 대시보드
- `data/songpa_integrated_parcels.csv`: 필지 단위 통합 결과
- `data/songpa_use_stats.csv`: 건축물 주용도 비율표
- `data/songpa_zoning_stats.csv`: 용도지역 비율표
- `data/songpa_census_oa_summary.csv`: 집계구 인구·가구 통계

재생성:
```powershell
node scripts/build_songpa_landuse_dashboard.js
```

반영 데이터:
- 필지 경계: `AL_D002_11_20260508_songpa`
- GIS 건물통합정보: `AL_D010_11_gis`
- 용도지역도: `AL_D154_11_20260412_songpa`
- 건축대장 표제부: `03. 표제부_*.csv`
- 집계구 경계: `bnd_oa_11240_2025_guborder`
- 센서스: `2024`
