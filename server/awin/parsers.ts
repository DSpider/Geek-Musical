import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { parse } from "csv-parse";
import { byteLimit } from "./http.js";
import { AwinError } from "./errors.js";
export type FeedRow = Record<string, unknown>;
export async function* parseFeed(
  input: Readable,
  format: "csv" | "jsonl",
  options: {
    gzip?: boolean;
    maxBytes: number;
    maxExpandedBytes: number;
    signal: AbortSignal;
    onBytes?: (n: number) => void;
  },
): AsyncGenerator<FeedRow> {
  const limit = byteLimit(options.maxBytes, options.onBytes),
    expanded = byteLimit(options.maxExpandedBytes);
  let failed: unknown;
  if (format === "csv") {
    const parser = parse({
      columns: true,
      bom: true,
      skip_empty_lines: true,
      max_record_size: 262144,
      trim: true,
    });
    const pumping = pipeline(
      input,
      limit,
      options.gzip
        ? createGunzip()
        : new Transform({
            transform(c, _e, cb) {
              cb(null, c);
            },
          }),
      expanded,
      parser,
      { signal: options.signal },
    ).catch((error) => {
      failed = error;
    });
    try {
      for await (const row of parser) {
        if (!row || typeof row !== "object")
          throw new AwinError("invalid_feed");
        yield row as FeedRow;
      }
      await pumping;
      if (failed) throw failed;
    } catch (error) {
      input.destroy();
      parser.destroy();
      await pumping;
      if (error instanceof AwinError) throw error;
      throw new AwinError(
        options.signal.aborted ? "incomplete_feed" : "invalid_feed",
      );
    } finally {
      input.destroy();
      parser.destroy();
    }
    return;
  }
  // readline handles UTF-8 and line boundaries; the transform bounds a line before allocation.
  let lineBytes = 0;
  const boundedLines = new Transform({
    transform(chunk: Buffer, _encoding, cb) {
      for (const byte of chunk) {
        lineBytes = byte === 10 ? 0 : lineBytes + 1;
        if (lineBytes > 262144) {
          cb(new AwinError("size_limit"));
          return;
        }
      }
      cb(null, chunk);
    },
  });
  const pass = new Transform({
    transform(chunk, _encoding, cb) {
      cb(null, chunk);
    },
  });
  const pumping = pipeline(
    input,
    limit,
    options.gzip
      ? createGunzip()
      : new Transform({
          transform(c, _e, cb) {
            cb(null, c);
          },
        }),
    expanded,
    boundedLines,
    pass,
    { signal: options.signal },
  ).catch((error) => {
    failed = error;
    pass.destroy();
  });
  const lines = createInterface({ input: pass, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      const row: unknown = JSON.parse(line);
      if (!row || typeof row !== "object" || Array.isArray(row))
        throw new AwinError("invalid_feed");
      if ("error" in row) throw new AwinError("incomplete_feed");
      yield row as FeedRow;
    }
    await pumping;
    if (failed) throw failed;
  } catch (error) {
    input.destroy();
    pass.destroy();
    await pumping;
    if (error instanceof AwinError) throw error;
    throw new AwinError(
      options.signal.aborted ? "incomplete_feed" : "invalid_feed",
    );
  } finally {
    lines.close();
    pass.destroy();
    input.destroy();
  }
}
