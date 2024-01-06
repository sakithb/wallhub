import { Enum } from "../common/types/common.js";

export const FileChooserActions = {
    FILE: "file",
    SAVE: "save",
    FOLDER: "folder",
    MULTIPLE: "multiple",
} as const;

export const MimeTypes = {
    IMAGES: "image/*",
    XML: "application/xml",
} as const;

export const SortOrders = {
    ASCENDING: "asc",
    DESCENDING: "desc",
} as const;

export const SortTypes = {
    DATE_ADDED: "date_added",
    RELEVANCE: "relevance",
    RANDOM: "random",
    VIEWS: "views",
    FAVORITES: "favorites",
    TOPLIST: "toplist",
} as const;

export const BrowseCategories = {
    GENERAL: "100",
    ANIME: "010",
    PEOPLE: "001",
} as const;

export type BrowseCategories = Enum<typeof BrowseCategories>;
export type SortTypes = Enum<typeof SortTypes>;
export type SortOrders = Enum<typeof SortOrders>;
export type MimeTypes = Enum<typeof MimeTypes>;
export type FileChooserActions = Enum<typeof FileChooserActions>;
