import { DynamicWallpaper } from "../types/common.js";

const NAME_REGEX = /<name>(.*?)<\/name>/;
const LIGHTBG_REGEX = /<filename>(.*?)<\/filename>/;
const DARKBG_REGEX = /<filename-dark>(.*?)<\/filename-dark>/;

export const parseDynamicWallpaper = (xml: string): DynamicWallpaper | null => {
    const name = xml.match(NAME_REGEX);
    const lightBg = xml.match(LIGHTBG_REGEX);
    const darkBg = xml.match(DARKBG_REGEX);

    if (!name || !lightBg || !darkBg) {
        return null;
    } else {
        return {
            name: name[1],
            lightBg: lightBg[1],
            darkBg: darkBg[1],
        };
    }
};

export const generateDynamicWallpaper = (dwConfig: DynamicWallpaper) => {
    const xmlLines = [];

    xmlLines.push('<?xml version="1.0"?>');
    xmlLines.push('<!DOCTYPE wallpapers SYSTEM "gnome-wp-list.dtd">');
    xmlLines.push("<wallpapers>");
    xmlLines.push('<wallpaper deleted="false">');
    xmlLines.push(`<name>${dwConfig.name}</name>`);
    xmlLines.push(`<filename>${dwConfig.lightBg}</filename>`);
    xmlLines.push(`<filename-dark>${dwConfig.darkBg}</filename-dark>`);
    xmlLines.push("<options>zoom</options>");
    xmlLines.push("<shade_type>solid</shade_type>");
    xmlLines.push("<pcolor>#000000</pcolor>");
    xmlLines.push("<scolor>#000000</scolor>");
    xmlLines.push("</wallpaper>");
    xmlLines.push("</wallpapers>");

    return xmlLines.join("\n");
};
