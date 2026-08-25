from Earth_engine import download_satellite_image
from indices import compute_indices, get_ndvi_ndbi_percentages

print("Earth Engine functions loaded")


# ============================================================
# ANALYZE ONE YEAR
# ============================================================

def analyze_location(latitude, longitude, radius, year):
    output_file = f"satellite_{year}.tif"
    download_satellite_image(latitude=latitude, longitude=longitude, radius=radius, year=year, output_file=output_file)
    ndvi, ndbi = compute_indices(output_file)
    return get_ndvi_ndbi_percentages(ndvi, ndbi)


# ============================================================
# COMPARE TWO YEARS
# ============================================================

def compare_location(latitude, longitude, radius, year1, year2):
    result1 = analyze_location(latitude, longitude, radius, year1)
    result2 = analyze_location(latitude, longitude, radius, year2)
    return {
        "year1": result1,
        "year2": result2,
        "change": {
            "vegetation": result2["vegetation"] - result1["vegetation"],
            "urbanization": result2["urbanization"] - result1["urbanization"]
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