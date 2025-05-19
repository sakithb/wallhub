import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Adw from "gi://Adw";
import Gdk from "gi://Gdk";
import Graphene from "gi://Graphene";
import Gsk from "gi://Gsk";
import Gtk from "gi://Gtk";
import Soup from "gi://Soup";
import GObject from "gi://GObject";
import { ExtensionPreferences, gettext as _ } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import WallpaperGridOrig from "./helpers/prefs/WallpaperGrid.js";
import TexturePreviewOrig from "./helpers/prefs/TexturePreview.js";
import { IWallhavenSearchOptions, IWallhavenWallpaper, IFileChooserOptions } from "./types/prefs.js";
import { DynamicWallpaper } from "./types/common.js";
import { generateDynamicWallpaper, parseDynamicWallpaper } from "./utils/common/dwp.js";
import { getDwpTexture, openFileChooser, sendToast } from "./utils/prefs/ui.js";
import { fetchImage, fetchSearchResults } from "./utils/prefs/fetch.js";
import { appendFile, copyFile, readFile, spawnChild, writeFile } from "./utils/common/io.js";
import { errorLog, getEnumIndexFromValue, getEnumValueFromIndex, getHcf, handleCatch } from "./utils/common/misc.js";
import { SlideshowIntervalUnits } from "./types/enums/common.js";
import { MimeTypes, FileChooserActions, SortOrders, SortTypes, BrowseCategories } from "./types/enums/prefs.js";

Gio._promisify(Soup.Session.prototype, "send_and_read_async", "send_and_read_finish");
Gio._promisify(Soup.Session.prototype, "send_async", "send_finish");
Gio._promisify(Gtk.FileDialog.prototype, "open", "open_finish");
Gio._promisify(Gtk.FileDialog.prototype, "save", "save_finish");
Gio._promisify(Gtk.FileDialog.prototype, "open_multiple", "open_multiple_finish");
Gio._promisify(Gtk.FileDialog.prototype, "select_folder", "select_folder_finish");

let WallpaperGrid: typeof WallpaperGridOrig;
let TexturePreview: typeof TexturePreviewOrig;

const SHELL_RESOURCE_PATH = "/usr/share/gnome-shell/gnome-shell-theme.gresource";
class WallhubPreferences extends ExtensionPreferences {
    private window: Adw.PreferencesWindow;
    private settings: Gio.Settings;
    private builder: Gtk.Builder;

    private cursorPointer: Gdk.Cursor;
    private cursorBusy: Gdk.Cursor;
    private cursorDefault: Gdk.Cursor;

    private generalPage: Adw.PreferencesPage;
    private browsePage: Adw.PreferencesPage;
    private dwpPage: Adw.PreferencesPage;
    private loginPage: Adw.PreferencesPage;

    private wpGrpPaths: InstanceType<typeof WallpaperGridOrig>;
    private slideshowIntervalUnitIpt: Gtk.DropDown;
    private slideshowIntervalIpt: Gtk.SpinButton;

    private loadingBar: Gtk.ProgressBar;
    private searchIpt: Gtk.SearchEntry;
    private searchBtn: Gtk.Button;
    private ctgGeneralIpt: Gtk.ToggleButton;
    private ctgAnimeIpt: Gtk.ToggleButton;
    private ctgPeopleIpt: Gtk.ToggleButton;
    private sortIpt: Gtk.DropDown;
    private sortAscIpt: Gtk.ToggleButton;
    private resultsGrid: Gtk.Grid;
    private prevPageBtn: Gtk.Button;
    private pageNoLabel: Gtk.Label;
    private nextPageBtn: Gtk.Button;

    private wpViewerWin: Adw.Window;
    private wpViewerPic: Gtk.Picture;
    private wpViewerSpinner: Gtk.Spinner;
    private wpViewerCancelBtn: Gtk.Button;
    private wpViewerDownloadBtn: Gtk.Button;
    private wpViewerCancellable: Gio.Cancellable;

    private dwpChooseBtn: Gtk.Button;
    private dwpNameIpt: Adw.EntryRow;
    private dwpLightRow: Adw.ActionRow;
    private dwpLightChooseBtn: Gtk.Button;
    private dwpDarkRow: Adw.ActionRow;
    private dwpDarkChooseBtn: Gtk.Button;
    private dwpSaveBtn: Gtk.Button;
    private dwpPreview: InstanceType<typeof TexturePreviewOrig>;

    private loginChooseRow: Adw.ActionRow;
    private loginChooseBtn: Gtk.Button;
    private loginBlurIpt: Adw.SpinRow;
    private loginBrightnessIpt: Adw.SpinRow;
    private loginApplyBtn: Gtk.Button;
    private loginResetBtn: Gtk.Button;
    private loginPreview: InstanceType<typeof TexturePreviewOrig>;

    private searchCancellable: Gio.Cancellable;
    private currentPage = 1;
    private noOfPages = 1;

    private dwpConfig: DynamicWallpaper;
    private dwpPath: string;

    private loginPath: string;
    private ogResourcePath: string;
    private loginPreviewSourceId: number;

    // @ts-expect-error fillPreferencesWindow is assigned doesn't match type with prop in ExtensionPreferences
    public fillPreferencesWindow(window: Adw.PreferencesWindow) {
        const resourcePath = GLib.build_filenamev([this.path, "org.gnome.shell.extensions.wallhub.gresource"]);
        Gio.resources_register(Gio.resource_load(resourcePath));

        if (WallpaperGrid == null) {
            WallpaperGrid = GObject.registerClass(
                {
                    GTypeName: "WallpaperGrid",
                    Properties: {
                        selected: GObject.ParamSpec.jsobject(
                            "selected",
                            "Selected",
                            "Selected",
                            GObject.ParamFlags.READABLE,
                        ),
                        wallpapers: GObject.ParamSpec.jsobject(
                            "wallpapers",
                            "Wallpapers",
                            "Wallpapers",
                            GObject.ParamFlags.READABLE,
                        ),
                    },
                    Template: "resource:///org/gnome/shell/extensions/wallhub/ui/wallpaper-grid.ui",
                    InternalChildren: [
                        "grid-box",
                        "empty-item",
                        "scrolled-win",
                        "add-folder-btn",
                        "add-file-btn",
                        "remove-btn",
                        "select-all-btn",
                    ],
                },
                WallpaperGridOrig,
            );
        }

        if (TexturePreview == null) {
            TexturePreview = GObject.registerClass(
                {
                    GTypeName: "TexturePreview",
                    Template: "resource:///org/gnome/shell/extensions/wallhub/ui/texture-preview.ui",
                    InternalChildren: ["empty-label", "texture-pic"],
                },
                TexturePreviewOrig,
            );
        }

        GObject.type_ensure(WallpaperGrid.$gtype);
        GObject.type_ensure(TexturePreview.$gtype);

        this.window = window;
        this.settings = this.getSettings();
        this.builder = Gtk.Builder.new_from_resource("/org/gnome/shell/extensions/wallhub/ui/prefs.ui");

        this.generalPage = this.builder.get_object("page-general") as Adw.PreferencesPage;
        this.browsePage = this.builder.get_object("page-browse") as Adw.PreferencesPage;
        this.dwpPage = this.builder.get_object("page-dwp") as Adw.PreferencesPage;
        this.loginPage = this.builder.get_object("page-login") as Adw.PreferencesPage;

        this.cursorPointer = Gdk.Cursor.new_from_name("pointer", null);
        this.cursorBusy = Gdk.Cursor.new_from_name("wait", null);
        this.cursorDefault = Gdk.Cursor.new_from_name("default", null);

        const cssProvider = new Gtk.CssProvider();
        cssProvider.load_from_resource("/org/gnome/shell/extensions/wallhub/prefs.css");
        Gtk.StyleContext.add_provider_for_display(window.display, cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

        this.window.add(this.generalPage);
        this.window.add(this.browsePage);
        this.window.add(this.dwpPage);
        this.window.add(this.loginPage);

        this.initPageGeneral();
        this.initPageBrowse();
        this.initPageDwp();
        this.initPageLogin();

        this.window.connect("close-request", () => {
            this.window = null;
            this.settings = null;
            this.builder = null;

            this.cursorPointer = null;
            this.cursorBusy = null;
            this.cursorDefault = null;

            this.searchCancellable?.cancel();
            this.searchCancellable = null;

            if (this.loginPreviewSourceId != null) {
                GLib.source_remove(this.loginPreviewSourceId);
                this.loginPreviewSourceId = null;
            }
        });
    }

    private initPageGeneral() {
        this.wpGrpPaths = this.builder.get_object("grp-wp-paths") as InstanceType<typeof WallpaperGridOrig>;
        this.slideshowIntervalUnitIpt = this.builder.get_object("dd-slideshow-interval-unit") as Gtk.DropDown;
        this.slideshowIntervalIpt = this.builder.get_object("sb-slideshow-interval") as Gtk.SpinButton;

        const wallpapers = this.settings.get_strv("wallpaper-paths");
        const selectedWallpapers = this.settings.get_int("wallpaper-paths-selected");

        this.wpGrpPaths.setSelected(selectedWallpapers);
        this.wpGrpPaths.setWallpapers(wallpapers);

        this.wpGrpPaths.connect("notify::selected", () => {
            this.settings.set_int("wallpaper-paths-selected", this.wpGrpPaths.selected);
        });

        this.wpGrpPaths.connect("notify::wallpapers", () => {
            this.settings.set_strv("wallpaper-paths", this.wpGrpPaths.wallpapers);
        });

        const slideshowIntervalUnit = this.settings.get_enum("slideshow-interval-unit");
        this.slideshowIntervalUnitIpt.selected = getEnumIndexFromValue(
            SlideshowIntervalUnits,
            slideshowIntervalUnit.toString(),
        );

        this.settings.bind("slideshow-interval", this.slideshowIntervalIpt, "value", Gio.SettingsBindFlags.DEFAULT);
        this.slideshowIntervalUnitIpt.connect(
            "notify::selected",
            this.bindSlideshowIntervalUnit.bind(this, "slideshow-interval-unit", this.slideshowIntervalUnitIpt),
        );
    }

    private initPageBrowse() {
        this.loadingBar = this.builder.get_object("pb-loading") as Gtk.ProgressBar;
        this.searchIpt = this.builder.get_object("se-search") as Gtk.SearchEntry;
        this.searchBtn = this.builder.get_object("btn-search") as Gtk.Button;
        this.ctgGeneralIpt = this.builder.get_object("btn-ctg-general") as Gtk.ToggleButton;
        this.ctgAnimeIpt = this.builder.get_object("btn-ctg-anime") as Gtk.ToggleButton;
        this.ctgPeopleIpt = this.builder.get_object("btn-ctg-people") as Gtk.ToggleButton;
        this.sortIpt = this.builder.get_object("dd-sort") as Gtk.DropDown;
        this.sortAscIpt = this.builder.get_object("btn-sort-asc") as Gtk.ToggleButton;
        this.resultsGrid = this.builder.get_object("grid-results") as Gtk.Grid;
        this.prevPageBtn = this.builder.get_object("btn-prev-page") as Gtk.Button;
        this.pageNoLabel = this.builder.get_object("lb-page") as Gtk.Label;
        this.nextPageBtn = this.builder.get_object("btn-next-page") as Gtk.Button;

        this.wpViewerWin = this.builder.get_object("win-wp-viewer") as Adw.Window;
        this.wpViewerPic = this.builder.get_object("pic-wp-viewer") as Gtk.Picture;
        this.wpViewerSpinner = this.builder.get_object("spn-wp-viewer") as Gtk.Spinner;
        this.wpViewerCancelBtn = this.builder.get_object("btn-wp-viewer-cancel") as Gtk.Button;
        this.wpViewerDownloadBtn = this.builder.get_object("btn-wp-viewer-download") as Gtk.Button;

        this.searchAndShowWallpapers();
        this.searchBtn.connect("clicked", this.searchAndShowWallpapers.bind(this));

        this.prevPageBtn.connect("clicked", () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.searchAndShowWallpapers();
            }
        });

        this.nextPageBtn.connect("clicked", () => {
            if (this.currentPage < this.noOfPages) {
                this.currentPage++;
                this.searchAndShowWallpapers();
            }
        });
    }

    private initPageDwp() {
        this.dwpChooseBtn = this.builder.get_object("btn-dwp-choose") as Gtk.Button;
        this.dwpNameIpt = this.builder.get_object("er-dwp-name") as Adw.EntryRow;
        this.dwpLightRow = this.builder.get_object("row-dwp-light-choose") as Adw.ActionRow;
        this.dwpLightChooseBtn = this.builder.get_object("btn-dwp-light-choose") as Gtk.Button;
        this.dwpDarkRow = this.builder.get_object("row-dwp-dark-choose") as Adw.ActionRow;
        this.dwpDarkChooseBtn = this.builder.get_object("btn-dwp-dark-choose") as Gtk.Button;
        this.dwpSaveBtn = this.builder.get_object("btn-dwp-save") as Gtk.Button;
        this.dwpPreview = this.builder.get_object("grp-dwp-preview") as InstanceType<typeof TexturePreviewOrig>;

        const updateSaveSensitive = () => {
            const name = Boolean(this.dwpNameIpt.text);
            const lightBg = Boolean(this.dwpLightRow.subtitle);
            const darkBg = Boolean(this.dwpDarkRow.subtitle);

            this.dwpSaveBtn.sensitive = name && lightBg && darkBg;
        };

        const updatePreview = () => {
            if (this.dwpConfig.lightBg && this.dwpConfig.darkBg) {
                const dwpTexture = getDwpTexture(
                    this.dwpConfig.lightBg,
                    this.dwpConfig.darkBg,
                    this.window.get_renderer(),
                );

                this.dwpPreview.setPreview(dwpTexture);
            }
        };

        this.dwpConfig = {
            name: "",
            lightBg: "",
            darkBg: "",
        };

        this.dwpNameIpt.connect("notify::text", updateSaveSensitive);

        this.dwpChooseBtn.connect("clicked", async () => {
            const fileOptions: IFileChooserOptions = {
                title: _("Choose a dynamic wallpaper"),
                filters: [{ name: _("Dynamic Wallpapers"), mimeTypes: [MimeTypes.XML] }],
            };

            const file = await openFileChooser(fileOptions, FileChooserActions.FILE, this.window);
            if (file == null) return;

            const path = file.get_path();

            const content = await readFile(path, null);
            if (content == null) return;

            const decoder = new TextDecoder();
            const xmlStr = decoder.decode(content);

            const dwp = parseDynamicWallpaper(xmlStr);
            if (dwp == null) return;

            this.dwpConfig = dwp;
            this.dwpPath = path;

            this.dwpNameIpt.text = dwp.name;
            this.dwpLightRow.subtitle = dwp.lightBg;
            this.dwpLightRow.tooltipText = dwp.lightBg;
            this.dwpDarkRow.subtitle = dwp.darkBg;
            this.dwpDarkRow.tooltipText = dwp.darkBg;

            GLib.free(path);
            updateSaveSensitive();
            updatePreview();
        });

        this.dwpLightChooseBtn.connect("clicked", async () => {
            const fileOptions: IFileChooserOptions = {
                title: _("Choose a light background"),
                filters: [{ name: _("Images"), mimeTypes: [MimeTypes.IMAGES] }],
            };
            const file = await openFileChooser(fileOptions, FileChooserActions.FILE, this.window);
            if (file == null) return;

            const path = file.get_path();

            this.dwpConfig.lightBg = path;
            this.dwpLightRow.subtitle = path;
            this.dwpLightRow.tooltipText = path;

            GLib.free(path);
            updateSaveSensitive();
            updatePreview();
        });

        this.dwpDarkChooseBtn.connect("clicked", async () => {
            const fileOptions: IFileChooserOptions = {
                title: _("Choose a dark background"),
                filters: [{ name: _("Images"), mimeTypes: [MimeTypes.IMAGES] }],
            };
            const file = await openFileChooser(fileOptions, FileChooserActions.FILE, this.window);
            if (file == null) return;

            const path = file.get_path();

            this.dwpConfig.darkBg = path;
            this.dwpDarkRow.subtitle = path;
            this.dwpDarkRow.tooltipText = path;

            GLib.free(path);
            updateSaveSensitive();
            updatePreview();
        });

        this.dwpSaveBtn.connect("clicked", async () => {
            if (this.dwpPath == null) {
                const fileOptions: IFileChooserOptions = {
                    title: _("Save dynamic wallpaper"),
                    initialName: `${this.dwpConfig.name}.xml`,
                };

                const file = await openFileChooser(fileOptions, FileChooserActions.SAVE, this.window);
                if (file == null) return;

                const path = file.get_path();
                this.dwpPath = path;

                GLib.free(path);
            }

            this.dwpConfig.name = this.dwpNameIpt.text;

            const xmlStr = generateDynamicWallpaper(this.dwpConfig);
            const encoder = new TextEncoder();
            const xmlBytes = encoder.encode(xmlStr);

            const result = await writeFile(this.dwpPath, xmlBytes, null);

            if (result == null) {
                errorLog("Failed to save dynamic wallpaper");
            } else {
                sendToast(_("Dynamic wallpaper was successfully saved!"), this.window);
            }
        });
    }

    private initPageLogin() {
        this.loginChooseRow = this.builder.get_object("row-login-choose") as Adw.ActionRow;
        this.loginChooseBtn = this.builder.get_object("btn-login-choose") as Gtk.Button;
        this.loginBlurIpt = this.builder.get_object("sr-login-blur") as Adw.SpinRow;
        this.loginBrightnessIpt = this.builder.get_object("sr-login-brightness") as Adw.SpinRow;
        this.loginApplyBtn = this.builder.get_object("btn-login-apply") as Gtk.Button;
        this.loginResetBtn = this.builder.get_object("btn-login-reset") as Gtk.Button;
        this.loginPreview = this.builder.get_object("grp-login-preview") as InstanceType<typeof TexturePreviewOrig>;

        this.ogResourcePath = GLib.build_filenamev([
            GLib.get_user_config_dir(),
            "wallhub",
            GLib.basename(SHELL_RESOURCE_PATH),
        ]);

        if (GLib.file_test(this.ogResourcePath, GLib.FileTest.EXISTS)) {
            this.loginResetBtn.sensitive = true;
        }

        const updatePreview = () => {
            if (this.loginPreviewSourceId) {
                GLib.source_remove(this.loginPreviewSourceId);
            }

            this.loginPreviewSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
                if (this.loginPath == null) {
                    return;
                }

                const brightness = this.loginBrightnessIpt.value;
                const sigma = this.loginBlurIpt.value;

                const blurredTexture = this.getBlurredTexture(this.loginPath, brightness, sigma);
                this.loginPreview.setPreview(blurredTexture);

                return GLib.SOURCE_REMOVE;
            });
        };

        this.loginChooseBtn.connect("clicked", async () => {
            const fileOptions: IFileChooserOptions = {
                title: _("Choose a login background"),
                filters: [{ name: _("Images"), mimeTypes: [MimeTypes.IMAGES] }],
            };

            const file = await openFileChooser(fileOptions, FileChooserActions.FILE, this.window);
            if (file == null) return;

            const path = file.get_path();

            this.loginPath = path;
            this.loginChooseRow.subtitle = path;
            this.loginChooseRow.tooltipText = path;
            this.loginBlurIpt.sensitive = true;
            this.loginBrightnessIpt.sensitive = true;
            this.loginApplyBtn.sensitive = true;

            GLib.free(path);
            updatePreview();
        });

        this.loginApplyBtn.connect("clicked", async () => {
            this.loginApplyBtn.sensitive = false;
            await this.setGDMBackground().catch(handleCatch);
            this.loginApplyBtn.sensitive = true;
            this.loginResetBtn.sensitive = true;
        });

        this.loginResetBtn.connect("clicked", async () => {
            if (GLib.file_test(this.ogResourcePath, GLib.FileTest.EXISTS) === false) {
                sendToast(_("No backup found"), this.window);
                return;
            }

            const installArgs = ["pkexec", "install", "-m644", this.ogResourcePath, SHELL_RESOURCE_PATH];
            const installResult = await spawnChild(installArgs);

            if (installResult === false) {
                errorLog("Failed to reset GResource");
                sendToast(_("Failed to reset login background"), this.window);
                return;
            }

            GLib.unlink(this.ogResourcePath);
            this.loginResetBtn.sensitive = false;
            sendToast(_("Login background was successfully reset!"), this.window);
        });

        this.loginBlurIpt.connect("notify::value", updatePreview);
        this.loginBrightnessIpt.connect("notify::value", updatePreview);
    }

    private async searchAndShowWallpapers() {
        this.searchCancellable?.cancel();
        this.searchCancellable = new Gio.Cancellable();

        this.loadingBar.visible = true;

        const sourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
            this.loadingBar.pulse();
            return GLib.SOURCE_CONTINUE;
        });

        const query = this.searchIpt.text;
        const ctgs: number[] = [];

        if (this.ctgGeneralIpt.active) {
            ctgs.push(parseInt(BrowseCategories.GENERAL, 2));
        }

        if (this.ctgAnimeIpt.active) {
            ctgs.push(parseInt(BrowseCategories.ANIME, 2));
        }

        if (this.ctgPeopleIpt.active) {
            ctgs.push(parseInt(BrowseCategories.PEOPLE, 2));
        }

        const sorting = Object.values(SortTypes)[this.sortIpt.selected];
        const order = this.sortAscIpt.active ? SortOrders.ASCENDING : SortOrders.DESCENDING;
        const page = this.currentPage.toString();

        const resolutionConstraints = this.getResolutionConstraints();

        const searchOptions: IWallhavenSearchOptions = {
            q: query,
            categories: ctgs.reduce((acc, ctg) => acc | ctg, 0).toString(2),
            atleast: resolutionConstraints.atleast,
            ratios: resolutionConstraints.ratios,
            sorting,
            order,
            page,
        };

        const results = await fetchSearchResults(searchOptions, this.searchCancellable).catch(handleCatch);

        if (results === null) {
            return;
        }

        this.noOfPages = results.meta.last_page;
        this.currentPage = results.meta.current_page;

        this.pageNoLabel.label = _("Page %d of %d").format(this.currentPage, this.noOfPages);

        if (this.currentPage === 1) {
            this.prevPageBtn.sensitive = false;
        } else {
            this.prevPageBtn.sensitive = true;
        }

        if (this.currentPage === this.noOfPages) {
            this.nextPageBtn.sensitive = false;
        } else {
            this.nextPageBtn.sensitive = true;
        }

        this.resultsGrid.remove_column(4);
        this.resultsGrid.remove_column(3);
        this.resultsGrid.remove_column(2);
        this.resultsGrid.remove_column(1);

        const animationTarget = Adw.PropertyAnimationTarget.new(this.loadingBar, "fraction");
        const animation = new Adw.TimedAnimation({
            duration: 500,
            easing: Adw.Easing.EASE_IN_OUT_CUBIC,
            target: animationTarget,
            widget: this.loadingBar,
        });

        GLib.source_remove(sourceId);
        this.loadingBar.fraction = 0;

        const noOfColumns = 4;
        const wallpapers = results.data;

        for (let i = 0; i < wallpapers.length; i++) {
            const wallpaper = wallpapers[i];

            const imgBytes = await fetchImage(wallpaper.thumbs.small, this.searchCancellable).catch(handleCatch);
            if (imgBytes == null) return;

            const texture = Gdk.Texture.new_from_bytes(imgBytes);
            const picture = Gtk.Picture.new_for_paintable(texture);

            const gesture = new Gtk.GestureClick();
            gesture.connect("released", this.showWallpaperPreview.bind(this, wallpaper));

            picture.add_controller(gesture);
            picture.add_css_class("results-grid-image");
            picture.cursor = this.cursorPointer;

            const currentColumn = (i % noOfColumns) + 1;
            const currentRow = Math.floor(i / noOfColumns) + 1;

            this.resultsGrid.attach(picture, currentColumn, currentRow, 1, 1);

            animation.valueFrom = this.loadingBar.fraction;
            animation.valueTo = (i + 1) / wallpapers.length;
            animation.play();
        }

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            this.loadingBar.visible = false;
            return GLib.SOURCE_REMOVE;
        });

        this.searchCancellable = null;
    }

    private async showWallpaperPreview(wallpaper: IWallhavenWallpaper) {
        this.window.cursor = this.cursorBusy;

        this.wpViewerDownloadBtn.sensitive = false;
        this.wpViewerSpinner.visible = true;
        this.wpViewerPic.visible = false;

        this.wpViewerWin.defaultWidth = 200;
        this.wpViewerWin.defaultHeight = 200;

        this.wpViewerWin.present();

        this.wpViewerCancellable?.cancel();
        this.wpViewerCancellable = new Gio.Cancellable();

        const imgBytes = await fetchImage(wallpaper.path, this.wpViewerCancellable).catch(handleCatch);

        if (imgBytes == null) {
            this.wpViewerWin.close();
            sendToast(_("Failed to preview wallpaper"), this.window);
        } else {
            const texture = Gdk.Texture.new_from_bytes(imgBytes);
            const aspectRatio = texture.width / texture.height;
            const width = Math.min(Math.min(texture.width, 800), Math.min(texture.height, 800) * aspectRatio);

            this.wpViewerWin.defaultWidth = width;
            this.wpViewerWin.defaultHeight = null;

            this.wpViewerPic.paintable = texture;

            this.wpViewerDownloadBtn.sensitive = true;
            this.wpViewerSpinner.visible = false;
            this.wpViewerPic.visible = true;

            this.wpViewerCancelBtn.connect("clicked", this.closeWallpaperPreview.bind(this));
            this.wpViewerDownloadBtn.connect("clicked", this.downloadWallpaper.bind(this, imgBytes, wallpaper.path));
        }

        this.window.cursor = this.cursorDefault;
    }

    private async downloadWallpaper(imgBytes: GLib.Bytes, path: string) {
        const chooserOptions: IFileChooserOptions = {
            title: _("Save wallpaper"),
            initialName: GLib.basename(path),
        };

        const file = await openFileChooser(chooserOptions, FileChooserActions.SAVE, this.window);
        if (file == null) return;

        const savePath = file.get_path();
        const result = await writeFile(savePath, imgBytes.toArray(), null);

        if (result == null) {
            sendToast(_("Failed to download wallpaper"), this.window);
        } else {
            this.wpViewerWin.close();
            sendToast(_("Wallpaper was successfully downloaded!"), this.window);
        }
    }

    private async setGDMBackground() {
        const brightness = this.loginBrightnessIpt.value;
        const sigma = this.loginBlurIpt.value;
        const blurredPath = this.getBlurredWallpaper(this.loginPath, brightness, sigma);
        const tmpDir = GLib.dir_make_tmp("wallhub-XXXXXX");

        if (GLib.file_test(this.ogResourcePath, GLib.FileTest.EXISTS) === false) {
            GLib.mkdir_with_parents(GLib.path_get_dirname(this.ogResourcePath), 0o755);
            const backupResult = await copyFile(SHELL_RESOURCE_PATH, this.ogResourcePath, null);

            if (backupResult == false) {
                errorLog("Failed to backup GResource");
                sendToast(_("Failed to apply login background"), this.window);
                return;
            }
        }

        const gresource = Gio.Resource.load(this.ogResourcePath);
        const resources = gresource.enumerate_children("/org/gnome/shell/theme/", Gio.ResourceLookupFlags.NONE);

        const resourcesPath = GLib.build_pathv("/", [tmpDir, "/org/gnome/shell/theme/"]);
        GLib.mkdir_with_parents(resourcesPath, 0o755);

        const xmlLines = [];
        xmlLines.push('<?xml version="1.0" encoding="UTF-8"?>');
        xmlLines.push("<gresources><gresource>");

        for (const resourceName of resources) {
            if (resourceName === "wallpaper.png") return;

            const resource = "/org/gnome/shell/theme/" + resourceName;
            const data = gresource.lookup_data(resource, Gio.ResourceLookupFlags.NONE);
            const path = GLib.build_filenamev([resourcesPath, resourceName]);

            const result = await writeFile(path, data.toArray(), null);

            if (result == null) {
                errorLog("Failed to copy resource");
                sendToast(_("Failed to apply login background"), this.window);
                return;
            } else {
                xmlLines.push(`<file>org/gnome/shell/theme/${resourceName}</file>`);
            }
        }

        const wpDestPath = GLib.build_filenamev([resourcesPath, "wallpaper.png"]);
        const wpCopyResult = await copyFile(blurredPath, wpDestPath, null);

        if (wpCopyResult == false) {
            sendToast(_("Failed to apply login background"), this.window);
            return;
        }

        xmlLines.push(`<file>org/gnome/shell/theme/wallpaper.png</file>`);
        xmlLines.push("</gresource></gresources>");

        const xmlStr = xmlLines.join("\n");
        const xmlPath = GLib.build_filenamev([tmpDir, "gnome-shell-theme.gresource.xml"]);

        const encoder = new TextEncoder();
        const xmlBytes = encoder.encode(xmlStr);

        const xmlResult = await writeFile(xmlPath, xmlBytes, null);

        if (xmlResult == null) {
            errorLog("Failed to write XML file");
            sendToast(_("Failed to apply login background"), this.window);
            return;
        }

        const cssLines = [];
        cssLines.push(".login-dialog {");
        cssLines.push("background: transparent;");
        cssLines.push("}");
        cssLines.push("#lockDialogGroup {");
        cssLines.push("background-image: url('resource:///org/gnome/shell/theme/wallpaper.png');");
        cssLines.push("background-position: center;");
        cssLines.push("background-size: cover;");
        cssLines.push("}");

        const cssStr = cssLines.join("\n");
        const cssDarkPath = GLib.build_filenamev([resourcesPath, "gnome-shell-dark.css"]);
        const cssLightPath = GLib.build_filenamev([resourcesPath, "gnome-shell-light.css"]);

        const cssBytes = encoder.encode(cssStr);
        const resultLight = await appendFile(cssLightPath, cssBytes, null);
        const resultDark = await appendFile(cssDarkPath, cssBytes, null);

        if (resultLight == null || resultDark == null) {
            errorLog("Failed to write CSS file");
            sendToast(_("Failed to apply login background"), this.window);
            return;
        }

        const tmpResourcePath = GLib.build_filenamev([tmpDir, "gnome-shell-theme.gresource"]);

        const compileArgs = ["glib-compile-resources", "--sourcedir", tmpDir, "--target", tmpResourcePath, xmlPath];
        const compileResult = await spawnChild(compileArgs);

        if (compileResult === false) {
            errorLog("Failed to compile GResource");
            sendToast(_("Failed to apply login background"), this.window);
            return;
        }

        const installArgs = ["pkexec", "install", "-m644", tmpResourcePath, SHELL_RESOURCE_PATH];
        const installResult = await spawnChild(installArgs);

        if (installResult === false) {
            errorLog("Failed to install GResource");
            sendToast(_("Failed to apply login background"), this.window);
            return;
        }

        const rmResult = GLib.rmdir(tmpDir);

        if (rmResult === -1) {
            errorLog("Failed to remove tmp dir");
        }

        sendToast(_("Login background was successfully applied!"), this.window);
    }

    private closeWallpaperPreview() {
        this.wpViewerCancellable?.cancel();
        this.wpViewerCancellable = null;
        this.wpViewerWin.close();
    }

    private getBlurredWallpaper(path: string, brightness: number, sigma: number) {
        const encoder = new TextEncoder();
        const pathBytes = encoder.encode(path);

        const checksum = GLib.Checksum.new(GLib.ChecksumType.SHA1);
        checksum.update(pathBytes);

        const hash = checksum.get_string();

        const cacheDir = GLib.get_user_cache_dir();
        const savePath = GLib.build_filenamev([cacheDir, "wallhub", `blurred_${hash}`]);

        if (GLib.file_test(savePath, GLib.FileTest.EXISTS)) {
            return savePath;
        }

        const blurredTexture = this.getBlurredTexture(path, brightness, sigma);

        GLib.mkdir_with_parents(GLib.path_get_dirname(savePath), 0o755);
        blurredTexture.save_to_png(savePath);

        return savePath;
    }

    private getBlurredTexture(path: string, brightness: number, sigma: number) {
        const texture = Gdk.Texture.new_from_filename(path);

        const rect = Graphene.Rect.zero();
        rect.init(0, 0, texture.width, texture.height);

        const color = new Gdk.RGBA();
        color.red = 0;
        color.green = 0;
        color.blue = 0;
        color.alpha = (100 - brightness) / 100;

        const textureNode = Gsk.TextureNode.new(texture, rect);
        const blurNode = Gsk.BlurNode.new(textureNode, sigma);
        const colorNode = Gsk.ColorNode.new(color, rect);

        const snapshot = Gtk.Snapshot.new();
        snapshot.append_node(textureNode);
        snapshot.append_node(blurNode);
        snapshot.append_node(colorNode);

        const node = snapshot.to_node();
        const renderer = this.window.get_renderer();
        const newTexture = renderer.render_texture(node, rect);

        return newTexture;
    }

    private bindSlideshowIntervalUnit(key: string, dropdown: Gtk.DropDown) {
        const unitValue = parseInt(getEnumValueFromIndex(SlideshowIntervalUnits, dropdown.selected));
        this.settings.set_enum(key, unitValue);
    }

    private getResolutionConstraints() {
        const monitors = this.window.display.get_monitors();
        const ratios = new Set();

        let minWidth = 0;
        let minHeight = 0;

        for (let i = 0; i < monitors.get_n_items(); i++) {
            const monitor = monitors.get_item(i) as Gdk.Monitor;
            const resolution = monitor.geometry.width * monitor.geometry.height;
            const minResolution = minWidth * minHeight;

            if (minResolution === 0 || resolution < minResolution) {
                minWidth = monitor.geometry.width;
                minHeight = monitor.geometry.height;
            }

            const hcf = getHcf(monitor.geometry.width, monitor.geometry.height);

            const ratio = `${monitor.geometry.width / hcf}x${monitor.geometry.height / hcf}`;
            ratios.add(ratio);
        }

        return {
            atleast: `${minWidth}x${minHeight}`,
            ratios: Array.from(ratios).join(","),
        };
    }
}

export default WallhubPreferences;
