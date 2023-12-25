const DEBUG = true;

export const getEnumValueFromIndex = <T>(enumObject: T, index: number): T[keyof T] => {
    return Object.values(enumObject)[index];
};

export const getEnumIndexFromValue = <T>(enumObject: T, value: unknown): number => {
    return Object.values(enumObject).indexOf(value);
};

export const getEnumKeyFromValue = <T>(enumObject: T, value: unknown): keyof T => {
    return Object.keys(enumObject).find((key) => enumObject[key] === value) as keyof T;
};

export const getHcf = (a: number, b: number): number => {
    if (b === 0) return a;
    return getHcf(b, a % b);
};

export const errorLog = (...args: unknown[]) => {
    console.error("[Wallhub]", "Error:", ...args);
};

export const debugLog = (...args: unknown[]) => {
    if (DEBUG) {
        console.log("[Wallhub]", ...args);
    }
};

export const handleCatch = (error: unknown): null => {
    errorLog(error);
    return null;
};
