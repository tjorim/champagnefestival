import { open, readFile, link, rename, unlink, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

const files = ["ui-upstream.json", "ui-maintenance.json"];
const journalName = ".ui-maintenance-record.json";

async function stagedFile(path, content) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx");
  try {
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return temporary;
}

async function replaceFile(path, content) {
  const temporary = await stagedFile(path, content);
  try {
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

function ownerIsRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    if (error.code === "EPERM") return true;
    throw error;
  }
}

async function finishRecord(root, record) {
  // Inspect both files before replacing either. Never overwrite unrelated edits.
  const current = {};
  for (const file of files) {
    const pair = record.files[file];
    current[file] = await readFile(resolve(root, file), "utf8");
    if (current[file] !== pair.before && current[file] !== pair.after) {
      throw new Error(
        `${file} changed outside the pending record; preserve it and reconcile ${journalName} before retrying`,
      );
    }
  }
  for (const file of files) {
    if (current[file] !== record.files[file].after) {
      await replaceFile(resolve(root, file), record.files[file].after);
    }
  }
  await unlink(resolve(root, journalName));
}

export async function recoverRecord(root) {
  let text;
  try {
    text = await readFile(resolve(root, journalName), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  const record = JSON.parse(text);
  if (
    record.version !== 1 ||
    !Number.isSafeInteger(record.pid) ||
    record.pid <= 0 ||
    files.some(
      (file) =>
        typeof record.files?.[file]?.before !== "string" ||
        typeof record.files?.[file]?.after !== "string",
    )
  ) {
    throw new Error(`Invalid ${journalName}; preserve it for manual reconciliation`);
  }
  if (record.pid !== process.pid && ownerIsRunning(record.pid)) {
    throw new Error("Another ui:record process is still running; retry after it finishes");
  }
  await finishRecord(root, record);
  return true;
}

export async function saveRecord(root, before, after) {
  const record = {
    version: 1,
    pid: process.pid,
    files: Object.fromEntries(
      files.map((file) => [file, { before: before[file], after: after[file] }]),
    ),
  };
  const journal = resolve(root, journalName);
  const temporary = await stagedFile(journal, `${JSON.stringify(record)}\n`);
  try {
    // Publish a complete journal exclusively. A second writer cannot replace it.
    await link(temporary, journal);
  } catch (error) {
    if (error.code === "EEXIST")
      throw new Error(
        "A ui:record transaction already exists; retry ui:check after its owner finishes",
      );
    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
  // Keep the journal on failure, including a process exit between replacements.
  await finishRecord(root, record);
}
