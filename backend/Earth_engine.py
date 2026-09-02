import os
import json
import ee
import requests

# ============================================================
# 1. CONNECT TO GOOGLE EARTH ENGINE
# ============================================================

def get_earth_engine_credentials():
    # Case 1: deployed — the key is stored as an environment variable
    key_json = os.environ.get("EE_SERVICE_ACCOUNT_KEY")
    if key_json:
        key_dict = json.loads(key_json)
        credentials = ee.ServiceAccountCredentials(
            email=key_dict["client_email"],
            key_data=key_json
        )
        return credentials

    # Case 2: local — read the key straight from the downloaded file
    key_path = os.environ.get("EE_KEY_PATH")
    return ee.ServiceAccountCredentials(
        email=None,
        key_file=key_path
    )


def init_earth_engine():
    credentials = get_earth_engine_credentials()
    ee.Initialize(credentials)

print("Earth Engine connected!")



# ============================================================
# 2. CREATE AREA FROM LOCATION + RADIUS
# ============================================================

def create_area(latitude, longitude, radius):

    point = ee.Geometry.Point([
        longitude,
        latitude
    ])

    area = point.buffer(radius)

    return area


# ============================================================
# 3. FIND SENTINEL-2 IMAGE
# ============================================================

def get_satellite_image(latitude, longitude, radius, year):

    area = create_area(
        latitude,
        longitude,
        radius
    )

    start_date = f"{year}-01-01"
    end_date = f"{year + 1}-01-01"

    collection = (
        ee.ImageCollection(
            "COPERNICUS/S2_SR_HARMONIZED"
        )
        .filterBounds(area)
        .filterDate(
            start_date,
            end_date
        )
        .filter(
            ee.Filter.lt(
                "CLOUDY_PIXEL_PERCENTAGE",
                30
            )
        )
        .sort(
            "CLOUDY_PIXEL_PERCENTAGE"
        )
    )

    # Check whether an image exists
    count = collection.size().getInfo()

    if count == 0:
        raise ValueError(
            f"No suitable Sentinel-2 image found for {year}. "
            f"Try another year or increase the cloud limit."
        )

    image = collection.first()

    print(
        f"Satellite image found for {year}"
    )

    return image, area


# ============================================================
# 4. DOWNLOAD SATELLITE IMAGE
# ============================================================

def download_satellite_image(
    latitude,
    longitude,
    radius,
    year,
    output_file
):

    image, area = get_satellite_image(
        latitude,
        longitude,
        radius,
        year
    )

    # Sentinel-2 RGB
    # B4 = Red
    # B3 = Green
    # B2 = Blue

    bands = image.select(["B4", "B8", "B11"])
    # Create download URL

    url = bands.getDownloadURL({
        "scale": 10,
        "region": area,
        "format": "GEO_TIFF"
    })

    print("Download URL created")

    # Download file

    response = requests.get(url)

    print(
        "Status code:",
        response.status_code
    )

    print(
        "Content type:",
        response.headers.get("Content-Type")
    )

    print(
        "File size:",
        len(response.content),
        "bytes"
    )

    response.raise_for_status()

    # Save TIFF

    with open(
        output_file,
        "wb"
    ) as f:

        f.write(
            response.content
        )

    print(
        "Downloaded:",
        output_file
    )


# ============================================================
# 5. TEST
# ============================================================

if __name__ == "__main__":

    download_satellite_image(
        latitude=17.3850,
        longitude=78.4867,
        radius=2000,
        year=2018,
        output_file="automatic_2018.tif"
    )