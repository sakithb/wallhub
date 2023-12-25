import GLib from "gi://GLib?version=2.0";
import Gio from "gi://Gio?version=2.0";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import { WallpaperTypes } from "./types/enums.js";
import { debugLog, errorLog } from "./utils/common.js";
import { parseDynamicWallpaper } from "./utils/dwp.js";
import { readFile } from "./utils/io.js";

Gio._promisify(Gio.File.prototype, "enumerate_children_async", "enumerate_children_finish");
Gio._promisify(Gio.FileEnumerator.prototype, "next_files_async", "next_files_finish");

// TODO: option in the context menu to change the wallpaper
export default class Wallhub extends Extension {
    private settings: Gio.Settings;
    private backgroundSettings: Gio.Settings;

    private wallpaperType: WallpaperTypes;
    private wallpaperPathSingle: string;
    private wallpaperPathSlideshow: string;
    private slideshowIntervalUnit: number;
    private slideshowInterval: number;

    private slideshowQueue: string[];
    private slideshowFolder: Gio.File;
    private slideshowMonitor: Gio.FileMonitor;
    private slideshowSourceId: number;

    private extensionStarted = false;

    public enable() {
        this.settings = this.getSettings();
        this.backgroundSettings = new Gio.Settings({ schema: "org.gnome.desktop.background" });

        this.wallpaperType = this.settings.get_enum("wallpaper-type");
        this.wallpaperPathSingle = this.settings.get_string("wallpaper-path-single");
        this.wallpaperPathSlideshow = this.settings.get_string("wallpaper-path-slideshow");
        this.slideshowIntervalUnit = this.settings.get_enum("slideshow-interval-unit");
        this.slideshowInterval = this.settings.get_uint("slideshow-interval");

        this.bindSettings();
        this.handleWallpaperType();

        this.extensionStarted = true;

        debugLog("Enabled");
    }

    public disable() {
        this.settings = null;

        this.wallpaperType = null;
        this.wallpaperPathSingle = null;
        this.wallpaperPathSlideshow = null;
        this.slideshowIntervalUnit = null;
        this.slideshowInterval = null;

        if (this.wallpaperType === WallpaperTypes.SLIDESHOW) {
            this.stopSlideshow();
        }

        debugLog("Disabled");
    }

    private bindSettings() {
        this.settings.connect("changed::wallpaper-type", () => {
            this.wallpaperType = this.settings.get_enum("wallpaper-type");
            this.handleWallpaperType();
        });

        this.settings.connect("changed::wallpaper-path-single", () => {
            this.wallpaperPathSingle = this.settings.get_string("wallpaper-path-single");
            this.handleWallpaperType();
        });

        this.settings.connect("changed::wallpaper-path-slideshow", () => {
            this.wallpaperPathSlideshow = this.settings.get_string("wallpaper-path-slideshow");
            this.handleWallpaperType();
        });

        this.settings.connect("changed::slideshow-interval-unit", () => {
            this.slideshowIntervalUnit = this.settings.get_enum("slideshow-interval-unit");
        });

        this.settings.connect("changed::slideshow-interval", () => {
            this.slideshowInterval = this.settings.get_uint("slideshow-interval");
        });
    }

    private handleWallpaperType() {
        if (this.wallpaperType === WallpaperTypes.SINGLE) {
            this.stopSlideshow();
            this.setWallpaper(this.wallpaperPathSingle);
        } else if (this.wallpaperType === WallpaperTypes.SLIDESHOW) {
            this.startSlideshow();
        }
    }

    private createSlideshowInterval() {
        if (isFinite(this.slideshowSourceId)) {
            GLib.source_remove(this.slideshowSourceId);
        }

        const interval = this.slideshowInterval * this.slideshowIntervalUnit;
        this.slideshowSourceId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, this.slideshowSourceFunc);

        if (this.extensionStarted) {
            this.slideshowSourceFunc();
        }
    }

    private slideshowSourceFunc() {
        if (this.slideshowQueue.length > 0) {
            const randomIndex = Math.round(Math.random() * (this.slideshowQueue.length - 1));
            const filename = this.slideshowQueue.splice(randomIndex, 1)[0];
            const path = GLib.build_filenamev([this.wallpaperPathSlideshow, filename]);

            this.setWallpaper(path);
            this.slideshowQueue.push(filename);
        }

        return GLib.SOURCE_CONTINUE;
    }

    private createSlideshowMonitor() {
        this.slideshowMonitor = this.slideshowFolder.monitor_directory(Gio.FileMonitorFlags.NONE, null);
        this.slideshowMonitor.rateLimit = 1000;

        this.slideshowMonitor.connect("changed", (monitor, file, otherFile, eventType) => {
            switch (eventType) {
                case Gio.FileMonitorEvent.CREATED: {
                    const basename = file.get_basename();
                    if (this.slideshowQueue.includes(basename) === false) {
                        this.slideshowQueue.push(basename);
                    }

                    break;
                }
                case Gio.FileMonitorEvent.DELETED:
                    this.slideshowQueue = this.slideshowQueue.filter((filename) => filename !== file.get_basename());
                    break;
            }
        });
    }

    private stopSlideshow() {
        this.slideshowMonitor = null;
        this.slideshowQueue = null;
        this.slideshowFolder = null;

        if (isFinite(this.slideshowSourceId)) {
            GLib.source_remove(this.slideshowSourceId);
        }
    }

    private async startSlideshow() {
        this.slideshowQueue = [];
        this.slideshowFolder = Gio.File.new_for_path(this.wallpaperPathSlideshow);

        const enumerator = await this.slideshowFolder.enumerate_children_async("standard::*", Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null);

        while (true) {
            const fileInfos = await enumerator.next_files_async(10, GLib.PRIORITY_DEFAULT, null);
            if (fileInfos.length === 0) break;

            for (const fileInfo of fileInfos) {
                this.slideshowQueue.push(fileInfo.get_name());
            }
        }

        this.createSlideshowMonitor();
        this.createSlideshowInterval();
    }

    private async setWallpaper(path: string) {
        const extension = path.split(".").pop().toLowerCase();

        if (extension === "xml") {
            const xmlBytes = await readFile(path, null);

            if (xmlBytes == null) {
                errorLog("Failed to read dynamic wallpaper");
                return;
            }

            const decoder = new TextDecoder();
            const xml = decoder.decode(xmlBytes);

            const dwpConfig = parseDynamicWallpaper(xml);

            if (dwpConfig == null) {
                errorLog("Failed to parse dynamic wallpaper");
                return;
            }

            this.backgroundSettings.set_string("picture-uri", `file:///${dwpConfig.lightBg}`);
            this.backgroundSettings.set_string("picture-uri-dark", `file:///${dwpConfig.darkBg}`);
        } else {
            this.backgroundSettings.set_string("picture-uri", `file:///${path}`);
            this.backgroundSettings.set_string("picture-uri-dark", `file:///${path}`);
        }
    }
}
