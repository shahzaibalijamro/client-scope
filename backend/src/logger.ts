type LogLevel = "info" | "warn" | "error";
type SafeDiagnosticValue = string | number | boolean | null | undefined;

export function logDiagnostic(
  level: LogLevel,
  event: string,
  fields: Readonly<Record<string, SafeDiagnosticValue>> = {},
): void {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  });

  if (level === "error") {
    console.error(entry);
    return;
  }

  if (level === "warn") {
    console.warn(entry);
    return;
  }

  console.info(entry);
}
