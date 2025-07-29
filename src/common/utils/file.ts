import fs from "fs";

import { File } from "@retrotv/file";

export class FileUtils {
    public static getSafeFilename(originalName: string, userAgent?: string): string {
        const encodedFilename = encodeURIComponent(originalName);

        // User-Agent 기반 브라우저 감지
        const isIE = userAgent?.includes("MSIE") || userAgent?.includes("Trident");

        let fallbackName: string;
        if (isIE) {
            // IE용 특별 처리: URL 인코딩 시도
            fallbackName = this.getIECompatibleName(originalName);
        } else {
            // 기본 ASCII 변환
            fallbackName = originalName.replace(/[^\u0020-\u007E]/g, "_");
        }

        return `attachment; filename*=UTF-8''${encodedFilename}; filename="${fallbackName}"`;
    }

    private static getIECompatibleName(originalName: string): string {
        // IE는 URL 인코딩된 파일명을 filename에서도 부분적으로 지원
        try {
            return encodeURIComponent(originalName).substring(0, 100); // 길이 제한
        } catch {
            return originalName.replace(/[^\u0020-\u007E]/g, "_");
        }
    }

    public static getHash(filePath: string): string {
        const file = new File(filePath);

        if (file.isFile()) {
            return file.getHash("sha256");
        }

        return "";
    }

    public static mkdir(...dirs: string[]): void {
        dirs.forEach(dir => {
            if (fs.existsSync(dir)) {
                return;
            }

            fs.mkdirSync(dir, { recursive: true });
        });
    }
}
