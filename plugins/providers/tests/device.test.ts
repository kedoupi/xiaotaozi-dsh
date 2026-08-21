import { describe, expect, it } from "vitest";
import { describeDevice } from "../src/device.ts";

describe("describeDevice", () => {
  it("names this machine in Chinese", () => {
    expect(describeDevice("Darwin")).toBe("这台 Mac");
    expect(describeDevice("Windows_NT")).toBe("这台 Windows");
    expect(describeDevice("Linux")).toBe("这台电脑");
  });
});
