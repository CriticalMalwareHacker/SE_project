"""Smoke: boot target + server, run mock scan, check story + web serves."""
import subprocess, sys, time, os
import urllib.request, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = r"C:\Python313\python.exe"
env = dict(os.environ, TARGET_ADMIN_TOKEN="change-me")

procs = []
procs.append(subprocess.Popen([PY, "apps/target/app.py"], cwd=ROOT, env=env,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
procs.append(subprocess.Popen([PY, "apps/server/app.py"], cwd=ROOT, env=env,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
try:
    def wait(url, timeout=25):
        t0 = time.time()
        while time.time() - t0 < timeout:
            try:
                urllib.request.urlopen(url, timeout=2)
                return True
            except Exception:
                time.sleep(0.5)
        return False
    assert wait("http://127.0.0.1:5001/health"), "target did not boot"
    assert wait("http://127.0.0.1:5000/health"), "server did not boot"
    mode = json.load(urllib.request.urlopen("http://127.0.0.1:5000/api/mode"))
    print("mode:", mode)
    req = urllib.request.Request("http://127.0.0.1:5000/api/scans",
                                 data=json.dumps({"target": "http://127.0.0.1:5001",
                                                  "authorization": True, "seed": 42}).encode(),
                                 headers={"Content-Type": "application/json"})
    sid = json.load(urllib.request.urlopen(req))["id"]
    print("scan:", sid)
    deadline = time.time() + 60
    state = {}
    while time.time() < deadline:
        time.sleep(3)
        state = json.load(urllib.request.urlopen(f"http://127.0.0.1:5000/api/scans/{sid}"))
        if state["status"] == "Completed":
            break
    print("status:", state["status"])
    by_status: dict = {}
    for f in state["findings"]:
        by_status[f["status"]] = by_status.get(f["status"], 0) + 1
        print(f["id"], f["status"], "attempts:", f["attempts"])
    assert state["status"] == "Completed", state["status"]
    assert by_status.get("Reported", 0) >= 3, by_status
    assert by_status.get("Rejected", 0) >= 1, by_status
    assert by_status.get("Fix Failed", 0) >= 1, by_status
    lb = [e for e in state.get("findings", []) if any("Retesting" in h for h in e.get("history", []))]
    assert lb, "no loop-back in histories"
    print("SMOKE OK:", by_status)
finally:
    for p in procs:
        p.kill()
