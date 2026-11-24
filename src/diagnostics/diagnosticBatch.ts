import type { DiagnosticFlushResult } from "./diagnosticTypes.ts";

/** 诊断记录的有界批次；待写计数包含正在追加的记录。 */
export class DiagnosticBatch {
  private lines: { id: number; line: string }[] = [];
  private accepted = 0;
  private boundary = 0;
  private inFlight: Promise<DiagnosticFlushResult> | null = null;
  writeFailures = 0;
  droppedRecords = 0;

  constructor(private readonly limit: number) {}

  get pending(): number { return this.lines.length; }

  record(line: string): void {
    if (this.pending >= this.limit) this.droppedRecords++;
    else this.lines.push({ id: ++this.accepted, line });
  }

  flush(write: (lines: string) => Promise<unknown>): Promise<DiagnosticFlushResult> {
    this.boundary = this.accepted;
    if (this.inFlight) return this.inFlight;
    if (this.pending === 0) return Promise.resolve({ failed: 0, flushed: 0, pending: 0, writeFailures: this.writeFailures, droppedRecords: this.droppedRecords });
    const operation = this.drain(write);
    this.inFlight = operation;
    void operation.then(() => { if (this.inFlight === operation) this.inFlight = null; });
    return operation;
  }

  private async drain(write: (lines: string) => Promise<unknown>): Promise<DiagnosticFlushResult> {
    let failed = 0;
    let flushed = 0;
    while (this.lines.length > 0 && this.lines[0].id <= this.boundary) {
      const batch = this.lines.filter(entry => entry.id <= this.boundary);
      try {
        await write(`${batch.map(entry => entry.line).join("\n")}\n`);
        this.lines.splice(0, batch.length);
        flushed += batch.length;
      } catch {
        this.writeFailures++;
        failed++;
        break;
      }
    }
    return { failed, flushed, pending: this.pending, writeFailures: this.writeFailures, droppedRecords: this.droppedRecords };
  }
}
