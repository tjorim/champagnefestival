import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportToCsv } from "./csvExport";

// Helpers to capture what was written to the DOM anchor and Blob
function capturedCsvContent(): string {
  // The Blob constructor is mocked; retrieve the first argument passed to it.
  const blobCalls = (globalThis.Blob as unknown as ReturnType<typeof vi.fn>).mock
    .calls;
  const lastCall = blobCalls[blobCalls.length - 1] as [BlobPart[], BlobPropertyBag];
  const parts = lastCall[0];
  // Concatenate all string parts (BOM + CSV)
  return parts.join("");
}

// exportToCsv removes the anchor immediately after clicking it, so we capture
// it via the appendChild spy set up in beforeEach.
let _lastAnchorEl: HTMLAnchorElement | null = null;
function capturedFilename(): string {
  return _lastAnchorEl?.download ?? "";
}

describe("exportToCsv", () => {
  let originalBlob: typeof globalThis.Blob;
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;
  let originalRequestAnimationFrame: typeof globalThis.requestAnimationFrame;

  beforeEach(() => {
    _lastAnchorEl = null;
    // Capture the anchor element before exportToCsv removes it from the DOM.
    // Node.prototype.appendChild is the real implementation we delegate to.
    const realAppendChild = Node.prototype.appendChild.bind(document.body);
    vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
      if (node instanceof HTMLAnchorElement) _lastAnchorEl = node;
      return realAppendChild(node);
    });

    // Mock Blob so we can inspect what CSV string was built
    originalBlob = globalThis.Blob;
    // Use a regular function (not arrow) so it can be invoked with `new`
    const BlobMock = vi.fn().mockImplementation(function (
      parts: BlobPart[],
      options: BlobPropertyBag,
    ) {
      return { parts, options, size: 0, type: options?.type ?? "" };
    });
    globalThis.Blob = BlobMock as unknown as typeof Blob;

    originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");

    originalRevokeObjectURL = URL.revokeObjectURL;
    URL.revokeObjectURL = vi.fn();

    // Run requestAnimationFrame callbacks synchronously so revokeObjectURL is called
    originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn().mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    globalThis.Blob = originalBlob;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    // Remove any anchors left in the DOM
    document.body.querySelectorAll("a").forEach((a) => a.remove());
    vi.restoreAllMocks();
  });

  describe("early return", () => {
    it("does nothing when rows array is empty", () => {
      exportToCsv("test.csv", []);
      expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it("does not append an anchor when rows is empty", () => {
      exportToCsv("test.csv", []);
      expect(document.body.querySelector("a")).toBeNull();
    });
  });

  describe("filename", () => {
    it("sets the download attribute to the provided filename", () => {
      exportToCsv("export.csv", [{ name: "Alice" }]);
      expect(capturedFilename()).toBe("export.csv");
    });

    it("preserves filenames with spaces", () => {
      exportToCsv("my export file.csv", [{ name: "Bob" }]);
      expect(capturedFilename()).toBe("my export file.csv");
    });
  });

  describe("UTF-8 BOM", () => {
    it("prepends a UTF-8 BOM so Excel detects encoding correctly", () => {
      exportToCsv("out.csv", [{ value: "test" }]);
      expect(capturedCsvContent()).toMatch(/^\uFEFF/);
    });
  });

  describe("headers", () => {
    it("uses object keys as headers in the first row", () => {
      exportToCsv("out.csv", [{ firstName: "Alice", lastName: "Smith" }]);
      const csv = capturedCsvContent();
      const lines = csv.replace("\uFEFF", "").split("\r\n");
      expect(lines[0]).toBe('"firstName","lastName"');
    });

    it("derives headers from the first row only", () => {
      exportToCsv("out.csv", [
        { a: "1", b: "2" },
        { a: "3", b: "4", c: "5" }, // extra key ignored
      ]);
      const csv = capturedCsvContent();
      const lines = csv.replace("\uFEFF", "").split("\r\n");
      expect(lines[0]).toBe('"a","b"');
    });
  });

  describe("CRLF line endings", () => {
    it("separates lines with CRLF per RFC 4180", () => {
      exportToCsv("out.csv", [{ a: "1" }, { a: "2" }]);
      const csv = capturedCsvContent().replace("\uFEFF", "");
      expect(csv).toContain("\r\n");
      expect(csv.split("\r\n")).toHaveLength(3); // header + 2 data rows
    });
  });

  describe("value escaping", () => {
    it("wraps all values in double quotes", () => {
      exportToCsv("out.csv", [{ col: "hello" }]);
      const csv = capturedCsvContent().replace("\uFEFF", "");
      const lines = csv.split("\r\n");
      expect(lines[1]).toBe('"hello"');
    });

    it("escapes internal double quotes by doubling them", () => {
      exportToCsv("out.csv", [{ quote: 'say "hello"' }]);
      const csv = capturedCsvContent().replace("\uFEFF", "");
      const lines = csv.split("\r\n");
      expect(lines[1]).toBe('"say ""hello"""');
    });

    it("preserves commas inside values (wrapped in quotes)", () => {
      exportToCsv("out.csv", [{ address: "Main St, 42" }]);
      const csv = capturedCsvContent().replace("\uFEFF", "");
      const lines = csv.split("\r\n");
      expect(lines[1]).toBe('"Main St, 42"');
    });

    it("preserves newlines inside values", () => {
      exportToCsv("out.csv", [{ note: "line1\nline2" }]);
      const csv = capturedCsvContent().replace("\uFEFF", "");
      // The value itself contains a newline, wrapped in quotes
      expect(csv).toContain('"line1\nline2"');
    });

    it("converts numeric values to strings", () => {
      exportToCsv("out.csv", [{ count: 42 }]);
      const csv = capturedCsvContent().replace("\uFEFF", "");
      const lines = csv.split("\r\n");
      expect(lines[1]).toBe('"42"');
    });

    it("converts boolean true to string", () => {
      exportToCsv("out.csv", [{ active: true }]);
      const csv = capturedCsvContent().replace("\uFEFF", "");
      const lines = csv.split("\r\n");
      expect(lines[1]).toBe('"true"');
    });

    it("converts boolean false to string", () => {
      exportToCsv("out.csv", [{ active: false }]);
      const csv = capturedCsvContent().replace("\uFEFF", "");
      const lines = csv.split("\r\n");
      expect(lines[1]).toBe('"false"');
    });

    it("converts null to empty string", () => {
      exportToCsv("out.csv", [{ note: null }]);
      const csv = capturedCsvContent().replace("\uFEFF", "");
      const lines = csv.split("\r\n");
      expect(lines[1]).toBe('""');
    });

    it("converts undefined to empty string", () => {
      exportToCsv("out.csv", [{ note: undefined }]);
      const csv = capturedCsvContent().replace("\uFEFF", "");
      const lines = csv.split("\r\n");
      expect(lines[1]).toBe('""');
    });
  });

  describe("formula injection prevention", () => {
    it("prefixes values starting with = with a single quote", () => {
      exportToCsv("out.csv", [{ formula: "=SUM(A1:A10)" }]);
      const csv = capturedCsvContent().replace("\uFEFF", "");
      const lines = csv.split("\r\n");
      expect(lines[1]).toBe('"\'=SUM(A1:A10)"');
    });

    it("prefixes values starting with + with a single quote", () => {
      exportToCsv("out.csv", [{ val: "+100" }]);
      const csv = capturedCsvContent().replace("\uFEFF", "");
      const lines = csv.split("\r\n");
      expect(lines[1]).toBe('"\'+ 100"'.replace("+ 1", "+1")); // build expected directly
      const actual = csv.split("\r\n")[1];
      expect(actual).toBe(`"'+100"`);
    });

    it("prefixes values starting with - with a single quote", () => {
      exportToCsv("out.csv", [{ val: "-1" }]);
      const csv = capturedCsvContent().replace("\uFEFF", "");
      expect(csv.split("\r\n")[1]).toBe(`"'-1"`);
    });

    it("prefixes values starting with @ with a single quote", () => {
      exportToCsv("out.csv", [{ val: "@username" }]);
      const csv = capturedCsvContent().replace("\uFEFF", "");
      expect(csv.split("\r\n")[1]).toBe(`"'@username"`);
    });

    it("prefixes values starting with tab with a single quote", () => {
      exportToCsv("out.csv", [{ val: "\tcell" }]);
      const csv = capturedCsvContent().replace("\uFEFF", "");
      expect(csv.split("\r\n")[1]).toBe(`"'\tcell"`);
    });

    it("does not prefix normal text values", () => {
      exportToCsv("out.csv", [{ val: "Alice" }]);
      const csv = capturedCsvContent().replace("\uFEFF", "");
      expect(csv.split("\r\n")[1]).toBe('"Alice"');
    });

    it("does not prefix numeric string that starts with a digit", () => {
      exportToCsv("out.csv", [{ val: "123" }]);
      const csv = capturedCsvContent().replace("\uFEFF", "");
      expect(csv.split("\r\n")[1]).toBe('"123"');
    });
  });

  describe("multiple rows", () => {
    it("renders one header row plus one data row per object", () => {
      const rows = [
        { name: "Alice", age: 30 },
        { name: "Bob", age: 25 },
        { name: "Carol", age: 35 },
      ];
      exportToCsv("out.csv", rows);
      const csv = capturedCsvContent().replace("\uFEFF", "");
      const lines = csv.split("\r\n");
      expect(lines).toHaveLength(4); // header + 3 data
      expect(lines[0]).toBe('"name","age"');
      expect(lines[1]).toBe('"Alice","30"');
      expect(lines[2]).toBe('"Bob","25"');
      expect(lines[3]).toBe('"Carol","35"');
    });
  });

  describe("DOM interaction", () => {
    it("creates and removes an anchor from the document body", () => {
      // Spy on click to prevent navigation
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

      exportToCsv("out.csv", [{ x: "1" }]);

      // After the call the anchor should have been removed
      expect(document.body.querySelector("a")).toBeNull();

      clickSpy.mockRestore();
    });

    it("calls URL.createObjectURL once per export", () => {
      exportToCsv("out.csv", [{ x: "1" }]);
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    });

    it("defers revokeObjectURL via requestAnimationFrame", () => {
      exportToCsv("out.csv", [{ x: "1" }]);
      expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    });

    it("creates a Blob with the correct MIME type", () => {
      exportToCsv("out.csv", [{ x: "1" }]);
      const blobCalls = (globalThis.Blob as unknown as ReturnType<typeof vi.fn>).mock.calls;
      const lastOptions = blobCalls[blobCalls.length - 1]![1] as BlobPropertyBag;
      expect(lastOptions.type).toBe("text/csv;charset=utf-8;");
    });
  });

  describe("special characters in headers", () => {
    it("escapes double quotes in header names", () => {
      exportToCsv("out.csv", [{ 'col "A"': "value" }]);
      const csv = capturedCsvContent().replace("\uFEFF", "");
      expect(csv.split("\r\n")[0]).toBe('"col ""A"""');
    });

    it("handles commas in header names", () => {
      exportToCsv("out.csv", [{ "last, first": "Smith, John" }]);
      const csv = capturedCsvContent().replace("\uFEFF", "");
      const lines = csv.split("\r\n");
      expect(lines[0]).toBe('"last, first"');
      expect(lines[1]).toBe('"Smith, John"');
    });
  });
});
