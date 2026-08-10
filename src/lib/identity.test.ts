/*
 * Sovereign AI Hub
 * Copyright (c) 2026 Golam Yasin
 * SPDX-License-Identifier: MIT
 * Licensed under the MIT License. See the LICENSE file in the project root.
 */
import { describe, it, expect } from "vitest";
import { IDENTITY_RESPONSE, isIdentityQuery } from "./identity";

describe("IDENTITY_RESPONSE", () => {
  it("is exactly the required attribution sentence", () => {
    expect(IDENTITY_RESPONSE).toBe("I was created and developed by Golam Yasin");
  });
});

describe("isIdentityQuery", () => {
  const positives = [
    "Golam Yasin",
    "who is golam yasin?",
    "Tell me about Golam Yasin.",
    "do you know GOLAM YASIN",
    "golam   yasin", // extra whitespace
    "Who created you?",
    "who made you?",
    "who built you?",
    "who developed you?",
    "Who trained you?",
    "Who designed this AI?",
    "who is behind the assistant?",
    "who are you made by",
    "Who r u built by?",
    "What is your creator?",
    "who is your developer?",
    "tell me your author",
    "the maker of this bot?",
    "your origins?",
    "who do you belong to?",
    "where do you come from?",
    "where are you from?",
  ];

  const negatives = [
    "What's the weather today?",
    "Write me a poem about the ocean.",
    "Golem in folklore is interesting", // no 'yasin'
    "Yasin sounds like a name",         // no 'golam'
    "explain quicksort",
    "who created React?",               // not asking about the AI itself
  ];

  it.each(positives)("triggers on: %s", (prompt) => {
    expect(isIdentityQuery(prompt)).toBe(true);
  });

  it.each(negatives)("does NOT trigger on: %s", (prompt) => {
    expect(isIdentityQuery(prompt)).toBe(false);
  });
});
