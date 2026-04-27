interface ModelPrice {
  input: number;
  cachedInput: number;
  output: number;
}

type PriceTable = Record<string, ModelPrice>;

const PRICING_URL = "https://developers.openai.com/api/docs/pricing";

// Fallback table (USD per 1M tokens), aligned to current public docs defaults.
const FALLBACK_PRICES: PriceTable = {
  "gpt-5.3-codex": { input: 1.75, cachedInput: 0.175, output: 14.0 },
  "gpt-5.4": { input: 2.5, cachedInput: 0.25, output: 15.0 },
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
  "gpt-5.5": { input: 5.0, cachedInput: 0.5, output: 30.0 },
};

export class OpenAIPricingService {
  private cachedPrices: PriceTable | null = null;

  async getModelPrice(model: string): Promise<ModelPrice | null> {
    const prices = await this.getPrices();
    return this.lookupModelPrice(prices, model);
  }

  private async getPrices(): Promise<PriceTable> {
    if (this.cachedPrices) {
      return this.cachedPrices;
    }

    try {
      const response = await fetch(PRICING_URL, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        this.cachedPrices = FALLBACK_PRICES;
        return this.cachedPrices;
      }

      const raw = await response.text();
      const parsed = this.parsePriceTable(raw);

      this.cachedPrices =
        Object.keys(parsed).length > 0
          ? { ...FALLBACK_PRICES, ...parsed }
          : FALLBACK_PRICES;

      return this.cachedPrices;
    } catch {
      this.cachedPrices = FALLBACK_PRICES;
      return this.cachedPrices;
    }
  }

  private parsePriceTable(raw: string): PriceTable {
    const table: PriceTable = {};

    // Matches rows like: gpt-5.3-codex$1.75$0.175$14.00
    const rowPattern =
      /(gpt-[a-z0-9.-]+)\$([0-9]+(?:\.[0-9]+)?)\$(?:([0-9]+(?:\.[0-9]+)?)|-)\$([0-9]+(?:\.[0-9]+)?)/gi;

    for (const match of raw.matchAll(rowPattern)) {
      const model = match[1].toLowerCase();
      const input = Number.parseFloat(match[2]);
      const cachedInput = match[3] ? Number.parseFloat(match[3]) : 0;
      const output = Number.parseFloat(match[4]);

      if (
        Number.isFinite(input) &&
        Number.isFinite(cachedInput) &&
        Number.isFinite(output)
      ) {
        table[model] = { input, cachedInput, output };
      }
    }

    return table;
  }

  private lookupModelPrice(prices: PriceTable, model: string): ModelPrice | null {
    const key = model.toLowerCase();

    if (prices[key]) {
      return prices[key];
    }

    // Graceful fallback for versioned model aliases.
    if (key.startsWith("gpt-5.3-codex") && prices["gpt-5.3-codex"]) {
      return prices["gpt-5.3-codex"];
    }
    if (key.startsWith("gpt-5.4-mini") && prices["gpt-5.4-mini"]) {
      return prices["gpt-5.4-mini"];
    }
    if (key.startsWith("gpt-5.4") && prices["gpt-5.4"]) {
      return prices["gpt-5.4"];
    }
    if (key.startsWith("gpt-5.5") && prices["gpt-5.5"]) {
      return prices["gpt-5.5"];
    }

    return null;
  }
}
