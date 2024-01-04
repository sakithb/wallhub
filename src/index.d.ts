import "@girs/adw-1/ambient";
import "@girs/gdk-4.0/ambient";
import "@girs/gio-2.0/ambient";
import "@girs/gjs";
import "@girs/gjs/ambient";
import "@girs/gjs/dom";
import "@girs/glib-2.0/ambient";
import "@girs/gnome-shell/ambient";
import "@girs/graphene-1.0/ambient";
import "@girs/gsk-4.0/ambient";
import "@girs/gtk-4.0/ambient";
import "@girs/soup-3.0/ambient";
import "@girs/pango-1.0/ambient";
import "@girs/gnome-shell/extensions";

declare global {
    interface ImportMeta {
        url: string;
    }

    interface String {
        format(...args: unknown[]): string;
    }
}

declare module "@girs/gnome-shell/extensions/extension" {
    type CreateOverrideFunc = (originalMethod?: (...args: unknown[]) => unknown) => (...args: unknown[]) => unknown;

    export class InjectionManager {
        #savedMethods = new Map();

        /**
         * Modify, replace or inject a method
         */
        overrideMethod(prototype: object, methodName: string, createOverrideFunc: CreateOverrideFunc): void;

        /**
         * Restore the original method
         */
        restoreMethod(prototype: object, methodName: string): void;

        /**
         * Restore all original methods and clear overrides
         */
        clear(): void;
    }
}
