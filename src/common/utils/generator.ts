import crypto from "crypto";
import { v7 as uuidv7 } from "uuid";

export const generateSessionId = (): string => {
    return `${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
};

export const generateUuidV7 = (): string => {
    return uuidv7();
};

export const generateChunkName = (currentChunk: number): string => {
    return `chunk_${currentChunk.toString().padStart(6, "0")}`;
};
