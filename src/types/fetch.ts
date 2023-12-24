export interface IWallhavenWallpaper {
    id: string;
    url: string;
    short_url: string;
    views: number;
    favorites: number;
    source: string;
    purity: string;
    category: string;
    dimension_x: number;
    dimension_y: number;
    resolution: string;
    ratio: string;
    file_size: number;
    file_type: string;
    created_at: string;
    colors: string[];
    path: string;
    thumbs: {
        large: string;
        original: string;
        small: string;
    };
}

export interface IWallhavenResponse {
    data: IWallhavenWallpaper[];
    meta: {
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
        query: string | null;
        seed: string | null;
    };
}

export interface IWallhavenSearchOptions {
    q: string;
    categories: string;
    sorting: string;
    order: string;
    atleast: string;
    ratios: string;
    page: string;
}
