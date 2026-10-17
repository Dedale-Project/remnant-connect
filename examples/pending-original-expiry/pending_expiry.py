"""Synthetic contract comparison; no network, real provider, or third-party code."""
import json


def run(name, retry_at=None, retain_inflight=False):
    jobs, reservation, trace = [], {}, []
    identity = ("acct1", "mock", "K", "P")  # identical key/scope/payload

    def submit(t):
        prior = reservation.get(identity)
        protected = prior and (
            t < prior["expires"] or (retain_inflight and not prior["done"])
        )
        if protected:
            trace.append({"tick": t, "oracle": "deduplicated", "id": prior["id"]})
            return prior
        job = dict(id=f"op-A{len(jobs) + 1}", commit=3 if not jobs else t + 2,
                   expires=t + 2, done=False)
        jobs.append(job)
        reservation[identity] = job
        trace.append({"tick": t, "oracle": "queued", "id": job["id"]})
        return job

    original = submit(0)  # handle saved from acceptance; completion response times out
    trace.append({"tick": 0, "client": "op-A1 saved; completion timeout"})
    effects_at_receipt, receipt = None, None
    for t in range(1, 5):
        for job in jobs:  # drain provider events even after the client stops at tick3
            if job["commit"] == t and not job["done"]:
                job["done"] = True
                trace.append({"tick": t, "oracle": "effect", "id": job["id"]})
        if t == 1:
            trace.append({"tick": t, "client": "op-A1 pending"})
        if t == 2:
            trace.append({"tick": t, "client": "status read failed; last known pending"})
        if t == retry_at:
            submit(t)  # unsafe comparison at expiry; replay response is lost
            trace.append({"tick": t, "client": "same K/P/scope submitted; response lost"})
        if t == 3:
            receipt = "op-A1 succeeded" if original["done"] else "op-A1 pending"
            effects_at_receipt = sum(j["done"] for j in jobs)
            trace.append({"tick": t, "client": receipt + "; client stops"})
    return dict(case=name, receipt=receipt, effects_at_receipt=effects_at_receipt,
                historical_effects=sum(j["done"] for j in jobs), trace=trace)


results = [run("hold_after_expiry"), run("replay_at_expiry", 2),
           run("replay_within_window", 1), run("retain_pending_reservation", 2, True)]
assert [r["historical_effects"] for r in results] == [1, 2, 1, 1]
assert all(r["receipt"] == "op-A1 succeeded" and r["effects_at_receipt"] == 1
           for r in results)
print(json.dumps({"classification": "operator_synthetic_fixture", "results": results}, indent=2))
