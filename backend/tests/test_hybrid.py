import os
import sys
import numpy as np
import torch

# Ensure unet_pipeline is importable
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from unet_pipeline.hybrid_model import HybridLandCoverModel, get_land_cover_percentages


def test_hybrid_model_initialization():
    lv2_path = os.path.join(PROJECT_ROOT, "unet_pipeline", "trained_unet_lv2.pth")
    hybrid = HybridLandCoverModel(weights_path=lv2_path, num_classes=4)
    assert hybrid is not None
    assert hybrid.num_classes == 4


def test_hybrid_model_predict_shape():
    lv2_path = os.path.join(PROJECT_ROOT, "unet_pipeline", "trained_unet_lv2.pth")
    hybrid = HybridLandCoverModel(weights_path=lv2_path, num_classes=4)
    
    # Fake RGB image batch (1, 3, 256, 256)
    dummy_input = torch.rand(1, 3, 256, 256)
    pred = hybrid.predict_hybrid(dummy_input)
    
    assert isinstance(pred, np.ndarray)
    assert pred.shape == (256, 256)
    assert set(np.unique(pred)).issubset({0, 1, 2, 3, 4})


def test_land_cover_percentages():
    fake_mask = np.zeros((100, 100), dtype=np.uint8)
    fake_mask[:50, :] = 2  # 50% Vegetation
    fake_mask[50:, :] = 1  # 50% Built-up
    
    pcts = get_land_cover_percentages(fake_mask, num_classes=4)
    assert pcts["Vegetation"] == 50.0
    assert pcts["Built-up"] == 50.0
    assert pcts["Water"] == 0.0
    assert pcts["Background"] == 0.0
