import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { CloudinaryPrivateAssetStorage, DeterministicPrivateAssetStorage, type PrivateAssetStorage } from "../src/domain/private-asset-storage.js";

describe("Slice 1.5 private-asset storage boundary", () => {
  it("issues narrowly signed non-overwriting uploads and verifies the trusted response signature", async () => {
    const storage = new CloudinaryPrivateAssetStorage("demo-cloud", "public-key", "server-secret"); const expiresAt = new Date(Date.now() + 600_000);
    const authorization = await storage.authorizeUpload({ providerIdentifier: "clientscope/random", mediaType: "image/png", byteSize: 128, expiresAt });
    expect(authorization.uploadUrl).toBe("https://api.cloudinary.com/v1_1/demo-cloud/image/upload");
    expect(authorization.fields).toMatchObject({ public_id: "clientscope/random", type: "authenticated", overwrite: "false", api_key: "public-key" });
    expect(JSON.stringify(authorization)).not.toContain("server-secret");
    const version = 1_789_147_000; const signature = createHash("sha1").update(`public_id=clientscope/random&version=${version}server-secret`).digest("hex");
    const verified = await storage.verifyUpload({ providerIdentifier: "clientscope/random", mediaType: "image/png", byteSize: 128, providerResult: { public_id: "clientscope/random", version, bytes: 128, resource_type: "image", format: "png", type: "authenticated", signature } });
    expect(verified).toMatchObject({ mediaType: "image/png", byteSize: 128, private: true });
    await expect(storage.verifyUpload({ providerIdentifier: "clientscope/random", mediaType: "image/png", byteSize: 128, providerResult: { public_id: "clientscope/random", version, bytes: 128, resource_type: "image", format: "png", type: "authenticated", signature: "tampered" } })).rejects.toMatchObject({ code: "UPLOAD_VERIFICATION_FAILED" });
    const deliveryExpiry = new Date(Date.now() + 300_000); const access = await storage.authorizeDelivery({ providerIdentifier: verified.providerIdentifier, filename: "preview.png", preview: true, expiresAt: deliveryExpiry }); const url = new URL(access.url);
    expect(url.protocol).toBe("https:"); expect(url.searchParams.get("expires_at")).toBe(String(Math.floor(deliveryExpiry.valueOf() / 1_000))); expect(access.expiresAt).toEqual(deliveryExpiry); expect(access.url).not.toContain("server-secret");
  });

  it("keeps deterministic test storage private and deletion idempotent", async () => {
    const storage: PrivateAssetStorage = new DeterministicPrivateAssetStorage(); const expiresAt = new Date(Date.now() + 60_000); const authorization = await storage.authorizeUpload({ providerIdentifier: "asset", mediaType: "application/pdf", byteSize: 64, expiresAt });
    const verified = await storage.verifyUpload({ providerIdentifier: "asset", mediaType: "application/pdf", byteSize: 64, providerResult: { token: authorization.fields.token, private: true, mediaType: "application/pdf", byteSize: 64 } });
    expect((await storage.delete({ providerIdentifier: verified.providerIdentifier, idempotencyKey: "one" })).absent).toBe(false); expect((await storage.delete({ providerIdentifier: verified.providerIdentifier, idempotencyKey: "one" })).absent).toBe(true);
  });
});
