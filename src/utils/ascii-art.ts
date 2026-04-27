/**
 * ASCII art headers for receipts
 */

export const HEADER_LOGO = `      +--------+
      |  .--.  |
      | ( >_ ) |
      |  '--'  |
      +--------+`;

/**
 * Get the header logo
 */
export function getHeader(): string {
  return HEADER_LOGO;
}

/**
 * Receipt section separators
 */
export const SEPARATOR = "━".repeat(35);
export const LIGHT_SEPARATOR = "─".repeat(35);
