import rasterio
import numpy as np


def compute_indices(tif_path):
    """
    Load Red (B4), NIR (B8), SWIR (B11) bands from a GeoTIFF and compute
    NDVI and NDBI.  NaN and no-data pixels (reflectance == 0 in all bands,
    typical of water edges, cloud shadows, and fill areas) are returned as
    np.nan so downstream code can exclude them from statistics.
    """
    with rasterio.open(tif_path) as src:
        red  = src.read(1).astype(np.float32)
        nir  = src.read(2).astype(np.float32)
        swir = src.read(3).astype(np.float32)
        nodata = src.nodata  # may be None

    # Build a validity mask:
    # • pixels where the nodata flag matches any band are invalid
    # • pixels where all bands are 0 are invalid (water/fill/shadow)
    valid = np.ones(red.shape, dtype=bool)
    if nodata is not None:
        valid &= (red != nodata) & (nir != nodata) & (swir != nodata)
    # Sentinel-2 TOA/SR values are always >= 0; all-zero = no data
    valid &= (red + nir + swir) > 0

    epsilon = 1e-6
    # Use np.where so division is only computed on valid pixels
    ndvi = np.where(valid, (nir - red)  / (nir  + red  + epsilon), np.nan)
    ndbi = np.where(valid, (swir - nir) / (swir + nir + epsilon), np.nan)

    return ndvi, ndbi


def get_ndvi_ndbi_percentages(ndvi, ndbi, ndvi_threshold=0.3, ndbi_threshold=0.1):
    """
    Return vegetation and urbanization percentages calculated only over
    valid (non-NaN) pixels.  Water bodies show up as NaN and are excluded
    from the denominator, so they don't artificially suppress both metrics.
    """
    valid_mask   = ~np.isnan(ndvi)          # same mask applies to ndbi
    total_valid  = int(valid_mask.sum())

    if total_valid == 0:
        # Entire scene is water / no-data — return zeros gracefully
        return {"vegetation": 0.0, "urbanization": 0.0}

    vegetation_pct   = float(np.sum((ndvi > ndvi_threshold)  & valid_mask) / total_valid * 100)
    urbanization_pct = float(np.sum((ndbi > ndbi_threshold)  & valid_mask) / total_valid * 100)

    return {"vegetation": round(vegetation_pct, 2), "urbanization": round(urbanization_pct, 2)}