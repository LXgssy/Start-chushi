import sharp from "sharp";
const icons = {
  "cloud-sun": ['M12 2v2','m4.93 4.93 1.41 1.41','M20 12h2','m19.07 4.93-1.41 1.41','M15.947 12.65a4 4 0 0 0-5.925-4.128','M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z'],
  "square-check-big": ['M21 10.656V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.344','m9 11 3 3L22 4'],
  "notebook-pen": ['M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4','M2 6h4','M2 10h4','M2 14h4','M2 18h4','M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z'],
};
for (const [name, paths] of Object.entries(icons)) {
  const body = paths.map(d => `<path d="${d}"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="256" height="256" fill="none" stroke="#888" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`/tmp/shots/lucide-${name}.png`);
  console.log(name, "✓");
}
