import sys, time
sys.path.insert(0, "apps/server")
from guardloop import store
from app import create_app
a = create_app()
c = a.test_client()
print("mode:", c.get("/api/mode").json, flush=True)
r = c.post("/api/scans", json={"target": "http://127.0.0.1:5001", "authorization": True, "seed": 42})
print("scan:", r.json, flush=True)
sid = r.json["id"]
time.sleep(18)
s = c.get(f"/api/scans/{sid}").json
print("status:", s["status"], flush=True)
for f in s["findings"]:
    print(f["id"], f["status"], "att:", f["attempts"], "repro:", f["reproducibility"], "fixes:", len(f["fixes"]), flush=True)
print("metrics:", s["metrics"], flush=True)
evs = store.events_since(sid, 0)
types = sorted(set(e["type"] for e in evs))
print("event types:", types, flush=True)
print("loopback present:", "loopback" in types, flush=True)
rb = c.post("/api/scans", json={"target": "http://evil.com:5001/x", "authorization": True})
print("evil scan:", rb.json, flush=True)
time.sleep(3)
se = c.get(f"/api/scans/{rb.json['id']}").json
print("evil status:", se["status"], flush=True)
ee = store.events_since(rb.json["id"], 0)
print("evil events:", [(e["type"], e["message"][:60]) for e in ee], flush=True)
