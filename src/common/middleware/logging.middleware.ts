import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { LogData } from "src/common/types/log";
import { prettyJsonPrint, removeIndentation } from "src/common/utils/string";

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
    private readonly logger = new Logger(LoggingMiddleware.name);

    use(req: Request, res: Response, next: NextFunction): void {
        const logData: LogData = {
            method: req.method,
            url: req.originalUrl,
            ip: req.ip,
            headers: req.headers,
            userAgent: req.get("user-agent") || "",
            startTime: Date.now(),
        };

        this.logRequest(req, logData);
        this.logResponse(res, logData);

        next();
    }

    // Request 로깅
    private logRequest(req: Request, logData: LogData): void {
        this.logger.debug(
            removeIndentation(`
                [ REQUEST ]
                Method: ${logData.method}
                URL: ${logData.url}
                IP: ${logData.ip}
                User-Agent: ${logData.userAgent}
                Content-Type: ${logData.headers["content-type"]?.split(";")[0] || "N/A"}
                Content-Length: ${logData.headers["content-length"] || "N/A"}
            `),
        );

        // Request Body 로깅 (POST, PUT, PATCH인 경우), /api/files/upload/chunk 제외
        if (!["/api/files/upload/chunk"].includes(logData.url) && ["POST", "PUT", "PATCH"].includes(logData.method)) {
            let body = "";
            req.on("data", chunk => {
                body += chunk.toString();
            });

            req.on("end", () => {
                if (body) {
                    this.logger.debug(
                        removeIndentation(`
                            [ REQUEST BODY ]
                            ${prettyJsonPrint(body)}
                        `),
                    );
                }
            });
        } else if (["/api/files/upload/chunk"].includes(logData.url)) {
            let body = "";
            req.on("data", chunk => {
                body += chunk.toString();
            });

            req.on("end", () => {
                if (body) {
                    const parsedData = this.parseMultipartFields(body, ["sessionId", "chunkIndex"]);
                    this.logger.debug(
                        removeIndentation(`
                            [ CHUNK REQUEST ]
                            ${JSON.stringify(parsedData, null, 2)}
                        `),
                    );
                }
            });
        }
    }

    // Response 로깅
    private logResponse(res: Response, logData: LogData): void {
        // Response 가로채기
        const originalSend = res.send;
        const originalJson = res.json;

        // res.send() 가로채기
        res.send = function (body: any) {
            const endTime = Date.now();
            const duration = endTime - logData.startTime;

            logger.debug(
                removeIndentation(`
                    [ RESPONSE ]
                    Method: ${logData.method}
                    URL: ${logData.url}
                    Status: ${res.statusCode}
                    Duration: ${duration}ms
                    Content-Length: ${Buffer.byteLength(body || "")}
                `),
            );

            if (body && res.statusCode >= 400) {
                logger.error(
                    removeIndentation(`
                        [ ERROR RESPONSE ]
                        ${prettyJsonPrint(body)}
                    `),
                );
            } else if (body) {
                logger.debug(
                    removeIndentation(`
                        [ RESPONSE BODY ]
                        ${prettyJsonPrint(body)}
                    `),
                );
            }

            return originalSend.call(this, body);
        };

        // res.json() 가로채기
        res.json = function (obj: any) {
            const endTime = Date.now();
            const duration = endTime - logData.startTime;

            logger.debug(
                removeIndentation(`
                    [ RESPONSE ]
                    Method: ${logData.method}
                    URL: ${logData.url}
                    Status: ${res.statusCode}
                    Duration: ${duration}ms
                    Content-Type: application/json
                `),
            );

            if (obj && res.statusCode >= 400) {
                logger.error(
                    removeIndentation(`
                        [ ERROR RESPONSE ]
                        ${prettyJsonPrint(obj)}
                    `),
                );
            } else if (obj) {
                logger.debug(
                    removeIndentation(`
                        [ RESPONSE BODY ]
                        ${prettyJsonPrint(obj)}
                    `),
                );
            }

            return originalJson.call(this, obj);
        };

        // res.end() 가로채기 (파일 다운로드 등)
        const originalEndMethod = res.end.bind(res);
        res.end = function (...args: any[]) {
            const endTime = Date.now();
            const duration = endTime - logData.startTime;

            logger.debug(
                removeIndentation(`
                    [ RESPONSE ]
                    Method: ${logData.method}
                    URL: ${logData.url}
                    Status: ${res.statusCode}
                    Duration: ${duration}ms
                    Type: Stream/File
                `),
            );

            return originalEndMethod(...args);
        };

        const logger = this.logger;
    }

    // multipart/form-data에서 특정 필드만 파싱
    private parseMultipartFields(body: string, fieldNames: string[]): Record<string, string> {
        const result: Record<string, string> = {};

        for (const fieldName of fieldNames) {
            // Content-Disposition: form-data; name="fieldName" 패턴 찾기
            const fieldRegex = new RegExp(
                `Content-Disposition: form-data; name="${fieldName}"[\\s\\S]*?\\r\\n\\r\\n([\\s\\S]*?)\\r\\n------`,
                "i",
            );

            const match = fieldRegex.exec(body);
            if (match?.[1]) {
                result[fieldName] = match[1].trim();
            }
        }

        return result;
    }
}
