export interface ModelBreakdown {
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  cost: number;
}

export interface SessionUsage {
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  totalTokens: number;
  totalCost: number;
  costStatus?: "exact" | "estimated_api" | "unavailable";
  lastActivity?: string;
  modelsUsed?: string[];
  modelBreakdowns?: ModelBreakdown[];
}
