"""
Submit the 3 franchise reactivation templates to Meta WABA.

Reads templates from ./templates/d0.json, d5.json, d7.json
POSTs each to {GRAPH_BASE_URL}/{GRAPH_VERSION}/{WABA_ID}/message_templates
Logs the returned template ID + status to ./submitted.json for audit.
"""
import json
import os
import sys
from pathlib import Path
from urllib import request, error

WABA_ID = os.environ.get("WHATSAPP_WABA_ID", "1554759132282286")
GRAPH_VERSION = os.environ.get("META_GRAPH_VERSION", "v21.0")
GRAPH_SCHEME = os.environ.get("META_GRAPH_SCHEME", "https")
GRAPH_HOST = os.environ.get("META_GRAPH_HOST", "graph.facebook.com")
GRAPH_BASE_URL = os.environ.get("META_GRAPH_BASE_URL", f"{GRAPH_SCHEME}://{GRAPH_HOST}")
ENV_FILE = Path(__file__).resolve().parents[3].parent / "Claude-Memory" / "API-KEYS.env"
HERE = Path(__file__).parent
TEMPLATES_DIR = HERE / "templates"
SUBMITTED_LOG = HERE / "submitted.json"


def load_token():
    if not ENV_FILE.exists():
        sys.exit(f"Credentials file not found: {ENV_FILE}")
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        if line.startswith("META_ACCESS_TOKEN="):
            return line.split("=", 1)[1].strip()
    sys.exit("META_ACCESS_TOKEN not found in API-KEYS.env")


def submit_template(token: str, payload: dict) -> dict:
    url = f"{GRAPH_BASE_URL}/{GRAPH_VERSION}/{WABA_ID}/message_templates"
    data = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with request.urlopen(req, timeout=30) as resp:
            return {"ok": True, "status": resp.status, "body": json.loads(resp.read())}
    except error.HTTPError as e:
        return {"ok": False, "status": e.code, "body": json.loads(e.read())}
    except Exception as e:
        return {"ok": False, "status": 0, "body": {"error": str(e)}}


def main():
    token = load_token()
    files = ["d0.json", "d5.json", "d7.json"]
    results = []
    for fname in files:
        path = TEMPLATES_DIR / fname
        payload = json.loads(path.read_text(encoding="utf-8"))
        name = payload["name"]
        print(f"\n→ Submitting {name} ...")
        res = submit_template(token, payload)
        print(f"  HTTP {res['status']}")
        print(f"  Response: {json.dumps(res['body'], indent=2)}")
        results.append({"template_file": fname, "template_name": name, **res})

    SUBMITTED_LOG.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"\n✓ Audit log written: {SUBMITTED_LOG}")

    ok_count = sum(1 for r in results if r["ok"])
    print(f"\n{ok_count}/{len(results)} templates submitted successfully.")
    if ok_count < len(results):
        sys.exit(1)


if __name__ == "__main__":
    main()
