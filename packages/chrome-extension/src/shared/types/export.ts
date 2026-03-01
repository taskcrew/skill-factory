// Export configuration
export interface ExportOptions {
  format: "agent-browser";
  includeComments: boolean;
  includeWaits: boolean;
  includeScreenshots: boolean;
  selectorPriority: ("css" | "xpath" | "testId" | "aria" | "text")[];
}
