import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import {
  authorizeUploadInput, canDeliverableTransition, decisionInput, deliverableState, deliverableVersionOutcome,
  filenameMatchesType, isOpenDeliverableState, previewCapability, submissionReady, updateDeliverableDraftInput,
} from "../src/domain/deliverable-contracts.js";

describe("Slice 1.5 deliverable rules", () => {
  it("keeps aggregate state separate from submitted-version outcome and accepts only approved transitions", () => {
    expect(deliverableState.options).toEqual(["draft", "in-review", "revision-draft", "approved", "canceled"]);
    expect(deliverableVersionOutcome.options).toEqual(["in-review", "changes-requested", "withdrawn", "approved"]);
    expect(canDeliverableTransition("draft", "in-review")).toBe(true);
    expect(canDeliverableTransition("draft", "discarded")).toBe(true);
    expect(canDeliverableTransition("in-review", "revision-draft")).toBe(true);
    expect(canDeliverableTransition("in-review", "approved")).toBe(true);
    expect(canDeliverableTransition("revision-draft", "in-review")).toBe(true);
    expect(canDeliverableTransition("revision-draft", "canceled")).toBe(true);
    for (const terminal of ["approved", "canceled"] as const) for (const target of deliverableState.options) expect(canDeliverableTransition(terminal, target)).toBe(false);
    expect(canDeliverableTransition("in-review", "canceled")).toBe(false);
    expect(deliverableState.options.filter(isOpenDeliverableState)).toEqual(["draft", "in-review", "revision-draft"]);
  });

  it("validates actionable decisions, exact draft collections, and submission readiness", () => {
    expect(decisionInput.safeParse({ confirmed: true, outcome: "changes-requested", note: " " }).success).toBe(false);
    expect(decisionInput.parse({ confirmed: true, outcome: "approved", note: " " })).toEqual({ confirmed: true, outcome: "approved", note: undefined });
    const id = new mongoose.Types.ObjectId().toString(); const revisionToken = "x".repeat(32);
    const draft = updateDeliverableDraftInput.parse({ revisionToken, title: "  Homepage  ", notes: "  Notes  ", revisionSummary: " ", links: [{ id, label: " Preview ", url: "https://example.com/mockup", order: 0 }], attachmentIds: [] });
    expect(draft).toMatchObject({ title: "Homepage", notes: "Notes", revisionSummary: undefined });
    expect(submissionReady({ links: [], attachments: [], versionNumber: 1 })).toBe(false);
    expect(submissionReady({ links: [{}], attachments: [], versionNumber: 1 })).toBe(true);
    expect(submissionReady({ links: [{}], attachments: [], versionNumber: 2 })).toBe(false);
    expect(submissionReady({ links: [{}], attachments: [], versionNumber: 2, revisionSummary: "Changed" })).toBe(true);
    expect(updateDeliverableDraftInput.safeParse({ revisionToken, links: [{ id, label: "One", url: "https://example.com", order: 1 }], attachmentIds: [] }).success).toBe(false);
    for (const url of ["http://example.com", "https://user:pass@example.com", "https://localhost/a", "https://127.0.0.1/a", "https://10.1.2.3/a", "https://[::1]/a"]) {
      expect(updateDeliverableDraftInput.safeParse({ revisionToken, links: [{ id, label: "Bad", url, order: 0 }], attachmentIds: [] }).success).toBe(false);
    }
  });

  it("enforces private-file types, sizes, filenames, and preview capability", () => {
    const revisionToken = "r".repeat(32);
    expect(authorizeUploadInput.safeParse({ revisionToken, filename: "proof.pdf", mediaType: "application/pdf", byteSize: 26_214_400 }).success).toBe(true);
    expect(authorizeUploadInput.safeParse({ revisionToken, filename: "proof.pdf", mediaType: "application/pdf", byteSize: 26_214_401 }).success).toBe(false);
    expect(authorizeUploadInput.safeParse({ revisionToken, filename: "payload.svg", mediaType: "image/svg+xml", byteSize: 100 }).success).toBe(false);
    expect(filenameMatchesType("PHOTO.JPEG", "image/jpeg")).toBe(true);
    expect(filenameMatchesType("photo.png", "image/jpeg")).toBe(false);
    expect(previewCapability("image/webp")).toBe(true);
    expect(previewCapability("application/pdf")).toBe(false);
    expect(previewCapability("application/zip")).toBe(false);
  });
});
