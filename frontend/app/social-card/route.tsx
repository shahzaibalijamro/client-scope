import { ImageResponse } from "next/og";

export function GET() {
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", background: "#f8fafc", color: "#0f172a", padding: 64, fontFamily: "sans-serif", flexDirection: "column", justifyContent: "space-between" }}>
    <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#4f46e5" }}>ClientScope</div>
    <div style={{ display: "flex", flexDirection: "column" }}><div style={{ display: "flex", fontSize: 82, fontWeight: 700, letterSpacing: -4 }}>Clear work.</div><div style={{ display: "flex", fontSize: 82, fontWeight: 700, letterSpacing: -4, color: "#4f46e5" }}>Clear decisions.</div></div>
    <div style={{ display: "flex", gap: 20, fontSize: 22, color: "#475569" }}>{["Scope", "Review", "Approval", "History"].map((text) => <div key={text} style={{ display: "flex", padding: "14px 22px", background: "white", border: "1px solid #e2e8f0", borderRadius: 12 }}>{text}</div>)}</div>
  </div>, { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400" } });
}
