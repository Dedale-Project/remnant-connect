import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { toolValue } from "../remote-mcp/client.js";

export type FeedbackClient = Pick<Client, "callTool" | "listTools">;
export type Observation = {
  outcome: "success" | "failure" | "partial" | "uncertain";
  reason: string;
  useful?: boolean;
  corroborate?: boolean;
  contradict?: boolean;
};
export type PendingFeedback = {
  version: 1;
  memoryId: string;
  agentPublicId: string;
  before: Record<string, unknown>;
  operations: ReadonlyArray<Readonly<Record<string, unknown>>>;
};
export type FeedbackOptions = {
  /** Persist before the first write. Keep this queue private to the operator. */
  persistPending?: (pending: PendingFeedback) => Promise<void>;
  /** Check authoritative counters, including an anonymous read when public. */
  verifyReadback?: (before: Record<string, unknown>, after: Record<string, unknown>) => Promise<boolean>;
};

/** Payload variants follow the currently advertised REST contract. No inferred success. */
export function prepareFeedback(memoryId: string, agentPublicId: string, before: Record<string, unknown>,
  observation: Observation, operationKey: string): PendingFeedback {
  if (!memoryId || !agentPublicId || !operationKey || operationKey.length > 180)
    throw new Error("A memory, intended Agent ID and stable operation key (at most 180 characters) are required.");
  if (!["success", "failure", "partial", "uncertain"].includes(observation.outcome)
      || typeof observation.reason !== "string" || observation.reason.trim().length < 20 || observation.reason.length > 1000)
    throw new Error("An observed outcome and a specific reason of 20–1000 characters are required.");
  for (const flag of ["useful", "corroborate", "contradict"] as const)
    if (observation[flag] !== undefined && typeof observation[flag] !== "boolean")
      throw new Error("Feedback flags must be booleans when supplied.");
  if (observation.corroborate && observation.contradict)
    throw new Error("One observation cannot simultaneously corroborate and contradict.");
  const operations: Record<string, unknown>[] = [{ memoryId, outcome: observation.outcome,
    actualAttempt: true, reason: observation.reason, idempotencyKey: operationKey + ":report" }];
  // The existing contract is a union: it rejects useful/corroborate booleans on an outcome.
  // These dimensions remain separate operations; this client cannot make them atomic.
  if (observation.useful !== undefined) operations.push({ memoryId,
    type: observation.useful ? "useful" : "not_useful", reason: observation.reason,
    idempotencyKey: operationKey + ":utility" });
  if (observation.corroborate || observation.contradict) operations.push({ memoryId,
    type: observation.corroborate ? "corroborate" : "contradict", reason: observation.reason,
    idempotencyKey: operationKey + ":validation" });
  // Snapshot all nested input; caller mutation cannot change a retry payload.
  return JSON.parse(JSON.stringify({ version: 1, memoryId, agentPublicId, before, operations }));
}

/** Resume only feedback, never the actual attempt. Host OAuth remains outside these arguments. */
export async function resumeFeedback(client: FeedbackClient, pending: PendingFeedback, options: FeedbackOptions = {}) {
  const waiting = (reason: string, extra: Record<string, unknown> = {}) =>
    ({ status: "FEEDBACK_PENDING" as const, reason, pending, ...extra });
  try { await options.persistPending?.(pending); }
  catch { return waiting("PERSISTENCE_UNAVAILABLE"); }
  const acknowledgements: Record<string, unknown>[] = [];
  let writing = false;
  try {
    const identity = toolValue(await client.callTool({ name: "get_my_identity", arguments: {} }));
    if (identity.authenticated !== true) return waiting("AUTH_REQUIRED");
    if (identity.publicId !== pending.agentPublicId) return waiting("IDENTITY_CHANGED");
    if (!Array.isArray(identity.scopes) || !identity.scopes.includes("memory:feedback"))
      return waiting("FRESH_CONSENT_REQUIRED");
    const { tools } = await client.listTools();
    const tool = tools.find(tool => tool.name === "feedback_memory");
    if (!tool) return waiting("TOOL_UNAVAILABLE");
    const fields = (schema: Record<string, unknown>): string[] => [
      ...Object.keys((schema.properties ?? {}) as object),
      ...["anyOf", "oneOf", "allOf"].flatMap(key => Array.isArray(schema[key])
        ? (schema[key] as Record<string, unknown>[]).flatMap(fields) : []) ];
    const supported = new Set(fields(tool.inputSchema as Record<string, unknown>));
    if (pending.operations.some(args => Object.keys(args).some(key => !supported.has(key))))
      return waiting("SCHEMA_UNSUPPORTED");
    for (const args of pending.operations) {
      writing = true;
      acknowledgements.push(toolValue(await client.callTool({ name: "feedback_memory", arguments: args })));
    }
    const after = toolValue(await client.callTool({ name: "get_memory_evidence", arguments: { memoryId: pending.memoryId } }));
    if (!options.verifyReadback || !await options.verifyReadback(pending.before, after))
      return waiting("COUNTERS_UNVERIFIED", { acknowledgements, after });
    return { status: "FEEDBACK_RECORDED" as const, pending, acknowledgements, after };
  } catch {
    // Do not expose raw host errors, which can include headers or credentials.
    // A timeout after any write has an unknown outcome. Replay with the original keys.
    return waiting(writing ? "WRITE_OR_READBACK_UNCONFIRMED" : "AUTH_OR_CATALOG_UNAVAILABLE", { acknowledgements });
  }
}
