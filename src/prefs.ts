import Adw from "gi://Adw?version=1";
import GLib from "gi://GLib?version=2.0";
import Gdk from "gi://Gdk?version=4.0";
import Gio from "gi://Gio?version=2.0";
import Gtk from "gi://Gtk?version=4.0";
import Soup from "gi://Soup?version=3.0";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import { BrowseCategories, SortOrders, SortTypes, WallpaperTypes } from "./types/enums.js";
import { IWallhavenWallpaper } from "./types/fetch.js";
import { fetchImage, fetchSearchResults, handleCatch } from "./utils/fetch.js";

Gio._promisify(Soup.Session.prototype, "send_and_read_async", "send_and_read_finish");
Gio._promisify(Soup.Session.prototype, "send_async", "send_finish");
Gio._promisify(Gtk.FileDialog.prototype, "open", "open_finish");
Gio._promisify(Gtk.FileDialog.prototype, "save", "save_finish");
Gio._promisify(Gtk.FileDialog.prototype, "select_folder", "select_folder_finish");
Gio._promisify(Gio.File.prototype, "replace_contents_bytes_async", "replace_contents_finish");

class WallhubPreferences extends ExtensionPreferences {
    private window: Adw.PreferencesWindow;
    private settings: Gio.Settings;
    private builder: Gtk.Builder;

    private generalPage: Adw.PreferencesPage;
    private browsePage: Adw.PreferencesPage;
    private dwpPage: Adw.PreferencesPage;

    private wpTypeSingleIpt: Gtk.ToggleButton;
    private wpTypeSlideshowIpt: Gtk.ToggleButton;
    private wpChooseRow: Adw.ActionRow;
    private wpChooseBtn: Gtk.Button;
    private slideshowIntervalUnitIpt: Gtk.DropDown;
    private slideshowIntervalIpt: Gtk.SpinButton;
    private loginBgEnabledIpt: Adw.SwitchRow;
    private loginBgBlurIpt: Adw.SpinRow;

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
    private wpViewerCancelBtn: Gtk.Button;
    private wpViewerDownloadBtn: Gtk.Button;

    private searchCancellable: Gio.Cancellable;
    private currentPage = 1;
    private noOfPages = 1;

    public fillPreferencesWindow(window: Adw.PreferencesWindow) {
        this.window = window;
        this.settings = this.getSettings();
        this.builder = Gtk.Builder.new_from_file(`${this.path}/prefs.ui`);

        this.generalPage = this.builder.get_object("page-general") as Adw.PreferencesPage;
        this.browsePage = this.builder.get_object("page-browse") as Adw.PreferencesPage;
        this.dwpPage = this.builder.get_object("page-dwp") as Adw.PreferencesPage;

        this.window.add(this.generalPage);
        this.window.add(this.browsePage);
        this.window.add(this.dwpPage);

        this.initPageGeneral();
        this.initPageBrowse();
        this.initPageDwp();
    }

    private initPageGeneral() {
        this.wpTypeSingleIpt = this.builder.get_object("btn-wp-type-single") as Gtk.ToggleButton;
        this.wpTypeSlideshowIpt = this.builder.get_object("btn-wp-type-slideshow") as Gtk.ToggleButton;
        this.wpChooseRow = this.builder.get_object("row-wp-choose") as Adw.ActionRow;
        this.wpChooseBtn = this.builder.get_object("btn-wp-choose") as Gtk.Button;
        this.slideshowIntervalUnitIpt = this.builder.get_object("dd-slideshow-interval-unit") as Gtk.DropDown;
        this.slideshowIntervalIpt = this.builder.get_object("sb-slideshow-interval") as Gtk.SpinButton;
        this.loginBgEnabledIpt = this.builder.get_object("sw-login-bg-enabled") as Adw.SwitchRow;
        this.loginBgBlurIpt = this.builder.get_object("sb-login-bg-blur") as Adw.SpinRow;

        const wallpaperType = this.settings.get_enum("wallpaper-type");
        const wallpaperPath = this.settings.get_string("wallpaper-path");
        const slideshowIntervalUnit = this.settings.get_enum("slideshow-interval-unit");

        this.wpChooseRow.subtitle = wallpaperPath || "No wallpaper(s) selected";
        this.wpChooseRow.tooltipText = wallpaperPath || "No wallpaper(s) selected";
        this.wpTypeSingleIpt.active = wallpaperType === WallpaperTypes.SINGLE;
        this.wpTypeSlideshowIpt.active = wallpaperType === WallpaperTypes.SLIDESHOW;
        this.slideshowIntervalUnitIpt.selected = slideshowIntervalUnit;

        this.settings.bind("slideshow-interval", this.slideshowIntervalIpt, "value", Gio.SettingsBindFlags.DEFAULT);
        this.settings.bind("login-bg-enabled", this.loginBgEnabledIpt, "active", Gio.SettingsBindFlags.DEFAULT);
        this.settings.bind("login-bg-blur", this.loginBgBlurIpt, "value", Gio.SettingsBindFlags.DEFAULT);

        const singleHandler = this.bindEnumToToggleBtn.bind(this, "wallpaper-type", this.wpTypeSingleIpt, WallpaperTypes.SINGLE);
        const slideshowHandler = this.bindEnumToToggleBtn.bind(this, "wallpaper-type", this.wpTypeSlideshowIpt, WallpaperTypes.SLIDESHOW);
        const intervalUnitHandler = this.bindEnumToDropDown.bind(this, "slideshow-interval-unit", this.slideshowIntervalUnitIpt);

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

    private initPageDwp() {}

    private async openWallpaperChooser() {
        const wallpaperType = this.settings.get_enum("wallpaper-type");
        const initialFolder = Gio.File.new_for_path(GLib.get_home_dir());
        const fileDialog = new Gtk.FileDialog({ initialFolder });

        if (wallpaperType === WallpaperTypes.SINGLE) {
            const filters = new Gio.ListStore();
            const imageFilter = new Gtk.FileFilter({ name: "Images", mimeTypes: ["image/*"] });
            const dwFilter = new Gtk.FileFilter({ name: "Dynamic wallpapers", mimeTypes: ["application/xml"] });

            filters.append(imageFilter);
            filters.append(dwFilter);

            fileDialog.title = "Choose a wallpaper";
            fileDialog.acceptLabel = "Choose file";
            fileDialog.filters = filters;

            const filePromise = fileDialog.open(this.window, null) as unknown as Promise<Gio.File>;
            const file = await filePromise.catch(handleCatch);
            if (file == null) return;

            const path = file.get_path();

            this.settings.set_string("wallpaper-path", path);
            this.wpChooseRow.subtitle = path;
            this.wpChooseRow.tooltipText = path;

            GLib.free(path);
        } else {
            fileDialog.title = "Choose a folder containing wallpapers";
            fileDialog.acceptLabel = "Choose folder";

            const folderPromise = fileDialog.select_folder(this.window, null) as unknown as Promise<Gio.File>;
            const folder = await folderPromise.catch(handleCatch);
            if (folder == null) return;

            const path = folder.get_path();

            this.settings.set_string("wallpaper-path", path);
            this.wpChooseRow.subtitle = path;
            this.wpChooseRow.tooltipText = path;

            GLib.free(path);
        }
    }

    private async searchAndShowWallpapers() {
        if (this.searchCancellable) this.searchCancellable.cancel();
        this.searchCancellable = new Gio.Cancellable();

        this.loadingBar.visible = true;

        const sourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
            this.loadingBar.pulse();
            return GLib.SOURCE_CONTINUE;
        });

        const query = this.searchIpt.text;
        const ctgs: number[] = [];

        if (this.ctgGeneralIpt.active) {
            ctgs.push(BrowseCategories.GENERAL);
        }

        if (this.ctgAnimeIpt.active) {
            ctgs.push(BrowseCategories.ANIME);
        }

        if (this.ctgPeopleIpt.active) {
            ctgs.push(BrowseCategories.PEOPLE);
        }

        const sorting = Object.values(SortTypes)[this.sortIpt.selected];
        const order = this.sortAscIpt.active ? SortOrders.ASCENDING : SortOrders.DESCENDING;
        const page = this.currentPage.toString();

        const searchOptions = {
            q: query,
            categories: ctgs.reduce((acc, ctg) => acc | ctg, 0).toString(2),
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
        const pointer = Gdk.Cursor.new_from_name("pointer", null);

        for (let i = 0; i < wallpapers.length; i++) {
            const wallpaper = wallpapers[i];

            const imgBytes = await fetchImage(wallpaper.thumbs.small, this.searchCancellable).catch(handleCatch);
            if (imgBytes == null) return;

            const texture = Gdk.Texture.new_from_bytes(imgBytes);
            const picture = Gtk.Picture.new_for_paintable(texture);

            const gesture = new Gtk.GestureClick();
            gesture.connect("released", this.showWallpaperPreview.bind(this, wallpaper));

            picture.add_controller(gesture);
            picture.cursor = pointer;

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
        const imgBytes = await fetchImage(wallpaper.path, null).catch(handleCatch);
        if (imgBytes == null) return;

        const texture = Gdk.Texture.new_from_bytes(imgBytes);
        this.wpViewerPic.paintable = texture;

        this.wpViewerCancelBtn.connect("clicked", this.wpViewerWin.close.bind(this.wpViewerWin));
        this.wpViewerDownloadBtn.connect("clicked", this.downloadWallpaper.bind(this, imgBytes, wallpaper.path));

        const aspectRatio = texture.width / texture.height;
        const width = Math.min(Math.min(texture.width, 1000), Math.min(texture.height, 1000) * aspectRatio);
        this.wpViewerWin.defaultWidth = width;

        this.wpViewerWin.present();
    }

    private async downloadWallpaper(imgBytes: GLib.Bytes, path: string) {
        const initialName = path.split("/").pop();

        const fileDialog = new Gtk.FileDialog({
            title: "Download wallpaper",
            initialName,
        });

        const filePromise = fileDialog.save(this.wpViewerWin, null) as unknown as Promise<Gio.File>;
        const file = await filePromise.catch(handleCatch);
        if (file == null) return;

        const replaceArgs = [imgBytes, null, false, Gio.FileCreateFlags.NONE, null, null] as const;
        const resultPromise = file.replace_contents_bytes_async(...replaceArgs) as unknown as Promise<[boolean]>;

        const result = await resultPromise;

        if (result === null) {
            console.error("[Wallhub] Failed to download wallpaper");
        } else {
            this.wpViewerWin.close();
        }
    }

    private bindEnumToToggleBtn(key: string, btn: Gtk.ToggleButton, value: number) {
        if (btn.active) this.settings.set_enum(key, value);
    }

    private bindEnumToDropDown(key: string, dropdown: Gtk.DropDown) {
        this.settings.set_enum(key, dropdown.selected);
    }
}

export default WallhubPreferences;
