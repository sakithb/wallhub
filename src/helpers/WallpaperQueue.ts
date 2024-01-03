class WallpaperQueue extends Array<string> {
    constructor() {
        super();
    }

    enqueue(path: string) {
        if (this.includes(path) === false) {
            this.push(path);
        }
    }

    dequeue(): string {
        if (this.length === 0) {
            return null;
        }

        const index = Math.floor(Math.random() * (this.length - Math.round(this.length * 0.2)));
        const wallpaper = this.splice(index, 1)[0];

        this.push(wallpaper);
        return wallpaper;
    }

    remove(path: string) {
        const index = this.indexOf(path);

        if (index > -1) {
            this.splice(index, 1);
        }
    }

    clear() {
        this.length = 0;
    }
}

export default WallpaperQueue;
