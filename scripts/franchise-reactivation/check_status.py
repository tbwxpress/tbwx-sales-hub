"""
Poll Meta WABA for franchise_reactivation_* template approval status.

Usage:
    python check_status.py             # one-shot status check
    python check_status.py --watch     # poll every 60s until all APPROVED or one REJECTED

Reads ./submitted.json for template IDs.
"""
import json
import os
import sys
import time
from pathlib import Path
from urllib import request, error

WABA_ID = os.environ.get("WHATSAPP_WABA_ID", "1554759132282286")
GRAPH_VERSION = os.environ.get("META_GRAPH_VERSION", "v21.0")
GRAPH_SCHEME = os.environ.get("META_GRAPH_SCHEME", "https")
GRAPH_HOST = os.environ.get("META_GRAPH_HOST", "graph.facebook.com")
GRAPH_BASE_URL = os.environ.get("META_GRAPH_BASE_URL", f"{GRAPH_SCHEME}://{GRAPH_HOST}")

HERE = Path(__file__).parent
ENV_FILE = Path(__file__).resolve().parents[3].parent / "Claude-Memory" / "API-KEYS.env"
SUBMITTED_LOG = HERE / "submitted.json"

TEMPLATE_NAMES = [
    "franchise_reactivation_d0",
    "franchise_reactivation_d5",
    "franchise_reactivation_d7",
]


def load_token():
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        if line.startswith("META_ACCESS_TOKEN="):
            return line.split("=", 1)[1].strip()
    sys.exit("META_ACCESS_TOKEN not found in API-KEYS.env")


def get_template_status(token: str, name: str) -> dict:
    url = (
        f"{GRAPH_BASE_URL}/{GRAPH_VERSION}/{WABA_ID}/message_templates"
        f"?name={name}&access_token={token}"
    )
    req = request.Request(url, method="GET")
    try:
        with request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read())
            data = body.get("data") or []
            if not data:
                return {"name": name, "status": "NOT_FOUND"}
            t = data[0]
            return {
                "name": name,
                "id": t.get("id"),
                "status": t.get("status"),
                "category": t.get("category"),
                "rejected_reason": t.get("rejected_reason"),
            }
    except error.HTTPError as e:
        return {"name": name, "status": "ERROR", "body": json.loads(e.read())}
    except Exception as e:
        return {"name": name, "status": "ERROR", "body": str(e)}


def fetch_all(token: str) -> list:
    return [get_template_status(token, n) for n in TEMPLATE_NAMES]


def print_summary(results: list):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n[{ts}]")
    for r in results:
        marker = {
            "APPROVED": "✓",
            "PENDING": "·",
            "REJECTED": "✗",
            "NOT_FOUND": "?",
            "ERROR": "!",
        }.get(r.get("status", ""), "·")
        line = f"  {marker} {r['name']:<32} {r.get('status', 'UNKNOWN')}"
        if r.get("rejected_reason"):
            line += f"  (reason: {r['rejected_reason']})"
        print(line)


def main():
    token = load_token()
    watch = "--watch" in sys.argv
    while True:
        results = fetch_all(token)
        print_summary(results)
        statuses = {r.get("status") for r in results}
        if "REJECTED" in statuses:
            print("\n✗ At least one template REJECTED. Stopping watch.")
            sys.exit(2)
        if statuses == {"APPROVED"}:
            print("\n✓ All 3 templates APPROVED. Safe to flip live.")
            return
        if not watch:
            return
        time.sleep(60)


if __name__ == "__main__":
    main()
