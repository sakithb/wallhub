import Gtk from "gi://Gtk?version=4.0";
import { MimeTypes } from "./enums.js";

export interface IFileFilter {
    name: string;
    mimeTypes: MimeTypes[];
}

export interface IFileChooserOptions extends Omit<Gtk.FileDialog.ConstructorProperties, "filters"> {
    filters?: IFileFilter[];
}