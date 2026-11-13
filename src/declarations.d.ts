declare module 'pdfmake/build/pdfmake' {
  const pdfMake: any;
  export default pdfMake;
}

declare module 'pdfmake/build/vfs_fonts' {
  const pdfFonts: any;
  export default pdfFonts;
}

declare module 'svg2pdf.js' {
  export const svg2pdf: any;
  const def: any;
  export default def;
}

interface Window {
  [key: string]: any;
}
