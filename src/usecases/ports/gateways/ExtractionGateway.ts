export interface ExtractionGateway {
  extractText(url: string): Promise<string>;
}
