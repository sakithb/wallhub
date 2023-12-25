import GLib from "gi://GLib?version=2.0";
import Gio from "gi://Gio?version=2.0";
import { errorLog, handleCatch } from "./common.js";

Gio._promisify(Gio.File.prototype, "replace_contents_bytes_async", "replace_contents_finish");
Gio._promisify(Gio.File.prototype, "load_contents_async", "load_contents_finish");
Gio._promisify(Gio.File.prototype, "append_to_async", "append_to_finish");
Gio._promisify(Gio.File.prototype, "copy_async", "copy_finish");
Gio._promisify(Gio.FileOutputStream.prototype, "write_bytes_async", "write_bytes_finish");

const watchChildPid = (pid: number): Promise<boolean> => {
    return new Promise((resolve) => {
        GLib.child_watch_add(null, pid, (_, status) => {
            const success = GLib.spawn_check_wait_status(status);

            if (success == false) {
                errorLog("[Wallhub] Child process exited with error: ", pid);
                return resolve(false);
            }

            GLib.spawn_close_pid(pid);
            resolve(true);
        });
    });
};

export const readFile = async (path: string, cancellable: Gio.Cancellable) => {
    const file = Gio.File.new_for_path(path);
    const contents = await file.load_contents_async(cancellable).catch(handleCatch);

    if (contents == null) {
        errorLog(`Failed to read file: ${path}`);
        return null;
    }

    return contents[0];
};

export const writeFile = async (path: string, bytes: Uint8Array, cancellable: Gio.Cancellable) => {
    const file = Gio.File.new_for_path(path);
    const replaceArgs = [bytes, null, false, Gio.FileCreateFlags.NONE, cancellable] as const;
    // @ts-expect-error Wrong type definitions
    const resultPromise = file.replace_contents_bytes_async(...replaceArgs) as Promise<[boolean, string]>;
    const result = await resultPromise.catch(handleCatch);

    if (result == null || result[0] === false) {
        errorLog(`Failed to write file: ${path}`);
        return false;
    } else {
        return true;
    }
};

export const appendFile = async (path: string, bytes: Uint8Array, cancellable: Gio.Cancellable) => {
    const file = Gio.File.new_for_path(path);
    const stream = await file.append_to_async(Gio.FileCreateFlags.NONE, null, cancellable).catch(handleCatch);

    if (stream == null) {
        errorLog(`Failed to append file: ${path}`);
        return false;
    }

    const gbytes = new GLib.Bytes(bytes);
    const bytesWritten = await stream.write_bytes_async(gbytes, null, cancellable).catch(handleCatch);

    if (bytesWritten == null || bytesWritten === 0) {
        errorLog(`Failed to append file: ${path}`);
        return false;
    } else {
        return true;
    }
};

export const copyFile = async (src: string, dest: string, cancellable: Gio.Cancellable) => {
    const srcFile = Gio.File.new_for_path(src);
    const destFile = Gio.File.new_for_path(dest);

    const result = await srcFile
        .copy_async(destFile, Gio.FileCopyFlags.OVERWRITE, null, cancellable, null)
        .catch(handleCatch);

    if (result == null || result === false) {
        errorLog(`Failed to copy file: ${src} to ${dest}`);
        return false;
    } else {
        return true;
    }
};

export const spawnChild = async (argv: string[]) => {
    const [success, pid] = GLib.spawn_async(
        null,
        argv,
        null,
        GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
        null,
    );

    if (success === false) {
        errorLog(`Failed to spawn command line: ${argv.join(" ")}`);
        return false;
    }

    const childStatus = await watchChildPid(pid).catch(handleCatch);

    if (childStatus == null || childStatus === false) {
        errorLog(`Failed to spawn command line: ${argv.join(" ")}`);
        return false;
    } else {
        return true;
    }
};
