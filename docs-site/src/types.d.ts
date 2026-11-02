// @docusaurus/module-type-aliases declares SVG and CSS imports but not raster images.
declare module '*.png' {
  const src: string;
  export default src;
}
