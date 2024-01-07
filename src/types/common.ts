export type Enum<T> = T[keyof T];

export interface DynamicWallpaper {
    name: string;
    lightBg: string;
    darkBg: string;
}
