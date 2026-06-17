import { describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as path from "path";

describe("MainLayout Custom Command Sheet Styling", () => {
  it("should style the KeyboardAvoidingView wrapping bottomSheet in the Create Custom Command Modal", () => {
    const filePath = path.join(__dirname, "../MainLayout.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // Locate the CREATE CUSTOM COMMAND SHEET modal section.
    const startToken = "{/* CREATE CUSTOM COMMAND SHEET */}";
    const startIndex = content.indexOf(startToken);
    expect(startIndex).not.toBe(-1);

    const sheetContent = content.substring(startIndex, startIndex + 1000);

    // Find the KeyboardAvoidingView inside this block
    const kavRegex = /<KeyboardAvoidingView[^>]*>/;
    const match = sheetContent.match(kavRegex);
    expect(match).not.toBeNull();

    const kavTag = match![0];
    console.log("Found KeyboardAvoidingView tag:", kavTag);

    // Assert that the tag contains style containing flex: 1 and width: "100%"
    expect(kavTag).toContain("style=");
    expect(kavTag).toMatch(/style=\{\s*\{\s*flex:\s*1,\s*width:\s*(['"])100%\1\s*\}\s*\}/);
  });
});
