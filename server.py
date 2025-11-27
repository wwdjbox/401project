#!/usr/bin/env python3
"""
Lightweight backend service for the 401(k) contribution demo.
Provides JSON APIs and serves the static frontend from ./public.
No third-party dependencies required.
"""

from __future__ import annotations

import json
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Dict

ROOT_DIR = Path(__file__).parent
PUBLIC_DIR = ROOT_DIR / "public"
DATA_FILE = ROOT_DIR / "data.json"

DEFAULT_SETTINGS = {
    "contributionType": "percent",
    "contributionValue": 7.0,
}

MOCK_SUMMARY = {
    "employeeName": "Alex Johnson",
    "planType": "Traditional 401(k)",
    "annualSalary": 95000,
    "payFrequency": 24,  # Bi-weekly paychecks
    "ytdContribution": 4100,  # Year-to-date employee contributions
    "ytdEmployerMatch": 1640,  # Year-to-date employer match (4% of salary up to match limit)
    "companyMatchPercent": 4.0,
    "age": 30,
    "retirementAge": 65,
    "estimatedBalanceAtRetirement": 685000,
}


def ensure_data_file() -> None:
    """Create the data file with defaults if it does not exist yet."""
    if DATA_FILE.exists():
        return
    DATA_FILE.write_text(json.dumps(DEFAULT_SETTINGS, indent=2))


def read_settings() -> Dict[str, Any]:
    ensure_data_file()
    with DATA_FILE.open() as handle:
        return json.load(handle)


def write_settings(settings: Dict[str, Any]) -> None:
    DATA_FILE.write_text(json.dumps(settings, indent=2))


class RequestHandler(BaseHTTPRequestHandler):
    server_version = "Simple401k/1.0"

    def _set_headers(self, status: HTTPStatus = HTTPStatus.OK, content_type: str = "application/json") -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _send_json(self, payload: Dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self._set_headers(status=status)
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._set_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path.startswith("/api/settings"):
            payload = read_settings()
            self._send_json(payload)
            return
        if self.path.startswith("/api/summary"):
            payload = {**MOCK_SUMMARY, **read_settings()}
            self._send_json(payload)
            return
        # Serve static files for everything else.
        self.serve_static()

    def do_POST(self) -> None:  # noqa: N802
        if not self.path.startswith("/api/settings"):
            self._send_json({"error": "Unsupported endpoint"}, status=HTTPStatus.NOT_FOUND)
            return
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length else b"{}"
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self._send_json({"error": "Invalid JSON"}, status=HTTPStatus.BAD_REQUEST)
            return
        contribution_type = data.get("contributionType")
        contribution_value = data.get("contributionValue")
        if contribution_type not in {"percent", "dollar"}:
            self._send_json({"error": "contributionType must be 'percent' or 'dollar'."}, status=HTTPStatus.BAD_REQUEST)
            return
        try:
            contribution_value = float(contribution_value)
        except (TypeError, ValueError):
            self._send_json({"error": "contributionValue must be numeric."}, status=HTTPStatus.BAD_REQUEST)
            return
        if contribution_type == "percent" and not (0 <= contribution_value <= 75):
            self._send_json({"error": "Percent contributions must be between 0 and 75."}, status=HTTPStatus.BAD_REQUEST)
            return
        if contribution_type == "dollar" and contribution_value < 0:
            self._send_json({"error": "Dollar contributions must be positive."}, status=HTTPStatus.BAD_REQUEST)
            return
        new_settings = {"contributionType": contribution_type, "contributionValue": contribution_value}
        write_settings(new_settings)
        self._send_json(new_settings, status=HTTPStatus.CREATED)

    def serve_static(self) -> None:
        path = self.path.strip("/") or "index.html"
        file_path = (PUBLIC_DIR / path).resolve()
        try:
            file_path.relative_to(PUBLIC_DIR)
        except ValueError:
            self._set_headers(HTTPStatus.FORBIDDEN)
            self.wfile.write(b"Forbidden")
            return
        if not file_path.exists():
            self._set_headers(HTTPStatus.NOT_FOUND, content_type="text/plain")
            self.wfile.write(b"Not found")
            return
        if file_path.suffix in {".html", ".htm"}:
            content_type = "text/html; charset=utf-8"
        elif file_path.suffix == ".css":
            content_type = "text/css; charset=utf-8"
        elif file_path.suffix == ".js":
            content_type = "application/javascript"
        else:
            content_type = "application/octet-stream"
        with file_path.open("rb") as asset:
            data = asset.read()
        self._set_headers(content_type=content_type)
        self.wfile.write(data)


def run_server(host: str = "127.0.0.1", port: int = 8000) -> None:
    ensure_data_file()
    with HTTPServer((host, port), RequestHandler) as httpd:
        print(f"Serving 401(k) demo on http://{host}:{port}")
        httpd.serve_forever()


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    run_server(host=host, port=port)

