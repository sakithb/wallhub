import Adw from "gi://Adw";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import Gdk from "gi://Gdk";
import Pango from "gi://Pango";
import { gettext as _ } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import { isBitSet } from "../../utils/common/misc.js";
import { parseDynamicWallpaper } from "../../utils/common/dwp.js";
import { getDwpTexture, openFileChooser } from "../../utils/prefs/ui.js";
import { readFile } from "../../utils/common/io.js";
import { IFileChooserOptions } from "../../types/prefs.js";
import { MimeTypes, FileChooserActions } from "../../types/enums/prefs.js";

class WallpaperGrid extends Adw.PreferencesGroup {
    public wallpapers: string[];
    public selected: number;

    private gridBox: Gtk.FlowBox;
    private emptyItem: Gtk.FlowBoxChild;
    private scrolledWin: Gtk.ScrolledWindow;
    private addFolderBtn: Gtk.Button;
    private addFileBtn: Gtk.Button;
    private removeBtn: Gtk.Button;
    private selectAllBtn: Gtk.ToggleButton;

    constructor(params = {}) {
        super(params);

        this.selected = 0;
        this.wallpapers = [];

        // @ts-expect-error Typescript doesn't know about these properties
        this.gridBox = this._grid_box;
        // @ts-expect-error Typescript doesn't know about these properties
        this.emptyItem = this._empty_item;
        // @ts-expect-error Typescript doesn't know about these properties
        this.scrolledWin = this._scrolled_win;
        // @ts-expect-error Typescript doesn't know about these properties
        this.addFolderBtn = this._add_folder_btn;
        // @ts-expect-error Typescript doesn't know about these properties
        this.addFileBtn = this._add_file_btn;
        // @ts-expect-error Typescript doesn't know about these properties
        this.removeBtn = this._remove_btn;
        // @ts-expect-error Typescript doesn't know about these properties
        this.selectAllBtn = this._select_all_btn;

        this.gridBox.set_hadjustment(this.scrolledWin.hadjustment);
        this.gridBox.set_vadjustment(this.scrolledWin.vadjustment);

        const window = this.get_ancestor(Adw.PreferencesWindow.$gtype) as Adw.PreferencesWindow;

        this.addFileBtn.connect("clicked", async () => {
            const fileOptions: IFileChooserOptions = {
                title: _("Choose a wallpaper"),
                filters: [{ name: _("Images"), mimeTypes: [MimeTypes.IMAGES, MimeTypes.XML] }],
            };

            const files = await openFileChooser(fileOptions, FileChooserActions.MULTIPLE, window);
            if (files == null) return;

            const wallpapers = this.wallpapers.slice(0);

            for (const file of files) {
                const path = file.get_path();

                if (wallpapers.includes(path) == false) {
                    wallpapers.push(path);
                    this.selected |= 0 << (wallpapers.length - 1);
                }
            }

            this.setWallpapers(wallpapers);
            this.notify("wallpapers");
            this.notify("selected");
        });

        this.addFolderBtn.connect("clicked", async () => {
            const folderOptions: IFileChooserOptions = {
                title: _("Choose a folder"),
            };

            const folder = await openFileChooser(folderOptions, FileChooserActions.FOLDER, window);
            if (folder == null) return;

            const path = folder.get_path();

            if (this.wallpapers.includes(path) === false) {
                const wallpapers = this.wallpapers.slice(0);
                wallpapers.push(path);

                this.selected |= 0 << (wallpapers.length - 1);

                this.setWallpapers(wallpapers);
                this.notify("wallpapers");
                this.notify("selected");
            }
        });

        this.removeBtn.connect("clicked", () => {
            const selectedItems = this.gridBox.get_selected_children();

            if (selectedItems.length > 0) {
                const wallpapers = this.wallpapers.slice(0);

                for (let i = selectedItems.length - 1; i >= 0; i--) {
                    const item = selectedItems[i];
                    const itemIndex = item.get_index() - 1;
                    const index = wallpapers.indexOf(this.wallpapers[itemIndex]);
                    wallpapers.splice(index, 1);

                    const rightMask = (1 << index) - 1;
                    const leftMask = -1 << (index + 1);

                    const rightPart = this.selected & rightMask;
                    const leftPart = this.selected & leftMask;

                    this.selected = (leftPart >> 1) | rightPart;
                }

                this.setWallpapers(wallpapers);
                this.notify("wallpapers");
                this.notify("selected");
            }
        });

        this.selectAllBtn.connect("clicked", () => {
            const selectedItems = this.gridBox.get_selected_children();

            if (selectedItems.length === this.wallpapers.length) {
                this.gridBox.unselect_all();
                this.selectAllBtn.active = false;
            } else {
                this.gridBox.select_all();
                this.selectAllBtn.active = true;
            }
        });

        this.gridBox.connect("selected-children-changed", () => {
            const selectedItems = this.gridBox.get_selected_children();

            if (selectedItems.length === this.wallpapers.length) {
                this.selectAllBtn.active = true;
            } else {
                this.selectAllBtn.active = false;
            }
        });
    }

    public setSelected(selected: number) {
        this.selected = selected;
    }

    public setWallpapers(wallpapers: string[]) {
        const oldWallpapers = this.wallpapers;
        this.wallpapers = wallpapers;

        if (wallpapers.length === 0) {
            let i = 0;
            let child: Gtk.FlowBoxChild;

            while ((child = this.gridBox.get_child_at_index(i)) != null) {
                if (child !== this.emptyItem) {
                    this.gridBox.remove(child);
                } else {
                    i++;
                }
            }

            this.gridBox.maxChildrenPerLine = 1;
            this.gridBox.selectionMode = Gtk.SelectionMode.NONE;
            this.gridBox.valign = Gtk.Align.CENTER;
            this.emptyItem.show();
            return;
        }

        if (this.emptyItem.is_visible()) {
            this.emptyItem.hide();
        }

        this.gridBox.maxChildrenPerLine = 6;
        this.gridBox.selectionMode = Gtk.SelectionMode.MULTIPLE;
        this.gridBox.valign = Gtk.Align.START;

        if (oldWallpapers == null) {
            for (let i = 0; i < wallpapers.length; i++) {
                this.addWallpaperItem(i);
            }

            return;
        }

        const addedItems = wallpapers.filter((path) => !oldWallpapers.includes(path));
        const deletedItems = oldWallpapers.filter((path) => !wallpapers.includes(path));

        for (let i = deletedItems.length - 1; i >= 0; i--) {
            const path = deletedItems[i];
            const index = oldWallpapers.indexOf(path);
            this.gridBox.remove(this.gridBox.get_child_at_index(index + 1));
        }

        for (const path of addedItems) {
            const index = wallpapers.indexOf(path);
            this.addWallpaperItem(index);
        }
    }

    private async addWallpaperItem(index: number) {
        const path = this.wallpapers[index];

        const file = Gio.file_new_for_path(path);
        const fileType = file.query_file_type(Gio.FileQueryInfoFlags.NONE, null);

        const overlay = new Gtk.Overlay({
            cssClasses: ["wallpaper-grid-item"],
            tooltipText: path,
        });
        const thumbail = new Gtk.Image({
            cssClasses: ["wallpaper-grid-item-img"],
        });

        if (fileType === Gio.FileType.DIRECTORY) {
            const iconTheme = Gtk.IconTheme.get_for_display(this.get_display());
            const paintable = iconTheme.lookup_icon(
                "folder",
                [],
                96,
                1,
                Gtk.TextDirection.NONE,
                Gtk.IconLookupFlags.FORCE_REGULAR,
            );
            thumbail.paintable = paintable;
        } else {
            if (file.get_basename().endsWith(".xml")) {
                const bytes = await readFile(path, null);
                const decoder = new TextDecoder();
                const xml = decoder.decode(bytes);
                const dwConfig = parseDynamicWallpaper(xml);
                const paintable = getDwpTexture(dwConfig.lightBg, dwConfig.darkBg, this.get_native().get_renderer());
                thumbail.paintable = paintable;
            } else {
                const paintable = Gdk.Texture.new_from_file(file);
                thumbail.paintable = paintable;
            }
        }

        const selectIcon = new Gtk.CheckButton({
            cssClasses: ["selection-mode", "wallpaper-grid-item-check"],
            active: isBitSet(this.selected, index),
            valign: Gtk.Align.START,
            halign: Gtk.Align.START,
        });

        const pathLabel = new Gtk.Label({
            cssClasses: ["osd", "wallpaper-grid-item-label"],
            label: GLib.basename(path),
            ellipsize: Pango.EllipsizeMode.END,
            valign: Gtk.Align.END,
            halign: Gtk.Align.FILL,
            hexpand: true,
        });

        const flowboxChild = new Gtk.FlowBoxChild({
            valign: Gtk.Align.START,
            vexpand: false,
            widthRequest: 96,
            heightRequest: 96,
        });

        const gesture = new Gtk.GestureClick();

        gesture.connect("pressed", () => {
            if (flowboxChild.is_selected()) {
                this.gridBox.unselect_child(flowboxChild);
                gesture.set_state(Gtk.EventSequenceState.CLAIMED);
            }
        });

        selectIcon.connect("toggled", () => {
            if (selectIcon.active) {
                this.selected |= 1 << index;
            } else {
                this.selected &= ~(1 << index);
            }

            this.notify("selected");
        });

        flowboxChild.add_controller(gesture);

        overlay.add_overlay(selectIcon);
        overlay.add_overlay(pathLabel);
        overlay.set_child(thumbail);
        flowboxChild.set_child(overlay);

        this.gridBox.append(flowboxChild);
    }
}

export default WallpaperGrid;
