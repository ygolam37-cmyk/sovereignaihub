import { describe, it, expect } from "vitest";
import { stripPII, identityFirewall } from "./privacy";

describe("stripPII — outbound before any model call", () => {
  it("redacts email addresses", () => {
    const out = stripPII("Contact me at jane.doe+test@example.co.uk please");
    expect(out).not.toMatch(/jane\.doe/);
    expect(out).not.toMatch(/example\.co\.uk/);
    expect(out).toContain("[email]");
  });

  it("redacts multiple emails in the same string", () => {
    const out = stripPII("a@b.com and c.d@e.io");
    expect(out).not.toMatch(/@/);
    expect(out.match(/\[email\]/g)?.length).toBe(2);
  });

  it("redacts international phone numbers", () => {
    const out = stripPII("Call +1 (415) 555-2671 anytime");
    expect(out).not.toMatch(/555/);
    expect(out).toContain("[phone]");
  });

  it("redacts Indian Aadhaar numbers (12 digits, spaced or joined)", () => {
    expect(stripPII("Aadhaar: 1234 5678 9012")).toContain("[id]");
    expect(stripPII("Aadhaar: 1234-5678-9012")).toContain("[id]");
    expect(stripPII("Aadhaar: 123456789012")).toContain("[id]");
    expect(stripPII("Aadhaar: 1234 5678 9012")).not.toMatch(/1234\s?5678/);
  });

  it("redacts US SSN patterns", () => {
    const out = stripPII("SSN 123-45-6789 on file");
    expect(out).not.toMatch(/123-45-6789/);
    expect(out).toContain("[ssn]");
  });

  it("redacts credit-card-like numbers", () => {
    const out = stripPII("card 4111 1111 1111 1111 exp 12/29");
    expect(out).not.toMatch(/4111/);
    expect(out).toContain("[card]");
  });

  it("redacts street addresses", () => {
    const out = stripPII("I live at 221 Baker Street, London");
    expect(out).not.toMatch(/221 Baker/);
    expect(out).toContain("[address]");
  });

  it("redacts self-introductions with names", () => {
    expect(stripPII("Hi, my name is Alice Johnson")).toMatch(/\[name\]/i);
    expect(stripPII("I am Robert De Niro")).toMatch(/\[name\]/i);
    expect(stripPII("I'm Sara Ali Khan and I need help")).toMatch(/\[name\]/i);
    expect(stripPII("Hi, my name is Alice Johnson")).not.toMatch(/Alice Johnson/);
  });

  it("can disable name-intro scrubbing when needed", () => {
    const out = stripPII("my name is Alice Johnson", { scrubNameIntros: false });
    expect(out).toContain("Alice Johnson");
  });

  it("leaves innocuous text untouched", () => {
    const text = "Explain how photosynthesis works in one paragraph.";
    expect(stripPII(text)).toBe(text);
  });

  it("handles empty / null-like inputs safely", () => {
    expect(stripPII("")).toBe("");
  });

  it("strips a compound payload containing every identifier at once", () => {
    const input =
      "My name is Alice Smith, email alice@acme.com, phone +44 20 7946 0958, " +
      "Aadhaar 1234 5678 9012, SSN 987-65-4321, card 4111 1111 1111 1111, " +
      "address 742 Evergreen Terrace";
    const out = stripPII(input);
    expect(out).not.toMatch(/Alice Smith/);
    expect(out).not.toMatch(/alice@acme\.com/);
    expect(out).not.toMatch(/7946 0958/);
    expect(out).not.toMatch(/1234 5678 9012/);
    expect(out).not.toMatch(/987-65-4321/);
    expect(out).not.toMatch(/4111 1111/);
    expect(out).not.toMatch(/742 Evergreen/);
    for (const token of ["[name]", "[email]", "[phone]", "[id]", "[ssn]", "[card]", "[address]"]) {
      expect(out).toContain(token);
    }
  });
});

describe("identityFirewall — inbound scrub of model output", () => {
  it("is the same PII scrubber applied to responses", () => {
    const dirty = "Sure — reach the developer at dev@example.com or 1234 5678 9012.";
    const clean = identityFirewall(dirty);
    expect(clean).not.toMatch(/dev@example\.com/);
    expect(clean).not.toMatch(/1234 5678 9012/);
    expect(clean).toContain("[email]");
    expect(clean).toContain("[id]");
  });
});
