export const prettyJsonPrint = (value: any): string => {
    if (!value) {
        return "";
    }

    const parsedBody = typeof value === "string" ? JSON.parse(value) : JSON.parse(JSON.stringify(value));
    return JSON.stringify(parsedBody, null, 2);
};
