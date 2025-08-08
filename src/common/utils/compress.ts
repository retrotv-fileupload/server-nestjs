// src/common/utils/compression.ts
import { createGzip, createDeflate, createBrotliCompress } from "zlib";
import { Transform } from "stream";

// 압축이 효과적인 파일 타입
const COMPRESSIBLE_TYPES = [
    "text/",
    "application/json",
    "application/javascript",
    "application/xml",
    "application/svg+xml",
    "application/pdf",
];

// 압축하지 않을 파일 타입 (이미 압축된 포맷)
const NON_COMPRESSIBLE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "video/",
    "audio/",
    "application/zip",
    "application/rar",
    "application/7z",
    "application/gzip",
];

/**
 * 파일 타입이 압축 가능한지 확인
 */
export const shouldCompress = (mimeType: string, fileSize: number): boolean => {
    // 1KB 이하는 압축하지 않음
    if (fileSize <= 1024) {
        return false;
    }

    // 이미 압축된 포맷은 제외
    if (NON_COMPRESSIBLE_TYPES.some(type => mimeType.startsWith(type))) {
        return false;
    }

    // 압축 효과적인 타입이거나 기타 타입은 압축
    return (
        COMPRESSIBLE_TYPES.some(type => mimeType.startsWith(type)) ||
        (!mimeType.startsWith("image/") && !mimeType.startsWith("video/"))
    );
};

/**
 * 최적의 압축 방식 선택
 */
export const getBestCompression = (
    acceptEncoding: string,
): {
    encoding: string;
    stream: Transform;
} | null => {
    if (acceptEncoding.includes("br")) {
        // Brotli 압축 (가장 효율적)
        return {
            encoding: "br",
            stream: createBrotliCompress({
                params: {
                    [require("zlib").constants.BROTLI_PARAM_QUALITY]: 4,
                },
            }),
        };
    } else if (acceptEncoding.includes("gzip")) {
        // GZIP 압축
        return {
            encoding: "gzip",
            stream: createGzip({ level: 6 }),
        };
    } else if (acceptEncoding.includes("deflate")) {
        // Deflate 압축
        return {
            encoding: "deflate",
            stream: createDeflate({ level: 6 }),
        };
    }

    return null;
};
