import { expect, test, describe } from "bun:test";
import { rotatePlayers } from "src/service";

describe("Rotation", () => {
    test("End of match 1:", () => {
        // For clean testing, mockPlayers will be created once for each test case
        const mockPlayers = [
            "Blue-Offensive",
            "Blue-Defensive",
            "Red-Offensive",
            "Red-Defensive"
        ]

        // 1 is the number of matches on the database
        const resultConstellation = rotatePlayers(mockPlayers, 1);

        // Red defensive should stay on the same place, and the rest should move once.
        const expectedConstellation = {
            blue_offensive: "Red-Offensive", // Now playing as blue offensive
            blue_defensive: "Blue-Offensive", // Now playing as blue defensive
            red_offensive: "Blue-Defensive", // Now playing as red offensive
            red_defensive: "Red-Defensive" // Still playing as red defensive
        };

        expect(resultConstellation).toEqual(expectedConstellation);
    });

    test("End of match 2:", () => {
        const mockPlayers = [
            "Blue-Offensive",
            "Blue-Defensive",
            "Red-Offensive",
            "Red-Defensive"
        ]

        const resultConstellation = rotatePlayers(mockPlayers, 2);

        // It's the end of the second match, everyone should move once.
        const expectedConstellation = {
            blue_offensive: "Red-Defensive", // Now playing as blue offensive
            blue_defensive: "Blue-Offensive", // Now playing as blue defensive
            red_offensive: "Blue-Defensive", // Now playing as red offensive
            red_defensive: "Red-Offensive", // Now playing as red defensive
        };

        expect(resultConstellation).toEqual(expectedConstellation);
    });

    test("End of match 3:", () => {
        const mockPlayers = [
            "Blue-Offensive",
            "Blue-Defensive",
            "Red-Offensive",
            "Red-Defensive"
        ]

        const resultConstellation = rotatePlayers(mockPlayers, 3);

        // It's the end of the third match, blue defensive is staying while everyone else is moving once.
        const expectedConstellation = {
            blue_offensive: "Red-Defensive", // Now playing as blue offensive
            blue_defensive: "Blue-Defensive", // Still playing as blue defensive
            red_offensive: "Blue-Offensive", // Now playing as red offensive
            red_defensive: "Red-Offensive", // Now playing as red defensive
        }

        expect(resultConstellation).toEqual(expectedConstellation);
    });
});