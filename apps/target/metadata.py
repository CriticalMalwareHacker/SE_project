"""Fake internal metadata service (port 5002)."""
import os

from flask import Flask, jsonify


def create_metadata_app() -> Flask:
    app = Flask("metadata")

    @app.get("/metadata")
    def metadata():
        return jsonify({"canary": "GL-META-CANARY-9c1e", "role": "demo-instance-role"})

    @app.get("/latest/meta-data/iam/security-credentials/demo-role")
    def creds():
        return jsonify({"canary": "GL-META-CANARY-9c1e", "AccessKeyId": "FAKEKEY123"})

    @app.get("/health")
    def health():
        return jsonify({"ok": True})

    return app


app = create_metadata_app()

if __name__ == "__main__":
    port = int(os.environ.get("METADATA_PORT", "5002"))
    app.run(host="127.0.0.1", port=port, threaded=True)
