import { describe, expect, it } from "vitest";

import {
    enrichApiErrorMessage,
    formatValidationDetails
} from "../../../packages/nodejs/shared/src/util/formatValidationDetails";

describe("formatValidationDetails", () => {
    it("formats Zod issues with dotted paths", () => {
        expect(formatValidationDetails([
            {
                path: ["services", "web", "image"],
                message: "Required"
            }
        ])).toBe("services.web.image: Required");
    });

    it("formats Fastify validation issues", () => {
        expect(formatValidationDetails({
            validation: [
                {
                    instancePath: "/manifest",
                    message: "must NOT have fewer than 1 characters"
                }
            ],
            validationContext: "body"
        })).toBe("manifest: must NOT have fewer than 1 characters");
    });

    it("enriches generic validation messages", () => {
        expect(enrichApiErrorMessage("Validation failed.", [
            {
                path: ["name"],
                message: "Required"
            }
        ])).toBe("Validation failed: name: Required");
    });
});
