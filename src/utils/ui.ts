import Gio from "gi://Gio?version=2.0";
import Gtk from "gi://Gtk?version=4.0";
import Gdk from "gi://Gdk?version=4.0";
import Graphene from "gi://Graphene?version=1.0";
import Gsk from "gi://Gsk?version=4.0";
import { IFileChooserOptions } from "../types/common.js";
import { FileChooserActions } from "../types/enums.js";
import { handleCatch } from "./misc.js";

export async function openFileChooser<T extends FileChooserActions>(
    options: IFileChooserOptions,
    action: T,
    window: Gtk.Window,
): Promise<T extends FileChooserActions.MULTIPLE ? Gio.File[] : Gio.File>;
export async function openFileChooser<T extends FileChooserActions>(
    options: IFileChooserOptions,
    action: T,
    window: Gtk.Window,
): Promise<Gio.File | Gio.File[]> {
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
            const filePromise = fileDialog.open(window, null) as unknown as Promise<Gio.File>;
            const file = await filePromise.catch(handleCatch);
            return file as Gio.File | Gio.File[];
        }

        case FileChooserActions.SAVE: {
            const savePromise = fileDialog.save(window, null) as unknown as Promise<Gio.File>;
            const save = await savePromise.catch(handleCatch);
            return save;
        }

        case FileChooserActions.FOLDER: {
            const folderPromise = fileDialog.select_folder(window, null) as unknown as Promise<Gio.File>;
            const folder = await folderPromise.catch(handleCatch);
            return folder;
        }

        case FileChooserActions.MULTIPLE: {
            const multiplePromise = fileDialog.open_multiple(window, null) as unknown as Promise<Gio.File[]>;
            const multiple = await multiplePromise.catch(handleCatch);
            return multiple;
        }
    }
}

export const getDwpTexture = (lightBg: string, darkBg: string, renderer: Gsk.Renderer) => {
    if (lightBg == null || darkBg == null) {
        return null;
    }

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
    const newTexture = renderer.render_texture(node, minRect);

    return newTexture;
};
