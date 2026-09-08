from Earth_engine import download_satellite_image
from indices import compute_indices, get_ndvi_ndbi_percentages
import numpy as np

print("Earth Engine functions loaded")


# ============================================================
# ANALYZE ONE YEAR — returns vegetation, urbanization + details
# ============================================================

def analyze_location(latitude, longitude, radius, year):
    output_file = f"satellite_{year}.tif"
    download_satellite_image(latitude=latitude, longitude=longitude, radius=radius, year=year, output_file=output_file)
    ndvi, ndbi = compute_indices(output_file)
    result = get_ndvi_ndbi_percentages(ndvi, ndbi)

    # Compute per-class breakdown from index thresholds
    valid_mask = ~np.isnan(ndvi)
    total_valid = int(valid_mask.sum()) or 1

    water_pct    = float(np.sum((ndvi < 0.0) & (ndbi < 0.0) & valid_mask) / total_valid * 100)
    veg_pct      = float(np.sum((ndvi >= 0.3) & valid_mask) / total_valid * 100)
    buildup_pct  = float(np.sum((ndbi >= 0.1) & valid_mask) / total_valid * 100)
    bare_pct     = float(np.sum((ndvi >= 0.0) & (ndvi < 0.3) & (ndbi < 0.1) & valid_mask) / total_valid * 100)

    details = {
        "Background / Bare": round(bare_pct, 2),
        "Water":             round(water_pct, 2),
        "Vegetation":        round(veg_pct, 2),
        "Built-up / Urban":  round(buildup_pct, 2),
    }

    return {
        "vegetation":   result["vegetation"],
        "urbanization": result["urbanization"],
        "details":      details,
    }


# ============================================================
# COMPARE TWO YEARS
# ============================================================

def compare_location(latitude, longitude, radius, year1, year2):
    result1 = analyze_location(latitude, longitude, radius, year1)
    result2 = analyze_location(latitude, longitude, radius, year2)
    return {
        "model": {
            "name": "NDVI/NDBI Spectral Analysis",
            "pipeline": "Google Earth Engine — Sentinel-2 Multispectral",
            "categories": 4,
            "class_scheme": ["Background / Bare", "Water", "Vegetation", "Built-up / Urban"]
        },
        "year1": result1,
        "year2": result2,
        "change": {
            "vegetation":   round(result2["vegetation"]   - result1["vegetation"],   2),
            "urbanization": round(result2["urbanization"] - result1["urbanization"], 2),
        }
    }


# ============================================================
# USER INPUT
# ============================================================
if __name__ == "__main__":
    latitude = float(
        input("Enter latitude: ")
    )

    longitude = float(
        input("Enter longitude: ")
    )

    radius = int(
        input("Enter radius in meters: ")
    )

    year1 = int(
        input("Enter first year: ")
    )

    year2 = int(
        input("Enter second year: ")
    )


    # ============================================================
    # RUN COMPARISON
    # ============================================================

    result = compare_location(
        latitude,
        longitude,
        radius,
        year1,
        year2
    )


    # ============================================================
    # DISPLAY RESULT
    # ============================================================

    print("\n===== RESULT =====")

    print(
        "Year",
        year1
    )

    print(
        result["year1"]
    )

    print(
        "\nYear",
        year2
    )

    print(
        result["year2"]
    )

    print(
        "\nChange"
    )

    print(
        result["change"]
    )