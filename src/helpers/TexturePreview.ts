import Adw from "gi://Adw?version=1";
import GObject from "gi://GObject?version=2.0";
import Gtk from "gi://Gtk?version=4.0";
import Gdk from "gi://Gdk?version=4.0";
import GdkPixbuf from "gi://GdkPixbuf?version=2.0";
import { gettext as _ } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import { sendToast } from "../utils/ui.js";

class TexturePreview extends Adw.PreferencesGroup {
    private emptyLabel: Gtk.Label;
    private texturePic: Gtk.Picture;

    constructor(params = {}) {
        super(params);

        // @ts-expect-error Typescript doesn't know about the property
        this.emptyLabel = this._empty_label;
        // @ts-expect-error Typescript doesn't know about the property
        this.texturePic = this._texture_pic;
    }

    public setPreview(texture: Gdk.Texture) {
        if (texture == null) {
            this.emptyLabel.show();
            this.texturePic.hide();
        }

        this.texturePic.show();
        this.emptyLabel.hide();

        const width = this.get_allocated_width();
        const height = (width * texture.height) / texture.width;

        try {
            this.texturePic.paintable = texture;
            this.texturePic.heightRequest = height;
        } catch (e) {
            const window = this.get_ancestor(Adw.PreferencesWindow.$gtype) as Adw.PreferencesWindow;

            if (e === GdkPixbuf.PixbufError.UNKNOWN_TYPE) {
                sendToast(_("Unsupported image format"), window);
            } else if (e === GdkPixbuf.PixbufError.CORRUPT_IMAGE) {
                sendToast(_("Corrupt image"), window);
            } else {
                sendToast(_("Unknown error"), window);
            }
        }
    }
}

const GTexturePreview = GObject.registerClass(
    {
        GTypeName: "TexturePreview",
        Template: "resource:///org/gnome/shell/extensions/wallhub/ui/texture-preview.ui",
        InternalChildren: ["empty-label", "texture-pic"],
    },
    TexturePreview,
);

export default GTexturePreview;
