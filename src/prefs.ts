import Adw from "gi://Adw?version=1";
import GLib from "gi://GLib?version=2.0";
import Gdk from "gi://Gdk?version=4.0";
import Gio from "gi://Gio?version=2.0";
import Graphene from "gi://Graphene?version=1.0";
import Gsk from "gi://Gsk?version=4.0";
import Gtk from "gi://Gtk?version=4.0";
import Soup from "gi://Soup?version=3.0";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import { IFileChooserOptions } from "./types/common.js";
import { DynamicWallpaper } from "./types/dwp.js";
// prettier-ignore
import { BrowseCategories, FileChooserActions, MimeTypes, SlideshowIntervalUnits, SortOrders, SortTypes, WallpaperTypes } from "./types/enums.js";
import { IWallhavenSearchOptions, IWallhavenWallpaper } from "./types/fetch.js";
// prettier-ignore
import { debugLog, errorLog, getEnumIndexFromValue, getEnumValueFromIndex, getHcf, handleCatch } from "./utils/common.js";
import { generateDynamicWallpaper, parseDynamicWallpaper } from "./utils/dwp.js";
import { fetchImage, fetchSearchResults } from "./utils/fetch.js";
import { appendFile, copyFile, readFile, spawnChild, writeFile } from "./utils/io.js";

Gio._promisify(Soup.Session.prototype, "send_and_read_async", "send_and_read_finish");
Gio._promisify(Soup.Session.prototype, "send_async", "send_finish");
Gio._promisify(Gtk.FileDialog.prototype, "open", "open_finish");
Gio._promisify(Gtk.FileDialog.prototype, "save", "save_finish");
Gio._promisify(Gtk.FileDialog.prototype, "select_folder", "select_folder_finish");

const GRESOURCE_PATH = "/usr/share/gnome-shell/gnome-shell-theme.gresource";
const CSS = `
    .results-grid-image {
        transition: 0.1s ease-in-out;
    }
    
    .results-grid-image:hover {
        opacity: 0.25;
    }`;

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

    private wpTypeSingleIpt: Gtk.ToggleButton;
    private wpTypeSlideshowIpt: Gtk.ToggleButton;
    private wpChooseRow: Adw.ActionRow;
    private wpChooseBtn: Gtk.Button;
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
    private dwpPreviewPic: Gtk.Picture;
    private dwpPreviewGrp: Adw.PreferencesGroup;
    private dwpPreviewLbl: Gtk.Label;

    private loginChooseRow: Adw.ActionRow;
    private loginChooseBtn: Gtk.Button;
    private loginBlurIpt: Adw.SpinRow;
    private loginBrightnessIpt: Adw.SpinRow;
    private loginApplyBtn: Gtk.Button;
    private loginResetBtn: Gtk.Button;
    private loginPreviewPic: Gtk.Picture;
    private loginPreviewGrp: Adw.PreferencesGroup;
    private loginPreviewLbl: Gtk.Label;

    private searchCancellable: Gio.Cancellable;
    private currentPage = 1;
    private noOfPages = 1;

    private dwpConfig: DynamicWallpaper;
    private dwpPath: string;

    private loginPath: string;
    private ogResourcePath: string;
    private loginPreviewSourceId: number;

    public fillPreferencesWindow(window: Adw.PreferencesWindow) {
        this.window = window;
        this.settings = this.getSettings();
        this.builder = Gtk.Builder.new_from_file(`${this.path}/prefs.ui`);

        this.generalPage = this.builder.get_object("page-general") as Adw.PreferencesPage;
        this.browsePage = this.builder.get_object("page-browse") as Adw.PreferencesPage;
        this.dwpPage = this.builder.get_object("page-dwp") as Adw.PreferencesPage;
        this.loginPage = this.builder.get_object("page-login") as Adw.PreferencesPage;

        this.cursorPointer = Gdk.Cursor.new_from_name("pointer", null);
        this.cursorBusy = Gdk.Cursor.new_from_name("wait", null);
        this.cursorDefault = Gdk.Cursor.new_from_name("default", null);

        const cssProvider = new Gtk.CssProvider();
        cssProvider.load_from_data(CSS, CSS.length);

        Gtk.StyleContext.add_provider_for_display(window.display, cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

        this.window.add(this.generalPage);
        this.window.add(this.browsePage);
        this.window.add(this.dwpPage);
        this.window.add(this.loginPage);

        this.initPageGeneral();
        this.initPageBrowse();
        this.initPageDwp();
        this.initPageLogin();
    }

    private initPageGeneral() {
        this.wpTypeSingleIpt = this.builder.get_object("btn-wp-type-single") as Gtk.ToggleButton;
        this.wpTypeSlideshowIpt = this.builder.get_object("btn-wp-type-slideshow") as Gtk.ToggleButton;
        this.wpChooseRow = this.builder.get_object("row-wp-choose") as Adw.ActionRow;
        this.wpChooseBtn = this.builder.get_object("btn-wp-choose") as Gtk.Button;
        this.slideshowIntervalUnitIpt = this.builder.get_object("dd-slideshow-interval-unit") as Gtk.DropDown;
        this.slideshowIntervalIpt = this.builder.get_object("sb-slideshow-interval") as Gtk.SpinButton;

        const wallpaperType = this.settings.get_enum("wallpaper-type");
        const wallpaperPathSingle = this.settings.get_string("wallpaper-path-single");
        const wallpaperPathSlideshow = this.settings.get_string("wallpaper-path-slideshow");
        const slideshowIntervalUnit = this.settings.get_enum("slideshow-interval-unit");

        const wallpaperPath = wallpaperType === WallpaperTypes.SINGLE ? wallpaperPathSingle : wallpaperPathSlideshow;
        const wallpaperPathText = wallpaperPath || "No wallpaper(s) selected";
        const intervalUnitIndex = getEnumIndexFromValue(SlideshowIntervalUnits, slideshowIntervalUnit.toString());

        this.wpChooseRow.subtitle = wallpaperPathText;
        this.wpChooseRow.tooltipText = wallpaperPathText;
        this.wpTypeSingleIpt.active = wallpaperType === WallpaperTypes.SINGLE;
        this.wpTypeSlideshowIpt.active = wallpaperType === WallpaperTypes.SLIDESHOW;
        this.slideshowIntervalUnitIpt.selected = intervalUnitIndex;

        this.settings.bind("slideshow-interval", this.slideshowIntervalIpt, "value", Gio.SettingsBindFlags.DEFAULT);

        const singleHandler = this.bindWallpaperType.bind(
            this,
            "wallpaper-type",
            this.wpTypeSingleIpt,
            WallpaperTypes.SINGLE,
        );
        const slideshowHandler = this.bindWallpaperType.bind(
            this,
            "wallpaper-type",
            this.wpTypeSlideshowIpt,
            WallpaperTypes.SLIDESHOW,
        );
        const intervalUnitHandler = this.bindSlideshowIntervalUnit.bind(
            this,
            "slideshow-interval-unit",
            this.slideshowIntervalUnitIpt,
        );

        this.wpTypeSingleIpt.connect("clicked", singleHandler);
        this.wpTypeSlideshowIpt.connect("clicked", slideshowHandler);
        this.slideshowIntervalUnitIpt.connect("notify::selected", intervalUnitHandler);

        this.wpChooseBtn.connect("clicked", this.openWallpaperChooser.bind(this));
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
        this.dwpPreviewPic = this.builder.get_object("pic-dwp-preview") as Gtk.Picture;
        this.dwpPreviewGrp = this.builder.get_object("grp-dwp-preview") as Adw.PreferencesGroup;
        this.dwpPreviewLbl = this.builder.get_object("lbl-dwp-preview") as Gtk.Label;

        const updateSaveSensitive = () => {
            const name = Boolean(this.dwpNameIpt.text);
            const lightBg = Boolean(this.dwpLightRow.subtitle);
            const darkBg = Boolean(this.dwpDarkRow.subtitle);

            this.dwpSaveBtn.sensitive = name && lightBg && darkBg;
        };

        const updatePreview = () => {
            if (this.dwpConfig.lightBg == "" || this.dwpConfig.darkBg == "") {
                this.dwpPreviewLbl.visible = true;
                this.dwpPreviewPic.visible = false;
                return;
            }

            this.dwpPreviewLbl.visible = false;
            this.dwpPreviewPic.visible = true;

            const dwpTexture = this.getDwpTexture(this.dwpConfig.lightBg, this.dwpConfig.darkBg);

            const width = this.dwpPreviewGrp.get_allocated_width();
            const height = (width * dwpTexture.height) / dwpTexture.width;

            this.dwpPreviewPic.paintable = dwpTexture;
            this.dwpPreviewPic.heightRequest = height;
        };

        this.dwpConfig = {
            name: "",
            lightBg: "",
            darkBg: "",
        };

        this.dwpNameIpt.connect("notify::text", updateSaveSensitive);

        this.dwpChooseBtn.connect("clicked", async () => {
            const fileOptions: IFileChooserOptions = {
                title: "Choose a dynamic wallpaper",
                filters: [{ name: "Dynamic Wallpapers", mimeTypes: [MimeTypes.XML] }],
            };

            const file = await this.openFileChooser(fileOptions, FileChooserActions.FILE);
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
                title: "Choose a light background",
                filters: [{ name: "Images", mimeTypes: [MimeTypes.IMAGES] }],
            };
            const file = await this.openFileChooser(fileOptions, FileChooserActions.FILE);
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
                title: "Choose a dark background",
                filters: [{ name: "Images", mimeTypes: [MimeTypes.IMAGES] }],
            };
            const file = await this.openFileChooser(fileOptions, FileChooserActions.FILE);
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
                    title: "Save dynamic wallpaper",
                };

                const file = await this.openFileChooser(fileOptions, FileChooserActions.SAVE);
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
                errorLog("[Wallhub] Failed to save dynamic wallpaper");
            } else {
                this.sendToast("Dynamic wallpaper was successfully saved!");
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
        this.loginPreviewPic = this.builder.get_object("pic-login-preview") as Gtk.Picture;
        this.loginPreviewGrp = this.builder.get_object("grp-login-preview") as Adw.PreferencesGroup;
        this.loginPreviewLbl = this.builder.get_object("lbl-login-preview") as Gtk.Label;

        this.ogResourcePath = GLib.build_filenamev([
            GLib.get_user_config_dir(),
            "wallhub",
            GLib.basename(GRESOURCE_PATH),
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
                    this.loginPreviewLbl.visible = true;
                    this.loginPreviewPic.visible = false;
                    return;
                }

                this.loginPreviewLbl.visible = false;
                this.loginPreviewPic.visible = true;

                const brightness = this.loginBrightnessIpt.value;
                const sigma = this.loginBlurIpt.value;
                const blurredTexture = this.getBlurredTexture(this.loginPath, brightness, sigma);

                const width = this.loginPreviewGrp.get_allocated_width();
                const height = (width * blurredTexture.height) / blurredTexture.width;

                this.loginPreviewPic.paintable = blurredTexture;
                this.loginPreviewPic.heightRequest = height;

                return GLib.SOURCE_REMOVE;
            });
        };

        this.loginChooseBtn.connect("clicked", async () => {
            const fileOptions: IFileChooserOptions = {
                title: "Choose a login background",
                filters: [{ name: "Images", mimeTypes: [MimeTypes.IMAGES] }],
            };
            const file = await this.openFileChooser(fileOptions, FileChooserActions.FILE);
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
                this.sendToast("No backup found");
                return;
            }

            const installArgs = ["pkexec", "install", "-m644", this.ogResourcePath, GRESOURCE_PATH];
            const installResult = await spawnChild(installArgs);

            if (installResult === false) {
                errorLog("[Wallhub] Failed to reset GResource");
                this.sendToast("Failed to reset login background");
                return;
            }

            GLib.unlink(this.ogResourcePath);
            this.loginResetBtn.sensitive = false;
            this.sendToast("Login background was successfully reset!");
        });

        this.loginBlurIpt.connect("notify::value", updatePreview);
        this.loginBrightnessIpt.connect("notify::value", updatePreview);
    }

    private async openFileChooser(options: IFileChooserOptions, action: FileChooserActions) {
        const dialogOptions = { ...options, filters: null };

        if (options.filters) {
            const filters = new Gio.ListStore();

            for (const filter of options.filters) {
                const filterObj = new Gtk.FileFilter(filter);
                filters.append(filterObj);
            }

            dialogOptions.filters = filters;
        } else {
            delete dialogOptions.filters;
        }

        const fileDialog = new Gtk.FileDialog(dialogOptions);

        switch (action) {
            case FileChooserActions.FILE: {
                const filePromise = fileDialog.open(this.window, null) as unknown as Promise<Gio.File>;
                const file = await filePromise.catch(handleCatch);
                return file;
            }

            case FileChooserActions.SAVE: {
                const savePromise = fileDialog.save(this.window, null) as unknown as Promise<Gio.File>;
                const save = await savePromise.catch(handleCatch);
                return save;
            }

            case FileChooserActions.FOLDER: {
                const folderPromise = fileDialog.select_folder(this.window, null) as unknown as Promise<Gio.File>;
                const folder = await folderPromise.catch(handleCatch);
                return folder;
            }
        }
    }

    private async openWallpaperChooser() {
        const wallpaperType = this.settings.get_enum("wallpaper-type");
        const initialFolder = Gio.File.new_for_path(GLib.get_home_dir());

        const chooserOptions: IFileChooserOptions = {
            initialFolder,
        };

        if (wallpaperType === WallpaperTypes.SINGLE) {
            chooserOptions.filters = [{ name: "Images", mimeTypes: [MimeTypes.IMAGES] }];
            chooserOptions.title = "Choose a wallpaper";

            const file = await this.openFileChooser(chooserOptions, FileChooserActions.FILE);
            if (file == null) return;

            const path = file.get_path();

            this.settings.set_string("wallpaper-path-single", path);
            this.wpChooseRow.subtitle = path;
            this.wpChooseRow.tooltipText = path;

            GLib.free(path);
        } else {
            chooserOptions.title = "Choose a folder";

            const folder = await this.openFileChooser(chooserOptions, FileChooserActions.FOLDER);
            if (folder == null) return;

            const path = folder.get_path();

            this.settings.set_string("wallpaper-path-slideshow", path);
            this.wpChooseRow.subtitle = path;
            this.wpChooseRow.tooltipText = path;

            GLib.free(path);
        }
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

        this.pageNoLabel.label = `Page ${this.currentPage} of ${this.noOfPages}`;

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
            this.sendToast("Failed to preview wallpaper");
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
            title: "Save wallpaper",
            initialName: GLib.basename(path),
        };

        const file = await this.openFileChooser(chooserOptions, FileChooserActions.SAVE);
        if (file == null) return;

        const savePath = file.get_path();
        const result = await writeFile(savePath, imgBytes.toArray(), null);

        if (result == null) {
            this.sendToast("Failed to download wallpaper");
        } else {
            this.wpViewerWin.close();
            this.sendToast("Wallpaper was successfully downloaded!");
        }
    }

    private async setGDMBackground() {
        const brightness = this.loginBrightnessIpt.value;
        const sigma = this.loginBlurIpt.value;
        const blurredPath = this.getBlurredWallpaper(this.loginPath, brightness, sigma);
        const tmpDir = GLib.dir_make_tmp("wallhub-XXXXXX");

        if (GLib.file_test(this.ogResourcePath, GLib.FileTest.EXISTS) === false) {
            GLib.mkdir_with_parents(GLib.path_get_dirname(this.ogResourcePath), 0o755);
            const backupResult = await copyFile(GRESOURCE_PATH, this.ogResourcePath, null);

            if (backupResult == false) {
                errorLog("[Wallhub] Failed to backup GResource");
                this.sendToast("Failed to apply login background");
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
                errorLog("[Wallhub] Failed to copy resource");
                this.sendToast("Failed to apply login background");
                return;
            } else {
                xmlLines.push(`<file>org/gnome/shell/theme/${resourceName}</file>`);
            }
        }

        const wpDestPath = GLib.build_filenamev([resourcesPath, "wallpaper.png"]);
        const wpCopyResult = await copyFile(blurredPath, wpDestPath, null);

        if (wpCopyResult == false) {
            this.sendToast("Failed to apply login background");
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
            errorLog("[Wallhub] Failed to write XML file");
            this.sendToast("Failed to apply login background");
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
            errorLog("[Wallhub] Failed to write CSS file");
            this.sendToast("Failed to apply login background");
            return;
        }

        const tmpResourcePath = GLib.build_filenamev([tmpDir, "gnome-shell-theme.gresource"]);

        const compileArgs = ["glib-compile-resources", "--sourcedir", tmpDir, "--target", tmpResourcePath, xmlPath];
        const compileResult = await spawnChild(compileArgs);

        if (compileResult === false) {
            errorLog("[Wallhub] Failed to compile GResource");
            this.sendToast("Failed to apply login background");
            return;
        }

        const installArgs = ["pkexec", "install", "-m644", tmpResourcePath, GRESOURCE_PATH];
        const installResult = await spawnChild(installArgs);

        if (installResult === false) {
            errorLog("[Wallhub] Failed to install GResource");
            this.sendToast("Failed to apply login background");
            return;
        }

        const rmResult = GLib.rmdir(tmpDir);

        if (rmResult === -1) {
            errorLog("[Wallhub] Failed to remove tmp dir");
        }

        this.sendToast("Login background was successfully applied!");
    }

    private closeWallpaperPreview() {
        this.wpViewerCancellable?.cancel();
        this.wpViewerCancellable = null;
        this.wpViewerWin.close();
    }

    private sendToast(title: string, timeout = 2) {
        const toast = new Adw.Toast({ title, timeout });
        this.window.add_toast(toast);
    }

    private getBlurredWallpaper(path: string, brightness: number, sigma: number) {
        debugLog(sigma, brightness);
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

    private getDwpTexture(lightBg: string, darkBg: string) {
        const lightTexture = Gdk.Texture.new_from_filename(lightBg);
        const darkTexture = Gdk.Texture.new_from_filename(darkBg);

        const lightRes = lightTexture.width * lightTexture.height;
        const darkRes = darkTexture.width * darkTexture.height;

        const minWidth = lightRes < darkRes ? lightTexture.width : darkTexture.width;
        const minHeight = lightRes < darkRes ? lightTexture.height : darkTexture.height;
        const halfMinWidth = minWidth / 2;

        const minRect = Graphene.Rect.zero();
        minRect.init(0, 0, minWidth, minHeight);

        const lightTexureNode = Gsk.TextureNode.new(lightTexture, minRect);
        const darkTexureNode = Gsk.TextureNode.new(darkTexture, minRect);

        const halfLightRect = Graphene.Rect.zero();
        halfLightRect.init(0, 0, halfMinWidth, lightTexture.height);

        const halfDarkRect = Graphene.Rect.zero();
        halfDarkRect.init(halfMinWidth, 0, halfMinWidth, darkTexture.height);

        const lightClipNode = Gsk.ClipNode.new(lightTexureNode, halfLightRect);
        const darkClipNode = Gsk.ClipNode.new(darkTexureNode, halfDarkRect);

        const snapshot = Gtk.Snapshot.new();
        snapshot.append_node(lightClipNode);
        snapshot.append_node(darkClipNode);

        const node = snapshot.to_node();
        const renderer = this.window.get_renderer();
        const newTexture = renderer.render_texture(node, minRect);

        return newTexture;
    }

    private bindWallpaperType(key: string, btn: Gtk.ToggleButton, value: number) {
        if (btn.active) {
            this.settings.set_enum(key, value);

            const settingKey = value === WallpaperTypes.SINGLE ? "wallpaper-path-single" : "wallpaper-path-slideshow";
            const wallpaperPathText = this.settings.get_string(settingKey) || "No wallpaper(s) selected";

            this.wpChooseRow.subtitle = wallpaperPathText;
            this.wpChooseRow.tooltipText = wallpaperPathText;
        }
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
