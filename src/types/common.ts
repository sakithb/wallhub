import Gtk from "gi://Gtk?version=4.0";
import { MimeTypes } from "./enums.js";

export type Enum<T> = T[keyof T];

export interface IFileFilter {
    name: string;
    mimeTypes: MimeTypes[];
}

export interface IFileChooserOptions extends Omit<Gtk.FileDialog.ConstructorProperties, "filters"> {
    filters?: IFileFilter[];
}
