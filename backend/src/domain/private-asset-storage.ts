import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { v2 as cloudinary } from "cloudinary";
import { ApiError } from "../errors.js";
import type { AllowedAssetType } from "./deliverable-contracts.js";

export type UploadAuthorization = Readonly<{
  uploadUrl: string;
  fields: Readonly<Record<string, string>>;
  providerIdentifier: string;
  expiresAt: Date;
}>;

export type VerifiedUpload = Readonly<{
  providerIdentifier: string;
  mediaType: AllowedAssetType;
  byteSize: number;
  private: true;
}>;

export type DeliveryAuthorization = Readonly<{ url: string; expiresAt: Date }>;

export interface PrivateAssetStorage {
  authorizeUpload(input: { providerIdentifier: string; mediaType: AllowedAssetType; byteSize: number; expiresAt: Date }): Promise<UploadAuthorization>;
  verifyUpload(input: { providerIdentifier: string; mediaType: AllowedAssetType; byteSize: number; providerResult: Record<string, unknown> }): Promise<VerifiedUpload>;
  authorizeDelivery(input: { providerIdentifier: string; filename: string; preview: boolean; expiresAt: Date }): Promise<DeliveryAuthorization>;
  delete(input: { providerIdentifier: string; idempotencyKey: string }): Promise<{ absent: boolean }>;
}

const dependency = () => new ApiError(503, "STORAGE_UNAVAILABLE", "Private file storage is temporarily unavailable. Try again shortly.");

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

type CloudinaryIdentity = { resourceType: "image" | "raw"; publicId: string; version: number; format?: string };

function encodeIdentity(identity: CloudinaryIdentity): string {
  return Buffer.from(JSON.stringify(identity)).toString("base64url");
}

function decodeIdentity(value: string): CloudinaryIdentity {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as CloudinaryIdentity;
    if (!parsed.publicId || !["image", "raw"].includes(parsed.resourceType) || !Number.isInteger(parsed.version)) throw new Error("invalid");
    return parsed;
  } catch {
    throw dependency();
  }
}

function cloudinaryType(mediaType: AllowedAssetType): "image" | "raw" {
  return mediaType.startsWith("image/") || mediaType === "application/pdf" ? "image" : "raw";
}

function detectedType(resourceType: string, format: string): AllowedAssetType | undefined {
  if (resourceType === "image") {
    if (format === "png") return "image/png";
    if (format === "jpg" || format === "jpeg") return "image/jpeg";
    if (format === "webp") return "image/webp";
    if (format === "pdf") return "application/pdf";
  }
  if (resourceType === "raw") {
    if (format === "pdf") return "application/pdf";
    if (format === "zip") return "application/zip";
  }
  return undefined;
}

function cloudinarySignature(parameters: Record<string, string | number>, secret: string): string {
  return cloudinary.utils.api_sign_request(parameters, secret);
}

export class CloudinaryPrivateAssetStorage implements PrivateAssetStorage {
  constructor(private readonly cloudName: string, private readonly apiKey: string, private readonly apiSecret: string) {
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  }

  async authorizeUpload(input: { providerIdentifier: string; mediaType: AllowedAssetType; byteSize: number; expiresAt: Date }): Promise<UploadAuthorization> {
    const publicId = input.providerIdentifier;
    const timestamp = Math.floor(Date.now() / 1_000);
    const resourceType = cloudinaryType(input.mediaType);
    const fields = { api_key: this.apiKey, public_id: publicId, timestamp: String(timestamp), type: "authenticated", overwrite: "false" };
    const signature = cloudinarySignature({ overwrite: "false", public_id: publicId, timestamp, type: "authenticated" }, this.apiSecret);
    return {
      uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(this.cloudName)}/${resourceType}/upload`,
      fields: { ...fields, signature }, providerIdentifier: publicId, expiresAt: input.expiresAt,
    };
  }

  async verifyUpload(input: { providerIdentifier: string; mediaType: AllowedAssetType; byteSize: number; providerResult: Record<string, unknown> }): Promise<VerifiedUpload> {
    try {
      const publicId = String(input.providerResult.public_id ?? "");
      const version = Number(input.providerResult.version);
      const bytes = Number(input.providerResult.bytes);
      const resourceType = String(input.providerResult.resource_type ?? "");
      const format = String(input.providerResult.format ?? (resourceType === "raw" ? publicId.split(".").pop() : "") ?? "").toLowerCase();
      const type = String(input.providerResult.type ?? "");
      const signature = String(input.providerResult.signature ?? "");
      const expectedSignature = cloudinarySignature({ public_id: publicId, version }, this.apiSecret);
      const mediaType = detectedType(resourceType, format);
      if (publicId !== input.providerIdentifier || type !== "authenticated" || !Number.isInteger(version) || version <= 0 ||
        bytes !== input.byteSize || !mediaType || mediaType !== input.mediaType || !safeEqual(signature, expectedSignature)) throw new Error("untrusted");
      return { providerIdentifier: encodeIdentity({ resourceType: resourceType as "image" | "raw", publicId, version, format }), mediaType, byteSize: bytes, private: true };
    } catch {
      throw new ApiError(422, "UPLOAD_VERIFICATION_FAILED", "The uploaded file could not be verified. Remove it and try the upload again.");
    }
  }

  async authorizeDelivery(input: { providerIdentifier: string; filename: string; preview: boolean; expiresAt: Date }): Promise<DeliveryAuthorization> {
    const identity = decodeIdentity(input.providerIdentifier);
    if (!identity.format) throw dependency();
    const url = cloudinary.utils.private_download_url(identity.publicId, identity.format, {
      resource_type: identity.resourceType, type: "authenticated", expires_at: Math.floor(input.expiresAt.valueOf() / 1_000), attachment: !input.preview,
    });
    return { url, expiresAt: input.expiresAt };
  }

  async delete(input: { providerIdentifier: string }): Promise<{ absent: boolean }> {
    const identity = decodeIdentity(input.providerIdentifier);
    try {
      const result = await cloudinary.uploader.destroy(identity.publicId, { resource_type: identity.resourceType, type: "authenticated", invalidate: true }) as { result?: string };
      if (result.result !== "ok" && result.result !== "not found") throw new Error("provider");
      return { absent: result.result === "not found" };
    } catch {
      throw dependency();
    }
  }
}

export class DeterministicPrivateAssetStorage implements PrivateAssetStorage {
  private readonly secret = "clientscope-deterministic-storage";
  private readonly deleted = new Set<string>();

  async authorizeUpload(input: { providerIdentifier: string; mediaType: AllowedAssetType; byteSize: number; expiresAt: Date }): Promise<UploadAuthorization> {
    const token = createHmac("sha256", this.secret).update(`${input.providerIdentifier}:${input.mediaType}:${input.byteSize}`).digest("base64url");
    return { uploadUrl: "https://storage.invalid/direct-upload", fields: { token }, providerIdentifier: input.providerIdentifier, expiresAt: input.expiresAt };
  }

  async verifyUpload(input: { providerIdentifier: string; mediaType: AllowedAssetType; byteSize: number; providerResult: Record<string, unknown> }): Promise<VerifiedUpload> {
    const expected = createHmac("sha256", this.secret).update(`${input.providerIdentifier}:${input.mediaType}:${input.byteSize}`).digest("base64url");
    if (input.providerResult.token !== expected || input.providerResult.private !== true || input.providerResult.mediaType !== input.mediaType || input.providerResult.byteSize !== input.byteSize) {
      throw new ApiError(422, "UPLOAD_VERIFICATION_FAILED", "The uploaded file could not be verified. Remove it and try the upload again.");
    }
    return { providerIdentifier: `fake:${input.providerIdentifier}`, mediaType: input.mediaType, byteSize: input.byteSize, private: true };
  }

  async authorizeDelivery(input: { providerIdentifier: string; filename: string; preview: boolean; expiresAt: Date }): Promise<DeliveryAuthorization> {
    if (this.deleted.has(input.providerIdentifier)) throw dependency();
    const token = randomBytes(24).toString("base64url");
    return { url: `https://storage.invalid/private/${token}/${encodeURIComponent(input.filename)}${input.preview ? "?preview=1" : "?download=1"}`, expiresAt: input.expiresAt };
  }

  async delete(input: { providerIdentifier: string }): Promise<{ absent: boolean }> {
    const absent = this.deleted.has(input.providerIdentifier); this.deleted.add(input.providerIdentifier); return { absent };
  }
}

export function configuredPrivateAssetStorage(environment: NodeJS.ProcessEnv = process.env): PrivateAssetStorage {
  const mode = environment.PRIVATE_ASSET_STORAGE_MODE ?? (environment.NODE_ENV === "production" ? "cloudinary" : "fake");
  if (mode === "fake" && environment.NODE_ENV !== "production") return new DeterministicPrivateAssetStorage();
  const cloudName = environment.CLOUDINARY_CLOUD_NAME; const apiKey = environment.CLOUDINARY_API_KEY; const apiSecret = environment.CLOUDINARY_API_SECRET;
  if (mode !== "cloudinary" || !cloudName || !apiKey || !apiSecret) throw new Error("Cloudinary private-asset storage configuration is required.");
  return new CloudinaryPrivateAssetStorage(cloudName, apiKey, apiSecret);
}
