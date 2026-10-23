// Test-only fault at the boundary between the two metadata replacements.
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { basename } from "node:path";

const rename = fs.rename;
fs.rename = async (source, target) => {
  if (basename(target) === "ui-maintenance.json") {
    if (process.env.UI_MAINTENANCE_RECORD_FAILURE === "exit") process.exit(77);
    throw Object.assign(new Error("Injected second-file write failure"), { code: "EACCES" });
  }
  return rename(source, target);
};
syncBuiltinESMExports();
