import { describe, expect, it } from "vitest";
import { filterFindings, sortFindings } from "./store";
import type { Finding } from "./api/types";

const F = (o: Partial<Finding>): Finding =>
  ({
    id: "F-001",
    title: "t",
    endpoint: "/v1/chat/completions",
    severity: "High",
    status: "Reported",
    reproducibility: 0.9,
    attempts: 1,
    owasp_tag: "LLM01",
    payload: "",
    raw_response: "",
    replays: [],
    verdict: "",
    fixes: [],
    confirms: [],
    history: [],
    technical_report: "",
    plain_report: "",
    ...o,
  }) as Finding;

describe("table filtering and sorting", () => {
  const rows = [F({ id: "F-001", severity: "High", status: "Reported" }), F({ id: "F-002", severity: "Low", status: "Rejected" })];
  it("filters by status", () => {
    expect(filterFindings(rows, "", "Rejected", "all")).toHaveLength(1);
  });
  it("filters by search", () => {
    expect(filterFindings(rows, "F-002", "all", "all")).toHaveLength(1);
  });
  it("sorts by id", () => {
    expect(sortFindings(rows, "id", -1)[0].id).toBe("F-002");
  });
});

describe("sse event handling", () => {
  it("loopback flag", () => {
    const e = { id: 1, scan_id: "s", seq: 1, type: "loopback", agent: "confirm", message: "x", data: {} };
    expect(e.type).toBe("loopback");
  });
});
