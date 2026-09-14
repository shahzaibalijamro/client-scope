import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProjectExportButton } from "./project-export-button";

describe("ProjectExportButton", () => {
  afterEach(() => vi.restoreAllMocks());

  it("prevents duplicate requests, uses the safe server filename, and reports incomplete downloads", async () => {
    let finish!: (value: Response) => void;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test"); const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<ProjectExportButton projectId="0123456789abcdef01234567" />);
    fireEvent.click(screen.getByRole("button", { name: "Export project record" }));
    expect(screen.getByRole("button", { name: "Preparing…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Preparing…" })); expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(new Response("zip", { status: 200, headers: { "Content-Disposition": "attachment; filename*=UTF-8''Acme-record.zip", "X-Project-Export-Complete": "false" } }));
    await waitFor(() => expect(screen.getByText(/Some attachment files were omitted/u)).toBeInTheDocument());
    expect(create).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledWith("blob:test");
  });

  it("allows cancellation and retry after a safe failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { message: "private detail" } }), { status: 404, headers: { "Content-Type": "application/json" } }));
    render(<ProjectExportButton projectId="0123456789abcdef01234567" />); fireEvent.click(screen.getByRole("button", { name: "Export project record" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("no longer have access"));
    expect(screen.getByRole("button", { name: "Try export again" })).toBeEnabled();
  });
});
