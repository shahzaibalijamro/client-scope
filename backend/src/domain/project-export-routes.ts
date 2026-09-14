import { ZipArchive } from "archiver";
import { Router } from "express";

import { ApiError } from "../errors.js";
import { asyncRoute, requireVerified } from "./auth.js";
import type { PrivateAssetStorage } from "./private-asset-storage.js";
import { safeArchiveFilename } from "./project-export-contracts.js";
import { prepareProjectExport, recheckProjectExportAccess } from "./project-export-service.js";
import { objectId } from "./validation.js";

export function createProjectExportRouter(storage: PrivateAssetStorage): Router {
  const router = Router();
  router.get("/projects/:projectId/export", asyncRoute(async (request, response) => {
    const { user } = requireVerified(request);
    const parsed = objectId.safeParse(request.params.projectId);
    if (!parsed.success) throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
    const abort = new AbortController();
    request.once("aborted", () => abort.abort());
    const prepared = await prepareProjectExport(user._id, parsed.data, storage, abort.signal);
    await recheckProjectExportAccess(user._id, parsed.data);
    const filename = safeArchiveFilename(prepared.record.projectName, new Date(prepared.record.generatedAt));
    const ascii = filename.replace(/[^\x20-\x7e]/gu, "-").replace(/["\\]/gu, "-");
    response.status(200);
    response.set({
      "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store, private", Pragma: "no-cache", "X-Content-Type-Options": "nosniff", "X-Project-Export-Complete": String(prepared.manifest.complete),
    });
    const archive = new ZipArchive({ zlib: { level: 6 } });
    const stop = () => { abort.abort(); archive.abort(); };
    response.once("close", stop);
    archive.once("error", (error: Error) => { if (!response.destroyed) response.destroy(error); });
    archive.pipe(response);
    archive.append(prepared.pdf, { name: "project-record.pdf", date: new Date(0) });
    archive.append(Buffer.from(`${JSON.stringify(prepared.manifest, null, 2)}\n`, "utf8"), { name: "manifest.json", date: new Date(0) });
    prepared.files.forEach((file) => archive.append(file.bytes, { name: file.path, date: new Date(0) }));
    await archive.finalize();
  }));
  return router;
}
