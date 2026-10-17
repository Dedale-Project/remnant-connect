"""Dependency-free source-function fixtures; NOT native framework compatibility.

LangGraph/AutoGen/AgentMind functions are compiled from their actual source AST,
without optional framework imports or decorators. HTTP and cancellation objects
are inert doubles. Pydantic's module is imported, but its MCPToolset is replaced.
These tests deliberately cannot establish framework registration or SDK behavior.
"""
import ast
import asyncio
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
import unittest

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[1]
CASES = json.loads((ROOT / "test/fixtures/adapter-compatibility-v1.json").read_text(encoding="utf-8"))
PATHS = {name: ROOT / f"examples/{name}-remnant/remnant_read.py" for name in ("langgraph", "autogen", "agentmind")}


def source_functions(path):
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    body = [ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0)]
    for item in tree.body:
        if isinstance(item, (ast.Import, ast.ImportFrom)):
            module = item.module if isinstance(item, ast.ImportFrom) else item.names[0].name
            if module in {"asyncio", "hashlib", "json", "re", "sys", "datetime", "typing"}:
                body.append(item)
        elif isinstance(item, ast.Assign) and all(isinstance(t, ast.Name) and t.id.isupper() for t in item.targets):
            body.append(item)
        elif isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
            item.decorator_list = []
            body.append(item)
    namespace = {"__name__": "source_function_fixture"}
    exec(compile(ast.fix_missing_locations(ast.Module(body=body, type_ignores=[])), str(path), "exec"), namespace)
    return namespace


class Response:
    def __init__(self, payload, failure=False):
        self.payload, self.failure = payload, failure
    def __enter__(self): return self
    def __exit__(self, *_): pass
    async def __aenter__(self): return self
    async def __aexit__(self, *_): pass
    def raise_for_status(self):
        if self.failure: raise RuntimeError("synthetic HTTP error")
    def json(self): return self.payload
    def iter_bytes(self): yield json.dumps(self.payload, ensure_ascii=False).encode("utf-8")
    async def aiter_bytes(self):
        for chunk in self.iter_bytes(): yield chunk


class HttpFixture:
    def __init__(self, payload, failure=False):
        self.calls = 0
        self.response = Response(payload, failure)
    def Client(self, **_): return self
    def AsyncClient(self, **_): return self
    def __enter__(self): return self
    def __exit__(self, *_): pass
    async def __aenter__(self): return self
    async def __aexit__(self, *_): pass
    def stream(self, method, url, **_):
        assert method == "GET" and url.startswith("https://remnant.dedale-bi.com/api/public/knowledge/")
        self.calls += 1
        return self.response
    async def get(self, url): return self.stream("GET", url)


class CancellationFixture:
    def __init__(self, cancelled=False): self.cancelled, self.future = cancelled, None
    def is_cancelled(self): return self.cancelled
    def link_future(self, future): self.future = future
    def cancel(self):
        self.cancelled = True
        if self.future: self.future.cancel()


class SourceFunctionTests(unittest.TestCase):
    def invoke(self, framework, namespace, memory_id):
        if framework == "langgraph": return namespace["read_public_experience"](memory_id)
        if framework == "autogen": return asyncio.run(namespace["read_public_experience"](memory_id, CancellationFixture()))
        return asyncio.run(namespace["remnant_public_experience"](memory_id))

    def test_ids_unicode_identity_and_http_failure(self):
        for framework, path in PATHS.items():
            namespace = source_functions(path)
            for memory_id in CASES["memoryIds"]:
                with self.subTest(framework=framework, memory_id=memory_id):
                    http = HttpFixture({"id": memory_id, "insight": CASES["unicode"]})
                    namespace["httpx"] = http
                    self.assertEqual(self.invoke(framework, namespace, memory_id)["evidence"]["insight"], CASES["unicode"])
                    self.assertEqual(http.calls, 1)
                    namespace["httpx"] = HttpFixture({"id": CASES["wrongIdentity"], "insight": CASES["unicode"]})
                    with self.assertRaises(ValueError): self.invoke(framework, namespace, memory_id)
                    namespace["httpx"] = HttpFixture({}, failure=True)
                    with self.assertRaises(RuntimeError): self.invoke(framework, namespace, memory_id)
            for memory_id in CASES["invalidMemoryIds"]:
                with self.subTest(framework=framework, invalid=memory_id):
                    http = HttpFixture({})
                    namespace["httpx"] = http
                    with self.assertRaises(ValueError): self.invoke(framework, namespace, memory_id)
                    self.assertEqual(http.calls, 0)

    def test_cli_json_expressions_are_ascii_safe_and_preserve_unicode(self):
        for framework, path in PATHS.items():
            tree = ast.parse(path.read_text(encoding="utf-8"))
            calls = [node for node in ast.walk(tree) if isinstance(node, ast.Call)
                     and isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name)
                     and node.func.value.id == "json" and node.func.attr == "dumps"]
            self.assertEqual(len(calls), 1, framework)
            # Execute the production serialization expression, not a native CLI/tool.
            text = eval(compile(ast.Expression(calls[0]), str(path), "eval"), {"json": json, "result": {"insight": CASES["unicode"]}})
            self.assertEqual(json.loads(text.encode("cp1252").decode("cp1252"))["insight"], CASES["unicode"])

    def test_autogen_source_cancellation_before_and_during_fetch(self):
        namespace = source_functions(PATHS["autogen"])
        async def run():
            calls = 0
            started = asyncio.Event()
            async def held(_):
                nonlocal calls
                calls += 1
                started.set()
                await asyncio.Event().wait()
            namespace["_fetch"] = held
            with self.assertRaises(asyncio.CancelledError):
                await namespace["read_public_experience"](CASES["memoryIds"][0], CancellationFixture(True))
            self.assertEqual(calls, 0)
            token = CancellationFixture()
            task = asyncio.create_task(namespace["read_public_experience"](CASES["memoryIds"][0], token))
            await started.wait()
            token.cancel()
            with self.assertRaises(asyncio.CancelledError): await task
            self.assertEqual(calls, 1)
        asyncio.run(run())


spec = importlib.util.spec_from_file_location("pydantic_adapter_fixture", ROOT / "examples/pydantic-remnant/remnant_read.py")
pydantic_adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pydantic_adapter)


class PydanticFixture:
    def __init__(self, search, inspected=None, error=None):
        self.search, self.inspected, self.error, self.calls, self.closed = search, inspected, error, [], 0
    async def __aenter__(self): return self
    async def __aexit__(self, *_): self.closed += 1
    async def list_tools(self): return [SimpleNamespace(name=name) for name in pydantic_adapter.READ_TOOLS]
    async def direct_call_tool(self, name, args):
        self.calls.append(name)
        if self.error: raise self.error
        return self.search if name == "search_memories" else self.inspected


class PydanticAdapterLogicTests(unittest.TestCase):
    def call(self, fixture):
        pydantic_adapter._server = lambda: fixture
        return asyncio.run(pydantic_adapter.first_read("fixture"))

    def test_ids_unicode_and_wrong_identity(self):
        for memory_id in CASES["memoryIds"]:
            with self.subTest(memory_id=memory_id):
                search = {"results": [{"id": memory_id, "contentAccess": {"fullContentAvailable": True}}]}
                fixture = PydanticFixture(search, {"id": memory_id, "insight": CASES["unicode"]})
                self.assertEqual(self.call(fixture)["memory"]["insight"], CASES["unicode"])
                self.assertEqual(fixture.closed, 1)
                wrong = PydanticFixture(search, {"id": CASES["wrongIdentity"]})
                with self.assertRaises(RuntimeError): self.call(wrong)
                self.assertEqual(wrong.closed, 1)

    def test_empty_malformed_and_injected_sdk_errors_are_distinct(self):
        fixture = PydanticFixture(CASES["emptySearch"])
        self.assertEqual(self.call(fixture)["status"], "no_public_match")
        self.assertEqual(fixture.calls, ["search_memories"])
        for malformed in CASES["malformedSearch"]:
            with self.assertRaises(RuntimeError): self.call(PydanticFixture(malformed))
        # The real MCPToolset's conversion of isError is NOT_RUN here.
        error = PydanticFixture(CASES["emptySearch"], error=RuntimeError("injected SDK error"))
        with self.assertRaises(RuntimeError): self.call(error)
        self.assertEqual(error.calls, ["search_memories"])

    def test_injected_cancellation_never_returns_success(self):
        fixture = PydanticFixture(None, error=asyncio.CancelledError())
        with self.assertRaises(asyncio.CancelledError): self.call(fixture)
        self.assertEqual(fixture.closed, 1)
        self.assertEqual(fixture.calls, ["search_memories"])

    def test_help_requires_no_optional_dependencies(self):
        result = subprocess.run([sys.executable, "-I", str(ROOT / "examples/pydantic-remnant/remnant_read.py"), "--help"],
                                capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Help does not", result.stdout)
        self.assertEqual(result.stderr, "")


if __name__ == "__main__": unittest.main(verbosity=2)
