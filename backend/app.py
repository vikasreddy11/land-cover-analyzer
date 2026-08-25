from flask import Flask, request, jsonify
from flask_cors import CORS
from analysis import compare_location
import os

app = Flask(__name__)
CORS(app, origins=["https://landscope.netlify.app"])

@app.route("/api/compare")
def compare():
    try:
        lat    = float(request.args.get("lat"))
        lon    = float(request.args.get("lon"))
        radius = int(request.args.get("radius"))
        year1  = int(request.args.get("year1"))
        year2  = int(request.args.get("year2"))

        if year1 < 2015 or year2 < 2015:
            return jsonify({"error": "Sentinel-2 data is only available from 2015 onwards."}), 400

        if year1 >= year2:
            return jsonify({"error": "year1 must be earlier than year2."}), 400

        result = compare_location(lat, lon, radius, year1, year2)
        return jsonify(result)

    except ValueError as e:
        return jsonify({"error": str(e)}), 422
    except Exception as e:
        return jsonify({"error": f"Analysis failed: {str(e)}"}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)