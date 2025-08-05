import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
    private readonly logger = new Logger(LoggingMiddleware.name);

    use(req: Request, res: Response, next: NextFunction): void {
        const { method, originalUrl, ip, headers } = req;
        const userAgent = req.get("user-agent") || "";
        const startTime = Date.now();

        // Request 로깅
        this.logger.debug(`
            [REQUEST] ${method} ${originalUrl}
            IP: ${ip}
            User-Agent: ${userAgent}
            Content-Type: ${headers["content-type"] || "N/A"}
            Content-Length: ${headers["content-length"] || "N/A"}
        `);

        // Request Body 로깅 (POST, PUT, PATCH인 경우)
        if (["POST", "PUT", "PATCH"].includes(method)) {
            let body = "";
            req.on("data", chunk => {
                body += chunk.toString();
            });

            req.on("end", () => {
                if (body) {
                    try {
                        const parsedBody = JSON.parse(body);
                        this.logger.debug(`[REQUEST BODY] ${JSON.stringify(parsedBody, null, 2)}`);
                    } catch {
                        this.logger.debug(`[REQUEST BODY] ${body}`);
                    }
                }
            });
        }

        // Response 가로채기
        const originalSend = res.send;
        const originalJson = res.json;

        // res.send() 가로채기
        res.send = function (body: any) {
            const endTime = Date.now();
            const duration = endTime - startTime;

            logger.debug(`
                [RESPONSE] ${method} ${originalUrl}
                Status: ${res.statusCode}
                Duration: ${duration}ms
                Content-Length: ${Buffer.byteLength(body || "")}
            `);

            if (body && res.statusCode >= 400) {
                logger.error(`[ERROR RESPONSE] ${body}`);
            } else if (body) {
                logger.debug(`[RESPONSE BODY] ${body}`);
            }

            return originalSend.call(this, body);
        };

        // res.json() 가로채기
        res.json = function (obj: any) {
            const endTime = Date.now();
            const duration = endTime - startTime;

            logger.debug(`
                [RESPONSE] ${method} ${originalUrl}
                Status: ${res.statusCode}
                Duration: ${duration}ms
                Content-Type: application/json
            `);

            if (obj && res.statusCode >= 400) {
                logger.error(`[ERROR RESPONSE] ${JSON.stringify(obj, null, 2)}`);
            } else if (obj) {
                logger.debug(`[RESPONSE BODY] ${JSON.stringify(obj, null, 2)}`);
            }

            return originalJson.call(this, obj);
        };

        // res.end() 가로채기 (파일 다운로드 등)
        const originalEndMethod = res.end.bind(res);
        res.end = function (...args: any[]) {
            const endTime = Date.now();
            const duration = endTime - startTime;

            logger.debug(`
                [RESPONSE] ${method} ${originalUrl}
                Status: ${res.statusCode}
                Duration: ${duration}ms
                Type: Stream/File
            `);

            return originalEndMethod(...args);
        };

        const logger = this.logger;
        next();
    }
}
