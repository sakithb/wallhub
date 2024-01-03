import GLib from "gi://GLib?version=2.0";
import Gio from "gi://Gio?version=2.0";
import { Extension, InjectionManager } from "resource:///org/gnome/shell/extensions/extension.js";
import { BackgroundMenu } from "resource:///org/gnome/shell/ui/backgroundMenu.js";
import { BackgroundManager } from "resource:///org/gnome/shell/ui/background.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

import WallpaperQueue from "./helpers/WallpaperQueue.js";
import { parseDynamicWallpaper } from "./utils/dwp.js";
import { readFile } from "./utils/io.js";
import { debugLog, errorLog, handleCatch, isBitSet } from "./utils/misc.js";

Gio._promisify(Gio.File.prototype, "enumerate_children_async", "enumerate_children_finish");
Gio._promisify(Gio.File.prototype, "query_info_async", "query_info_finish");
Gio._promisify(Gio.FileEnumerator.prototype, "next_files_async", "next_files_finish");

export default class Wallhub extends Extension {
    private settings: Gio.Settings;
    private backgroundSettings: Gio.Settings;

    private wallpaperPaths: string[];
    private wallpaperPathsSelected: number;
    private slideshowIntervalUnit: number;
    private slideshowInterval: number;

    private wallpaperQueue: WallpaperQueue;
    private directoryMonitors: Gio.FileMonitor[];
    private loopSourceId: number;
    private injectionManager: InjectionManager;

    public enable() {
        this.settings = this.getSettings();
        this.backgroundSettings = new Gio.Settings({ schema: "org.gnome.desktop.background" });

        this.wallpaperPaths = this.settings.get_strv("wallpaper-paths");
        this.wallpaperPathsSelected = this.settings.get_int("wallpaper-paths-selected");
        this.slideshowIntervalUnit = this.settings.get_enum("slideshow-interval-unit");
        this.slideshowInterval = this.settings.get_uint("slideshow-interval");

        this.wallpaperQueue = new WallpaperQueue();
        this.directoryMonitors = [];
        this.injectionManager = new InjectionManager();

        this.settings.connect("changed::wallpaper-paths", () => {
            this.wallpaperPaths = this.settings.get_strv("wallpaper-paths");
        });

        this.settings.connect("changed::wallpaper-paths-selected", () => {
            this.wallpaperPathsSelected = this.settings.get_int("wallpaper-paths-selected");
            this.updateQueue().catch(handleCatch);
        });

        this.settings.connect("changed::slideshow-interval-unit", () => {
            this.slideshowIntervalUnit = this.settings.get_enum("slideshow-interval-unit");
            this.startLoop().catch(handleCatch);
        });

        this.settings.connect("changed::slideshow-interval", () => {
            this.slideshowInterval = this.settings.get_uint("slideshow-interval");
            this.startLoop().catch(handleCatch);
        });

        this.injectionManager.overrideMethod(Main.layoutManager, "_addBackgroundMenu", (originalMethod) => {
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            return (bgManager: BackgroundManager) => {
                try {
                    originalMethod.call(Main.layoutManager, bgManager);
                    // @ts-expect-error _backgroundMenu is private
                    const menu: BackgroundMenu = bgManager.backgroundActor._backgroundMenu;
                    this.addBackgroundMenuItem(menu);
                } catch (error) {
                    handleCatch(error);
                }
            };
        });

        this.updateQueue().catch(handleCatch);
        this.startLoop().catch(handleCatch);

        debugLog("Enabled");
    }

    public disable() {
        if (this.loopSourceId != null) {
            GLib.source_remove(this.loopSourceId);
        }

        this.directoryMonitors.forEach((monitor) => monitor.cancel());
        this.injectionManager.clear();

        this.settings = null;

        this.wallpaperPaths = null;
        this.wallpaperPathsSelected = null;
        this.slideshowIntervalUnit = null;
        this.slideshowInterval = null;

        this.wallpaperQueue = null;
        this.directoryMonitors = null;
        this.injectionManager = null;

        debugLog("Disabled");
    }

    private async startLoop() {
        if (this.loopSourceId > 0) {
            GLib.source_remove(this.loopSourceId);
        }

        if (this.wallpaperQueue.length === 0) {
            return;
        } else {
            const interval = this.slideshowInterval * this.slideshowIntervalUnit;

            this.loopSourceId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, interval, () => {
                const wallpaper = this.wallpaperQueue.dequeue();

                if (wallpaper != null) {
                    this.setWallpaper(wallpaper).catch(handleCatch);
                    return GLib.SOURCE_CONTINUE;
                }

                this.loopSourceId = null;
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    private async updateQueue() {
        this.wallpaperQueue.clear();

        for (let i = 0; i < this.wallpaperPaths.length; i++) {
            const path = this.wallpaperPaths[i];

            if (isBitSet(this.wallpaperPathsSelected, i) === false) {
                continue;
            }

            const file = Gio.File.new_for_path(path);
            const fileType = file.query_file_type(Gio.FileQueryInfoFlags.NONE, null);

            if (fileType === Gio.FileType.REGULAR) {
                this.wallpaperQueue.enqueue(path);
            } else if (fileType === Gio.FileType.DIRECTORY) {
                const wallpapers = await this.getWallpapersFromDirectory(file).catch(handleCatch);

                if (wallpapers == null) {
                    errorLog("Failed to get wallpapers from directory", path);
                    return;
                }

                for (const wallpaper of wallpapers) {
                    this.wallpaperQueue.enqueue(wallpaper);
                }
            } else {
                errorLog(`Invalid file type: ${path}`);
            }
        }
    }

    private async getWallpapersFromDirectory(directory: Gio.File): Promise<string[]> {
        const enumerator = await directory.enumerate_children_async(
            "standard::*",
            Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT,
            null,
        );

        const wallpapers: string[] = [];

        while (true) {
            const fileInfos = await enumerator.next_files_async(10, GLib.PRIORITY_DEFAULT, null);
            if (fileInfos.length === 0) break;

            for (const fileInfo of fileInfos) {
                const file = directory.get_child(fileInfo.get_name());
                const fileType = fileInfo.get_file_type();

                if (fileType === Gio.FileType.REGULAR) {
                    wallpapers.push(file.get_path());
                } else if (fileType === Gio.FileType.DIRECTORY) {
                    const childWallpapers = await this.getWallpapersFromDirectory(file);

                    wallpapers.push(...childWallpapers);
                }
            }
        }

        await this.createDirectoryMonitor(directory).catch(handleCatch);
        return wallpapers;
    }

    private async createDirectoryMonitor(file: Gio.File) {
        const monitor = file.monitor_directory(Gio.FileMonitorFlags.NONE, null);
        monitor.rateLimit = 1000;

        monitor.connect("changed", (monitor, file, otherFile, eventType) => {
            if (eventType === Gio.FileMonitorEvent.CREATED) {
                const pathname = file.get_path();

                if (this.wallpaperQueue.includes(pathname) === false) {
                    this.wallpaperQueue.enqueue(pathname);
                }
            } else if (eventType === Gio.FileMonitorEvent.DELETED) {
                this.wallpaperQueue.remove(file.get_path());
            }
        });

        this.directoryMonitors.push(monitor);
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

    private addBackgroundMenuItem(menu: BackgroundMenu) {
        const menuItem = new PopupMenu.PopupMenuItem("Next Wallpaper");

        menuItem.connect("activate", () => {
            const wallpaper = this.wallpaperQueue.dequeue();
            if (wallpaper != null) {
                this.setWallpaper(wallpaper).catch(handleCatch);
            }
        });

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(null), 4);
        menu.addMenuItem(menuItem, 5);
    }
}
