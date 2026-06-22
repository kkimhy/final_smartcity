from __future__ import annotations

import csv
import re
from pathlib import Path
from typing import Iterable

try:
    import pandas as pd
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "pandas가 필요합니다. `pip install pandas openpyxl` 후 다시 실행하세요."
    ) from exc


BASE_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = BASE_DIR / "data" / "raw" / "building"
OUTPUT_DIR = BASE_DIR / "data" / "processed"
OUTPUT_PATH = OUTPUT_DIR / "buildings_clean.csv"

TARGET_COLUMNS = {
    "main_use": [
        "주용도",
        "건축물주용도명",
        "건축물주용도코드명",
        "주용도명",
        "용도",
    ],
    "gross_floor_area_sqm": [
        "연면적",
        "연면적(㎡)",
        "연면적(제곱미터)",
    ],
    "site_area_sqm": [
        "대지면적",
        "대지면적(㎡)",
        "대지면적(제곱미터)",
    ],
    "building_area_sqm": [
        "건축면적",
        "건축면적(㎡)",
        "건축면적(제곱미터)",
    ],
    "building_coverage_ratio": [
        "건폐율",
        "건폐율(%)",
    ],
    "floor_area_ratio": [
        "용적률",
        "용적률(%)",
    ],
    "approval_date": [
        "사용승인일",
        "사용승인일자",
        "승인일",
        "준공일자",
        "준공일",
    ],
}

OPTIONAL_COLUMNS = {
    "pnu": ["PNU", "pnu"],
    "mgm_bldrgst_pk": ["관리건축물대장PK", "mgmBldrgstPk", "건축물대장PK"],
    "plat_plc": ["대지위치", "platPlc"],
    "sigungu": ["시군구", "sigungu"],
}

ENCODINGS = ("utf-8-sig", "utf-8", "cp949", "euc-kr")
SUFFIXES = {".csv", ".txt", ".tsv", ".xlsx", ".xls"}


def normalize_name(name: str) -> str:
    text = str(name).strip().replace("\ufeff", "")
    return re.sub(r"[\s\-_()/\[\]{}%.]", "", text).lower()


def build_lookup(columns: Iterable[str]) -> dict[str, str]:
    return {normalize_name(col): col for col in columns}


def find_column(columns: Iterable[str], aliases: list[str]) -> str | None:
    lookup = build_lookup(columns)
    for alias in aliases:
        normalized = normalize_name(alias)
        if normalized in lookup:
            return lookup[normalized]

    normalized_columns = list(lookup.items())
    for alias in aliases:
        needle = normalize_name(alias)
        for normalized, original in normalized_columns:
            if needle and needle in normalized:
                return original
    return None


def sniff_delimiter(sample: str) -> str:
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",\t|;")
        return dialect.delimiter
    except csv.Error:
        return "," if sample.count(",") >= sample.count("\t") else "\t"


def read_text_file(path: Path) -> pd.DataFrame:
    last_error: Exception | None = None
    for encoding in ENCODINGS:
        try:
            sample = path.read_text(encoding=encoding)[:4096]
            delimiter = sniff_delimiter(sample)
            return pd.read_csv(path, encoding=encoding, sep=delimiter, dtype=str)
        except Exception as exc:  # pragma: no cover
            last_error = exc
    raise RuntimeError(f"파일을 읽을 수 없습니다: {path}") from last_error


def read_excel_file(path: Path) -> pd.DataFrame:
    return pd.read_excel(path, dtype=str)


def read_building_file(path: Path) -> pd.DataFrame:
    if path.suffix.lower() in {".xlsx", ".xls"}:
        return read_excel_file(path)
    return read_text_file(path)


def empty_series(length: int) -> pd.Series:
    return pd.Series([None] * length, dtype="object")


def standardize_columns(df: pd.DataFrame, source_file: str) -> pd.DataFrame:
    standardized: dict[str, pd.Series] = {}

    for standard_name, aliases in TARGET_COLUMNS.items():
        matched = find_column(df.columns, aliases)
        standardized[standard_name] = df[matched] if matched else empty_series(len(df))

    for standard_name, aliases in OPTIONAL_COLUMNS.items():
        matched = find_column(df.columns, aliases)
        standardized[standard_name] = df[matched] if matched else empty_series(len(df))

    out = pd.DataFrame(standardized)
    out["source_file"] = source_file

    numeric_cols = [
        "gross_floor_area_sqm",
        "site_area_sqm",
        "building_area_sqm",
        "building_coverage_ratio",
        "floor_area_ratio",
    ]
    for col in numeric_cols:
        out[col] = (
            out[col]
            .astype(str)
            .str.replace(",", "", regex=False)
            .str.replace(r"[^\d.\-]", "", regex=True)
            .replace({"": None, "nan": None, "None": None})
        )
        out[col] = pd.to_numeric(out[col], errors="coerce")

    out["approval_date"] = (
        out["approval_date"]
        .astype(str)
        .str.strip()
        .replace({"": None, "nan": None, "None": None})
    )
    out["approval_date"] = pd.to_datetime(out["approval_date"], errors="coerce")

    out["main_use"] = (
        out["main_use"]
        .astype(str)
        .str.strip()
        .replace({"": None, "nan": None, "None": None})
    )

    return out


def discover_input_files() -> list[Path]:
    files = [
        path
        for path in RAW_DIR.iterdir()
        if path.is_file() and path.suffix.lower() in SUFFIXES and path.name.lower() != "readme.md"
    ]
    if not files:
        raise SystemExit(
            f"입력 파일이 없습니다. {RAW_DIR} 아래에 건축물 원천 파일을 넣어주세요."
        )
    return sorted(files)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    input_files = discover_input_files()

    frames: list[pd.DataFrame] = []
    for path in input_files:
        raw = read_building_file(path)
        clean = standardize_columns(raw, path.name)
        frames.append(clean)

    result = pd.concat(frames, ignore_index=True)
    result.to_csv(OUTPUT_PATH, index=False, encoding="utf-8-sig")

    print(f"saved: {OUTPUT_PATH}")
    print(f"rows: {len(result)}")
    print(f"files: {len(input_files)}")


if __name__ == "__main__":
    main()
