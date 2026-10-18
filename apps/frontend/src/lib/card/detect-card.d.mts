import type { Uint8ArrayLike } from "./container-types";

export declare function inspectContainer(bytes: Uint8ArrayLike): "csv" | "zip" | "cfb" | "unknown";
export declare function detectCardCompany(
  text: string,
  contract: {
    companies: Record<string, { detect?: { headerSignature?: string[]; minScore?: number } }>;
  },
): string | null;
export declare function parserFor(company: string | null): string | null;
