import fs from "fs";
import path from "path";

import { UploadSession } from "src/common/types/file";
import { generateChunkName } from "src/common/utils/generator";

export const merge = (session: UploadSession, outputPath: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(outputPath);
        let currentChunk = 0;

        const writeNextChunk = (): void => {
            if (currentChunk >= session.totalChunks) {
                writeStream.end();
                resolve();
                return;
            }

            const chunkPath = path.join(session.tempDir, generateChunkName(currentChunk));

            if (!fs.existsSync(chunkPath)) {
                writeStream.destroy();
                reject(new Error(`Missing chunk file: ${currentChunk}`));
                return;
            }

            const readStream = fs.createReadStream(chunkPath);

            readStream.on("end", () => {
                currentChunk++;
                setImmediate(writeNextChunk); // 비동기적으로 다음 청크 처리
            });

            readStream.on("error", error => {
                writeStream.destroy();
                reject(error);
            });

            readStream.pipe(writeStream, { end: false });
        };

        writeStream.on("error", reject);
        writeNextChunk();
    });
};
