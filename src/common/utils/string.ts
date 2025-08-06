export const prettyJsonPrint = (value: any): string => {
    if (!value) {
        return "";
    }

    const parsedBody = typeof value === "string" ? JSON.parse(value) : JSON.parse(JSON.stringify(value));
    return JSON.stringify(parsedBody, null, 2);
};

export const removeIndentation = (text: string): string => {
    if (!text) {
        return text;
    }

    const lines = text.split("\n");
    const firstLineIndent =
        lines[0] === "" ? RegExp(/^(\s*)/).exec(lines[1])?.[1] : RegExp(/^(\s*)/).exec(lines[0])?.[1];
    const processedLines = lines.map(line => {
        if (line.startsWith(firstLineIndent)) {
            return line.substring(firstLineIndent.length);
        }
        return line;
    });

    return processedLines.join("\n");
};
