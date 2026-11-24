declare module "pdfkit/standard-fonts/*" {
  const fontData: Record<string, unknown>;
  export default fontData;
}

declare module "pdfkit" {
  export function registerStdFonts(...fontData: Array<Record<string, unknown>>): void;
}
