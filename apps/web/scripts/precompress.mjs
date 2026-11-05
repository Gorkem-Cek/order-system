// Writes .br and .gz copies of the built web files. The API serves them to browsers that accept
// them, which keeps the menu fast on café Wi-Fi without compressing on every request.
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const root = fileURLToPath(new URL("../dist", import.meta.url));
const entries = await readdir(root, { recursive: true, withFileTypes: true });

for (const entry of entries) {
  if (!entry.isFile() || !/\.(?:js|css|html|svg)$/.test(entry.name)) continue;
  const file = path.join(entry.parentPath, entry.name);
  const data = await readFile(file);
  await writeFile(`${file}.gz`, gzipSync(data, { level: 9 }));
  await writeFile(
    `${file}.br`,
    brotliCompressSync(data, {
      params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY },
    }),
  );
}
