import type { ReceiptData } from "./receipt-generator.js";
import {
  formatCurrency,
  formatNumber,
  formatDateTime,
  formatDuration,
} from "../utils/formatting.js";

// Shareable receipt data structure (matches worker/src/types.ts)
export interface ShareableReceiptData {
  sessionSlug: string;
  location: string;
  sessionDate: string;
  timezone?: string;
  totalCost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  modelBreakdowns: Array<{
    modelName: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
    cost: number;
  }>;
  userMessageCount: number;
  assistantMessageCount: number;
  totalMessages: number;
}

const SHARE_API_URL = "";

export class HtmlRenderer {
  /**
   * Extract shareable data from receipt data (excludes sensitive fields)
   */
  getShareableData(data: ReceiptData): ShareableReceiptData {
    const totalCost = data.sessionData.costStatus === "unavailable"
      ? 0
      : data.sessionData.totalCost;

    return {
      sessionSlug: data.transcriptData.sessionSlug,
      location: data.location,
      sessionDate: data.transcriptData.endTime.toISOString(),
      timezone: data.config.timezone,
      totalCost,
      totalTokens: data.sessionData.totalTokens,
      inputTokens: data.sessionData.inputTokens,
      outputTokens: data.sessionData.outputTokens,
      cacheCreationTokens: data.sessionData.cacheCreationTokens || 0,
      cacheReadTokens: data.sessionData.cacheReadTokens || 0,
      modelBreakdowns: (data.sessionData.modelBreakdowns || []).map((m) => ({
        modelName: m.modelName,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        cacheCreationTokens: m.cacheCreationTokens,
        cacheReadTokens: m.cacheReadTokens,
        cost: m.cost,
      })),
      userMessageCount: data.transcriptData.userMessageCount,
      assistantMessageCount: data.transcriptData.assistantMessageCount,
      totalMessages: data.transcriptData.totalMessages,
    };
  }

  /**
   * Generate HTML receipt with embedded CSS
   */
  generateHtml(data: ReceiptData, receiptText: string): string {
    const shareableData = this.getShareableData(data);
    const canShare = data.sessionData.costStatus !== "unavailable";
    const totalCostText = this.formatTotalCost(data);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Token Receipt - ${data.transcriptData.sessionSlug}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 16px;
      background: #3a3a3a;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .receipt-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 40px;
    }

    .receipt {
      background: #f8f8f8;
      width: 400px;
      padding: 30px 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
      position: relative;
      animation: slideIn 0.5s ease-out;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .receipt::before,
    .receipt::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      height: 15px;
      background: repeating-linear-gradient(
        90deg,
        transparent,
        transparent 10px,
        #f8f8f8 10px,
        #f8f8f8 20px
      );
    }

    .receipt::before {
      top: -15px;
      left: -10px;
    }

    .receipt::after {
      bottom: -15px;
    }

    .receipt-content {
      color: #333;
      line-height: 1.6;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .header {
      text-align: center;
      padding: 20px 0;
    }

    .logo-svg {
      display: block;
      margin: 10px auto;
      width: 132px;
      height: 132px;
    }

    .separator {
      border-bottom: 2px solid #333;
      margin: 15px 0;
    }

    .light-separator {
      border-bottom: 1px dashed #999;
      margin: 10px 0;
    }

    .summary {
      background: #fff;
      padding: 15px;
      margin: 15px 0;
      border-left: 4px solid #333;
    }

    .line-item {
      display: flex;
      justify-content: space-between;
      padding: 3px 0;
      color: #555;
    }

    .model-header {
      display: flex;
      justify-content: space-between;
      padding: 8px 0 4px 0;
      margin-top: 10px;
      border-bottom: 1px dashed #ccc;
    }

    .model-header:first-child {
      margin-top: 0;
    }

    .model-name {
      font-weight: bold;
      color: #333;
    }

    .model-cost {
      font-weight: bold;
      color: #333;
    }

    .total-section {
      margin-top: 20px;
      padding-top: 15px;
      border-top: 2px solid #333;
    }

    .total {
      font-weight: bold;
      display: flex;
      justify-content: space-between;
      margin: 10px 0;
    }

    .footer {
      text-align: center;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 2px dashed #999;
      color: #666;
    }

    .footer-message {
      margin: 15px 0;
      color: #333;
    }

    .meta {
      margin: 10px 0;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .meta-row {
      color: #666;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 1px;
      text-align: left;
    }

    .meta .dots {
      overflow: hidden;
      text-wrap: auto;
      word-wrap: break-word;
      height: 1rem;
    }

    .meta .value {
      text-align: right;
    }

    .download-link {
      text-align: center;
      margin-top: 20px;
    }

    .download-link a {
      display: inline-block;
      padding: 10px 20px;
      background: #333;
      color: white;
      text-decoration: none;
      border-radius: 5px;
      transition: background 0.3s;
    }

    .download-link a:hover {
      background: #000;
    }

    .generated-by {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px dashed #999;
    }

    .share-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }

    .share-btn {
      background: #333;
      color: white;
      border: none;
      padding: 12px 24px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 16px;
      cursor: pointer;
      border-radius: 5px;
      transition: background 0.3s;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .share-btn:hover {
      background: #000;
    }

    .share-btn:disabled {
      background: #666;
      cursor: not-allowed;
    }

    .share-btn.success {
      background: #2d5a27;
    }

    .share-btn.error {
      background: #8b2020;
    }

    .share-result {
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      animation: fadeIn 0.3s ease-out;
    }

    .share-result.visible {
      display: flex;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .share-url {
      background: #f8f8f8;
      padding: 10px 15px;
      border-radius: 5px;
      color: #333;
      word-break: break-all;
      max-width: 400px;
      text-align: center;
    }

    .share-url a {
      color: #333;
      text-decoration: underline;
    }

    .copy-btn {
      background: #333;
      color: white;
      border: none;
      padding: 8px 16px;
      font-family: 'Courier New', Courier, monospace;
      cursor: pointer;
      border-radius: 5px;
      transition: background 0.3s;
    }

    .copy-btn:hover {
      background: #000;
    }

    .copy-btn.copied {
      background: #2d5a27;
    }

    .share-error {
      color: #ff6b6b;
      text-align: center;
      max-width: 350px;
    }

    @media print {
      body {
        background: white;
      }
      .receipt {
        box-shadow: none;
        width: 100%;
      }
      .download-link,
      .share-section {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="receipt-container">
    <div class="receipt">
      <div class="header">
        ${this.renderCodexPixelLogoSvg()}
        <div class="meta">
          <div class="meta-row">
            <div>Location</div><div class="dots">....................</div><div class="value">${this.escapeHtml(data.location)}</div>
          </div>
          <div class="meta-row">
            <div>Session</div><div class="dots">....................</div><div class="value">${this.escapeHtml(data.transcriptData.sessionSlug)}</div>
          </div>
          <div class="meta-row">
            <div>Date</div><div class="dots">....................</div><div class="value">${formatDateTime(data.transcriptData.endTime, data.config.timezone)}</div>
          </div>
        </div>
      </div>

      <div class="separator"></div>

      ${this.renderLineItems(data)}

      <div class="total-section">
        <div class="total">
          <span>TOTAL</span>
          <span>${totalCostText}</span>
        </div>
      </div>

      <div class="footer">
        <div>CASHIER: ${this.getMainModel(data)}</div>
        ${data.sessionData.costStatus === "unavailable" ? '<div style="margin-top: 10px;">COST: unavailable</div>' : ""}
        ${data.sessionData.costStatus === "estimated_api" ? '<div style="margin-top: 10px;">COST: estimated (API pricing)</div>' : ""}
        <div class="footer-message">Thank you for building!</div>
        <div class="generated-by">
          Print your own <strong>Codex Receipts</strong> with<br>
          <a href="https://github.com/lingskr/Token-Receipts" style="color: #333;">github.com/lingskr/Token-Receipts</a>
        </div>
      </div>
    </div>

    ${canShare ? `
    <div class="share-section">
      <button class="share-btn" id="share-btn" onclick="shareReceipt()">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="5" r="3"></circle>
          <circle cx="6" cy="12" r="3"></circle>
          <circle cx="18" cy="19" r="3"></circle>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
        </svg>
        <span id="share-btn-text">Prepare Link</span>
      </button>

      <div class="share-result" id="share-result">
        <div class="share-url" id="share-url"></div>
        <button class="copy-btn" id="copy-btn" onclick="copyShareLink()">
          Copy Link
        </button>
      </div>

      <div class="share-error" id="share-error"></div>
    </div>
    ` : ""}
  </div>

  <!-- Embedded receipt data for sharing -->
  <script id="receipt-data" type="application/json">
${JSON.stringify(shareableData, null, 2)}
  </script>

  <script>
        let sharedUrl = null;

    // Add keyboard shortcut to close window
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        window.close();
      }
    });

    // Log receipt info
    console.log('Token Receipt Generated!');
    console.log('Session:', '${this.escapeHtml(data.transcriptData.sessionSlug)}');
    console.log('Cost:', '${totalCostText}');
    console.log('Press ESC to close');

    async function shareReceipt() {
      const btn = document.getElementById('share-btn');
      const btnText = document.getElementById('share-btn-text');
      const resultDiv = document.getElementById('share-result');
      const urlDiv = document.getElementById('share-url');
      const errorDiv = document.getElementById('share-error');

      resultDiv.classList.remove('visible');
      errorDiv.textContent = '';
      errorDiv.style.display = 'none';

      try {
        sharedUrl = window.location.href;
        urlDiv.innerHTML = '<a href="' + sharedUrl + '" target="_blank">' + sharedUrl + '</a>';
        resultDiv.classList.add('visible');

        btn.disabled = false;
        btn.classList.add('success');
        btn.classList.remove('error');
        btnText.textContent = 'Link Ready';
      } catch (error) {
        console.error('Link prepare error:', error);
        btn.classList.add('error');
        btn.classList.remove('success');
        btnText.textContent = 'Prepare Failed';
        errorDiv.textContent = error && error.message ? error.message : 'Failed to prepare link';
        errorDiv.style.display = 'block';
      }
    }

    function copyShareLink() {
      if (!sharedUrl) return;

      const copyBtn = document.getElementById('copy-btn');

      navigator.clipboard.writeText(sharedUrl).then(() => {
        copyBtn.classList.add('copied');
        copyBtn.textContent = 'Copied!';

        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.textContent = 'Copy Link';
        }, 2000);
      }).catch(err => {
        console.error('Copy failed:', err);
      });
    }
  </script>
</body>
</html>`;
  }

  /**
   * Render line items HTML
   * Shows token counts and model subtotals (not per-token-type costs, which would be inaccurate)
   */
  private renderLineItems(data: ReceiptData): string {
    let html = '<div style="margin: 20px 0;">';

    if (
      data.sessionData.modelBreakdowns &&
      data.sessionData.modelBreakdowns.length > 0
    ) {
      for (const model of data.sessionData.modelBreakdowns) {
        // Model name with its subtotal cost
        html += `<div class="model-header">
          <span class="model-name">${this.escapeHtml(this.getModelName(model.modelName))}</span>
          <span class="model-cost">${this.formatModelCost(model.cost, data)}</span>
        </div>`;

        html += `<div class="line-item">
          <span>  Input tokens</span>
          <span>${formatNumber(model.inputTokens)}</span>
        </div>`;

        html += `<div class="line-item">
          <span>  Output tokens</span>
          <span>${formatNumber(model.outputTokens)}</span>
        </div>`;

        if (model.cacheCreationTokens && model.cacheCreationTokens > 0) {
          html += `<div class="line-item">
            <span>  Cache write</span>
            <span>${formatNumber(model.cacheCreationTokens)}</span>
          </div>`;
        }

        if (model.cacheReadTokens && model.cacheReadTokens > 0) {
          html += `<div class="line-item">
            <span>  Cache read</span>
            <span>${formatNumber(model.cacheReadTokens)}</span>
          </div>`;
        }
      }
    }

    html += "</div>";
    return html;
  }

  /**
   * Get clean model name
   */
  private getModelName(model: string): string {
    const cleaned = model.replace(/-\d{8}$/, "");
    return cleaned;
  }

  /**
   * Get main model
   */
  private getMainModel(data: ReceiptData): string {
    if (
      data.sessionData.modelBreakdowns &&
      data.sessionData.modelBreakdowns.length > 0
    ) {
      return this.getModelName(data.sessionData.modelBreakdowns[0].modelName);
    }

    if (data.sessionData.modelsUsed && data.sessionData.modelsUsed.length > 0) {
      return this.getModelName(data.sessionData.modelsUsed[0]);
    }

    return "Codex";
  }

  private renderCodexPixelLogoSvg(): string {
    const grid = 22;
    const block = 6;
    const circles: Array<[number, number, number]> = [
      [11, 11, 7.8],
      [11, 4, 4.0],
      [5, 6, 3.3],
      [17, 6, 3.3],
      [2.8, 11, 3.2],
      [19.2, 11, 3.2],
      [5, 16, 3.3],
      [17, 16, 3.3],
      [11, 18, 3.8],
    ];

    const symbol = new Set<string>();
    const chevron: Array<[number, number]> = [
      [8, 5], [8, 6],
      [9, 6], [9, 7],
      [10, 7], [10, 8],
      [11, 8], [11, 9],
      [12, 7], [12, 8],
      [13, 6], [13, 7],
      [14, 5], [14, 6],
    ];
    for (const [r, c] of chevron) {
      symbol.add(`${r},${c}`);
    }
    for (let r = 10; r <= 11; r++) {
      for (let c = 12; c <= 17; c++) {
        symbol.add(`${r},${c}`);
      }
    }

    const inCloud = (cx: number, cy: number): boolean =>
      circles.some(([x, y, r]) => (cx - x) ** 2 + (cy - y) ** 2 <= r * r);

    const rects: string[] = [];
    for (let row = 0; row < grid; row++) {
      for (let col = 0; col < grid; col++) {
        const cx = col + 0.5;
        const cy = row + 0.5;
        if (!inCloud(cx, cy)) continue;
        if (symbol.has(`${row},${col}`)) continue;
        rects.push(`<rect x="${col * block}" y="${row * block}" width="${block}" height="${block}" fill="#000"/>`);
      }
    }

    return `<svg class="logo-svg" viewBox="0 0 ${grid * block} ${grid * block}" xmlns="http://www.w3.org/2000/svg" aria-label="Codex pixel logo">${rects.join('')}</svg>`;
  }

  private formatTotalCost(data: ReceiptData): string {
    if (data.sessionData.costStatus === "unavailable") {
      return "N/A";
    }
    return formatCurrency(data.sessionData.totalCost);
  }

  private formatModelCost(cost: number, data: ReceiptData): string {
    if (data.sessionData.costStatus === "unavailable") {
      return "N/A";
    }
    return formatCurrency(cost);
  }

  /**
   * Escape HTML entities
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}
