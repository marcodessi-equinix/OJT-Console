interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "mammoth" {
  interface Result {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  function convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<Result>;
  export { convertToHtml };
}
