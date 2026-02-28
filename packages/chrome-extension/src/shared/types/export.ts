// Export configuration
export interface ExportOptions {
  format: "mcp";
  includeComments: boolean;
  includeWaits: boolean;
  includeScreenshots: boolean;
  selectorPriority: ("css" | "xpath" | "testId" | "aria" | "text")[];
}
