import os
import random
import rasterio
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader

# ---- Dataset class ----
class LandCoverDataset(Dataset):
    def __init__(self, filenames, images_folder, masks_folder, augment=False):
        self.filenames = filenames
        self.images_folder = images_folder
        self.masks_folder = masks_folder
        self.augment = augment

    def __len__(self):
        return len(self.filenames)

    def __getitem__(self, idx):
        filename = self.filenames[idx]

        img = rasterio.open(f"{self.images_folder}/{filename}").read()
        mask = rasterio.open(f"{self.masks_folder}/{filename}").read()[0]

        img = img.astype(np.float32) / 255.0
        mask = mask.astype(np.int64)

        if self.augment:
            img, mask = self.apply_augmentation(img, mask)

        return torch.from_numpy(img), torch.from_numpy(mask)

    def apply_augmentation(self, img, mask):
        if random.random() > 0.5:
            img = np.flip(img, axis=2).copy()
            mask = np.flip(mask, axis=1).copy()

        if random.random() > 0.5:
            img = np.flip(img, axis=1).copy()
            mask = np.flip(mask, axis=0).copy()

        k = random.choice([0, 1, 2, 3])
        img = np.rot90(img, k, axes=(1, 2)).copy()
        mask = np.rot90(mask, k, axes=(0, 1)).copy()

        return img, mask


# ---- Model ----
class DoubleConv(nn.Module):
    def __init__(self, in_channels, out_channels):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=1),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
        )

    def forward(self, x):
        return self.conv(x)

class Encoder(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv1 = DoubleConv(3, 16)
        self.conv2 = DoubleConv(16, 32)
        self.conv3 = DoubleConv(32, 64)
        self.pool = nn.MaxPool2d(2)

    def forward(self, x):
        c1 = self.conv1(x)
        p1 = self.pool(c1)
        c2 = self.conv2(p1)
        p2 = self.pool(c2)
        c3 = self.conv3(p2)
        return c1, c2, c3

class Decoder(nn.Module):
    def __init__(self):
        super().__init__()
        self.up2 = nn.ConvTranspose2d(64, 32, kernel_size=2, stride=2)
        self.conv2 = DoubleConv(64, 32)
        self.up1 = nn.ConvTranspose2d(32, 16, kernel_size=2, stride=2)
        self.conv1 = DoubleConv(32, 16)
        self.final = nn.Conv2d(16, 5, kernel_size=1)

    def forward(self, c1, c2, c3):
        u2 = self.up2(c3)
        merged2 = torch.cat([u2, c2], dim=1)
        d2 = self.conv2(merged2)

        u1 = self.up1(d2)
        merged1 = torch.cat([u1, c1], dim=1)
        d1 = self.conv1(merged1)

        out = self.final(d1)
        return out

class UNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.encoder = Encoder()
        self.decoder = Decoder()

    def forward(self, x):
        c1, c2, c3 = self.encoder(x)
        out = self.decoder(c1, c2, c3)
        return out


if __name__ == "__main__":
    # ---- Train/val split ----
    tiles_path = os.path.join(os.path.dirname(__file__), "..", "tiles")
    images_folder = os.path.join(tiles_path, "images")
    masks_folder = os.path.join(tiles_path, "masks")

    if not os.path.exists(images_folder):
        print(f"Tiles images directory not found at: {images_folder}")
        tile_filenames = []
    else:
        tile_filenames = os.listdir(images_folder)
        print("Total tiles:", len(tile_filenames))

    random.seed(42)
    random.shuffle(tile_filenames)

    split_index = int(len(tile_filenames) * 0.9)
    train_files = tile_filenames[:split_index]
    val_files = tile_filenames[split_index:]

    print("Train tiles:", len(train_files))
    print("Validation tiles:", len(val_files))

    # ---- DataLoaders ----
    train_dataset = LandCoverDataset(train_files, images_folder, masks_folder, augment=True)
    val_dataset = LandCoverDataset(val_files, images_folder, masks_folder, augment=False)

    train_loader = DataLoader(train_dataset, batch_size=16, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=16, shuffle=False)

    model = UNet()
    loss_fn = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
    scheduler = torch.optim.lr_scheduler.StepLR(optimizer, step_size=10, gamma=0.5)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = model.to(device)

    num_epochs = 30

    for epoch in range(num_epochs):
        model.train()
        total_loss = 0

        for images, masks in train_loader:
            images = images.to(device)
            masks = masks.to(device)

            optimizer.zero_grad()

            outputs = model(images)
            loss = loss_fn(outputs, masks)

            loss.backward()
            optimizer.step()

            total_loss += loss.item()

        avg_loss = total_loss / len(train_loader)
        print(f"Epoch {epoch+1}/{num_epochs} - Loss: {avg_loss:.4f}")
        scheduler.step()

    torch.save(model.state_dict(), "trained_unet_lv2.pth")
    print("Model saved.")

    model.eval()

    correct_pixels = 0
    total_pixels = 0

    with torch.no_grad():
        for images, masks in val_loader:
            images = images.to(device)
            masks = masks.to(device)

            outputs = model(images)
            predicted = torch.argmax(outputs, dim=1)

            correct_pixels += (predicted == masks).sum().item()
            total_pixels += torch.numel(masks)

    accuracy = correct_pixels / total_pixels * 100
    print(f"Validation pixel accuracy: {accuracy:.2f}%")