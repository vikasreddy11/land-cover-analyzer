import os
import rasterio
import numpy as np
import torch
import torch.nn as nn
from PIL import Image

try:
    from U_Net import UNet
except ImportError:
    from unet_pipeline.U_Net import UNet

LV2_WEIGHTS = os.path.join(os.path.dirname(__file__), "trained_unet_lv2.pth")
V4_WEIGHTS = os.path.join(os.path.dirname(__file__), "trained_unet_v4.pth")

# Native Class Names
CLASS_NAMES_4 = {
    0: "Background",
    1: "Built-up",
    2: "Vegetation",
    3: "Water"
}

CLASS_NAMES_5 = {
    0: "Background",
    1: "Water",
    2: "Woodland",
    3: "Building",
    4: "Road"
}


class HybridLandCoverModel(nn.Module):
    """
    Clean Hybrid Land Cover Model:
    - Supports native 4-class pipeline (0: Background, 1: Built-up, 2: Vegetation, 3: Water) for trained_unet_lv2.pth
    - Supports native 5-class pipeline (0: Background, 1: Water, 2: Woodland, 3: Building, 4: Road) for trained_unet_v4.pth
    - Integrates physical spectral heuristics (NDVI / ExG and Brightness) directly into the native class probabilities without fabricating artificial classes.
    """
    def __init__(self, weights_path=LV2_WEIGHTS, num_classes=None, device=None):
        super().__init__()
        self.device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.weights_path = weights_path
        self.unet = UNet().to(self.device)
        self.num_classes = num_classes or 4
        
        if weights_path and os.path.exists(weights_path):
            self.load_checkpoint(weights_path)

    def load_checkpoint(self, path):
        """Loads weights and aligns the final conv layer to the checkpoint's native class count."""
        self.weights_path = path
        sd = torch.load(path, map_location=self.device)
        out_c = sd["decoder.final.weight"].shape[0]
        
        self.unet.decoder.final = nn.Conv2d(16, out_c, kernel_size=1).to(self.device)
        self.num_classes = out_c
        self.unet.load_state_dict(sd)
        self.unet.eval()
        print(f"[HybridModel] Loaded weights: {os.path.basename(path)} | Native Classes: {out_c}")

    def forward(self, x):
        return self.unet(x)

    def predict_hybrid(self, img_tensor):
        """
        Runs hybrid prediction on normalized [0, 1] RGB tensor (B, 3, H, W).
        Applies spectral index refinement directly within the native class space.
        """
        if isinstance(img_tensor, np.ndarray):
            img_tensor = torch.from_numpy(img_tensor).float()

        if img_tensor.ndim == 3:
            img_tensor = img_tensor.unsqueeze(0)

        img_tensor = img_tensor.to(self.device)

        with torch.no_grad():
            logits = self.unet(img_tensor)
            probs = torch.softmax(logits, dim=1).cpu().numpy()

        imgs_np = img_tensor.cpu().numpy()
        r = imgs_np[:, 0, :, :]
        g = imgs_np[:, 1, :, :]
        b = imgs_np[:, 2, :, :]

        # Spectral Indices: Excess Green Index (ExG) & Brightness
        exg = (2.0 * g - r - b) / (2.0 * g + r + b + 1e-6)
        brightness = (r + g + b) / 3.0

        refined_probs = probs.copy()

        if self.num_classes == 4:
            # Native 4-Class Scheme: 0=Background, 1=Built-up, 2=Vegetation, 3=Water
            
            # 1. Vegetation Refinement (Class 2)
            veg_mask = exg > 0.08
            refined_probs[:, 2, :, :] += np.where(veg_mask, np.clip(exg * 1.5, 0.2, 1.0), 0.0)

            # 2. Water Refinement (Class 3)
            water_mask = (brightness < 0.12) & (b >= r)
            refined_probs[:, 3, :, :] += np.where(water_mask, 0.8, 0.0)

            # 3. Built-up Refinement (Class 1)
            urban_mask = (brightness > 0.45) & (exg < -0.05)
            refined_probs[:, 1, :, :] += np.where(urban_mask, 0.5, 0.0)

        elif self.num_classes == 5:
            # Native 5-Class Scheme: 0=Background, 1=Water, 2=Woodland, 3=Building, 4=Road
            
            # 1. Vegetation Refinement (Class 2)
            veg_mask = exg > 0.08
            refined_probs[:, 2, :, :] += np.where(veg_mask, np.clip(exg * 1.5, 0.2, 1.0), 0.0)

            # 2. Water Refinement (Class 1)
            water_mask = (brightness < 0.12) & (b >= r)
            refined_probs[:, 1, :, :] += np.where(water_mask, 0.8, 0.0)

            # 3. Building Refinement (Class 3)
            urban_mask = (brightness > 0.45) & (exg < -0.05)
            refined_probs[:, 3, :, :] += np.where(urban_mask, 0.5, 0.0)

        final_mask = np.argmax(refined_probs, axis=1)
        return final_mask[0] if final_mask.shape[0] == 1 else final_mask

    def predict_image(self, image_path, crop_top=20, size=(256, 256)):
        """Predict land cover for a single RGB image."""
        img = Image.open(image_path).convert("RGB")
        w, h = img.size
        img = img.crop((0, crop_top, w, h)).resize(size)

        arr = np.array(img).astype(np.float32) / 255.0
        tensor = torch.from_numpy(np.transpose(arr, (2, 0, 1))).unsqueeze(0)
        return self.predict_hybrid(tensor)

    def predict_tiled_hybrid(self, tif_path, tile_size=256):
        """Tile-based inference for large GeoTIFF files."""
        with rasterio.open(tif_path) as src:
            image = src.read()

        h, w = image.shape[1], image.shape[2]
        full_mask = np.zeros((h, w), dtype=np.uint8)

        for y in range(0, h, tile_size):
            for x in range(0, w, tile_size):
                tile = image[:, y:y + tile_size, x:x + tile_size]
                th, tw = tile.shape[1], tile.shape[2]

                tile = np.pad(tile, ((0, 0), (0, tile_size - th), (0, tile_size - tw)), mode="constant")
                tile = tile.astype(np.float32) / 10000.0 if tile.max() > 255 else tile.astype(np.float32) / 255.0
                tile = np.clip(tile, 0, 1)

                tile_tensor = torch.from_numpy(tile).unsqueeze(0)
                pred = self.predict_hybrid(tile_tensor)
                if isinstance(pred, np.ndarray) and pred.ndim > 2:
                    pred = pred[0]

                full_mask[y:y + th, x:x + tw] = pred[:th, :tw]

        return full_mask


def get_land_cover_percentages(predicted_mask, num_classes=4):
    """Computes land cover class percentages based on the active class scheme."""
    class_names = CLASS_NAMES_4 if num_classes == 4 else CLASS_NAMES_5

    if isinstance(predicted_mask, torch.Tensor):
        predicted_mask = predicted_mask.cpu().numpy()

    total = predicted_mask.size
    result = {}
    for c in range(num_classes):
        cnt = np.sum(predicted_mask == c)
        result[class_names.get(c, f"Class_{c}")] = round(float(cnt / total * 100), 2)
    return result


def compare_years_hybrid(hybrid_model, tif_year1, tif_year2):
    """
    Compares two observation years using the hybrid model.
    Dynamically adapts to 4-class (lv2) and 5-class (v4) schemas.
    """
    mask1 = hybrid_model.predict_tiled_hybrid(tif_year1)
    mask2 = hybrid_model.predict_tiled_hybrid(tif_year2)

    n_cls = hybrid_model.num_classes
    pct1 = get_land_cover_percentages(mask1, num_classes=n_cls)
    pct2 = get_land_cover_percentages(mask2, num_classes=n_cls)

    def extract_metrics(pct):
        if n_cls == 4:
            return {
                "vegetation": pct.get("Vegetation", 0.0),
                "urbanization": pct.get("Built-up", 0.0)
            }
        else:
            return {
                "vegetation": pct.get("Woodland", 0.0),
                "urbanization": round(pct.get("Building", 0.0) + pct.get("Road", 0.0), 2)
            }

    v_u_1 = extract_metrics(pct1)
    v_u_2 = extract_metrics(pct2)

    return {
        "year1": {**v_u_1, "details": pct1},
        "year2": {**v_u_2, "details": pct2},
        "change": {
            "vegetation": round(v_u_2["vegetation"] - v_u_1["vegetation"], 2),
            "urbanization": round(v_u_2["urbanization"] - v_u_1["urbanization"], 2)
        }
    }
