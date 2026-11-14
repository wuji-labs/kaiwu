import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { resolveSherpaChecksum } from "./resolve-sherpa-checksum.mjs";

const archive = "sherpa-onnx-v1.12.25-ios.tar.bz2";
const checksum = "c6f92b0451227c0d0770273352c7a2528d0c8b7e0a879c8c7d2800643a7e3e9d";
const scriptPath = fileURLToPath(new URL("./resolve-sherpa-checksum.mjs", import.meta.url));

test("resolves upstream filename-first sherpa checksum entries", () => {
  assert.equal(
    resolveSherpaChecksum({
      archive,
      checksumsText: `${archive} ${checksum}\n`,
    }),
    checksum,
  );
});

test("keeps compatibility with checksum-first entries", () => {
  assert.equal(
    resolveSherpaChecksum({
      archive,
      checksumsText: `${checksum} ${archive}\n`,
    }),
    checksum,
  );
});

test("matches the exact archive and rejects malformed checksum values", () => {
  assert.throws(
    () =>
      resolveSherpaChecksum({
        archive,
        checksumsText: `${archive}.bak ${checksum}\n${archive} not-a-sha\n`,
      }),
    /sha256 not found/,
  );
});

test("CLI prints the resolved checksum", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "sherpa-checksum-"));
  try {
    const checksumPath = path.join(dir, "checksum.txt");
    writeFileSync(checksumPath, `# release checksums\n${archive}\t${checksum}\n`, "utf8");

    const output = execFileSync(
      process.execPath,
      [scriptPath, checksumPath, archive],
      { encoding: "utf8" },
    );

    assert.equal(output.trim(), checksum);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("CLI runs when invoked through a workspace symlink", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "sherpa-checksum-symlink-"));
  try {
    const checksumPath = path.join(dir, "checksum.txt");
    writeFileSync(checksumPath, `${archive}\t${checksum}\n`, "utf8");
    let symlinkPath;
    if (process.platform === "win32") {
      // File symlinks need SeCreateSymbolicLinkPrivilege (admin / Developer Mode) on Windows.
      // A directory junction needs no privilege and exercises the same contract:
      // argv[1] is a link path whose realpath is the real script.
      const linkedDir = path.join(dir, "linked-scripts");
      symlinkSync(path.dirname(scriptPath), linkedDir, "junction");
      symlinkPath = path.join(linkedDir, path.basename(scriptPath));
    } else {
      symlinkPath = path.join(dir, "resolve-sherpa-checksum.mjs");
      symlinkSync(scriptPath, symlinkPath);
    }

    const output = execFileSync(process.execPath, [symlinkPath, checksumPath, archive], {
      encoding: "utf8",
    });

    assert.equal(output.trim(), checksum);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});
