import { readFile, readdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import type { SessionUsage } from "../types/session.js";
import type { ParsedTranscript } from "../types/transcript.js";
import { OpenAIPricingService } from "./openai-pricing.js";

interface CodexSessionIndexEntry {
  id: string;
  thread_name?: string;
  updated_at?: string;
}

interface TokenUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

interface CodexLine {
  timestamp?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

export interface CodexReceiptData {
  sessionData: SessionUsage;
  transcriptData: ParsedTranscript;
  transcriptPath: string;
}

export class CodexDataFetcher {
  private codexDir: string;
  private sessionIndexPath: string;
  private sessionsDir: string;
  private archivedSessionsDir: string;
  private pricingService = new OpenAIPricingService();

  constructor() {
    const home = process.env.HOME || process.env.USERPROFILE || "";
    this.codexDir = join(home, ".codex");
    this.sessionIndexPath = join(this.codexDir, "session_index.jsonl");
    this.sessionsDir = join(this.codexDir, "sessions");
    this.archivedSessionsDir = join(this.codexDir, "archived_sessions");
  }

  async fetchReceiptData(sessionQuery?: string): Promise<CodexReceiptData> {
    const entry = await this.resolveSessionIndexEntry(sessionQuery);
    const transcriptPath = await this.resolveTranscriptPath(entry.id);
    const lines = await this.readJsonLines(transcriptPath);

    const transcriptData = this.buildTranscriptData(lines, entry);
    const sessionData = await this.buildSessionData(lines, entry.id);

    return {
      sessionData,
      transcriptData,
      transcriptPath,
    };
  }

  private async resolveSessionIndexEntry(
    sessionQuery?: string,
  ): Promise<CodexSessionIndexEntry> {
    if (!existsSync(this.sessionIndexPath)) {
      throw new Error(`Codex session index not found: ${this.sessionIndexPath}`);
    }

    const entries = await this.readSessionIndexEntries();
    if (entries.length === 0) {
      throw new Error("No Codex sessions found in session index");
    }

    const sorted = entries
      .slice()
      .sort((a, b) => this.getTimeValue(b.updated_at) - this.getTimeValue(a.updated_at));

    if (!sessionQuery) {
      return sorted[0];
    }

    const query = sessionQuery.trim();
    const lowerQuery = query.toLowerCase();

    const exactId = sorted.find((e) => e.id === query);
    if (exactId) {
      return exactId;
    }

    const prefixId = sorted.find((e) => e.id.startsWith(query));
    if (prefixId) {
      return prefixId;
    }

    const byThreadName = sorted.find((e) =>
      (e.thread_name || "").toLowerCase().includes(lowerQuery),
    );
    if (byThreadName) {
      return byThreadName;
    }

    const available = sorted
      .slice(0, 10)
      .map((e) => `  ${e.id.slice(0, 8)}  ${e.thread_name || "(untitled)"}`)
      .join("\n");

    throw new Error(
      `No Codex session matching "${sessionQuery}". Available sessions:\n${available}`,
    );
  }

  private async readSessionIndexEntries(): Promise<CodexSessionIndexEntry[]> {
    const raw = await readFile(this.sessionIndexPath, "utf-8");

    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CodexSessionIndexEntry)
      .filter((entry) => !!entry.id);
  }

  private async resolveTranscriptPath(sessionId: string): Promise<string> {
    const fromSessions = await this.findSessionFileById(this.sessionsDir, sessionId, 4);
    if (fromSessions) {
      return fromSessions;
    }

    const fromArchive = await this.findSessionFileById(
      this.archivedSessionsDir,
      sessionId,
      1,
    );
    if (fromArchive) {
      return fromArchive;
    }

    throw new Error(`Could not locate Codex transcript file for session ${sessionId}`);
  }

  private async findSessionFileById(
    rootDir: string,
    sessionId: string,
    maxDepth: number,
  ): Promise<string | undefined> {
    if (!existsSync(rootDir)) {
      return undefined;
    }

    const stack: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;

      const entries = await readdir(current.dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(current.dir, entry.name);

        if (entry.isFile() && entry.name.endsWith(`${sessionId}.jsonl`)) {
          return fullPath;
        }

        if (entry.isDirectory() && current.depth < maxDepth) {
          stack.push({ dir: fullPath, depth: current.depth + 1 });
        }
      }
    }

    return undefined;
  }

  private async readJsonLines(path: string): Promise<CodexLine[]> {
    const raw = await readFile(path, "utf-8");

    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CodexLine);
  }

  private buildTranscriptData(
    lines: CodexLine[],
    entry: CodexSessionIndexEntry,
  ): ParsedTranscript {
    const userMessages = lines.filter(
      (line) => line.type === "event_msg" && line.payload?.type === "user_message",
    );
    const assistantMessages = lines.filter(
      (line) => line.type === "event_msg" && line.payload?.type === "agent_message",
    );

    const timestamps = lines
      .map((line) => (line.timestamp ? new Date(line.timestamp) : null))
      .filter((v): v is Date => !!v && !isNaN(v.getTime()));

    const firstUserMessage = userMessages[0]?.payload?.message;
    const firstPrompt = this.truncateText(
      typeof firstUserMessage === "string" ? firstUserMessage : "No prompt available",
      100,
    );
    return {
      sessionSlug: entry.thread_name || entry.id,
      firstPrompt,
      startTime: timestamps[0] || new Date(),
      endTime: timestamps[timestamps.length - 1] || new Date(),
      userMessageCount: userMessages.length,
      assistantMessageCount: assistantMessages.length,
      totalMessages: userMessages.length + assistantMessages.length,
    };
  }

  private async buildSessionData(
    lines: CodexLine[],
    sessionId: string,
  ): Promise<SessionUsage> {
    const tokenUsages = lines
      .filter(
        (line) =>
          line.type === "event_msg" &&
          line.payload?.type === "token_count" &&
          !!line.payload?.info,
      )
      .map((line) => line.payload?.info as Record<string, unknown>)
      .map((info) => info.total_token_usage as TokenUsage | undefined)
      .filter((usage): usage is TokenUsage => !!usage);

    const latestUsage = tokenUsages[tokenUsages.length - 1];

    const inputTokens = latestUsage?.input_tokens || 0;
    const cacheReadTokens = latestUsage?.cached_input_tokens || 0;
    const outputTokens = latestUsage?.output_tokens || 0;
    const totalTokens =
      latestUsage?.total_tokens || inputTokens + outputTokens + cacheReadTokens;

    const model = this.detectModel(lines);
    const price = model ? await this.pricingService.getModelPrice(model) : null;
    const estimatedCost = price
      ? this.calculateEstimatedCost({
          inputTokens,
          cacheReadTokens,
          outputTokens,
          inputRate: price.input,
          cachedInputRate: price.cachedInput,
          outputRate: price.output,
        })
      : 0;

    return {
      sessionId,
      inputTokens,
      outputTokens,
      cacheCreationTokens: 0,
      cacheReadTokens,
      totalTokens,
      totalCost: estimatedCost,
      costStatus: price ? "estimated_api" : "unavailable",
      modelsUsed: model ? [model] : [],
      modelBreakdowns: model
        ? [
            {
              modelName: model,
              inputTokens,
              outputTokens,
              cacheCreationTokens: 0,
              cacheReadTokens,
              cost: estimatedCost,
            },
          ]
        : [],
    };
  }

  private calculateEstimatedCost(params: {
    inputTokens: number;
    cacheReadTokens: number;
    outputTokens: number;
    inputRate: number;
    cachedInputRate: number;
    outputRate: number;
  }): number {
    const million = 1_000_000;
    return (
      (params.inputTokens * params.inputRate +
        params.cacheReadTokens * params.cachedInputRate +
        params.outputTokens * params.outputRate) /
      million
    );
  }

  private detectModel(lines: CodexLine[]): string | undefined {
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line.type !== "turn_context") continue;
      const model = line.payload?.model;
      if (typeof model === "string" && model.length > 0) {
        return model;
      }
    }

    return undefined;
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, maxLength).trim()}...`;
  }

  private getTimeValue(iso?: string): number {
    if (!iso) return 0;
    const value = new Date(iso).getTime();
    return Number.isFinite(value) ? value : 0;
  }
}
