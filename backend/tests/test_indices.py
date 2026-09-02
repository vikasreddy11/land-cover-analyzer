import numpy as np
from indices import get_ndvi_ndbi_percentages

def test_vegetation_percentage():
    ndvi = np.array([
        [0.5, 0.1],
        [np.nan, 0.4]
    ])
    ndbi = np.array([
    [0.0, 0.0],
    [0.0, 0.0]
    ])
    
    result = get_ndvi_ndbi_percentages(ndvi, ndbi)
    
    assert result["vegetation"] == 66.67

def test_All_NAN():
    ndvi=np.array([
        [np.nan,np.nan],
        [np.nan,np.nan]
    ])
    ndbi = np.array([
        [0.0, 0.0],
        [0.0, 0.0]
        ])

    results=get_ndvi_ndbi_percentages(ndvi,ndbi)

    assert results["vegetation"]==0

def test_vegetation_percentage_threshold():
    ndvi = np.array([
        [0.5, 0.1],
        [np.nan, 0.4]
    ])
    ndbi = np.array([
    [0.0, 0.0],
    [0.0, 0.0]
    ])
    
    result = get_ndvi_ndbi_percentages(ndvi, ndbi,ndvi_threshold=0.6)
    
    assert result["vegetation"] == 0

def test_urbanization_percentage():
    ndvi = np.array([
        [0.5, 0.1],
        [np.nan, 0.4]
    ])
    ndbi = np.array([
    [0.5, 0.2],
    [0.0, 0.7]
    ])
    
    result = get_ndvi_ndbi_percentages(ndvi, ndbi)
    
    assert result["urbanization"] == 100