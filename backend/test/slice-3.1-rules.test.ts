import { describe, expect, it } from "vitest";

import { BUNDLED_FILE_CAP, EXPORT_SCHEMA_VERSION, exportManifestSchema, newestVersionRounds, safeArchiveFilename, safePathSegment, uniqueArchivePaths } from "../src/domain/project-export-contracts.js";

describe("slice 3.1 export contracts", () => {
  it("normalizes traversal, control, reserved, and colliding archive names deterministically", () => {
    expect(safePathSegment("../CON\u0000<script>.pdf")).toBe("CON-script-.pdf");
    const paths = uniqueArchivePaths([
      { deliverableNumber: 1, versionNumber: 2, order: 1, filename: "brief.pdf" },
      { deliverableNumber: 1, versionNumber: 2, order: 1, filename: "BRIEF.PDF" },
    ]);
    expect(paths).toEqual(["attachments/deliverable-1/version-2/1-brief.pdf", "attachments/deliverable-1/version-2/1-BRIEF-2.PDF"]);
    expect(safeArchiveFilename("../Client / Portal", new Date("2026-09-14T00:00:00.000Z"))).toBe("Client - Portal-project-record-2026-09-14T00-00-00-000Z.zip");
  });

  it("prioritizes newest-version rounds and stable attachment order", () => {
    const ordered = newestVersionRounds([
      { attachmentId: "c", deliverableNumber: 1, versionNumber: 1, order: 0 },
      { attachmentId: "b", deliverableNumber: 2, versionNumber: 2, order: 0 },
      { attachmentId: "a", deliverableNumber: 1, versionNumber: 2, order: 1 },
      { attachmentId: "d", deliverableNumber: 1, versionNumber: 3, order: 0 },
    ]);
    expect(ordered.map((item) => item.attachmentId)).toEqual(["d", "b", "a", "c"]);
  });

  it("accepts only the strict versioned safe manifest contract", () => {
    const manifest = { schemaVersion: EXPORT_SCHEMA_VERSION, projectId: "shared-project", projectName: "Portal", generatedAt: "2026-09-14T00:00:00.000Z", dataCutoff: "2026-09-14T00:00:00.000Z", lifecycleState: "active", bundledFileCap: BUNDLED_FILE_CAP, includedFileBytes: 0, complete: false, attachments: [{ attachmentId: "a", deliverableNumber: 1, deliverableTitle: "Review", versionNumber: 1, order: 0, filename: "x.pdf", mediaType: "application/pdf", byteSize: BUNDLED_FILE_CAP + 1, status: "omitted", omissionReason: "size_limit" }] };
    expect(exportManifestSchema.parse(manifest)).toEqual(manifest);
    expect(exportManifestSchema.safeParse({ ...manifest, providerIdentifier: "secret" }).success).toBe(false);
  });
});
