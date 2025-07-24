import fs from "fs";

import { File } from "@retrotv/file";

export class FileUtils {
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
