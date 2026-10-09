"""Synthetic local fixture only. No network, credentials, or real business data."""
import json
import os
import sqlite3

CRASH_EXIT = 75


class Conflict(Exception):
    pass


def connect(path):
    db = sqlite3.connect(path, isolation_level=None, timeout=2)
    db.execute("PRAGMA journal_mode=DELETE")
    db.execute("PRAGMA synchronous=FULL")
    db.executescript("""
        CREATE TABLE IF NOT EXISTS effects (
            id INTEGER PRIMARY KEY, tenant TEXT NOT NULL,
            request_key TEXT NOT NULL, units INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS receipts (
            tenant TEXT NOT NULL, request_key TEXT NOT NULL,
            fingerprint TEXT NOT NULL, response TEXT NOT NULL,
            PRIMARY KEY (tenant, request_key)
        );
    """)
    return db


def validate(request):
    if set(request) != {"tenant", "key", "units"}:
        raise ValueError("expected exactly tenant, key and units")
    if not all(isinstance(request[k], str) and 0 < len(request[k]) <= 100
               for k in ("tenant", "key")):
        raise ValueError("tenant and key must be nonempty bounded strings")
    if type(request["units"]) is not int or not 0 < request["units"] <= 1000:
        raise ValueError("units must be an integer from 1 to 1000")


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def crash_if(selected, point):
    if selected == point:
        # Abrupt child-process termination: no Python finally block or cleanup.
        os._exit(CRASH_EXIT)
