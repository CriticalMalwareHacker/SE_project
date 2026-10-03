"""Flask server entrypoint."""
from __future__ import annotations

import os

from dotenv import load_dotenv
from flask import Flask, jsonify
from flask_cors import CORS

load_dotenv()

from guardloop import store  # noqa: E402
from guardloop.api import api  # noqa: E402
from guardloop.config import get_config  # noqa: E402


def create_app() -> Flask:
    app = Flask(__name__)
    cfg = get_config()
    CORS(app, origins=[cfg["WEB_ORIGIN"]], supports_credentials=False)
    store.init_db()
    app.register_blueprint(api, url_prefix="/api")

    @app.get("/health")
    def health():
        return jsonify({"ok": True})

    @app.errorhandler(404)
    def nf(_e):
        return jsonify({"error": "not_found", "detail": ""}), 404

    @app.errorhandler(500)
    def se(_e):
        return jsonify({"error": "internal", "detail": "see server logs"}), 500

    return app


app = create_app()

if __name__ == "__main__":
    cfg = get_config()
    app.run(host="127.0.0.1", port=int(cfg["SERVER_PORT"]), threaded=True)
