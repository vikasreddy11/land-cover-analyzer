# LandScope

LandScope is a satellite-based land cover analysis tool that compares changes in vegetation and urbanization over time using satellite imagery indices (**NDVI** and **NDBI**). It retrieves multispectral Sentinel-2 imagery via Google Earth Engine to compute and compare surface changes between two specified years.

---

## Getting Started

### 1. Prerequisites & Installation

Clone the repository and install the backend dependencies:

```bash
cd backend
pip install -r requirements.txt
```

### 2. Earth Engine Authentication

Before running the application, you must authenticate with Google Earth Engine by configuring one of the following environment variables:

- **Local Development (`EE_KEY_PATH`)**: Path to your Google Cloud service account private key JSON file.
  ```bash
  # Windows (Command Prompt)
  set EE_KEY_PATH=path\to\service-account-key.json

  # Windows (PowerShell)
  $env:EE_KEY_PATH="path\to\service-account-key.json"

  # Linux / macOS
  export EE_KEY_PATH="/path/to/service-account-key.json"
  ```
- **Deployment / Production (`EE_SERVICE_ACCOUNT_KEY`)**: The raw JSON string of your service account credentials.

---

## Running the App

To start the Flask backend server locally:

```bash
cd backend
python app.py
```

The server will start at `http://localhost:5000` by default (or the port specified in the `PORT` environment variable).

---

## Running Tests

Run the test suite using `pytest`:

```bash
cd backend
py -m pytest tests/ -v
```

- **`tests/test_api.py`**: Integration and unit tests for the `/api/compare` endpoint (mocked responses, missing parameters, invalid year ranges, and radius boundary checks).
- **`tests/test_indices.py`**: Unit tests for `get_ndvi_ndbi_percentages()` verifying vegetation/urbanization percentage calculations, NaN edge cases, and custom threshold behavior.

---

## API Documentation

### `GET /api/compare`

Compares land cover indices for a designated geographical area between two years.

#### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `lat` | float | Yes | Latitude of the target location. |
| `lon` | float | Yes | Longitude of the target location. |
| `radius` | int | No | Search radius in meters (default: `2000`). |
| `year1` | int | Yes | Baseline observation year. |
| `year2` | int | Yes | Comparison observation year. |

#### Validation Rules

- **Radius**: Must be greater than `0` and less than `10000` (10 km limit).
- **Years**: Must be `2015` or later (Sentinel-2 availability).
- **Year Ordering**: `year1` must be earlier than `year2` (`year1 < year2`).
