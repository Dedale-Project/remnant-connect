"""Offline Python CLI help and synthetic query-routing checks; no uv run."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch


READER = Path(__file__).resolve().with_name("remnant_read.py")
CHILD = r'''
import json
import runpy
import sys

events = []
def audit(event, args):
    if event.startswith("socket.") or (
        event == "import"
        and args[0].split(".")[0] in ("pydantic_ai", "fastmcp", "httpx", "httpx2")
    ):
        events.append(event)
        raise AssertionError("CLI help reached SDK/network boundary")

sys.addaudithook(audit)
source, *options = sys.argv[1:]
sys.argv = [source, *options]
try:
    runpy.run_path(source, run_name="__main__")
finally:
    print("BOUNDARY=" + json.dumps(events), file=sys.stderr)
'''


class CliHelpTests(unittest.TestCase):
    def check_entry(self, options, expected_exit):
        result = subprocess.run(
            [sys.executable, "-I", "-S", "-B", "-c", CHILD, str(READER), *options],
            capture_output=True, text=True, timeout=15,
        )
        self.assertEqual(result.returncode, expected_exit, result.stderr)
        self.assertEqual(result.stderr.splitlines()[-1], "BOUNDARY=[]")
        if expected_exit == 0:
            self.assertIn("usage:", result.stdout)
            self.assertIn("Help does not", result.stdout)
            self.assertIn("-- before a query", result.stdout)
        else:
            self.assertEqual(result.stdout, "")
            self.assertIn("unrecognized arguments", result.stderr)

    def test_long_help_does_not_import_sdk_or_open_socket(self):
        self.check_entry(["--help"], 0)

    def test_short_help_does_not_import_sdk_or_open_socket(self):
        self.check_entry(["-h"], 0)

    def test_unknown_option_stops_before_read(self):
        self.check_entry(["--unknown-option"], 2)

    def check_route(self, options, expected):
        spec = importlib.util.spec_from_file_location("help_test_reader", READER)
        reader = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(reader)
        original_read, original_run = reader.first_read, reader.asyncio.run
        captured = []

        async def local_read(query):
            captured.append(query)
            return {"fixture": "synthetic-query-routing-only", "query": query}

        # The immediate stub needs no event loop or Windows loopback socketpair.
        def run_local(coroutine):
            try:
                coroutine.send(None)
            except StopIteration as result:
                return result.value
            finally:
                coroutine.close()
            raise AssertionError("Unexpected coroutine suspension")

        output = io.StringIO()
        with patch.object(reader, "first_read", local_read), \
                patch.object(reader.asyncio, "run", side_effect=run_local) as run, \
                contextlib.redirect_stdout(output):
            reader.main(options)
            run.assert_called_once()
        self.assertIs(reader.first_read, original_read)
        self.assertIs(reader.asyncio.run, original_run)
        self.assertEqual(captured, [expected])
        self.assertEqual(json.loads(output.getvalue()), {
            "fixture": "synthetic-query-routing-only", "query": expected,
        })

    def test_default_query_route(self):
        self.check_route([], "SQLite stale snapshot retry")

    def test_joined_query_route(self):
        self.check_route(["SQLite", "stale", "snapshot"], "SQLite stale snapshot")

    def test_literal_option_query_after_separator(self):
        self.check_route(["--", "--help"], "--help")


if __name__ == "__main__":
    unittest.main()
