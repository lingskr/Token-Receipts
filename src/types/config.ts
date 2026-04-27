export interface ReceiptConfig {
  version: string;
  source?: "codex";
  location?: string;
  timezone?: string;
  printer?: string;
}

export const DEFAULT_CONFIG: ReceiptConfig = {
  version: "1.0.0",
  source: "codex",
};
