"""
FlexCart Visual Search Service
A Flask microservice that uses ResNet50 for image-based product search.

Usage:
  python visual_search.py

Endpoints:
  POST /index-product      - Extract and store features for a product image
  POST /search             - Search similar products by uploaded image
  DELETE /index-product/<id> - Remove a product from the index
  GET  /health             - Health check
"""

import os
import io
import json
import logging
import numpy as np
from pathlib import Path
from typing import Any
from flask import Flask, request, jsonify
from PIL import Image
import requests

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# ── Model & index state ───────────────────────────────────────────────────
model: Any = None
transform: Any = None
product_index = {}   # { product_id: { 'features': np.ndarray, 'image_url': str, 'name': str } }
INDEX_FILE = Path(__file__).parent / "product_features.json"

UPLOADS_DIR = Path(__file__).parent.parent / "uploads" / "products"


def load_model() -> bool:
    """Load ResNet50 feature extractor (PyTorch, CPU-friendly)."""
    global model, transform
    try:
        import torch
        import torchvision.models as tv_models
        import torchvision.transforms as T

        backbone = tv_models.resnet50(weights=tv_models.ResNet50_Weights.IMAGENET1K_V1)
        # Strip the classification head — keep only the feature extractor
        model = torch.nn.Sequential(*list(backbone.children())[:-1])
        model.eval()

        transform = T.Compose([
            T.Resize(256),
            T.CenterCrop(224),
            T.ToTensor(),
            T.Normalize(mean=[0.485, 0.456, 0.406],
                        std=[0.229, 0.224, 0.225]),
        ])
        logger.info("ResNet50 model loaded (PyTorch)")
        return True
    except ImportError:
        logger.error(
            "PyTorch / torchvision not installed. "
            "Run: pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu"
        )
        return False


def extract_features(image: Image.Image) -> np.ndarray:
    """Return an L2-normalised 1-D feature vector for a PIL image."""
    if model is None or transform is None:
        raise RuntimeError("Model not loaded — call load_model() first")

    import torch
    with torch.no_grad():  # pyright: ignore
        tensor = transform(image.convert("RGB")).unsqueeze(0)  # pyright: ignore
        features: np.ndarray = model(tensor).squeeze().numpy()
    return features / (np.linalg.norm(features) + 1e-8)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b))


def save_index():
    """Persist in-memory index to disk."""
    serializable = {
        pid: {
            'features': entry['features'].tolist(),
            'image_url': entry['image_url'],
            'name': entry['name']
        }
        for pid, entry in product_index.items()
    }
    with open(INDEX_FILE, 'w') as f:
        json.dump(serializable, f)


def load_index():
    """Load persisted index from disk."""
    global product_index
    if INDEX_FILE.exists():
        with open(INDEX_FILE) as f:
            raw = json.load(f)
        product_index = {
            pid: {
                'features': np.array(entry['features'], dtype=np.float32),
                'image_url': entry['image_url'],
                'name': entry['name']
            }
            for pid, entry in raw.items()
        }
        logger.info(f"Loaded {len(product_index)} products into index")


# ── Routes ────────────────────────────────────────────────────────────────

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'model_loaded': model is not None,
        'indexed_products': len(product_index)
    })


@app.route('/index-product', methods=['POST'])
def index_product():
    """
    Index a product image so it can be found via visual search.

    JSON body:
      { "product_id": "123", "image_url": "/uploads/products/abc.jpg", "name": "Product Name" }
    OR multipart:
      product_id, name, image file
    """
    try:
        if request.is_json:
            data = request.get_json()
            product_id = str(data['product_id'])
            image_url = data['image_url']
            name = data.get('name', '')

            # Resolve local path
            local_path = Path(__file__).parent.parent / image_url.lstrip('/')
            if local_path.exists():
                image = Image.open(local_path)
            else:
                # Try downloading (for remote URLs)
                resp = requests.get(image_url, timeout=10)
                resp.raise_for_status()
                image = Image.open(io.BytesIO(resp.content))
        else:
            product_id = str(request.form.get('product_id', ''))
            name = request.form.get('name', '')
            image_url = request.form.get('image_url', '')
            file = request.files.get('image')
            if not file:
                return jsonify({'success': False, 'message': 'No image provided'}), 400
            image = Image.open(file.stream)

        features = extract_features(image)
        product_index[product_id] = {
            'features': features,
            'image_url': image_url,
            'name': name
        }
        save_index()

        return jsonify({'success': True, 'product_id': product_id})

    except Exception as e:
        logger.error(f"Index error: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/index-product/<product_id>', methods=['DELETE'])
def remove_from_index(product_id):
    """Remove a product from the visual search index."""
    if product_id in product_index:
        del product_index[product_id]
        save_index()
        return jsonify({'success': True})
    return jsonify({'success': False, 'message': 'Product not in index'}), 404


@app.route('/search', methods=['POST'])
def search():
    """
    Find visually similar products.

    Accepts multipart (image file) or JSON { "image_url": "..." }.
    Query params:
      top_k     (default 10)   — max results to return
      min_score (default 0.30) — minimum cosine similarity threshold

    Returns list of { product_id, name, image_url, score, exact_match }
    sorted by descending similarity. exact_match=true when score >= 0.95.
    """
    try:
        top_k = int(request.args.get('top_k', 10))
        min_score = float(request.args.get('min_score', 0.30))

        if request.is_json:
            data = request.get_json()
            url = data.get('image_url', '')
            local_path = Path(__file__).parent.parent / url.lstrip('/')
            if local_path.exists():
                query_image = Image.open(local_path)
            else:
                resp = requests.get(url, timeout=10)
                resp.raise_for_status()
                query_image = Image.open(io.BytesIO(resp.content))
        else:
            file = request.files.get('image')
            if not file:
                return jsonify({'success': False, 'message': 'No image provided'}), 400
            query_image = Image.open(file.stream)

        if not product_index:
            return jsonify({'success': True, 'data': [], 'message': 'Index is empty'})

        query_features = extract_features(query_image)

        scores = [
            (pid, cosine_similarity(query_features, entry['features']),
             entry['image_url'], entry['name'])
            for pid, entry in product_index.items()
        ]
        scores.sort(key=lambda x: x[1], reverse=True)

        # Filter by minimum similarity threshold, then cap at top_k
        results = [
            {
                'product_id': pid,
                'score': round(score, 4),
                'image_url': img_url,
                'name': name,
                'exact_match': score >= 0.95,
            }
            for pid, score, img_url, name in scores
            if score >= min_score
        ][:top_k]

        return jsonify({'success': True, 'data': results, 'total': len(results)})

    except Exception as e:
        logger.error(f"Search error: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/bulk-index', methods=['POST'])
def bulk_index():
    """
    Index multiple products at once.

    JSON body: { "products": [ { "product_id", "image_url", "name" }, ... ] }
    """
    try:
        products = request.get_json().get('products', [])
        indexed = 0
        failed = []

        for p in products:
            pid = str(p.get('product_id', ''))
            image_url = p.get('image_url', '')
            name = p.get('name', '')

            if not pid or not image_url:
                continue

            try:
                local_path = Path(__file__).parent.parent / image_url.lstrip('/')
                if local_path.exists():
                    image = Image.open(local_path)
                else:
                    resp = requests.get(image_url, timeout=10)
                    resp.raise_for_status()
                    image = Image.open(io.BytesIO(resp.content))

                features = extract_features(image)
                product_index[pid] = {'features': features,
                                      'image_url': image_url, 'name': name}
                indexed += 1
            except Exception as e:
                failed.append({'product_id': pid, 'error': str(e)})

        if indexed > 0:
            save_index()

        return jsonify({'success': True, 'indexed': indexed, 'failed': failed})

    except Exception as e:
        logger.error(f"Bulk index error: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


# ── Entry point ───────────────────────────────────────────────────────────

if __name__ == '__main__':
    load_model()
    load_index()
    # Railway (and many PaaS) provide the port via PORT.
    port = int(os.environ.get('VS_PORT') or os.environ.get('PORT') or 5001)
    logger.info(f"Visual Search Service starting on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
