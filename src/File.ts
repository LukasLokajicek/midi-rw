import {Track} from './Track';
import {codes2Str, str2Bytes} from './Util';

export class File {
    static readonly HDR_CHUNKID = 'MThd' as const;
    static readonly HDR_CHUNK_SIZE = '\x00\x00\x00\x06' as const;
    static readonly HDR_TYPE0 = '\x00\x00' as const;
    static readonly HDR_TYPE1 = '\x00\x01' as const;

    readonly ticks: number;
    private readonly _tracks: Track[];

    get tracks(): readonly Track[] {
        return this._tracks;
    }

    constructor(config?: { ticks?: number }) {
        const c = config || {};
        if (c.ticks !== undefined) {
            if (c.ticks <= 0 || c.ticks >= (1 << 15) || c.ticks % 1 !== 0) {
                throw new Error('Ticks per beat must be an integer between 1 and 32767!');
            }
        }

        this.ticks = c.ticks ?? 128;
        this._tracks = [];
    }

    addTrack(): Track;
    addTrack(track: Track): this;
    addTrack(track?: Track): Track | this {
        if (track) {
            this._tracks.push(track);
            return this;
        }
        const newTrack = new Track();
        this._tracks.push(newTrack);
        return newTrack;
    }

    toBytes(): string {
        const trackCount = this._tracks.length.toString(16);

        let bytes = File.HDR_CHUNKID + File.HDR_CHUNK_SIZE;

        if (parseInt(trackCount, 16) > 1) {
            bytes += File.HDR_TYPE1;
        } else {
            bytes += File.HDR_TYPE0;
        }

        bytes += codes2Str(str2Bytes(trackCount, 2));
        bytes += String.fromCharCode((this.ticks / 256), this.ticks % 256);

        this._tracks.forEach(track => {
            bytes += codes2Str(track.toBytes());
        });

        return bytes;
    }

    toUint8Array(): Uint8Array {
        const str = this.toBytes();
        const arr = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) {
            arr[i] = str.charCodeAt(i);
        }
        return arr;
    }

    toBlob(genericType?: boolean): Blob {
        const arr = this.toUint8Array();
        return new Blob([arr.buffer as ArrayBuffer], {
            type: genericType ? 'application/octet-stream' : 'audio/x-midi',
        });
    }
}
