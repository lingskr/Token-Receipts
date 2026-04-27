import chalk from "chalk";
import boxen from "boxen";
import ora from "ora";
import { exec } from "child_process";
import { promisify } from "util";
import { CodexDataFetcher } from "../core/codex-data-fetcher.js";
import { ReceiptGenerator } from "../core/receipt-generator.js";
import { HtmlRenderer } from "../core/html-renderer.js";
import { ThermalPrinterRenderer } from "../core/thermal-printer.js";
import { ConfigManager } from "../core/config-manager.js";
import { LocationDetector } from "../utils/location.js";
import type { ReceiptData } from "../core/receipt-generator.js";
import type { ReceiptConfig } from "../types/config.js";

const execAsync = promisify(exec);

export type OutputFormat = "html" | "console" | "printer";

export interface GenerateOptions {
  session?: string;
  output?: string[];
  location?: string;
  printer?: string;
  source?: string;
  open?: boolean;
}

export class GenerateCommand {
  private codexDataFetcher = new CodexDataFetcher();
  private receiptGenerator = new ReceiptGenerator();
  private htmlRenderer = new HtmlRenderer();
  private thermalPrinter = new ThermalPrinterRenderer();
  private configManager = new ConfigManager();
  private locationDetector = new LocationDetector();

  async execute(options: GenerateOptions): Promise<void> {
    const spinner = ora("Generating receipt...").start();

    try {
      const config = await this.configManager.loadConfig();
      this.resolveSource(options.source, config.source);

      spinner.text = "Fetching Codex session data...";
      const codexData = await this.codexDataFetcher.fetchReceiptData(options.session);

      const location = options.location || (await this.locationDetector.getLocation(config));

      spinner.text = "Generating receipt...";
      const receiptData: ReceiptData = {
        source: "codex",
        sessionData: codexData.sessionData,
        transcriptData: codexData.transcriptData,
        location,
        config,
      };

      await this.renderReceipt(
        receiptData,
        options,
        spinner,
        !!options.open,
        codexData.sessionData.sessionId,
        codexData.transcriptData.sessionSlug,
      );
    } catch (error) {
      spinner.fail("Failed to generate receipt");

      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      } else {
        console.error(chalk.red("An unknown error occurred"));
      }

      process.exit(1);
    }
  }

  private async renderReceipt(
    receiptData: ReceiptData,
    options: GenerateOptions,
    spinner: ReturnType<typeof ora>,
    shouldOpenHtml: boolean,
    sessionId: string,
    sessionSlug: string | undefined,
  ): Promise<void> {
    const receipt = this.receiptGenerator.generateReceipt(receiptData);

    spinner.succeed("Receipt generated!");

    const outputFormats = [...new Set(options.output || ["console"])] as OutputFormat[];

    const errors: Array<{ format: OutputFormat; error: Error }> = [];

    for (const format of outputFormats) {
      try {
        switch (format) {
          case "printer":
            await this.outputToPrinter(receiptData, options, receiptData.config, spinner);
            break;
          case "html":
            await this.outputToHtml(
              receiptData,
              receipt,
              sessionId,
              sessionSlug,
              shouldOpenHtml,
            );
            break;
          case "console":
            this.outputToConsole(receipt);
            break;
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Unknown error");
        errors.push({ format, error });

        if (outputFormats.length > 1) {
          console.log(chalk.yellow(`\n⚠ ${format} output failed: ${error.message}`));
        }
      }
    }

    if (errors.length === outputFormats.length) {
      throw errors[0].error;
    }
  }

  private resolveSource(
    cliSource: string | undefined,
    configSource: ReceiptConfig["source"],
  ): "codex" {
    const source = (cliSource || configSource || "codex").toLowerCase();

    if (source === "codex") {
      return "codex";
    }

    throw new Error(
      `Invalid source "${source}". Only "codex" is supported.`,
    );
  }

  private async outputToPrinter(
    receiptData: ReceiptData,
    options: GenerateOptions,
    config: { printer?: string },
    spinner: ReturnType<typeof ora>,
  ): Promise<void> {
    const printerInterface = options.printer || config.printer;
    if (!printerInterface) {
      throw new Error(
        'No printer specified. Use --printer <name> or set via: codex-receipts config --set printer=EPSON_TM_T88V',
      );
    }

    spinner.start("Sending to printer...");
    await this.thermalPrinter.printReceipt(receiptData, printerInterface);
    spinner.succeed(`Receipt sent to printer: ${printerInterface}`);
  }

  private async outputToHtml(
    receiptData: ReceiptData,
    receipt: string,
    sessionId: string,
    sessionSlug: string | undefined,
    shouldOpen: boolean,
  ): Promise<void> {
    const fileName = sessionSlug || sessionId;
    const home = process.env.HOME || process.env.USERPROFILE || "";
    const outputDir = `${home}/.codex-receipts/projects`;
    const fullPath = `${outputDir}/${fileName}.html`;

    const html = this.htmlRenderer.generateHtml(receiptData, receipt);
    await this.saveHtmlFile(html, fullPath);

    if (shouldOpen) {
      await this.openInBrowser(fullPath);
    } else {
      console.log(chalk.cyan("\nTip: Open in browser to view!"));
    }
  }

  private outputToConsole(receipt: string): void {
    this.displayToConsole(receipt);
  }

  private displayToConsole(receipt: string): void {
    console.log(
      boxen(receipt, {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: "cyan",
      }),
    );
  }

  private async saveHtmlFile(html: string, outputPath: string): Promise<void> {
    const { writeFile, mkdir } = await import("fs/promises");
    const { dirname, resolve } = await import("path");

    const resolvedPath = resolve(this.expandPath(outputPath));
    const dir = dirname(resolvedPath);

    await mkdir(dir, { recursive: true });
    await writeFile(resolvedPath, html, "utf-8");

    console.log(chalk.green(`Receipt saved to: ${resolvedPath}`));
  }

  private async openInBrowser(filePath: string): Promise<void> {
    const platform = process.platform;

    try {
      if (platform === "darwin") {
        await execAsync(`open "${filePath}"`);
      } else if (platform === "win32") {
        await execAsync(`start "" "${filePath}"`);
      } else {
        await execAsync(`xdg-open "${filePath}"`);
      }
    } catch {
      // Ignore browser-open failures.
    }
  }

  private expandPath(path: string): string {
    if (path.startsWith("~/")) {
      const home = process.env.HOME || process.env.USERPROFILE || "";
      return path.replace(/^~/, home);
    }
    return path;
  }
}
