import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { jest } from "@jest/globals";
import { SourceMapGenerator } from "source-map";
import { logger } from "../../logger";
import { createRuntimeStdioHandler } from "../miniflare";

describe("createRuntimeStdioHandler", () => {
        let tempDir: string;

        beforeEach(() => {
                tempDir = mkdtempSync(path.join(tmpdir(), "runtime-stdio-"));
        });

        afterEach(() => {
                jest.restoreAllMocks();
                rmSync(tempDir, { recursive: true, force: true });
        });

        it("maps startup error stack traces using source maps", async () => {
                const sourceDir = path.join(tempDir, "src");
                mkdirSync(sourceDir, { recursive: true });
                const sourcePath = path.join(sourceDir, "index.ts");
                const sourceContents = [
                        "export function fail() {",
                        "  throw new Error('boom');",
                        "}",
                        "fail();",
                        "",
                ].join("\n");
                writeFileSync(sourcePath, sourceContents);

                const generator = new SourceMapGenerator({ file: "index.js" });
                generator.addMapping({
                        generated: { line: 1, column: 6 },
                        original: { line: 2, column: 2 },
                        source: sourcePath,
                        name: "fail",
                });
                generator.setSourceContent(sourcePath, sourceContents);
                const mapPath = path.join(tempDir, "index.js.map");
                writeFileSync(mapPath, generator.toString());

                const stdout = new PassThrough();
                const stderr = new PassThrough();

                const handler = createRuntimeStdioHandler({
                        logger,
                        sourceMapPath: mapPath,
                        sourceMapMetadata: {
                                tmpDir: path.join(tempDir, "tmp"),
                                entryDirectory: tempDir,
                        },
                        entryDirectory: tempDir,
                });

                const loggerSpy = jest.spyOn(logger, "error").mockImplementation(() => {});
                const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
                const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});

                handler(stdout, stderr);

                const closePromise = new Promise<void>((resolve) => stderr.on("close", resolve));

                stderr.write("service core:user:: Uncaught Error: boom\n");
                stderr.write("  at index.js:1:7\n");
                stderr.end();

                await closePromise;
                await new Promise((resolve) => setImmediate(resolve));

                expect(loggerSpy).toHaveBeenCalledTimes(1);
                const [loggedMessage] = loggerSpy.mock.calls[0];
                expect(String(loggedMessage)).toContain("src/index.ts:2:3");
                expect(String(loggedMessage)).toContain("throw new Error('boom');");

                consoleErrorSpy.mockRestore();
                consoleLogSpy.mockRestore();
        });
});
