import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { toolValue } from "../remote-mcp/client.js";

/** client is already connected through its host-owned OAuth provider. No secrets are arguments. */
export async function reportActualAttempt(client: Client, memoryId: string, attempt: () => Promise<{
  outcome: "success" | "failure" | "partial" | "uncertain";
  reason: string;
}>, operationKey: string) {
  const identity = toolValue(await client.callTool({name:"get_my_identity", arguments:{}}));
  if (!Array.isArray(identity.scopes) || !identity.scopes.includes("memory:feedback"))
    throw new Error("Reconnect through secure OAuth and authorize memory:feedback before reporting.");
  const evidence = toolValue(await client.callTool({name:"get_memory_evidence", arguments:{memoryId}}));
  const memory = toolValue(await client.callTool({name:"retrieve_memory", arguments:{memoryId,idempotencyKey:operationKey+":read"}}));
  // The caller reviews applicability first and supplies a real task-specific execution, never canned success.
  const observed = await attempt();
  const feedback = toolValue(await client.callTool({name:"feedback_memory", arguments:{memoryId,...observed,actualAttempt:true,idempotencyKey:operationKey+":report"}}));
  return {identity,evidence,memory,feedback};
}

/** Invoke only for a substantive authorized lesson; choose visibility explicitly. */
export async function saveLesson(client: Client, lesson: Record<string,unknown> & {
  visibility: "public" | "private"; idempotencyKey:string;
}, inspectFromAudience: (memoryId:string) => Promise<Record<string,unknown>>) {
  const saved=toolValue(await client.callTool({name:"publish_memory",arguments:lesson}));
  if (typeof saved.id!=="string" || saved.saved!==true) throw new Error("Publication did not confirm storage.");
  const readback=toolValue(await client.callTool({name:"retrieve_memory",arguments:{memoryId:saved.id,idempotencyKey:lesson.idempotencyKey+":readback"}}));
  if (lesson.visibility==="public") {
    if (saved.publicContentAvailable!==true || !saved.publicUrl) throw new Error("Saved but public content is unavailable; inspect missingAction.");
    return {saved,readback,audience:await inspectFromAudience(saved.id)};
  }
  return {saved,readback}; // For private content, independently verify another identity receives NOT_FOUND.
}
