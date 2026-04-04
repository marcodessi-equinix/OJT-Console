declare module "word-extractor" {
  export interface WordExtractorDocument {
    getBody(): string;
  }

  export default class WordExtractor {
    extract(source: string | Buffer): Promise<WordExtractorDocument>;
  }
}