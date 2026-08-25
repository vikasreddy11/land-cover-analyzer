import os
from PIL import Image
import numpy as np
import torch
import matplotlib.pyplot as plt
from U_Net import UNet
import rasterio

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

DEFAULT_WEIGHTS = os.path.join(os.path.dirname(__file__), "trained_unet_v4.pth")

def load_model(weights_path=DEFAULT_WEIGHTS):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = UNet().to(device)
    model.load_state_dict(torch.load(weights_path, map_location=device))
    model.eval()
    return model, device



def visualize(img, predicted_mask):
    fig, axes = plt.subplots(1, 2, figsize=(10, 5))
    axes[0].imshow(img)
    axes[0].set_title("New Input Image")
    axes[1].imshow(predicted_mask.numpy(), cmap='tab10', vmin=0, vmax=4)
    axes[1].set_title("Predicted Mask")
    plt.show()

def get_land_cover_percentages(predicted_mask, num_classes=5):

    class_names = {
        0: "Background",
        1: "Water",
        2: "Woodland",
        3: "Building",
        4: "Road"
    }

    # Convert PyTorch tensor to NumPy if necessary
    if isinstance(predicted_mask, torch.Tensor):
        predicted_mask = predicted_mask.cpu().numpy()

    total = predicted_mask.size

    result = {}

    for c in range(num_classes):

        pixel_count = np.sum(predicted_mask == c)

        pct = (pixel_count / total) * 100

        result[class_names[c]] = pct

    return result


def predict(model, device, image_path, crop_top=20, size=(256, 256)):
    img = Image.open(image_path).convert("RGB")
    width, height = img.size
    img = img.crop((0, crop_top, width, height))
    img = img.resize(size)

    img_array = np.array(img).astype(np.float32) / 255.0
    img_array = np.transpose(img_array, (2, 0, 1))
    img_tensor = torch.from_numpy(img_array).unsqueeze(0).to(device)

    with torch.no_grad():
        output = model(img_tensor)
        predicted_mask = torch.argmax(output, dim=1).squeeze(0).cpu()

    return predicted_mask

def predict_tiled(model, device, image_path, tile_size=256):

    with rasterio.open(image_path) as src:
        image = src.read()

    print("Original image shape:", image.shape)

    height = image.shape[1]
    width = image.shape[2]

    full_mask = np.zeros(
        (height, width),
        dtype=np.uint8
    )

    for y in range(0, height, tile_size):

        for x in range(0, width, tile_size):

            tile = image[
                :,
                y:y + tile_size,
                x:x + tile_size
            ]

            tile_height = tile.shape[1]
            tile_width = tile.shape[2]

            pad_height = tile_size - tile_height
            pad_width = tile_size - tile_width

            tile = np.pad(
                tile,
                (
                    (0, 0),
                    (0, pad_height),
                    (0, pad_width)
                ),
                mode="constant"
            )

            tile = tile.astype(np.float32)
            tile = tile / 10000.0
            tile = np.clip(tile, 0, 1)

            tile_tensor = torch.from_numpy(
                tile
            ).unsqueeze(0).to(device)

            with torch.no_grad():

                output = model(tile_tensor)

                prediction = torch.argmax(
                    output,
                    dim=1
                )

            prediction = prediction.squeeze(0)
            prediction = prediction.cpu().numpy()

            prediction = prediction[
                :tile_height,
                :tile_width
            ]

            full_mask[
                y:y + tile_height,
                x:x + tile_width
            ] = prediction

    print("Final mask shape:", full_mask.shape)

    return full_mask

def compare_years_tiled(
    model,
    device,
    image_path_year1,
    image_path_year2
):

    mask1 = predict_tiled(
        model,
        device,
        image_path_year1
    )

    mask2 = predict_tiled(
        model,
        device,
        image_path_year2
    )

    pct1 = get_land_cover_percentages(mask1)
    pct2 = get_land_cover_percentages(mask2)

    def to_veg_urban(pct):
        return {
            "vegetation": pct["Woodland"],
            "urbanization": pct["Building"] + pct["Road"]
        }

    veg_urban_1 = to_veg_urban(pct1)
    veg_urban_2 = to_veg_urban(pct2)

    return {
        "year1": veg_urban_1,
        "year2": veg_urban_2,
        "change": {
            "vegetation":
                veg_urban_2["vegetation"] -
                veg_urban_1["vegetation"],

            "urbanization":
                veg_urban_2["urbanization"] -
                veg_urban_1["urbanization"]
        }
    }


if __name__ == "__main__":
    model, device = load_model()
    predicted_mask = predict(model, device, "hyderabad_2018_rgb.png")
    percentages = get_land_cover_percentages(predicted_mask)
    print(percentages)

    visualize(Image.open("hyderabad_2018_rgb.png"), predicted_mask)

    result = predict_tiled(model, device, "automatic_2018.tif")
    percentages = get_land_cover_percentages(result)
    print(percentages)
    print(result)