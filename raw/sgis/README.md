# SGIS 원본 파일 적재 규칙

이 폴더에는 SGIS에서 내려받은 원본 파일을 가공 전 상태로 넣는다.

## 폴더 구조

```text
data/raw/sgis/
  bundang/
    population/
    establishments/
    workers/
  yangju/
    population/
    establishments/
    workers/
```

## 현재 적재 대상

- `bundang/population/`: 성남시 분당구 총인구
- `bundang/establishments/`: 성남시 분당구 사업체수
- `bundang/workers/`: 성남시 분당구 종사자수
- `yangju/population/`: 양주시 총인구
- `yangju/establishments/`: 양주시 사업체수
- `yangju/workers/`: 양주시 종사자수

## 파일명 권장 규칙

- `sgis_bundang_population_YYYYMMDD.csv`
- `sgis_bundang_establishments_YYYYMMDD.csv`
- `sgis_bundang_workers_YYYYMMDD.csv`
- `sgis_yangju_population_YYYYMMDD.csv`
- `sgis_yangju_establishments_YYYYMMDD.csv`
- `sgis_yangju_workers_YYYYMMDD.csv`

압축파일을 받았더라도 가능하면 압축을 해제한 원본 CSV/XLSX를 해당 하위 폴더에 넣는다.
