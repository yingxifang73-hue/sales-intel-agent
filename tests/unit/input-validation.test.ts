import { describe, expect, it } from "vitest";
import { validateSellerProductName } from "@/lib/input-validation";

describe("seller product input validation", () => {
  it("rejects a URL accidentally entered as the seller product", () => {
    expect(validateSellerProductName("https://www.geely.com", "https://www.geely.com/about")).toContain("不能填写目标公司官网");
  });

  it("allows a normal product name", () => {
    expect(validateSellerProductName("乳制品无菌包装材料", "https://www.geely.com")).toBeUndefined();
  });
});
